-- Migration 717: industry_app_capabilities coverage for 16 'accepted'
-- industries that had zero rows (confirmed live: only legal/privacy/
-- automotive/logistics had any — see the 2026-11-08 industry readiness
-- backlog, S02). Real effect of the gap: GET /v1/onboarding/industries'
-- core_apps is an empty array for all 16 during signup, since
-- IndustryRegistryService.listAppCapabilities() derives core_apps FROM
-- this table — there is no other source to backfill from.
--
-- Every app_id here is a real, already-registered feature key (verified
-- live against package_features/app_status — see the ledger). 'core' is
-- assigned to whichever system actually owns that industry's operational
-- record TODAY, per the backlog doc's own per-industry baseline
-- description — not invented:
--   - retail/hospitality/restaurant: POS owns the transaction.
--   - wholesale/manufacturing/food_beverage/printing/warehousing: SEAL
--     owns stock/production (migration 559 merged Inventory into SEAL;
--     the backlog doc's own baselines for manufacturing/food_beverage/
--     printing all cite "reusable recipe/batch manufacturing foundations").
--   - professional_services/consulting/construction: Projects owns the
--     engagement/BOQ record (doc: "project work, milestones, time/expenses
--     and billing foundations"; construction doc baseline: "BOQ,
--     measurements, certificates, retention and project costs").
--   - property/education/insurance/lending: no dedicated operational app
--     exists yet (doc confirms each is "generic ... billing foundations"),
--     so FinOps — specifically each industry's own finance.<key> capability,
--     already real and present in package_features — is the closest thing
--     to a system of record today.
--   - ecommerce: deliberately has NO 'core' row. The backlog doc explicitly
--     warns "App Store is not a merchant storefront" (S19) — there is no
--     real storefront/cart/checkout app yet, so marking anything 'core'
--     here would repeat exactly the fabrication the doc warns against.
--     Optional-only until that's actually built (see ledger, Phase 3/8).

INSERT INTO industry_app_capabilities (industry_key, app_id, capability_key, capability_name) VALUES
  -- Retail
  ('retail', 'pos',      'core',     'Point of Sale'),
  ('retail', 'finops',   'optional', 'Financial Management'),
  ('retail', 'crm',      'optional', 'Customer Relationship Management'),
  ('retail', 'contacts', 'optional', 'Contact Management'),

  -- Wholesale
  ('wholesale', 'seal',     'core',     'Warehouse & Stock Management'),
  ('wholesale', 'finops',   'optional', 'Financial Management'),
  ('wholesale', 'crm',      'optional', 'Customer Relationship Management'),
  ('wholesale', 'contacts', 'optional', 'Contact Management'),
  ('wholesale', 'projects', 'optional', 'Order & Fulfilment Tracking'),

  -- E-commerce — optional-only; no real storefront app exists yet (see note above).
  ('ecommerce', 'finops',   'optional', 'Financial Management'),
  ('ecommerce', 'pos',      'optional', 'Point of Sale'),
  ('ecommerce', 'crm',      'optional', 'Customer Relationship Management'),
  ('ecommerce', 'contacts', 'optional', 'Contact Management'),

  -- Manufacturing
  ('manufacturing', 'seal',     'core',     'Production & Stock Management'),
  ('manufacturing', 'finops',   'optional', 'Financial Management'),
  ('manufacturing', 'projects', 'optional', 'Work Order Tracking'),
  ('manufacturing', 'contacts', 'optional', 'Contact Management'),

  -- Food & Beverage
  ('food_beverage', 'seal',     'core',     'Recipe & Batch Production'),
  ('food_beverage', 'finops',   'optional', 'Financial Management'),
  ('food_beverage', 'pos',      'optional', 'Point of Sale'),
  ('food_beverage', 'contacts', 'optional', 'Contact Management'),

  -- Printing
  ('printing', 'seal',     'core',     'Production & Stock Management'),
  ('printing', 'finops',   'optional', 'Financial Management'),
  ('printing', 'projects', 'optional', 'Job Tracking'),
  ('printing', 'contacts', 'optional', 'Contact Management'),

  -- Warehousing
  ('warehousing', 'seal',         'core',     'Warehouse & Stock Management'),
  ('warehousing', 'finops',       'optional', 'Financial Management'),
  ('warehousing', 'cargotracker', 'optional', 'Cargo Visibility'),
  ('warehousing', 'contacts',     'optional', 'Contact Management'),

  -- Professional Services
  ('professional_services', 'projects', 'core',     'Engagement & Project Delivery'),
  ('professional_services', 'finops',   'optional', 'Financial Management'),
  ('professional_services', 'contacts', 'optional', 'Contact Management'),
  ('professional_services', 'tasks',    'optional', 'Task Management'),
  ('professional_services', 'calendar', 'optional', 'Calendar & Scheduling'),

  -- Consulting
  ('consulting', 'projects', 'core',     'Engagement & Project Delivery'),
  ('consulting', 'finops',   'optional', 'Financial Management'),
  ('consulting', 'contacts', 'optional', 'Contact Management'),
  ('consulting', 'tasks',    'optional', 'Task Management'),
  ('consulting', 'calendar', 'optional', 'Calendar & Scheduling'),

  -- Construction
  ('construction', 'projects', 'core',     'BOQ & Project Delivery'),
  ('construction', 'finops',   'optional', 'Financial Management'),
  ('construction', 'seal',     'optional', 'Site Materials & Stock'),
  ('construction', 'contacts', 'optional', 'Contact Management'),

  -- Property & Rentals
  ('property', 'finops',   'core',     'Financial Management'),
  ('property', 'contacts', 'optional', 'Contact Management'),
  ('property', 'tasks',    'optional', 'Maintenance Task Tracking'),
  ('property', 'calendar', 'optional', 'Calendar & Scheduling'),

  -- Hospitality
  ('hospitality', 'finops',   'core',     'Financial Management'),
  ('hospitality', 'pos',      'optional', 'Folio & Point of Sale'),
  ('hospitality', 'contacts', 'optional', 'Contact Management'),
  ('hospitality', 'calendar', 'optional', 'Calendar & Scheduling'),

  -- Restaurant & Food Service
  ('restaurant', 'pos',      'core',     'Point of Sale'),
  ('restaurant', 'finops',   'optional', 'Financial Management'),
  ('restaurant', 'seal',     'optional', 'Ingredient & Stock Management'),
  ('restaurant', 'contacts', 'optional', 'Contact Management'),

  -- Education
  ('education', 'finops',   'core',     'Financial Management'),
  ('education', 'contacts', 'optional', 'Contact Management'),
  ('education', 'calendar', 'optional', 'Calendar & Scheduling'),
  ('education', 'tasks',    'optional', 'Task Management'),

  -- Insurance
  ('insurance', 'finops',   'core',     'Financial Management'),
  ('insurance', 'contacts', 'optional', 'Contact Management'),
  ('insurance', 'crm',      'optional', 'Customer Relationship Management'),

  -- Lending & Microfinance
  ('lending', 'finops',   'core',     'Financial Management'),
  ('lending', 'contacts', 'optional', 'Contact Management'),
  ('lending', 'crm',      'optional', 'Customer Relationship Management')
ON CONFLICT (industry_key, app_id, capability_key) DO NOTHING;
