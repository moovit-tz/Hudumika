-- Adds an optional ICD-operator link to clearos_rate_card_items, so a
-- tenant can maintain a separate rate per named ICD (PMM Estates, African
-- Inland Container Depot, Hesu Investment, Zambia Cargo and Logistics, ...)
-- instead of one flat number per charge per card — real ICD operators
-- charge genuinely different rates for the same service (see
-- rate-card.service.ts). Links to the existing global icd_directory
-- reference table (migration 068) used by Tools -> Reference -> ICD.
--
-- NULL icd_operator_id stays the "generic" default rate for a card —
-- existing tenants who haven't broken things out by ICD are unaffected.
-- Postgres treats every NULL as distinct for uniqueness purposes, so the
-- generic (NULL) and per-operator cases need two separate partial unique
-- indexes rather than one index across all four columns.

ALTER TABLE clearos_rate_card_items ADD COLUMN IF NOT EXISTS icd_operator_id UUID REFERENCES icd_directory(id);

DROP INDEX IF EXISTS idx_clearos_rate_card_items_tenant_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clearos_rc_items_tenant_code_generic
  ON clearos_rate_card_items (tenant_id, card, code)
  WHERE code IS NOT NULL AND icd_operator_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clearos_rc_items_tenant_code_operator
  ON clearos_rate_card_items (tenant_id, card, code, icd_operator_id)
  WHERE code IS NOT NULL AND icd_operator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clearos_rc_items_icd_operator
  ON clearos_rate_card_items (icd_operator_id) WHERE icd_operator_id IS NOT NULL;
