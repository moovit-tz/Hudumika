-- The purchase side, where input tax is actually claimed.
--
-- Migration 180 gave sales a treatment. Purchases still carry a bare
-- percentage - purchase_order_lines.tax_rate, supplier_bill_lines.tax_rate,
-- recurring_bills.tax_rate - and the general ledger cannot answer the only
-- question that matters on the purchase side: how much of the tax we paid can
-- we get back?
--
-- Three things stop it answering today.
--
-- 1. There is one VAT account. `2200 VAT Payable` is a liability, and
--    bills.routes.ts posts input tax as a DEBIT to it:
--
--        { accountCode: '2200', debit: tax_amount, description: 'VAT Input Tax' }
--
--    Output tax and input tax therefore net inside a single balance. The net
--    position is right; everything else is lost. A return needs both figures
--    separately, and an auditor needs to see the claim, not its residue.
--
-- 2. That debit is unconditional, so every purchase is treated as fully
--    recoverable. Blocked input tax - the standard-rated purchase whose VAT you
--    may not reclaim - silently reduces the liability and understates what is
--    owed.
--
-- 3. Nothing records whether a given purchase was standard, zero-rated, exempt
--    or blocked, so nothing could tell the difference even if the accounts
--    allowed it.
--
-- This migration fixes all three: an input-VAT asset account, a scope on tax
-- codes so a purchase code and a sales code are not the same thing, and a
-- treatment on every purchase line.

-- ---------------------------------------------------------------------------
-- 1. Tax codes get a scope.
-- ---------------------------------------------------------------------------
-- A sales code and a purchase code answer different questions with the same
-- word. On a sale, `input_tax_recoverable` means "does making this supply let
-- me recover tax on its costs" (zero-rated yes, exempt no). On a purchase it
-- means "is the tax charged on this purchase deductible" (normal yes, blocked
-- no). Both are genuinely about input tax, so the column carries over - but the
-- codes must not be interchangeable, or a blocked-purchase code could be
-- attached to a sales invoice.
ALTER TABLE tax_codes
  ADD COLUMN IF NOT EXISTS applies_to VARCHAR(8) NOT NULL DEFAULT 'BOTH';

ALTER TABLE tax_codes DROP CONSTRAINT IF EXISTS tax_codes_applies_to_valid;
ALTER TABLE tax_codes ADD CONSTRAINT tax_codes_applies_to_valid
  CHECK (applies_to IN ('SALES', 'PURCHASE', 'BOTH'));

COMMENT ON COLUMN tax_codes.applies_to IS
  'Which side of the ledger this code may be used on. BOTH is the common case '
  '(standard, zero-rated, exempt). PURCHASE-only exists for blocked input tax, '
  'which has no meaning on a sale.';

COMMENT ON COLUMN tax_codes.input_tax_recoverable IS
  'On a SALES code: whether making this supply allows recovery of tax on its '
  'costs (zero-rated yes, exempt no). On a PURCHASE code: whether the tax '
  'charged on this purchase is deductible (blocked items no).';

-- The one-default-per-tenant index has to become one per tenant *per side*,
-- or a purchase default and a sales default cannot coexist.
DROP INDEX IF EXISTS tax_codes_tenant_default_uq;
CREATE UNIQUE INDEX IF NOT EXISTS tax_codes_tenant_default_uq
  ON tax_codes (tenant_id, applies_to) WHERE is_default;

-- Blocked input tax: standard-rated, tax genuinely charged and paid, but not
-- reclaimable. Every VAT regime has a version of this (entertainment, private
-- vehicles, non-business use). Without a code for it, such a purchase can only
-- be recorded as fully recoverable - which is a wrong claim, not a rounding
-- difference.
INSERT INTO tax_codes (tenant_id, code, name, kind, rate, jurisdiction,
                       input_tax_recoverable, tra_tax_code, applies_to, is_default)
SELECT DISTINCT ON (std.tenant_id)
       std.tenant_id,
       'STD-NR',
       'Standard rate, not recoverable (' ||
         trim(trailing '.' from trim(trailing '0' from std.rate::text)) || '%)',
       'STANDARD',
       std.rate,
       std.jurisdiction,
       FALSE,        -- the whole point of this code
       NULL,         -- purchase codes are never fiscalised to TRA
       'PURCHASE',
       FALSE
  FROM tax_codes std
 WHERE std.kind = 'STANDARD'
   AND std.applies_to <> 'PURCHASE'
 ORDER BY std.tenant_id, std.rate DESC
ON CONFLICT (tenant_id, code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. A treatment on every purchase line.
-- ---------------------------------------------------------------------------
-- Nullable, and the rate columns stay untouched, exactly as on the sales side:
-- the code sits beside the rate, never instead of it, so no total moves.
ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS tax_code_id UUID
  REFERENCES tax_codes(id) ON DELETE SET NULL;
ALTER TABLE supplier_bill_lines  ADD COLUMN IF NOT EXISTS tax_code_id UUID
  REFERENCES tax_codes(id) ON DELETE SET NULL;
ALTER TABLE recurring_bills      ADD COLUMN IF NOT EXISTS tax_code_id UUID
  REFERENCES tax_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS purchase_order_lines_tax_code_idx ON purchase_order_lines (tax_code_id);
CREATE INDEX IF NOT EXISTS supplier_bill_lines_tax_code_idx  ON supplier_bill_lines (tax_code_id);
CREATE INDEX IF NOT EXISTS recurring_bills_tax_code_idx      ON recurring_bills (tax_code_id);

COMMENT ON COLUMN supplier_bill_lines.tax_code_id IS
  'Tax treatment of the purchase. Decides whether the tax on this line is '
  'claimable. NULL means it was never recorded - not that it is recoverable.';

-- A bill in a foreign currency could not be brought into the return at all:
-- supplier_bills carries a currency but never carried a rate to convert it at,
-- unlike sales_invoices. Same meaning as sales_invoices.exchange_rate.
ALTER TABLE supplier_bills  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;

COMMENT ON COLUMN supplier_bills.exchange_rate IS
  'Units of the reporting currency per one unit of this bill''s currency. 1 '
  'means no conversion, never "unknown" - a guessed rate on a tax claim is a '
  'wrong claim.';


-- ---------------------------------------------------------------------------
-- 3. Somewhere for recoverable input tax to live.
-- ---------------------------------------------------------------------------
-- VAT you can reclaim is money the revenue authority owes you: an asset, not a
-- reduction of a liability you may not even have. Keeping it in its own account
-- is what makes the two halves of a return separately reportable and separately
-- auditable. 1150 sits between Accounts Receivable (1100) and Prepaid Expenses
-- (1200), matching the existing numbering in gl.service.ts's STANDARD_COA.
--
-- Non-recoverable input tax deliberately gets no account: it is not an asset
-- and never will be, so it belongs in the cost of whatever was bought. That is
-- handled in the posting code, not here.
INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system, is_active)
SELECT DISTINCT t.tenant_id, '1150', 'VAT Input (Recoverable)', 'ASSET', 'CURRENT_ASSET', 'DEBIT', TRUE, TRUE
  FROM chart_of_accounts t
 WHERE NOT EXISTS (
   SELECT 1 FROM chart_of_accounts x
    WHERE x.tenant_id = t.tenant_id AND x.code = '1150'
 );

-- Say what 2200 is now, since it stops being a mixed account.
UPDATE chart_of_accounts
   SET name = 'VAT Output (Payable)'
 WHERE code = '2200' AND name = 'VAT Payable';
