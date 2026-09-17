-- 469_cms_nav_items.sql
-- §14 of the CMS master brief: the public site's header was hardcoded
-- (brand name, logo, tagline, the raw page list, a Blog link if posts
-- exist) — nothing admin-configurable. A real nav tree: parent_id is a
-- self-FK so a top-level item can hold child items (a simple dropdown),
-- sort_order is manually set via up/down controls (same reasoning as the
-- Block Editor's own reordering — reliable, keyboard-usable, no drag-and-
-- drop). target is a free string deliberately, not a foreign key to a page/
-- post/entry: it can point at any real published slug, an external URL, or
-- an anchor, mirroring how a real nav menu actually gets used.

CREATE TABLE IF NOT EXISTS cms_nav_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT        NOT NULL,
  label       TEXT        NOT NULL,
  target      TEXT        NOT NULL,
  parent_id   UUID        REFERENCES cms_nav_items(id) ON DELETE CASCADE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cms_nav_items_tenant ON cms_nav_items (tenant_id, sort_order);

ALTER TABLE cms_nav_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_nav_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_nav_items;
CREATE POLICY tenant_isolation_policy ON cms_nav_items
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
