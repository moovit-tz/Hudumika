-- Migration 028: Contacts App Tables

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name   VARCHAR(100) NOT NULL,
  last_name    VARCHAR(100),
  email        VARCHAR(255),
  phone        VARCHAR(50),
  company      VARCHAR(200),
  job_title    VARCHAR(200),
  notes        TEXT,
  birthday     DATE,
  is_favorite  BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_url   TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, TRASHED
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);

-- Contact Labels table
CREATE TABLE IF NOT EXISTS contact_labels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_contact_labels_tenant ON contact_labels(tenant_id);

-- Contact Label Mappings table (many-to-many)
CREATE TABLE IF NOT EXISTS contact_label_mappings (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  label_id   UUID NOT NULL REFERENCES contact_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_contact_label_mappings_contact ON contact_label_mappings(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_label_mappings_label   ON contact_label_mappings(label_id);
