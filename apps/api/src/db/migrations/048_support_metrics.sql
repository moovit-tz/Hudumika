-- 048_support_metrics.sql
-- Real metrics tracking for support_tickets (NPS, CSAT, first-reply/resolution timing, SLA),
-- mirroring what 032_bliss_ticket_metrics.sql added to shipment_cases — support_tickets is the
-- table the multichannel ticketing UI (Support.tsx) actually operates on.

ALTER TABLE support_tickets ADD COLUMN nps_score INTEGER;
ALTER TABLE support_tickets ADD COLUMN csat_score INTEGER;
ALTER TABLE support_tickets ADD COLUMN feedback_text TEXT;
ALTER TABLE support_tickets ADD COLUMN first_reply_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE support_tickets ADD COLUMN first_reply_time_seconds INTEGER;
ALTER TABLE support_tickets ADD COLUMN resolved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE support_tickets ADD COLUMN resolution_time_seconds INTEGER;
ALTER TABLE support_tickets ADD COLUMN sla_deadline TIMESTAMP WITH TIME ZONE;
