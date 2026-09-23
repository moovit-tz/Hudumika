-- 499_document_service.sql
-- Backing columns for the new centralized cross-app document service
-- (document.service.ts) — every app currently calls Cloud differently (some
-- through CloudSync, some straight at /v1/files/upload, eSign writes
-- directly); this is the first table-level piece of consolidating that into
-- one saveDocument() entrypoint, starting with Finance (see invoices.routes.ts).

-- One filed document should never be re-created by a retried/duplicate call
-- (e.g. a webhook redelivery, or an invoice PATCH firing the same "now
-- issued" transition twice) — a per-tenant idempotency key, checked before
-- any new row is inserted. Null for every file that isn't produced through
-- the new service (i.e. everything filed before this migration, and any
-- manually-uploaded file going forward).
ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(300);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cloud_files_idempotency ON cloud_files(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- What retention policy this file falls under — informational for now (no
-- retention-enforcement job reads it yet; that's item 10 of the storage
-- program, not this pass). 'financial_record'/'compliance_record' are the
-- two the Finance integration writes; general Drive uploads stay null.
ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS retention_class VARCHAR(40);
