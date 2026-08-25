// ─── Real contract PDF export ───────────────────────────────────────────────
// Cloned from invoice-pdf.service.ts's exact structure (pdfkit, chunked-
// buffer promise, same INK/MUTED/BORDER/TEAL palette) so a contract PDF
// looks like it belongs to the same platform as an invoice PDF. Real
// contracts/customers data — no fabricated figures.

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

export async function renderContractPdf(tenantId: string, contractId: string): Promise<Buffer> {
  return withTenant(tenantId, async (trx) => {
    const contract = await trx.selectFrom('contracts').selectAll()
      .where('id', '=', contractId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!contract) throw new Error('Contract not found');
    const customer = await trx.selectFrom('customers').select(['name', 'contact_name', 'email'])
      .where('id', '=', contract.customer_id).executeTakeFirst();

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

      // Header
      doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(companyName, M, y);
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
        .text([company.address, [company.city, company.country].filter(Boolean).join(', ')].filter(Boolean).join(' · '), M, doc.y + 2);
      doc.font('Helvetica-Bold').fontSize(20).fillColor(TEAL).text('CONTRACT', M, y, { width: W, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(contract.ref || '—', M, doc.y + 2, { width: W, align: 'right' });
      y = Math.max(doc.y, y + 50) + 16;

      doc.moveTo(M, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 16;

      // Customer + meta
      const leftW = W * 0.55, rightW = W - leftW - 16;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('BETWEEN', M, y);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(customer?.name || '—', M, doc.y + 4, { width: leftW });
      if (customer?.contact_name) doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(customer.contact_name, M, doc.y + 2, { width: leftW });

      const metaX = M + leftW + 16;
      const metaRows: [string, string][] = [
        ['Start Date', dateFmt(contract.start_date)], ['End Date', dateFmt(contract.end_date)],
        ['Status', String(contract.status || '').toUpperCase()],
        ...(contract.type ? [['Type', contract.type] as [string, string]] : []),
      ];
      let my = y;
      metaRows.forEach(([label, value]) => {
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label, metaX, my, { width: rightW * 0.45 });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(value, metaX + rightW * 0.45, my, { width: rightW * 0.55, align: 'right' });
        my += 14;
      });
      y = Math.max(doc.y, my) + 24;

      // Subject
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('SUBJECT', M, y);
      doc.font('Helvetica').fontSize(11).fillColor(INK).text(contract.subject, M, doc.y + 4, { width: W });
      y = doc.y + 20;

      // Value
      if (contract.value) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('CONTRACT VALUE', M, y);
        doc.font('Helvetica-Bold').fontSize(13).fillColor(TEAL).text(`${contract.currency} ${money(Number(contract.value))}`, M, doc.y + 4);
        y = doc.y + 20;
      }

      // Description / terms
      if (contract.description) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('TERMS', M, y);
        doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(contract.description, M, doc.y + 4, { width: W, lineGap: 3 });
        y = doc.y + 20;
      }

      doc.end();
    });
  });
}
