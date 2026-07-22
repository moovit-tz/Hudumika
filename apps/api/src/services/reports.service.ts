import { sql } from 'kysely';
import { db } from '../db/client.js';

/**
 * Phase 1 metric registry — a curated set of predefined app metrics rather
 * than a freeform query builder. Table/dimension/agg-column values are all
 * hardcoded here (never user input), so sql.table()/sql.ref() below are a
 * belt-and-braces identifier-quoting habit, not a real injection boundary.
 */
export interface MetricDef {
  app_id: string;
  key: string;
  label: string;
  table: string;
  dimension: string;
  agg: 'count' | 'sum';
  sumColumn?: string;
}

export const METRICS: MetricDef[] = [
  { app_id: 'clearos',  key: 'shipments_by_stage',    label: 'Shipments by stage',      table: 'shipment_cases',       dimension: 'stage',    agg: 'count' },
  { app_id: 'finops',   key: 'invoices_by_status',     label: 'Invoices by status',      table: 'sales_invoices',       dimension: 'status',   agg: 'count' },
  { app_id: 'finops',   key: 'expenses_by_category',   label: 'Expenses by category',    table: 'finance_expenses',     dimension: 'category', agg: 'sum', sumColumn: 'amount' },
  { app_id: 'onepi',    key: 'headcount_by_role',      label: 'Headcount by role',       table: 'users',                dimension: 'role',     agg: 'count' },
  { app_id: 'onepi',    key: 'payroll_by_status',      label: 'Payroll runs by status',  table: 'hr_payroll',           dimension: 'status',   agg: 'count' },
  { app_id: 'tracking', key: 'vehicles_by_status',     label: 'Vehicles by status',      table: 'vehicles',             dimension: 'status',   agg: 'count' },
  { app_id: 'tracking', key: 'trips_by_status',        label: 'Trips by status',         table: 'trips',                dimension: 'status',   agg: 'count' },
  { app_id: 'complyos', key: 'certificates_by_status', label: 'Certificates by status',  table: 'comply_certificates',  dimension: 'status',   agg: 'count' },
  { app_id: 'complyos', key: 'applications_by_status', label: 'Applications by status',  table: 'comply_applications',  dimension: 'status',   agg: 'count' },
  { app_id: 'clearos',  key: 'trade_wizard_searches_by_kind', label: 'Trade wizard searches by kind', table: 'trade_wizard_searches', dimension: 'kind', agg: 'count' },
  { app_id: 'clearos',  key: 'trade_wizard_runs_by_kind',     label: 'Trade wizard runs (via procedure)', table: 'trade_wizard_runs', dimension: 'procedure_id', agg: 'count' },
];

export interface MetricFilters {
  tenant_id?: string;
  date_from?: string;
  date_to?: string;
}

export interface MetricRow {
  tenant_id: string;
  tenant_name: string;
  bucket: string;
  value: number;
}

export async function runMetric(metricKey: string, filters: MetricFilters): Promise<MetricRow[]> {
  const metric = METRICS.find(m => m.key === metricKey);
  if (!metric) throw new Error(`Unknown metric: ${metricKey}`);

  const valueExpr = metric.agg === 'sum'
    ? sql`COALESCE(SUM(m.${sql.ref(metric.sumColumn!)}), 0)`
    : sql`COUNT(*)`;

  const conditions = [sql`1=1`];
  if (filters.tenant_id) conditions.push(sql`m.tenant_id = ${filters.tenant_id}`);
  if (filters.date_from) conditions.push(sql`m.created_at >= ${filters.date_from}`);
  if (filters.date_to) conditions.push(sql`m.created_at <= ${filters.date_to}`);
  const whereClause = sql.join(conditions, sql` AND `);

  const query = sql<MetricRow>`
    SELECT t.id AS tenant_id, t.name AS tenant_name, m.${sql.ref(metric.dimension)}::text AS bucket, ${valueExpr} AS value
    FROM ${sql.table(metric.table)} m
    JOIN tenants t ON t.id = m.tenant_id
    WHERE ${whereClause}
    GROUP BY t.id, t.name, m.${sql.ref(metric.dimension)}
    ORDER BY value DESC
  `;

  const result = await query.execute(db);
  return result.rows.map(r => ({ ...r, value: Number(r.value) }));
}
