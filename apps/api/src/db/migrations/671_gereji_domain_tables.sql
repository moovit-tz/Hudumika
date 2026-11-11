-- Migration 671: Gereji — automotive workshop extension tables
-- Extends finance_vehicle_records + finance_job_cards (migration 621)
-- with repair estimates and warranty claim tracking.

-- ── Repair estimates (quoted work awaiting customer approval) ──

CREATE TABLE gereji_estimates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  estimate_number   TEXT NOT NULL,
  vehicle_id        UUID NOT NULL REFERENCES finance_vehicle_records(id),
  customer_id       UUID,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','approved','rejected','expired','converted')),
  labour_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  parts_total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total         NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'TZS',
  valid_until       DATE,
  notes             TEXT,
  job_card_id       UUID REFERENCES finance_job_cards(id),
  created_by        UUID REFERENCES users(id),
  approved_by       TEXT,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, estimate_number)
);
ALTER TABLE gereji_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_estimates FORCE ROW LEVEL SECURITY;
CREATE POLICY gereji_estimates_tenant ON gereji_estimates
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE gereji_estimate_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  estimate_id     UUID NOT NULL REFERENCES gereji_estimates(id) ON DELETE CASCADE,
  line_type       TEXT NOT NULL CHECK (line_type IN ('labour','part','sublet','misc')),
  description     TEXT NOT NULL,
  quantity        NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total           NUMERIC(14,2) NOT NULL DEFAULT 0,
  part_number     TEXT,
  sort_order      INT NOT NULL DEFAULT 0
);
ALTER TABLE gereji_estimate_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_estimate_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY gereji_estimate_lines_tenant ON gereji_estimate_lines
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_gereji_estimate_lines_est ON gereji_estimate_lines(estimate_id);

-- ── Warranty claims (parts + labour warranty tracking) ──

CREATE TABLE gereji_warranty_claims (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  claim_number      TEXT NOT NULL,
  vehicle_id        UUID NOT NULL REFERENCES finance_vehicle_records(id),
  job_card_id       UUID REFERENCES finance_job_cards(id),
  claim_type        TEXT NOT NULL DEFAULT 'parts'
                    CHECK (claim_type IN ('parts','labour','both')),
  status            TEXT NOT NULL DEFAULT 'submitted'
                    CHECK (status IN ('submitted','under_review','approved',
                                       'partially_approved','rejected','settled')),
  description       TEXT NOT NULL,
  claimed_amount    NUMERIC(14,2) NOT NULL,
  approved_amount   NUMERIC(14,2),
  currency          TEXT NOT NULL DEFAULT 'TZS',
  supplier_name     TEXT,
  supplier_ref      TEXT,
  warranty_start    DATE,
  warranty_end      DATE,
  submitted_by      UUID REFERENCES users(id),
  reviewed_by       UUID REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  settled_at        TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, claim_number)
);
ALTER TABLE gereji_warranty_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_warranty_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY gereji_warranty_claims_tenant ON gereji_warranty_claims
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_gereji_warranty_claims_status ON gereji_warranty_claims(tenant_id, status);
