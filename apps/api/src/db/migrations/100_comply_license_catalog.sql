-- ============================================================
-- 100 — ComplyOS: business licence fee catalogue + application
--        linkage. Global reference table (no tenant_id) — same
--        convention as comply_agency_directory / comply_legal_firms —
--        transcribed from Tanzania's Business Licensing Act fee
--        schedule (37 business categories, principal + sub-licence
--        fees, TZS/USD as printed in the source schedule).
-- ============================================================

CREATE TABLE comply_license_catalog (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 TEXT        NOT NULL UNIQUE, -- stable natural key, e.g. '02-03-foreign'
  sn                   INT         NOT NULL,         -- source S/N (business category number, 1-37)
  category             TEXT        NOT NULL,         -- e.g. 'Agency Business'
  description          TEXT        NOT NULL,         -- e.g. 'Commission Agent'
  tier                 TEXT,                         -- e.g. 'Local', 'Foreign owned', 'City / Municipal'
  principal_fee        NUMERIC,
  principal_currency   TEXT        NOT NULL DEFAULT 'TZS',
  subsidiary_fee       NUMERIC,
  subsidiary_currency  TEXT        NOT NULL DEFAULT 'TZS',
  notes                TEXT,                         -- e.g. 'plus 2,000/= per bedroom', '25% of respective fee'
  -- Generic, editable document checklist shown at application time.
  -- The source fee schedule does not itself list required documents —
  -- this is a general starting checklist by licence category, not a
  -- verified official requirements list. Applicants can edit per case.
  requirements         JSONB       NOT NULL DEFAULT '[]',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comply_license_catalog_category ON comply_license_catalog (category);
CREATE INDEX comply_license_catalog_sn       ON comply_license_catalog (sn);

-- Applications can optionally originate from a catalogue entry.
ALTER TABLE comply_applications
  ADD COLUMN license_catalog_id UUID REFERENCES comply_license_catalog(id);

-- Local Government Authorities issue Business Licensing Act licences
-- (Ministry of Trade business-licensing division, via City/Municipal/
-- District Councils) — distinct from BRELA (company registration).
-- No public API exists for this, same honest 'manual' channel as the
-- other portal-less agencies already in this directory.
INSERT INTO comply_agency_directory (code, name, category, agency_class, website, phone, location, obligations, turnaround, portal_type) VALUES
('LGA', 'Local Government Authority (Business Licensing)', 'Corporate', 'gov', 'www.tamisemi.go.tz', NULL, 'City/Municipal/District Councils', '["Business Licence (Business Licensing Act)","Licence Renewal","Licence Transfer Endorsement","Duplicate Licence"]', 'Varies by council', 'manual')
ON CONFLICT (code) DO NOTHING;
