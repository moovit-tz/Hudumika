-- 298_credit_notes.sql
-- AR had no credit note / memo concept at all — confirmed via grep, zero
-- hits for credit_note anywhere. invoices.routes.ts's own INVOICE_STATUS
-- enum has carried a 'Credited' value that no route has ever set, and void
-- is whole-document-only (reverseDocumentJournals) with no partial-amount
-- concept — so a credit note is a new document, mirroring sales_invoices/
-- sales_invoice_lines, not a sign-flip on the invoice table. RLS from day
-- one, same as every table this program has added since 296 surfaced the
-- gap on the tables it mirrors.

CREATE TABLE credit_notes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  credit_note_number VARCHAR(100) NOT NULL,
  original_invoice_id UUID REFERENCES sales_invoices(id),
  customer_id       UUID,
  client_name       VARCHAR(300),
  client_address    JSONB DEFAULT '[]'::jsonb,
  currency          VARCHAR(10) DEFAULT 'TZS',
  exchange_rate     NUMERIC(12,4) DEFAULT 1,
  credit_date       DATE,
  reason            TEXT,
  status            VARCHAR(20) DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'VOID')),
  notes             TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, credit_note_number)
);

CREATE TABLE credit_note_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id  UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  name            VARCHAR(300) NOT NULL,
  unit            VARCHAR(50) DEFAULT 'PER BIL',
  rate            NUMERIC(15,2) DEFAULT 0,
  qty             NUMERIC(10,2) DEFAULT 1,
  tax_pct         NUMERIC(5,2) DEFAULT 0,
  tax_code_id     UUID,
  line_group      VARCHAR(20) DEFAULT 'other',
  currency        VARCHAR(5) DEFAULT 'TZS',
  sort_order      INT DEFAULT 0
);

ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON credit_notes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE credit_note_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_note_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON credit_note_lines
  USING (EXISTS (
    SELECT 1 FROM credit_notes cn
    WHERE cn.id = credit_note_lines.credit_note_id
      AND cn.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  ));
