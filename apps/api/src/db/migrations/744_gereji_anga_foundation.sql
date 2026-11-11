-- Gereji port, Milestone 2: ANGA PartsOS foundation — catalogue, parties,
-- locations, audit log. Ported from the standalone D:\Apps\Gereji\gereji-app
-- (db/schema.ts's anga_* tables), which itself scopes every table by a plain
-- companyId column with NO row-level security (see its own
-- docs/adr/0001-anga-tenancy-and-money.md). That decision is explicitly not
-- carried over here — every table below gets real RLS + FORCE RLS from the
-- start, per CLAUDE.md's standing rule.
--
-- ANGA customers/suppliers join the canonical party model via party_id
-- (same sync-trigger pattern as vehicle_vendors, migration 740) rather than
-- becoming a third parallel customer/supplier concept alongside the
-- tenant's own `customers`/`suppliers` tables.

CREATE TABLE gereji_anga_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  before JSONB,
  after JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gereji_anga_audit_tenant ON gereji_anga_audit_events(tenant_id, created_at DESC);
CREATE INDEX idx_gereji_anga_audit_entity ON gereji_anga_audit_events(tenant_id, entity_type, entity_id);

CREATE TABLE gereji_anga_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pn TEXT NOT NULL,
  pn_normalized TEXT NOT NULL,
  description TEXT,
  manufacturer TEXT,
  cage_code TEXT,
  ata_chapter TEXT,
  uom TEXT NOT NULL DEFAULT 'EA',
  serialised BOOLEAN NOT NULL DEFAULT false,
  rotable BOOLEAN NOT NULL DEFAULT false,
  shelf_life_controlled BOOLEAN NOT NULL DEFAULT false,
  hazmat_class TEXT,
  export_controlled BOOLEAN NOT NULL DEFAULT false,
  prohibited BOOLEAN NOT NULL DEFAULT false,
  hs_code TEXT,
  duty_suspension_eligible BOOLEAN NOT NULL DEFAULT false,
  certificate_required BOOLEAN NOT NULL DEFAULT false,
  lead_time_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, pn)
);
CREATE INDEX idx_gereji_anga_parts_normalized ON gereji_anga_parts(tenant_id, pn_normalized);

CREATE TABLE gereji_anga_part_alternates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES gereji_anga_parts(id) ON DELETE CASCADE,
  alternate_part_id UUID NOT NULL REFERENCES gereji_anga_parts(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'alternate_two_way',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (part_id <> alternate_part_id)
);
CREATE INDEX idx_gereji_anga_part_alt_part ON gereji_anga_part_alternates(tenant_id, part_id);

CREATE TABLE gereji_anga_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  party_id UUID REFERENCES parties(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  credit_limit_minor BIGINT,
  payment_terms_days INTEGER,
  tax_id TEXT,
  escalation_contact_name TEXT,
  escalation_contact_phone TEXT,
  escalation_contact_email TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gereji_anga_customers_party ON gereji_anga_customers(tenant_id, party_id) WHERE party_id IS NOT NULL;

CREATE TABLE gereji_anga_aircraft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES gereji_anga_customers(id) ON DELETE CASCADE,
  registration TEXT NOT NULL,
  aircraft_type TEXT,
  msn TEXT,
  base TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, registration)
);
CREATE INDEX idx_gereji_anga_aircraft_customer ON gereji_anga_aircraft(tenant_id, customer_id);

CREATE TABLE gereji_anga_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  party_id UUID REFERENCES parties(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'suspended', 'rejected')),
  approval_scope TEXT,
  approval_expiry TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gereji_anga_suppliers_party ON gereji_anga_suppliers(tenant_id, party_id) WHERE party_id IS NOT NULL;

CREATE TABLE gereji_anga_supplier_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES gereji_anga_suppliers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  reference TEXT,
  expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gereji_anga_supplier_cert_supplier ON gereji_anga_supplier_certifications(tenant_id, supplier_id);

CREATE TABLE gereji_anga_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  warehouse TEXT NOT NULL DEFAULT 'Main',
  zone TEXT,
  rack TEXT,
  shelf TEXT,
  bin TEXT,
  customs_zone TEXT NOT NULL DEFAULT 'DUTY_PAID' CHECK (customs_zone IN ('DUTY_PAID', 'BONDED', 'FREE_ZONE')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, warehouse, zone, rack, shelf, bin)
);

-- ── Party-sync triggers (same template as migration 740's vehicle_vendors) ──

CREATE OR REPLACE FUNCTION sync_gereji_anga_customer_party() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.party_id IS NULL THEN
      INSERT INTO parties (id, tenant_id, party_type, display_name, status, visibility, source_system)
      VALUES (gen_random_uuid(), NEW.tenant_id, 'ORGANIZATION', NEW.name, 'ACTIVE', 'TENANT', 'GEREJI_ANGA_CUSTOMERS')
      RETURNING id INTO NEW.party_id;
      INSERT INTO party_organizations (party_id, tenant_id, legal_name, tax_identifier)
      VALUES (NEW.party_id, NEW.tenant_id, NEW.name, NEW.tax_id);
      IF NEW.email IS NOT NULL AND trim(NEW.email) <> '' THEN
        INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
        VALUES (NEW.tenant_id, NEW.party_id, 'EMAIL', NEW.email, lower(trim(NEW.email)), 'work', 'ORGANIZATION', true) ON CONFLICT DO NOTHING;
      END IF;
      IF NEW.phone IS NOT NULL AND regexp_replace(NEW.phone, '[^0-9+]', '', 'g') <> '' THEN
        INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
        VALUES (NEW.tenant_id, NEW.party_id, 'PHONE', NEW.phone, regexp_replace(NEW.phone, '[^0-9+]', '', 'g'), 'work', 'ORGANIZATION', true) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.party_id IS NOT NULL THEN
    UPDATE parties SET display_name = NEW.name, updated_at = now()
    WHERE id = NEW.party_id AND tenant_id = NEW.tenant_id AND status <> 'MERGED' AND display_name IS DISTINCT FROM NEW.name;
    UPDATE party_organizations SET legal_name = NEW.name, tax_identifier = NEW.tax_id
    WHERE party_id = NEW.party_id AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gereji_anga_customers_party_ins ON gereji_anga_customers;
CREATE TRIGGER trg_gereji_anga_customers_party_ins BEFORE INSERT ON gereji_anga_customers FOR EACH ROW EXECUTE FUNCTION sync_gereji_anga_customer_party();
DROP TRIGGER IF EXISTS trg_gereji_anga_customers_party_upd ON gereji_anga_customers;
CREATE TRIGGER trg_gereji_anga_customers_party_upd AFTER UPDATE OF name, tax_id ON gereji_anga_customers FOR EACH ROW EXECUTE FUNCTION sync_gereji_anga_customer_party();

CREATE OR REPLACE FUNCTION sync_gereji_anga_supplier_party() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.party_id IS NULL THEN
      INSERT INTO parties (id, tenant_id, party_type, display_name, status, visibility, source_system)
      VALUES (gen_random_uuid(), NEW.tenant_id, 'ORGANIZATION', NEW.name, 'ACTIVE', 'TENANT', 'GEREJI_ANGA_SUPPLIERS')
      RETURNING id INTO NEW.party_id;
      INSERT INTO party_organizations (party_id, tenant_id, legal_name)
      VALUES (NEW.party_id, NEW.tenant_id, NEW.name);
      IF NEW.contact_email IS NOT NULL AND trim(NEW.contact_email) <> '' THEN
        INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
        VALUES (NEW.tenant_id, NEW.party_id, 'EMAIL', NEW.contact_email, lower(trim(NEW.contact_email)), 'work', 'ORGANIZATION', true) ON CONFLICT DO NOTHING;
      END IF;
      IF NEW.contact_phone IS NOT NULL AND regexp_replace(NEW.contact_phone, '[^0-9+]', '', 'g') <> '' THEN
        INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
        VALUES (NEW.tenant_id, NEW.party_id, 'PHONE', NEW.contact_phone, regexp_replace(NEW.contact_phone, '[^0-9+]', '', 'g'), 'work', 'ORGANIZATION', true) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.party_id IS NOT NULL THEN
    UPDATE parties SET display_name = NEW.name, updated_at = now()
    WHERE id = NEW.party_id AND tenant_id = NEW.tenant_id AND status <> 'MERGED' AND display_name IS DISTINCT FROM NEW.name;
    UPDATE party_organizations SET legal_name = NEW.name WHERE party_id = NEW.party_id AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gereji_anga_suppliers_party_ins ON gereji_anga_suppliers;
CREATE TRIGGER trg_gereji_anga_suppliers_party_ins BEFORE INSERT ON gereji_anga_suppliers FOR EACH ROW EXECUTE FUNCTION sync_gereji_anga_supplier_party();
DROP TRIGGER IF EXISTS trg_gereji_anga_suppliers_party_upd ON gereji_anga_suppliers;
CREATE TRIGGER trg_gereji_anga_suppliers_party_upd AFTER UPDATE OF name ON gereji_anga_suppliers FOR EACH ROW EXECUTE FUNCTION sync_gereji_anga_supplier_party();

-- ── RLS + FORCE RLS on every tenant-scoped table above (same
--    NULLIF(...,'')::uuid guard as every other tenant_isolation_policy in
--    this codebase — withTenant(null, ...) sets app.tenant_id to '', and
--    casting '' straight to ::uuid would error rather than just not match) ──

ALTER TABLE gereji_anga_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_audit_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_audit_events;
CREATE POLICY tenant_isolation_policy ON gereji_anga_audit_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_parts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_parts;
CREATE POLICY tenant_isolation_policy ON gereji_anga_parts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_part_alternates ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_part_alternates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_part_alternates;
CREATE POLICY tenant_isolation_policy ON gereji_anga_part_alternates
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_customers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_customers;
CREATE POLICY tenant_isolation_policy ON gereji_anga_customers
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_aircraft ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_aircraft FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_aircraft;
CREATE POLICY tenant_isolation_policy ON gereji_anga_aircraft
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_suppliers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_suppliers;
CREATE POLICY tenant_isolation_policy ON gereji_anga_suppliers
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_supplier_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_supplier_certifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_supplier_certifications;
CREATE POLICY tenant_isolation_policy ON gereji_anga_supplier_certifications
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_locations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_locations;
CREATE POLICY tenant_isolation_policy ON gereji_anga_locations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
