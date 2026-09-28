-- Application privacy manifests and granular OAuth resource scopes.
-- app_privacy_manifests: machine-readable privacy declaration for each OAuth
--   client listing what data it accesses, for what purpose, and how it handles
--   deletion — shown to tenants at install time (zero-trust section 21).
-- oauth_resource_scopes: fine-grained resource+operation scope catalog that
--   extends the coarse FeatureKey ceiling in api_keys.scopes.

CREATE TABLE app_privacy_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES ondi_oauth_clients(client_id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  -- Resource paths this app accesses, e.g. 'contacts.email', 'orders'.
  data_access TEXT[] NOT NULL DEFAULT '{}',
  purposes TEXT[] NOT NULL DEFAULT '{}',
  external_processing BOOLEAN NOT NULL DEFAULT false,
  ai_processing BOOLEAN NOT NULL DEFAULT false,
  retention_days INTEGER,
  subprocessors JSONB NOT NULL DEFAULT '[]'::jsonb,
  deletion_supported BOOLEAN NOT NULL DEFAULT true,
  privacy_policy_url TEXT,
  published_at TIMESTAMPTZ,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, version)
);

CREATE INDEX idx_app_privacy_manifests_client ON app_privacy_manifests (client_id, is_current);

-- When a new manifest version is published, mark previous as not current.
CREATE OR REPLACE FUNCTION app_privacy_manifest_set_current()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_current THEN
    UPDATE app_privacy_manifests
      SET is_current = false
      WHERE client_id = NEW.client_id AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_privacy_manifest_current_trg
  AFTER INSERT OR UPDATE OF is_current ON app_privacy_manifests
  FOR EACH ROW WHEN (NEW.is_current = true)
  EXECUTE FUNCTION app_privacy_manifest_set_current();

-- Fine-grained scope catalog (beyond FeatureKey app-level ceiling).
-- These scopes are referenced in ondi_oauth_consents.scopes and
-- dev_credentials.scopes for field-level API filtering.
CREATE TABLE oauth_resource_scopes (
  scope TEXT PRIMARY KEY,
  resource TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('read', 'write', 'delete', 'export')),
  sensitivity_level TEXT NOT NULL CHECK (sensitivity_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  data_domain TEXT NOT NULL REFERENCES pii_data_domains(id),
  description TEXT,
  requires_tenant_approval BOOLEAN NOT NULL DEFAULT false,
  requires_hudumika_verification BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_oauth_resource_scopes_resource ON oauth_resource_scopes (resource, operation);
CREATE INDEX idx_oauth_resource_scopes_domain ON oauth_resource_scopes (data_domain, sensitivity_level);
