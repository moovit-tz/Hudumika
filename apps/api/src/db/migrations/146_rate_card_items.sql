-- Tenant-owned "Rate Card" for the ClearOS Landed Cost Calculator — each
-- clearing agent's own per-consignment ICD and C&F/agency charges, split
-- into 5 cards (20ft, 40ft, sea (LCL/general), air, road). Distinct from
-- port_tariff_items (migration 144): that table is global TPA/TASAC
-- government tariff data; this one is each tenant's own commercial rate
-- card, entered by the tenant and used to preload the calculator's ICD/C&F
-- default values instead of a hardcoded guess.
--
-- Tenant-scoped per CLAUDE.md: RLS is not relied on alone — every query in
-- rate-card.service.ts explicitly filters by tenant_id.
--
-- "code" identifies the 8 standard template line items (ICD_HANDLING,
-- ICD_CORRIDOR, ICD_VERIFICATION, ICD_MOVEMENT, ICD_TRANSFER,
-- CF_VERIFICATION, CF_DOCUMENTATION, CF_AGENCY_FEE) that the calculator
-- reads by name; NULL "code" is a freeform extra line the tenant added that
-- isn't wired into the calculator's fixed slots, shown for reference only.

CREATE TABLE IF NOT EXISTS clearos_rate_card_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  card            TEXT NOT NULL CHECK (card IN ('20ft','40ft','sea','air','road')),
  category        TEXT NOT NULL CHECK (category IN ('ICD','AGENCY','OTHER')),
  code            TEXT,
  charge_name     TEXT NOT NULL,
  unit            VARCHAR(80),
  rate_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  rate_currency   VARCHAR(8) NOT NULL DEFAULT 'USD',
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_clearos_rate_card_items_tenant ON clearos_rate_card_items (tenant_id, card);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clearos_rate_card_items_tenant_code ON clearos_rate_card_items (tenant_id, card, code) WHERE code IS NOT NULL;
