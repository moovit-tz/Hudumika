-- Merges release_orders (ClearOS, migration 254) and delivery_notes/
-- delivery_note_lines (migration 022) into one real document type,
-- delivery_documents — the user's own read of the two: "release orders and
-- delivery notes do the same [thing]". Lives conceptually in FinOps now
-- (ClearOS's /clearos/release-orders and FinOps's old /finance/delivery-notes
-- both retire in favour of one combined tool); other apps (ClearOS's
-- ShipmentDetail) keep reaching it by calling the API directly, same as
-- every other cross-app link in this codebase.
--
-- doc_type keeps the union of both source concepts as one CHECK-constrained
-- column rather than three separate tables: RELEASE_ORDER/DELIVERY_ORDER
-- (customs gate-pass — container list, carrier, validity window) and
-- DELIVERY_NOTE (proof-of-delivery — goods table, driver, signatures). Not
-- every column is meaningful for every type (containers is RO/DO-only,
-- delivery_document_lines is DELIVERY_NOTE-only) — a normal, common shape
-- for one table serving related-but-different document subtypes.
--
-- status is a single union of both source lifecycles: draft/issued/used
-- (RO/DO authorization) plus dispatched/delivered/returned (DN fulfilment),
-- plus expired/cancelled. Nothing enforces which subtype uses which values —
-- same looseness the two source tables already had individually.

CREATE TABLE IF NOT EXISTS delivery_documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_type           VARCHAR(20) NOT NULL CHECK (doc_type IN ('RELEASE_ORDER','DELIVERY_ORDER','DELIVERY_NOTE')),
  doc_number         VARCHAR(100),
  subject_type       VARCHAR(20) NOT NULL DEFAULT 'adhoc' CHECK (subject_type IN ('shipment','adhoc')),
  subject_id         UUID,
  invoice_id         UUID REFERENCES sales_invoices(id) ON DELETE SET NULL,
  customer_id        UUID,
  customer_name      VARCHAR(300),
  customer_address   TEXT,
  contact_person     VARCHAR(200),
  contact_phone      VARCHAR(50),
  contact_email      VARCHAR(320),
  delivery_address   TEXT,
  city               VARCHAR(100),
  containers         JSONB NOT NULL DEFAULT '[]'::jsonb,
  carrier_name       VARCHAR(200),
  vessel_voyage      VARCHAR(200),
  driver_name        VARCHAR(200),
  vehicle_no         VARCHAR(50),
  driver_contact     VARCHAR(50),
  release_conditions TEXT,
  discrepancy_notes  TEXT,
  valid_from         DATE,
  valid_until        DATE,
  delivery_date      DATE,
  status             VARCHAR(20) NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','issued','dispatched','delivered','used','returned','expired','cancelled')),
  issued_by          UUID,
  issued_at          TIMESTAMPTZ,
  dispatched_at      TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  used_at            TIMESTAMPTZ,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delivery_documents_tenant ON delivery_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_documents_subject ON delivery_documents(tenant_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_delivery_documents_number ON delivery_documents(tenant_id, doc_number);

CREATE TABLE IF NOT EXISTS delivery_document_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES delivery_documents(id) ON DELETE CASCADE,
  description   VARCHAR(500) NOT NULL DEFAULT '',
  qty_ordered   NUMERIC(12,2) DEFAULT 0,
  qty_delivered NUMERIC(12,2) DEFAULT 0,
  unit          VARCHAR(50),
  condition     VARCHAR(50),
  remarks       TEXT,
  sort_order    INT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_delivery_document_lines_doc ON delivery_document_lines(document_id);

ALTER TABLE delivery_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_documents FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'delivery_documents'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON delivery_documents
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- delivery_document_lines has no tenant_id of its own (same shape as the
-- delivery_note_lines it replaces) — access is scoped through document_id's
-- own RLS-protected parent, matching how journal_lines/sales_invoice_lines
-- already work in this codebase.

-- ── Data migration — real user data, not test fixtures, preserved by id ────

INSERT INTO delivery_documents (
  id, tenant_id, doc_type, doc_number, subject_type, subject_id,
  containers, carrier_name, vessel_voyage, release_conditions,
  valid_from, valid_until, status, issued_by, issued_at, used_at,
  customer_name, customer_address, created_by, created_at, updated_at
)
SELECT
  id, tenant_id, order_type, order_number, subject_type, subject_id,
  containers, carrier_name, vessel_voyage, release_conditions,
  valid_from, valid_until, status, issued_by, issued_at, used_at,
  consignee_name, consignee_address, created_by, created_at, updated_at
FROM release_orders;

INSERT INTO delivery_documents (
  id, tenant_id, doc_type, doc_number, subject_type, subject_id,
  invoice_id, customer_id, customer_name, contact_person, contact_phone,
  contact_email, delivery_address, city, carrier_name, driver_name,
  vehicle_no, driver_contact, discrepancy_notes, delivery_date, status,
  created_by, created_at, updated_at
)
SELECT
  dn.id, dn.tenant_id, 'DELIVERY_NOTE', dn.dn_number,
  CASE WHEN dn.shipment_id IS NOT NULL THEN 'shipment' ELSE 'adhoc' END,
  dn.shipment_id, dn.invoice_id, dn.customer_id, dn.customer_name,
  NULLIF(extra->>'contactPerson', ''), NULLIF(extra->>'phone', ''),
  NULLIF(extra->>'email', ''), NULLIF(extra->>'deliveryAddress', ''),
  NULLIF(extra->>'city', ''), NULLIF(extra->>'carrier', ''),
  NULLIF(extra->>'driverName', ''), NULLIF(extra->>'vehicleNo', ''),
  NULLIF(extra->>'driverContact', ''), NULLIF(extra->>'discrepancyNotes', ''),
  dn.delivery_date,
  CASE lower(dn.status)
    WHEN 'draft' THEN 'draft' WHEN 'dispatched' THEN 'dispatched'
    WHEN 'delivered' THEN 'delivered' WHEN 'returned' THEN 'returned'
    ELSE 'draft'
  END,
  dn.created_by, dn.created_at, dn.updated_at
FROM delivery_notes dn
CROSS JOIN LATERAL (
  SELECT CASE WHEN dn.notes IS NOT NULL AND dn.notes != '' THEN dn.notes::jsonb ELSE '{}'::jsonb END AS extra
) parsed;

INSERT INTO delivery_document_lines (id, document_id, description, qty_ordered, qty_delivered, unit, condition, remarks, sort_order)
SELECT
  l.id, l.dn_id, l.description, l.qty_ordered, l.qty_delivered, l.unit,
  NULLIF(extra->>'condition', ''), NULLIF(extra->>'remarks', ''), l.sort_order
FROM delivery_note_lines l
CROSS JOIN LATERAL (
  SELECT CASE WHEN l.notes IS NOT NULL AND l.notes != '' THEN l.notes::jsonb ELSE '{}'::jsonb END AS extra
) parsed;

-- A receipt can now record which release/delivery order it's fulfilling —
-- soft real FK (delivery_documents isn't partitioned, so a real FK is safe
-- here, unlike shipment_cases references elsewhere in this codebase).
ALTER TABLE equipment_interchange_receipts ADD COLUMN IF NOT EXISTS release_document_id UUID REFERENCES delivery_documents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_eir_release_document ON equipment_interchange_receipts(release_document_id);

DROP TABLE IF EXISTS delivery_note_lines;
DROP TABLE IF EXISTS delivery_notes;
DROP TABLE IF EXISTS release_orders;
