import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { DeclarationService } from './declaration.service.js';
import { stampHash, checkConfirmation as otsCheckConfirmation } from './opentimestamps.service.js';

export class NothingToAnchor extends Error {
  constructor() {
    super('This tenant has no declarations yet — there is no ledger state to anchor.');
    this.name = 'NothingToAnchor';
  }
}

// Anchors a tenant's declaration-ledger checkpoint to Bitcoin via
// OpenTimestamps. Both the manual "Anchor Now" route and the scheduled job
// call anchorTenant — there is exactly one code path that creates an
// anchor, so the two triggers can never drift apart. Mirrors
// SealAnchorService exactly, reusing the same app-agnostic
// opentimestamps.service.ts wrapper.
export class DeclarationAnchorService {
  static async anchorTenant(
    trx: Transaction<Database>,
    tenantId: string,
    input: { trigger: 'manual' | 'scheduled'; requestedBy: string | null },
  ) {
    const { snapshot, checkpointHash } = await DeclarationService.buildTenantCheckpoint(trx, tenantId);
    if (snapshot.length === 0) throw new NothingToAnchor();

    const proof = await stampHash(checkpointHash);

    return trx.insertInto('declaration_ledger_anchors').values({
      tenant_id: tenantId,
      checkpoint_hash: checkpointHash,
      snapshot: JSON.stringify(snapshot),
      declaration_count: snapshot.length,
      ots_proof: proof,
      trigger: input.trigger,
      requested_by: input.requestedBy,
    }).returningAll().executeTakeFirstOrThrow();
  }

  /** Re-checks a pending anchor's proof against Bitcoin. Never marks an
   *  anchor confirmed unless OpenTimestamps itself reports a block. */
  static async checkAnchorConfirmation(trx: Transaction<Database>, anchorId: string) {
    const anchor = await trx.selectFrom('declaration_ledger_anchors').selectAll().where('id', '=', anchorId).executeTakeFirstOrThrow();
    if (anchor.status !== 'pending') return anchor;

    try {
      const { proofBuffer, bitcoin } = await otsCheckConfirmation(anchor.ots_proof, anchor.checkpoint_hash);
      const patch: any = { ots_proof_upgraded: proofBuffer, last_checked_at: new Date() };
      if (bitcoin) {
        patch.status = 'confirmed';
        patch.bitcoin_block_height = bitcoin.blockHeight;
        patch.bitcoin_block_time = bitcoin.blockTime;
      }
      return await trx.updateTable('declaration_ledger_anchors').set(patch)
        .where('id', '=', anchorId).returningAll().executeTakeFirstOrThrow();
    } catch (err: any) {
      return trx.updateTable('declaration_ledger_anchors')
        .set({ last_checked_at: new Date(), error_message: err.message })
        .where('id', '=', anchorId).returningAll().executeTakeFirstOrThrow();
    }
  }
}
