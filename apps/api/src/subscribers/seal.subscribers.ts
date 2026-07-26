import { registerSubscriber } from '../services/domain-events.service.js';
import { withTenant } from '../db/client.js';
import { SealService } from '../services/seal.service.js';

// A ClearOS shipment's own TANCIS-style declaration and a SEAL bonded-lot
// declaration are separate flows (see 109_seal_duty_and_declarations.sql's
// own comment on this), but a lot can still be soft-linked back to the
// shipment case it originated from (seal_lots.shipment_case_id). If that
// shipment's regular declaration gets released — duty paid, cargo cleared
// customs — any linked lot still sitting under bond has, in effect, also
// just cleared. Move it through the same append-only ledger every other
// SEAL movement uses, rather than leaving it stranded in FOREIGN_DUTY_SUSPENDED.
registerSubscriber('declaration.released', async (tenantId, event) => {
  const shipmentId = event.payload.shipmentId as string | undefined;
  if (!shipmentId) return;

  await withTenant(tenantId, async (trx) => {
    const lots = await trx.selectFrom('seal_lots')
      .select(['id'])
      .where('shipment_case_id', '=', shipmentId)
      .where('customs_status', '=', 'FOREIGN_DUTY_SUSPENDED')
      .execute();

    for (const lot of lots) {
      try {
        await SealService.recordMovement(trx, tenantId, {
          actorId: null, actorType: 'system', movementType: 'release', lotId: lot.id,
          toCustomsStatus: 'FOREIGN_DUTY_PAID',
          reasonCode: 'DECLARATION_RELEASED',
          reference: String(event.entityId ?? ''),
        });
      } catch (err: any) {
        console.error(`[SealSubscriber] failed to release lot ${lot.id} for declaration ${event.entityId}:`, err.message);
      }
    }
  });
});
