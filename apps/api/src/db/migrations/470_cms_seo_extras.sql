-- 470_cms_seo_extras.sql
-- §27 of the CMS master brief: only seo_description existed. Three more
-- columns close the row's own "to close it" note exactly — a canonical URL
-- override, a robots noindex toggle, and an Open Graph image. sitemap.xml
-- itself needs no new columns (it just selects published slugs), so it's
-- not part of this migration.

ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS canonical_url TEXT;
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS noindex BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS og_image TEXT;

ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS canonical_url TEXT;
ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS noindex BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS og_image TEXT;
