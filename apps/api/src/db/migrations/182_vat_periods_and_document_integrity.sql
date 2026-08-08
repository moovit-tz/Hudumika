-- Making a return reproducible.
--
-- A return is a statement about a period, filed with a revenue authority. It is
-- only worth anything if the data behind it cannot change afterwards. Right now
-- it can:
--
--   * DELETE /v1/invoices/:id and DELETE /v1/bills/:id remove the document with
--     no status check at all. A posted, fiscalised, already-reported invoice can
--     be deleted outright.
--   * Neither delete touches the journal. The ledger keeps the entry and the
--     document it points at is gone - there is already one such orphan in this
--     database, an AP entry for a bill that no longer exists, and it is the only
--     posting account 2200 has ever had.
--   * A document number is whatever the caller sends. `getNextDocNumber` is
--     properly gapless (its UPDATE takes a row lock inside the request
--     transaction, so concurrent callers serialise and a rollback returns the
--     number), but every route reads `body.invoice_number || getNextDocNumber()`,
--     so a caller can supply a duplicate and nothing stops them - there is no
--     unique index on the number.
--
-- This migration adds the period, and closes the two integrity holes the period
-- would otherwise sit on top of.

-- ---------------------------------------------------------------------------
-- 1. VAT periods.
-- ---------------------------------------------------------------------------
-- A period is per jurisdiction, not just per tenant: a tenant operating in two
-- countries files two returns on two calendars, and `tax_codes.jurisdiction`
-- already carries which is which.
CREATE TABLE IF NOT EXISTS vat_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  jurisdiction  CHAR(2) NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,

  status        VARCHAR(10) NOT NULL DEFAULT 'open',

  -- The return exactly as filed. Stored rather than recomputed, because
  -- recomputing it later is precisely the thing that must not be able to give a
  -- different answer.
  return_snapshot JSONB,

  -- The partial-exemption restriction, posted at close. A bill debits its whole
  -- recoverable tax to 1150 when entered; if the period only allows part of it,
  -- the difference is a real journal, not a note on a report.
  adjustment_entry_id UUID,
  adjustment_amount   NUMERIC(18,2),

  closed_at     TIMESTAMPTZ,
  closed_by     UUID,
  reopened_at   TIMESTAMPTZ,
  reopened_by   UUID,
  reopen_reason TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE vat_periods DROP CONSTRAINT IF EXISTS vat_periods_status_valid;
ALTER TABLE vat_periods ADD CONSTRAINT vat_periods_status_valid
  CHECK (status IN ('open', 'closed'));

ALTER TABLE vat_periods DROP CONSTRAINT IF EXISTS vat_periods_range_valid;
ALTER TABLE vat_periods ADD CONSTRAINT vat_periods_range_valid
  CHECK (period_end >= period_start);

ALTER TABLE vat_periods DROP CONSTRAINT IF EXISTS vat_periods_jurisdiction_iso3166;
ALTER TABLE vat_periods ADD CONSTRAINT vat_periods_jurisdiction_iso3166
  CHECK (jurisdiction ~ '^[A-Z]{2}$');

-- A closed period must carry the return it was closed on. Without this the
-- table could hold a "closed" period that proves nothing.
ALTER TABLE vat_periods DROP CONSTRAINT IF EXISTS vat_periods_closed_has_snapshot;
ALTER TABLE vat_periods ADD CONSTRAINT vat_periods_closed_has_snapshot
  CHECK (status <> 'closed' OR (return_snapshot IS NOT NULL AND closed_at IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS vat_periods_tenant_juris_start_uq
  ON vat_periods (tenant_id, jurisdiction, period_start);
CREATE INDEX IF NOT EXISTS vat_periods_lookup_idx
  ON vat_periods (tenant_id, jurisdiction, period_start, period_end);

COMMENT ON TABLE vat_periods IS
  'A filing period per tenant per jurisdiction. Closing one freezes the '
  'documents dated inside it and stores the return as filed.';
COMMENT ON COLUMN vat_periods.return_snapshot IS
  'The computed return at the moment of closing. Never recomputed - a filed '
  'figure that can change is not a filed figure.';


-- ---------------------------------------------------------------------------
-- 2. A document number must be unique within its workspace.
-- ---------------------------------------------------------------------------
-- getNextDocNumber is gapless, but every route accepts a caller-supplied number
-- ahead of it and nothing checked for collision. Two invoices sharing a number
-- means a return cannot be tied back to its documents. Verified clean before
-- adding: zero duplicates in either table today.
CREATE UNIQUE INDEX IF NOT EXISTS sales_invoices_tenant_number_uq
  ON sales_invoices (tenant_id, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_bills_tenant_number_uq
  ON supplier_bills (tenant_id, bill_number);


-- ---------------------------------------------------------------------------
-- 3. The existing orphan.
-- ---------------------------------------------------------------------------
-- One AP entry survives a bill that was deleted. It is voided rather than
-- deleted: a ledger records what happened, and "this entry was orphaned by a
-- delete that should never have been allowed" is itself a fact worth keeping.
-- Voiding is also what the new delete path does, so this leaves the data in the
-- shape the code now maintains.
UPDATE journal_entries je
   SET voided_at = COALESCE(je.voided_at, now()),
       void_reason = COALESCE(je.void_reason,
         'Source document no longer exists. Voided by migration 182, which also '
         'stopped posted documents from being deleted.'),
       status = 'VOIDED',
       updated_at = now()
 WHERE je.voided_at IS NULL
   AND (
     (je.source_module = 'AR' AND NOT EXISTS (SELECT 1 FROM sales_invoices i WHERE i.id = je.source_id))
     OR
     (je.source_module = 'AP' AND NOT EXISTS (SELECT 1 FROM supplier_bills b WHERE b.id = je.source_id))
   );
