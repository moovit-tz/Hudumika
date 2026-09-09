// ─── Compliance declaration cover sheet ──────────────────────────────────────
// Cloned from contract-pdf.service.ts's exact structure (pdfkit, chunked-
// buffer promise, same INK/MUTED/BORDER/TEAL palette) — same reason: this
// document should look like it belongs to the same platform as every other
// generated PDF, not a one-off style.
//
// Deliberately factual, not legal boilerplate: every line is a real field
// already stored on the application record (app number, cert type, agency,
// applicant, submission date). The one attestation sentence confirms the
// details match what's recorded on the platform — a claim this document
// can actually verify — not a statement about the application's legal
// sufficiency or outcome, which this platform has no authority to assert
// (see METRICS_AND_SIGN_PLAN.md §5 Phase S5's jurisdiction-engine guardrail
// against unsupported legal claims — the same discipline applies here even
// without a jurisdiction engine backing this specific document).

import PDFDocument from 'pdfkit';
import { withTenant } from '../db/client.js';

const INK = '#0b1220';
const MUTED = '#5b6472';
const BORDER = '#dfe3e8';
const TEAL = '#0d9488';

function dateFmt(d: unknown): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(String(d));
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export async function renderComplyDeclarationPdf(tenantId: string, applicationId: string): Promise<Buffer> {
  return withTenant(tenantId, async (trx) => {
    const app = await trx.selectFrom('comply_applications').selectAll()
      .where('id', '=', applicationId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!app) throw new Error('Application not found');

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
      doc.font('Helvetica-Bold').fontSize(20).fillColor(TEAL).text('COMPLIANCE DECLARATION', M, y, { width: W, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(app.app_number, M, doc.y + 2, { width: W, align: 'right' });
      y = Math.max(doc.y, y + 50) + 16;

      doc.moveTo(M, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 16;

      const leftW = W * 0.55, rightW = W - leftW - 16;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('APPLICANT', M, y);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(companyName, M, doc.y + 4, { width: leftW });

      const metaX = M + leftW + 16;
      const metaRows: [string, string][] = [
        ['Certificate Type', app.cert_type],
        ['Agency', app.agency_code],
        ['Status', String(app.status || '').toUpperCase()],
        ...(app.agency_ref ? [['Agency Ref.', app.agency_ref] as [string, string]] : []),
      ];
      let my = y;
      metaRows.forEach(([label, value]) => {
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label, metaX, my, { width: rightW * 0.45 });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(value, metaX + rightW * 0.45, my, { width: rightW * 0.55, align: 'right' });
        my += 14;
      });
      y = Math.max(doc.y, my) + 24;

      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('DECLARATION', M, y);
      doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(
        `I confirm that the application details above — certificate type, agency and application number — match what is recorded for application ${app.app_number} on the Hudumika platform as of ${dateFmt(new Date())}.`,
        M, doc.y + 4, { width: W, lineGap: 3 },
      );
      y = doc.y + 20;

      if (app.notes) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('NOTES', M, y);
        doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(app.notes, M, doc.y + 4, { width: W, lineGap: 3 });
        y = doc.y + 20;
      }

      doc.end();
    });
  });
}
