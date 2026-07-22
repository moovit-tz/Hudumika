-- Migration 020: Add workspace app context to notifications
-- Enables cross-app notification grouping in the Notification Centre

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS app          TEXT NOT NULL DEFAULT 'clearos',
  ADD COLUMN IF NOT EXISTS entity_type  TEXT,
  ADD COLUMN IF NOT EXISTS entity_id    TEXT,
  ADD COLUMN IF NOT EXISTS entity_label TEXT;

-- Back-fill: all existing rows are ClearOS shipment notifications
UPDATE notifications SET app = 'clearos' WHERE app = 'clearos';

CREATE INDEX IF NOT EXISTS idx_notifications_app ON notifications(user_id, app, read);
