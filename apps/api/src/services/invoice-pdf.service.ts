// ─── Real invoice PDF export ────────────────────────────────────────────────
// No PDF export existed for a customer invoice before this — the customer
// portal's "Download" button was a client-side window.print(), not a real
// file. Built as groundwork for the M6 cross-app stamp example (a financial
// manager applying the company stamp to a customer invoice needs a real PDF
// to stamp), using the same pdfkit pattern delivery-document.service.ts
// already established, and real sales_invoices/sales_invoice_lines data —
// no fabricated figures.
//
import PDFDocument from 'pdfkit';
import { FINANCE_INDUSTRIES } from '@hudumika/types';
import { documentBranding, drawDocumentHeader } from './document-branding.service.js';
import { invoiceGrandTotal, invoiceNetAndTax } from './invoice-totals.js';
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

    const work = inv.industry_work_id ? await trx.selectFrom('finance_industry_work')
      .select(['reference', 'name', 'industry']).where('tenant_id', '=', tenantId)
      .where('id', '=', inv.industry_work_id).executeTakeFirst() : undefined;

    const settingsRow = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst();
    const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
    const company = settings?.company ?? {};
    const companyName = company.name || tenant?.name || 'Hudumika';

    const exchangeRate = Number(inv.exchange_rate) || 1;
    const currency = inv.currency || 'TZS';
    const grandTotal = invoiceGrandTotal(lines, currency, exchangeRate);
    const { net, tax } = invoiceNetAndTax(lines, currency, exchangeRate);
    const balance = Math.max(0, grandTotal - (Number(inv.received) || 0));
    const brand = await documentBranding(settings, 'invoice');

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', b => chunks.push(b));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const M = 40;
      const W = 595.28 - M * 2;
      let y = M;

      y = drawDocumentHeader(doc, brand, {name: companyName, address: [company.address, company.city, company.country, company.email, company.phone].filter(Boolean).join(' · ')}, 'INVOICE', inv.invoice_number, M, y, W);

      doc.moveTo(M, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 16;

      // Bill-to + meta
      const leftW = W * 0.55, rightW = W - leftW - 16;
      doc.font('Document-Bold').fontSize(9).fillColor(MUTED).text('BILL TO', M, y);
      doc.font('Document-Bold').fontSize(11).fillColor(INK).text(inv.client_name || '—', M, doc.y + 4, { width: leftW });
      const addr = Array.isArray(inv.client_address) ? inv.client_address : (typeof inv.client_address === 'string' ? JSON.parse(inv.client_address || '[]') : []);
      if (addr.length) doc.font('Document-Regular').fontSize(9).fillColor(MUTED).text(addr.join(', '), M, doc.y + 2, { width: leftW });

      const metaX = M + leftW + 16;
      const metaRows: [string, string][] = [
        ['Bill Date', dateFmt(inv.bill_date)], ['Due Date', dateFmt(inv.due_date)],
        ['Status', String(inv.status || '').toUpperCase()],
        ...(inv.shipment_ref ? [['Shipment Ref', inv.shipment_ref] as [string, string]] : []),
        ...(inv.bl_number ? [['BL Number', inv.bl_number] as [string, string]] : []),
      ];
      let my = y;
      metaRows.forEach(([label, value]) => {
        doc.font('Document-Regular').fontSize(8.5).fillColor(MUTED).text(label, metaX, my, { width: rightW * 0.45 });
        doc.font('Document-Bold').fontSize(8.5).fillColor(INK).text(value, metaX + rightW * 0.45, my, { width: rightW * 0.55, align: 'right' });
        my += 14;
      });
      y = Math.max(doc.y, my) + 20;

      if (work) {
        const industry = FINANCE_INDUSTRIES.find(item => item.key === work.industry)?.name || 'Industry work';
        doc.font('Document-Bold').fontSize(9).fillColor(brand.accent).text(`${industry} · ${work.reference}`, M, y, { width: W });
        doc.font('Document-Regular').fontSize(9).fillColor(INK).text(work.name, M, doc.y + 4, { width: W });
        y = doc.y + 16;
        if (y + 46 > 780) { doc.addPage(); y = M; }
      }

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
        doc.font('Document-Bold').fontSize(8).fillColor(MUTED).text(c.label.toUpperCase(), cx + 8, y + 7, { width: c.w - 8, align: c.align });
        cx += c.w;
      });
      y += 22;

      for (const l of lines) {
        const quantity = [String(l.qty), l.unit].filter(Boolean).join(' ');
        const rowH = Math.max(24, doc.font('Document-Regular').fontSize(9).heightOfString(l.name, {width: cols[0].w - 16}) + 12,
          doc.heightOfString(quantity, {width: cols[1].w - 8}) + 12);
        if (y + rowH > 780) { doc.addPage(); y = M; }
        const lineAmount = Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100);
        const lineCurrency = l.currency || currency;
        cx = M;
        doc.font('Document-Regular').fontSize(9).fillColor(INK).text(l.name, cx + 8, y + 5, { width: cols[0].w - 8 }); cx += cols[0].w;
        doc.text(quantity, cx, y + 5, { width: cols[1].w - 8, align: 'right' }); cx += cols[1].w;
        doc.text(`${lineCurrency} ${money(Number(l.rate))}`, cx, y + 5, { width: cols[2].w - 8, align: 'right' }); cx += cols[2].w;
        doc.text(`${Number(l.tax_pct)}%`, cx, y + 5, { width: cols[3].w - 8, align: 'right' }); cx += cols[3].w;
        doc.font('Document-Bold').text(`${lineCurrency} ${money(lineAmount)}`, cx, y + 5, { width: cols[4].w - 8, align: 'right' });
        doc.moveTo(M, y + rowH).lineTo(M + W, y + rowH).strokeColor(BORDER).lineWidth(0.5).stroke();
        y += rowH;
      }
      y += 12;

      // Totals
      if (y + 110 > 780) { doc.addPage(); y = M; }
      const totalsX = M + W * 0.55, totalsW = W * 0.45;
      const totalRow = (label: string, value: string, bold = false) => {
        doc.font(bold ? 'Document-Bold' : 'Document-Regular').fontSize(bold ? 11 : 9.5).fillColor(bold ? INK : MUTED)
          .text(label, totalsX, y, { width: totalsW * 0.5 });
        doc.font(bold ? 'Document-Bold' : 'Document-Regular').fontSize(bold ? 11 : 9.5).fillColor(bold ? brand.accent : INK)
          .text(value, totalsX + totalsW * 0.5, y, { width: totalsW * 0.5, align: 'right' });
        y += bold ? 20 : 16;
      };
      totalRow('Subtotal', `${currency} ${money(net)}`);
      totalRow('Tax', `${currency} ${money(tax)}`);
      doc.moveTo(totalsX, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(0.5).stroke();
      y += 8;
      totalRow('Grand Total', `${currency} ${money(grandTotal)}`, true);
      totalRow(inv.status === 'Paid' ? 'Fully Paid' : 'Balance Due', `${currency} ${money(balance)}`);

      if (inv.payment_terms) {
        y += 20;
        doc.font('Document-Bold').fontSize(9).fillColor(MUTED).text('TERMS', M, y);
        doc.font('Document-Regular').fontSize(9).fillColor(INK).text(inv.payment_terms, M, doc.y + 4, { width: W });
        y = doc.y;
      }
      if (inv.notes) {
        y += 20;
        doc.font('Document-Bold').fontSize(9).fillColor(MUTED).text('NOTES', M, y);
        doc.font('Document-Regular').fontSize(9).fillColor(INK).text(inv.notes, M, doc.y + 4, { width: W });
      }

      doc.end();
    });
  });
}
