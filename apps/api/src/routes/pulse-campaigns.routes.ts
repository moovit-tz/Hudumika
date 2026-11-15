import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { PulseCampaigns, smsSegments, extractLinks, extractSmsLinks } from '../services/pulse-campaigns.service.js';
import { PulseSegments } from '../services/pulse-segments.service.js';
import { emitDomainEventStandalone } from '../services/domain-events.service.js';
import { PULSE_ROLES, PULSE_PUBLISH_ROLES } from './pulse.routes.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';

const abSchema = z.object({
  variants: z.array(z.object({ key: z.string().regex(/^[A-D]$/), subject: z.string().trim().max(200) })).min(2).max(4),
  sample_pct: z.number().int().min(5).max(50),
  metric: z.enum(['open', 'click']),
  decide_after_hours: z.number().int().min(1).max(72),
});

const draftSchema = z.object({
  name: z.string().trim().min(1).max(160),
  channel: z.enum(['email', 'sms', 'whatsapp']),
  segment_id: z.string().uuid().nullish(),
  subject: z.string().trim().max(200).nullish(),
  preheader: z.string().trim().max(200).nullish(),
  from_name: z.string().trim().max(80).nullish(),
  reply_to: z.string().trim().email().max(254).nullish().or(z.literal('')),
  body_html: z.string().max(400_000).nullish(),
  body_text: z.string().max(1600).nullish(),
  ab_test: abSchema.nullish(),
  whatsapp_template: z.object({
    name: z.string().trim().min(1).max(512),
    language: z.string().trim().min(2).max(15),
    params: z.array(z.string().max(1024)).max(10).default([]),
  }).nullish(),
  utm_campaign: z.string().trim().max(80).regex(/^[\w.-]*$/, 'Use letters, numbers, dashes and dots').nullish(),
});

const EDITABLE = ['draft', 'scheduled'];

export async function pulseCampaignRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('pulse'));
  fastify.addHook('preHandler', requireRole(...PULSE_ROLES));

  // Approved templates from Meta. WhatsApp is one platform-wide connection,
  // so "not connected" is a platform fact, said plainly rather than faked.
  fastify.get('/whatsapp/templates', async () => {
    if (!WhatsAppIntegration.isConfigured()) return { data: { connected: false, templates: [], note: 'WhatsApp is not connected on this platform yet.' } };
    if (!WhatsAppIntegration.isWabaConfigured()) return { data: { connected: true, templates: [], note: 'WhatsApp can send, but templates can’t be listed until the Business Account ID is configured.' } };
    const r = await WhatsAppIntegration.listTemplates();
    if (!r.success) return { data: { connected: true, templates: [], note: r.error } };
    const templates = (r.templates ?? []).filter((t) => t.status === 'APPROVED' && t.category !== 'AUTHENTICATION').map((t) => {
      const body = t.components.find((x: any) => x.type === 'BODY')?.text ?? '';
      const params = new Set((body.match(/\{\{(\d+)\}\}/g) ?? []) as string[]).size;
      return { name: t.name, language: t.language, category: t.category, body, params };
    });
    return { data: { connected: true, templates } };
  });

  fastify.get('/campaigns', async (request) => {
    const { tenant_id } = request.user;
    const q = request.query as { status?: string; channel?: string; q?: string };
    return withTenant(tenant_id, async (trx) => {
      let query = trx.selectFrom('pulse_campaigns as c')
        .leftJoin('pulse_segments as g', 'g.id', 'c.segment_id')
        .leftJoin('users as u', 'u.id', 'c.created_by')
        .where('c.tenant_id', '=', tenant_id).where('c.journey_id', 'is', null);
      if (q.status) query = query.where('c.status', '=', q.status as any);
      if (q.channel) query = query.where('c.channel', '=', q.channel as any);
      if (q.q?.trim()) query = query.where('c.name', 'ilike', `%${q.q.trim().replace(/[\\%_]/g, (m) => '\\' + m)}%`);
      const rows = await query.select([
        'c.id', 'c.name', 'c.channel', 'c.status', 'c.subject', 'c.scheduled_at', 'c.started_at', 'c.sent_at',
        'c.total_recipients', 'c.created_at', 'c.updated_at', 'c.segment_id', 'g.name as segment_name',
        'c.created_by', 'u.name as created_by_name', 'u.avatar_url as created_by_avatar',
        sql<string>`(SELECT count(*) FROM pulse_sends s WHERE s.campaign_id = c.id AND s.status = 'sent')`.as('sent'),
        sql<string>`(SELECT count(*) FROM pulse_sends s WHERE s.campaign_id = c.id AND s.opened_at IS NOT NULL)`.as('opened'),
        sql<string>`(SELECT count(*) FROM pulse_sends s WHERE s.campaign_id = c.id AND s.clicked_at IS NOT NULL)`.as('clicked'),
      ]).orderBy('c.created_at', 'desc').limit(200).execute();
      return { data: rows.map((r) => ({ ...r, sent: Number(r.sent), opened: Number(r.opened), clicked: Number(r.clicked) })) };
    });
  });

  fastify.get('/campaigns/:id', async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    return withTenant(tenant_id, async (trx) => {
      const c = await PulseCampaigns.loadCampaign(trx, tenant_id, id);
      if (!c) return reply.status(404).send({ error: 'Campaign not found' });
      const seg = c.segment_id ? await trx.selectFrom('pulse_segments').selectAll().where('tenant_id', '=', tenant_id).where('id', '=', c.segment_id).executeTakeFirst() : null;
      let audience = null;
      if (seg && EDITABLE.includes(c.status)) {
        const rules = typeof seg.rules === 'string' ? JSON.parse(seg.rules) : seg.rules;
        audience = await PulseSegments.stats(trx, tenant_id, { source: seg.source, match_type: seg.match_type as any, rules });
      }
      return {
        data: {
          ...c,
          segment: seg ? { id: seg.id, name: seg.name, source: seg.source } : null,
          audience,
          problems: PulseCampaigns.launchProblems(c),
          links: c.channel === 'email' ? extractLinks(c.body_html || '')
            : c.channel === 'whatsapp' ? extractSmsLinks((c.whatsapp_template?.params ?? []).join(' ')) : extractSmsLinks(c.body_text || ''),
          sms_segments: c.channel === 'sms' ? smsSegments(c.body_text || '') : null,
        },
      };
    });
  });

  fastify.post('/campaigns', async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const parsed = draftSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid campaign' });
    const d = parsed.data;
    return withTenant(tenant_id, async (trx) => {
      if (d.segment_id) {
        const seg = await trx.selectFrom('pulse_segments').select('id').where('tenant_id', '=', tenant_id).where('id', '=', d.segment_id).executeTakeFirst();
        if (!seg) return reply.status(400).send({ error: 'That audience no longer exists' });
      }
      const row = await trx.insertInto('pulse_campaigns').values({
        tenant_id, name: d.name, channel: d.channel, segment_id: d.segment_id ?? null,
        subject: d.subject ?? null, preheader: d.preheader ?? null, from_name: d.from_name ?? null,
        reply_to: d.reply_to || null, body_html: d.body_html ?? null, body_text: d.body_text ?? null,
        ab_test: d.ab_test ? JSON.stringify(d.ab_test) : null, utm_campaign: d.utm_campaign || null,
        whatsapp_template: d.whatsapp_template ? JSON.stringify(d.whatsapp_template) : null,
        created_by: sub, updated_by: sub,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send({ data: row });
    });
  });

  fastify.patch('/campaigns/:id', async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { id } = request.params as { id: string };
    const parsed = draftSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid campaign' });
    const d = parsed.data;
    return withTenant(tenant_id, async (trx) => {
      const c = await PulseCampaigns.loadCampaign(trx, tenant_id, id);
      if (!c) return reply.status(404).send({ error: 'Campaign not found' });
      if (c.journey_id) return reply.status(409).send({ error: 'This message belongs to a journey. Edit it in the journey.' });
      if (c.status !== 'draft') return reply.status(409).send({ error: 'Only a draft can be edited. Cancel the schedule first.' });
      if (d.channel && d.channel !== c.channel) return reply.status(400).send({ error: 'The channel can’t change after creation. Duplicate the campaign instead.' });
      if (d.segment_id) {
        const seg = await trx.selectFrom('pulse_segments').select('id').where('tenant_id', '=', tenant_id).where('id', '=', d.segment_id).executeTakeFirst();
        if (!seg) return reply.status(400).send({ error: 'That audience no longer exists' });
      }
      const set: Record<string, unknown> = { updated_by: sub, updated_at: new Date() };
      for (const k of ['name', 'segment_id', 'subject', 'preheader', 'from_name', 'body_html', 'body_text', 'utm_campaign'] as const) {
        if (k in d) set[k] = (d as any)[k] ?? null;
      }
      if ('reply_to' in d) set.reply_to = d.reply_to || null;
      if ('ab_test' in d) set.ab_test = d.ab_test ? JSON.stringify(d.ab_test) : null;
      if ('whatsapp_template' in d) set.whatsapp_template = d.whatsapp_template ? JSON.stringify(d.whatsapp_template) : null;
      const row = await trx.updateTable('pulse_campaigns').set(set).where('tenant_id', '=', tenant_id).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      return { data: row };
    });
  });

  fastify.delete('/campaigns/:id', async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    return withTenant(tenant_id, async (trx) => {
      const c = await PulseCampaigns.loadCampaign(trx, tenant_id, id);
      if (!c) return reply.status(404).send({ error: 'Campaign not found' });
      // A campaign that reached anyone is a record of what they were sent.
      if (!['draft', 'cancelled'].includes(c.status) || c.started_at) return reply.status(409).send({ error: 'Only drafts that were never sent can be deleted' });
      await trx.deleteFrom('pulse_campaigns').where('tenant_id', '=', tenant_id).where('id', '=', id).execute();
      return { success: true };
    });
  });

  fastify.post('/campaigns/:id/duplicate', async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { id } = request.params as { id: string };
    return withTenant(tenant_id, async (trx) => {
      const c = await PulseCampaigns.loadCampaign(trx, tenant_id, id);
      if (!c) return reply.status(404).send({ error: 'Campaign not found' });
      if (c.journey_id) return reply.status(409).send({ error: 'Journey messages are copied with their journey' });
      const ab = c.ab_test ? { ...c.ab_test, winner_key: undefined, decided_at: undefined } : null;
      const row = await trx.insertInto('pulse_campaigns').values({
        tenant_id, name: `${c.name} (copy)`.slice(0, 160), channel: c.channel, segment_id: c.segment_id,
        subject: c.subject, preheader: c.preheader, from_name: c.from_name, reply_to: c.reply_to,
        body_html: c.body_html, body_text: c.body_text, whatsapp_template: c.whatsapp_template ? JSON.stringify(c.whatsapp_template) : null,
        ab_test: ab ? JSON.stringify(ab) : null, utm_campaign: c.utm_campaign, created_by: sub, updated_by: sub,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send({ data: row });
    });
  });

  fastify.post('/campaigns/:id/test', async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    const parsed = z.object({ to: z.string().trim().min(3).max(254) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Enter where to send the test' });
    const c = await withTenant(tenant_id, (trx) => PulseCampaigns.loadCampaign(trx, tenant_id, id));
    if (!c) return reply.status(404).send({ error: 'Campaign not found' });
    if (c.channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.data.to)) return reply.status(400).send({ error: 'Enter a valid email address' });
    if (c.channel === 'whatsapp' && !c.whatsapp_template?.name) return reply.status(400).send({ error: 'Choose a WhatsApp template first' });
    const r: any = await PulseCampaigns.testSend(tenant_id, c, parsed.data.to);
    if (r?.simulated) return { data: { delivered: false, note: 'No email server is set up for this workspace, so the test was only simulated. Add one in Admin ▸ Settings ▸ Email.' } };
    if (!r?.success) return reply.status(502).send({ error: r?.error || 'The test could not be sent' });
    return { data: { delivered: true } };
  });

  const launchSchema = z.object({ scheduled_at: z.string().datetime().nullish() });

  fastify.post('/campaigns/:id/launch', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { id } = request.params as { id: string };
    const parsed = launchSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Pick a valid send time' });
    const when = parsed.data.scheduled_at ? new Date(parsed.data.scheduled_at) : null;
    if (when && when.getTime() > Date.now() + 365 * 86400_000) return reply.status(400).send({ error: 'Schedule within the next year' });
    const result = await withTenant(tenant_id, async (trx) => {
      const c = await PulseCampaigns.loadCampaign(trx, tenant_id, id);
      if (!c) return { status: 404, error: 'Campaign not found' };
      if (c.journey_id) return { status: 409, error: 'Journey messages go out from the journey' };
      if (c.status !== 'draft') return { status: 409, error: 'This campaign has already been launched' };
      const problems = PulseCampaigns.launchProblems(c);
      if (problems.length) return { status: 400, error: problems.join('. ') };
      const row = await trx.updateTable('pulse_campaigns')
        .set({ status: 'scheduled', scheduled_at: when, updated_by: sub, updated_at: new Date(), last_error: null })
        .where('tenant_id', '=', tenant_id).where('id', '=', id).where('status', '=', 'draft').returningAll().executeTakeFirst();
      return { status: 200, row };
    });
    if (result.status !== 200) return reply.status(result.status).send({ error: result.error });
    await emitDomainEventStandalone(tenant_id, {
      type: 'pulse.campaign_launched', sourceApp: 'pulse', entityType: 'pulse_campaign', entityId: id, actorId: sub,
      payload: { name: result.row!.name, channel: result.row!.channel, scheduled_at: when?.toISOString() ?? null },
    }).catch(() => {});
    return { data: result.row };
  });

  fastify.post('/campaigns/:id/cancel', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { id } = request.params as { id: string };
    return withTenant(tenant_id, async (trx) => {
      const c = await PulseCampaigns.loadCampaign(trx, tenant_id, id);
      if (!c) return reply.status(404).send({ error: 'Campaign not found' });
      if (c.journey_id) return reply.status(409).send({ error: 'Pause or archive the journey instead' });
      if (c.status === 'scheduled') {
        // Never started: back to a draft so it can be fixed and relaunched.
        const row = await trx.updateTable('pulse_campaigns').set({ status: 'draft', scheduled_at: null, updated_by: sub, updated_at: new Date() })
          .where('tenant_id', '=', tenant_id).where('id', '=', id).where('status', '=', 'scheduled').returningAll().executeTakeFirst();
        return { data: row };
      }
      if (c.status === 'sending') {
        await trx.updateTable('pulse_sends').set({ status: 'skipped', skip_reason: 'Campaign cancelled before this message went out' })
          .where('tenant_id', '=', tenant_id).where('campaign_id', '=', id).where('status', 'in', ['queued', 'held']).execute();
        const row = await trx.updateTable('pulse_campaigns').set({ status: 'cancelled', updated_by: sub, updated_at: new Date() })
          .where('tenant_id', '=', tenant_id).where('id', '=', id).returningAll().executeTakeFirst();
        return { data: row };
      }
      return reply.status(409).send({ error: 'Only a scheduled or sending campaign can be cancelled' });
    });
  });

  fastify.get('/campaigns/:id/report', async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    return withTenant(tenant_id, async (trx) => {
      const c = await PulseCampaigns.loadCampaign(trx, tenant_id, id);
      if (!c) return reply.status(404).send({ error: 'Campaign not found' });
      return { data: await PulseCampaigns.report(trx, tenant_id, id) };
    });
  });

  fastify.get('/campaigns/:id/recipients', async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    const q = request.query as { filter?: string; q?: string; limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const offset = Math.max(Number(q.offset) || 0, 0);
    return withTenant(tenant_id, async (trx) => {
      const c = await PulseCampaigns.loadCampaign(trx, tenant_id, id);
      if (!c) return reply.status(404).send({ error: 'Campaign not found' });
      let query = trx.selectFrom('pulse_sends').where('tenant_id', '=', tenant_id).where('campaign_id', '=', id);
      if (q.filter === 'opened') query = query.where('opened_at', 'is not', null);
      else if (q.filter === 'clicked') query = query.where('clicked_at', 'is not', null);
      else if (q.filter === 'unsubscribed') query = query.where('unsubscribed_at', 'is not', null);
      else if (q.filter === 'skipped') query = query.where('status', '=', 'skipped');
      else if (q.filter === 'failed') query = query.where('status', '=', 'failed');
      if (q.q?.trim()) query = query.where((eb) => eb.or([
        eb('address', 'ilike', `%${q.q!.trim().replace(/[\\%_]/g, (m) => '\\' + m)}%`),
        eb('recipient_name', 'ilike', `%${q.q!.trim().replace(/[\\%_]/g, (m) => '\\' + m)}%`),
      ]));
      const data = await query.select(['id', 'recipient_name', 'address', 'variant', 'status', 'skip_reason', 'error', 'sent_at',
        'opened_at', 'open_count', 'clicked_at', 'click_count', 'unsubscribed_at', 'bounced_at', 'source', 'source_id'])
        .orderBy('recipient_name').limit(limit).offset(offset).execute();
      return { data, limit, offset };
    });
  });
}
