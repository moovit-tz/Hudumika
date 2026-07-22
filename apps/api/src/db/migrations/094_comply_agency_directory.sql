-- ============================================================
-- 094 — ComplyOS: agency directory (real data backing the
--        Agencies page, currently hardcoded in the frontend)
--        + reminders (free-text calendar reminders not tied
--        to an existing obligation/certificate)
-- ============================================================

-- ── Agency directory ─────────────────────────────────────────
-- Global reference table (no tenant_id) — same convention as
-- icd_directory / clearing_agents_registry / carrier_directory.
CREATE TABLE comply_agency_directory (
  code          TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL,
  category      TEXT        NOT NULL, -- Corporate | Tax | Social Security | Regulatory | Financial
  agency_class  TEXT        NOT NULL DEFAULT 'gov', -- gov | tax | social | reg | fin
  website       TEXT,
  phone         TEXT,
  location      TEXT,
  obligations   JSONB       NOT NULL DEFAULT '[]', -- array of obligation label strings
  turnaround    TEXT,
  portal_type   TEXT        NOT NULL DEFAULT 'manual', -- api | portal | manual | legal_firm
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO comply_agency_directory (code, name, category, agency_class, website, phone, location, obligations, turnaround, portal_type) VALUES
('BRELA', 'Business Registration & Licensing Agency', 'Corporate', 'gov', 'www.brela.go.tz', '+255 22 218 0074', 'Dar es Salaam', '["Annual Business Licence","Annual Company Return","Company Incorporation"]', '5–15 business days', 'portal'),
('TRA',   'Tanzania Revenue Authority', 'Tax', 'tax', 'www.tra.go.tz', '+255 22 211 9591', 'Dar es Salaam', '["TIN Registration","VAT","PAYE","Corporate Tax","Tax Compliance Cert."]', '3–10 business days', 'portal'),
('NSSF',  'National Social Security Fund', 'Social Security', 'social', 'www.nssf.or.tz', '+255 22 211 4887', 'Dar es Salaam', '["Employer Registration","Monthly Contributions","Annual Return"]', '3–7 business days', 'portal'),
('WCF',   'Workers Compensation Fund', 'Social Security', 'social', 'www.wcf.go.tz', '+255 22 213 0330', 'Dar es Salaam', '["Employer Registration","Annual Renewal","Claims Processing"]', '5–10 business days', 'manual'),
('NHIF',  'National Health Insurance Fund', 'Social Security', 'social', 'www.nhif.or.tz', '+255 22 212 0290', 'Dar es Salaam', '["Employer Registration","Monthly Contributions"]', '3–7 business days', 'portal'),
('OSHA',  'Occupational Safety & Health Authority', 'Regulatory', 'reg', 'www.osha.go.tz', '+255 22 213 0400', 'Dar es Salaam', '["Workplace Safety Certificate","Factory Inspection","Safety Audit"]', '10–20 business days', 'manual'),
('TBS',   'Tanzania Bureau of Standards', 'Regulatory', 'reg', 'www.tbs.go.tz', '+255 22 245 0206', 'Dar es Salaam', '["Import/Export Permit","Product Standards","Conformity Assessment"]', '7–14 business days', 'portal'),
('TFDA',  'Tanzania Food & Drugs Authority', 'Regulatory', 'reg', 'www.tfda.go.tz', '+255 22 245 0512', 'Dar es Salaam', '["Product Registration","Import Permit","Facility Licence"]', '30–90 business days', 'portal'),
('CMSA',  'Capital Markets & Securities Authority', 'Financial', 'fin', 'www.cmsa.go.tz', '+255 22 211 1723', 'Dar es Salaam', '["Dealer Licence","Investment Adviser Licence","CIS Licence"]', '30–60 business days', 'legal_firm'),
('BOT',   'Bank of Tanzania', 'Financial', 'fin', 'www.bot.go.tz', '+255 22 223 4021', 'Dar es Salaam', '["Banking Licence","Foreign Exchange Licence","Mobile Money Licence"]', '60–180 business days', 'legal_firm');

-- ── Reminders ─────────────────────────────────────────────────
-- Free-text calendar reminders not tied to an existing obligation
-- or certificate row (those already surface on the calendar via
-- comply_obligations.due_date / comply_certificates.expiry_date).
CREATE TABLE comply_reminders (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  agency_code  TEXT,
  remind_date  DATE        NOT NULL,
  notes        TEXT,
  created_by   TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comply_reminders_tenant ON comply_reminders (tenant_id, remind_date);
