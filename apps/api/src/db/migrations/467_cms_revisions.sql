-- 467_cms_revisions.sql
-- §19 of the CMS master brief: real version history. One shared table
-- covers all three editable content surfaces (Pages, Posts, and Content
-- Model entries) rather than three parallel tables — a snapshot is just
-- {resource_type, resource_id, snapshot JSON}, and every surface already
-- has a stable UUID id and an author to attribute it to. Append-only: a
-- restore writes a NEW revision documenting the restore itself, it never
-- deletes or rewrites history.

CREATE TABLE IF NOT EXISTS cms_revisions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT        NOT NULL,
  resource_type TEXT        NOT NULL, -- 'page' | 'post' | 'entry'
  resource_id   UUID        NOT NULL,
  snapshot      JSONB       NOT NULL,
  author_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cms_revisions_resource ON cms_revisions (tenant_id, resource_type, resource_id, created_at DESC);

ALTER TABLE cms_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_revisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_revisions;
CREATE POLICY tenant_isolation_policy ON cms_revisions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
