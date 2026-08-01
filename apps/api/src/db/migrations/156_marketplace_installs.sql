-- Migration 156: per-tenant marketplace installs, and the secret used to sign
-- outbound domain-event webhooks.
--
-- Why: marketplace_apps is a GLOBAL catalog — it has no tenant_id, and no
-- install table existed anywhere in the schema. domain-events.service.ts
-- dispatched every tenant's events to every row matching
-- `status = 'approved' AND webhook_url IS NOT NULL`, so a single approved
-- third-party app would have received all seven tenants' shipment and
-- declaration payloads, each tagged with its tenant_id. Nothing scoped that
-- fan-out because there was nothing to scope it by. This table is that
-- missing scope: an app receives a tenant's events only if that tenant
-- installed it.
--
-- webhook_secret is per (tenant, app) rather than per app so that a leaked
-- secret cannot be replayed against another tenant's deliveries. It has no DB
-- default: pgcrypto is not installed on this cluster, and generating key
-- material in Node (randomBytes) rather than from a SQL default keeps the one
-- place that mints secrets in application code where it can be rotated.

CREATE TABLE IF NOT EXISTS tenant_marketplace_installs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_id         UUID        NOT NULL REFERENCES marketplace_apps(id) ON DELETE CASCADE,
  webhook_secret TEXT        NOT NULL,
  events_enabled BOOLEAN     NOT NULL DEFAULT true,
  installed_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  installed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at     TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_marketplace_installs_unique
  ON tenant_marketplace_installs (tenant_id, app_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS tenant_marketplace_installs_dispatch
  ON tenant_marketplace_installs (tenant_id) WHERE revoked_at IS NULL AND events_enabled = true;

ALTER TABLE tenant_marketplace_installs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'tenant_marketplace_installs'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON tenant_marketplace_installs
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Deliberately NOT backfilled. There is no record of which tenant installed
-- which app — `marketplace_apps.installs` is a display string ('1.2k'), not a
-- relation — so any backfill would be invented consent. Every tenant starts
-- with zero installs and therefore zero outbound event delivery, which is the
-- correct default for a fan-out that was never scoped in the first place.
