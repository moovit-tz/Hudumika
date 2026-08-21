// Delivery Documents — the merge of ClearOS's Release/Delivery Orders
// (customs gate-pass: container list, carrier, validity window — migration
// 254) and FinOps's Delivery Notes (proof-of-delivery: goods table, driver,
// signatures — migration 022) into one real document type (migration 263).
// See that migration's own header for the reasoning. doc_type keeps both
// source concepts distinguishable on one table rather than three; not every
// column is meaningful for every type (containers is RO/DO-only,
// delivery_document_lines is DELIVERY_NOTE-only).
import PDFDocument from 'pdfkit';
import { withTenant } from '../db/client.js';

export interface ContainerLine {
  number: string;
  size: '20FT' | '40FT' | '40HC' | 'OTHER';
  seal_number?: string;
  weight_kg?: number;
}

export interface DeliveryDocumentLineInput {
  description?: string;
  qty_ordered?: number;
  qty_delivered?: number;
  unit?: string;
  condition?: string;
  remarks?: string;
}

export type DocType = 'RELEASE_ORDER' | 'DELIVERY_ORDER' | 'DELIVERY_NOTE';

export interface CreateDeliveryDocumentInput {
  docType: DocType;
  subjectType?: 'shipment' | 'adhoc';
  subjectId?: string | null;
  invoiceId?: string | null;
  customerId?: string | null;
  customerName?: string;
  customerAddress?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  deliveryAddress?: string;
  city?: string;
  containers?: ContainerLine[];
  carrierName?: string;
  vesselVoyage?: string;
  driverName?: string;
  vehicleNo?: string;
  driverContact?: string;
  releaseConditions?: string;
  discrepancyNotes?: string;
  validFrom?: string;
  validUntil?: string;
  deliveryDate?: string;
  lines?: DeliveryDocumentLineInput[];
}

const DOC_PREFIX: Record<DocType, string> = {
  RELEASE_ORDER: 'RO',
  DELIVERY_ORDER: 'DO',
  DELIVERY_NOTE: 'DN',
};

export async function createDeliveryDocument(tenantId: string, userId: string, input: CreateDeliveryDocumentInput) {
  const doc = await withTenant(tenantId, (trx) =>
    trx.insertInto('delivery_documents').values({
      tenant_id: tenantId,
      doc_type: input.docType,
      subject_type: input.subjectType ?? 'adhoc',
      subject_id: input.subjectId ?? null,
      invoice_id: input.invoiceId ?? null,
      customer_id: input.customerId ?? null,
      customer_name: input.customerName ?? null,
      customer_address: input.customerAddress ?? null,
      contact_person: input.contactPerson ?? null,
      contact_phone: input.contactPhone ?? null,
      contact_email: input.contactEmail ?? null,
      delivery_address: input.deliveryAddress ?? null,
      city: input.city ?? null,
      containers: JSON.stringify(input.containers ?? []) as any,
      carrier_name: input.carrierName ?? null,
      vessel_voyage: input.vesselVoyage ?? null,
      driver_name: input.driverName ?? null,
      vehicle_no: input.vehicleNo ?? null,
      driver_contact: input.driverContact ?? null,
      release_conditions: input.releaseConditions ?? null,
      discrepancy_notes: input.discrepancyNotes ?? null,
      valid_from: (input.validFrom as any) ?? null,
      valid_until: (input.validUntil as any) ?? null,
      delivery_date: (input.deliveryDate as any) ?? null,
      created_by: userId,
    }).returningAll().executeTakeFirstOrThrow()
  );

  if (input.lines?.length) {
    await withTenant(tenantId, (trx) =>
      trx.insertInto('delivery_document_lines').values(
        input.lines!.map((l, i) => ({
          document_id: doc.id,
          description: l.description || '',
          qty_ordered: l.qty_ordered ?? 0,
          qty_delivered: l.qty_delivered ?? 0,
          unit: l.unit ?? null,
          condition: l.condition ?? null,
          remarks: l.remarks ?? null,
          sort_order: i,
        }))
      ).execute()
    );
  }

  return doc;
}

export async function listDeliveryDocuments(tenantId: string, filters: { subjectId?: string; docType?: DocType; status?: string } = {}) {
  return withTenant(tenantId, (trx) => {
    let q = trx.selectFrom('delivery_documents').selectAll().where('tenant_id', '=', tenantId);
    if (filters.subjectId) q = q.where('subject_type', '=', 'shipment').where('subject_id', '=', filters.subjectId);
    if (filters.docType) q = q.where('doc_type', '=', filters.docType);
    if (filters.status) q = q.where('status', '=', filters.status);
    return q.orderBy('created_at', 'desc').limit(300).execute();
  });
}

export async function getDeliveryDocument(tenantId: string, id: string) {
  return withTenant(tenantId, async (trx) => {
    const doc = await trx.selectFrom('delivery_documents').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!doc) return null;
    const lines = await trx.selectFrom('delivery_document_lines').selectAll()
      .where('document_id', '=', id).orderBy('sort_order', 'asc').execute();
    return { ...doc, lines };
  });
}

export interface UpdateDeliveryDocumentInput extends Partial<Omit<CreateDeliveryDocumentInput, 'docType'>> {
  status?: string;
}

export async function updateDeliveryDocument(tenantId: string, id: string, input: UpdateDeliveryDocumentInput) {
  const patch: Record<string, any> = { updated_at: new Date() };
  const map: Record<string, string> = {
    subjectType: 'subject_type', subjectId: 'subject_id', invoiceId: 'invoice_id', customerId: 'customer_id',
    customerName: 'customer_name', customerAddress: 'customer_address', contactPerson: 'contact_person',
    contactPhone: 'contact_phone', contactEmail: 'contact_email', deliveryAddress: 'delivery_address', city: 'city',
    carrierName: 'carrier_name', vesselVoyage: 'vessel_voyage', driverName: 'driver_name', vehicleNo: 'vehicle_no',
    driverContact: 'driver_contact', releaseConditions: 'release_conditions', discrepancyNotes: 'discrepancy_notes',
    validFrom: 'valid_from', validUntil: 'valid_until', deliveryDate: 'delivery_date', status: 'status',
  };
  for (const [key, column] of Object.entries(map)) {
    if ((input as any)[key] !== undefined) patch[column] = (input as any)[key];
  }
  if (input.containers !== undefined) patch.containers = JSON.stringify(input.containers) as any;

  return withTenant(tenantId, async (trx) => {
    if (Object.keys(patch).length > 1) {
      await trx.updateTable('delivery_documents').set(patch)
        .where('tenant_id', '=', tenantId).where('id', '=', id).execute();
    }
    if (input.lines) {
      await trx.deleteFrom('delivery_document_lines').where('document_id', '=', id).execute();
      if (input.lines.length > 0) {
        await trx.insertInto('delivery_document_lines').values(
          input.lines.map((l, i) => ({
            document_id: id,
            description: l.description || '',
            qty_ordered: l.qty_ordered ?? 0,
            qty_delivered: l.qty_delivered ?? 0,
            unit: l.unit ?? null,
            condition: l.condition ?? null,
            remarks: l.remarks ?? null,
            sort_order: i,
          }))
        ).execute();
      }
    }
    const doc = await trx.selectFrom('delivery_documents').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!doc) throw new Error('Delivery document not found');
    return doc;
  });
}

async function getDoc(tenantId: string, id: string) {
  const doc = await withTenant(tenantId, (trx) =>
    trx.selectFrom('delivery_documents').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst()
  );
  if (!doc) throw new Error('Delivery document not found');
  return doc;
}

/** draft -> issued (RELEASE_ORDER/DELIVERY_ORDER lifecycle). Assigns the doc_number. */
export async function issueDeliveryDocument(tenantId: string, id: string, userId: string) {
  const existing = await getDoc(tenantId, id);
  if (existing.status !== 'draft') throw new Error(`Cannot issue — status is ${existing.status}, not draft.`);

  const prefix = DOC_PREFIX[existing.doc_type as DocType] ?? 'DOC';
  const docNumber = `${prefix}-${new Date().getFullYear()}-${existing.id.slice(0, 8).toUpperCase()}`;

  return withTenant(tenantId, (trx) =>
    trx.updateTable('delivery_documents')
      .set({ status: 'issued', issued_by: userId, issued_at: new Date(), doc_number: docNumber, updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', id)
      .returningAll().executeTakeFirstOrThrow()
  );
}

/** issued -> used (RELEASE_ORDER/DELIVERY_ORDER — the gate pass was redeemed). */
export async function markDeliveryDocumentUsed(tenantId: string, id: string) {
  const existing = await getDoc(tenantId, id);
  if (existing.status !== 'issued') throw new Error(`Cannot mark used — status is ${existing.status}, not issued.`);

  return withTenant(tenantId, (trx) =>
    trx.updateTable('delivery_documents')
      .set({ status: 'used', used_at: new Date(), updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', id)
      .returningAll().executeTakeFirstOrThrow()
  );
}

const DELIVERY_NOTE_STATUSES = ['draft', 'dispatched', 'delivered', 'returned'] as const;

/** Free status transition for the DELIVERY_NOTE lifecycle — same looseness the old delivery_notes table had. */
export async function setDeliveryDocumentStatus(tenantId: string, id: string, status: string) {
  if (!DELIVERY_NOTE_STATUSES.includes(status as any)) throw new Error(`Invalid status: ${status}`);
  const timestampColumn = status === 'dispatched' ? 'dispatched_at' : status === 'delivered' ? 'delivered_at' : null;

  return withTenant(tenantId, (trx) =>
    trx.updateTable('delivery_documents')
      .set({ status, updated_at: new Date(), ...(timestampColumn ? { [timestampColumn]: new Date() } : {}) })
      .where('tenant_id', '=', tenantId).where('id', '=', id)
      .returningAll().executeTakeFirstOrThrow()
  );
}

export async function deleteDeliveryDocument(tenantId: string, id: string) {
  return withTenant(tenantId, (trx) =>
    trx.deleteFrom('delivery_documents').where('tenant_id', '=', tenantId).where('id', '=', id).returningAll().executeTakeFirst()
  );
}

// ─── PDF rendering (pdfkit) — restores the branded layout the original
// DeliveryNotes.tsx print template (window.print(), screen-only) had, now
// as a real backend document for every doc_type. Same orange/dark palette
// the old template hardcoded (not tenant-brand-derived — that template
// never was, and this is a faithful restoration, not a redesign). ─────────

const ORANGE = '#f97316';
const DARK = '#1e293b';
const CREAM = '#fdf8f0';
const SECTION_BG = '#fef9f5';
const BORDER = '#e5e7eb';
const INK = '#111111';

interface CompanyInfo { name: string; address: string; city: string; country: string; phone: string; email: string; website: string; }

async function getCompanyInfo(tenantId: string): Promise<CompanyInfo> {
  return withTenant(tenantId, async (trx) => {
    const [settingsRow, tenant] = await Promise.all([
      trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst(),
      trx.selectFrom('tenants').select(['name']).where('id', '=', tenantId).executeTakeFirst(),
    ]);
    const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
    const c = (settings as any)?.company || {};
    return {
      name: c.name || tenant?.name || 'Hudumika',
      address: c.address || '',
      city: c.city || '',
      country: c.country || '',
      phone: c.phone || '',
      email: c.email || '',
      website: c.website || '',
    };
  });
}

function sectionHeader(doc: PDFKit.PDFDocument, x: number, y: number, w: number, title: string): number {
  doc.rect(x, y, w, 16).fill(SECTION_BG);
  doc.rect(x, y, 3, 16).fill(ORANGE);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text(title.toUpperCase(), x + 10, y + 4, { characterSpacing: 0.4 });
  return y + 16;
}

/** label/value pairs in a fixed-column grid, orange labels, underlined values.
 *  Both lines are height-capped and ellipsised — a long name/email wrapping
 *  to a second line would otherwise overrun into the row below it (this
 *  actually happened: "Dodoma Wine Company" wrapped and collided with the
 *  Contact/Phone row underneath, verified against a real rendered PDF). */
function fieldGrid(doc: PDFKit.PDFDocument, x: number, y: number, w: number, fields: [string, string][], cols = 3): number {
  const colW = w / cols;
  const rowH = 24;
  fields.forEach(([label, value], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const fx = x + col * colW;
    const fy = y + row * rowH;
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(ORANGE).text(label.toUpperCase(), fx, fy, { width: colW - 8, height: 8, ellipsis: true, characterSpacing: 0.2 });
    doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(value || ' ', fx, fy + 9, { width: colW - 8, height: 11, ellipsis: true });
    doc.moveTo(fx, fy + 20).lineTo(fx + colW - 8, fy + 20).strokeColor(BORDER).lineWidth(0.5).stroke();
  });
  return y + Math.ceil(fields.length / cols) * rowH;
}

/** Bordered table: orange header row, alternating body rows, optional totals row. */
function documentTable(doc: PDFKit.PDFDocument, x: number, y: number, colWidths: number[], headers: string[], rows: (string | number)[][], totals?: (string | number)[]): number {
  const w = colWidths.reduce((a, b) => a + b, 0);
  const rowH = 16;
  let cy = y;

  doc.rect(x, cy, w, rowH).fill(ORANGE);
  let cx = x;
  headers.forEach((h, i) => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff').text(h, cx + 5, cy + 4, { width: colWidths[i] - 8 });
    cx += colWidths[i];
  });
  cy += rowH;

  rows.forEach((row, ri) => {
    doc.rect(x, cy, w, rowH).fill(ri % 2 === 1 ? '#fafafa' : '#ffffff');
    cx = x;
    row.forEach((cell, ci) => {
      doc.font('Helvetica').fontSize(7.5).fillColor(INK).text(String(cell ?? ''), cx + 5, cy + 4, { width: colWidths[ci] - 8, ellipsis: true });
      cx += colWidths[ci];
    });
    cy += rowH;
  });

  // grid lines
  doc.rect(x, y, w, cy - y).strokeColor(BORDER).lineWidth(0.5).stroke();
  let lx = x;
  colWidths.forEach((cw) => { lx += cw; doc.moveTo(lx, y).lineTo(lx, cy).strokeColor(BORDER).lineWidth(0.5).stroke(); });
  for (let ly = y + rowH; ly < cy; ly += rowH) doc.moveTo(x, ly).lineTo(x + w, ly).strokeColor(BORDER).lineWidth(0.5).stroke();

  if (totals) {
    doc.rect(x, cy, w, rowH).fill(SECTION_BG);
    doc.rect(x, cy, w, rowH).strokeColor(BORDER).lineWidth(0.5).stroke();
    cx = x;
    totals.forEach((cell, ci) => {
      if (cell !== '') doc.font('Helvetica-Bold').fontSize(7.5).fillColor(ORANGE).text(String(cell), cx + 5, cy + 4, { width: colWidths[ci] - 8 });
      cx += colWidths[ci];
    });
    cy += rowH;
  }
  return cy;
}

const DOC_TITLE: Record<string, string> = { RELEASE_ORDER: 'RELEASE ORDER', DELIVERY_ORDER: 'DELIVERY ORDER', DELIVERY_NOTE: 'DELIVERY NOTE' };
const STATUS_OPTIONS: [string, string][] = [
  ['delivered', 'Fully Delivered'], ['dispatched', 'Partially Delivered'],
  ['damaged', 'Goods Damaged'], ['returned', 'Returned'],
];
const dateFmt = (d: string | Date | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

/** A real generated document for every type — replaces both the old
 *  release-order PDF and delivery notes' screen-only window.print(), and
 *  restores the branded layout (header band, consignee/transport boxes,
 *  bordered goods/container table, status + signatures) the print template
 *  had before the merge. */
export async function renderDeliveryDocumentPdf(tenantId: string, id: string): Promise<Buffer> {
  const r = await getDeliveryDocument(tenantId, id);
  if (!r) throw new Error('Delivery document not found');
  const containers: ContainerLine[] = typeof r.containers === 'string' ? JSON.parse(r.containers) : (r.containers as any) ?? [];
  const company = await getCompanyInfo(tenantId);
  const isDeliveryNote = r.doc_type === 'DELIVERY_NOTE';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 32 });
    const chunks: Buffer[] = [];
    doc.on('data', (b) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const M = 32;
    const W = 595.28 - M * 2;
    // Proportioned closer to the original template's 210/1fr/190 (out of a
    // ~960px page) than an even split — the title needs the most room, and
    // a too-narrow middle column wrapped "DELIVERY NOTE" onto a second line
    // that then collided with the website text below it (seen on a real
    // rendered PDF before this fix).
    const leftW = 150, rightW = 130, midW = W - leftW - rightW;
    let y = M;

    // ── Header band ──
    const headerH = 74;
    doc.rect(M, y, leftW, headerH).fill(DARK);
    doc.rect(M, y, 4, headerH).fill(ORANGE);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff').text(company.name, M + 14, y + 10, { width: leftW - 24, height: 26, ellipsis: true });
    doc.font('Helvetica').fontSize(7).fillColor('#c7ccd6').text(
      [company.address, [company.city, company.country].filter(Boolean).join(', ')].filter(Boolean).join('\n'),
      M + 14, doc.y + 4, { width: leftW - 24 }
    );
    doc.font('Helvetica').fontSize(7).fillColor('#c7ccd6').text(
      [company.phone, company.email].filter(Boolean).join('  ·  '), M + 14, doc.y + 2, { width: leftW - 24 }
    );

    doc.rect(M + leftW, y, midW, headerH).fill(DARK);
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#ffffff')
      .text(DOC_TITLE[r.doc_type] ?? r.doc_type, M + leftW + 14, y + 20, { width: midW - 24, height: 24, ellipsis: true });
    doc.font('Helvetica').fontSize(8).fillColor('#9aa3b2').text(company.website || '', M + leftW + 14, y + 50, { width: midW - 24 });

    doc.rect(M + leftW + midW, y, rightW, headerH).fill(CREAM);
    const metaFields: [string, string][] = isDeliveryNote
      ? [['Note No', r.doc_number || 'DRAFT'], ['Date', dateFmt(r.created_at)], ['Delivery Date', dateFmt(r.delivery_date)], ['Status', r.status.toUpperCase()]]
      : [['Order No', r.doc_number || 'DRAFT'], ['Issued', dateFmt(r.issued_at)], ['Valid To', dateFmt(r.valid_until)], ['Status', r.status.toUpperCase()]];
    let mfy = y + 6;
    metaFields.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#8a8578').text(`${label.toUpperCase()}:`, M + leftW + midW + 10, mfy, { width: rightW - 20 });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(value, M + leftW + midW + 10, mfy + 8, { width: rightW - 20 });
      doc.moveTo(M + leftW + midW + 10, mfy + 18).lineTo(M + leftW + midW + rightW - 10, mfy + 18).strokeColor(ORANGE).lineWidth(1).stroke();
      mfy += 18;
    });
    y += headerH + 12;

    // ── Consignee + Transport boxes ──
    const boxW = (W - 8) / 2;
    const boxTop = y;
    doc.rect(M, boxTop, boxW, 78).strokeColor(BORDER).lineWidth(0.5).stroke();
    let by = sectionHeader(doc, M, boxTop, boxW, isDeliveryNote ? 'Consignee (Delivery To)' : 'Consignee');
    fieldGrid(doc, M + 8, by + 6, boxW - 16, [
      ['Company / Receiver', r.customer_name || '—'], ['Contact Person', r.contact_person || '—'], ['Phone', r.contact_phone || '—'],
      ['Email', r.contact_email || '—'], ['Delivery Address', r.delivery_address || r.customer_address || '—'], ['City', r.city || '—'],
    ]);

    const box2X = M + boxW + 8;
    doc.rect(box2X, boxTop, boxW, 78).strokeColor(BORDER).lineWidth(0.5).stroke();
    let by2 = sectionHeader(doc, box2X, boxTop, boxW, isDeliveryNote ? 'Delivered By (Driver / Agent)' : 'Carrier / Transport');
    if (isDeliveryNote) {
      fieldGrid(doc, box2X + 8, by2 + 6, boxW - 16, [
        ['Driver / Agent', r.driver_name || '—'], ['Vehicle No.', r.vehicle_no || '—'], ['Driver Contact', r.driver_contact || '—'],
        ['Carrier', r.carrier_name || '—'], ['Delivery Date', dateFmt(r.delivery_date)], ['', ''],
      ]);
    } else {
      fieldGrid(doc, box2X + 8, by2 + 6, boxW - 16, [
        ['Carrier', r.carrier_name || '—'], ['Vessel / Voyage', r.vessel_voyage || '—'], ['', ''],
        ['Valid From', dateFmt(r.valid_from)], ['Valid Until', dateFmt(r.valid_until)], ['', ''],
      ]);
    }
    y = boxTop + 78 + 12;

    // ── Goods / Containers table ──
    if (isDeliveryNote) {
      const headers = ['No.', 'Description of Goods', 'Qty Sent', 'Qty Recv.', 'Condition', 'Var.', 'Remarks'];
      const widths = [22, W * 0.30, 55, 55, 65, 40, W - 22 - W * 0.30 - 55 - 55 - 65 - 40];
      const lines = r.lines?.length ? r.lines : [{ description: '', qty_ordered: '', qty_delivered: '', condition: '', remarks: '' } as any];
      const rows = lines.map((l: any, i: number) => {
        const variance = (Number(l.qty_delivered) || 0) - (Number(l.qty_ordered) || 0);
        return [i + 1, l.description || '', l.qty_ordered ?? '', l.qty_delivered ?? '', l.condition || '', l.qty_ordered != null ? (variance > 0 ? `+${variance}` : variance) : '', l.remarks || ''];
      });
      const totalSent = r.lines?.reduce((s: number, l: any) => s + (Number(l.qty_ordered) || 0), 0) ?? 0;
      const totalRecv = r.lines?.reduce((s: number, l: any) => s + (Number(l.qty_delivered) || 0), 0) ?? 0;
      y = sectionHeader(doc, M, y, W, 'Goods Delivery Record') + 4;
      y = documentTable(doc, M, y, widths, headers, rows, ['', 'TOTAL', totalSent || '', totalRecv || '', '', totalRecv - totalSent || '', '']);
    } else if (containers.length > 0) {
      const headers = ['No.', 'Container Number', 'Size', 'Seal Number', 'Weight (kg)'];
      const widths = [22, W * 0.32, 60, W * 0.24, W - 22 - W * 0.32 - 60 - W * 0.24];
      const rows = containers.map((c, i) => [i + 1, c.number, c.size, c.seal_number || '—', c.weight_kg ?? '—']);
      y = sectionHeader(doc, M, y, W, 'Containers') + 4;
      y = documentTable(doc, M, y, widths, headers, rows);
    }
    y += 12;

    // A long goods/container list can push the status/signature block past
    // the page — start fresh rather than clipping or overlapping the footer.
    if (y + 110 + 34 > doc.page.height - M) { doc.addPage(); y = M; }

    // ── Status/Conditions + Signatures ──
    const leftBoxW = 210;
    const sigBoxW = W - leftBoxW - 8;
    const bottomTop = y;

    if (isDeliveryNote) {
      doc.rect(M, bottomTop, leftBoxW, 110).strokeColor(BORDER).lineWidth(0.5).stroke();
      let sy = sectionHeader(doc, M, bottomTop, leftBoxW, 'Delivery Status') + 8;
      STATUS_OPTIONS.forEach(([key, label], i) => {
        const cx = M + 10 + (i % 2) * 100;
        const cy = sy + Math.floor(i / 2) * 16;
        const checked = r.status === key;
        doc.rect(cx, cy, 8, 8).fillAndStroke(checked ? ORANGE : '#ffffff', checked ? ORANGE : BORDER);
        if (checked) doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff').text('✓', cx + 1.5, cy);
        doc.font('Helvetica').fontSize(7.5).fillColor(INK).text(label, cx + 12, cy, { width: 85 });
      });
      sy += 40;
      doc.font('Helvetica-Bold').fontSize(7).fillColor(ORANGE).text('DISCREPANCY NOTES', M + 10, sy);
      doc.font('Helvetica').fontSize(7.5).fillColor(INK).text(r.discrepancy_notes || '—', M + 10, sy + 10, { width: leftBoxW - 20, height: 30 });
    } else {
      doc.rect(M, bottomTop, leftBoxW, 110).strokeColor(BORDER).lineWidth(0.5).stroke();
      let sy = sectionHeader(doc, M, bottomTop, leftBoxW, 'Release Conditions') + 8;
      doc.font('Helvetica').fontSize(7.5).fillColor(INK).text(r.release_conditions || 'None specified.', M + 10, sy, { width: leftBoxW - 20, height: 70, align: 'justify' });
    }

    doc.rect(M + leftBoxW + 8, bottomTop, sigBoxW, 110).strokeColor(BORDER).lineWidth(0.5).stroke();
    sectionHeader(doc, M + leftBoxW + 8, bottomTop, sigBoxW, 'Confirmation Signatures');
    const parties = isDeliveryNote ? ['Receiver', 'Driver / Agent', company.name.split(' ')[0]] : ['Consignee', 'Authorized Officer'];
    const partyW = sigBoxW / parties.length;
    parties.forEach((party, i) => {
      const px = M + leftBoxW + 8 + i * partyW;
      doc.rect(px, bottomTop + 16, partyW, 16).fill(ORANGE);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff').text(party, px + 6, bottomTop + 20, { width: partyW - 12 });
      ['Name', 'Sig', 'Date'].forEach((f, fi) => {
        const fy = bottomTop + 42 + fi * 22;
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor(INK).text(`${f}:`, px + 6, fy);
        doc.moveTo(px + 6, fy + 12).lineTo(px + partyW - 8, fy + 12).strokeColor(ORANGE).lineWidth(0.75).stroke();
      });
    });
    y = bottomTop + 110 + 14;

    // ── Footer ──
    doc.rect(M, y, W, 20).fill(DARK);
    const footerText = [company.name.toUpperCase(), [company.address, company.city].filter(Boolean).join(', '), company.phone, company.email, company.website]
      .filter(Boolean).join('   ·   ');
    doc.font('Helvetica').fontSize(6.5).fillColor('#c7ccd6').text(footerText, M + 10, y + 6, { width: W - 20 });

    // Placed relative to the footer bar, not pinned to the physical page
    // bottom — a fixed page-height offset sat inside pdfkit's own bottom
    // margin and silently forced a near-blank second page (seen on a real
    // rendered PDF before this fix).
    doc.font('Helvetica').fontSize(6).fillColor('#999999').text(`Generated by ${company.name} via Hudumika — ${r.id} — ${new Date().toISOString()}.`, M, y + 26, { width: W });

    doc.end();
  });
}
