-- 465_cms_content_models.sql
-- Closes "the fork" named in the CMS Implementation Map: §2 of the CMS
-- master brief explicitly warns against making Page/Post the fundamental
-- database architecture — which is exactly what migrations 101/103 did.
-- This is additive, not a replacement: cms_pages/cms_posts keep working
-- exactly as they do today (nothing here touches them), while tenants gain
-- a genuine no-code Content Model Builder for everything Page/Post can't
-- express (Product, Employee, Event, Property, FAQ, ...). A future pass can
-- migrate Page/Post in as the first two seeded models once this has proven
-- itself; that migration is deliberately not attempted in the same pass
-- that introduces the mechanism.

CREATE TABLE IF NOT EXISTS cms_content_models (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT        NOT NULL,
  key          TEXT        NOT NULL, -- machine name, e.g. "product" — stable, used in URLs and field bindings
  name         TEXT        NOT NULL, -- e.g. "Product"
  name_plural  TEXT        NOT NULL, -- e.g. "Products"
  description  TEXT,
  icon         TEXT        NOT NULL DEFAULT 'box', -- a name from the platform's own Icon component
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cms_content_models_tenant_key ON cms_content_models (tenant_id, key);
CREATE INDEX IF NOT EXISTS cms_content_models_tenant ON cms_content_models (tenant_id);

-- field_type is a free string, not a CHECK-constrained enum — the brief
-- names ~35 field types; this ships a real core set (see cms-content.
-- routes.ts's FIELD_TYPES) and adding another later is a code change to
-- that list, never a migration, so the schema doesn't need to anticipate
-- every type up front.
CREATE TABLE IF NOT EXISTS cms_content_fields (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT        NOT NULL,
  model_id     UUID        NOT NULL REFERENCES cms_content_models(id) ON DELETE CASCADE,
  key          TEXT        NOT NULL, -- machine name, e.g. "price" — the key data->>'price' is stored under
  label        TEXT        NOT NULL, -- e.g. "Price"
  field_type   TEXT        NOT NULL,
  required     BOOLEAN     NOT NULL DEFAULT false,
  help_text    TEXT,
  -- Type-specific shape: {options:[...]} for select, {targetModelKey} for
  -- relation, {min,max} for number, etc. — see each field type's own
  -- validator in cms-content.service.ts for what it reads here.
  config       JSONB       NOT NULL DEFAULT '{}',
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cms_content_fields_model_key ON cms_content_fields (model_id, key);
CREATE INDEX IF NOT EXISTS cms_content_fields_model ON cms_content_fields (model_id, sort_order);

-- One generic entry table for every model — a Product entry and an Employee
-- entry are both a row here, distinguished by model_id, with their actual
-- field values in `data`. Same lifecycle (draft/scheduled/published/trash)
-- and same publish_at scheduling mechanism already proven for cms_posts —
-- the scheduled-publish job (465 onward) sweeps this table too.
CREATE TABLE IF NOT EXISTS cms_content_entries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT        NOT NULL,
  model_id         UUID        NOT NULL REFERENCES cms_content_models(id) ON DELETE CASCADE,
  slug             TEXT        NOT NULL,
  title            TEXT        NOT NULL DEFAULT '', -- denormalized from data's own "title-ish" field for fast listing/search without inspecting JSONB per row
  status           TEXT        NOT NULL DEFAULT 'draft', -- draft | published | scheduled | trash
  data             JSONB       NOT NULL DEFAULT '{}',
  seo_description  TEXT,
  author_id        TEXT,
  publish_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cms_content_entries_model_slug ON cms_content_entries (model_id, slug);
CREATE INDEX IF NOT EXISTS cms_content_entries_tenant ON cms_content_entries (tenant_id, model_id);
CREATE INDEX IF NOT EXISTS cms_content_entries_scheduled ON cms_content_entries (publish_at) WHERE status = 'scheduled';

ALTER TABLE cms_content_entries ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(data::text, ''))) STORED;
CREATE INDEX IF NOT EXISTS cms_content_entries_search ON cms_content_entries USING GIN (search_vector);

ALTER TABLE cms_content_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_content_models FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_content_models;
CREATE POLICY tenant_isolation_policy ON cms_content_models
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE cms_content_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_content_fields FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_content_fields;
CREATE POLICY tenant_isolation_policy ON cms_content_fields
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE cms_content_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_content_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_content_entries;
CREATE POLICY tenant_isolation_policy ON cms_content_entries
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
