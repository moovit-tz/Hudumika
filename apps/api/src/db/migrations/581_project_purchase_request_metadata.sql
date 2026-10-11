-- Keep requisition rationale and delivery requirements alongside canonical estimate columns.
ALTER TABLE project_purchase_requests ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
