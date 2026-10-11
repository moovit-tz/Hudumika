-- Preserve RFQ scope, issuer and recorded evaluation fields beside canonical supplier links.
ALTER TABLE project_rfqs ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE project_rfq_suppliers ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
