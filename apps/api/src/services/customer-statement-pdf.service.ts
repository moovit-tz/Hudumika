// ─── Real customer statement PDF ────────────────────────────────────────────
// No statement document existed for a customer at all — invoice-pdf.service.ts
// covers one invoice at a time, nothing summarised a customer's running
// balance across a date range. Same pdfkit buffer-accumulation/branding/
// pagination pattern as that file, extended to three transaction kinds
// (invoice charges, payments received, credit notes) merged into one
// chronological running balance — built after credit notes (M8) existed, so
// they net into the balance correctly rather than being invented later.

import PDFDocument from 'pdfkit';
import { withTenant } from '../db/client.js';
import { invoiceGrandTotal } from '../routes/invoices.routes.js';

const INK = '#0b1220';
const MUTED = '#5b6472';
const BORDER = '#dfe3e8';
const TEAL = '#0d9488';
const RED = '#b3382c';

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateFmt(d: unknown): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(String(d));
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
// A DATE column comes back from the driver as a literal 'YYYY-MM-DD'
// string, but a TIMESTAMPTZ column (created_at, the fallback whenever a
// document has no payment_date/credit_date of its own) comes back as a
// real JS Date — `String(dateObject)` gives "Tue Aug 26 2026 ..." not an
// ISO date, which silently fails every `date >= fromDate` string
// comparison below. Found live: a payment with no payment_date vanished
// from the statement entirely, its date impossible to compare correctly.
function dateOnly(d: unknown): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(String(d));
  return isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

interface Txn { date: string; kind: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE'; label: string; amount: number }

export async function renderCustomerStatementPdf(tenantId: string, customerId: string, fromDate: string, toDate: string): Promise<Buffer> {
  return withTenant(tenantId, async (trx) => {
    const customer = await trx.selectFrom('customers').selectAll().where('id', '=', customerId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!customer) throw new Error('Customer not found');

    const invoices = await trx.selectFrom('sales_invoices').selectAll()
      .where('customer_id', '=', customerId).where('tenant_id', '=', tenantId)
      .where('status', '!=', 'Void').orderBy('bill_date', 'asc').execute();
    const invoiceIds = invoices.map(i => i.id);

    const lines = invoiceIds.length
      ? await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', 'in', invoiceIds).execute()
      : [];
    const linesByInvoice = new Map<string, typeof lines>();
    for (const l of lines) {
      if (!linesByInvoice.has(l.invoice_id)) linesByInvoice.set(l.invoice_id, []);
      linesByInvoice.get(l.invoice_id)!.push(l);
    }

    const payments = invoiceIds.length
      ? await trx.selectFrom('invoice_payments').selectAll().where('invoice_id', 'in', invoiceIds).orderBy('payment_date', 'asc').execute()
      : [];

    const creditNotes = await trx.selectFrom('credit_notes').selectAll()
      .where('customer_id', '=', customerId).where('tenant_id', '=', tenantId)
      .where('status', '=', 'POSTED').orderBy('credit_date', 'asc').execute();
    const creditNoteIds = creditNotes.map(c => c.id);
    const cnLines = creditNoteIds.length
      ? await trx.selectFrom('credit_note_lines').selectAll().where('credit_note_id', 'in', creditNoteIds).execute()
      : [];
    const cnLinesByNote = new Map<string, typeof cnLines>();
    for (const l of cnLines) {
      if (!cnLinesByNote.has(l.credit_note_id)) cnLinesByNote.set(l.credit_note_id, []);
      cnLinesByNote.get(l.credit_note_id)!.push(l);
    }

    const txns: Txn[] = [];
    for (const inv of invoices) {
      const invLines = linesByInvoice.get(inv.id) ?? [];
      const total = invoiceGrandTotal(invLines, inv.currency, Number(inv.exchange_rate) || 1);
      txns.push({ date: dateOnly(inv.bill_date ?? inv.created_at), kind: 'INVOICE', label: `Invoice ${inv.invoice_number}`, amount: total });
    }
    for (const p of payments) {
      txns.push({ date: dateOnly(p.payment_date ?? p.created_at), kind: 'PAYMENT', label: `Payment received${p.method ? ` (${p.method})` : ''}`, amount: -Number(p.amount) });
    }
    for (const cn of creditNotes) {
      const cnl = cnLinesByNote.get(cn.id) ?? [];
      const total = invoiceGrandTotal(cnl, cn.currency, Number(cn.exchange_rate) || 1);
      txns.push({ date: dateOnly(cn.credit_date ?? cn.created_at), kind: 'CREDIT_NOTE', label: `Credit note ${cn.credit_note_number}`, amount: -total });
    }

    // Customer credits (M10) deliberately do NOT get their own statement
    // line — tried live, found wrong, reverted rather than shipped. A
    // customer_credits row isn't a second cash event: it's an internal
    // label on money already inside the "Payment received" line above
    // (the same GL entry that clears AR also creates the credit, from one
    // real payment). Adding it as another reduction double-counted that
    // same cash — a 150,000 payment against 130,000 of invoices should
    // net to a 20,000 credit balance, and adding a second -50,000 line for
    // the credit issuance made it show -70,000 instead. The existing
    // charges-minus-payments math already states the customer's true
    // position correctly with nothing added; per-invoice visibility into
    // *which* charge a credit later settled is a real but separate gap
    // this statement doesn't attempt to close.

    txns.sort((a, b) => a.date.localeCompare(b.date));

    const opening = txns.filter(t => t.date < fromDate).reduce((s, t) => s + t.amount, 0);
    const inRange = txns.filter(t => t.date >= fromDate && t.date <= toDate);
    const closing = inRange.reduce((s, t) => s + t.amount, opening);

    const settingsRow = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst();
    const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
    const company = settings?.company ?? {};
    const companyName = company.name || tenant?.name || 'Hudumika';

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', b => chunks.push(b));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const M = 40;
      const W = 595.28 - M * 2;
      let y = M;

      doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(companyName, M, y);
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
        .text([company.address, [company.city, company.country].filter(Boolean).join(', ')].filter(Boolean).join(' · '), M, doc.y + 2);
      doc.font('Helvetica-Bold').fontSize(20).fillColor(TEAL).text('STATEMENT', M, y, { width: W, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`${dateFmt(fromDate)} – ${dateFmt(toDate)}`, M, doc.y + 2, { width: W, align: 'right' });
      y = Math.max(doc.y, y + 50) + 16;

      doc.moveTo(M, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 16;

      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('STATEMENT FOR', M, y);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(customer.name, M, doc.y + 4);
      if (customer.email) doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(customer.email, M, doc.y + 2);
      y = doc.y + 20;

      const cols = [
        { label: 'Date', w: W * 0.16 },
        { label: 'Description', w: W * 0.42 },
        { label: 'Charge', w: W * 0.14, align: 'right' as const },
        { label: 'Credit', w: W * 0.14, align: 'right' as const },
        { label: 'Balance', w: W * 0.14, align: 'right' as const },
      ];
      doc.rect(M, y, W, 22).fill('#f1f5f4');
      let cx = M;
      cols.forEach(c => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(c.label.toUpperCase(), cx + 8, y + 7, { width: c.w - 8, align: c.align });
        cx += c.w;
      });
      y += 22;

      const row = (date: string, desc: string, charge: number, credit: number, balance: number, italic = false) => {
        if (y + 20 > 780) { doc.addPage(); y = M; }
        cx = M;
        const font = italic ? 'Helvetica-Oblique' : 'Helvetica';
        doc.font(font).fontSize(9).fillColor(italic ? MUTED : INK).text(date, cx + 8, y + 5, { width: cols[0].w - 8 }); cx += cols[0].w;
        doc.text(desc, cx + 8, y + 5, { width: cols[1].w - 8 }); cx += cols[1].w;
        doc.text(charge > 0 ? money(charge) : '', cx, y + 5, { width: cols[2].w - 8, align: 'right' }); cx += cols[2].w;
        doc.text(credit > 0 ? money(credit) : '', cx, y + 5, { width: cols[3].w - 8, align: 'right' }); cx += cols[3].w;
        doc.font('Helvetica-Bold').fillColor(balance < 0 ? TEAL : INK).text(money(balance), cx, y + 5, { width: cols[4].w - 8, align: 'right' });
        doc.moveTo(M, y + 20).lineTo(M + W, y + 20).strokeColor(BORDER).lineWidth(0.5).stroke();
        y += 20;
      };

      row(dateFmt(fromDate), 'Opening balance b/f', 0, 0, opening, true);
      let running = opening;
      for (const t of inRange) {
        running += t.amount;
        row(dateFmt(t.date), t.label, t.amount > 0 ? t.amount : 0, t.amount < 0 ? -t.amount : 0, running);
      }
      y += 8;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(closing > 0 ? RED : TEAL)
        .text(closing > 0 ? 'BALANCE DUE' : 'CREDIT BALANCE', M + W * 0.6, y, { width: W * 0.25 });
      doc.text(money(Math.abs(closing)), M + W * 0.85, y, { width: W * 0.15, align: 'right' });

      doc.end();
    });
  });
}
