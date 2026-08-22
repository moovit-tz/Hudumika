import { dbPlatform, withTenant } from '../db/client.js';

/**
 * Sweeps every tenant's 'sent' envelopes for ones past their own
 * expires_at and flips them to 'expired'. This is the only place that
 * status transition happens on a schedule — POST /public/:token/sign also
 * refuses to sign a document past its deadline directly, so a signer is
 * never able to slip in during the window before this job next runs, but
 * the envelope's own status (and every list/badge that reads it) still
 * needs this sweep to actually reflect "expired" rather than sitting on
 * "sent" forever.
 *
 * Naturally idempotent — re-running only ever touches envelopes still in
 * 'sent' with a past expires_at, so an envelope this job already expired
 * is never revisited (its status is no longer 'sent').
 */
export async function runSignExpiryJob(): Promise<void> {
  console.log('⏳ Running background job: Sign Envelope Expiry...');
  try {
    const overdue = await dbPlatform
      .selectFrom('sign_envelopes')
      .select(['id', 'tenant_id', 'title'])
      .where('status', '=', 'sent')
      .where('expires_at', 'is not', null)
      .where('expires_at', '<', new Date())
      .execute();

    if (overdue.length === 0) {
      console.log('📝 No expired sign envelopes to sweep.');
      return;
    }

    let expired = 0;
    for (const env of overdue) {
      await withTenant(env.tenant_id, async (trx) => {
        await trx.updateTable('sign_envelopes').set({ status: 'expired' })
          .where('id', '=', env.id).where('status', '=', 'sent').execute();
        await trx.insertInto('sign_events').values({
          envelope_id: env.id,
          tenant_id: env.tenant_id,
          event_type: 'expired',
          note: 'Envelope reached its expiration date without all signatures',
        }).execute();
      });
      expired++;
    }

    console.log(`✅ Sign Envelope Expiry job completed — ${expired} envelope(s) expired.`);
  } catch (error) {
    console.error('❌ Sign envelope expiry job failed:', error);
  }
}
