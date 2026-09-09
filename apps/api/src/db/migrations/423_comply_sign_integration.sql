-- 423_comply_sign_integration.sql
--
-- Phase S6 (ComplyOS) of METRICS_AND_SIGN_PLAN.md — same real, proven
-- shape hr_offers.sign_envelope_id (403) and contracts.sign_envelope_id
-- already use: one structured link column, no parallel document/signature
-- system. A compliance application's declaration cover sheet is signed
-- through the platform's one real Sign engine; this column is how the
-- application record finds its own envelope back (see contracts.routes.ts's
-- /:id/send-for-signature — /:id/request-signature here mirrors it).
ALTER TABLE comply_applications ADD COLUMN IF NOT EXISTS sign_envelope_id UUID REFERENCES sign_envelopes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS comply_applications_sign_envelope_idx ON comply_applications(sign_envelope_id);
