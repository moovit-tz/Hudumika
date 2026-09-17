-- 476_cms_saved_filters.sql
-- §4 of the CMS master brief: the Content Manager's own "saved filters"
-- gap. A named status+search combination, scoped to the tenant and the
-- content model it was saved against — shared across the tenant's own CMS
-- users (this codebase has no per-user CMS preference surface anywhere
-- else to hang a private-to-me version off), the same visibility model as
-- cms_nav_items and cms_role_capabilities. Both status and search are
-- nullable: a saved filter can legitimately be "just a search term, any
-- status" or "just Drafts, no search term" — NULL means "don't filter on
-- this axis," not "empty string."

CREATE TABLE IF NOT EXISTS cms_saved_filters (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT        NOT NULL,
  model_id    UUID        NOT NULL REFERENCES cms_content_models(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  status      TEXT,
  search      TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cms_saved_filters_model ON cms_saved_filters (tenant_id, model_id);

ALTER TABLE cms_saved_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_saved_filters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_saved_filters;
CREATE POLICY tenant_isolation_policy ON cms_saved_filters
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
