-- 056_notifications_nullable_shipment.sql
-- notifications.shipment_id was NOT NULL from the original shipment-only
-- design (003_supporting.sql). NotificationService.createNotification()
-- (a generic, app-agnostic bell helper added later, app/type columns from
-- 020_notification_app.sql) always passes shipment_id: null, which violated
-- this constraint on every call — the method silently failed under RLS and
-- was effectively dead code. Relaxing it to allow non-shipment notifications
-- (e.g. fleet alerts) to use the bell. See also 057, which relaxes the rest
-- of the shipment-matrix-only NOT NULL columns on this same table.

ALTER TABLE notifications ALTER COLUMN shipment_id DROP NOT NULL;
