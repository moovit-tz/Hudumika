-- Migration 233: Real principals on cloud_file_shares.
--
-- cloud_file_shares (042_cloud_files.sql) has always been cosmetic — a
-- free-text person_name/role pair, never read by any route to gate access,
-- only displayed. This adds a real, checkable principal alongside it so a
-- share can actually grant visibility, not just describe an intention.
--
-- Plain nullable columns, no FK — same convention as cloud_files.entity_type/
-- entity_id itself (229_cloud_files_entity_link.sql: "a polymorphic/generic
-- tag, not enforced referential integrity"). A share created before this
-- migration, or one where staff typed a free-text name with no real
-- principal picked, simply has principal_type/id = null forever and stays
-- exactly what it always was: a display-only label. Nothing that already
-- works changes.
--
-- Only 'customer' and 'organization' are meant to gate anything — those are
-- the two login types whose Cloud visibility isn't already "everything at
-- the tenant" the way staff's is. A share with principal_type left unset
-- (staff-to-staff, or legacy free text) stays informational only.
ALTER TABLE cloud_file_shares ADD COLUMN IF NOT EXISTS principal_type VARCHAR(20);
ALTER TABLE cloud_file_shares ADD COLUMN IF NOT EXISTS principal_id UUID;
CREATE INDEX IF NOT EXISTS idx_cloud_file_shares_principal ON cloud_file_shares(principal_type, principal_id);
