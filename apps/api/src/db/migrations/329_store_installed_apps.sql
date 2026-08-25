-- Migration 329: real per-tenant persistence for Store add-on install state.
-- Store.tsx tracked "installed" apps in localStorage only — invisible to any
-- other staff member on the same tenant and lost on a new device/browser.
-- Existence of a row = installed, same pattern as project_pins
-- (325_project_pins.sql): a marketplace app is a platform-wide catalog
-- entry, install status is the per-tenant fact layered on top of it.

CREATE TABLE IF NOT EXISTS store_installed_apps (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  app_id       UUID NOT NULL REFERENCES marketplace_apps(id) ON DELETE CASCADE,
  installed_by UUID,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, app_id)
);

ALTER TABLE store_installed_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_installed_apps FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON store_installed_apps
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
