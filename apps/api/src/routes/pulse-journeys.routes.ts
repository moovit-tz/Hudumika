import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { PULSE_ROLES, PULSE_PUBLISH_ROLES } from './pulse.routes.js';
import { PulseJourneys, JOURNEY_EVENTS, journeyProblems, enroll, type Step } from '../services/pulse-journeys.service.js';

const parse = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);

const journeyBody = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).nullish(),
  source: z.enum(['contacts', 'leads', 'customers']),
  trigger: z.record(z.string(), z.unknown()),
  steps: z.array(z.record(z.string(), z.unknown())).max(50),
  goal: z.object({ event_type: z.string() }).nullish(),
  reentry: z.enum(['never', 'after_exit']).default('never'),
  quiet_hours: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }).nullish(),
});

const email = (subject: string, body: string) => ({ subject, body_html: `<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2937"><p>Hi {{first_name}},</p>${body}<p>— {{company}}</p></div>` });

/** Starting points. Every one is an ordinary draft afterwards — nothing here sends until published. */
const TEMPLATES: Record<string, { name: string; description: string; source: 'contacts' | 'leads' | 'customers'; trigger: any; goal?: any; steps: Step[] }> = {
  welcome: {
    name: 'Welcome series', description: 'Three emails over a week for people who just joined an audience.', source: 'contacts',
    trigger: { type: 'segment', segment_id: '', include_existing: false },
    steps: [
      { id: 'welcome', type: 'email', label: 'Welcome', ...email('Welcome, {{first_name}}', '<p>Thanks for getting in touch. Here is what we do and how we can help.</p>') },
      { id: 'wait1', type: 'wait', days: 3, hours: 0 },
      { id: 'tips', type: 'email', label: 'How it works', ...email('How we work', '<p>A short guide to getting the most out of working with us.</p>') },
      { id: 'wait2', type: 'wait', days: 4, hours: 0 },
      { id: 'offer', type: 'email', label: 'First offer', ...email('Ready when you are', '<p>When you are ready, reply to this email and we will take it from there.</p>') },
    ],
  },
  nurture: {
    name: 'New lead nurture', description: 'Follow up a new lead, and hand them to their owner if they click.', source: 'leads',
    trigger: { type: 'event', event_type: 'lead.created' }, goal: { event_type: 'deal.won' },
    steps: [
      { id: 'intro', type: 'email', label: 'Introduction', ...email('Thanks for your interest', '<p>Here is a little more about how we can help. <a href="https://example.com">See our services</a></p>') },
      { id: 'wait1', type: 'wait', days: 2, hours: 0 },
      { id: 'check', type: 'branch', label: 'Clicked?', condition: { kind: 'clicked', step_id: 'intro' }, yes: 'task', no: 'reminder' },
      { id: 'reminder', type: 'email', label: 'Reminder', ...email('Any questions?', '<p>Happy to answer anything — just reply.</p>') },
      { id: 'wait2', type: 'wait', days: 3, hours: 0 },
      { id: 'task', type: 'task', label: 'Call the lead', title: 'Call this lead — they engaged with our emails', due_days: 1, assign: 'owner' },
    ],
  },
  reengage: {
    name: 'Re-engagement', description: 'Win back contacts who stopped opening, then stop mailing those who stay quiet.', source: 'contacts',
    trigger: { type: 'segment', segment_id: '', include_existing: true },
    steps: [
      { id: 'miss', type: 'email', label: 'We miss you', ...email('Still interested?', '<p>We haven’t heard from you in a while. <a href="https://example.com">Here is what is new</a>.</p>') },
      { id: 'wait1', type: 'wait', days: 7, hours: 0 },
      { id: 'opened', type: 'branch', label: 'Opened?', condition: { kind: 'opened', step_id: 'miss' }, yes: 'exit', no: 'last' },
      { id: 'last', type: 'email', label: 'Last call', ...email('Should we stop writing?', '<p>If you’d rather not hear from us, use the unsubscribe link below — no hard feelings.</p>') },
    ],
  },
  postpurchase: {
    name: 'After payment', description: 'Thank a customer when they pay, then ask how it went.', source: 'customers',
    trigger: { type: 'event', event_type: 'invoice.payment_recorded' },
    steps: [
      { id: 'thanks', type: 'email', label: 'Thank you', ...email('Thank you for your payment', '<p>We have received your payment. Thank you for your business.</p>') },
      { id: 'wait1', type: 'wait', days: 7, hours: 0 },
      { id: 'feedback', type: 'email', label: 'Feedback', ...email('How did we do?', '<p>We would love to hear how it went. Just reply with a line or two.</p>') },
    ],
  },
  birthday: {
    name: 'Birthday greeting', description: 'An SMS on each contact’s birthday.', source: 'contacts',
    trigger: { type: 'date', date_field: 'birthday', offset_days: 0 },
    steps: [{ id: 'greet', type: 'sms', label: 'Greeting', body_text: 'Happy birthday {{first_name}}! Best wishes from all of us at {{company}}.' }],
  },
};

export async function pulseJourneyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('pulse'));
  fastify.addHook('preHandler', requireRole(...PULSE_ROLES));

  fastify.get('/journeys/meta', async () => ({
    data: {
      events: Object.entries(JOURNEY_EVENTS).map(([type, v]) => ({ type, ...v })),
      templates: Object.entries(TEMPLATES).map(([key, t]) => ({ key, name: t.name, description: t.description, source: t.source, trigger: t.trigger.type })),
    },
  }));

  fastify.get('/journeys', async (request) => {
    const { tenant_id } = request.user;
    return withTenant(tenant_id, async (trx) => {
      const rows = await trx.selectFrom('pulse_journeys as j').leftJoin('users as u', 'u.id', 'j.created_by')
        .select(['j.id', 'j.name', 'j.description', 'j.status', 'j.source', 'j.trigger', 'j.steps', 'j.published_at', 'j.updated_at',
          'j.created_by', 'u.name as created_by_name', 'u.avatar_url as created_by_avatar',
          sql<string>`(SELECT count(*) FROM pulse_journey_enrollments e WHERE e.journey_id = j.id AND e.status = 'active')`.as('active'),
          sql<string>`(SELECT count(*) FROM pulse_journey_enrollments e WHERE e.journey_id = j.id AND e.status IN ('completed', 'exited'))`.as('finished')])
        .where('j.tenant_id', '=', tenant_id).where('j.status', '<>', 'archived').orderBy('j.updated_at', 'desc').execute();
      return { data: rows.map((r) => ({ ...r, steps: undefined, step_count: (parse(r.steps) ?? []).length, active: Number(r.active), finished: Number(r.finished) })) };
    });
  });

  fastify.get('/journeys/:id', async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    return withTenant(tenant_id, async (trx) => {
      const j = await trx.selectFrom('pulse_journeys').selectAll().where('tenant_id', '=', tenant_id).where('id', '=', id).executeTakeFirst();
      if (!j) return reply.status(404).send({ error: 'Journey not found' });
      const [counts, runs, messages] = await Promise.all([
        trx.selectFrom('pulse_journey_enrollments').select(['status', sql<string>`count(*)`.as('n')])
          .where('tenant_id', '=', tenant_id).where('journey_id', '=', id).groupBy('status').execute(),
        trx.selectFrom('pulse_journey_step_runs').select(['step_id', 'status', sql<string>`count(*)`.as('n')])
          .where('tenant_id', '=', tenant_id).where('journey_id', '=', id).groupBy(['step_id', 'status']).execute(),
        trx.selectFrom('pulse_campaigns as c').select(['c.id', 'c.journey_step_id',
          sql<string>`(SELECT count(*) FROM pulse_sends s WHERE s.campaign_id = c.id AND s.status = 'sent')`.as('sent'),
          sql<string>`(SELECT count(*) FROM pulse_sends s WHERE s.campaign_id = c.id AND s.opened_at IS NOT NULL)`.as('opened'),
          sql<string>`(SELECT count(*) FROM pulse_sends s WHERE s.campaign_id = c.id AND s.clicked_at IS NOT NULL)`.as('clicked')])
          .where('c.tenant_id', '=', tenant_id).where('c.journey_id', '=', id).execute(),
      ]);
      const waiting = await trx.selectFrom('pulse_journey_enrollments').select(['step_index', sql<string>`count(*)`.as('n')])
        .where('tenant_id', '=', tenant_id).where('journey_id', '=', id).where('status', '=', 'active').groupBy('step_index').execute();
      const steps = parse(j.steps) as Step[];
      return {
        data: {
          ...j, trigger: parse(j.trigger), steps, goal: parse(j.goal), quiet_hours: parse(j.quiet_hours),
          problems: journeyProblems({ source: j.source, trigger: parse(j.trigger), steps, goal: parse(j.goal) }),
          counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
          step_stats: steps.map((s, i) => ({
            id: s.id,
            done: Number(runs.find((r) => r.step_id === s.id && r.status === 'done')?.n ?? 0),
            skipped: Number(runs.find((r) => r.step_id === s.id && r.status === 'skipped')?.n ?? 0),
            failed: Number(runs.find((r) => r.step_id === s.id && r.status === 'failed')?.n ?? 0),
            // People parked on a wait show against the step after it.
            waiting: Number(waiting.find((w) => w.step_index === i)?.n ?? 0),
            message: (() => { const m = messages.find((x) => x.journey_step_id === s.id); return m ? { campaign_id: m.id, sent: Number(m.sent), opened: Number(m.opened), clicked: Number(m.clicked) } : null; })(),
          })),
        },
      };
    });
  });

  fastify.post('/journeys', async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const body = request.body as any;
    let input: z.infer<typeof journeyBody>;
    if (body?.template) {
      const t = TEMPLATES[body.template];
      if (!t) return reply.status(400).send({ error: 'Unknown template' });
      input = { name: t.name, description: t.description, source: t.source, trigger: t.trigger, steps: t.steps as any, goal: t.goal ?? null, reentry: 'never', quiet_hours: { start: '21:00', end: '08:00' } };
    } else {
      const parsed = journeyBody.safeParse(body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid journey' });
      input = parsed.data;
    }
    return withTenant(tenant_id, async (trx) => {
      const row = await trx.insertInto('pulse_journeys').values({
        tenant_id, name: input.name, description: input.description ?? null, source: input.source,
        trigger: JSON.stringify(input.trigger), steps: JSON.stringify(input.steps), goal: input.goal ? JSON.stringify(input.goal) : null,
        reentry: input.reentry, quiet_hours: input.quiet_hours ? JSON.stringify(input.quiet_hours) : null, created_by: sub, updated_by: sub,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send({ data: row });
    });
  });

  fastify.patch('/journeys/:id', async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { id } = request.params as { id: string };
    const parsed = journeyBody.partial().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid journey' });
    const d = parsed.data;
    return withTenant(tenant_id, async (trx) => {
      const j = await trx.selectFrom('pulse_journeys').select(['status', 'source', 'published_at']).where('tenant_id', '=', tenant_id).where('id', '=', id).executeTakeFirst();
      if (!j) return reply.status(404).send({ error: 'Journey not found' });
      if (j.status === 'active') return reply.status(409).send({ error: 'Pause the journey before editing it. People keep their place while it is paused.' });
      if (j.published_at && d.source && d.source !== j.source) return reply.status(400).send({ error: 'A journey that has run can’t change who it is for. Duplicate it instead.' });
      if (d.steps) {
        // Steps people have already been through can't be removed: their
        // place in the journey points at them.
        const kept = new Set(d.steps.map((s: any) => s.id));
        const used = await trx.selectFrom('pulse_journey_step_runs').select('step_id').distinct().where('tenant_id', '=', tenant_id).where('journey_id', '=', id).execute();
        const gone = used.filter((u) => !kept.has(u.step_id));
        if (gone.length) return reply.status(400).send({ error: 'Some steps have already run for people and can’t be deleted. Change them instead, or archive this journey and start a new one.' });
      }
      const set: Record<string, unknown> = { updated_by: sub, updated_at: new Date() };
      if (d.name !== undefined) set.name = d.name;
      if (d.description !== undefined) set.description = d.description ?? null;
      if (d.source !== undefined) set.source = d.source;
      if (d.trigger !== undefined) set.trigger = JSON.stringify(d.trigger);
      if (d.steps !== undefined) set.steps = JSON.stringify(d.steps);
      if (d.goal !== undefined) set.goal = d.goal ? JSON.stringify(d.goal) : null;
      if (d.reentry !== undefined) set.reentry = d.reentry;
      if (d.quiet_hours !== undefined) set.quiet_hours = d.quiet_hours ? JSON.stringify(d.quiet_hours) : null;
      const row = await trx.updateTable('pulse_journeys').set(set).where('tenant_id', '=', tenant_id).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      return { data: row };
    });
  });

  fastify.post('/journeys/:id/publish', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { id } = request.params as { id: string };
    try { return { data: await PulseJourneys.publish(tenant_id, id, sub) }; }
    catch (e: any) { return reply.status(e.statusCode ?? 500).send({ error: e.message }); }
  });

  fastify.post('/journeys/:id/pause', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { id } = request.params as { id: string };
    return withTenant(tenant_id, async (trx) => {
      const row = await trx.updateTable('pulse_journeys').set({ status: 'paused', updated_by: sub, updated_at: new Date() })
        .where('tenant_id', '=', tenant_id).where('id', '=', id).where('status', '=', 'active').returningAll().executeTakeFirst();
      if (!row) return reply.status(409).send({ error: 'Only a running journey can be paused' });
      return { data: row };
    });
  });

  fastify.post('/journeys/:id/archive', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { id } = request.params as { id: string };
    return withTenant(tenant_id, async (trx) => {
      const row = await trx.updateTable('pulse_journeys').set({ status: 'archived', updated_by: sub, updated_at: new Date() })
        .where('tenant_id', '=', tenant_id).where('id', '=', id).where('status', '<>', 'archived').returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Journey not found' });
      await trx.updateTable('pulse_journey_enrollments').set({ status: 'exited', exit_reason: 'Journey archived', finished_at: new Date() })
        .where('tenant_id', '=', tenant_id).where('journey_id', '=', id).where('status', '=', 'active').execute();
      await trx.updateTable('pulse_campaigns').set({ status: 'sent', sent_at: new Date() }).where('tenant_id', '=', tenant_id).where('journey_id', '=', id).execute();
      return { data: row };
    });
  });

  const enrollBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });
  fastify.post('/journeys/:id/enroll', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    const parsed = enrollBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Choose who to add' });
    return withTenant(tenant_id, async (trx) => {
      const j = await trx.selectFrom('pulse_journeys').selectAll().where('tenant_id', '=', tenant_id).where('id', '=', id).executeTakeFirst();
      if (!j) return reply.status(404).send({ error: 'Journey not found' });
      if (j.status !== 'active') return reply.status(409).send({ error: 'Start the journey before adding people' });
      let added = 0;
      for (const pid of parsed.data.ids) if (await enroll(trx, tenant_id, j, pid)) added++;
      return { data: { added, skipped: parsed.data.ids.length - added } };
    });
  });

  fastify.get('/journeys/:id/people', async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    const q = request.query as { status?: string; limit?: string; offset?: string };
    return withTenant(tenant_id, async (trx) => {
      const j = await trx.selectFrom('pulse_journeys').select('id').where('tenant_id', '=', tenant_id).where('id', '=', id).executeTakeFirst();
      if (!j) return reply.status(404).send({ error: 'Journey not found' });
      let query = trx.selectFrom('pulse_journey_enrollments').where('tenant_id', '=', tenant_id).where('journey_id', '=', id).where('status', '<>', 'excluded');
      if (q.status && ['active', 'completed', 'exited', 'failed'].includes(q.status)) query = query.where('status', '=', q.status as any);
      const data = await query.select(['id', 'source', 'source_id', 'name', 'email', 'phone', 'status', 'step_index', 'next_run_at', 'exit_reason', 'entered_at', 'finished_at'])
        .orderBy('entered_at', 'desc').limit(Math.min(Number(q.limit) || 100, 200)).offset(Math.max(Number(q.offset) || 0, 0)).execute();
      return { data };
    });
  });

  // Validate a single step or trigger while the builder is open.
  fastify.post('/journeys/validate', async (request) => {
    const b = request.body as any;
    return { data: { problems: journeyProblems({ source: b?.source, trigger: b?.trigger, steps: b?.steps ?? [], goal: b?.goal }) } };
  });
}
