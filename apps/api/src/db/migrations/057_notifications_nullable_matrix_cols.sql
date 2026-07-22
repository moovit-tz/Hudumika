-- 057_notifications_nullable_matrix_cols.sql
-- Continuation of 056: trigger_type/channel/recipient/content were also
-- NOT NULL from the original shipment-matrix-only design (003_supporting.sql).
-- NotificationService.createNotification() always passes these as null too,
-- so they must be relaxed the same way for generic (non-shipment) bell
-- notifications, such as fleet alerts, to insert successfully.

ALTER TABLE notifications ALTER COLUMN trigger_type DROP NOT NULL;
ALTER TABLE notifications ALTER COLUMN channel DROP NOT NULL;
ALTER TABLE notifications ALTER COLUMN recipient DROP NOT NULL;
ALTER TABLE notifications ALTER COLUMN content DROP NOT NULL;
