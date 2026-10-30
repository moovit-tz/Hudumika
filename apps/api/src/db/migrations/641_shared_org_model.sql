-- Migration 641: Shared organizational model for multi-entity, multi-industry tenants.
-- Establishes the hierarchy: tenant → legal entities → business lines → sites → records.
-- These tables are referenced by ALL apps — HR, Finance, ClearOS, ComplyOS, etc.
-- Existing hr_legal_entities and finance_business_lines are bridged, not replaced.

-- ═══════════════════════════════════════════════════════════════════════════════
-- TENANT LEGAL ENTITIES
-- A company, subsidiary, branch or division within a tenant. Every app that needs
-- a legal-entity context references this table; HR and Finance bridge from their
-- existing entity tables via optional FKs.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE tenant_entities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  legal_name       TEXT NOT NULL,
  short_name       TEXT,
  registration_no  TEXT,
  tax_id           TEXT,
  country_code     VARCHAR(2) NOT NULL DEFAULT 'TZ',
  currency         VARCHAR(3) NOT NULL DEFAULT 'TZS',
  entity_type      TEXT NOT NULL DEFAULT 'subsidiary'
    CHECK (entity_type IN ('parent', 'subsidiary', 'branch', 'division', 'joint_venture', 'other')),
  parent_entity_id UUID REFERENCES tenant_entities(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'dormant', 'dissolved', 'pending_registration')),
  registered_address TEXT,
  primary_industry TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, legal_name)
);

CREATE INDEX idx_tenant_entities_tenant ON tenant_entities (tenant_id, status);
CREATE INDEX idx_tenant_entities_parent ON tenant_entities (parent_entity_id) WHERE parent_entity_id IS NOT NULL;
CREATE INDEX idx_tenant_entities_country ON tenant_entities (tenant_id, country_code);

ALTER TABLE tenant_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_entities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_entities
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TENANT SITES
-- A physical location, facility, warehouse, factory, office or retail outlet.
-- Linked to an entity. Multiple industries/activities can operate at one site.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE tenant_sites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id       UUID REFERENCES tenant_entities(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  code            VARCHAR(40),
  site_type       TEXT NOT NULL DEFAULT 'office'
    CHECK (site_type IN ('office', 'factory', 'warehouse', 'retail', 'clinic', 'mine', 'farm', 'port', 'other')),
  address         TEXT,
  city            TEXT,
  region          TEXT,
  country_code    VARCHAR(2) NOT NULL DEFAULT 'TZ',
  timezone        TEXT NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'under_construction', 'closed')),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, code)
);

CREATE INDEX idx_tenant_sites_tenant ON tenant_sites (tenant_id, status);
CREATE INDEX idx_tenant_sites_entity ON tenant_sites (entity_id) WHERE entity_id IS NOT NULL;

ALTER TABLE tenant_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_sites FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_sites
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ENTITY ↔ INDUSTRY JUNCTION
-- Many-to-many: an entity can operate in multiple industries simultaneously.
-- primary_industry on tenant_entities is a convenience default.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE entity_industries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL REFERENCES tenant_entities(id) ON DELETE CASCADE,
  industry_key    TEXT NOT NULL,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to    DATE,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'pending')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, entity_id, industry_key)
);

CREATE INDEX idx_entity_industries_entity ON entity_industries (entity_id, status);
CREATE INDEX idx_entity_industries_industry ON entity_industries (tenant_id, industry_key, status);

ALTER TABLE entity_industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_industries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON entity_industries
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SITE ↔ ACTIVITY JUNCTION
-- Many-to-many: a site can host multiple industry-specific activities.
-- E.g. one factory has both pharmaceutical_manufacturing and device_assembly.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE site_activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id         UUID NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
  industry_key    TEXT NOT NULL,
  activity_name   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'pending_approval')),
  license_ref     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, site_id, industry_key, activity_name)
);

CREATE INDEX idx_site_activities_site ON site_activities (site_id, status);

ALTER TABLE site_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_activities
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ═══════════════════════════════════════════════════════════════════════════════
-- BRIDGE: finance_business_lines → tenant_entities
-- Optional FK so existing Finance BLs can be scoped to a legal entity.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE finance_business_lines ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES tenant_entities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fbl_entity ON finance_business_lines (entity_id) WHERE entity_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BRIDGE: hr_legal_entities → tenant_entities
-- Optional FK so HR entities can link to the shared model.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE hr_legal_entities ADD COLUMN IF NOT EXISTS shared_entity_id UUID REFERENCES tenant_entities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hrle_shared_entity ON hr_legal_entities (shared_entity_id) WHERE shared_entity_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TENANT PRIMARY INDUSTRIES (platform-level, replacing Finance-only JSONB)
-- Records which industries a tenant has activated. Read by all apps.
-- The existing tenant_finance_profiles.industries JSONB is preserved for
-- backward compat but new code should read from here.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE tenant_industries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  industry_key    TEXT NOT NULL,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  activated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  deactivated_at  TIMESTAMPTZ,

  UNIQUE (tenant_id, industry_key)
);

CREATE INDEX idx_tenant_industries_tenant ON tenant_industries (tenant_id);

ALTER TABLE tenant_industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_industries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_industries
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
