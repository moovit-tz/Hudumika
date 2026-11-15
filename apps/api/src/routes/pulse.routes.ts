import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { PulseSegments, PulseConsent, validateSegment, consentKey, type SegmentDef } from '../services/pulse-segments.service.js';
import { toCsv } from '../lib/csv.js';

/** Who can open Pulse at all: build segments, draft campaigns, read reports. */
export const PULSE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES'] as const;
/** Who can send to customers or change someone's marketing consent by hand. */
export const PULSE_PUBLISH_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

const ruleSchema = z.object({ field: z.string().max(64), op: z.string().max(40), value: z.unknown().optional() });
const segmentBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullish(),
  source: z.enum(['contacts', 'leads', 'customers']),
  match_type: z.enum(['all', 'any']).default('all'),
  rules: z.array(ruleSchema).min(1).max(25),
});

/** Spreadsheet apps run a cell that starts with = + - @ as a formula. */
const safeCell = (v: unknown) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

function defOf(row: { source: any; match_type: any; rules: any }): SegmentDef {
  const rules = typeof row.rules === 'string' ? JSON.parse(row.rules) : row.rules;
  return { source: row.source, match_type: row.match_type, rules: Array.isArray(rules) ? rules : [] };
}

export async function pulseRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('pulse'));
  fastify.addHook('preHandler', requireRole(...PULSE_ROLES));

  // ── Overview ──────────────────────────────────────────────────────────────

  fastify.get('/overview', async (request) => {
    const { tenant_id } = request.user;
    const q = request.query as { days?: string };
    const days = [7, 30, 90, 365].includes(Number(q.days)) ? Number(q.days) : 30;
    const since = new Date(Date.now() - days * 86400_000);
    const prevSince = new Date(Date.now() - 2 * days * 86400_000);
    return withTenant(tenant_id, async (trx) => {
      const window = (from: Date, to: Date) => trx.selectFrom('pulse_sends as s')
        .innerJoin('pulse_campaigns as c', 'c.id', 's.campaign_id')
        .select([
          sql<string>`count(*) FILTER (WHERE s.status = 'sent')`.as('sent'),
          sql<string>`count(*) FILTER (WHERE s.status = 'sent' AND c.channel = 'email')`.as('email_sent'),
          sql<string>`count(*) FILTER (WHERE s.opened_at IS NOT NULL AND c.channel = 'email')`.as('opened'),
          sql<string>`count(*) FILTER (WHERE s.clicked_at IS NOT NULL)`.as('clicked'),
          sql<string>`count(*) FILTER (WHERE s.unsubscribed_at IS NOT NULL)`.as('unsubscribed'),
          sql<string>`count(*) FILTER (WHERE s.bounced_at IS NOT NULL)`.as('bounced'),
        ])
        .where('s.tenant_id', '=', tenant_id).where('s.sent_at', '>=', from).where('s.sent_at', '<', to)
        .executeTakeFirst();
      const [cur, prev, counts, recent, daily] = await Promise.all([
        window(since, new Date()),
        window(prevSince, since),
        trx.selectFrom('pulse_campaigns').select([
          sql<string>`count(*) FILTER (WHERE status IN ('scheduled', 'sending'))`.as('active'),
          sql<string>`count(*) FILTER (WHERE status = 'draft')`.as('drafts'),
          sql<string>`count(*) FILTER (WHERE status = 'sent' AND sent_at >= ${since})`.as('sent_campaigns'),
        ]).where('tenant_id', '=', tenant_id).where('journey_id', 'is', null).executeTakeFirst(),
        trx.selectFrom('pulse_campaigns').select(['id', 'name', 'channel', 'status', 'sent_at', 'scheduled_at', 'started_at',
          sql<string>`(SELECT count(*) FROM pulse_sends s WHERE s.campaign_id = pulse_campaigns.id AND s.status = 'sent')`.as('sent'),
          sql<string>`(SELECT count(*) FROM pulse_sends s WHERE s.campaign_id = pulse_campaigns.id AND s.opened_at IS NOT NULL)`.as('opened'),
          sql<string>`(SELECT count(*) FROM pulse_sends s WHERE s.campaign_id = pulse_campaigns.id AND s.clicked_at IS NOT NULL)`.as('clicked'),
        ]).where('tenant_id', '=', tenant_id).where('journey_id', 'is', null).where('status', '<>', 'draft')
          .orderBy(sql`coalesce(sent_at, started_at, scheduled_at, created_at)`, 'desc').limit(6).execute(),
        trx.selectFrom('pulse_sends').select([sql<string>`date_trunc('day', sent_at)`.as('day'), sql<string>`count(*)`.as('n')])
          .where('tenant_id', '=', tenant_id).where('status', '=', 'sent').where('sent_at', '>=', since)
          .groupBy(sql`date_trunc('day', sent_at)`).orderBy(sql`date_trunc('day', sent_at)`).execute(),
      ]);
      const [results, channels, journeys, growth, risky, simulated] = await Promise.all([
        // Credited to marketing: the conversion has a touch (last-touch model).
        trx.selectFrom('pulse_conversions').select([
          sql<string>`count(*) FILTER (WHERE kind = 'lead' AND last_touch_id IS NOT NULL)`.as('leads'),
          sql<string>`count(*) FILTER (WHERE kind = 'deal_won' AND last_touch_id IS NOT NULL)`.as('deals'),
          sql<string>`coalesce(sum(value) FILTER (WHERE kind = 'deal_won' AND last_touch_id IS NOT NULL), 0)`.as('deal_value'),
          sql<string>`coalesce(sum(value) FILTER (WHERE kind = 'payment' AND last_touch_id IS NOT NULL), 0)`.as('paid'),
          sql<string>`count(*) FILTER (WHERE kind = 'lead')`.as('all_leads'),
        ]).where('tenant_id', '=', tenant_id).where('occurred_at', '>=', since).executeTakeFirst(),
        trx.selectFrom('pulse_sends as s').innerJoin('pulse_campaigns as c', 'c.id', 's.campaign_id').select(['c.channel',
          sql<string>`count(*) FILTER (WHERE s.status = 'sent')`.as('sent'),
          sql<string>`count(*) FILTER (WHERE s.opened_at IS NOT NULL)`.as('opened'),
          sql<string>`count(*) FILTER (WHERE s.clicked_at IS NOT NULL)`.as('clicked'),
          sql<string>`count(*) FILTER (WHERE s.unsubscribed_at IS NOT NULL)`.as('unsubscribed')])
          .where('s.tenant_id', '=', tenant_id).where('s.sent_at', '>=', since).groupBy('c.channel').execute(),
        trx.selectFrom('pulse_journeys as j').select(['j.id', 'j.name', 'j.status',
          sql<string>`(SELECT count(*) FROM pulse_journey_enrollments e WHERE e.journey_id = j.id AND e.status = 'active')`.as('active'),
          sql<string>`(SELECT count(*) FROM pulse_journey_enrollments e WHERE e.journey_id = j.id AND e.status IN ('completed', 'exited') AND e.finished_at >= ${since})`.as('finished')])
          .where('j.tenant_id', '=', tenant_id).where('j.status', 'in', ['active', 'paused']).orderBy('j.updated_at', 'desc').limit(6).execute(),
        trx.selectFrom('pulse_consents').select([
          sql<string>`count(*) FILTER (WHERE status = 'subscribed')`.as('opted_in'),
          sql<string>`count(*) FILTER (WHERE status = 'unsubscribed')`.as('opted_out'),
          sql<string>`count(*) FILTER (WHERE status IN ('bounced', 'complained'))`.as('bounced')])
          .where('tenant_id', '=', tenant_id).where('updated_at', '>=', since).executeTakeFirst(),
        // Campaigns whose unsubscribe or bounce rate is high enough to hurt the sender's reputation.
        trx.selectFrom('pulse_campaigns as c').innerJoin('pulse_sends as s', 's.campaign_id', 'c.id').select(['c.id', 'c.name',
          sql<string>`count(*) FILTER (WHERE s.status = 'sent' OR s.bounced_at IS NOT NULL)`.as('sent'),
          sql<string>`count(*) FILTER (WHERE s.unsubscribed_at IS NOT NULL)`.as('unsubscribed'),
          sql<string>`count(*) FILTER (WHERE s.bounced_at IS NOT NULL)`.as('bounced')])
          .where('c.tenant_id', '=', tenant_id).where('c.channel', '=', 'email').where('s.sent_at', '>=', since)
          .groupBy(['c.id', 'c.name']).execute(),
        trx.selectFrom('pulse_sends as s').innerJoin('email_outbox as o', 'o.id', 's.outbox_id').select(sql<string>`count(*)`.as('n'))
          .where('s.tenant_id', '=', tenant_id).where('o.status', '=', 'simulated').where('s.sent_at', '>=', since).executeTakeFirst(),
      ]);
      const warnings: { level: 'warn' | 'info'; text: string; link?: string }[] = [];
      if (Number(simulated?.n ?? 0) > 0) warnings.push({ level: 'warn', text: `${Number(simulated!.n)} emails were only simulated because no email server is set up. Add one in Admin ▸ Settings ▸ Email.` });
      for (const r of risky) {
        const sent = Number(r.sent), un = Number(r.unsubscribed), bo = Number(r.bounced);
        if (sent >= 50 && un / sent > 0.01) warnings.push({ level: 'warn', text: `“${r.name}”: ${Math.round((un / sent) * 1000) / 10}% unsubscribed. Above 1% usually means the audience or message missed — consider a narrower audience.`, link: `/pulse/campaigns/${r.id}` });
        if (sent >= 20 && bo / sent > 0.03) warnings.push({ level: 'warn', text: `“${r.name}”: ${Math.round((bo / sent) * 1000) / 10}% bounced. Bounced addresses are now suppressed; clean old lists before importing them.`, link: `/pulse/campaigns/${r.id}` });
      }
      const num = (o: any) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, Number(v ?? 0)]));
      const extra = {
        results: num(results), growth: num(growth), warnings,
        channels: channels.map((c) => ({ channel: c.channel, sent: Number(c.sent), opened: Number(c.opened), clicked: Number(c.clicked), unsubscribed: Number(c.unsubscribed) })),
        journeys: journeys.map((j) => ({ ...j, active: Number(j.active), finished: Number(j.finished) })),
      };
      return {
        data: {
          days, current: num(cur), previous: num(prev), counts: num(counts), ...extra,
          recent: recent.map((r) => ({ ...r, sent: Number(r.sent), opened: Number(r.opened), clicked: Number(r.clicked) })),
          daily: daily.map((d) => ({ day: d.day, n: Number(d.n) })),
        },
      };
    });
  });

  // ── Segments ──────────────────────────────────────────────────────────────

  fastify.get('/segments/catalog', async () => ({ data: PulseSegments.catalog() }));

  fastify.get('/segments', async (request) => {
    const { tenant_id } = request.user;
    return withTenant(tenant_id, async (trx) => {
      const rows = await trx.selectFrom('pulse_segments').selectAll()
        .where('tenant_id', '=', tenant_id).orderBy('name').execute();
      const data = [];
      for (const r of rows) {
        let stats = null;
        try { stats = await PulseSegments.stats(trx, tenant_id, defOf(r)); } catch { /* a stale rule shows as unknown, not an error page */ }
        data.push({ ...r, stats });
      }
      return { data };
    });
  });

  fastify.get('/segments/:id', async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    return withTenant(tenant_id, async (trx) => {
      const row = await trx.selectFrom('pulse_segments').selectAll()
        .where('tenant_id', '=', tenant_id).where('id', '=', id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Segment not found' });
      return { data: { ...row, stats: await PulseSegments.stats(trx, tenant_id, defOf(row)) } };
    });
  });

  // Count and sample an unsaved definition while the builder is open.
  fastify.post('/segments/preview', async (request, reply) => {
    const { tenant_id } = request.user;
    const parsed = segmentBody.pick({ source: true, match_type: true, rules: true }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid segment' });
    try { validateSegment(parsed.data); } catch (e: any) { return reply.status(400).send({ error: e.message }); }
    return withTenant(tenant_id, async (trx) => ({
      data: {
        stats: await PulseSegments.stats(trx, tenant_id, parsed.data),
        sample: await PulseSegments.members(trx, tenant_id, parsed.data, { limit: 12 }),
      },
    }));
  });

  fastify.post('/segments', async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const parsed = segmentBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid segment' });
    try { validateSegment(parsed.data); } catch (e: any) { return reply.status(400).send({ error: e.message }); }
    return withTenant(tenant_id, async (trx) => {
      const dup = await trx.selectFrom('pulse_segments').select('id')
        .where('tenant_id', '=', tenant_id).where('name', '=', parsed.data.name).executeTakeFirst();
      if (dup) return reply.status(409).send({ error: 'A segment with this name already exists' });
      const row = await trx.insertInto('pulse_segments').values({
        tenant_id, name: parsed.data.name, description: parsed.data.description ?? null,
        source: parsed.data.source, match_type: parsed.data.match_type,
        rules: JSON.stringify(parsed.data.rules), created_by: sub,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send({ data: row });
    });
  });

  fastify.patch('/segments/:id', async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    const parsed = segmentBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid segment' });
    try { validateSegment(parsed.data); } catch (e: any) { return reply.status(400).send({ error: e.message }); }
    return withTenant(tenant_id, async (trx) => {
      const dup = await trx.selectFrom('pulse_segments').select('id').where('tenant_id', '=', tenant_id)
        .where('name', '=', parsed.data.name).where('id', '<>', id).executeTakeFirst();
      if (dup) return reply.status(409).send({ error: 'A segment with this name already exists' });
      const row = await trx.updateTable('pulse_segments').set({
        name: parsed.data.name, description: parsed.data.description ?? null, source: parsed.data.source,
        match_type: parsed.data.match_type, rules: JSON.stringify(parsed.data.rules), updated_at: new Date(),
      }).where('tenant_id', '=', tenant_id).where('id', '=', id).returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Segment not found' });
      return { data: row };
    });
  });

  fastify.delete('/segments/:id', async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    return withTenant(tenant_id, async (trx) => {
      const busy = await trx.selectFrom('pulse_campaigns').select('name').where('tenant_id', '=', tenant_id)
        .where('segment_id', '=', id).where('status', 'in', ['scheduled', 'sending']).executeTakeFirst();
      if (busy) return reply.status(409).send({ error: `Campaign "${busy.name}" is scheduled to this segment. Cancel or retarget it first.` });
      const res = await trx.deleteFrom('pulse_segments').where('tenant_id', '=', tenant_id).where('id', '=', id).executeTakeFirst();
      if (!res.numDeletedRows) return reply.status(404).send({ error: 'Segment not found' });
      return { success: true };
    });
  });

  fastify.get('/segments/:id/members', async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    const q = request.query as { q?: string; limit?: string; offset?: string };
    return withTenant(tenant_id, async (trx) => {
      const seg = await trx.selectFrom('pulse_segments').selectAll()
        .where('tenant_id', '=', tenant_id).where('id', '=', id).executeTakeFirst();
      if (!seg) return reply.status(404).send({ error: 'Segment not found' });
      const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
      const offset = Math.max(Number(q.offset) || 0, 0);
      const data = await PulseSegments.members(trx, tenant_id, defOf(seg), { limit, offset, q: q.q?.trim().slice(0, 100) || undefined });
      return { data, limit, offset };
    });
  });

  fastify.get('/segments/:id/export.csv', async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    return withTenant(tenant_id, async (trx) => {
      const seg = await trx.selectFrom('pulse_segments').selectAll()
        .where('tenant_id', '=', tenant_id).where('id', '=', id).executeTakeFirst();
      if (!seg) return reply.status(404).send({ error: 'Segment not found' });
      const rows = await PulseSegments.members(trx, tenant_id, defOf(seg), { limit: 5000 });
      const csv = toCsv(['Name', 'Email', 'Phone'], rows.map((m) => [m.name, m.email, m.phone].map(safeCell)));
      const file = seg.name.replace(/[^\w.-]+/g, '-').slice(0, 60) || 'segment';
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${file}.csv"`);
      return reply.send(csv);
    });
  });

  // ── Consent ───────────────────────────────────────────────────────────────

  fastify.get('/consents', async (request) => {
    const { tenant_id } = request.user;
    const q = request.query as { channel?: string; status?: string; q?: string; limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const offset = Math.max(Number(q.offset) || 0, 0);
    return withTenant(tenant_id, async (trx) => {
      let query = trx.selectFrom('pulse_consents').where('tenant_id', '=', tenant_id);
      if (q.channel && ['email', 'sms', 'whatsapp'].includes(q.channel)) query = query.where('channel', '=', q.channel as any);
      if (q.status && ['subscribed', 'unsubscribed', 'bounced', 'complained'].includes(q.status)) query = query.where('status', '=', q.status as any);
      if (q.q?.trim()) query = query.where('address', 'ilike', `%${q.q.trim().toLowerCase().replace(/[\\%_]/g, (m) => '\\' + m)}%`);
      const [data, count, sms] = await Promise.all([
        query.selectAll().orderBy('updated_at', 'desc').limit(limit).offset(offset).execute(),
        query.select(sql<string>`count(*)`.as('n')).executeTakeFirst(),
        trx.selectFrom('sms_opt_outs').select(sql<string>`count(*)`.as('n')).where('tenant_id', '=', tenant_id).executeTakeFirst(),
      ]);
      return { data, total: Number(count?.n ?? 0), sms_opt_outs: Number(sms?.n ?? 0), limit, offset };
    });
  });

  const consentBody = z.object({
    channel: z.enum(['email', 'sms', 'whatsapp']),
    address: z.string().trim().min(3).max(254),
    status: z.enum(['subscribed', 'unsubscribed']),
    note: z.string().trim().max(500).optional(),
  });

  fastify.post('/consents', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const parsed = consentBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    const key = consentKey(parsed.data.channel, parsed.data.address);
    if (!key) return reply.status(400).send({ error: parsed.data.channel === 'email' ? 'Enter a valid email address' : 'Enter a valid phone number' });
    return withTenant(tenant_id, async (trx) => {
      const prior = await trx.selectFrom('pulse_consents').select('status').where('tenant_id', '=', tenant_id)
        .where('channel', '=', parsed.data.channel).where('address', '=', key).executeTakeFirst();
      // Putting back someone who opted out needs a recorded reason — the
      // person asked again, in writing or by phone — never a silent flip.
      if (parsed.data.status === 'subscribed' && prior && prior.status !== 'subscribed' && !parsed.data.note) {
        return reply.status(400).send({ error: 'This address opted out or bounced. Note how the person asked to be added back.' });
      }
      const row = await PulseConsent.set(trx, tenant_id, {
        channel: parsed.data.channel, address: key, status: parsed.data.status, source: 'manual',
        evidence: { note: parsed.data.note ?? null, previous: prior?.status ?? null }, changedBy: sub,
      });
      return { data: row };
    });
  });
}
