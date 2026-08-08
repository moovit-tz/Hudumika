/**
 * Proof that attendance becomes hours, and that hours are priced correctly.
 *
 * The cases that matter are the ones a naive implementation gets wrong: an
 * overnight shift, a single clock time, the grace period boundary, and — the
 * expensive one — overtime on a public holiday, which is double time rather
 * than time and a half.
 *
 *   PROBE=1 npx tsx src/scripts/check-attendance-overtime.ts
 */
import { db } from '../db/client.js';
import {
  computeAttendance, overtimeKindFor, overtimeAmount, checkOvertimeCap,
  fourWeekWindow, OVERTIME_MULTIPLIER, OVERTIME_CAP_HOURS_PER_4_WEEKS,
} from '../services/attendance.service.js';
import { HolidaysService } from '../services/holidays.service.js';

let fails = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (!cond) fails++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
};

const DAY: any = { startTime: '08:00', endTime: '17:00', breakMinutes: 60, graceMinutes: 10 };
const NIGHT: any = { startTime: '20:00', endTime: '06:00', breakMinutes: 60, graceMinutes: 15 };

async function main() {
  if (process.env.PROBE !== '1') { console.log('Reads the holiday calendar. Re-run with PROBE=1.'); return; }

  console.log('\n1. A day shift becomes hours');
  const full = computeAttendance('08:00', '17:00', DAY);
  check('08:00–17:00 less an hour = 8h', full.workedMinutes === 480, `${full.workedMinutes}m`);
  check('no overtime', full.overtimeMinutes === 0);
  check('present', full.status === 'PRESENT');

  const over = computeAttendance('08:00', '19:30', DAY);
  check('08:00–19:30 = 10.5h worked', over.workedMinutes === 630, `${over.workedMinutes}m`);
  check('2.5h of it overtime', over.overtimeMinutes === 150, `${over.overtimeMinutes}m`);

  console.log('\n2. Grace decides late, not an opinion');
  check('08:10 is within grace', computeAttendance('08:10', '17:00', DAY).status === 'PRESENT');
  check('08:11 is late', computeAttendance('08:11', '17:00', DAY).status === 'LATE');
  const late = computeAttendance('09:41', '17:11', DAY);
  check('09:41 is late by 91 minutes', late.lateByMinutes === 91, String(late.lateByMinutes));
  console.log(`      "${late.note}"`);

  console.log('\n3. An overnight shift is not negative hours');
  // 20:00–06:00 spans midnight. Subtracting naively gives minus fourteen hours,
  // which the constraint rejects and payroll never sees.
  const night = computeAttendance('20:00', '06:00', NIGHT);
  check('20:00–06:00 less an hour = 9h', night.workedMinutes === 540, `${night.workedMinutes}m`);
  check('no overtime against a 9h shift', night.overtimeMinutes === 0, `${night.overtimeMinutes}m`);

  console.log('\n4. One clock time is not zero hours');
  const half = computeAttendance('08:00', null, DAY);
  check('reported as incomplete, not absent', half.status === 'INCOMPLETE', half.status);
  check('and says which is missing', half.note === 'No clock-out recorded', String(half.note));
  check('genuinely absent is absent', computeAttendance(null, null, DAY).status === 'ABSENT');

  console.log('\n5. The rate comes from the date, not from a form');
  const tenant = await db.selectFrom('tenants').select(['id', 'name'])
    .where('country', '=', 'TZ').executeTakeFirst();
  if (!tenant) { console.log('  (no TZ tenant — skipping the calendar-backed checks)'); }
  else {
    const closed = await HolidaysService.nonWorkingDates(tenant.id, '2026-01-01', '2026-12-31');
    // Christmas 2026 is a Friday — a working day but for the holiday.
    const xmas = overtimeKindFor('2026-12-25', closed);
    check('25 Dec is a public holiday', xmas === 'PUBLIC_HOLIDAY', xmas);
    check('and pays double', OVERTIME_MULTIPLIER[xmas] === 2.0, String(OVERTIME_MULTIPLIER[xmas]));
    // Eid al-Adha 2026, computed rather than fetched, still counts.
    const eid = overtimeKindFor('2026-05-27', closed);
    check('27 May (Eid al-Adha) too', eid === 'PUBLIC_HOLIDAY', eid);
    const tue = overtimeKindFor('2026-12-22', closed);
    check('an ordinary Tuesday is 1.5x', tue === 'NORMAL' && OVERTIME_MULTIPLIER[tue] === 1.5, tue);
    const sun = overtimeKindFor('2026-12-27', closed);
    check('a Sunday is a rest day at 2x', sun === 'REST_DAY' && OVERTIME_MULTIPLIER[sun] === 2.0, sun);

    // The difference the calendar link is worth.
    const basic = 1_000_000;
    const normal = overtimeAmount(basic, 4, 1.5, 26, 8);
    const holiday = overtimeAmount(basic, 4, 2.0, 26, 8);
    console.log(`      4 hours on a Tuesday: ${normal.amount.toLocaleString()}`);
    console.log(`      4 hours on Eid:       ${holiday.amount.toLocaleString()}`);
    check('the holiday is worth more', holiday.amount > normal.amount,
      `${(holiday.amount - normal.amount).toLocaleString()} more`);
    check('hourly rate from basic / days / hours', normal.hourlyRate === 4807.69, String(normal.hourlyRate));
  }

  console.log('\n6. The cap is 50 hours per four weeks, not 12 per week');
  check('the constant is 50', OVERTIME_CAP_HOURS_PER_4_WEEKS === 50);
  const w = fourWeekWindow('2026-08-08');
  check('the window is 28 days', w.from === '2026-07-12' && w.to === '2026-08-08', `${w.from} to ${w.to}`);
  const under = checkOvertimeCap(44, 5);
  check('44 approved + 5 fits', under.ok === true, `${under.remaining} left after`);
  const over2 = checkOvertimeCap(46, 6);
  check('46 approved + 6 does not', over2.ok === false);
  check('and the refusal carries the numbers',
    /46 already approved/.test(over2.reason ?? '') && /4 remain/.test(over2.reason ?? ''));
  console.log(`      "${over2.reason}"`);
  check('exactly at the cap is allowed', checkOvertimeCap(45, 5).ok === true);
  check('one hour over is not', checkOvertimeCap(45, 5.5).ok === false);

  console.log('\n' + '='.repeat(66));
  console.log(fails === 0 ? 'All attendance and overtime checks passed.\n' : `${fails} check(s) FAILED.\n`);
  await db.destroy();
  if (fails > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
