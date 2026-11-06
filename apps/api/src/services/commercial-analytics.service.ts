import { dbPlatform } from '../db/client.js';
import { sql } from 'kysely';
import { PLAN_LEVELS } from '@hudumika/types';
import type { TenantPlan } from '@hudumika/types';

export const CommercialAnalyticsService = {
  async getPayingWorkspaces(): Promise<{
    total: number;
    active_paid: number;
    free: number;
    cancelled: number;
  }> {
    const rows = await dbPlatform.selectFrom('tenants')
      .select([
        sql<number>`count(*)`.as('total'),
        sql<number>`count(*) filter (where plan not in ('free','agency-managed') and active = true)`.as('active_paid'),
        sql<number>`count(*) filter (where plan = 'free')`.as('free'),
        sql<number>`count(*) filter (where active = false)`.as('cancelled'),
      ])
      .executeTakeFirstOrThrow();
    return {
      total: Number(rows.total),
      active_paid: Number(rows.active_paid),
      free: Number(rows.free),
      cancelled: Number(rows.cancelled),
    };
  },

  async getMrr(): Promise<{
    mrr_tzs: number;
    mrr_usd: number;
    arr_tzs: number;
    arr_usd: number;
    by_plan: Array<{ plan: string; count: number; mrr: number; currency: string }>;
  }> {
    const rows = await dbPlatform.selectFrom('tenants as t')
      .innerJoin('packages as p', 'p.code', 't.plan')
      .select([
        't.plan',
        'p.currency',
        sql<number>`count(*)`.as('count'),
        sql<number>`sum(case when t.billing_cycle = 'annual' then p.annual_price / 12.0 else p.monthly_price end)`.as('mrr'),
      ])
      .where('t.active', '=', true)
      .where('t.plan', 'not in', ['free', 'agency-managed'])
      .groupBy(['t.plan', 'p.currency'])
      .orderBy('mrr', 'desc')
      .execute();

    let mrr_tzs = 0, mrr_usd = 0;
    for (const r of rows) {
      const v = Number(r.mrr) || 0;
      if (r.currency === 'TZS') mrr_tzs += v;
      else mrr_usd += v;
    }
    return {
      mrr_tzs, mrr_usd,
      arr_tzs: mrr_tzs * 12, arr_usd: mrr_usd * 12,
      by_plan: rows.map(r => ({ plan: r.plan, count: Number(r.count), mrr: Number(r.mrr) || 0, currency: r.currency })),
    };
  },

  /**
   * Subscription margin (master-prompt Phase 5) — deliberately partial, and
   * says so. This platform has no hosting/infra cost attribution anywhere,
   * so the only real allocable cost against subscription revenue is support
   * time logged with category='included' (support_time_entries, migration
   * 638) — the support that's bundled into the plan price with no separate
   * invoice. 'paid_support' and 'implementation' categories have their own
   * revenue line (Phase 4) and are excluded here on purpose: subtracting
   * them too would double-count a cost the tenant already paid for
   * separately. See LENS-60 — do not extend this to claim a full P&L
   * margin without first adding real infra-cost attribution.
   */
  async getSubscriptionMargin(): Promise<{
    revenue_tzs: number;
    included_support_cost_tzs: number;
    margin_tzs: number;
    allocation_note: string;
  }> {
    const mrr = await this.getMrr();
    const row = await dbPlatform.selectFrom('support_time_entries')
      .select(sql<number>`coalesce(sum(duration_minutes * loaded_cost_per_hour / 60.0), 0)`.as('cost'))
      .where('category', '=', 'included')
      .executeTakeFirst();
    const included_support_cost_tzs = Math.round(Number(row?.cost) || 0);
    return {
      revenue_tzs: mrr.mrr_tzs,
      included_support_cost_tzs,
      margin_tzs: mrr.mrr_tzs - included_support_cost_tzs,
      allocation_note: 'Subscription revenue (TZS MRR) minus included-tier support cost only — hosting/infra cost is not tracked anywhere in this platform and is not included, so this is a partial margin, not a full P&L.',
    };
  },

  async getRetentionCohorts(windowDays: number = 30): Promise<Array<{
    cohort_month: string;
    signed_up: number;
    still_active: number;
    retention_pct: number;
    immature: boolean;
  }>> {
    const rows = await dbPlatform
      .selectFrom('tenants')
      .select([
        sql<string>`to_char(created_at, 'YYYY-MM')`.as('cohort_month'),
        sql<number>`count(*)`.as('signed_up'),
        sql<number>`count(*) filter (where active = true and plan not in ('free','agency-managed'))`.as('still_active'),
        sql<string>`max(created_at)`.as('newest'),
      ])
      .where('plan', 'not in', ['free', 'agency-managed'])
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy('cohort_month', 'asc')
      .execute();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);

    return rows.map(r => {
      const immature = new Date(r.newest) > cutoff;
      const signed = Number(r.signed_up);
      const active = Number(r.still_active);
      return {
        cohort_month: r.cohort_month,
        signed_up: signed,
        still_active: active,
        retention_pct: signed > 0 ? Math.round((active / signed) * 100) : 0,
        immature,
      };
    });
  },

  async getChurnUpgrades(months: number = 6): Promise<Array<{
    month: string;
    new_paid: number;
    churned: number;
    upgrades: number;
    downgrades: number;
  }>> {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const rows = await dbPlatform.selectFrom('subscription_invoices')
      .select([
        sql<string>`to_char(created_at, 'YYYY-MM')`.as('month'),
        sql<number>`count(*) filter (where status = 'paid')`.as('new_paid'),
        sql<number>`count(*) filter (where status = 'cancelled')`.as('churned'),
      ])
      .where('created_at', '>=', since)
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy('month', 'asc')
      .execute();

    // tenant_plan_changes (migration 635) already records every from_plan ->
    // to_plan transition with a timestamp — classifying upgrade vs downgrade
    // only needs PLAN_LEVELS comparison, not a new column (see LENS-61).
    const changes = await dbPlatform.selectFrom('tenant_plan_changes' as any)
      .select(['from_plan', 'to_plan', 'effective_at'])
      .where('effective_at', '>=', since)
      .execute() as Array<{ from_plan: string; to_plan: string; effective_at: Date }>;

    const changeCounts = new Map<string, { upgrades: number; downgrades: number }>();
    for (const c of changes) {
      const month = new Date(c.effective_at).toISOString().slice(0, 7);
      const fromLevel = PLAN_LEVELS[c.from_plan as TenantPlan] ?? null;
      const toLevel = PLAN_LEVELS[c.to_plan as TenantPlan] ?? null;
      if (fromLevel == null || toLevel == null || fromLevel === toLevel) continue;
      const bucket = changeCounts.get(month) ?? { upgrades: 0, downgrades: 0 };
      if (toLevel > fromLevel) bucket.upgrades++; else bucket.downgrades++;
      changeCounts.set(month, bucket);
    }

    return rows.map(r => ({
      month: r.month,
      new_paid: Number(r.new_paid),
      churned: Number(r.churned),
      upgrades: changeCounts.get(r.month)?.upgrades ?? 0,
      downgrades: changeCounts.get(r.month)?.downgrades ?? 0,
    }));
  },

  async getEsbMargin(): Promise<{
    total_earned: number;
    total_supplier_cost: number;
    margin: number;
    currency: string;
    by_service: Array<{ service_kind: string; earned: number; supplier_cost: number; operations: number }>;
  }> {
    const rows = await dbPlatform.selectFrom('esb_operations')
      .select([
        'service_kind',
        sql<number>`sum(actual_amount)`.as('earned'),
        sql<number>`sum(supplier_amount)`.as('supplier_cost'),
        sql<number>`count(*)`.as('operations'),
      ])
      .where('status', 'in', ['captured', 'reconciling'])
      .groupBy('service_kind')
      .execute();

    let total_earned = 0, total_supplier_cost = 0;
    for (const r of rows) {
      total_earned += Number(r.earned) || 0;
      total_supplier_cost += Number(r.supplier_cost) || 0;
    }
    return {
      total_earned, total_supplier_cost,
      margin: total_earned - total_supplier_cost,
      currency: 'TZS',
      by_service: rows.map(r => ({
        service_kind: r.service_kind,
        earned: Number(r.earned) || 0,
        supplier_cost: Number(r.supplier_cost) || 0,
        operations: Number(r.operations),
      })),
    };
  },

  async getSupportCostSummary(): Promise<{
    total_hours: number;
    total_cost: number;
    currency: string;
    by_category: Array<{ category: string; hours: number; cost: number }>;
  }> {
    const rows = await dbPlatform.selectFrom('support_time_entries')
      .select([
        'category',
        sql<number>`sum(duration_minutes) / 60.0`.as('hours'),
        sql<number>`sum(duration_minutes * loaded_cost_per_hour / 60.0)`.as('cost'),
      ])
      .groupBy('category')
      .execute();

    let total_hours = 0, total_cost = 0;
    for (const r of rows) {
      total_hours += Number(r.hours) || 0;
      total_cost += Number(r.cost) || 0;
    }
    return {
      total_hours: Math.round(total_hours * 10) / 10,
      total_cost: Math.round(total_cost),
      currency: 'TZS',
      by_category: rows.map(r => ({
        category: r.category,
        hours: Math.round((Number(r.hours) || 0) * 10) / 10,
        cost: Math.round(Number(r.cost) || 0),
      })),
    };
  },

  async getActiveApps(): Promise<Array<{
    app_id: string;
    active_workspaces: number;
  }>> {
    const rows = await dbPlatform.selectFrom('tenant_activation_checkpoints')
      .select([
        sql<string>`checkpoint_key`.as('app_id'),
        sql<number>`count(distinct tenant_id)`.as('active_workspaces'),
      ])
      .groupBy('checkpoint_key')
      .orderBy('active_workspaces', 'desc')
      .execute();

    return rows.map(r => ({
      app_id: r.app_id,
      active_workspaces: Number(r.active_workspaces),
    }));
  },

  async getProviderReliability(): Promise<Array<{
    service_kind: string;
    total: number;
    captured: number;
    failed: number;
    success_rate: number;
  }>> {
    const rows = await dbPlatform.selectFrom('esb_operations')
      .select([
        'service_kind',
        sql<number>`count(*)`.as('total'),
        sql<number>`count(*) filter (where status = 'captured')`.as('captured'),
        sql<number>`count(*) filter (where status = 'failed')`.as('failed'),
      ])
      .groupBy('service_kind')
      .execute();

    return rows.map(r => {
      const total = Number(r.total);
      const captured = Number(r.captured);
      return {
        service_kind: r.service_kind,
        total,
        captured,
        failed: Number(r.failed),
        success_rate: total > 0 ? Math.round((captured / total) * 1000) / 10 : 0,
      };
    });
  },

  async getRevenueTimeline(months: number = 12): Promise<Array<{
    month: string;
    subscription_revenue: number;
    esb_revenue: number;
    currency: string;
  }>> {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const subRows = await dbPlatform.selectFrom('subscription_invoices')
      .select([
        sql<string>`to_char(created_at, 'YYYY-MM')`.as('month'),
        sql<number>`sum(amount)`.as('revenue'),
        'currency',
      ])
      .where('status', '=', 'paid')
      .where('created_at', '>=', since)
      .groupBy([sql`to_char(created_at, 'YYYY-MM')`, 'currency'])
      .orderBy('month', 'asc')
      .execute();

    // ESB revenue from operations (actual_amount is the authoritative charge,
    // not the posting amounts which include release/capture pairs).
    const esbRows = await dbPlatform.selectFrom('esb_operations')
      .select([
        sql<string>`to_char(settled_at, 'YYYY-MM')`.as('month'),
        sql<number>`sum(actual_amount)`.as('revenue'),
        sql<string>`'TZS'`.as('currency'),
      ])
      .where('status', '=', 'captured')
      .where('settled_at', 'is not', null)
      .where('settled_at', '>=', since)
      .groupBy(sql`to_char(settled_at, 'YYYY-MM')`)
      .orderBy('month', 'asc')
      .execute();

    const timeline: Record<string, { subscription_revenue: number; esb_revenue: number; currency: string }> = {};
    for (const r of subRows) {
      if (!timeline[r.month]) timeline[r.month] = { subscription_revenue: 0, esb_revenue: 0, currency: r.currency };
      timeline[r.month].subscription_revenue += Number(r.revenue) || 0;
    }
    for (const r of esbRows) {
      if (!timeline[r.month]) timeline[r.month] = { subscription_revenue: 0, esb_revenue: 0, currency: r.currency };
      timeline[r.month].esb_revenue += Number(r.revenue) || 0;
    }

    return Object.entries(timeline)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));
  },
};
