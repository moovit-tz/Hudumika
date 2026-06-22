-- Migration 014: Add in-app notification columns to notifications table
-- The existing notifications table was a message-dispatch log.
-- We add columns to support the in-app notification bell.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS title VARCHAR(300),
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS link VARCHAR(500),
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Backfill title from content for existing rows
UPDATE notifications SET title = LEFT(content, 300) WHERE title IS NULL;

-- Now make title NOT NULL (after backfill)
ALTER TABLE notifications ALTER COLUMN title SET NOT NULL;

-- Indexes for fast bell queries
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read) WHERE NOT read;
