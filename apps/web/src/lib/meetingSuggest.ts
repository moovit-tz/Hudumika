import { apiFetch } from './api.js';
import { getTenantLocale } from './tenantLocale.js';

export interface MeetingSlot { start: string; end: string; }
export interface MeetingDaySlots { date: string; label: string; slots: MeetingSlot[]; }
export interface MeetingBookingPage { slug: string; durationMinutes: number; timezone: string; }

function resolveTimezone(): string {
  return getTenantLocale().timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Minutes to add to UTC to get `timezone`'s local clock (e.g. +180 for East
 *  Africa Time) — derived from Intl rather than a hardcoded table, so it
 *  stays correct for any zone the tenant picks, DST included. */
function utcOffsetMinutes(timezone: string, date = new Date()): number {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)) parts[p.type] = p.value;
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

/** getAvailableSlots (booking-pages.service.ts) reads `workingStartTime` as
 *  a literal UTC clock time, not timezone-adjusted — so "9am in the
 *  tenant's own timezone" has to be converted to UTC before it's stored, or
 *  every slot would land at 9am UTC regardless of where the tenant is. */
function localHHMMToUtc(hhmm: string, offsetMinutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m - offsetMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

let cached: MeetingBookingPage | null = null;

/**
 * Finds the sender's first active booking page, or quietly creates one —
 * this is real, already-shipped infrastructure (Calendar's Calendly-style
 * scheduling links, 287_calendar_v3.sql), not a new system built for Email.
 * A page made here shows up in Calendar → Booking Pages exactly like one a
 * person creates by hand, so there's nothing Email-specific to maintain.
 */
export async function ensureMeetingBookingPage(): Promise<MeetingBookingPage> {
  if (cached) return cached;
  const listRes = await apiFetch('/v1/tasks/booking-pages').catch(() => null);
  const list = Array.isArray(listRes) ? listRes : (listRes?.data ?? []);
  const active = list.find((p: any) => p.active !== false);
  if (active) {
    cached = { slug: active.slug, durationMinutes: active.durationMinutes, timezone: active.timezone };
    return cached;
  }

  const tz = resolveTimezone();
  const offset = utcOffsetMinutes(tz);
  const created = await apiFetch('/v1/tasks/booking-pages', {
    method: 'POST',
    body: JSON.stringify({
      id: crypto.randomUUID(),
      title: '30-Minute Meeting',
      durationMinutes: 30,
      bufferMinutes: 0,
      workingDays: [1, 2, 3, 4, 5],
      workingStartTime: localHHMMToUtc('09:00', offset),
      workingEndTime: localHHMMToUtc('17:00', offset),
      timezone: tz,
      bookingWindowDays: 30,
    }),
  });
  const row = created?.data ?? created;
  cached = { slug: row.slug, durationMinutes: row.durationMinutes, timezone: row.timezone };
  return cached;
}

/** Walks forward day by day (skipping weekends/fully-booked days, same as
 *  the public booking page itself would) collecting up to `maxDays` days
 *  that have at least one open slot, capped to `maxPerDay` slots each. */
export async function suggestUpcomingSlots(page: MeetingBookingPage, maxDays = 2, maxPerDay = 2): Promise<MeetingDaySlots[]> {
  const tz = resolveTimezone();
  const days: MeetingDaySlots[] = [];
  const cursor = new Date();
  for (let guard = 0; guard < 14 && days.length < maxDays; guard++) {
    cursor.setDate(cursor.getDate() + 1);
    const dateStr = cursor.toISOString().slice(0, 10);
    const res = await apiFetch(`/v1/booking-public/${page.slug}/slots?date=${dateStr}`).catch(() => null);
    const starts: string[] = Array.isArray(res?.data) ? res.data : [];
    if (starts.length === 0) continue;
    days.push({
      date: dateStr,
      label: new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz }).format(cursor),
      slots: starts.slice(0, maxPerDay).map(iso => ({ start: iso, end: new Date(new Date(iso).getTime() + page.durationMinutes * 60000).toISOString() })),
    });
  }
  return days;
}

export function formatSlotRange(slot: MeetingSlot, timezone = resolveTimezone()): string {
  const fmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone });
  return `${fmt.format(new Date(slot.start))} – ${fmt.format(new Date(slot.end))}`;
}

export function timezoneLabel(timezone = resolveTimezone()): string {
  const offsetMin = utcOffsetMinutes(timezone);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${timezone.replace(/_/g, ' ')} (GMT${sign}${hh}:${mm})`;
}

/** The plain-text block Insert appends to a reply/compose body — this is a
 *  plain <textarea>, not a rich editor, so the "card" from the feature this
 *  mirrors becomes readable text plus a real, clickable booking link rather
 *  than embedded interactive UI. */
export function buildMeetingSuggestionText(days: MeetingDaySlots[], bookingUrl: string, timezone = resolveTimezone()): string {
  const lines = [`Here are some times that work for me (${timezoneLabel(timezone)}):`];
  for (const day of days) {
    lines.push(`• ${day.label} — ${day.slots.map(s => formatSlotRange(s, timezone)).join(' or ')}`);
  }
  lines.push('', `Pick whichever works for you and it'll go straight on my calendar: ${bookingUrl}`);
  return lines.join('\n');
}
