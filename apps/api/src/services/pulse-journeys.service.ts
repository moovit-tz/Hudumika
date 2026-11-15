import { randomBytes } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import { z } from 'zod';
import { withTenant, dbPlatform, type Database, type PulseSource } from '../db/client.js';
import { PulseSegments, PulseConsent, consentKey } from './pulse-segments.service.js';
import { dispatchBatch, appendLinks, extractLinks, extractSmsLinks } from './pulse-campaigns.service.js';
import { NotificationService } from './notification.service.js';
import { emitDomainEventStandalone, registerSubscriber, type DomainEvent } from './domain-events.service.js';
import { tenantTimezone } from './tenant-timezone.service.js';

/**
 * Pulse journeys: each person walks an ordered list of steps on their own clock.
 *
 * A person enters from a trigger (joined an audience, a CRM/finance event, a
 * date such as their birthday, or by hand), then the runner executes steps in
 * order until it reaches a wait, a message held back by quiet hours, or the
 * end. Branches only jump forward, so each step runs at most once per person
 * and pulse_journey_step_runs' UNIQUE (enrollment_id, step_id) makes a
 * double-claimed run harmless.
 *
 * Email and SMS steps reuse campaign delivery whole: every message step owns a
 * hidden pulse_campaigns row, a step run inserts one pulse_sends row for the
 * person and calls dispatchBatch — so consent, tracking and unsubscribe
 * behave exactly as they do for a one-off campaign.
 */

const target = z.string().min(1).max(40); // a later step id, 'next' or 'exit'
const base = { id: z.string().regex(/^[a-z0-9_-]{1,40}$/i), label: z.string().trim().max(120).optional() };

export const stepSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('email'), subject: z.string().trim().min(1).max(200), preheader: z.string().trim().max(200).optional(), body_html: z.string().min(1).max(400_000), from_name: z.string().trim().max(80).optional() }),
  z.object({ ...base, type: z.literal('sms'), body_text: z.string().trim().min(1).max(1600) }),
  z.object({ ...base, type: z.literal('wait'), days: z.number().int().min(0).max(365), hours: z.number().int().min(0).max(23) }),
  z.object({
    ...base, type: z.literal('branch'),
    condition: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('opened'), step_id: z.string() }),
      z.object({ kind: z.literal('clicked'), step_id: z.string() }),
      z.object({ kind: z.literal('in_segment'), segment_id: z.string().uuid() }),
    ]),
    yes: target, no: target,
  }),
  z.object({ ...base, type: z.literal('update_lead'), stage: z.string().trim().min(1).max(80) }),
  z.object({ ...base, type: z.literal('task'), title: z.string().trim().min(1).max(200), due_days: z.number().int().min(0).max(365), assign: z.enum(['owner', 'user']), user_id: z.string().uuid().optional() }),
  z.object({ ...base, type: z.literal('notify'), user_ids: z.array(z.string().uuid()).min(1).max(20), message: z.string().trim().min(1).max(500) }),
  z.object({ ...base, type: z.literal('studio') }),
  z.object({ ...base, type: z.literal('exit') }),
]);
export type Step = z.infer<typeof stepSchema>;

export const triggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('segment'), segment_id: z.string().uuid(), include_existing: z.boolean().default(false) }),
  z.object({ type: z.literal('event'), event_type: z.string() }),
  z.object({ type: z.literal('date'), date_field: z.literal('birthday'), offset_days: z.number().int().min(-30).max(30).default(0) }),
  z.object({ type: z.literal('manual') }),
]);
export type Trigger = z.infer<typeof triggerSchema>;

/** Events a journey can start (or end) on, and which people they resolve to. */
export const JOURNEY_EVENTS: Record<string, { label: string; sources: PulseSource[] }> = {
  'lead.created': { label: 'A lead is created', sources: ['leads'] },
  'lead.stage_changed': { label: 'A lead changes stage', sources: ['leads'] },
  'deal.won': { label: 'A deal is won', sources: ['leads', 'customers'] },
  'deal.lost': { label: 'A deal is lost', sources: ['leads', 'customers'] },
  'invoice.payment_recorded': { label: 'A customer pays an invoice', sources: ['customers'] },
  'cms.form_submitted': { label: 'Someone submits a website form', sources: ['contacts'] },
};

const MESSAGE_TYPES = new Set(['email', 'sms']);
const MAX_STEPS = 50;

/** Readable problems with a journey definition; empty when it can be published. */
export function journeyProblems(j: { source: PulseSource; trigger: any; steps: any[]; goal?: any }): string[] {
  const p: string[] = [];
  const t = triggerSchema.safeParse(j.trigger);
  if (!t.success) p.push('Choose how people enter the journey');
  else {
    if (t.data.type === 'event' && !JOURNEY_EVENTS[t.data.event_type]?.sources.includes(j.source)) p.push('That event doesn’t apply to this kind of person');
    if (t.data.type === 'date' && j.source !== 'contacts') p.push('Birthday journeys work on contacts only');
  }
  if (j.goal?.event_type && !JOURNEY_EVENTS[j.goal.event_type]?.sources.includes(j.source)) p.push('The goal event doesn’t apply to this kind of person');
  if (!Array.isArray(j.steps) || j.steps.length === 0) { p.push('Add at least one step'); return p; }
  if (j.steps.length > MAX_STEPS) p.push(`A journey can have at most ${MAX_STEPS} steps`);
  const ids = new Map<string, number>();
  j.steps.forEach((s: any, i: number) => {
    const r = stepSchema.safeParse(s);
    const name = `Step ${i + 1}`;
    if (!r.success) { p.push(`${name}: ${r.error.issues[0]?.message ?? 'incomplete'}`); return; }
    if (ids.has(r.data.id)) p.push(`${name}: duplicate step id`);
    ids.set(r.data.id, i);
  });
  j.steps.forEach((s: any, i: number) => {
    const name = `Step ${i + 1}`;
    if (s?.type === 'branch') {
      for (const k of ['yes', 'no'] as const) {
        const to = s[k];
        if (to === 'next' || to === 'exit') continue;
        const at = ids.get(to);
        if (at == null) p.push(`${name}: the "${k}" path goes to a step that doesn't exist`);
        else if (at <= i) p.push(`${name}: a branch can only jump forward`);
      }
      if ((s.condition?.kind === 'opened' || s.condition?.kind === 'clicked')) {
        const at = ids.get(s.condition.step_id);
        if (at == null || at >= i || !MESSAGE_TYPES.has(j.steps[at]?.type)) p.push(`${name}: pick an earlier message to check`);
        else if (s.condition.kind === 'opened' && j.steps[at].type !== 'email') p.push(`${name}: opens are only tracked for email`);
      }
    }
    if ((s?.type === 'update_lead' || s?.type === 'task') && j.source !== 'leads') p.push(`${name}: this step works on CRM leads only`);
    if (s?.type === 'task' && s.assign === 'user' && !s.user_id) p.push(`${name}: choose who gets the task`);
  });
  return p;
}

const parse = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);

async function loadPerson(trx: Transaction<Database>, tenantId: string, source: PulseSource, id: string) {
  if (source === 'contacts') {
    const r = await trx.selectFrom('contacts').select(['id', sql<string>`trim(first_name || ' ' || coalesce(last_name, ''))`.as('name'), 'email', 'phone'])
      .where('tenant_id', '=', tenantId).where('id', '=', id).where('status', '=', 'ACTIVE').executeTakeFirst();
    return r ?? null;
  }
  if (source === 'leads') {
    const r = await trx.selectFrom('leads').select(['id', sql<string>`coalesce(nullif(contact_name, ''), company)`.as('name'), 'contact_email as email', 'contact_phone as phone', 'assigned_to_id'])
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return r ?? null;
  }
  const r = await trx.selectFrom('customers').select(['id', 'name', 'email', 'phone'])
    .where('tenant_id', '=', tenantId).where('id', '=', id).where('deleted_at', 'is', null).executeTakeFirst();
  return r ?? null;
}

/** Puts one person into a journey, respecting re-entry. Returns true if they entered. */
export async function enroll(trx: Transaction<Database>, tenantId: string, journey: { id: string; source: PulseSource; reentry: string }, personId: string, status: 'active' | 'excluded' = 'active'): Promise<boolean> {
  const prior = await trx.selectFrom('pulse_journey_enrollments').select(['status'])
    .where('tenant_id', '=', tenantId).where('journey_id', '=', journey.id)
    .where('source', '=', journey.source).where('source_id', '=', personId).execute();
  if (prior.some((e) => e.status === 'active')) return false;
  if (prior.length && (journey.reentry === 'never' || prior.some((e) => e.status === 'excluded'))) return false;
  const person = await loadPerson(trx, tenantId, journey.source, personId);
  if (!person) return false;
  const r = await trx.insertInto('pulse_journey_enrollments').values({
    tenant_id: tenantId, journey_id: journey.id, source: journey.source, source_id: personId,
    name: person.name || null, email: person.email ?? null, phone: person.phone ?? null, status,
    ...(status === 'excluded' ? { finished_at: new Date(), exit_reason: 'Already in the audience when the journey started' } : {}),
  }).onConflict((oc) => oc.columns(['journey_id', 'source', 'source_id']).where('status', '=', 'active').doNothing()).executeTakeFirst();
  return Number(r.numInsertedOrUpdatedRows ?? 0) > 0;
}

/** Creates or updates the hidden campaign behind each message step. */
async function syncMessageCampaigns(trx: Transaction<Database>, tenantId: string, journey: { id: string; name: string }, steps: Step[], actor: string | null) {
  const existing = await trx.selectFrom('pulse_campaigns').select(['id', 'journey_step_id'])
    .where('tenant_id', '=', tenantId).where('journey_id', '=', journey.id).execute();
  const byStep = new Map(existing.map((c) => [c.journey_step_id, c.id]));
  for (const [i, s] of steps.entries()) {
    if (s.type !== 'email' && s.type !== 'sms') continue;
    const name = `${journey.name} · ${s.label || `Step ${i + 1}`}`.slice(0, 160);
    const fields = s.type === 'email'
      ? { channel: 'email' as const, subject: s.subject, preheader: s.preheader ?? null, body_html: s.body_html, from_name: s.from_name ?? null, body_text: null }
      : { channel: 'sms' as const, body_text: s.body_text, subject: null, preheader: null, body_html: null, from_name: null };
    let id = byStep.get(s.id);
    if (id) {
      await trx.updateTable('pulse_campaigns').set({ name, ...fields, status: 'sending', updated_by: actor, updated_at: new Date() })
        .where('tenant_id', '=', tenantId).where('id', '=', id).execute();
    } else {
      const row = await trx.insertInto('pulse_campaigns').values({
        tenant_id: tenantId, name, ...fields, status: 'sending', journey_id: journey.id, journey_step_id: s.id,
        started_at: new Date(), created_by: actor, updated_by: actor,
      }).returning('id').executeTakeFirstOrThrow();
      id = row.id;
    }
    await appendLinks(trx, tenantId, id, s.type === 'email' ? extractLinks(s.body_html) : extractSmsLinks(s.body_text));
  }
}

export const PulseJourneys = {
  async publish(tenantId: string, journeyId: string, actor: string) {
    return withTenant(tenantId, async (trx) => {
      const j = await trx.selectFrom('pulse_journeys').selectAll().where('tenant_id', '=', tenantId).where('id', '=', journeyId).forUpdate().executeTakeFirst();
      if (!j) throw Object.assign(new Error('Journey not found'), { statusCode: 404 });
      const steps = parse(j.steps) as Step[];
      const trigger = parse(j.trigger);
      const problems = journeyProblems({ source: j.source, trigger, steps, goal: parse(j.goal) });
      if (problems.length) throw Object.assign(new Error(problems.join('. ')), { statusCode: 400 });
      if (trigger.type === 'segment') {
        const seg = await trx.selectFrom('pulse_segments').select('source').where('tenant_id', '=', tenantId).where('id', '=', trigger.segment_id).executeTakeFirst();
        if (!seg) throw Object.assign(new Error('The entry audience no longer exists'), { statusCode: 400 });
        if (seg.source !== j.source) throw Object.assign(new Error('The entry audience is a different kind of person from this journey'), { statusCode: 400 });
      }
      await syncMessageCampaigns(trx, tenantId, j, steps, actor);
      const firstPublish = !j.published_at;
      const row = await trx.updateTable('pulse_journeys').set({
        status: 'active', version: sql`version + 1`, published_at: j.published_at ?? new Date(), updated_by: actor, updated_at: new Date(),
      }).where('tenant_id', '=', tenantId).where('id', '=', journeyId).returningAll().executeTakeFirstOrThrow();
      // "Only new people": everyone already in the audience is recorded as
      // excluded, so the poller never mistakes them for newcomers.
      if (firstPublish && trigger.type === 'segment' && !trigger.include_existing) {
        const segRow = await trx.selectFrom('pulse_segments').selectAll().where('tenant_id', '=', tenantId).where('id', '=', trigger.segment_id).executeTakeFirstOrThrow();
        const members = await PulseSegments.members(trx, tenantId, { source: segRow.source, match_type: segRow.match_type as any, rules: parse(segRow.rules) }, { limit: 100_000 });
        for (const m of members) await enroll(trx, tenantId, row, m.id, 'excluded');
      }
      return row;
    });
  },
};

// ── Runner ───────────────────────────────────────────────────────────────────

function localMinutes(now: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** When quiet hours are on now, the moment they end; otherwise null. */
export function quietUntil(now: Date, tz: string, quiet: { start?: string; end?: string } | null): Date | null {
  if (!quiet?.start || !quiet?.end) return null;
  const cur = localMinutes(now, tz), start = toMin(quiet.start), end = toMin(quiet.end);
  const inQuiet = start <= end ? cur >= start && cur < end : cur >= start || cur < end;
  if (!inQuiet) return null;
  const wait = (end - cur + 1440) % 1440 || 1440;
  return new Date(now.getTime() + wait * 60_000);
}

async function runStep(trx: Transaction<Database>, tenantId: string, j: any, e: any, s: Step, toDispatch: Set<string>): Promise<{ status: 'done' | 'skipped' | 'failed'; detail: Record<string, unknown>; jump?: string }> {
  switch (s.type) {
    case 'email':
    case 'sms': {
      const camp = await trx.selectFrom('pulse_campaigns').select('id').where('tenant_id', '=', tenantId)
        .where('journey_id', '=', j.id).where('journey_step_id', '=', s.id).executeTakeFirst();
      if (!camp) return { status: 'failed', detail: { reason: 'Message is missing; republish the journey' } };
      const raw = s.type === 'email' ? e.email : e.phone;
      const key = consentKey(s.type, raw);
      if (!key) return { status: 'skipped', detail: { reason: s.type === 'email' ? 'No email address' : 'No phone number' } };
      const blocked = await PulseConsent.blocked(trx, tenantId, s.type, [key]);
      const token = randomBytes(16).toString('hex');
      const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const short = Array.from(randomBytes(8), (x) => alphabet[x % alphabet.length]).join('');
      await trx.insertInto('pulse_sends').values({
        tenant_id: tenantId, campaign_id: camp.id, enrollment_id: e.id, source: e.source, source_id: e.source_id,
        recipient_name: e.name, address: s.type === 'email' ? key : String(raw).trim(), token, short_code: short,
        status: blocked.size ? 'skipped' : 'queued', skip_reason: blocked.size ? 'Unsubscribed, bounced or opted out' : null,
      }).onConflict((oc) => oc.columns(['campaign_id', 'enrollment_id']).where('enrollment_id', 'is not', null).doNothing()).execute();
      if (blocked.size) return { status: 'skipped', detail: { reason: 'Opted out' } };
      toDispatch.add(camp.id);
      return { status: 'done', detail: { campaign_id: camp.id } };
    }
    case 'branch': {
      const c = s.condition;
      let yes = false;
      if (c.kind === 'in_segment') {
        const seg = await trx.selectFrom('pulse_segments').selectAll().where('tenant_id', '=', tenantId).where('id', '=', c.segment_id).executeTakeFirst();
        if (seg && seg.source === j.source) {
          const members = await PulseSegments.members(trx, tenantId, { source: seg.source, match_type: seg.match_type as any, rules: parse(seg.rules) }, { limit: 100_000 });
          yes = members.some((m) => m.id === e.source_id);
        }
      } else {
        const send = await trx.selectFrom('pulse_sends as s').innerJoin('pulse_campaigns as c', 'c.id', 's.campaign_id')
          .select(['s.opened_at', 's.clicked_at']).where('s.tenant_id', '=', tenantId).where('s.enrollment_id', '=', e.id)
          .where('c.journey_step_id', '=', c.step_id).where('c.journey_id', '=', j.id).executeTakeFirst();
        yes = !!(c.kind === 'opened' ? send?.opened_at : send?.clicked_at);
      }
      return { status: 'done', detail: { result: yes ? 'yes' : 'no' }, jump: yes ? s.yes : s.no };
    }
    case 'update_lead': {
      await trx.updateTable('leads').set({ stage: s.stage, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', e.source_id).execute();
      return { status: 'done', detail: { stage: s.stage } };
    }
    case 'task': {
      let assignee: string | null = s.user_id ?? null;
      if (s.assign === 'owner') {
        const lead = await trx.selectFrom('leads').select('assigned_to_id').where('tenant_id', '=', tenantId).where('id', '=', e.source_id).executeTakeFirst();
        assignee = lead?.assigned_to_id ?? null;
      }
      await trx.insertInto('crm_tasks').values({
        tenant_id: tenantId, subject_type: 'lead', subject_id: e.source_id, title: s.title.slice(0, 200),
        due_at: new Date(Date.now() + s.due_days * 86400_000), assigned_to: assignee, created_by: null,
      }).execute();
      return { status: 'done', detail: { assigned_to: assignee } };
    }
    case 'notify': {
      // Sent after commit so a rolled-back run never notifies anyone.
      return { status: 'done', detail: { notify: s.user_ids, message: s.message } };
    }
    case 'studio':
      return { status: 'done', detail: { studio: true } };
    case 'exit':
      return { status: 'done', detail: {}, jump: 'exit' };
    default:
      return { status: 'skipped', detail: { reason: 'Unknown step' } };
  }
}

/** Advances due enrollments. Claims rows with SKIP LOCKED so two workers never run one person. */
async function runDue(tenantId: string) {
  const after: Array<() => Promise<void>> = [];
  const toDispatch = new Set<string>();
  await withTenant(tenantId, async (trx) => {
    const due = await trx.selectFrom('pulse_journey_enrollments').selectAll()
      .where('tenant_id', '=', tenantId).where('status', '=', 'active').where('next_run_at', '<=', new Date())
      .orderBy('next_run_at').limit(200).forUpdate().skipLocked().execute();
    if (!due.length) return;
    const journeys = new Map<string, any>();
    const tz = await tenantTimezone(trx, tenantId).catch(() => 'UTC');
    for (const e of due) {
      let j = journeys.get(e.journey_id);
      if (!j) {
        j = await trx.selectFrom('pulse_journeys').selectAll().where('tenant_id', '=', tenantId).where('id', '=', e.journey_id).executeTakeFirst();
        journeys.set(e.journey_id, j);
      }
      if (!j || j.status !== 'active') continue; // paused: people wait where they are
      const steps = parse(j.steps) as Step[];
      const quiet = parse(j.quiet_hours);
      let idx = e.step_index;
      let next: Date | null = null;
      let finished: { status: 'completed' | 'exited'; reason: string } | null = null;
      for (let guard = 0; guard < MAX_STEPS + 1; guard++) {
        if (idx >= steps.length) { finished = { status: 'completed', reason: 'Reached the end' }; break; }
        const s = steps[idx];
        if (s.type === 'wait') {
          const until = new Date(Date.now() + (s.days * 24 + s.hours) * 3600_000);
          await trx.insertInto('pulse_journey_step_runs').values({ tenant_id: tenantId, journey_id: j.id, enrollment_id: e.id, step_id: s.id, step_type: s.type, status: 'done', detail: JSON.stringify({ until }) })
            .onConflict((oc) => oc.columns(['enrollment_id', 'step_id']).doNothing()).execute();
          idx += 1; next = until; break;
        }
        if (MESSAGE_TYPES.has(s.type)) {
          const hold = quietUntil(new Date(), tz, quiet);
          if (hold) { next = hold; break; }
        }
        const done = await trx.selectFrom('pulse_journey_step_runs').select(['detail']).where('enrollment_id', '=', e.id).where('step_id', '=', s.id).executeTakeFirst();
        let jump: string | undefined;
        if (done) {
          const d = parse(done.detail);
          jump = s.type === 'branch' ? (d.result === 'yes' ? (s as any).yes : (s as any).no) : s.type === 'exit' ? 'exit' : undefined;
        } else {
          const r = await runStep(trx, tenantId, j, e, s, toDispatch);
          await trx.insertInto('pulse_journey_step_runs').values({ tenant_id: tenantId, journey_id: j.id, enrollment_id: e.id, step_id: s.id, step_type: s.type, status: r.status, detail: JSON.stringify(r.detail) })
            .onConflict((oc) => oc.columns(['enrollment_id', 'step_id']).doNothing()).execute();
          jump = r.jump;
          if (s.type === 'notify' && r.status === 'done') {
            const msg = s.message, users = s.user_ids, who = e.name || 'Someone';
            after.push(() => NotificationService.notifyUsers(tenantId, users, {
              app: 'pulse', type: 'info', title: `${j.name}: ${who}`, message: msg, link: `/pulse/journeys/${j.id}`,
              entityType: 'pulse_journey', entityId: j.id, entityLabel: j.name,
            } as any).then(() => {}));
          }
          if (s.type === 'studio' && r.status === 'done') {
            after.push(() => emitDomainEventStandalone(tenantId, {
              type: 'pulse.journey_step_reached', sourceApp: 'pulse', entityType: 'pulse_journey', entityId: j.id,
              payload: { journeyId: j.id, journeyName: j.name, stepId: s.id, stepLabel: s.label ?? null, source: e.source, personId: e.source_id, personName: e.name ?? null, email: e.email ?? null, phone: e.phone ?? null },
            }));
          }
        }
        if (jump === 'exit') { finished = { status: 'completed', reason: 'Reached an exit step' }; break; }
        if (jump && jump !== 'next') {
          const at = steps.findIndex((x) => x.id === jump);
          idx = at > idx ? at : idx + 1;
        } else idx += 1;
      }
      await trx.updateTable('pulse_journey_enrollments').set(finished
        ? { status: finished.status, exit_reason: finished.reason, finished_at: new Date(), step_index: idx }
        : { step_index: idx, next_run_at: next ?? new Date() })
        .where('id', '=', e.id).execute();
    }
  });
  for (const id of toDispatch) await dispatchBatch(tenantId, id).catch((err) => console.error('[Pulse journeys] dispatch', err?.message));
  for (const f of after) await f().catch((err) => console.error('[Pulse journeys] after-step', err?.message));
}

/** Audience-entry journeys: anyone newly in the audience enters. */
async function pollSegmentJourneys(tenantId: string) {
  await withTenant(tenantId, async (trx) => {
    const journeys = await trx.selectFrom('pulse_journeys').selectAll().where('tenant_id', '=', tenantId).where('status', '=', 'active')
      .where(sql<boolean>`trigger->>'type' = 'segment'`).execute();
    for (const j of journeys) {
      const t = parse(j.trigger);
      const seg = await trx.selectFrom('pulse_segments').selectAll().where('tenant_id', '=', tenantId).where('id', '=', t.segment_id).executeTakeFirst();
      if (!seg || seg.source !== j.source) continue;
      const members = await PulseSegments.members(trx, tenantId, { source: seg.source, match_type: seg.match_type as any, rules: parse(seg.rules) }, { limit: 100_000 });
      if (!members.length) continue;
      const seen = await trx.selectFrom('pulse_journey_enrollments').select(['source_id', 'status'])
        .where('tenant_id', '=', tenantId).where('journey_id', '=', j.id).execute();
      const blocked = new Set(seen.filter((x) => j.reentry === 'never' || x.status === 'active' || x.status === 'excluded').map((x) => x.source_id));
      let added = 0;
      for (const m of members) {
        if (blocked.has(m.id)) continue;
        if (await enroll(trx, tenantId, j, m.id)) added++;
        if (added >= 1000) break;
      }
    }
  });
}

/** Birthday journeys: contacts whose birthday is offset_days from today, in the workspace's time zone. */
async function pollDateJourneys(tenantId: string) {
  await withTenant(tenantId, async (trx) => {
    const journeys = await trx.selectFrom('pulse_journeys').selectAll().where('tenant_id', '=', tenantId).where('status', '=', 'active')
      .where(sql<boolean>`trigger->>'type' = 'date'`).execute();
    if (!journeys.length) return;
    const tz = await tenantTimezone(trx, tenantId).catch(() => 'UTC');
    for (const j of journeys) {
      const t = parse(j.trigger);
      const offset = Number(t.offset_days || 0);
      const rows = await trx.selectFrom('contacts').select('id').where('tenant_id', '=', tenantId).where('status', '=', 'ACTIVE')
        .where('birthday', 'is not', null)
        .where(sql<boolean>`to_char(birthday, 'MM-DD') = to_char((now() AT TIME ZONE ${tz})::date - ${offset}::int, 'MM-DD')`)
        .execute();
      for (const r of rows) {
        // Once a year: skip anyone who entered this journey in the last 300 days.
        const recent = await trx.selectFrom('pulse_journey_enrollments').select('id').where('tenant_id', '=', tenantId).where('journey_id', '=', j.id)
          .where('source_id', '=', r.id).where('entered_at', '>', new Date(Date.now() - 300 * 86400_000)).executeTakeFirst();
        if (!recent) await enroll(trx, tenantId, { ...j, reentry: 'after_exit' }, r.id);
      }
    }
  });
}

/** Every minute. Discovers tenants with journey work, then everything runs inside withTenant. */
export async function runPulseJourneyJob(): Promise<void> {
  const tenants = await dbPlatform.selectFrom('pulse_journeys').select('tenant_id').distinct().where('status', '=', 'active').execute();
  for (const { tenant_id } of tenants) {
    try { await pollSegmentJourneys(tenant_id); } catch (e: any) { console.error('[Pulse journeys] segment poll', e?.message); }
    try { await pollDateJourneys(tenant_id); } catch (e: any) { console.error('[Pulse journeys] date poll', e?.message); }
    try { await runDue(tenant_id); } catch (e: any) { console.error('[Pulse journeys] run', e?.message); }
  }
}

/** Runs one tenant's due steps now (tests, and the "run now" admin action). */
export async function runPulseJourneysFor(tenantId: string) {
  await pollSegmentJourneys(tenantId);
  await runDue(tenantId);
}

// ── Event triggers and goals ─────────────────────────────────────────────────

async function peopleForEvent(trx: Transaction<Database>, tenantId: string, event: DomainEvent, source: PulseSource): Promise<string[]> {
  const p = event.payload ?? {};
  if (source === 'leads') {
    if (event.type.startsWith('lead.')) return event.entityId ? [event.entityId] : [];
    if (event.type.startsWith('deal.') && event.entityId) {
      const d = await trx.selectFrom('deals').select('lead_id').where('tenant_id', '=', tenantId).where('id', '=', event.entityId).executeTakeFirst();
      return d?.lead_id ? [d.lead_id] : [];
    }
  }
  if (source === 'customers') {
    if (typeof p.customerId === 'string') return [p.customerId];
    if (event.type.startsWith('deal.') && event.entityId) {
      const d = await trx.selectFrom('deals').select('customer_id').where('tenant_id', '=', tenantId).where('id', '=', event.entityId).executeTakeFirst();
      return d?.customer_id ? [d.customer_id] : [];
    }
  }
  if (source === 'contacts' && typeof p.contactId === 'string') return [p.contactId];
  return [];
}

/** Enters and exits people for an event. Exported for form submissions,
 *  whose contact only exists once Pulse has made it (pulse-attribution). */
export async function journeyOnEvent(tenantId: string, event: DomainEvent) {
  await withTenant(tenantId, async (trx) => {
    const journeys = await trx.selectFrom('pulse_journeys').selectAll().where('tenant_id', '=', tenantId).where('status', '=', 'active')
      .where((eb) => eb.or([
        eb(sql`trigger->>'event_type'`, '=', event.type),
        eb(sql`goal->>'event_type'`, '=', event.type),
      ])).execute();
    for (const j of journeys) {
      const people = await peopleForEvent(trx, tenantId, event, j.source);
      const t = parse(j.trigger), goal = parse(j.goal);
      for (const id of people) {
        if (goal?.event_type === event.type) {
          await trx.updateTable('pulse_journey_enrollments').set({ status: 'exited', exit_reason: 'Reached the goal', finished_at: new Date() })
            .where('tenant_id', '=', tenantId).where('journey_id', '=', j.id).where('source_id', '=', id).where('status', '=', 'active').execute();
        }
        if (t.type === 'event' && t.event_type === event.type) await enroll(trx, tenantId, j, id);
      }
    }
  });
}

let registered = false;
/** Called once at boot (subscribers/pulse.subscribers.ts). */
export function registerPulseJourneySubscribers() {
  if (registered) return;
  registered = true;
  // cms.form_submitted is routed through pulse-attribution, which first turns the submission into a contact.
  for (const type of Object.keys(JOURNEY_EVENTS)) if (type !== 'cms.form_submitted') registerSubscriber(type, journeyOnEvent);
}
