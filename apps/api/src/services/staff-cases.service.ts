/**
 * Operational cases — the platform support queue (platform_support_tickets)
 * extended with ownership, routing, SLA milestones and a customer outcome.
 *
 * SLA rules:
 *  - Due times come from staff_sla_policies by priority. Policies marked
 *    business_hours_only count only staff_business_hours (time zone, work
 *    days, start/end minute, holidays); others count wall-clock minutes.
 *  - First response = the first customer-visible staff reply. Internal notes
 *    do not count.
 *  - Waiting on the customer pauses the resolution clock. On resume the
 *    resolution due time moves later by the paused wall-clock time, and the
 *    pause is accumulated in sla_paused_seconds. Waiting on engineering or a
 *    third party does not pause: that time is ours.
 *  - Resolved = status RESOLVED/CLOSED. The customer outcome (confirmed /
 *    not_resolved) is recorded separately and never set automatically —
 *    not even when a linked Lens issue is done.
 */
import { sql } from 'kysely';
import { dbPlatform } from '../db/client.js';

type Hours = { timezone: string; work_days: number[]; start_minute: number; end_minute: number; holidays: string[] };

function localParts(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(d).map(x => [x.type, x.value]));
  const iso = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[p.weekday];
  return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute), weekday: iso };
}

/** Add `minutes` of business time to `from`, honouring work days, hours and holidays. */
export function addBusinessMinutes(from: Date, minutes: number, h: Hours): Date {
  let cursor = new Date(Math.ceil(from.getTime() / 60000) * 60000);
  let remaining = minutes;
  for (let guard = 0; guard < 2000 && remaining > 0; guard++) {
    const lp = localParts(cursor, h.timezone);
    const working = h.work_days.includes(lp.weekday) && !h.holidays.includes(lp.date);
    if (!working || lp.minute >= h.end_minute) {
      // jump to the next local midnight + start_minute
      cursor = new Date(cursor.getTime() + ((1440 - lp.minute) + h.start_minute) * 60000);
      continue;
    }
    if (lp.minute < h.start_minute) { cursor = new Date(cursor.getTime() + (h.start_minute - lp.minute) * 60000); continue; }
    const take = Math.min(remaining, h.end_minute - lp.minute);
    cursor = new Date(cursor.getTime() + take * 60000);
    remaining -= take;
  }
  return cursor;
}

export async function slaDueTimes(createdAt: Date, priority: string) {
  const [policy, hours] = await Promise.all([
    dbPlatform.selectFrom('staff_sla_policies').selectAll().where('priority', '=', priority as any).executeTakeFirst(),
    dbPlatform.selectFrom('staff_business_hours').selectAll().where('id', '=', 1).executeTakeFirst(),
  ]);
  if (!policy) return { first: null, resolution: null };
  const h: Hours = hours ? { timezone: hours.timezone, work_days: hours.work_days, start_minute: hours.start_minute, end_minute: hours.end_minute, holidays: (hours.holidays ?? []).map(String) }
    : { timezone: 'Africa/Dar_es_Salaam', work_days: [1, 2, 3, 4, 5], start_minute: 480, end_minute: 1020, holidays: [] };
  const add = (m: number) => policy.business_hours_only ? addBusinessMinutes(createdAt, m, h) : new Date(createdAt.getTime() + m * 60000);
  return { first: add(policy.first_response_minutes), resolution: add(policy.resolution_minutes) };
}

export async function caseEvent(ticketId: string, event: string, actorUserId: string | null, detail: Record<string, unknown> = {}) {
  await dbPlatform.insertInto('platform_case_events').values({ ticket_id: ticketId, event, actor_user_id: actorUserId, detail: JSON.stringify(detail) as any }).execute();
}

export async function assignmentHistory(e: {
  subjectType: 'customer' | 'case' | 'incident' | 'team_member' | 'role_grant' | 'scope_grant' | 'permission_override';
  subjectId: string; action: string; actor: string | null; fromUser?: string | null; toUser?: string | null;
  fromTeam?: string | null; toTeam?: string | null; reason?: string; detail?: Record<string, unknown>;
}) {
  await dbPlatform.insertInto('staff_assignment_history').values({
    subject_type: e.subjectType, subject_id: e.subjectId, action: e.action, actor_user_id: e.actor,
    from_user_id: e.fromUser ?? null, to_user_id: e.toUser ?? null, from_team_id: e.fromTeam ?? null, to_team_id: e.toTeam ?? null,
    reason: e.reason ?? '', detail: JSON.stringify(e.detail ?? {}) as any,
  }).execute();
}

const OPEN = ['OPEN', 'IN_PROGRESS'] as const;

/**
 * Pick a team and (when someone is available) an owner, and say why.
 *  1. The first active routing rule, by position, whose non-null fields all match.
 *  2. Otherwise a team covering the case's product, then one covering the customer.
 *  3. Otherwise the fallback team. Otherwise nobody: the Unassigned queue.
 * Within the team: active, available members below their open-case limit,
 * least open cases first, then longest-standing member.
 */
export async function routeCase(ticket: { id: string; tenant_id: string; app: string | null; category: string; priority: string }) {
  const steps: string[] = [];
  const rules = await dbPlatform.selectFrom('staff_routing_rules as r').innerJoin('staff_teams as t', 't.id', 'r.team_id')
    .select(['r.id', 'r.name', 'r.app_id', 'r.category', 'r.priority', 'r.tenant_id', 'r.team_id', 't.name as team_name'])
    .where('r.active', '=', true).where('t.active', '=', true).orderBy('r.position').orderBy('r.created_at').limit(200).execute();
  let teamId: string | null = null; let teamName = '';
  const rule = rules.find(r => (!r.app_id || r.app_id === ticket.app) && (!r.category || r.category === ticket.category)
    && (!r.priority || r.priority === ticket.priority) && (!r.tenant_id || r.tenant_id === ticket.tenant_id));
  if (rule) { teamId = rule.team_id; teamName = rule.team_name; steps.push(`Rule “${rule.name}” matched → ${teamName}`); }
  else {
    steps.push('No routing rule matched');
    const byProduct = ticket.app ? await dbPlatform.selectFrom('staff_team_products as p').innerJoin('staff_teams as t', 't.id', 'p.team_id')
      .select(['t.id', 't.name']).where('p.app_id', '=', ticket.app).where('t.active', '=', true).orderBy('t.created_at').executeTakeFirst() : undefined;
    const byCustomer = byProduct ? undefined : await dbPlatform.selectFrom('staff_team_customers as c').innerJoin('staff_teams as t', 't.id', 'c.team_id')
      .select(['t.id', 't.name']).where('c.tenant_id', '=', ticket.tenant_id).where('t.active', '=', true).orderBy('t.created_at').executeTakeFirst();
    const fallback = byProduct || byCustomer ? undefined : await dbPlatform.selectFrom('staff_teams').select(['id', 'name'])
      .where('is_fallback', '=', true).where('active', '=', true).executeTakeFirst();
    const pick = byProduct ?? byCustomer ?? fallback;
    if (pick) { teamId = pick.id; teamName = pick.name; steps.push(byProduct ? `${teamName} covers ${ticket.app}` : byCustomer ? `${teamName} covers this customer` : `Fallback queue: ${teamName}`); }
    else steps.push('No fallback team configured → Unassigned queue');
  }
  let ownerId: string | null = null;
  if (teamId) {
    const candidates = await sql<{ user_id: string; name: string; open: number; max: number }>`
      SELECT tm.user_id, u.name, m.max_open_cases AS max,
        (SELECT count(*)::int FROM platform_support_tickets x WHERE x.owner_user_id = tm.user_id AND x.status IN ('OPEN','IN_PROGRESS')) AS open
      FROM staff_team_members tm
      JOIN staff_members m ON m.user_id = tm.user_id AND m.status = 'active' AND m.available
      JOIN users u ON u.id = tm.user_id AND u.active IS NOT FALSE
      WHERE tm.team_id = ${teamId} AND tm.removed_at IS NULL AND tm.starts_at <= now() AND (tm.expires_at IS NULL OR tm.expires_at > now())
      ORDER BY open ASC, tm.added_at ASC LIMIT 50`.execute(dbPlatform);
    const free = candidates.rows.find(c => c.open < c.max);
    if (free) { ownerId = free.user_id; steps.push(`${free.name} is available with the fewest open cases (${free.open})`); }
    else steps.push(candidates.rows.length ? 'Every team member is at their case limit → team queue' : 'No available team member → team queue');
  }
  return { teamId, ownerId, reason: steps.join('; ') };
}

/** Called when a workspace files a case: SLA due times, routing, history. */
export async function onCaseCreated(ticketId: string) {
  const t = await dbPlatform.selectFrom('platform_support_tickets').select(['id', 'tenant_id', 'app', 'category', 'priority', 'created_at'])
    .where('id', '=', ticketId).executeTakeFirst();
  if (!t) return;
  const due = await slaDueTimes(new Date(t.created_at), t.priority);
  const r = await routeCase(t);
  await dbPlatform.updateTable('platform_support_tickets').set({
    first_response_due_at: due.first, resolution_due_at: due.resolution, team_id: r.teamId, owner_user_id: r.ownerId, routing_reason: r.reason,
  }).where('id', '=', ticketId).execute();
  await caseEvent(ticketId, 'routed', null, { team_id: r.teamId, owner_user_id: r.ownerId, reason: r.reason });
  if (r.teamId || r.ownerId) await assignmentHistory({ subjectType: 'case', subjectId: ticketId, action: 'routed', actor: null, toUser: r.ownerId, toTeam: r.teamId, reason: r.reason });
}

/** Atomic claim: succeeds for exactly one caller while the case is unowned at the expected version. */
export async function claimCase(ticketId: string, userId: string, expectedVersion?: number) {
  let q = dbPlatform.updateTable('platform_support_tickets')
    .set(eb => ({ owner_user_id: userId, version: eb('version', '+', 1), status: sql`CASE WHEN status = 'OPEN' THEN 'IN_PROGRESS' ELSE status END` as any, updated_at: new Date() }))
    .where('id', '=', ticketId).where('owner_user_id', 'is', null).where('status', 'in', [...OPEN]);
  if (expectedVersion !== undefined) q = q.where('version', '=', expectedVersion);
  return q.returning(['id', 'owner_user_id', 'version', 'team_id']).executeTakeFirst();
}

export function slaState(t: { status: string; first_response_due_at: Date | null; first_response_at: Date | null; resolution_due_at: Date | null; sla_paused_at: Date | null; resolved_at: Date | null }) {
  const now = Date.now();
  const open = OPEN.includes(t.status as any);
  const firstBreached = !!t.first_response_due_at && (t.first_response_at ? new Date(t.first_response_at) > new Date(t.first_response_due_at) : open && now > new Date(t.first_response_due_at).getTime());
  const resolveRef = t.resolved_at ? new Date(t.resolved_at).getTime() : now;
  const resolutionBreached = !!t.resolution_due_at && !t.sla_paused_at && resolveRef > new Date(t.resolution_due_at).getTime();
  return { paused: !!t.sla_paused_at, firstResponseBreached: firstBreached, resolutionBreached, overdue: open && (firstBreached || resolutionBreached) };
}
