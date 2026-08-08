/**
 * Tanzanian statutory payroll reference data.
 *
 * Rates as published for 2025/26 and confirmed against TRA guidance and PwC's
 * Tanzania rate summaries, not copied from another product's screen. Where the
 * competitor's demo and the current law disagree, the law wins — its help text
 * still states the skills-levy threshold as 4 employees, which is the pre-2022
 * figure; it has been 10 since.
 *
 * Seeded per tenant and effective-dated, so a tenant may edit its own rates
 * without touching anyone else's, and last year's payslips still reproduce.
 *
 *   PROBE=1 npx tsx src/scripts/seed-tz-payroll-statutory.ts
 *   PROBE=1 npx tsx src/scripts/seed-tz-payroll-statutory.ts --clear
 */
import { db } from '../db/client.js';

const JURISDICTION = 'TZ';
const EFFECTIVE_FROM = '2025-07-01';   // Tanzanian fiscal year start

/**
 * Monthly PAYE, resident employees. fixed_amount is the cumulative tax at the
 * foot of each band, exactly as the published table states it.
 */
const RESIDENT_BANDS = [
  { seq: 1, lower: 0,         upper: 270000,  rate: 0,  fixed: 0 },
  { seq: 2, lower: 270000,    upper: 520000,  rate: 8,  fixed: 0 },
  { seq: 3, lower: 520000,    upper: 760000,  rate: 20, fixed: 20000 },
  { seq: 4, lower: 760000,    upper: 1000000, rate: 25, fixed: 68000 },
  { seq: 5, lower: 1000000,   upper: null,    rate: 30, fixed: 128000 },
];

/** Non-residents pay a flat rate on Tanzanian-sourced employment income, with
 *  no tax-free band at all — hence one row starting at zero. */
const NON_RESIDENT_BANDS = [
  { seq: 1, lower: 0, upper: null, rate: 15, fixed: 0 },
];

const SCHEMES = [
  {
    code: 'NSSF', name: 'Social Security (NSSF / PSSSF)',
    employeePct: 10, employerPct: 10, base: 'BASIC',
    // The one flag that decides whether every payslip in the country is right.
    reducesTaxBase: true, minEmployees: 0, onPayslip: true,
  },
  {
    code: 'NHIF', name: 'Health Insurance (NHIF)',
    employeePct: 3, employerPct: 3, base: 'GROSS',
    // Not deductible against income tax, unlike the retirement fund above.
    reducesTaxBase: false, minEmployees: 0, onPayslip: true,
  },
  {
    code: 'WCF', name: "Workers' Compensation Fund",
    employeePct: 0, employerPct: 0.5, base: 'GROSS',
    reducesTaxBase: false, minEmployees: 0, onPayslip: false,
  },
  {
    code: 'SDL', name: 'Skills Development Levy',
    employeePct: 0, employerPct: 3.5, base: 'GROSS',
    // Applies only from 10 employees. As data, a tenant that grows across the
    // line starts owing it without anyone having to remember.
    reducesTaxBase: false, minEmployees: 10, onPayslip: false,
  },
];

const COMPONENT_TYPES = [
  { code: 'HOUSING',   name: 'Housing Allowance',   direction: 'EARNING',   taxable: true,  statutory: false },
  { code: 'TRANSPORT', name: 'Transport Allowance', direction: 'EARNING',   taxable: true,  statutory: false },
  { code: 'SPECIAL',   name: 'Special Allowance',   direction: 'EARNING',   taxable: true,  statutory: false },
  // Genuinely non-taxable, so it exercises the taxable/non-taxable split rather
  // than leaving that path unproven.
  { code: 'PER_DIEM',  name: 'Per Diem',            direction: 'EARNING',   taxable: false, statutory: false },
  { code: 'HESLB',     name: 'HESLB Loan Repayment', direction: 'DEDUCTION', taxable: false, statutory: false },
  { code: 'SALARY_ADV', name: 'Salary Advance',     direction: 'DEDUCTION', taxable: false, statutory: false },
];

async function main() {
  if (process.env.PROBE !== '1') {
    console.log('This writes statutory reference data. Re-run with PROBE=1.');
    return;
  }

  const tenants = await db.selectFrom('tenants').select(['id', 'name']).execute();
  if (tenants.length === 0) { console.error('No tenants.'); await db.destroy(); return; }

  if (process.argv.includes('--clear')) {
    const b = await db.deleteFrom('payroll_tax_bands').where('jurisdiction', '=', JURISDICTION).returning('id').execute();
    const s = await db.deleteFrom('payroll_contribution_schemes').where('jurisdiction', '=', JURISDICTION).returning('id').execute();
    const c = await db.deleteFrom('payroll_component_types').returning('id').execute();
    console.log(`Removed ${b.length} bands, ${s.length} schemes, ${c.length} component types.`);
    await db.destroy();
    return;
  }

  for (const t of tenants) {
    const already = await db.selectFrom('payroll_tax_bands').select('id')
      .where('tenant_id', '=', t.id).where('jurisdiction', '=', JURISDICTION)
      .where('effective_from', '=', EFFECTIVE_FROM as any).executeTakeFirst();
    if (already) { console.log(`  skip  ${t.name} — already seeded`); continue; }

    for (const [residency, bands] of [['RESIDENT', RESIDENT_BANDS], ['NON_RESIDENT', NON_RESIDENT_BANDS]] as const) {
      await db.insertInto('payroll_tax_bands').values(bands.map(b => ({
        tenant_id: t.id, jurisdiction: JURISDICTION, residency,
        seq: b.seq, lower_bound: b.lower, upper_bound: b.upper,
        rate_pct: b.rate, fixed_amount: b.fixed, effective_from: EFFECTIVE_FROM,
      })) as any).execute();
    }

    await db.insertInto('payroll_contribution_schemes').values(SCHEMES.map(s => ({
      tenant_id: t.id, jurisdiction: JURISDICTION, code: s.code, name: s.name,
      employee_pct: s.employeePct, employer_pct: s.employerPct, calc_base: s.base,
      reduces_tax_base: s.reducesTaxBase, min_employees: s.minEmployees,
      on_payslip: s.onPayslip, active: true, effective_from: EFFECTIVE_FROM,
    })) as any).execute();

    for (const c of COMPONENT_TYPES) {
      const dup = await db.selectFrom('payroll_component_types').select('id')
        .where('tenant_id', '=', t.id).where('code', '=', c.code).executeTakeFirst();
      if (dup) continue;
      await db.insertInto('payroll_component_types').values({
        tenant_id: t.id, code: c.code, name: c.name, direction: c.direction,
        taxable: c.taxable, statutory: c.statutory, frequency: 'MONTHLY', active: true,
      } as any).execute();
    }
    console.log(`  seeded ${t.name}`);
  }

  console.log(`\nTanzania, effective ${EFFECTIVE_FROM}:`);
  console.log('  PAYE resident   0–270,000 nil · 8% · 20,000+20% · 68,000+25% · 128,000+30%');
  console.log('  PAYE non-res    flat 15%, no tax-free band');
  console.log('  NSSF/PSSSF      10% + 10% of basic, deducted before income tax');
  console.log('  NHIF            3% + 3% of gross, NOT deducted before income tax');
  console.log('  WCF             0.5% of gross, employer only');
  console.log('  SDL             3.5% of gross, employer only, from 10 employees');
  console.log('\n  Undo with: PROBE=1 npx tsx src/scripts/seed-tz-payroll-statutory.ts --clear\n');
  await db.destroy();
}

main().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
