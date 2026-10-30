import { withTenant, dbPlatform } from '../db/client.js';
import type {
  PermitCandidate, CapturePermitInput, ClassifyCandidateInput, RegisterCandidateInput,
  PermitCheckResult, PerformCheckInput,
  AppCoverage,
} from '@hudumika/types';

function toISO(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}
function parseJsonb<T>(raw: unknown): T {
  if (typeof raw === 'string') return JSON.parse(raw) as T;
  return (raw ?? {}) as T;
}

function deriveCertValidity(cert: { status: unknown; expiry_date: unknown }): { result: string; reasons: string[] } {
  const status = cert.status as string;
  if (status === 'revoked') return { result: 'revoked', reasons: ['Certificate has been revoked'] };
  if (status === 'expired') return { result: 'expired', reasons: ['Certificate has expired'] };

  const expStr = cert.expiry_date ? String(cert.expiry_date) : null;
  const now = new Date();
  if (expStr) {
    const expDate = new Date(expStr);
    if (expDate.getTime() <= now.getTime()) {
      return { result: 'expired', reasons: [`Certificate expired on ${expStr.slice(0, 10)}`] };
    }
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (expDate.getTime() - now.getTime() <= thirtyDays) {
      return { result: 'expiring', reasons: [`Certificate expiring on ${expStr.slice(0, 10)}`] };
    }
    if (status === 'active') return { result: 'valid', reasons: [] };
  }

  // Active cert with no expiry date: unknown validity — requires review
  if (status === 'active' && !expStr) {
    return { result: 'unknown', reasons: ['No expiry date recorded; validity cannot be determined without perpetual-validity evidence'] };
  }

  return { result: 'pending', reasons: [`Certificate status: ${status}`] };
}

function mapCandidate(r: any): PermitCandidate {
  return {
    id: r.id,
    source_app: r.source_app,
    source_record_type: r.source_record_type,
    source_record_id: r.source_record_id,
    source_attachment_id: r.source_attachment_id,
    source_file_name: r.source_file_name,
    source_file_url: r.source_file_url,
    source_version: r.source_version,
    classification: r.classification,
    confidence: r.confidence ? Number(r.confidence) : null,
    classifier_type: r.classifier_type,
    holder_claim: r.holder_claim,
    issuer_claim: r.issuer_claim,
    jurisdiction_claim: r.jurisdiction_claim,
    permit_number_claim: r.permit_number_claim,
    expiry_claim: r.expiry_claim ? String(r.expiry_claim) : null,
    issued_claim: r.issued_claim ? String(r.issued_claim) : null,
    captured_by: r.captured_by,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at ? toISO(r.reviewed_at) : null,
    review_notes: r.review_notes,
    status: r.status,
    linked_cert_id: r.linked_cert_id,
    linked_cycle_id: r.linked_cycle_id,
    metadata: parseJsonb<Record<string, unknown>>(r.metadata),
    created_at: toISO(r.created_at),
    updated_at: toISO(r.updated_at),
  };
}

function mapCheck(r: any): PermitCheckResult {
  return {
    id: r.id,
    requesting_app: r.requesting_app,
    requesting_record_type: r.requesting_record_type,
    requesting_record_id: r.requesting_record_id,
    check_type: r.check_type,
    entity_id: r.entity_id,
    site_id: r.site_id,
    jurisdiction: r.jurisdiction,
    requirement_code: r.requirement_code,
    cert_id: r.cert_id,
    result: r.result,
    reasons: r.reasons ?? [],
    assurance_level: r.assurance_level,
    rules_version: r.rules_version,
    freshness: r.freshness,
    impact_action: r.impact_action,
    impact_notes: r.impact_notes,
    checked_at: toISO(r.checked_at),
    checked_by: r.checked_by,
    expires_at: r.expires_at ? toISO(r.expires_at) : null,
  };
}

export const PermitCheckService = {

  // ── Capture pipeline ──────────────────────────────────────────────────

  async captureCandidate(tenantId: string, userId: string, input: CapturePermitInput): Promise<PermitCandidate> {
    return withTenant(tenantId, async trx => {
      const r = await trx.insertInto('comply_permit_candidates').values({
        tenant_id: tenantId,
        source_app: input.source_app,
        source_record_type: input.source_record_type ?? null,
        source_record_id: input.source_record_id ?? null,
        source_attachment_id: input.source_attachment_id ?? null,
        source_file_name: input.source_file_name,
        source_file_url: input.source_file_url ?? null,
        holder_claim: input.holder_claim ?? null,
        issuer_claim: input.issuer_claim ?? null,
        jurisdiction_claim: input.jurisdiction_claim ?? null,
        permit_number_claim: input.permit_number_claim ?? null,
        expiry_claim: input.expiry_claim ?? null,
        issued_claim: input.issued_claim ?? null,
        captured_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return mapCandidate(r);
    });
  },

  async listCandidates(tenantId: string, opts?: {
    status?: string; source_app?: string; classification?: string;
  }): Promise<PermitCandidate[]> {
    return withTenant(tenantId, async trx => {
      let q = trx.selectFrom('comply_permit_candidates').selectAll()
        .where('tenant_id', '=', tenantId);
      if (opts?.status) q = q.where('status', '=', opts.status);
      if (opts?.source_app) q = q.where('source_app', '=', opts.source_app);
      if (opts?.classification) q = q.where('classification', '=', opts.classification);
      const rows = await q.orderBy('created_at', 'desc').execute();
      return rows.map(mapCandidate);
    });
  },

  async getCandidate(tenantId: string, id: string): Promise<PermitCandidate | null> {
    return withTenant(tenantId, async trx => {
      const r = await trx.selectFrom('comply_permit_candidates').selectAll()
        .where('tenant_id', '=', tenantId).where('id', '=', id)
        .executeTakeFirst();
      return r ? mapCandidate(r) : null;
    });
  },

  async classifyCandidate(tenantId: string, candidateId: string, userId: string, input: ClassifyCandidateInput): Promise<PermitCandidate> {
    return withTenant(tenantId, async trx => {
      const updates: Record<string, unknown> = {
        classification: input.classification,
        classifier_type: input.classifier_type,
        confidence: input.confidence != null ? String(input.confidence) : null,
        status: input.classification === 'not_permit' ? 'dismissed' :
                input.classification === 'duplicate' ? 'duplicate' :
                input.classification === 'needs_review' ? 'under_review' : 'classified',
        reviewed_by: userId,
        reviewed_at: new Date(),
        updated_at: new Date(),
      };
      if (input.holder_claim !== undefined) updates.holder_claim = input.holder_claim;
      if (input.issuer_claim !== undefined) updates.issuer_claim = input.issuer_claim;
      if (input.jurisdiction_claim !== undefined) updates.jurisdiction_claim = input.jurisdiction_claim;
      if (input.permit_number_claim !== undefined) updates.permit_number_claim = input.permit_number_claim;
      if (input.expiry_claim !== undefined) updates.expiry_claim = input.expiry_claim;
      if (input.issued_claim !== undefined) updates.issued_claim = input.issued_claim;
      if (input.review_notes !== undefined) updates.review_notes = input.review_notes;

      const r = await trx.updateTable('comply_permit_candidates')
        .set(updates)
        .where('id', '=', candidateId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();
      return mapCandidate(r);
    });
  },

  async registerCandidate(tenantId: string, candidateId: string, userId: string, input: RegisterCandidateInput): Promise<PermitCandidate> {
    return withTenant(tenantId, async trx => {
      const r = await trx.updateTable('comply_permit_candidates')
        .set({
          status: 'registered',
          linked_cert_id: input.linked_cert_id ?? null,
          linked_cycle_id: input.linked_cycle_id ?? null,
          reviewed_by: userId,
          reviewed_at: new Date(),
          review_notes: input.review_notes ?? null,
          updated_at: new Date(),
        })
        .where('id', '=', candidateId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();
      return mapCandidate(r);
    });
  },

  async dismissCandidate(tenantId: string, candidateId: string, userId: string, reason?: string): Promise<PermitCandidate> {
    return withTenant(tenantId, async trx => {
      const r = await trx.updateTable('comply_permit_candidates')
        .set({
          status: 'dismissed',
          classification: 'not_permit',
          reviewed_by: userId,
          reviewed_at: new Date(),
          review_notes: reason ?? null,
          updated_at: new Date(),
        })
        .where('id', '=', candidateId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();
      return mapCandidate(r);
    });
  },

  // ── Shared check contract ─────────────────────────────────────────────

  async performCheck(tenantId: string, userId: string, input: PerformCheckInput): Promise<PermitCheckResult> {
    return withTenant(tenantId, async trx => {
      let result: string = 'unknown';
      let reasons: string[] = [];
      let assurance = 'unverified';
      let resolvedCertId: string | null = null;

      if (input.cert_id) {
        const cert = await trx.selectFrom('comply_certificates')
          .select(['id', 'status', 'expiry_date', 'assurance'])
          .where('id', '=', input.cert_id).where('tenant_id', '=', tenantId)
          .executeTakeFirst();

        if (!cert) {
          result = 'missing';
          reasons = ['Certificate not found in this tenant'];
        } else {
          resolvedCertId = cert.id;
          assurance = (cert as any).assurance ?? 'unverified';
          const derived = deriveCertValidity(cert);
          result = derived.result;
          reasons = derived.reasons;
        }
      } else if (input.requirement_code) {
        const certs = await trx.selectFrom('comply_certificates')
          .select(['id', 'status', 'expiry_date', 'assurance'])
          .where('tenant_id', '=', tenantId)
          .where('agency_code', '=', input.requirement_code)
          .execute();

        if (certs.length === 0) {
          result = 'missing';
          reasons = [`No certificate found for requirement ${input.requirement_code}`];
        } else {
          const derived = certs.map(c => ({ ...deriveCertValidity(c), cert: c }));
          const valid = derived.find(d => d.result === 'valid');
          if (valid) {
            result = 'valid';
            assurance = (valid.cert as any).assurance ?? 'unverified';
          } else {
            const expiring = derived.find(d => d.result === 'expiring');
            if (expiring) {
              result = 'expiring';
              assurance = (expiring.cert as any).assurance ?? 'unverified';
              reasons = expiring.reasons;
            } else {
              result = 'expired';
              reasons = ['All certificates expired or revoked'];
            }
          }
        }
      } else {
        result = 'unknown';
        reasons = ['No cert_id or requirement_code provided'];
      }

      const impactAction = result === 'revoked' || result === 'missing' ? 'block' :
                          result === 'expired' || result === 'unknown' ? 'require_review' :
                          result === 'expiring' ? 'warn' : 'none';

      const r = await trx.insertInto('comply_permit_checks').values({
        tenant_id: tenantId,
        requesting_app: input.requesting_app,
        requesting_record_type: input.requesting_record_type ?? null,
        requesting_record_id: input.requesting_record_id ?? null,
        check_type: input.check_type ?? 'status',
        entity_id: input.entity_id ?? null,
        site_id: input.site_id ?? null,
        jurisdiction: input.jurisdiction ?? 'TZ',
        requirement_code: input.requirement_code ?? null,
        cert_id: resolvedCertId,
        result,
        reasons,
        assurance_level: assurance,
        freshness: 'live',
        impact_action: impactAction,
        checked_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return mapCheck(r);
    });
  },

  async listChecks(tenantId: string, opts?: {
    requesting_app?: string; cert_id?: string; entity_id?: string; result?: string;
  }): Promise<PermitCheckResult[]> {
    return withTenant(tenantId, async trx => {
      let q = trx.selectFrom('comply_permit_checks').selectAll()
        .where('tenant_id', '=', tenantId);
      if (opts?.requesting_app) q = q.where('requesting_app', '=', opts.requesting_app);
      if (opts?.cert_id) q = q.where('cert_id', '=', opts.cert_id);
      if (opts?.entity_id) q = q.where('entity_id', '=', opts.entity_id);
      if (opts?.result) q = q.where('result', '=', opts.result);
      const rows = await q.orderBy('checked_at', 'desc').execute();
      return rows.map(mapCheck);
    });
  },

  // ── App coverage register (platform-scoped) ───────────────────────────

  async listAppCoverage(): Promise<AppCoverage[]> {
    const rows = await dbPlatform.selectFrom('comply_app_coverage')
      .selectAll().orderBy('app_id', 'asc').execute();
    return rows.map(r => ({
      ...r,
      last_verified: r.last_verified ? String(r.last_verified) : null,
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    })) as AppCoverage[];
  },

  async getAppCoverage(appId: string): Promise<AppCoverage | null> {
    const r = await dbPlatform.selectFrom('comply_app_coverage')
      .selectAll().where('app_id', '=', appId).executeTakeFirst();
    if (!r) return null;
    return {
      ...r,
      last_verified: r.last_verified ? String(r.last_verified) : null,
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    } as AppCoverage;
  },

  async updateAppCoverage(appId: string, updates: {
    coverage_status?: string; evidence_notes?: string;
    last_verified?: string; verified_by?: string;
  }): Promise<AppCoverage> {
    const vals: Record<string, unknown> = { updated_at: new Date() };
    if (updates.coverage_status) vals.coverage_status = updates.coverage_status;
    if (updates.evidence_notes !== undefined) vals.evidence_notes = updates.evidence_notes;
    if (updates.last_verified !== undefined) vals.last_verified = updates.last_verified;
    if (updates.verified_by !== undefined) vals.verified_by = updates.verified_by;

    const r = await dbPlatform.updateTable('comply_app_coverage')
      .set(vals).where('app_id', '=', appId)
      .returningAll().executeTakeFirstOrThrow();
    return {
      ...r,
      last_verified: r.last_verified ? String(r.last_verified) : null,
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    } as AppCoverage;
  },
};
