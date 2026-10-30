import { withTenant, dbPlatform } from '../db/client.js';

function toISO(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}
function parseJsonb<T>(raw: unknown): T {
  if (typeof raw === 'string') return JSON.parse(raw) as T;
  return (raw ?? {}) as T;
}

export const IndustryWorkflowService = {

  // ── Workflow definitions (platform-scoped) ────────────────────────────

  async listWorkflowDefs(opts?: {
    industry_key?: string; app_id?: string; status?: string;
  }) {
    let q = dbPlatform.selectFrom('industry_workflow_definitions').selectAll();
    if (opts?.industry_key) q = q.where('industry_key', '=', opts.industry_key);
    if (opts?.app_id) q = q.where('app_id', '=', opts.app_id);
    if (opts?.status) q = q.where('status', '=', opts.status);
    const rows = await q.orderBy('industry_key', 'asc').orderBy('app_id', 'asc').execute();
    return rows.map(r => ({
      ...r,
      steps: parseJsonb<unknown[]>(r.steps),
      required_apps: r.required_apps ?? [],
      required_permits: r.required_permits ?? [],
      config_schema: parseJsonb<Record<string, unknown>>(r.config_schema),
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    }));
  },

  async getWorkflowDef(id: string) {
    const r = await dbPlatform.selectFrom('industry_workflow_definitions')
      .selectAll().where('id', '=', id).executeTakeFirst();
    if (!r) return null;
    return {
      ...r,
      steps: parseJsonb<unknown[]>(r.steps),
      required_apps: r.required_apps ?? [],
      required_permits: r.required_permits ?? [],
      config_schema: parseJsonb<Record<string, unknown>>(r.config_schema),
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    };
  },

  async createWorkflowDef(input: {
    industry_key: string; app_id: string; workflow_code: string;
    name: string; description?: string; category?: string;
    steps?: unknown[]; required_apps?: string[]; required_permits?: string[];
    config_schema?: Record<string, unknown>;
  }) {
    const r = await dbPlatform.insertInto('industry_workflow_definitions').values({
      industry_key: input.industry_key,
      app_id: input.app_id,
      workflow_code: input.workflow_code,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? 'operational',
      steps: JSON.stringify(input.steps ?? []),
      required_apps: input.required_apps ?? [],
      required_permits: input.required_permits ?? [],
      config_schema: JSON.stringify(input.config_schema ?? {}),
    }).returningAll().executeTakeFirstOrThrow();
    return this.getWorkflowDef(r.id);
  },

  // ── App × industry matrix (platform-scoped) ───────────────────────────

  async listMatrix(opts?: { industry_key?: string; app_id?: string; status?: string }) {
    let q = dbPlatform.selectFrom('industry_app_matrix').selectAll();
    if (opts?.industry_key) q = q.where('industry_key', '=', opts.industry_key);
    if (opts?.app_id) q = q.where('app_id', '=', opts.app_id);
    if (opts?.status) q = q.where('status', '=', opts.status);
    const rows = await q.orderBy('industry_key', 'asc').orderBy('app_id', 'asc').execute();
    return rows.map(r => ({
      ...r,
      last_verified: r.last_verified ? String(r.last_verified) : null,
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    }));
  },

  async getMatrixEntry(industryKey: string, appId: string) {
    const r = await dbPlatform.selectFrom('industry_app_matrix').selectAll()
      .where('industry_key', '=', industryKey).where('app_id', '=', appId)
      .executeTakeFirst();
    if (!r) return null;
    return {
      ...r,
      last_verified: r.last_verified ? String(r.last_verified) : null,
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    };
  },

  async updateMatrixEntry(industryKey: string, appId: string, updates: {
    status?: string; evidence_notes?: string; last_verified?: string; verified_by?: string;
  }) {
    const vals: Record<string, unknown> = { updated_at: new Date() };
    if (updates.status) vals.status = updates.status;
    if (updates.evidence_notes !== undefined) vals.evidence_notes = updates.evidence_notes;
    if (updates.last_verified !== undefined) vals.last_verified = updates.last_verified;
    if (updates.verified_by !== undefined) vals.verified_by = updates.verified_by;

    const r = await dbPlatform.updateTable('industry_app_matrix')
      .set(vals).where('industry_key', '=', industryKey).where('app_id', '=', appId)
      .returningAll().executeTakeFirstOrThrow();
    return {
      ...r,
      last_verified: r.last_verified ? String(r.last_verified) : null,
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    };
  },

  // ── Tenant workflow instances (tenant-scoped) ──────────────────────────

  async listInstances(tenantId: string, opts?: {
    industry_key?: string; app_id?: string; status?: string;
  }) {
    return withTenant(tenantId, async trx => {
      let q = trx.selectFrom('tenant_workflow_instances').selectAll()
        .where('tenant_id', '=', tenantId);
      if (opts?.industry_key) q = q.where('industry_key', '=', opts.industry_key);
      if (opts?.app_id) q = q.where('app_id', '=', opts.app_id);
      if (opts?.status) q = q.where('status', '=', opts.status);
      const rows = await q.orderBy('created_at', 'desc').execute();
      return rows.map(r => ({
        ...r,
        config: parseJsonb<Record<string, unknown>>(r.config),
        created_at: toISO(r.created_at),
        updated_at: toISO(r.updated_at),
      }));
    });
  },

  async createInstance(tenantId: string, userId: string, input: {
    workflow_def_id?: string; industry_key: string; app_id: string;
    workflow_code: string; name: string; config?: Record<string, unknown>;
    entity_id?: string; site_id?: string;
  }) {
    return withTenant(tenantId, async trx => {
      if (input.entity_id) {
        const ent = await trx.selectFrom('tenant_entities').select('id')
          .where('id', '=', input.entity_id).where('tenant_id', '=', tenantId)
          .executeTakeFirst();
        if (!ent) throw new Error('Entity not found in this tenant');
      }

      const r = await trx.insertInto('tenant_workflow_instances').values({
        tenant_id: tenantId,
        workflow_def_id: input.workflow_def_id ?? null,
        industry_key: input.industry_key,
        app_id: input.app_id,
        workflow_code: input.workflow_code,
        name: input.name,
        config: JSON.stringify(input.config ?? {}),
        entity_id: input.entity_id ?? null,
        site_id: input.site_id ?? null,
        created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return {
        ...r,
        config: parseJsonb<Record<string, unknown>>(r.config),
        created_at: toISO(r.created_at),
        updated_at: toISO(r.updated_at),
      };
    });
  },

  // ── Workflow transactions (tenant-scoped) ──────────────────────────────

  async recordTransaction(tenantId: string, userId: string, input: {
    workflow_instance_id: string; step_code: string; step_name: string;
    source_app: string; target_app?: string; status?: string;
    input_data?: Record<string, unknown>; output_data?: Record<string, unknown>;
    source_record_type?: string; source_record_id?: string;
    target_record_type?: string; target_record_id?: string;
  }) {
    return withTenant(tenantId, async trx => {
      const inst = await trx.selectFrom('tenant_workflow_instances').select('id')
        .where('id', '=', input.workflow_instance_id).where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();

      const r = await trx.insertInto('workflow_transactions').values({
        tenant_id: tenantId,
        workflow_instance_id: inst.id,
        step_code: input.step_code,
        step_name: input.step_name,
        source_app: input.source_app,
        target_app: input.target_app ?? null,
        status: input.status ?? 'pending',
        input_data: JSON.stringify(input.input_data ?? {}),
        output_data: JSON.stringify(input.output_data ?? {}),
        source_record_type: input.source_record_type ?? null,
        source_record_id: input.source_record_id ?? null,
        target_record_type: input.target_record_type ?? null,
        target_record_id: input.target_record_id ?? null,
        started_at: input.status === 'in_progress' ? new Date() : null,
        completed_at: input.status === 'completed' ? new Date() : null,
        executed_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return {
        ...r,
        input_data: parseJsonb<Record<string, unknown>>(r.input_data),
        output_data: parseJsonb<Record<string, unknown>>(r.output_data),
        started_at: r.started_at ? toISO(r.started_at) : null,
        completed_at: r.completed_at ? toISO(r.completed_at) : null,
        created_at: toISO(r.created_at),
      };
    });
  },

  async listTransactions(tenantId: string, instanceId: string) {
    return withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('workflow_transactions').selectAll()
        .where('tenant_id', '=', tenantId)
        .where('workflow_instance_id', '=', instanceId)
        .orderBy('created_at', 'asc').execute();
      return rows.map(r => ({
        ...r,
        input_data: parseJsonb<Record<string, unknown>>(r.input_data),
        output_data: parseJsonb<Record<string, unknown>>(r.output_data),
        started_at: r.started_at ? toISO(r.started_at) : null,
        completed_at: r.completed_at ? toISO(r.completed_at) : null,
        created_at: toISO(r.created_at),
      }));
    });
  },

  async updateTransactionStatus(tenantId: string, txnId: string, status: string, output?: Record<string, unknown>) {
    return withTenant(tenantId, async trx => {
      const updates: Record<string, unknown> = { status };
      if (status === 'completed') updates.completed_at = new Date();
      if (status === 'in_progress') updates.started_at = new Date();
      if (output) updates.output_data = JSON.stringify(output);

      const r = await trx.updateTable('workflow_transactions')
        .set(updates)
        .where('id', '=', txnId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();
      return {
        ...r,
        input_data: parseJsonb<Record<string, unknown>>(r.input_data),
        output_data: parseJsonb<Record<string, unknown>>(r.output_data),
        started_at: r.started_at ? toISO(r.started_at) : null,
        completed_at: r.completed_at ? toISO(r.completed_at) : null,
        created_at: toISO(r.created_at),
      };
    });
  },
};
