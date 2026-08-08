-- How an employee actually gets paid, and which fund they belong to.
--
-- Migration 195 put the statutory identity on `users` (TIN, NIDA, social
-- security and health insurance numbers, tax residency, basic salary) because
-- the payroll engine needs them to compute anything. What it did not add is the
-- other half of the same question: once the engine has worked out a net figure,
-- where does the money go?
--
-- A bank-only model does not survive first contact here. A large share of
-- Tanzanian staff are paid by mobile money — M-Pesa, Tigo Pesa, Airtel Money,
-- HaloPesa — and for many of them that is the only account they have. Storing a
-- bank name and account number and calling it "payment details" would leave
-- those people unpayable, so the method is an explicit choice and each method
-- carries its own fields rather than being crammed into shared ones.
--
-- Nothing here is NOT NULL. These are facts about a person that get collected
-- over time, often after the record is created — an employee added on their
-- first day may not have handed over an NSSF number yet, and refusing to store
-- them until they do is how the record ends up living in a spreadsheet instead.
-- Completeness is a payroll-run concern, checked when it matters, not a schema
-- one enforced when it does not.

ALTER TABLE users
  -- BANK | MOBILE_MONEY | CASH. Left NULL when nobody has said yet, which is
  -- different from having chosen cash.
  ADD COLUMN IF NOT EXISTS pay_method            VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_name             VARCHAR(120),
  ADD COLUMN IF NOT EXISTS bank_branch           VARCHAR(120),
  ADD COLUMN IF NOT EXISTS bank_account_no       VARCHAR(64),
  -- The name on the account, which is not always the employee's own name and
  -- is what a bank actually matches against when a transfer is rejected.
  ADD COLUMN IF NOT EXISTS bank_account_name     VARCHAR(160),
  ADD COLUMN IF NOT EXISTS mobile_money_provider VARCHAR(40),
  ADD COLUMN IF NOT EXISTS mobile_money_number   VARCHAR(32),
  -- NSSF (private sector) or PSSSF (public service). The contribution rate is
  -- the same 10% + 10% either way, so this does not change the arithmetic —
  -- it changes which return the money is remitted on, which is why it belongs
  -- on the person and not only on the tenant-level scheme.
  ADD COLUMN IF NOT EXISTS pension_fund          VARCHAR(20);

-- Spelled as constraints rather than left to application validation, because
-- these columns are also written by SQL during data loads and by the seed
-- scripts, neither of which goes through a route handler.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_pay_method_valid') THEN
    ALTER TABLE users ADD CONSTRAINT users_pay_method_valid
      CHECK (pay_method IS NULL OR pay_method IN ('BANK', 'MOBILE_MONEY', 'CASH'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_pension_fund_valid') THEN
    ALTER TABLE users ADD CONSTRAINT users_pension_fund_valid
      CHECK (pension_fund IS NULL OR pension_fund IN ('NSSF', 'PSSSF'));
  END IF;
END $$;

COMMENT ON COLUMN users.pay_method IS
  'BANK | MOBILE_MONEY | CASH. NULL means not yet collected, which is not the same as CASH.';
COMMENT ON COLUMN users.pension_fund IS
  'NSSF or PSSSF. Same 10%+10% rate either way; determines which return the remittance appears on.';
