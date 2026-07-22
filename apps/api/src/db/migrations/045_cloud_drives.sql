-- Migration 045: Multiple independent Drives ("workspaces") — every tenant already
-- had one implicit file pool; this splits that into named, switchable drives,
-- including shared drives with their own member list.

CREATE TABLE IF NOT EXISTS cloud_drives (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       VARCHAR(200) NOT NULL,
  type       VARCHAR(20) NOT NULL DEFAULT 'personal' CHECK (type IN ('personal','shared')),
  owner_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  owner_name VARCHAR(200) NOT NULL DEFAULT 'You',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cloud_drives_tenant ON cloud_drives(tenant_id);

CREATE TABLE IF NOT EXISTS cloud_drive_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id    UUID NOT NULL REFERENCES cloud_drives(id) ON DELETE CASCADE,
  person_name VARCHAR(200) NOT NULL,
  role        VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('manager','content_manager','contributor','commenter','viewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(drive_id, person_name)
);
CREATE INDEX IF NOT EXISTS idx_cloud_drive_members_drive ON cloud_drive_members(drive_id);

-- Scope every file/folder to a drive, backfilling one default "My Drive" per tenant
-- so existing content has somewhere to land.
ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS drive_id UUID REFERENCES cloud_drives(id) ON DELETE CASCADE;

DO $$
DECLARE
  t RECORD;
  new_drive_id UUID;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    INSERT INTO cloud_drives (tenant_id, name, type, owner_name)
    VALUES (t.id, 'My Drive', 'personal', 'You')
    RETURNING id INTO new_drive_id;

    UPDATE cloud_files SET drive_id = new_drive_id
    WHERE tenant_id = t.id AND drive_id IS NULL;
  END LOOP;
END $$;

ALTER TABLE cloud_files ALTER COLUMN drive_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cloud_files_drive ON cloud_files(drive_id);
