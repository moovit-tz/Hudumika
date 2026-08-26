// ─── VAT return filing export (PDF + CSV) ───────────────────────────────────
// M4 of the corporate-tax build-out. Pure rendering layer — computeVatReturn()
// already produces every figure a return needs; this only lays it out. TRA
// has no periodic-return e-filing API (confirmed against tra.service.ts,
// which only covers per-invoice EFDMS/VFD fiscalization), and no real TRA
// VAT-return form layout exists anywhere in this codebase to match — so
// this renders a clearly-labeled internal filing-support document (every
// figure computeVatReturn() already produces, laid out for a human to
// transcribe into TRA's own portal), not a claimed reproduction of TRA's
// actual form.

import PDFDocument from 'pdfkit';
import { withTenant } from '../db/client.js';
import { computeVatReturn, type VatReturn } from './vat-return.service.js';
import { reportingCurrency } from './tax-registration.service.js';

const INK = '#0b1220';
const MUTED = '#5b6472';
const BORDER = '#dfe3e8';
const TEAL = '#0d9488';

function money(n: number): string {
  return (n === 0 ? 0 : n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateFmt(d: unknown): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(String(d));
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function fetchBranding(trx: any, tenantId: string) {
  const settingsRow = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
  const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst();
  const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
  const company = settings?.company ?? {};
  return { companyName: company.name || tenant?.name || 'Hudumika', company };
}

async function computeReturnForExport(tenantId: string, from: string, to: string, jurisdiction?: string): Promise<VatReturn> {
  return withTenant(tenantId, async (trx) => {
    const currency = await reportingCurrency(trx, tenantId);
    return computeVatReturn(trx, tenantId, from, to, currency, jurisdiction);
  });
}

export async function renderVatReturnPdf(tenantId: string, from: string, to: string, jurisdiction?: string): Promise<Buffer> {
  const ret = await computeReturnForExport(tenantId, from, to, jurisdiction);
  return renderVatReturnPdfFromData(tenantId, ret);
}

/** Renders from an already-known VatReturn — used for a *closed* period,
 * whose stored return_snapshot must be rendered verbatim, never
 * recomputed (recomputing a filed figure is exactly what a closed period
 * exists to prevent, same as vat-periods.routes.ts's own GET /:id split). */
export async function renderVatReturnPdfFromData(tenantId: string, ret: VatReturn): Promise<Buffer> {
  const { companyName, company } = await withTenant(tenantId, (trx) => fetchBranding(trx, tenantId));

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
    if (ret.registration.registrationNumber) {
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(`${ret.registration.registrationLabel || 'VRN'}: ${ret.registration.registrationNumber}`, M, doc.y + 2);
    }
    doc.font('Helvetica-Bold').fontSize(18).fillColor(TEAL).text('VAT RETURN', M, y, { width: W, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`${dateFmt(ret.from)} – ${dateFmt(ret.to)}`, M, doc.y + 2, { width: W, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Filing-support document — transcribe into TRA’s own return portal, not a submission itself.', M, doc.y + 2, { width: W, align: 'right' });
    y = Math.max(doc.y, y + 60) + 16;

    doc.moveTo(M, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 16;

    const section = (title: string) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(title, M, y);
      y = doc.y + 6;
    };
    const cols = [
      { label: 'Category', w: W * 0.4 },
      { label: 'Net', w: W * 0.3, align: 'right' as const },
      { label: 'Tax', w: W * 0.3, align: 'right' as const },
    ];
    const headerRow = () => {
      doc.rect(M, y, W, 20).fill('#f1f5f4');
      let cx = M;
      cols.forEach(c => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(c.label.toUpperCase(), cx + 8, y + 6, { width: c.w - 8, align: c.align });
        cx += c.w;
      });
      y += 20;
    };
    const row = (label: string, net: number, tax: number, bold = false) => {
      if (y + 18 > 780) { doc.addPage(); y = M; }
      let cx = M;
      const font = bold ? 'Helvetica-Bold' : 'Helvetica';
      doc.font(font).fontSize(9).fillColor(INK).text(label, cx + 8, y + 4, { width: cols[0].w - 8 }); cx += cols[0].w;
      doc.text(money(net), cx, y + 4, { width: cols[1].w - 8, align: 'right' }); cx += cols[1].w;
      doc.text(money(tax), cx, y + 4, { width: cols[2].w - 8, align: 'right' });
      doc.moveTo(M, y + 18).lineTo(M + W, y + 18).strokeColor(BORDER).lineWidth(0.5).stroke();
      y += 18;
    };

    section('OUTPUT TAX (SALES)');
    headerRow();
    for (const b of ret.outputs) row(b.name, b.net, b.tax);
    row('Total output tax', ret.outputs.reduce((s, b) => s + b.net, 0), ret.outputTax, true);
    y += 12;

    section('INPUT TAX (PURCHASES)');
    headerRow();
    for (const b of ret.inputs) row(b.name, b.net, b.tax);
    row('Total input tax', ret.inputs.reduce((s, b) => s + b.net, 0), ret.inputTax, true);
    y += 4;
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(
      `Claimable: ${money(ret.inputTaxClaimable)}   Blocked (non-recoverable): ${money(ret.inputTaxBlocked)}   Recovery rate: ${ret.recoveryRatePct.toFixed(1)}%`,
      M, y);
    y = doc.y + 16;

    if (ret.unclassified.salesLines > 0 || ret.unclassified.purchaseLines > 0) {
      doc.rect(M, y, W, 30).fill('#fef2f2');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#b3382c').text(
        `⚠ ${ret.unclassified.salesLines} sales line(s) and ${ret.unclassified.purchaseLines} purchase line(s) have no tax code — this return is incomplete until they are classified.`,
        M + 10, y + 8, { width: W - 20 });
      y += 38;
    }

    doc.moveTo(M, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 14;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(ret.netPayable >= 0 ? '#b3382c' : TEAL)
      .text(ret.netPayable >= 0 ? 'NET VAT PAYABLE' : 'NET VAT REPAYABLE', M, y, { width: W * 0.6 });
    doc.text(money(Math.abs(ret.netPayable)), M + W * 0.6, y, { width: W * 0.4, align: 'right' });

    doc.end();
  });
}

export async function renderVatReturnCsv(tenantId: string, from: string, to: string, jurisdiction?: string): Promise<string> {
  const ret = await computeReturnForExport(tenantId, from, to, jurisdiction);
  return renderVatReturnCsvFromData(ret);
}

export function renderVatReturnCsvFromData(ret: VatReturn): string {
  const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines: string[] = [];
  lines.push(['Section', 'Category', 'Net', 'Tax'].map(cell).join(','));
  for (const b of ret.outputs) lines.push(['OUTPUT', b.name, b.net.toFixed(2), b.tax.toFixed(2)].map(cell).join(','));
  lines.push(['OUTPUT', 'TOTAL', ret.outputs.reduce((s, b) => s + b.net, 0).toFixed(2), ret.outputTax.toFixed(2)].map(cell).join(','));
  for (const b of ret.inputs) lines.push(['INPUT', b.name, b.net.toFixed(2), b.tax.toFixed(2)].map(cell).join(','));
  lines.push(['INPUT', 'TOTAL', ret.inputs.reduce((s, b) => s + b.net, 0).toFixed(2), ret.inputTax.toFixed(2)].map(cell).join(','));
  lines.push(['', 'Input tax claimable', '', ret.inputTaxClaimable.toFixed(2)].map(cell).join(','));
  lines.push(['', 'Input tax blocked', '', ret.inputTaxBlocked.toFixed(2)].map(cell).join(','));
  lines.push(['', ret.netPayable >= 0 ? 'NET VAT PAYABLE' : 'NET VAT REPAYABLE', '', Math.abs(ret.netPayable).toFixed(2)].map(cell).join(','));
  return lines.join('\n');
}
