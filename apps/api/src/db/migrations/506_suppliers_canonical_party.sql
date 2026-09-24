-- Suppliers join the canonical party model (same pattern as customers in 505):
-- every supplier is an ORGANIZATION party whose id equals the supplier id, kept
-- in step by triggers so every writer (routes, imports, seeds) is covered and
-- no supplier API or id changes. Support tickets need no column of their own:
-- they reference customers, and a customer's party id is its customer id.
--
-- A company that is BOTH a customer and a supplier currently has two parties
-- (one per record); linking them is a deliberate, reviewed step (a relationship
-- row), never an automatic name match, because two firms can share a name.

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES parties(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_suppliers_party ON suppliers(tenant_id, party_id) WHERE party_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_supplier_party() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.party_id IS NULL THEN
      INSERT INTO parties (id, tenant_id, party_type, display_name, status, visibility, source_system)
      VALUES (NEW.id, NEW.tenant_id, 'ORGANIZATION', NEW.name, CASE WHEN NEW.status = 'active' THEN 'ACTIVE' ELSE 'INACTIVE' END, 'TENANT', 'SUPPLIERS')
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO party_organizations (party_id, tenant_id, legal_name, tax_identifier)
      VALUES (NEW.id, NEW.tenant_id, NEW.name, NEW.tax_id)
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
           status = CASE WHEN status = 'MERGED' THEN status WHEN NEW.status = 'active' THEN 'ACTIVE' ELSE 'INACTIVE' END,
           updated_at = now()
    WHERE id = NEW.party_id AND tenant_id = NEW.tenant_id
      AND (display_name IS DISTINCT FROM NEW.name
           OR (status <> 'MERGED' AND status IS DISTINCT FROM CASE WHEN NEW.status = 'active' THEN 'ACTIVE' ELSE 'INACTIVE' END));
    UPDATE party_organizations SET legal_name = NEW.name, tax_identifier = NEW.tax_id
    WHERE party_id = NEW.party_id AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_suppliers_party_ins ON suppliers;
CREATE TRIGGER trg_suppliers_party_ins BEFORE INSERT ON suppliers FOR EACH ROW EXECUTE FUNCTION sync_supplier_party();
DROP TRIGGER IF EXISTS trg_suppliers_party_upd ON suppliers;
CREATE TRIGGER trg_suppliers_party_upd AFTER UPDATE OF name, status, tax_id ON suppliers FOR EACH ROW EXECUTE FUNCTION sync_supplier_party();

-- Backfill existing suppliers. Rows whose tenant no longer exists (suppliers.tenant_id has no FK)
-- are orphans and are skipped.
INSERT INTO parties (id, tenant_id, party_type, display_name, status, visibility, source_system, created_at, updated_at)
SELECT id, tenant_id, 'ORGANIZATION', name, CASE WHEN status = 'active' THEN 'ACTIVE' ELSE 'INACTIVE' END, 'TENANT', 'SUPPLIERS',
       coalesce(created_at, now()), coalesce(updated_at, now())
FROM suppliers WHERE party_id IS NULL AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = suppliers.tenant_id) ON CONFLICT (id) DO NOTHING;
INSERT INTO party_organizations (party_id, tenant_id, legal_name, tax_identifier)
SELECT id, tenant_id, name, tax_id FROM suppliers WHERE party_id IS NULL AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = suppliers.tenant_id) ON CONFLICT (party_id) DO NOTHING;
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
SELECT tenant_id, id, 'EMAIL', email, lower(trim(email)), 'work', 'ORGANIZATION', true FROM suppliers
WHERE party_id IS NULL AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = suppliers.tenant_id) AND email IS NOT NULL AND trim(email) <> '' ON CONFLICT DO NOTHING;
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
SELECT tenant_id, id, 'PHONE', phone, regexp_replace(phone, '[^0-9+]', '', 'g'), 'work', 'ORGANIZATION', true FROM suppliers
WHERE party_id IS NULL AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = suppliers.tenant_id) AND phone IS NOT NULL AND regexp_replace(phone, '[^0-9+]', '', 'g') <> '' ON CONFLICT DO NOTHING;
UPDATE suppliers SET party_id = id WHERE party_id IS NULL AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = suppliers.tenant_id);
