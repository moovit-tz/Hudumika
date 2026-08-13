-- Migration 228: backfill shipment_listeners for shipments created before
-- the customer was auto-added as a Listener on creation (shipment.service.ts
-- createCase). That fix only fires on the INSERT path, so every shipment
-- created before it shipped still shows its declared customer as absent from
-- Listeners ▸ Customers on the sidebar, with no future event that will ever
-- add them.
--
-- One-time backfill: for each shipment_cases row whose declared customer
-- isn't already recorded as a 'customer' listener on it, add exactly that
-- one row — contact_name if the customer record has one, else the company
-- name. Same default channels the manual "Add Customer Listener" picker and
-- the create-time code path both default to (email + WhatsApp).
--
-- Idempotent: NOT EXISTS keys off (shipment_id, type='customer', user_id) —
-- reruns find nothing left to insert, and a shipment where someone had
-- already manually tagged this same customer as a listener is left alone
-- rather than duplicated.
INSERT INTO shipment_listeners (tenant_id, shipment_id, type, user_id, name, role, channels, created_by, created_at)
SELECT
  sc.tenant_id,
  sc.id,
  'customer',
  sc.customer_id,
  COALESCE(NULLIF(c.contact_name, ''), c.name),
  'Customer',
  '["email","whatsapp"]'::jsonb,
  sc.assigned_to,
  now()
FROM shipment_cases sc
JOIN customers c ON c.id = sc.customer_id AND c.tenant_id = sc.tenant_id
WHERE NOT EXISTS (
  SELECT 1 FROM shipment_listeners sl
  WHERE sl.shipment_id = sc.id
    AND sl.type = 'customer'
    AND sl.user_id = sc.customer_id
);
