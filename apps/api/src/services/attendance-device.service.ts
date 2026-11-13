/**
 * Turns raw device punches into the same hr_clock_sessions rows a real
 * ESS clock-in/out produces — deliberately NOT a parallel attendance
 * pipeline. Once a punch pair becomes a `source='DEVICE'` session,
 * hr.routes.ts's existing `syncAttendanceFromSessions()` does the rest
 * (aggregation into hr_attendance, real LATE detection via
 * attendance.service.ts's `computeAttendance()`), exactly as it already
 * does for WEB and MANUAL sessions.
 */
import { withTenant } from '../db/client.js';
import { syncAttendanceFromSessions } from './attendance-recording.service.js';
import { lockEmployeeTime } from './timesheet-integrity.service.js';
import { MAX_SHIFT_MINUTES } from './time-entry.service.js';
import type { RawPunch } from '../lib/device-providers/index.js';
import { addCalendarDays, localDateKey, localMidnight, tenantTimezone, wallClockToUtc } from './tenant-timezone.service.js';

/**
 * Records a batch of raw punches for one device: resolves each PIN to a real
 * employee via attendance_device_enrollments (a punch from an unenrolled PIN
 * lands with user_id=null — an orphan, for HR to assign later — instead of
 * being silently dropped), then reconciles every affected (user, date) into
 * real hr_clock_sessions/hr_attendance rows.
 *
 * Returns per-batch counts for the sync-log row the caller writes.
 */
export async function recordDevicePunches(
  tenantId: string,
  deviceId: string,
  punches: RawPunch[],
): Promise<{ received: number; matched: number }> {
  if (punches.length === 0) return { received: 0, matched: 0 };

  return withTenant(tenantId, async (trx) => {
    const device = await trx.selectFrom('attendance_devices').select(['id', 'timezone']).where('tenant_id', '=', tenantId).where('id', '=', deviceId).forUpdate().executeTakeFirst();
    if (!device) throw new Error('Attendance device no longer registered.');
    const timezone = device.timezone || await tenantTimezone(trx, tenantId);
    const enrollments = await trx.selectFrom('attendance_device_enrollments')
      .select(['external_pin', 'user_id'])
      .where('tenant_id', '=', tenantId).where('device_id', '=', deviceId)
      .execute();
    const pinToUser = new Map(enrollments.map(e => [e.external_pin, e.user_id]));

    const affected = new Map<string, { userId: string; date: string }>();
    let matched = 0;

    for (const punch of punches) {
      const punchedAt = punch.sourceLocalTime ? wallClockToUtc(punch.sourceLocalTime, timezone) : punch.punchedAt;
      const userId = pinToUser.get(punch.externalPin) ?? null;
      if (userId) matched++;
      const inserted = await trx.insertInto('attendance_device_events').values({
        tenant_id: tenantId, device_id: deviceId, external_pin: punch.externalPin,
        user_id: userId, punched_at: punchedAt, source_local_time: punch.sourceLocalTime ?? null,
        device_timezone: timezone, raw_status: punch.rawStatus,
        processed: false,
      }).onConflict((oc) => oc.doNothing()).returning('id').executeTakeFirst();
      if (userId && inserted) {
        const date = localDateKey(punchedAt, timezone);
        for (const day of [addCalendarDays(date, -1), date]) affected.set(`${userId}|${day}`, { userId, date: day });
      }
    }

    await trx.updateTable('attendance_devices')
      .set({ last_heartbeat_at: new Date(), last_sync_at: new Date(), status: 'online', updated_at: new Date() })
      .where('id', '=', deviceId).where('tenant_id', '=', tenantId).execute();

    for (const { userId, date } of [...affected.values()].sort((a, b) => `${a.userId}|${a.date}`.localeCompare(`${b.userId}|${b.date}`))) {
      await reconcileDevicePunchesForUserDate(trx, tenantId, deviceId, userId, date, timezone);
    }

    return { received: punches.length, matched };
  });
}

/**
 * Rebuilds this device's hr_clock_sessions rows for one user/date from every
 * (processed or not) attendance_device_events row that date, then re-runs
 * the existing session→attendance sync. Delete-and-rebuild rather than
 * incremental append: a later punch can change how the whole day pairs (e.g.
 * a missed "out" later corrected by a fresh "in"), and this table only ever
 * holds this device's own derived sessions for that day — WEB/MANUAL
 * sessions the same day are untouched.
 */
export async function reconcileDevicePunchesForUserDate(
  trx: any,
  tenantId: string,
  deviceId: string,
  userId: string,
  dateStr: string,
  timezone?: string,
): Promise<void> {
  await lockEmployeeTime(trx, tenantId, userId);
  const zone = timezone || await tenantTimezone(trx, tenantId);
  // Include the neighbouring dates so a night shift belongs to its start
  // date, and a later out-punch can finish yesterday's open session.
  const from = localMidnight(addCalendarDays(dateStr, -1), zone);
  const to = localMidnight(addCalendarDays(dateStr, 2), zone);
  const events = await trx.selectFrom('attendance_device_events')
    .select(['id', 'punched_at', 'raw_status', 'device_timezone'])
    .where('tenant_id', '=', tenantId).where('device_id', '=', deviceId).where('user_id', '=', userId)
    .where('punched_at', '>=', from).where('punched_at', '<', to)
    .execute();
  type PunchEvent = { id: string; punched_at: Date | string; raw_status: string | null; device_timezone: string | null };
  const uniqueEvents = [...new Map<string, PunchEvent>(events.map((event: PunchEvent) => [`${new Date(event.punched_at).toISOString()}|${event.raw_status}`, event])).values()];
  const dayEvents = uniqueEvents
    .sort((a: any, b: any) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime());
  if (dayEvents.length === 0) return;

  await trx.deleteFrom('hr_clock_sessions')
    .where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('date', '=', dateStr)
    .where('source', '=', 'DEVICE').where('device_id', '=', deviceId)
    .execute();

  // Trust the device's own in/out status only if the batch actually uses
  // both codes — plenty of real ADMS deployments send Status=0 for every
  // punch (state tracking disabled on the unit), which would otherwise pair
  // every punch as a same-instant zero-length session.
  const hasReliableStatus = dayEvents.some((e: any) => e.raw_status === '0') && dayEvents.some((e: any) => e.raw_status === '1');

  type Session = { inAt: Date; outAt: Date | null };
  const sessions: Session[] = [];
  if (hasReliableStatus) {
    let open: Session | null = null;
    for (const e of dayEvents) {
      const at = new Date(e.punched_at);
      if (e.raw_status === '0') {
        if (open) continue; // duplicate/debounced check-in while one is already open
        open = { inAt: at, outAt: null };
        sessions.push(open);
      } else if (e.raw_status === '1') {
        if (!open) continue; // a check-out with nothing open — spurious tap, drop it
        if ((at.getTime() - open.inAt.getTime()) / 60000 > MAX_SHIFT_MINUTES) { open = null; continue; }
        open.outAt = at;
        open = null;
      }
      // status 2/3 (break out/in) — session-level granularity only this phase, ignored.
    }
  } else {
    for (let i = 0; i < dayEvents.length; i++) {
      const inAt = new Date(dayEvents[i].punched_at);
      const candidate = dayEvents[i + 1] ? new Date(dayEvents[i + 1].punched_at) : null;
      const outAt = candidate && (candidate.getTime() - inAt.getTime()) / 60000 <= MAX_SHIFT_MINUTES ? candidate : null;
      sessions.push({ inAt, outAt });
      if (outAt) i++;
    }
  }

  for (const s of sessions.filter(s => localDateKey(s.inAt, zone) === dateStr)) {
    const workedMinutes = s.outAt ? Math.max(0, Math.round((s.outAt.getTime() - s.inAt.getTime()) / 60000)) : null;
    await trx.insertInto('hr_clock_sessions').values({
      tenant_id: tenantId, user_id: userId, date: dateStr,
      clock_in_at: s.inAt, clock_out_at: s.outAt,
      project_name: null, status: s.outAt || Date.now() - s.inAt.getTime() > MAX_SHIFT_MINUTES * 60000 ? 'COMPLETED' : 'ACTIVE',
      total_break_minutes: 0, worked_minutes: workedMinutes,
      source: 'DEVICE', device_id: deviceId,
    }).execute();
  }

  await trx.updateTable('attendance_device_events').set({ processed: true })
    .where('tenant_id', '=', tenantId).where('device_id', '=', deviceId).where('user_id', '=', userId)
    .where('id', 'in', dayEvents.map((e: any) => e.id))
    .execute();

  await syncAttendanceFromSessions(trx, tenantId, userId, dateStr, userId);
}
