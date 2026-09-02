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
import { syncAttendanceFromSessions } from '../routes/hr.routes.js';
import type { RawPunch } from '../lib/device-providers/index.js';

/** YYYY-MM-DD in the punch's own local time (device sends device-local
 *  wall-clock time with no timezone — same assumption isoDate() makes
 *  elsewhere in this codebase for bare `date` columns). */
function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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
    const enrollments = await trx.selectFrom('attendance_device_enrollments')
      .select(['external_pin', 'user_id'])
      .where('tenant_id', '=', tenantId).where('device_id', '=', deviceId)
      .execute();
    const pinToUser = new Map(enrollments.map(e => [e.external_pin, e.user_id]));

    const affected = new Map<string, { userId: string; date: string }>();
    let matched = 0;

    for (const punch of punches) {
      const userId = pinToUser.get(punch.externalPin) ?? null;
      if (userId) matched++;
      await trx.insertInto('attendance_device_events').values({
        tenant_id: tenantId, device_id: deviceId, external_pin: punch.externalPin,
        user_id: userId, punched_at: punch.punchedAt, raw_status: punch.rawStatus,
        processed: false,
      }).execute();
      if (userId) affected.set(`${userId}|${dateKey(punch.punchedAt)}`, { userId, date: dateKey(punch.punchedAt) });
    }

    await trx.updateTable('attendance_devices')
      .set({ last_heartbeat_at: new Date(), last_sync_at: new Date(), status: 'online', updated_at: new Date() })
      .where('id', '=', deviceId).execute();

    for (const { userId, date } of affected.values()) {
      await reconcileDevicePunchesForUserDate(trx, tenantId, deviceId, userId, date);
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
): Promise<void> {
  const events = await trx.selectFrom('attendance_device_events')
    .select(['id', 'punched_at', 'raw_status'])
    .where('tenant_id', '=', tenantId).where('device_id', '=', deviceId).where('user_id', '=', userId)
    .execute();
  const dayEvents = events
    .filter((e: any) => dateKey(new Date(e.punched_at)) === dateStr)
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
        open.outAt = at;
        open = null;
      }
      // status 2/3 (break out/in) — session-level granularity only this phase, ignored.
    }
  } else {
    for (let i = 0; i < dayEvents.length; i += 2) {
      sessions.push({ inAt: new Date(dayEvents[i].punched_at), outAt: dayEvents[i + 1] ? new Date(dayEvents[i + 1].punched_at) : null });
    }
  }

  for (const s of sessions) {
    const workedMinutes = s.outAt ? Math.max(0, Math.round((s.outAt.getTime() - s.inAt.getTime()) / 60000)) : null;
    await trx.insertInto('hr_clock_sessions').values({
      tenant_id: tenantId, user_id: userId, date: dateStr,
      clock_in_at: s.inAt, clock_out_at: s.outAt,
      project_name: null, status: s.outAt ? 'COMPLETED' : 'ACTIVE',
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
