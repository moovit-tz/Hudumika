// Real offer-letter PDF — cloned from contract-pdf.service.ts's exact
// structure (pdfkit, chunked-buffer promise, same INK/MUTED/BORDER/TEAL
// palette) so an offer letter looks like it belongs to the same platform as
// a contract or invoice PDF. Real offer/candidate/company data, no
// fabricated figures — the whole point of generating this at all is that
// what a candidate is shown to sign is the real offer, not a placeholder.
import PDFDocument from 'pdfkit';
import { withTenant } from '../db/client.js';

const INK = '#0b1220';
const MUTED = '#5b6472';
const BORDER = '#dfe3e8';
const TEAL = '#0d9488';

function money(amount: string | null, currency: string | null, period: string): string {
  if (!amount) return '—';
  const n = Number(amount);
  const formatted = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency || ''} ${formatted} / ${period === 'ANNUAL' ? 'year' : 'month'}`.trim();
}

function dateFmt(d: unknown): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(String(d));
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

export async function renderOfferLetterPdf(tenantId: string, offerId: string): Promise<{ buffer: Buffer; candidateName: string; candidateEmail: string | null }> {
  return withTenant(tenantId, async (trx) => {
    const offer = await trx.selectFrom('hr_offers').selectAll()
      .where('id', '=', offerId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!offer) throw new Error('Offer not found');

    const application = await trx.selectFrom('hr_applications as a')
      .innerJoin('hr_candidates as c', 'c.id', 'a.candidate_id')
      .innerJoin('hr_job_openings as o', 'o.id', 'a.job_opening_id')
      .select(['c.name as candidate_name', 'c.email as candidate_email', 'o.title as job_title', 'o.department as department'])
      .where('a.id', '=', offer.application_id).where('a.tenant_id', '=', tenantId).executeTakeFirstOrThrow();

    const settingsRow = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst();
    const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
    const company = settings?.company ?? {};
    const companyName = company.name || tenant?.name || 'Hudumika';

    const buffer = await new Promise<Buffer>((resolve, reject) => {
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
      doc.font('Helvetica-Bold').fontSize(20).fillColor(TEAL).text('OFFER OF EMPLOYMENT', M, y, { width: W, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(dateFmt(new Date()), M, doc.y + 2, { width: W, align: 'right' });
      y = Math.max(doc.y, y + 50) + 16;

      doc.moveTo(M, y).lineTo(M + W, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 16;

      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('TO', M, y);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(application.candidate_name, M, doc.y + 4);
      if (application.candidate_email) doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(application.candidate_email, M, doc.y + 2);
      y = doc.y + 20;

      doc.font('Helvetica').fontSize(10).fillColor(INK).text(
        `Dear ${application.candidate_name},`, M, y, { width: W }
      );
      y = doc.y + 10;
      doc.font('Helvetica').fontSize(10).fillColor(INK).text(
        `We are pleased to offer you the position of ${offer.position_title}${application.department ? ` in ${application.department}` : ''} at ${companyName}. The terms of this offer are set out below.`,
        M, y, { width: W }
      );
      y = doc.y + 20;

      const rows: [string, string][] = [
        ['Position', offer.position_title],
        ['Compensation', money(offer.compensation_amount, offer.compensation_currency, offer.compensation_period)],
        ['Start date', dateFmt(offer.start_date)],
        ['Offer expires', dateFmt(offer.expiry_date)],
      ];
      const boxTop = y;
      rows.forEach(([label, value]) => {
        doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(label, M + 12, y + 10, { width: W * 0.35 });
        doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(value, M + 12 + W * 0.35, y + 10, { width: W * 0.6 });
        y += 24;
      });
      doc.rect(M, boxTop, W, y - boxTop + 6).strokeColor(BORDER).lineWidth(1).stroke();
      y += 26;

      doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(
        'This offer is contingent on any pre-employment requirements this workspace applies and remains valid only until the expiry date above. Please sign below to indicate your acceptance of this offer.',
        M, y, { width: W }
      );
      y = doc.y + 40;

      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Candidate signature', M, y);
      doc.moveTo(M, y + 30).lineTo(M + 200, y + 30).strokeColor(BORDER).stroke();
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Date', M + 240, y);
      doc.moveTo(M + 240, y + 30).lineTo(M + 240 + 140, y + 30).strokeColor(BORDER).stroke();

      doc.end();
    });

    return { buffer, candidateName: application.candidate_name, candidateEmail: application.candidate_email };
  });
}
