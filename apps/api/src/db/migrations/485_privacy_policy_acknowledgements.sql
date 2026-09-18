-- Versioned platform privacy notices and immutable evidence that a user was
-- shown and acknowledged a specific published version. This is notice
-- acknowledgement, not a blanket consent record or lawful basis for every
-- processing activity.
CREATE TABLE privacy_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_page_id UUID NOT NULL REFERENCES cms_pages(id) ON DELETE RESTRICT,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX privacy_policy_versions_effective
  ON privacy_policy_versions (effective_at DESC, published_at DESC);

CREATE TABLE privacy_policy_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_version_id UUID NOT NULL REFERENCES privacy_policy_versions(id) ON DELETE RESTRICT,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledgement_method TEXT NOT NULL CHECK (acknowledgement_method IN ('registration', 'in_app')),
  locale TEXT NOT NULL DEFAULT 'en',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, policy_version_id)
);

CREATE INDEX privacy_policy_acknowledgements_tenant_user
  ON privacy_policy_acknowledgements (tenant_id, user_id, acknowledged_at DESC);

ALTER TABLE privacy_policy_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_policy_acknowledgements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON privacy_policy_acknowledgements
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
