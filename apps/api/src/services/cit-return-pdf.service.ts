// ─── Corporate income tax return export (PDF) ───────────────────────────────
// M4 of the corporate-tax build-out. Renders one M2 cit_returns row into a
// filing-support layout — every figure already exists on that row, this
// only lays it out for a human to transcribe into TRA's own ITX return.

import PDFDocument from 'pdfkit';
import { withTenant } from '../db/client.js';

const INK = '#0b1220';
const MUTED = '#5b6472';
const BORDER = '#dfe3e8';
const TEAL = '#0d9488';

function money(n: number): string {
  // Guards the -0.00 artifact a bare subtraction produces when the result
  // is exactly zero (e.g. -taxDepreciation when taxDepreciation is 0).
  return (n === 0 ? 0 : n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateFmt(d: unknown): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(String(d));
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export async function renderCitReturnPdf(tenantId: string, returnId: string): Promise<Buffer> {
  return withTenant(tenantId, async (trx) => {
    const ret = await trx.selectFrom('cit_returns').selectAll()
      .where('id', '=', returnId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!ret) throw new Error('CIT return not found');

    const ourTaxReg = await trx.selectFrom('tax_registrations').select('registration_number')
      .where('tenant_id', '=', tenantId).where('jurisdiction', '=', 'TZ').where('regime', '=', 'VAT').executeTakeFirst();
    const settingsRow = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst();
    const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
    const company = settings?.company ?? {};
    const companyName = company.name || tenant?.name || 'Hudumika';

    const accountingProfit = Number(ret.accounting_profit);
    const bookDep = Number(ret.book_depreciation);
    const taxDep = Number(ret.tax_depreciation);
    const adjustments = Number(ret.adjustments_total);
    const taxableIncome = Number(ret.taxable_income);
    const ratePct = Number(ret.rate_pct);
    const liability = Number(ret.tax_liability);

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
      if (ourTaxReg?.registration_number) {
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(`TIN: ${ourTaxReg.registration_number}`, M, doc.y + 2);
      }
      doc.font('Helvetica-Bold').fontSize(18).fillColor(TEAL).text('CORPORATE INCOME TAX RETURN', M, y, { width: W, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`${dateFmt(ret.period_start)} – ${dateFmt(ret.period_end)}`, M, doc.y + 2, { width: W, align: 'right' });
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Filing-support document — transcribe into TRA’s own ITX return, not a submission itself.', M, doc.y + 2, { width: W, align: 'right' });
      y = Math.max(doc.y, y + 70) + 16;

      doc.moveTo(M, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 16;

      const bridgeRows: [string, number, boolean][] = [
        ['Accounting profit before tax', accountingProfit, false],
        ['Add: book depreciation (not tax-deductible)', bookDep, false],
        ['Less: tax depreciation (statutory wear-and-tear allowance)', -taxDep, false],
        ['Book-to-tax adjustments (disallowed expenses, fines, exempt income)', adjustments, false],
        ['Taxable income', taxableIncome, true],
      ];
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('TAXABLE INCOME COMPUTATION', M, y);
      y = doc.y + 8;
      for (const [label, value, bold] of bridgeRows) {
        if (y + 20 > 780) { doc.addPage(); y = M; }
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(bold ? INK : MUTED).text(label, M, y, { width: W * 0.68 });
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(INK).text(money(value), M + W * 0.68, y, { width: W * 0.32, align: 'right' });
        y += bold ? 22 : 18;
        if (bold) { doc.moveTo(M, y - 4).lineTo(M + W, y - 4).strokeColor(BORDER).lineWidth(1).stroke(); }
      }
      y += 16;

      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('TAX LIABILITY', M, y);
      y = doc.y + 8;
      const liabilityRows: [string, string][] = [
        ['Applicable rate', `${ret.rate_category}${ret.is_amt ? ' (alternative minimum tax)' : ''} — ${ratePct.toFixed(2)}%${ret.rate_source === 'REFERENCE_DEFAULT' ? ' (reference default — no tenant rate configured)' : ''}`],
        ...(ret.is_amt && ret.turnover ? [['Turnover (AMT base)', money(Number(ret.turnover))] as [string, string]] : []),
      ];
      for (const [label, value] of liabilityRows) {
        doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(label, M, y, { width: W * 0.6 });
        doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(value, M + W * 0.6, y, { width: W * 0.4, align: 'right' });
        y += 18;
      }
      y += 12;

      doc.moveTo(M, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 14;
      doc.font('Helvetica-Bold').fontSize(12).fillColor(TEAL).text('TAX LIABILITY', M, y, { width: W * 0.6 });
      doc.text(money(liability), M + W * 0.6, y, { width: W * 0.4, align: 'right' });
      y = doc.y + 20;

      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
        `Status: ${ret.status}${ret.status === 'ACCRUED' ? ` — accrued ${dateFmt(ret.accrued_at)}` : ' — draft, not yet posted to the general ledger'}.`,
        M, y);

      doc.end();
    });
  });
}
