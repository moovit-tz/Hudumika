-- Migration 155: Full-stack Workflow Studio Engine (Google Workspace Studio style)

CREATE TABLE IF NOT EXISTS workflow_studio_apps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           VARCHAR(255) NOT NULL,
  description    TEXT,
  icon           VARCHAR(100) NOT NULL DEFAULT 'zap',
  color          VARCHAR(50) NOT NULL DEFAULT '#4361ee',
  status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'DRAFT')),
  trigger_event  VARCHAR(100) NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  nodes          JSONB NOT NULL DEFAULT '[]',
  edges          JSONB NOT NULL DEFAULT '[]',
  last_run_at    TIMESTAMPTZ,
  run_count      INT NOT NULL DEFAULT 0,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_studio_apps_tenant ON workflow_studio_apps(tenant_id, status);

CREATE TABLE IF NOT EXISTS workflow_studio_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id    UUID NOT NULL REFERENCES workflow_studio_apps(id) ON DELETE CASCADE,
  trigger_source VARCHAR(100) NOT NULL DEFAULT 'manual',
  status         VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'RUNNING', 'FAILED')),
  payload        JSONB NOT NULL DEFAULT '{}',
  step_results   JSONB NOT NULL DEFAULT '[]',
  error_message  TEXT,
  duration_ms    INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_studio_runs_tenant_wf ON workflow_studio_runs(tenant_id, workflow_id, created_at DESC);

-- Seed pre-built default templates for all existing tenants
DO $$
DECLARE
  t_record RECORD;
BEGIN
  FOR t_record IN SELECT id FROM tenants LOOP
    IF NOT EXISTS (SELECT 1 FROM workflow_studio_apps WHERE tenant_id = t_record.id AND name = 'Customs Consignee WhatsApp Notifier') THEN
      INSERT INTO workflow_studio_apps (
        tenant_id, name, description, icon, color, status, trigger_event, trigger_config, nodes, edges
      ) VALUES (
        t_record.id,
        'Customs Consignee WhatsApp Notifier',
        'Automatically sends an interactive WhatsApp update to declared customer contacts when a new customs clearance job is lodged.',
        'message-square',
        '#059669',
        'ACTIVE',
        'shipment.created',
        '{"auto_tag": true}',
        '[
          {"id": "node-1", "type": "trigger", "title": "New Shipment Lodged", "subtitle": "Event: shipment.created", "eventOrAction": "shipment.created", "position": {"x": 100, "y": 80}, "config": {}},
          {"id": "node-2", "type": "condition", "title": "Check Customer Declared", "subtitle": "Filter: customer != null", "position": {"x": 100, "y": 200}, "config": {"field": "customer", "operator": "is_not_empty"}},
          {"id": "node-3", "type": "action", "title": "Send WhatsApp Notifier", "subtitle": "Action: send_whatsapp", "eventOrAction": "send_whatsapp", "position": {"x": 100, "y": 320}, "config": {"template": "shipment_lodged_notice"}}
        ]'::jsonb,
        '[
          {"id": "edge-1", "source": "node-1", "target": "node-2"},
          {"id": "edge-2", "source": "node-2", "target": "node-3"}
        ]'::jsonb
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM workflow_studio_apps WHERE tenant_id = t_record.id AND name = 'High-Penalty Duty Guardrail') THEN
      INSERT INTO workflow_studio_apps (
        tenant_id, name, description, icon, color, status, trigger_event, trigger_config, nodes, edges
      ) VALUES (
        t_record.id,
        'High-Penalty Duty Guardrail',
        'Alerts the compliance manager and creates an urgent Bliss ticket whenever calculated duty penalty exceeds threshold.',
        'shield-alert',
        '#dc2626',
        'ACTIVE',
        'penalty.high_risk',
        '{"threshold_tzs": 1000000}',
        '[
          {"id": "node-1", "type": "trigger", "title": "Penalty Calculation Flagged", "subtitle": "Event: penalty.high_risk", "eventOrAction": "penalty.high_risk", "position": {"x": 100, "y": 80}, "config": {}},
          {"id": "node-2", "type": "condition", "title": "Penalty > 1,000,000 TZS", "subtitle": "Filter: penalty_tzs >= 1000000", "position": {"x": 100, "y": 200}, "config": {"field": "penalty_tzs", "operator": ">=", "value": 1000000}},
          {"id": "node-3", "type": "action", "title": "Create Urgent Bliss Ticket", "subtitle": "Action: create_ticket", "eventOrAction": "create_ticket", "position": {"x": 100, "y": 320}, "config": {"priority": "HIGH", "department": "COMPLIANCE"}}
        ]'::jsonb,
        '[
          {"id": "edge-1", "source": "node-1", "target": "node-2"},
          {"id": "edge-2", "source": "node-2", "target": "node-3"}
        ]'::jsonb
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM workflow_studio_apps WHERE tenant_id = t_record.id AND name = 'Auto-Draft Invoice Generator') THEN
      INSERT INTO workflow_studio_apps (
        tenant_id, name, description, icon, color, status, trigger_event, trigger_config, nodes, edges
      ) VALUES (
        t_record.id,
        'Auto-Draft Invoice Generator',
        'Generates a draft FinOps pro-forma invoice based on rate card charges as soon as cargo arrives at port/ICD.',
        'file-text',
        '#0284c7',
        'ACTIVE',
        'shipment.arrived',
        '{"auto_post": false}',
        '[
          {"id": "node-1", "type": "trigger", "title": "Shipment Arrived at Port", "subtitle": "Event: shipment.arrived", "eventOrAction": "shipment.arrived", "position": {"x": 100, "y": 80}, "config": {}},
          {"id": "node-2", "type": "action", "title": "Create Draft Invoice", "subtitle": "Action: create_invoice", "eventOrAction": "create_invoice", "position": {"x": 100, "y": 200}, "config": {"invoice_type": "proforma", "auto_include_ratecard": true}}
        ]'::jsonb,
        '[
          {"id": "edge-1", "source": "node-1", "target": "node-2"}
        ]'::jsonb
      );
    END IF;
  END LOOP;
END $$;
