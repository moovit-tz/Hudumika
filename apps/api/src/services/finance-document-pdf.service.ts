// Real PDFs for the Finance documents that had no server-side render at all
// (credit notes, quotations, purchase orders, supplier bills) — invoices
// already have invoice-pdf.service.ts. One shared layout, one loader per
// document type that maps that table's own columns onto it. Every figure is
// read from the stored row/lines (line totals are recomputed the same way
// each document's own route computes them); nothing here invents a number.
import PDFDocument from 'pdfkit';
import { withTenant } from '../db/client.js';

const INK = '#0b1220';
const MUTED = '#5b6472';
const BORDER = '#dfe3e8';
const TEAL = '#0d9488';

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateFmt(d: unknown): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(String(d));
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface PdfLine { description: string; qty: number; rate: number; taxPct: number; amount: number }
interface PdfSpec {
  title: string;
  number: string;
  companyName: string;
  companyAddress: string;
  partyLabel: string;
  partyName: string;
  meta: [string, string][];
  currency: string;
  lines: PdfLine[];
  totals: [string, number][];   // labelled subtotal/tax rows before the grand total
  grandLabel: string;
  grandTotal: number;
  notes?: string | null;
}

function renderSpec(spec: PdfSpec): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', b => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const M = 40;
    const W = 595.28 - M * 2;
    let y = M;

    doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(spec.companyName, M, y);
    if (spec.companyAddress) doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(spec.companyAddress, M, doc.y + 2);
    doc.font('Helvetica-Bold').fontSize(20).fillColor(TEAL).text(spec.title, M, y, { width: W, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(spec.number, M, doc.y + 2, { width: W, align: 'right' });
    y = Math.max(doc.y, y + 50) + 16;
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 16;

    const leftW = W * 0.55, rightW = W - leftW - 16;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(spec.partyLabel, M, y);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(spec.partyName || '—', M, doc.y + 4, { width: leftW });

    const metaX = M + leftW + 16;
    let my = y;
    for (const [label, value] of spec.meta) {
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label, metaX, my, { width: rightW * 0.45 });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(value, metaX + rightW * 0.45, my, { width: rightW * 0.55, align: 'right' });
      my += 14;
    }
    y = Math.max(doc.y, my) + 20;

    const cols = [
      { label: 'Description', w: W * 0.42, align: undefined },
      { label: 'Qty', w: W * 0.1, align: 'right' as const },
      { label: 'Rate', w: W * 0.16, align: 'right' as const },
      { label: 'Tax %', w: W * 0.1, align: 'right' as const },
      { label: 'Amount', w: W * 0.22, align: 'right' as const },
    ];
    doc.rect(M, y, W, 22).fill('#f1f5f4');
    let cx = M;
    for (const c of cols) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(c.label.toUpperCase(), cx + 8, y + 7, { width: c.w - 8, align: c.align });
      cx += c.w;
    }
    y += 22;

    for (const l of spec.lines) {
      const rowH = 20;
      if (y + rowH > 780) { doc.addPage(); y = M; }
      cx = M;
      doc.font('Helvetica').fontSize(9).fillColor(INK).text(l.description, cx + 8, y + 5, { width: cols[0].w - 8, lineBreak: false, ellipsis: true }); cx += cols[0].w;
      doc.text(String(l.qty), cx, y + 5, { width: cols[1].w - 8, align: 'right' }); cx += cols[1].w;
      doc.text(`${spec.currency} ${money(l.rate)}`, cx, y + 5, { width: cols[2].w - 8, align: 'right' }); cx += cols[2].w;
      doc.text(`${l.taxPct}%`, cx, y + 5, { width: cols[3].w - 8, align: 'right' }); cx += cols[3].w;
      doc.font('Helvetica-Bold').text(`${spec.currency} ${money(l.amount)}`, cx, y + 5, { width: cols[4].w - 8, align: 'right' });
      doc.moveTo(M, y + rowH).lineTo(M + W, y + rowH).strokeColor(BORDER).lineWidth(0.5).stroke();
      y += rowH;
    }
    y += 12;

    const totalsX = M + W * 0.55, totalsW = W * 0.45;
    const row = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5).fillColor(bold ? INK : MUTED)
        .text(label, totalsX, y, { width: totalsW * 0.5 });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5).fillColor(bold ? TEAL : INK)
        .text(value, totalsX + totalsW * 0.5, y, { width: totalsW * 0.5, align: 'right' });
      y += bold ? 20 : 16;
    };
    for (const [label, value] of spec.totals) row(label, `${spec.currency} ${money(value)}`);
    doc.moveTo(totalsX, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(0.5).stroke();
    y += 8;
    row(spec.grandLabel, `${spec.currency} ${money(spec.grandTotal)}`, true);

    if (spec.notes) {
      y += 20;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('NOTES', M, y);
      doc.font('Helvetica').fontSize(9).fillColor(INK).text(spec.notes, M, doc.y + 4, { width: W });
    }
    doc.end();
  });
}

async function company(trx: any, tenantId: string): Promise<{ name: string; address: string }> {
  const settingsRow = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
  const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst();
  const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
  const c = settings?.company ?? {};
  return {
    name: c.name || tenant?.name || 'Hudumika',
    address: [c.address, [c.city, c.country].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
  };
}

const lineAmt = (qty: number, rate: number, taxPct: number) => qty * rate * (1 + taxPct / 100);

export async function renderCreditNotePdf(tenantId: string, id: string): Promise<Buffer> {
  const spec = await withTenant(tenantId, async (trx): Promise<PdfSpec> => {
    const cn = await trx.selectFrom('credit_notes').selectAll().where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!cn) throw new Error('Credit note not found');
    const lines = await trx.selectFrom('credit_note_lines').selectAll().where('credit_note_id', '=', id).orderBy('sort_order').execute();
    const co = await company(trx, tenantId);
    const pdfLines = lines.map(l => ({ description: l.name, qty: Number(l.qty), rate: Number(l.rate), taxPct: Number(l.tax_pct), amount: lineAmt(Number(l.qty), Number(l.rate), Number(l.tax_pct)) }));
    const net = pdfLines.reduce((s, l) => s + l.qty * l.rate, 0);
    const grand = pdfLines.reduce((s, l) => s + l.amount, 0);
    return {
      title: 'CREDIT NOTE', number: cn.credit_note_number, companyName: co.name, companyAddress: co.address,
      partyLabel: 'CREDITED TO', partyName: cn.client_name || '',
      meta: [['Credit Date', dateFmt(cn.credit_date)], ['Status', String(cn.status)], ...(cn.reason ? [['Reason', cn.reason] as [string, string]] : [])],
      currency: cn.currency, lines: pdfLines, totals: [['Net', net], ['Tax', grand - net]], grandLabel: 'Total Credited', grandTotal: grand, notes: cn.notes,
    };
  });
  return renderSpec(spec);
}

export async function renderQuotationPdf(tenantId: string, id: string): Promise<Buffer> {
  const spec = await withTenant(tenantId, async (trx): Promise<PdfSpec> => {
    const q = await trx.selectFrom('quotations').selectAll().where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!q) throw new Error('Quotation not found');
    const lines = await trx.selectFrom('quotation_lines').selectAll().where('quotation_id', '=', id).orderBy('line_number').execute();
    const cust = await trx.selectFrom('customers').select('name').where('id', '=', q.customer_id).where('tenant_id', '=', tenantId).executeTakeFirst();
    const co = await company(trx, tenantId);
    return {
      title: 'QUOTATION', number: q.quote_number, companyName: co.name, companyAddress: co.address,
      partyLabel: 'PREPARED FOR', partyName: cust?.name || '',
      meta: [
        ['Valid From', dateFmt(q.valid_from)], ['Valid Until', dateFmt(q.valid_until)], ['Status', String(q.status)],
        ...(q.origin_port || q.destination_port ? [['Route', `${q.origin_port || '—'} → ${q.destination_port || '—'}`] as [string, string]] : []),
      ],
      currency: q.currency,
      lines: lines.map(l => ({ description: l.description, qty: Number(l.quantity), rate: Number(l.unit_price), taxPct: Number(l.tax_rate), amount: Number(l.line_total) })),
      totals: [['Subtotal', Number(q.subtotal)], ['Tax', Number(q.tax_amount)]],
      grandLabel: 'Total', grandTotal: Number(q.total_amount), notes: q.notes,
    };
  });
  return renderSpec(spec);
}

export async function renderPurchaseOrderPdf(tenantId: string, id: string): Promise<Buffer> {
  const spec = await withTenant(tenantId, async (trx): Promise<PdfSpec> => {
    const po = await trx.selectFrom('purchase_orders').selectAll().where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!po) throw new Error('Purchase order not found');
    const lines = await trx.selectFrom('purchase_order_lines').selectAll().where('po_id', '=', id).orderBy('sort_order').execute();
    const co = await company(trx, tenantId);
    return {
      title: 'PURCHASE ORDER', number: po.po_number, companyName: co.name, companyAddress: co.address,
      partyLabel: 'SUPPLIER', partyName: po.supplier_name || '',
      meta: [
        ['Order Date', dateFmt(po.order_date)], ['Expected', dateFmt(po.expected_date)], ['Status', String(po.status)],
        ...(po.payment_terms ? [['Terms', po.payment_terms] as [string, string]] : []),
        ...(po.warehouse_name ? [['Deliver To', po.warehouse_name] as [string, string]] : []),
      ],
      currency: po.currency,
      lines: lines.map(l => ({ description: l.description, qty: Number(l.qty), rate: Number(l.unit_price), taxPct: Number(l.tax_rate), amount: Number(l.line_total) })),
      totals: [['Subtotal', Number(po.subtotal)], ['Tax', Number(po.tax_amount)]],
      grandLabel: 'Total', grandTotal: Number(po.total), notes: po.notes,
    };
  });
  return renderSpec(spec);
}

export async function renderBillPdf(tenantId: string, id: string): Promise<Buffer> {
  const spec = await withTenant(tenantId, async (trx): Promise<PdfSpec> => {
    const b = await trx.selectFrom('supplier_bills').selectAll().where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!b) throw new Error('Bill not found');
    const lines = await trx.selectFrom('supplier_bill_lines').selectAll().where('bill_id', '=', id).orderBy('sort_order').execute();
    const co = await company(trx, tenantId);
    return {
      title: 'SUPPLIER BILL', number: b.bill_number, companyName: co.name, companyAddress: co.address,
      partyLabel: 'FROM SUPPLIER', partyName: b.supplier_name || '',
      meta: [
        ['Bill Date', dateFmt(b.bill_date)], ['Due Date', dateFmt(b.due_date)], ['Status', String(b.status)],
        ...(b.po_number ? [['PO', b.po_number] as [string, string]] : []),
        ...(b.shipment_ref ? [['Shipment Ref', b.shipment_ref] as [string, string]] : []),
      ],
      currency: b.currency,
      lines: lines.map(l => ({ description: l.description, qty: Number(l.qty), rate: Number(l.unit_price), taxPct: Number(l.tax_rate), amount: lineAmt(Number(l.qty), Number(l.unit_price), Number(l.tax_rate)) })),
      totals: [['Subtotal', Number(b.subtotal)], ['Tax', Number(b.tax_amount)]],
      grandLabel: 'Total', grandTotal: Number(b.total), notes: b.notes,
    };
  });
  return renderSpec(spec);
}
