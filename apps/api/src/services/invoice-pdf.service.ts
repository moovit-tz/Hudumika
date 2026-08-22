// ─── Real invoice PDF export ────────────────────────────────────────────────
// No PDF export existed for a customer invoice before this — the customer
// portal's "Download" button was a client-side window.print(), not a real
// file. Built as groundwork for the M6 cross-app stamp example (a financial
// manager applying the company stamp to a customer invoice needs a real PDF
// to stamp), using the same pdfkit pattern delivery-document.service.ts
// already established, and real sales_invoices/sales_invoice_lines data —
// no fabricated figures.
//
// Total math mirrors apps/web/src/pages/Billing.tsx's own invoiceTotals()
// exactly: each line's group (line_group: 'clearing' | 'shipping' | 'other')
// totals rate*qty*(1+tax_pct/100) within its own currency; only the
// 'shipping' group is converted to TZS via the invoice's own exchange_rate
// (the frontend's own convention — shipping lines are the ones typically
// quoted in USD), matching what the customer already sees on screen so the
// PDF and the portal never disagree on the number that matters most.

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

export async function renderInvoicePdf(tenantId: string, invoiceId: string): Promise<Buffer> {
  return withTenant(tenantId, async (trx) => {
    const inv = await trx.selectFrom('sales_invoices').selectAll()
      .where('id', '=', invoiceId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!inv) throw new Error('Invoice not found');
    const lines = await trx.selectFrom('sales_invoice_lines').selectAll()
      .where('invoice_id', '=', invoiceId).orderBy('sort_order', 'asc').execute();

    const settingsRow = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst();
    const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
    const company = settings?.company ?? {};
    const companyName = company.name || tenant?.name || 'Hudumika';

    const exchangeRate = Number(inv.exchange_rate) || 1;
    const groupTotal = (group: string) => lines
      .filter(l => (l.line_group || 'other') === group)
      .reduce((s, l) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100), 0);
    const clearingTotal = groupTotal('clearing');
    const otherTotal = groupTotal('other');
    const shippingTotalUsd = groupTotal('shipping');
    const grandTotal = clearingTotal + otherTotal + shippingTotalUsd * exchangeRate;
    const balance = grandTotal - (Number(inv.received) || 0);

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', b => chunks.push(b));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const M = 40;
      const W = 595.28 - M * 2;
      let y = M;

      // Header
      doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(companyName, M, y);
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
        .text([company.address, [company.city, company.country].filter(Boolean).join(', ')].filter(Boolean).join(' · '), M, doc.y + 2);
      doc.font('Helvetica-Bold').fontSize(20).fillColor(TEAL).text('INVOICE', M, y, { width: W, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(inv.invoice_number, M, doc.y + 2, { width: W, align: 'right' });
      y = Math.max(doc.y, y + 50) + 16;

      doc.moveTo(M, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 16;

      // Bill-to + meta
      const leftW = W * 0.55, rightW = W - leftW - 16;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('BILL TO', M, y);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(inv.client_name || '—', M, doc.y + 4, { width: leftW });
      const addr = Array.isArray(inv.client_address) ? inv.client_address : (typeof inv.client_address === 'string' ? JSON.parse(inv.client_address || '[]') : []);
      if (addr.length) doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(addr.join(', '), M, doc.y + 2, { width: leftW });

      const metaX = M + leftW + 16;
      const metaRows: [string, string][] = [
        ['Bill Date', dateFmt(inv.bill_date)], ['Due Date', dateFmt(inv.due_date)],
        ['Status', String(inv.status || '').toUpperCase()],
        ...(inv.shipment_ref ? [['Shipment Ref', inv.shipment_ref] as [string, string]] : []),
        ...(inv.bl_number ? [['BL Number', inv.bl_number] as [string, string]] : []),
      ];
      let my = y;
      metaRows.forEach(([label, value]) => {
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label, metaX, my, { width: rightW * 0.45 });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(value, metaX + rightW * 0.45, my, { width: rightW * 0.55, align: 'right' });
        my += 14;
      });
      y = Math.max(doc.y, my) + 20;

      // Line items table
      const cols = [
        { label: 'Description', w: W * 0.42 },
        { label: 'Qty', w: W * 0.1, align: 'right' as const },
        { label: 'Rate', w: W * 0.16, align: 'right' as const },
        { label: 'Tax %', w: W * 0.1, align: 'right' as const },
        { label: 'Amount', w: W * 0.22, align: 'right' as const },
      ];
      doc.rect(M, y, W, 22).fill('#f1f5f4');
      let cx = M;
      cols.forEach(c => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(c.label.toUpperCase(), cx + 8, y + 7, { width: c.w - 8, align: c.align });
        cx += c.w;
      });
      y += 22;

      for (const l of lines) {
        const rowH = 20;
        if (y + rowH > 780) { doc.addPage(); y = M; }
        const lineAmount = Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100);
        const currency = l.currency || 'TZS';
        cx = M;
        doc.font('Helvetica').fontSize(9).fillColor(INK).text(l.name, cx + 8, y + 5, { width: cols[0].w - 8 }); cx += cols[0].w;
        doc.text(String(l.qty), cx, y + 5, { width: cols[1].w - 8, align: 'right' }); cx += cols[1].w;
        doc.text(`${currency} ${money(Number(l.rate))}`, cx, y + 5, { width: cols[2].w - 8, align: 'right' }); cx += cols[2].w;
        doc.text(`${Number(l.tax_pct)}%`, cx, y + 5, { width: cols[3].w - 8, align: 'right' }); cx += cols[3].w;
        doc.font('Helvetica-Bold').text(`${currency} ${money(lineAmount)}`, cx, y + 5, { width: cols[4].w - 8, align: 'right' });
        doc.moveTo(M, y + rowH).lineTo(M + W, y + rowH).strokeColor(BORDER).lineWidth(0.5).stroke();
        y += rowH;
      }
      y += 12;

      // Totals
      const totalsX = M + W * 0.55, totalsW = W * 0.45;
      const totalRow = (label: string, value: string, bold = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5).fillColor(bold ? INK : MUTED)
          .text(label, totalsX, y, { width: totalsW * 0.5 });
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5).fillColor(bold ? TEAL : INK)
          .text(value, totalsX + totalsW * 0.5, y, { width: totalsW * 0.5, align: 'right' });
        y += bold ? 20 : 16;
      };
      if (clearingTotal) totalRow('Clearing', `TZS ${money(clearingTotal)}`);
      if (shippingTotalUsd) totalRow('Shipping (converted)', `TZS ${money(shippingTotalUsd * exchangeRate)}`);
      if (otherTotal) totalRow('Other', `TZS ${money(otherTotal)}`);
      doc.moveTo(totalsX, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(0.5).stroke();
      y += 8;
      totalRow('Grand Total', `TZS ${money(grandTotal)}`, true);
      totalRow(inv.status === 'Paid' ? 'Fully Paid' : 'Balance Due', `TZS ${money(inv.status === 'Paid' ? 0 : balance)}`);

      if (inv.notes) {
        y += 20;
        doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('NOTES', M, y);
        doc.font('Helvetica').fontSize(9).fillColor(INK).text(inv.notes, M, doc.y + 4, { width: W });
      }

      doc.end();
    });
  });
}
