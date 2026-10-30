-- Migration 642: Platform-wide industry registry.
-- Extends the in-code FINANCE_INDUSTRIES array with a database-backed registry
-- that all apps share. Platform-scoped (no tenant_id) — managed by SUPER_ADMIN.
-- Each row is an industry or sub-industry with stable keys, aliases, app mappings
-- and acceptance state.

CREATE TABLE industry_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  parent_key      TEXT REFERENCES industry_registry(key) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  -- Aliases for deduplication (e.g. "trading" → "distribution", "freight" → "logistics")
  aliases         TEXT[] NOT NULL DEFAULT '{}',
  -- Classification codes
  isic_code       TEXT,
  naics_code      TEXT,
  -- Implementation status: controls whether tenants can activate this industry
  status          TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'pilot', 'accepted', 'unavailable', 'retired')),
  -- Which apps have implemented industry-specific behaviour for this key
  app_capabilities JSONB NOT NULL DEFAULT '{}',
  -- Recommended finance capabilities (bridges the FINANCE_INDUSTRIES array)
  recommended_finance_caps TEXT[] NOT NULL DEFAULT '{}',
  -- Jurisdiction coverage (which countries have reviewed packs)
  jurisdiction_coverage TEXT[] NOT NULL DEFAULT '{}',
  -- Schema/template version for industry-specific configuration
  config_version  INT NOT NULL DEFAULT 1,
  -- Ordering for UI display
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_industry_registry_parent ON industry_registry (parent_key) WHERE parent_key IS NOT NULL;
CREATE INDEX idx_industry_registry_status ON industry_registry (status);

-- Seed from the existing 24 FINANCE_INDUSTRY_KEYS + the 4 new verticals from the blueprint.
-- Status is 'accepted' for industries that have working Finance domain services,
-- 'pilot' for those with tables but limited services, 'proposed' for new ones.

INSERT INTO industry_registry (key, name, description, status, sort_order, recommended_finance_caps) VALUES
  ('retail',                 'Retail',                       'Counter and direct-to-customer sales.',                         'accepted',  1,  ARRAY['finance.inventory', 'finance.pos', 'finance.procurement']),
  ('wholesale',              'Wholesale',                    'Bulk sales, purchasing and stock fulfilment.',                   'accepted',  2,  ARRAY['finance.inventory', 'finance.procurement', 'finance.warehouse']),
  ('ecommerce',              'E-commerce',                   'Online storefronts, order fulfilment and multi-channel sales.',  'accepted',  3,  ARRAY['finance.inventory', 'finance.pos', 'finance.procurement']),
  ('manufacturing',          'Manufacturing',                'Production, materials, work in progress and costing.',           'accepted',  4,  ARRAY['finance.inventory', 'finance.procurement', 'finance.manufacturing']),
  ('food_beverage',          'Food & Beverage',              'Recipe-driven batch production, allergens, shelf life.',         'accepted',  5,  ARRAY['finance.inventory', 'finance.manufacturing', 'finance.procurement']),
  ('printing',               'Printing',                     'Print production, stock and procurement workflows.',             'accepted',  6,  ARRAY['finance.inventory', 'finance.procurement', 'finance.manufacturing']),
  ('warehousing',            'Warehousing',                  'Storage, allocation, picking and fulfilment.',                   'accepted',  7,  ARRAY['finance.inventory', 'finance.warehouse']),
  ('professional_services',  'Professional Services',        'Time, project delivery and profitability.',                      'accepted',  8,  ARRAY['finance.professional_services', 'finance.project_accounting']),
  ('consulting',             'Consulting',                   'Client engagements, expenses and project profitability.',        'accepted',  9,  ARRAY['finance.professional_services', 'finance.project_accounting']),
  ('construction',           'Construction',                 'BOQ, progress certificates, subcontracted work.',                'accepted', 10,  ARRAY['finance.inventory', 'finance.procurement', 'finance.project_accounting']),
  ('property',               'Property & Rentals',           'Lease management, tenant billing and maintenance.',              'accepted', 11,  ARRAY['finance.property']),
  ('automotive',             'Automotive & Workshop',        'Vehicle service jobs, parts and labour billing.',                'accepted', 12,  ARRAY['finance.inventory', 'finance.procurement']),
  ('hospitality',            'Hospitality',                  'Reservations, guest folios and front-desk operations.',          'accepted', 13,  ARRAY['finance.hospitality', 'finance.pos']),
  ('restaurant',             'Restaurant & Food Service',    'Table orders, kitchen tickets, menu costing.',                   'accepted', 14,  ARRAY['finance.inventory', 'finance.pos']),
  ('agriculture',            'Agriculture & Livestock',      'Planting seasons, harvest yields, input costs.',                 'pilot',    15,  ARRAY['finance.inventory', 'finance.procurement']),
  ('education',              'Education',                    'Student enrolment, fee structures, term billing.',               'accepted', 16,  ARRAY['finance.education']),
  ('healthcare',             'Healthcare',                   'Facility/practitioner credentials, procedure billing.',          'pilot',    17,  ARRAY['finance.inventory']),
  ('pharmaceutical',         'Pharmaceutical',               'GMP manufacturing, batch traceability, regulatory holds.',       'pilot',    18,  ARRAY['finance.inventory', 'finance.manufacturing', 'finance.procurement']),
  ('mining',                 'Mining & Extraction',          'Extraction, ore processing, concessions and royalties.',         'pilot',    19,  ARRAY['finance.inventory', 'finance.procurement']),
  ('energy',                 'Energy & Utilities',           'Meter readings, consumption billing and tariffs.',               'proposed',  20, ARRAY[]::text[]),
  ('telecom',                'Telecom & Subscriptions',      'Subscriber plans, usage metering and recurring billing.',        'proposed',  21, ARRAY[]::text[]),
  ('insurance',              'Insurance',                    'Policy underwriting, premium collection, claims.',               'accepted', 22,  ARRAY['finance.insurance']),
  ('lending',                'Lending & Microfinance',       'Loan origination, disbursement and repayment.',                  'accepted', 23,  ARRAY['finance.lending']),
  ('logistics',              'Logistics & Import/Export',    'Freight forwarding, customs clearance and shipment costing.',    'accepted', 24,  ARRAY['finance.procurement']),
  -- New industries from the multi-industry blueprint
  ('trading',                'Trading & Distribution',       'Multi-site stock, serial/batch/expiry, import/export.',          'pilot',    25,  ARRAY['finance.inventory', 'finance.procurement']),
  ('fintech',                'Fintech & Financial Services', 'Supported authorizations, due diligence, reconciliation.',       'proposed',  26, ARRAY[]::text[]),
  ('technology',             'Technology & Telecom',         'Product/market approvals, service/project contracts.',            'proposed',  27, ARRAY[]::text[])
ON CONFLICT (key) DO NOTHING;

-- Set aliases for common overlaps
UPDATE industry_registry SET aliases = ARRAY['distribution', 'import_export'] WHERE key = 'trading';
UPDATE industry_registry SET aliases = ARRAY['freight', 'customs', 'forwarding'] WHERE key = 'logistics';
UPDATE industry_registry SET aliases = ARRAY['medical'] WHERE key = 'healthcare';
UPDATE industry_registry SET aliases = ARRAY['pharma', 'gmp'] WHERE key = 'pharmaceutical';
UPDATE industry_registry SET aliases = ARRAY['finserv', 'banking', 'microfinance_services'] WHERE key = 'fintech';
UPDATE industry_registry SET aliases = ARRAY['ict', 'saas', 'software'] WHERE key = 'technology';
UPDATE industry_registry SET aliases = ARRAY['extractives'] WHERE key = 'mining';

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDUSTRY CAPABILITY MATRIX
-- Records which app has implemented which capability for which industry.
-- Platform-scoped. Consumed at runtime by UI/API to determine what's available.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE industry_app_capabilities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_key    TEXT NOT NULL REFERENCES industry_registry(key) ON DELETE CASCADE,
  app_id          TEXT NOT NULL,
  capability_key  TEXT NOT NULL,
  capability_name TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'pilot', 'accepted', 'unavailable', 'retired')),
  description     TEXT,
  config_schema   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (industry_key, app_id, capability_key)
);

CREATE INDEX idx_iac_industry ON industry_app_capabilities (industry_key, status);
CREATE INDEX idx_iac_app ON industry_app_capabilities (app_id, status);
