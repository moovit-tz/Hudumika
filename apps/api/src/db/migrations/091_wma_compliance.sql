-- Weights and Measures Act (Cap 340) HS-code crosswalk — global reference
-- table, no tenant_id/RLS, same convention as hs_codes/icd_directory/
-- clearing_agents_registry. Seeded from a derived (not official) mapping —
-- see seed-wma-compliance.ts for provenance and the "verify before use"
-- caveat that ships with every row via source_note.
CREATE TABLE IF NOT EXISTS wma_hs_codes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Digit-only HS bounds (no dots) for range/prefix matching. Equal for a
  -- single specific code; hs_code_from < hs_code_to for a heading range
  -- (e.g. "0201-0210" from the source doc's Broad-confidence chapter rows).
  hs_code_from        VARCHAR(12) NOT NULL,
  hs_code_to          VARCHAR(12) NOT NULL,
  hs_code_display     VARCHAR(24) NOT NULL,
  hs_description      TEXT,
  sheet               CHAR(1) NOT NULL CHECK (sheet IN ('A', 'B')),
  wma_class           VARCHAR(40) NOT NULL,
  act_description      TEXT,
  schedule_ref        TEXT,
  obligation_trigger   TEXT NOT NULL,
  confidence          VARCHAR(10) NOT NULL CHECK (confidence IN ('direct', 'derived', 'broad')),
  notes               TEXT,
  rigid_container_qty TEXT,
  other_container_qty TEXT,
  source_note         TEXT,
  scraped_at          TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wma_hs_codes_range ON wma_hs_codes(hs_code_from, hs_code_to);
CREATE INDEX IF NOT EXISTS idx_wma_hs_codes_sheet ON wma_hs_codes(sheet);
