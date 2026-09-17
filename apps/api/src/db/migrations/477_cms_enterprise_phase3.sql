-- 477_cms_enterprise_phase3.sql
-- Phase 3: Enterprise CMS
-- Editorial process at scale:
-- §15 Configurable Workflow (cms_workflow_states + cms_workflow_transitions)
-- §16 Approvals (cms_approvals with assignment notifications and decision notes)
-- §18 Content Releases (cms_releases + cms_release_items atomic batch publish)
-- §19-20 Editorial Collaboration (cms_content_comments internal threaded discussions)
-- §23 Multisite (cms_sites table + site_id on pages/posts/entries/media/navigation)
-- §25-26 Localization & Translation (locale + translation_group_id on content items)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Multisite (§23)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cms_sites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  domain      TEXT,
  is_default  BOOLEAN     NOT NULL DEFAULT false,
  settings    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS cms_sites_tenant ON cms_sites (tenant_id);

ALTER TABLE cms_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_sites FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_sites;
CREATE POLICY tenant_isolation_policy ON cms_sites
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

-- Add site_id to existing CMS tables (additive & nullable)
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES cms_sites(id) ON DELETE SET NULL;
ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES cms_sites(id) ON DELETE SET NULL;
ALTER TABLE cms_media ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES cms_sites(id) ON DELETE SET NULL;
ALTER TABLE cms_content_entries ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES cms_sites(id) ON DELETE SET NULL;
ALTER TABLE cms_nav_items ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES cms_sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cms_pages_site ON cms_pages (tenant_id, site_id);
CREATE INDEX IF NOT EXISTS cms_posts_site ON cms_posts (tenant_id, site_id);
CREATE INDEX IF NOT EXISTS cms_media_site ON cms_media (tenant_id, site_id);
CREATE INDEX IF NOT EXISTS cms_content_entries_site ON cms_content_entries (tenant_id, site_id);
CREATE INDEX IF NOT EXISTS cms_nav_items_site ON cms_nav_items (tenant_id, site_id);

-- Backfill a default site for existing tenants with content
INSERT INTO cms_sites (tenant_id, slug, name, is_default, settings)
SELECT DISTINCT t.id::text, 'default', 'Default Site', true, '{}'::jsonb
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM cms_sites s WHERE s.tenant_id = t.id::text AND s.slug = 'default'
)
ON CONFLICT (tenant_id, slug) DO NOTHING;

UPDATE cms_pages p SET site_id = s.id
FROM cms_sites s
WHERE p.site_id IS NULL AND s.tenant_id = p.tenant_id AND s.is_default = true;

UPDATE cms_posts p SET site_id = s.id
FROM cms_sites s
WHERE p.site_id IS NULL AND s.tenant_id = p.tenant_id AND s.is_default = true;

UPDATE cms_media m SET site_id = s.id
FROM cms_sites s
WHERE m.site_id IS NULL AND s.tenant_id = m.tenant_id AND s.is_default = true;

UPDATE cms_content_entries e SET site_id = s.id
FROM cms_sites s
WHERE e.site_id IS NULL AND s.tenant_id = e.tenant_id AND s.is_default = true;

UPDATE cms_nav_items n SET site_id = s.id
FROM cms_sites s
WHERE n.site_id IS NULL AND s.tenant_id = n.tenant_id AND s.is_default = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Configurable Workflow (§15)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cms_workflow_states (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT        NOT NULL,
  slug         TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  color        TEXT        NOT NULL DEFAULT '#64748b',
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  is_initial   BOOLEAN     NOT NULL DEFAULT false,
  is_published BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS cms_workflow_states_tenant ON cms_workflow_states (tenant_id, sort_order);

ALTER TABLE cms_workflow_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_workflow_states FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_workflow_states;
CREATE POLICY tenant_isolation_policy ON cms_workflow_states
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

CREATE TABLE IF NOT EXISTS cms_workflow_transitions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         TEXT        NOT NULL,
  from_state_id     UUID        NOT NULL REFERENCES cms_workflow_states(id) ON DELETE CASCADE,
  to_state_id       UUID        NOT NULL REFERENCES cms_workflow_states(id) ON DELETE CASCADE,
  name              TEXT,
  allowed_roles     JSONB       NOT NULL DEFAULT '[]',
  requires_approval BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, from_state_id, to_state_id)
);
CREATE INDEX IF NOT EXISTS cms_workflow_transitions_tenant ON cms_workflow_transitions (tenant_id);

ALTER TABLE cms_workflow_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_workflow_transitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_workflow_transitions;
CREATE POLICY tenant_isolation_policy ON cms_workflow_transitions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Approvals (§16)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cms_approvals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT        NOT NULL,
  resource_type TEXT        NOT NULL, -- 'page' | 'post' | 'entry'
  resource_id   UUID        NOT NULL,
  assigned_to   TEXT        NOT NULL, -- user sub (reviewer)
  assigned_by   TEXT,       -- user sub (requester)
  status        TEXT        NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'cancelled'
  due_date      TIMESTAMPTZ,
  decision_at   TIMESTAMPTZ,
  decision_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cms_approvals_resource ON cms_approvals (tenant_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS cms_approvals_reviewer ON cms_approvals (tenant_id, assigned_to, status);

ALTER TABLE cms_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_approvals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_approvals;
CREATE POLICY tenant_isolation_policy ON cms_approvals
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Content Releases (§18)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cms_releases (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  description  TEXT,
  status       TEXT        NOT NULL DEFAULT 'draft', -- 'draft' | 'scheduled' | 'published' | 'archived'
  publish_at   TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cms_releases_tenant ON cms_releases (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cms_releases_scheduled ON cms_releases (publish_at) WHERE status = 'scheduled';

ALTER TABLE cms_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_releases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_releases;
CREATE POLICY tenant_isolation_policy ON cms_releases
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

CREATE TABLE IF NOT EXISTS cms_release_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT        NOT NULL,
  release_id    UUID        NOT NULL REFERENCES cms_releases(id) ON DELETE CASCADE,
  resource_type TEXT        NOT NULL, -- 'page' | 'post' | 'entry'
  resource_id   UUID        NOT NULL,
  target_status TEXT        NOT NULL DEFAULT 'published',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (release_id, resource_type, resource_id)
);
CREATE INDEX IF NOT EXISTS cms_release_items_release ON cms_release_items (release_id);
CREATE INDEX IF NOT EXISTS cms_release_items_resource ON cms_release_items (tenant_id, resource_type, resource_id);

ALTER TABLE cms_release_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_release_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_release_items;
CREATE POLICY tenant_isolation_policy ON cms_release_items
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Editorial Collaboration Comments (§19-20)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cms_content_comments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT        NOT NULL,
  resource_type TEXT        NOT NULL, -- 'page' | 'post' | 'entry'
  resource_id   UUID        NOT NULL,
  author_id     TEXT        NOT NULL, -- user sub
  parent_id     UUID        REFERENCES cms_content_comments(id) ON DELETE CASCADE,
  content       TEXT        NOT NULL,
  block_id      TEXT,       -- optional block id in Block Editor
  resolved      BOOLEAN     NOT NULL DEFAULT false,
  resolved_by   TEXT,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cms_content_comments_resource ON cms_content_comments (tenant_id, resource_type, resource_id, created_at);

ALTER TABLE cms_content_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_content_comments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_content_comments;
CREATE POLICY tenant_isolation_policy ON cms_content_comments
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Localization & Translation Grouping (§25-26)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS translation_group_id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS translation_group_id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE cms_content_entries ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE cms_content_entries ADD COLUMN IF NOT EXISTS translation_group_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS cms_pages_translation ON cms_pages (tenant_id, translation_group_id, locale);
CREATE INDEX IF NOT EXISTS cms_posts_translation ON cms_posts (tenant_id, translation_group_id, locale);
CREATE INDEX IF NOT EXISTS cms_content_entries_translation ON cms_content_entries (tenant_id, translation_group_id, locale);
