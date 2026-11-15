import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { callAI } from './ai.routes.js';
import { PULSE_ROLES } from './pulse.routes.js';
import { PulseSegments, validateSegment } from '../services/pulse-segments.service.js';
import { tenantTimezone } from '../services/tenant-timezone.service.js';

/**
 * Hudu writing help inside Pulse: subject lines, drafts, rewrites, and
 * "describe an audience" → segment rules. Uses the workspace's own AI
 * settings (Admin ▸ Integrations ▸ AI), the same ones the CMS and Hudu use.
 *
 * Audience rules from the model are never trusted as-is: they go through the
 * same validator as rules typed by hand, and only rules from the catalog
 * survive. Nothing here sends anything — every result is a suggestion the
 * person edits and saves.
 */

const askSchema = z.discriminatedUnion('task', [
  z.object({ task: z.literal('subjects'), brief: z.string().trim().min(3).max(4000) }),
  z.object({ task: z.literal('email'), brief: z.string().trim().min(3).max(4000), tone: z.string().max(40).optional() }),
  z.object({ task: z.literal('sms'), brief: z.string().trim().min(3).max(2000) }),
  z.object({ task: z.literal('rewrite'), text: z.string().trim().min(1).max(20000), instruction: z.string().trim().min(2).max(300), html: z.boolean().default(false) }),
  z.object({ task: z.literal('segment'), description: z.string().trim().min(3).max(1000), source: z.enum(['contacts', 'leads', 'customers']) }),
]);

async function aiConfig(tenantId: string) {
  const settings = await withTenant(tenantId, async (trx) => {
    const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    const s = row?.settings as any;
    return (typeof s === 'string' ? JSON.parse(s) : s) ?? {};
  });
  const cfg = settings['int-ai'] ?? {};
  if (!cfg.on || !cfg.apiKey) return null;
  return { apiKey: cfg.apiKey as string, model: (cfg.model as string) || 'claude-sonnet-5-5', provider: (cfg.provider as string) || 'anthropic' };
}

const jsonFrom = (raw: string) => { const m = raw.match(/[[{][\s\S]*[\]}]/); return JSON.parse(m ? m[0] : raw); };

export async function pulseAiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('pulse'));
  fastify.addHook('preHandler', requireRole(...PULSE_ROLES));

  fastify.get('/ai/status', async (request) => ({ data: { configured: !!(await aiConfig(request.user.tenant_id)) } }));

  fastify.post('/ai', async (request, reply) => {
    const { tenant_id } = request.user;
    const parsed = askSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    const cfg = await aiConfig(tenant_id);
    if (!cfg) return reply.status(409).send({ error: 'Writing help needs AI to be switched on for this workspace. An admin can add it in Admin ▸ Integrations ▸ AI.', code: 'AI_NOT_CONFIGURED' });
    const company = await withTenant(tenant_id, (trx) => trx.selectFrom('tenants').select('name').where('id', '=', tenant_id).executeTakeFirst());
    const who = `You write marketing for ${company?.name ?? 'a business'} in East Africa. Be clear, warm and specific; no hype, no false claims, no invented prices, dates or statistics. If something isn't given, leave a [placeholder].`;
    const d = parsed.data;
    const ask = (prompt: string, max = 1200) => callAI(cfg.apiKey, cfg.model, cfg.provider, [{ role: 'user', content: `${who}\n\n${prompt}` }], max, 0.6);
    try {
      if (d.task === 'subjects') {
        const raw = await ask(`Suggest 5 different email subject lines (under 60 characters each) for this email. Reply ONLY with a JSON array of strings.\n\nEMAIL:\n${d.brief}`, 400);
        const list = (jsonFrom(raw) as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 200)).slice(0, 5);
        return { data: { subjects: list } };
      }
      if (d.task === 'email') {
        const raw = await ask(`Write a marketing email${d.tone ? ` in a ${d.tone} tone` : ''} from this brief. Reply ONLY with JSON {"subject": "...", "preheader": "...", "body_html": "..."}. body_html: simple inline-styled HTML (max-width 600px, Arial), greet with {{first_name}}, one clear call to action as a link, sign off with {{company}}. Do not add an unsubscribe line (one is added automatically).\n\nBRIEF:\n${d.brief}`, 2000);
        const j = jsonFrom(raw);
        return { data: { subject: String(j.subject ?? '').slice(0, 200), preheader: String(j.preheader ?? '').slice(0, 200), body_html: String(j.body_html ?? '') } };
      }
      if (d.task === 'sms') {
        const raw = await ask(`Write one marketing SMS under 160 characters from this brief. Use {{first_name}} once. Plain text, no emoji. Reply ONLY with the message.\n\nBRIEF:\n${d.brief}`, 200);
        return { data: { body_text: raw.trim().replace(/^"|"$/g, '').slice(0, 480) } };
      }
      if (d.task === 'rewrite') {
        const raw = await ask(`Rewrite the following ${d.html ? 'HTML email (keep the HTML structure, links and {{merge}} tags exactly)' : 'text (keep any {{merge}} tags)'} so that it: ${d.instruction}. Reply ONLY with the rewritten ${d.html ? 'HTML' : 'text'}.\n\n${d.text}`, 2500);
        return { data: { text: raw.trim() } };
      }
      // segment: the model sees the real field catalog and must answer within it.
      const catalog = PulseSegments.catalog();
      const fields = { ...(catalog as any)[d.source], ...catalog.engagement };
      const raw = await ask(`Turn this audience description into filter rules for ${d.source}. Allowed fields and operators (use ONLY these):\n${JSON.stringify(fields)}\nDates use whole days. Reply ONLY with JSON {"match_type": "all"|"any", "rules": [{"field": "...", "op": "...", "value": ...}], "unsupported": "anything in the description these fields can't express, or empty"}.\n\nDESCRIPTION: ${d.description}`, 800);
      const j = jsonFrom(raw);
      const def = { source: d.source, match_type: j.match_type === 'any' ? 'any' as const : 'all' as const, rules: Array.isArray(j.rules) ? j.rules.slice(0, 25) : [] };
      // Keep only rules the real validator accepts, one by one.
      const kept = def.rules.filter((rule: unknown) => { try { validateSegment({ ...def, rules: [rule] }); return true; } catch { return false; } });
      return { data: { match_type: def.match_type, rules: kept, dropped: def.rules.length - kept.length, unsupported: typeof j.unsupported === 'string' ? j.unsupported.slice(0, 300) : '' } };
    } catch (e: any) {
      return reply.status(502).send({ error: `Hudu couldn’t answer just now: ${String(e?.message ?? e).slice(0, 200)}` });
    }
  });

  // When people in an audience have opened Pulse email before, by hour of
  // day in the workspace's time zone. Statistics, not AI — and it says so
  // when there isn't enough history to mean anything.
  fastify.get('/send-time', async (request, reply) => {
    const { tenant_id } = request.user;
    const q = request.query as { segment_id?: string };
    if (!q.segment_id) return reply.status(400).send({ error: 'Choose an audience' });
    return withTenant(tenant_id, async (trx) => {
      const seg = await trx.selectFrom('pulse_segments').selectAll().where('tenant_id', '=', tenant_id).where('id', '=', q.segment_id!).executeTakeFirst();
      if (!seg) return reply.status(404).send({ error: 'Audience not found' });
      const members = await PulseSegments.members(trx, tenant_id, { source: seg.source, match_type: seg.match_type as any, rules: typeof seg.rules === 'string' ? JSON.parse(seg.rules) : seg.rules }, { limit: 20000 });
      const emails = members.map((m) => m.email?.trim().toLowerCase()).filter((e): e is string => !!e);
      const tz = await tenantTimezone(trx, tenant_id).catch(() => 'UTC');
      const rows = emails.length ? await trx.selectFrom('pulse_events as e').innerJoin('pulse_sends as s', 's.id', 'e.send_id')
        .select([sql<string>`extract(hour from e.created_at AT TIME ZONE ${tz})`.as('h'), sql<string>`count(DISTINCT e.send_id)`.as('n')])
        .where('e.tenant_id', '=', tenant_id).where('e.type', '=', 'open').where('s.address', 'in', emails.slice(0, 20000))
        .groupBy(sql`1`).execute() : [];
      const hours = Array.from({ length: 24 }, (_, h) => Number(rows.find((r) => Number(r.h) === h)?.n ?? 0));
      const total = hours.reduce((a, b) => a + b, 0);
      if (total < 30) return { data: { hours, total, timezone: tz, best_hour: null, note: 'Not enough opens from this audience yet to suggest a time (needs about 30).' } };
      // Best three-hour window, so one lucky hour doesn't decide.
      let best = 0, bestSum = -1;
      for (let h = 0; h < 24; h++) { const s = hours[h] + hours[(h + 1) % 24] + hours[(h + 2) % 24]; if (s > bestSum) { bestSum = s; best = h; } }
      return { data: { hours, total, timezone: tz, best_hour: best, note: `${Math.round((bestSum / total) * 100)}% of opens from this audience happen between ${String(best).padStart(2, '0')}:00 and ${String((best + 3) % 24).padStart(2, '0')}:00.` } };
    });
  });
}
