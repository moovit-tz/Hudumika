-- An invoice never recorded what currency it was in.
--
-- `sales_invoices` has exchange_rate but no currency code; the code lives on
-- `sales_invoice_lines`, one per line. That is not simply misplaced, and the
-- obvious repair - move it to the header, drop it from the line - would have
-- destroyed something real. These invoices are genuinely dual-currency:
--
--   clearing / other lines   the tenant's own money        (40 + 30 rows TZS)
--   shipping lines           the carrier's, in USD         (22 rows)
--                            converted at the header's exchange_rate
--
-- 14 of 19 invoices carry two currencies for that reason. A freight invoice
-- billing the ocean leg in dollars and the clearing work in shillings is the
-- normal shape of the document, not a data fault.
--
-- What is actually missing is the other half: which currency the invoice is
-- *settled* in. Today that is inferred - "whatever the clearing lines are" -
-- and the inference is made by grouping on `line_group`, a freight-specific
-- string. Two consequences:
--
--   * The two SEAL storage invoices are wholly in USD with exchange_rate 1.
--     Nothing records that they are USD invoices; they only look like TZS
--     invoices whose rate happens to be 1.
--   * The totaller treats every non-'shipping' line as base currency. There
--     are already 4 USD lines in the 'other' group. They total correctly
--     today only because both their invoices have exchange_rate 1 - on a
--     2650 invoice the same line would be understated 2650-fold.
--
-- So: add the header currency, keep the line currency, and let the code
-- convert on the currencies themselves rather than on a group name.

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3);

-- Backfill from what each invoice's own base lines actually say, rather than
-- assuming the tenant default: an invoice whose lines are all USD is a USD
-- invoice regardless of what the workspace usually bills in.
UPDATE sales_invoices si
   SET currency = sub.cur
  FROM (
    SELECT invoice_id,
           -- The most common currency among the lines that are NOT the
           -- converted foreign block. That is the money the total is expressed
           -- in, which is exactly what this column means.
           (ARRAY_AGG(currency ORDER BY n DESC, currency))[1] AS cur
      FROM (
        SELECT invoice_id, currency, COUNT(*) AS n
          FROM sales_invoice_lines
         WHERE line_group IS DISTINCT FROM 'shipping'
         GROUP BY invoice_id, currency
      ) counted
     GROUP BY invoice_id
  ) sub
 WHERE si.id = sub.invoice_id
   AND si.currency IS NULL;

-- An invoice with no lines has nothing to derive from. Fall back to the
-- tenant's configured billing currency, and only then to TZS - never guess a
-- currency onto a document that has priced lines.
UPDATE sales_invoices si
   SET currency = COALESCE(
     NULLIF(ts.settings -> 'company' ->> 'currency', ''),
     'TZS'
   )
  FROM tenant_settings ts
 WHERE ts.tenant_id = si.tenant_id
   AND si.currency IS NULL;

UPDATE sales_invoices SET currency = 'TZS' WHERE currency IS NULL;

ALTER TABLE sales_invoices ALTER COLUMN currency SET NOT NULL;
ALTER TABLE sales_invoices ALTER COLUMN currency SET DEFAULT 'TZS';

-- ISO 4217 is three characters. The line column is VARCHAR(5), which is wide
-- enough to hold something that is not a currency code; the header column is
-- constrained so it cannot drift.
ALTER TABLE sales_invoices
  DROP CONSTRAINT IF EXISTS sales_invoices_currency_iso4217;
ALTER TABLE sales_invoices
  ADD CONSTRAINT sales_invoices_currency_iso4217
  CHECK (currency ~ '^[A-Z]{3}$');

COMMENT ON COLUMN sales_invoices.currency IS
  'ISO 4217 code the invoice is settled in. Lines may carry a different '
  'currency (e.g. a USD ocean freight line on a TZS invoice); those are '
  'converted at exchange_rate. Never infer this from line_group.';

COMMENT ON COLUMN sales_invoices.exchange_rate IS
  'Units of the invoice currency per one unit of a foreign line currency. '
  'Applies to any line whose currency differs from the invoice currency.';
