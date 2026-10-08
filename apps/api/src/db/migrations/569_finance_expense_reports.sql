CREATE TABLE finance_expense_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL, owner_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','reimbursed')),
  review_note text, reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz,
  reimbursement_journal_id uuid REFERENCES journal_entries(id), payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE TABLE finance_expense_report_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_id uuid NOT NULL, name text NOT NULL, category text NOT NULL,
  amount numeric(18,2) NOT NULL CHECK(amount > 0), expense_date date NOT NULL,
  receipt_data text NOT NULL, receipt_hash text NOT NULL,
  expense_id uuid REFERENCES finance_expenses(id), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,report_id) REFERENCES finance_expense_reports(tenant_id,id), UNIQUE(tenant_id,receipt_hash)
);
ALTER TABLE finance_expenses ADD COLUMN report_id uuid;
ALTER TABLE finance_expenses ADD CONSTRAINT finance_expenses_report_fk FOREIGN KEY(tenant_id,report_id) REFERENCES finance_expense_reports(tenant_id,id);
ALTER TABLE finance_expense_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_expense_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_expense_reports USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER TABLE finance_expense_report_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_expense_report_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_expense_report_items USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
