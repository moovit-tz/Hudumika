-- 466_cms_components.sql
-- §8 of the CMS master brief: a reusable Component system (Navbar/Hero/CTA)
-- sitting on top of migration 465/466's block model. A component is just a
-- named, reusable cms_content_entries "blocks" array a tenant defines once
-- and references from any 'blocks' field via a {type:'component',
-- props:{componentId}} block — editing the definition here is what makes
-- every reference update, since it's a live id lookup at render time, not a
-- copy. Deliberately its own table, not a cms_content_entries row, since a
-- component isn't itself a publishable, slugged, listable "thing" — it has
-- no status/publish_at/seo, just a name and a block array.

CREATE TABLE IF NOT EXISTS cms_components (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT        NOT NULL,
  key          TEXT        NOT NULL, -- machine name, e.g. "cta-banner"
  name         TEXT        NOT NULL, -- e.g. "CTA banner"
  blocks       JSONB       NOT NULL DEFAULT '[]',
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cms_components_tenant_key ON cms_components (tenant_id, key);
CREATE INDEX IF NOT EXISTS cms_components_tenant ON cms_components (tenant_id);

ALTER TABLE cms_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_components FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_components;
CREATE POLICY tenant_isolation_policy ON cms_components
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
