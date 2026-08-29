-- Ondi M4: personal KYC (identity document verification). One submission
-- row per attempt (a rejected user can resubmit — history matters for a
-- compliance record, so this is append-only, not upsert-on-user_id).
CREATE TABLE IF NOT EXISTS ondi_kyc_submissions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type               TEXT NOT NULL CHECK (document_type IN ('national_id', 'passport', 'drivers_license')),
  document_storage_key        TEXT NOT NULL,
  extracted_full_name         TEXT,
  extracted_dob                DATE,
  extracted_document_number   TEXT,
  extracted_nationality       TEXT,
  extracted_expiry            DATE,
  -- Raw MRZ text lines as printed (passports only) + the mrz package's own
  -- checksum verdict — a second, independent signal from the same image:
  -- Gemini's semantic read can be right while a check digit is wrong (or
  -- vice versa), so both are kept rather than collapsed into one field.
  mrz_raw                     TEXT,
  mrz_valid                   BOOLEAN,
  ocr_confidence               NUMERIC,
  status                      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by                  UUID REFERENCES users(id),
  reviewed_at                  TIMESTAMPTZ,
  rejection_reason             TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ondi_kyc_submissions_user ON ondi_kyc_submissions(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ondi_kyc_submissions_queue ON ondi_kyc_submissions(tenant_id, status, created_at);

ALTER TABLE ondi_kyc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_kyc_submissions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_kyc_submissions'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_kyc_submissions
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
