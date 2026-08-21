/**
 * AgencyHost M8 — referral commission computation and fraud checking.
 *
 * Real tracking, deferred disbursement: this computes and records a genuine
 * commission from a genuine payment event, and genuinely checks for
 * self-referral before approving one — but it never claims to have PAID
 * anything. No real mobile money aggregator is connected anywhere in this
 * platform (see referral-payout.service.ts); "paid" only ever becomes true
 * via a SUPER_ADMIN manually recording an out-of-band payout, the same
 * honest pattern invoice_payments already uses platform-wide.
 */
import { dbPlatform } from '../db/client.js';

/** Flat commission rate — 10% of the referred tenant's first payment. */
const COMMISSION_RATE = 0.10;

/**
 * Last 9 digits only, digits stripped of everything else. Catches the same
 * number reformatted as +255712345678 / 0712345678 / 712345678 — the exact
 * gap contacts.service.ts's own exact-string getDuplicates() leaves open,
 * and the one a self-referral would actually exploit (same phone, different
 * formatting, different tenant).
 */
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 9) return null;
  return digits.slice(-9);
}

/**
 * Does the referred tenant's signup phone match anything the referring
 * tenant itself already owns — its own staff phones, or a phone number it
 * has used in a past platform payment? A real match, not a heuristic score.
 */
async function detectSelfReferral(referringTenantId: string, referredPhone: string | null): Promise<string | null> {
  const normalizedReferred = normalizePhone(referredPhone);
  if (!normalizedReferred) return null;

  const [staffPhones, pastTxPhones] = await Promise.all([
    dbPlatform.selectFrom('users').select('phone')
      .where('tenant_id', '=', referringTenantId).where('phone', 'is not', null).execute(),
    dbPlatform.selectFrom('platform_transactions').select('mobile_number')
      .where('tenant_id', '=', referringTenantId).where('mobile_number', 'is not', null).execute(),
  ]);

  const referringNumbers = new Set([
    ...staffPhones.map(r => normalizePhone(r.phone)),
    ...pastTxPhones.map(r => normalizePhone(r.mobile_number)),
  ].filter((n): n is string => n !== null));

  if (referringNumbers.has(normalizedReferred)) {
    return 'The new tenant\'s signup phone number matches a phone number already on file for the referring tenant (staff or a past payment).';
  }
  return null;
}

/**
 * Called once, right after a referred tenant's first real payment succeeds.
 * Idempotent by construction — referral_commissions has a unique index on
 * referred_tenant_id (migration 250), so a second call for the same tenant
 * is a no-op insert conflict rather than a duplicate commission.
 */
export async function computeAndRecordCommission(
  referredTenantId: string,
  amount: number,
  currency: string,
  txRef: string,
  referredPhone: string | null,
): Promise<void> {
  const referred = await dbPlatform.selectFrom('tenants')
    .select('referred_by_tenant_id').where('id', '=', referredTenantId).executeTakeFirst();
  const referringTenantId = referred?.referred_by_tenant_id;
  if (!referringTenantId) return;

  const flaggedReason = await detectSelfReferral(referringTenantId, referredPhone);
  const commissionAmount = Math.round(amount * COMMISSION_RATE * 100) / 100;

  await dbPlatform.insertInto('referral_commissions').values({
    referring_tenant_id: referringTenantId,
    referred_tenant_id: referredTenantId,
    amount: commissionAmount,
    currency,
    rate: COMMISSION_RATE,
    source_payment_ref: txRef,
    status: flaggedReason ? 'flagged' : 'pending',
    flagged_reason: flaggedReason,
  } as any)
    .onConflict(oc => oc.column('referred_tenant_id').doNothing())
    .execute();
}
