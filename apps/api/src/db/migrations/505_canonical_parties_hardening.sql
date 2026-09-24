-- Hardening for 504_canonical_parties_and_file_links.sql (review findings):
--  1. resource_file_links → cloud_files was ON DELETE RESTRICT, which made every
--     linked file impossible to permanently delete. A link is metadata about a
--     file; the file stays the owner, so the link must go with it.
--  2. RLS policies now follow the repo convention (NULLIF, so an unset
--     app.tenant_id matches nothing instead of raising a uuid cast error).
--  3. Backfill what 504 skipped: additional contact emails/phones, customers
--     and files created after 504, and lead → party links.
--  4. Keep the canonical tables in sync from EVERY writer (routes, seeds,
--     imports, background jobs) with triggers, instead of relying on each app
--     remembering to dual-write.

-- ── 1. Links go with their file ────────────────────────────────────────
ALTER TABLE resource_file_links DROP CONSTRAINT IF EXISTS resource_file_links_file_id_fkey;
ALTER TABLE resource_file_links
  ADD CONSTRAINT resource_file_links_file_id_fkey FOREIGN KEY (file_id) REFERENCES cloud_files(id) ON DELETE CASCADE;

-- ── 2. RLS convention ──────────────────────────────────────────────────
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['parties','party_people','party_organizations','party_channels','party_affiliations','party_relationships','party_external_refs','party_shares','resource_file_links'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', t, t);
    EXECUTE format('CREATE POLICY tenant_isolation_%I ON %I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t, t);
  END LOOP;
END $$;

-- ── 3a. Additional contact emails / phones ─────────────────────────────
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
SELECT ce.tenant_id, c.party_id, 'EMAIL', ce.email, lower(trim(ce.email)), ce.label,
       CASE WHEN ce.label = 'personal' THEN 'PERSONAL' ELSE 'WORK' END, false
FROM contact_emails ce JOIN contacts c ON c.id = ce.contact_id AND c.tenant_id = ce.tenant_id
WHERE c.party_id IS NOT NULL AND trim(ce.email) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
SELECT cp.tenant_id, c.party_id, CASE WHEN cp.label = 'mobile' THEN 'MOBILE' ELSE 'PHONE' END, cp.phone,
       regexp_replace(cp.phone, '[^0-9+]', '', 'g'), cp.label,
       CASE WHEN cp.label = 'home' THEN 'PERSONAL' ELSE 'WORK' END, false
FROM contact_phones cp JOIN contacts c ON c.id = cp.contact_id AND c.tenant_id = cp.tenant_id
WHERE c.party_id IS NOT NULL AND regexp_replace(cp.phone, '[^0-9+]', '', 'g') <> ''
ON CONFLICT DO NOTHING;

-- ── 4a. Customers: every insert/update keeps its ORGANIZATION party ────
-- party id = customer id (same convention the 504 backfill used), so the
-- customer's public id and its party id are one value.
CREATE OR REPLACE FUNCTION sync_customer_party() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.party_id IS NULL THEN
      INSERT INTO parties (id, tenant_id, party_type, display_name, status, visibility, source_system)
      VALUES (NEW.id, NEW.tenant_id, 'ORGANIZATION', NEW.name, CASE WHEN NEW.active THEN 'ACTIVE' ELSE 'INACTIVE' END, 'TENANT', coalesce(NEW.source, 'CUSTOMERS'))
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO party_organizations (party_id, tenant_id, legal_name, registration_number, tax_identifier, website)
      VALUES (NEW.id, NEW.tenant_id, NEW.name, NEW.registry_number, NEW.tax_id, NEW.website)
      ON CONFLICT (party_id) DO NOTHING;
      IF NEW.email IS NOT NULL AND trim(NEW.email) <> '' THEN
        INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
        VALUES (NEW.tenant_id, NEW.id, 'EMAIL', NEW.email, lower(trim(NEW.email)), 'work', 'ORGANIZATION', true) ON CONFLICT DO NOTHING;
      END IF;
      IF NEW.phone IS NOT NULL AND trim(NEW.phone) <> '' THEN
        INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
        VALUES (NEW.tenant_id, NEW.id, 'PHONE', NEW.phone, regexp_replace(NEW.phone, '[^0-9+]', '', 'g'), 'work', 'ORGANIZATION', true) ON CONFLICT DO NOTHING;
      END IF;
      NEW.party_id := NEW.id;
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: mirror the identity fields onto the party.
  IF NEW.party_id IS NOT NULL THEN
    UPDATE parties SET display_name = NEW.name, status = CASE WHEN status = 'MERGED' THEN status WHEN NEW.active THEN 'ACTIVE' ELSE 'INACTIVE' END, updated_at = now()
    WHERE id = NEW.party_id AND tenant_id = NEW.tenant_id AND (display_name IS DISTINCT FROM NEW.name OR (status <> 'MERGED' AND status IS DISTINCT FROM CASE WHEN NEW.active THEN 'ACTIVE' ELSE 'INACTIVE' END));
    UPDATE party_organizations SET legal_name = NEW.name, registration_number = NEW.registry_number, tax_identifier = NEW.tax_id, website = NEW.website
    WHERE party_id = NEW.party_id AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customers_party_ins ON customers;
CREATE TRIGGER trg_customers_party_ins BEFORE INSERT ON customers FOR EACH ROW EXECUTE FUNCTION sync_customer_party();
DROP TRIGGER IF EXISTS trg_customers_party_upd ON customers;
CREATE TRIGGER trg_customers_party_upd AFTER UPDATE OF name, active, registry_number, tax_id, website ON customers FOR EACH ROW EXECUTE FUNCTION sync_customer_party();

-- Customers created between 504 and now.
INSERT INTO parties (id, tenant_id, party_type, display_name, status, visibility, source_system, created_at, updated_at)
SELECT id, tenant_id, 'ORGANIZATION', name, CASE WHEN active THEN 'ACTIVE' ELSE 'INACTIVE' END, 'TENANT', coalesce(source, 'LEGACY_CUSTOMERS'), created_at, updated_at
FROM customers WHERE party_id IS NULL ON CONFLICT (id) DO NOTHING;
INSERT INTO party_organizations (party_id, tenant_id, legal_name, registration_number, tax_identifier, website)
SELECT id, tenant_id, name, registry_number, tax_id, website FROM customers WHERE party_id IS NULL ON CONFLICT (party_id) DO NOTHING;
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
SELECT tenant_id, id, 'EMAIL', email, lower(trim(email)), 'work', 'ORGANIZATION', true FROM customers
WHERE party_id IS NULL AND email IS NOT NULL AND trim(email) <> '' ON CONFLICT DO NOTHING;
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value, label, context, is_primary)
SELECT tenant_id, id, 'PHONE', phone, regexp_replace(phone, '[^0-9+]', '', 'g'), 'work', 'ORGANIZATION', true FROM customers
WHERE party_id IS NULL AND phone IS NOT NULL AND regexp_replace(phone, '[^0-9+]', '', 'g') <> '' ON CONFLICT DO NOTHING;
UPDATE customers SET party_id = id WHERE party_id IS NULL;

-- ── 4b. Leads: link to the contact / customer they refer to ────────────
-- Best-effort and never overwrites an existing link. When two customers share
-- a name the OLDEST wins (deterministic), rather than an arbitrary row.
CREATE OR REPLACE FUNCTION link_lead_parties() RETURNS trigger AS $$
BEGIN
  IF NEW.contact_party_id IS NULL AND NEW.contact_email IS NOT NULL AND trim(NEW.contact_email) <> '' THEN
    SELECT c.party_id INTO NEW.contact_party_id FROM contacts c
    WHERE c.tenant_id = NEW.tenant_id AND c.status = 'ACTIVE' AND c.party_id IS NOT NULL AND lower(c.email) = lower(trim(NEW.contact_email))
    ORDER BY c.created_at LIMIT 1;
  END IF;
  IF NEW.organization_party_id IS NULL AND NEW.company IS NOT NULL AND trim(NEW.company) <> '' THEN
    SELECT c.party_id INTO NEW.organization_party_id FROM customers c
    WHERE c.tenant_id = NEW.tenant_id AND c.party_id IS NOT NULL AND lower(c.name) = lower(trim(NEW.company))
    ORDER BY c.created_at LIMIT 1;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_link_parties ON leads;
CREATE TRIGGER trg_leads_link_parties BEFORE INSERT OR UPDATE OF company, contact_email ON leads FOR EACH ROW EXECUTE FUNCTION link_lead_parties();

UPDATE leads SET company = company WHERE contact_party_id IS NULL OR organization_party_id IS NULL;

-- ── 4c. Cloud files: the entity tag and the link table cannot drift ────
-- Every path that stamps entity_type/entity_id on a file (Drive upload, the
-- Finance filing service, CloudSync mirrors, email save-to-Drive, eSign) gets a
-- resource_file_links row, and re-tagging a file moves its ATTACHMENT link.
CREATE OR REPLACE FUNCTION sync_cloud_file_link() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.entity_type IS NOT NULL AND OLD.entity_id IS NOT NULL
     AND (OLD.entity_type IS DISTINCT FROM NEW.entity_type OR OLD.entity_id IS DISTINCT FROM NEW.entity_id) THEN
    DELETE FROM resource_file_links
    WHERE tenant_id = OLD.tenant_id AND file_id = OLD.id AND resource_type = OLD.entity_type
      AND resource_id = OLD.entity_id AND relationship_type = 'ATTACHMENT';
  END IF;
  IF NEW.entity_type IS NOT NULL AND NEW.entity_id IS NOT NULL THEN
    INSERT INTO resource_file_links (tenant_id, file_id, resource_type, resource_id, relationship_type)
    VALUES (NEW.tenant_id, NEW.id, NEW.entity_type, NEW.entity_id, 'ATTACHMENT')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cloud_files_link ON cloud_files;
CREATE TRIGGER trg_cloud_files_link AFTER INSERT OR UPDATE OF entity_type, entity_id ON cloud_files
  FOR EACH ROW EXECUTE FUNCTION sync_cloud_file_link();

INSERT INTO resource_file_links (tenant_id, file_id, resource_type, resource_id, relationship_type, created_at)
SELECT tenant_id, id, entity_type, entity_id, 'ATTACHMENT', created_at FROM cloud_files
WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL ON CONFLICT DO NOTHING;
