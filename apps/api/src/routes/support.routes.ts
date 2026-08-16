import type { FastifyInstance } from 'fastify';
import type { Transaction } from 'kysely';
import { db, withTenant, type Database } from '../db/client.js';
import { MessagingService } from '../services/messaging.service.js';
import { requireRole } from '../middleware/rbac.js';
import { resolveCustomerId } from '../services/customer-identity.service.js';
import type { MessageChannel, TicketPriority, TicketStatus, UserRole } from '@hudumika/types';

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

// ── Rules engine — notification triggers ────────────────────────
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
      await trx.insertInto('notifications').values({
        tenant_id: tenantId,
        user_id: userId,
        app: 'bliss',
        type: 'support',
        title: extra?.title ?? `Ticket ${ticket.ref_number ?? ''}: ${ticket.subject}`,
        message: extra?.message ?? null,
        link: `/bliss/tickets?id=${ticket.id}`,
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
  }
}

export default async function supportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.user.role !== 'CUSTOMER') return;
    const url = request.routeOptions?.url;
    const allowed = CUSTOMER_ALLOWED_ROUTES.some(r => r.method === request.method && r.url === url);
    if (!allowed) return reply.status(403).send({ error: 'Not available for customer accounts' });
  });

  // 1. List all tickets
  fastify.get<{ Querystring: { customer_id?: string } }>('/tickets', async (request, reply) => {
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
    Body: { customer_id: string; subject: string; description?: string; channel: MessageChannel; priority: TicketPriority; category: string }
  }>('/tickets', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const b = request.body;

      // A CUSTOMER login can only ever open a ticket for themself — whatever
      // customer_id the body carries is ignored, not merely validated,
      // otherwise any customer could open (and later read, via the ticket id)
      // a ticket filed under another customer's name.
      let customerId = b.customer_id;
      if (user.role === 'CUSTOMER') {
        const cid = await resolveCustomerId(user);
        if (!cid) { reply.status(403); return { error: 'Account is not linked to a customer' }; }
        customerId = cid;
      }

      const customer = await trx.selectFrom('customers').select('id')
        .where('id', '=', customerId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!customer) {
        reply.status(404);
        return { error: 'Customer not found' };
      }

      const slaDeadline = new Date(Date.now() + SLA_HOURS[b.priority] * 3600_000);
      let ticket = await trx
        .insertInto('support_tickets')
        .values({
          tenant_id: user.tenant_id,
          customer_id: customerId,
          ref_number: `SUP-${Math.floor(1000 + Math.random() * 9000)}`,
          subject: b.subject,
          description: b.description || null,
          channel: user.role === 'CUSTOMER' ? 'IN_APP' : b.channel,
          priority: b.priority,
          category: b.category,
          status: 'OPEN',
          tags: JSON.stringify([]),
          sla_deadline: slaDeadline,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const assignedTo = await applyAutoAssignRules(trx, user.tenant_id, ticket);
      if (assignedTo) ticket = { ...ticket, assigned_to: assignedTo };

      await fireNotificationTrigger(trx, user.tenant_id, 'new_ticket', ticket);

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

      reply.status(200);
      return { ...ticket, messages, assets, invoices, shipments };
    });
  });

  // 4. BROADCAST — Send to multiple channels simultaneously
  fastify.post<{
    Params: { id: string };
    Body: { content: string; channels: MessageChannel[]; email_subject?: string }
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

      const { content, channels, email_subject } = request.body;
      const results: any[] = [];

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
          );
          results.push({ channel, success: true, message: msg });
        } catch (err: any) {
          results.push({ channel, success: false, error: err.message });
        }
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
    Body: { content: string; channel: MessageChannel }
  }>('/tickets/:id/messages', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const ticket = await trx
        .selectFrom('support_tickets as st')
        .leftJoin('customers as c', 'c.id', 'st.customer_id')
        .select(['st.id', 'st.customer_id', 'c.phone as customer_phone', 'c.email as customer_email'])
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

      reply.status(201);
      return msg;
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
    const content = request.body.content?.trim();
    if (!content) { reply.status(400); return { error: 'Message is required' }; }

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
          link: `/bliss/tickets?id=${ticket.id}`,
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
      if (wasReassigned) await fireNotificationTrigger(trx, user.tenant_id, 'reassigned', updated);
      if (request.body.status !== before?.status) await fireNotificationTrigger(trx, user.tenant_id, 'status_changed', updated);

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

    // Get AI settings
    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings')
        .where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return row?.settings ? JSON.parse(String(row.settings)) : null;
    });

    const apiKey = settings?.ai?.apiKey;
    if (!apiKey) {
      // Return a mock suggestion if no AI key is configured
      return {
        suggestion: `Thank you for reaching out regarding "${context.ticket.subject}". I have reviewed your case and our team is looking into this now. We will have a full update for you within 2 business hours. Please don't hesitate to call us if this is urgent.`,
        sentiment: 'neutral',
        next_action: 'follow_up',
        confidence: 0.85,
      };
    }

    const thread = context.messages.map(m =>
      `[${m.author_type}]: ${m.content}`
    ).join('\n');

    try {
      const prompt = `You are a professional customer support agent for a financial services company in East Africa.

Ticket: "${context.ticket.subject}" (${context.ticket.category}, ${context.ticket.priority} priority)
Customer: ${context.ticket.customer}

Conversation:
${thread || '(no messages yet)'}

Write a professional, empathetic reply to this customer. Be concise (2–4 sentences). Do not use placeholder text. Respond in English.`;

      const model = settings?.ai?.model || 'claude-haiku-4-5-20251001';
      const provider = settings?.ai?.provider || 'anthropic';

      const res = await fetch(
        provider === 'anthropic' ? 'https://api.anthropic.com/v1/messages' : 'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: provider === 'anthropic'
            ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
            : { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(
            provider === 'anthropic'
              ? { model, max_tokens: 300, temperature: 0.4, messages: [{ role: 'user', content: prompt }] }
              : { model, max_tokens: 300, temperature: 0.4, messages: [{ role: 'user', content: prompt }] }
          ),
        }
      );

      const data: any = await res.json();
      const suggestion = provider === 'anthropic'
        ? data.content?.[0]?.text
        : data.choices?.[0]?.message?.content;

      return {
        suggestion: suggestion || 'Unable to generate suggestion.',
        sentiment: 'neutral',
        next_action: 'reply',
        confidence: 0.9,
      };
    } catch {
      return {
        suggestion: `Thank you for reaching out regarding "${context.ticket.subject}". We have received your message and our team is reviewing it now. We will get back to you shortly.`,
        sentiment: 'neutral',
        next_action: 'follow_up',
        confidence: 0.7,
      };
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
    Body: { type: 'auto_assign' | 'sla_escalation' | 'status_automation' | 'notification_trigger'; name: string; enabled?: boolean; config: any }
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

  // ── Live Chat ─────────────────────────────────────────────────────

  fastify.get('/chat/sessions', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('live_chat_sessions').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('updated_at', 'desc').execute()
    );
  });

  fastify.get<{ Params: { id: string } }>('/chat/sessions/:id/messages', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('live_chat_messages').selectAll()
        .where('session_id', '=', request.params.id)
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'asc')
        .execute()
    );
  });

  fastify.post<{ Params: { id: string }; Body: { content: string } }>('/chat/sessions/:id/messages', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const session = await trx.selectFrom('live_chat_sessions').select('id')
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!session) {
        reply.status(404);
        return { error: 'Session not found' };
      }

      const message = await trx.insertInto('live_chat_messages')
        .values({
          tenant_id: user.tenant_id,
          session_id: request.params.id,
          sender_type: 'agent',
          sender_id: user.sub,
          content: request.body.content,
        })
        .returningAll().executeTakeFirstOrThrow();

      await trx.updateTable('live_chat_sessions')
        .set({ status: 'active', updated_at: new Date() })
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute();

      reply.status(201);
      return message;
    });
  });

  fastify.patch<{ Params: { id: string }; Body: { status?: string; assigned_to?: string | null } }>(
    '/chat/sessions/:id',
    async (request, reply) => {
      const user = request.user;
      return withTenant(user.tenant_id, async (trx) => {
        const updates: Record<string, unknown> = { updated_at: new Date() };
        if (request.body.status !== undefined) updates.status = request.body.status;
        if (request.body.assigned_to !== undefined) updates.assigned_to = request.body.assigned_to;

        const session = await trx.updateTable('live_chat_sessions').set(updates)
          .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirstOrThrow();
        return session;
      });
    }
  );
}
