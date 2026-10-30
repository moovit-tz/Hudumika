import { withTenant, dbPlatform } from '../db/client.js';

function toISO(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}
function parseJsonb<T>(raw: unknown): T {
  if (typeof raw === 'string') return JSON.parse(raw) as T;
  return (raw ?? {}) as T;
}

export const LaunchPlannerService = {

  // ── Launch cases ────────────────────────────────────────────────────────

  async createCase(tenantId: string, userId: string, input: {
    title: string; description?: string; entity_id?: string;
    industries?: string[]; jurisdictions?: string[]; target_date?: string;
  }) {
    return withTenant(tenantId, async trx => {
      if (input.entity_id) {
        const ent = await trx.selectFrom('tenant_entities').select('id')
          .where('id', '=', input.entity_id).where('tenant_id', '=', tenantId)
          .executeTakeFirst();
        if (!ent) throw new Error('Entity not found in this tenant');
      }

      const r = await trx.insertInto('launch_cases').values({
        tenant_id: tenantId,
        entity_id: input.entity_id ?? null,
        title: input.title,
        description: input.description ?? null,
        industries: input.industries ?? [],
        jurisdictions: input.jurisdictions ?? ['TZ'],
        target_date: input.target_date ?? null,
        created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return this._mapCase(r);
    });
  },

  async listCases(tenantId: string, opts?: { status?: string }) {
    return withTenant(tenantId, async trx => {
      let q = trx.selectFrom('launch_cases').selectAll()
        .where('tenant_id', '=', tenantId);
      if (opts?.status) q = q.where('status', '=', opts.status);
      const rows = await q.orderBy('created_at', 'desc').execute();
      return rows.map(r => this._mapCase(r));
    });
  },

  async getCase(tenantId: string, id: string) {
    return withTenant(tenantId, async trx => {
      const r = await trx.selectFrom('launch_cases').selectAll()
        .where('tenant_id', '=', tenantId).where('id', '=', id)
        .executeTakeFirst();
      return r ? this._mapCase(r) : null;
    });
  },

  async updateCaseStatus(tenantId: string, id: string, status: string, userId?: string) {
    return withTenant(tenantId, async trx => {
      const updates: Record<string, unknown> = { status, updated_at: new Date() };
      if (status === 'launched') updates.actual_launch_date = new Date();
      if (status === 'in_progress' && userId) {
        updates.approved_by = userId;
        updates.approved_at = new Date();
      }
      const r = await trx.updateTable('launch_cases').set(updates)
        .where('id', '=', id).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();
      return this._mapCase(r);
    });
  },

  // ── Sites ───────────────────────────────────────────────────────────────

  async addSite(tenantId: string, caseId: string, input: {
    site_name: string; site_type?: string; jurisdiction?: string;
    address?: string; site_id?: string;
  }) {
    return withTenant(tenantId, async trx => {
      const lc = await trx.selectFrom('launch_cases').select('id')
        .where('id', '=', caseId).where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();
      const r = await trx.insertInto('launch_case_sites').values({
        tenant_id: tenantId,
        launch_case_id: lc.id,
        site_name: input.site_name,
        site_type: input.site_type ?? 'office',
        jurisdiction: input.jurisdiction ?? 'TZ',
        address: input.address ?? null,
        site_id: input.site_id ?? null,
      }).returningAll().executeTakeFirstOrThrow();
      return { ...r, metadata: parseJsonb<Record<string, unknown>>(r.metadata), created_at: toISO(r.created_at) };
    });
  },

  async listSites(tenantId: string, caseId: string) {
    return withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('launch_case_sites').selectAll()
        .where('tenant_id', '=', tenantId).where('launch_case_id', '=', caseId)
        .orderBy('created_at', 'asc').execute();
      return rows.map(r => ({ ...r, metadata: parseJsonb<Record<string, unknown>>(r.metadata), created_at: toISO(r.created_at) }));
    });
  },

  // ── Products/activities ─────────────────────────────────────────────────

  async addProduct(tenantId: string, caseId: string, input: {
    product_name: string; product_type?: string; hs_code?: string;
    industry_key?: string; jurisdiction?: string; requires_permits?: boolean;
  }) {
    return withTenant(tenantId, async trx => {
      const lc = await trx.selectFrom('launch_cases').select('id')
        .where('id', '=', caseId).where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();
      const r = await trx.insertInto('launch_case_products').values({
        tenant_id: tenantId,
        launch_case_id: lc.id,
        product_name: input.product_name,
        product_type: input.product_type ?? 'product',
        hs_code: input.hs_code ?? null,
        industry_key: input.industry_key ?? null,
        jurisdiction: input.jurisdiction ?? 'TZ',
        requires_permits: input.requires_permits ?? true,
      }).returningAll().executeTakeFirstOrThrow();
      return { ...r, metadata: parseJsonb<Record<string, unknown>>(r.metadata), created_at: toISO(r.created_at) };
    });
  },

  async listProducts(tenantId: string, caseId: string) {
    return withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('launch_case_products').selectAll()
        .where('tenant_id', '=', tenantId).where('launch_case_id', '=', caseId)
        .orderBy('created_at', 'asc').execute();
      return rows.map(r => ({ ...r, metadata: parseJsonb<Record<string, unknown>>(r.metadata), created_at: toISO(r.created_at) }));
    });
  },

  // ── Plan items (resolved requirements) ──────────────────────────────────

  async addPlanItem(tenantId: string, caseId: string, input: {
    title: string; description?: string; category?: string;
    priority?: number; jurisdiction?: string; authority?: string;
    legal_basis?: string; estimated_cost?: number; currency?: string;
    estimated_days?: number; deadline?: string; owner_user_id?: string;
    requirement_def_id?: string; linked_cert_id?: string;
    linked_cycle_id?: string; dependency_ids?: string[];
  }) {
    return withTenant(tenantId, async trx => {
      const lc = await trx.selectFrom('launch_cases').select('id')
        .where('id', '=', caseId).where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();
      const r = await trx.insertInto('launch_plan_items').values({
        tenant_id: tenantId,
        launch_case_id: lc.id,
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? 'permit',
        priority: input.priority ?? 50,
        jurisdiction: input.jurisdiction ?? 'TZ',
        authority: input.authority ?? null,
        legal_basis: input.legal_basis ?? null,
        estimated_cost: input.estimated_cost ?? null,
        currency: input.currency ?? 'TZS',
        estimated_days: input.estimated_days ?? null,
        deadline: input.deadline ?? null,
        owner_user_id: input.owner_user_id ?? null,
        requirement_def_id: input.requirement_def_id ?? null,
        linked_cert_id: input.linked_cert_id ?? null,
        linked_cycle_id: input.linked_cycle_id ?? null,
        dependency_ids: input.dependency_ids ?? [],
      }).returningAll().executeTakeFirstOrThrow();
      return this._mapPlanItem(r);
    });
  },

  async listPlanItems(tenantId: string, caseId: string, opts?: {
    status?: string; category?: string;
  }) {
    return withTenant(tenantId, async trx => {
      let q = trx.selectFrom('launch_plan_items').selectAll()
        .where('tenant_id', '=', tenantId).where('launch_case_id', '=', caseId);
      if (opts?.status) q = q.where('status', '=', opts.status);
      if (opts?.category) q = q.where('category', '=', opts.category);
      const rows = await q.orderBy('priority', 'desc').orderBy('created_at', 'asc').execute();
      return rows.map(r => this._mapPlanItem(r));
    });
  },

  async updatePlanItem(tenantId: string, itemId: string, updates: {
    status?: string; actual_cost?: number; evidence_notes?: string;
    exemption_reason?: string; exemption_approved_by?: string;
    owner_user_id?: string; linked_cert_id?: string;
    linked_cycle_id?: string; linked_task_id?: string;
  }) {
    return withTenant(tenantId, async trx => {
      const vals: Record<string, unknown> = { updated_at: new Date() };
      if (updates.status) {
        vals.status = updates.status;
        if (updates.status === 'in_progress') vals.started_at = new Date();
        if (updates.status === 'completed' || updates.status === 'approved') vals.completed_at = new Date();
      }
      if (updates.actual_cost !== undefined) vals.actual_cost = updates.actual_cost;
      if (updates.evidence_notes !== undefined) vals.evidence_notes = updates.evidence_notes;
      if (updates.exemption_reason !== undefined) vals.exemption_reason = updates.exemption_reason;
      if (updates.exemption_approved_by !== undefined) vals.exemption_approved_by = updates.exemption_approved_by;
      if (updates.owner_user_id !== undefined) vals.owner_user_id = updates.owner_user_id;
      if (updates.linked_cert_id !== undefined) vals.linked_cert_id = updates.linked_cert_id;
      if (updates.linked_cycle_id !== undefined) vals.linked_cycle_id = updates.linked_cycle_id;
      if (updates.linked_task_id !== undefined) vals.linked_task_id = updates.linked_task_id;

      const r = await trx.updateTable('launch_plan_items').set(vals)
        .where('id', '=', itemId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();
      return this._mapPlanItem(r);
    });
  },

  // ── Readiness computation ───────────────────────────────────────────────

  async computeReadiness(tenantId: string, caseId: string) {
    return withTenant(tenantId, async trx => {
      const items = await trx.selectFrom('launch_plan_items')
        .select(['status', 'priority']).where('tenant_id', '=', tenantId)
        .where('launch_case_id', '=', caseId).execute();

      if (items.length === 0) return { score: 0, total: 0, completed: 0, blocked: 0, pending: 0 };

      const completed = items.filter(i => ['completed', 'approved', 'exempted', 'not_applicable'].includes(i.status));
      const blocked = items.filter(i => i.status === 'blocked' || i.status === 'failed');
      const pending = items.filter(i => ['pending', 'in_progress', 'submitted'].includes(i.status));

      const score = items.length > 0 ? Math.round((completed.length / items.length) * 10000) / 100 : 0;

      await trx.updateTable('launch_cases')
        .set({ overall_readiness: score, updated_at: new Date() })
        .where('id', '=', caseId).where('tenant_id', '=', tenantId).execute();

      return {
        score,
        total: items.length,
        completed: completed.length,
        blocked: blocked.length,
        pending: pending.length,
      };
    });
  },

  // ── Snapshots ───────────────────────────────────────────────────────────

  async takeSnapshot(tenantId: string, caseId: string, userId: string, opts?: {
    snapshot_type?: string; label?: string;
  }) {
    return withTenant(tenantId, async trx => {
      const items = await trx.selectFrom('launch_plan_items').selectAll()
        .where('tenant_id', '=', tenantId).where('launch_case_id', '=', caseId).execute();

      const completed = items.filter(i => ['completed', 'approved', 'exempted', 'not_applicable'].includes(i.status));
      const blocked = items.filter(i => i.status === 'blocked' || i.status === 'failed');
      const score = items.length > 0 ? Math.round((completed.length / items.length) * 10000) / 100 : 0;

      const r = await trx.insertInto('launch_plan_snapshots').values({
        tenant_id: tenantId,
        launch_case_id: caseId,
        snapshot_type: opts?.snapshot_type ?? 'manual',
        label: opts?.label ?? null,
        readiness_score: score,
        item_count: items.length,
        completed_count: completed.length,
        blocked_count: blocked.length,
        snapshot_data: JSON.stringify(items.map(i => ({
          id: i.id, title: i.title, status: i.status, category: i.category,
          priority: i.priority, estimated_cost: i.estimated_cost, actual_cost: i.actual_cost,
        }))),
        created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return {
        ...r,
        readiness_score: r.readiness_score != null ? Number(r.readiness_score) : null,
        snapshot_data: parseJsonb<unknown[]>(r.snapshot_data),
        created_at: toISO(r.created_at),
      };
    });
  },

  async listSnapshots(tenantId: string, caseId: string) {
    return withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('launch_plan_snapshots').selectAll()
        .where('tenant_id', '=', tenantId).where('launch_case_id', '=', caseId)
        .orderBy('created_at', 'desc').execute();
      return rows.map(r => ({
        ...r,
        readiness_score: r.readiness_score != null ? Number(r.readiness_score) : null,
        snapshot_data: parseJsonb<unknown[]>(r.snapshot_data),
        created_at: toISO(r.created_at),
      }));
    });
  },

  // ── Resolve applicable requirements into plan items ─────────────────────

  async resolveRequirements(tenantId: string, caseId: string, userId: string) {
    return withTenant(tenantId, async trx => {
      const lc = await trx.selectFrom('launch_cases').selectAll()
        .where('id', '=', caseId).where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();

      const jurisdictions = (lc.jurisdictions as string[]) ?? ['TZ'];
      const industries = (lc.industries as string[]) ?? [];

      const reqs = await dbPlatform.selectFrom('comply_requirement_definitions').selectAll()
        .where('review_state', '=', 'published')
        .where('jurisdiction', 'in', jurisdictions.length > 0 ? jurisdictions : ['TZ'])
        .execute();

      const existing = await trx.selectFrom('launch_plan_items')
        .select('requirement_def_id')
        .where('tenant_id', '=', tenantId).where('launch_case_id', '=', caseId)
        .where('requirement_def_id', 'is not', null)
        .execute();
      const existingDefIds = new Set(existing.map(e => e.requirement_def_id));

      let created = 0;
      for (const req of reqs) {
        if (existingDefIds.has(req.id)) continue;

        await trx.insertInto('launch_plan_items').values({
          tenant_id: tenantId,
          launch_case_id: caseId,
          requirement_def_id: req.id,
          title: req.name,
          description: req.description ?? null,
          category: 'permit',
          jurisdiction: req.jurisdiction,
          authority: req.agency_code ?? null,
          legal_basis: req.legal_instrument ?? null,
          priority: 50,
        }).execute();
        created++;
      }

      if (created > 0) {
        await trx.updateTable('launch_cases')
          .set({ status: 'planning', updated_at: new Date() })
          .where('id', '=', caseId).where('tenant_id', '=', tenantId).execute();
      }

      return { resolved: created, total_requirements: reqs.length };
    });
  },

  // ── Internal helpers ────────────────────────────────────────────────────

  _mapCase(r: any) {
    return {
      ...r,
      industries: r.industries ?? [],
      jurisdictions: r.jurisdictions ?? [],
      overall_readiness: r.overall_readiness != null ? Number(r.overall_readiness) : 0,
      metadata: parseJsonb<Record<string, unknown>>(r.metadata),
      approved_at: r.approved_at ? toISO(r.approved_at) : null,
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
      target_date: r.target_date ? String(r.target_date) : null,
      actual_launch_date: r.actual_launch_date ? String(r.actual_launch_date) : null,
    };
  },

  _mapPlanItem(r: any) {
    return {
      ...r,
      estimated_cost: r.estimated_cost != null ? Number(r.estimated_cost) : null,
      actual_cost: r.actual_cost != null ? Number(r.actual_cost) : null,
      dependency_ids: r.dependency_ids ?? [],
      metadata: parseJsonb<Record<string, unknown>>(r.metadata),
      deadline: r.deadline ? String(r.deadline) : null,
      started_at: r.started_at ? toISO(r.started_at) : null,
      completed_at: r.completed_at ? toISO(r.completed_at) : null,
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    };
  },
};
