-- Draft document edit history — a real "Google-Docs-style" version list +
-- revert for the eSign editor's working document, distinct from the
-- existing sign_envelopes.previous_version_id/version_number chain (that
-- one links whole *separate envelopes* created by amending an already-
-- COMPLETED (signed) document — migration 342). This is a lighter-weight
-- concept: snapshots of document_data taken each time a still-DRAFT
-- envelope's document is saved with real content changes (Organize Pages,
-- rotate/watermark/OCR/any PDF Tool, or a fresh upload) — reorderable,
-- diffable, and revertible before the envelope is ever sent.
CREATE TABLE IF NOT EXISTS sign_document_versions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  envelope_id UUID NOT NULL REFERENCES sign_envelopes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  document_data TEXT NOT NULL, -- same data-URI shape as sign_envelopes.document_data
  file_name TEXT,
  -- Human-readable ("Organized pages", "Rotated 90°") plus the structured
  -- form for tools that have real structured data to show (Organize Pages'
  -- own moved/added/deleted counts) — the diff view renders from
  -- change_details when present and falls back to a generic page-content
  -- diff (real pdf.js text extraction + a real diff algorithm, not a
  -- fabricated one) otherwise, e.g. for a rotate/watermark/OCR pass. NULL
  -- change_details is normal and not an error case for most tools.
  change_summary TEXT NOT NULL,
  change_details JSONB,
  created_by UUID REFERENCES users(id),
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (envelope_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_sign_document_versions_envelope ON sign_document_versions(tenant_id, envelope_id, version_number DESC);

ALTER TABLE sign_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_document_versions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'sign_document_versions'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON sign_document_versions
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
