// RFC5545 (.ics) export/import — hand-rolled rather than a new dependency.
// Export is safe to hand-roll since this module controls the exact shape it
// writes. Import is the riskier half of that trade (real-world files from
// Google/Outlook/Apple vary), so it's deliberately defensive: an unparseable
// line or block is skipped, never thrown — a partially-imported calendar
// beats a failed import, and the caller sees how many events came through.
import type { RecurrenceRule } from '../services/calendar-recurrence.service.js';

export interface ICSEvent {
  uid: string;
  title: string;
  startAt: string; // ISO
  endAt: string;   // ISO
  description?: string | null;
  location?: string | null;
  allDay: boolean;
  recurrence?: RecurrenceRule | null;
}

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function formatICSDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function formatICSDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function escapeICSText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function unescapeICSText(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

/** RFC5545 requires lines folded at 75 octets, each continuation prefixed
 *  with a space. Not folding produces a technically-invalid file some
 *  strict readers reject on long descriptions. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join('\r\n');
}

function recurrenceToRRule(r: RecurrenceRule): string {
  const parts = [`FREQ=${r.freq.toUpperCase()}`];
  if (r.interval && r.interval !== 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.byWeekday?.length) parts.push(`BYDAY=${r.byWeekday.map(w => WEEKDAY_CODES[w]).join(',')}`);
  if (r.until) parts.push(`UNTIL=${r.until.replace(/-/g, '')}T235959Z`);
  if (r.count) parts.push(`COUNT=${r.count}`);
  return parts.join(';');
}

export function eventsToICS(events: ICSEvent[], calendarName = 'Hudumika Calendar'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hudumika//Calendar//EN', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeICSText(calendarName)}`,
  ];
  const stamp = formatICSDateTime(new Date().toISOString());
  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatICSDate(ev.startAt)}`);
      // All-day DTEND is exclusive per RFC5545 — the day AFTER the last
      // real day, not the last day itself.
      const endExclusive = new Date(ev.endAt);
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
      lines.push(`DTEND;VALUE=DATE:${formatICSDate(endExclusive.toISOString())}`);
    } else {
      lines.push(`DTSTART:${formatICSDateTime(ev.startAt)}`);
      lines.push(`DTEND:${formatICSDateTime(ev.endAt)}`);
    }
    lines.push(`SUMMARY:${escapeICSText(ev.title)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeICSText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeICSText(ev.location)}`);
    if (ev.recurrence) lines.push(`RRULE:${recurrenceToRRule(ev.recurrence)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Converts a wall-clock date/time in a named IANA zone to the correct UTC
 *  instant, using Intl's built-in tz database rather than a new dependency
 *  — handles DST correctly for the specific date given, not just a fixed
 *  offset. Standard "format a guess, diff against the target, adjust" trick. */
function zonedTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const utcGuess = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = Object.fromEntries(dtf.formatToParts(utcGuess).map(p => [p.type, p.value]));
    const asIfUtcInZone = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    const offsetMs = asIfUtcInZone - utcGuess.getTime();
    return new Date(utcGuess.getTime() - offsetMs);
  } catch {
    // Unknown/invalid TZID — treat as UTC rather than failing the whole import.
    return utcGuess;
  }
}

function unfoldLines(text: string): string[] {
  const raw = text.split(/\r\n|\n|\r/);
  const unfolded: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

/** Parses `NAME;PARAM=VAL;PARAM2=VAL2:VALUE` into its parts. */
function parseICSLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return null;
  const head = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const [name, ...paramParts] = head.split(';');
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

/** Parses a DTSTART/DTEND value+params into an ISO UTC string and whether
 *  it was an all-day (VALUE=DATE) value. Returns null if unparseable. */
function parseICSDateTime(value: string, params: Record<string, string>): { iso: string; allDay: boolean } | null {
  const v = value.trim();
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m) return null;
    return { iso: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString(), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z === 'Z' || !params.TZID) {
    return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString(), allDay: false };
  }
  return { iso: zonedTimeToUtc(+y, +mo, +d, +h, +mi, +s, params.TZID).toISOString(), allDay: false };
}

function parseRRule(value: string): RecurrenceRule | null {
  const parts = Object.fromEntries(value.split(';').map(p => {
    const [k, v] = p.split('=');
    return [k?.toUpperCase(), v];
  }));
  const freqRaw = (parts.FREQ || '').toLowerCase();
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(freqRaw)) return null; // unsupported freq (e.g. HOURLY) — import as a single event instead
  const rule: RecurrenceRule = { freq: freqRaw as RecurrenceRule['freq'], interval: parts.INTERVAL ? Math.max(1, parseInt(parts.INTERVAL, 10) || 1) : 1 };
  if (parts.BYDAY) {
    const codes = parts.BYDAY.split(',').map(c => c.replace(/^[+-]?\d+/, '')); // strip any leading ordinal (e.g. "1MO") — not supported, just take the weekday
    const days = codes.map(c => WEEKDAY_CODES.indexOf(c)).filter(i => i >= 0);
    if (days.length) rule.byWeekday = days;
  }
  if (parts.UNTIL) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(parts.UNTIL);
    if (m) rule.until = `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (parts.COUNT) {
    const c = parseInt(parts.COUNT, 10);
    if (c > 0) rule.count = Math.min(c, 1000);
  }
  return rule;
}

export function parseICS(text: string): ICSEvent[] {
  const lines = unfoldLines(text);
  const events: ICSEvent[] = [];
  let cur: Partial<ICSEvent> & { _startAllDay?: boolean; _endAllDay?: boolean } | null = null;

  for (const rawLine of lines) {
    if (!rawLine) continue;
    if (rawLine === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (rawLine === 'END:VEVENT') {
      if (cur && cur.title && cur.startAt && cur.endAt) {
        events.push({
          uid: cur.uid || crypto.randomUUID(),
          title: cur.title, startAt: cur.startAt, endAt: cur.endAt,
          description: cur.description ?? null, location: cur.location ?? null,
          allDay: !!cur._startAllDay, recurrence: cur.recurrence ?? null,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue; // outside a VEVENT block (VCALENDAR/VTIMEZONE headers etc.) — nothing to collect

    const parsed = parseICSLine(rawLine);
    if (!parsed) continue;
    switch (parsed.name) {
      case 'UID': cur.uid = parsed.value.trim(); break;
      case 'SUMMARY': cur.title = unescapeICSText(parsed.value); break;
      case 'DESCRIPTION': cur.description = unescapeICSText(parsed.value); break;
      case 'LOCATION': cur.location = unescapeICSText(parsed.value); break;
      case 'DTSTART': {
        const parsedDt = parseICSDateTime(parsed.value, parsed.params);
        if (parsedDt) { cur.startAt = parsedDt.iso; cur._startAllDay = parsedDt.allDay; }
        break;
      }
      case 'DTEND': {
        const parsedDt = parseICSDateTime(parsed.value, parsed.params);
        if (parsedDt) {
          let iso = parsedDt.iso;
          // All-day DTEND is exclusive in the source file — pull it back one
          // day so storage matches this platform's own inclusive convention.
          if (parsedDt.allDay) {
            const d = new Date(iso);
            d.setUTCDate(d.getUTCDate() - 1);
            iso = d.toISOString();
          }
          cur.endAt = iso; cur._endAllDay = parsedDt.allDay;
        }
        break;
      }
      case 'RRULE': cur.recurrence = parseRRule(parsed.value) ?? undefined; break;
      default: break; // every other field (ORGANIZER, ATTENDEE, STATUS, ...) is intentionally ignored
    }
  }

  return events;
}
