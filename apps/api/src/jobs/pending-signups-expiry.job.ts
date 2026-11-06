import { dbPlatform } from '../db/client.js';

// 24 hours — a hosted-checkout signup the customer never finished has no
// reason to stay "pending" longer than that; Flutterwave's own hosted
// checkout sessions don't stay open anywhere near this long either.
export const PENDING_SIGNUP_RETENTION_HOURS = 24;

/**
 * Daily job: marks any pending_signups row (migration 693 — hosted-checkout
 * onboarding's pre-tenant staging row) still 'pending' past
 * PENDING_SIGNUP_RETENTION_HOURS as 'expired'. These rows are harmless by
 * construction — nothing was ever created for a row that never completes,
 * the password in `payload` was already hashed before it was ever written
 * (never plaintext) — this exists purely so GET /checkout-status and any
 * future admin view of this table don't show a signup attempt from weeks
 * ago as still "pending", and so the table doesn't grow forever with dead
 * rows. No cross-tenant concern and no withTenant(): this table is
 * platform-scoped and pre-tenant by definition, same reasoning as
 * platform_transactions/billing_webhook_events being dbPlatform-only.
 */
export async function runPendingSignupsExpiryJob(): Promise<void> {
  console.log('⏳ Running pending_signups auto-expiry sweep...');
  try {
    const cutoff = new Date(Date.now() - PENDING_SIGNUP_RETENTION_HOURS * 3_600_000);
    const result = await dbPlatform.updateTable('pending_signups')
      .set({ status: 'expired', updated_at: new Date() })
      .where('status', '=', 'pending')
      .where('created_at', '<', cutoff)
      .executeTakeFirst();
    const expired = Number(result.numUpdatedRows ?? 0);
    console.log(expired > 0
      ? `✅ pending_signups auto-expiry sweep done — expired ${expired} abandoned signup(s).`
      : '✅ No abandoned pending_signups rows past the 24-hour window.');
  } catch (error) {
    console.error('❌ pending_signups auto-expiry job failed:', error);
  }
}
