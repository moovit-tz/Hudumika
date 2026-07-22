-- Migration 070: soft-delete for shipment_cases. Customs cases carry
-- regulatory/audit weight, so "delete" removes the record from every
-- listing/detail view but never destroys the row or its child records
-- (documents, expenses, messages, stage history) — matches how the rest
-- of the domain already treats deactivation (customers.active, etc.).
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS deleted_by UUID;
CREATE INDEX IF NOT EXISTS idx_shipment_cases_deleted_at ON shipment_cases(deleted_at) WHERE deleted_at IS NOT NULL;
