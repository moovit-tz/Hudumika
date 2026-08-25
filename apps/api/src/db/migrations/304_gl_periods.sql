-- 304_gl_periods.sql
-- No GL-wide period locking existed — only vat_periods (jurisdiction-scoped,
-- VAT-only) has ever had a close/reopen lifecycle. Modeled directly on it:
-- same status/closed_at/closed_by/reopened_at/reopened_by/reopen_reason
-- shape, same "a reopen is a new fact, not an erasure" rule (the prior
-- snapshot is never cleared). Tenant-wide, not jurisdiction-scoped — a
-- fiscal period closes the whole ledger, not one tax authority's slice of
-- it. RLS from day one, same as every table this program adds.

CREATE TABLE gl_periods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  name            VARCHAR(200) NOT NULL,
  period_type     VARCHAR(10) NOT NULL DEFAULT 'MONTH' CHECK (period_type IN ('MONTH', 'YEAR')),
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  trial_balance_snapshot JSONB,
  closing_entry_id UUID,
  closed_at       TIMESTAMPTZ,
  closed_by       UUID,
  reopened_at     TIMESTAMPTZ,
  reopened_by     UUID,
  reopen_reason   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, period_start, period_end)
);

ALTER TABLE gl_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_periods FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gl_periods
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
