-- Delivery Notes <-> Shipment link.
--
-- delivery_notes had no shipment reference at all — the "Link to BL /
-- Shipment" picker in DeliveryNotes.tsx only ever copied the shipment's BL
-- number into the free-text `notes` JSON blob (dispatchRef), never a real
-- id. Meanwhile release_orders (migration 254) already has a real
-- subject_type/subject_id soft link to shipment_cases, just never wired up
-- on the frontend (ReleaseOrdersPage.tsx hardcoded subjectType:'adhoc').
--
-- Soft link (no FK), matching release_orders' own reasoning: shipment_cases
-- is partitioned, so a real FK isn't used elsewhere in the codebase for
-- shipment references either (see vehicle_expenses.trip_id, trips.shipment_id).
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS shipment_id UUID;
CREATE INDEX IF NOT EXISTS idx_delivery_notes_shipment ON delivery_notes(tenant_id, shipment_id);
