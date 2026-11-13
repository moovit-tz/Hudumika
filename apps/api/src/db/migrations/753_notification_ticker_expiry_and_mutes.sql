-- Header notification bar: expiry, per-person muting, and a cleanup of rows
-- that could never be acted on.
--
-- 1. expires_at. A "Starting now: Home marketing" reminder was still being
--    announced as NEW ten weeks after the meeting. Some notifications are only
--    true for a short time; the writer now says until when, and the header bar
--    stops showing them after that. The bell keeps them — it is history.
--
-- 2. notification_mutes. One row per (person, app) they do not want to hear
--    from. Read-side only: the notification is still written, so unmuting
--    brings the history back rather than leaving a hole.
--
-- 3. Cleanup, all by marking read (never deleting), same treatment as
--    migration 341:
--      - calendar reminders older than a day get an expiry in the past;
--      - in-app rows addressed to nobody (no user, no customer) can never be
--        read by anyone, so they stop counting as unread;
--      - older unread billing notices for an invoice are superseded by the
--        newest one for that invoice and person.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (tenant_id, user_id, created_at DESC)
  WHERE read = false;

CREATE TABLE IF NOT EXISTS notification_mutes (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app        TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id, app)
);

ALTER TABLE notification_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_mutes FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'tenant_isolation_notification_mutes'
      AND polrelid = 'notification_mutes'::regclass
  ) THEN
    CREATE POLICY tenant_isolation_notification_mutes
      ON notification_mutes
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Calendar reminders are about one moment. Two hours after they were raised
-- the meeting has started or is over.
UPDATE notifications
SET expires_at = created_at + INTERVAL '2 hours'
WHERE expires_at IS NULL
  AND app = 'calendar'
  AND entity_type = 'calendar_event'
  AND (title LIKE 'Starting now:%' OR title LIKE 'Upcoming:%');

-- Addressed to nobody.
UPDATE notifications
SET read = true, status = 'AUTO_RESOLVED', read_at = NOW()
WHERE read = false
  AND title IS NOT NULL
  AND (channel IS NULL OR channel = 'IN_APP')
  AND user_id IS NULL
  AND customer_id IS NULL;

-- Billing: keep the newest unread notice per (person, invoice).
UPDATE notifications
SET read = true, status = 'AUTO_RESOLVED', read_at = NOW()
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY tenant_id, user_id, entity_id
             ORDER BY created_at DESC, id DESC
           ) AS rn
      FROM notifications
     WHERE read = false
       AND app = 'admin'
       AND entity_type = 'subscription_invoice'
       AND entity_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);
