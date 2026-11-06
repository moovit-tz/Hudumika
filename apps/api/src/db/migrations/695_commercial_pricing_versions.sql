ALTER TABLE commercial_pricing_drafts ADD COLUMN tested_revision INTEGER;

CREATE TABLE commercial_pricing_versions (
  bundle_key TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  effective_on TEXT NOT NULL,
  configuration TEXT NOT NULL,
  published_by UUID NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bundle_key, revision),
  UNIQUE (bundle_key, effective_on)
);

REVOKE ALL ON commercial_pricing_versions FROM hudumika_app, hudumika_readonly, hudumika_platform;
GRANT SELECT, INSERT ON commercial_pricing_versions TO hudumika_platform;
