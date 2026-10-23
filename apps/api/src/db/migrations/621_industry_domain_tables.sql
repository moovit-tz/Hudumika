-- Migration 621: Domain-specific tables for property, construction, automotive, insurance, lending
-- Each links to the shared finance_industry_work row via work_id

-- ═══════════════════════════════════════════════════════════════
-- PROPERTY / RENTALS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE finance_property_units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  unit_type   TEXT NOT NULL CHECK (unit_type IN ('residential','commercial','industrial','land','parking','storage')),
  address     TEXT,
  area_sqm    NUMERIC(12,2),
  bedrooms    INT,
  status      TEXT NOT NULL DEFAULT 'vacant' CHECK (status IN ('vacant','occupied','maintenance','reserved')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE finance_property_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_property_units FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_property_units
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE finance_leases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  work_id          UUID NOT NULL REFERENCES finance_industry_work(id),
  unit_id          UUID NOT NULL REFERENCES finance_property_units(id),
  tenant_name      TEXT NOT NULL,
  lease_start      DATE NOT NULL,
  lease_end        DATE,
  rent_amount      NUMERIC(18,2) NOT NULL CHECK (rent_amount > 0),
  rent_currency    TEXT NOT NULL DEFAULT 'TZS',
  billing_cycle    TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('weekly','monthly','quarterly','annually')),
  deposit_amount   NUMERIC(18,2) NOT NULL DEFAULT 0,
  escalation_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
  escalation_freq  TEXT CHECK (escalation_freq IN ('annually','biannually',NULL)),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','expired','terminated')),
  terminated_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE finance_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_leases FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_leases
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE finance_lease_charges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  lease_id     UUID NOT NULL REFERENCES finance_leases(id),
  charge_type  TEXT NOT NULL CHECK (charge_type IN ('rent','utility','service_charge','parking','deposit','penalty','other')),
  description  TEXT NOT NULL,
  amount       NUMERIC(18,2) NOT NULL,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  due_date     DATE NOT NULL,
  invoice_id   UUID REFERENCES sales_invoices(id),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invoiced','paid','waived')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE finance_lease_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_lease_charges FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_lease_charges
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ═══════════════════════════════════════════════════════════════
-- CONSTRUCTION
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE finance_boq_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  work_id      UUID NOT NULL REFERENCES finance_industry_work(id),
  item_no      TEXT NOT NULL,
  description  TEXT NOT NULL,
  unit         TEXT NOT NULL DEFAULT 'LS',
  quantity     NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  rate         NUMERIC(18,2) NOT NULL CHECK (rate >= 0),
  amount       NUMERIC(18,2) GENERATED ALWAYS AS (quantity * rate) STORED,
  certified_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
  retention_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, work_id, item_no)
);
ALTER TABLE finance_boq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_boq_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_boq_items
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE finance_progress_certificates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  work_id         UUID NOT NULL REFERENCES finance_industry_work(id),
  certificate_no  INT NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  gross_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,
  retention       NUMERIC(18,2) NOT NULL DEFAULT 0,
  previous_certs  NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','invoiced','paid')),
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  invoice_id      UUID REFERENCES sales_invoices(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, work_id, certificate_no)
);
ALTER TABLE finance_progress_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_progress_certificates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_progress_certificates
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE finance_progress_measurements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  certificate_id  UUID NOT NULL REFERENCES finance_progress_certificates(id),
  boq_item_id     UUID NOT NULL REFERENCES finance_boq_items(id),
  qty_this_period NUMERIC(18,4) NOT NULL CHECK (qty_this_period >= 0),
  qty_cumulative  NUMERIC(18,4) NOT NULL CHECK (qty_cumulative >= 0),
  amount          NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE finance_progress_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_progress_measurements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_progress_measurements
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ═══════════════════════════════════════════════════════════════
-- AUTOMOTIVE / WORKSHOP
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE finance_vehicle_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  customer_id    UUID REFERENCES customers(id),
  registration   TEXT NOT NULL,
  make           TEXT,
  model          TEXT,
  year           INT,
  vin            TEXT,
  mileage        INT,
  color          TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, registration)
);
ALTER TABLE finance_vehicle_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_vehicle_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_vehicle_records
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE finance_job_cards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  work_id        UUID NOT NULL REFERENCES finance_industry_work(id),
  vehicle_id     UUID NOT NULL REFERENCES finance_vehicle_records(id),
  mileage_in     INT,
  reported_fault TEXT NOT NULL,
  diagnosis      TEXT,
  bay_number     TEXT,
  technician_id  UUID REFERENCES users(id),
  estimated_hours NUMERIC(6,2),
  actual_hours   NUMERIC(6,2),
  status         TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','diagnosing','awaiting_parts','in_progress','quality_check','ready','delivered')),
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  delivered_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE finance_job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_job_cards FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_job_cards
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ═══════════════════════════════════════════════════════════════
-- INSURANCE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE finance_insurance_policies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  work_id           UUID NOT NULL REFERENCES finance_industry_work(id),
  policy_number     TEXT NOT NULL,
  policy_type       TEXT NOT NULL CHECK (policy_type IN ('life','health','motor','property','liability','marine','travel','other')),
  holder_name       TEXT NOT NULL,
  holder_contact    TEXT,
  coverage_start    DATE NOT NULL,
  coverage_end      DATE NOT NULL,
  sum_insured       NUMERIC(18,2) NOT NULL CHECK (sum_insured > 0),
  premium_amount    NUMERIC(18,2) NOT NULL CHECK (premium_amount > 0),
  premium_frequency TEXT NOT NULL DEFAULT 'annual' CHECK (premium_frequency IN ('monthly','quarterly','semi_annual','annual','single')),
  currency          TEXT NOT NULL DEFAULT 'TZS',
  deductible        NUMERIC(18,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','lapsed','cancelled','expired','claimed')),
  underwriter_notes TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, policy_number)
);
ALTER TABLE finance_insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_insurance_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_insurance_policies
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE finance_insurance_claims (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  policy_id      UUID NOT NULL REFERENCES finance_insurance_policies(id),
  claim_number   TEXT NOT NULL,
  incident_date  DATE NOT NULL,
  reported_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  description    TEXT NOT NULL,
  claim_amount   NUMERIC(18,2) NOT NULL CHECK (claim_amount > 0),
  approved_amount NUMERIC(18,2),
  reserve_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','investigating','approved','denied','settled','closed')),
  adjuster_id    UUID REFERENCES users(id),
  settlement_date DATE,
  denial_reason  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, claim_number)
);
ALTER TABLE finance_insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_insurance_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_insurance_claims
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ═══════════════════════════════════════════════════════════════
-- LENDING / MICROFINANCE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE finance_loans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  work_id           UUID NOT NULL REFERENCES finance_industry_work(id),
  loan_number       TEXT NOT NULL,
  product_name      TEXT NOT NULL,
  borrower_name     TEXT NOT NULL,
  principal         NUMERIC(18,2) NOT NULL CHECK (principal > 0),
  interest_rate     NUMERIC(8,4) NOT NULL CHECK (interest_rate >= 0),
  interest_method   TEXT NOT NULL DEFAULT 'flat' CHECK (interest_method IN ('flat','reducing_balance','compound')),
  term_months       INT NOT NULL CHECK (term_months > 0),
  currency          TEXT NOT NULL DEFAULT 'TZS',
  disbursed_amount  NUMERIC(18,2),
  disbursed_at      TIMESTAMPTZ,
  maturity_date     DATE,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','disbursed','active','arrears','restructured','closed','written_off')),
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  collateral_desc   TEXT,
  guarantor_name    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, loan_number)
);
ALTER TABLE finance_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_loans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_loans
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE finance_loan_schedule (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  loan_id        UUID NOT NULL REFERENCES finance_loans(id),
  instalment_no  INT NOT NULL CHECK (instalment_no > 0),
  due_date       DATE NOT NULL,
  principal_due  NUMERIC(18,2) NOT NULL DEFAULT 0,
  interest_due   NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_due      NUMERIC(18,2) GENERATED ALWAYS AS (principal_due + interest_due) STORED,
  principal_paid NUMERIC(18,2) NOT NULL DEFAULT 0,
  interest_paid  NUMERIC(18,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partial','paid','overdue','waived')),
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, loan_id, instalment_no)
);
ALTER TABLE finance_loan_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_loan_schedule FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_loan_schedule
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE finance_loan_repayments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  loan_id        UUID NOT NULL REFERENCES finance_loans(id),
  amount         NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  principal_part NUMERIC(18,2) NOT NULL DEFAULT 0,
  interest_part  NUMERIC(18,2) NOT NULL DEFAULT 0,
  penalty_part   NUMERIC(18,2) NOT NULL DEFAULT 0,
  payment_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  reference      TEXT,
  received_by    UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE finance_loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_loan_repayments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_loan_repayments
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Indexes for common queries
CREATE INDEX idx_property_units_tenant ON finance_property_units(tenant_id);
CREATE INDEX idx_leases_tenant_unit ON finance_leases(tenant_id, unit_id);
CREATE INDEX idx_leases_work ON finance_leases(tenant_id, work_id);
CREATE INDEX idx_lease_charges_lease ON finance_lease_charges(tenant_id, lease_id);
CREATE INDEX idx_boq_items_work ON finance_boq_items(tenant_id, work_id);
CREATE INDEX idx_progress_certs_work ON finance_progress_certificates(tenant_id, work_id);
CREATE INDEX idx_progress_measurements_cert ON finance_progress_measurements(tenant_id, certificate_id);
CREATE INDEX idx_vehicle_records_tenant ON finance_vehicle_records(tenant_id);
CREATE INDEX idx_vehicle_records_customer ON finance_vehicle_records(tenant_id, customer_id);
CREATE INDEX idx_job_cards_work ON finance_job_cards(tenant_id, work_id);
CREATE INDEX idx_job_cards_vehicle ON finance_job_cards(tenant_id, vehicle_id);
CREATE INDEX idx_insurance_policies_work ON finance_insurance_policies(tenant_id, work_id);
CREATE INDEX idx_insurance_claims_policy ON finance_insurance_claims(tenant_id, policy_id);
CREATE INDEX idx_loans_work ON finance_loans(tenant_id, work_id);
CREATE INDEX idx_loan_schedule_loan ON finance_loan_schedule(tenant_id, loan_id);
CREATE INDEX idx_loan_repayments_loan ON finance_loan_repayments(tenant_id, loan_id);
