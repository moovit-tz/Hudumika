-- 051_invoice_notes_tasks.sql
-- Real Notes/Tasks/Reminders/Activity Log for sales invoices — mirrors the
-- existing shipment_notes/shipment_tasks (008/017) and contact_activity_log
-- (034) shape. Backs the Notes/Tasks/Reminders/Activity Log tabs on the
-- invoice detail panel, which previously had no backend at all.

CREATE TABLE invoice_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    author_id VARCHAR(255) NOT NULL,
    author_name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_invoice_notes_invoice ON invoice_notes(invoice_id);
CREATE INDEX idx_invoice_notes_tenant ON invoice_notes(tenant_id);

CREATE TABLE invoice_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    assignee VARCHAR(255),
    due_date DATE,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_invoice_tasks_invoice ON invoice_tasks(invoice_id);
CREATE INDEX idx_invoice_tasks_tenant ON invoice_tasks(tenant_id);

CREATE TABLE invoice_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    remind_date DATE NOT NULL,
    message TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_invoice_reminders_invoice ON invoice_reminders(invoice_id);
CREATE INDEX idx_invoice_reminders_tenant ON invoice_reminders(tenant_id);

CREATE TABLE invoice_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    actor_id VARCHAR(255),
    actor_name VARCHAR(255),
    action VARCHAR(80) NOT NULL,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_invoice_activity_log_invoice ON invoice_activity_log(invoice_id);
CREATE INDEX idx_invoice_activity_log_tenant ON invoice_activity_log(tenant_id);

-- RLS
ALTER TABLE invoice_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_invoice_notes ON invoice_notes
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_invoice_tasks ON invoice_tasks
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_invoice_reminders ON invoice_reminders
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_invoice_activity_log ON invoice_activity_log
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
