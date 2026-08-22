// Expands a recurring calendar event into concrete occurrences within a
// requested date range. A light custom recurrence model — {freq, interval,
// byWeekday?, until?, count?} — rather than raw RFC5545 RRULE text; the app
// owns expansion end-to-end rather than parsing/generating RRULE strings by
// hand, the same "compute the calendar math ourselves" shape
// holiday-calendar.service.ts already uses for working-day counting.

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number; // every N units, >= 1
  byWeekday?: number[]; // 0=Sun..6=Sat — only meaningful for 'weekly'
  until?: string; // ISO date, inclusive
  count?: number; // total occurrences across the whole series (not just this range)
}

export interface EventOccurrence {
  start: Date;
  end: Date;
  /** YYYY-MM-DD of this occurrence's original (un-overridden) date — the
   *  key calendar_event_overrides matches against. */
  originalDate: string;
}

const MS_DAY = 86_400_000;
const MAX_OCCURRENCES_SCANNED = 2000; // safety cap for a no-end-date series

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Adds `months` to a date, clamping to the last real day of the target
 *  month rather than rolling over (Jan 31 + 1 month -> Feb 28/29, not Mar 3
 *  — matches Google Calendar's own monthly-recurrence behaviour). */
function addMonthsClamped(d: Date, months: number): Date {
  const day = d.getUTCDate();
  const targetMonthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const daysInTargetMonth = new Date(Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0)).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(day, daysInTargetMonth));
  return targetMonthStart;
}

export function expandRecurrence(
  masterStart: Date,
  masterEnd: Date,
  rule: RecurrenceRule,
  rangeFrom: Date,
  rangeTo: Date,
): EventOccurrence[] {
  const durationMs = masterEnd.getTime() - masterStart.getTime();
  const until = rule.until ? new Date(`${rule.until}T23:59:59.999Z`) : null;
  const interval = Math.max(1, rule.interval || 1);
  const results: EventOccurrence[] = [];

  let occurrenceCount = 0;
  let scanned = 0;

  function accept(start: Date): boolean {
    occurrenceCount++;
    if (rule.count && occurrenceCount > rule.count) return false;
    if (until && start.getTime() > until.getTime()) return false;
    if (start.getTime() >= rangeFrom.getTime() && start.getTime() <= rangeTo.getTime()) {
      results.push({ start, end: new Date(start.getTime() + durationMs), originalDate: isoDate(start) });
    }
    return true;
  }

  if (rule.freq === 'daily') {
    let cur = new Date(masterStart);
    while (scanned++ < MAX_OCCURRENCES_SCANNED && cur.getTime() <= rangeTo.getTime()) {
      if (!accept(cur)) break;
      cur = new Date(cur.getTime() + interval * MS_DAY);
    }
  } else if (rule.freq === 'weekly') {
    const weekdays = rule.byWeekday && rule.byWeekday.length > 0 ? [...new Set(rule.byWeekday)].sort() : [masterStart.getUTCDay()];
    // Walk week-by-week from the master's own week, only ever emitting
    // occurrences on/after masterStart so recurrence never invents an
    // occurrence earlier than the event actually starts.
    const firstWeekStart = new Date(masterStart.getTime() - masterStart.getUTCDay() * MS_DAY);
    let weekStart = new Date(Date.UTC(firstWeekStart.getUTCFullYear(), firstWeekStart.getUTCMonth(), firstWeekStart.getUTCDate()));
    let weekIndex = 0;
    outer: while (scanned++ < MAX_OCCURRENCES_SCANNED && weekStart.getTime() <= rangeTo.getTime()) {
      if (weekIndex % interval === 0) {
        for (const wd of weekdays) {
          const candidate = new Date(weekStart.getTime() + wd * MS_DAY);
          candidate.setUTCHours(masterStart.getUTCHours(), masterStart.getUTCMinutes(), masterStart.getUTCSeconds(), masterStart.getUTCMilliseconds());
          if (candidate.getTime() < masterStart.getTime()) continue;
          if (!accept(candidate)) break outer;
        }
      }
      weekStart = new Date(weekStart.getTime() + 7 * MS_DAY);
      weekIndex++;
    }
  } else if (rule.freq === 'monthly') {
    let n = 0;
    while (scanned++ < MAX_OCCURRENCES_SCANNED) {
      const cur = addMonthsClamped(masterStart, n * interval);
      if (cur.getTime() > rangeTo.getTime()) break;
      if (!accept(cur)) break;
      n++;
    }
  } else if (rule.freq === 'yearly') {
    let n = 0;
    while (scanned++ < MAX_OCCURRENCES_SCANNED) {
      const cur = addMonthsClamped(masterStart, n * interval * 12);
      if (cur.getTime() > rangeTo.getTime()) break;
      if (!accept(cur)) break;
      n++;
    }
  }

  return results;
}

/** True if a recurrence rule is structurally sane — checked at write time
 *  so a malformed rule can't silently expand into nothing (or loop the
 *  scan cap) for a reason the user never sees. */
export function validateRecurrenceRule(rule: unknown): rule is RecurrenceRule {
  if (!rule || typeof rule !== 'object') return false;
  const r = rule as Record<string, unknown>;
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(r.freq as string)) return false;
  if (typeof r.interval !== 'number' || r.interval < 1 || r.interval > 365) return false;
  if (r.byWeekday !== undefined && (!Array.isArray(r.byWeekday) || r.byWeekday.some(w => typeof w !== 'number' || w < 0 || w > 6))) return false;
  if (r.until !== undefined && (typeof r.until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.until))) return false;
  if (r.count !== undefined && (typeof r.count !== 'number' || r.count < 1 || r.count > 1000)) return false;
  return true;
}
