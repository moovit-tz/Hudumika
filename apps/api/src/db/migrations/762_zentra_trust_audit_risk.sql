-- Migration 762: Zentra — Shared trust, risk, audit, and compliance foundation
--
-- Zentra provides:
--   1. zentra_audit_events       Immutable, tenant-isolated audit event log.
--   2. zentra_event_outbox       Transactional outbox for reliable, decoupled event delivery.
--   3. zentra_risk_rules         Explainable deterministic risk detection rules.
--   4. zentra_risk_signals       Detected risk signals with evidence references.
--   5. zentra_investigation_cases Investigation workflow, evidence linking, and resolution.
--   6. zentra_policies           Record-level authorization and visibility policies.
--   7. zentra_settings           Tenant-level retention, telemetry monitoring, and alert settings.
--   8. zentra_platform_audit     Cross-tenant oversight audit trail (SUPER_ADMIN only).

-- ── 1. Audit Events ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zentra_audit_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_id            VARCHAR(64) NOT NULL,
  event_name        VARCHAR(128) NOT NULL,
  actor_id          VARCHAR(128) NOT NULL,
  actor_role        VARCHAR(64),
  actor_name        VARCHAR(255),
  actor_ip          VARCHAR(45),
  actor_user_agent  TEXT,
  resource_type     VARCHAR(64) NOT NULL,
  resource_id       VARCHAR(128) NOT NULL,
  action            VARCHAR(64) NOT NULL,
  outcome           VARCHAR(20) NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
  correlation_id    VARCHAR(128),
  schema_version    VARCHAR(16) NOT NULL DEFAULT 'v1',
  safe_summary      TEXT,
  safe_metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zentra_events_tenant_created ON zentra_audit_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zentra_events_actor ON zentra_audit_events (tenant_id, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zentra_events_name ON zentra_audit_events (tenant_id, event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zentra_events_resource ON zentra_audit_events (tenant_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_zentra_events_app ON zentra_audit_events (tenant_id, app_id, created_at DESC);

ALTER TABLE zentra_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE zentra_audit_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON zentra_audit_events;
CREATE POLICY tenant_isolation ON zentra_audit_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);


-- ── 2. Transactional Outbox ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zentra_event_outbox (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_id            VARCHAR(64) NOT NULL,
  event_name        VARCHAR(128) NOT NULL,
  payload           JSONB NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count       INT NOT NULL DEFAULT 0,
  max_retries       INT NOT NULL DEFAULT 5,
  last_error        TEXT,
  idempotency_key   VARCHAR(128) UNIQUE,
  scheduled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zentra_outbox_queue ON zentra_event_outbox (status, scheduled_at) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_zentra_outbox_tenant ON zentra_event_outbox (tenant_id, created_at DESC);

ALTER TABLE zentra_event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE zentra_event_outbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON zentra_event_outbox;
CREATE POLICY tenant_isolation ON zentra_event_outbox
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);


-- ── 3. Risk Rules ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zentra_risk_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        VARCHAR(64) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category    VARCHAR(64) NOT NULL CHECK (category IN ('access_control', 'data_exfiltration', 'financial', 'privilege', 'operational', 'telemetry')),
  severity    VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  enabled     BOOLEAN NOT NULL DEFAULT true,
  parameters  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_zentra_rules_tenant ON zentra_risk_rules (tenant_id, enabled);

ALTER TABLE zentra_risk_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE zentra_risk_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON zentra_risk_rules;
CREATE POLICY tenant_isolation ON zentra_risk_rules
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);


-- ── 4. Risk Signals ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zentra_risk_signals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_id              VARCHAR(64) NOT NULL,
  rule_id             UUID REFERENCES zentra_risk_rules(id) ON DELETE SET NULL,
  rule_code           VARCHAR(64) NOT NULL,
  title               VARCHAR(255) NOT NULL,
  description         TEXT NOT NULL,
  severity            VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status              VARCHAR(20) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'TRIAGED', 'CASE_OPEN', 'RESOLVED', 'FALSE_POSITIVE')),
  actor_id            VARCHAR(128),
  actor_name          VARCHAR(255),
  resource_type       VARCHAR(64),
  resource_id         VARCHAR(128),
  evidence_event_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_summary    TEXT,
  resolution_notes    TEXT,
  resolved_by         VARCHAR(128),
  resolved_at         TIMESTAMPTZ,
  case_id             UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zentra_signals_tenant ON zentra_risk_signals (tenant_id, status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zentra_signals_app ON zentra_risk_signals (tenant_id, app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zentra_signals_rule ON zentra_risk_signals (tenant_id, rule_code);

ALTER TABLE zentra_risk_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE zentra_risk_signals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON zentra_risk_signals;
CREATE POLICY tenant_isolation ON zentra_risk_signals
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);


-- ── 5. Investigation Cases ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zentra_investigation_cases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_number         VARCHAR(64) NOT NULL,
  title               VARCHAR(255) NOT NULL,
  summary             TEXT NOT NULL,
  severity            VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status              VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'REMEDIATION', 'CLOSED')),
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_name    VARCHAR(255),
  lead_signal_id      UUID REFERENCES zentra_risk_signals(id) ON DELETE SET NULL,
  evidence_event_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
  internal_notes      JSONB NOT NULL DEFAULT '[]'::jsonb,
  timeline            JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolution          TEXT,
  resolution_outcome  VARCHAR(32) CHECK (resolution_outcome IN ('remediated', 'policy_updated', 'false_positive', 'no_action_needed', 'escalated')),
  closed_by           VARCHAR(128),
  closed_at           TIMESTAMPTZ,
  created_by          VARCHAR(128) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, case_number)
);

CREATE INDEX IF NOT EXISTS idx_zentra_cases_tenant ON zentra_investigation_cases (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zentra_cases_assigned ON zentra_investigation_cases (tenant_id, assigned_to_user_id);

ALTER TABLE zentra_investigation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE zentra_investigation_cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON zentra_investigation_cases;
CREATE POLICY tenant_isolation ON zentra_investigation_cases
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);


-- ── 6. Policies ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zentra_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  resource_type   VARCHAR(64) NOT NULL,
  action          VARCHAR(64) NOT NULL,
  subject_type    VARCHAR(32) NOT NULL CHECK (subject_type IN ('role', 'user', 'team', 'service')),
  subject_id      VARCHAR(64) NOT NULL,
  effect          VARCHAR(10) NOT NULL CHECK (effect IN ('allow', 'deny')),
  condition_type  VARCHAR(32) NOT NULL CHECK (condition_type IN ('always', 'owner_only', 'assigned_only', 'team_only', 'classification_le', 'amount_lt')),
  condition_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zentra_policies_tenant ON zentra_policies (tenant_id, resource_type, action, enabled);

ALTER TABLE zentra_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE zentra_policies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON zentra_policies;
CREATE POLICY tenant_isolation ON zentra_policies
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);


-- ── 7. Settings ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zentra_settings (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  retention_days                INT NOT NULL DEFAULT 365,
  alert_email                   VARCHAR(255),
  alert_min_severity            VARCHAR(20) NOT NULL DEFAULT 'HIGH' CHECK (alert_min_severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  telemetry_monitoring_enabled  BOOLEAN NOT NULL DEFAULT true,
  monitored_apps                JSONB NOT NULL DEFAULT '["clearos","finance","complyos","nexushr","sign","bliss","crm"]'::jsonb,
  dormant_threshold_hours       INT NOT NULL DEFAULT 48,
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE zentra_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE zentra_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON zentra_settings;
CREATE POLICY tenant_isolation ON zentra_settings
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);


-- ── 8. Platform Audit (SUPER_ADMIN Only) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS zentra_platform_audit (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name            VARCHAR(255) NOT NULL,
  actor_email           VARCHAR(255) NOT NULL,
  action                VARCHAR(64) NOT NULL,
  target_tenant_id      UUID REFERENCES tenants(id) ON DELETE SET NULL,
  target_tenant_name    VARCHAR(255),
  target_resource_type  VARCHAR(64),
  target_resource_id    VARCHAR(128),
  reason                TEXT,
  ip_address            VARCHAR(45),
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zentra_pa_created ON zentra_platform_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zentra_pa_target_tenant ON zentra_platform_audit (target_tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zentra_pa_actor ON zentra_platform_audit (actor_user_id, created_at DESC);

