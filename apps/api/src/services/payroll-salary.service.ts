import { toDateParam } from '../utils/dates.js';

export interface SalaryRecord { effective_date: Date | string; end_date: Date | string | null; base_salary: number | string; currency: string; pay_frequency: string }
export class PayrollSalaryError extends Error { statusCode = 409; }
const day = (value: Date | string) => toDateParam(value);
const amount = (record: SalaryRecord) => {
  const value = Number(record.base_salary);
  if (!Number.isFinite(value) || value < 0) throw new PayrollSalaryError('Compensation must be a finite non-negative amount.');
  if (record.currency !== 'TZS') throw new PayrollSalaryError('This payroll uses TZS statutory bands. Configure a separate currency-aware payroll before paying another currency.');
  if (!['MONTHLY', 'ANNUAL'].includes(record.pay_frequency)) throw new PayrollSalaryError(`Payroll calculation for ${record.pay_frequency} requires an approved hours/pay-cycle policy; use a monthly or annual compensation record.`);
  return value / (record.pay_frequency === 'ANNUAL' ? 12 : 1);
};

/** Resolve pay against the run's dates, never against today's salary projection. */
export function salaryForPeriod(records: SalaryRecord[], legacy: { salary: string | null; currency: string | null }, from: string, to: string, basis: 'period_end' | 'calendar_days' = 'calendar_days'): number {
  if (!records.length) {
    if (legacy.salary === null) return 0;
    return amount({ effective_date: from, end_date: null, base_salary: legacy.salary, currency: legacy.currency || 'TZS', pay_frequency: 'MONTHLY' });
  }
  const at = (date: string) => records.filter(record => day(record.effective_date) <= date && (!record.end_date || day(record.end_date) >= date));
  if (basis === 'period_end') {
    const matches = at(to);
    if (matches.length !== 1) throw new PayrollSalaryError(`Compensation history has a gap or overlap on ${to}; correct it before calculation.`);
    return Math.round(amount(matches[0]) * 100) / 100;
  }
  const cursor = new Date(`${from}T00:00:00Z`); const end = new Date(`${to}T00:00:00Z`); let sum = 0; let count = 0;
  if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(end.getTime()) || cursor > end || (end.getTime() - cursor.getTime()) / 86400000 > 366) throw new PayrollSalaryError('Invalid payroll period.');
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10); const matches = at(date);
    if (matches.length !== 1) throw new PayrollSalaryError(`Compensation history has a gap or overlap on ${date}; correct it before calculation.`);
    sum += amount(matches[0]); count++; cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return Math.round(sum / count * 100) / 100;
}
