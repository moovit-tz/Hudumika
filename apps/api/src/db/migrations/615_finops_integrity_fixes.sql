-- 615_finops_integrity_fixes.sql
-- Bank reconciliation: a journal line may back at most one statement line.
-- The application checked this with a SELECT before UPDATE, but without a
-- unique constraint a concurrent request could pass the check and create a
-- duplicate. A partial unique index (ignoring NULLs) is Postgres's way of
-- saying "at most one non-null value per column."

CREATE UNIQUE INDEX IF NOT EXISTS bank_stmt_lines_matched_jl_uniq
  ON bank_statement_lines (matched_journal_line_id)
  WHERE matched_journal_line_id IS NOT NULL;

-- Document numbering: credit_note and bill types were added to the TypeScript
-- DocType union and used by credit-notes.routes.ts and bills.routes.ts, but
-- never added to the CHECK constraint on invoice_sequences. The first
-- credit note or bill that falls through to the tenant-level sequence fails
-- with invoice_sequences_doc_type_check.

ALTER TABLE invoice_sequences DROP CONSTRAINT IF EXISTS invoice_sequences_doc_type_check;
ALTER TABLE invoice_sequences DROP CONSTRAINT IF EXISTS invoice_sequences_doc_type_check1;
ALTER TABLE invoice_sequences ADD CONSTRAINT invoice_sequences_doc_type_check
  CHECK (doc_type IN ('invoice', 'quotation', 'purchase_order', 'project', 'contract',
                      'change_request', 'payment_request', 'project_po', 'grn',
                      'credit_note', 'bill'));
