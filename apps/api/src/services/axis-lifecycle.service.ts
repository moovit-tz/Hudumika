import { sql, type Transaction } from 'kysely';
import { withTenant, dbPlatform, type Database } from '../db/client.js';
import { emitDomainEvent } from './domain-events.service.js';

/**
 * Axis worker lifecycle: hire, transfer/promote, extra assignments,
 * offboarding, rehire and corrections, kept as effective-dated history in
 * hr_assignments (migration 911).
 *
 * Rules every operation follows:
 *  - The person's users row is locked first, so two changes to one person
 *    serialise instead of both passing the overlap check.
 *  - Nothing is deleted. A correction voids the row it replaces (with the
 *    reason and who did it) and inserts the replacement pointing back at it.
 *  - Primary jobs never overlap; extra (secondary) assignments may.
 *  - Every id that arrives (entity, branch, department, role, manager) is
 *    checked to belong to the same tenant before it is stored.
 *  - The primary job in force today is projected onto users.department_id /
 *    designation_id / location_id and the org-chart reporting line, which is
 *    what existing screens and the reporting-line permission checks read.
 *  - A manager's request is stored PENDING and takes effect only when someone
 *    else in HR approves it.
 */

export const HR_ADMIN = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];
export type Actor = { tenant_id: string; sub: string; role: string };

export class LifecycleError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}

type Trx = Transaction<Database>;

export interface JobFields {
  worker_type?: 'EMPLOYEE' | 'CONTRACTOR' | 'CASUAL' | 'INTERN';
  legal_entity_id?: string | null;
  location_id?: string | null;
  department_id?: string | null;
  designation_id?: string | null;
  manager_id?: string | null;
  job_title?: string | null;
  fte?: number;
  notes?: string | null;
}

const JOB_KEYS = ['worker_type', 'legal_entity_id', 'location_id', 'department_id', 'designation_id', 'manager_id', 'job_title', 'fte'] as const;
const today = () => new Date().toISOString().slice(0, 10);
const dayBefore = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
const asDate = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10));

async function lockPerson(trx: Trx, tenantId: string, userId: string) {
  const p = await trx.selectFrom('users').select(['id', 'name', 'active', 'role', 'can_login', 'email'])
    .where('tenant_id', '=', tenantId).where('id', '=', userId).forUpdate().executeTakeFirst();
  if (!p || ['CUSTOMER', 'ORG', 'GUEST'].includes(p.role)) throw new LifecycleError('Worker not found', 404);
  return p;
}

/** Every reference must be a row of this tenant; a manager must be an active colleague, not the person. */
async function checkRefs(trx: Trx, tenantId: string, userId: string, f: JobFields) {
  const one = async (table: 'hr_legal_entities' | 'locations' | 'hr_departments' | 'hr_designations', id: string | null | undefined, label: string) => {
    if (!id) return;
    const r = await trx.selectFrom(table as any).select('id').where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!r) throw new LifecycleError(`That ${label} doesn't exist in this workspace`);
  };
  await one('hr_legal_entities', f.legal_entity_id, 'legal entity');
  await one('locations', f.location_id, 'branch');
  await one('hr_departments', f.department_id, 'department');
  await one('hr_designations', f.designation_id, 'role');
  if (f.manager_id) {
    if (f.manager_id === userId) throw new LifecycleError('A worker can’t be their own manager');
    const m = await trx.selectFrom('users').select('id').where('tenant_id', '=', tenantId).where('id', '=', f.manager_id)
      .where('active', '=', true).where('role', 'not in', ['CUSTOMER', 'ORG', 'GUEST']).executeTakeFirst();
    if (!m) throw new LifecycleError('The manager must be an active member of this workspace');
  }
  if (f.fte != null && !(f.fte > 0 && f.fte <= 1)) throw new LifecycleError('Working fraction must be above 0 and at most 1');
}

/** Primary jobs may not overlap in time. Dates are inclusive; an open end runs forever. */
async function assertNoPrimaryOverlap(trx: Trx, tenantId: string, userId: string, start: string, end: string | null, exclude: string[] = []) {
  let q = trx.selectFrom('hr_assignments').select(['id', 'start_date', 'end_date'])
    .where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('is_primary', '=', true).where('status', '=', 'ACTIVE')
    .where(sql<boolean>`start_date <= ${end ?? '9999-12-31'}::date AND coalesce(end_date, '9999-12-31'::date) >= ${start}::date`);
  if (exclude.length) q = q.where('id', 'not in', exclude);
  const clash = await q.executeTakeFirst();
  if (clash) throw new LifecycleError(`This overlaps the main job running from ${asDate(clash.start_date)}${clash.end_date ? ` to ${asDate(clash.end_date)}` : ''}. End or correct that one first.`, 409);
}

async function log(trx: Trx, actor: Actor, action: string, metadata: Record<string, unknown>) {
  await trx.insertInto('hr_activity_log').values({ tenant_id: actor.tenant_id, user_id: actor.sub, action, module: 'Lifecycle', metadata: JSON.stringify(metadata) } as any).execute();
}

/** Makes users.* and the org chart reflect the primary job in force today. */
export async function project(trx: Trx, tenantId: string, userId: string) {
  const d = today();
  const cur = await trx.selectFrom('hr_assignments').selectAll()
    .where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('is_primary', '=', true).where('status', '=', 'ACTIVE')
    .where('start_date', '<=', d).where((eb) => eb.or([eb('end_date', 'is', null), eb('end_date', '>=', d)]))
    .orderBy('start_date', 'desc').executeTakeFirst();
  if (!cur) return null; // between jobs or gone: the last known placement stays visible on the profile
  await trx.updateTable('users').set({ department_id: cur.department_id, designation_id: cur.designation_id, location_id: cur.location_id, updated_at: new Date() })
    .where('tenant_id', '=', tenantId).where('id', '=', userId).execute();
  // Reporting line. Time approval, profile access and leave routing all read
  // the org chart, so the job's manager has to be there: a worker or manager
  // who isn't on the chart yet gets a node, otherwise the manager named here
  // would have no manager rights at all.
  const nodeFor = async (uid: string) => {
    const existing = await trx.selectFrom('org_chart_nodes').select(['id', 'parent_id']).where('tenant_id', '=', tenantId).where('user_id', '=', uid).executeTakeFirst();
    if (existing) return existing;
    const u = await trx.selectFrom('users').select(['name', 'email', 'phone']).where('tenant_id', '=', tenantId).where('id', '=', uid).executeTakeFirstOrThrow();
    return trx.insertInto('org_chart_nodes').values({
      tenant_id: tenantId, user_id: uid, label: u.name || u.email || 'Unnamed', job_title: null, department: null,
      email: u.email, phone: u.phone ?? null, parent_id: null, position_x: 0, position_y: 0,
    } as any).returning(['id', 'parent_id']).executeTakeFirstOrThrow();
  };
  if (cur.manager_id) {
    const node = await nodeFor(userId);
    const mgr = await nodeFor(cur.manager_id);
    if (node.parent_id !== mgr.id) {
      // Never make someone report to a person who (directly or not) reports to them.
      const loop = await sql<{ found: number }>`
        WITH RECURSIVE up AS (
          SELECT id, parent_id FROM org_chart_nodes WHERE tenant_id = ${tenantId} AND id = ${mgr.id}
          UNION
          SELECT n.id, n.parent_id FROM org_chart_nodes n JOIN up ON n.id = up.parent_id WHERE n.tenant_id = ${tenantId}
        ) SELECT 1 AS found FROM up WHERE id = ${node.id} LIMIT 1`.execute(trx);
      if (loop.rows.length) throw new LifecycleError('That manager reports (directly or through others) to this worker. Change the reporting line in the org chart first.', 409);
      await trx.updateTable('org_chart_nodes').set({ parent_id: mgr.id, updated_at: new Date() } as any).where('tenant_id', '=', tenantId).where('id', '=', node.id).execute();
    }
  }
  // No manager on the job: whatever the org chart says stays as HR drew it.
  return cur;
}

async function emit(trx: Trx, actor: Actor, type: 'hr.assignment_changed', payload: Record<string, unknown>, entityId: string) {
  await emitDomainEvent(trx, actor.tenant_id, { type, sourceApp: 'nexushr', entityType: 'hr_assignment', entityId, payload, actorId: actor.sub })
    .catch((e) => console.error('[Axis lifecycle] emit failed:', e?.message));
}

async function setActive(trx: Trx, actor: { tenant_id: string; sub: string | null }, userId: string, active: boolean, name: string) {
  const r = await trx.updateTable('users').set({ active, updated_at: new Date() })
    .where('tenant_id', '=', actor.tenant_id).where('id', '=', userId).where('active', '=', !active).returning(['id']).executeTakeFirst();
  if (!r) return;
  // Same events the staff screen raises, so Ondi revokes or restores access the same way.
  await emitDomainEvent(trx, actor.tenant_id, {
    type: active ? 'hr.staff_reactivated' : 'hr.staff_deactivated', sourceApp: 'nexushr', entityType: 'user', entityId: userId,
    payload: { userId, name, active, changedBy: actor.sub ?? 'system' }, actorId: actor.sub,
  }).catch((e) => console.error('[Axis lifecycle] staff status emit failed:', e?.message));
}

function pick(f: JobFields) {
  const out: Record<string, unknown> = {};
  for (const k of JOB_KEYS) if (k in f) out[k] = (f as any)[k] ?? null;
  return out;
}

export const AxisLifecycle = {
  async history(actor: Actor, userId: string) {
    return withTenant(actor.tenant_id, async (trx) => {
      if (!HR_ADMIN.includes(actor.role) && actor.sub !== userId) {
        // A manager sees the history of people whose current job reports to them.
        const mine = await trx.selectFrom('hr_assignments').select('id').where('tenant_id', '=', actor.tenant_id).where('user_id', '=', userId)
          .where('manager_id', '=', actor.sub).where('status', '=', 'ACTIVE').executeTakeFirst();
        if (!mine) throw new LifecycleError('You can only see job history for yourself or your team', 403);
      }
      return trx.selectFrom('hr_assignments as a')
        .leftJoin('hr_departments as d', 'd.id', 'a.department_id')
        .leftJoin('hr_designations as g', 'g.id', 'a.designation_id')
        .leftJoin('locations as l', 'l.id', 'a.location_id')
        .leftJoin('hr_legal_entities as e', 'e.id', 'a.legal_entity_id')
        .leftJoin('users as m', 'm.id', 'a.manager_id')
        .leftJoin('users as ap', 'ap.id', 'a.approved_by')
        .leftJoin('users as rq', 'rq.id', 'a.requested_by')
        .select(['a.id', 'a.user_id', 'a.worker_type', 'a.is_primary', 'a.job_title', 'a.fte', 'a.start_date', 'a.end_date', 'a.start_reason', 'a.end_reason',
          'a.status', 'a.notes', 'a.corrects_id', 'a.void_reason', 'a.voided_at', 'a.approved_at', 'a.created_at',
          'a.legal_entity_id', 'a.location_id', 'a.department_id', 'a.designation_id', 'a.manager_id',
          'd.name as department_name', 'g.title as designation_name', 'l.name as location_name', 'e.legal_name as legal_entity_name',
          'm.name as manager_name', 'm.avatar_url as manager_avatar', 'ap.name as approved_by_name', 'rq.name as requested_by_name'])
        .where('a.tenant_id', '=', actor.tenant_id).where('a.user_id', '=', userId)
        .orderBy('a.start_date', 'desc').orderBy('a.created_at', 'desc').execute();
    });
  },

  /** A new worker with no sign-in (casual, contractor, shared-device staff). */
  async hireWithoutLogin(actor: Actor, input: JobFields & { name: string; phone?: string | null; email?: string | null; start_date: string }) {
    if (!HR_ADMIN.includes(actor.role)) throw new LifecycleError('Only HR administrators can add workers', 403);
    return withTenant(actor.tenant_id, async (trx) => {
      const email = input.email?.trim().toLowerCase() || null;
      if (email) {
        const dup = await trx.selectFrom('users').select('id').where('tenant_id', '=', actor.tenant_id).where(sql<boolean>`lower(email) = ${email}`).executeTakeFirst();
        if (dup) throw new LifecycleError('Someone in this workspace already uses that email', 409);
      }
      // '!' can never match a password hash: the account exists but cannot sign in.
      const user = await trx.insertInto('users').values({
        tenant_id: actor.tenant_id, name: input.name.trim(), email, phone: input.phone?.trim() || null, role: 'JUNIOR',
        password_hash: '!', can_login: false, active: input.start_date <= today(), hire_date: input.start_date,
      } as any).returning(['id', 'name']).executeTakeFirstOrThrow();
      await checkRefs(trx, actor.tenant_id, user.id, input);
      const row = await trx.insertInto('hr_assignments').values({
        tenant_id: actor.tenant_id, user_id: user.id, ...pick(input), is_primary: true, start_date: input.start_date,
        start_reason: 'HIRE', status: 'ACTIVE', notes: input.notes ?? null, approved_by: actor.sub, approved_at: new Date(),
      } as any).returningAll().executeTakeFirstOrThrow();
      await project(trx, actor.tenant_id, user.id);
      await log(trx, actor, 'lifecycle.hired', { worker: user.id, assignment: row.id, can_login: false, start_date: input.start_date });
      await emit(trx, actor, 'hr.assignment_changed', { userId: user.id, change: 'HIRE', effectiveDate: input.start_date, assignmentId: row.id }, row.id);
      return { user, assignment: row };
    });
  },

  /** Records the first job of an existing account that has none yet (e.g. after an invitation is accepted). */
  async startJob(actor: Actor, userId: string, input: JobFields & { start_date: string }) {
    if (!HR_ADMIN.includes(actor.role)) throw new LifecycleError('Only HR administrators can start a job', 403);
    return withTenant(actor.tenant_id, async (trx) => {
      const p = await lockPerson(trx, actor.tenant_id, userId);
      await checkRefs(trx, actor.tenant_id, userId, input);
      await assertNoPrimaryOverlap(trx, actor.tenant_id, userId, input.start_date, null);
      const had = await trx.selectFrom('hr_assignments').select('id').where('tenant_id', '=', actor.tenant_id).where('user_id', '=', userId).where('status', '=', 'ACTIVE').executeTakeFirst();
      const row = await trx.insertInto('hr_assignments').values({
        tenant_id: actor.tenant_id, user_id: userId, ...pick(input), is_primary: true, start_date: input.start_date,
        start_reason: had ? 'REHIRE' : 'HIRE', status: 'ACTIVE', notes: input.notes ?? null, approved_by: actor.sub, approved_at: new Date(),
      } as any).returningAll().executeTakeFirstOrThrow();
      if (input.start_date <= today()) await setActive(trx, actor, userId, true, p.name);
      await project(trx, actor.tenant_id, userId);
      await log(trx, actor, had ? 'lifecycle.rehired' : 'lifecycle.hired', { worker: userId, assignment: row.id, start_date: input.start_date });
      await emit(trx, actor, 'hr.assignment_changed', { userId, change: row.start_reason, effectiveDate: input.start_date, assignmentId: row.id }, row.id);
      return row;
    });
  },

  /**
   * Transfer or promotion from a date: the current main job ends the day
   * before and a new one starts, carrying over anything not changed. A
   * manager's request is stored PENDING for HR.
   */
  async move(actor: Actor, userId: string, input: JobFields & { effective_date: string; reason: 'TRANSFER' | 'PROMOTION' }) {
    const isHr = HR_ADMIN.includes(actor.role);
    return withTenant(actor.tenant_id, async (trx) => {
      await lockPerson(trx, actor.tenant_id, userId);
      const cur = await trx.selectFrom('hr_assignments').selectAll().where('tenant_id', '=', actor.tenant_id).where('user_id', '=', userId)
        .where('is_primary', '=', true).where('status', '=', 'ACTIVE').where('start_date', '<=', input.effective_date)
        .where((eb) => eb.or([eb('end_date', 'is', null), eb('end_date', '>=', input.effective_date)])).executeTakeFirst();
      if (!cur) throw new LifecycleError('This worker has no main job on that date to move from', 409);
      if (!isHr && cur.manager_id !== actor.sub) throw new LifecycleError('You can only request changes for people who report to you', 403);
      if (asDate(cur.start_date) === input.effective_date) throw new LifecycleError('That job starts on the same day. Correct it instead of moving it.', 409);
      await checkRefs(trx, actor.tenant_id, userId, input);
      const carried: Record<string, unknown> = {};
      for (const k of JOB_KEYS) carried[k] = k in input ? (input as any)[k] ?? null : (cur as any)[k];
      if (!isHr) {
        const row = await trx.insertInto('hr_assignments').values({
          tenant_id: actor.tenant_id, user_id: userId, ...carried, is_primary: true, start_date: input.effective_date,
          start_reason: input.reason, status: 'PENDING', notes: input.notes ?? null, requested_by: actor.sub, corrects_id: null,
        } as any).returningAll().executeTakeFirstOrThrow();
        await log(trx, actor, 'lifecycle.change_requested', { worker: userId, assignment: row.id, reason: input.reason, effective_date: input.effective_date });
        return row;
      }
      return applyMove(trx, actor, userId, cur, carried, input.effective_date, input.reason, input.notes ?? null, null);
    });
  },

  async approve(actor: Actor, assignmentId: string, decision: 'approve' | 'reject', reason?: string) {
    if (!HR_ADMIN.includes(actor.role)) throw new LifecycleError('Only HR administrators can approve job changes', 403);
    return withTenant(actor.tenant_id, async (trx) => {
      const req = await trx.selectFrom('hr_assignments').selectAll().where('tenant_id', '=', actor.tenant_id).where('id', '=', assignmentId).executeTakeFirst();
      if (!req || req.status !== 'PENDING') throw new LifecycleError('No pending request with that id', 404);
      if (req.requested_by === actor.sub) throw new LifecycleError('Someone other than the requester must decide this', 403);
      await lockPerson(trx, actor.tenant_id, req.user_id);
      if (decision === 'reject') {
        if (!reason?.trim()) throw new LifecycleError('Give a reason for declining');
        await trx.updateTable('hr_assignments').set({ status: 'VOIDED', void_reason: `Declined: ${reason.trim()}`, voided_by: actor.sub, voided_at: new Date(), updated_at: new Date() }).where('id', '=', req.id).execute();
        await log(trx, actor, 'lifecycle.change_declined', { worker: req.user_id, assignment: req.id, reason });
        return { status: 'VOIDED' };
      }
      const start = asDate(req.start_date)!;
      const cur = await trx.selectFrom('hr_assignments').selectAll().where('tenant_id', '=', actor.tenant_id).where('user_id', '=', req.user_id)
        .where('is_primary', '=', true).where('status', '=', 'ACTIVE').where('start_date', '<', start)
        .where((eb) => eb.or([eb('end_date', 'is', null), eb('end_date', '>=', start)])).executeTakeFirst();
      if (!cur) throw new LifecycleError('The job this request changes has since ended or moved; decline it and ask for a new one', 409);
      const carried: Record<string, unknown> = {};
      for (const k of JOB_KEYS) carried[k] = (req as any)[k];
      return applyMove(trx, actor, req.user_id, cur, carried, start, req.start_reason as 'TRANSFER' | 'PROMOTION', req.notes, req.id);
    });
  },

  /** An extra job alongside the main one (second branch, part-time role, cover). */
  async addSecondary(actor: Actor, userId: string, input: JobFields & { start_date: string; end_date?: string | null }) {
    if (!HR_ADMIN.includes(actor.role)) throw new LifecycleError('Only HR administrators can add an assignment', 403);
    return withTenant(actor.tenant_id, async (trx) => {
      await lockPerson(trx, actor.tenant_id, userId);
      await checkRefs(trx, actor.tenant_id, userId, input);
      if (input.end_date && input.end_date < input.start_date) throw new LifecycleError('The end date is before the start date');
      const row = await trx.insertInto('hr_assignments').values({
        tenant_id: actor.tenant_id, user_id: userId, ...pick(input), is_primary: false, start_date: input.start_date,
        end_date: input.end_date ?? null, end_reason: input.end_date ? 'END_OF_CONTRACT' : null,
        start_reason: 'ADDITIONAL', status: 'ACTIVE', notes: input.notes ?? null, approved_by: actor.sub, approved_at: new Date(),
      } as any).returningAll().executeTakeFirstOrThrow();
      await log(trx, actor, 'lifecycle.assignment_added', { worker: userId, assignment: row.id });
      await emit(trx, actor, 'hr.assignment_changed', { userId, change: 'ADDITIONAL', effectiveDate: input.start_date, assignmentId: row.id }, row.id);
      return row;
    });
  },

  /**
   * Leaving: every job still running on the last day ends then; jobs that
   * would have started later are voided. Access is removed on the day after
   * the last day — immediately when that is today or earlier, otherwise by
   * the daily job.
   */
  async offboard(actor: Actor, userId: string, input: { last_day: string; reason: NonNullable<Database['hr_assignments']['end_reason']>; notes?: string | null }) {
    if (!HR_ADMIN.includes(actor.role)) throw new LifecycleError('Only HR administrators can offboard', 403);
    if (input.reason === 'TRANSFER' || input.reason === 'PROMOTION') throw new LifecycleError('Use a transfer for a move inside the company');
    return withTenant(actor.tenant_id, async (trx) => {
      const p = await lockPerson(trx, actor.tenant_id, userId);
      if (userId === actor.sub) throw new LifecycleError('You can’t offboard yourself', 409);
      const running = await trx.selectFrom('hr_assignments').selectAll().where('tenant_id', '=', actor.tenant_id).where('user_id', '=', userId)
        .where('status', '=', 'ACTIVE').where('start_date', '<=', input.last_day)
        .where((eb) => eb.or([eb('end_date', 'is', null), eb('end_date', '>', input.last_day)])).execute();
      if (!running.length) throw new LifecycleError('This worker has no job running on that day', 409);
      for (const a of running) {
        await trx.updateTable('hr_assignments').set({ end_date: input.last_day, end_reason: input.reason, updated_at: new Date() }).where('id', '=', a.id).execute();
      }
      const later = await trx.updateTable('hr_assignments').set({ status: 'VOIDED', void_reason: 'Cancelled: the worker left before it started', voided_by: actor.sub, voided_at: new Date(), updated_at: new Date() })
        .where('tenant_id', '=', actor.tenant_id).where('user_id', '=', userId).where('status', 'in', ['ACTIVE', 'PENDING']).where('start_date', '>', input.last_day).returning('id').execute();
      if (input.last_day < today()) await setActive(trx, actor, userId, false, p.name);
      await log(trx, actor, 'lifecycle.offboarded', { worker: userId, last_day: input.last_day, reason: input.reason, ended: running.map((a) => a.id), voided_future: later.map((x) => x.id), notes: input.notes ?? null });
      await emit(trx, actor, 'hr.assignment_changed', { userId, change: 'OFFBOARD', effectiveDate: input.last_day, reason: input.reason }, running[0].id);
      return { ended: running.length, voided_future: later.length, access_removed: input.last_day < today() };
    });
  },

  /**
   * Fixes a recorded job without losing what was recorded: the old row is
   * voided with the reason and a replacement points back at it.
   */
  async correct(actor: Actor, assignmentId: string, input: JobFields & { start_date?: string; end_date?: string | null; reason: string }) {
    if (!HR_ADMIN.includes(actor.role)) throw new LifecycleError('Only HR administrators can correct job history', 403);
    if (!input.reason?.trim()) throw new LifecycleError('Say why this is being corrected');
    return withTenant(actor.tenant_id, async (trx) => {
      const old = await trx.selectFrom('hr_assignments').selectAll().where('tenant_id', '=', actor.tenant_id).where('id', '=', assignmentId).executeTakeFirst();
      if (!old || old.status !== 'ACTIVE') throw new LifecycleError('Only an in-force job can be corrected', 404);
      await lockPerson(trx, actor.tenant_id, old.user_id);
      await checkRefs(trx, actor.tenant_id, old.user_id, input);
      const start = input.start_date ?? asDate(old.start_date)!;
      const end = 'end_date' in input ? input.end_date ?? null : asDate(old.end_date);
      if (end && end < start) throw new LifecycleError('The end date is before the start date');
      if (old.is_primary) await assertNoPrimaryOverlap(trx, actor.tenant_id, old.user_id, start, end, [old.id]);
      await trx.updateTable('hr_assignments').set({ status: 'VOIDED', void_reason: `Corrected: ${input.reason.trim()}`, voided_by: actor.sub, voided_at: new Date(), updated_at: new Date() }).where('id', '=', old.id).execute();
      const fields: Record<string, unknown> = {};
      for (const k of JOB_KEYS) fields[k] = k in input ? (input as any)[k] ?? null : (old as any)[k];
      const row = await trx.insertInto('hr_assignments').values({
        tenant_id: actor.tenant_id, user_id: old.user_id, ...fields, is_primary: old.is_primary, start_date: start, end_date: end,
        end_reason: end ? (old.end_reason ?? 'OTHER') : null, start_reason: old.start_reason, status: 'ACTIVE',
        notes: input.notes ?? old.notes, corrects_id: old.id, approved_by: actor.sub, approved_at: new Date(),
      } as any).returningAll().executeTakeFirstOrThrow();
      await project(trx, actor.tenant_id, old.user_id);
      await log(trx, actor, 'lifecycle.corrected', { worker: old.user_id, replaced: old.id, by: row.id, reason: input.reason, before: old, after: row });
      return row;
    });
  },

  /** Turns sign-in on or off. Off ends every open session at once. */
  async setSignIn(actor: Actor, userId: string, canLogin: boolean) {
    if (!HR_ADMIN.includes(actor.role)) throw new LifecycleError('Only HR administrators can change sign-in access', 403);
    if (userId === actor.sub) throw new LifecycleError('You can’t change your own sign-in access', 409);
    return withTenant(actor.tenant_id, async (trx) => {
      const p = await lockPerson(trx, actor.tenant_id, userId);
      if (canLogin && !p.email) throw new LifecycleError('Add an email address before turning sign-in on');
      if (!canLogin && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(p.role)) throw new LifecycleError('An administrator account must be able to sign in', 409);
      await trx.updateTable('users').set({ can_login: canLogin, updated_at: new Date() }).where('tenant_id', '=', actor.tenant_id).where('id', '=', userId).execute();
      if (!canLogin) {
        await trx.updateTable('hr_devices').set({ revoked_at: new Date() } as any).where('tenant_id', '=', actor.tenant_id).where('user_id', '=', userId).where('revoked_at', 'is', null).execute();
      }
      await log(trx, actor, canLogin ? 'lifecycle.sign_in_enabled' : 'lifecycle.sign_in_disabled', { worker: userId });
      return { can_login: canLogin };
    });
  },

  async pending(actor: Actor) {
    if (!HR_ADMIN.includes(actor.role)) throw new LifecycleError('Only HR administrators can see pending job changes', 403);
    return withTenant(actor.tenant_id, (trx) => trx.selectFrom('hr_assignments as a').innerJoin('users as u', 'u.id', 'a.user_id').leftJoin('users as r', 'r.id', 'a.requested_by')
      .select(['a.id', 'a.user_id', 'u.name as worker_name', 'u.avatar_url as worker_avatar', 'a.start_reason', 'a.start_date', 'a.department_id', 'a.designation_id', 'a.location_id', 'a.manager_id', 'a.notes', 'a.created_at', 'r.name as requested_by_name', 'a.requested_by'])
      .where('a.tenant_id', '=', actor.tenant_id).where('a.status', '=', 'PENDING').orderBy('a.created_at').execute());
  },
};

async function applyMove(trx: Trx, actor: Actor, userId: string, cur: any, carried: Record<string, unknown>, effective: string, reason: 'TRANSFER' | 'PROMOTION', notes: string | null, pendingId: string | null) {
  const curEnd = asDate(cur.end_date);
  await trx.updateTable('hr_assignments').set({ end_date: dayBefore(effective), end_reason: reason, updated_at: new Date() }).where('id', '=', cur.id).execute();
  await assertNoPrimaryOverlap(trx, actor.tenant_id, userId, effective, curEnd, pendingId ? [pendingId] : []);
  let row;
  if (pendingId) {
    row = await trx.updateTable('hr_assignments').set({ status: 'ACTIVE', end_date: curEnd, end_reason: curEnd ? (cur.end_reason ?? 'END_OF_CONTRACT') : null, approved_by: actor.sub, approved_at: new Date(), updated_at: new Date() })
      .where('id', '=', pendingId).returningAll().executeTakeFirstOrThrow();
  } else {
    row = await trx.insertInto('hr_assignments').values({
      tenant_id: actor.tenant_id, user_id: userId, ...carried, is_primary: true, start_date: effective,
      end_date: curEnd, end_reason: curEnd ? (cur.end_reason ?? 'END_OF_CONTRACT') : null,
      start_reason: reason, status: 'ACTIVE', notes, approved_by: actor.sub, approved_at: new Date(),
    } as any).returningAll().executeTakeFirstOrThrow();
  }
  await project(trx, actor.tenant_id, userId);
  await log(trx, actor, `lifecycle.${reason.toLowerCase()}`, { worker: userId, from: cur.id, to: row.id, effective_date: effective });
  await emit(trx, actor, 'hr.assignment_changed', { userId, change: reason, effectiveDate: effective, assignmentId: row.id }, row.id);
  return row;
}

/**
 * Daily: applies what has come into force — a future-dated transfer or rehire
 * starting today, and the end of access the day after a last working day.
 */
export async function runAxisLifecycleJob(only?: string[]) {
  const d = today();
  const tenantIds = only ?? (await dbPlatform.selectFrom('hr_assignments').select('tenant_id').distinct().execute()).map((r) => r.tenant_id);
  for (const tenantId of tenantIds) {
    try {
      await withTenant(tenantId, async (trx) => {
        // Scheduled work has no person behind it: a null actor is the honest answer.
        const actor = { tenant_id: tenantId, sub: null };
        // Projections for anyone whose primary job started or ended in the last two days.
        const touched = await trx.selectFrom('hr_assignments').select('user_id').distinct().where('tenant_id', '=', tenantId).where('status', '=', 'ACTIVE')
          .where((eb) => eb.or([eb('start_date', '=', d), eb('end_date', '=', dayBefore(d))])).execute();
        for (const t of touched) {
          try { await project(trx, tenantId, t.user_id); }
          catch (e) { if (e instanceof LifecycleError) console.warn('[Axis lifecycle] reporting line not applied', tenantId, t.user_id, e.message); else throw e; }
        }
        // People whose every job has ended before today lose access.
        const gone = await trx.selectFrom('users as u').select(['u.id', 'u.name']).where('u.tenant_id', '=', tenantId).where('u.active', '=', true)
          .where(sql<boolean>`EXISTS (SELECT 1 FROM hr_assignments a WHERE a.user_id = u.id AND a.status = 'ACTIVE' AND a.end_reason IS NOT NULL AND a.end_reason NOT IN ('TRANSFER','PROMOTION'))`)
          .where(sql<boolean>`NOT EXISTS (SELECT 1 FROM hr_assignments a WHERE a.user_id = u.id AND a.status = 'ACTIVE' AND (a.end_date IS NULL OR a.end_date >= ${d}::date))`).execute();
        for (const g of gone) await setActive(trx, actor, g.id, false, g.name);
        // People whose rehire starts today regain access.
        const back = await trx.selectFrom('users as u').select(['u.id', 'u.name']).where('u.tenant_id', '=', tenantId).where('u.active', '=', false)
          .where(sql<boolean>`EXISTS (SELECT 1 FROM hr_assignments a WHERE a.user_id = u.id AND a.status = 'ACTIVE' AND a.is_primary AND a.start_date = ${d}::date)`).execute();
        for (const b of back) await setActive(trx, actor, b.id, true, b.name);
      });
    } catch (e: any) { console.error('[Axis lifecycle] job', tenantId, e?.message); }
  }
}
