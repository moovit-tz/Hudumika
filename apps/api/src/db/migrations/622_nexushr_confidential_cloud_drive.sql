ALTER TABLE cloud_drives ADD COLUMN managed_purpose TEXT;
ALTER TABLE cloud_drives ADD CONSTRAINT cloud_drives_managed_purpose_valid
  CHECK (managed_purpose IS NULL OR managed_purpose = 'nexushr');
CREATE UNIQUE INDEX cloud_drives_tenant_managed_purpose_unique
  ON cloud_drives(tenant_id,managed_purpose) WHERE managed_purpose IS NOT NULL;

INSERT INTO cloud_drives(tenant_id,name,type,owner_name,managed_purpose)
SELECT DISTINCT f.tenant_id,'Personnel Records','shared','NexusHR','nexushr'
FROM cloud_files f JOIN cloud_drives d ON d.id=f.drive_id AND d.tenant_id=f.tenant_id
WHERE f.entity_type='employee' OR (d.type='business' AND f.type='folder' AND f.name='Employees' AND f.parent_id IS NULL)
ON CONFLICT DO NOTHING;

-- Preserve file IDs, hierarchy and blobs; change only the confidentiality boundary.
WITH RECURSIVE private_files AS (
  SELECT f.id,f.tenant_id FROM cloud_files f
  JOIN cloud_drives d ON d.id=f.drive_id AND d.tenant_id=f.tenant_id
  WHERE f.entity_type='employee' OR (d.type='business' AND f.type='folder' AND f.name='Employees' AND f.parent_id IS NULL)
  UNION
  SELECT f.id,f.tenant_id FROM cloud_files f JOIN private_files p
    ON f.parent_id=p.id AND f.tenant_id=p.tenant_id
)
UPDATE cloud_files f SET drive_id=d.id,
  parent_id=CASE WHEN f.parent_id IN (SELECT id FROM private_files WHERE tenant_id=f.tenant_id) THEN f.parent_id ELSE NULL END,
  share_token=NULL,updated_at=now()
FROM private_files p,cloud_drives d
WHERE f.id=p.id AND f.tenant_id=p.tenant_id AND d.tenant_id=f.tenant_id AND d.managed_purpose='nexushr';

-- Historical public links and file grants cannot override personnel confidentiality.
DELETE FROM cloud_file_shares s USING cloud_files f,cloud_drives d
WHERE s.file_id=f.id AND s.tenant_id=f.tenant_id AND d.id=f.drive_id
  AND d.tenant_id=f.tenant_id AND d.managed_purpose='nexushr';
UPDATE cloud_file_invites i SET revoked_at=now()
FROM cloud_files f,cloud_drives d
WHERE i.file_id=f.id AND i.tenant_id=f.tenant_id AND d.id=f.drive_id
  AND d.tenant_id=f.tenant_id AND d.managed_purpose='nexushr' AND i.revoked_at IS NULL;
