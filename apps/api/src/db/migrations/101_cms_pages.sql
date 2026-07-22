-- ============================================================
-- 101 — Real CMS pages table, replacing the localStorage-only
--        OneSite "Pages" mock and the hardcoded Privacy/Terms
--        TSX content. tenant_id NULL = a Hudumika platform page
--        (SuperAdmin-editable); tenant_id set = a tenant's own
--        OneSite page.
-- ============================================================

CREATE TABLE cms_pages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT,
  slug             TEXT        NOT NULL,
  title            TEXT        NOT NULL,
  content          TEXT        NOT NULL DEFAULT '',
  status           TEXT        NOT NULL DEFAULT 'draft', -- draft | published
  seo_description  TEXT,
  author_id        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Postgres treats NULL as distinct in a plain UNIQUE(tenant_id, slug), which
-- would let duplicate platform-page slugs slip through — partial indexes
-- close that gap for each case separately.
CREATE UNIQUE INDEX cms_pages_platform_slug ON cms_pages (slug) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX cms_pages_tenant_slug   ON cms_pages (tenant_id, slug) WHERE tenant_id IS NOT NULL;

CREATE INDEX cms_pages_tenant ON cms_pages (tenant_id);
