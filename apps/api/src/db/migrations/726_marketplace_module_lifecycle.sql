-- Module marketplace lifecycle (backlog S08). The inspected MarketplaceService
-- only ever supported a flat install/uninstall with no versioned manifest, no
-- configure/activate step, and — the real bug this migration also closes —
-- uninstalling via Store (store_installed_apps) never touched the separate
-- webhook-delivery grant (tenant_marketplace_installs, migration 156), so an
-- app a tenant had "uninstalled" could keep receiving live domain-event
-- webhooks as long as its Integrations grant was never separately revoked.
-- dispatchToMarketplaceWebhooks() (domain-events.service.ts) is updated
-- alongside this migration to also require an ACTIVE store install, not
-- just a non-revoked Integrations grant.

-- A versioned manifest: compatibility, dependencies, permissions, config
-- schema, declared events/API scopes, and the financial/privacy
-- declarations S08 names. One app has many versions over time; each is
-- independently reviewed (same approve/reject discipline the app listing
-- itself already uses), never silently promoted.
CREATE TABLE IF NOT EXISTS marketplace_app_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id        UUID NOT NULL REFERENCES marketplace_apps(id) ON DELETE CASCADE,
  version       TEXT NOT NULL,
  manifest      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'deprecated')),
  submitted_by  UUID,
  reviewed_by   UUID,
  reviewed_at   TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app_id, version)
);
CREATE INDEX IF NOT EXISTS marketplace_app_versions_app_idx ON marketplace_app_versions (app_id, status);

-- Platform-level catalog table, same as marketplace_apps itself — no
-- tenant_id, no RLS, accessed via dbPlatform.

ALTER TABLE marketplace_apps ADD COLUMN IF NOT EXISTS current_version_id UUID REFERENCES marketplace_app_versions(id);

-- Real lifecycle on a per-tenant install: installed -> configured -> active
-- -> disabled, with uninstalled as the terminal state. Existing rows
-- (installed before this migration existed) are backfilled to 'active' —
-- they were already receiving live events under the old binary model, and
-- treating them as un-activated would silently cut working integrations
-- with no actual change in tenant intent.
ALTER TABLE store_installed_apps ADD COLUMN IF NOT EXISTS version_id UUID REFERENCES marketplace_app_versions(id);
ALTER TABLE store_installed_apps ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'installed' CHECK (status IN ('installed', 'configured', 'active', 'disabled', 'uninstalled'));
ALTER TABLE store_installed_apps ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE store_installed_apps ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE store_installed_apps ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
ALTER TABLE store_installed_apps ADD COLUMN IF NOT EXISTS uninstalled_at TIMESTAMPTZ;
UPDATE store_installed_apps SET status = 'active', activated_at = installed_at WHERE status = 'installed';

-- Preserve history: every lifecycle transition (install/configure/activate/
-- update/disable/uninstall), not just the current state — the backlog's own
-- "preserve history, resolve open work" acceptance line.
CREATE TABLE IF NOT EXISTS store_app_lifecycle_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_id      UUID NOT NULL REFERENCES marketplace_apps(id) ON DELETE CASCADE,
  version_id  UUID REFERENCES marketplace_app_versions(id),
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    UUID,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_app_lifecycle_events_tenant_app_idx ON store_app_lifecycle_events (tenant_id, app_id, created_at);
ALTER TABLE store_app_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_app_lifecycle_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON store_app_lifecycle_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
