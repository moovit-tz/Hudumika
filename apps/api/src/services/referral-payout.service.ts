/**
 * AgencyHost M8's payout seam.
 *
 * Mirrors onsite-ci.service.ts's own seam exactly, same reasoning: a real
 * payout provider is not something this codebase can fabricate, and
 * inventing one would repeat the "1.5-second setTimeout that lies" mistake
 * onsite-ci.service.ts's own header comment describes fixing. No real
 * mobile money aggregator (Selcom, ClickPesa, Beem Africa, Vodacom M-Pesa
 * Daraja, or any other) is connected anywhere in this platform today —
 * confirmed by research before writing this file. resolveDisbursementProvider
 * returns null unconditionally until a real one is wired in; the caller
 * must refuse cleanly, the same way a deploy refuses when
 * resolveCIProvider() returns null.
 *
 * Connecting a real provider later means implementing one class against
 * this interface — not touching the commission ledger, the fraud check, or
 * anything upstream of this seam.
 */

export interface PayoutRecipient {
  tenantId: string;
  amount: number;
  currency: string;
}

export interface PayoutRef {
  ref: string;
  url: string | null;
}

export type PayoutStatus = 'pending' | 'paid' | 'failed';

export interface DisbursementProvider {
  key: string;
  label: string;
  payout(recipient: PayoutRecipient): Promise<PayoutRef>;
  checkStatus(ref: string): Promise<PayoutStatus>;
}

export async function resolveDisbursementProvider(_tenantId: string): Promise<DisbursementProvider | null> {
  return null;
}

export const NO_DISBURSEMENT_PROVIDER_MESSAGE =
  'No payout provider is connected yet — commissions accrue and can be approved, '
  + 'but automatic payout isn\'t available until a real mobile money account is connected. '
  + 'Record the payout manually once you\'ve paid the agency out-of-band.';
