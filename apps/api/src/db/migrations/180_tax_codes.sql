-- A tax rate is not a tax treatment.
--
-- Every taxed thing in this platform is a bare percentage: products.tax_rate,
-- sales_invoice_lines.tax_pct, quotation_lines.tax_rate. Today those hold only
-- 0.00 and 18.00, and the web app hardcodes exactly that pair
-- (`TAX_RATES = [0, 18]` in apps/web/src/data/productData.ts) even though each
-- tenant already has its own `defaultTax` setting.
--
-- A percentage cannot express the distinction that a VAT return is built on.
-- Zero-rated, exempt, reverse-charge and out-of-scope supplies are all charged
-- at 0%, and they behave differently:
--
--   zero-rated     0% charged, input tax on related purchases IS recoverable
--   exempt         0% charged, input tax is NOT recoverable
--   reverse charge 0% charged by the supplier, the customer self-accounts
--   out of scope   not a taxable supply at all; outside the return
--
-- Filing an exempt supply as zero-rated overstates recoverable input tax. That
-- is not hypothetical here - it is already happening on every submission. See
-- apps/api/src/services/tra.service.ts, which had to derive TRA's own five-way
-- TAXCODE from the only thing it had:
--
--     // TAXCODE: 1=Standard(18%), 2=Special, 3=Zero, 4=Special Relief, 5=Exempt
--     const taxCode = taxPct >= 18 ? 1 : taxPct > 0 ? 2 : 3;
--
-- 4 and 5 are unreachable by construction. Every exempt and every special-relief
-- line in the system goes to the Tanzania Revenue Authority as zero-rated.
--
-- So: give the treatment a home of its own. `kind` carries the meaning and
-- `rate` becomes a consequence of it, not a substitute for it.

CREATE TABLE IF NOT EXISTS tax_codes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,

  code           VARCHAR(24)  NOT NULL,   -- short handle shown on documents, e.g. 'STD'
  name           VARCHAR(120) NOT NULL,   -- human label, e.g. 'Standard rate (18%)'
  kind           VARCHAR(16)  NOT NULL,   -- the treatment; see CHECK below
  rate           NUMERIC(6,3) NOT NULL DEFAULT 0,

  -- ISO 3166-1 alpha-2. A tenant operating in two countries holds two sets of
  -- codes; the jurisdiction is what tells a return which set it is filing.
  jurisdiction   CHAR(2) NOT NULL,

  -- Whether making this supply lets the seller recover input tax on related
  -- purchases. Derivable from `kind` in most places, but not universally - some
  -- jurisdictions grant recovery on specific exempt supplies - so it is stored
  -- and editable rather than computed.
  input_tax_recoverable BOOLEAN NOT NULL DEFAULT TRUE,

  -- TRA EFDMS <TAXCODE>: 1=Standard, 2=Special, 3=Zero, 4=Special Relief,
  -- 5=Exempt. NULL where TRA has no equivalent (reverse charge, out of scope) -
  -- the emitter refuses to submit such a line rather than pick the nearest
  -- wrong code, which is exactly the failure this table exists to end.
  tra_tax_code   SMALLINT,

  is_default     BOOLEAN NOT NULL DEFAULT FALSE,
  status         VARCHAR(10) NOT NULL DEFAULT 'active',

  -- A rate change (say VAT 18 -> 20) is a new code period, not an edit. Posted
  -- documents keep their own resolved tax_pct regardless, so history is safe
  -- either way; these dates govern which codes are *offered* when drafting.
  effective_from DATE,
  effective_to   DATE,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tax_codes DROP CONSTRAINT IF EXISTS tax_codes_kind_valid;
ALTER TABLE tax_codes ADD CONSTRAINT tax_codes_kind_valid
  CHECK (kind IN ('STANDARD','REDUCED','ZERO_RATED','EXEMPT','REVERSE_CHARGE','OUT_OF_SCOPE'));

ALTER TABLE tax_codes DROP CONSTRAINT IF EXISTS tax_codes_jurisdiction_iso3166;
ALTER TABLE tax_codes ADD CONSTRAINT tax_codes_jurisdiction_iso3166
  CHECK (jurisdiction ~ '^[A-Z]{2}$');

-- The rate must agree with the treatment, or the table has not solved anything:
-- an "exempt" code carrying 18% would reintroduce the ambiguity it replaces.
ALTER TABLE tax_codes DROP CONSTRAINT IF EXISTS tax_codes_rate_matches_kind;
ALTER TABLE tax_codes ADD CONSTRAINT tax_codes_rate_matches_kind CHECK (
  CASE kind
    WHEN 'STANDARD' THEN rate > 0
    WHEN 'REDUCED'  THEN rate > 0
    ELSE rate = 0
  END
);

ALTER TABLE tax_codes DROP CONSTRAINT IF EXISTS tax_codes_rate_sane;
ALTER TABLE tax_codes ADD CONSTRAINT tax_codes_rate_sane CHECK (rate >= 0 AND rate < 100);

ALTER TABLE tax_codes DROP CONSTRAINT IF EXISTS tax_codes_tra_code_range;
ALTER TABLE tax_codes ADD CONSTRAINT tax_codes_tra_code_range
  CHECK (tra_tax_code IS NULL OR tra_tax_code BETWEEN 1 AND 5);

ALTER TABLE tax_codes DROP CONSTRAINT IF EXISTS tax_codes_effective_order;
ALTER TABLE tax_codes ADD CONSTRAINT tax_codes_effective_order
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from);

CREATE UNIQUE INDEX IF NOT EXISTS tax_codes_tenant_code_uq ON tax_codes (tenant_id, code);
CREATE INDEX IF NOT EXISTS tax_codes_tenant_idx ON tax_codes (tenant_id);
-- One default per tenant, enforced rather than hoped for.
CREATE UNIQUE INDEX IF NOT EXISTS tax_codes_tenant_default_uq
  ON tax_codes (tenant_id) WHERE is_default;

COMMENT ON TABLE tax_codes IS
  'Tenant-scoped tax treatments. `kind` is the meaning; `rate` is a consequence '
  'of it. Documents snapshot the resolved rate onto their own line, so editing '
  'a code never reprices an existing document.';
COMMENT ON COLUMN tax_codes.kind IS
  'STANDARD | REDUCED | ZERO_RATED | EXEMPT | REVERSE_CHARGE | OUT_OF_SCOPE. '
  'The last four all charge 0% and are not interchangeable on a return.';


-- ---------------------------------------------------------------------------
-- Seed one set per tenant.
-- ---------------------------------------------------------------------------
-- The tenant universe is not `tenants` alone: 8 sales_invoices rows carry
-- tenant_ids with no matching tenants row (there is no FK on that column), and
-- their lines still need codes to point at. Take the union of everywhere a
-- taxable document actually lives.
WITH tenant_universe AS (
  SELECT id AS tenant_id FROM tenants
  UNION SELECT DISTINCT tenant_id FROM products        WHERE tenant_id IS NOT NULL
  UNION SELECT DISTINCT tenant_id FROM sales_invoices  WHERE tenant_id IS NOT NULL
  UNION SELECT DISTINCT tenant_id FROM quotations      WHERE tenant_id IS NOT NULL
),
resolved AS (
  SELECT
    tu.tenant_id,
    -- Country as ISO 3166-1 alpha-2. The setting is free text and holds both
    -- 'TZ' and 'Tanzania' today. Anything unrecognised falls back to TZ, which
    -- is the jurisdiction this deployment's fiscal integration targets - and it
    -- is editable per tenant afterwards, unlike the hardcode it replaces.
    CASE
      WHEN ts.settings->'company'->>'country' ~ '^[A-Za-z]{2}$'
        THEN upper(ts.settings->'company'->>'country')
      WHEN lower(coalesce(ts.settings->'company'->>'country','')) = 'tanzania'
        THEN 'TZ'
      ELSE 'TZ'
    END AS jurisdiction,
    -- The standard rate is read out of the tenant's own data before it is
    -- assumed. A rate this tenant already charges is a fact; the tenant's
    -- defaultTax setting is their stated intent; 18 is the last resort, and is
    -- not a new invention - it is the value the whole app hardcodes today,
    -- moved into per-tenant data where it can finally be changed.
    COALESCE(
      (SELECT MAX(p.tax_rate) FROM products p
        WHERE p.tenant_id = tu.tenant_id AND p.tax_rate > 0),
      (SELECT MAX(l.tax_pct) FROM sales_invoice_lines l
         JOIN sales_invoices si ON si.id = l.invoice_id
        WHERE si.tenant_id = tu.tenant_id AND l.tax_pct > 0),
      NULLIF(ts.settings->'company'->>'defaultTax', '')::numeric,
      18
    ) AS std_rate
  FROM tenant_universe tu
  LEFT JOIN tenant_settings ts ON ts.tenant_id = tu.tenant_id
),
seed(code, name_tpl, kind, rate_expr, tra, recoverable, is_default) AS (
  VALUES
    ('STD',    'Standard rate',   'STANDARD',       TRUE,  1::smallint, TRUE,  TRUE),
    ('ZERO',   'Zero-rated',      'ZERO_RATED',     FALSE, 3::smallint, TRUE,  FALSE),
    ('EXEMPT', 'Exempt',          'EXEMPT',         FALSE, 5::smallint, FALSE, FALSE),
    ('RC',     'Reverse charge',  'REVERSE_CHARGE', FALSE, NULL,        TRUE,  FALSE),
    ('OOS',    'Out of scope',    'OUT_OF_SCOPE',   FALSE, NULL,        FALSE, FALSE)
)
INSERT INTO tax_codes (tenant_id, code, name, kind, rate, jurisdiction,
                       input_tax_recoverable, tra_tax_code, is_default)
SELECT
  r.tenant_id,
  s.code,
  CASE WHEN s.rate_expr
       THEN s.name_tpl || ' (' || trim(trailing '.' from trim(trailing '0' from r.std_rate::text)) || '%)'
       ELSE s.name_tpl END,
  s.kind,
  CASE WHEN s.rate_expr THEN r.std_rate ELSE 0 END,
  r.jurisdiction,
  s.recoverable,
  s.tra,
  s.is_default
FROM resolved r CROSS JOIN seed s
ON CONFLICT (tenant_id, code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- Attach the code to the things that carry a rate.
-- ---------------------------------------------------------------------------
-- Nullable on purpose. `tax_pct` / `tax_rate` stay exactly as they are - the
-- resolved rate snapshotted onto the document - so no total anywhere moves.
-- The code is the treatment alongside it.
ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS tax_code_id UUID
  REFERENCES tax_codes(id) ON DELETE SET NULL;
ALTER TABLE products            ADD COLUMN IF NOT EXISTS tax_code_id UUID
  REFERENCES tax_codes(id) ON DELETE SET NULL;
ALTER TABLE quotation_lines     ADD COLUMN IF NOT EXISTS tax_code_id UUID
  REFERENCES tax_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_invoice_lines_tax_code_idx ON sales_invoice_lines (tax_code_id);
CREATE INDEX IF NOT EXISTS products_tax_code_idx            ON products (tax_code_id);
CREATE INDEX IF NOT EXISTS quotation_lines_tax_code_idx     ON quotation_lines (tax_code_id);

COMMENT ON COLUMN sales_invoice_lines.tax_code_id IS
  'Tax treatment. NULL means the line predates tax codes and its treatment was '
  'never recorded - not that it is zero-rated. tax_pct remains the rate that '
  'was actually charged.';


-- ---------------------------------------------------------------------------
-- Backfill only what is knowable.
-- ---------------------------------------------------------------------------
-- A line at 18% under a tenant whose standard code is 18% is a fact, so it gets
-- the code. A line at 0% is exactly the ambiguity this migration exists to
-- name: zero-rated, exempt, reverse-charge and out-of-scope are indistinguish-
-- able in the old data, and inventing one would be worse than leaving the gap
-- visible. Those stay NULL and surface as "unclassified" until a human says.

UPDATE sales_invoice_lines l
   SET tax_code_id = tc.id
  FROM sales_invoices si, tax_codes tc
 WHERE si.id = l.invoice_id
   AND tc.tenant_id = si.tenant_id
   AND tc.kind = 'STANDARD'
   AND tc.rate = l.tax_pct
   AND l.tax_pct > 0
   AND l.tax_code_id IS NULL;

UPDATE products p
   SET tax_code_id = tc.id
  FROM tax_codes tc
 WHERE tc.tenant_id = p.tenant_id
   AND tc.kind = 'STANDARD'
   AND tc.rate = p.tax_rate
   AND p.tax_rate > 0
   AND p.tax_code_id IS NULL;

UPDATE quotation_lines ql
   SET tax_code_id = tc.id
  FROM quotations q, tax_codes tc
 WHERE q.id = ql.quotation_id
   AND tc.tenant_id = q.tenant_id
   AND tc.kind = 'STANDARD'
   AND tc.rate = ql.tax_rate
   AND ql.tax_rate > 0
   AND ql.tax_code_id IS NULL;
