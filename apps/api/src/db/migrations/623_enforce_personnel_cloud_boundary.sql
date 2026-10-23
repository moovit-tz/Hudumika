-- App-level checks have alternate consumers; the storage classification must survive all writers.
CREATE FUNCTION enforce_personnel_cloud_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE destination_purpose TEXT; previous_purpose TEXT; parent_purpose TEXT;
BEGIN
  SELECT managed_purpose INTO destination_purpose FROM cloud_drives
    WHERE id=NEW.drive_id AND tenant_id=NEW.tenant_id;
  IF NEW.entity_type='employee' AND destination_purpose IS DISTINCT FROM 'nexushr' THEN
    RAISE EXCEPTION 'Personnel files must be stored in the restricted Personnel Records drive' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    SELECT managed_purpose INTO previous_purpose FROM cloud_drives
      WHERE id=OLD.drive_id AND tenant_id=OLD.tenant_id;
    IF previous_purpose='nexushr' AND destination_purpose IS DISTINCT FROM 'nexushr' THEN
      RAISE EXCEPTION 'Personnel files cannot be moved into an unrestricted drive' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT d.managed_purpose INTO parent_purpose FROM cloud_files p JOIN cloud_drives d
      ON d.id=p.drive_id AND d.tenant_id=p.tenant_id
      WHERE p.id=NEW.parent_id AND p.tenant_id=NEW.tenant_id;
    IF parent_purpose='nexushr' AND destination_purpose IS DISTINCT FROM 'nexushr' THEN
      RAISE EXCEPTION 'Personnel folder contents must remain in the restricted drive' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER personnel_cloud_boundary BEFORE INSERT OR UPDATE OF drive_id,entity_type,parent_id,tenant_id
  ON cloud_files FOR EACH ROW EXECUTE FUNCTION enforce_personnel_cloud_boundary();
