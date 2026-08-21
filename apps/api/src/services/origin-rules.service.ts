// Preferential-origin / PTA rules engine + Certificate of Origin issuance
// (M5 of the ClearOS roadmap). See migration 253_origin_rules_and_coo.sql's
// header for exactly what's real, sourced data (EAC's First Schedule
// subset) versus general framework only (AfCFTA — no fabricated per-product
// thresholds). SADC has zero rows: not researched, not "no rules exist."
//
// The eligibility checker only ever auto-decides what the data genuinely
// supports: a VALUE_ADDED rule with a real declared non-originating
// percentage. Everything else (wholly-obtained, specific-process criteria,
// AfCFTA's general framework) comes back NEEDS_REVIEW — a human has to
// confirm the actual production facts, the same way ClearOS already
// insists on a human-recorded selectivity channel rather than inventing
// one (see seal-declaration.service.ts).
import PDFDocument from 'pdfkit';
import { dbPlatform, withTenant } from '../db/client.js';

export interface OriginRule {
  id: string;
  agreementCode: string;
  hsMatch: string;
  description: string;
  criteriaType: 'WHOLLY_OBTAINED' | 'VALUE_ADDED' | 'HEADING_CHANGE' | 'SPECIFIC_PROCESS' | 'GENERAL';
  criteriaText: string;
  maxNonOriginatingPct: number | null;
  sourceCitation: string;
}

function toOriginRule(r: any): OriginRule {
  return {
    id: r.id, agreementCode: r.agreement_code, hsMatch: r.hs_match, description: r.description,
    criteriaType: r.criteria_type, criteriaText: r.criteria_text,
    maxNonOriginatingPct: r.max_non_originating_pct == null ? null : Number(r.max_non_originating_pct),
    sourceCitation: r.source_citation,
  };
}

/** Longest-prefix match against the HS code's digits — a 4-digit heading rule beats its 2-digit chapter rule when both exist. */
export async function findOriginRule(agreementCode: string, hsCode: string): Promise<OriginRule | null> {
  const digits = hsCode.replace(/[.\s]/g, '');
  const rows = await dbPlatform.selectFrom('origin_rules').selectAll()
    .where('agreement_code', '=', agreementCode.toUpperCase())
    .execute();

  const candidates = rows
    .filter((r) => r.hs_match !== 'GENERAL' && digits.startsWith(r.hs_match))
    .sort((a, b) => b.hs_match.length - a.hs_match.length);

  if (candidates.length > 0) return toOriginRule(candidates[0]);

  const general = rows.find((r) => r.hs_match === 'GENERAL');
  return general ? toOriginRule(general) : null;
}

export interface EligibilityInput {
  agreementCode: string;
  hsCode: string;
  nonOriginatingValuePct?: number;
  whollyObtainedConfirmed?: boolean;
}

export interface EligibilityResult {
  status: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'NEEDS_REVIEW' | 'INSUFFICIENT_DATA';
  basis: string;
  rule: OriginRule | null;
}

export async function checkEligibility(input: EligibilityInput): Promise<EligibilityResult> {
  const rule = await findOriginRule(input.agreementCode, input.hsCode);
  if (!rule) {
    return {
      status: 'INSUFFICIENT_DATA',
      basis: `No origin rule on file for HS ${input.hsCode} under ${input.agreementCode.toUpperCase()} in this platform's reference data yet — confirm eligibility directly against the agreement's own schedule.`,
      rule: null,
    };
  }

  if (rule.criteriaType === 'GENERAL') {
    return { status: 'NEEDS_REVIEW', basis: rule.criteriaText, rule };
  }

  if (rule.criteriaType === 'WHOLLY_OBTAINED') {
    if (input.whollyObtainedConfirmed === true) return { status: 'ELIGIBLE', basis: `${rule.criteriaText} Confirmed wholly obtained.`, rule };
    if (input.whollyObtainedConfirmed === false) return { status: 'NOT_ELIGIBLE', basis: `${rule.criteriaText} Confirmed NOT wholly obtained.`, rule };
    return { status: 'NEEDS_REVIEW', basis: `${rule.criteriaText} Confirm whether the goods are genuinely wholly obtained before issuing.`, rule };
  }

  if (rule.criteriaType === 'VALUE_ADDED' && rule.maxNonOriginatingPct != null) {
    if (input.nonOriginatingValuePct == null) {
      return { status: 'NEEDS_REVIEW', basis: `${rule.criteriaText} Enter the declared non-originating material value % to determine eligibility.`, rule };
    }
    const eligible = input.nonOriginatingValuePct <= rule.maxNonOriginatingPct;
    return {
      status: eligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE',
      basis: `${rule.criteriaText} Declared non-originating value: ${input.nonOriginatingValuePct}% (limit ${rule.maxNonOriginatingPct}%).`,
      rule,
    };
  }

  // HEADING_CHANGE / SPECIFIC_PROCESS — whether the actual manufacturing
  // process satisfies this can't be determined from typed data alone.
  return { status: 'NEEDS_REVIEW', basis: `${rule.criteriaText} Confirm the actual manufacturing process meets this criterion before issuing.`, rule };
}

export interface CreateCoOInput {
  subjectType: 'shipment' | 'declaration_item' | 'adhoc';
  subjectId: string | null;
  agreementCode: string;
  hsCode: string;
  countryOfOrigin: string;
  nonOriginatingValuePct?: number;
  whollyObtainedConfirmed?: boolean;
  exporterName?: string; exporterAddress?: string;
  consigneeName?: string; consigneeAddress?: string;
  goodsDescription?: string; invoiceNumber?: string;
}

export async function createCertificateOfOrigin(tenantId: string, userId: string, input: CreateCoOInput) {
  const result = await checkEligibility(input);

  return withTenant(tenantId, (trx) =>
    trx.insertInto('certificates_of_origin').values({
      tenant_id: tenantId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      agreement_code: input.agreementCode.toUpperCase(),
      hs_code: input.hsCode,
      country_of_origin: input.countryOfOrigin.toUpperCase(),
      matched_rule_id: result.rule?.id ?? null,
      eligibility_status: result.status,
      eligibility_basis: result.basis,
      non_originating_value_pct: input.nonOriginatingValuePct ?? null,
      wholly_obtained_confirmed: input.whollyObtainedConfirmed ?? null,
      exporter_name: input.exporterName ?? null,
      exporter_address: input.exporterAddress ?? null,
      consignee_name: input.consigneeName ?? null,
      consignee_address: input.consigneeAddress ?? null,
      goods_description: input.goodsDescription ?? null,
      invoice_number: input.invoiceNumber ?? null,
      created_by: userId,
    }).returningAll().executeTakeFirstOrThrow()
  );
}

export async function listCertificatesOfOrigin(tenantId: string, filters: { subjectId?: string } = {}) {
  return withTenant(tenantId, (trx) => {
    let q = trx.selectFrom('certificates_of_origin').selectAll().where('tenant_id', '=', tenantId);
    if (filters.subjectId) q = q.where('subject_type', '=', 'shipment').where('subject_id', '=', filters.subjectId);
    return q.orderBy('created_at', 'desc').limit(200).execute();
  });
}

export async function getCertificateOfOrigin(tenantId: string, id: string) {
  return withTenant(tenantId, (trx) =>
    trx.selectFrom('certificates_of_origin').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', id)
      .executeTakeFirst()
  );
}

export async function issueCertificateOfOrigin(tenantId: string, id: string, userId: string) {
  const existing = await getCertificateOfOrigin(tenantId, id);
  if (!existing) throw new Error('Certificate of Origin not found');
  if (existing.eligibility_status !== 'ELIGIBLE') {
    throw new Error(`Cannot issue — eligibility status is ${existing.eligibility_status}, not ELIGIBLE. Resolve the eligibility check first.`);
  }
  const certificateNumber = `CoO-${existing.agreement_code}-${new Date().getFullYear()}-${existing.id.slice(0, 8).toUpperCase()}`;

  return withTenant(tenantId, (trx) =>
    trx.updateTable('certificates_of_origin')
      .set({ status: 'issued', issued_by: userId, issued_at: new Date(), certificate_number: certificateNumber, updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', id)
      .returningAll().executeTakeFirstOrThrow()
  );
}

const AGREEMENT_NAMES: Record<string, string> = {
  EAC: 'East African Community', AFCFTA: 'African Continental Free Trade Area', SADC: 'Southern African Development Community',
};

/** A real Certificate of Origin document populated from the recorded determination — not a blank template. */
export async function renderCoOPdf(tenantId: string, id: string): Promise<Buffer> {
  const c = await getCertificateOfOrigin(tenantId, id);
  if (!c) throw new Error('Certificate of Origin not found');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (b) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(14).font('Helvetica-Bold').text('CERTIFICATE OF ORIGIN', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(AGREEMENT_NAMES[c.agreement_code] ?? c.agreement_code, { align: 'center' });
    doc.moveDown(1);

    if (c.certificate_number) {
      doc.font('Helvetica-Bold').fontSize(9).text('Certificate No: ', { continued: true }).font('Helvetica').text(c.certificate_number);
    }
    doc.font('Helvetica-Bold').fontSize(9).text('Status: ', { continued: true }).font('Helvetica').text(c.status.toUpperCase());
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(10).text('1. Exporter');
    doc.font('Helvetica').fontSize(9).text(c.exporter_name || '—');
    if (c.exporter_address) doc.text(c.exporter_address);
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(10).text('2. Consignee');
    doc.font('Helvetica').fontSize(9).text(c.consignee_name || '—');
    if (c.consignee_address) doc.text(c.consignee_address);
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(10).text('3. Goods');
    doc.font('Helvetica').fontSize(9).text(`HS Code: ${c.hs_code}`);
    doc.text(`Description: ${c.goods_description || '—'}`);
    doc.text(`Country of Origin: ${c.country_of_origin}`);
    if (c.invoice_number) doc.text(`Invoice No: ${c.invoice_number}`);
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(10).text('4. Origin Declaration');
    doc.font('Helvetica').fontSize(9).text(`Eligibility: ${c.eligibility_status.replace('_', ' ')}`);
    if (c.eligibility_basis) doc.text(c.eligibility_basis, { align: 'justify' });
    doc.moveDown(1.5);

    doc.font('Helvetica').fontSize(8).text(
      'The undersigned declares that the above details and statements are correct, that all the goods were produced in the country shown, and that they comply with the rules of origin of the agreement named above.',
      { align: 'justify' }
    );
    doc.moveDown(1.5);
    doc.text('Signature: ______________________________');
    doc.moveDown(0.8);
    doc.text('Place and date: ______________________________');

    doc.moveDown(2);
    doc.fontSize(7).fillColor('#888').text(
      `Generated by Hudumika ClearOS — certificate ${c.id} — ${new Date().toISOString()}. Origin criteria sourced from this platform's reference data (see origin_rules) — always confirm against the agreement's own official schedule before relying on this for customs purposes.`,
    );

    doc.end();
  });
}
