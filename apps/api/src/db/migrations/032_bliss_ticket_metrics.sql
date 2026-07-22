-- ============================================================
-- 032 — Bliss Ticket Metrics: NPS, CSAT, first reply, solve times
-- ============================================================

ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS nps_score INTEGER;
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS csat_score INTEGER;
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS feedback_text TEXT;
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS first_reply_at TIMESTAMPTZ;
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS first_reply_time_seconds INTEGER;
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS resolution_time_seconds INTEGER;
