-- Collapse repeated unread notifications about the same thing.
--
-- Migration 341 did this for one trigger (MISSING_DOCUMENT) per shipment. The
-- audit on 2026-11-12 still found 64 unread rows that repeat an earlier unread
-- row for the same person, title and subject — e.g. "Cannot chase missing
-- documents" written once a day for the same shipment. The header bar already
-- shows one per subject; this makes the bell count agree.
--
-- Same treatment as 341: the newest unread row per (person, title, subject)
-- stays; older unread copies are marked read with status AUTO_RESOLVED, never
-- deleted. Read rows are untouched. Idempotent.

UPDATE notifications
SET read = true, status = 'AUTO_RESOLVED', read_at = NOW()
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY tenant_id, user_id, title, COALESCE(shipment_id::text, entity_id, '')
             ORDER BY created_at DESC, id DESC
           ) AS rn
      FROM notifications
     WHERE read = false
       AND title IS NOT NULL
       AND (channel IS NULL OR channel = 'IN_APP')
       AND user_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);
