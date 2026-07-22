-- Migration 088: global carrier reference directory (ocean, air, road, rail).
-- Same convention as icd_directory / clearing_agents_registry (migration 068):
-- tenant-agnostic, no tenant_id, no RLS — one shared, curated list every
-- tenant can search and pick real carriers from, rather than hand-typing
-- SCAC/IATA codes. Populated by apps/api/src/scripts/seed-carrier-directory.ts
-- from public SCAC/IATA registries and East African haulage directories.
CREATE TABLE IF NOT EXISTS carrier_directory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  mode          TEXT NOT NULL,   -- 'OCEAN' | 'AIR' | 'ROAD' | 'RAIL'
  scac_or_iata  TEXT,
  country       TEXT,
  region        TEXT,            -- e.g. 'Global', 'East Africa', 'Middle East', 'Asia'
  website       TEXT,
  source_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, mode)
);
CREATE INDEX IF NOT EXISTS idx_carrier_directory_mode ON carrier_directory(mode);
CREATE INDEX IF NOT EXISTS idx_carrier_directory_name ON carrier_directory(name);
