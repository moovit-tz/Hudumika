/**
 * Date helpers that work whichever way the driver hands a column back.
 *
 * `db/client.ts` registers a type parser so a Postgres DATE arrives as the
 * literal 'YYYY-MM-DD' string it is, rather than a JS Date at local midnight
 * that JSON-serialises to the previous day in any timezone ahead of UTC.
 *
 * That leaves two shapes in circulation — DATE columns are strings, TIMESTAMPTZ
 * columns are still Dates — and code that assumed Date would throw on the
 * string. The `as Date` casts scattered through the services were exactly that:
 * assertions TypeScript could not check, which is why the breakage showed up at
 * runtime (`expiry.getTime is not a function`) rather than at compile time.
 *
 * These accept both, so a caller never has to know which kind of column it is.
 */

/** 'YYYY-MM-DD' from a DATE string, a Date, or null. */
export function toISODate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    // Local parts, not toISOString(): a DATE has no timezone, so converting to
    // UTC would shift the day for anyone east of Greenwich.
    const p = (n: number) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : toISODate(d);
}

/** Milliseconds since the epoch, or null when there is no usable date. */
export function toEpochMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * A comparison parameter for a DATE column.
 *
 * Passing a JS Date to `where('expiry_date', '<', someDate)` sends a full
 * timestamp that Postgres then casts, which reintroduces the timezone
 * sensitivity DATE columns exist to avoid: "expiring before today" quietly
 * means a different day for a server at UTC+3 than at UTC. A 'YYYY-MM-DD'
 * string is unambiguous, and is what the column actually holds.
 */
export function toDateParam(value: Date | string): string {
  return toISODate(value) ?? String(value);
}

/**
 * Whole days from now until `value`, rounded up. Null when there is no date —
 * callers must decide what "no deadline" means rather than receive a 0 that
 * reads as "due today".
 */
export function daysUntil(value: unknown, from: number = Date.now()): number | null {
  const t = toEpochMs(value);
  return t === null ? null : Math.ceil((t - from) / 86_400_000);
}
