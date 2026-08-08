/**
 * Proof that leave balances are real, and that the ledger refuses what it
 * should refuse.
 *
 * The three things that were wrong: no entitlement existed at all, the cycle
 * would have been modelled on the calendar year, and nothing stopped a person
 * taking more than they were owed.
 *
 *   PROBE=1 npx tsx src/scripts/check-leave-entitlement.ts
 */
import { db } from '../db/client.js';
import { leaveCycleFor, monthsOfService, computeBalances, checkRequest, splitPayDays } from '../services/leave-entitlement.service.js';
import { TZ_STATUTORY_LEAVE } from '../services/leave-statutory.service.js';

let fails = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (!cond) fails++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
};

async function main() {
  if (process.env.PROBE !== '1') { console.log('Writes leave data. Re-run with PROBE=1.'); return; }

  // The tenant is taken from the person, not chosen separately. Picking a
  // tenant by name and a user by email gave two different tenants, and
  // computeBalances correctly returned nothing — tenant scoping working, and a
  // reminder that a test can be wrong in exactly the way the code is right.
  const person = await db.selectFrom('users').select(['id', 'name', 'hire_date', 'tenant_id'])
    .where('email', '=', 'junior@hudumika.test').executeTakeFirstOrThrow();
  const tenant = await db.selectFrom('tenants').select(['id', 'name', 'country'])
    .where('id', '=', person.tenant_id).executeTakeFirstOrThrow();
  console.log(`\ntenant: ${tenant.name} · person: ${person.name}`);

  console.log('\n1. The leave cycle follows the employment anniversary, not the calendar');
  // Someone who joined 12 September 2025, asked on 8 August 2026, is still in
  // their first cycle — a calendar-year model would have reset them in January
  // and handed over a second full entitlement.
  const c1 = leaveCycleFor('2025-09-12', 12, new Date('2026-08-08'));
  check('joined 12 Sep 2025, cycle on 8 Aug 2026', c1.start === '2025-09-12' && c1.end === '2026-09-11',
    `${c1.start} to ${c1.end}`);
  const c2 = leaveCycleFor('2025-09-12', 12, new Date('2026-09-12'));
  check('the anniversary starts the next cycle', c2.start === '2026-09-12' && c2.end === '2027-09-11',
    `${c2.start} to ${c2.end}`);
  const c3 = leaveCycleFor('2025-09-12', 12, new Date('2026-09-11'));
  check('the day before does not', c3.start === '2025-09-12', c3.start);
  // 36 months needs no special case — the same arithmetic in other units.
  const c4 = leaveCycleFor('2024-03-01', 36, new Date('2026-08-08'));
  check('a 36-month cycle spans three years', c4.start === '2024-03-01' && c4.end === '2027-02-28',
    `${c4.start} to ${c4.end}`);
  check('service months', monthsOfService('2025-09-12', new Date('2026-08-08')) === 10,
    String(monthsOfService('2025-09-12', new Date('2026-08-08'))));

  console.log('\n2. Sick leave is 126 days per 36 months, not per year');
  const sick = TZ_STATUTORY_LEAVE.find(t => t.code === 'SICK')!;
  check('cycle is 36 months', sick.cycleMonths === 36, String(sick.cycleMonths));
  check('126 days', sick.daysEntitled === 126);
  check('63 of them at full pay', sick.fullPayDays === 63);
  // The error a "days per year" column produces.
  console.log(`      as "days/year" it would grant ${126 * 3} days over 3 years instead of 126`);

  console.log('\n3. Statutory types seed without overwriting what a tenant configured');
  await db.deleteFrom('hr_leave_types').where('tenant_id', '=', tenant.id).execute();
  // A tenant that is more generous than the statute.
  await db.insertInto('hr_leave_types').values({
    tenant_id: tenant.id, code: 'ANNUAL', name: 'Annual Leave',
    days_entitled: '30', cycle_months: 12, statutory: true, active: true,
  } as any).execute();

  for (const d of TZ_STATUTORY_LEAVE) {
    const exists = await db.selectFrom('hr_leave_types').select('id')
      .where('tenant_id', '=', tenant.id).where('code', '=', d.code).executeTakeFirst();
    if (exists) continue;
    await db.insertInto('hr_leave_types').values({
      tenant_id: tenant.id, code: d.code, name: d.name,
      days_entitled: String(d.daysEntitled), cycle_months: d.cycleMonths,
      full_pay_days: d.fullPayDays !== undefined ? String(d.fullPayDays) : null,
      reduced_pay_pct: d.reducedPayPct !== undefined ? String(d.reducedPayPct) : null,
      paid: d.paid, carry_forward_max: String(d.carryForwardMax),
      requires_document: d.requiresDocument, applies_to: d.appliesTo,
      min_service_months: d.minServiceMonths, statutory: d.statutory, active: true,
    } as any).execute();
  }
  const annual = await db.selectFrom('hr_leave_types').select(['days_entitled'])
    .where('tenant_id', '=', tenant.id).where('code', '=', 'ANNUAL').executeTakeFirstOrThrow();
  check('the tenant\'s 30 days survived', Number(annual.days_entitled) === 30, `${annual.days_entitled} days`);
  const count = await db.selectFrom('hr_leave_types').select(db.fn.countAll().as('n'))
    .where('tenant_id', '=', tenant.id).executeTakeFirst();
  check('six types present', Number(count?.n) === 6, String(count?.n));

  console.log('\n4. Balances are derived from requests, not typed');
  await db.deleteFrom('hr_leaves').where('user_id', '=', person.id).execute();
  await db.updateTable('users').set({ hire_date: '2024-01-15' } as any).where('id', '=', person.id).execute();

  const types = await db.selectFrom('hr_leave_types').selectAll().where('tenant_id', '=', tenant.id).execute();
  const annualType = types.find(t => t.code === 'ANNUAL')!;
  const cycle = leaveCycleFor('2024-01-15', 12);

  await db.insertInto('hr_leaves').values([
    { tenant_id: tenant.id, user_id: person.id, type: 'ANNUAL', leave_type_id: annualType.id,
      from_date: cycle.start, to_date: cycle.start, days: 12, status: 'APPROVED', reason: 'Taken' },
    { tenant_id: tenant.id, user_id: person.id, type: 'ANNUAL', leave_type_id: annualType.id,
      from_date: cycle.start, to_date: cycle.start, days: 5, status: 'PENDING', reason: 'Awaiting a decision' },
  ] as any).execute();

  const balances = await computeBalances(tenant.id, person.id);
  const ab = balances.find(b => b.code === 'ANNUAL')!;
  console.log(`      cycle ${ab.cycle_start} to ${ab.cycle_end}`);
  console.log(`      entitled ${ab.entitled} · taken ${ab.taken} · pending ${ab.pending} · remaining ${ab.remaining}`);
  check('taken counts approved only', ab.taken === 12);
  check('pending is held against the balance', ab.pending === 5);
  check('remaining is 30 - 12 - 5', ab.remaining === 13, String(ab.remaining));

  console.log('\n5. Sick leave is withheld until six months of service');
  const sb = balances.find(b => b.code === 'SICK')!;
  check('eligible after 2+ years', sb.eligible === true);
  await db.updateTable('users').set({ hire_date: '2026-06-01' } as any).where('id', '=', person.id).execute();
  const newStarter = (await computeBalances(tenant.id, person.id)).find(b => b.code === 'SICK')!;
  check('a two-month starter is not', newStarter.eligible === false);
  check('and is told why', !!newStarter.ineligible_reason);
  console.log(`      "${newStarter.ineligible_reason}"`);
  await db.updateTable('users').set({ hire_date: '2024-01-15' } as any).where('id', '=', person.id).execute();

  console.log('\n6. A request for more than remains is refused, with the numbers');
  const tooMuch = await checkRequest(tenant.id, person.id, annualType.id, 20);
  check('refused', tooMuch.ok === false);
  check('says how many remain and how many were asked for',
    /13 day\(s\) remaining/.test(tooMuch.reason ?? '') && /20 requested/.test(tooMuch.reason ?? ''));
  console.log(`      "${tooMuch.reason}"`);
  const fits = await checkRequest(tenant.id, person.id, annualType.id, 13);
  check('exactly the remaining balance is allowed', fits.ok === true);
  const overByOne = await checkRequest(tenant.id, person.id, annualType.id, 14);
  check('one more is not', overByOne.ok === false);

  console.log('\n7. Sick leave splits into full and half pay');
  // 63 full-pay days; someone who has taken 60 gets 3 more at full rate.
  const s1 = splitPayDays(10, 60, 63);
  check('60 already taken, 10 requested -> 3 full, 7 reduced', s1.full === 3 && s1.reduced === 7,
    `${s1.full} full, ${s1.reduced} reduced`);
  const s2 = splitPayDays(10, 0, 63);
  check('a first request is all full pay', s2.full === 10 && s2.reduced === 0);
  const s3 = splitPayDays(10, 0, null);
  check('a type with no split is all full pay', s3.full === 10 && s3.reduced === 0);

  console.log('\n' + '='.repeat(66));
  console.log(fails === 0 ? 'All leave entitlement checks passed.\n' : `${fails} check(s) FAILED.\n`);
  await db.destroy();
  if (fails > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
