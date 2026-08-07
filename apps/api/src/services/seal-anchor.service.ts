import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { SealService } from './seal.service.js';
import { stampHash, checkConfirmation as otsCheckConfirmation } from './opentimestamps.service.js';

export class NothingToAnchor extends Error {
  constructor() {
    super('This compartment has no lots yet — there is no ledger state to anchor.');
    this.name = 'NothingToAnchor';
  }
}

// Anchors a compartment's ledger checkpoint (SealService.buildCompartmentCheckpoint)
// to Bitcoin via OpenTimestamps. Both the manual "Anchor Now" route and the
// scheduled job call anchorCompartment — there is exactly one code path
// that creates an anchor, so the two triggers can never drift apart.
export class SealAnchorService {
  static async anchorCompartment(
    trx: Transaction<Database>,
    tenantId: string,
    compartmentId: string,
    input: { trigger: 'manual' | 'scheduled'; requestedBy: string | null },
  ) {
    const { snapshot, checkpointHash } = await SealService.buildCompartmentCheckpoint(trx, tenantId, compartmentId);
    if (snapshot.length === 0) throw new NothingToAnchor();

    const proof = await stampHash(checkpointHash);

    return trx.insertInto('seal_ledger_anchors').values({
      tenant_id: tenantId,
      compartment_id: compartmentId,
      checkpoint_hash: checkpointHash,
      snapshot: JSON.stringify(snapshot),
      lot_count: snapshot.length,
      ots_proof: proof,
      trigger: input.trigger,
      requested_by: input.requestedBy,
    }).returningAll().executeTakeFirstOrThrow();
  }

  /** Re-checks a pending anchor's proof against Bitcoin. Never marks an
   *  anchor confirmed unless OpenTimestamps itself reports a block. */
  static async checkAnchorConfirmation(trx: Transaction<Database>, tenantId: string, anchorId: string) {
    const anchor = await trx.selectFrom('seal_ledger_anchors').selectAll().where('tenant_id', '=', tenantId).where('id', '=', anchorId).executeTakeFirstOrThrow();
    if (anchor.status !== 'pending') return anchor;

    try {
      const { proofBuffer, bitcoin } = await otsCheckConfirmation(anchor.ots_proof, anchor.checkpoint_hash);
      const patch: any = { ots_proof_upgraded: proofBuffer, last_checked_at: new Date() };
      if (bitcoin) {
        patch.status = 'confirmed';
        patch.bitcoin_block_height = bitcoin.blockHeight;
        patch.bitcoin_block_time = bitcoin.blockTime;
      }
      return await trx.updateTable('seal_ledger_anchors').set(patch)
        .where('tenant_id', '=', tenantId).where('id', '=', anchorId).returningAll().executeTakeFirstOrThrow();
    } catch (err: any) {
      return trx.updateTable('seal_ledger_anchors')
        .set({ last_checked_at: new Date(), error_message: err.message })
        .where('tenant_id', '=', tenantId).where('id', '=', anchorId).returningAll().executeTakeFirstOrThrow();
    }
  }
}
