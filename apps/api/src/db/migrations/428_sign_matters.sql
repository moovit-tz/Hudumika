-- Migration 428: Phase S7 — consultant/matter model, the thin layer.
--
-- Deliberately NOT a new entity/relationship table (no sign_matters table,
-- no FK, no status lifecycle) — "most tenants aren't law firms" is the
-- plan's own caution against building a second case-management system for
-- a feature most tenants will never touch. A matter here is just a
-- reference string a preparer types onto an envelope ("CASE-2026-014",
-- "ABC Corp — M&A Due Diligence Q3"), the same free-text-tag shape as
-- ClearOS's own reference-number fields elsewhere in this codebase, not a
-- structured object with its own lifecycle.
--
-- Not to be confused with comply_legal_engagements (096_comply_legal_
-- marketplace.sql) — that table is a specific ComplyOS concept (hiring an
-- external firm from Hudumika's own marketplace for one compliance
-- filing), already linked to a Sign envelope indirectly via
-- comply_applications.sign_envelope_id (423). This column is general-
-- purpose: any tenant's own internal case/reference tag on any envelope,
-- regardless of whether ComplyOS or a legal marketplace engagement is
-- involved at all.
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS matter_reference TEXT;
CREATE INDEX IF NOT EXISTS sign_envelopes_matter_reference_idx
  ON sign_envelopes(tenant_id, matter_reference) WHERE matter_reference IS NOT NULL;
