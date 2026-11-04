-- Migration 663: Industry solution catalogue entries (draft) and
-- commercial availability flags for new apps.
--
-- Per strategy §6: "Use inactive/draft catalogue records or explicitly
-- marked synthetic test fixtures until real commercial terms are supplied."
-- All prices here are illustrative placeholders — NOT approved production inputs.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Mark new apps as commercially available (they are active from mig 659)
-- ═══════════════════════════════════════════════════════════════════════

UPDATE app_status SET commercially_available = true WHERE app_id IN ('tuma','lexcore','ngao','gereji');

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Industry solution packages (DRAFT / inactive)
-- ═══════════════════════════════════════════════════════════════════════
-- These represent the industry-specific bundle SKUs. A tenant that picks
-- an industry on signup would get this package, which unions the base
-- workspace apps with industry-specific ones. They are all is_active=false
-- and will stay that way until real commercial terms are provided.
--
-- Pricing is ILLUSTRATIVE and explicitly NOT production-ready.

INSERT INTO packages (
  code, name, currency,
  monthly_price, annual_price,
  price_flat_monthly, price_flat_annual,
  price_per_seat, included_seats, max_users, max_locations,
  features, color, popular, is_active, sort_order
) VALUES
-- ── Hudumika for Legal / Professional Services ──
(
  'legal-tzs', 'Hudumika for Legal', 'TZS',
  199000, 1990000,
  199000, 1990000,
  NULL, 10, 10, 3,
  '["LexCore legal practice management", "Matter lifecycle & court diary", "Time recording & billing", "Trust account management", "Conflict screening & KYC", "Ngao privacy compliance", "FinOps accounting", "eSign documents", "50 GB Cloud storage"]'::jsonb,
  '#7c3aed', false, false, 10
),
-- ── Hudumika for Logistics / Supply Chain ──
(
  'logistics-tzs', 'Hudumika for Logistics', 'TZS',
  199000, 1990000,
  199000, 1990000,
  NULL, 15, 15, 5,
  '["Tuma parcel & courier management", "ClearOS customs clearance", "SEAL warehouse management", "HuduFreight operations", "CargoTracker visibility", "Float & agent settlement", "FinOps accounting", "Bulk SMS", "50 GB Cloud storage"]'::jsonb,
  '#ea580c', false, false, 11
),
-- ── Hudumika for Automotive ──
(
  'automotive-tzs', 'Hudumika for Automotive', 'TZS',
  149000, 1490000,
  149000, 1490000,
  NULL, 10, 10, 3,
  '["Gereji workshop management", "Job cards & estimates", "Warranty tracking", "Parts inventory & purchasing", "FinOps accounting", "CRM & Contacts", "50 GB Cloud storage"]'::jsonb,
  '#d97706', false, false, 12
),
-- ── Hudumika for Privacy / Data Protection ──
(
  'privacy-tzs', 'Hudumika for Privacy', 'TZS',
  149000, 1490000,
  149000, 1490000,
  NULL, 5, 5, 2,
  '["Ngao DPIA & impact assessments", "Processing activity registers", "Incident & breach management", "Data subject rights portal", "Vendor risk management", "ComplyOS compliance", "eSign documents", "25 GB Cloud storage"]'::jsonb,
  '#059669', false, false, 13
)
ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Grant feature keys to industry packages
-- ═══════════════════════════════════════════════════════════════════════
-- Each industry package includes its core apps + workspace foundation.
-- Union semantics: overlapping grants (finops, contacts, etc.) are
-- resolved as a single entitlement by middleware/entitlement.ts.

-- Legal: LexCore + Ngao + workspace foundation
INSERT INTO package_features (package_code, feature_key)
SELECT 'legal-tzs', k FROM unnest(ARRAY[
  'finops', 'finance.core', 'finance.accounting.advanced',
  'crm', 'contacts', 'tasks', 'calendar', 'cloud', 'email',
  'sign', 'drive', 'notes',
  'lexcore', 'lexcore.trust', 'lexcore.conflicts',
  'ngao', 'ngao.dpia', 'ngao.incidents',
  'complyos', 'ondi'
]) AS k
ON CONFLICT DO NOTHING;

-- Logistics: Tuma + ClearOS/SEAL/HuduFreight + workspace foundation
INSERT INTO package_features (package_code, feature_key)
SELECT 'logistics-tzs', k FROM unnest(ARRAY[
  'finops', 'finance.core', 'finance.accounting.advanced',
  'finance.pos', 'finance.inventory', 'finance.warehouse',
  'crm', 'contacts', 'tasks', 'calendar', 'cloud', 'email',
  'sms', 'ondi',
  'tuma', 'tuma.dispatch', 'tuma.settlement',
  'clearos', 'seal', 'tracking', 'tracking.reports'
]) AS k
ON CONFLICT DO NOTHING;

-- Automotive: Gereji + Inventory + workspace foundation
INSERT INTO package_features (package_code, feature_key)
SELECT 'automotive-tzs', k FROM unnest(ARRAY[
  'finops', 'finance.core', 'finance.pos',
  'finance.inventory', 'finance.warehouse',
  'crm', 'contacts', 'tasks', 'calendar', 'cloud', 'email',
  'inventory', 'ondi',
  'gereji', 'gereji.warranty'
]) AS k
ON CONFLICT DO NOTHING;

-- Privacy: Ngao + ComplyOS + workspace foundation
INSERT INTO package_features (package_code, feature_key)
SELECT 'privacy-tzs', k FROM unnest(ARRAY[
  'finops', 'finance.core',
  'crm', 'contacts', 'tasks', 'calendar', 'cloud', 'email',
  'sign', 'drive', 'notes', 'ondi',
  'ngao', 'ngao.dpia', 'ngao.incidents',
  'complyos'
]) AS k
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Link industry packages to industry_registry
-- ═══════════════════════════════════════════════════════════════════════
-- Add a package_code column to industry_registry so the signup flow
-- knows which package to assign when a tenant selects an industry.

ALTER TABLE industry_registry
  ADD COLUMN IF NOT EXISTS default_package_code VARCHAR(50) REFERENCES packages(code);

UPDATE industry_registry SET default_package_code = 'legal-tzs'      WHERE key = 'legal';
UPDATE industry_registry SET default_package_code = 'logistics-tzs'  WHERE key = 'logistics';
UPDATE industry_registry SET default_package_code = 'automotive-tzs' WHERE key = 'automotive';
UPDATE industry_registry SET default_package_code = 'privacy-tzs'    WHERE key = 'privacy';
