-- 468_cms_pages_trash_retention.sql
-- §63 of the CMS Implementation Map: Pages had no soft-delete at all — the
-- "Delete" button on a page row was always an instant, permanent DELETE,
-- unlike Posts (migration 464), which already got a real trash status.
-- This closes the gap the same way: pages gain the 'trash' status (enforced
-- in code, not a CHECK constraint — matches this table's own existing
-- convention), plus a trashed_at timestamp on both pages and posts so an
-- automatic retention sweep (cms-trash-purge.job.ts) knows how long
-- something has actually sat in Trash — updated_at can't be used for that,
-- since it bumps on any edit, not just the trash transition. Posts never
-- had trashed_at either (its own Trash button predates this column), so it
-- gains one too rather than leaving the two tables inconsistent.

ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ;
ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS cms_pages_trashed ON cms_pages (trashed_at) WHERE status = 'trash';
CREATE INDEX IF NOT EXISTS cms_posts_trashed ON cms_posts (trashed_at) WHERE status = 'trash';
