/**
 * Payroll computation.
 *
 * The arithmetic is a pure function of its inputs — no database, no clock, no
 * tenant. That is deliberate: a payroll engine is the one place in this system
 * where a wrong number is a wrong payment to a real person, so the part that
 * decides the number has to be provable on its own, against published figures,
 * without standing a server up.
 *
 * The order of operations is the whole game:
 *
 *   1. gross      = basic + every earning
 *   2. employee contributions, each on its own base (basic, or gross)
 *   3. tax base   = taxable earnings - contributions that are tax-deductible
 *   4. income tax = progressive bands applied to the tax base
 *   5. net        = gross - contributions - income tax - other deductions
 *
 * Step 3 is where implementations go wrong. An approved retirement fund comes
 * off the tax base; health insurance does not. Both are payroll deductions and
 * they look identical on a payslip, so the distinction has to be carried in the
 * scheme itself (`reducesTaxBase`) rather than inferred from a code, or the
 * first jurisdiction that names things differently silently mis-taxes everyone.
 */

export type Residency = 'RESIDENT' | 'NON_RESIDENT';
export type CalcBase = 'BASIC' | 'GROSS' | 'TAXABLE';

export interface TaxBand {
  seq: number;
  lowerBound: number;
  /** null is the open-ended top band — not a large number standing in for one. */
  upperBound: number | null;
  ratePct: number;
  /** Cumulative tax at the bottom of the band, as published. */
  fixedAmount: number;
}

export interface ContributionScheme {
  code: string;
  name: string;
  employeePct: number;
  employerPct: number;
  calcBase: CalcBase;
  reducesTaxBase: boolean;
  /** Headcount floor before the scheme applies at all. 0 means always. */
  minEmployees: number;
  onPayslip: boolean;
}

export interface EarningInput { code: string; name: string; amount: number; taxable: boolean }
export interface DeductionInput { code: string; name: string; amount: number }

export interface PayslipInput {
  basicPay: number;
  earnings: EarningInput[];
  deductions: DeductionInput[];
  residency: Residency;
  bands: TaxBand[];
  schemes: ContributionScheme[];
  /** Headcount at calculation time — decides whether threshold levies apply. */
  employeeCount: number;
}

export interface PayslipLine {
  kind: 'EARNING' | 'EMPLOYEE_CONTRIBUTION' | 'INCOME_TAX' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
  code: string;
  name: string;
  amount: number;
  /** How the figure was reached, in words, for the line a person queries. */
  basis?: string;
}

export interface PayslipResult {
  basicPay: number;
  grossPay: number;
  taxablePay: number;
  incomeTax: number;
  employeeContributions: number;
  otherDeductions: number;
  totalDeductions: number;
  employerContributions: number;
  netPay: number;
  lines: PayslipLine[];
}

/**
 * Round to the minor unit. Every component is rounded before it is summed, so
 * the lines a person can see add up to the total they can see. Summing raw
 * floats and rounding at the end produces payslips that are off by a cent and
 * impossible to explain.
 */
const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Progressive tax on an amount.
 *
 * Bands are half-open at the bottom: an amount exactly equal to a band's lower
 * bound belongs to the band below, which is what "270,001 and above" means on a
 * published table. Getting this wrong shifts one shilling of income into the
 * next bracket and is invisible until someone lands exactly on the boundary.
 */
export function computeIncomeTax(taxable: number, bands: TaxBand[]): { tax: number; band: TaxBand | null } {
  if (taxable <= 0 || bands.length === 0) return { tax: 0, band: null };
  const ordered = [...bands].sort((a, b) => a.lowerBound - b.lowerBound);

  const band = ordered.find(b =>
    taxable > b.lowerBound && (b.upperBound === null || taxable <= b.upperBound),
  )
    // Above every stated ceiling: the open-ended band, or the highest one.
    ?? ordered[ordered.length - 1];

  // The first band normally starts at 0 and is tax-free; an amount inside it
  // sits at or below its lower bound only when the table starts above zero.
  if (taxable <= band.lowerBound) return { tax: 0, band };

  return { tax: r2(band.fixedAmount + (taxable - band.lowerBound) * (band.ratePct / 100)), band };
}

/** Which schemes apply at this headcount. */
function applicable(schemes: ContributionScheme[], employeeCount: number): ContributionScheme[] {
  return schemes.filter(s => employeeCount >= (s.minEmployees ?? 0));
}

export function computePayslip(input: PayslipInput): PayslipResult {
  const { basicPay, earnings, deductions, residency, bands, schemes, employeeCount } = input;
  const lines: PayslipLine[] = [];

  lines.push({ kind: 'EARNING', code: 'BASIC', name: 'Basic Salary', amount: r2(basicPay) });
  for (const e of earnings) {
    lines.push({
      kind: 'EARNING', code: e.code, name: e.name, amount: r2(e.amount),
      basis: e.taxable ? undefined : 'not subject to income tax',
    });
  }

  const grossPay = r2(basicPay + earnings.reduce((t, e) => t + e.amount, 0));
  // Non-taxable earnings are paid but never enter the tax base.
  const taxableGross = r2(basicPay + earnings.filter(e => e.taxable).reduce((t, e) => t + e.amount, 0));

  const live = applicable(schemes, employeeCount);
  const baseFor = (b: CalcBase) => (b === 'BASIC' ? basicPay : b === 'TAXABLE' ? taxableGross : grossPay);

  let employeeContributions = 0;
  let taxDeductibleContributions = 0;

  for (const s of live) {
    if (s.employeePct <= 0) continue;
    const base = baseFor(s.calcBase);
    const amount = r2(base * (s.employeePct / 100));
    if (amount === 0) continue;
    employeeContributions = r2(employeeContributions + amount);
    if (s.reducesTaxBase) taxDeductibleContributions = r2(taxDeductibleContributions + amount);
    lines.push({
      kind: 'EMPLOYEE_CONTRIBUTION', code: s.code, name: s.name, amount,
      basis: `${s.employeePct}% of ${s.calcBase.toLowerCase()} pay`
        + (s.reducesTaxBase ? ', deducted before income tax' : ''),
    });
  }

  // The step that is easy to get backwards, and the reason this file exists.
  const taxablePay = r2(Math.max(0, taxableGross - taxDeductibleContributions));
  const { tax: incomeTax, band } = computeIncomeTax(taxablePay, bands);

  lines.push({
    kind: 'INCOME_TAX', code: 'PAYE', name: 'Income Tax (PAYE)', amount: incomeTax,
    basis: band
      ? (residency === 'NON_RESIDENT'
        ? `${band.ratePct}% of ${taxablePay.toLocaleString()} (non-resident, flat rate)`
        : `${band.fixedAmount.toLocaleString()} + ${band.ratePct}% of the amount over ${band.lowerBound.toLocaleString()}`)
      : 'below the tax-free threshold',
  });

  let otherDeductions = 0;
  for (const d of deductions) {
    const amount = r2(d.amount);
    if (amount === 0) continue;
    otherDeductions = r2(otherDeductions + amount);
    lines.push({ kind: 'DEDUCTION', code: d.code, name: d.name, amount });
  }

  let employerContributions = 0;
  for (const s of live) {
    if (s.employerPct <= 0) continue;
    const amount = r2(baseFor(s.calcBase) * (s.employerPct / 100));
    if (amount === 0) continue;
    employerContributions = r2(employerContributions + amount);
    lines.push({
      kind: 'EMPLOYER_CONTRIBUTION', code: s.code, name: s.name, amount,
      basis: `${s.employerPct}% of ${s.calcBase.toLowerCase()} pay, paid by the employer`,
    });
  }

  const totalDeductions = r2(employeeContributions + incomeTax + otherDeductions);

  return {
    basicPay: r2(basicPay),
    grossPay,
    taxablePay,
    incomeTax,
    employeeContributions,
    otherDeductions,
    totalDeductions,
    employerContributions,
    netPay: r2(grossPay - totalDeductions),
    lines,
  };
}

/**
 * Run totals.
 *
 * Three separate figures, because collapsing them is a real and common error:
 * income tax and the employee's own contributions are the employer's to forward,
 * not to bear. A single "employer contributions" number that includes income tax
 * overstates the cost of employing someone by the whole tax bill.
 */
export function summariseRun(slips: PayslipResult[]) {
  const sum = (f: (s: PayslipResult) => number) => r2(slips.reduce((t, s) => t + f(s), 0));
  const employerCost = sum(s => s.employerContributions);
  const remitted = r2(sum(s => s.incomeTax) + sum(s => s.employeeContributions) + employerCost);
  return {
    employeeCount: slips.length,
    totalGross: sum(s => s.grossPay),
    totalNet: sum(s => s.netPay),
    totalEmployeeDeductions: sum(s => s.totalDeductions),
    /** What employing these people costs on top of their pay. */
    totalEmployerCost: employerCost,
    /** Everything handed to the authorities, whoever it was withheld from. */
    totalRemitted: remitted,
    /** Cash leaving the business. */
    totalCashOut: r2(sum(s => s.netPay) + remitted),
  };
}
