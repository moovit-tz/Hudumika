-- Migration 453: admin-configurable custom fields for the CRM — the
-- last "Later"-tier data-model gap. Every top-10 CRM lets an admin add a
-- field with no code change; here a new attribute meant a migration.
--
-- Two tables, the classic EAV shape kept deliberately narrow:
--   crm_custom_field_defs   — the schema an admin defines, per entity type
--   crm_custom_field_values — one row per (definition, record), value as
--                             TEXT always, parsed back by the def's type
--                             on read. A NULL/absent row means "not set".
--
-- Values carry no tenant_id — they're scoped through their definition,
-- same EXISTS-policy shape as crm_label_mappings (440/450). def_id +
-- subject_id is the PK so setting a field twice on the same record is an
-- upsert, never a duplicate.

CREATE TABLE crm_custom_field_defs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('lead', 'deal', 'customer')),
  field_key   TEXT NOT NULL,
  label       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('text', 'number', 'date', 'select', 'checkbox')),
  options     JSONB NOT NULL DEFAULT '[]'::jsonb,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_type, field_key)
);
CREATE INDEX idx_crm_cf_defs_tenant ON crm_custom_field_defs(tenant_id, entity_type, position);

CREATE TABLE crm_custom_field_values (
  def_id     UUID NOT NULL REFERENCES crm_custom_field_defs(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (def_id, subject_id)
);
CREATE INDEX idx_crm_cf_values_subject ON crm_custom_field_values(subject_id);

ALTER TABLE crm_custom_field_defs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_custom_field_defs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON crm_custom_field_defs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE crm_custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_custom_field_values FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON crm_custom_field_values
  USING (EXISTS (
    SELECT 1 FROM crm_custom_field_defs d
    WHERE d.id = crm_custom_field_values.def_id
      AND d.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  ));
