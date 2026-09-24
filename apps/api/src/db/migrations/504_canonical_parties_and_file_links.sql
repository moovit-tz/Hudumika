-- Tenant-private canonical people/organizations and reusable Cloud file links.
-- Existing Contacts/Customers/Leads remain compatibility surfaces during the
-- phased migration; nullable party ids let old and new code coexist safely.

CREATE TABLE parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  party_type TEXT NOT NULL CHECK (party_type IN ('PERSON','ORGANIZATION')),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED','MERGED')),
  visibility TEXT NOT NULL DEFAULT 'TENANT' CHECK (visibility IN ('PRIVATE','TEAM','DEPARTMENT','TENANT','EXPLICIT_SHARE')),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scope_id UUID,
  source_system TEXT NOT NULL DEFAULT 'MANUAL',
  merged_into_id UUID REFERENCES parties(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK ((status = 'MERGED') = (merged_into_id IS NOT NULL)),
  CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

CREATE TABLE party_people (
  party_id UUID PRIMARY KEY REFERENCES parties(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT,
  preferred_name TEXT,
  title TEXT,
  birthday DATE,
  avatar_url TEXT,
  UNIQUE (tenant_id, party_id)
);

CREATE TABLE party_organizations (
  party_id UUID PRIMARY KEY REFERENCES parties(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  trading_name TEXT,
  registration_number TEXT,
  tax_identifier TEXT,
  website TEXT,
  industry TEXT,
  UNIQUE (tenant_id, party_id)
);

CREATE TABLE party_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('EMAIL','PHONE','MOBILE','WHATSAPP','WEBSITE','LINKEDIN','ADDRESS','OTHER')),
  value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'work',
  context TEXT NOT NULL DEFAULT 'WORK' CHECK (context IN ('PERSONAL','WORK','ORGANIZATION','OTHER')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  visibility TEXT NOT NULL DEFAULT 'TENANT' CHECK (visibility IN ('PRIVATE','TEAM','DEPARTMENT','TENANT','EXPLICIT_SHARE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, party_id, channel_type, normalized_value)
);

CREATE TABLE party_affiliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_party_id UUID NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  organization_party_id UUID NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  relationship_type TEXT NOT NULL DEFAULT 'REPRESENTATIVE',
  job_title TEXT,
  department TEXT,
  start_date DATE,
  end_date DATE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE party_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_party_id UUID NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  to_party_id UUID NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  relationship_type TEXT NOT NULL,
  context_type TEXT,
  context_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, from_party_id, to_party_id, relationship_type, context_type, context_id),
  CHECK (from_party_id <> to_party_id)
);

CREATE TABLE party_external_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL,
  external_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_system, external_id)
);

CREATE TABLE party_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('USER','TEAM','DEPARTMENT')),
  principal_id UUID NOT NULL,
  permission TEXT NOT NULL DEFAULT 'VIEW' CHECK (permission IN ('VIEW','EDIT','MANAGE')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, party_id, principal_type, principal_id)
);

CREATE TABLE resource_file_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES cloud_files(id) ON DELETE RESTRICT,
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'ATTACHMENT',
  classification TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, file_id, resource_type, resource_id, relationship_type)
);

ALTER TABLE contacts ADD COLUMN party_id UUID REFERENCES parties(id) ON DELETE RESTRICT;
ALTER TABLE customers ADD COLUMN party_id UUID REFERENCES parties(id) ON DELETE RESTRICT;
ALTER TABLE leads ADD COLUMN contact_party_id UUID REFERENCES parties(id) ON DELETE RESTRICT;
ALTER TABLE leads ADD COLUMN organization_party_id UUID REFERENCES parties(id) ON DELETE RESTRICT;

CREATE INDEX idx_parties_directory ON parties(tenant_id, party_type, status, display_name);
CREATE INDEX idx_parties_owner_visibility ON parties(tenant_id, owner_user_id, visibility);
CREATE INDEX idx_party_channels_lookup ON party_channels(tenant_id, channel_type, normalized_value) WHERE status = 'ACTIVE';
CREATE INDEX idx_party_affiliations_person ON party_affiliations(tenant_id, person_party_id, status);
CREATE INDEX idx_party_affiliations_org ON party_affiliations(tenant_id, organization_party_id, status);
CREATE INDEX idx_party_relationships_from ON party_relationships(tenant_id, from_party_id, status);
CREATE INDEX idx_party_relationships_to ON party_relationships(tenant_id, to_party_id, status);
CREATE INDEX idx_party_external_refs_party ON party_external_refs(tenant_id, party_id);
CREATE INDEX idx_resource_file_links_resource ON resource_file_links(tenant_id, resource_type, resource_id);
CREATE INDEX idx_resource_file_links_file ON resource_file_links(tenant_id, file_id);
CREATE UNIQUE INDEX uq_contacts_party ON contacts(tenant_id, party_id) WHERE party_id IS NOT NULL;
CREATE INDEX idx_customers_party ON customers(tenant_id, party_id) WHERE party_id IS NOT NULL;

-- Preserve every existing contact as one canonical person without changing
-- its public id/API. Source IDs make this backfill deterministic and auditable.
INSERT INTO parties (id, tenant_id, party_type, display_name, status, visibility, source_system, created_at, updated_at)
SELECT id, tenant_id, 'PERSON', trim(first_name || ' ' || coalesce(last_name, '')),
       CASE WHEN status = 'TRASHED' THEN 'ARCHIVED' ELSE 'ACTIVE' END,
       'TENANT', coalesce(source, 'LEGACY_CONTACTS'), created_at, updated_at
FROM contacts ON CONFLICT (id) DO NOTHING;

INSERT INTO party_people (party_id, tenant_id, first_name, last_name, birthday, avatar_url)
SELECT id, tenant_id, first_name, last_name, birthday, avatar_url FROM contacts
ON CONFLICT (party_id) DO NOTHING;

UPDATE contacts SET party_id = id WHERE party_id IS NULL;

INSERT INTO parties (id, tenant_id, party_type, display_name, status, visibility, source_system, created_at, updated_at)
SELECT id, tenant_id, 'ORGANIZATION', name, CASE WHEN active THEN 'ACTIVE' ELSE 'INACTIVE' END,
       'TENANT', coalesce(source, 'LEGACY_CUSTOMERS'), created_at, updated_at
FROM customers ON CONFLICT (id) DO NOTHING;
INSERT INTO party_organizations (party_id, tenant_id, legal_name, registration_number, tax_identifier, website, industry)
SELECT id, tenant_id, name, registry_number, tax_id, website, NULL FROM customers
ON CONFLICT (party_id) DO NOTHING;
UPDATE customers SET party_id = id WHERE party_id IS NULL;

INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
SELECT tenant_id, id, 'EMAIL', email, lower(trim(email)), 'work', 'WORK', true FROM contacts
WHERE email IS NOT NULL AND trim(email) <> '' ON CONFLICT DO NOTHING;
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
SELECT tenant_id, id, 'PHONE', phone, regexp_replace(phone, '[^0-9+]', '', 'g'), 'work', 'WORK', true FROM contacts
WHERE phone IS NOT NULL AND trim(phone) <> '' ON CONFLICT DO NOTHING;
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
SELECT tenant_id, id, 'EMAIL', email, lower(trim(email)), 'work', 'ORGANIZATION', true FROM customers
WHERE email IS NOT NULL AND trim(email) <> '' ON CONFLICT DO NOTHING;
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
SELECT tenant_id, id, 'PHONE', phone, regexp_replace(phone, '[^0-9+]', '', 'g'), 'work', 'ORGANIZATION', true FROM customers
WHERE phone IS NOT NULL AND trim(phone) <> '' ON CONFLICT DO NOTHING;

UPDATE leads l SET contact_party_id = c.party_id
FROM contacts c WHERE c.tenant_id = l.tenant_id AND c.status = 'ACTIVE' AND c.party_id IS NOT NULL
  AND l.contact_email IS NOT NULL AND lower(c.email) = lower(l.contact_email) AND l.contact_party_id IS NULL;
UPDATE leads l SET organization_party_id = c.party_id
FROM customers c WHERE c.tenant_id = l.tenant_id AND c.party_id IS NOT NULL
  AND lower(c.name) = lower(l.company) AND l.organization_party_id IS NULL;

INSERT INTO resource_file_links (tenant_id, file_id, resource_type, resource_id, relationship_type, created_at)
SELECT tenant_id, id, entity_type, entity_id, 'ATTACHMENT', created_at FROM cloud_files
WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL ON CONFLICT DO NOTHING;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['parties','party_people','party_organizations','party_channels','party_affiliations','party_relationships','party_external_refs','party_shares','resource_file_links'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation_%I ON %I FOR ALL USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t, t);
  END LOOP;
END $$;
