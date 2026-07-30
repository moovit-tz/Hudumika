-- Migration 144: Port/agency tariff reference table — TPA Sea Ports Tariff
-- Book (Jan 2026) and the TASAC clearing & forwarding agency fee guide
-- (GN. 83-2026). Same convention as icd_directory/clearing_agents_registry/
-- eac_excise_schedules (migration 068) and hs_codes (migration 036):
-- tenant-agnostic, no tenant_id, no RLS — these are published government/
-- authority rates, identical for every tenant on the platform. Only
-- SUPER_ADMIN can write to it (see reference.routes.ts); every tenant reads
-- the same rows.
--
-- Each container-size / cargo-type variant of a charge is its own row
-- (matching how the TASAC CFA fees were already modelled as separate
-- Products & Services catalog rows per size/mode) rather than multiple rate
-- columns on one row, so the landed-cost picker and Products & Services
-- "add from tariff" flow can treat every row as a single selectable line
-- item with one price.
--
-- rate_amount is nullable: a handful of rows (PID, Green Initiative levy,
-- and TRA's July-2026 charges) are known to exist but no rate was supplied
-- when this table was seeded — they're inserted as is_placeholder rows with
-- a NULL rate rather than a guessed number, specifically so nothing here
-- repeats the earlier bug where LandedCostPage.tsx rendered fabricated
-- port/agency fees as if they were real. Edit them in the Reference page
-- once the real rate is known.

CREATE TABLE IF NOT EXISTS port_tariff_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authority       VARCHAR(20) NOT NULL,        -- 'TPA' | 'TASAC_CFA' | 'TRA'
  clause_ref      VARCHAR(30),                 -- e.g. '20.1.2(a)(ii)'
  category        TEXT NOT NULL,               -- e.g. 'Storage & Removal — Containerized Cargo'
  subcategory     TEXT,                        -- e.g. 'Domestic FCL Containers (Imports)'
  item_name       TEXT NOT NULL,
  unit            VARCHAR(80),                 -- 'per container per day', 'per BL', 'per harbour tonne', ...
  cargo_type      VARCHAR(40),                 -- 'containerized' | 'conventional' | 'transshipment' | 'livestock' | ...
  container_size  VARCHAR(20),                 -- '20ft' | '40ft' | NULL
  rate_amount     NUMERIC(12,2),                -- NULL when not yet known (see is_placeholder)
  rate_currency   VARCHAR(10) NOT NULL DEFAULT 'USD',
  rate_type       VARCHAR(20) NOT NULL DEFAULT 'fixed', -- 'fixed' | 'percent' | 'formula'
  min_charge      NUMERIC(12,2),
  free_period     TEXT,                        -- e.g. 'First 5 days free'
  source_document TEXT NOT NULL,               -- 'TPA Tariff Book — Sea Ports, January 2026' | 'TASAC CFA Tariff Guide (GN. 83-2026)'
  source_page     VARCHAR(20),
  notes           TEXT,
  is_placeholder  BOOLEAN NOT NULL DEFAULT FALSE,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  updated_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_port_tariff_authority ON port_tariff_items(authority);
CREATE INDEX IF NOT EXISTS idx_port_tariff_category ON port_tariff_items(category);
CREATE INDEX IF NOT EXISTS idx_port_tariff_search ON port_tariff_items USING gin(to_tsvector('english', item_name || ' ' || coalesce(subcategory,'') || ' ' || coalesce(notes,'')));
