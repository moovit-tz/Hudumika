// HuduBI configurable widget/report builder (M9 of the ClearOS roadmap).
// See migration 257_hudubi_widgets.sql's header for the security posture:
// a curated, hardcoded metric registry (mirrors reports.service.ts's
// METRICS/runMetric pattern), never a freeform query builder, and every
// metric below is one of hudubi.routes.ts's own pre-existing fixed queries,
// unbundled into a selectable piece — not new data exposure. Always scoped
// through withTenant(); tenant_id is never accepted from the caller.
import { sql } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import type { Kysely, Transaction } from 'kysely';

const STAGE_LABELS: Record<string, string> = {
  BL_AWB: 'BL / AWB', DOCS_RECEIVED: 'Docs received', PERMITS: 'Permits',
  ENTRY_PREP: 'Entry prep', ASSESSMENT: 'Assessment', INSPECTION_BOOKING: 'Inspection',
  TAX_PAYMENT: 'Tax payment', RELEASE: 'Release', TRANSPORT: 'Transport',
  DELIVERED: 'Delivered', CLOSED: 'Closed',
};
const MODE_LABELS: Record<string, string> = {
  SEA_FCL: 'Sea (FCL)', SEA_LCL: 'Sea (LCL)', AIR: 'Air', ROAD: 'Road', RAIL: 'Rail',
};
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);

export type ChartType = 'number' | 'bar' | 'line' | 'table';

export interface HuduBIMetricDef {
  key: string;
  label: string;
  defaultChartType: ChartType;
  table: string;          // real table this metric reads, for the "explain" UI only — never interpolated from user input
  supportsDateRange: boolean;
}

// Declarative metrics — one table, one group-by dimension (or none, for a
// scalar KPI), run through the generic runner below. Real column names,
// copied from hudubi.routes.ts's own pre-existing queries.
interface DeclarativeMetric extends HuduBIMetricDef {
  kind: 'declarative';
  agg: 'count' | 'sum';
  sumColumn?: string;
  dimension?: string;      // omit for a scalar KPI
  labelMap?: Record<string, string>;
  timeSeries?: boolean;    // group by to_char(created_at,'YYYY-MM') instead of the raw dimension
  limit?: number;
}

// Special metrics — the real shape doesn't fit "one table, one dimension"
// (a join, or summing across two tables), so each gets its own function
// instead of being forced into the generic runner.
interface SpecialMetric extends HuduBIMetricDef {
  kind: 'special';
}

type MetricDef = DeclarativeMetric | SpecialMetric;

export const HUDUBI_METRICS: MetricDef[] = [
  { kind: 'declarative', key: 'active_cases', label: 'Active cases', defaultChartType: 'number', table: 'shipment_cases', agg: 'count', supportsDateRange: true },
  { kind: 'declarative', key: 'customers_count', label: 'Customers', defaultChartType: 'number', table: 'customers', agg: 'count', supportsDateRange: true },
  { kind: 'declarative', key: 'declarations_count', label: 'Declarations', defaultChartType: 'number', table: 'declarations', agg: 'count', supportsDateRange: true },
  { kind: 'declarative', key: 'consignment_value_usd', label: 'Consignment value (USD)', defaultChartType: 'number', table: 'shipment_cases', agg: 'sum', sumColumn: 'cif_value_usd', supportsDateRange: true },
  { kind: 'declarative', key: 'revenue_tzs', label: 'Revenue (TZS)', defaultChartType: 'number', table: 'sales_invoices', agg: 'sum', sumColumn: 'tra_total_incl', supportsDateRange: true },
  { kind: 'declarative', key: 'shipment_pipeline', label: 'Shipment pipeline by stage', defaultChartType: 'bar', table: 'shipment_cases', agg: 'count', dimension: 'stage', labelMap: STAGE_LABELS, supportsDateRange: true },
  { kind: 'declarative', key: 'shipments_by_mode', label: 'Shipments by mode', defaultChartType: 'bar', table: 'shipment_cases', agg: 'count', dimension: 'type', labelMap: MODE_LABELS, supportsDateRange: true },
  { kind: 'declarative', key: 'customers_by_segment', label: 'Customers by segment', defaultChartType: 'bar', table: 'customers', agg: 'count', dimension: 'category', supportsDateRange: true },
  { kind: 'declarative', key: 'monthly_volume', label: 'Monthly shipment volume', defaultChartType: 'line', table: 'shipment_cases', agg: 'count', timeSeries: true, supportsDateRange: true },
  { kind: 'declarative', key: 'cif_by_mode', label: 'CIF value by mode', defaultChartType: 'bar', table: 'shipment_cases', agg: 'sum', sumColumn: 'cif_value_usd', dimension: 'type', labelMap: MODE_LABELS, supportsDateRange: true },
  { kind: 'declarative', key: 'top_origin_ports', label: 'Top origin ports', defaultChartType: 'bar', table: 'shipment_cases', agg: 'count', dimension: 'origin_port', limit: 8, supportsDateRange: true },
  { kind: 'special', key: 'expenses_tzs', label: 'Expenses (TZS)', defaultChartType: 'number', table: 'expenses + finance_expenses', supportsDateRange: true },
  { kind: 'special', key: 'top_customers', label: 'Top customers', defaultChartType: 'table', table: 'shipment_cases + customers', supportsDateRange: true },
];

export interface MetricFilters {
  date_from?: string;
  date_to?: string;
}

export interface MetricResult {
  rows: { label: string; value: number }[];
}

async function runDeclarativeMetric(trx: Transaction<Database> | Kysely<Database>, tenantId: string, m: DeclarativeMetric, filters: MetricFilters): Promise<MetricResult> {
  const valueExpr = m.agg === 'sum' ? sql`COALESCE(SUM(${sql.ref(m.sumColumn!)}), 0)::float` : sql`COUNT(*)::int`;
  const conditions = [sql`tenant_id = ${tenantId}`];
  if (filters.date_from) conditions.push(sql`created_at >= ${filters.date_from}`);
  if (filters.date_to) conditions.push(sql`created_at <= ${filters.date_to}`);
  const where = sql.join(conditions, sql` AND `);

  if (!m.dimension && !m.timeSeries) {
    const q = sql<{ v: number }>`SELECT ${valueExpr} AS v FROM ${sql.table(m.table)} WHERE ${where}`;
    const r = await q.execute(trx);
    return { rows: [{ label: m.label, value: Number(r.rows[0]?.v ?? 0) }] };
  }

  if (m.timeSeries) {
    const q = sql<{ bucket: string; v: number }>`
      SELECT to_char(created_at, 'YYYY-MM') AS bucket, ${valueExpr} AS v
      FROM ${sql.table(m.table)} WHERE ${where} GROUP BY 1 ORDER BY 1 DESC LIMIT 6`;
    const r = await q.execute(trx);
    return { rows: r.rows.map(row => ({ label: row.bucket, value: Number(row.v) })).reverse() };
  }

  const limitClause = m.limit ? sql`LIMIT ${m.limit}` : sql``;
  const q = sql<{ bucket: string | null; v: number }>`
    SELECT COALESCE(NULLIF(${sql.ref(m.dimension!)}::text, ''), 'Unspecified') AS bucket, ${valueExpr} AS v
    FROM ${sql.table(m.table)} WHERE ${where} GROUP BY 1 ORDER BY v DESC ${limitClause}`;
  const r = await q.execute(trx);
  return {
    rows: r.rows.map(row => {
      const raw = row.bucket ?? 'Unspecified';
      const label = isUuid(raw) ? 'Custom workflow' : (m.labelMap?.[raw] ?? raw);
      return { label, value: Number(row.v) };
    }),
  };
}

async function runSpecialMetric(trx: Transaction<Database> | Kysely<Database>, tenantId: string, key: string, filters: MetricFilters): Promise<MetricResult> {
  const dateFrom = filters.date_from ? sql`AND created_at >= ${filters.date_from}` : sql``;
  const dateTo = filters.date_to ? sql`AND created_at <= ${filters.date_to}` : sql``;

  if (key === 'expenses_tzs') {
    const a = await sql<{ v: number }>`SELECT COALESCE(SUM(amount_tzs),0)::float AS v FROM expenses WHERE tenant_id = ${tenantId} ${dateFrom} ${dateTo}`.execute(trx);
    const b = await sql<{ v: number }>`SELECT COALESCE(SUM(amount),0)::float AS v FROM finance_expenses WHERE tenant_id = ${tenantId} ${dateFrom} ${dateTo}`.execute(trx);
    return { rows: [{ label: 'Expenses (TZS)', value: Number(a.rows[0]?.v ?? 0) + Number(b.rows[0]?.v ?? 0) }] };
  }

  if (key === 'top_customers') {
    const dateFromS = filters.date_from ? sql`AND s.created_at >= ${filters.date_from}` : sql``;
    const dateToS = filters.date_to ? sql`AND s.created_at <= ${filters.date_to}` : sql``;
    const r = await sql<{ name: string; n: number }>`
      SELECT c.name, count(*)::int AS n
      FROM shipment_cases s JOIN customers c ON c.id = s.customer_id
      WHERE s.tenant_id = ${tenantId} ${dateFromS} ${dateToS}
      GROUP BY c.name ORDER BY n DESC LIMIT 8`.execute(trx);
    return { rows: r.rows.map(row => ({ label: row.name, value: Number(row.n) })) };
  }

  throw new Error(`Unknown special metric: ${key}`);
}

export async function runHuduBIMetric(tenantId: string, metricKey: string, filters: MetricFilters): Promise<MetricResult> {
  const metric = HUDUBI_METRICS.find(m => m.key === metricKey);
  if (!metric) throw new Error(`Unknown metric: ${metricKey}`);
  return withTenant(tenantId, (trx) =>
    metric.kind === 'declarative' ? runDeclarativeMetric(trx, tenantId, metric, filters) : runSpecialMetric(trx, tenantId, metric.key, filters)
  );
}

// ── Saved widget definitions ────────────────────────────────────────────

export async function listWidgets(tenantId: string) {
  return withTenant(tenantId, (trx) =>
    trx.selectFrom('hudubi_widget_definitions').selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute()
  );
}

export async function createWidget(tenantId: string, userId: string, data: { name: string; metricKey: string; chartType?: ChartType; filters?: MetricFilters }) {
  if (!HUDUBI_METRICS.some(m => m.key === data.metricKey)) throw new Error(`Unknown metric: ${data.metricKey}`);
  const metric = HUDUBI_METRICS.find(m => m.key === data.metricKey)!;

  return withTenant(tenantId, async (trx) => {
    const maxOrder = await trx.selectFrom('hudubi_widget_definitions')
      .select(({ fn }) => fn.max('sort_order').as('max')).where('tenant_id', '=', tenantId).executeTakeFirst();
    return trx.insertInto('hudubi_widget_definitions').values({
      tenant_id: tenantId,
      name: data.name,
      metric_key: data.metricKey,
      chart_type: data.chartType || metric.defaultChartType,
      filters: JSON.stringify(data.filters ?? {}) as any,
      sort_order: (Number(maxOrder?.max) || 0) + 1,
      created_by: userId,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function updateWidget(tenantId: string, id: string, data: Partial<{ name: string; chartType: ChartType; filters: MetricFilters; sortOrder: number }>) {
  return withTenant(tenantId, (trx) =>
    trx.updateTable('hudubi_widget_definitions')
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.chartType !== undefined ? { chart_type: data.chartType } : {}),
        ...(data.filters !== undefined ? { filters: JSON.stringify(data.filters) as any } : {}),
        ...(data.sortOrder !== undefined ? { sort_order: data.sortOrder } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id).where('tenant_id', '=', tenantId)
      .returningAll().executeTakeFirstOrThrow()
  );
}

export async function deleteWidget(tenantId: string, id: string) {
  return withTenant(tenantId, (trx) =>
    trx.deleteFrom('hudubi_widget_definitions').where('id', '=', id).where('tenant_id', '=', tenantId).execute()
  );
}

export async function getWidgetData(tenantId: string, id: string): Promise<MetricResult> {
  const widget = await withTenant(tenantId, (trx) =>
    trx.selectFrom('hudubi_widget_definitions').selectAll().where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst()
  );
  if (!widget) throw new Error('Widget not found');
  const filters = (typeof widget.filters === 'string' ? JSON.parse(widget.filters) : widget.filters) as MetricFilters;
  return runHuduBIMetric(tenantId, widget.metric_key, filters ?? {});
}
