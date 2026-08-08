-- More of the continent, so signing up from one of them is configuration
-- rather than a code change.
--
-- The eight seeded in 187 covered where the product is aimed. These are the
-- rest of the likely near-term ones, plus the North African markets, so that a
-- registration from any of them lands on its own rate and its own vocabulary
-- instead of Tanzania's.
--
-- Same rules as before: reference only, every row dated and sourced, and the
-- tenant's own tax_codes remain the truth. Rates move; this is a starting point
-- for onboarding and a sanity check afterwards, not an authority.
--
-- Thresholds are left null where a reliable current figure could not be
-- confirmed. Null means "not known", and the onboarding form says so — it does
-- not mean "no threshold", which for several of these would be wrong.

INSERT INTO tax_jurisdictions
  (code, name, regime, currency, standard_rate,
   threshold_amount, threshold_window_months, registration_label, fiscalisation, as_of, source)
VALUES
  ('SD', 'Sudan',         'VAT', 'SDG', 17.000, NULL, 12, 'Tax Registration No.', NULL,
   DATE '2026-08-08', 'TaxAtlas; iCalculator. Registration is required of most businesses rather than above a turnover threshold.'),
  ('SS', 'South Sudan',   'VAT', 'SSP', NULL,   NULL, 12, 'TIN', NULL,
   DATE '2026-08-08', 'TaxAtlas. Rate not confirmed at seeding — left null rather than guessed.'),
  ('EG', 'Egypt',         'VAT', 'EGP', 14.000, NULL, 12, 'Tax Registration No.', 'ETA e-invoicing',
   DATE '2026-08-08', 'VATupdate global rates 2026.'),
  ('MA', 'Morocco',       'VAT', 'MAD', 20.000, NULL, 12, 'IF / ICE', NULL,
   DATE '2026-08-08', 'VATupdate global rates 2026. Reduced rates of 7%, 10% and 14% also apply.'),
  ('CI', 'Cote d''Ivoire','VAT', 'XOF', 18.000, NULL, 12, 'Numero de compte contribuable', NULL,
   DATE '2026-08-08', 'PwC Worldwide Tax Summaries.'),
  ('SN', 'Senegal',       'VAT', 'XOF', 18.000, NULL, 12, 'NINEA', NULL,
   DATE '2026-08-08', 'PwC Worldwide Tax Summaries.'),
  ('ET', 'Ethiopia',      'VAT', 'ETB', NULL,   NULL, 12, 'TIN', NULL,
   DATE '2026-08-08', 'Rate not confirmed at seeding — left null rather than guessed.'),
  ('MW', 'Malawi',        'VAT', 'MWK', NULL,   NULL, 12, 'TPIN', NULL,
   DATE '2026-08-08', 'Rate not confirmed at seeding — left null rather than guessed.'),
  ('MZ', 'Mozambique',    'VAT', 'MZN', NULL,   NULL, 12, 'NUIT', NULL,
   DATE '2026-08-08', 'Rate not confirmed at seeding — left null rather than guessed.'),
  ('BI', 'Burundi',       'VAT', 'BIF', NULL,   NULL, 12, 'TIN', NULL,
   DATE '2026-08-08', 'Rate not confirmed at seeding — left null rather than guessed.'),
  ('CD', 'DR Congo',      'VAT', 'CDF', NULL,   NULL, 12, 'NIF', NULL,
   DATE '2026-08-08', 'Rate not confirmed at seeding — left null rather than guessed.')
ON CONFLICT (code) DO NOTHING;

-- Whether a jurisdiction's tax codes should carry TRA's EFDMS fields at all.
-- They are Tanzanian: a Kenyan or Ghanaian code has no TAXCODE and no VATRATE,
-- and seeding them one was quietly asserting Tanzania everywhere.
ALTER TABLE tax_jurisdictions
  ADD COLUMN IF NOT EXISTS uses_tra_codes BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE tax_jurisdictions SET uses_tra_codes = TRUE WHERE code = 'TZ';

COMMENT ON COLUMN tax_jurisdictions.uses_tra_codes IS
  'True only for Tanzania. tax_codes.tra_tax_code / tra_vat_rate are EFDMS '
  'fields and are meaningless anywhere else.';
