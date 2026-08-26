// ─── Withholding tax certificate PDF ────────────────────────────────────────
// The document a tenant hands a supplier as proof of tax withheld on their
// behalf — same pdfkit buffer-accumulation/branding pattern as
// customer-statement-pdf.service.ts, one deduction per certificate rather
// than a running balance.

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

export async function renderWhtCertificatePdf(tenantId: string, deductionId: string): Promise<Buffer> {
  return withTenant(tenantId, async (trx) => {
    const deduction = await trx.selectFrom('wht_deductions').selectAll()
      .where('id', '=', deductionId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!deduction) throw new Error('Withholding tax deduction not found');
    if (!deduction.certificate_number) throw new Error('This deduction has not been issued a certificate yet');

    const bill = await trx.selectFrom('supplier_bills').selectAll()
      .where('id', '=', deduction.bill_id).where('tenant_id', '=', tenantId).executeTakeFirst();
    const payment = await trx.selectFrom('bill_payments').selectAll()
      .where('id', '=', deduction.bill_payment_id).executeTakeFirst();
    const supplier = deduction.supplier_id
      ? await trx.selectFrom('suppliers').selectAll().where('id', '=', deduction.supplier_id).executeTakeFirst()
      : undefined;

    const settingsRow = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst();
    const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
    const company = settings?.company ?? {};
    const companyName = company.name || tenant?.name || 'Hudumika';

    const ourTaxReg = await trx.selectFrom('tax_registrations').select('registration_number')
      .where('tenant_id', '=', tenantId).where('jurisdiction', '=', 'TZ').where('regime', '=', 'VAT').executeTakeFirst();

    const gross = Number(deduction.gross_amount);
    const wht = Number(deduction.wht_amount);
    const net = gross - wht;
    const ratePct = gross > 0 ? (wht / gross) * 100 : 0;

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
      if (ourTaxReg?.registration_number) {
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(`VRN: ${ourTaxReg.registration_number}`, M, doc.y + 2);
      }
      doc.font('Helvetica-Bold').fontSize(18).fillColor(TEAL).text('WITHHOLDING TAX', M, y, { width: W, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(18).fillColor(TEAL).text('CERTIFICATE', M, doc.y, { width: W, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(deduction.certificate_number || '', M, doc.y + 4, { width: W, align: 'right' });
      y = Math.max(doc.y, y + 60) + 16;

      doc.moveTo(M, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 16;

      // Explicit fixed offsets from the shared anchor `y`, not chained
      // `doc.y` — interleaving two side-by-side columns through `doc.y`
      // makes each column's own text overwrite the other's vertical
      // position, since `doc.y` only tracks whatever was drawn most
      // recently, not a per-column cursor.
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('ISSUED TO (PAYEE)', M, y);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(supplier?.name || bill?.supplier_name || 'Supplier', M, y + 14);
      let leftY = y + 30;
      if (supplier?.tax_id) { doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`TIN: ${supplier.tax_id}`, M, leftY); leftY += 13; }
      if (supplier?.address) { doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(supplier.address, M, leftY, { width: W * 0.55 }); leftY = doc.y; }

      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('CERTIFICATE DATE', M + W * 0.6, y);
      doc.font('Helvetica').fontSize(10).fillColor(INK).text(dateFmt(deduction.certificate_issued_at), M + W * 0.6, y + 14);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('PAYMENT REFERENCE', M + W * 0.6, y + 34);
      doc.font('Helvetica').fontSize(10).fillColor(INK).text(bill?.bill_number || '—', M + W * 0.6, y + 48);

      y = Math.max(leftY, y + 66) + 20;

      const rows: [string, string][] = [
        ['Bill / invoice reference', bill?.bill_number || '—'],
        ['Payment date', dateFmt(payment?.payment_date ?? payment?.created_at)],
        ['Gross amount paid', `${bill?.currency || 'TZS'} ${money(gross)}`],
        ['Withholding tax rate', `${ratePct.toFixed(2)}%`],
        ['Withholding tax withheld', `${bill?.currency || 'TZS'} ${money(wht)}`],
        ['Net amount paid to payee', `${bill?.currency || 'TZS'} ${money(net)}`],
      ];
      doc.rect(M, y, W, rows.length * 26 + 8).fill('#f1f5f4');
      let ry = y + 4;
      for (const [label, value] of rows) {
        doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(label, M + 12, ry + 7, { width: W * 0.5 });
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(value, M + W * 0.5, ry + 6, { width: W * 0.46, align: 'right' });
        ry += 26;
      }
      y = ry + 20;

      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(
        `This certifies that ${companyName} withheld tax of ${bill?.currency || 'TZS'} ${money(wht)} from the amount payable to the above payee, in accordance with the Income Tax Act, and undertakes to remit this amount to the Tanzania Revenue Authority.`,
        M, y, { width: W, lineGap: 2 }
      );

      doc.end();
    });
  });
}
