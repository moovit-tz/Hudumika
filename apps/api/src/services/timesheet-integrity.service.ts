import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import { computeAttendance } from './attendance.service.js';
import { resolveDirectManager } from './org-chart.service.js';

const fail = (message: string, statusCode = 400): never => { throw Object.assign(new Error(message), { statusCode }); };

export function dateOnly(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Use a valid YYYY-MM-DD date.');
  return value;
}

export function timesheetRange(from: string, to: string) {
  dateOnly(from); dateOnly(to);
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (days < 1 || days > 366) fail('Choose an ordered date range of at most 366 days.');
  return { from, to, days };
}

export async function lockEmployeeTime(trx: Transaction<Database>, tenantId: string, userId: string) {
  await sql`select pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${'clock-in:' + userId}))`.execute(trx);
}

export async function canReviewTime(trx: Transaction<Database>, actor: { tenant_id: string; sub: string; role: string }, employeeId: string) {
  if (actor.sub === employeeId) return false;
  if (['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(actor.role)) return true;
  return ['MANAGER', 'SENIOR'].includes(actor.role) && (await resolveDirectManager(trx, actor.tenant_id, employeeId))?.user_id === actor.sub;
}

export async function plannedTime(trx: Transaction<Database>, tenantId: string, userId: string, from: string, to: string) {
  const [assignments, defaultShift, holidays, leaves] = await Promise.all([
    trx.selectFrom('hr_shift_assignments as a').innerJoin('hr_shifts as s', 's.id', 'a.shift_id')
      .select(['a.date', 's.start_time', 's.end_time', 's.break_minutes', 's.grace_minutes'])
      .where('a.tenant_id', '=', tenantId).where('s.tenant_id', '=', tenantId).where('a.user_id', '=', userId).where('a.date', '>=', from).where('a.date', '<=', to).execute(),
    trx.selectFrom('hr_shifts').selectAll().where('tenant_id', '=', tenantId).where('is_default', '=', true).where('active', '=', true).executeTakeFirst(),
    trx.selectFrom('hr_holidays').select('date').where('tenant_id', '=', tenantId).where('is_working_day', '=', false).where('date', '>=', from).where('date', '<=', to).execute(),
    trx.selectFrom('hr_leaves').select(['from_date', 'to_date']).where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('status', '=', 'APPROVED').where('from_date', '<=', to).where('to_date', '>=', from).execute(),
  ]);
  const key = (v: unknown) => v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : String(v).slice(0, 10);
  const assigned = new Map(assignments.map(a => [key(a.date), a]));
  const daysOff = new Set(holidays.map(h => key(h.date)));
  let plannedDays = 0, plannedMinutes = 0;
  for (const day = new Date(from + 'T00:00:00Z'); day <= new Date(to + 'T00:00:00Z'); day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    const shift = assigned.get(date);
    if (!shift && ([0, 6].includes(day.getUTCDay()) || daysOff.has(date))) continue;
    if (leaves.some(l => key(l.from_date) <= date && key(l.to_date) >= date)) continue;
    // A dated assignment explicitly schedules a rest day/holiday. Otherwise
    // the default shift applies on weekdays; an unconfigured tenant uses 8h.
    const s = shift ?? defaultShift;
    const minutes = s ? computeAttendance(s.start_time, s.end_time, { startTime: s.start_time, endTime: s.end_time, breakMinutes: s.break_minutes, graceMinutes: s.grace_minutes }).workedMinutes : 480;
    if (minutes > 0) { plannedDays++; plannedMinutes += minutes; }
  }
  return { plannedDays, plannedHours: plannedMinutes / 60 };
}
