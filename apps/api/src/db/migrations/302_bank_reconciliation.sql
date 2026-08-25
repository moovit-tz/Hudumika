-- 302_bank_reconciliation.sql
-- No bank reconciliation existed at all — a real gap against QuickBooks/
-- Xero, which both offer live bank feeds. No aggregator credentials exist
-- for this platform (and most TZ/KE banks don't offer one anyway), so this
-- is the honest equivalent: manual statement CSV import + a match UI —
-- the same fallback QuickBooks/Xero themselves use for a bank with no live
-- feed. RLS from day one, same as every table this program adds.

CREATE TABLE bank_statements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  account_code    VARCHAR(20) NOT NULL DEFAULT '1010',
  bank_name       VARCHAR(200),
  statement_date_from DATE NOT NULL,
  statement_date_to   DATE NOT NULL,
  opening_balance NUMERIC(15,2) DEFAULT 0,
  closing_balance NUMERIC(15,2) DEFAULT 0,
  imported_by     UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bank_statement_lines (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_statement_id     UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  txn_date              DATE NOT NULL,
  description           TEXT,
  amount                NUMERIC(15,2) NOT NULL, -- positive = money in, negative = money out
  matched_journal_line_id UUID REFERENCES journal_lines(id),
  matched_at            TIMESTAMPTZ,
  matched_by            UUID
);

ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON bank_statements
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON bank_statement_lines
  USING (EXISTS (
    SELECT 1 FROM bank_statements bs
    WHERE bs.id = bank_statement_lines.bank_statement_id
      AND bs.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  ));
