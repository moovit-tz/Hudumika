import type { FastifyInstance } from 'fastify';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { withTenant, type Database } from '../db/client.js';
import { MessagingService } from '../services/messaging.service.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { resolveCustomerId } from '../services/customer-identity.service.js';
import { callAI } from './ai.routes.js';
import type { MessageChannel, TicketPriority, TicketStatus, UserRole } from '@hudumika/types';
import { broadcastToTenant } from '../lib/ws-broadcast.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { emitDomainEvent } from '../services/domain-events.service.js';

// The two endpoints CUSTOMER_ALLOWED_ROUTES below actually lets a CUSTOMER
// login reach (create ticket, reply) — the only ones in this file where the
// caller isn't a vetted staff role, so runtime shape-checking matters most
// here. Fastify's `post<{ Body: ... }>()` generics only type-check at
// compile time; a customer-submitted body was never actually validated.
// A small, explicit allowlist rather than a free-text field — a caller
// tagging a ticket's origin app shouldn't be able to write an arbitrary
// string into a column other code (the Onsite priority queue) filters on.
const SOURCE_APPS = ['onsite'] as const;
const createTicketSchema = z.object({
  customer_id: z.string().uuid().optional(), // ignored for CUSTOMER logins (see below), required for staff
  subject: z.string().trim().min(1).max(300),
  description: z.string().max(10_000).optional(),
  channel: z.enum(['WHATSAPP', 'EMAIL', 'IN_APP', 'SMS', 'SYSTEM']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'MEDIUM', 'HIGH', 'URGENT']),
  category: z.string().trim().min(1).max(100),
  source_app: z.enum(SOURCE_APPS).optional(),
});
const customerReplySchema = z.object({ content: z.string().trim().min(1).max(10_000) });
const updateAttributesSchema = z.object({
  subject: z.string().trim().min(1).max(300).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});

const MGMT_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];
const AGENT_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR', 'OFFICER'];

/** Never a real row — filters a query to nothing when a CUSTOMER login's
 *  resolveCustomerId() comes back null. Same convention as shipments.routes.ts. */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Everything in this file besides these four was built for staff: ticket
 * metrics, the agent directory, rules/groups/views config, and broadcasting
 * to a customer over WhatsApp/SMS/Email as 'OFFICER'. None of it was ever
 * scoped by customer_id — a CUSTOMER-role login could already list/read any
 * ticket in the tenant by id or by passing `?customer_id=`, so an allowlist
 * (checked once, here) is safer than trusting each route below to remember
 * its own guard as this file grows.
 */
const CUSTOMER_ALLOWED_ROUTES: { method: string; url: string }[] = [
  { method: 'GET',  url: '/v1/support/tickets' },
  { method: 'POST', url: '/v1/support/tickets' },
  { method: 'GET',  url: '/v1/support/tickets/:id' },
  { method: 'POST', url: '/v1/support/tickets/:id/customer-reply' },
];

// SLA deadline defaults by priority — no per-rule config in v1, just a
// sane system default so sla_escalation rules have something real to act on.
const SLA_HOURS: Record<TicketPriority, number> = { URGENT: 4, HIGH: 8, NORMAL: 24, MEDIUM: 24, LOW: 48 };

// ── Rules engine — auto-assignment ──────────────────────────────
export async function applyAutoAssignRules(trx: Transaction<Database>, tenantId: string, ticket: { id: string; category: string }): Promise<string | null> {
  const rules = await trx.selectFrom('support_rules').selectAll()
    .where('tenant_id', '=', tenantId).where('type', '=', 'auto_assign').where('enabled', '=', true)
    .orderBy('created_at', 'asc').execute();
  if (rules.length === 0) return null;

  const rule = rules[0]; // first enabled auto-assign rule wins
  const config = typeof rule.config === 'string' ? JSON.parse(rule.config) : rule.config;
  const agentIds: string[] = config.agentIds || [];
  if (agentIds.length === 0) return null;

  let chosenId: string | null = null;

  if (config.strategy === 'category_match' && config.categoryMap?.[ticket.category]) {
    chosenId = config.categoryMap[ticket.category];
  } else if (config.strategy === 'load_based') {
    const openCounts = await trx.selectFrom('support_tickets')
      .select(['assigned_to'])
      .select(trx.fn.count('id').as('cnt'))
      .where('tenant_id', '=', tenantId)
      .where('assigned_to', 'in', agentIds)
      .where('status', 'in', ['OPEN', 'IN_PROGRESS'])
      .groupBy('assigned_to')
      .execute();
    const loadMap = new Map(openCounts.map(r => [r.assigned_to as string, Number(r.cnt)]));
    chosenId = agentIds.reduce((least, id) => (loadMap.get(id) || 0) < (loadMap.get(least) || 0) ? id : least, agentIds[0]);
  } else {
    // round_robin — pick whoever was assigned longest ago among the pool
    const lastAssigned = await trx.selectFrom('support_tickets')
      .select(['assigned_to', 'created_at'])
      .where('tenant_id', '=', tenantId)
      .where('assigned_to', 'in', agentIds)
      .orderBy('created_at', 'desc')
      .execute();
    const lastIndex = lastAssigned.length > 0 ? agentIds.indexOf(lastAssigned[0].assigned_to as string) : -1;
    chosenId = agentIds[(lastIndex + 1) % agentIds.length];
  }

  if (chosenId) {
    await trx.updateTable('support_tickets').set({ assigned_to: chosenId }).where('id', '=', ticket.id).execute();
  }
  return chosenId;
}

/**
 * The actual support_tickets insert + auto-assign + new_ticket notification
 * — extracted out of POST /tickets so imap-ticket-ingest.job.ts can create a
 * real ticket the same way a human filing one through the UI does, rather
 * than a second, drifting copy of this logic with no rules/notifications
 * wired to it.
 */
export async function createTicketRow(
  trx: Transaction<Database>,
  tenantId: string,
  input: {
    customerId: string; subject: string; description?: string | null; channel: MessageChannel; priority: TicketPriority; category: string; sourceApp?: string | null;
    // Only ever set by a caller that actually has a live HTTP request (the
    // create-ticket route, the Onsite org portal) — null for every other
    // caller (IMAP ingest, automations), which have no browser to fingerprint.
    originIp?: string | null; originUserAgent?: string | null;
  },
) {
  const slaDeadline = new Date(Date.now() + SLA_HOURS[input.priority] * 3600_000);
  let ticket = await trx
    .insertInto('support_tickets')
    .values({
      tenant_id: tenantId,
      customer_id: input.customerId,
      ref_number: `SUP-${Math.floor(1000 + Math.random() * 9000)}`,
      subject: input.subject,
      description: input.description || null,
      channel: input.channel,
      priority: input.priority,
      category: input.category,
      status: 'OPEN',
      tags: JSON.stringify([]),
      sla_deadline: slaDeadline,
      source_app: input.sourceApp ?? null,
      origin_ip: input.originIp ?? null,
      origin_user_agent: input.originUserAgent ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  // The customer's opening inquiry used to live ONLY on this row's own
  // `description` column — every caller (manual "New Ticket", the customer
  // portal, IMAP email ingest, project-linked tickets) relied on the
  // frontend rendering `ticket.description` as a fake first bubble, but
  // only for as long as the thread had zero real messages. The moment
  // anyone replied, that condition went false and the customer's actual
  // opening message disappeared from the conversation for good — still
  // sitting in the column, never shown again. A WhatsApp-webhook-originated
  // ticket never had this bug, because its first message was always a real
  // support_messages row from the start; giving every other origin the
  // same real row is the fix, not a smarter frontend fallback.
  if (input.description?.trim()) {
    const customer = await trx.selectFrom('customers').select('name')
      .where('id', '=', input.customerId).where('tenant_id', '=', tenantId).executeTakeFirst();
    // Mirrors channelKey()'s own mapping (Support.tsx) for which pill a
    // message shows under, EXCEPT 'SYSTEM' — that maps to the internal-note
    // card there, which this opening inquiry never rendered as; INAPP
    // keeps it a plain customer bubble like every other origin.
    const msgChannel = input.channel === 'WHATSAPP' || input.channel === 'EMAIL' || input.channel === 'SMS'
      ? input.channel : 'INAPP';
    await trx.insertInto('support_messages').values({
      tenant_id: tenantId,
      ticket_id: ticket.id,
      author_id: input.customerId,
      author_name: customer?.name || 'Customer',
      author_type: 'CUSTOMER',
      channel: msgChannel,
      direction: 'INBOUND',
      content: input.description.trim(),
    } as any).execute();
  }

  const assignedTo = await applyAutoAssignRules(trx, tenantId, ticket);
  if (assignedTo) ticket = { ...ticket, assigned_to: assignedTo };

  await fireNotificationTrigger(trx, tenantId, 'new_ticket', ticket);

  // Studio has always been able to CREATE a Bliss ticket (the
  // support.create_ticket action) but had nothing to REACT to inside
  // Bliss — no ticket-lifecycle event was ever emitted. This is the first
  // of four (created/reassigned/resolved/sla_escalated) added so a tenant
  // can build real workflows on top of what support_rules already does
  // internally, not just point Studio at other apps' events.
  await emitDomainEvent(trx, tenantId, {
    type: 'support.ticket_created', sourceApp: 'bliss', entityType: 'support_ticket', entityId: ticket.id,
    payload: { channel: ticket.channel, priority: ticket.priority, category: ticket.category, assignedTo: ticket.assigned_to ?? null },
  }).catch(err => console.error('[Support] ticket_created emit failed:', err?.message));

  return ticket;
}

// ── Rules engine — notification triggers ────────────────────────
/** One real in-app notification row, inside the caller's own already-open
 *  transaction — never a fresh withTenant() of its own, since every call
 *  site here runs from inside a PATCH handler's transaction and a second,
 *  independent one could commit before (or after a rollback of) the ticket
 *  change it's actually about. Shared by fireNotificationTrigger's
 *  rule-driven recipients and the two unconditional ones below it. */
async function insertSupportNotification(
  trx: Transaction<Database>,
  tenantId: string,
  userId: string,
  ticket: { id: string; ref_number?: string; subject: string },
  opts: { title: string; message?: string }
): Promise<void> {
  await trx.insertInto('notifications').values({
    tenant_id: tenantId,
    user_id: userId,
    app: 'bliss',
    type: 'support',
    title: opts.title,
    message: opts.message ?? null,
    link: `/bliss/inbox?id=${ticket.id}`,
    metadata: '{}',
    entity_type: 'support_ticket',
    entity_id: ticket.id,
    entity_label: ticket.subject,
    shipment_id: null,
    customer_id: null,
    trigger_type: null,
    channel: null,
    recipient: null,
    content: null,
  } as any).execute();
}

export async function fireNotificationTrigger(
  trx: Transaction<Database>,
  tenantId: string,
  event: 'new_ticket' | 'sla_breach' | 'reassigned' | 'status_changed',
  ticket: { id: string; ref_number?: string; subject: string; assigned_to?: string | null },
  extra?: { title?: string; message?: string }
): Promise<void> {
  const rules = await trx.selectFrom('support_rules').selectAll()
    .where('tenant_id', '=', tenantId).where('type', '=', 'notification_trigger').where('enabled', '=', true).execute();

  for (const rule of rules) {
    const config = typeof rule.config === 'string' ? JSON.parse(rule.config) : rule.config;
    if (config.event !== event) continue;

    let recipientIds: string[] = [];
    if (config.notify === 'assignee') {
      if (ticket.assigned_to) recipientIds = [ticket.assigned_to];
    } else if (config.notify === 'manager_role') {
      const managers = await trx.selectFrom('users').select('id')
        .where('tenant_id', '=', tenantId).where('role', 'in', MGMT_ROLES).execute();
      recipientIds = managers.map(m => m.id);
    } else if (Array.isArray(config.notify)) {
      recipientIds = config.notify;
    }

    for (const userId of recipientIds) {
      await insertSupportNotification(trx, tenantId, userId, ticket, {
        title: extra?.title ?? `Ticket ${ticket.ref_number ?? ''}: ${ticket.subject}`,
        message: extra?.message,
      });
    }
  }
}

export default async function supportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  // Every other Bliss pillar (calls.routes.ts) already gates on the 'bliss'
  // entitlement; this file and chat.routes.ts didn't, so a tenant whose plan
  // excludes Bliss could still read/write tickets purely by being logged in.
  fastify.addHook('preHandler', requireEntitlement('bliss'));
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.user.role !== 'CUSTOMER') return;
    const url = request.routeOptions?.url;
    const allowed = CUSTOMER_ALLOWED_ROUTES.some(r => r.method === request.method && r.url === url);
    if (!allowed) return reply.status(403).send({ error: 'Not available for customer accounts' });
  });

  // 1. List all tickets
  fastify.get<{ Querystring: { customer_id?: string; source_app?: string } }>('/tickets', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      let query = trx
        .selectFrom('support_tickets as st')
        .leftJoin('customers as c', 'c.id', 'st.customer_id')
        .leftJoin('users as u', 'u.id', 'st.assigned_to')
        .leftJoin('support_groups as g', 'g.id', 'st.group_id')
        .select([
          'st.id', 'st.ref_number as ref', 'st.subject', 'st.description',
          'st.channel', 'st.status', 'st.priority', 'st.category', 'st.tags',
          'st.source_app', 'st.sla_deadline',
          'st.created_at', 'st.updated_at',
          'c.name as customer', 'c.id as customer_id', 'c.email as customer_email', 'c.phone as customer_phone',
          'u.name as assigned_to', 'u.id as assigned_to_id',
          'g.id as group_id', 'g.name as group_name', 'g.color as group_color',
        ])
        .where('st.tenant_id', '=', user.tenant_id);
      if (user.role === 'CUSTOMER') {
        // Their own tickets only — ?customer_id= is ignored for a customer
        // login rather than trusted, the same way every other customer-scoped
        // read in this codebase treats resolveCustomerId() as authoritative.
        const cid = await resolveCustomerId(user);
        query = query.where('st.customer_id', '=', cid ?? NIL_UUID);
      } else if (request.query.customer_id) {
        query = query.where('st.customer_id', '=', request.query.customer_id);
      }
      if (request.query.source_app) {
        query = query.where('st.source_app', '=', request.query.source_app);
      }
      const tickets = await query
        .orderBy('st.created_at', 'desc')
        .execute();

      const counts = await trx
        .selectFrom('support_messages')
        .select(['ticket_id', trx.fn.count('id').as('cnt')])
        .where('tenant_id', '=', user.tenant_id)
        .groupBy('ticket_id')
        .execute();

      const countMap = new Map(counts.map(c => [c.ticket_id, Number(c.cnt)]));
      reply.status(200);
      return tickets.map(t => ({ ...t, message_count: countMap.get(t.id) || 0 }));
    });
  });

  // 2. Create a new ticket
  fastify.post<{
    Body: { customer_id: string; subject: string; description?: string; channel: MessageChannel; priority: TicketPriority; category: string; source_app?: string }
  }>('/tickets', async (request, reply) => {
    const user = request.user;
    const b = createTicketSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      // A CUSTOMER login can only ever open a ticket for themself — whatever
      // customer_id the body carries is ignored, not merely validated,
      // otherwise any customer could open (and later read, via the ticket id)
      // a ticket filed under another customer's name.
      let customerId: string;
      if (user.role === 'CUSTOMER') {
        const cid = await resolveCustomerId(user);
        if (!cid) { reply.status(403); return { error: 'Account is not linked to a customer' }; }
        customerId = cid;
      } else {
        if (!b.customer_id) { reply.status(400); return { error: 'customer_id is required' }; }
        customerId = b.customer_id;
      }

      const customer = await trx.selectFrom('customers').select('id')
        .where('id', '=', customerId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!customer) {
        reply.status(404);
        return { error: 'Customer not found' };
      }

      const ticket = await createTicketRow(trx, user.tenant_id, {
        customerId,
        subject: b.subject,
        description: b.description,
        channel: user.role === 'CUSTOMER' ? 'IN_APP' : (b.channel ?? 'IN_APP'),
        priority: b.priority,
        category: b.category,
        sourceApp: b.source_app ?? null,
        originIp: request.ip,
        originUserAgent: String(request.headers['user-agent'] || '') || null,
      });

      reply.status(201);
      return ticket;
    });
  });

  // 3. Get single ticket with thread, customer assets, invoices, shipments
  fastify.get<{ Params: { id: string } }>('/tickets/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const ticket = await trx
        .selectFrom('support_tickets as st')
        .leftJoin('customers as c', 'c.id', 'st.customer_id')
        .leftJoin('users as u', 'u.id', 'st.assigned_to')
        .select([
          'st.id', 'st.ref_number as ref', 'st.subject', 'st.description',
          'st.channel', 'st.status', 'st.priority', 'st.category',
          'st.customer_id', 'c.name as customer', 'c.email as customer_email',
          'c.phone as customer_phone', 'c.phone_wa as customer_wa',
          'c.contact_name as customer_company',
          'u.name as assigned_to', 'u.id as assigned_to_id',
          'st.source_app', 'st.origin_ip', 'st.origin_user_agent',
        ])
        .where('st.id', '=', request.params.id)
        .where('st.tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      if (!ticket) {
        reply.status(404);
        return { error: 'Ticket not found' };
      }
      if (user.role === 'CUSTOMER' && ticket.customer_id !== await resolveCustomerId(user)) {
        reply.status(404);
        return { error: 'Ticket not found' };
      }

      const [messages, assets, invoices, shipments] = await Promise.all([
        trx.selectFrom('support_messages').selectAll()
          .where('ticket_id', '=', ticket.id)
          .where('tenant_id', '=', user.tenant_id)
          .orderBy('created_at', 'asc').execute(),

        trx.selectFrom('customer_assets').selectAll()
          .where('customer_id', '=', ticket.customer_id).execute(),

        // Linked invoices
        trx.selectFrom('sales_invoices as i').select([
          'i.id', 'i.invoice_number', 'i.received as total_amount', 'i.status', 'i.bill_date', 'i.due_date'
        ]).where('i.customer_id', '=', ticket.customer_id)
          .orderBy('i.bill_date', 'desc').limit(5).execute().catch(() => []),

        // Linked shipments
        trx.selectFrom('shipment_cases as sc').select([
          'sc.id', 'sc.ref_number', 'sc.goods_desc', 'sc.stage',
          'sc.bl_number', 'sc.port_of_loading', 'sc.port_of_discharge', 'sc.updated_at'
        ]).where('sc.customer_id', '=', ticket.customer_id)
          .orderBy('sc.updated_at', 'desc').limit(5).execute().catch(() => []),
      ]);

      const messageIds = messages.map(m => m.id);
      const attachments = messageIds.length > 0
        ? await trx.selectFrom('support_message_attachments as sma')
            .innerJoin('cloud_files as cf', 'cf.id', 'sma.file_id')
            .select(['sma.message_id', 'cf.id', 'cf.name', 'cf.size', 'cf.mime_type'])
            .where('sma.message_id', 'in', messageIds)
            .where('sma.tenant_id', '=', user.tenant_id)
            .execute()
        : [];
      const attachmentsByMessage = new Map<string, typeof attachments>();
      for (const a of attachments) {
        const arr = attachmentsByMessage.get(a.message_id) ?? [];
        arr.push(a);
        attachmentsByMessage.set(a.message_id, arr);
      }
      const messagesWithAttachments = messages.map(m => ({ ...m, attachments: attachmentsByMessage.get(m.id) ?? [] }));

      reply.status(200);
      return { ...ticket, messages: messagesWithAttachments, assets, invoices, shipments };
    });
  });

  // 4. BROADCAST — Send to multiple channels simultaneously
  fastify.post<{
    Params: { id: string };
    Body: { content: string; channels: MessageChannel[]; email_subject?: string; attachment_file_ids?: string[] }
  }>('/tickets/:id/broadcast', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const ticket = await trx
        .selectFrom('support_tickets as st')
        .leftJoin('customers as c', 'c.id', 'st.customer_id')
        .select([
          'st.id', 'st.customer_id', 'st.ref_number as ref', 'st.subject',
          'st.created_at', 'st.first_reply_at',
          'c.phone as customer_phone', 'c.phone_wa as customer_wa',
          'c.email as customer_email', 'c.name as customer_name',
        ])
        .where('st.id', '=', request.params.id)
        .where('st.tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      if (!ticket) {
        reply.status(404);
        return { error: 'Ticket not found' };
      }

      const { content, channels, email_subject, attachment_file_ids } = request.body;
      const results: any[] = [];

      // Attach file/Insert image only ever reaches here when every selected
      // channel can actually deliver one (Support.tsx's canAttachToBroadcast
      // gates the buttons on that) — EMAIL (real MIME attachment, see
      // MailService.sendNowTemplated above) and IN_APP (just a row + link,
      // same as an internal note's attachment — no external delivery to
      // fake). WhatsApp has no media-message support in this integration
      // and SMS isn't MMS, so neither channel's message row gets one linked
      // below even if somehow requested — a WhatsApp/SMS bubble with an
      // attachment chip would claim a delivery that never happened.
      const attachFileIds = Array.isArray(attachment_file_ids) ? attachment_file_ids.filter(Boolean) : [];
      const attachedFiles = attachFileIds.length > 0
        ? await trx.selectFrom('cloud_files').select(['id', 'name', 'size', 'mime_type', 'storage_key'])
            .where('id', 'in', attachFileIds).where('tenant_id', '=', user.tenant_id).execute()
        : [];
      const emailAttachment = attachedFiles.find(f => f.storage_key) as { storage_key: string; name: string } | undefined;

      for (const channel of channels) {
        try {
          const effectivePhone = ticket.customer_wa || ticket.customer_phone || undefined;
          const msg = await MessagingService.dispatchOutbound(
            user.tenant_id,
            ticket.id,
            channel,
            channel === 'EMAIL' && email_subject
              ? content  // full body for email
              : content,
            user.sub,
            user.name,
            effectivePhone,
            ticket.customer_email || undefined,
            channel === 'EMAIL' && emailAttachment ? { storageKey: emailAttachment.storage_key, filename: emailAttachment.name } : undefined,
          );
          if ((channel === 'EMAIL' || channel === 'IN_APP') && attachedFiles.length > 0) {
            await trx.insertInto('support_message_attachments').values(
              attachedFiles.map(f => ({ tenant_id: user.tenant_id, message_id: msg.id, file_id: f.id }))
            ).execute();
          }
          results.push({ channel, success: true, message: msg });
        } catch (err: any) {
          results.push({ channel, success: false, error: err.message });
        }
      }

      // A reply is only useful live if the people watching this ticket
      // (other agents, the customer's own Live Chat panel) actually see it
      // arrive — this event previously only ever fired for inbound WhatsApp,
      // so an officer's own reply never appeared anywhere without a manual
      // refresh.
      if (results.some(r => r.success)) {
        broadcastToTenant(fastify, user.tenant_id, { type: 'support.message_received', ticketId: ticket.id, message: content });
      }

      // Update ticket to IN_PROGRESS if it was OPEN; record first-reply timing on the first officer reply
      const now = new Date();
      await trx.updateTable('support_tickets')
        .set({ status: 'IN_PROGRESS', updated_at: now })
        .where('id', '=', ticket.id)
        .where('status', '=', 'OPEN')
        .execute();

      if (!ticket.first_reply_at) {
        await trx.updateTable('support_tickets')
          .set({
            first_reply_at: now,
            first_reply_time_seconds: Math.round((now.getTime() - new Date(ticket.created_at).getTime()) / 1000),
          })
          .where('id', '=', ticket.id)
          .execute();
      }

      reply.status(200);
      return { dispatched: results.length, results };
    });
  });

  // 5. Single channel message (legacy)
  fastify.post<{
    Params: { id: string };
    Body: { content: string; channel: MessageChannel; attachment_file_ids?: string[] }
  }>('/tickets/:id/messages', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const ticket = await trx
        .selectFrom('support_tickets as st')
        .leftJoin('customers as c', 'c.id', 'st.customer_id')
        .select(['st.id', 'st.customer_id', 'st.created_at', 'st.first_reply_at', 'c.phone as customer_phone', 'c.email as customer_email'])
        .where('st.id', '=', request.params.id)
        .where('st.tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      if (!ticket) {
        reply.status(404);
        return { error: 'Ticket not found' };
      }

      const msg = await MessagingService.dispatchOutbound(
        user.tenant_id, ticket.id, request.body.channel, request.body.content,
        user.sub, user.name,
        ticket.customer_phone || undefined, ticket.customer_email || undefined
      );

      // Attachments only ever come from the internal-note composer (see
      // Support.tsx and migration 410's own header comment for why) — but
      // the check here isn't "trust the caller said NOTE", it's that every
      // file_id must be a real cloud_files row in this same tenant, so a
      // stray/forged id can't link someone else's file onto this message.
      const fileIds = Array.isArray(request.body.attachment_file_ids) ? request.body.attachment_file_ids.filter(Boolean) : [];
      if (fileIds.length > 0) {
        const ownedFiles = await trx.selectFrom('cloud_files').select('id')
          .where('id', 'in', fileIds).where('tenant_id', '=', user.tenant_id).execute();
        if (ownedFiles.length > 0) {
          await trx.insertInto('support_message_attachments').values(
            ownedFiles.map(f => ({ tenant_id: user.tenant_id, message_id: msg.id, file_id: f.id }))
          ).execute();
        }
      }

      // Same bookkeeping #4 (broadcast) already does — this endpoint sends
      // to exactly one channel instead of several, but a reply is a reply:
      // it should count toward SLA first-response time and move the ticket
      // out of OPEN the same way, and the people watching this ticket should
      // see it arrive without a manual refresh.
      const now = new Date();
      await trx.updateTable('support_tickets')
        .set({ status: 'IN_PROGRESS', updated_at: now })
        .where('id', '=', ticket.id)
        .where('status', '=', 'OPEN')
        .execute();
      if (!ticket.first_reply_at) {
        await trx.updateTable('support_tickets')
          .set({
            first_reply_at: now,
            first_reply_time_seconds: Math.round((now.getTime() - new Date(ticket.created_at).getTime()) / 1000),
          })
          .where('id', '=', ticket.id)
          .execute();
      }
      broadcastToTenant(fastify, user.tenant_id, { type: 'support.message_received', ticketId: ticket.id, message: request.body.content });

      const attachments = fileIds.length > 0
        ? await trx.selectFrom('cloud_files').select(['id', 'name', 'size', 'mime_type'])
            .where('id', 'in', fileIds).where('tenant_id', '=', user.tenant_id).execute()
        : [];

      reply.status(201);
      return { ...msg, attachments };
    });
  });

  // 5b. Customer-authored reply from the portal. Deliberately separate from
  // #5/#4 above: those dispatch OUTBOUND to an external channel and hardcode
  // author_type 'OFFICER' — the shape is wrong for "a customer typed a
  // message in the app" (INBOUND, author_type 'CUSTOMER', no WhatsApp/SMS/
  // Email send to trigger). Reachable only by CUSTOMER role (see the
  // allowlist above) and only against a ticket the caller owns.
  fastify.post<{ Params: { id: string }; Body: { content: string } }>('/tickets/:id/customer-reply', async (request, reply) => {
    const user = request.user;
    const { content } = customerReplySchema.parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const cid = await resolveCustomerId(user);
      const ticket = await trx.selectFrom('support_tickets')
        .select(['id', 'customer_id', 'ref_number', 'subject', 'assigned_to'])
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      if (!ticket || ticket.customer_id !== cid) {
        reply.status(404);
        return { error: 'Ticket not found' };
      }

      const message = await trx.insertInto('support_messages').values({
        tenant_id: user.tenant_id,
        ticket_id: ticket.id,
        channel: 'IN_APP',
        direction: 'INBOUND',
        author_id: user.sub,
        author_name: user.name,
        author_type: 'CUSTOMER',
        content,
      }).returningAll().executeTakeFirstOrThrow();

      // A customer reply is time-sensitive and should reach the assigned
      // agent directly, rather than waiting on the configurable
      // notification_trigger rules (those are for staff-driven events).
      if (ticket.assigned_to) {
        await trx.insertInto('notifications').values({
          tenant_id: user.tenant_id,
          user_id: ticket.assigned_to,
          app: 'bliss',
          type: 'support',
          title: `New reply on ${ticket.ref_number}`,
          message: content.slice(0, 200),
          link: `/bliss/inbox?id=${ticket.id}`,
          metadata: '{}',
          entity_type: 'support_ticket',
          entity_id: ticket.id,
          entity_label: ticket.subject,
          shipment_id: null,
          customer_id: cid,
          trigger_type: null,
          channel: null,
          recipient: null,
          content: null,
        } as any).execute();
      }

      await trx.updateTable('support_tickets').set({ updated_at: new Date() }).where('id', '=', ticket.id).execute();

      // The notification row above reaches the assigned agent's bell icon;
      // this is what makes the message show up live in whichever ticket
      // view (agent or the customer's own other tab) is already open.
      broadcastToTenant(fastify, user.tenant_id, { type: 'support.message_received', ticketId: ticket.id, message: content });

      reply.status(201);
      return message;
    });
  });

  // 6. Update ticket status
  fastify.patch<{
    Params: { id: string };
    Body: { status: TicketStatus; assigned_to?: string }
  }>('/tickets/:id/status', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const before = await trx.selectFrom('support_tickets')
        .select(['status', 'assigned_to', 'created_at', 'resolved_at'])
        .where('id', '=', request.params.id)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      if (!before) {
        reply.status(404);
        return { error: 'Ticket not found' };
      }

      const newlyResolved = request.body.status === 'RESOLVED' && before?.status !== 'RESOLVED' && !before?.resolved_at;
      const resolvedAt = newlyResolved ? new Date() : undefined;
      const resolutionSeconds = newlyResolved && before
        ? Math.round((resolvedAt!.getTime() - new Date(before.created_at).getTime()) / 1000)
        : undefined;

      const updated = await trx
        .updateTable('support_tickets')
        .set({
          status: request.body.status,
          ...(request.body.assigned_to ? { assigned_to: request.body.assigned_to } : {}),
          ...(resolvedAt ? { resolved_at: resolvedAt, resolution_time_seconds: resolutionSeconds } : {}),
          updated_at: new Date(),
        })
        .where('id', '=', request.params.id)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirstOrThrow();

      const wasReassigned = !!request.body.assigned_to && request.body.assigned_to !== before?.assigned_to;
      if (wasReassigned) {
        // Unconditional — the new assignee finding out they own this ticket
        // is the core workflow, not an opt-in automation a manager has to
        // remember to configure. fireNotificationTrigger below is the
        // separate, admin-configured "also notify X on this event" layer
        // (e.g. managers) and stays purely additive to this. Skipped only
        // when the assigner is assigning the ticket to themself — telling
        // someone they did the thing they just did isn't a notification.
        if (request.body.assigned_to !== user.sub) {
          await insertSupportNotification(trx, user.tenant_id, request.body.assigned_to!, updated, {
            title: `You were assigned ticket ${updated.ref_number ?? ''}`,
            message: updated.subject,
          });
        }
        await fireNotificationTrigger(trx, user.tenant_id, 'reassigned', updated);
      }
      if (request.body.status !== before?.status) await fireNotificationTrigger(trx, user.tenant_id, 'status_changed', updated);

      if (wasReassigned) {
        await emitDomainEvent(trx, user.tenant_id, {
          type: 'support.ticket_reassigned', sourceApp: 'bliss', entityType: 'support_ticket', entityId: updated.id,
          payload: { assignedTo: updated.assigned_to, previousAssignedTo: before.assigned_to ?? null },
        }).catch(err => console.error('[Support] ticket_reassigned emit failed:', err?.message));
      }
      if (newlyResolved) {
        await emitDomainEvent(trx, user.tenant_id, {
          type: 'support.ticket_resolved', sourceApp: 'bliss', entityType: 'support_ticket', entityId: updated.id,
          payload: { priority: updated.priority, category: updated.category, resolutionSeconds: resolutionSeconds ?? 0 },
        }).catch(err => console.error('[Support] ticket_resolved emit failed:', err?.message));
      }

      reply.status(200);
      return updated;
    });
  });

  // 7. AI smart reply suggestion for a ticket
  fastify.post<{ Params: { id: string } }>('/tickets/:id/ai-suggest', async (request, reply) => {
    const user = request.user;

    // Fetch ticket + last 5 messages for context
    const context = await withTenant(user.tenant_id, async (trx) => {
      const ticket = await trx
        .selectFrom('support_tickets as st')
        .leftJoin('customers as c', 'c.id', 'st.customer_id')
        .select(['st.id', 'st.subject', 'st.category', 'st.priority', 'c.name as customer'])
        .where('st.id', '=', request.params.id)
        .where('st.tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      const messages = await trx
        .selectFrom('support_messages')
        .select(['content', 'author_type', 'channel', 'created_at'])
        .where('ticket_id', '=', request.params.id)
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc')
        .limit(5)
        .execute();

      return { ticket, messages: messages.reverse() };
    });

    if (!context.ticket) {
      reply.status(404);
      return { error: 'Ticket not found' };
    }

    // Get AI settings — 'int-ai' is the real key Settings → Integrations
    // writes to (confirmed against ai.routes.ts and every other AI feature
    // in this platform). This previously read settings.ai, a key nothing
    // ever wrote, so this endpoint had always silently hit the mock
    // fallback below in production regardless of whether a tenant had
    // actually configured AI.
    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings')
        .where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      // The pg driver hands jsonb columns back already parsed — JSON.parse(String(...))
      // on an already-parsed object stringifies it to the literal text
      // "[object Object]" first, which then fails to parse, throwing a 500
      // on every tenant that has a settings row at all. Same defensive
      // check used everywhere else this column is read (settings.routes.ts,
      // mail-template.service.ts).
      if (!row?.settings) return null;
      return typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
    });

    const aiCfg = settings?.['int-ai'];
    if (!aiCfg?.on || !aiCfg?.apiKey) {
      // Honest template, not an AI opinion — is_mock lets the UI say so
      // rather than presenting this as a real model-generated draft.
      return {
        suggestion: `Thank you for reaching out regarding "${context.ticket.subject}". I have reviewed your case and our team is looking into this now. We will have a full update for you within 2 business hours. Please don't hesitate to call us if this is urgent.`,
        is_mock: true,
      };
    }

    const thread = context.messages.map(m =>
      `[${m.author_type}]: ${m.content}`
    ).join('\n');

    const prompt = `You are a professional customer support agent for a financial services company in East Africa.

Ticket: "${context.ticket.subject}" (${context.ticket.category}, ${context.ticket.priority} priority)
Customer: ${context.ticket.customer}

Conversation:
${thread || '(no messages yet)'}

Write a professional, empathetic reply to this customer. Be concise (2–4 sentences). Do not use placeholder text. Respond in English.`;

    try {
      const suggestion = await callAI(
        aiCfg.apiKey,
        aiCfg.model || 'claude-haiku-4-5-20251001',
        aiCfg.provider || 'anthropic',
        [{ role: 'user', content: prompt }],
        300, 0.4,
      );
      return { suggestion: suggestion || 'Unable to generate suggestion.', is_mock: false };
    } catch (err: any) {
      // A real call that failed (bad key, provider outage) is not the same
      // as "no AI configured" — say so, rather than quietly handing back
      // the same template as the not-configured case.
      reply.status(502);
      return { error: `AI suggestion failed: ${err?.message ?? err}` };
    }
  });

  // 8. Assign ticket to a group
  fastify.patch<{ Params: { id: string }; Body: { group_id: string | null } }>('/tickets/:id/group', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx
        .updateTable('support_tickets')
        .set({ group_id: request.body.group_id, updated_at: new Date() })
        .where('id', '=', request.params.id)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirstOrThrow();

      reply.status(200);
      return updated;
    });
  });

  // 8b. Set a ticket's tags — the DetailsPanel tag chip editor used to only
  // ever call local setState, so every tag an agent added vanished on the
  // next page load having never reached the database at all.
  fastify.patch<{ Params: { id: string }; Body: { tags: string[] } }>('/tickets/:id/tags', async (request, reply) => {
    const user = request.user;
    const tags = Array.isArray(request.body.tags) ? request.body.tags.map(t => String(t).trim()).filter(Boolean) : [];
    return withTenant(user.tenant_id, async (trx) => {
      const before = await trx.selectFrom('support_tickets')
        .select(['tags', 'assigned_to'])
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      const updated = await trx
        .updateTable('support_tickets')
        .set({ tags: JSON.stringify(tags), updated_at: new Date() })
        .where('id', '=', request.params.id)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirstOrThrow();

      // Keep the assignee in the loop on their own ticket, the same way
      // reassignment above always notifies unconditionally — a tag being
      // added isn't behind an admin-configured rule either. No obvious
      // single recipient for a plain text tag beyond "whoever owns this
      // ticket right now," so that's who hears about it; skipped when
      // there's no assignee yet, or the editor is the assignee themself.
      const beforeTags: string[] = Array.isArray(before?.tags) ? before.tags : (typeof before?.tags === 'string' ? JSON.parse(before.tags || '[]') : []);
      const tagsChanged = JSON.stringify([...beforeTags].sort()) !== JSON.stringify([...tags].sort());
      if (tagsChanged && updated.assigned_to && updated.assigned_to !== user.sub) {
        await insertSupportNotification(trx, user.tenant_id, updated.assigned_to, updated, {
          title: `Tags updated on ticket ${updated.ref_number ?? ''}`,
          message: tags.length ? tags.join(', ') : 'All tags removed',
        });
      }

      reply.status(200);
      return updated;
    });
  });

  // 8b. Update a ticket's own attributes — subject/category/priority.
  // Status/assignee have their own endpoint (7, above) since they trigger
  // notifications and resolution-time bookkeeping that a plain attribute
  // edit shouldn't. Was previously nowhere in the API — the "Edit" button
  // on the Conversation Attributes panel (Support.tsx) rendered with no
  // handler at all, so category/priority/subject were permanently fixed
  // at ticket-creation time no matter what an agent tried to change them to.
  fastify.patch<{
    Params: { id: string };
    Body: { subject?: string; category?: string; priority?: TicketPriority };
  }>('/tickets/:id/attributes', async (request, reply) => {
    const user = request.user;
    const b = updateAttributesSchema.parse(request.body);
    if (!b.subject && !b.category && !b.priority) {
      reply.status(400);
      return { error: 'Nothing to update' };
    }
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx
        .updateTable('support_tickets')
        .set({
          ...(b.subject ? { subject: b.subject } : {}),
          ...(b.category ? { category: b.category } : {}),
          ...(b.priority ? { priority: b.priority } : {}),
          updated_at: new Date(),
        })
        .where('id', '=', request.params.id)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirst();

      if (!updated) {
        reply.status(404);
        return { error: 'Ticket not found' };
      }
      reply.status(200);
      return updated;
    });
  });

  // 8c. Macros / canned responses — list, create, delete. Backs the
  // composer's "Canned responses" button (Support.tsx) — see migration 409.
  fastify.get('/macros', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const macros = await trx.selectFrom('support_macros').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('title', 'asc')
        .execute();
      reply.status(200);
      return macros;
    });
  });

  fastify.post<{ Body: { title: string; content: string } }>('/macros', async (request, reply) => {
    const user = request.user;
    const title = String(request.body?.title || '').trim();
    const content = String(request.body?.content || '').trim();
    if (!title || !content) {
      reply.status(400);
      return { error: 'title and content are required' };
    }
    return withTenant(user.tenant_id, async (trx) => {
      const macro = await trx.insertInto('support_macros').values({
        tenant_id: user.tenant_id, title, content,
        created_by: user.sub, created_by_name: user.name ?? 'Unknown',
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return macro;
    });
  });

  fastify.delete<{ Params: { id: string } }>('/macros/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('support_macros')
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute();
      reply.status(204);
      return null;
    });
  });

  // 9. Groups — list
  fastify.get('/groups', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const groups = await trx
        .selectFrom('support_groups')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'asc')
        .execute();

      const counts = await trx
        .selectFrom('support_tickets')
        .select(['group_id', trx.fn.count('id').as('cnt')])
        .where('tenant_id', '=', user.tenant_id)
        .where('group_id', 'is not', null)
        .groupBy('group_id')
        .execute();
      const countMap = new Map(counts.map(c => [c.group_id, Number(c.cnt)]));

      reply.status(200);
      return groups.map(g => ({ ...g, ticket_count: countMap.get(g.id) || 0 }));
    });
  });

  // 10. Groups — create
  fastify.post<{ Body: { name: string; color?: string } }>('/groups', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const group = await trx
        .insertInto('support_groups')
        .values({ tenant_id: user.tenant_id, name: request.body.name, color: request.body.color || 'teal' })
        .returningAll()
        .executeTakeFirstOrThrow();

      reply.status(201);
      return group;
    });
  });

  // 11. Groups — delete
  fastify.delete<{ Params: { id: string } }>('/groups/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('support_groups').where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute();
      reply.status(204);
      return null;
    });
  });

  // 12. Views — list
  fastify.get('/views', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const views = await trx
        .selectFrom('support_views')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'asc')
        .execute();
      reply.status(200);
      return views;
    });
  });

  // 13. Views — create
  fastify.post<{ Body: { name: string; filters: Record<string, any> } }>('/views', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const view = await trx
        .insertInto('support_views')
        .values({
          tenant_id: user.tenant_id,
          name: request.body.name,
          filters: JSON.stringify(request.body.filters || {}),
          created_by: user.sub,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      reply.status(201);
      return view;
    });
  });

  // 14. Views — delete
  fastify.delete<{ Params: { id: string } }>('/views/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('support_views').where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute();
      reply.status(204);
      return null;
    });
  });

  // 15. Metrics — KPIs + charts for the Support Overview dashboard
  fastify.get('/metrics', async (request, reply) => {
    const user = request.user;
    const { period } = request.query as { period?: '7d' | '30d' | '90d' };

    return withTenant(user.tenant_id, async (trx) => {
      let days = 30;
      if (period === '7d') days = 7;
      if (period === '90d') days = 90;
      const cutoff = new Date(Date.now() - days * 86400000);

      const tickets = await trx
        .selectFrom('support_tickets')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('created_at', '>=', cutoff)
        .execute();

      const total = tickets.length;
      const open = tickets.filter(t => t.status === 'OPEN').length;
      const inProgress = tickets.filter(t => t.status === 'IN_PROGRESS').length;
      const resolved = tickets.filter(t => t.status === 'RESOLVED').length;
      const closed = tickets.filter(t => t.status === 'CLOSED').length;
      const urgent = tickets.filter(t => t.priority === 'URGENT').length;

      const surveyTickets = tickets.filter(t => t.nps_score !== null && t.nps_score !== undefined);
      const totalNpsCount = surveyTickets.length;
      let npsScore = 0, promoters = 0, passives = 0, detractors = 0;
      if (totalNpsCount > 0) {
        const promoterCount  = surveyTickets.filter(t => t.nps_score! >= 9).length;
        const passiveCount   = surveyTickets.filter(t => t.nps_score! >= 7 && t.nps_score! <= 8).length;
        const detractorCount = surveyTickets.filter(t => t.nps_score! <= 6).length;
        promoters  = Math.round((promoterCount  / totalNpsCount) * 100);
        passives   = Math.round((passiveCount   / totalNpsCount) * 100);
        detractors = Math.round((detractorCount / totalNpsCount) * 100);
        npsScore = promoters - detractors;
      }

      const csatTickets = tickets.filter(t => t.csat_score !== null && t.csat_score !== undefined);
      const csatAvg = csatTickets.length > 0
        ? Number((csatTickets.reduce((acc, t) => acc + t.csat_score!, 0) / csatTickets.length).toFixed(1))
        : 0;

      const replyTickets = tickets.filter(t => t.first_reply_time_seconds !== null && t.first_reply_time_seconds !== undefined);
      const avgFirstReply = replyTickets.length > 0
        ? Number((replyTickets.reduce((acc, t) => acc + t.first_reply_time_seconds!, 0) / replyTickets.length / 3600).toFixed(1))
        : 0;

      const solveTickets = tickets.filter(t => t.resolution_time_seconds !== null && t.resolution_time_seconds !== undefined);
      const avgSolveTime = solveTickets.length > 0
        ? Number((solveTickets.reduce((acc, t) => acc + t.resolution_time_seconds!, 0) / solveTickets.length / 3600).toFixed(1))
        : 0;

      let slaCompliantCount = 0, slaEvaluatedCount = 0;
      for (const t of tickets) {
        if (t.sla_deadline) {
          slaEvaluatedCount++;
          const deadlineTime = new Date(t.sla_deadline).getTime();
          const resolutionTime = t.resolved_at ? new Date(t.resolved_at).getTime() : Date.now();
          if (resolutionTime <= deadlineTime) slaCompliantCount++;
        }
      }
      const slaCompliance = slaEvaluatedCount > 0 ? Number(((slaCompliantCount / slaEvaluatedCount) * 100).toFixed(1)) : 100;

      const defectCount = tickets.filter(t =>
        t.sla_deadline && t.resolved_at && new Date(t.resolved_at).getTime() > new Date(t.sla_deadline).getTime()
      ).length;
      const defectRate = total > 0 ? Number(((defectCount / total) * 100).toFixed(1)) : 0;

      // Real escalation rate — sla_escalated_at is stamped by the actual
      // sla_escalation rule job (support-rules.job.ts), not derived from
      // another metric. Used to be `defectRate / 2` on the frontend, a
      // number with no relationship to anything escalation actually means.
      const escalatedCount = tickets.filter(t => t.sla_escalated_at != null).length;
      const escalationRate = total > 0 ? Number(((escalatedCount / total) * 100).toFixed(1)) : 0;

      // Daily volume (last 14 days)
      const dailyBars: number[] = [];
      for (let i = 13; i >= 0; i--) {
        const dayStart = new Date(Date.now() - i * 86400000);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + 86400000);
        dailyBars.push(tickets.filter(t => {
          const cDate = new Date(t.created_at);
          return cDate >= dayStart && cDate < dayEnd;
        }).length);
      }

      // Hours-until-first-reply histogram
      const firstReplyHistogram = { '0-1': 0, '1-8': 0, '8-24': 0, '>24': 0 };
      for (const t of replyTickets) {
        const hrs = t.first_reply_time_seconds! / 3600;
        if (hrs <= 1) firstReplyHistogram['0-1']++;
        else if (hrs <= 8) firstReplyHistogram['1-8']++;
        else if (hrs <= 24) firstReplyHistogram['8-24']++;
        else firstReplyHistogram['>24']++;
      }

      // Busiest time of day — day-of-week x 2-hour bucket grid
      const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const busiestHeatmap: { day: string; bucket: string; count: number }[] = [];
      const heatMap = new Map<string, number>();
      for (const t of tickets) {
        const d = new Date(t.created_at);
        const day = DOW[d.getDay()];
        const bucketStart = Math.floor(d.getHours() / 2) * 2;
        const bucket = `${bucketStart}-${bucketStart + 2}`;
        const key = `${day}|${bucket}`;
        heatMap.set(key, (heatMap.get(key) || 0) + 1);
      }
      for (const day of DOW) {
        for (let h = 0; h < 24; h += 2) {
          const bucket = `${h}-${h + 2}`;
          busiestHeatmap.push({ day, bucket, count: heatMap.get(`${day}|${bucket}`) || 0 });
        }
      }

      // Conversations by tag
      const tagCounts = new Map<string, number>();
      for (const t of tickets) {
        const tags: string[] = Array.isArray(t.tags) ? t.tags : (typeof t.tags === 'string' ? JSON.parse(t.tags || '[]') : []);
        for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
      const tagBreakdown = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      // Per-agent performance — real data from support_tickets.assigned_to
      // (a real FK to users), not a fabricated list.
      const assignedIds = Array.from(new Set(tickets.map(t => t.assigned_to).filter((x): x is string => !!x)));
      const agentUsers = assignedIds.length > 0
        ? await trx.selectFrom('users').select(['id', 'name']).where('id', 'in', assignedIds).execute()
        : [];
      const agentNameMap = new Map(agentUsers.map(u => [u.id, u.name]));
      const agents = assignedIds.map(id => {
        const agentTickets = tickets.filter(t => t.assigned_to === id);
        const resolvedCount = agentTickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
        const openCount = agentTickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
        const resTimes = agentTickets.filter(t => t.resolution_time_seconds != null).map(t => t.resolution_time_seconds!);
        const avgResolutionHours = resTimes.length ? Number((resTimes.reduce((a, b) => a + b, 0) / resTimes.length / 3600).toFixed(1)) : null;
        const csatVals = agentTickets.filter(t => t.csat_score != null).map(t => t.csat_score!);
        const avgCsat = csatVals.length ? Number((csatVals.reduce((a, b) => a + b, 0) / csatVals.length).toFixed(1)) : null;
        return {
          id,
          name: agentNameMap.get(id) || 'Unknown',
          assigned: agentTickets.length,
          resolved: resolvedCount,
          open: openCount,
          avgResolutionHours,
          csat: avgCsat,
          resolutionRate: agentTickets.length ? Math.round((resolvedCount / agentTickets.length) * 100) : 0,
        };
      }).sort((a, b) => b.assigned - a.assigned);

      return {
        total, open, inProgress, resolved, closed, urgent,
        nps: { score: npsScore, promoters, passives, detractors, total: totalNpsCount },
        csat: csatAvg,
        firstReply: avgFirstReply,
        resolution: avgSolveTime,
        sla: slaCompliance,
        defect: defectRate,
        escalation: escalationRate,
        dailyBars,
        firstReplyHistogram,
        busiestHeatmap,
        tagBreakdown,
        agents,
      };
    });
  });

  // 16. Submit resolution feedback (NPS / CSAT) and close the ticket
  fastify.patch<{
    Params: { id: string };
    Body: { nps_score?: number; csat_score?: number; feedback_text?: string }
  }>('/tickets/:id/feedback', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const ticket = await trx.selectFrom('support_tickets').select(['id', 'created_at'])
        .where('id', '=', request.params.id)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      if (!ticket) {
        reply.status(404);
        return { error: 'Ticket not found' };
      }

      const resolvedAt = new Date();
      const resolutionSeconds = Math.round((resolvedAt.getTime() - new Date(ticket.created_at).getTime()) / 1000);

      const updated = await trx
        .updateTable('support_tickets')
        .set({
          status: 'CLOSED',
          nps_score: request.body.nps_score ?? null,
          csat_score: request.body.csat_score ?? null,
          feedback_text: request.body.feedback_text ?? null,
          resolved_at: resolvedAt,
          resolution_time_seconds: resolutionSeconds,
          updated_at: resolvedAt,
        })
        .where('id', '=', request.params.id)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirstOrThrow();

      reply.status(200);
      return updated;
    });
  });

  // 17. Real tenant users eligible as support agents — used by the Team tab
  // and the auto-assign rule config UI, replacing the old hardcoded OFFICERS list.
  fastify.get('/agents', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      reply.status(200);
      return trx.selectFrom('users')
        .select(['id', 'name', 'email', 'role'])
        .where('tenant_id', '=', user.tenant_id)
        .where('role', 'in', AGENT_ROLES)
        .where('active', '=', true)
        .orderBy('name', 'asc')
        .execute();
    });
  });

  // 18. Rules & workflows — auto-assignment, SLA escalation, status
  // automation, notification triggers. See applyAutoAssignRules /
  // fireNotificationTrigger above and support-rules.job.ts for execution.
  fastify.get('/rules', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      reply.status(200);
      return trx.selectFrom('support_rules').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('type', 'asc').orderBy('created_at', 'asc')
        .execute();
    });
  });

  fastify.post<{
    // 'whatsapp_keyword' rules are evaluated by the /v1/webhooks/whatsapp
    // handler (webhooks.routes.ts), not by anything in this file — this
    // union just has to name every type this table actually stores.
    Body: { type: 'auto_assign' | 'sla_escalation' | 'status_automation' | 'notification_trigger' | 'whatsapp_keyword'; name: string; enabled?: boolean; config: any }
  }>('/rules', { preHandler: [requireRole(...MGMT_ROLES)] }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const b = request.body;
      const rule = await trx.insertInto('support_rules').values({
        tenant_id: user.tenant_id,
        type: b.type,
        name: b.name,
        enabled: b.enabled ?? true,
        config: JSON.stringify(b.config ?? {}),
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return rule;
    });
  });

  fastify.patch<{
    Params: { id: string };
    Body: { name?: string; enabled?: boolean; config?: any };
  }>('/rules/:id', { preHandler: [requireRole(...MGMT_ROLES)] }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const b = request.body;
      const rule = await trx.updateTable('support_rules').set({
        ...(b.name !== undefined ? { name: b.name } : {}),
        ...(b.enabled !== undefined ? { enabled: b.enabled } : {}),
        ...(b.config !== undefined ? { config: JSON.stringify(b.config) } : {}),
        updated_at: new Date(),
      }).where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirstOrThrow();
      reply.status(200);
      return rule;
    });
  });

  fastify.delete<{ Params: { id: string } }>('/rules/:id', { preHandler: [requireRole(...MGMT_ROLES)] }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('support_rules').where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute();
      reply.status(204);
      return null;
    });
  });

  // ── Knowledge Base ───────────────────────────────────────────────

  fastify.get('/kb/categories', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('kb_categories').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('name', 'asc').execute()
    );
  });

  fastify.post<{ Body: { name: string; description?: string } }>('/kb/categories', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const category = await trx.insertInto('kb_categories')
        .values({ tenant_id: user.tenant_id, name: request.body.name, description: request.body.description ?? null })
        .returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return category;
    });
  });

  fastify.delete<{ Params: { id: string } }>('/kb/categories/:id', { preHandler: [requireRole(...MGMT_ROLES)] }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('kb_categories').where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute();
      reply.status(204);
      return null;
    });
  });

  fastify.get('/kb/articles', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('knowledge_base')
        .leftJoin('kb_categories', 'kb_categories.id', 'knowledge_base.category_id')
        .select([
          'knowledge_base.id', 'knowledge_base.title', 'knowledge_base.content', 'knowledge_base.status',
          'knowledge_base.views', 'knowledge_base.category_id', 'knowledge_base.created_at', 'knowledge_base.updated_at',
          'kb_categories.name as category_name',
        ])
        .where('knowledge_base.tenant_id', '=', user.tenant_id)
        .orderBy('knowledge_base.updated_at', 'desc')
        .execute()
    );
  });

  fastify.post<{ Body: { title: string; content: string; category_id?: string; status?: string } }>('/kb/articles', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const article = await trx.insertInto('knowledge_base')
        .values({
          tenant_id: user.tenant_id,
          title: request.body.title,
          content: request.body.content,
          category_id: request.body.category_id ?? null,
          status: request.body.status ?? 'Draft',
        })
        .returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return article;
    });
  });

  fastify.patch<{ Params: { id: string }; Body: { title?: string; content?: string; category_id?: string | null; status?: string } }>(
    '/kb/articles/:id',
    async (request, reply) => {
      const user = request.user;
      return withTenant(user.tenant_id, async (trx) => {
        const updates: Record<string, unknown> = { updated_at: new Date() };
        if (request.body.title !== undefined) updates.title = request.body.title;
        if (request.body.content !== undefined) updates.content = request.body.content;
        if (request.body.category_id !== undefined) updates.category_id = request.body.category_id;
        if (request.body.status !== undefined) updates.status = request.body.status;

        const article = await trx.updateTable('knowledge_base').set(updates)
          .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirstOrThrow();
        return article;
      });
    }
  );

  fastify.post<{ Params: { id: string } }>('/kb/articles/:id/view', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.updateTable('knowledge_base')
        .set({ views: (eb) => eb('views', '+', 1) as any })
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute();
      return { success: true };
    });
  });

  fastify.delete<{ Params: { id: string } }>('/kb/articles/:id', { preHandler: [requireRole(...MGMT_ROLES)] }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('knowledge_base').where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute();
      reply.status(204);
      return null;
    });
  });

  // 19. Customer directory (BlissCustomerCRM) — real customers rows plus
  // aggregates only Bliss actually needs: conversation/open-ticket counts
  // and lifetime value from FinOps' real invoicing tables (sales_invoices
  // has no total column of its own — the real total is the sum of its
  // lines' rate*qty*(1+tax_pct/100), same math the invoice PDF uses).
  // Two follow-up aggregate queries + a JS merge rather than correlated
  // subqueries — simpler to read and the customer count per tenant is small.
  fastify.get<{ Querystring: { search?: string } }>('/customers', async (request) => {
    const user = request.user;
    const { search } = request.query;
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('customers as c')
        .leftJoin('users as u', 'u.id', 'c.assigned_officer_id')
        .select([
          'c.id', 'c.name', 'c.contact_name', 'c.email', 'c.phone', 'c.phone_wa',
          'c.country', 'c.city', 'c.client_type', 'c.account_status', 'c.website',
          'c.logo_url', 'c.avatar_color', 'c.avatar_initials', 'c.created_at',
          'u.name as assigned_officer_name',
        ])
        .where('c.tenant_id', '=', user.tenant_id)
        .where('c.deleted_at', 'is', null);
      if (search?.trim()) {
        const like = `%${search.trim()}%`;
        q = q.where((eb) => eb.or([eb('c.name', 'ilike', like), eb('c.contact_name', 'ilike', like), eb('c.email', 'ilike', like)]));
      }
      const customers = await q.orderBy('c.name', 'asc').limit(300).execute();
      if (customers.length === 0) return [];
      const ids = customers.map(c => c.id);

      const ticketCounts = await trx.selectFrom('support_tickets')
        .select(['customer_id',
          (eb) => eb.fn.count<number>('id').as('total'),
          (eb) => eb.fn.count<number>('id').filterWhere('status', 'in', ['OPEN', 'IN_PROGRESS']).as('open'),
        ])
        .where('tenant_id', '=', user.tenant_id).where('customer_id', 'in', ids)
        .groupBy('customer_id').execute();
      const ticketMap = new Map(ticketCounts.map(t => [t.customer_id, { total: Number(t.total), open: Number(t.open) }]));

      const invoiceSums = await trx.selectFrom('sales_invoice_lines as sil')
        .innerJoin('sales_invoices as si', 'si.id', 'sil.invoice_id')
        .select(['si.customer_id',
          (eb) => eb.fn.sum<number>(sql`sil.rate * sil.qty * (1 + sil.tax_pct / 100.0)`).as('total'),
        ])
        .where('si.tenant_id', '=', user.tenant_id).where('si.customer_id', 'in', ids).where('si.status', '!=', 'Draft')
        .groupBy('si.customer_id').execute();
      const lifetimeMap = new Map(invoiceSums.map(i => [i.customer_id, Number(i.total) || 0]));

      return customers.map(c => ({
        ...c,
        total_conversations: ticketMap.get(c.id)?.total ?? 0,
        open_tickets: ticketMap.get(c.id)?.open ?? 0,
        lifetime_value: lifetimeMap.get(c.id) ?? 0,
      }));
    });
  });

  // 20. Real channel-configuration status for BlissIntegrations/BlissWhatsApp
  // — no secrets returned, just whether each channel actually has real
  // credentials behind it right now. WhatsApp is a single platform-wide
  // credential (env vars, no per-tenant override anywhere in this codebase),
  // so its status is the same for every tenant — genuinely a SUPER_ADMIN /
  // server-config fact, not a tenant setting. AI is real per-tenant config
  // (tenant_settings['int-ai']).
  fastify.get('/channel-status', async (request) => {
    const user = request.user;
    const aiCfg = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const settings = row?.settings as any ?? {};
      return settings['int-ai'] ?? {};
    });
    return {
      whatsapp: WhatsAppIntegration.isConfigured(),
      ai: !!(aiCfg.on && aiCfg.apiKey),
    };
  });

  // 21. Real WhatsApp channel metrics (BlissWhatsApp) — replaces 4 invented
  // numbers (142 active sessions, 1,890 delivered, 94.2% read rate) with
  // real counts off support_messages. "Active session" mirrors Meta's own
  // 24h customer-service-window rule: a distinct customer who has sent an
  // inbound WhatsApp message in the last 24h. Read rate is computed only
  // over messages migration 404's delivery_status actually knows the fate
  // of (Meta's delivery receipts), not assumed for the rest.
  fastify.get('/whatsapp-metrics', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const since24h = new Date(Date.now() - 24 * 3600 * 1000);
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

      const activeSessions = await trx.selectFrom('support_messages')
        .select((eb) => eb.fn.count<number>('ticket_id').distinct().as('c'))
        .where('tenant_id', '=', user.tenant_id).where('channel', '=', 'WHATSAPP')
        .where('direction', '=', 'INBOUND').where('created_at', '>=', since24h)
        .executeTakeFirst();

      const todayOutbound = await trx.selectFrom('support_messages')
        .select(['delivery_status', (eb) => eb.fn.count<number>('id').as('c')])
        .where('tenant_id', '=', user.tenant_id).where('channel', '=', 'WHATSAPP')
        .where('direction', '=', 'OUTBOUND').where('created_at', '>=', todayStart)
        .groupBy('delivery_status').execute();

      const deliveredToday = todayOutbound.reduce((sum, r) => sum + Number(r.c), 0);
      const knownStatusTotal = todayOutbound.filter(r => r.delivery_status != null).reduce((sum, r) => sum + Number(r.c), 0);
      const readToday = todayOutbound.find(r => r.delivery_status === 'read');
      const readRate = knownStatusTotal > 0 ? Number((((Number(readToday?.c) || 0) / knownStatusTotal) * 100).toFixed(1)) : null;

      return {
        activeSessions: Number(activeSessions?.c) || 0,
        deliveredToday,
        readRate, // null (not 0) when nothing has a known delivery status yet — an honest "no data", not a fake rate
        configured: WhatsAppIntegration.isConfigured(),
      };
    });
  });

  // 22. Unified search across Bliss's three real data surfaces — tickets,
  // this tenant's published knowledge base, and the calling user's own chat
  // channels/DMs. Powers the mobile search bar, which previously only ever
  // reached the ticket list. Chat is scoped to chat_channel_members rows for
  // this user — same membership boundary every other chat read in
  // chat.routes.ts enforces — never a tenant-wide message search.
  fastify.get<{ Querystring: { q?: string } }>('/search', async (request) => {
    const user = request.user;
    const q = (request.query.q || '').trim();
    if (q.length < 2) return { tickets: [], articles: [], chats: [] };
    const like = `%${q}%`;

    return withTenant(user.tenant_id, async (trx) => {
      let ticketsQuery = trx.selectFrom('support_tickets as st')
        .leftJoin('customers as c', 'c.id', 'st.customer_id')
        .select(['st.id', 'st.ref_number as ref', 'st.subject', 'st.status', 'c.name as customer'])
        .where('st.tenant_id', '=', user.tenant_id)
        .where((eb) => eb.or([
          eb('st.subject', 'ilike', like),
          eb('st.ref_number', 'ilike', like),
          eb('c.name', 'ilike', like),
        ]));
      if (user.role === 'CUSTOMER') {
        const cid = await resolveCustomerId(user);
        ticketsQuery = ticketsQuery.where('st.customer_id', '=', cid ?? NIL_UUID);
      }
      const tickets = await ticketsQuery.orderBy('st.updated_at', 'desc').limit(6).execute();

      const articles = await trx.selectFrom('knowledge_base')
        .select(['id', 'title', 'category_id'])
        .where('tenant_id', '=', user.tenant_id)
        .where('status', '=', 'Published')
        .where((eb) => eb.or([
          eb('title', 'ilike', like),
          eb('content', 'ilike', like),
        ]))
        .orderBy('updated_at', 'desc')
        .limit(6)
        .execute();

      let chats: { kind: 'channel' | 'message'; channelId: string; label: string; preview: string | null }[] = [];
      // CUSTOMER logins have no chat_channel_members rows at all (Team Chat
      // is internal-staff-only), so this naturally comes back empty for them.
      const memberships = await trx.selectFrom('chat_channel_members')
        .select('channel_id').where('user_id', '=', user.sub).execute();
      const channelIds = memberships.map((m) => m.channel_id);
      if (channelIds.length > 0) {
        const channels = await trx.selectFrom('chat_channels')
          .select(['id', 'type', 'name'])
          .where('id', 'in', channelIds).where('tenant_id', '=', user.tenant_id).execute();

        const matchingMessages = await trx.selectFrom('chat_messages')
          .select(['id', 'channel_id', 'content'])
          .where('channel_id', 'in', channelIds).where('tenant_id', '=', user.tenant_id)
          .where('content', 'ilike', like)
          .orderBy('created_at', 'desc').limit(6).execute();

        // DM channels carry no real name of their own — resolve the other
        // member so the result reads as a person, the same way GET
        // /v1/chat/channels already does for the channel list itself.
        const dmChannelIds = channels.filter((c) => c.type === 'dm').map((c) => c.id);
        const dmMembers = dmChannelIds.length > 0
          ? await trx.selectFrom('chat_channel_members').select(['channel_id', 'user_id'])
              .where('channel_id', 'in', dmChannelIds).where('user_id', '!=', user.sub).execute()
          : [];
        const dmOtherIds = [...new Set(dmMembers.map((m) => m.user_id))];
        const dmUsers = dmOtherIds.length > 0
          ? await trx.selectFrom('users').select(['id', 'name']).where('id', 'in', dmOtherIds).execute()
          : [];
        const dmUserMap = new Map(dmUsers.map((u) => [u.id, u.name]));
        const dmOtherByChannel = new Map(dmMembers.map((m) => [m.channel_id, m.user_id]));
        const channelMap = new Map(channels.map((c) => [c.id, c]));
        const labelFor = (c: { id: string; type: string; name: string | null }) =>
          c.type === 'dm' ? (dmUserMap.get(dmOtherByChannel.get(c.id) ?? '') ?? 'Direct message') : (c.name || 'Channel');

        const qLower = q.toLowerCase();
        const nameMatches = channels.filter((c) => c.type !== 'dm' && c.name?.toLowerCase().includes(qLower));

        const seen = new Set<string>();
        chats = [
          ...nameMatches.map((c) => ({ kind: 'channel' as const, channelId: c.id, label: labelFor(c), preview: null })),
          ...matchingMessages.map((m) => {
            const c = channelMap.get(m.channel_id);
            return { kind: 'message' as const, channelId: m.channel_id, label: c ? labelFor(c) : 'Chat', preview: m.content.slice(0, 80) };
          }),
        ].filter((item) => {
          if (seen.has(item.channelId)) return false;
          seen.add(item.channelId);
          return true;
        }).slice(0, 6);
      }

      return { tickets, articles, chats };
    });
  });

  // ── WhatsApp HSM templates — real Meta Graph API, not a local invention.
  // Listing returns whatever Meta's own review status is right now
  // (APPROVED/PENDING/REJECTED); creating submits for review and does NOT
  // come back approved — the only way to know is to list again later.
  fastify.get('/whatsapp/templates', async (_request, reply) => {
    const res = await WhatsAppIntegration.listTemplates();
    if (!res.success) { reply.status(502); return { error: res.error, configured: WhatsAppIntegration.isWabaConfigured() }; }
    return { templates: res.templates, configured: true };
  });

  fastify.post<{ Body: { name: string; category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'; language: string; bodyText: string } }>(
    '/whatsapp/templates',
    { preHandler: [requireRole(...MGMT_ROLES)] },
    async (request, reply) => {
      const b = request.body;
      if (!b?.name?.trim() || !b?.bodyText?.trim()) { reply.status(400); return { error: 'Template name and body text are required.' }; }
      // Meta template names: lowercase letters, numbers and underscores only.
      const name = b.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const res = await WhatsAppIntegration.createTemplate({ name, category: b.category || 'UTILITY', language: b.language || 'en_US', bodyText: b.bodyText.trim() });
      if (!res.success) { reply.status(502); return { error: res.error }; }
      reply.status(201);
      return { id: res.id, name, status: 'PENDING' };
    }
  );

  // Real ad-hoc send, not tied to an existing ticket — the one thing
  // dispatchOutbound() (used by tickets/:id/messages and /broadcast) can't
  // do, since it always requires a ticket. Gated to management roles since
  // it's a genuine outbound broadcast capability, same bar as creating a
  // template or an auto-assign rule.
  fastify.post<{ Body: { phone: string; templateName?: string; languageCode?: string; text?: string } }>(
    '/whatsapp/test-send',
    { preHandler: [requireRole(...MGMT_ROLES)] },
    async (request, reply) => {
      const b = request.body;
      if (!b?.phone?.trim()) { reply.status(400); return { error: 'Destination phone number is required.' }; }
      const result = b.templateName
        ? await WhatsAppIntegration.sendTemplateMessage(b.phone.trim(), b.templateName, b.languageCode || 'en_US')
        : await WhatsAppIntegration.sendMessage(b.phone.trim(), b.text?.trim() || 'Hudumika Bliss test message.');
      if (!result.success) { reply.status(502); return { error: result.error }; }
      return result;
    }
  );

}

// Live Chat (customer-facing) was retired in favor of Team Chat
// (chat.routes.ts) — see BlissShell.tsx's own note on the decision. The
// former /chat/sessions* routes and their SupportChat.tsx frontend are gone;
// the live_chat_sessions/live_chat_messages tables are left in place
// un-dropped, since any real historical customer conversation in them
// shouldn't be destroyed by a route cleanup.
