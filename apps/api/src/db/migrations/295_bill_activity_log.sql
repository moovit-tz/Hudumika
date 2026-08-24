-- 295_bill_activity_log.sql
-- Bills had no audit trail at all while invoices have a real, multi-point
-- one (invoice_activity_log, 051_invoice_notes_tasks.sql) — a real
-- asymmetry between AR and AP. Same shape, same policy idiom as the
-- table it mirrors, FORCE'd from day one (not left to a later cutover
-- migration the way invoice_activity_log originally was).

CREATE TABLE bill_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES supplier_bills(id) ON DELETE CASCADE,
    actor_id VARCHAR(255),
    actor_name VARCHAR(255),
    action VARCHAR(80) NOT NULL,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bill_activity_log_bill ON bill_activity_log(bill_id);
CREATE INDEX idx_bill_activity_log_tenant ON bill_activity_log(tenant_id);

ALTER TABLE bill_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_activity_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON bill_activity_log
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
