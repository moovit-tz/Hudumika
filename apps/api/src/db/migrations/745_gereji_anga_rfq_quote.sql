-- Gereji port, Milestone 3: ANGA RFQ intake + quote engine. Ported from the
-- standalone app's anga_rfq/anga_rfq_item/anga_quote/anga_quote_item tables
-- (db/schema.ts). Money on quote tables is INTEGER MINOR UNITS, matching the
-- source app's own deliberate decision for this subsystem (its
-- docs/adr/0001-anga-tenancy-and-money.md decision 3) — kept here rather
-- than forced into Hudumika's usual numeric-currency convention, since the
-- cost build-up (part/freight/duty-VAT/clearance/handling -> margin ->
-- sell price) is exactly the kind of per-cent-accurate arithmetic that
-- convention exists to protect.
--
-- Real RLS + FORCE RLS from the start (same as migration 744's foundation
-- tables) — the source app has none on any of these.

CREATE TABLE gereji_anga_rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  customer_id UUID REFERENCES gereji_anga_customers(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'phone' CHECK (source IN ('phone', 'email', 'portal', 'walk_in', 'other')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'quoted', 'won', 'lost', 'expired')),
  aircraft_reg TEXT,
  required_by TIMESTAMPTZ,
  aog_flag BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);
CREATE INDEX idx_gereji_anga_rfqs_status ON gereji_anga_rfqs(tenant_id, status);

CREATE TABLE gereji_anga_rfq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rfq_id UUID NOT NULL REFERENCES gereji_anga_rfqs(id) ON DELETE CASCADE,
  part_id UUID REFERENCES gereji_anga_parts(id) ON DELETE SET NULL,
  pn_free_text TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  condition_acceptable TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (part_id IS NOT NULL OR pn_free_text IS NOT NULL)
);
CREATE INDEX idx_gereji_anga_rfq_items_rfq ON gereji_anga_rfq_items(tenant_id, rfq_id);

CREATE TABLE gereji_anga_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  rfq_id UUID REFERENCES gereji_anga_rfqs(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES gereji_anga_customers(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  previous_version_id UUID REFERENCES gereji_anga_quotes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'superseded', 'converted')),
  currency TEXT NOT NULL DEFAULT 'USD',
  fx_rate NUMERIC(14, 6),
  fx_buffer_percent NUMERIC(6, 3) NOT NULL DEFAULT 0,
  valid_until TIMESTAMPTZ,
  subtotal_minor BIGINT NOT NULL DEFAULT 0,
  margin_total_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);
CREATE INDEX idx_gereji_anga_quotes_rfq ON gereji_anga_quotes(tenant_id, rfq_id);
CREATE INDEX idx_gereji_anga_quotes_status ON gereji_anga_quotes(tenant_id, status);

CREATE TABLE gereji_anga_quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES gereji_anga_quotes(id) ON DELETE CASCADE,
  part_id UUID REFERENCES gereji_anga_parts(id) ON DELETE SET NULL,
  pn_free_text TEXT,
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  part_cost_minor BIGINT NOT NULL DEFAULT 0,
  freight_minor BIGINT NOT NULL DEFAULT 0,
  duty_vat_minor BIGINT NOT NULL DEFAULT 0,
  clearance_fee_minor BIGINT NOT NULL DEFAULT 0,
  handling_minor BIGINT NOT NULL DEFAULT 0,
  margin_percent NUMERIC(6, 3) NOT NULL DEFAULT 0,
  line_cost_minor BIGINT NOT NULL DEFAULT 0,
  margin_minor BIGINT NOT NULL DEFAULT 0,
  sell_price_minor BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (part_id IS NOT NULL OR pn_free_text IS NOT NULL)
);
CREATE INDEX idx_gereji_anga_quote_items_quote ON gereji_anga_quote_items(tenant_id, quote_id);

ALTER TABLE gereji_anga_rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_rfqs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_rfqs;
CREATE POLICY tenant_isolation_policy ON gereji_anga_rfqs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_rfq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_rfq_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_rfq_items;
CREATE POLICY tenant_isolation_policy ON gereji_anga_rfq_items
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_quotes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_quotes;
CREATE POLICY tenant_isolation_policy ON gereji_anga_quotes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_quote_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_quote_items;
CREATE POLICY tenant_isolation_policy ON gereji_anga_quote_items
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
