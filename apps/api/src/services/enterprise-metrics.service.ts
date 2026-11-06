import { dbPlatform, withTenant, type TenantDb } from '../db/client.js';
import { sql } from 'kysely';

export class EnterpriseMetricsService {

  // ── Platform metrics (SUPER_ADMIN only) ─────────────────────────

  static async computePlatformSnapshot(metricType: string = 'daily') {
    const today = new Date().toISOString().slice(0, 10);

    const tenants = await dbPlatform.selectFrom('tenants')
      .select(sql<number>`count(*)`.as('total'))
      .select(sql<number>`count(*) filter (where active = true)`.as('active'))
      .executeTakeFirstOrThrow();

    const users = await dbPlatform.selectFrom('users')
      .select(sql<number>`count(*)`.as('total'))
      .executeTakeFirstOrThrow();

    const permits = await dbPlatform.selectFrom('comply_certificates' as any)
      .select(sql<number>`count(*)`.as('total'))
      .select(sql<number>`count(*) filter (where status = 'active' and expiry_date is not null and expiry_date > now() and expiry_date <= now() + interval '30 days')`.as('expiring'))
      .executeTakeFirstOrThrow();

    const jobs = await dbPlatform.selectFrom('durable_jobs' as any)
      .select(sql<number>`count(*) filter (where status in ('pending', 'retrying'))`.as('queue'))
      .executeTakeFirstOrThrow();

    const totalPermits = Number((permits as any).total);
    const permitsExpiring = Number((permits as any).expiring);
    const queueDepth = Number((jobs as any).queue);

    const activeUsers = await dbPlatform.selectFrom('user_presence' as any)
      .select(sql<number>`count(*)`.as('total'))
      .where('last_active_at', '>', sql`now() - interval '7 days'`)
      .executeTakeFirstOrThrow();
    const activeUsers7d = Number((activeUsers as any).total);

    const subs = await dbPlatform.selectFrom('tenants')
      .select(sql<number>`count(*)`.as('total'))
      .select(sql<number>`count(*) filter (where plan <> 'starter')`.as('paid'))
      .where('active', '=', true)
      .executeTakeFirstOrThrow();
    const totalSubscriptions = Number(subs.total);
    const paidSubscriptions = Number((subs as any).paid);

    const mrr = await (dbPlatform.selectFrom('tenants' as any)
      .innerJoin('packages' as any, 'packages.code', 'tenants.plan') as any)
      .select(sql<number>`coalesce(sum(packages.monthly_price), 0)`.as('mrr'))
      .where('tenants.active', '=', true)
      .where('tenants.plan', '<>', 'starter')
      .executeTakeFirstOrThrow();
    const mrrAmount = Number((mrr as any).mrr);

    const providers = await dbPlatform.selectFrom('marketplace_provider_listings' as any)
      .select(sql<number>`count(distinct provider_tenant_id)`.as('total'))
      .where('status', '=', 'published')
      .executeTakeFirstOrThrow();
    const providerCount = Number((providers as any).total);

    const engagements = await dbPlatform.selectFrom('marketplace_enquiries' as any)
      .select(sql<number>`count(*)`.as('total'))
      .where('status', 'in', ['pending', 'accepted', 'in_progress'])
      .executeTakeFirstOrThrow();
    const marketplaceEngagements = Number((engagements as any).total);

    const openTickets = await dbPlatform.selectFrom('support_tickets' as any)
      .select(sql<number>`count(*)`.as('total'))
      .where('status', 'in', ['OPEN', 'IN_PROGRESS', 'PENDING'])
      .executeTakeFirstOrThrow();
    const supportTicketsOpen = Number((openTickets as any).total);

    const row = await dbPlatform.insertInto('platform_metric_snapshots' as any)
      .values({
        snapshot_date: today,
        metric_type: metricType,
        total_tenants: Number(tenants.total),
        active_tenants: Number(tenants.active),
        total_users: Number(users.total),
        active_users_7d: activeUsers7d,
        total_permits: totalPermits,
        permits_expiring_30d: permitsExpiring,
        total_subscriptions: totalSubscriptions,
        paid_subscriptions: paidSubscriptions,
        mrr_amount: mrrAmount,
        provider_count: providerCount,
        marketplace_engagements: marketplaceEngagements,
        support_tickets_open: supportTicketsOpen,
        queue_depth: queueDepth,
        infrastructure: JSON.stringify({}),
      } as any)
      .onConflict((oc) => oc.columns(['snapshot_date', 'metric_type'] as any).doUpdateSet({
        total_tenants: Number(tenants.total),
        active_tenants: Number(tenants.active),
        total_users: Number(users.total),
        active_users_7d: activeUsers7d,
        total_permits: totalPermits,
        permits_expiring_30d: permitsExpiring,
        total_subscriptions: totalSubscriptions,
        paid_subscriptions: paidSubscriptions,
        mrr_amount: mrrAmount,
        provider_count: providerCount,
        marketplace_engagements: marketplaceEngagements,
        support_tickets_open: supportTicketsOpen,
        queue_depth: queueDepth,
        computed_at: new Date(),
      } as any))
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...(row as any),
      mrr_amount: Number((row as any).mrr_amount),
    };
  }

  static async listPlatformSnapshots(filters?: { metric_type?: string; limit?: number }) {
    let q = dbPlatform.selectFrom('platform_metric_snapshots' as any)
      .selectAll();
    if (filters?.metric_type) q = q.where('metric_type', '=', filters.metric_type);
    const rows = await q.orderBy('snapshot_date', 'desc')
      .limit(filters?.limit ?? 30)
      .execute();
    return rows.map((r: any) => ({
      ...r,
      mrr_amount: Number(r.mrr_amount),
    }));
  }

  // ── Tenant metrics ──────────────────────────────────────────────

  static async computeTenantSnapshot(tenantId: string, metricType: string = 'daily') {
    const today = new Date().toISOString().slice(0, 10);

    return withTenant(tenantId, async (db: TenantDb) => {
      const users = await db.selectFrom('users')
        .select(sql<number>`count(*)`.as('total'))
        .where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();

      const entities = await db.selectFrom('tenant_entities')
        .select(sql<number>`count(*)`.as('total'))
        .where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();

      const sites = await db.selectFrom('tenant_sites')
        .select(sql<number>`count(*)`.as('total'))
        .where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();

      const certs = await db.selectFrom('comply_certificates')
        .select(sql<number>`count(*)`.as('total'))
        .select(sql<number>`count(*) filter (where status = 'active')`.as('active'))
        .select(sql<number>`count(*) filter (where status = 'expired' or (expiry_date is not null and expiry_date < now()))`.as('expired'))
        .select(sql<number>`count(*) filter (where status = 'active' and expiry_date is not null and expiry_date > now() and expiry_date <= now() + interval '30 days')`.as('expiring'))
        .where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();

      const pendingCycles = await db.selectFrom('comply_lifecycle_cycles')
        .select(sql<number>`count(*)`.as('total'))
        .where('tenant_id', '=', tenantId)
        .where('status', 'in', ['draft', 'pending_documents', 'pending_review', 'submitted', 'under_authority_review'])
        .executeTakeFirstOrThrow();

      const blockerChecks = await db.selectFrom('comply_permit_checks')
        .select(sql<number>`count(*)`.as('total'))
        .where('tenant_id', '=', tenantId)
        .where('result', 'in', ['missing', 'revoked', 'expired'])
        .executeTakeFirstOrThrow();

      const userCount = Number(users.total);
      const entityCount = Number(entities.total);
      const siteCount = Number(sites.total);
      const permitCount = Number(certs.total);
      const permitsActive = Number(certs.active);
      const permitsExpiring = Number(certs.expiring);
      const permitsExpired = Number(certs.expired);
      const renewalPending = Number(pendingCycles.total);
      const blockerCount = Number(blockerChecks.total);

      const row = await db.insertInto('tenant_metric_snapshots')
        .values({
          tenant_id: tenantId,
          snapshot_date: today,
          metric_type: metricType,
          user_count: userCount,
          entity_count: entityCount,
          site_count: siteCount,
          permit_count: permitCount,
          permits_active: permitsActive,
          permits_expiring: permitsExpiring,
          permits_expired: permitsExpired,
          total_cost_ytd: 0,
          renewal_work_pending: renewalPending,
          blockers: blockerCount,
          app_usage: JSON.stringify({}),
        } as any)
        .onConflict((oc: any) => oc.columns(['tenant_id', 'snapshot_date', 'metric_type'] as any).doUpdateSet({
          user_count: userCount,
          entity_count: entityCount,
          site_count: siteCount,
          permit_count: permitCount,
          permits_active: permitsActive,
          permits_expiring: permitsExpiring,
          permits_expired: permitsExpired,
          renewal_work_pending: renewalPending,
          blockers: blockerCount,
          computed_at: new Date(),
        } as any))
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        ...row,
        compliance_score: row.compliance_score != null ? Number(row.compliance_score) : null,
        total_cost_ytd: Number(row.total_cost_ytd),
      };
    });
  }

  static async listTenantSnapshots(
    tenantId: string,
    filters?: { metric_type?: string; limit?: number },
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      let q = db.selectFrom('tenant_metric_snapshots')
        .selectAll()
        .where('tenant_id', '=', tenantId);
      if (filters?.metric_type) q = q.where('metric_type', '=', filters.metric_type);
      const rows = await q.orderBy('snapshot_date', 'desc')
        .limit(filters?.limit ?? 30)
        .execute();
      return rows.map((r: any) => ({
        ...r,
        compliance_score: r.compliance_score != null ? Number(r.compliance_score) : null,
        total_cost_ytd: Number(r.total_cost_ytd),
      }));
    });
  }

  // ── Resource limits ─────────────────────────────────────────────

  static async setResourceLimit(
    tenantId: string,
    input: {
      resource_type: string;
      max_allowed: number;
      enforcement?: string;
      overage_action?: string;
    },
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      const row = await db.insertInto('tenant_resource_limits')
        .values({
          tenant_id: tenantId,
          resource_type: input.resource_type,
          max_allowed: input.max_allowed,
          enforcement: input.enforcement ?? 'soft',
          overage_action: input.overage_action ?? 'warn',
        } as any)
        .onConflict((oc: any) => oc.columns(['tenant_id', 'resource_type'] as any).doUpdateSet({
          max_allowed: input.max_allowed,
          enforcement: input.enforcement ?? 'soft',
          overage_action: input.overage_action ?? 'warn',
          updated_at: new Date(),
        } as any))
        .returningAll()
        .executeTakeFirstOrThrow();
      return row;
    });
  }

  static async checkResourceLimit(
    tenantId: string,
    resourceType: string,
    currentUsage?: number,
  ): Promise<{ allowed: boolean; limit: number; usage: number; enforcement: string }> {
    return withTenant(tenantId, async (db: TenantDb) => {
      const limit = await db.selectFrom('tenant_resource_limits')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('resource_type', '=', resourceType)
        .executeTakeFirst();

      if (!limit) return { allowed: true, limit: -1, usage: currentUsage ?? 0, enforcement: 'none' };

      const usage = currentUsage ?? limit.current_usage;
      const allowed = limit.enforcement !== 'hard' || usage < limit.max_allowed;
      return {
        allowed,
        limit: limit.max_allowed,
        usage,
        enforcement: limit.enforcement as string,
      };
    });
  }

  static async listResourceLimits(tenantId: string) {
    return withTenant(tenantId, async (db: TenantDb) => {
      return db.selectFrom('tenant_resource_limits')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('resource_type', 'asc')
        .execute();
    });
  }

  static async updateResourceUsage(
    tenantId: string,
    resourceType: string,
    usage: number,
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      return db.updateTable('tenant_resource_limits')
        .set({
          current_usage: usage,
          last_checked_at: new Date(),
          updated_at: new Date(),
        } as any)
        .where('tenant_id', '=', tenantId)
        .where('resource_type', '=', resourceType)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  // ── Durable jobs ────────────────────────────────────────────────

  static async enqueueJob(
    tenantId: string | null,
    userId: string,
    input: {
      job_type: string;
      job_key?: string;
      payload?: Record<string, unknown>;
      priority?: number;
      max_retries?: number;
      scheduled_at?: string;
      expires_at?: string;
    },
  ) {
    if (tenantId) {
      return withTenant(tenantId, async (db: TenantDb) => {
        return db.insertInto('durable_jobs')
          .values({
            tenant_id: tenantId,
            job_type: input.job_type,
            job_key: input.job_key ?? null,
            payload: JSON.stringify(input.payload ?? {}),
            priority: input.priority ?? 0,
            max_retries: input.max_retries ?? 3,
            scheduled_at: input.scheduled_at ? new Date(input.scheduled_at) : new Date(),
            expires_at: input.expires_at ? new Date(input.expires_at) : null,
            created_by: userId,
          } as any)
          .onConflict((oc: any) => oc.columns(['tenant_id', 'job_type', 'job_key'] as any).doNothing())
          .returningAll()
          .executeTakeFirst();
      });
    }

    return dbPlatform.insertInto('durable_jobs' as any)
      .values({
        tenant_id: null,
        job_type: input.job_type,
        job_key: input.job_key ?? null,
        payload: JSON.stringify(input.payload ?? {}),
        priority: input.priority ?? 0,
        max_retries: input.max_retries ?? 3,
        scheduled_at: input.scheduled_at ? new Date(input.scheduled_at) : new Date(),
        expires_at: input.expires_at ? new Date(input.expires_at) : null,
        created_by: userId,
      } as any)
      .onConflict((oc) => oc.columns(['tenant_id', 'job_type', 'job_key'] as any).doNothing())
      .returningAll()
      .executeTakeFirst();
  }

  static async claimJob(jobId: string, tenantId: string) {
    return withTenant(tenantId, async (db: TenantDb) => {
      return db.updateTable('durable_jobs')
        .set({
          status: 'running',
          started_at: new Date(),
          updated_at: new Date(),
        } as any)
        .where('id', '=', jobId)
        .where('status', 'in', ['pending', 'retrying'])
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  static async completeJob(
    jobId: string,
    tenantId: string,
    result?: Record<string, unknown>,
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      return db.updateTable('durable_jobs')
        .set({
          status: 'completed',
          result: result ? JSON.stringify(result) : null,
          completed_at: new Date(),
          updated_at: new Date(),
        } as any)
        .where('id', '=', jobId)
        .where('status', '=', 'running')
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  static async failJob(jobId: string, tenantId: string, errorMessage: string) {
    return withTenant(tenantId, async (db: TenantDb) => {
      const job = await db.selectFrom('durable_jobs')
        .selectAll()
        .where('id', '=', jobId)
        .executeTakeFirstOrThrow();

      const retries = (job.retry_count as number) + 1;
      const newStatus = retries < (job.max_retries as number) ? 'retrying' : 'failed';

      return db.updateTable('durable_jobs')
        .set({
          status: newStatus,
          retry_count: retries,
          error_message: errorMessage,
          updated_at: new Date(),
        } as any)
        .where('id', '=', jobId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  static async listJobs(
    tenantId: string,
    filters?: { status?: string; job_type?: string; limit?: number },
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      let q = db.selectFrom('durable_jobs')
        .selectAll()
        .where('tenant_id', '=', tenantId);
      if (filters?.status) q = q.where('status', '=', filters.status);
      if (filters?.job_type) q = q.where('job_type', '=', filters.job_type);
      return q.orderBy('created_at', 'desc')
        .limit(filters?.limit ?? 50)
        .execute();
    });
  }

  // ── Bulk operations ─────────────────────────────────────────────

  static async createBulkOperation(
    tenantId: string,
    userId: string,
    input: {
      operation_type: string;
      source_type?: string;
      target_type?: string;
      total_records: number;
      file_url?: string;
    },
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      return db.insertInto('bulk_operations')
        .values({
          tenant_id: tenantId,
          operation_type: input.operation_type,
          source_type: input.source_type ?? null,
          target_type: input.target_type ?? null,
          total_records: input.total_records,
          file_url: input.file_url ?? null,
          created_by: userId,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  static async updateBulkProgress(
    tenantId: string,
    id: string,
    update: {
      processed_records?: number;
      failed_records?: number;
      status?: string;
      error_summary?: unknown;
      result_url?: string;
    },
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      const vals: Record<string, unknown> = { updated_at: new Date() };
      if (update.processed_records != null) vals.processed_records = update.processed_records;
      if (update.failed_records != null) vals.failed_records = update.failed_records;
      if (update.status) {
        vals.status = update.status;
        if (update.status === 'processing') vals.started_at = new Date();
        if (['completed', 'failed', 'partial'].includes(update.status)) vals.completed_at = new Date();
      }
      if (update.error_summary) vals.error_summary = JSON.stringify(update.error_summary);
      if (update.result_url) vals.result_url = update.result_url;
      return db.updateTable('bulk_operations')
        .set(vals as any)
        .where('id', '=', id)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  static async listBulkOperations(
    tenantId: string,
    filters?: { operation_type?: string; status?: string; limit?: number },
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      let q = db.selectFrom('bulk_operations')
        .selectAll()
        .where('tenant_id', '=', tenantId);
      if (filters?.operation_type) q = q.where('operation_type', '=', filters.operation_type);
      if (filters?.status) q = q.where('status', '=', filters.status);
      return q.orderBy('created_at', 'desc')
        .limit(filters?.limit ?? 50)
        .execute();
    });
  }
}
