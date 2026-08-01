-- Migration 160: the four hardcoded subscribers that migrate cleanly, seeded as
-- real Studio workflows.
--
-- These are not new automations. Each reproduces a subscriber that has been
-- running as TypeScript since the event bus was built. Moving them changes
-- nothing functionally — it makes them visible, editable and auditable by the
-- tenant, which is the entire argument for consolidating on Studio.
--
-- Seeded as DRAFT, deliberately. The code subscribers are still registered and
-- still doing this work; activating a seeded copy today would double every
-- ticket, notification and ledger line. The code path is retired per workflow
-- only after its Studio equivalent is verified against real data — see
-- STUDIO_PLAN.md's verification standard.
--
-- Two of the six subscribers are NOT here:
--   tracking.subscribers.ts — notifies the dispatcher of every trip linked to
--     the shipment (a collection)
--   seal.subscribers.ts     — releases every bonded lot linked to the shipment
--     (a collection)
-- Both fan out over a set of rows. The node model executes a single linear
-- path and has no iteration construct, so neither can be expressed today.
-- They stay as code until Studio has a forEach node; inventing a fake
-- single-item version would silently drop work.

DO $$
DECLARE t_record RECORD;
BEGIN
FOR t_record IN SELECT id FROM tenants LOOP

  -- 1. bliss.subscribers.ts — SLA breach raises a support ticket.
  IF NOT EXISTS (SELECT 1 FROM workflow_studio_apps WHERE tenant_id = t_record.id AND name = 'SLA breach raises a support ticket') THEN
    INSERT INTO workflow_studio_apps (tenant_id, name, description, icon, color, status, trigger_event, trigger_config, nodes, edges)
    VALUES (t_record.id,
      'SLA breach raises a support ticket',
      'When a clearance case passes its SLA deadline, open a HIGH priority Bliss ticket for the customer. Skips if one is already open for the same shipment.',
      'life-buoy', '#7c3aed', 'DRAFT', 'shipment.sla_breach', '{}',
      '[
        {"id":"n1","type":"trigger","title":"SLA breached","eventOrAction":"shipment.sla_breach","position":{"x":100,"y":80},"config":{}},
        {"id":"n2","type":"condition","title":"Shipment has a customer","position":{"x":100,"y":200},"config":{"field":"shipment.customerId","operator":"is_not_empty"}},
        {"id":"n3","type":"action","title":"Raise support ticket","eventOrAction":"support.create_ticket","position":{"x":100,"y":320},"config":{"input":{
            "customerId":"{{shipment.customerId}}",
            "subject":"[Auto] SLA breach on shipment {{shipment.refNumber}}",
            "description":"Shipment {{shipment.refNumber}} exceeded its SLA deadline at stage \"{{shipment.stage}}\" ({{payload.hoursExceeded}} hours over). Auto-raised by ClearOS.",
            "priority":"HIGH","category":"Clearance Operations","tags":["clearos","sla-breach"],
            "dedupeOnOpenSubjectLike":"%{{shipment.refNumber}}%SLA%"}}}
      ]'::jsonb,
      '[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"n3"}]'::jsonb);
  END IF;

  -- 2. cargotracker.subscribers.ts — demurrage risk into cargotracker's own inbox.
  IF NOT EXISTS (SELECT 1 FROM workflow_studio_apps WHERE tenant_id = t_record.id AND name = 'Demurrage risk alerts the assigned officer') THEN
    INSERT INTO workflow_studio_apps (tenant_id, name, description, icon, color, status, trigger_event, trigger_config, nodes, edges)
    VALUES (t_record.id,
      'Demurrage risk alerts the assigned officer',
      'Container free time is running out. Notifies the assigned officer in the CargoTracker inbox, which a ClearOS-tagged notification never reaches.',
      'alert-triangle', '#4f46e5', 'DRAFT', 'shipment.demurrage_risk', '{}',
      '[
        {"id":"n1","type":"trigger","title":"Demurrage risk","eventOrAction":"shipment.demurrage_risk","position":{"x":100,"y":80},"config":{}},
        {"id":"n2","type":"condition","title":"Case has an assignee","position":{"x":100,"y":200},"config":{"field":"shipment.assignedTo","operator":"is_not_empty"}},
        {"id":"n3","type":"action","title":"Notify in CargoTracker","eventOrAction":"notification.send_in_app","position":{"x":100,"y":320},"config":{"input":{
            "userId":"{{shipment.assignedTo}}","app":"cargotracker","type":"security",
            "title":"Demurrage risk",
            "message":"Shipment {{shipment.refNumber}} container free time is running out.",
            "link":"/cargotracker/demurrage"}}}
      ]'::jsonb,
      '[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"n3"}]'::jsonb);
  END IF;

  -- 3. hrm.subscribers.ts — case assignment shows up in the officer's HR feed.
  IF NOT EXISTS (SELECT 1 FROM workflow_studio_apps WHERE tenant_id = t_record.id AND name = 'Case assignment logs to the officer''s HR activity') THEN
    INSERT INTO workflow_studio_apps (tenant_id, name, description, icon, color, status, trigger_event, trigger_config, nodes, edges)
    VALUES (t_record.id,
      'Case assignment logs to the officer''s HR activity',
      'Records a new clearance case against the assigned officer so their real workload is visible in NexusHR.',
      'user-check', '#0d9488', 'DRAFT', 'shipment.case_opened', '{}',
      '[
        {"id":"n1","type":"trigger","title":"Case opened","eventOrAction":"shipment.case_opened","position":{"x":100,"y":80},"config":{}},
        {"id":"n2","type":"condition","title":"Case has an assignee","position":{"x":100,"y":200},"config":{"field":"shipment.assignedTo","operator":"is_not_empty"}},
        {"id":"n3","type":"action","title":"Log HR activity","eventOrAction":"hr.log_activity","position":{"x":100,"y":320},"config":{"input":{
            "userId":"{{shipment.assignedTo}}",
            "action":"Assigned to shipment case {{shipment.refNumber}}",
            "module":"ClearOS"}}}
      ]'::jsonb,
      '[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"n3"}]'::jsonb);
  END IF;

  -- 4. finance.subscribers.ts — book the duty once a declaration is released.
  --    The condition on dutyAmountTzs is what preserves the original's refusal
  --    to invent a figure: the resolver leaves it null when no real TRA notice
  --    exists, and the workflow stops there.
  IF NOT EXISTS (SELECT 1 FROM workflow_studio_apps WHERE tenant_id = t_record.id AND name = 'Released declaration books the customs duty') THEN
    INSERT INTO workflow_studio_apps (tenant_id, name, description, icon, color, status, trigger_event, trigger_config, nodes, edges)
    VALUES (t_record.id,
      'Released declaration books the customs duty',
      'Records the customs duty as an expense against the shipment — only from a real recorded TRA assessment, never an estimate.',
      'file-text', '#0284c7', 'DRAFT', 'declaration.released', '{}',
      '[
        {"id":"n1","type":"trigger","title":"Declaration released","eventOrAction":"declaration.released","position":{"x":100,"y":80},"config":{}},
        {"id":"n2","type":"condition","title":"A real TRA amount exists","position":{"x":100,"y":200},"config":{"field":"declaration.dutyAmountTzs","operator":"greater_than","value":0}},
        {"id":"n3","type":"action","title":"Record duty expense","eventOrAction":"finance.record_expense","position":{"x":100,"y":320},"config":{"input":{
            "shipmentId":"{{declaration.shipmentId}}","category":"DUTY",
            "label":"Customs duty — declaration {{declaration.tancisRef}}",
            "amountTzs":"{{declaration.dutyAmountTzs}}","onlyIfNoneInCategory":true}}}
      ]'::jsonb,
      '[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"n3"}]'::jsonb);
  END IF;

END LOOP;
END $$;
