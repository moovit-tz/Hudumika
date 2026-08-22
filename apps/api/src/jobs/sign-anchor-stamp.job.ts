import { dbPlatform } from '../db/client.js';
import { stampHash } from '../services/opentimestamps.service.js';

/**
 * Submits a real Bitcoin-anchor calendar attestation for every completed
 * envelope whose signed PDF has been built (anchor_hash set) but hasn't
 * been submitted to OpenTimestamps yet (ots_proof still null).
 *
 * Split out from the completion request itself on purpose — stampHash() is
 * a real network call to the public OpenTimestamps calendar servers, and
 * the signer's own "your document is complete" response must never block
 * on (or fail because of) an external network round-trip. Same "real
 * business action marks the work ready, a scheduled job does the actual
 * external call" split declaration-ledger-anchor.job.ts / seal-ledger-
 * anchor.job.ts already use for their own daily stamp pass — this one
 * just runs far more often (15 min, not daily), since submission itself
 * is a single lightweight call per envelope, not a tenant-wide ledger
 * batch, and a signer reasonably expects their document's anchor to start
 * moving soon after completion rather than next day.
 */
export async function runSignAnchorStampJob(): Promise<void> {
  console.log('⏳ Running background job: Sign Anchor Stamp Submission...');
  try {
    const ready = await dbPlatform.selectFrom('sign_envelopes')
      .select(['id', 'tenant_id', 'anchor_hash'])
      .where('anchor_hash', 'is not', null)
      .where('ots_proof', 'is', null)
      .execute();

    if (ready.length === 0) {
      console.log('📝 No Sign envelopes waiting on an anchor submission.');
      return;
    }

    let submitted = 0, failed = 0;
    for (const env of ready) {
      try {
        const proof = await stampHash(env.anchor_hash!);
        await dbPlatform.updateTable('sign_envelopes').set({
          ots_proof: proof,
          anchor_status: 'pending',
        }).where('id', '=', env.id).where('ots_proof', 'is', null).execute();
        submitted++;
      } catch (err) {
        failed++;
        console.error(`❌ Sign anchor submission failed for envelope ${env.id}:`, err);
      }
    }

    console.log(`✅ Sign Anchor Stamp Submission completed — ${submitted} submitted, ${failed} failure(s) (will retry next run).`);
  } catch (error) {
    console.error('❌ Sign anchor stamp job failed:', error);
  }
}
