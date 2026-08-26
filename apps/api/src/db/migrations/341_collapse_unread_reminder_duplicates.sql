-- One-off cleanup to go with the reminder.job.ts fix in the same change: that
-- fix stops new unread duplicates from piling up going forward and
-- auto-resolves a reminder once its underlying condition changes, but neither
-- of those touches rows that were already sitting there before the fix
-- shipped — a shipment could have 5 unread "Cannot chase missing documents"
-- rows (one per day the job ran before this fix, all still unread because
-- the recipient never got past the first one) and nothing in the new code
-- ever revisits an old row unless its condition specifically changes.
--
-- What is being touched, and what is not:
--
--   NOT TOUCHED  the single newest unread row per (tenant, shipment,
--                trigger_type). That is the live reminder — the one that
--                would keep surfacing in the bell either way.
--   NOT TOUCHED  every already-read row. A person saw it; collapsing it away
--                would erase real read history for no reason.
--   MARKED       every older *unread* row in the same (tenant, shipment,
--                trigger_type) group — same treatment the job itself now
--                gives a resolved reminder (read = true, status =
--                'AUTO_RESOLVED'), not deleted, so the count of "how many
--                times were we reminded about this" stays intact for anyone
--                who looks at full history later.
--
-- Idempotent: after the first pass each (tenant, shipment, trigger_type)
-- group has at most one unread row left, so re-running finds nothing further
-- to collapse. Safe on a database the job fix already kept clean.

UPDATE notifications
SET read = true, status = 'AUTO_RESOLVED', read_at = NOW()
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY tenant_id, shipment_id, trigger_type
             ORDER BY created_at DESC, id DESC
           ) AS rn
      FROM notifications
     WHERE read = false
       AND trigger_type = 'MISSING_DOCUMENT'
       AND shipment_id IS NOT NULL
  ) ranked
  WHERE ranked.rn > 1
);
