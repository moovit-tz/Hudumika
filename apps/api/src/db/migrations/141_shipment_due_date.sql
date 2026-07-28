-- 141_shipment_due_date.sql
-- ShipmentDetail.tsx's "Key Dates" panel has always displayed a "Due Date"
-- row (mapped to a `due_date` field the GET /v1/shipments/:id response never
-- actually set — shipment_cases has no such column, only the auto-managed
-- `sla_deadline`, which gets silently overwritten on every stage transition
-- and so isn't safe to expose as a manually-editable business commitment
-- date). This is a real, separate, user-settable due date.
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
