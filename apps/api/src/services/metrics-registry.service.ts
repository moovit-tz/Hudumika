// The cross-app Metric Registry's read/compute surface. Two existing real
// implementations back this rather than a third parallel one:
//   - 'declarative' metrics run through hudubi-widgets.service.ts's own
//     runHuduBIMetric() — the exact function HuduBI's dashboard builder
//     widgets already call.
//   - 'special' metrics dispatch to a small, explicit map of real service
//     functions (SPECIAL_METRIC_HANDLERS below) — computeBlissKpis for the
//     Bliss keys, plus thin wrappers around hudubi-widgets.service.ts's own
//     runHuduBIMetric for its two pre-existing special metrics
//     (expenses_tzs, top_customers), so those keep using their one real
//     implementation too.
//
// This mirrors the same non-negotiable this whole file's neighbours follow:
// metric_definitions describes what a metric IS (for the Explorer/lineage
// UI); it never becomes a second place that computes what a metric equals.
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { dbPlatform } from '../db/client.js';
import { computeBlissKpis, type BlissKpis } from './support-metrics.service.js';
import { runHuduBIMetric } from './hudubi-widgets.service.js';
import { computeClearanceTurnaroundHours, computeLandedCostAvgTzs } from './clearos-metrics.service.js';
import { GLService } from './gl.service.js';
import { computeSignKpis, type SignKpis } from './sign-metrics.service.js';

export interface MetricDefinitionRow {
  id: string;
  metric_key: string;
  name: string;
  description: string;
  app: string;
  module: string | null;
  domain: string;
  kind: 'declarative' | 'special';
  config: any;
  unit: string;
  format: string;
  owner: string | null;
  visibility: 'standard' | 'restricted';
  status: 'active' | 'deprecated';
  version: number;
}

// Restricted-visibility metrics (financial ledger, HR/payroll data) require
// one of these roles — checked server-side in metrics.routes.ts, not just
// hidden client-side. Mirrors this codebase's existing MGMT_ROLES bar.
export const METRICS_MGMT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'];

/**
 * Milestone 5: an in-memory cache for the definitions catalog.
 *
 * metric_definitions is small (dozens of rows, not thousands) and changes
 * rarely — today only via a migration; there is no admin "create custom
 * metric" write path yet (§9/§23 of the metrics program, not built). Every
 * one of this file's callers — GET /definitions, GET /:key/value,
 * POST /alerts's metric-exists check, metric-alerts.service.ts's rule
 * creation and every scheduled alert evaluation — hit this table on every
 * call; GET /:key/value alone did it twice (once in the route to check
 * visibility, once inside computeMetricValue). A 60s TTL means a real
 * change (a new migration adds a row) shows up within a minute with no
 * restart needed, while collapsing what were N redundant round trips per
 * request into at most one shared fetch.
 */
const CACHE_TTL_MS = 60_000;
let definitionsCache: { data: MetricDefinitionRow[]; fetchedAt: number } | null = null;

async function fetchDefinitionsFromDb(): Promise<MetricDefinitionRow[]> {
  return dbPlatform.selectFrom('metric_definitions')
    .selectAll()
    .where('status', '=', 'active')
    .orderBy('app', 'asc')
    .orderBy('metric_key', 'asc')
    .execute() as unknown as Promise<MetricDefinitionRow[]>;
}

export async function listMetricDefinitions(): Promise<MetricDefinitionRow[]> {
  const now = Date.now();
  if (definitionsCache && now - definitionsCache.fetchedAt < CACHE_TTL_MS) {
    return definitionsCache.data;
  }
  const data = await fetchDefinitionsFromDb();
  definitionsCache = { data, fetchedAt: now };
  return data;
}

export async function getMetricDefinition(metricKey: string): Promise<MetricDefinitionRow | undefined> {
  const all = await listMetricDefinitions();
  return all.find(d => d.metric_key === metricKey);
}

/** Forces the next read to hit the database instead of the cache. No
 *  caller today — there is no write path to metric_definitions yet — but
 *  a future "register a custom metric" endpoint calls this after its
 *  insert, the same way emitDomainEvent's subscriber registry gives every
 *  writer an explicit seam rather than a silent 60s-stale window. */
export function invalidateMetricDefinitionsCache(): void {
  definitionsCache = null;
}

export interface MetricValue {
  key: string;
  value: number;
  unit: string;
  format: string;
  asOf: string;
}

const BLISS_FIELD_MAP: Record<string, keyof BlissKpis> = {
  'bliss.sla_compliance': 'sla',
  'bliss.csat': 'csat',
  'bliss.first_reply_hours': 'firstReply',
  'bliss.resolution_hours': 'resolution',
  'bliss.escalation_rate': 'escalation',
  'bliss.ticket_volume': 'total',
};

/** One handler per 'special' metric_key. Every entry here delegates to a
 *  real, already-existing computation — see the file-header comment. */
const SPECIAL_METRIC_HANDLERS: Record<string, (tenantId: string, days: number) => Promise<number>> = {
  ...Object.fromEntries(Object.keys(BLISS_FIELD_MAP).map(key => [
    key,
    async (tenantId: string, days: number) => {
      const kpis = await withTenant(tenantId, trx => computeBlissKpis(trx, tenantId, days));
      const v = kpis[BLISS_FIELD_MAP[key]];
      return typeof v === 'number' ? v : 0;
    },
  ])),
  expenses_tzs: async (tenantId: string, days: number) => {
    const from = new Date(Date.now() - days * 86400000).toISOString();
    const r = await runHuduBIMetric(tenantId, 'expenses_tzs', { date_from: from });
    return r.rows[0]?.value ?? 0;
  },

  // ── FinOps: AR/AP aging + trial balance ──────────────────────────────
  // GLService.agedReceivables/agedPayables/trialBalance are the one real
  // implementation already serving FinanceAgedReceivables.tsx,
  // FinanceAgedPayables.tsx and the GL Reports page — these handlers read
  // their totals, they don't re-derive the aging buckets or the ledger math.
  'finops.ar_total': async (tenantId: string) => {
    const r = await GLService.agedReceivables(tenantId);
    return Math.round(r.totals.total);
  },
  'finops.ar_overdue_pct': async (tenantId: string) => {
    const r = await GLService.agedReceivables(tenantId);
    if (r.totals.total <= 0) return 0;
    const overdue = r.totals.total - r.totals.current;
    return Number(((overdue / r.totals.total) * 100).toFixed(1));
  },
  'finops.ap_total': async (tenantId: string) => {
    const r = await GLService.agedPayables(tenantId);
    return Math.round(r.totals.total);
  },
  'finops.ap_overdue_pct': async (tenantId: string) => {
    const r = await GLService.agedPayables(tenantId);
    if (r.totals.total <= 0) return 0;
    const overdue = r.totals.total - r.totals.current;
    return Number(((overdue / r.totals.total) * 100).toFixed(1));
  },
  'finops.trial_balance_variance': async (tenantId: string, days: number) => {
    const from = new Date(Date.now() - days * 86400000).toISOString();
    const to = new Date().toISOString();
    const r = await GLService.trialBalance(tenantId, from, to);
    // Should be ~0 for a genuinely balanced ledger — a real health-check
    // number, not a figure anyone is meant to want large.
    return Number((r.totals.debit - r.totals.credit).toFixed(2));
  },

  // ── ClearOS: turnaround + landed cost ────────────────────────────────
  'clearos.clearance_turnaround_hours': async (tenantId: string, days: number) =>
    computeClearanceTurnaroundHours(tenantId, days),
  'clearos.landed_cost_avg_tzs': async (tenantId: string, days: number) =>
    computeLandedCostAvgTzs(tenantId, days),

  // ── NexusHR: headcount, leave, attendance ────────────────────────────
  'nexushr.headcount': async (tenantId: string) => {
    return withTenant(tenantId, async trx => {
      const r = await sql<{ v: number }>`SELECT count(*)::int as v FROM users WHERE tenant_id = ${tenantId} AND active = true`.execute(trx);
      return Number(r.rows[0]?.v ?? 0);
    });
  },
  'nexushr.pending_leave_requests': async (tenantId: string) => {
    return withTenant(tenantId, async trx => {
      const r = await sql<{ v: number }>`SELECT count(*)::int as v FROM hr_leaves WHERE tenant_id = ${tenantId} AND status = 'PENDING'`.execute(trx);
      return Number(r.rows[0]?.v ?? 0);
    });
  },
  'nexushr.late_clockin_pct': async (tenantId: string, days: number) => {
    return withTenant(tenantId, async trx => {
      const r = await sql<{ total: number; late: number }>`
        SELECT count(*)::int as total,
               count(*) FILTER (WHERE status = 'LATE')::int as late
        FROM hr_attendance
        WHERE tenant_id = ${tenantId}
          AND date >= CURRENT_DATE - (${days} * INTERVAL '1 day')
      `.execute(trx);
      const total = Number(r.rows[0]?.total ?? 0);
      const late = Number(r.rows[0]?.late ?? 0);
      return total > 0 ? Number(((late / total) * 100).toFixed(1)) : 0;
    });
  },

  // ── CargoTracker: active fleet trips ─────────────────────────────────
  'cargotracker.active_trips': async (tenantId: string) => {
    return withTenant(tenantId, async trx => {
      const r = await sql<{ v: number }>`SELECT count(*)::int as v FROM trips WHERE tenant_id = ${tenantId} AND status = 'IN_PROGRESS'`.execute(trx);
      return Number(r.rows[0]?.v ?? 0);
    });
  },

  // ── Sign: envelopes, execution, identity ─────────────────────────────
  // One computeSignKpis() call, same "shared calculation" shape as Bliss's
  // computeBlissKpis above — see sign-metrics.service.ts.
  ...Object.fromEntries((Object.entries({
    'sign.envelopes_created': 'created',
    'sign.completion_rate_pct': 'completionRatePct',
    'sign.avg_completion_hours': 'avgCompletionHours',
    'sign.witnessed_count': 'witnessedCount',
    'sign.certified_count': 'certifiedCount',
    'sign.otp_verified_count': 'otpVerifiedCount',
  }) as [string, keyof SignKpis][]).map(([key, field]) => [
    key,
    async (tenantId: string, days: number) => {
      const kpis = await withTenant(tenantId, trx => computeSignKpis(trx, tenantId, days));
      const v = kpis[field];
      return typeof v === 'number' ? v : 0;
    },
  ])),
};

/** Computes one metric's current scalar value for a tenant, over the last
 *  `days`. Declarative metrics return their first (and for a scalar KPI,
 *  only) row's value; a metric with a dimension/time-series shape is meant
 *  for a chart, not a single scalar — callers wanting that should call
 *  runHuduBIMetric directly for the full row set. */
export async function computeMetricValue(metricKey: string, tenantId: string, days = 30): Promise<MetricValue> {
  const def = await getMetricDefinition(metricKey);
  if (!def) throw new Error(`Unknown metric: ${metricKey}`);

  let value = 0;
  if (SPECIAL_METRIC_HANDLERS[metricKey]) {
    value = await SPECIAL_METRIC_HANDLERS[metricKey](tenantId, days);
  } else if (def.kind === 'special') {
    throw new Error(`Metric "${metricKey}" is registered as special but has no special-kind handler wired`);
  } else {
    const from = new Date(Date.now() - days * 86400000).toISOString();
    const result = await runHuduBIMetric(tenantId, metricKey, { date_from: from });
    value = result.rows[0]?.value ?? 0;
  }

  return { key: metricKey, value, unit: def.unit, format: def.format, asOf: new Date().toISOString() };
}
