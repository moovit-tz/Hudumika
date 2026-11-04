-- LexCore extended domain — court cases, diary, deadlines, disbursements,
-- invoicing, documents, KYC, practising certificates, fee earner profiles,
-- partner capital, workflow, reminders. Extends 670_legal_privacy_domain_tables.sql
-- (legal_matters/legal_clients/legal_time_entries) — originally filed as
-- 660_legal_extended_domain.sql, which collided on two independent numbers
-- (656/658/660) with a separate, unrelated session's own LexCore-source port
-- (also already applied, under unprefixed table names like matters/court_cases).
-- Renumbered to 681, after 680_resolve_legal_table_name_collision_part2.sql
-- frees the 5 table names (legal_deadlines, legal_invoices, legal_invoice_lines,
-- tanzania_holidays, privacy_vendors) this file also uses. See that
-- migration's header for the full account — this file's own content is
-- unmodified from how it was originally authored.

-- ── Fee earner profiles (lawyer billing rates) ──

CREATE TABLE legal_fee_earner_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  grade           TEXT NOT NULL CHECK (grade IN ('PARTNER','SENIOR_ASSOCIATE','ASSOCIATE','PARALEGAL','SUPPORT')),
  charge_rate     NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_rate       NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'TZS',
  pc_number       TEXT,
  pc_expires_at   DATE,
  tls_number      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
ALTER TABLE legal_fee_earner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_fee_earner_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_fee_earner_profiles_tenant ON legal_fee_earner_profiles
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── Court cases (linked to matters) ──

CREATE TABLE legal_court_cases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_id       UUID NOT NULL REFERENCES legal_matters(id),
  case_number     TEXT,
  court_name      TEXT NOT NULL,
  court_hierarchy TEXT NOT NULL CHECK (court_hierarchy IN (
    'COURT_OF_APPEAL','HIGH_COURT','RESIDENT_MAGISTRATE','DISTRICT','PRIMARY','TRIBUNAL'
  )),
  division_type   TEXT CHECK (division_type IN ('COMMERCIAL','LAND','LABOUR','CORRUPTION','FAMILY')),
  filed_at        DATE,
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN (
    'ACTIVE','JUDGMENT','CONCLUDED','STRUCK_OUT','WITHDRAWN'
  )),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE legal_court_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_court_cases FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_court_cases_tenant ON legal_court_cases
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_legal_court_cases_matter ON legal_court_cases(matter_id);

-- ── Court events (diary / hearing schedule) ──

CREATE TABLE legal_court_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  court_case_id    UUID NOT NULL REFERENCES legal_court_cases(id) ON DELETE CASCADE,
  matter_id        UUID NOT NULL REFERENCES legal_matters(id),
  event_type       TEXT NOT NULL CHECK (event_type IN (
    'MENTION','HEARING','PTC','JUDGMENT','RULING','EXECUTION','FILING'
  )),
  scheduled_at     TIMESTAMPTZ NOT NULL,
  outcome          TEXT,
  notes            TEXT,
  next_event_type  TEXT,
  next_event_date  TIMESTAMPTZ,
  recorded_by      UUID REFERENCES users(id),
  reminders_sent   INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE legal_court_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_court_events FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_court_events_tenant ON legal_court_events
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_legal_court_events_case ON legal_court_events(court_case_id);
CREATE INDEX idx_legal_court_events_sched ON legal_court_events(tenant_id, scheduled_at);

-- ── Deadlines (limitation periods, appeal windows, statutory) ──

CREATE TABLE legal_deadlines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_id       UUID NOT NULL REFERENCES legal_matters(id),
  court_case_id   UUID REFERENCES legal_court_cases(id),
  deadline_type   TEXT NOT NULL CHECK (deadline_type IN (
    'LIMITATION','APPEAL_WINDOW','STATUTORY','COURT_ORDER','REMINDER','CUSTOM'
  )),
  description     TEXT NOT NULL,
  due_date        DATE NOT NULL,
  raw_due_date    DATE NOT NULL,
  completed_at    TIMESTAMPTZ,
  is_automatic    BOOLEAN NOT NULL DEFAULT false,
  computed_from   TEXT,
  is_critical     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE legal_deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_deadlines FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_deadlines_tenant ON legal_deadlines
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_legal_deadlines_matter ON legal_deadlines(matter_id);
CREATE INDEX idx_legal_deadlines_due ON legal_deadlines(tenant_id, due_date);

-- ── Disbursements (out-of-pocket expenses on a matter) ──

CREATE TABLE legal_disbursements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_id       UUID NOT NULL REFERENCES legal_matters(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  entry_date      DATE NOT NULL,
  category        TEXT NOT NULL CHECK (category IN (
    'COURT_FEE','STAMP_DUTY','BRELA','TRAVEL','EXPERT','COUNSEL_FEE','OTHER'
  )),
  description     TEXT NOT NULL,
  amount          NUMERIC(14,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'TZS',
  vat_treatment   TEXT NOT NULL DEFAULT 'EXEMPT' CHECK (vat_treatment IN ('STANDARD','EXEMPT','ZERO_RATED')),
  is_recoverable  BOOLEAN NOT NULL DEFAULT true,
  receipt_key     TEXT,
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','INVOICED','WRITTEN_OFF')),
  invoice_id      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE legal_disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_disbursements FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_disbursements_tenant ON legal_disbursements
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_legal_disbursements_matter ON legal_disbursements(matter_id);

-- ── Legal invoices (separate from FinOps sales_invoices per ADR-007) ──

CREATE TABLE legal_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_id       UUID NOT NULL REFERENCES legal_matters(id),
  client_id       UUID NOT NULL REFERENCES legal_clients(id),
  invoice_number  TEXT NOT NULL,
  invoice_date    DATE NOT NULL,
  due_date        DATE NOT NULL,
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  wht_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total           NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'TZS',
  status          TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT','ISSUED','SENT','PARTIALLY_PAID','PAID','WRITTEN_OFF'
  )),
  pdf_key         TEXT,
  issued_at       TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_number)
);
ALTER TABLE legal_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_invoices_tenant ON legal_invoices
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_legal_invoices_matter ON legal_invoices(matter_id);
CREATE INDEX idx_legal_invoices_status ON legal_invoices(tenant_id, status);

CREATE TABLE legal_invoice_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  invoice_id      UUID NOT NULL REFERENCES legal_invoices(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  amount          NUMERIC(14,2) NOT NULL,
  vat_rate        NUMERIC(5,4) NOT NULL DEFAULT 0,
  wht_rate        NUMERIC(5,4) NOT NULL DEFAULT 0,
  line_type       TEXT NOT NULL CHECK (line_type IN ('TIME','DISBURSEMENT','FIXED_FEE')),
  reference_id    UUID
);
ALTER TABLE legal_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_invoice_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_invoice_lines_tenant ON legal_invoice_lines
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_legal_invoice_lines_inv ON legal_invoice_lines(invoice_id);

-- Add invoice_id FK to time entries and disbursements
ALTER TABLE legal_time_entries ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES legal_invoices(id);
ALTER TABLE legal_disbursements ADD COLUMN IF NOT EXISTS invoice_id_fk UUID REFERENCES legal_invoices(id);

-- ── Matter documents (legal document management) ──

CREATE TABLE legal_matter_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_id       UUID NOT NULL REFERENCES legal_matters(id),
  title           TEXT NOT NULL,
  file_key        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INT NOT NULL DEFAULT 0,
  doc_type        TEXT NOT NULL CHECK (doc_type IN (
    'PLEADING','AFFIDAVIT','JUDGMENT','CORRESPONDENCE','CONTRACT','PRECEDENT','OTHER'
  )),
  version         INT NOT NULL DEFAULT 1,
  ocr_text        TEXT,
  language        TEXT NOT NULL DEFAULT 'en',
  is_privileged   BOOLEAN NOT NULL DEFAULT true,
  wall_id         TEXT,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE legal_matter_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_matter_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_matter_documents_tenant ON legal_matter_documents
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_legal_matter_docs_matter ON legal_matter_documents(matter_id);

-- ── KYC records (AML/PEP/sanctions screening) ──

CREATE TABLE legal_kyc_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  client_id       UUID NOT NULL REFERENCES legal_clients(id),
  matter_id       UUID REFERENCES legal_matters(id),
  nida            TEXT,
  passport        TEXT,
  brela           TEXT,
  tin             TEXT,
  ubos_json       JSONB,
  source_of_funds TEXT,
  pep_flag        BOOLEAN NOT NULL DEFAULT false,
  sanctions_flag  BOOLEAN NOT NULL DEFAULT false,
  adverse_media   BOOLEAN NOT NULL DEFAULT false,
  risk_score      TEXT NOT NULL DEFAULT 'LOW' CHECK (risk_score IN ('LOW','MEDIUM','HIGH','VERY_HIGH')),
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','COMPLETE','EDD_REQUIRED','APPROVED','REJECTED'
  )),
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE legal_kyc_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_kyc_records FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_kyc_records_tenant ON legal_kyc_records
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_legal_kyc_records_client ON legal_kyc_records(client_id);

-- ── Practising certificates (lawyer licence tracking) ──

CREATE TABLE legal_practise_certificates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  cert_number     TEXT NOT NULL,
  tls_number      TEXT,
  issued_at       DATE NOT NULL,
  expires_at      DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','SUSPENDED','REVOKED')),
  document_key    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE legal_practise_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_practise_certificates FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_practise_certs_tenant ON legal_practise_certificates
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_legal_practise_certs_user ON legal_practise_certificates(tenant_id, user_id);

-- ── Partner capital accounts (law firm equity tracking) ──

CREATE TABLE legal_partner_capitals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  user_id             UUID NOT NULL REFERENCES users(id),
  tax_year            INT NOT NULL,
  opening             NUMERIC(14,2) NOT NULL DEFAULT 0,
  capital_introduced  NUMERIC(14,2) NOT NULL DEFAULT 0,
  profit_share        NUMERIC(14,2) NOT NULL DEFAULT 0,
  drawings            NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_reserve         NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing             NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'TZS',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, tax_year)
);
ALTER TABLE legal_partner_capitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_partner_capitals FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_partner_capitals_tenant ON legal_partner_capitals
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── Ngao extended: compliance alerts + vendor management + training ──

CREATE TABLE privacy_compliance_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  alert_type      TEXT NOT NULL CHECK (alert_type IN (
    'PDPC_RENEWAL','DPO_REVIEW','CONSENT_EXPIRY','DPIA_REVIEW','BREACH_DEADLINE','CUSTOM'
  )),
  title           TEXT NOT NULL,
  due_date        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','SNOOZED')),
  linked_document_id UUID,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE privacy_compliance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_compliance_alerts FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_compliance_alerts_tenant ON privacy_compliance_alerts
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_privacy_alerts_status ON privacy_compliance_alerts(tenant_id, status);

CREATE TABLE privacy_vendors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  contact_name    TEXT,
  contact_email   TEXT,
  website         TEXT,
  services        JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_shared     JSONB NOT NULL DEFAULT '[]'::jsonb,
  has_dpa         BOOLEAN NOT NULL DEFAULT false,
  risk_level      TEXT NOT NULL DEFAULT 'LOW' CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','UNDER_REVIEW','TERMINATED')),
  reviewed_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE privacy_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_vendors FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_vendors_tenant ON privacy_vendors
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE privacy_rights_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  request_type    TEXT NOT NULL CHECK (request_type IN (
    'ACCESS','CORRECTION','ERASURE','OBJECTION','PORTABILITY'
  )),
  subject_name    TEXT NOT NULL,
  subject_email   TEXT NOT NULL,
  subject_phone   TEXT,
  description     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','IN_PROGRESS','COMPLETED','REJECTED','EXPIRED'
  )),
  deadline_at     TIMESTAMPTZ NOT NULL,
  responded_at    TIMESTAMPTZ,
  response_notes  TEXT,
  audit_log       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE privacy_rights_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_rights_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_rights_requests_tenant ON privacy_rights_requests
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_privacy_rights_status ON privacy_rights_requests(tenant_id, status);

-- ── Tanzania holidays (business-day deadline calculation) ──

CREATE TABLE tanzania_holidays (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date    DATE NOT NULL UNIQUE,
  name    TEXT NOT NULL
);
