// Dangerous goods beyond the SEAL bonded warehouse (M2 of the ClearOS
// roadmap). See migration 252_dangerous_goods.sql's header for the honesty
// boundary this whole feature works inside: the UN-number reference data is
// real and verified, but this platform does not fabricate IATA's own
// copyrighted packing-instruction quantity limits — the generated
// declaration mirrors the real IATA Shipper's Declaration structure but is
// not the officially licensed form, and says so on its own footer.
import PDFDocument from 'pdfkit';
import { dbPlatform, withTenant } from '../db/client.js';

export interface DgReferenceEntry {
  id: string;
  un_number: string;
  proper_shipping_name: string;
  class_or_division: string;
  subsidiary_risk: string | null;
  packing_group: string | null;
  air_transport_restriction: string | null;
  notes: string | null;
}

export async function searchDgReference(query: string): Promise<DgReferenceEntry[]> {
  const q = query.trim();
  if (!q) return [];
  return dbPlatform
    .selectFrom('dangerous_goods_reference')
    .selectAll()
    .where((eb) => eb.or([
      eb('un_number', 'ilike', `%${q}%`),
      eb('proper_shipping_name', 'ilike', `%${q}%`),
    ]))
    .orderBy('un_number')
    .limit(20)
    .execute();
}

export interface CreateDgDeclarationInput {
  subjectType: 'shipment' | 'seal_lot' | 'adhoc';
  subjectId: string | null;
  transportMode: 'AIR' | 'SEA' | 'ROAD';
  unNumber: string;
  packagingType?: string | null;
  numberOfPackages?: number | null;
  netQuantity?: number | null;
  quantityUnit?: string | null;
  shipperName: string;
  shipperAddress?: string | null;
  consigneeName: string;
  consigneeAddress?: string | null;
  emergencyContact?: string | null;
  additionalHandlingInfo?: string | null;
}

export async function createDgDeclaration(tenantId: string, userId: string, input: CreateDgDeclarationInput) {
  const ref = await dbPlatform
    .selectFrom('dangerous_goods_reference')
    .selectAll()
    .where('un_number', '=', input.unNumber.trim().toUpperCase())
    .executeTakeFirst();

  if (!ref) {
    throw new Error(`${input.unNumber} is not in the reference list. This platform ships a real but partial UN Dangerous Goods List — check the actual entry against the full IMDG/IATA DGR and add it to dangerous_goods_reference before declaring it.`);
  }

  return withTenant(tenantId, (trx) =>
    trx.insertInto('dg_declarations').values({
      tenant_id: tenantId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      transport_mode: input.transportMode,
      reference_id: ref.id,
      un_number: ref.un_number,
      proper_shipping_name: ref.proper_shipping_name,
      class_or_division: ref.class_or_division,
      subsidiary_risk: ref.subsidiary_risk,
      packing_group: ref.packing_group,
      air_transport_restriction: ref.air_transport_restriction,
      packaging_type: input.packagingType ?? null,
      number_of_packages: input.numberOfPackages ?? null,
      net_quantity: input.netQuantity ?? null,
      quantity_unit: input.quantityUnit ?? null,
      shipper_name: input.shipperName,
      shipper_address: input.shipperAddress ?? null,
      consignee_name: input.consigneeName,
      consignee_address: input.consigneeAddress ?? null,
      emergency_contact: input.emergencyContact ?? null,
      additional_handling_info: input.additionalHandlingInfo ?? null,
      created_by: userId,
    }).returningAll().executeTakeFirstOrThrow()
  );
}

export interface UpdateDgDeclarationInput {
  transportMode?: 'AIR' | 'SEA' | 'ROAD';
  unNumber?: string;
  packagingType?: string | null;
  numberOfPackages?: number | null;
  netQuantity?: number | null;
  quantityUnit?: string | null;
  shipperName?: string;
  shipperAddress?: string | null;
  consigneeName?: string;
  consigneeAddress?: string | null;
  emergencyContact?: string | null;
  additionalHandlingInfo?: string | null;
}

/** Edits a declaration's own fields — draft only. Once issued it's a real
 *  document (mirrored to the shipment's Cloud folder, migration 252's own
 *  reasoning), the same "a signed thing doesn't get silently rewritten"
 *  boundary this codebase already applies elsewhere (Sign envelopes, Tasks
 *  ownership). Re-resolves the reference row when unNumber changes so
 *  class/packing-group/etc. stay in sync with the platform's UN list rather
 *  than going stale against the originally-picked entry. */
export async function updateDgDeclaration(tenantId: string, id: string, input: UpdateDgDeclarationInput) {
  return withTenant(tenantId, async (trx) => {
    const existing = await trx.selectFrom('dg_declarations').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!existing) throw new Error('Declaration not found');
    if (existing.status !== 'draft') throw new Error('This declaration has already been issued and can no longer be edited.');

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (input.unNumber !== undefined) {
      const ref = await trx.selectFrom('dangerous_goods_reference').selectAll()
        .where('un_number', '=', input.unNumber.trim().toUpperCase()).executeTakeFirst();
      if (!ref) throw new Error(`${input.unNumber} is not in the reference list. This platform ships a real but partial UN Dangerous Goods List — check the actual entry against the full IMDG/IATA DGR and add it to dangerous_goods_reference before declaring it.`);
      updates.reference_id = ref.id;
      updates.un_number = ref.un_number;
      updates.proper_shipping_name = ref.proper_shipping_name;
      updates.class_or_division = ref.class_or_division;
      updates.subsidiary_risk = ref.subsidiary_risk;
      updates.packing_group = ref.packing_group;
      updates.air_transport_restriction = ref.air_transport_restriction;
    }
    if (input.transportMode !== undefined) updates.transport_mode = input.transportMode;
    if (input.packagingType !== undefined) updates.packaging_type = input.packagingType;
    if (input.numberOfPackages !== undefined) updates.number_of_packages = input.numberOfPackages;
    if (input.netQuantity !== undefined) updates.net_quantity = input.netQuantity;
    if (input.quantityUnit !== undefined) updates.quantity_unit = input.quantityUnit;
    if (input.shipperName !== undefined) updates.shipper_name = input.shipperName;
    if (input.shipperAddress !== undefined) updates.shipper_address = input.shipperAddress;
    if (input.consigneeName !== undefined) updates.consignee_name = input.consigneeName;
    if (input.consigneeAddress !== undefined) updates.consignee_address = input.consigneeAddress;
    if (input.emergencyContact !== undefined) updates.emergency_contact = input.emergencyContact;
    if (input.additionalHandlingInfo !== undefined) updates.additional_handling_info = input.additionalHandlingInfo;

    return trx.updateTable('dg_declarations').set(updates)
      .where('tenant_id', '=', tenantId).where('id', '=', id)
      .returningAll().executeTakeFirstOrThrow();
  });
}

/** Removes a draft declaration — e.g. a shipment switched back from
 *  "Dangerous goods" to "General cargo" on its Cargo Details step. Refuses
 *  on an issued one for the same reason updateDgDeclaration does. */
export async function deleteDgDeclaration(tenantId: string, id: string): Promise<void> {
  return withTenant(tenantId, async (trx) => {
    const existing = await trx.selectFrom('dg_declarations').select(['status'])
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!existing) return;
    if (existing.status !== 'draft') throw new Error('This declaration has already been issued and cannot be removed — it is a real filed document.');
    await trx.deleteFrom('dg_declarations').where('tenant_id', '=', tenantId).where('id', '=', id).execute();
  });
}

export async function listDgDeclarations(
  tenantId: string,
  filter?: { subjectType?: 'shipment' | 'seal_lot' | 'adhoc'; subjectId?: string }
) {
  return withTenant(tenantId, (trx) => {
    let q = trx.selectFrom('dg_declarations').selectAll()
      .where('tenant_id', '=', tenantId);
    if (filter?.subjectType) q = q.where('subject_type', '=', filter.subjectType);
    if (filter?.subjectId) q = q.where('subject_id', '=', filter.subjectId);
    return q.orderBy('created_at', 'desc').limit(200).execute();
  });
}

export async function getDgDeclaration(tenantId: string, id: string) {
  return withTenant(tenantId, (trx) =>
    trx.selectFrom('dg_declarations').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', id)
      .executeTakeFirst()
  );
}

export async function issueDgDeclaration(tenantId: string, id: string, userId: string) {
  return withTenant(tenantId, (trx) =>
    trx.updateTable('dg_declarations')
      .set({ status: 'issued', issued_by: userId, issued_at: new Date(), updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow()
  );
}

const AIR_RESTRICTION_LABEL: Record<string, string> = {
  FORBIDDEN: 'FORBIDDEN ON PASSENGER AND CARGO AIRCRAFT',
  CARGO_AIRCRAFT_ONLY: 'CARGO AIRCRAFT ONLY',
  PASSENGER_AND_CARGO: 'Passenger and cargo aircraft',
};

/**
 * Renders a real, populated dangerous-goods declaration PDF — structured the
 * way the IATA Shipper's Declaration for Dangerous Goods is laid out
 * (shipper/consignee, transport details, nature-and-quantity table, the
 * standard certification statement, emergency contact) using this
 * declaration's real recorded data. Not the officially licensed IATA form —
 * that layout and the packing-instruction quantity limits it references are
 * IATA's own copyrighted DGR content — so this says so on its own footer
 * rather than presenting itself as one.
 */
export async function renderDgDeclarationPdf(tenantId: string, id: string): Promise<Buffer> {
  const d = await getDgDeclaration(tenantId, id);
  if (!d) throw new Error('Declaration not found');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(14).font('Helvetica-Bold').text('DANGEROUS GOODS DECLARATION', { align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor('#555')
      .text('Structured on the IATA Shipper’s Declaration for Dangerous Goods layout — not the officially licensed IATA form.', { align: 'center' });
    doc.moveDown(1);
    doc.fillColor('#000');

    if (d.transport_mode === 'AIR' && d.air_transport_restriction === 'FORBIDDEN') {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#b00020')
        .text('THIS ITEM IS FORBIDDEN ON PASSENGER AND CARGO AIRCRAFT.', { align: 'center' });
      doc.fillColor('#000').moveDown(0.5);
    }

    const col = (label: string, value: string) => {
      doc.font('Helvetica-Bold').fontSize(9).text(label, { continued: true }).font('Helvetica').text(`  ${value || '—'}`);
    };

    doc.fontSize(10).font('Helvetica-Bold').text('Shipper');
    doc.font('Helvetica').fontSize(9).text(d.shipper_name);
    if (d.shipper_address) doc.text(d.shipper_address);
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(10).text('Consignee');
    doc.font('Helvetica').fontSize(9).text(d.consignee_name);
    if (d.consignee_address) doc.text(d.consignee_address);
    doc.moveDown(0.8);

    col('Transport mode:', d.transport_mode);
    col('Declaration status:', d.status.toUpperCase());
    if (d.issued_at) col('Issued:', new Date(d.issued_at).toLocaleString('en-GB'));
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(10).text('Nature and Quantity of Dangerous Goods');
    doc.moveDown(0.3);
    const tableTop = doc.y;
    const headers = ['UN No.', 'Proper Shipping Name', 'Class', 'Sub. Risk', 'PG', 'Qty / Packing'];
    const widths = [55, 165, 45, 55, 35, 130];
    let x = doc.x;
    doc.fontSize(8).font('Helvetica-Bold');
    headers.forEach((h, i) => { doc.text(h, x, tableTop, { width: widths[i] }); x += widths[i]; });
    doc.moveTo(doc.x - widths.reduce((a, b) => a + b, 0) - 1, tableTop + 14).lineTo(555, tableTop + 14).stroke();

    x = 40;
    const rowY = tableTop + 18;
    const cells = [
      d.un_number,
      d.proper_shipping_name,
      d.class_or_division,
      d.subsidiary_risk || '—',
      d.packing_group || '—',
      `${d.number_of_packages ?? '—'} ${d.packaging_type || ''} / ${d.net_quantity ?? '—'} ${d.quantity_unit || ''}`,
    ];
    doc.font('Helvetica').fontSize(8);
    cells.forEach((c, i) => { doc.text(String(c), x, rowY, { width: widths[i] }); x += widths[i]; });

    doc.moveDown(3);
    if (d.transport_mode === 'AIR' && d.air_transport_restriction) {
      doc.font('Helvetica-Bold').fontSize(9).text(`Aircraft limitation: ${AIR_RESTRICTION_LABEL[d.air_transport_restriction] ?? d.air_transport_restriction}`);
      doc.moveDown(0.5);
    }
    if (d.additional_handling_info) {
      doc.font('Helvetica-Bold').fontSize(9).text('Additional handling information:');
      doc.font('Helvetica').fontSize(9).text(d.additional_handling_info);
      doc.moveDown(0.5);
    }
    doc.font('Helvetica-Bold').fontSize(9).text('Emergency contact:', { continued: true }).font('Helvetica').text(`  ${d.emergency_contact || 'Not provided'}`);
    doc.moveDown(1);

    doc.font('Helvetica').fontSize(8).text(
      'I hereby declare that the contents of this consignment are fully and accurately described above by the proper shipping name, and are classified, packaged, marked and labelled/placarded, and are in all respects in proper condition for transport according to applicable international and national governmental regulations.',
      { align: 'justify' }
    );
    doc.moveDown(1.5);
    doc.text(`Name/title of signatory: ______________________________`);
    doc.moveDown(0.8);
    doc.text(`Place and date: ______________________________`);
    doc.moveDown(0.8);
    doc.text(`Signature: ______________________________`);

    doc.moveDown(2);
    doc.fontSize(7).fillColor('#888').text(
      `Generated by Hudumika ClearOS — declaration ${d.id} — ${new Date().toISOString()}. Reference data: platform UN Dangerous Goods List extract. This is not a substitute for the shipper's own IATA DGR / IMDG Code compliance check.`,
      { align: 'left' }
    );

    doc.end();
  });
}
