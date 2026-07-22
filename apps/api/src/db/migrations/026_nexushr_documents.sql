-- Migration 026: NexusHR Documents & Assets Schema

-- Documents
CREATE TABLE IF NOT EXISTS hr_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_id     UUID REFERENCES hr_people(id) ON DELETE CASCADE,
  employment_id UUID REFERENCES hr_employments(id) ON DELETE CASCADE,
  case_id       UUID REFERENCES hr_workflow_cases(id) ON DELETE SET NULL,
  name          VARCHAR(255) NOT NULL,
  type          VARCHAR(100) NOT NULL, -- CONTRACT, ID_SCAN, CERTIFICATE, POLICY_ACK, PAYSLIP, PERFORMANCE_REVIEW
  storage_key   TEXT NOT NULL, -- S3/MinIO pointer
  status        VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- DRAFT, PENDING_SIGNATURE, SIGNED, EXPIRED, ARCHIVED
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_documents_tenant ON hr_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_documents_person ON hr_documents(person_id);
CREATE INDEX IF NOT EXISTS idx_hr_documents_employment ON hr_documents(employment_id);

-- Document Templates
CREATE TABLE IF NOT EXISTS hr_document_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(150) NOT NULL,
  type         VARCHAR(100) NOT NULL, -- OFFER_LETTER, EMPLOYMENT_CONTRACT, AMENDMENT, NDA, POLICY_ACK
  country_code VARCHAR(2), -- Optional country filter
  body         TEXT NOT NULL, -- HTML/markdown with tokens
  version      INTEGER NOT NULL DEFAULT 1,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_doc_templates_tenant ON hr_document_templates(tenant_id);

-- Signature Requests
CREATE TABLE IF NOT EXISTS hr_signature_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES hr_documents(id) ON DELETE CASCADE,
  signer_role VARCHAR(50) NOT NULL, -- EMPLOYEE, REPRESENTATIVE
  signer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status      VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, SIGNED, DECLINED
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_sig_requests_tenant ON hr_signature_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_sig_requests_doc ON hr_signature_requests(document_id);

-- Signature Events (Audit trail)
CREATE TABLE IF NOT EXISTS hr_signature_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id   UUID NOT NULL REFERENCES hr_signature_requests(id) ON DELETE CASCADE,
  event_type   VARCHAR(50) NOT NULL, -- VIEWED, SIGNED, DECLINED
  ip_address   VARCHAR(45),
  user_agent   TEXT,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_sig_events_tenant ON hr_signature_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_sig_events_request ON hr_signature_events(request_id);

-- Assets (Equipment Tracking)
CREATE TABLE IF NOT EXISTS hr_assets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           VARCHAR(150) NOT NULL,
  type           VARCHAR(100) NOT NULL, -- LAPTOP, MOBILE, MONITOR, ACCESS_CARD, VEHICLE
  serial_number  VARCHAR(150) NOT NULL,
  assigned_to    UUID REFERENCES hr_employments(id) ON DELETE SET NULL,
  assigned_date  DATE,
  returned_date  DATE,
  condition_notes TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, serial_number)
);
CREATE INDEX IF NOT EXISTS idx_hr_assets_tenant ON hr_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_assets_assigned ON hr_assets(assigned_to);
