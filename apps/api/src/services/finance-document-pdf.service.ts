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

// ─── Record / ledger-style documents ────────────────────────────────────────
// Expenses, payments, bank statements, fixed-asset cards and trial balances
// are not line-item commercial documents (no qty × rate × tax), so they get
// a second, table-based layout: a key/value block, an optional free-form
// table, and a summary. Same header styling as renderSpec.
interface TableCol { label: string; w: number; align?: 'right' }
interface TableSpec {
  title: string;
  number: string;
  companyName: string;
  companyAddress: string;
  meta: [string, string][];
  columns: TableCol[];            // widths are fractions of the page width
  rows: string[][];
  summary: [string, string][];
  notes?: string | null;
}

function renderTableSpec(spec: TableSpec): Promise<Buffer> {
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

    for (const [label, value] of spec.meta) {
      if (y > 780) { doc.addPage(); y = M; }
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(label, M, y, { width: W * 0.3 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(value || '—', M + W * 0.3, y, { width: W * 0.7 });
      y = Math.max(doc.y, y + 14) + 2;
    }
    y += 10;

    if (spec.columns.length && spec.rows.length) {
      doc.rect(M, y, W, 22).fill('#f1f5f4');
      let cx = M;
      for (const c of spec.columns) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(c.label.toUpperCase(), cx + 6, y + 7, { width: c.w * W - 8, align: c.align });
        cx += c.w * W;
      }
      y += 22;
      for (const r of spec.rows) {
        if (y + 20 > 780) { doc.addPage(); y = M; }
        cx = M;
        spec.columns.forEach((c, i) => {
          doc.font('Helvetica').fontSize(8.5).fillColor(INK)
            .text(r[i] ?? '', cx + 6, y + 5, { width: c.w * W - 8, align: c.align, lineBreak: false, ellipsis: true });
          cx += c.w * W;
        });
        doc.moveTo(M, y + 20).lineTo(M + W, y + 20).strokeColor(BORDER).lineWidth(0.5).stroke();
        y += 20;
      }
      y += 12;
    }

    for (const [label, value] of spec.summary) {
      if (y > 780) { doc.addPage(); y = M; }
      doc.font('Helvetica-Bold').fontSize(10).fillColor(MUTED).text(label, M + W * 0.4, y, { width: W * 0.35 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(TEAL).text(value, M + W * 0.75, y, { width: W * 0.25, align: 'right' });
      y += 18;
    }

    if (spec.notes) {
      y += 12;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('NOTES', M, y);
      doc.font('Helvetica').fontSize(9).fillColor(INK).text(spec.notes, M, doc.y + 4, { width: W });
    }
    doc.end();
  });
}

export async function renderExpensePdf(tenantId: string, id: string): Promise<Buffer> {
  const spec = await withTenant(tenantId, async (trx): Promise<TableSpec> => {
    const e = await trx.selectFrom('finance_expenses').selectAll().where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!e) throw new Error('Expense not found');
    const supplier = e.supplier_id
      ? await trx.selectFrom('suppliers').select('name').where('id', '=', e.supplier_id).where('tenant_id', '=', tenantId).executeTakeFirst()
      : undefined;
    const co = await company(trx, tenantId);
    return {
      title: 'EXPENSE VOUCHER', number: `EXP-${String(e.id).slice(0, 8).toUpperCase()}`, companyName: co.name, companyAddress: co.address,
      meta: [
        ['Description', e.name], ['Date', dateFmt(e.expense_date)], ['Category', e.category],
        ['Supplier', supplier?.name ?? ''], ['Payment mode', e.payment_mode ?? ''], ['Reference', e.reference ?? ''],
        ['Status', String(e.status)],
      ],
      columns: [], rows: [], summary: [['Amount', money(Number(e.amount))]], notes: e.note,
    };
  });
  return renderTableSpec(spec);
}

export async function renderInvoicePaymentPdf(tenantId: string, id: string): Promise<Buffer> {
  const spec = await withTenant(tenantId, async (trx): Promise<TableSpec> => {
    const p = await trx.selectFrom('invoice_payments').selectAll().where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!p) throw new Error('Payment not found');
    const inv = await trx.selectFrom('sales_invoices').select(['invoice_number', 'client_name']).where('id', '=', p.invoice_id).where('tenant_id', '=', tenantId).executeTakeFirst();
    const co = await company(trx, tenantId);
    return {
      title: 'PAYMENT RECEIPT', number: `RCPT-${String(p.id).slice(0, 8).toUpperCase()}`, companyName: co.name, companyAddress: co.address,
      meta: [
        ['Received from', inv?.client_name ?? ''], ['Against invoice', inv?.invoice_number ?? ''],
        ['Payment date', dateFmt(p.payment_date)], ['Method', p.method ?? ''],
      ],
      columns: [], rows: [], summary: [['Amount received', money(Number(p.amount))]], notes: p.note,
    };
  });
  return renderTableSpec(spec);
}

export async function renderBillPaymentPdf(tenantId: string, id: string): Promise<Buffer> {
  const spec = await withTenant(tenantId, async (trx): Promise<TableSpec> => {
    const p = await trx.selectFrom('bill_payments').selectAll().where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!p) throw new Error('Payment not found');
    const bill = await trx.selectFrom('supplier_bills').select(['bill_number', 'supplier_name']).where('id', '=', p.bill_id).where('tenant_id', '=', tenantId).executeTakeFirst();
    const co = await company(trx, tenantId);
    return {
      title: 'PAYMENT VOUCHER', number: `PAY-${String(p.id).slice(0, 8).toUpperCase()}`, companyName: co.name, companyAddress: co.address,
      meta: [
        ['Paid to', bill?.supplier_name ?? ''], ['Against bill', bill?.bill_number ?? ''],
        ['Payment date', dateFmt(p.payment_date)], ['Method', p.method ?? ''], ['Reference', p.reference ?? ''],
      ],
      columns: [], rows: [], summary: [[`Amount paid (${p.currency ?? ''})`, money(Number(p.amount))]], notes: p.note,
    };
  });
  return renderTableSpec(spec);
}

export async function renderBankStatementPdf(tenantId: string, id: string): Promise<Buffer> {
  const spec = await withTenant(tenantId, async (trx): Promise<TableSpec> => {
    const s = await trx.selectFrom('bank_statements').selectAll().where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!s) throw new Error('Bank statement not found');
    const lines = await trx.selectFrom('bank_statement_lines').selectAll().where('bank_statement_id', '=', id).orderBy('txn_date').execute();
    const co = await company(trx, tenantId);
    return {
      title: 'BANK STATEMENT', number: `${s.account_code} · ${dateFmt(s.statement_date_from)} – ${dateFmt(s.statement_date_to)}`,
      companyName: co.name, companyAddress: co.address,
      meta: [['Bank', s.bank_name ?? ''], ['Ledger account', s.account_code], ['Opening balance', money(Number(s.opening_balance))]],
      columns: [{ label: 'Date', w: 0.16 }, { label: 'Description', w: 0.5 }, { label: 'Amount', w: 0.17, align: 'right' }, { label: 'Matched', w: 0.17, align: 'right' }],
      rows: lines.map(l => [dateFmt(l.txn_date), l.description ?? '', money(Number(l.amount)), l.matched_journal_line_id ? 'Yes' : 'No']),
      summary: [['Closing balance', money(Number(s.closing_balance))]],
    };
  });
  return renderTableSpec(spec);
}

export async function renderFixedAssetPdf(tenantId: string, id: string): Promise<Buffer> {
  const spec = await withTenant(tenantId, async (trx): Promise<TableSpec> => {
    const a = await trx.selectFrom('fixed_assets').selectAll().where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!a) throw new Error('Fixed asset not found');
    const dep = await trx.selectFrom('fixed_asset_depreciation_entries').select(['period_date', 'amount'])
      .where('asset_id', '=', id).where('tenant_id', '=', tenantId).orderBy('period_date').execute();
    const co = await company(trx, tenantId);
    const accumulated = dep.reduce((s, d) => s + Number(d.amount), 0);
    return {
      title: 'FIXED ASSET CARD', number: `FA-${String(a.id).slice(0, 8).toUpperCase()}`, companyName: co.name, companyAddress: co.address,
      meta: [
        ['Asset', a.name], ['Category', a.category ?? ''], ['Acquired', dateFmt(a.acquisition_date)],
        ['Cost', money(Number(a.cost))], ['Salvage value', money(Number(a.salvage_value))],
        ['Useful life', `${a.useful_life_months} months (${String(a.depreciation_method).replace('_', ' ').toLowerCase()})`],
        ['Status', a.status === 'DISPOSED' ? `Disposed ${dateFmt(a.disposed_at)}` : 'Active'],
      ],
      columns: [{ label: 'Period', w: 0.5 }, { label: 'Depreciation', w: 0.5, align: 'right' }],
      rows: dep.map(d => [dateFmt(d.period_date), money(Number(d.amount))]),
      summary: [['Accumulated depreciation', money(accumulated)], ['Net book value', money(Number(a.cost) - accumulated)]],
      notes: a.notes,
    };
  });
  return renderTableSpec(spec);
}

/** Trial balance of a closed GL period, rendered from the snapshot taken at
 *  close (never recomputed — a filed figure must not change after the fact). */
export async function renderTrialBalancePdf(tenantId: string, periodId: string): Promise<Buffer> {
  const spec = await withTenant(tenantId, async (trx): Promise<TableSpec> => {
    const p = await trx.selectFrom('gl_periods').selectAll().where('id', '=', periodId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!p) throw new Error('GL period not found');
    const snap = (typeof p.trial_balance_snapshot === 'string' ? JSON.parse(p.trial_balance_snapshot) : p.trial_balance_snapshot) as
      { rows?: any[]; totals?: { debit: number; credit: number } } | null;
    if (!snap?.rows) throw new Error('GL period has no trial balance snapshot');
    const co = await company(trx, tenantId);
    return {
      title: 'TRIAL BALANCE', number: p.name, companyName: co.name, companyAddress: co.address,
      meta: [['Period', `${dateFmt(p.period_start)} – ${dateFmt(p.period_end)}`], ['Closed', dateFmt(p.closed_at)]],
      columns: [
        { label: 'Code', w: 0.1 }, { label: 'Account', w: 0.3 },
        { label: 'Period Dr', w: 0.15, align: 'right' }, { label: 'Period Cr', w: 0.15, align: 'right' },
        { label: 'Closing Dr', w: 0.15, align: 'right' }, { label: 'Closing Cr', w: 0.15, align: 'right' },
      ],
      rows: snap.rows.map(r => [
        String(r.account_code), String(r.account_name),
        money(Number(r.period_debit)), money(Number(r.period_credit)), money(Number(r.closing_debit)), money(Number(r.closing_credit)),
      ]),
      summary: snap.totals ? [['Total debit', money(Number(snap.totals.debit))], ['Total credit', money(Number(snap.totals.credit))]] : [],
    };
  });
  return renderTableSpec(spec);
}
