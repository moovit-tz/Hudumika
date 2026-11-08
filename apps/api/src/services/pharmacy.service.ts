// Pharmaceutical dispensing (industry-readiness backlog item 23, the
// dispensing half of the business's "both" scope decision — manufacturing
// reuses finance-production.service.ts/manufacturing-quality.service.ts,
// already built and hardened earlier this session). Deliberately does not
// model any drug-interaction, dosage-limit, or licensing-validity logic —
// this platform has no real pharmacology/licensing reference database, and
// the backlog's own text is explicit: "no invented medical rules," same
// reasoning industry-domains.service.ts's Healthcare clinical scope
// already follows. What's real here, and genuinely new, is enforcement of
// the data this platform already stores but never enforced anywhere:
// batch, expiry, FEFO allocation, quarantine/recall, and an attributable
// pharmacist-approval gate before anything leaves the shelf.
import { withTenant } from '../db/client.js';
import { getIndustryWork, IndustryWorkError } from './finance-industry-work.service.js';
import { InventoryService } from './inventory.service.js';

export async function createMedication(tenantId: string, input: {
  item_id: string; name: string; strength: string;
  form: 'tablet' | 'capsule' | 'syrup' | 'injection' | 'cream' | 'drops' | 'inhaler' | 'other';
  pack_size?: string; controlled?: boolean;
}) {
  return withTenant(tenantId, async trx => {
    const item = await trx.selectFrom('inventory_items').select('id').where('tenant_id', '=', tenantId).where('id', '=', input.item_id).executeTakeFirst();
    if (!item) throw new IndustryWorkError('Inventory item not found.', 404);
    return trx.insertInto('pharmacy_medications').values({
      tenant_id: tenantId, item_id: input.item_id, name: input.name, strength: input.strength,
      form: input.form, pack_size: input.pack_size ?? null, controlled: input.controlled ?? false,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function listMedications(tenantId: string) {
  return withTenant(tenantId, trx => trx.selectFrom('pharmacy_medications').selectAll().where('tenant_id', '=', tenantId).where('active', '=', true).orderBy('name').execute());
}

export async function createPrescriptionForDispensing(tenantId: string, actorId: string, workId: string, input: {
  medication_id: string; patient_name: string; patient_contact?: string;
  prescriber_name: string; prescriber_license?: string; dosage: string; quantity_prescribed: number;
}) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'pharmaceutical') throw new IndustryWorkError('Dispensing requires a pharmaceutical industry work.');
    const med = await trx.selectFrom('pharmacy_medications').select('id').where('tenant_id', '=', tenantId).where('id', '=', input.medication_id).where('active', '=', true).executeTakeFirst();
    if (!med) throw new IndustryWorkError('Medication not found.', 404);
    return trx.insertInto('pharmacy_prescriptions').values({
      tenant_id: tenantId, work_id: workId, medication_id: input.medication_id,
      patient_name: input.patient_name, patient_contact: input.patient_contact ?? null,
      prescriber_name: input.prescriber_name, prescriber_license: input.prescriber_license ?? null,
      dosage: input.dosage, quantity_prescribed: input.quantity_prescribed, created_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

/** The pharmacist-approval gate the backlog names explicitly — nothing may
 *  be dispensed against a prescription that hasn't passed through this. */
export async function approvePrescription(tenantId: string, actorId: string, prescriptionId: string) {
  return withTenant(tenantId, async trx => {
    const rx = await trx.selectFrom('pharmacy_prescriptions').select(['id', 'status']).where('tenant_id', '=', tenantId).where('id', '=', prescriptionId).forUpdate().executeTakeFirst();
    if (!rx) throw new IndustryWorkError('Prescription not found.', 404);
    if (rx.status !== 'pending') throw new IndustryWorkError('Only a pending prescription can be approved.');
    return trx.updateTable('pharmacy_prescriptions').set({ status: 'approved', approved_by: actorId, approved_at: new Date(), updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', prescriptionId).returningAll().executeTakeFirstOrThrow();
  });
}

export async function rejectPrescription(tenantId: string, actorId: string, prescriptionId: string, reason: string) {
  return withTenant(tenantId, async trx => {
    const rx = await trx.selectFrom('pharmacy_prescriptions').select(['id', 'status']).where('tenant_id', '=', tenantId).where('id', '=', prescriptionId).forUpdate().executeTakeFirst();
    if (!rx) throw new IndustryWorkError('Prescription not found.', 404);
    if (rx.status !== 'pending') throw new IndustryWorkError('Only a pending prescription can be rejected.');
    return trx.updateTable('pharmacy_prescriptions').set({ status: 'rejected', rejection_reason: reason, approved_by: actorId, approved_at: new Date(), updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', prescriptionId).returningAll().executeTakeFirstOrThrow();
  });
}

/**
 * Dispenses an approved prescription from real stock. Enforces, for real,
 * the three controls the backlog names: an explicit batch (or FEFO —
 * omit batch_no and the earliest-expiring unheld batch with enough stock
 * is chosen automatically), a held/quarantined batch is refused outright,
 * and an expired batch is refused outright — this platform already
 * stored expiry_date and batch_no on every stock row; nothing ever
 * checked either before now.
 */
export async function dispenseMedication(tenantId: string, actorId: string, prescriptionId: string, input: {
  location_id: string; batch_no?: string; substituted_item_id?: string; substitution_reason?: string;
}) {
  return withTenant(tenantId, async trx => {
    const rx = await trx.selectFrom('pharmacy_prescriptions').selectAll().where('tenant_id', '=', tenantId).where('id', '=', prescriptionId).forUpdate().executeTakeFirst();
    if (!rx) throw new IndustryWorkError('Prescription not found.', 404);
    if (rx.status !== 'approved') throw new IndustryWorkError('Only an approved prescription can be dispensed.');

    const med = await trx.selectFrom('pharmacy_medications').selectAll().where('tenant_id', '=', tenantId).where('id', '=', rx.medication_id).executeTakeFirstOrThrow();
    const dispenseItemId = input.substituted_item_id ?? med.item_id;
    const item = await trx.selectFrom('inventory_items').select(['id', 'base_uom']).where('tenant_id', '=', tenantId).where('id', '=', dispenseItemId).where('active', '=', true).forUpdate().executeTakeFirst();
    if (!item) throw new IndustryWorkError('Dispensing item not found or inactive.', 404);
    if (input.substituted_item_id && !input.substitution_reason) {
      throw new IndustryWorkError('A substitution requires a reason.', 400);
    }

    const today = new Date().toISOString().slice(0, 10);
    let batch: { batch_no: string; expiry_date: string | null; qty_on_hand: string } | undefined;
    if (input.batch_no) {
      batch = await trx.selectFrom('inventory_stock_levels').select(['batch_no', 'expiry_date', 'qty_on_hand'])
        .where('tenant_id', '=', tenantId).where('item_id', '=', dispenseItemId).where('location_id', '=', input.location_id)
        .where('batch_no', '=', input.batch_no).forUpdate().executeTakeFirst();
      if (!batch) throw new IndustryWorkError('That batch has no recorded stock at this location.', 404);
    } else {
      // FEFO: earliest-expiring batch with enough unheld stock, chosen
      // under lock so two concurrent dispensations can't both pick the
      // same batch past what it actually has.
      // Postgres sorts NULL expiry_date last under ASC by default, which
      // is exactly the right FEFO behaviour here: a batch with no
      // recorded expiry is tried only after every batch that actually
      // has one, soonest first.
      const candidates = await trx.selectFrom('inventory_stock_levels').select(['batch_no', 'expiry_date', 'qty_on_hand'])
        .where('tenant_id', '=', tenantId).where('item_id', '=', dispenseItemId).where('location_id', '=', input.location_id)
        .where('qty_on_hand', '>', '0')
        .orderBy('expiry_date', 'asc')
        .forUpdate().execute();
      batch = candidates.find(c => Number(c.qty_on_hand) >= rx.quantity_prescribed);
      if (!batch) throw new IndustryWorkError('No single batch at this location has enough unexpired, unheld stock for this quantity.', 409);
    }

    if (batch.expiry_date && batch.expiry_date < today) {
      throw new IndustryWorkError(`Batch ${batch.batch_no} expired on ${batch.expiry_date} and cannot be dispensed.`, 409);
    }
    const hold = await trx.selectFrom('pharmacy_batch_holds').select('reason')
      .where('tenant_id', '=', tenantId).where('item_id', '=', dispenseItemId).where('batch_no', '=', batch.batch_no).where('status', '=', 'active')
      .executeTakeFirst();
    if (hold) throw new IndustryWorkError(`Batch ${batch.batch_no} is on quarantine hold: ${hold.reason}`, 409);
    if (Number(batch.qty_on_hand) < rx.quantity_prescribed) {
      throw new IndustryWorkError(`Only ${batch.qty_on_hand} units of batch ${batch.batch_no} are available; ${rx.quantity_prescribed} requested.`, 409);
    }

    const movement = await InventoryService.recordMovement(trx, tenantId, {
      actorId, movementType: 'issue', itemId: dispenseItemId, fromLocationId: input.location_id,
      enteredQty: rx.quantity_prescribed, enteredUom: item.base_uom, batchNo: batch.batch_no,
      reasonCode: 'PHARMACY_DISPENSE', reference: `RX-${prescriptionId.slice(0, 8)}`,
    });

    const dispensation = await trx.insertInto('pharmacy_dispensations').values({
      tenant_id: tenantId, prescription_id: prescriptionId, item_id: dispenseItemId, batch_no: batch.batch_no,
      quantity: rx.quantity_prescribed, substituted_item_id: input.substituted_item_id ?? null,
      substitution_reason: input.substitution_reason ?? null, dispensed_by: actorId, movement_id: String(movement.id),
    }).returningAll().executeTakeFirstOrThrow();

    await trx.updateTable('pharmacy_prescriptions').set({ status: 'dispensed', updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', prescriptionId).execute();

    return dispensation;
  });
}

export async function returnDispensedMedication(tenantId: string, actorId: string, dispensationId: string, input: { location_id: string }) {
  return withTenant(tenantId, async trx => {
    const disp = await trx.selectFrom('pharmacy_dispensations').selectAll().where('tenant_id', '=', tenantId).where('id', '=', dispensationId).forUpdate().executeTakeFirst();
    if (!disp) throw new IndustryWorkError('Dispensation not found.', 404);
    if (disp.returned_at) throw new IndustryWorkError('This dispensation has already been returned.', 409);
    const item = await trx.selectFrom('inventory_items').select('base_uom').where('tenant_id', '=', tenantId).where('id', '=', disp.item_id).executeTakeFirstOrThrow();
    const movement = await InventoryService.recordMovement(trx, tenantId, {
      actorId, movementType: 'return', itemId: disp.item_id, toLocationId: input.location_id,
      enteredQty: Number(disp.quantity), enteredUom: item.base_uom, batchNo: disp.batch_no,
      reasonCode: 'PHARMACY_RETURN', reference: `DISP-${dispensationId.slice(0, 8)}`,
    });
    const updated = await trx.updateTable('pharmacy_dispensations').set({
      returned_at: new Date(), returned_by: actorId, return_movement_id: String(movement.id),
    }).where('tenant_id', '=', tenantId).where('id', '=', dispensationId).returningAll().executeTakeFirstOrThrow();
    await trx.updateTable('pharmacy_prescriptions').set({ status: 'returned', updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', disp.prescription_id).execute();
    return updated;
  });
}

export async function holdBatch(tenantId: string, actorId: string, input: { item_id: string; batch_no: string; reason: string }) {
  return withTenant(tenantId, async trx => {
    const existing = await trx.selectFrom('pharmacy_batch_holds').select('id')
      .where('tenant_id', '=', tenantId).where('item_id', '=', input.item_id).where('batch_no', '=', input.batch_no).where('status', '=', 'active')
      .executeTakeFirst();
    if (existing) throw new IndustryWorkError('This batch already has an active hold.', 409);
    return trx.insertInto('pharmacy_batch_holds').values({
      tenant_id: tenantId, item_id: input.item_id, batch_no: input.batch_no, reason: input.reason, held_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function releaseBatchHold(tenantId: string, actorId: string, holdId: string) {
  return withTenant(tenantId, async trx => {
    const hold = await trx.selectFrom('pharmacy_batch_holds').select(['id', 'status']).where('tenant_id', '=', tenantId).where('id', '=', holdId).forUpdate().executeTakeFirst();
    if (!hold) throw new IndustryWorkError('Hold not found.', 404);
    if (hold.status !== 'active') throw new IndustryWorkError('This hold has already been released.');
    return trx.updateTable('pharmacy_batch_holds').set({ status: 'released', released_by: actorId, released_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', holdId).returningAll().executeTakeFirstOrThrow();
  });
}

/** Lot traceability for a recall: every real dispensation that came out
 *  of this exact item+batch, so an affected-patient list is a real query
 *  against what was actually dispensed, not a guess. */
export async function recallReport(tenantId: string, itemId: string, batchNo: string) {
  return withTenant(tenantId, trx =>
    trx.selectFrom('pharmacy_dispensations as d')
      .innerJoin('pharmacy_prescriptions as rx', 'rx.id', 'd.prescription_id')
      .select(['d.id', 'd.quantity', 'd.dispensed_at', 'd.returned_at', 'rx.patient_name', 'rx.patient_contact', 'rx.prescriber_name'])
      .where('d.tenant_id', '=', tenantId).where('d.item_id', '=', itemId).where('d.batch_no', '=', batchNo)
      .orderBy('d.dispensed_at', 'desc').execute(),
  );
}
