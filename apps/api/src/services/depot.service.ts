// Container/equipment depot management (M6 of the ClearOS roadmap) — a
// genuinely new concept, deliberately NOT merged with the three existing
// per-shipment container tables (shipment_cases.containers JSONB,
// container_tracking, seal_containers). See migration 254's header and
// 107_seal_gate_and_bond.sql's own precedent for why: this is equipment
// sitting at a depot, not yet tied to any one shipment, and interchange
// receipts soft-link to whichever of those tables actually concerns them.
import PDFDocument from 'pdfkit';
import { withTenant } from '../db/client.js';

export interface CreateEquipmentInput {
  equipmentNumber: string;
  equipmentType: 'CONTAINER_20FT' | 'CONTAINER_40FT' | 'CONTAINER_40HC' | 'CHASSIS' | 'GENSET' | 'OTHER';
  condition?: 'GOOD' | 'DAMAGED' | 'UNDER_REPAIR';
  location?: string;
  ownerCarrier?: string;
  notes?: string;
}

export async function createDepotEquipment(tenantId: string, userId: string, input: CreateEquipmentInput) {
  return withTenant(tenantId, (trx) =>
    trx.insertInto('depot_equipment').values({
      tenant_id: tenantId,
      equipment_number: input.equipmentNumber.trim().toUpperCase(),
      equipment_type: input.equipmentType,
      condition: input.condition ?? 'GOOD',
      location: input.location ?? null,
      owner_carrier: input.ownerCarrier ?? null,
      notes: input.notes ?? null,
      last_movement_at: new Date(),
      created_by: userId,
    }).returningAll().executeTakeFirstOrThrow()
  );
}

export async function listDepotEquipment(tenantId: string, status?: string) {
  return withTenant(tenantId, (trx) => {
    let q = trx.selectFrom('depot_equipment').selectAll().where('tenant_id', '=', tenantId);
    if (status) q = q.where('status', '=', status);
    return q.orderBy('created_at', 'desc').limit(300).execute();
  });
}

export async function updateDepotEquipmentStatus(tenantId: string, id: string, status: string) {
  return withTenant(tenantId, (trx) =>
    trx.updateTable('depot_equipment')
      .set({ status, last_movement_at: new Date(), updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', id)
      .returningAll().executeTakeFirstOrThrow()
  );
}

export interface RecordInterchangeInput {
  subjectType: 'depot_equipment' | 'container_tracking' | 'seal_container' | 'adhoc';
  subjectId: string | null;
  /** Which delivery_documents row (a RELEASE_ORDER/DELIVERY_ORDER) authorized
   *  this pickup, if any — see migration 263. Independent of subjectType/
   *  subjectId, which is about the equipment-side entity, not the document
   *  that authorized moving it. */
  releaseDocumentId?: string | null;
  equipmentNumber: string;
  direction: 'GATE_IN' | 'GATE_OUT';
  partyName: string;
  conditionAtInterchange?: 'GOOD' | 'DAMAGED';
  damageNotes?: string;
  sealNumber?: string;
  driverName?: string;
  vehicleReg?: string;
  signatureName?: string;
}

/**
 * Records a real Equipment Interchange Receipt — replacing SEAL's
 * unpersisted print-only HTML (SealConsignmentDetail.tsx's handlePrintEir)
 * with an actual queryable row. Best-effort links to depot_equipment by
 * equipment number (updates its status/location/condition/last_movement_at)
 * when a matching row exists in this tenant; the receipt itself is
 * recorded either way, since not every interchanged unit is depot-tracked.
 */
export async function recordInterchange(tenantId: string, userId: string, input: RecordInterchangeInput) {
  const equipmentNumber = input.equipmentNumber.trim().toUpperCase();
  const referenceNumber = `EIR-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

  const receipt = await withTenant(tenantId, (trx) =>
    trx.insertInto('equipment_interchange_receipts').values({
      tenant_id: tenantId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      release_document_id: input.releaseDocumentId ?? null,
      equipment_number: equipmentNumber,
      direction: input.direction,
      party_name: input.partyName,
      condition_at_interchange: input.conditionAtInterchange ?? 'GOOD',
      damage_notes: input.damageNotes ?? null,
      seal_number: input.sealNumber ?? null,
      driver_name: input.driverName ?? null,
      vehicle_reg: input.vehicleReg ?? null,
      signature_name: input.signatureName ?? null,
      reference_number: referenceNumber,
      created_by: userId,
    }).returningAll().executeTakeFirstOrThrow()
  );

  await withTenant(tenantId, (trx) =>
    trx.updateTable('depot_equipment')
      .set({
        status: input.direction === 'GATE_IN' ? 'AVAILABLE' : 'OUT',
        condition: input.conditionAtInterchange ?? 'GOOD',
        last_movement_at: new Date(),
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('equipment_number', '=', equipmentNumber)
      .execute()
  ).catch(() => { /* no matching depot_equipment row — the receipt still stands on its own */ });

  return receipt;
}

export async function listInterchangeReceipts(tenantId: string, equipmentNumber?: string, releaseDocumentId?: string) {
  return withTenant(tenantId, (trx) => {
    let q = trx.selectFrom('equipment_interchange_receipts').selectAll().where('tenant_id', '=', tenantId);
    if (equipmentNumber) q = q.where('equipment_number', '=', equipmentNumber.trim().toUpperCase());
    if (releaseDocumentId) q = q.where('release_document_id', '=', releaseDocumentId);
    return q.orderBy('occurred_at', 'desc').limit(300).execute();
  });
}

export async function getInterchangeReceipt(tenantId: string, id: string) {
  return withTenant(tenantId, (trx) =>
    trx.selectFrom('equipment_interchange_receipts').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', id)
      .executeTakeFirst()
  );
}

/** A real Equipment Interchange Receipt document — condition/damage record, not just a print-and-forget popup. */
export async function renderEirPdf(tenantId: string, id: string): Promise<Buffer> {
  const r = await getInterchangeReceipt(tenantId, id);
  if (!r) throw new Error('Interchange receipt not found');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (b) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(14).font('Helvetica-Bold').text('EQUIPMENT INTERCHANGE RECEIPT', { align: 'center' });
    doc.fontSize(9).font('Helvetica').text(r.reference_number || r.id, { align: 'center' });
    doc.moveDown(1);

    const row = (label: string, value: string) => {
      doc.font('Helvetica-Bold').fontSize(9).text(`${label}: `, { continued: true }).font('Helvetica').text(value || '—');
    };

    row('Direction', r.direction === 'GATE_IN' ? 'Gate In (returned to depot)' : 'Gate Out (released from depot)');
    row('Equipment No.', r.equipment_number);
    row('Party', r.party_name);
    row('Condition', r.condition_at_interchange);
    if (r.damage_notes) row('Damage notes', r.damage_notes);
    if (r.seal_number) row('Seal No.', r.seal_number);
    if (r.driver_name) row('Driver', r.driver_name);
    if (r.vehicle_reg) row('Vehicle Reg.', r.vehicle_reg);
    row('Occurred at', new Date(r.occurred_at).toLocaleString('en-GB'));
    doc.moveDown(1.5);

    doc.font('Helvetica').fontSize(8).text('Both parties acknowledge the equipment condition recorded above at the time of interchange.');
    doc.moveDown(1.5);
    doc.text(`Signed: ${r.signature_name || '______________________________'}`);

    doc.moveDown(2);
    doc.fontSize(7).fillColor('#888').text(`Generated by Hudumika ClearOS — ${r.id} — ${new Date().toISOString()}.`);

    doc.end();
  });
}
