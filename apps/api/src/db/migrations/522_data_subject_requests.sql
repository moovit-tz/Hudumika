-- Data Subject Request (DSR) queue and per-step processing audit.
-- Implements GDPR Articles 15 (access), 17 (erasure), 20 (portability),
-- 16 (rectification), 18 (restriction), and 21 (objection).
-- Requests are due within 30 days of creation (GDPR Art. 12(3)).

CREATE TABLE data_subject_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- The requesting user (null if submitted externally, e.g. via email).
  requester_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Captured at submission time so it survives user deletion.
  requester_email TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN (
    'ACCESS', 'ERASURE', 'PORTABILITY', 'RECTIFICATION',
    'RESTRICTION', 'OBJECTION'
  )),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'IN_REVIEW', 'PROCESSING',
    'COMPLETED', 'REJECTED', 'PARTIALLY_COMPLETED', 'CANCELLED'
  )),
  -- Optional structured detail (specific fields/categories, rectification data).
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  identity_verified BOOLEAN NOT NULL DEFAULT false,
  -- MinIO key for the packaged ACCESS or PORTABILITY export ZIP.
  result_file_key TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Statutory 30-day deadline, auto-computed.
  due_at TIMESTAMPTZ GENERATED ALWAYS AS (created_at + INTERVAL '30 days') STORED,
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- A completed request must have a result file OR a rejection reason.
  CONSTRAINT dsr_completed_has_outcome CHECK (
    status NOT IN ('COMPLETED', 'REJECTED') OR
    (result_file_key IS NOT NULL OR rejection_reason IS NOT NULL)
  )
);

CREATE INDEX idx_dsr_tenant_status ON data_subject_requests (tenant_id, status, created_at DESC);
CREATE INDEX idx_dsr_requester ON data_subject_requests (requester_id, created_at DESC) WHERE requester_id IS NOT NULL;
CREATE INDEX idx_dsr_due ON data_subject_requests (due_at) WHERE status IN ('PENDING', 'IN_REVIEW', 'PROCESSING');

ALTER TABLE data_subject_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_subject_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON data_subject_requests
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Step-by-step audit trail for DSR processing actions.
CREATE TABLE dsr_processing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES data_subject_requests(id) ON DELETE CASCADE,
  -- Structured step names consumed by the UI.
  step TEXT NOT NULL CHECK (step IN (
    'SUBMITTED', 'IDENTITY_VERIFIED', 'REVIEW_STARTED',
    'DATA_COLLECTED', 'DATA_EXPORTED', 'FIELD_ERASED', 'FIELD_ANONYMISED',
    'EXPORT_PACKAGED', 'DOWNLOAD_LINK_GENERATED',
    'NOTIFIED_REQUESTER', 'COMPLETED', 'REJECTED', 'CANCELLED'
  )),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dsr_log_request ON dsr_processing_log (request_id, created_at ASC);
