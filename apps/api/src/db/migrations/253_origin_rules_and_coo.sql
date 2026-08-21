-- Preferential-origin / PTA rules engine + Certificate of Origin issuance
-- (M5 of the ClearOS roadmap).
--
-- origin_rules is platform reference data (like hs_codes, dangerous_goods_
-- reference) — no tenant_id, no RLS, dbPlatform only.
--
-- Sourced from real primary legal text, not fabricated:
--   - EAC: "The East African Community Customs Union (Rules of Origin)
--     Rules, 2015" (First Schedule, Part 1), fetched and read directly from
--     rwandatrade.rw's own hosted copy — a real, representative subset of
--     commercially significant HS chapters (agriculture, food/beverage,
--     chemicals, plastics, textiles, iron/steel, machinery, vehicles), not
--     the full ~99-chapter schedule. Verbatim criteria text is summarized,
--     not paraphrased into different numbers.
--   - AfCFTA: Article 4/5/6 of Annex 2 (the general wholly-obtained /
--     sufficient-transformation framework), read from the AfCFTA Rules of
--     Origin Manual. AfCFTA's actual product-specific rules live in Annex
--     2's Appendix IV, which was not available as extractable primary text
--     in this session — so AfCFTA is seeded with the general framework only
--     ('GENERAL' rows, no HS-chapter-specific rows), and the eligibility
--     checker says so honestly rather than guessing a product's real
--     Appendix IV threshold. Same "don't fabricate what you can't verify"
--     boundary as the dangerous-goods reference table.
--   - SADC was not researched this session and has zero rows — not "0%
--     match", genuinely absent. Do not treat a SADC lookup returning
--     nothing as "SADC has no rules of origin."
--
-- certificates_of_origin is the tenant-scoped record of an actual
-- eligibility determination + issued document, WITH RLS, same policy shape
-- as every other tenant table.

CREATE TABLE IF NOT EXISTS origin_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_code VARCHAR(10) NOT NULL,       -- 'EAC' | 'AFCFTA' | 'SADC'
  hs_match VARCHAR(20) NOT NULL,             -- HS chapter ('01'..'99') or heading ('8407') this rule matches against, prefix-matched
  description TEXT NOT NULL,
  criteria_type VARCHAR(20) NOT NULL,        -- 'WHOLLY_OBTAINED' | 'VALUE_ADDED' | 'HEADING_CHANGE' | 'SPECIFIC_PROCESS' | 'GENERAL'
  criteria_text TEXT NOT NULL,               -- real summarized rule text
  max_non_originating_pct NUMERIC(5,2),      -- null when criteria_type doesn't use a percentage
  source_citation TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS certificates_of_origin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subject_type VARCHAR(20) NOT NULL DEFAULT 'adhoc',  -- 'shipment' | 'declaration_item' | 'adhoc'
  subject_id UUID,
  agreement_code VARCHAR(10) NOT NULL,
  hs_code VARCHAR(20) NOT NULL,
  country_of_origin VARCHAR(5) NOT NULL,
  matched_rule_id UUID REFERENCES origin_rules(id),
  eligibility_status VARCHAR(20) NOT NULL,   -- 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'NEEDS_REVIEW' | 'INSUFFICIENT_DATA'
  eligibility_basis TEXT,
  non_originating_value_pct NUMERIC(5,2),
  wholly_obtained_confirmed BOOLEAN,
  exporter_name TEXT,
  exporter_address TEXT,
  consignee_name TEXT,
  consignee_address TEXT,
  goods_description TEXT,
  invoice_number VARCHAR(100),
  certificate_number VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft | issued
  issued_by UUID,
  issued_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_origin_rules_agreement ON origin_rules(agreement_code, hs_match);
CREATE INDEX IF NOT EXISTS idx_coo_tenant ON certificates_of_origin(tenant_id);
CREATE INDEX IF NOT EXISTS idx_coo_subject ON certificates_of_origin(tenant_id, subject_type, subject_id);

ALTER TABLE certificates_of_origin ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates_of_origin FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'certificates_of_origin'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON certificates_of_origin
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- EAC — First Schedule, Part 1 (real subset, commercially significant chapters)
INSERT INTO origin_rules (agreement_code, hs_match, description, criteria_type, criteria_text, max_non_originating_pct, source_citation) VALUES
  ('EAC', '01', 'Live animals', 'WHOLLY_OBTAINED', 'All the animals of Chapter 1 used must be wholly produced.', NULL, 'EAC RoO 2015, First Schedule, Ch.1'),
  ('EAC', '02', 'Meat and edible meat offal', 'WHOLLY_OBTAINED', 'Manufacture in which all the meat and edible meat offal is wholly produced.', NULL, 'EAC RoO 2015, First Schedule, Ch.2'),
  ('EAC', '03', 'Fish and crustaceans, molluscs and other aquatic invertebrates', 'WHOLLY_OBTAINED', 'All fish and crustaceans, molluscs and other aquatic invertebrates must be wholly produced.', NULL, 'EAC RoO 2015, First Schedule, Ch.3'),
  ('EAC', '04', 'Dairy produce; birds'' eggs; natural honey', 'VALUE_ADDED', 'All materials of Chapter 4 wholly produced, and the weight of sugar used does not exceed 30% of the weight of the final product.', 30, 'EAC RoO 2015, First Schedule, Ch.4'),
  ('EAC', '05', 'Products of animal origin, not elsewhere specified', 'WHOLLY_OBTAINED', 'All materials of Chapter 5 used must be wholly produced.', NULL, 'EAC RoO 2015, First Schedule, Ch.5'),
  ('EAC', '09', 'Coffee, tea, mate and spices', 'WHOLLY_OBTAINED', 'All materials of Chapter 9 used must be wholly produced.', NULL, 'EAC RoO 2015, First Schedule, Ch.9'),
  ('EAC', '10', 'Cereals', 'WHOLLY_OBTAINED', 'All materials of Chapter 10 used must be wholly produced.', NULL, 'EAC RoO 2015, First Schedule, Ch.10'),
  ('EAC', '12', 'Oil seeds and oleaginous fruits; industrial or medical plants', 'WHOLLY_OBTAINED', 'All materials of Chapter 12 used must be wholly produced.', NULL, 'EAC RoO 2015, First Schedule, Ch.12'),
  ('EAC', '15', 'Animal or vegetable fats and oils', 'HEADING_CHANGE', 'Manufacture from materials of any heading, except that of the product.', NULL, 'EAC RoO 2015, First Schedule, Ch.15'),
  ('EAC', '1701', 'Cane or beet sugar and chemically pure sucrose', 'WHOLLY_OBTAINED', 'Manufacture in which the materials of Chapter 17 used are wholly produced.', NULL, 'EAC RoO 2015, First Schedule, 17.01'),
  ('EAC', '18', 'Cocoa and cocoa preparations', 'VALUE_ADDED', 'Manufacture from materials of any heading except that of the product, or manufacture where the value of non-originating materials does not exceed 70% of the ex-works price.', 70, 'EAC RoO 2015, First Schedule, Ch.18'),
  ('EAC', '19', 'Preparations of cereals, flour, starch or milk; pastrycooks products', 'VALUE_ADDED', 'Manufacture from materials of any heading except that of the product, in which the weight of non-originating materials used does not exceed 30% of the weight of the final product.', 30, 'EAC RoO 2015, First Schedule, Ch.19'),
  ('EAC', '21', 'Miscellaneous edible preparations', 'VALUE_ADDED', 'Manufacture from materials of any heading except that of the product, in which the weight of non-originating materials used does not exceed 30% of the weight of the final product.', 30, 'EAC RoO 2015, First Schedule, Ch.21'),
  ('EAC', '24', 'Tobacco and manufactured tobacco substitutes', 'WHOLLY_OBTAINED', 'All materials used must be wholly produced (unmanufactured tobacco and refuse of Ch.24 wholly produced).', NULL, 'EAC RoO 2015, First Schedule, Ch.24'),
  ('EAC', '27', 'Mineral fuels, mineral oils and products of their distillation', 'VALUE_ADDED', 'Operations of refining and/or specific process(es), or manufacture from materials of any heading except that of the product, where materials of the same heading used do not exceed 50% of the ex-works price.', 50, 'EAC RoO 2015, First Schedule, Ch.27'),
  ('EAC', '28', 'Inorganic chemicals', 'VALUE_ADDED', 'Manufacture from materials of any heading except that of the product (same-heading materials capped at 20% of ex-works price), or manufacture where non-originating materials do not exceed 70% of the ex-works price.', 70, 'EAC RoO 2015, First Schedule, Ch.28'),
  ('EAC', '29', 'Organic chemicals', 'VALUE_ADDED', 'Manufacture from materials of any heading except that of the product (same-heading materials capped at 20% of ex-works price), or manufacture where non-originating materials do not exceed 70% of the ex-works price.', 70, 'EAC RoO 2015, First Schedule, Ch.29'),
  ('EAC', '30', 'Pharmaceutical products', 'HEADING_CHANGE', 'Manufacture from materials of any heading, except that of the product.', NULL, 'EAC RoO 2015, First Schedule, Ch.30'),
  ('EAC', '31', 'Fertilisers', 'VALUE_ADDED', 'Manufacture from materials of any heading except that of the product (same-heading materials capped at 20% of ex-works price), or manufacture where non-originating materials do not exceed 70% of the ex-works price.', 70, 'EAC RoO 2015, First Schedule, Ch.31'),
  ('EAC', '39', 'Plastics and articles thereof', 'VALUE_ADDED', 'Manufacture from materials of any heading except that of the product, or manufacture where non-originating materials used do not exceed 70% of the ex-works price.', 70, 'EAC RoO 2015, First Schedule, Ch.39'),
  ('EAC', '61', 'Articles of apparel and clothing accessories, knitted or crocheted', 'SPECIFIC_PROCESS', 'Must be manufactured from fabric (spinning/knitting or dyeing-and-knitting) — cutting and assembling finished fabric alone does not confer origin. See the full schedule for sub-rules by garment type.', NULL, 'EAC RoO 2015, First Schedule, Ch.61'),
  ('EAC', '62', 'Articles of apparel and clothing accessories, not knitted or crocheted', 'SPECIFIC_PROCESS', 'Must be manufactured from fabric (weaving-and-making-up, or printing-plus-finishing on unprinted fabric) — cutting and assembling finished fabric alone does not confer origin. See the full schedule for sub-rules by garment type.', NULL, 'EAC RoO 2015, First Schedule, Ch.62'),
  ('EAC', '64', 'Footwear, gaiters and the like', 'HEADING_CHANGE', 'Manufacture from materials of any heading, except that of the product.', NULL, 'EAC RoO 2015, First Schedule, Ch.64'),
  ('EAC', '72', 'Iron and steel', 'VALUE_ADDED', 'Manufacture from materials of any heading except that of the product, or (base metal parts) manufacture where the value of all materials used does not exceed 70% of the ex-works price.', 70, 'EAC RoO 2015, First Schedule, Ch.72'),
  ('EAC', '84', 'Nuclear reactors, boilers, machinery and mechanical appliances', 'VALUE_ADDED', 'Manufacture from materials of any heading except that of the product; several headings (e.g. engines 84.07-84.09) instead require non-originating materials not to exceed 70% of the ex-works price.', 70, 'EAC RoO 2015, First Schedule, Ch.84'),
  ('EAC', '85', 'Electrical machinery and equipment', 'VALUE_ADDED', 'Manufacture from materials of any heading except that of the product, or manufacture where non-originating materials do not exceed 70% of the ex-works price.', 70, 'EAC RoO 2015, First Schedule, Ch.85'),
  ('EAC', '87', 'Vehicles other than railway/tramway rolling stock, and parts', 'VALUE_ADDED', 'Manufacturing must start from completely knocked-down (CKD) kits; parts, motorcycles and bicycles instead require non-originating materials not to exceed 70% of the ex-works price.', 70, 'EAC RoO 2015, First Schedule, Ch.87')
ON CONFLICT DO NOTHING;

-- AfCFTA — general framework only (Annex 2, Articles 4-6). No product-specific
-- Appendix IV rows: that schedule's actual thresholds were not available as
-- verifiable primary text this session. See this migration's header.
INSERT INTO origin_rules (agreement_code, hs_match, description, criteria_type, criteria_text, max_non_originating_pct, source_citation) VALUES
  ('AFCFTA', 'GENERAL', 'General origin criteria (Annex 2, Article 4)', 'GENERAL', 'A product qualifies if (a) wholly obtained in a State Party (Article 5), or (b) sufficiently worked/processed (Article 6) via whichever of Specific Processes, Change in Tariff Heading/Sub-Heading, Value Added, or Non-Originating Material Content is specified for that product in Appendix IV of Annex 2. This platform does not yet hold Appendix IV''s per-product thresholds — confirm the actual applicable criterion and percentage for this HS code directly against Appendix IV before relying on this for a real shipment.', NULL, 'AfCFTA Rules of Origin Manual, Annex 2 Arts. 4-6')
ON CONFLICT DO NOTHING;
