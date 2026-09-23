-- 498_cloud_drive_isolation.sql
--
-- Cloud's "Personal Drive" was personal in name only: GET /v1/drives
-- returned every drive in the tenant to every staff user with no owner_id
-- filter (drives.routes.ts), and migration 045 only ever seeded ONE
-- tenant-wide drive per tenant (type='personal', owner_id NULL) — the
-- per-user auto-create branch in GET / only fired when the tenant had zero
-- drives at all, which was never true for an existing tenant. So there has
-- never actually been more than one "personal" drive per tenant, shared by
-- everyone who opened Cloud.
--
-- In practice that one tenant-wide drive is exactly where every automatic
-- business folder already lives (Customers, Shipments, Employees, SEAL,
-- Meetings — see cloud-sync.service.ts) and where a CUSTOMER-role upload
-- lands (ensureDefaultDrive in files.routes.ts). It was never really
-- "personal" — it was already functioning as the tenant's shared business
-- record store. This migration names that honestly instead of pretending
-- otherwise, and gives every real staff user their own actually-private
-- drive going forward.

-- 1. A third drive type: system-managed, tenant-wide, staff-visible business
--    records — distinct from a private personal drive and a member-managed
--    shared drive.
ALTER TABLE cloud_drives DROP CONSTRAINT IF EXISTS cloud_drives_type_check;
ALTER TABLE cloud_drives ADD CONSTRAINT cloud_drives_type_check CHECK (type IN ('personal','shared','business'));

-- 2. Retype the pre-existing tenant-wide drive(s) — the only ones with no
--    owner — into 'business'. There should be exactly one per tenant from
--    migration 045's seed, but this handles any that drifted safely.
UPDATE cloud_drives
SET type = 'business',
    name = CASE WHEN name IN ('My Drive', 'Drive') THEN 'Business Records' ELSE name END,
    updated_at = now()
WHERE owner_id IS NULL AND type = 'personal';

-- 3. One real personal drive per existing staff user (never for CUSTOMER
--    logins, which have no drive of their own — see files.routes.ts).
--    ON CONFLICT is covered by the partial unique index added below; this
--    insert runs before that index exists so a plain NOT EXISTS guard does
--    the same job for this one-time backfill.
INSERT INTO cloud_drives (tenant_id, name, type, owner_id, owner_name)
SELECT u.tenant_id, 'My Drive', 'personal', u.id, COALESCE(u.name, 'You')
FROM users u
WHERE u.role <> 'CUSTOMER'
  AND NOT EXISTS (
    SELECT 1 FROM cloud_drives d WHERE d.tenant_id = u.tenant_id AND d.owner_id = u.id AND d.type = 'personal'
  );

-- 4. Enforce it going forward — at most one personal drive per (tenant, owner).
CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_drives_one_personal_per_owner
  ON cloud_drives(tenant_id, owner_id) WHERE type = 'personal' AND owner_id IS NOT NULL;

-- 5. Real principals on drive membership — same shape and same reasoning as
--    migration 233's cloud_file_shares.principal_type/principal_id: plain
--    nullable columns, no FK (this table already links polymorphically
--    elsewhere in this schema), so a pre-existing free-text person_name row
--    with no resolvable principal just stays informational-only forever.
--    Only 'user' is actually enforced by the access-control code this
--    migration accompanies; 'group'/'customer'/'organization' are reserved
--    for later, not yet resolved by any route.
ALTER TABLE cloud_drive_members ADD COLUMN IF NOT EXISTS principal_type VARCHAR(20);
ALTER TABLE cloud_drive_members ADD COLUMN IF NOT EXISTS principal_id UUID;
CREATE INDEX IF NOT EXISTS idx_cloud_drive_members_principal ON cloud_drive_members(principal_type, principal_id);

-- 6. Best-effort backfill for existing shared-drive members: a member row
--    created before this migration only ever stored the free-text name
--    the creator was logged in as at the time (POST /:id/members). Where
--    that name matches exactly one real staff user in the same tenant,
--    resolve it for real; a duplicate/ambiguous/no-match name is left null
--    and stays display-only, same graceful-degradation as migration 233.
UPDATE cloud_drive_members m
SET principal_type = 'user', principal_id = matched.id
FROM (
  SELECT d.id AS drive_id, u.id, u.name,
         count(*) OVER (PARTITION BY d.id, u.name) AS name_count
  FROM cloud_drive_members cm
  JOIN cloud_drives d ON d.id = cm.drive_id
  JOIN users u ON u.tenant_id = d.tenant_id AND u.name = cm.person_name
) matched
WHERE m.drive_id = matched.drive_id
  AND m.person_name = matched.name
  AND matched.name_count = 1
  AND m.principal_id IS NULL;
