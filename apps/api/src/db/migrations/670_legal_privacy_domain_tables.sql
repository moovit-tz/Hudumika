-- Migration 657: Legal practice + Privacy compliance domain tables
-- LexCore (law firm ERP) and Ngao (PDPC privacy tool) share a common
-- legal/privacy infrastructure.  LexCore owns matters/time/trust/conflicts;
-- Ngao owns assessments/incidents and reuses existing processing_activities
-- + consent_records (migration 523).

-- ═══════════════════════════════════════════════════════════════════
-- LEXCORE — Legal Practice Management
-- ═══════════════════════════════════════════════════════════════════

-- ── Clients (law firm clients — distinct from CRM customers) ──

CREATE TABLE legal_clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  client_number TEXT,
  client_type   TEXT NOT NULL DEFAULT 'individual'
                CHECK (client_type IN ('individual','company','government','ngo')),
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  tax_id        TEXT,
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_number)
);
ALTER TABLE legal_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_clients FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_clients_tenant ON legal_clients
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── Matters (cases / engagements) ──

CREATE TABLE legal_matters (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  matter_number     TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  client_id         UUID REFERENCES legal_clients(id),
  matter_type       TEXT NOT NULL DEFAULT 'general'
                    CHECK (matter_type IN ('litigation','corporate','real_estate',
                                            'employment','ip','tax','criminal',
                                            'family','immigration','general')),
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','active','on_hold','closed','archived')),
  practice_area     TEXT,
  responsible_attorney_id UUID REFERENCES users(id),
  originating_attorney_id UUID REFERENCES users(id),
  court_name        TEXT,
  court_case_number TEXT,
  opposing_party    TEXT,
  opposing_counsel  TEXT,
  date_opened       DATE NOT NULL DEFAULT CURRENT_DATE,
  date_closed       DATE,
  statute_of_limitations DATE,
  billing_method    TEXT NOT NULL DEFAULT 'hourly'
                    CHECK (billing_method IN ('hourly','fixed','contingency','pro_bono','retainer')),
  billing_rate      NUMERIC(10,2),
  estimated_value   NUMERIC(14,2),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, matter_number)
);
ALTER TABLE legal_matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_matters FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_matters_tenant ON legal_matters
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_legal_matters_status ON legal_matters(tenant_id, status);
CREATE INDEX idx_legal_matters_client ON legal_matters(client_id);

-- ── Time entries (billable/non-billable hours against matters) ──

CREATE TABLE legal_time_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  matter_id     UUID NOT NULL REFERENCES legal_matters(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  entry_date    DATE NOT NULL,
  hours         NUMERIC(5,2) NOT NULL CHECK (hours >= 0),
  rate          NUMERIC(10,2),
  amount        NUMERIC(14,2),
  description   TEXT NOT NULL,
  is_billable   BOOLEAN NOT NULL DEFAULT true,
  is_billed     BOOLEAN NOT NULL DEFAULT false,
  invoice_id    UUID,
  activity_code TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE legal_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_time_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_time_entries_tenant ON legal_time_entries
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_legal_time_entries_matter ON legal_time_entries(matter_id);
CREATE INDEX idx_legal_time_entries_user_date ON legal_time_entries(user_id, entry_date);

-- ── Trust accounts (client funds held on behalf — IOLTA/escrow) ──

CREATE TABLE legal_trust_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  account_name    TEXT NOT NULL,
  account_number  TEXT,
  bank_name       TEXT,
  client_id       UUID REFERENCES legal_clients(id),
  matter_id       UUID REFERENCES legal_matters(id),
  balance         NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'TZS',
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','frozen','closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE legal_trust_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_trust_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_trust_accounts_tenant ON legal_trust_accounts
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE legal_trust_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  trust_account_id  UUID NOT NULL REFERENCES legal_trust_accounts(id),
  type              TEXT NOT NULL CHECK (type IN ('deposit','disbursement','transfer','interest','fee')),
  amount            NUMERIC(14,2) NOT NULL,
  balance_after     NUMERIC(14,2) NOT NULL,
  description       TEXT NOT NULL,
  reference         TEXT,
  payee             TEXT,
  check_number      TEXT,
  performed_by      UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE legal_trust_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_trust_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_trust_transactions_tenant ON legal_trust_transactions
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_legal_trust_txn_account ON legal_trust_transactions(trust_account_id);

-- ── Conflict checks (party-vs-party screening) ──

CREATE TABLE legal_conflict_checks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  matter_id     UUID REFERENCES legal_matters(id),
  party_name    TEXT NOT NULL,
  party_role    TEXT NOT NULL CHECK (party_role IN ('client','opposing','related','witness')),
  checked_by    UUID NOT NULL REFERENCES users(id),
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  result        TEXT NOT NULL DEFAULT 'clear'
                CHECK (result IN ('clear','potential','conflict','waived')),
  conflicting_matter_id UUID REFERENCES legal_matters(id),
  notes         TEXT,
  waiver_reason TEXT,
  waived_by     UUID REFERENCES users(id),
  waived_at     TIMESTAMPTZ
);
ALTER TABLE legal_conflict_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_conflict_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_conflict_checks_tenant ON legal_conflict_checks
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_legal_conflict_checks_matter ON legal_conflict_checks(matter_id);
CREATE INDEX idx_legal_conflict_checks_party ON legal_conflict_checks(tenant_id, party_name);


-- ═══════════════════════════════════════════════════════════════════
-- NGAO — Privacy & Data Protection Compliance
-- (Reuses processing_activities + consent_records from migration 523)
-- ═══════════════════════════════════════════════════════════════════

-- ── Privacy Impact Assessments (DPIAs) ──

CREATE TABLE privacy_assessments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  title             TEXT NOT NULL,
  activity_id       UUID REFERENCES processing_activities(id),
  assessment_type   TEXT NOT NULL DEFAULT 'dpia'
                    CHECK (assessment_type IN ('dpia','pia','tia','lia')),
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','in_progress','review','approved','rejected')),
  risk_level        TEXT CHECK (risk_level IN ('low','medium','high','critical')),
  risk_score        INT CHECK (risk_score BETWEEN 0 AND 100),
  description       TEXT,
  scope             TEXT,
  necessity_assessment TEXT,
  proportionality_assessment TEXT,
  risks             JSONB NOT NULL DEFAULT '[]'::jsonb,
  mitigations       JSONB NOT NULL DEFAULT '[]'::jsonb,
  assessor_id       UUID REFERENCES users(id),
  reviewer_id       UUID REFERENCES users(id),
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  next_review_date  DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE privacy_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_assessments FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_assessments_tenant ON privacy_assessments
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_privacy_assessments_status ON privacy_assessments(tenant_id, status);

-- ── Breach / incident register ──

CREATE TABLE privacy_incidents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  title               TEXT NOT NULL,
  incident_number     TEXT,
  severity            TEXT NOT NULL DEFAULT 'medium'
                      CHECK (severity IN ('low','medium','high','critical')),
  status              TEXT NOT NULL DEFAULT 'detected'
                      CHECK (status IN ('detected','investigating','contained',
                                         'notified','remediated','closed')),
  category            TEXT CHECK (category IN ('unauthorized_access','data_loss',
                                               'data_breach','system_compromise',
                                               'human_error','third_party','other')),
  description         TEXT,
  data_subjects_affected INT,
  data_categories_affected TEXT[],
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  contained_at        TIMESTAMPTZ,
  authority_notified_at TIMESTAMPTZ,
  subjects_notified_at  TIMESTAMPTZ,
  root_cause          TEXT,
  remediation_actions TEXT,
  reported_by         UUID REFERENCES users(id),
  lead_investigator_id UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, incident_number)
);
ALTER TABLE privacy_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_incidents FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_incidents_tenant ON privacy_incidents
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_privacy_incidents_status ON privacy_incidents(tenant_id, status);
