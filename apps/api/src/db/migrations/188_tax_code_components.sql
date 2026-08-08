-- A tax code that is more than one tax.
--
-- Everything so far assumes one code carries one rate. That holds for Tanzania,
-- Kenya, Uganda, Rwanda and most of the continent. It does not hold for Ghana,
-- and it will not hold for the next regime that stacks a levy on a VAT base —
-- so this is the general mechanism rather than a Ghana special case.
--
-- Ghana is the worked example, and it is instructive because it changed:
--
--   Before 2026   NHIL 2.5% + GETFund 2.5% + COVID 1% were charged on the net
--                 value, and VAT 15% was then charged on (net + those levies).
--                 That compounding is what produced the 21.9% effective rate
--                 rather than 21%. None of the three levies could be reclaimed
--                 as input tax; only the VAT could.
--
--   From 1 Jan 2026  The COVID levy was abolished and NHIL and GETFund were
--                 re-coupled into the VAT base and made input-creditable. The
--                 combined rate is a flat 20% with no compounding.
--
-- Both shapes have to be expressible: the current one because it is the law
-- today, the old one because invoices issued under it still exist and a return
-- covering that period must reproduce them. Two knobs are enough for both:
--
--   basis        NET             charged on the line's net value
--                NET_PLUS_PRIOR  charged on net plus every earlier component,
--                                which is what compounding actually is
--   recoverable  whether this component may be reclaimed as input tax
--
-- Ghana 2026 is then three NET components, all recoverable, summing to 20%.
-- Ghana pre-2026 is three NET non-recoverable levies followed by one
-- NET_PLUS_PRIOR recoverable VAT, which arrives at 21.9% by construction rather
-- than by anyone typing 21.9 into a box.

CREATE TABLE IF NOT EXISTS tax_code_components (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_code_id   UUID NOT NULL REFERENCES tax_codes(id) ON DELETE CASCADE,

  -- Order matters: NET_PLUS_PRIOR compounds on everything before it.
  sequence      SMALLINT NOT NULL DEFAULT 0,

  code          VARCHAR(24) NOT NULL,     -- 'VAT', 'NHIL', 'GETFUND'
  name          VARCHAR(120) NOT NULL,
  rate          NUMERIC(6,3) NOT NULL,

  basis         VARCHAR(16) NOT NULL DEFAULT 'NET',

  -- A levy that cannot be reclaimed is a cost, not a receivable — the same
  -- distinction the purchase side already makes for blocked input tax, and it
  -- has to be per component because Ghana's answer differs between them
  -- depending on the year.
  recoverable   BOOLEAN NOT NULL DEFAULT TRUE,

  -- Optional: post this component somewhere other than the main VAT accounts,
  -- which is usually what a separately-remitted levy needs.
  gl_account_code VARCHAR(16),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tax_code_components DROP CONSTRAINT IF EXISTS tax_code_components_basis_valid;
ALTER TABLE tax_code_components ADD CONSTRAINT tax_code_components_basis_valid
  CHECK (basis IN ('NET', 'NET_PLUS_PRIOR'));

ALTER TABLE tax_code_components DROP CONSTRAINT IF EXISTS tax_code_components_rate_sane;
ALTER TABLE tax_code_components ADD CONSTRAINT tax_code_components_rate_sane
  CHECK (rate >= 0 AND rate < 100);

CREATE UNIQUE INDEX IF NOT EXISTS tax_code_components_code_seq_uq
  ON tax_code_components (tax_code_id, sequence);
CREATE INDEX IF NOT EXISTS tax_code_components_code_idx
  ON tax_code_components (tax_code_id);

COMMENT ON TABLE tax_code_components IS
  'Optional breakdown of a tax code into separately-named taxes. A code with no '
  'component rows is a single tax at tax_codes.rate — which is every code in '
  'every single-rate jurisdiction, so nothing existing changes.';
COMMENT ON COLUMN tax_code_components.basis IS
  'NET charges the line value; NET_PLUS_PRIOR charges net plus all earlier '
  'components, which is how a compounding levy stack works.';
COMMENT ON COLUMN tax_code_components.recoverable IS
  'Whether this component may be reclaimed as input tax. Ghana''s NHIL and '
  'GETFund were not reclaimable before 2026 and are now.';


-- ---------------------------------------------------------------------------
-- Ghana's reference row was written from pre-2026 information. Correct it.
-- ---------------------------------------------------------------------------
-- This is exactly what `as_of` and `source` exist for: the row seeded in
-- migration 187 described the old 15%-plus-stacked-levies position, which
-- stopped being the law on 1 January 2026.
UPDATE tax_jurisdictions
   SET standard_rate = 20.000,
       as_of = DATE '2026-08-08',
       source = 'GRA. From 1 Jan 2026 the COVID-19 Health Recovery Levy was '
                'abolished and NHIL (2.5%) and GETFund (2.5%) were re-coupled '
                'into the VAT base and made input-creditable, giving a flat '
                'combined 20% with no compounding. Before that the levies were '
                'charged on net and VAT 15% on net-plus-levies, for a 21.9% '
                'effective rate with the levies non-creditable. Model both with '
                'tax_code_components.',
       updated_at = now()
 WHERE code = 'GH';
