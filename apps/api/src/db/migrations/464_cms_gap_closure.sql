-- 464_cms_gap_closure.sql
-- Closes the remaining named CMS gaps: posts had no public output at all
-- (no slug, no public route), no scheduling despite the dashboard's own
-- copy claiming one, and no media/image upload anywhere in the app.

-- Posts need a slug for a public URL, same shape as cms_pages already has.
ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS slug TEXT;
UPDATE cms_posts SET slug = lower(regexp_replace(regexp_replace(trim(title), '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')) || '-' || substr(id::text, 1, 8)
  WHERE slug IS NULL;
ALTER TABLE cms_posts ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cms_posts_tenant_slug ON cms_posts (tenant_id, slug);

-- Scheduling — the dashboard already claims "published, drafted and
-- scheduled" with nothing behind the third word; status='scheduled' plus a
-- publish_at cron target closes it for both pages and posts. Neither table
-- has a CHECK constraint on status (plain TEXT, see migrations 101/103), so
-- no constraint needs widening, just the new column.
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;
ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS cms_pages_scheduled ON cms_pages (publish_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS cms_posts_scheduled ON cms_posts (publish_at) WHERE status = 'scheduled';

-- Real full-text search over pages/posts, replacing the in-memory
-- substring filter that only ever existed on the Posts tab.
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))) STORED;
ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))) STORED;
CREATE INDEX IF NOT EXISTS cms_pages_search ON cms_pages USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS cms_posts_search ON cms_posts USING GIN (search_vector);

-- Media library — the app had zero image/file upload anywhere (logo/
-- favicon were raw text-URL inputs, the editor had no image insert). tenant_id
-- is TEXT, matching cms_pages/cms_posts/cms_comments's own existing type
-- (not UUID) rather than introducing a mismatched column in the same app.
CREATE TABLE IF NOT EXISTS cms_media (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT        NOT NULL,
  filename    TEXT        NOT NULL,
  storage_key TEXT        NOT NULL,
  mime_type   TEXT        NOT NULL,
  size        INTEGER     NOT NULL,
  uploaded_by TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cms_media_tenant ON cms_media (tenant_id, created_at DESC);

ALTER TABLE cms_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_media FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_media;
CREATE POLICY tenant_isolation_policy ON cms_media
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
