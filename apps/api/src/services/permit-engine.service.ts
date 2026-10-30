import { withTenant, dbPlatform } from '../db/client.js';
import type {
  RequirementDefinition, CreateRequirementDefInput,
  FeeDefinition,
  LifecycleCycle, CreateLifecycleCycleInput, UpdateLifecycleCycleInput,
  LifecycleEvidence, AddLifecycleEvidenceInput,
  JurisdictionPack,
} from '@hudumika/types';

function toISO(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function parseJsonb<T>(raw: unknown): T {
  if (typeof raw === 'string') return JSON.parse(raw) as T;
  return (raw ?? {}) as T;
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft:                   ['pending_documents', 'pending_review', 'cancelled'],
  pending_documents:       ['pending_review', 'cancelled'],
  pending_review:          ['submitted', 'cancelled'],
  submitted:               ['under_authority_review', 'rejected', 'cancelled'],
  under_authority_review:  ['approved', 'rejected', 'failed'],
  approved:                ['issued'],
  issued:                  [],
  rejected:                ['draft', 'cancelled'],
  cancelled:               ['draft'],
  failed:                  ['draft'],
};

const EVIDENCE_REQUIRED_STATES = ['approved', 'issued'];

export class LifecycleDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LifecycleDomainError';
  }
}

export const PermitEngineService = {

  // ── Requirement Definitions (platform-scoped via dbPlatform) ────────────

  async listRequirementDefs(opts?: {
    jurisdiction?: string; industry_key?: string; review_state?: string;
  }): Promise<RequirementDefinition[]> {
    let q = dbPlatform.selectFrom('comply_requirement_definitions').selectAll();
    if (opts?.jurisdiction) q = q.where('jurisdiction', '=', opts.jurisdiction);
    if (opts?.industry_key) q = q.where('industry_key', '=', opts.industry_key);
    if (opts?.review_state) q = q.where('review_state', '=', opts.review_state);
    const rows = await q.orderBy('code', 'asc').execute();
    return rows.map(r => ({
      ...r,
      required_evidence: parseJsonb<unknown[]>(r.required_evidence),
      applicability: parseJsonb<Record<string, unknown>>(r.applicability),
      dependencies: r.dependencies ?? [],
      exemptions: parseJsonb<unknown[]>(r.exemptions),
      effective_from: String(r.effective_from),
      effective_to: r.effective_to ? String(r.effective_to) : null,
      reviewed_at: r.reviewed_at ? toISO(r.reviewed_at) : null,
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    })) as RequirementDefinition[];
  },

  async getRequirementDef(id: string): Promise<RequirementDefinition | null> {
    const r = await dbPlatform.selectFrom('comply_requirement_definitions')
      .selectAll().where('id', '=', id).executeTakeFirst();
    if (!r) return null;
    return {
      ...r,
      required_evidence: parseJsonb<unknown[]>(r.required_evidence),
      applicability: parseJsonb<Record<string, unknown>>(r.applicability),
      dependencies: r.dependencies ?? [],
      exemptions: parseJsonb<unknown[]>(r.exemptions),
      effective_from: String(r.effective_from),
      effective_to: r.effective_to ? String(r.effective_to) : null,
      reviewed_at: r.reviewed_at ? toISO(r.reviewed_at) : null,
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    } as RequirementDefinition;
  },

  async createRequirementDef(input: CreateRequirementDefInput): Promise<RequirementDefinition> {
    const r = await dbPlatform.insertInto('comply_requirement_definitions').values({
      code: input.code,
      jurisdiction: input.jurisdiction ?? 'TZ',
      name: input.name,
      description: input.description ?? null,
      legal_instrument: input.legal_instrument ?? null,
      source_url: input.source_url ?? null,
      industry_key: input.industry_key ?? null,
      activity_type: input.activity_type ?? null,
      holder_type: input.holder_type ?? null,
      agency_code: input.agency_code ?? null,
      frequency: input.frequency ?? 'annual',
      mandatory: input.mandatory ?? true,
      required_evidence: JSON.stringify(input.required_evidence ?? []),
      applicability: JSON.stringify(input.applicability ?? {}),
      dependencies: input.dependencies ?? [],
      exemptions: JSON.stringify(input.exemptions ?? []),
      effective_from: input.effective_from ?? new Date().toISOString().slice(0, 10),
      effective_to: input.effective_to ?? null,
    }).returningAll().executeTakeFirstOrThrow();
    return this.getRequirementDef(r.id) as Promise<RequirementDefinition>;
  },

  async supersedeDef(existingId: string, updates: Partial<CreateRequirementDefInput>): Promise<RequirementDefinition> {
    const existing = await this.getRequirementDef(existingId);
    if (!existing) throw new Error('Requirement definition not found');

    const maxRow = await dbPlatform.selectFrom('comply_requirement_definitions')
      .select(dbPlatform.fn.max('version').as('max_v'))
      .where('code', '=', existing.code)
      .where('jurisdiction', '=', existing.jurisdiction)
      .executeTakeFirst();
    const nextVersion = ((maxRow as any)?.max_v ?? existing.version) + 1;

    await dbPlatform.updateTable('comply_requirement_definitions')
      .set({ review_state: 'superseded', updated_at: new Date() })
      .where('id', '=', existingId).execute();

    const r = await dbPlatform.insertInto('comply_requirement_definitions').values({
      code: existing.code,
      jurisdiction: existing.jurisdiction,
      name: updates.name ?? existing.name,
      description: updates.description ?? existing.description ?? null,
      legal_instrument: updates.legal_instrument ?? existing.legal_instrument ?? null,
      source_url: updates.source_url ?? existing.source_url ?? null,
      industry_key: updates.industry_key ?? existing.industry_key ?? null,
      activity_type: updates.activity_type ?? existing.activity_type ?? null,
      holder_type: updates.holder_type ?? existing.holder_type ?? null,
      agency_code: updates.agency_code ?? existing.agency_code ?? null,
      frequency: updates.frequency ?? existing.frequency,
      mandatory: updates.mandatory ?? existing.mandatory,
      required_evidence: JSON.stringify(updates.required_evidence ?? existing.required_evidence),
      applicability: JSON.stringify(updates.applicability ?? existing.applicability),
      dependencies: updates.dependencies ?? existing.dependencies,
      exemptions: JSON.stringify(updates.exemptions ?? existing.exemptions),
      version: nextVersion,
      effective_from: updates.effective_from ?? new Date().toISOString().slice(0, 10),
      effective_to: updates.effective_to ?? null,
    }).returningAll().executeTakeFirstOrThrow();
    return this.getRequirementDef(r.id) as Promise<RequirementDefinition>;
  },

  // ── Fee Definitions ────────────────────────────────────────────────────

  async listFeeDefs(requirementDefId: string): Promise<FeeDefinition[]> {
    const rows = await dbPlatform.selectFrom('comply_fee_definitions')
      .selectAll().where('requirement_def_id', '=', requirementDefId)
      .orderBy('fee_type', 'asc').execute();
    return rows.map(r => ({
      ...r,
      amount: r.amount ? Number(r.amount) : null,
      formula_inputs: parseJsonb<Record<string, unknown>>(r.formula_inputs),
      cap_amount: r.cap_amount ? Number(r.cap_amount) : null,
      effective_from: String(r.effective_from),
      effective_to: r.effective_to ? String(r.effective_to) : null,
      created_at: toISO(r.created_at),
    })) as FeeDefinition[];
  },

  async addFeeDef(requirementDefId: string, input: {
    fee_type: string; name: string; currency?: string;
    amount?: number; formula?: string; formula_inputs?: Record<string, unknown>;
    grace_days?: number; cap_amount?: number;
    effective_from?: string; effective_to?: string; source_reference?: string;
  }): Promise<FeeDefinition> {
    const r = await dbPlatform.insertInto('comply_fee_definitions').values({
      requirement_def_id: requirementDefId,
      fee_type: input.fee_type,
      name: input.name,
      currency: input.currency ?? 'TZS',
      amount: input.amount != null ? String(input.amount) : null,
      formula: input.formula ?? null,
      formula_inputs: JSON.stringify(input.formula_inputs ?? {}),
      grace_days: input.grace_days ?? null,
      cap_amount: input.cap_amount != null ? String(input.cap_amount) : null,
      effective_from: input.effective_from ?? new Date().toISOString().slice(0, 10),
      effective_to: input.effective_to ?? null,
      source_reference: input.source_reference ?? null,
    }).returningAll().executeTakeFirstOrThrow();
    return {
      ...r,
      amount: r.amount ? Number(r.amount) : null,
      formula_inputs: parseJsonb<Record<string, unknown>>(r.formula_inputs),
      cap_amount: r.cap_amount ? Number(r.cap_amount) : null,
      effective_from: String(r.effective_from),
      effective_to: r.effective_to ? String(r.effective_to) : null,
      created_at: toISO(r.created_at),
    } as FeeDefinition;
  },

  // ── Lifecycle Cycles (tenant-scoped) ───────────────────────────────────

  async listCycles(tenantId: string, opts?: {
    status?: string; cycle_type?: string; cert_id?: string; entity_id?: string;
  }): Promise<LifecycleCycle[]> {
    return withTenant(tenantId, async trx => {
      let q = trx.selectFrom('comply_lifecycle_cycles').selectAll()
        .where('tenant_id', '=', tenantId);
      if (opts?.status) q = q.where('status', '=', opts.status);
      if (opts?.cycle_type) q = q.where('cycle_type', '=', opts.cycle_type);
      if (opts?.cert_id) q = q.where('cert_id', '=', opts.cert_id);
      if (opts?.entity_id) q = q.where('entity_id', '=', opts.entity_id);
      const rows = await q.orderBy('created_at', 'desc').execute();
      return rows.map(mapCycle);
    });
  },

  async getCycle(tenantId: string, cycleId: string): Promise<LifecycleCycle | null> {
    return withTenant(tenantId, async trx => {
      const r = await trx.selectFrom('comply_lifecycle_cycles').selectAll()
        .where('tenant_id', '=', tenantId).where('id', '=', cycleId)
        .executeTakeFirst();
      return r ? mapCycle(r) : null;
    });
  },

  async createCycle(tenantId: string, userId: string, input: CreateLifecycleCycleInput): Promise<LifecycleCycle> {
    return withTenant(tenantId, async trx => {
      if (input.cert_id) {
        const cert = await trx.selectFrom('comply_certificates').select('id')
          .where('id', '=', input.cert_id).where('tenant_id', '=', tenantId)
          .executeTakeFirst();
        if (!cert) throw new Error('Certificate not found in this tenant');
      }
      if (input.entity_id) {
        const ent = await trx.selectFrom('tenant_entities').select('id')
          .where('id', '=', input.entity_id).where('tenant_id', '=', tenantId)
          .executeTakeFirst();
        if (!ent) throw new Error('Entity not found in this tenant');
      }
      if (input.site_id) {
        const site = await trx.selectFrom('tenant_sites').select('id')
          .where('id', '=', input.site_id).where('tenant_id', '=', tenantId)
          .executeTakeFirst();
        if (!site) throw new Error('Site not found in this tenant');
      }

      const r = await trx.insertInto('comply_lifecycle_cycles').values({
        tenant_id: tenantId,
        cert_id: input.cert_id ?? null,
        requirement_def_id: input.requirement_def_id ?? null,
        cycle_type: input.cycle_type,
        owner_id: input.owner_id ?? userId,
        delegate_id: input.delegate_id ?? null,
        entity_id: input.entity_id ?? null,
        site_id: input.site_id ?? null,
        jurisdiction: input.jurisdiction ?? 'TZ',
        agency_code: input.agency_code ?? null,
        prerequisites: JSON.stringify(input.prerequisites ?? []),
        deadline: input.deadline ?? null,
        budget_estimate: input.budget_estimate != null ? String(input.budget_estimate) : null,
        budget_currency: input.budget_currency ?? 'TZS',
        created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return mapCycle(r);
    });
  },

  async updateCycle(tenantId: string, cycleId: string, input: UpdateLifecycleCycleInput): Promise<LifecycleCycle> {
    return withTenant(tenantId, async trx => {
      const existing = await trx.selectFrom('comply_lifecycle_cycles')
        .selectAll().where('id', '=', cycleId).where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();

      if (input.status !== undefined) {
        const from = existing.status as string;
        const to = input.status;
        if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
          throw new LifecycleDomainError(`Invalid status transition: ${from} → ${to}`);
        }
        if (EVIDENCE_REQUIRED_STATES.includes(to)) {
          const evCount = await trx.selectFrom('comply_lifecycle_evidence')
            .select(trx.fn.countAll<number>().as('n'))
            .where('cycle_id', '=', cycleId).where('tenant_id', '=', tenantId)
            .executeTakeFirstOrThrow();
          if (Number(evCount.n) === 0) {
            throw new LifecycleDomainError(`Cannot transition to '${to}' without evidence`);
          }
        }
        if (to === 'issued' || to === 'approved') {
          if (!existing.authority_ref && !input.authority_ref) {
            throw new LifecycleDomainError(`Cannot transition to '${to}' without an authority reference`);
          }
        }
        if (to === 'submitted') {
          if (!existing.submission_ref && !input.submission_ref) {
            throw new LifecycleDomainError(`Cannot transition to 'submitted' without a submission reference`);
          }
        }
      }

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (input.status !== undefined) updates.status = input.status;
      if (input.delegate_id !== undefined) updates.delegate_id = input.delegate_id;
      if (input.submission_ref !== undefined) updates.submission_ref = input.submission_ref;
      if (input.submission_date !== undefined) updates.submission_date = input.submission_date;
      if (input.authority_ref !== undefined) updates.authority_ref = input.authority_ref;
      if (input.outcome_date !== undefined) updates.outcome_date = input.outcome_date;
      if (input.outcome_notes !== undefined) updates.outcome_notes = input.outcome_notes;
      if (input.actual_cost !== undefined) updates.actual_cost = String(input.actual_cost);
      if (input.metadata !== undefined) {
        const merged = { ...parseJsonb<Record<string, unknown>>(existing.metadata), ...input.metadata };
        updates.metadata = JSON.stringify(merged);
      }

      const r = await trx.updateTable('comply_lifecycle_cycles')
        .set(updates).where('id', '=', cycleId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();
      return mapCycle(r);
    });
  },

  // ── Lifecycle Evidence ────────────────────────────────────────────────

  async listEvidence(tenantId: string, cycleId: string): Promise<LifecycleEvidence[]> {
    return withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('comply_lifecycle_evidence').selectAll()
        .where('tenant_id', '=', tenantId).where('cycle_id', '=', cycleId)
        .orderBy('created_at', 'asc').execute();
      return rows.map(r => ({
        id: r.id, cycle_id: r.cycle_id,
        file_id: r.file_id, file_name: r.file_name, file_url: r.file_url,
        evidence_type: r.evidence_type as LifecycleEvidence['evidence_type'],
        description: r.description, uploaded_by: r.uploaded_by,
        created_at: toISO(r.created_at),
      }));
    });
  },

  async addEvidence(tenantId: string, cycleId: string, userId: string, input: AddLifecycleEvidenceInput): Promise<LifecycleEvidence> {
    return withTenant(tenantId, async trx => {
      const cycle = await trx.selectFrom('comply_lifecycle_cycles').select('id')
        .where('id', '=', cycleId).where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();

      const r = await trx.insertInto('comply_lifecycle_evidence').values({
        tenant_id: tenantId,
        cycle_id: cycle.id,
        file_id: input.file_id ?? null,
        file_name: input.file_name,
        file_url: input.file_url ?? null,
        evidence_type: input.evidence_type ?? 'document',
        description: input.description ?? null,
        uploaded_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return {
        id: r.id, cycle_id: r.cycle_id,
        file_id: r.file_id, file_name: r.file_name, file_url: r.file_url,
        evidence_type: r.evidence_type as LifecycleEvidence['evidence_type'],
        description: r.description, uploaded_by: r.uploaded_by,
        created_at: toISO(r.created_at),
      };
    });
  },

  // ── Jurisdiction Packs (platform-scoped) ───────────────────────────────

  async listJurisdictionPacks(): Promise<JurisdictionPack[]> {
    const rows = await dbPlatform.selectFrom('comply_jurisdiction_packs')
      .selectAll().orderBy('jurisdiction', 'asc').execute();
    return rows.map(r => ({
      ...r,
      missing_areas: r.missing_areas ?? [],
      last_reviewed: r.last_reviewed ? String(r.last_reviewed) : null,
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    })) as JurisdictionPack[];
  },

  async getJurisdictionPack(jurisdiction: string): Promise<JurisdictionPack | null> {
    const r = await dbPlatform.selectFrom('comply_jurisdiction_packs')
      .selectAll().where('jurisdiction', '=', jurisdiction).executeTakeFirst();
    if (!r) return null;
    return {
      ...r,
      missing_areas: r.missing_areas ?? [],
      last_reviewed: r.last_reviewed ? String(r.last_reviewed) : null,
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    } as JurisdictionPack;
  },

  // ── Applicability check ────────────────────────────────────────────────

  async resolveApplicableRequirements(opts: {
    jurisdiction: string; industry_key?: string; holder_type?: string;
  }): Promise<RequirementDefinition[]> {
    let q = dbPlatform.selectFrom('comply_requirement_definitions').selectAll()
      .where('jurisdiction', '=', opts.jurisdiction)
      .where('review_state', '=', 'published')
      .where(eb => eb.or([
        eb('effective_to', 'is', null),
        eb('effective_to', '>=', new Date().toISOString().slice(0, 10)),
      ]));
    if (opts.industry_key) q = q.where('industry_key', '=', opts.industry_key);
    if (opts.holder_type) q = q.where('holder_type', '=', opts.holder_type);
    const rows = await q.orderBy('code', 'asc').execute();
    return rows.map(r => ({
      ...r,
      required_evidence: parseJsonb<unknown[]>(r.required_evidence),
      applicability: parseJsonb<Record<string, unknown>>(r.applicability),
      dependencies: r.dependencies ?? [],
      exemptions: parseJsonb<unknown[]>(r.exemptions),
      effective_from: String(r.effective_from),
      effective_to: r.effective_to ? String(r.effective_to) : null,
      reviewed_at: r.reviewed_at ? toISO(r.reviewed_at) : null,
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    })) as RequirementDefinition[];
  },
};

function mapCycle(r: any): LifecycleCycle {
  return {
    id: r.id,
    cert_id: r.cert_id,
    requirement_def_id: r.requirement_def_id,
    cycle_type: r.cycle_type,
    status: r.status,
    owner_id: r.owner_id,
    delegate_id: r.delegate_id,
    entity_id: r.entity_id,
    site_id: r.site_id,
    jurisdiction: r.jurisdiction,
    agency_code: r.agency_code,
    prerequisites: parseJsonb<unknown[]>(r.prerequisites),
    deadline: r.deadline ? String(r.deadline) : null,
    budget_estimate: r.budget_estimate ? Number(r.budget_estimate) : null,
    budget_currency: r.budget_currency,
    actual_cost: r.actual_cost ? Number(r.actual_cost) : null,
    submission_ref: r.submission_ref,
    submission_date: r.submission_date ? String(r.submission_date) : null,
    authority_ref: r.authority_ref,
    outcome_date: r.outcome_date ? String(r.outcome_date) : null,
    outcome_notes: r.outcome_notes,
    metadata: parseJsonb<Record<string, unknown>>(r.metadata),
    created_by: r.created_by,
    created_at: toISO(r.created_at),
    updated_at: toISO(r.updated_at),
  };
}
