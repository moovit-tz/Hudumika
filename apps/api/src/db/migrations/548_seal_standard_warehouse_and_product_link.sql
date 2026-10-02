-- 548_seal_standard_warehouse_and_product_link.sql
--
-- Combines SEAL with the platform's inventory control layer.
--
-- Two additive changes:
--
-- 1. Add `standard_warehouse` as a facility type.  Standard warehouses use
--    the same dual-ledger core (seal_lots + seal_movements) but without the
--    customs overlay (guarantees, bond headroom, CustomsStatus progression,
--    examinations).  The UI hides those sections when
--    compartment.warehouse_type = 'standard_warehouse'.
--    The lot's customs_status defaults to 'DOMESTIC_FREE_CIRCULATION' for
--    standard facilities — a semantically correct existing value that means
--    "not under bond" — so the NOT NULL constraint and the state machine are
--    both unaffected.
--
-- 2. Add a nullable `product_id` FK on seal_lots → products(id).
--    Bonded / ICD lots continue to use the free-text `description` field.
--    Standard-warehouse lots should reference a products catalog SKU, which
--    enables POS sale deductions, FinOps invoice stock deductions, and BOM
--    component consumption to resolve the exact lot via product_id rather
--    than a text match.
--    Nullable so all existing bonded lots remain valid without backfill.

-- ── 1. Extend the warehouse_type CHECK ────────────────────────────────────
ALTER TABLE seal_compartments DROP CONSTRAINT seal_compartments_warehouse_type_check;
ALTER TABLE seal_compartments ADD CONSTRAINT seal_compartments_warehouse_type_check
  CHECK (warehouse_type IN (
    'public_bonded','private_bonded','cfs','icd','virtual_icd',
    'free_zone','duty_free_retail','excise',
    'sorting_centre','fulfillment_centre',
    'standard_warehouse'
  ));

-- ── 2. product_id FK on seal_lots ─────────────────────────────────────────
ALTER TABLE seal_lots
  ADD COLUMN IF NOT EXISTS product_id VARCHAR(64) REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_seal_lots_product ON seal_lots(tenant_id, product_id)
  WHERE product_id IS NOT NULL;
