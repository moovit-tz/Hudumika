-- Whether the business may charge VAT at all.
--
-- Everything built so far assumes the tenant is registered. `ensureTaxCodes`
-- seeds a STANDARD code at 18% for every workspace regardless, the classify
-- screen offers it, and the return computes output tax from it. Nothing
-- anywhere asks the prior question: is this business VAT-registered?
--
-- It matters more than the rest of it. An unregistered business must not charge
-- VAT — doing so is collecting tax it has no authority to collect. And it
-- reframes this deployment's data completely: no tenant here has a VRN, and
-- `tra_vfd_config` is empty, so the 42 sales lines sitting at 0% are very
-- probably correct rather than mis-rated. Without this table there was no way
-- to tell the difference between "0% because zero-rated" and "0% because we are
-- not registered", which are different facts with different consequences.
--
-- Three states, not two, in keeping with the rest of this work: an absent row
-- means *unknown*, not *unregistered*. Unknown warns; only an explicit
-- 'not_registered' asserts.

CREATE TABLE IF NOT EXISTS tax_registrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- ISO 3166-1 alpha-2, matching tax_codes.jurisdiction. A business operating
  -- in three countries is registered (or not) in each one separately.
  jurisdiction  CHAR(2) NOT NULL,

  -- 'VAT' nearly everywhere in Africa; 'GST' and 'SALES_TAX' exist elsewhere.
  regime        VARCHAR(16) NOT NULL DEFAULT 'VAT',

  status        VARCHAR(20) NOT NULL,

  -- The number itself. Called a VRN in Tanzania, a PIN in Kenya, a TIN in
  -- Nigeria and Ghana — the label comes from tax_jurisdictions so the form can
  -- ask for it by the name the taxpayer actually knows.
  registration_number VARCHAR(64),

  -- Why they are registered, which is not always turnover: Tanzania requires
  -- professional service providers, government entities carrying on economic
  -- activity, intending traders and non-resident digital suppliers to register
  -- with no threshold at all.
  basis         VARCHAR(24),

  registered_from DATE,
  registered_to   DATE,

  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tax_registrations DROP CONSTRAINT IF EXISTS tax_registrations_status_valid;
ALTER TABLE tax_registrations ADD CONSTRAINT tax_registrations_status_valid
  CHECK (status IN ('registered', 'not_registered', 'pending', 'deregistered'));

ALTER TABLE tax_registrations DROP CONSTRAINT IF EXISTS tax_registrations_basis_valid;
ALTER TABLE tax_registrations ADD CONSTRAINT tax_registrations_basis_valid
  CHECK (basis IS NULL OR basis IN (
    'THRESHOLD', 'PROFESSION', 'VOLUNTARY', 'GOVERNMENT', 'NON_RESIDENT_DIGITAL', 'INTENDING_TRADER'
  ));

ALTER TABLE tax_registrations DROP CONSTRAINT IF EXISTS tax_registrations_jurisdiction_iso3166;
ALTER TABLE tax_registrations ADD CONSTRAINT tax_registrations_jurisdiction_iso3166
  CHECK (jurisdiction ~ '^[A-Z]{2}$');

-- A registered status without a number is not a registration, it is a claim.
ALTER TABLE tax_registrations DROP CONSTRAINT IF EXISTS tax_registrations_registered_has_number;
ALTER TABLE tax_registrations ADD CONSTRAINT tax_registrations_registered_has_number
  CHECK (status <> 'registered' OR (registration_number IS NOT NULL AND length(trim(registration_number)) > 0));

ALTER TABLE tax_registrations DROP CONSTRAINT IF EXISTS tax_registrations_dates_ordered;
ALTER TABLE tax_registrations ADD CONSTRAINT tax_registrations_dates_ordered
  CHECK (registered_to IS NULL OR registered_from IS NULL OR registered_to >= registered_from);

CREATE UNIQUE INDEX IF NOT EXISTS tax_registrations_tenant_juris_uq
  ON tax_registrations (tenant_id, jurisdiction, regime);


-- ---------------------------------------------------------------------------
-- Reference data, so onboarding a country is data rather than code.
-- ---------------------------------------------------------------------------
-- Deliberately NOT authoritative. Rates and thresholds change every budget —
-- Ghana's threshold moved from GH¢200k to GH¢750k for 2026, Uganda's from
-- UGX 150m to 250m, Nigeria's from ₦25m to ₦50m — so every row carries the date
-- it was checked and where it came from. This exists to prefill an onboarding
-- form and to warn when a tenant's own settings look far from the local norm.
-- The tenant's own tax_codes and tax_registrations remain the truth.
CREATE TABLE IF NOT EXISTS tax_jurisdictions (
  code            CHAR(2) PRIMARY KEY,
  name            VARCHAR(64) NOT NULL,
  regime          VARCHAR(16) NOT NULL DEFAULT 'VAT',
  currency        CHAR(3),

  standard_rate   NUMERIC(6,3),

  -- Threshold in the local currency, over a rolling window. Null where the
  -- country has no turnover threshold or it could not be confirmed.
  threshold_amount          NUMERIC(18,2),
  threshold_window_months   SMALLINT,
  /** A second, shorter window some regimes apply in parallel (Tanzania). */
  threshold_alt_amount      NUMERIC(18,2),
  threshold_alt_window_months SMALLINT,

  -- What the taxpayer calls their number, and the fiscalisation system they
  -- must submit through. Both differ per country and both are needed before a
  -- tenant in that country can be onboarded properly.
  registration_label  VARCHAR(32),
  fiscalisation      VARCHAR(32),

  as_of           DATE NOT NULL,
  source          TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tax_jurisdictions IS
  'Reference data for onboarding, not a source of truth. Every row carries '
  'as_of and source because rates and thresholds change each budget cycle.';

INSERT INTO tax_jurisdictions
  (code, name, regime, currency, standard_rate,
   threshold_amount, threshold_window_months, threshold_alt_amount, threshold_alt_window_months,
   registration_label, fiscalisation, as_of, source)
VALUES
  ('TZ', 'Tanzania', 'VAT', 'TZS', 18.000,
   200000000, 12, 100000000, 6,
   'VRN', 'TRA EFDMS / VFD', DATE '2026-08-08',
   'TRA; PwC Worldwide Tax Summaries. Professional service providers, government entities carrying on economic activity, intending traders and non-resident digital suppliers register with no threshold.'),
  ('KE', 'Kenya', 'VAT', 'KES', 16.000,
   5000000, 12, NULL, NULL,
   'KRA PIN', 'KRA eTIMS', DATE '2026-08-08', 'KRA; Avalara country guide.'),
  ('UG', 'Uganda', 'VAT', 'UGX', 18.000,
   250000000, 12, NULL, NULL,
   'TIN', 'URA EFRIS', DATE '2026-08-08',
   'URA; PwC Uganda. Threshold raised from UGX 150m effective 1 July 2026.'),
  ('RW', 'Rwanda', 'VAT', 'RWF', 18.000,
   20000000, 12, NULL, NULL,
   'TIN', 'RRA EBM', DATE '2026-08-08', 'RRA; PwC Worldwide Tax Summaries.'),
  ('NG', 'Nigeria', 'VAT', 'NGN', 7.500,
   50000000, 12, NULL, NULL,
   'TIN', 'FIRS e-invoicing', DATE '2026-08-08',
   'Nigeria Tax Act 2025 raised the threshold from NGN 25m. Small companies (turnover <= NGN 100m and assets <= NGN 250m) do not charge VAT.'),
  ('GH', 'Ghana', 'VAT', 'GHS', 15.000,
   750000, 12, NULL, NULL,
   'TIN', 'GRA E-VAT', DATE '2026-08-08',
   'GRA; 2026 budget raised the threshold from GHS 200,000. NHIL/GETFund/COVID levies stack on top of the 15% base - the effective consumer rate is nearer 20%, which a single rate cannot express.'),
  ('ZA', 'South Africa', 'VAT', 'ZAR', 15.000,
   1000000, 12, NULL, NULL,
   'VAT number', 'SARS eFiling', DATE '2026-08-08', 'SARS.'),
  ('ZM', 'Zambia', 'VAT', 'ZMW', 16.000,
   NULL, 12, NULL, NULL,
   'TPIN', 'ZRA Smart Invoice', DATE '2026-08-08', 'ZRA VAT Liability Guide.')
ON CONFLICT (code) DO NOTHING;
