/**
 * Turning attendance into hours, and hours into money.
 *
 * The arithmetic is pure, for the same reason the payroll engine is: an error
 * here underpays somebody, and the part that decides the number should be
 * provable without a database.
 *
 * The piece that is easy to miss is that the overtime *rate* is a property of
 * the date, not of the hours. Under the ELRA overtime is 1.5x, but work on a
 * weekly rest day or a public holiday is 2x — so the same three hours are worth
 * different money depending on which day they fell on. That is why this reads
 * the holiday calendar rather than taking a multiplier from the caller: given a
 * choice, a form will always be filled in with the cheaper one.
 */

export type OvertimeKind = 'NORMAL' | 'REST_DAY' | 'PUBLIC_HOLIDAY';

/** ELRA: 1.5x ordinarily, 2x on a rest day or public holiday. */
export const OVERTIME_MULTIPLIER: Record<OvertimeKind, number> = {
  NORMAL: 1.5,
  REST_DAY: 2.0,
  PUBLIC_HOLIDAY: 2.0,
};

/**
 * The cap is 50 hours in a rolling four-week cycle.
 *
 * Not "12 hours a week", which is the figure most systems encode. 12 hours is
 * the maximum length of a working day including breaks — a different rule about
 * a different thing.
 */
export const OVERTIME_CAP_HOURS_PER_4_WEEKS = 50;

export interface Shift {
  startTime: string;   // HH:MM
  endTime: string;     // HH:MM
  breakMinutes: number;
  graceMinutes: number;
}

/** Minutes since midnight, or null for an unparseable/absent time. */
function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm));
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export interface AttendanceComputation {
  workedMinutes: number;
  overtimeMinutes: number;
  /** Recomputed from the clock times and the shift, not taken from the row. */
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'INCOMPLETE';
  lateByMinutes: number;
  /** Why the status is what it is, in words. */
  note?: string;
}

/**
 * What a day's clock times amount to against a shift.
 *
 * An overnight shift is handled by treating an end time earlier than the start
 * as the following day. Without that, a night watchman clocking 20:00–06:00
 * computes as minus fourteen hours, which the constraint would reject and the
 * payroll would never see.
 */
export function computeAttendance(
  clockIn: string | null,
  clockOut: string | null,
  shift: Shift,
): AttendanceComputation {
  const inM = toMinutes(clockIn);
  const outM = toMinutes(clockOut);
  const startM = toMinutes(shift.startTime) ?? 0;
  const endM0 = toMinutes(shift.endTime) ?? 0;
  // Overnight shift: the end belongs to the next day.
  const endM = endM0 <= startM ? endM0 + 1440 : endM0;
  const scheduled = Math.max(0, endM - startM - (shift.breakMinutes ?? 0));

  if (inM === null && outM === null) {
    return { workedMinutes: 0, overtimeMinutes: 0, status: 'ABSENT', lateByMinutes: 0 };
  }
  // One clock time on its own cannot produce a duration. Reporting zero would
  // say the person worked nothing, which is a different and worse claim.
  if (inM === null || outM === null) {
    return {
      workedMinutes: 0, overtimeMinutes: 0, status: 'INCOMPLETE', lateByMinutes: 0,
      note: inM === null ? 'No clock-in recorded' : 'No clock-out recorded',
    };
  }

  const outAdjusted = outM <= inM ? outM + 1440 : outM;
  const gross = outAdjusted - inM;
  const worked = Math.max(0, gross - (shift.breakMinutes ?? 0));

  const lateBy = Math.max(0, inM - startM - (shift.graceMinutes ?? 0));
  const overtime = Math.max(0, worked - scheduled);

  return {
    workedMinutes: worked,
    overtimeMinutes: overtime,
    status: lateBy > 0 ? 'LATE' : 'PRESENT',
    lateByMinutes: lateBy,
    note: lateBy > 0
      ? `Arrived ${lateBy} minute(s) after the ${shift.graceMinutes}-minute grace period`
      : undefined,
  };
}

/**
 * Which overtime rate a date attracts.
 *
 * `nonWorkingDates` comes from the holiday calendar, so a public holiday is
 * recognised as one wherever the tenant operates rather than guessed at.
 */
export function overtimeKindFor(
  dateISO: string,
  nonWorkingDates: Set<string>,
  weekend: number[] = [0, 6],
): OvertimeKind {
  if (nonWorkingDates.has(dateISO)) return 'PUBLIC_HOLIDAY';
  const day = new Date(dateISO + 'T00:00:00Z').getUTCDay();
  return weekend.includes(day) ? 'REST_DAY' : 'NORMAL';
}

/**
 * What overtime is worth.
 *
 * The hourly rate is derived from basic pay and the tenant's stated working
 * pattern — the same `working_days_per_month` / `working_hours_per_day` figures
 * payroll uses for any daily or hourly derivation. Passing them in rather than
 * assuming 22 and 8 keeps one definition of a working month.
 */
export function overtimeAmount(
  basicSalary: number,
  hours: number,
  multiplier: number,
  workingDaysPerMonth: number,
  workingHoursPerDay: number,
): { hourlyRate: number; amount: number } {
  if (workingDaysPerMonth <= 0 || workingHoursPerDay <= 0) return { hourlyRate: 0, amount: 0 };
  const hourlyRate = basicSalary / workingDaysPerMonth / workingHoursPerDay;
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  return {
    hourlyRate: round2(hourlyRate),
    amount: round2(hourlyRate * hours * multiplier),
  };
}

/**
 * Whether a claim fits under the four-week cap.
 *
 * Returns the numbers rather than a bare boolean, because a refusal that cannot
 * say how many hours are already claimed is not actionable.
 */
export function checkOvertimeCap(
  hoursAlreadyApproved: number,
  hoursRequested: number,
  capHours: number = OVERTIME_CAP_HOURS_PER_4_WEEKS,
): { ok: boolean; remaining: number; reason?: string } {
  const remaining = Math.max(0, capHours - hoursAlreadyApproved);
  if (hoursRequested > remaining) {
    return {
      ok: false, remaining,
      reason: `The statutory cap is ${capHours} hours in any four-week cycle. `
        + `${hoursAlreadyApproved} already approved, so ${remaining} remain and ${hoursRequested} were claimed.`,
    };
  }
  return { ok: true, remaining: remaining - hoursRequested };
}

/** The four-week window a date sits in, counted back from that date. */
export function fourWeekWindow(dateISO: string): { from: string; to: string } {
  const to = new Date(dateISO + 'T00:00:00Z');
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 27);   // 28 days inclusive
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}
