-- Migration 335: M6 of the corporate-tax build-out — dividends +
-- Statement of Changes in Equity. New COA 2600 Dividends Payable, backfilled
-- the same way every other new tax-program account has been.

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '2600', 'Dividends Payable', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Declared and paid as two distinct dated events (not collapsed into one),
-- matching this codebase's own established two-state pattern —
-- payroll_runs' APPROVED vs PAID, tax_registrations' registered vs pending.
CREATE TABLE IF NOT EXISTS dividends (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  declared_date         DATE NOT NULL,
  amount                NUMERIC(16,2) NOT NULL,
  description           TEXT,
  status                VARCHAR(16) NOT NULL DEFAULT 'DECLARED',
  journal_entry_id      UUID REFERENCES journal_entries(id),
  paid_at               DATE,
  paid_journal_entry_id UUID REFERENCES journal_entries(id),
  reference             VARCHAR(200),
  created_by            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dividends_status_valid CHECK (status IN ('DECLARED', 'PAID')),
  CONSTRAINT dividends_amount_positive CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS dividends_tenant_date ON dividends (tenant_id, declared_date);

ALTER TABLE dividends ENABLE ROW LEVEL SECURITY;
ALTER TABLE dividends FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON dividends
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
