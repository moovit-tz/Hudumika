-- Migration 638: Onboarding journeys, activation checkpoints, implementation
-- scope tracking and support-time attribution.
-- Phase 4 of the commercial plan implementation.

-- ─── Industry Journey Templates ──────────────────────────────────────────────
-- A small number of pre-built entry journeys keyed by industry vertical.
-- Each defines which apps to surface first, which default workflows to seed,
-- and which activation checkpoints to track. Platform-wide, not per-tenant.

CREATE TABLE IF NOT EXISTS onboarding_journeys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_key  VARCHAR(60) NOT NULL UNIQUE,
  label         VARCHAR(200) NOT NULL,
  description   TEXT,
  -- Ordered list of app IDs to surface in the first-time app switcher
  featured_apps JSONB NOT NULL DEFAULT '[]',
  -- Workflow templates to seed beyond the platform defaults
  seed_workflows JSONB NOT NULL DEFAULT '[]',
  -- Activation checkpoints this journey tracks (subset of all possible)
  checkpoint_keys JSONB NOT NULL DEFAULT '[]',
  -- Suggested import templates (CSV column mappings, sample files)
  import_templates JSONB NOT NULL DEFAULT '[]',
  sort_order    INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the four industry journeys from the spec
INSERT INTO onboarding_journeys (industry_key, label, description, featured_apps, checkpoint_keys, sort_order)
VALUES
  ('logistics', 'Freight & Logistics',
   'Customs brokerage, freight forwarding, container tracking and carrier management.',
   '["clearos","cargotracker","hudufreight","finops"]'::jsonb,
   '["first_shipment","first_declaration","first_invoice","import_contacts","invite_team"]'::jsonb,
   1),
  ('distribution', 'Distribution & Trade',
   'Wholesale distribution, retail supply chain and inventory management.',
   '["inventory","finops","crm","store"]'::jsonb,
   '["first_product","first_sale","first_purchase_order","import_products","invite_team"]'::jsonb,
   2),
  ('retail', 'Retail & Services',
   'Point-of-sale, customer management, invoicing and service delivery.',
   '["finops","crm","store","tasks"]'::jsonb,
   '["first_invoice","first_customer","first_product","setup_payment_method","invite_team"]'::jsonb,
   3),
  ('services', 'Professional Services',
   'Project management, time tracking, contracts and client billing.',
   '["projects","finops","crm","tasks"]'::jsonb,
   '["first_project","first_invoice","first_client","first_timesheet","invite_team"]'::jsonb,
   4)
ON CONFLICT (industry_key) DO NOTHING;

-- ─── Activation Checkpoints ──────────────────────────────────────────────────
-- Per-tenant progress tracking. Each checkpoint is completed once and never
-- reset. The combination of tenant_id + checkpoint_key is unique.

CREATE TABLE IF NOT EXISTS tenant_activation_checkpoints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  checkpoint_key  VARCHAR(80) NOT NULL,
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_by    UUID REFERENCES users(id),
  -- Optional metadata (e.g. the ID of the first shipment that triggered it)
  context         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, checkpoint_key)
);

CREATE INDEX idx_activation_checkpoints_tenant ON tenant_activation_checkpoints (tenant_id);

ALTER TABLE tenant_activation_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_activation_checkpoints FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON tenant_activation_checkpoints
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Record which journey each tenant selected at signup
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_journey VARCHAR(60);

-- ─── Implementation Scope Tracking ───────────────────────────────────────────
-- Records what a new customer needs help with during setup — migration scope,
-- data import complexity, training needs. Links to CRM deals and Projects for
-- quote/delivery/invoice tracking through existing capabilities.

CREATE TABLE IF NOT EXISTS implementation_engagements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  -- engagement type: 'included_setup' (free with plan), 'paid_implementation',
  -- 'migration', 'training', 'custom_config'
  engagement_type VARCHAR(40) NOT NULL DEFAULT 'included_setup',
  status          VARCHAR(30) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  scope_summary   TEXT,
  -- Structured scope details (data sources, record counts, complexity notes)
  scope_details   JSONB NOT NULL DEFAULT '{}',
  -- Optional links to CRM deal and Project for full lifecycle tracking
  deal_id         UUID,
  project_id      UUID,
  -- Quote and billing
  quoted_hours    NUMERIC(8,2),
  quoted_amount   NUMERIC(12,2),
  actual_hours    NUMERIC(8,2) DEFAULT 0,
  currency        VARCHAR(3) NOT NULL DEFAULT 'TZS',
  -- Consent: customer acknowledged the scope and cost
  consent_at      TIMESTAMPTZ,
  consent_by      UUID,
  -- Delivery
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  delivered_by    UUID,
  -- Invoice reference (links to existing FinOps invoice if billed)
  invoice_id      UUID,
  notes           TEXT,
  created_by      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_impl_engagements_tenant ON implementation_engagements (tenant_id);

ALTER TABLE implementation_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE implementation_engagements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON implementation_engagements
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ─── Support Time Attribution ────────────────────────────────────────────────
-- Tracks actual support time by category. Distinguished from implementation
-- hours — support is ongoing, implementation is a bounded engagement.

CREATE TABLE IF NOT EXISTS support_time_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  -- Category: 'included' (in plan), 'paid_support', 'implementation',
  -- 'sales_assistance', 'escalation'
  category        VARCHAR(40) NOT NULL DEFAULT 'included',
  -- Duration in minutes
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  -- What happened
  summary         TEXT NOT NULL,
  -- Who provided the support
  agent_user_id   UUID,
  agent_name      VARCHAR(200),
  -- The loaded hourly cost (TZS) at the time of recording, for margin calcs
  loaded_cost_per_hour NUMERIC(10,2),
  -- Optional links
  ticket_ref      VARCHAR(200),
  engagement_id   UUID REFERENCES implementation_engagements(id),
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_time_tenant ON support_time_entries (tenant_id);
CREATE INDEX idx_support_time_category ON support_time_entries (category);

ALTER TABLE support_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_time_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON support_time_entries
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Platform-level support cost configuration (SuperAdmin-managed)
CREATE TABLE IF NOT EXISTS support_cost_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category        VARCHAR(40) NOT NULL UNIQUE,
  loaded_cost_per_hour NUMERIC(10,2) NOT NULL,
  currency        VARCHAR(3) NOT NULL DEFAULT 'TZS',
  description     TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default rates (TZS)
INSERT INTO support_cost_config (category, loaded_cost_per_hour, description)
VALUES
  ('included',         25000, 'Included support — allocated cost per hour'),
  ('paid_support',     50000, 'Paid support tier — billed hourly rate'),
  ('implementation',   75000, 'Implementation/migration work — specialist rate'),
  ('sales_assistance', 25000, 'Pre-sales and onboarding assistance'),
  ('escalation',      100000, 'Escalation/incident response — premium rate')
ON CONFLICT (category) DO NOTHING;

-- ─── Feature Configuration Flags ─────────────────────────────────────────────
-- Per-tenant feature toggles that authorized staff (SuperAdmin/platform ops)
-- can set without deploying code. Not the same as entitlements (which are
-- plan-gated) — these are operational overrides for specific tenants.

CREATE TABLE IF NOT EXISTS tenant_feature_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  flag_key        VARCHAR(80) NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT false,
  -- Optional configuration payload (e.g. limits, thresholds)
  config          JSONB NOT NULL DEFAULT '{}',
  set_by          UUID,
  reason          TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, flag_key)
);

CREATE INDEX idx_feature_flags_tenant ON tenant_feature_flags (tenant_id);

ALTER TABLE tenant_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_feature_flags FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON tenant_feature_flags
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
