-- Migration 229: Link Drive files to a business entity (customer, and any
-- future entity type) — mirrors the entity_type/entity_id pattern SEAL's own
-- document vault already uses (110_seal_documents_exams_stockaccount_ops.sql),
-- applied here to the platform's one real file store instead of growing yet
-- another parallel document table. Both columns are nullable: every existing
-- Drive file is untagged and keeps browsing/behaving exactly as before.
ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS entity_type VARCHAR(30);
ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS entity_id UUID;
CREATE INDEX IF NOT EXISTS idx_cloud_files_entity ON cloud_files(tenant_id, entity_type, entity_id);

-- customer_documents (136_customer_documents.sql) was a separate, dedicated
-- upload silo backing the Customers profile's Documents tab. It never held
-- real data (upload 404'd until 136 shipped; the tab now links into Drive via
-- the columns above instead), so it's dropped rather than left unreachable.
DROP TABLE IF EXISTS customer_documents;
