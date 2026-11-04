-- Legal domain compliance tables (conflicts, KYC, documents, certificates)

-- ── Conflict checks ─────────────────────────────────────────
CREATE TABLE conflict_checks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_id       UUID NOT NULL REFERENCES matters(id),
  parties_json    JSONB NOT NULL DEFAULT '[]',
  searched_by     UUID NOT NULL REFERENCES users(id),
  searched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  result          TEXT NOT NULL CHECK (result IN ('CLEAR','CONFLICT_FOUND','POTENTIAL','WAIVED')) DEFAULT 'CLEAR',
  cleared_by      UUID REFERENCES users(id),
  cleared_at      TIMESTAMPTZ,
  clearance_basis TEXT,
  certificate_key TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX conflict_checks_matter ON conflict_checks(tenant_id, matter_id);

ALTER TABLE conflict_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflict_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY conflict_checks_tenant ON conflict_checks
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── KYC records ─────────────────────────────────────────────
CREATE TABLE kyc_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  client_id       UUID NOT NULL REFERENCES legal_clients(id),
  matter_id       UUID REFERENCES matters(id),
  nida            TEXT,
  passport        TEXT,
  brela           TEXT,
  tin             TEXT,
  ubos_json       JSONB,
  source_of_funds TEXT,
  pep_flag        BOOLEAN NOT NULL DEFAULT FALSE,
  sanctions_flag  BOOLEAN NOT NULL DEFAULT FALSE,
  adverse_media   TEXT,
  risk_score      INTEGER,
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETE','EDD_REQUIRED','APPROVED','REJECTED')),
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX kyc_records_client ON kyc_records(tenant_id, client_id);

ALTER TABLE kyc_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_records FORCE ROW LEVEL SECURITY;
CREATE POLICY kyc_records_tenant ON kyc_records
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Matter documents ────────────────────────────────────────
CREATE TABLE matter_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_id       UUID NOT NULL REFERENCES matters(id),
  title           TEXT NOT NULL,
  file_key        TEXT NOT NULL,
  mime_type       TEXT,
  size_bytes      BIGINT,
  doc_type        TEXT NOT NULL CHECK (doc_type IN ('PLEADING','AFFIDAVIT','JUDGMENT','CORRESPONDENCE','CONTRACT','PRECEDENT','OTHER')) DEFAULT 'OTHER',
  version         INTEGER NOT NULL DEFAULT 1,
  ocr_text        TEXT,
  language        TEXT DEFAULT 'en',
  is_privileged   BOOLEAN NOT NULL DEFAULT FALSE,
  wall_id         TEXT,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX matter_documents_matter ON matter_documents(tenant_id, matter_id);

ALTER TABLE matter_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY matter_documents_tenant ON matter_documents
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Practising certificates ─────────────────────────────────
CREATE TABLE practise_certificates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  cert_number   TEXT NOT NULL,
  tls_number    TEXT,
  issued_at     TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('ACTIVE','EXPIRED','SUSPENDED','REVOKED')) DEFAULT 'ACTIVE',
  document_key  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX practise_certs_user ON practise_certificates(tenant_id, user_id);

ALTER TABLE practise_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE practise_certificates FORCE ROW LEVEL SECURITY;
CREATE POLICY practise_certificates_tenant ON practise_certificates
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Ngao: incidents / breach management ─────────────────────
CREATE TABLE privacy_incidents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  title               TEXT NOT NULL,
  description         TEXT,
  severity            TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')) DEFAULT 'MEDIUM',
  status              TEXT NOT NULL DEFAULT 'DETECTED' CHECK (status IN ('DETECTED','CONTAINED','NOTIFIED','RESOLVED')),
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  contained_at        TIMESTAMPTZ,
  pdpc_notified_at    TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  affected_data_types TEXT[],
  affected_count      INTEGER,
  containment_steps   JSONB,
  root_cause          TEXT,
  lessons_learned     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX privacy_incidents_tenant ON privacy_incidents(tenant_id);
CREATE INDEX privacy_incidents_status ON privacy_incidents(tenant_id, status);

ALTER TABLE privacy_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_incidents FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_incidents_tenant ON privacy_incidents
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Ngao: compliance alerts ─────────────────────────────────
CREATE TABLE compliance_alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  type              TEXT NOT NULL CHECK (type IN ('PDPC_RENEWAL','DPO_REVIEW','CONSENT_EXPIRY','DPIA_REVIEW','BREACH_DEADLINE','CUSTOM')),
  title             TEXT NOT NULL,
  due_date          DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','SNOOZED')),
  linked_document_id UUID,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX compliance_alerts_tenant ON compliance_alerts(tenant_id);
CREATE INDEX compliance_alerts_due ON compliance_alerts(tenant_id, due_date) WHERE status = 'PENDING';

ALTER TABLE compliance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_alerts FORCE ROW LEVEL SECURITY;
CREATE POLICY compliance_alerts_tenant ON compliance_alerts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Ngao: training courses ──────────────────────────────────
CREATE TABLE training_courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  title_sw    TEXT,
  description TEXT,
  modules     JSONB NOT NULL DEFAULT '[]',
  language    TEXT NOT NULL DEFAULT 'en',
  target_role TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Ngao: training enrolments ───────────────────────────────
CREATE TABLE training_enrolments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  user_id           UUID NOT NULL REFERENCES users(id),
  course_id         UUID NOT NULL REFERENCES training_courses(id),
  progress          INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  completed_at      TIMESTAMPTZ,
  certificate_s3_key TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, course_id)
);

ALTER TABLE training_enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_enrolments FORCE ROW LEVEL SECURITY;
CREATE POLICY training_enrolments_tenant ON training_enrolments
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Ngao: vendors (data processor oversight) ────────────────
CREATE TABLE privacy_vendors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  contact_name  TEXT,
  contact_email TEXT,
  website       TEXT,
  services      JSONB DEFAULT '[]',
  data_shared   JSONB DEFAULT '[]',
  has_dpa       BOOLEAN NOT NULL DEFAULT FALSE,
  risk_level    TEXT NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')) DEFAULT 'LOW',
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','UNDER_REVIEW','TERMINATED')),
  reviewed_at   TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX privacy_vendors_tenant ON privacy_vendors(tenant_id);

ALTER TABLE privacy_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_vendors FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_vendors_tenant ON privacy_vendors
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
