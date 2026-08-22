-- Migration 280: Per-app package quotas.
--
-- packages.monthly_item_limit (078_usage_metering.sql) is a single blanket
-- monthly cap across every app a tenant touches. This adds a genuinely
-- per-app dimension on top of it: package_app_quotas(package_code, app_id)
-- -> monthly_limit, tiered independently per app (e.g. a 'growth' tenant
-- might get 200 ClearOS shipments/month but only 20 Petti disbursements).
-- Absent row for a given (package_code, app_id) = unlimited for that app
-- under that tier — same "no row = unlimited" convention monthly_item_limit
-- itself already uses (see usage.ts's getMonthlyLimit). Both the blanket
-- limit and any per-app limit apply; whichever is hit first blocks the
-- request (see lib/usage.ts's checkAppUsageLimit / middleware/entitlement.ts).
--
-- Not seeded here — every tenant starts unlimited per-app until a SuperAdmin
-- sets a real number for a real reason, same as monthly_item_limit was a
-- deliberate per-tier decision, not a default every table should carry.
CREATE TABLE IF NOT EXISTS package_app_quotas (
  package_code TEXT NOT NULL,
  app_id TEXT NOT NULL,
  monthly_limit INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (package_code, app_id)
);

-- Per-tenant, per-app, per-calendar-month counter — one dimension wider than
-- tenant_usage_counters (078), same shape otherwise. Incremented from the
-- same onResponse hook (index.ts) that already increments the blanket
-- counter, keyed by the featureKey requireEntitlement() already resolved
-- for this request (middleware/entitlement.ts stashes it on the request) —
-- not a new route-prefix mapping, reusing the app identity every gated
-- route already declares.
CREATE TABLE IF NOT EXISTS tenant_app_usage_counters (
  tenant_id  UUID NOT NULL,
  app_id     TEXT NOT NULL,
  period     CHAR(7) NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, app_id, period)
);
CREATE INDEX IF NOT EXISTS idx_tenant_app_usage_tenant ON tenant_app_usage_counters(tenant_id);

ALTER TABLE tenant_app_usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_app_usage_counters FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'tenant_app_usage_counters'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON tenant_app_usage_counters
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
