import { computeAttendance, type Shift } from './attendance.service.js';

/** The day's shift for LATE detection: an explicit hr_shift_assignments row
 *  for that user/date, else the tenant's one `is_default` hr_shifts row,
 *  else a bare fallback for a tenant that hasn't configured shifts at all. */
export async function resolveShiftFor(trx: any, tenantId: string, userId: string, dateStr: string): Promise<Shift> {
  const assigned = await trx.selectFrom('hr_shift_assignments as a')
    .innerJoin('hr_shifts as s', 's.id', 'a.shift_id')
    .select(['s.start_time', 's.end_time', 's.break_minutes', 's.grace_minutes'])
    .where('a.tenant_id', '=', tenantId).where('a.user_id', '=', userId).where('a.date', '=', dateStr)
    .where('s.tenant_id', '=', tenantId)
    .executeTakeFirst();
  const row = assigned ?? await trx.selectFrom('hr_shifts')
    .select(['start_time', 'end_time', 'break_minutes', 'grace_minutes'])
    .where('tenant_id', '=', tenantId).where('is_default', '=', true)
    .executeTakeFirst();
  if (!row) return { startTime: '08:00', endTime: '17:00', breakMinutes: 0, graceMinutes: 10 };
  return { startTime: row.start_time, endTime: row.end_time, breakMinutes: row.break_minutes, graceMinutes: row.grace_minutes };
}

/**
 * Recomputes an hr_attendance row's clock_in/clock_out/worked_minutes from
 * every hr_clock_sessions row that date, instead of whichever single
 * session most recently wrote to it. A day genuinely can hold more than one
 * session — a real clock session plus a manual backfill, a missed
 * clock-out fixed by clocking in again, lunch taken outside the in-session
 * break button, or now a biometric device punch pair (source='DEVICE',
 * 379_attendance_devices.sql) — and hr_attendance is one row per day, so
 * without this the admin Attendance dashboard's number is whichever session
 * happened to write last, not the employee's real total. Called after every
 * write to hr_clock_sessions for that user/date (start, stop, manual, device).
 *
 * Status is now genuinely derived via computeAttendance() (attendance.
 * service.ts) against the day's real shift, instead of the caller always
 * passing 'PRESENT' — that made every previous call site's LATE detection
 * dead code: clock-in forced 'PRESENT' immediately, and clock-out passed no
 * override at all, so nothing ever revisited it. An explicit statusOverride
 * (a manual HR mark: ON_LEAVE, ABSENT, ...) still always wins.
 */
export async function syncAttendanceFromSessions(trx: any, tenantId: string, userId: string, dateStr: string, actorId: string, statusOverride?: string) {
  const sessions = await trx.selectFrom('hr_clock_sessions')
    .select(['clock_in_at', 'clock_out_at', 'worked_minutes', 'status', 'source'])
    .where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('date', '=', dateStr)
    .where('status', '!=', 'CANCELLED')
    .execute();
  if (sessions.length === 0) return;

  const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  let earliestIn: Date | null = null;
  let latestOut: Date | null = null;
  let totalWorked = 0;
  let hasDevice = false;
  let hasWeb = false;
  let unknown = false;
  for (const s of sessions) {
    const inAt = new Date(s.clock_in_at as any);
    if (!earliestIn || inAt < earliestIn) earliestIn = inAt;
    if (s.source === 'DEVICE') hasDevice = true;
    else if (s.source !== 'MANUAL') hasWeb = true; // WEB, or the pre-migration default
    if (s.status === 'COMPLETED') {
      if (s.worked_minutes == null) unknown = true;
      totalWorked += (s.worked_minutes as number) || 0;
      if (s.clock_out_at) {
        const outAt = new Date(s.clock_out_at as any);
        if (!latestOut || outAt > latestOut) latestOut = outAt;
      }
    }
  }

  // computeAttendance requires both times to classify PRESENT/LATE — pass
  // earliestIn for both when nobody has clocked out yet. lateBy/status don't
  // depend on outM once inM is non-null, so this is safe; it just means the
  // worked/overtime figures it also returns aren't meaningful mid-shift,
  // which is fine since totalWorked (summed from real sessions) is used
  // instead of computeAttendance's own gap-based total.
  const shift = await resolveShiftFor(trx, tenantId, userId, dateStr);
  const computed = computeAttendance(fmt(earliestIn as Date), fmt(latestOut ?? (earliestIn as Date)), shift);

  const existing = await trx.selectFrom('hr_attendance').select('id')
    .where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('date', '=', dateStr)
    .executeTakeFirst();

  const patch: Record<string, unknown> = {
    clock_in: earliestIn ? fmt(earliestIn) : null,
    clock_out: latestOut ? fmt(latestOut) : null,
    worked_minutes: totalWorked,
    status: statusOverride ?? (unknown ? 'INCOMPLETE' : computed.status),
    // A day mixing sources (rare) counts as BIOMETRIC/WEB over MANUAL — the
    // more automated source is the more trustworthy record of what happened.
    method: hasDevice ? 'BIOMETRIC' : hasWeb ? 'WEB' : 'MANUAL',
    recorded_by: actorId,
    updated_at: new Date(),
  };
  if (existing) {
    await trx.updateTable('hr_attendance').set(patch).where('id', '=', existing.id).where('tenant_id', '=', tenantId).execute();
  } else {
    await trx.insertInto('hr_attendance').values({
      tenant_id: tenantId, user_id: userId, date: dateStr, ...patch,
    }).execute();
  }
}

