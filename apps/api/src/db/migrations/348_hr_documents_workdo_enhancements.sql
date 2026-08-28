-- Migration 348: NexusHR WorkDo-Parity Documents, Expiry Radar, Letter Templates & Approval Workflow

ALTER TABLE hr_documents 
  ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE hr_document_templates
  ADD COLUMN IF NOT EXISTS template_category VARCHAR(100) DEFAULT 'CONTRACT',
  ADD COLUMN IF NOT EXISTS placeholders JSONB DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS hr_document_requirements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  designation         VARCHAR(150) NOT NULL DEFAULT 'ALL',
  document_type       VARCHAR(100) NOT NULL,
  is_required         BOOLEAN NOT NULL DEFAULT TRUE,
  expiry_warning_days INTEGER NOT NULL DEFAULT 30,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_doc_reqs_tenant ON hr_document_requirements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_doc_expiry ON hr_documents(tenant_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_hr_doc_approval ON hr_documents(tenant_id, approval_status);
