// Daily shipment-report automation (migration 258) — server-side mirror of
// ShipmentDetail.tsx's buildShipmentReportHtml(), used for:
//   1. the emailed PDF attachment (pdfkit, not headless-Chromium/Playwright —
//      Playwright is only a root devDependency for this session's own
//      browser-based verification, not an apps/api runtime dependency, and
//      every other generated document in this platform (Release Orders,
//      Certificates of Origin, Equipment Interchange Receipts) already uses
//      pdfkit — this follows that established, production-safe pattern
//      rather than introducing a new heavy Chromium dependency);
//   2. the public "share" JSON payload that apps/web's ShipmentReportShared
//      page feeds straight into the real buildShipmentReportHtml() so the
//      link opened from WhatsApp renders through the exact same report code
//      as the in-app print button — same reasoning landed_cost_shares (151)
//      already established for its own share payload.
import { randomBytes } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { withTenant, dbPlatform } from '../db/client.js';
import { ShipmentService } from './shipment.service.js';
import { MinioIntegration } from '../integrations/minio.js';
import { CloudSync } from './cloud-sync.service.js';
import { MailService } from './mail.service.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { resolvePublicBaseUrl } from '../routes/landed-cost-share.routes.js';
import { STAGE_LABELS } from '@hudumika/types';
import type { ClearanceStage } from '@hudumika/types';

export interface ReportCompanyInfo {
  name: string;
  logoUrl: string | null;
  address: string;
  city: string;
  country: string;
}

async function getCompanyInfo(trx: any, tenantId: string): Promise<ReportCompanyInfo> {
  const [settingsRow, tenant] = await Promise.all([
    trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst(),
    trx.selectFrom('tenants').select(['name', 'logo_url']).where('id', '=', tenantId).executeTakeFirst(),
  ]);
  const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
  const c = settings?.company || {};
  return {
    name: c.name || tenant?.name || 'Hudumika',
    logoUrl: c.logoUrl ?? tenant?.logo_url ?? null,
    address: c.address || '',
    city: c.city || '',
    country: c.country || '',
  };
}

/** Legacy stages resolve via the shared STAGE_LABELS map; a custom-workflow
 *  stage is a workflow_steps.id — same fallback analytics.routes.ts already
 *  uses for the same ambiguity. */
async function resolveStageLabel(trx: any, tenantId: string, stage: string): Promise<string> {
  if (stage in STAGE_LABELS) return STAGE_LABELS[stage as ClearanceStage];
  const step = await trx.selectFrom('workflow_steps').select('name')
    .where('id', '=', stage).where('tenant_id', '=', tenantId).executeTakeFirst();
  return step?.name ?? stage;
}

export interface ShipmentReportData {
  shipment: NonNullable<Awaited<ReturnType<typeof ShipmentService.getById>>>;
  company: ReportCompanyInfo;
  stageLabel: string;
}

export async function getShipmentReportData(tenantId: string, shipmentId: string): Promise<ShipmentReportData | null> {
  const shipment = await ShipmentService.getById(tenantId, shipmentId);
  if (!shipment) return null;
  return withTenant(tenantId, async (trx) => {
    const [company, stageLabel] = await Promise.all([
      getCompanyInfo(trx, tenantId),
      resolveStageLabel(trx, tenantId, shipment.stage),
    ]);
    return { shipment, company, stageLabel };
  });
}

// ─── PDF rendering (pdfkit) ─────────────────────────────────────────────────

const PAGE_MARGIN = 40;
const INK = '#171717';
const GRAY = '#666666';
const LINE = '#d8d8d8';

function drawTable(
  doc: PDFKit.PDFDocument,
  x: number,
  startY: number,
  colWidths: number[],
  rows: (string | number)[][],
  opts: { header?: boolean; rowHeight?: number; fontSize?: number } = {}
): number {
  const rowHeight = opts.rowHeight ?? 18;
  const fontSize = opts.fontSize ?? 8.5;
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  let y = startY;

  rows.forEach((row, ri) => {
    const isHeader = !!opts.header && ri === 0;
    // Page-break: leave room for the bottom margin, and repeat the header
    // row on the fresh page so a timeline/documents table that spans pages
    // is still legible without scrolling back.
    if (y + rowHeight > doc.page.height - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
      if (opts.header && !isHeader) {
        y = drawTable(doc, x, y, colWidths, [rows[0]], { header: true, rowHeight, fontSize });
      }
    }
    let cx = x;
    if (isHeader) {
      doc.rect(x, y, tableWidth, rowHeight).fill(INK);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(fontSize);
    } else {
      doc.fillColor(INK).font('Helvetica').fontSize(fontSize);
    }
    row.forEach((cell, ci) => {
      doc.rect(cx, y, colWidths[ci], rowHeight).strokeColor(LINE).lineWidth(0.5).stroke();
      doc.text(String(cell ?? ''), cx + 5, y + 5, { width: colWidths[ci] - 10, height: rowHeight - 6, ellipsis: true });
      cx += colWidths[ci];
    });
    y += rowHeight;
  });
  doc.fillColor(INK);
  return y;
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, y: number, width: number): number {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(title.toUpperCase(), PAGE_MARGIN, y);
  const ty = doc.y + 2;
  doc.moveTo(PAGE_MARGIN, ty).lineTo(PAGE_MARGIN + width, ty).strokeColor(INK).lineWidth(1).stroke();
  return ty + 8;
}

const DOC_STATUS_LABELS: Record<string, string> = { REQUIRED: 'Pending', RECEIVED: 'Received', VERIFIED: 'Verified', REJECTED: 'Rejected' };

export async function renderShipmentReportPdf(tenantId: string, shipmentId: string, generatedAt: Date = new Date()): Promise<Buffer> {
  const data = await getShipmentReportData(tenantId, shipmentId);
  if (!data) throw new Error('Shipment not found');
  const { shipment: s, company, stageLabel } = data;

  const width = 595.28 - PAGE_MARGIN * 2; // A4 pt width minus margins

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (b) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const sortedTimeline = [...(s.stage_history || [])].sort((a: any, b: any) => new Date(a.entered_at).getTime() - new Date(b.entered_at).getTime());
    const declaredAt = sortedTimeline[0]?.entered_at ? new Date(sortedTimeline[0].entered_at) : null;
    const daysSince = (d: Date) => declaredAt ? Math.round((d.getTime() - declaredAt.getTime()) / 86400000) : null;
    const daysAsOf = declaredAt ? daysSince(generatedAt) : null;
    const dayFmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // ── Header ──
    doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(company.name, PAGE_MARGIN, PAGE_MARGIN);
    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
      .text([company.address, [company.city, company.country].filter(Boolean).join(', ')].filter(Boolean).join('  |  '), PAGE_MARGIN, doc.y + 2);

    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text('SHIPMENT REPORT', PAGE_MARGIN, PAGE_MARGIN, { width, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(s.ref_number || s.id, PAGE_MARGIN, doc.y + 2, { width, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
      .text(`Generated: ${generatedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${generatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, PAGE_MARGIN, doc.y + 2, { width, align: 'right' });

    doc.moveTo(PAGE_MARGIN, doc.y + 8).lineTo(PAGE_MARGIN + width, doc.y + 8).strokeColor(INK).lineWidth(1.5).stroke();
    let y = doc.y + 16;

    // ── Metrics strip ──
    const metricW = width / 4;
    const metrics: [string, string][] = [
      ['CURRENT STAGE', stageLabel],
      ['DECLARATION DATE', declaredAt ? dayFmt(declaredAt) : '—'],
      ['DAYS SINCE DECLARATION', `${daysAsOf ?? '—'} Days`],
      ['MODE', String(s.type || s.consignment_type || '—')],
    ];
    doc.rect(PAGE_MARGIN, y, width, 36).strokeColor(INK).lineWidth(1).stroke();
    metrics.forEach(([label, value], i) => {
      const mx = PAGE_MARGIN + i * metricW;
      if (i === 2) doc.rect(mx, y, metricW, 36).fill(INK);
      doc.font('Helvetica').fontSize(7).fillColor(i === 2 ? '#cccccc' : GRAY).text(label, mx + 8, y + 7, { width: metricW - 16 });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(i === 2 ? '#ffffff' : INK).text(value, mx + 8, y + 18, { width: metricW - 16, ellipsis: true });
    });
    y += 50;

    // ── Shipment Overview ──
    y = sectionTitle(doc, 'Shipment Overview', y, width);
    const kvRows: [string, string, string, string][] = [
      ['Goods', String(s.goods_desc || '—'), 'Customer', String(s.customer_name || '—')],
      ['Origin', String(s.port_of_loading || '—'), 'Destination', String(s.port_of_discharge || '—')],
      ['Weight', s.gross_weight_kg ? `${Number(s.gross_weight_kg).toLocaleString('en')} KG` : '—', 'Declared Value', s.cif_value_usd ? `USD ${Number(s.cif_value_usd).toLocaleString('en')}` : '—'],
      ['B/L Number', String(s.bl_number || '—'), 'TANSAD', String(s.tansad_number || '—')],
    ];
    const containers: string[] = Array.isArray(s.container_numbers) ? s.container_numbers : (typeof s.container_numbers === 'string' ? JSON.parse(s.container_numbers || '[]') : []);
    if (s.vessel || containers.length > 0) kvRows.push(['Vessel', String(s.vessel || '—'), 'Containers', containers.length > 0 ? containers.join(', ') : '—']);
    const kvColWidths = [width * 0.14, width * 0.36, width * 0.14, width * 0.36];
    y = drawTable(doc, PAGE_MARGIN, y, kvColWidths, kvRows, { rowHeight: 20, fontSize: 8.5 }) + 12;

    // ── Carbon Footprint ──
    if (s.co2_emissions_kg != null) {
      y = sectionTitle(doc, 'Carbon Footprint (Estimate)', y, width);
      const calc = typeof s.co2_calc_details === 'string' ? (s.co2_calc_details ? JSON.parse(s.co2_calc_details) : null) : s.co2_calc_details;
      const carbonRows: [string, string, string, string][] = [
        ['CO2 Emissions', `${Number(s.co2_emissions_kg).toLocaleString('en')} kg`, 'Credits Saved (est.)', Number(s.carbon_credits_saved ?? 0).toFixed(2)],
      ];
      if (calc) carbonRows.push(['Distance', `${calc.distance_km ?? '—'} km`, 'Mode', String(calc.mode ?? s.type ?? '—')]);
      y = drawTable(doc, PAGE_MARGIN, y, kvColWidths, carbonRows, { rowHeight: 20, fontSize: 8.5 });
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(GRAY)
        .text('GLEC v3.2 / ISO 14083 methodology, computed from route distance and cargo weight. Internal ESG estimate — not a registry-issued or tradeable carbon credit.', PAGE_MARGIN, y + 4, { width });
      y = doc.y + 12;
    }

    // ── Stage Timeline ──
    if (sortedTimeline.length > 0) {
      y = sectionTitle(doc, 'Stage Timeline', y, width);
      const tlRows: (string | number)[][] = [['Date', 'Stage', 'Note', 'Days Since Declaration']];
      for (const t of sortedTimeline) {
        const n = daysSince(new Date(t.entered_at));
        tlRows.push([dayFmt(new Date(t.entered_at)), t.stage, t.note || t.blocker || '', n != null ? `Day ${n}` : '—']);
      }
      const tlColWidths = [width * 0.14, width * 0.22, width * 0.46, width * 0.18];
      y = drawTable(doc, PAGE_MARGIN, y, tlColWidths, tlRows, { header: true, rowHeight: 18, fontSize: 8 });
      if (declaredAt) {
        doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(GRAY)
          .text(`Days Since Declaration is calculated relative to the case initialization date (${dayFmt(declaredAt)}). Report generated at Day ${daysAsOf}.`, PAGE_MARGIN, y + 4, { width });
        y = doc.y + 12;
      } else {
        y += 12;
      }
    }

    // ── Documents ──
    const documents = s.documents || [];
    if (documents.length > 0) {
      y = sectionTitle(doc, 'Documents', y, width);
      const docRows: (string | number)[][] = [['Document', 'Type', 'Status']];
      for (const d of documents) {
        docRows.push([d.filename || d.type, String(d.type || '').toUpperCase(), DOC_STATUS_LABELS[d.status] || d.status || 'Pending']);
      }
      const docColWidths = [width * 0.46, width * 0.27, width * 0.27];
      y = drawTable(doc, PAGE_MARGIN, y, docColWidths, docRows, { header: true, rowHeight: 18, fontSize: 8 });
    }

    doc.moveDown(1.5);
    doc.font('Helvetica').fontSize(7).fillColor(GRAY)
      .text('Generated by Hudumika ClearOS. This is an automated progress report — figures are as recorded at generation time.', PAGE_MARGIN, doc.y, { width });

    doc.end();
  });
}

// ─── Share link (unguessable token, always resolves live) ─────────────────

function newToken(): string {
  return randomBytes(18).toString('base64url');
}

export async function getOrCreateShareToken(tenantId: string, shipmentId: string, userId?: string | null): Promise<{ token: string; url: string | null }> {
  const token = await withTenant(tenantId, async (trx) => {
    const existing = await trx.selectFrom('shipment_report_shares').select('token')
      .where('tenant_id', '=', tenantId).where('shipment_id', '=', shipmentId).executeTakeFirst();
    if (existing) return existing.token;
    const row = await trx.insertInto('shipment_report_shares').values({
      token: newToken(), tenant_id: tenantId, shipment_id: shipmentId, created_by: userId ?? null,
    } as any).returning('token').executeTakeFirstOrThrow();
    return row.token;
  });
  const base = resolvePublicBaseUrl();
  return { token, url: base.trusted && base.url ? `${base.url}/track/shipment-report/${token}` : null };
}

/** Public, unauthenticated — resolves a token to the owning tenant's shipment,
 *  trimmed of internally-facing fields (messages, expenses, listeners,
 *  internal_notes) before returning, since this is customer/anyone-with-the-
 *  link facing. Always re-queries live — no payload snapshot is stored (see
 *  migration 258's header), so "check progress" always shows current state. */
export async function getPublicSharedReport(token: string) {
  const share = await dbPlatform.selectFrom('shipment_report_shares')
    .select(['id', 'tenant_id', 'shipment_id']).where('token', '=', token).executeTakeFirst();
  if (!share) return null;

  const data = await getShipmentReportData(share.tenant_id, share.shipment_id);
  if (!data) return null;

  await withTenant(share.tenant_id, (trx) =>
    trx.updateTable('shipment_report_shares').set(eb => ({ view_count: eb('view_count', '+', 1) }))
      .where('id', '=', share.id).execute()
  );

  const { messages, expenses, listeners, internal_notes, ...shipment } = data.shipment as any;
  return { shipment, company: data.company, stageLabel: data.stageLabel };
}

// ─── Per-customer / per-shipment tri-state toggle ──────────────────────────

/** NULL at shipment level inherits the customer's own setting; NULL at
 *  customer level defaults to enabled. See migration 258's header. */
export async function resolveDailyReportEnabled(tenantId: string, shipmentId: string): Promise<boolean> {
  return withTenant(tenantId, async (trx) => {
    const shipment = await trx.selectFrom('shipment_cases').select(['daily_report_enabled', 'customer_id'])
      .where('id', '=', shipmentId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!shipment) return false;
    if (shipment.daily_report_enabled !== null) return shipment.daily_report_enabled;
    if (!shipment.customer_id) return true;
    const customer = await trx.selectFrom('customers').select('daily_report_enabled')
      .where('id', '=', shipment.customer_id).where('tenant_id', '=', tenantId).executeTakeFirst();
    return customer?.daily_report_enabled ?? true;
  });
}

// ─── Orchestration: one shipment's daily send ──────────────────────────────

export interface DailyReportSendResult {
  shipmentId: string;
  sent: boolean;
  skippedReason?: string;
  emailSent?: boolean;
  whatsappSent?: boolean;
}

export async function sendDailyShipmentReport(tenantId: string, shipmentId: string): Promise<DailyReportSendResult> {
  const data = await getShipmentReportData(tenantId, shipmentId);
  if (!data) return { shipmentId, sent: false, skippedReason: 'Shipment not found' };
  const { shipment: s, stageLabel } = data;

  const email = s.customer_email;
  const whatsapp = (s as any).customer_phone_wa || (s as any).customer_phone;
  if (!email && !whatsapp) {
    return { shipmentId, sent: false, skippedReason: 'Customer has no email or phone on file' };
  }

  const pdf = await renderShipmentReportPdf(tenantId, shipmentId);
  const reportFilename = `${s.ref_number || shipmentId}.pdf`;
  const { storageKey } = await MinioIntegration.uploadShipmentReport(tenantId, shipmentId, reportFilename, pdf);
  const { url } = await getOrCreateShareToken(tenantId, shipmentId);

  // Also file a real copy where staff actually go looking for a shipment's
  // paperwork — Customers ▸ <customer> ▸ <BL/AWB/ref>. This used to be a
  // deliberate exclusion (a report snapshot isn't a customer-uploaded
  // document), reversed by explicit request: every document real to a
  // shipment, daily reports included, belongs in its own Cloud folder.
  // Minio's own shipment-reports/ tree above stays the source of record for
  // the emailed/WhatsApp'd copy — this is an additional, best-effort mirror,
  // named by date so each day's report doesn't overwrite the last.
  const blRef = s.bl_number || s.awb_number || s.ref_number;
  if (blRef) {
    CloudSync.syncShipmentDoc(tenantId, {
      customerId: s.customer_id ?? null,
      shipmentId,
      blRef,
      filename: `Daily Report — ${new Date().toISOString().slice(0, 10)}.pdf`,
      buffer: pdf,
      mime: 'application/pdf',
    }).catch(err => console.error('[Cloud] daily shipment report mirror failed:', err.message));
  }

  let emailSent = false;
  let whatsappSent = false;

  if (email) {
    await MailService.enqueueTemplated(tenantId, 'clearos.daily_shipment_report', email, {
      refNumber: s.ref_number || shipmentId,
      customerName: s.customer_name || 'there',
      stageLabel,
    }, 'clearos', { storageKey, filename: `${s.ref_number || shipmentId}-report.pdf` });
    emailSent = true;
  }

  if (whatsapp && url) {
    const message = `Hudumika ClearOS: today's progress update for shipment ${s.ref_number || shipmentId} — currently at "${stageLabel}". View live status: ${url}`;
    const result = await WhatsAppIntegration.sendMessage(whatsapp, message);
    whatsappSent = result.success;
  }

  return { shipmentId, sent: emailSent || whatsappSent, emailSent, whatsappSent };
}
