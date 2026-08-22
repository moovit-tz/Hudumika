import { dbPlatform, withTenant } from '../db/client.js';
import { checkConfirmation } from '../services/opentimestamps.service.js';

/** Re-checks every envelope with a pending Bitcoin anchor — the calendar
 *  attestation happens instantly at completion (see the allSigned branch of
 *  POST /public/:token/sign), but it only becomes independently
 *  Bitcoin-verifiable once the calendar's batch is actually mined, typically
 *  hours later. Mirrors runDeclarationLedgerAnchorConfirmationSweepJob's own
 *  shape exactly — same opentimestamps.service.ts wrapper, same "never mark
 *  confirmed on anything but a real report from the library" discipline. */
export async function runSignAnchorConfirmJob(): Promise<void> {
  console.log('⏳ Running background job: Sign Anchor Confirmation Sweep...');
  try {
    const pending = await dbPlatform.selectFrom('sign_envelopes')
      .select(['id', 'tenant_id', 'anchor_hash', 'ots_proof', 'ots_proof_upgraded'])
      .where('anchor_status', '=', 'pending')
      .execute();

    if (pending.length === 0) {
      console.log('📝 No pending Sign anchors to check.');
      return;
    }

    let confirmed = 0, stillPending = 0, failed = 0;
    for (const env of pending) {
      if (!env.anchor_hash || !(env.ots_proof_upgraded ?? env.ots_proof)) { failed++; continue; }
      try {
        const { proofBuffer, bitcoin } = await checkConfirmation(env.ots_proof_upgraded ?? env.ots_proof!, env.anchor_hash);
        await withTenant(env.tenant_id, async (trx) => {
          const patch: Record<string, unknown> = { ots_proof_upgraded: proofBuffer, anchor_checked_at: new Date() };
          if (bitcoin) {
            patch.anchor_status = 'confirmed';
            patch.anchor_block_height = bitcoin.blockHeight;
            patch.anchor_block_time = bitcoin.blockTime;
          }
          await trx.updateTable('sign_envelopes').set(patch).where('id', '=', env.id).execute();
        });
        if (bitcoin) { confirmed++; console.log(`✅ Sign envelope anchor confirmed: ${env.id} (block ${bitcoin.blockHeight})`); }
        else stillPending++;
      } catch (err) {
        failed++;
        console.error(`❌ Sign anchor confirmation check failed for ${env.id}:`, err);
      }
    }

    console.log(`✅ Sign Anchor Confirmation Sweep completed — ${confirmed} newly confirmed, ${stillPending} still pending, ${failed} check failure(s).`);
  } catch (error) {
    console.error('❌ Sign anchor confirmation sweep failed:', error);
  }
}
