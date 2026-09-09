-- 422_sign_drive_writeback.sql
--
-- Phase S6 (Drive) of METRICS_AND_SIGN_PLAN.md — the "whole integration"
-- described there: when an envelope's source document came from Cloud
-- Drive (file_id already set at creation), the completed, stamped PDF is
-- written back into Drive as a real cloud_files row (same file/bytes
-- model every other upload uses — see files.routes.ts's own POST /upload)
-- rather than staying reachable only through Sign's own MinIO bucket.
-- Nullable and best-effort: an envelope created from a raw upload (no
-- file_id) has nothing to link back to, and a write-back failure must
-- never undo a completion the signer has already seen confirmed.
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS drive_file_id UUID REFERENCES cloud_files(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sign_envelopes_drive_file_idx ON sign_envelopes(drive_file_id);
