-- AgencyHost M10 — tag which app a support ticket came from.
--
-- Nullable: every existing ticket, and every ticket filed through any
-- channel other than Onsite (the only source this milestone tags), stays
-- untagged exactly as today. Mirrors the precedent platform_support_tickets
-- .app already set (migration 140) for a conceptually similar "which app is
-- this about" column, just on the real customer-facing ticket table instead
-- of the internal operator-bug-report one.
ALTER TABLE support_tickets ADD COLUMN source_app VARCHAR(50);
CREATE INDEX idx_support_tickets_source_app ON support_tickets(tenant_id, source_app) WHERE source_app IS NOT NULL;
