-- Migration 217: platform default workflows — per-tenant seed markers.
--
-- Flags a workflow as platform-seeded (`is_system`) and stamps the stable key
-- of the template it came from (`template_key`, e.g. 'sys-sea-import'). The
-- actual rows are inserted per-tenant by DefaultWorkflowService.seedForTenant
-- (at tenant creation) and backfilled into existing tenants by
-- scripts/seed-default-workflows.ts — data seeding a migration cannot express
-- cleanly (each workflow needs generated step UUIDs cross-referenced in
-- next_step_ids). These columns are what make that seed idempotent and
-- deletion-respecting: a tenant that removes a default is never re-seeded,
-- because existence is keyed on (tenant_id, template_key) across deleted rows.

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS template_key TEXT;

CREATE INDEX IF NOT EXISTS workflows_template_key
  ON workflows (tenant_id, template_key) WHERE template_key IS NOT NULL;
