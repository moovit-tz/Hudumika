-- Migration 068: Reference-data tables for ICD/dry-port operators, TASAC
-- clearing agents, and EAC excise duty schedules — sourced from Moovit
-- Logistics Ltd's public customs-suite (moovit.co.tz), which republishes
-- TASAC/EAC gazette data (GN 83/2026 agent registry, EAC CET 2022 tariff,
-- EAC excise schedules). These are tenant-agnostic reference/lookup tables,
-- same convention as hs_codes (migration 036) — no tenant_id, no RLS.
--
-- Populated by apps/api/src/scripts/import-moovit-reference-data.ts, which
-- can be re-run to refresh the data; scraped_at lets a re-run be diffed
-- against the previous snapshot.

CREATE TABLE IF NOT EXISTS icd_directory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_type VARCHAR(30) NOT NULL,   -- e.g. ICD-SILOS, ICDV — dry-port licence category
  name          TEXT NOT NULL,
  email         TEXT,
  tel           TEXT,
  address       TEXT,
  region        TEXT,
  license_no    VARCHAR(60),
  license_start DATE,
  license_exp   DATE,
  source_url    TEXT,
  scraped_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_icd_directory_region ON icd_directory(region);

CREATE TABLE IF NOT EXISTS clearing_agents_registry (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT,
  license_no  VARCHAR(60),
  region      TEXT,
  address     TEXT,
  tel         TEXT,
  source_url  TEXT,
  scraped_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clearing_agents_name ON clearing_agents_registry(name);

-- Excise rates are published per product category, with one free-text rate
-- column per EAC member state (source values mix currency/unit forms, e.g.
-- "TShs 400/L", "25%", "—" for not-applicable — stored as text rather than
-- force-parsed into a single numeric unit, to avoid misrepresenting them).
CREATE TABLE IF NOT EXISTS eac_excise_schedules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category         TEXT NOT NULL,
  item_description TEXT NOT NULL,
  tz_rate          TEXT,
  ke_rate          TEXT,
  ug_rate          TEXT,
  rw_rate          TEXT,
  bi_rate          TEXT,
  source_url       TEXT,
  scraped_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eac_excise_category ON eac_excise_schedules(category);
