-- One-off repair of the rows the missing-document reminder produced while it
-- was running 144 times a day (fixed in the job and the schedule; see
-- reminder.job.ts and jobs/index.ts).
--
-- What is being deleted, and what is not:
--
--   NOT TOUCHED  every bell row - channel IS NULL or 'IN_APP'. These are what
--                users actually see; there are 627 of them and none are
--                duplicates.
--   NOT TOUCHED  the newest WhatsApp/email row per recipient per day, per
--                shipment and trigger. That is the real delivery history: it
--                still answers "was this customer chased on the 14th, and how".
--   DELETED      every older row within the same day for the same key. Those
--                are the 143 extra copies each day produced, and they record
--                nothing the kept row does not.
--
-- Keeping one per day rather than one overall is deliberate. Collapsing to a
-- single row per recipient would erase a month of legitimate daily reminders
-- along with the duplicates, which is a bigger loss than the bloat.
--
-- Idempotent: re-running finds nothing left to delete, because after the first
-- pass each (day, key) group already has exactly one row. Safe on a database
-- that never had the problem, where it deletes nothing at all.

DELETE FROM notifications
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY shipment_id, trigger_type, channel, recipient,
                          date_trunc('day', created_at)
             ORDER BY created_at DESC, id DESC
           ) AS rn
      FROM notifications
     -- Delivery-log rows only. The bell never shows these: GET
     -- /v1/notifications filters to channel IS NULL OR channel = 'IN_APP'.
     WHERE channel IN ('WHATSAPP', 'EMAIL')
  ) ranked
  WHERE ranked.rn > 1
);

-- The reminder job's cooldown lookup filters on exactly these three columns,
-- and after this the table is small enough that the index is what keeps it
-- quick rather than the row count doing it by accident.
CREATE INDEX IF NOT EXISTS idx_notifications_trigger_lookup
  ON notifications(tenant_id, shipment_id, trigger_type, created_at DESC);
