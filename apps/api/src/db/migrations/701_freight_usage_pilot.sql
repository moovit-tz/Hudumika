CREATE TABLE freight_usage_pilot (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_by UUID,
  accepted_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  bundle_key TEXT NOT NULL DEFAULT 'freight-forwarder' CHECK (bundle_key = 'freight-forwarder'),
  rate_revision INTEGER,
  FOREIGN KEY (bundle_key, rate_revision) REFERENCES commercial_pricing_versions(bundle_key, revision),
  CHECK (
    (accepted_by IS NULL AND accepted_at IS NULL AND starts_at IS NULL AND rate_revision IS NULL)
    OR (accepted_by IS NOT NULL AND accepted_at IS NOT NULL AND starts_at > accepted_at AND rate_revision IS NOT NULL)
  )
);

ALTER TABLE freight_usage_pilot ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_usage_pilot FORCE ROW LEVEL SECURITY;
CREATE POLICY freight_usage_pilot_tenant ON freight_usage_pilot
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE INSERT, UPDATE, DELETE ON freight_usage_pilot FROM hudumika_app;
GRANT SELECT ON freight_usage_pilot TO hudumika_app;
GRANT UPDATE (accepted_by, accepted_at, starts_at, rate_revision) ON freight_usage_pilot TO hudumika_app;
