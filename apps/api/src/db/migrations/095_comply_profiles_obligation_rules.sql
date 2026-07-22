-- ============================================================
-- 095 — ComplyOS: compliance profile + obligation rules table
--        (AI Obligation Scan — PRD Phase 1). Data-driven per
--        jurisdiction/sector so KE/UG/RW expansion is a data
--        exercise, not a rebuild.
-- ============================================================

-- ── Compliance profile ───────────────────────────────────────
-- One row per tenant. Drives the obligation scan below.
CREATE TABLE comply_profiles (
  tenant_id            TEXT        PRIMARY KEY,
  sector               TEXT        NOT NULL,
  sub_sector           TEXT,
  ownership_structure  TEXT,
  employee_band        TEXT,
  jurisdiction         TEXT        NOT NULL DEFAULT 'TZ',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Obligation rules ──────────────────────────────────────────
-- Global reference table (no tenant_id). sector = NULL means the
-- obligation applies regardless of sector (e.g. TIN registration).
CREATE TABLE comply_obligation_rules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction     TEXT        NOT NULL DEFAULT 'TZ',
  sector           TEXT,
  agency_code      TEXT        NOT NULL,
  obligation_code  TEXT        NOT NULL,
  name             TEXT        NOT NULL,
  frequency        TEXT        NOT NULL, -- Annual | Monthly | Semi-annual | Once
  mandatory        BOOLEAN     NOT NULL DEFAULT true,
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX comply_obligation_rules_key ON comply_obligation_rules (jurisdiction, obligation_code);
CREATE INDEX comply_obligation_rules_sector ON comply_obligation_rules (jurisdiction, sector);

-- Sector-agnostic (applies to every business regardless of sector)
INSERT INTO comply_obligation_rules (jurisdiction, sector, agency_code, obligation_code, name, frequency, mandatory, description) VALUES
('TZ', NULL, 'BRELA', 'OB-BRELA-INC',     'Company Incorporation',       'Once',   true,  'Register the business entity with BRELA before trading.'),
('TZ', NULL, 'BRELA', 'OB-BRELA-RETURN',  'Annual Company Return',       'Annual', true,  'File the annual return to keep the company in good standing.'),
('TZ', NULL, 'TRA',   'OB-TRA-TIN',       'TIN Registration',            'Once',   true,  'Register for a Taxpayer Identification Number.'),
('TZ', NULL, 'TRA',   'OB-TRA-VAT',       'VAT Registration & Filing',   'Monthly', true, 'Register for VAT once turnover crosses the threshold; file monthly VAT returns.'),
('TZ', NULL, 'TRA',   'OB-TRA-TCC',       'Tax Compliance Certificate',  'Annual', true,  'Annual tax compliance certificate, often required for tenders and licence renewals.'),
('TZ', NULL, 'NSSF',  'OB-NSSF-REG',      'Employer Registration',       'Once',   true,  'Register as an employer with NSSF before hiring staff.'),
('TZ', NULL, 'NSSF',  'OB-NSSF-CONTRIB',  'Monthly Contributions',       'Monthly', true, 'Remit monthly employer + employee social security contributions.'),
('TZ', NULL, 'WCF',   'OB-WCF-REG',       'Employer Registration',       'Once',   true,  'Register as an employer with the Workers Compensation Fund.'),
('TZ', NULL, 'NHIF',  'OB-NHIF-REG',      'Employer Registration',       'Once',   true,  'Register as an employer with the National Health Insurance Fund.');

-- Manufacturing
INSERT INTO comply_obligation_rules (jurisdiction, sector, agency_code, obligation_code, name, frequency, mandatory, description) VALUES
('TZ', 'manufacturing', 'OSHA', 'OB-OSHA-SAFETY',  'Workplace Safety Certificate', 'Annual', true,  'Factory inspection and workplace safety certification for manufacturing premises.'),
('TZ', 'manufacturing', 'TBS',  'OB-TBS-STANDARDS','Product Standards Mark',       'Annual', true,  'Product conformity assessment / standards mark for manufactured goods.'),
('TZ', 'manufacturing', 'TFDA', 'OB-TFDA-FACILITY','Facility Licence',             'Annual', false, 'Facility licence — mandatory only where the manufactured goods are food, drugs, or medical devices.');

-- Import / Export
INSERT INTO comply_obligation_rules (jurisdiction, sector, agency_code, obligation_code, name, frequency, mandatory, description) VALUES
('TZ', 'import_export', 'TBS',  'OB-TBS-IMPORT',    'Import/Export Permit',    'Once',   true,  'Import or export permit for regulated goods categories.'),
('TZ', 'import_export', 'TFDA', 'OB-TFDA-IMPORT',   'Import Permit',           'Once',   false, 'Import permit — mandatory only for food, drug, or medical device shipments.');

-- Food / Agri-export
INSERT INTO comply_obligation_rules (jurisdiction, sector, agency_code, obligation_code, name, frequency, mandatory, description) VALUES
('TZ', 'food_agri', 'TFDA', 'OB-TFDA-PRODREG', 'Product Registration', 'Once', true, 'Register each food/agricultural product before sale or export.'),
('TZ', 'food_agri', 'TBS',  'OB-TBS-CONFORM',  'Conformity Assessment', 'Annual', true, 'Annual conformity assessment for food/agri-export products.');

-- Financial services
INSERT INTO comply_obligation_rules (jurisdiction, sector, agency_code, obligation_code, name, frequency, mandatory, description) VALUES
('TZ', 'financial_services', 'CMSA', 'OB-CMSA-LICENCE', 'Dealer / Adviser Licence', 'Annual', true, 'Capital markets dealer or investment adviser licence — typically routed via legal counsel.'),
('TZ', 'financial_services', 'BOT',  'OB-BOT-LICENCE',  'Banking / FX Licence',     'Annual', true, 'Banking, foreign exchange, or mobile money licence — typically routed via legal counsel.');

-- Health
INSERT INTO comply_obligation_rules (jurisdiction, sector, agency_code, obligation_code, name, frequency, mandatory, description) VALUES
('TZ', 'health', 'TFDA', 'OB-TFDA-HEALTHFAC', 'Facility Licence', 'Annual', true, 'Facility licence for clinics, pharmacies, and health product distributors.');
