-- ============================================================
-- 103 — Real backends for OneSite's Posts and Comments tabs
--        (previously localStorage-only, see cms.service.ts /
--        cms.routes.ts for the Pages precedent this mirrors).
-- ============================================================

CREATE TABLE cms_posts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL DEFAULT '',
  status      TEXT        NOT NULL DEFAULT 'draft', -- draft | published | trash
  author_id   TEXT,
  category    TEXT,
  tags        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cms_posts_tenant ON cms_posts (tenant_id, updated_at DESC);

-- No visitor-facing comment submission exists anywhere yet (no public
-- comment form) — this is real moderation infrastructure for whenever one
-- is added, not a live comment stream today. Starts empty, no seed data.
CREATE TABLE cms_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT        NOT NULL,
  post_id     UUID        REFERENCES cms_posts(id) ON DELETE CASCADE,
  author      TEXT        NOT NULL,
  email       TEXT,
  content     TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending', -- approved | pending | spam
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cms_comments_tenant ON cms_comments (tenant_id, created_at DESC);
