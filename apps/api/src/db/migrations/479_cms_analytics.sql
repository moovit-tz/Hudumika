-- 479_cms_analytics.sql
-- §33 of the CMS master brief: Analytics — "Article A, 12,400 views" isn't
-- answerable today. A lightweight, first-party pageview counter, avoiding a
-- third-party analytics dependency per the brief's own "privacy-conscious"
-- framing: no IP address, no user agent, no cookie, no per-visitor
-- identity at all — just a count. Deliberately one row per (resource, day)
-- rather than one row per view, incremented in place on each beacon hit
-- (a real ON CONFLICT upsert, not a nightly aggregation job) — bounded
-- storage (one row per resource per day it was actually viewed) with no
-- separate raw-event table or sweep job to maintain, the same real goal
-- "aggregate nightly" was reaching for, reached more directly.

CREATE TABLE IF NOT EXISTS cms_pageview_daily (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT        NOT NULL,
  resource_type TEXT        NOT NULL CHECK (resource_type IN ('page', 'post', 'entry')),
  resource_id   UUID        NOT NULL,
  day           DATE        NOT NULL,
  count         INTEGER     NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, resource_type, resource_id, day)
);
CREATE INDEX IF NOT EXISTS cms_pageview_daily_resource ON cms_pageview_daily (tenant_id, resource_type, resource_id);

ALTER TABLE cms_pageview_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_pageview_daily FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_pageview_daily;
CREATE POLICY tenant_isolation_policy ON cms_pageview_daily
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
