-- Migration 337: M8 of the corporate-tax build-out — PO <-> Bill matching.
-- supplier_bills.po_number has always been free text with no FK; po_id is
-- additive alongside it (the free-text field stays, for POs never entered
-- as a real record). Backfilled by matching existing po_number strings
-- against real purchase_orders — case/whitespace-insensitive, since the
-- free-text field was never validated against anything.

ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS po_id UUID REFERENCES purchase_orders(id);

UPDATE supplier_bills sb
SET po_id = po.id
FROM purchase_orders po
WHERE sb.tenant_id = po.tenant_id
  AND sb.po_id IS NULL
  AND sb.po_number IS NOT NULL
  AND trim(lower(sb.po_number)) = trim(lower(po.po_number));
