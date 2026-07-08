import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { MessagingService } from '../services/messaging.service.js';
import type { MessageChannel, TicketPriority, TicketStatus } from '@hudumika/types';

export default async function supportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // 1. List all tickets
  fastify.get('/tickets', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const tickets = await trx
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
        .orderBy('st.created_at', 'desc')
        .execute();

      const counts = await trx
        .selectFrom('support_messages')
        .select(['ticket_id', trx.fn.count('id').as('cnt')])
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
      const ticket = await trx
        .insertInto('support_tickets')
        .values({
          tenant_id: user.tenant_id,
          customer_id: b.customer_id,
          ref_number: `SUP-${Math.floor(1000 + Math.random() * 9000)}`,
          subject: b.subject,
          description: b.description || null,
          channel: b.channel,
          priority: b.priority,
          category: b.category,
          status: 'OPEN',
          tags: JSON.stringify([]),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

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
        .executeTakeFirst();

      if (!ticket) {
        reply.status(404);
        return { error: 'Ticket not found' };
      }

      const [messages, assets, invoices, shipments] = await Promise.all([
        trx.selectFrom('support_messages').selectAll()
          .where('ticket_id', '=', ticket.id)
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

  // 6. Update ticket status
  fastify.patch<{
    Params: { id: string };
    Body: { status: TicketStatus; assigned_to?: string }
  }>('/tickets/:id/status', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx
        .updateTable('support_tickets')
        .set({
          status: request.body.status,
          ...(request.body.assigned_to ? { assigned_to: request.body.assigned_to } : {}),
          updated_at: new Date(),
        })
        .where('id', '=', request.params.id)
        .returningAll()
        .executeTakeFirstOrThrow();

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
        .executeTakeFirst();

      const messages = await trx
        .selectFrom('support_messages')
        .select(['content', 'author_type', 'channel', 'created_at'])
        .where('ticket_id', '=', request.params.id)
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
        .orderBy('created_at', 'asc')
        .execute();

      const counts = await trx
        .selectFrom('support_tickets')
        .select(['group_id', trx.fn.count('id').as('cnt')])
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
      await trx.deleteFrom('support_groups').where('id', '=', request.params.id).execute();
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
      await trx.deleteFrom('support_views').where('id', '=', request.params.id).execute();
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
        .where('id', '=', request.params.id).executeTakeFirst();
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
        .returningAll()
        .executeTakeFirstOrThrow();

      reply.status(200);
      return updated;
    });
  });
}
