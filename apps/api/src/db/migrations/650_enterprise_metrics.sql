-- Phase L: Enterprise metrics, dashboards, bounded queries, indexes,
-- durable jobs, bulk operations, per-tenant resource limits.

-- ── 1. Platform metrics snapshots (platform-scoped) ────────────────
CREATE TABLE IF NOT EXISTS platform_metric_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  metric_type       TEXT NOT NULL
    CHECK (metric_type IN ('daily', 'weekly', 'monthly')),
  total_tenants     INTEGER NOT NULL DEFAULT 0,
  active_tenants    INTEGER NOT NULL DEFAULT 0,
  total_users       INTEGER NOT NULL DEFAULT 0,
  active_users_7d   INTEGER NOT NULL DEFAULT 0,
  total_permits     INTEGER NOT NULL DEFAULT 0,
  permits_expiring_30d INTEGER NOT NULL DEFAULT 0,
  total_subscriptions INTEGER NOT NULL DEFAULT 0,
  paid_subscriptions INTEGER NOT NULL DEFAULT 0,
  mrr_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  mrr_currency      TEXT NOT NULL DEFAULT 'TZS',
  provider_count    INTEGER NOT NULL DEFAULT 0,
  marketplace_engagements INTEGER NOT NULL DEFAULT 0,
  support_tickets_open INTEGER NOT NULL DEFAULT 0,
  queue_depth       INTEGER NOT NULL DEFAULT 0,
  infrastructure    JSONB NOT NULL DEFAULT '{}',
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, metric_type)
);

-- Platform-scoped: no tenant_id, managed via dbPlatform.
-- No RLS needed (only platform operators query this).

CREATE INDEX IF NOT EXISTS idx_pms_date ON platform_metric_snapshots(snapshot_date DESC, metric_type);

-- ── 2. Tenant metrics (tenant-scoped) ──────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_metric_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  snapshot_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  metric_type       TEXT NOT NULL DEFAULT 'daily'
    CHECK (metric_type IN ('daily', 'weekly', 'monthly')),
  entity_count      INTEGER NOT NULL DEFAULT 0,
  site_count        INTEGER NOT NULL DEFAULT 0,
  user_count        INTEGER NOT NULL DEFAULT 0,
  permit_count      INTEGER NOT NULL DEFAULT 0,
  permits_active    INTEGER NOT NULL DEFAULT 0,
  permits_expiring  INTEGER NOT NULL DEFAULT 0,
  permits_expired   INTEGER NOT NULL DEFAULT 0,
  compliance_score  NUMERIC(5,2),
  total_cost_ytd    NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_currency     TEXT NOT NULL DEFAULT 'TZS',
  renewal_work_pending INTEGER NOT NULL DEFAULT 0,
  blockers          INTEGER NOT NULL DEFAULT 0,
  app_usage         JSONB NOT NULL DEFAULT '{}',
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, snapshot_date, metric_type)
);

ALTER TABLE tenant_metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_metric_snapshots FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'tenant_metric_snapshots'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON tenant_metric_snapshots
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tms_tenant ON tenant_metric_snapshots(tenant_id, snapshot_date DESC);

-- ── 3. Tenant resource limits ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_resource_limits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_type     TEXT NOT NULL
    CHECK (resource_type IN ('users', 'storage_mb', 'api_calls_daily',
           'permits', 'entities', 'sites', 'exports_daily', 'imports_daily',
           'marketplace_listings', 'mandates', 'custom')),
  max_allowed       INTEGER NOT NULL,
  current_usage     INTEGER NOT NULL DEFAULT 0,
  enforcement       TEXT NOT NULL DEFAULT 'soft'
    CHECK (enforcement IN ('soft', 'hard', 'warn')),
  overage_action    TEXT NOT NULL DEFAULT 'warn'
    CHECK (overage_action IN ('block', 'warn', 'charge', 'log')),
  last_checked_at   TIMESTAMPTZ,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, resource_type)
);

ALTER TABLE tenant_resource_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_resource_limits FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'tenant_resource_limits'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON tenant_resource_limits
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trl_tenant ON tenant_resource_limits(tenant_id, resource_type);

-- ── 4. Durable job queue ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS durable_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id) ON DELETE CASCADE,
  job_type          TEXT NOT NULL,
  job_key           TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'retrying')),
  payload           JSONB NOT NULL DEFAULT '{}',
  result            JSONB,
  priority          INTEGER NOT NULL DEFAULT 0,
  max_retries       INTEGER NOT NULL DEFAULT 3,
  retry_count       INTEGER NOT NULL DEFAULT 0,
  error_message     TEXT,
  scheduled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, job_type, job_key)
);

ALTER TABLE durable_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE durable_jobs FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'durable_jobs'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON durable_jobs
      USING (
        tenant_id IS NULL
        OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dj_tenant ON durable_jobs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dj_schedule ON durable_jobs(status, scheduled_at)
  WHERE status IN ('pending', 'retrying');

-- ── 5. Bulk operation tracking ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS bulk_operations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  operation_type    TEXT NOT NULL
    CHECK (operation_type IN ('import', 'export', 'bulk_update', 'migration', 'reconciliation')),
  source_type       TEXT,
  target_type       TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'partial')),
  total_records     INTEGER NOT NULL DEFAULT 0,
  processed_records INTEGER NOT NULL DEFAULT 0,
  failed_records    INTEGER NOT NULL DEFAULT 0,
  error_summary     JSONB,
  file_url          TEXT,
  result_url        TEXT,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bulk_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_operations FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'bulk_operations'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON bulk_operations
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bo_tenant ON bulk_operations(tenant_id, status);

-- ── 6. Key performance indexes (query plan based) ──────────────────
-- Compound indexes for the most common dashboard queries.
CREATE INDEX IF NOT EXISTS idx_comply_certs_tenant_status ON comply_certificates(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_comply_certs_expiry ON comply_certificates(expiry_date)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_delegate_mandates_active ON delegation_mandates(status, effective_to)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_mkt_assignments_due ON marketplace_assignments(due_date, status)
  WHERE status NOT IN ('completed', 'cancelled');
