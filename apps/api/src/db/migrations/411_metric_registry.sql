-- 411_metric_registry.sql
--
-- The Metric Definition Registry: one catalog every metric-consuming
-- surface reads from, instead of each surface (HuduBI's dashboard builder,
-- the platform Query Builder, each app's own KPI strip) hardcoding its own
-- list. This does not replace HuduBI's existing hudubi-widgets.service.ts
-- ── that file's HUDUBI_METRICS array and runHuduBIMetric() runner stay
-- exactly as they are (real, working, wired to hudubi_widget_definitions).
-- What this adds is the missing cross-app catalog layer above it: a real
-- table an administrator can browse/extend, that a new app can register
-- into, and that other surfaces (Query Builder, a future Metric Explorer)
-- can discover metrics from — keyed on the SAME metric_key values HuduBI
-- already uses, so "sla_compliance" means one thing everywhere rather than
-- three independent implementations drifting apart.
--
-- Deliberately NOT tenant-scoped (no tenant_id, no RLS): this is a
-- definitions catalog, not tenant data — same shape as marketplace_apps
-- and the Query Builder's own ALLOWED_TABLES allowlist. The VALUES a
-- metric computes to are always tenant-scoped at read time, through
-- withTenant(), same as every other query in this codebase; nothing here
-- ever stores a computed value across tenants.
CREATE TABLE metric_definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key    TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  -- Which app/module owns this metric's source data — matches AppId values
  -- in packages/types (clearos, finops, bliss, ...), not a free-text label.
  app           TEXT NOT NULL,
  module        TEXT,
  -- One of the classification buckets §40 of the metrics program asked
  -- for: platform, business, operational, financial, customer, employee,
  -- technical, security, ai, cost, quality, compliance.
  domain        TEXT NOT NULL,
  -- 'declarative' = generic COUNT/SUM over one table+dimension, computed by
  --   hudubi-widgets.service.ts's runDeclarativeMetric — config below
  --   mirrors that function's DeclarativeMetric shape exactly.
  -- 'special'     = a real, existing, hand-written calculation (e.g. Bliss
  --   SLA compliance) that a generic runner cannot safely reproduce.
  --   config carries only documentation fields here; the actual formula
  --   stays in the one real service function it always lived in — see
  --   metrics-registry.service.ts's SPECIAL_METRIC_HANDLERS map.
  kind          TEXT NOT NULL CHECK (kind IN ('declarative', 'special')),
  -- For 'declarative': { table, agg, sumColumn?, dimension?, timeSeries? }.
  -- For 'special': { sourceTables: [...], formula: '<plain-English trace>' }
  -- — the lineage text a Metric Explorer "how is this calculated" panel
  -- renders directly; never executed, purely descriptive for that kind.
  config        JSONB NOT NULL DEFAULT '{}',
  unit          TEXT NOT NULL DEFAULT 'count',   -- count | percent | hours | currency | score
  format        TEXT NOT NULL DEFAULT 'number',  -- number | percent | duration | currency
  -- Who to ask when the formula looks wrong. Free text — this platform has
  -- no formal metric-ownership directory yet.
  owner         TEXT,
  -- Coarse RBAC: a metric touching payroll/HR or financial ledger data is
  -- 'restricted' (MGMT_ROLES-and-above only, enforced in metrics.routes.ts,
  -- not just hidden client-side); everything else is 'standard'.
  visibility    TEXT NOT NULL DEFAULT 'standard' CHECK (visibility IN ('standard', 'restricted')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated')),
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metric_definitions_app ON metric_definitions(app);
CREATE INDEX idx_metric_definitions_domain ON metric_definitions(domain);

-- ── Seed: the 13 metrics HuduBI already computes today (hudubi-widgets.
-- service.ts's HUDUBI_METRICS array), registered under the identical
-- metric_key values so this catalog and HuduBI's own runner are describing
-- the same 13 things, not a parallel set. -------------------------------
INSERT INTO metric_definitions (metric_key, name, description, app, module, domain, kind, config, unit, format, owner) VALUES
('active_cases', 'Active cases', 'Count of shipment cases created in the selected period.', 'clearos', 'shipments', 'operational', 'declarative',
  '{"table":"shipment_cases","agg":"count"}', 'count', 'number', 'ClearOS Ops'),
('customers_count', 'Customers', 'Count of customer records created in the selected period.', 'crm', 'customers', 'customer', 'declarative',
  '{"table":"customers","agg":"count"}', 'count', 'number', 'CRM'),
('declarations_count', 'Declarations', 'Count of customs declarations lodged in the selected period.', 'clearos', 'declarations', 'operational', 'declarative',
  '{"table":"declarations","agg":"count"}', 'count', 'number', 'ClearOS Ops'),
('consignment_value_usd', 'Consignment value (USD)', 'Sum of CIF value across shipment cases in the selected period.', 'clearos', 'shipments', 'business', 'declarative',
  '{"table":"shipment_cases","agg":"sum","sumColumn":"cif_value_usd"}', 'currency', 'currency', 'ClearOS Ops'),
('revenue_tzs', 'Revenue (TZS)', 'Sum of sales invoice totals (incl.) in the selected period.', 'finops', 'invoicing', 'financial', 'declarative',
  '{"table":"sales_invoices","agg":"sum","sumColumn":"tra_total_incl"}', 'currency', 'currency', 'FinOps'),
('shipment_pipeline', 'Shipment pipeline by stage', 'Shipment case count grouped by clearance stage.', 'clearos', 'shipments', 'operational', 'declarative',
  '{"table":"shipment_cases","agg":"count","dimension":"stage"}', 'count', 'number', 'ClearOS Ops'),
('shipments_by_mode', 'Shipments by mode', 'Shipment case count grouped by transport mode.', 'clearos', 'shipments', 'operational', 'declarative',
  '{"table":"shipment_cases","agg":"count","dimension":"type"}', 'count', 'number', 'ClearOS Ops'),
('customers_by_segment', 'Customers by segment', 'Customer count grouped by category.', 'crm', 'customers', 'customer', 'declarative',
  '{"table":"customers","agg":"count","dimension":"category"}', 'count', 'number', 'CRM'),
('monthly_volume', 'Monthly shipment volume', 'Shipment case count, monthly time series.', 'clearos', 'shipments', 'operational', 'declarative',
  '{"table":"shipment_cases","agg":"count","timeSeries":true}', 'count', 'number', 'ClearOS Ops'),
('cif_by_mode', 'CIF value by mode', 'Sum of CIF value grouped by transport mode.', 'clearos', 'shipments', 'business', 'declarative',
  '{"table":"shipment_cases","agg":"sum","sumColumn":"cif_value_usd","dimension":"type"}', 'currency', 'currency', 'ClearOS Ops'),
('top_origin_ports', 'Top origin ports', 'Shipment case count grouped by origin port, top 8.', 'clearos', 'shipments', 'operational', 'declarative',
  '{"table":"shipment_cases","agg":"count","dimension":"origin_port","limit":8}', 'count', 'number', 'ClearOS Ops'),
('expenses_tzs', 'Expenses (TZS)', 'Sum of expenses across the expenses and finance_expenses tables.', 'finops', 'expenses', 'financial', 'special',
  '{"sourceTables":["expenses","finance_expenses"],"formula":"SUM(expenses.amount_tzs) + SUM(finance_expenses.amount) for the period"}', 'currency', 'currency', 'FinOps'),
('top_customers', 'Top customers', 'Customers ranked by shipment case count in the period.', 'crm', 'customers', 'customer', 'special',
  '{"sourceTables":["shipment_cases","customers"],"formula":"shipment_cases JOIN customers, COUNT(*) GROUP BY customer, top 8"}', 'count', 'number', 'CRM');

-- ── New: Bliss support metrics — real, already-computed by support.
-- routes.ts's GET /metrics (now shared via support-metrics.service.ts's
-- computeBlissKpis, so this registry entry and that endpoint can never
-- silently drift apart — one calculation, two consumers. -----------------
INSERT INTO metric_definitions (metric_key, name, description, app, module, domain, kind, config, unit, format, owner) VALUES
('bliss.sla_compliance', 'SLA compliance', 'Share of tickets with an SLA deadline that were resolved (or remain open) before that deadline.', 'bliss', 'support', 'operational', 'special',
  '{"sourceTables":["support_tickets"],"formula":"resolved_at (or now(), if still open) <= sla_deadline, as a % of tickets with a deadline"}', 'percent', 'percent', 'Bliss'),
('bliss.csat', 'CSAT score', 'Average customer satisfaction score (1–5) across tickets with a submitted rating.', 'bliss', 'support', 'customer', 'special',
  '{"sourceTables":["support_tickets"],"formula":"AVG(csat_score) over tickets where csat_score IS NOT NULL"}', 'score', 'number', 'Bliss'),
('bliss.first_reply_hours', 'Avg first-response time', 'Average hours from ticket creation to the first agent reply.', 'bliss', 'support', 'operational', 'special',
  '{"sourceTables":["support_tickets"],"formula":"AVG(first_reply_time_seconds) / 3600 over tickets with a recorded first reply"}', 'hours', 'duration', 'Bliss'),
('bliss.resolution_hours', 'Avg resolution time', 'Average hours from ticket creation to resolution.', 'bliss', 'support', 'operational', 'special',
  '{"sourceTables":["support_tickets"],"formula":"AVG(resolution_time_seconds) / 3600 over resolved tickets"}', 'hours', 'duration', 'Bliss'),
('bliss.escalation_rate', 'Escalation rate', 'Share of tickets that were SLA-escalated by the automation engine.', 'bliss', 'support', 'operational', 'special',
  '{"sourceTables":["support_tickets"],"formula":"COUNT(sla_escalated_at IS NOT NULL) / COUNT(*) as a %"}', 'percent', 'percent', 'Bliss'),
('bliss.ticket_volume', 'Ticket volume', 'Total tickets created in the selected period.', 'bliss', 'support', 'operational', 'special',
  '{"sourceTables":["support_tickets"],"formula":"COUNT(*) for the period"}', 'count', 'number', 'Bliss');
