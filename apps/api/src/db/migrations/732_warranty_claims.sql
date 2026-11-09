-- Migration 732: a reusable, cross-industry warranty module (S07 of the
-- industry-readiness backlog). Confirmed industry-siloed before this pass
-- — gereji_warranty_claims (migration 671) exists only for the Gereji
-- auto-garage vertical, and is itself a SUPPLIER claim (the business
-- claiming against its own parts supplier), not a customer-facing
-- warranty on something sold. This is the other, more broadly needed
-- direction: a customer bought a product/service, it carries a warranty
-- period, and they can file a claim to have it repaired, replaced or
-- refunded within that window — usable by any industry, not reinvented
-- per vertical.

CREATE TABLE IF NOT EXISTS warranties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id),
  product_id      UUID,
  -- Polymorphic by design (a POS sale, a sales invoice, or no source at
  -- all for a manually-issued warranty) — deliberately not an FK, the
  -- same reasoning domain_events.service.ts's own entity_id already
  -- accepts across unrelated source tables.
  source_type     TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('pos_sale', 'invoice', 'manual')),
  source_id       UUID,
  serial_number   TEXT,
  warranty_start  DATE NOT NULL,
  warranty_end    DATE NOT NULL CHECK (warranty_end >= warranty_start),
  terms           TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'voided')),
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS warranties_customer ON warranties (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS warranties_source ON warranties (tenant_id, source_type, source_id);

ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranties FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON warranties;
CREATE POLICY tenant_isolation_policy ON warranties
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- One claim per incident against a warranty — a warranty can carry
-- several claims over its life (a product that fails twice). Resolution
-- reuses existing, proven primitives rather than inventing new
-- accounting: 'repair'/'replace' post through InventoryService's own
-- 'issue' movement (real COGS, no invented treatment — see
-- inventory.service.ts), 'refund' posts its own small reversing GL entry
-- (the same Dr-revenue/Cr-cash shape every other refund in this codebase
-- already uses).
CREATE TABLE IF NOT EXISTS warranty_claims (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  warranty_id      UUID NOT NULL REFERENCES warranties(id),
  claim_number     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'resolved')),
  resolution_type  TEXT CHECK (resolution_type IN ('repair', 'replace', 'refund')),
  description      TEXT NOT NULL,
  review_note      TEXT,
  resolution_note  TEXT,
  refund_amount    NUMERIC(14,2),
  refund_method    TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id),
  movement_id      BIGINT REFERENCES inventory_movements(id),
  created_by       UUID,
  reviewed_by      UUID,
  reviewed_at      TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, claim_number)
);
CREATE INDEX IF NOT EXISTS warranty_claims_warranty ON warranty_claims (warranty_id);

ALTER TABLE warranty_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranty_claims FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON warranty_claims;
CREATE POLICY tenant_isolation_policy ON warranty_claims
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
