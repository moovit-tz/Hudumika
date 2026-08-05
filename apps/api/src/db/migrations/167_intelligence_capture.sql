-- Migration 167: Phase 0 of the intelligence loop — capture.
--
-- The platform accumulates plenty of activity (112 landed-cost calculations,
-- 108 Trade Wizard searches, 65 shipments) and learns nothing from any of it,
-- because in every case the *outcome* is missing:
--
--   • a landed-cost estimate is never tied to the shipment it was for, so
--     "was this estimate right?" cannot be asked at all;
--   • an HS suggestion is offered, accepted or overridden, and the choice is
--     discarded — so the suggester still ranks by word frequency over 6,092
--     tariff lines and offers three codes tied at 29%;
--   • the Trade Wizard records the search but not which procedure was chosen,
--     nor whether it turned out to be the right one;
--   • the compliance check records that N requirements were flagged, not which
--     of them actually bit on the consignment.
--
-- Nothing here computes anything. It records the outcomes that later phases
-- need. Every table is append-only in spirit: these are observations, and a
-- corrected observation is a new row, not an edit.

-- ── 1 · Tie an estimate to its shipment ───────────────────────────────────
-- No foreign key: shipment_cases is partitioned, so its primary key is
-- (id, created_at) and a single-column reference is not constructible.
-- The id is stored and indexed; every read path already filters by
-- tenant_id, which is what actually keeps these rows honest.
ALTER TABLE landed_cost_records
  ADD COLUMN IF NOT EXISTS shipment_id UUID;

CREATE INDEX IF NOT EXISTS idx_lcr_shipment ON landed_cost_records(shipment_id) WHERE shipment_id IS NOT NULL;

-- ── 2 · What was suggested, and what a person actually declared ───────────
-- The corpus behind HS memory. `accepted_code` NULL means the user was shown
-- suggestions and took none of them — which is as informative as a hit, and
-- is why the row is written on abandonment too, not only on acceptance.
CREATE TABLE IF NOT EXISTS hs_classification_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- The goods text the suggestion was made from, as typed. Kept verbatim:
  -- normalising it here would destroy the very signal the matcher needs.
  description    TEXT NOT NULL,
  -- Codes offered, in rank order: [{code, match_pct, duty_rate}]
  suggested      JSONB,
  -- What the line ended up declared as. NULL = none of the suggestions taken.
  accepted_code  TEXT,
  /* How the accepted code was arrived at:
       'suggested'  — taken from the ranked list
       'ai'         — taken from the AI tie-break
       'manual'     — searched for and chosen by hand
       'none'       — suggestions shown, nothing taken                       */
  source         TEXT NOT NULL DEFAULT 'suggested',
  -- True when the accepted code was NOT the top suggestion: the correction
  -- signal. A high rate of these on a phrase means the ranker is wrong there.
  overrode_top   BOOLEAN NOT NULL DEFAULT false,
  record_id      UUID REFERENCES landed_cost_records(id) ON DELETE SET NULL,
  shipment_id    UUID,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hsce_tenant_code ON hs_classification_events(tenant_id, accepted_code);
CREATE INDEX IF NOT EXISTS idx_hsce_created ON hs_classification_events(created_at DESC);
-- Trigram index so memory lookup can match "hex head bolts M12" against
-- "Hex head bolts — M12x70" without an exact-string join.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_hsce_desc_trgm ON hs_classification_events USING gin (lower(description) gin_trgm_ops);

-- ── 3 · Actual costs, in the estimate's own vocabulary ────────────────────
-- Variance is only computable if actuals and estimates share a vocabulary.
-- `charge_head` mirrors the calculator's cards (DUTY_TAXES, TPA, ICD, TBS,
-- SHIPPING_LINE, CLEARANCE_AGENCY, FREIGHT, INSURANCE, TRANSPORT, OTHER), so
-- no mapping table is needed later. Free-text `category` stays as it is.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS charge_head TEXT,
  -- The estimate this actual is being compared against, when known.
  ADD COLUMN IF NOT EXISTS estimate_record_id UUID REFERENCES landed_cost_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_head ON expenses(tenant_id, charge_head);

-- ── 4 · Trade Wizard outcomes ─────────────────────────────────────────────
-- trade_wizard_searches records the question. This records the answer taken,
-- and whether it survived contact with a real consignment.
CREATE TABLE IF NOT EXISTS trade_wizard_outcomes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  search_id      UUID REFERENCES trade_wizard_searches(id) ON DELETE SET NULL,
  procedure_id   TEXT NOT NULL,
  procedure_name TEXT,
  goal           TEXT,
  -- The permits/steps the wizard said would be needed, so a later correction
  -- can be diffed against what it actually predicted.
  predicted      JSONB,
  /* 'selected'  — chosen from the results
     'completed' — the user reported it was the right procedure
     'wrong'     — the user reported it was not                              */
  outcome        TEXT NOT NULL DEFAULT 'selected',
  note           TEXT,
  shipment_id    UUID,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_two_tenant ON trade_wizard_outcomes(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_two_procedure ON trade_wizard_outcomes(procedure_id);

-- ── 5 · Compliance outcomes ───────────────────────────────────────────────
-- compliance_check_log records how many requirements were flagged. This
-- records which ones actually applied — the only way to tell a rule that
-- protects the tenant from one that just adds noise to every check.
CREATE TABLE IF NOT EXISTS compliance_outcomes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  check_id      UUID REFERENCES compliance_check_log(id) ON DELETE SET NULL,
  hs_code       TEXT,
  origin_country TEXT,
  -- The agency/requirement this row is about: 'PVOC', 'DI', 'TBS', 'GCLA', …
  requirement   TEXT NOT NULL,
  predicted     BOOLEAN NOT NULL,
  /* What actually happened, reported by the person who cleared it:
       'applied'      — the requirement really was enforced
       'not_applied'  — it was flagged but nothing was required
       'unexpected'   — it was NOT flagged but was enforced anyway           */
  actual        TEXT NOT NULL,
  shipment_id   UUID,
  note          TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_co_tenant_req ON compliance_outcomes(tenant_id, requirement);
CREATE INDEX IF NOT EXISTS idx_co_hs ON compliance_outcomes(hs_code);
