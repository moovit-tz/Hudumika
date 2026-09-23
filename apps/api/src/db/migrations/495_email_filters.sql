-- 495_email_filters.sql
-- Gmail's Filters — persist a set of search criteria (the exact same shape
-- as the Advanced Search form so "Create filter" literally saves the query
-- that was just run) plus actions to apply automatically, both retroactively
-- (on request, at creation time) and going forward (checked at inbound-mail
-- ingest, alongside the existing spam blocklist check).
--
-- Scope note: "Forward to" is deliberately not one of the available actions
-- yet — safely relaying to an arbitrary address needs a verified-address
-- step this pass doesn't build (the same reasoning spam_blocklist stayed
-- rule-based rather than growing an auto-forward side effect). The actions
-- available today are the ones with no external-delivery risk: label,
-- archive (skip the inbox), star, mark as read, delete.

CREATE TABLE IF NOT EXISTS email_filters (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Same field names as email.routes.ts's advanced-search query params
  -- (from/to/subject/hasWords/doesntHave/hasAttachment/sizeCmp/sizeMb),
  -- minus the ones that only make sense for a one-off search (scope,
  -- dateWithin/dateAfter/dateBefore) — a standing filter has no "today".
  criteria   JSONB NOT NULL DEFAULT '{}',
  -- {skipInbox, archive, star, markRead, delete, label} — every key optional/boolean, label is a string or null.
  actions    JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_filters_user ON email_filters(tenant_id, user_id);

ALTER TABLE email_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_filters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON email_filters;
CREATE POLICY tenant_isolation_policy ON email_filters
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
