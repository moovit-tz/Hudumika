-- 414_metric_alerts.sql
--
-- Milestone 3 of the Metric Registry program (see 411/413): a real
-- alerting engine over the metric_definitions catalog. Tenant-scoped and
-- RLS-protected like every other tenant table — a threshold an ADMIN sets
-- for "their" SLA compliance is real tenant configuration, not a platform
-- definition, so this does NOT live in metric_definitions (that table has
-- no tenant_id by design — see its own migration header).
CREATE TABLE metric_alert_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_key     TEXT NOT NULL REFERENCES metric_definitions(metric_key) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  -- 'below' fires when value < threshold (e.g. SLA compliance below 90%);
  -- 'above' fires when value > threshold (e.g. AR overdue share above 50%).
  comparator     TEXT NOT NULL CHECK (comparator IN ('below', 'above')),
  threshold      NUMERIC NOT NULL,
  window_days    INTEGER NOT NULL DEFAULT 30 CHECK (window_days BETWEEN 1 AND 365),
  severity       TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  -- Which roles get notified — resolved to real users in this tenant at
  -- fire time, not stored as a frozen recipient list (a role grant added
  -- after the rule was created should still receive the next alert).
  notify_roles   JSONB NOT NULL DEFAULT '["SUPER_ADMIN","ADMIN","TENANT_ADMIN","MANAGER"]',
  enabled        BOOLEAN NOT NULL DEFAULT true,
  -- The state-transition guard: metric-alerts.job.ts only notifies on
  -- 'ok' -> 'breach' (and, quietly, 'breach' -> 'ok' recovery), never on
  -- every poll while still breached — the same "cooldown so it can't spam
  -- every run" shape as the missing-document reminder job's own guard.
  last_state     TEXT NOT NULL DEFAULT 'ok' CHECK (last_state IN ('ok', 'breach')),
  last_evaluated_at TIMESTAMPTZ,
  last_fired_at  TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metric_alert_rules_tenant ON metric_alert_rules(tenant_id, enabled);
CREATE INDEX idx_metric_alert_rules_metric ON metric_alert_rules(metric_key);

ALTER TABLE metric_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_alert_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_metric_alert_rules ON metric_alert_rules
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Append-only firing log — the audit trail for "when did this alert fire,
-- at what value, who was notified" (data lineage extends to alerts too,
-- not just to the metric's own source table).
CREATE TABLE metric_alert_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_id      UUID NOT NULL REFERENCES metric_alert_rules(id) ON DELETE CASCADE,
  metric_key   TEXT NOT NULL,
  event_type   TEXT NOT NULL CHECK (event_type IN ('breach', 'recovery')),
  value        NUMERIC NOT NULL,
  threshold    NUMERIC NOT NULL,
  severity     TEXT NOT NULL,
  notified_user_ids JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metric_alert_events_tenant ON metric_alert_events(tenant_id, created_at DESC);
CREATE INDEX idx_metric_alert_events_rule ON metric_alert_events(rule_id, created_at DESC);

ALTER TABLE metric_alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_alert_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_metric_alert_events ON metric_alert_events
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
