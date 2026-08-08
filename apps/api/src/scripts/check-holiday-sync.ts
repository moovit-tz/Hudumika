/**
 * Proof that the holiday calendar is complete, honest and actually linked.
 *
 * The four things that were wrong before, each checked here:
 *   - Islamic holidays were missing entirely
 *   - a manual entry was silently overwritten by the sync
 *   - a sync that fetched nothing reported success
 *   - leave day counts came from the client and ignored holidays
 *
 *   PROBE=1 npx tsx src/scripts/check-holiday-sync.ts
 */
import { db } from '../db/client.js';
import { HolidaysService } from '../services/holidays.service.js';
import { computedHolidays, workingDaysBetween } from '../services/holiday-calendar.service.js';

let fails = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (!cond) fails++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
};

async function main() {
  if (process.env.PROBE !== '1') { console.log('Writes holidays. Re-run with PROBE=1.'); return; }

  const tenant = await db.selectFrom('tenants').select(['id', 'name', 'country'])
    .where('name', '=', 'ClearOS System').executeTakeFirstOrThrow();

  console.log('\n1. The calendar conversion, against dates that were actually observed');
  // Nine known observances. If the algorithm drifts, this is where it shows.
  const known: [number, string, string][] = [
    [2024, 'Eid al-Fitr', '2024-04-10'], [2025, 'Eid al-Fitr', '2025-03-31'], [2026, 'Eid al-Fitr', '2026-03-20'],
    [2024, 'Eid al-Adha', '2024-06-17'], [2025, 'Eid al-Adha', '2025-06-07'], [2026, 'Eid al-Adha', '2026-05-27'],
    [2024, 'Maulid', '2024-09-16'], [2025, 'Maulid', '2025-09-05'], [2026, 'Maulid', '2026-08-26'],
  ];
  for (const [year, name, observed] of known) {
    const got = computedHolidays('TZ', year).find(h => h.name === name);
    check(`${name} ${year}`, got?.date === observed, `computed ${got?.date}, observed ${observed}`);
  }
  const tz2026 = computedHolidays('TZ', 2026);
  check('all computed dates are provisional', tz2026.every(h => h.isProvisional),
    'observance follows a moon sighting');
  check('a non-Islamic country gets none', computedHolidays('ZA', 2026).length === 0);

  console.log('\n2. A tenant with no country is refused, not guessed at');
  await db.updateTable('tenants').set({ country: null } as any).where('id', '=', tenant.id).execute();
  await db.deleteFrom('locations').where('tenant_id', '=', tenant.id).execute()
    .catch(() => { /* locations may not belong to this tenant */ });
  const noCountry = await HolidaysService.syncTenantHolidays(tenant.id, { years: [2026] });
  check('reports not ok', noCountry.ok === false);
  check('says why', noCountry.problems.some(p => /country/i.test(p)));
  console.log(`      "${noCountry.problems[0]?.slice(0, 96)}"`);

  console.log('\n3. A hand-entered holiday survives a sync');
  await db.deleteFrom('hr_holidays').where('tenant_id', '=', tenant.id).execute();
  await db.insertInto('hr_holidays').values({
    tenant_id: tenant.id, date: '2026-12-25', name: 'Christmas Day',
    type: 'Company', source: 'MANUAL', category: 'COMPANY', country: 'TZ',
  } as any).execute();

  await db.updateTable('tenants').set({ country: 'TZ' } as any).where('id', '=', tenant.id).execute();
  const report = await HolidaysService.syncTenantHolidays(tenant.id, { years: [2026, 2027] });

  console.log(`      countries ${report.countries.join(', ')} · years ${report.years.join(', ')}`);
  console.log(`      added ${report.added} · updated ${report.updated} · computed ${report.computed} · manual kept ${report.preservedManual}`);
  if (report.problems.length) for (const p of report.problems) console.log(`      problem: ${p}`);
  check('sync reports ok', report.ok === true);
  check('the manual row was preserved', report.preservedManual >= 1);

  const kept = await db.selectFrom('hr_holidays').selectAll()
    .where('tenant_id', '=', tenant.id).where('date', '=', '2026-12-25' as any)
    .where('name', '=', 'Christmas Day').executeTakeFirst();
  check('and kept its own type', kept?.source === 'MANUAL' && kept?.type === 'Company',
    `source=${kept?.source} type=${kept?.type}`);

  console.log('\n4. The Islamic holidays the provider omits are present');
  const rows = await db.selectFrom('hr_holidays').selectAll()
    .where('tenant_id', '=', tenant.id).orderBy('date').execute();
  const islamic = rows.filter(r => /eid|maulid/i.test(r.name));
  check('Eid and Maulid are on the calendar', islamic.length >= 6, `${islamic.length} across two years`);
  check('each is flagged provisional', islamic.every(r => r.is_provisional));
  for (const r of islamic.slice(0, 4)) {
    console.log(`      ${String(r.date).slice(0, 10)}  ${r.name.padEnd(26)} ${r.is_provisional ? '(provisional)' : ''}`);
  }
  console.log(`      ${rows.length} holidays total across 2026–2027`);

  console.log('\n5. Leave stops charging people for days the country is closed');
  // Christmas 2026 falls on a Friday; Boxing Day Saturday. 24–28 Dec is
  // Thu, Fri (holiday), Sat, Sun, Mon = 2 working days, not 5.
  const closed = await HolidaysService.nonWorkingDates(tenant.id, '2026-12-01', '2026-12-31');
  const xmas = workingDaysBetween('2026-12-24', '2026-12-28', closed);
  check('24–28 Dec counts 2 days, not 5', xmas.days === 2, `got ${xmas.days}`);
  for (const e of xmas.excluded) console.log(`      ${e.date} excluded — ${e.reason}`);

  // A week containing Eid.
  const eid = tz2026.find(h => h.name === 'Eid al-Adha')!;
  const closedMay = await HolidaysService.nonWorkingDates(tenant.id, '2026-05-01', '2026-05-31');
  check(`Eid al-Adha ${eid.date} counts as closed`, closedMay.has(eid.date));

  console.log('\n' + '='.repeat(66));
  console.log(fails === 0 ? 'All holiday checks passed.\n' : `${fails} check(s) FAILED.\n`);
  await db.destroy();
  if (fails > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
