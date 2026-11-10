-- Phase 3/4 follow-through (Construction P0 audit's own named gap): a
-- progress certificate was created (createProgressCertificate) but then had
-- NO further lifecycle at all — 621_industry_domain_tables.sql's own schema
-- already modeled status ('draft'/'submitted'/'approved'/'invoiced'/'paid'),
-- approved_by/approved_at and invoice_id, but nothing anywhere ever wrote to
-- any of them: no approve action, no invoice action, no void/reissue path.
-- A certificate sat in 'draft' forever, retention and net amounts computed
-- but never actually billed to the client or posted to the GL.
--
-- Adds 'void' as a real status (for a correction/reissue, mirroring how
-- sales_invoices/credit_notes are voided, not deleted, elsewhere in this
-- codebase) plus the audit columns a void needs.
ALTER TABLE finance_progress_certificates DROP CONSTRAINT IF EXISTS finance_progress_certificates_status_check;
ALTER TABLE finance_progress_certificates ADD CONSTRAINT finance_progress_certificates_status_check
  CHECK (status IN ('draft','submitted','approved','invoiced','paid','void'));

ALTER TABLE finance_progress_certificates
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES users(id);

-- Retention Receivable — a construction certificate's retention portion is
-- genuinely collectible later (once the defects-liability period ends), so
-- it is a real receivable, not revenue written off or folded into ordinary
-- AR. Kept distinct from 1100 Accounts Receivable, the same "spelled out,
-- not blended" reasoning every other new GL account in this codebase
-- already follows (e.g. 2720 Customer Wallet Liability vs 2100 Accrued
-- Liabilities).
INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '1130', 'Retention Receivable', 'ASSET', 'CURRENT_ASSET', 'DEBIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;
