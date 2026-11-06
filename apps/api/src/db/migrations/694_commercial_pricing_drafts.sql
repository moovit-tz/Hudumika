CREATE TABLE commercial_pricing_drafts (
  bundle_key TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision > 0),
  configuration TEXT NOT NULL,
  updated_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON commercial_pricing_drafts FROM hudumika_app, hudumika_readonly;
GRANT SELECT, INSERT, UPDATE ON commercial_pricing_drafts TO hudumika_platform;
