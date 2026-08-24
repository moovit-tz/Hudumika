import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { withTenant, dbPlatform } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { SmsService } from '../services/sms.service.js';
import { formatTemplate } from '../lib/template.js';
import { encryptJson, decryptJson } from '../services/onsite-secrets.service.js';

const uuidSchema = z.string().uuid();
const gatewaySchema = z.object({
  provider: z.enum(['africas_talking', 'twilio', 'nexmo', 'bongolive']),
  label: z.string().trim().min(1).max(100),
  credentials: z.record(z.string(), z.string()),
  senderId: z.string().trim().max(30).nullable().optional(),
  priority: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

const groupSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
});
const memberSchema = z.object({
  phone: z.string().trim().min(6).max(32),
  name: z.string().trim().max(200).nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  contactSource: z.enum(['contact', 'lead', 'customer', 'user']).nullable().optional(),
});
const templateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(1600),
});
const campaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  body: z.string().trim().max(1600).optional(),
  templateId: uuidSchema.nullable().optional(),
  groupId: uuidSchema.nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
});
const quickSendSchema = z.object({
  to: z.array(z.string().trim().min(6).max(32)).max(500).optional(),
  groupId: uuidSchema.optional(),
  body: z.string().trim().max(1600).optional(),
  templateId: uuidSchema.optional(),
}).refine(b => (b.to && b.to.length > 0) || b.groupId, { message: 'to or groupId is required' })
  .refine(b => (b.body && b.body.trim()) || b.templateId, { message: 'body or templateId is required' });

function normalizeName(first?: string | null, last?: string | null): string {
  return [first, last].filter(Boolean).join(' ').trim();
}

/**
 * SMS app — quick send, groups, templates, campaigns, unified message log.
 * Built on the already-real integrations/sms.ts gateway (Africa's Talking +
 * Twilio wired to live REST APIs) via sms.service.ts's SmsService, the
 * shared entrypoint every app in the platform should send SMS through.
 */
export async function smsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('sms'));

  // ── Dashboard stats ──────────────────────────────────────────────────
  fastify.get('/stats', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

      const [sentToday, sentMonth, delivered, failed, totalMonth] = await Promise.all([
        trx.selectFrom('sms_messages').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).where('created_at', '>=', todayStart)
          .where('status', 'in', ['sent', 'delivered']).executeTakeFirst(),
        trx.selectFrom('sms_messages').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).where('created_at', '>=', monthStart)
          .where('status', 'in', ['sent', 'delivered']).executeTakeFirst(),
        trx.selectFrom('sms_messages').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).where('created_at', '>=', monthStart)
          .where('status', '=', 'delivered').executeTakeFirst(),
        trx.selectFrom('sms_messages').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).where('created_at', '>=', monthStart)
          .where('status', 'in', ['failed', 'undelivered']).executeTakeFirst(),
        trx.selectFrom('sms_messages').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).where('created_at', '>=', monthStart)
          .executeTakeFirst(),
      ]);

      const activeGateways = await trx.selectFrom('sms_gateways').select(['provider'])
        .where('tenant_id', '=', user.tenant_id).where('active', '=', true).orderBy('priority', 'asc').execute();
      const gatewayConfigured = activeGateways.length > 0;

      return {
        data: {
          sentToday: Number(sentToday?.c ?? 0),
          sentThisMonth: Number(sentMonth?.c ?? 0),
          deliveredThisMonth: Number(delivered?.c ?? 0),
          failedThisMonth: Number(failed?.c ?? 0),
          totalThisMonth: Number(totalMonth?.c ?? 0),
          gatewayConfigured, gatewayProvider: gatewayConfigured ? activeGateways[0].provider : null,
          gatewayCount: activeGateways.length,
        },
      };
    });
  });

  // ── Message log / reports ───────────────────────────────────────────
  fastify.get('/messages', async (request) => {
    const user = request.user;
    const q = request.query as { status?: string; search?: string; limit?: string; offset?: string; campaignId?: string };
    const limit = Math.min(parseInt(q.limit ?? '50', 10) || 50, 200);
    const offset = Math.max(parseInt(q.offset ?? '0', 10) || 0, 0);
    return withTenant(user.tenant_id, async (trx) => {
      let query = trx.selectFrom('sms_messages').selectAll().where('tenant_id', '=', user.tenant_id);
      if (q.status) query = query.where('status', '=', q.status);
      if (q.campaignId) query = query.where('campaign_id', '=', q.campaignId);
      if (q.search) {
        const term = `%${q.search.toLowerCase()}%`;
        query = query.where(eb => eb.or([eb('to_number', 'ilike', term), eb('body', 'ilike', term), eb('contact_name', 'ilike', term)]));
      }
      const rows = await query.orderBy('created_at', 'desc').limit(limit).offset(offset).execute();
      return { data: rows };
    });
  });

  // ── Quick send — one/many explicit numbers, or a whole group ────────
  fastify.post('/send', async (request, reply) => {
    const user = request.user;
    const body = quickSendSchema.parse(request.body);

    let messageBody = body.body?.trim() || '';
    if (body.templateId && !messageBody) {
      const template = await withTenant(user.tenant_id, trx => trx.selectFrom('sms_templates').select('body')
        .where('id', '=', body.templateId!).where('tenant_id', '=', user.tenant_id).executeTakeFirst());
      if (!template) return reply.status(404).send({ error: 'Template not found' });
      messageBody = template.body;
    }

    let recipients: { phone: string; name?: string }[] = (body.to ?? []).map(phone => ({ phone }));
    if (body.groupId) {
      const members = await withTenant(user.tenant_id, trx => trx.selectFrom('sms_group_members').select(['phone', 'name'])
        .where('group_id', '=', body.groupId!).where('tenant_id', '=', user.tenant_id).execute());
      recipients = recipients.concat(members.map(m => ({ phone: m.phone, name: m.name ?? undefined })));
    }
    // De-dupe by phone — a number in both an explicit list and the group shouldn't be charged twice.
    const seen = new Set<string>();
    recipients = recipients.filter(r => (seen.has(r.phone) ? false : (seen.add(r.phone), true)));
    if (recipients.length === 0) return reply.status(400).send({ error: 'No recipients resolved.' });

    if (recipients.length === 1) {
      const result = await SmsService.sendNow(user.tenant_id, user.sub, {
        to: recipients[0].phone, body: messageBody, sourceApp: 'sms',
        contactName: recipients[0].name, templateId: body.templateId,
      });
      reply.status(result.success ? 201 : 502);
      return { data: result };
    }

    const queued = await SmsService.enqueueBulk(user.tenant_id, user.sub, recipients, messageBody, 'sms', undefined, body.templateId);
    reply.status(202);
    return { data: { queued } };
  });

  // ── Recipients search — contacts / CRM leads / customers / staff ────
  fastify.get('/recipients/search', async (request) => {
    const user = request.user;
    const q = ((request.query as { q?: string }).q ?? '').trim();
    if (q.length < 2) return { data: [] };
    const term = `%${q.toLowerCase()}%`;

    return withTenant(user.tenant_id, async (trx) => {
      const [contacts, leads, customers, staff] = await Promise.all([
        trx.selectFrom('contacts').select(['id', 'first_name', 'last_name', 'phone'])
          .where('tenant_id', '=', user.tenant_id).where('status', '!=', 'TRASHED')
          .where('phone', 'is not', null)
          .where(eb => eb.or([eb('first_name', 'ilike', term), eb('last_name', 'ilike', term), eb('phone', 'ilike', term)]))
          .limit(8).execute(),
        trx.selectFrom('leads').select(['id', 'contact_name', 'contact_phone', 'company'])
          .where('tenant_id', '=', user.tenant_id).where('contact_phone', 'is not', null)
          .where(eb => eb.or([eb('contact_name', 'ilike', term), eb('company', 'ilike', term), eb('contact_phone', 'ilike', term)]))
          .limit(8).execute(),
        trx.selectFrom('customers').select(['id', 'name', 'phone'])
          .where('tenant_id', '=', user.tenant_id).where('phone', 'is not', null)
          .where(eb => eb.or([eb('name', 'ilike', term), eb('phone', 'ilike', term)]))
          .limit(8).execute(),
        trx.selectFrom('users').select(['id', 'name', 'phone'])
          .where('tenant_id', '=', user.tenant_id).where('active', '=', true).where('phone', 'is not', null)
          .where(eb => eb.or([eb('name', 'ilike', term), eb('phone', 'ilike', term)]))
          .limit(8).execute(),
      ]);

      return {
        data: [
          ...contacts.filter(c => c.phone).map(c => ({ id: c.id, name: normalizeName(c.first_name, c.last_name) || c.phone!, phone: c.phone!, source: 'contact' as const })),
          ...leads.filter(l => l.contact_phone).map(l => ({ id: l.id, name: `${l.contact_name}${l.company ? ` (${l.company})` : ''}`, phone: l.contact_phone!, source: 'lead' as const })),
          ...customers.filter(c => c.phone).map(c => ({ id: c.id, name: c.name, phone: c.phone!, source: 'customer' as const })),
          ...staff.filter(u => u.phone).map(u => ({ id: u.id, name: u.name, phone: u.phone!, source: 'user' as const })),
        ],
      };
    });
  });

  // ── Groups ───────────────────────────────────────────────────────────
  fastify.get('/groups', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const groups = await trx.selectFrom('sms_groups').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('created_at', 'desc').execute();
      const counts = await trx.selectFrom('sms_group_members')
        .select(['group_id', ({ fn }) => fn.countAll<number>().as('c')])
        .where('tenant_id', '=', user.tenant_id).groupBy('group_id').execute();
      const countByGroup = new Map(counts.map(c => [c.group_id, Number(c.c)]));
      return { data: groups.map(g => ({ ...g, memberCount: countByGroup.get(g.id) ?? 0 })) };
    });
  });

  fastify.post('/groups', async (request, reply) => {
    const user = request.user;
    const body = groupSchema.parse(request.body);
    const row = await withTenant(user.tenant_id, trx => trx.insertInto('sms_groups').values({
      tenant_id: user.tenant_id, name: body.name, description: body.description ?? null, created_by: user.sub,
    }).returningAll().executeTakeFirstOrThrow());
    reply.status(201);
    return { data: row };
  });

  fastify.get<{ Params: { id: string } }>('/groups/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const group = await trx.selectFrom('sms_groups').selectAll()
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!group) return reply.status(404).send({ error: 'Group not found' });
      const members = await trx.selectFrom('sms_group_members').selectAll()
        .where('group_id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).orderBy('created_at', 'desc').execute();
      return { data: { ...group, members } };
    });
  });

  fastify.patch<{ Params: { id: string } }>('/groups/:id', async (request, reply) => {
    const user = request.user;
    const body = groupSchema.partial().parse(request.body);
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    const row = await withTenant(user.tenant_id, trx => trx.updateTable('sms_groups').set(updates)
      .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirst());
    if (!row) return reply.status(404).send({ error: 'Group not found' });
    return { data: row };
  });

  fastify.delete<{ Params: { id: string } }>('/groups/:id', async (request) => {
    const user = request.user;
    await withTenant(user.tenant_id, trx => trx.deleteFrom('sms_groups')
      .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute());
    return { success: true };
  });

  fastify.post<{ Params: { id: string } }>('/groups/:id/members', async (request, reply) => {
    const user = request.user;
    const body = z.union([memberSchema, z.array(memberSchema).max(2000)]).parse(request.body);
    const members = Array.isArray(body) ? body : [body];
    if (members.length === 0) return reply.status(400).send({ error: 'No members provided.' });

    return withTenant(user.tenant_id, async (trx) => {
      const group = await trx.selectFrom('sms_groups').select('id')
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!group) return reply.status(404).send({ error: 'Group not found' });

      let added = 0, skipped = 0;
      for (const m of members) {
        const result = await trx.insertInto('sms_group_members').values({
          tenant_id: user.tenant_id, group_id: request.params.id, phone: m.phone,
          name: m.name ?? null, contact_id: m.contactId ?? null, contact_source: m.contactSource ?? null,
        }).onConflict(oc => oc.columns(['group_id', 'phone']).doNothing()).executeTakeFirst();
        if (result.numInsertedOrUpdatedRows && Number(result.numInsertedOrUpdatedRows) > 0) added++; else skipped++;
      }
      reply.status(201);
      return { data: { added, skipped } };
    });
  });

  fastify.delete<{ Params: { id: string; memberId: string } }>('/groups/:id/members/:memberId', async (request) => {
    const user = request.user;
    await withTenant(user.tenant_id, trx => trx.deleteFrom('sms_group_members')
      .where('id', '=', request.params.memberId).where('group_id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute());
    return { success: true };
  });

  // ── Templates ────────────────────────────────────────────────────────
  fastify.get('/templates', async (request) => {
    const user = request.user;
    const rows = await withTenant(user.tenant_id, trx => trx.selectFrom('sms_templates').selectAll()
      .where('tenant_id', '=', user.tenant_id).orderBy('created_at', 'desc').execute());
    return { data: rows };
  });

  fastify.post('/templates', async (request, reply) => {
    const user = request.user;
    const body = templateSchema.parse(request.body);
    const row = await withTenant(user.tenant_id, trx => trx.insertInto('sms_templates').values({
      tenant_id: user.tenant_id, name: body.name, body: body.body, created_by: user.sub,
    }).returningAll().executeTakeFirstOrThrow());
    reply.status(201);
    return { data: row };
  });

  fastify.patch<{ Params: { id: string } }>('/templates/:id', async (request, reply) => {
    const user = request.user;
    const body = templateSchema.partial().parse(request.body);
    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.body !== undefined) updates.body = body.body;
    const row = await withTenant(user.tenant_id, trx => trx.updateTable('sms_templates').set(updates)
      .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirst());
    if (!row) return reply.status(404).send({ error: 'Template not found' });
    return { data: row };
  });

  fastify.delete<{ Params: { id: string } }>('/templates/:id', async (request) => {
    const user = request.user;
    await withTenant(user.tenant_id, trx => trx.deleteFrom('sms_templates')
      .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute());
    return { success: true };
  });

  // ── Campaigns ────────────────────────────────────────────────────────
  fastify.get('/campaigns', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const campaigns = await trx.selectFrom('sms_campaigns').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('created_at', 'desc').execute();
      const ids = campaigns.map(c => c.id);
      const stats = ids.length ? await trx.selectFrom('sms_messages')
        .select(['campaign_id', 'status', ({ fn }) => fn.countAll<number>().as('c')])
        .where('campaign_id', 'in', ids).groupBy(['campaign_id', 'status']).execute() : [];
      const statsByCampaign = new Map<string, Record<string, number>>();
      for (const s of stats) {
        const m = statsByCampaign.get(s.campaign_id!) ?? {};
        m[s.status] = Number(s.c);
        statsByCampaign.set(s.campaign_id!, m);
      }
      return { data: campaigns.map(c => ({ ...c, messageStats: statsByCampaign.get(c.id) ?? {} })) };
    });
  });

  fastify.post('/campaigns', async (request, reply) => {
    const user = request.user;
    const body = campaignSchema.parse(request.body);
    if (!body.body && !body.templateId) return reply.status(400).send({ error: 'body or templateId is required' });

    let recipientCount = 0;
    if (body.groupId) {
      const count = await withTenant(user.tenant_id, trx => trx.selectFrom('sms_group_members')
        .select(({ fn }) => fn.countAll<number>().as('c')).where('group_id', '=', body.groupId!).where('tenant_id', '=', user.tenant_id).executeTakeFirst());
      recipientCount = Number(count?.c ?? 0);
    }

    let messageBody = body.body?.trim();
    if (!messageBody && body.templateId) {
      const template = await withTenant(user.tenant_id, trx => trx.selectFrom('sms_templates').select('body')
        .where('id', '=', body.templateId!).where('tenant_id', '=', user.tenant_id).executeTakeFirst());
      if (!template) return reply.status(404).send({ error: 'Template not found' });
      messageBody = template.body;
    }

    const row = await withTenant(user.tenant_id, trx => trx.insertInto('sms_campaigns').values({
      tenant_id: user.tenant_id, name: body.name, body: messageBody!,
      template_id: body.templateId ?? null, group_id: body.groupId ?? null,
      status: body.scheduledAt ? 'scheduled' : 'draft',
      scheduled_at: body.scheduledAt ?? null, total_recipients: recipientCount, created_by: user.sub,
    }).returningAll().executeTakeFirstOrThrow());
    reply.status(201);
    return { data: row };
  });

  fastify.get<{ Params: { id: string } }>('/campaigns/:id', async (request, reply) => {
    const user = request.user;
    const row = await withTenant(user.tenant_id, trx => trx.selectFrom('sms_campaigns').selectAll()
      .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst());
    if (!row) return reply.status(404).send({ error: 'Campaign not found' });
    return { data: row };
  });

  fastify.patch<{ Params: { id: string } }>('/campaigns/:id', async (request, reply) => {
    const user = request.user;
    const body = campaignSchema.partial().parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('sms_campaigns').select('status')
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Campaign not found' });
      if (existing.status === 'sent' || existing.status === 'sending') return reply.status(400).send({ error: 'This campaign has already been sent and can no longer be edited.' });

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.name !== undefined) updates.name = body.name;
      if (body.body !== undefined) updates.body = body.body;
      if (body.templateId !== undefined) updates.template_id = body.templateId;
      if (body.groupId !== undefined) updates.group_id = body.groupId;
      if (body.scheduledAt !== undefined) { updates.scheduled_at = body.scheduledAt; updates.status = body.scheduledAt ? 'scheduled' : 'draft'; }
      const row = await trx.updateTable('sms_campaigns').set(updates)
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirstOrThrow();
      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string } }>('/campaigns/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('sms_campaigns').select('status')
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Campaign not found' });
      if (existing.status === 'sending') return reply.status(400).send({ error: 'This campaign is currently sending.' });
      await trx.deleteFrom('sms_campaigns').where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute();
      return { success: true };
    });
  });

  // Send a draft/scheduled campaign right now — enqueues the whole group,
  // sms-outbox.job.ts does the actual throttled sending.
  fastify.post<{ Params: { id: string } }>('/campaigns/:id/send', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const campaign = await trx.selectFrom('sms_campaigns').selectAll()
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!campaign) return reply.status(404).send({ error: 'Campaign not found' });
      if (campaign.status === 'sent' || campaign.status === 'sending') return reply.status(400).send({ error: 'This campaign has already been sent.' });
      if (!campaign.group_id) return reply.status(400).send({ error: 'This campaign has no target group.' });

      const members = await trx.selectFrom('sms_group_members').select(['phone', 'name'])
        .where('group_id', '=', campaign.group_id).where('tenant_id', '=', user.tenant_id).execute();
      if (members.length === 0) return reply.status(400).send({ error: 'The target group has no members.' });

      const body = campaign.template_id
        ? formatTemplate((await trx.selectFrom('sms_templates').select('body').where('id', '=', campaign.template_id).executeTakeFirst())?.body ?? campaign.body, {})
        : campaign.body;

      await trx.updateTable('sms_campaigns').set({ status: 'sending', total_recipients: members.length, updated_at: new Date() })
        .where('id', '=', campaign.id).execute();

      await SmsService.enqueueBulk(user.tenant_id, user.sub, members.map(m => ({ phone: m.phone, name: m.name ?? undefined })), body, 'sms', campaign.id, campaign.template_id ?? undefined);

      return { data: { queued: members.length } };
    });
  });

  // ── Gateways — multiple, tried in priority order (sms.ts falls through to
  // the next active one on failure) ────────────────────────────────────
  fastify.get('/gateways', async (request) => {
    const user = request.user;
    const rows = await withTenant(user.tenant_id, trx => trx.selectFrom('sms_gateways')
      .select(['id', 'provider', 'label', 'sender_id', 'priority', 'active', 'last_used_at', 'last_error', 'created_at'])
      .where('tenant_id', '=', user.tenant_id).orderBy('priority', 'asc').execute());
    // Credentials never leave the server at all (not even masked) — the
    // gateway list only needs to answer "is one configured / working",
    // same posture as calendarSync's OAuth tokens.
    return { data: rows };
  });

  fastify.post('/gateways', async (request, reply) => {
    const user = request.user;
    const body = gatewaySchema.parse(request.body);
    const maxPriority = await withTenant(user.tenant_id, trx => trx.selectFrom('sms_gateways')
      .select(({ fn }) => fn.max('priority').as('m')).where('tenant_id', '=', user.tenant_id).executeTakeFirst());
    const row = await withTenant(user.tenant_id, trx => trx.insertInto('sms_gateways').values({
      tenant_id: user.tenant_id, provider: body.provider, label: body.label,
      credentials: encryptJson(body.credentials), sender_id: body.senderId ?? null,
      priority: (Number(maxPriority?.m ?? -1) + 1), active: body.active ?? true,
    }).returning(['id', 'provider', 'label', 'sender_id', 'priority', 'active', 'created_at']).executeTakeFirstOrThrow());
    reply.status(201);
    return { data: row };
  });

  fastify.patch<{ Params: { id: string } }>('/gateways/:id', async (request, reply) => {
    const user = request.user;
    const body = gatewaySchema.partial().parse(request.body);
    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (body.label !== undefined) updates.label = body.label;
    if (body.senderId !== undefined) updates.sender_id = body.senderId;
    if (body.active !== undefined) updates.active = body.active;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.credentials !== undefined) updates.credentials = encryptJson(body.credentials);
    const row = await withTenant(user.tenant_id, trx => trx.updateTable('sms_gateways').set(updates)
      .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id)
      .returning(['id', 'provider', 'label', 'sender_id', 'priority', 'active', 'created_at']).executeTakeFirst());
    if (!row) return reply.status(404).send({ error: 'Gateway not found' });
    return { data: row };
  });

  fastify.delete<{ Params: { id: string } }>('/gateways/:id', async (request) => {
    const user = request.user;
    await withTenant(user.tenant_id, trx => trx.deleteFrom('sms_gateways')
      .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute());
    return { success: true };
  });

  // Sends one real test SMS through exactly this gateway (bypasses priority
  // ordering/fallback — proves this specific gateway's credentials work).
  fastify.post<{ Params: { id: string } }>('/gateways/:id/test', async (request, reply) => {
    const user = request.user;
    const body = z.object({ to: z.string().trim().min(6).max(32) }).parse(request.body);
    const gateway = await withTenant(user.tenant_id, trx => trx.selectFrom('sms_gateways').selectAll()
      .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst());
    if (!gateway) return reply.status(404).send({ error: 'Gateway not found' });

    let cfg: Record<string, any>;
    try { cfg = decryptJson(gateway.credentials); } catch { return reply.status(500).send({ error: 'Could not decrypt this gateway\'s credentials' }); }

    const result = gateway.provider === 'africas_talking'
      ? await (async () => {
          if (!cfg.atUser || !cfg.atKey) return { success: false, error: "Username/API key not configured" };
          const res = await fetch('https://api.africastalking.com/version1/messaging', {
            method: 'POST', headers: { apiKey: cfg.atKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ username: cfg.atUser, to: body.to, message: 'Hudumika SMS gateway test — if you received this, it works.', ...(gateway.sender_id ? { from: gateway.sender_id } : {}) }).toString(),
          });
          const data: any = await res.json().catch(() => ({}));
          const recipient = data?.SMSMessageData?.Recipients?.[0];
          return res.ok && recipient?.status === 'Success' ? { success: true } : { success: false, error: recipient?.status || data?.error || `HTTP ${res.status}` };
        })()
      : gateway.provider === 'twilio'
      ? await (async () => {
          if (!cfg.twilioSid || !cfg.twilioToken || !(gateway.sender_id || cfg.twilioFrom)) return { success: false, error: 'SID/token/from not configured' };
          const auth = Buffer.from(`${cfg.twilioSid}:${cfg.twilioToken}`).toString('base64');
          const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioSid}/Messages.json`, {
            method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ To: body.to, From: gateway.sender_id || cfg.twilioFrom, Body: 'Hudumika SMS gateway test — if you received this, it works.' }).toString(),
          });
          const data: any = await res.json().catch(() => ({}));
          return res.ok && data?.sid ? { success: true } : { success: false, error: data?.message || `HTTP ${res.status}` };
        })()
      : { success: false, error: `${gateway.provider} is not yet wired for live sending` };

    await withTenant(user.tenant_id, trx => trx.updateTable('sms_gateways')
      .set({ last_used_at: new Date().toISOString(), last_error: result.success ? null : result.error }).where('id', '=', gateway.id).execute());
    return { data: result };
  });

  // ── Sender IDs — named identities under a gateway; marking one default
  // syncs it onto the gateway's own sender_id (what actually gets used). ──
  fastify.get<{ Params: { id: string } }>('/gateways/:id/sender-ids', async (request) => {
    const user = request.user;
    const rows = await withTenant(user.tenant_id, trx => trx.selectFrom('sms_sender_ids').selectAll()
      .where('gateway_id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).orderBy('created_at', 'asc').execute());
    return { data: rows };
  });

  fastify.post<{ Params: { id: string } }>('/gateways/:id/sender-ids', async (request, reply) => {
    const user = request.user;
    const body = z.object({ senderId: z.string().trim().min(1).max(30), label: z.string().trim().max(100).nullable().optional(), isDefault: z.boolean().optional() }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const gateway = await trx.selectFrom('sms_gateways').select('id').where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!gateway) return reply.status(404).send({ error: 'Gateway not found' });
      const row = await trx.insertInto('sms_sender_ids').values({
        tenant_id: user.tenant_id, gateway_id: request.params.id, sender_id: body.senderId,
        label: body.label ?? null, is_default: body.isDefault ?? false,
      }).returningAll().executeTakeFirstOrThrow();
      if (body.isDefault) {
        await trx.updateTable('sms_sender_ids').set({ is_default: false }).where('gateway_id', '=', request.params.id).where('id', '!=', row.id).execute();
        await trx.updateTable('sms_gateways').set({ sender_id: body.senderId, updated_at: new Date() }).where('id', '=', request.params.id).execute();
      }
      reply.status(201);
      return { data: row };
    });
  });

  fastify.post<{ Params: { id: string; senderIdId: string } }>('/gateways/:id/sender-ids/:senderIdId/default', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const senderIdRow = await trx.selectFrom('sms_sender_ids').select('sender_id')
        .where('id', '=', request.params.senderIdId).where('gateway_id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!senderIdRow) return reply.status(404).send({ error: 'Sender ID not found' });
      await trx.updateTable('sms_sender_ids').set({ is_default: false }).where('gateway_id', '=', request.params.id).execute();
      await trx.updateTable('sms_sender_ids').set({ is_default: true }).where('id', '=', request.params.senderIdId).execute();
      await trx.updateTable('sms_gateways').set({ sender_id: senderIdRow.sender_id, updated_at: new Date() }).where('id', '=', request.params.id).execute();
      return { success: true };
    });
  });

  fastify.delete<{ Params: { id: string; senderIdId: string } }>('/gateways/:id/sender-ids/:senderIdId', async (request) => {
    const user = request.user;
    await withTenant(user.tenant_id, trx => trx.deleteFrom('sms_sender_ids')
      .where('id', '=', request.params.senderIdId).where('gateway_id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute());
    return { success: true };
  });

  // ── Opt-outs / blacklist — checked by SmsIntegration.sendSms before every
  // send, so nothing that calls SmsService can bypass it. ────────────────
  fastify.get('/opt-outs', async (request) => {
    const user = request.user;
    const rows = await withTenant(user.tenant_id, trx => trx.selectFrom('sms_opt_outs').selectAll()
      .where('tenant_id', '=', user.tenant_id).orderBy('created_at', 'desc').execute());
    return { data: rows };
  });

  fastify.post('/opt-outs', async (request, reply) => {
    const user = request.user;
    const body = z.object({ phone: z.string().trim().min(6).max(32), note: z.string().trim().max(500).nullable().optional() }).parse(request.body);
    const row = await withTenant(user.tenant_id, trx => trx.insertInto('sms_opt_outs').values({
      tenant_id: user.tenant_id, phone: body.phone, reason: 'manual', note: body.note ?? null, created_by: user.sub,
    }).onConflict(oc => oc.columns(['tenant_id', 'phone']).doUpdateSet({ note: body.note ?? null }))
      .returningAll().executeTakeFirstOrThrow());
    reply.status(201);
    return { data: row };
  });

  fastify.delete<{ Params: { id: string } }>('/opt-outs/:id', async (request) => {
    const user = request.user;
    await withTenant(user.tenant_id, trx => trx.deleteFrom('sms_opt_outs')
      .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute());
    return { success: true };
  });

  // ── Inbound message log (populated by the unauthenticated inbound
  // webhooks below, in smsWebhookRoutes) ─────────────────────────────────
  fastify.get('/inbound', async (request) => {
    const user = request.user;
    const rows = await withTenant(user.tenant_id, trx => trx.selectFrom('sms_inbound_messages').selectAll()
      .where('tenant_id', '=', user.tenant_id).orderBy('created_at', 'desc').limit(100).execute());
    return { data: rows };
  });
}

/**
 * Delivery-status callbacks from Africa's Talking / Twilio — unauthenticated
 * (the providers carry no Hudumika session), disambiguated by the provider's
 * own message id against sms_messages' (provider, provider_message_id)
 * unique index. Resolving which tenant a callback belongs to via dbPlatform
 * is the same narrow, audited cross-tenant-lookup shape booking_pages' own
 * slug resolution uses — nothing about the message content is exposed back,
 * only which tenant to run the status UPDATE inside withTenant() for.
 */
export async function smsWebhookRoutes(fastify: FastifyInstance) {
  // Both providers POST their callbacks as application/x-www-form-urlencoded
  // (Africa's Talking always; Twilio's default unless a JSON status callback
  // is separately configured) — Fastify's built-in parsers only cover JSON
  // and plain text, so without this every one of these routes 415'd before a
  // handler ever ran. Scoped to this plugin instance (and the /inbound
  // routes registered through it below), not global — no new dependency
  // needed for a format this simple to parse.
  fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    try { done(null, Object.fromEntries(new URLSearchParams(body as string))); }
    catch (err: any) { done(err, undefined); }
  });

  fastify.post('/africas-talking', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, string>;
    const providerMessageId = body.id;
    const status = (body.status || '').toLowerCase();
    if (!providerMessageId) return reply.status(400).send({ error: 'Missing id' });

    const owner = await dbPlatform.selectFrom('sms_messages').select(['tenant_id'])
      .where('provider', '=', 'africas_talking').where('provider_message_id', '=', providerMessageId).executeTakeFirst();
    if (!owner) return reply.status(200).send({ ok: true }); // unknown message — ack anyway, nothing to update

    const mapped = status === 'success' ? 'delivered' : ['failed', 'rejected', 'expired'].includes(status) ? 'undelivered' : null;
    if (mapped) {
      await withTenant(owner.tenant_id, trx => trx.updateTable('sms_messages')
        .set({ status: mapped, delivered_at: mapped === 'delivered' ? new Date().toISOString() : null })
        .where('provider', '=', 'africas_talking').where('provider_message_id', '=', providerMessageId).execute());
    }
    return { ok: true };
  });

  fastify.post('/twilio', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, string>;
    const providerMessageId = body.MessageSid;
    const status = (body.MessageStatus || '').toLowerCase();
    if (!providerMessageId) return reply.status(400).send({ error: 'Missing MessageSid' });

    const owner = await dbPlatform.selectFrom('sms_messages').select(['tenant_id'])
      .where('provider', '=', 'twilio').where('provider_message_id', '=', providerMessageId).executeTakeFirst();
    if (!owner) return reply.status(200).send({ ok: true });

    const mapped = status === 'delivered' ? 'delivered' : ['failed', 'undelivered'].includes(status) ? 'undelivered' : null;
    if (mapped) {
      await withTenant(owner.tenant_id, trx => trx.updateTable('sms_messages')
        .set({ status: mapped, delivered_at: mapped === 'delivered' ? new Date().toISOString() : null })
        .where('provider', '=', 'twilio').where('provider_message_id', '=', providerMessageId).execute());
    }
    return { ok: true };
  });

  await registerInboundRoutes(fastify);
}

const STOP_KEYWORDS = ['stop', 'unsubscribe', 'cancel', 'opt out', 'optout', 'quit', 'end'];

function matchStopKeyword(body: string): string | null {
  const normalized = body.trim().toLowerCase();
  return STOP_KEYWORDS.find(k => normalized === k || normalized.startsWith(`${k} `)) ?? null;
}

/**
 * Inbound SMS — a reply lands here because it has no sms_messages row to key
 * off (it's new, not a status update on something we sent), so the tenant is
 * resolved from which gateway's own registered sender_id the provider says
 * it arrived "to" instead. A STOP-style reply is recorded as a real opt-out
 * immediately, in the same tenant, so the very next send attempt to that
 * number is blocked — not just logged for someone to notice later.
 */
async function registerInboundRoutes(fastify: FastifyInstance) {
  fastify.post('/africas-talking/inbound', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, string>;
    const to = body.to, from = body.from, text = body.text ?? '';
    if (!to || !from) return reply.status(400).send({ error: 'Missing to/from' });

    const gateway = await dbPlatform.selectFrom('sms_gateways').select(['id', 'tenant_id'])
      .where('provider', '=', 'africas_talking').where('sender_id', '=', to).executeTakeFirst();
    if (!gateway) { console.warn(`[SMS inbound] No gateway matches Africa's Talking "to"=${to} — cannot attribute tenant`); return { ok: true }; }

    const keyword = matchStopKeyword(text);
    await withTenant(gateway.tenant_id, async (trx) => {
      await trx.insertInto('sms_inbound_messages').values({
        tenant_id: gateway.tenant_id, gateway_id: gateway.id, from_number: from, body: text, matched_keyword: keyword,
      }).execute();
      if (keyword) {
        await trx.insertInto('sms_opt_outs').values({
          tenant_id: gateway.tenant_id, phone: from, reason: 'stop_keyword', note: `Replied "${keyword}"`,
        }).onConflict(oc => oc.columns(['tenant_id', 'phone']).doNothing()).execute();
      }
    });
    return { ok: true };
  });

  fastify.post('/twilio/inbound', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, string>;
    const to = body.To, from = body.From, text = body.Body ?? '';
    if (!to || !from) return reply.status(400).send({ error: 'Missing To/From' });

    const gateway = await dbPlatform.selectFrom('sms_gateways').select(['id', 'tenant_id'])
      .where('provider', '=', 'twilio').where('sender_id', '=', to).executeTakeFirst();
    if (!gateway) { console.warn(`[SMS inbound] No gateway matches Twilio "To"=${to} — cannot attribute tenant`); return { ok: true }; }

    const keyword = matchStopKeyword(text);
    await withTenant(gateway.tenant_id, async (trx) => {
      await trx.insertInto('sms_inbound_messages').values({
        tenant_id: gateway.tenant_id, gateway_id: gateway.id, from_number: from, body: text, matched_keyword: keyword,
      }).execute();
      if (keyword) {
        await trx.insertInto('sms_opt_outs').values({
          tenant_id: gateway.tenant_id, phone: from, reason: 'stop_keyword', note: `Replied "${keyword}"`,
        }).onConflict(oc => oc.columns(['tenant_id', 'phone']).doNothing()).execute();
      }
    });
    return { ok: true };
  });
}
