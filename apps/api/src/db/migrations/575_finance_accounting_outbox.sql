CREATE TABLE finance_accounting_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK (provider IN ('QUICKBOOKS','XERO')),
 provider_org_id text NOT NULL,
 entity_type text NOT NULL CHECK (entity_type IN ('INVOICE','BILL','INVOICE_PAYMENT','BILL_PAYMENT')),
 entity_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','SUCCESS','RETRY','RECONCILE','FAILED')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,provider,provider_org_id,entity_type,entity_id)
);
CREATE INDEX finance_accounting_outbox_due ON finance_accounting_outbox(next_attempt_at,created_at) WHERE status IN ('PENDING','RETRY');
CREATE INDEX finance_accounting_outbox_stale ON finance_accounting_outbox(updated_at) WHERE status = 'RUNNING';
ALTER TABLE finance_accounting_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_accounting_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON finance_accounting_outbox
 USING (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid);
