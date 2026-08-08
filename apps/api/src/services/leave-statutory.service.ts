/**
 * Tanzania's statutory leave, from the Employment and Labour Relations Act.
 *
 * Seeded rather than typed by each tenant, because these are legal minimums and
 * a tenant that types them will eventually type one wrong. A tenant may exceed
 * any of them; `statutory: true` marks the ones where going lower is not a
 * policy choice.
 *
 * The two figures most often modelled wrongly:
 *
 *   Sick leave is 126 days per THIRTY-SIX months, not per year, and it is not
 *   paid at one rate — the first 63 days are full pay and the next 63 are half.
 *   A system with a "days per year" column turns that into 378 days over three
 *   years at full pay, which is three times the entitlement at twice the rate.
 *
 *   Maternity is likewise a 36-month cycle, at 84 days, or 100 for a multiple
 *   birth. It is the multiple-birth figure that gets dropped, and it is not a
 *   rounding difference — it is more than two weeks.
 */

export interface StatutoryLeaveType {
  code: string;
  name: string;
  daysEntitled: number;
  cycleMonths: number;
  fullPayDays?: number;
  reducedPayPct?: number;
  paid: boolean;
  carryForwardMax: number;
  requiresDocument: boolean;
  appliesTo: 'ALL' | 'FEMALE' | 'MALE';
  minServiceMonths: number;
  statutory: boolean;
  note: string;
}

export const TZ_STATUTORY_LEAVE: StatutoryLeaveType[] = [
  {
    code: 'ANNUAL', name: 'Annual Leave',
    daysEntitled: 28, cycleMonths: 12,
    paid: true, carryForwardMax: 0, requiresDocument: false,
    appliesTo: 'ALL', minServiceMonths: 0, statutory: true,
    note: '28 consecutive days per 12-month leave cycle, counted from the employment anniversary rather than the calendar year.',
  },
  {
    code: 'SICK', name: 'Sick Leave',
    daysEntitled: 126, cycleMonths: 36,
    // The split that a single "days" figure cannot express.
    fullPayDays: 63, reducedPayPct: 50,
    paid: true, carryForwardMax: 0, requiresDocument: true,
    appliesTo: 'ALL',
    // Six months of service before the entitlement begins.
    minServiceMonths: 6, statutory: true,
    note: '126 days per 36-month cycle: the first 63 at full pay, the next 63 at half. Requires a medical certificate.',
  },
  {
    code: 'MATERNITY', name: 'Maternity Leave',
    daysEntitled: 84, cycleMonths: 36,
    paid: true, carryForwardMax: 0, requiresDocument: true,
    appliesTo: 'FEMALE', minServiceMonths: 0, statutory: true,
    note: '84 days per 36-month cycle, or 100 for a multiple birth — raise the entitlement on the request where that applies.',
  },
  {
    code: 'PATERNITY', name: 'Paternity Leave',
    daysEntitled: 3, cycleMonths: 12,
    paid: true, carryForwardMax: 0, requiresDocument: false,
    appliesTo: 'MALE', minServiceMonths: 0, statutory: true,
    note: 'At least 3 paid days per 12-month cycle, taken within 7 days of the birth. 7 days where the birth is premature.',
  },
  {
    code: 'COMPASSIONATE', name: 'Compassionate Leave',
    daysEntitled: 4, cycleMonths: 12,
    paid: true, carryForwardMax: 0, requiresDocument: false,
    appliesTo: 'ALL', minServiceMonths: 0,
    // Marked false deliberately: 4 days is the figure in common use and is
    // widely described as the ELRA position, but it was not confirmed against
    // the Act in the same way as the four above. Claiming statutory force for
    // something unverified is how a wrong number acquires authority.
    statutory: false,
    note: '4 days per 12-month cycle. Widely applied; treated as company policy here rather than statute, because it was not verified against the Act directly.',
  },
  {
    code: 'UNPAID', name: 'Unpaid Leave',
    daysEntitled: 0, cycleMonths: 12,
    paid: false, carryForwardMax: 0, requiresDocument: false,
    appliesTo: 'ALL', minServiceMonths: 0, statutory: false,
    note: 'No entitlement — recorded so unpaid absence is visible and can be deducted, rather than going unrecorded.',
  },
];

/** Statutory leave by jurisdiction. Only Tanzania so far; the shape is general. */
export function statutoryLeaveFor(countryCode: string): StatutoryLeaveType[] {
  return countryCode?.toUpperCase() === 'TZ' ? TZ_STATUTORY_LEAVE : [];
}
