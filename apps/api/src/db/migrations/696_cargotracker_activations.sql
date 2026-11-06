CREATE TABLE cargotracker_activations (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tracking_type TEXT NOT NULL CHECK (tracking_type IN ('AWB', 'BL')),
  tracking_number TEXT NOT NULL CHECK (tracking_number <> ''),
  snapshot_id UUID NOT NULL,
  activated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, tracking_type, tracking_number)
);

-- Existing verified monitors establish a baseline without creating billable activity.
INSERT INTO cargotracker_activations (tenant_id, tracking_type, tracking_number, snapshot_id, activated_at)
SELECT DISTINCT ON (tenant_id, tracking_type, normalized_number)
  tenant_id, tracking_type, normalized_number, id, NULL
FROM (
  SELECT tenant_id, tracking_type, id, created_at,
    upper(regexp_replace(tracking_number, '[[:space:]]', '', 'g')) AS normalized_number
  FROM tracking_snapshots
  WHERE source = 'live' AND fetched_at IS NOT NULL AND tracking_type IN ('AWB', 'BL')
) AS verified
WHERE normalized_number <> ''
ORDER BY tenant_id, tracking_type, normalized_number, created_at, id;

CREATE INDEX cargotracker_activations_period_idx
  ON cargotracker_activations (tenant_id, activated_at) WHERE activated_at IS NOT NULL;

ALTER TABLE cargotracker_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cargotracker_activations FORCE ROW LEVEL SECURITY;
CREATE POLICY cargotracker_activations_tenant ON cargotracker_activations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE UPDATE, DELETE ON cargotracker_activations FROM hudumika_app;
GRANT SELECT, INSERT ON cargotracker_activations TO hudumika_app;
