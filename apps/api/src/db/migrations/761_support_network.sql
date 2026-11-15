-- Support network: run Bliss support across many centres, zones and places.
--
-- Bliss was built as one support desk: every agent saw every ticket, and the
-- only grouping was a colour-tagged "group". An operator with a hundred
-- centres across several countries, and products that need different kinds of
-- support, needs:
--
--   geo_zones                 a hierarchy of places (country > region > zone >
--                             area), each with a point/radius or a boundary.
--                             Generic, not support-specific: delivery zones or
--                             sales territories can use the same rows.
--   tenant_sites (+ columns)  the centres. tenant_sites is already the shared
--                             "physical location" table (641_shared_org_model),
--                             so a centre is a site with support enabled, not a
--                             second, parallel location concept.
--   support_products          product lines, each with its own SLA targets and
--                             the apps whose tickets belong to it.
--   support_groups (+cols)    queues: a centre and/or product, skills, overflow.
--   support_group_members     who works a queue.
--   support_agent_memberships who belongs to which centre or zone, in what
--                             role, with which skills, languages and capacity.
--                             This is also what limits what each person sees.
--   support_tickets (+cols)   every ticket records its centre, zone, product
--                             and why it was routed where it was.

-- ── Zones ────────────────────────────────────────────────────────────────
CREATE TABLE geo_zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES geo_zones(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  code        VARCHAR(40),
  kind        TEXT NOT NULL DEFAULT 'zone'
    CHECK (kind IN ('country', 'region', 'zone', 'area')),
  -- A zone is either a circle (centre + radius) or a GeoJSON polygon; both
  -- are optional, so a purely administrative zone ("East Africa") is fine.
  center_lat  NUMERIC(10,7),
  center_lng  NUMERIC(10,7),
  radius_km   NUMERIC(8,2),
  boundary    JSONB,
  timezone    TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX idx_geo_zones_tenant ON geo_zones (tenant_id, status);
CREATE INDEX idx_geo_zones_parent ON geo_zones (parent_id);
ALTER TABLE geo_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_zones FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON geo_zones
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Centres ──────────────────────────────────────────────────────────────
ALTER TABLE tenant_sites DROP CONSTRAINT IF EXISTS tenant_sites_site_type_check;
ALTER TABLE tenant_sites ADD CONSTRAINT tenant_sites_site_type_check
  CHECK (site_type IN ('office', 'factory', 'warehouse', 'retail', 'clinic', 'mine', 'farm', 'port', 'contact_centre', 'hub', 'other'));
ALTER TABLE tenant_sites
  ADD COLUMN zone_id         UUID REFERENCES geo_zones(id) ON DELETE SET NULL,
  ADD COLUMN support_enabled BOOLEAN NOT NULL DEFAULT false,
  -- {"mon":["08:00","18:00"], …}; a missing day is closed; null = always open.
  ADD COLUMN opening_hours   JSONB;
CREATE INDEX idx_tenant_sites_zone ON tenant_sites (zone_id) WHERE zone_id IS NOT NULL;

-- ── Products ─────────────────────────────────────────────────────────────
CREATE TABLE support_products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  code         VARCHAR(40),
  color        TEXT,
  description  TEXT,
  -- Tickets raised from these apps belong to this product unless told otherwise.
  source_apps  TEXT[] NOT NULL DEFAULT '{}',
  -- Hours to resolve, per priority: {"URGENT":2,"HIGH":8,…}. Missing keys fall
  -- back to the platform defaults.
  sla_hours    JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
ALTER TABLE support_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_products FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_products
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Queues ───────────────────────────────────────────────────────────────
ALTER TABLE support_groups
  ADD COLUMN site_id    UUID REFERENCES tenant_sites(id) ON DELETE SET NULL,
  ADD COLUMN product_id UUID REFERENCES support_products(id) ON DELETE SET NULL,
  ADD COLUMN skills     TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN languages  TEXT[] NOT NULL DEFAULT '{}',
  -- Where work goes when nobody in this queue's centre can take it.
  ADD COLUMN overflow   TEXT NOT NULL DEFAULT 'zone' CHECK (overflow IN ('none', 'zone', 'network'));

CREATE TABLE support_group_members (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES support_groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX idx_support_group_members_user ON support_group_members (tenant_id, user_id);
ALTER TABLE support_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_group_members FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_group_members
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Agents ───────────────────────────────────────────────────────────────
CREATE TABLE support_agent_memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Exactly one of site_id (works at a centre) or zone_id (oversees a zone).
  site_id     UUID REFERENCES tenant_sites(id) ON DELETE CASCADE,
  zone_id     UUID REFERENCES geo_zones(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'agent'
    CHECK (role IN ('agent', 'lead', 'centre_manager', 'zone_manager')),
  skills      TEXT[] NOT NULL DEFAULT '{}',
  languages   TEXT[] NOT NULL DEFAULT '{}',
  max_open    INTEGER NOT NULL DEFAULT 15 CHECK (max_open BETWEEN 1 AND 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((site_id IS NULL) <> (zone_id IS NULL)),
  CHECK ((role = 'zone_manager') = (zone_id IS NOT NULL))
);
CREATE UNIQUE INDEX uq_support_agent_site ON support_agent_memberships (tenant_id, user_id, site_id) WHERE site_id IS NOT NULL;
CREATE UNIQUE INDEX uq_support_agent_zone ON support_agent_memberships (tenant_id, user_id, zone_id) WHERE zone_id IS NOT NULL;
CREATE INDEX idx_support_agent_site ON support_agent_memberships (tenant_id, site_id);
ALTER TABLE support_agent_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_agent_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_agent_memberships
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Tickets ──────────────────────────────────────────────────────────────
ALTER TABLE support_tickets
  ADD COLUMN site_id      UUID REFERENCES tenant_sites(id) ON DELETE SET NULL,
  ADD COLUMN zone_id      UUID REFERENCES geo_zones(id) ON DELETE SET NULL,
  ADD COLUMN product_id   UUID REFERENCES support_products(id) ON DELETE SET NULL,
  ADD COLUMN customer_lat NUMERIC(10,7),
  ADD COLUMN customer_lng NUMERIC(10,7),
  ADD COLUMN routed_reason TEXT;
CREATE INDEX idx_support_tickets_site ON support_tickets (tenant_id, site_id, status);
CREATE INDEX idx_support_tickets_zone ON support_tickets (tenant_id, zone_id, status);
CREATE INDEX idx_support_tickets_product ON support_tickets (tenant_id, product_id);
