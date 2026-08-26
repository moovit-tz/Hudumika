// ─── PAYE/SDL monthly return export (PDF) ───────────────────────────────────
// M4 of the corporate-tax build-out. Renders one payroll_runs record + its
// payroll_payslips into a filing-support layout — every figure already
// exists on those two tables/`lines`, this only lays it out for a human to
// transcribe into TRA's own monthly PAYE/SDL return.

import PDFDocument from 'pdfkit';
import { withTenant } from '../db/client.js';

const INK = '#0b1220';
const MUTED = '#5b6472';
const BORDER = '#dfe3e8';
const TEAL = '#0d9488';

function money(n: number): string {
  return (n === 0 ? 0 : n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface PayslipLine { kind: string; code: string; name: string; amount: number; basis?: string }

function parseLines(raw: unknown): PayslipLine[] {
  if (!raw) return [];
  const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return Array.isArray(arr) ? arr : [];
}
function sumByCode(lines: PayslipLine[], code: string): number {
  return lines.filter(l => l.code === code).reduce((s, l) => s + Number(l.amount || 0), 0);
}

export async function renderPayeReturnPdf(tenantId: string, runId: string): Promise<Buffer> {
  return withTenant(tenantId, async (trx) => {
    const run = await trx.selectFrom('payroll_runs').selectAll()
      .where('id', '=', runId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!run) throw new Error('Payroll run not found');

    const payslips = await trx.selectFrom('payroll_payslips')
      .innerJoin('users', 'users.id', 'payroll_payslips.user_id')
      .select([
        'payroll_payslips.id', 'payroll_payslips.gross_pay', 'payroll_payslips.taxable_pay',
        'payroll_payslips.income_tax', 'payroll_payslips.employee_contributions',
        'payroll_payslips.employer_contributions', 'payroll_payslips.net_pay', 'payroll_payslips.lines',
        'users.name',
      ])
      .where('payroll_payslips.run_id', '=', runId).where('payroll_payslips.tenant_id', '=', tenantId)
      .orderBy('users.name', 'asc')
      .execute();

    const ourTaxReg = await trx.selectFrom('tax_registrations').select(['registration_number'])
      .where('tenant_id', '=', tenantId).where('jurisdiction', '=', 'TZ').where('regime', '=', 'VAT').executeTakeFirst();

    const settingsRow = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst();
    const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
    const company = settings?.company ?? {};
    const companyName = company.name || tenant?.name || 'Hudumika';

    const rows = payslips.map(p => {
      const lines = parseLines(p.lines);
      // payroll.service.ts emits one EMPLOYEE_CONTRIBUTION line and one
      // EMPLOYER_CONTRIBUTION line per scheme, both under the same `code`
      // ('NSSF', 'SDL', ...) — summing by code alone (not further filtering
      // by kind) is what combines both sides correctly.
      return {
        name: p.name, grossPay: Number(p.gross_pay), taxablePay: Number(p.taxable_pay),
        paye: Number(p.income_tax), sdl: sumByCode(lines, 'SDL'),
      };
    });
    const totalGross = Number(run.total_gross);
    const totalPaye = payslips.reduce((s, p) => s + Number(p.income_tax), 0);
    const totalSdl = rows.reduce((s, r) => s + r.sdl, 0);

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
      doc.font('Helvetica-Bold').fontSize(18).fillColor(TEAL).text('PAYE / SDL RETURN', M, y, { width: W, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`${String(run.period_year)}-${String(run.period_month).padStart(2, '0')}  ·  ${run.name}`, M, doc.y + 2, { width: W, align: 'right' });
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Filing-support document — transcribe into TRA’s own return portal, not a submission itself.', M, doc.y + 2, { width: W, align: 'right' });
      y = Math.max(doc.y, y + 60) + 16;

      doc.moveTo(M, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 16;

      const cols = [
        { label: 'Employee', w: W * 0.30 },
        { label: 'Gross', w: W * 0.17, align: 'right' as const },
        { label: 'Taxable', w: W * 0.17, align: 'right' as const },
        { label: 'PAYE', w: W * 0.18, align: 'right' as const },
        { label: 'SDL', w: W * 0.18, align: 'right' as const },
      ];
      doc.rect(M, y, W, 20).fill('#f1f5f4');
      let cx = M;
      cols.forEach(c => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(c.label.toUpperCase(), cx + 8, y + 6, { width: c.w - 8, align: c.align });
        cx += c.w;
      });
      y += 20;

      for (const r of rows) {
        if (y + 18 > 780) { doc.addPage(); y = M; }
        cx = M;
        doc.font('Helvetica').fontSize(9).fillColor(INK).text(r.name, cx + 8, y + 4, { width: cols[0].w - 8 }); cx += cols[0].w;
        doc.text(money(r.grossPay), cx, y + 4, { width: cols[1].w - 8, align: 'right' }); cx += cols[1].w;
        doc.text(money(r.taxablePay), cx, y + 4, { width: cols[2].w - 8, align: 'right' }); cx += cols[2].w;
        doc.text(money(r.paye), cx, y + 4, { width: cols[3].w - 8, align: 'right' }); cx += cols[3].w;
        doc.text(money(r.sdl), cx, y + 4, { width: cols[4].w - 8, align: 'right' });
        doc.moveTo(M, y + 18).lineTo(M + W, y + 18).strokeColor(BORDER).lineWidth(0.5).stroke();
        y += 18;
      }
      y += 12;

      const summary: [string, number][] = [
        ['Total gross pay', totalGross],
        ['Total PAYE withheld', totalPaye],
        ['Skills Development Levy (SDL, employer)', totalSdl],
      ];
      doc.rect(M, y, W, summary.length * 22 + 8).fill('#f1f5f4');
      let sy = y + 4;
      for (const [label, value] of summary) {
        doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(label, M + 12, sy + 5, { width: W * 0.6 });
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(money(value), M + W * 0.6, sy + 4, { width: W * 0.36, align: 'right' });
        sy += 22;
      }
      y = sy + 16;
      doc.font('Helvetica-Bold').fontSize(12).fillColor(TEAL).text('TOTAL REMITTABLE TO TRA', M, y, { width: W * 0.6 });
      doc.text(money(totalPaye + totalSdl), M + W * 0.6, y, { width: W * 0.4, align: 'right' });

      doc.end();
    });
  });
}
