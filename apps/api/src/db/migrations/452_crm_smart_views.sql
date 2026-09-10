-- Migration 452: saved segments / smart views for the CRM — the dynamic
-- half of the tags gap (migration 450 shipped static tags; this is the
-- "Nairobi leads over $10k, re-evaluated every time you open it" view).
-- Direct port of Contacts' own contact_smart_groups (migration 442) —
-- same rules-as-JSONB, same match_type, same "the API's field catalog is
-- authoritative, a rule it no longer understands is dropped on read and
-- rejected on save" contract.
--
-- entity_type pins each view to one of lead/deal/customer because the
-- filterable columns differ per entity — a view isn't polymorphic the way
-- crm_activities/crm_labels are, it's a saved query against one table.

CREATE TABLE crm_smart_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('lead', 'deal', 'customer')),
  name        TEXT NOT NULL,
  match_type  TEXT NOT NULL DEFAULT 'all' CHECK (match_type IN ('all', 'any')),
  rules       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_type, name)
);
CREATE INDEX idx_crm_smart_views_tenant ON crm_smart_views(tenant_id, entity_type);

ALTER TABLE crm_smart_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_smart_views FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON crm_smart_views
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TRIGGER crm_smart_views_updated_at
  BEFORE UPDATE ON crm_smart_views
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
