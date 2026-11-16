/**
 * Axis time corrections (migration 912).
 *
 * Every route that changes time somebody already recorded calls
 * `recordTimeCorrection` in the same transaction as the change, so the
 * original values, the actor and the reason are kept whatever path made it.
 *
 * Payroll: the run pays salary plus approved overtime, so a correction never
 * changes a finished run by itself. What it can do is make an approved or paid
 * run wrong after the fact (an absence that should have been unpaid, hours that
 * fed an overtime claim). Such corrections:
 *   - may only be made by an HR administrator (a line manager is refused);
 *   - are flagged PENDING for payroll, and payroll is notified;
 *   - are closed by a payroll reviewer who is not the person who made the
 *     change, recording whether the next run needs an adjustment.
 * The run itself is never edited.
 */
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { NotificationService } from './notification.service.js';
import { PAYROLL_READ_ROLES } from '../lib/hr-pay-access.js';

const fail = (message: string, statusCode: number): never => { throw Object.assign(new Error(message), { statusCode }); };
export const HR_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

export interface CorrectionActor { tenant_id: string; sub: string; role: string }

/** The approved or paid run whose period contains `date`, if any. */
export async function finalisedRunFor(trx: Transaction<Database>, tenantId: string, date: string) {
  return trx.selectFrom('payroll_runs').select(['id', 'status', 'name'])
    .where('tenant_id', '=', tenantId)
    .where('status', 'in', ['APPROVED', 'PAID'])
    .where('period_start', '<=', date as any)
    .where('period_end', '>=', date as any)
    .orderBy('period_end', 'desc')
    .executeTakeFirst();
}

/** Throws unless the reason is present and at least 10 characters. */
export function requireReason(reason: string | null | undefined): string {
  const r = (reason ?? '').trim();
  if (r.length < 10) fail('Changing recorded time needs a reason of at least 10 characters.', 400);
  return r;
}

/** Call before changing recorded time on `date`: refuses a line manager when
 *  payroll for that date is already approved or paid. */
export async function assertMayCorrect(trx: Transaction<Database>, actor: CorrectionActor, date: string) {
  const run = await finalisedRunFor(trx, actor.tenant_id, date);
  if (run && !HR_ADMIN_ROLES.includes(actor.role)) {
    fail(`Payroll for ${date} is already ${run.status === 'PAID' ? 'paid' : 'approved'}. Ask HR to make this correction so payroll can review it.`, 403);
  }
  return run ?? null;
}

const pick = (row: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));

export async function recordTimeCorrection(trx: Transaction<Database>, actor: CorrectionActor, input: {
  userId: string; date: string; recordType: 'SESSION' | 'ATTENDANCE'; recordId: string;
  before: Record<string, unknown>; after: Record<string, unknown>; fields: string[]; reason: string;
}) {
  const before = pick(input.before, input.fields);
  const after = pick(input.after, input.fields);
  const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
  if (input.fields.every((k) => norm(before[k]) === norm(after[k]))) return null; // nothing changed
  const run = await assertMayCorrect(trx, actor, input.date);
  const row = await trx.insertInto('hr_time_corrections').values({
    tenant_id: actor.tenant_id, user_id: input.userId, work_date: input.date,
    record_type: input.recordType, record_id: input.recordId,
    before_values: JSON.stringify(before), after_values: JSON.stringify(after),
    reason: requireReason(input.reason), corrected_by: actor.sub,
    payroll_run_id: run?.id ?? null, payroll_run_status: run?.status ?? null,
    review_status: run ? 'PENDING' : 'NOT_NEEDED',
  } as any).returningAll().executeTakeFirstOrThrow();
  await trx.insertInto('hr_activity_log').values({
    tenant_id: actor.tenant_id, user_id: actor.sub, action: 'attendance.corrected', module: 'HR',
    metadata: { correction_id: row.id, subject_id: input.userId, date: input.date, record_type: input.recordType, reason: row.reason, payroll_run_id: row.payroll_run_id },
  }).execute();
  if (run) {
    const reviewers = await trx.selectFrom('users').select('id')
      .where('tenant_id', '=', actor.tenant_id).where('active', '=', true)
      .where('role', 'in', [...PAYROLL_READ_ROLES] as any).where('id', '!=', actor.sub).execute();
    for (const r of reviewers) {
      await NotificationService.createNotificationInTrx(trx, {
        tenantId: actor.tenant_id, userId: r.id, app: 'nexushr', type: 'warning',
        title: 'Time changed in a finalised payroll period',
        message: `${input.date} is in ${run.name} (${run.status.toLowerCase()}). Review whether the next run needs an adjustment.`,
        link: '/nexushr/time-corrections', entityType: 'hr_time_correction', entityId: row.id,
      });
    }
  }
  return row;
}

/** Payroll's decision on a correction that touched a finalised run. */
export async function reviewTimeCorrection(trx: Transaction<Database>, actor: CorrectionActor, id: string, outcome: 'NO_PAY_CHANGE' | 'ADJUST_NEXT_RUN', note: string | null) {
  if (!(PAYROLL_READ_ROLES as readonly string[]).includes(actor.role)) fail('Only payroll may review a correction to a finalised period.', 403);
  const row = await trx.selectFrom('hr_time_corrections').selectAll()
    .where('tenant_id', '=', actor.tenant_id).where('id', '=', id).forUpdate().executeTakeFirst();
  if (!row) fail('Correction not found.', 404);
  if (row!.review_status !== 'PENDING') fail('This correction does not need a payroll review, or has already had one.', 409);
  if (row!.corrected_by === actor.sub) fail('Someone other than the person who made the correction must review it.', 403);
  if (outcome === 'ADJUST_NEXT_RUN' && !(note ?? '').trim()) fail('Say what the next run needs to adjust.', 400);
  const updated = await trx.updateTable('hr_time_corrections').set({
    review_status: 'REVIEWED', review_outcome: outcome, review_note: note?.trim() || null, reviewed_by: actor.sub, reviewed_at: new Date(),
  }).where('tenant_id', '=', actor.tenant_id).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  await trx.insertInto('hr_activity_log').values({
    tenant_id: actor.tenant_id, user_id: actor.sub, action: 'attendance.correction_reviewed', module: 'Payroll',
    metadata: { correction_id: id, outcome, note: updated.review_note, payroll_run_id: row!.payroll_run_id },
  }).execute();
  return updated;
}
