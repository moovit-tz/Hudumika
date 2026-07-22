-- 050_support_rules.sql
-- Rules & workflows engine for the support/ticketing module: auto-assignment,
-- SLA escalation, status automation, and notification triggers.

CREATE TABLE support_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,   -- 'auto_assign' | 'sla_escalation' | 'status_automation' | 'notification_trigger'
    name VARCHAR(255) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_support_rules_tenant ON support_rules(tenant_id);
CREATE INDEX idx_support_rules_type ON support_rules(tenant_id, type);

-- Prevents the SLA-escalation job from re-notifying on every pass.
ALTER TABLE support_tickets ADD COLUMN sla_escalated_at TIMESTAMP WITH TIME ZONE;

-- RLS
ALTER TABLE support_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_support_rules ON support_rules
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
