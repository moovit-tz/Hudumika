-- Platform foundation Phase 2: vehicle_vendors joins the canonical party model,
-- same pattern as suppliers (506) and customers (505) — every vendor is an
-- ORGANIZATION party whose id equals the vendor's own id, kept in sync by
-- triggers so every writer (routes, imports, seeds) is covered with no
-- vehicle_vendors API or id changes. vehicle_vendors has no tax_id/status
-- string column (just a boolean `active`), so the trigger maps that instead.

ALTER TABLE vehicle_vendors ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES parties(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_vehicle_vendors_party ON vehicle_vendors(tenant_id, party_id) WHERE party_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_vehicle_vendor_party() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.party_id IS NULL THEN
      INSERT INTO parties (id, tenant_id, party_type, display_name, status, visibility, source_system)
      VALUES (NEW.id, NEW.tenant_id, 'ORGANIZATION', NEW.name, CASE WHEN NEW.active THEN 'ACTIVE' ELSE 'INACTIVE' END, 'TENANT', 'VEHICLE_VENDORS')
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO party_organizations (party_id, tenant_id, legal_name)
      VALUES (NEW.id, NEW.tenant_id, NEW.name)
      ON CONFLICT (party_id) DO NOTHING;
      IF NEW.email IS NOT NULL AND trim(NEW.email) <> '' THEN
        INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
        VALUES (NEW.tenant_id, NEW.id, 'EMAIL', NEW.email, lower(trim(NEW.email)), 'work', 'ORGANIZATION', true) ON CONFLICT DO NOTHING;
      END IF;
      IF NEW.phone IS NOT NULL AND regexp_replace(NEW.phone, '[^0-9+]', '', 'g') <> '' THEN
        INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
        VALUES (NEW.tenant_id, NEW.id, 'PHONE', NEW.phone, regexp_replace(NEW.phone, '[^0-9+]', '', 'g'), 'work', 'ORGANIZATION', true) ON CONFLICT DO NOTHING;
      END IF;
      NEW.party_id := NEW.id;
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: mirror identity fields onto the party (never resurrect a MERGED tombstone).
  IF NEW.party_id IS NOT NULL THEN
    UPDATE parties SET display_name = NEW.name,
           status = CASE WHEN status = 'MERGED' THEN status WHEN NEW.active THEN 'ACTIVE' ELSE 'INACTIVE' END,
           updated_at = now()
    WHERE id = NEW.party_id AND tenant_id = NEW.tenant_id
      AND (display_name IS DISTINCT FROM NEW.name
           OR (status <> 'MERGED' AND status IS DISTINCT FROM CASE WHEN NEW.active THEN 'ACTIVE' ELSE 'INACTIVE' END));
    UPDATE party_organizations SET legal_name = NEW.name
    WHERE party_id = NEW.party_id AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vehicle_vendors_party_ins ON vehicle_vendors;
CREATE TRIGGER trg_vehicle_vendors_party_ins BEFORE INSERT ON vehicle_vendors FOR EACH ROW EXECUTE FUNCTION sync_vehicle_vendor_party();
DROP TRIGGER IF EXISTS trg_vehicle_vendors_party_upd ON vehicle_vendors;
CREATE TRIGGER trg_vehicle_vendors_party_upd AFTER UPDATE OF name, active ON vehicle_vendors FOR EACH ROW EXECUTE FUNCTION sync_vehicle_vendor_party();

-- Backfill existing vendors. Rows whose tenant no longer exists are orphans and are skipped.
INSERT INTO parties (id, tenant_id, party_type, display_name, status, visibility, source_system, created_at, updated_at)
SELECT id, tenant_id, 'ORGANIZATION', name, CASE WHEN active THEN 'ACTIVE' ELSE 'INACTIVE' END, 'TENANT', 'VEHICLE_VENDORS',
       coalesce(created_at, now()), coalesce(updated_at, now())
FROM vehicle_vendors WHERE party_id IS NULL AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = vehicle_vendors.tenant_id) ON CONFLICT (id) DO NOTHING;
INSERT INTO party_organizations (party_id, tenant_id, legal_name)
SELECT id, tenant_id, name FROM vehicle_vendors WHERE party_id IS NULL AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = vehicle_vendors.tenant_id) ON CONFLICT (party_id) DO NOTHING;
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
SELECT tenant_id, id, 'EMAIL', email, lower(trim(email)), 'work', 'ORGANIZATION', true FROM vehicle_vendors
WHERE party_id IS NULL AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = vehicle_vendors.tenant_id) AND email IS NOT NULL AND trim(email) <> '' ON CONFLICT DO NOTHING;
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
SELECT tenant_id, id, 'PHONE', phone, regexp_replace(phone, '[^0-9+]', '', 'g'), 'work', 'ORGANIZATION', true FROM vehicle_vendors
WHERE party_id IS NULL AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = vehicle_vendors.tenant_id) AND phone IS NOT NULL AND regexp_replace(phone, '[^0-9+]', '', 'g') <> '' ON CONFLICT DO NOTHING;
UPDATE vehicle_vendors SET party_id = id WHERE party_id IS NULL AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = vehicle_vendors.tenant_id);
