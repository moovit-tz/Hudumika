import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

function readSetting(settings: unknown): Record<string, any> {
  if (typeof settings === 'string') {
    try { return JSON.parse(settings) as Record<string, any>; } catch { return {}; }
  }
  return settings && typeof settings === 'object' ? settings as Record<string, any> : {};
}

/** Returns the tenant's configured IANA timezone, validating it before use. */
export async function tenantTimezone(trx: Transaction<Database>, tenantId: string): Promise<string> {
  const row = await trx.selectFrom('tenant_settings').select('settings')
    .where('tenant_id', '=', tenantId).executeTakeFirst();
  const settings = readSetting(row?.settings);
  const timezone = settings.localization?.tz || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw Object.assign(new Error('The workspace timezone is invalid. Correct it in Workspace Settings before processing time records.'), { statusCode: 422 });
  }
  return timezone;
}

function partsAt(instant: Date, timezone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

/** Calendar date in the supplied IANA zone, independent of the API host zone. */
export function localDateKey(instant: Date, timezone: string): string {
  const p = partsAt(instant, timezone);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Convert a device's timezone-free wall clock (`YYYY-MM-DD HH:mm:ss`) to an
 * instant. ADMS does not send an offset; using `new Date(wallClock)` would
 * silently depend on whichever timezone the API host happens to run in.
 * During a repeated DST hour the first matching occurrence is chosen; the
 * original wall clock and zone are retained on the event for review.
 */
export function wallClockToUtc(value: string, timezone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error('Device timestamp must use YYYY-MM-DD HH:mm:ss.');
  const [, ys, mos, ds, hs, mis, ss] = match;
  const target = Date.UTC(+ys, +mos - 1, +ds, +hs, +mis, +ss);
  const check = new Date(target);
  if (check.getUTCFullYear() !== +ys || check.getUTCMonth() !== +mos - 1 || check.getUTCDate() !== +ds
      || check.getUTCHours() !== +hs || check.getUTCMinutes() !== +mis || check.getUTCSeconds() !== +ss) {
    throw new Error('Device timestamp is not a valid calendar time.');
  }

  let candidate = target;
  for (let i = 0; i < 5; i++) {
    const p = partsAt(new Date(candidate), timezone);
    const renderedAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    const delta = target - renderedAsUtc;
    if (delta === 0) return new Date(candidate);
    candidate += delta;
  }
  throw new Error('Device timestamp falls in a nonexistent local-time interval for the configured timezone.');
}

/** Add calendar days without using the host's local timezone or DST rules. */
export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

/** Resolve local midnight for a calendar date; used to bound a tenant-local day. */
export function localMidnight(date: string, timezone: string): Date {
  try { return wallClockToUtc(`${date} 00:00:00`, timezone); }
  catch {
    // A small number of zones move clocks at midnight. The local civil day
    // still exists, beginning at its first valid wall-clock minute.
    for (let minute = 1; minute <= 180; minute++) {
      const hour = String(Math.floor(minute / 60)).padStart(2, '0');
      const min = String(minute % 60).padStart(2, '0');
      try { return wallClockToUtc(`${date} ${hour}:${min}:00`, timezone); } catch { /* try the next minute */ }
    }
    throw new Error('Could not resolve the start of this local calendar day.');
  }
}

/** Allocate an elapsed interval into the tenant's local calendar days. Durations
 * are measured between absolute instants, so DST days can contain 23 or 25
 * hours. Integer rounding is applied once across the complete interval. */
export function splitIntervalByLocalDay(start: Date, end: Date, timezone: string): Array<{ date: string; minutes: number }> {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
    throw new Error('Time interval bounds are invalid.');
  }
  if (end.getTime() === start.getTime()) return [];
  const parts: Array<{ date: string; exactMinutes: number }> = [];
  let cursor = start;
  while (cursor < end) {
    const date = localDateKey(cursor, timezone);
    const nextDay = localMidnight(addCalendarDays(date, 1), timezone);
    const boundary = nextDay > cursor ? nextDay : new Date(cursor.getTime() + 60_000);
    const segmentEnd = boundary < end ? boundary : end;
    parts.push({ date, exactMinutes: (segmentEnd.getTime() - cursor.getTime()) / 60_000 });
    cursor = segmentEnd;
  }
  const totalMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  const allocated = parts.map(part => Math.floor(part.exactMinutes));
  let remainder = totalMinutes - allocated.reduce((sum, n) => sum + n, 0);
  const fractionalOrder = parts.map((part, index) => ({ index, fraction: part.exactMinutes - allocated[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < remainder; i++) allocated[fractionalOrder[i % fractionalOrder.length].index]++;
  return parts.map((part, index) => ({ date: part.date, minutes: allocated[index] }));
}
