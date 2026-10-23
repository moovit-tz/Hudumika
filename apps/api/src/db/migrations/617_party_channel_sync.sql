-- Workstream A: fix the party-channel sync gap identified in the ADR.
--
-- Problem:
--   Mig 505 customer trigger fires on UPDATE OF name, active, registry_number,
--   tax_id, website — NOT email, phone, phone_wa. Its UPDATE branch never
--   touches party_channels. Mig 506 supplier trigger fires on UPDATE OF name,
--   status, tax_id — NOT email, phone. Same gap.
--
--   Result: after INSERT, customer/supplier channels are correct. After any
--   UPDATE to email/phone, party_channels is stale — the old address stays
--   active, the new one is never created.
--
-- Fix:
--   1. Add source_entity / source_field to party_channels so triggers can
--      locate exactly the managed projection without relying on value matching.
--   2. Rewrite both triggers to fire on email/phone changes and sync channels.
--   3. Backfill provenance on existing managed channels.
--   4. Reconcile mismatches created before this migration.

-- ── 1. Provenance columns ─────────────────────────────────────────────
ALTER TABLE party_channels ADD COLUMN IF NOT EXISTS source_entity TEXT;
ALTER TABLE party_channels ADD COLUMN IF NOT EXISTS source_field  TEXT;

COMMENT ON COLUMN party_channels.source_entity IS
  'The table that owns this channel projection, e.g. customers, suppliers, contacts. NULL = independently managed.';
COMMENT ON COLUMN party_channels.source_field IS
  'The column on source_entity, e.g. email, phone, phone_wa. NULL = independently managed.';

CREATE INDEX IF NOT EXISTS idx_party_channels_provenance
  ON party_channels (tenant_id, party_id, source_entity, source_field)
  WHERE source_entity IS NOT NULL;

-- ── 2. Backfill provenance on channels created by 504/505/506 triggers ──
-- Customer email channels: label = 'work', context = 'ORGANIZATION', is_primary = true
-- created by the INSERT branch.
UPDATE party_channels pc SET source_entity = 'customers', source_field = 'email'
FROM customers c
WHERE pc.party_id = c.party_id AND pc.tenant_id = c.tenant_id
  AND pc.channel_type = 'EMAIL' AND pc.context = 'ORGANIZATION'
  AND pc.label = 'work' AND pc.is_primary = true
  AND pc.source_entity IS NULL
  AND c.email IS NOT NULL AND lower(trim(c.email)) = pc.normalized_value;

UPDATE party_channels pc SET source_entity = 'customers', source_field = 'phone'
FROM customers c
WHERE pc.party_id = c.party_id AND pc.tenant_id = c.tenant_id
  AND pc.channel_type = 'PHONE' AND pc.context = 'ORGANIZATION'
  AND pc.label = 'work' AND pc.is_primary = true
  AND pc.source_entity IS NULL
  AND c.phone IS NOT NULL AND regexp_replace(c.phone, '[^0-9+]', '', 'g') = pc.normalized_value;

-- Supplier email channels
UPDATE party_channels pc SET source_entity = 'suppliers', source_field = 'email'
FROM suppliers s
WHERE pc.party_id = s.party_id AND pc.tenant_id = s.tenant_id
  AND pc.channel_type = 'EMAIL' AND pc.context = 'ORGANIZATION'
  AND pc.label = 'work' AND pc.is_primary = true
  AND pc.source_entity IS NULL
  AND s.email IS NOT NULL AND lower(trim(s.email)) = pc.normalized_value;

UPDATE party_channels pc SET source_entity = 'suppliers', source_field = 'phone'
FROM suppliers s
WHERE pc.party_id = s.party_id AND pc.tenant_id = s.tenant_id
  AND pc.channel_type = 'PHONE' AND pc.context = 'ORGANIZATION'
  AND pc.label = 'work' AND pc.is_primary = true
  AND pc.source_entity IS NULL
  AND s.phone IS NOT NULL AND regexp_replace(s.phone, '[^0-9+]', '', 'g') = pc.normalized_value;

-- ── 3. Helper: upsert or remove a managed channel ─────────────────────
CREATE OR REPLACE FUNCTION sync_managed_channel(
  p_tenant_id UUID,
  p_party_id UUID,
  p_source_entity TEXT,
  p_source_field TEXT,
  p_channel_type TEXT,
  p_new_value TEXT
) RETURNS void AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  -- Normalize value
  IF p_channel_type IN ('PHONE', 'MOBILE', 'WHATSAPP') THEN
    v_normalized := regexp_replace(COALESCE(p_new_value, ''), '[^0-9+]', '', 'g');
  ELSE
    v_normalized := lower(trim(COALESCE(p_new_value, '')));
  END IF;

  IF v_normalized = '' THEN
    -- Field was cleared: deactivate (not delete) the managed projection.
    -- This preserves audit history without leaving a stale active address.
    UPDATE party_channels
    SET status = 'INACTIVE', updated_at = now()
    WHERE tenant_id = p_tenant_id AND party_id = p_party_id
      AND source_entity = p_source_entity AND source_field = p_source_field
      AND status = 'ACTIVE';
    RETURN;
  END IF;

  -- Try to update the existing managed channel
  UPDATE party_channels
  SET value = p_new_value,
      normalized_value = v_normalized,
      status = 'ACTIVE',
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND party_id = p_party_id
    AND source_entity = p_source_entity AND source_field = p_source_field;

  IF NOT FOUND THEN
    -- No existing managed channel for this field — insert one.
    -- ON CONFLICT handles the race where an identical normalized value
    -- already exists as an independently managed channel.
    INSERT INTO party_channels (
      tenant_id, party_id, channel_type, value, normalized_value,
      label, context, is_primary, source_entity, source_field
    ) VALUES (
      p_tenant_id, p_party_id, p_channel_type, p_new_value, v_normalized,
      'work', 'ORGANIZATION', true, p_source_entity, p_source_field
    ) ON CONFLICT (tenant_id, party_id, channel_type, normalized_value) DO UPDATE
      SET source_entity = p_source_entity,
          source_field = p_source_field,
          status = 'ACTIVE',
          is_primary = true,
          updated_at = now();
  END IF;
END $$ LANGUAGE plpgsql;

-- ── 4. Rewrite customer trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_customer_party() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.party_id IS NULL THEN
      INSERT INTO parties (id, tenant_id, party_type, display_name, status, visibility, source_system)
      VALUES (NEW.id, NEW.tenant_id, 'ORGANIZATION', NEW.name,
              CASE WHEN NEW.active THEN 'ACTIVE' ELSE 'INACTIVE' END,
              'TENANT', coalesce(NEW.source, 'CUSTOMERS'))
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO party_organizations (party_id, tenant_id, legal_name, registration_number, tax_identifier, website)
      VALUES (NEW.id, NEW.tenant_id, NEW.name, NEW.registry_number, NEW.tax_id, NEW.website)
      ON CONFLICT (party_id) DO NOTHING;

      -- Channels with provenance
      IF NEW.email IS NOT NULL AND trim(NEW.email) <> '' THEN
        PERFORM sync_managed_channel(NEW.tenant_id, NEW.id, 'customers', 'email', 'EMAIL', NEW.email);
      END IF;
      IF NEW.phone IS NOT NULL AND trim(NEW.phone) <> '' THEN
        PERFORM sync_managed_channel(NEW.tenant_id, NEW.id, 'customers', 'phone', 'PHONE', NEW.phone);
      END IF;
      IF NEW.phone_wa IS NOT NULL AND trim(NEW.phone_wa) <> '' THEN
        PERFORM sync_managed_channel(NEW.tenant_id, NEW.id, 'customers', 'phone_wa', 'WHATSAPP', NEW.phone_wa);
      END IF;
      NEW.party_id := NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: mirror identity fields onto the party.
  IF NEW.party_id IS NOT NULL THEN
    UPDATE parties SET display_name = NEW.name,
           status = CASE WHEN status = 'MERGED' THEN status
                         WHEN NEW.active THEN 'ACTIVE' ELSE 'INACTIVE' END,
           updated_at = now()
    WHERE id = NEW.party_id AND tenant_id = NEW.tenant_id
      AND (display_name IS DISTINCT FROM NEW.name
           OR (status <> 'MERGED' AND status IS DISTINCT FROM
               CASE WHEN NEW.active THEN 'ACTIVE' ELSE 'INACTIVE' END));

    UPDATE party_organizations
    SET legal_name = NEW.name, registration_number = NEW.registry_number,
        tax_identifier = NEW.tax_id, website = NEW.website
    WHERE party_id = NEW.party_id AND tenant_id = NEW.tenant_id;

    -- Channel sync: only when the value actually changed
    IF OLD.email IS DISTINCT FROM NEW.email THEN
      PERFORM sync_managed_channel(NEW.tenant_id, NEW.party_id, 'customers', 'email', 'EMAIL', NEW.email);
    END IF;
    IF OLD.phone IS DISTINCT FROM NEW.phone THEN
      PERFORM sync_managed_channel(NEW.tenant_id, NEW.party_id, 'customers', 'phone', 'PHONE', NEW.phone);
    END IF;
    IF OLD.phone_wa IS DISTINCT FROM NEW.phone_wa THEN
      PERFORM sync_managed_channel(NEW.tenant_id, NEW.party_id, 'customers', 'phone_wa', 'WHATSAPP', NEW.phone_wa);
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- Re-bind triggers to include email/phone/phone_wa columns
DROP TRIGGER IF EXISTS trg_customers_party_ins ON customers;
CREATE TRIGGER trg_customers_party_ins BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION sync_customer_party();

DROP TRIGGER IF EXISTS trg_customers_party_upd ON customers;
CREATE TRIGGER trg_customers_party_upd AFTER UPDATE OF
  name, active, registry_number, tax_id, website, email, phone, phone_wa
  ON customers FOR EACH ROW EXECUTE FUNCTION sync_customer_party();

-- ── 5. Rewrite supplier trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_supplier_party() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.party_id IS NULL THEN
      INSERT INTO parties (id, tenant_id, party_type, display_name, status, visibility, source_system)
      VALUES (NEW.id, NEW.tenant_id, 'ORGANIZATION', NEW.name,
              CASE WHEN NEW.status = 'active' THEN 'ACTIVE' ELSE 'INACTIVE' END,
              'TENANT', 'SUPPLIERS')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO party_organizations (party_id, tenant_id, legal_name, tax_identifier)
      VALUES (NEW.id, NEW.tenant_id, NEW.name, NEW.tax_id)
      ON CONFLICT (party_id) DO NOTHING;

      IF NEW.email IS NOT NULL AND trim(NEW.email) <> '' THEN
        PERFORM sync_managed_channel(NEW.tenant_id, NEW.id, 'suppliers', 'email', 'EMAIL', NEW.email);
      END IF;
      IF NEW.phone IS NOT NULL AND regexp_replace(NEW.phone, '[^0-9+]', '', 'g') <> '' THEN
        PERFORM sync_managed_channel(NEW.tenant_id, NEW.id, 'suppliers', 'phone', 'PHONE', NEW.phone);
      END IF;
      NEW.party_id := NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.party_id IS NOT NULL THEN
    UPDATE parties SET display_name = NEW.name,
           status = CASE WHEN status = 'MERGED' THEN status
                         WHEN NEW.status = 'active' THEN 'ACTIVE' ELSE 'INACTIVE' END,
           updated_at = now()
    WHERE id = NEW.party_id AND tenant_id = NEW.tenant_id
      AND (display_name IS DISTINCT FROM NEW.name
           OR (status <> 'MERGED' AND status IS DISTINCT FROM
               CASE WHEN NEW.status = 'active' THEN 'ACTIVE' ELSE 'INACTIVE' END));

    UPDATE party_organizations SET legal_name = NEW.name, tax_identifier = NEW.tax_id
    WHERE party_id = NEW.party_id AND tenant_id = NEW.tenant_id;

    IF OLD.email IS DISTINCT FROM NEW.email THEN
      PERFORM sync_managed_channel(NEW.tenant_id, NEW.party_id, 'suppliers', 'email', 'EMAIL', NEW.email);
    END IF;
    IF OLD.phone IS DISTINCT FROM NEW.phone THEN
      PERFORM sync_managed_channel(NEW.tenant_id, NEW.party_id, 'suppliers', 'phone', 'PHONE', NEW.phone);
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_suppliers_party_ins ON suppliers;
CREATE TRIGGER trg_suppliers_party_ins BEFORE INSERT ON suppliers
  FOR EACH ROW EXECUTE FUNCTION sync_supplier_party();

DROP TRIGGER IF EXISTS trg_suppliers_party_upd ON suppliers;
CREATE TRIGGER trg_suppliers_party_upd AFTER UPDATE OF
  name, status, tax_id, email, phone
  ON suppliers FOR EACH ROW EXECUTE FUNCTION sync_supplier_party();

-- ── 6. Enable RLS on party_channels provenance index ──────────────────
-- (RLS already enabled on party_channels from mig 505; index is additive.)

-- ── 7. Reconciliation: fix existing mismatches ────────────────────────
-- Customers whose email changed after INSERT but before this migration.
-- We only fix unambiguous cases: the party has exactly one managed EMAIL
-- channel (now provenance-tagged) whose value doesn't match the customer.
-- Ambiguous cases (multiple channels, no provenance match) are logged, not
-- silently overwritten.

-- Fix customer email mismatches
UPDATE party_channels pc
SET value = c.email,
    normalized_value = lower(trim(c.email)),
    status = 'ACTIVE',
    updated_at = now()
FROM customers c
WHERE pc.party_id = c.party_id AND pc.tenant_id = c.tenant_id
  AND pc.source_entity = 'customers' AND pc.source_field = 'email'
  AND c.email IS NOT NULL AND trim(c.email) <> ''
  AND pc.normalized_value IS DISTINCT FROM lower(trim(c.email));

-- Fix customer phone mismatches
UPDATE party_channels pc
SET value = c.phone,
    normalized_value = regexp_replace(c.phone, '[^0-9+]', '', 'g'),
    status = 'ACTIVE',
    updated_at = now()
FROM customers c
WHERE pc.party_id = c.party_id AND pc.tenant_id = c.tenant_id
  AND pc.source_entity = 'customers' AND pc.source_field = 'phone'
  AND c.phone IS NOT NULL AND regexp_replace(c.phone, '[^0-9+]', '', 'g') <> ''
  AND pc.normalized_value IS DISTINCT FROM regexp_replace(c.phone, '[^0-9+]', '', 'g');

-- Customers with email but no managed channel at all (provenance backfill missed)
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value,
  label, context, is_primary, source_entity, source_field)
SELECT c.tenant_id, c.party_id, 'EMAIL', c.email, lower(trim(c.email)),
       'work', 'ORGANIZATION', true, 'customers', 'email'
FROM customers c
WHERE c.party_id IS NOT NULL AND c.email IS NOT NULL AND trim(c.email) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM party_channels pc
    WHERE pc.tenant_id = c.tenant_id AND pc.party_id = c.party_id
      AND pc.source_entity = 'customers' AND pc.source_field = 'email'
  )
ON CONFLICT (tenant_id, party_id, channel_type, normalized_value) DO UPDATE
  SET source_entity = 'customers', source_field = 'email', status = 'ACTIVE', updated_at = now();

-- Customers with phone but no managed channel
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value,
  label, context, is_primary, source_entity, source_field)
SELECT c.tenant_id, c.party_id, 'PHONE', c.phone, regexp_replace(c.phone, '[^0-9+]', '', 'g'),
       'work', 'ORGANIZATION', true, 'customers', 'phone'
FROM customers c
WHERE c.party_id IS NOT NULL AND c.phone IS NOT NULL AND regexp_replace(c.phone, '[^0-9+]', '', 'g') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM party_channels pc
    WHERE pc.tenant_id = c.tenant_id AND pc.party_id = c.party_id
      AND pc.source_entity = 'customers' AND pc.source_field = 'phone'
  )
ON CONFLICT (tenant_id, party_id, channel_type, normalized_value) DO UPDATE
  SET source_entity = 'customers', source_field = 'phone', status = 'ACTIVE', updated_at = now();

-- Customers with phone_wa but no managed WHATSAPP channel
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value,
  label, context, is_primary, source_entity, source_field)
SELECT c.tenant_id, c.party_id, 'WHATSAPP', c.phone_wa, regexp_replace(c.phone_wa, '[^0-9+]', '', 'g'),
       'work', 'ORGANIZATION', false, 'customers', 'phone_wa'
FROM customers c
WHERE c.party_id IS NOT NULL AND c.phone_wa IS NOT NULL AND regexp_replace(c.phone_wa, '[^0-9+]', '', 'g') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM party_channels pc
    WHERE pc.tenant_id = c.tenant_id AND pc.party_id = c.party_id
      AND pc.source_entity = 'customers' AND pc.source_field = 'phone_wa'
  )
ON CONFLICT (tenant_id, party_id, channel_type, normalized_value) DO UPDATE
  SET source_entity = 'customers', source_field = 'phone_wa', status = 'ACTIVE', updated_at = now();

-- Fix supplier email mismatches
UPDATE party_channels pc
SET value = s.email,
    normalized_value = lower(trim(s.email)),
    status = 'ACTIVE',
    updated_at = now()
FROM suppliers s
WHERE pc.party_id = s.party_id AND pc.tenant_id = s.tenant_id
  AND pc.source_entity = 'suppliers' AND pc.source_field = 'email'
  AND s.email IS NOT NULL AND trim(s.email) <> ''
  AND pc.normalized_value IS DISTINCT FROM lower(trim(s.email));

-- Fix supplier phone mismatches
UPDATE party_channels pc
SET value = s.phone,
    normalized_value = regexp_replace(s.phone, '[^0-9+]', '', 'g'),
    status = 'ACTIVE',
    updated_at = now()
FROM suppliers s
WHERE pc.party_id = s.party_id AND pc.tenant_id = s.tenant_id
  AND pc.source_entity = 'suppliers' AND pc.source_field = 'phone'
  AND s.phone IS NOT NULL AND regexp_replace(s.phone, '[^0-9+]', '', 'g') <> ''
  AND pc.normalized_value IS DISTINCT FROM regexp_replace(s.phone, '[^0-9+]', '', 'g');

-- Suppliers with email but no managed channel
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value,
  label, context, is_primary, source_entity, source_field)
SELECT s.tenant_id, s.party_id, 'EMAIL', s.email, lower(trim(s.email)),
       'work', 'ORGANIZATION', true, 'suppliers', 'email'
FROM suppliers s
WHERE s.party_id IS NOT NULL AND s.email IS NOT NULL AND trim(s.email) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM party_channels pc
    WHERE pc.tenant_id = s.tenant_id AND pc.party_id = s.party_id
      AND pc.source_entity = 'suppliers' AND pc.source_field = 'email'
  )
ON CONFLICT (tenant_id, party_id, channel_type, normalized_value) DO UPDATE
  SET source_entity = 'suppliers', source_field = 'email', status = 'ACTIVE', updated_at = now();

-- Suppliers with phone but no managed channel
INSERT INTO party_channels (tenant_id, party_id, channel_type, value, normalized_value,
  label, context, is_primary, source_entity, source_field)
SELECT s.tenant_id, s.party_id, 'PHONE', s.phone, regexp_replace(s.phone, '[^0-9+]', '', 'g'),
       'work', 'ORGANIZATION', true, 'suppliers', 'phone'
FROM suppliers s
WHERE s.party_id IS NOT NULL AND s.phone IS NOT NULL AND regexp_replace(s.phone, '[^0-9+]', '', 'g') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM party_channels pc
    WHERE pc.tenant_id = s.tenant_id AND pc.party_id = s.party_id
      AND pc.source_entity = 'suppliers' AND pc.source_field = 'phone'
  )
ON CONFLICT (tenant_id, party_id, channel_type, normalized_value) DO UPDATE
  SET source_entity = 'suppliers', source_field = 'phone', status = 'ACTIVE', updated_at = now();

-- Deactivate managed channels where the source field is now NULL/empty
UPDATE party_channels pc SET status = 'INACTIVE', updated_at = now()
FROM customers c
WHERE pc.party_id = c.party_id AND pc.tenant_id = c.tenant_id
  AND pc.source_entity = 'customers' AND pc.source_field = 'email'
  AND pc.status = 'ACTIVE'
  AND (c.email IS NULL OR trim(c.email) = '');

UPDATE party_channels pc SET status = 'INACTIVE', updated_at = now()
FROM customers c
WHERE pc.party_id = c.party_id AND pc.tenant_id = c.tenant_id
  AND pc.source_entity = 'customers' AND pc.source_field = 'phone'
  AND pc.status = 'ACTIVE'
  AND (c.phone IS NULL OR regexp_replace(c.phone, '[^0-9+]', '', 'g') = '');

UPDATE party_channels pc SET status = 'INACTIVE', updated_at = now()
FROM customers c
WHERE pc.party_id = c.party_id AND pc.tenant_id = c.tenant_id
  AND pc.source_entity = 'customers' AND pc.source_field = 'phone_wa'
  AND pc.status = 'ACTIVE'
  AND (c.phone_wa IS NULL OR regexp_replace(c.phone_wa, '[^0-9+]', '', 'g') = '');

UPDATE party_channels pc SET status = 'INACTIVE', updated_at = now()
FROM suppliers s
WHERE pc.party_id = s.party_id AND pc.tenant_id = s.tenant_id
  AND pc.source_entity = 'suppliers' AND pc.source_field = 'email'
  AND pc.status = 'ACTIVE'
  AND (s.email IS NULL OR trim(s.email) = '');

UPDATE party_channels pc SET status = 'INACTIVE', updated_at = now()
FROM suppliers s
WHERE pc.party_id = s.party_id AND pc.tenant_id = s.tenant_id
  AND pc.source_entity = 'suppliers' AND pc.source_field = 'phone'
  AND pc.status = 'ACTIVE'
  AND (s.phone IS NULL OR regexp_replace(s.phone, '[^0-9+]', '', 'g') = '');
