-- 047_support_groups_views.sql
-- Department inboxes (Groups) and saved filters (Views) for the support/ticketing module.

CREATE TABLE support_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT 'teal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_support_groups_tenant ON support_groups(tenant_id);

ALTER TABLE support_tickets ADD COLUMN group_id UUID REFERENCES support_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_support_tickets_group ON support_tickets(group_id);

CREATE TABLE support_views (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_support_views_tenant ON support_views(tenant_id);

-- RLS
ALTER TABLE support_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_support_groups ON support_groups
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_support_views ON support_views
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
