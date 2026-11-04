-- Migration 661: Wire new apps into the industry composition layer.
-- Maps each industry to the apps that automatically activate for tenants
-- in that industry, using the existing industry_app_capabilities table (mig 642).
-- capability_key = 'core' (essential) or 'optional' (recommended add-on).

-- ── Legal Services industry → LexCore + Ngao + FinOps + Sign ──

INSERT INTO industry_app_capabilities (industry_key, app_id, capability_key, capability_name, status)
VALUES
  ('legal', 'lexcore',  'core',     'Legal Practice Management',  'accepted'),
  ('legal', 'ngao',     'optional', 'Privacy Compliance',         'accepted'),
  ('legal', 'finops',   'core',     'Financial Management',       'accepted'),
  ('legal', 'sign',     'optional', 'Document Signing',           'accepted'),
  ('legal', 'contacts', 'optional', 'Contact Management',         'accepted'),
  ('legal', 'calendar', 'optional', 'Calendar & Scheduling',      'accepted'),
  ('legal', 'drive',    'optional', 'Cloud Storage',              'accepted'),
  ('legal', 'tasks',    'optional', 'Task Management',            'accepted')
ON CONFLICT (industry_key, app_id, capability_key) DO NOTHING;

-- ── Privacy & Data Protection → Ngao + ComplyOS + Sign ──

INSERT INTO industry_app_capabilities (industry_key, app_id, capability_key, capability_name, status)
VALUES
  ('privacy', 'ngao',     'core',     'Privacy & Data Protection', 'accepted'),
  ('privacy', 'complyos', 'optional', 'Compliance Management',     'accepted'),
  ('privacy', 'sign',     'optional', 'Document Signing',          'accepted'),
  ('privacy', 'contacts', 'optional', 'Contact Management',        'accepted'),
  ('privacy', 'drive',    'optional', 'Cloud Storage',             'accepted')
ON CONFLICT (industry_key, app_id, capability_key) DO NOTHING;

-- ── Logistics → Tuma + CargoTracker + HuduFreight ──

INSERT INTO industry_app_capabilities (industry_key, app_id, capability_key, capability_name, status)
VALUES
  ('logistics',    'tuma',         'core',     'Parcel & Courier Management', 'accepted'),
  ('logistics',    'cargotracker', 'optional', 'Cargo Visibility',            'accepted'),
  ('logistics',    'finops',       'optional', 'Financial Management',        'accepted'),
  ('logistics',    'contacts',     'optional', 'Contact Management',          'accepted'),
  ('logistics',    'sms',          'optional', 'Bulk SMS',                    'accepted')
ON CONFLICT (industry_key, app_id, capability_key) DO NOTHING;

-- Add 'logistics' to industry_registry if not already present
INSERT INTO industry_registry (key, name, description, status)
VALUES ('logistics', 'Logistics & Courier', 'Parcel courier, freight forwarding, last-mile delivery', 'accepted')
ON CONFLICT (key) DO NOTHING;

-- ── Automotive → Gereji + FinOps + Inventory ──

INSERT INTO industry_app_capabilities (industry_key, app_id, capability_key, capability_name, status)
VALUES
  ('automotive', 'gereji',    'core',     'Workshop Management',   'accepted'),
  ('automotive', 'finops',    'optional', 'Financial Management',  'accepted'),
  ('automotive', 'inventory', 'optional', 'Inventory Management',  'accepted'),
  ('automotive', 'contacts',  'optional', 'Contact Management',    'accepted')
ON CONFLICT (industry_key, app_id, capability_key) DO NOTHING;
