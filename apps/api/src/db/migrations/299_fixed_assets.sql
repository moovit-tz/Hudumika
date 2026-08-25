-- 299_fixed_assets.sql
-- No fixed-asset register or depreciation existed at all — the only prior
-- artifact was the placeholder COA line 1503 Accumulated Depreciation,
-- seeded but never posted to. Straight-line only for v1 (matches what most
-- SMB accounting tools default to; other methods are a materially larger
-- sub-project). RLS from day one, same as every table this program adds.

CREATE TABLE fixed_assets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  name                  VARCHAR(300) NOT NULL,
  category              VARCHAR(50) DEFAULT 'OTHER',
  asset_account_code    VARCHAR(20) NOT NULL DEFAULT '1501',
  acquisition_date      DATE NOT NULL,
  cost                  NUMERIC(15,2) NOT NULL,
  salvage_value         NUMERIC(15,2) NOT NULL DEFAULT 0,
  useful_life_months    INT NOT NULL,
  depreciation_method   VARCHAR(20) NOT NULL DEFAULT 'STRAIGHT_LINE' CHECK (depreciation_method IN ('STRAIGHT_LINE')),
  status                VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISPOSED')),
  disposed_at           DATE,
  disposal_proceeds     NUMERIC(15,2),
  notes                 TEXT,
  created_by            UUID,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- One row per (asset, period posted) — the idempotency key for the monthly
-- job, same shape as cost-posting.service.ts's own (source_module,
-- source_id) idempotency check on journal_entries.
CREATE TABLE fixed_asset_depreciation_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  asset_id        UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_date     DATE NOT NULL,
  amount          NUMERIC(15,2) NOT NULL,
  journal_entry_id UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(asset_id, period_date)
);

ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON fixed_assets
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE fixed_asset_depreciation_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_asset_depreciation_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON fixed_asset_depreciation_entries
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Depreciation Expense — 5110 was already taken by M3's payroll work.
INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '5111', 'Depreciation Expense', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;
