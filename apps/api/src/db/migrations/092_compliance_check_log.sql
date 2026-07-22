-- Tenant-scoped log of Quick Compliance Check runs, powering the new
-- Compliance Overview tab's "recent activity" + metrics. Mirrors the
-- landed_cost_records / trade_wizard_searches logging pattern.
CREATE TABLE IF NOT EXISTS compliance_check_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  user_id         UUID,
  hs_code         VARCHAR(20) NOT NULL,
  hs_description  TEXT,
  origin_country  VARCHAR(4) NOT NULL,
  total_checks    INTEGER NOT NULL DEFAULT 0,
  required_count  INTEGER NOT NULL DEFAULT 0,
  risk_level      VARCHAR(10) NOT NULL DEFAULT 'LOW',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_check_log_tenant ON compliance_check_log(tenant_id, created_at DESC);
