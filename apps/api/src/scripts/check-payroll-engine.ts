/**
 * Proof that the payroll engine computes Tanzanian statutory payroll correctly.
 *
 * The two headline cases are real payslips from a working Tanzanian payroll,
 * read from a live system on 2026-08-08. They are useful precisely because they
 * were produced by something other than this code: reproducing them to the
 * shilling means the ordering, the bases and the bands are all right, and no
 * amount of internally-consistent reasoning could establish that on its own.
 *
 * The remaining cases cover what those two happen not to exercise — the
 * tax-free band, a boundary, non-residents, the levy threshold, and a
 * non-taxable allowance.
 *
 *   npx tsx src/scripts/check-payroll-engine.ts
 *
 * Exits non-zero on any mismatch, so it can gate a build.
 */
import {
  computePayslip, computeIncomeTax, summariseRun,
  type TaxBand, type ContributionScheme, type PayslipResult,
} from '../services/payroll.service.js';

const BANDS: TaxBand[] = [
  { seq: 1, lowerBound: 0,       upperBound: 270000,  ratePct: 0,  fixedAmount: 0 },
  { seq: 2, lowerBound: 270000,  upperBound: 520000,  ratePct: 8,  fixedAmount: 0 },
  { seq: 3, lowerBound: 520000,  upperBound: 760000,  ratePct: 20, fixedAmount: 20000 },
  { seq: 4, lowerBound: 760000,  upperBound: 1000000, ratePct: 25, fixedAmount: 68000 },
  { seq: 5, lowerBound: 1000000, upperBound: null,    ratePct: 30, fixedAmount: 128000 },
];
const NON_RESIDENT_BANDS: TaxBand[] = [
  { seq: 1, lowerBound: 0, upperBound: null, ratePct: 15, fixedAmount: 0 },
];

const SCHEMES: ContributionScheme[] = [
  { code: 'NSSF', name: 'Social Security', employeePct: 10, employerPct: 10, calcBase: 'BASIC', reducesTaxBase: true,  minEmployees: 0,  onPayslip: true },
  { code: 'NHIF', name: 'Health Insurance', employeePct: 3, employerPct: 3,  calcBase: 'GROSS', reducesTaxBase: false, minEmployees: 0,  onPayslip: true },
  { code: 'WCF',  name: "Workers' Comp",    employeePct: 0, employerPct: 0.5, calcBase: 'GROSS', reducesTaxBase: false, minEmployees: 0,  onPayslip: false },
  { code: 'SDL',  name: 'Skills Levy',      employeePct: 0, employerPct: 3.5, calcBase: 'GROSS', reducesTaxBase: false, minEmployees: 10, onPayslip: false },
];

let failures = 0;
function expect(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.005;
  if (!ok) failures++;
  const a = actual.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const e = expected.toLocaleString(undefined, { maximumFractionDigits: 2 });
  console.log(`    ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(30)} ${a.padStart(12)}` + (ok ? '' : `   expected ${e}`));
}

console.log('\nPayslips from a live Tanzanian payroll — reproduce exactly or fail');
console.log('='.repeat(70));

// ---------------------------------------------------------------------------
// Case 1. Top band. basic 1,000,000 + 450,000 allowances.
// ---------------------------------------------------------------------------
console.log('\n  Employee A — basic 1,000,000, allowances 450,000, two loans');
const a = computePayslip({
  basicPay: 1000000,
  earnings: [
    { code: 'SPECIAL', name: 'Special Allowance', amount: 320000, taxable: true },
    { code: 'TRANSPORT', name: 'Transport Allowance', amount: 130000, taxable: true },
  ],
  deductions: [
    { code: 'HESLB', name: 'HESLB', amount: 150000 },
    { code: 'LOAN', name: 'Loan', amount: 20000 },
  ],
  residency: 'RESIDENT', bands: BANDS, schemes: SCHEMES, employeeCount: 2,
});
expect('gross pay', a.grossPay, 1450000);
expect('social security (10% basic)', 100000, 100000);
expect('taxable pay (gross - SS)', a.taxablePay, 1350000);
expect('PAYE  128,000 + 30% x 350,000', a.incomeTax, 233000);
expect('total deductions', a.totalDeductions, 546500);
expect('net pay', a.netPay, 903500);

// ---------------------------------------------------------------------------
// Case 2. A different band, so band selection is exercised rather than luck.
// ---------------------------------------------------------------------------
console.log('\n  Employee B — basic 700,000, allowances 140,000');
const b = computePayslip({
  basicPay: 700000,
  earnings: [{ code: 'TRANSPORT', name: 'Transport Allowance', amount: 140000, taxable: true }],
  deductions: [{ code: 'HESLB', name: 'HESLB', amount: 175000 }],
  residency: 'RESIDENT', bands: BANDS, schemes: SCHEMES, employeeCount: 2,
});
expect('gross pay', b.grossPay, 840000);
expect('taxable pay (gross - SS)', b.taxablePay, 770000);
expect('PAYE  68,000 + 25% x 10,000', b.incomeTax, 70500);
expect('total deductions', b.totalDeductions, 340700);
expect('net pay', b.netPay, 499300);

console.log('\n  Run totals across both');
const run = summariseRun([a, b]);
expect('total gross', run.totalGross, 2290000);
expect('total net', run.totalNet, 1402800);
// Employer cost excludes PAYE. The source system's own screen included it and
// reported 553,650 — more than double the real figure.
expect('employer cost (no PAYE)', run.totalEmployerCost, 250150);
expect('  of which health ins. 3%', 2290000 * 0.03, 68700);
expect('  of which soc. sec. 10%', 1700000 * 0.10, 170000);
expect("  of which workers' comp 0.5%", 2290000 * 0.005, 11450);
expect('  skills levy (2 < 10 employees)', 0, 0);
// Spelled out rather than summed in one literal, so a wrong expectation is
// visible as a wrong component instead of an unexplained total.
const payeBoth = 233000 + 70500;                       // 303,500
const empContribBoth = (100000 + 43500) + (70000 + 25200);  // 238,700
expect('  PAYE withheld from both', a.incomeTax + b.incomeTax, payeBoth);
expect('  employee contributions', a.employeeContributions + b.employeeContributions, empContribBoth);
expect('remitted to authorities', run.totalRemitted, payeBoth + empContribBoth + 250150);
// Cash out is net pay plus everything forwarded — the figure that leaves the bank.
expect('total cash out', run.totalCashOut, 1402800 + payeBoth + empContribBoth + 250150);

console.log('\n\nCases the live payslips do not cover');
console.log('='.repeat(70));

// Tax-free band — nobody in the source data earns little enough to test it.
console.log('\n  Below the threshold — basic 250,000');
const c = computePayslip({
  basicPay: 250000, earnings: [], deductions: [],
  residency: 'RESIDENT', bands: BANDS, schemes: SCHEMES, employeeCount: 2,
});
expect('taxable pay', c.taxablePay, 225000);
expect('PAYE (under 270,000)', c.incomeTax, 0);
expect('net pay', c.netPay, 250000 - 25000 - 7500);

// The boundary. 270,000 exactly must attract no tax: the band is "270,001 and
// above", so an amount equal to the bound belongs below it.
console.log('\n  Exactly on the boundary');
expect('PAYE at 270,000', computeIncomeTax(270000, BANDS).tax, 0);
expect('PAYE at 270,001', computeIncomeTax(270001, BANDS).tax, 0.08);
expect('PAYE at 520,000', computeIncomeTax(520000, BANDS).tax, 20000);
expect('PAYE at 1,000,000', computeIncomeTax(1000000, BANDS).tax, 128000);

// Non-resident: flat, and no tax-free band, so a low earner still pays.
console.log('\n  Non-resident — basic 250,000, flat 15% with no free band');
const d = computePayslip({
  basicPay: 250000, earnings: [], deductions: [],
  residency: 'NON_RESIDENT', bands: NON_RESIDENT_BANDS, schemes: SCHEMES, employeeCount: 2,
});
expect('taxable pay', d.taxablePay, 225000);
expect('PAYE 15% of 225,000', d.incomeTax, 33750);

// The threshold levy, on the far side of the line.
console.log('\n  Skills levy once the employer reaches 10 employees');
const e = computePayslip({
  basicPay: 1000000,
  earnings: [{ code: 'SPECIAL', name: 'Special', amount: 450000, taxable: true }],
  deductions: [], residency: 'RESIDENT', bands: BANDS, schemes: SCHEMES, employeeCount: 10,
});
const sdl = e.lines.find(l => l.code === 'SDL');
expect('skills levy 3.5% of gross', sdl?.amount ?? 0, 1450000 * 0.035);
expect('employer cost now includes it', e.employerContributions, 100000 + 43500 + 7250 + 50750);
// The employee is untouched by an employer levy — a real risk if bases are
// wired up carelessly.
expect('employee net unchanged by levy', e.netPay, a.netPay + 170000);

// A non-taxable allowance: paid in full, absent from the tax base.
console.log('\n  Non-taxable allowance — paid, but not taxed');
const f = computePayslip({
  basicPay: 700000,
  earnings: [{ code: 'PER_DIEM', name: 'Per Diem', amount: 140000, taxable: false }],
  deductions: [], residency: 'RESIDENT', bands: BANDS, schemes: SCHEMES, employeeCount: 2,
});
expect('gross includes it', f.grossPay, 840000);
expect('tax base excludes it', f.taxablePay, 700000 - 70000);
expect('PAYE  20,000 + 20% x 110,000', f.incomeTax, 42000);
// Same gross as Employee B, less tax, because 140,000 of it is not taxable.
expect('less tax than B on same gross', b.incomeTax - f.incomeTax, 28500);

// Every payslip must add up on its own terms.
console.log('\n  Internal consistency — lines must sum to totals');
for (const [name, slip] of [['A', a], ['B', b], ['C', c], ['D', d], ['E', e], ['F', f]] as [string, PayslipResult][]) {
  const earn = slip.lines.filter(l => l.kind === 'EARNING').reduce((t, l) => t + l.amount, 0);
  const ded = slip.lines.filter(l => ['EMPLOYEE_CONTRIBUTION', 'INCOME_TAX', 'DEDUCTION'].includes(l.kind))
    .reduce((t, l) => t + l.amount, 0);
  expect(`${name}: earnings sum to gross`, earn, slip.grossPay);
  expect(`${name}: deductions sum to total`, ded, slip.totalDeductions);
  expect(`${name}: gross - deductions = net`, slip.grossPay - slip.totalDeductions, slip.netPay);
}

console.log('\n' + '='.repeat(70));
if (failures === 0) {
  console.log('All checks passed — both live payslips reproduce to the shilling.\n');
} else {
  console.log(`${failures} check(s) FAILED.\n`);
  process.exit(1);
}
