-- Bell rows about a shipment that were written with no link.
--
-- Some matrix triggers (KEY_DATE_CHANGED, and older SLA_BREACH /
-- DEMURRAGE_RISK rows from before their bell config existed) produced an
-- in-app notification with link NULL. Clicking one could only mark it read.
-- The service now always links a shipment row to its shipment; this gives the
-- rows already in the table the same destination.

UPDATE notifications
SET link = '/clearance/' || shipment_id::text
WHERE (link IS NULL OR link = '')
  AND shipment_id IS NOT NULL
  AND title IS NOT NULL
  AND (channel IS NULL OR channel = 'IN_APP');
