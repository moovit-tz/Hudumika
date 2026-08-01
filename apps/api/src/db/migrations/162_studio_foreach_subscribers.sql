-- Migration 162: the two remaining subscribers, now that forEach exists.
--
-- 160 left these out with a note: both fan out over a collection, and the node
-- model had no iteration construct. Rather than seed a fake single-item version
-- that would silently drop work, they stayed as code.
--
-- The forEach node iterates a collection supplied by a context resolver — never
-- a query Studio composes itself. Note the ownership: `declaration.released` is
-- a ClearOS event, but the bonded lots are SEAL's and the trips are Tracking's,
-- so each app contributes its own resolver slice (studio/context.ts).
--
-- DRAFT, like the others. The code subscribers still run; a Studio copy is
-- activated only after an A/B against real data, one workflow at a time.

DO $$
DECLARE t_record RECORD;
BEGIN
FOR t_record IN SELECT id FROM tenants LOOP

  -- tracking.subscribers.ts — notify the dispatcher of every linked trip.
  IF NOT EXISTS (SELECT 1 FROM workflow_studio_apps WHERE tenant_id = t_record.id AND name = 'Stage change notifies linked trip dispatchers') THEN
    INSERT INTO workflow_studio_apps (tenant_id, name, description, icon, color, status, trigger_event, trigger_config, nodes, edges)
    VALUES (t_record.id,
      'Stage change notifies linked trip dispatchers',
      'When a clearance stage advances, notify the dispatcher of every fleet trip hauling that shipment. Runs once per linked trip.',
      'truck', '#0891b2', 'DRAFT', 'shipment.stage_advanced', '{}',
      '[
        {"id":"n1","type":"trigger","title":"Stage advanced","eventOrAction":"shipment.stage_advanced","position":{"x":100,"y":80},"config":{}},
        {"id":"n2","type":"forEach","title":"For each linked trip","position":{"x":100,"y":200},"config":{"over":"trips","as":"trip"}},
        {"id":"n3","type":"action","title":"Notify dispatcher","eventOrAction":"notification.send_in_app","position":{"x":100,"y":320},"config":{"input":{
            "userId":"{{trip.dispatcherId}}","app":"tracking","type":"info",
            "title":"Linked shipment stage updated",
            "message":"Shipment stage for your trip''s cargo advanced to \"{{payload.stage}}\".",
            "link":"/tracking/trips/{{trip.id}}"}}}
      ]'::jsonb,
      '[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"n3"}]'::jsonb);
  END IF;

  -- seal.subscribers.ts — release every bonded lot still under duty suspension.
  IF NOT EXISTS (SELECT 1 FROM workflow_studio_apps WHERE tenant_id = t_record.id AND name = 'Released declaration releases bonded lots') THEN
    INSERT INTO workflow_studio_apps (tenant_id, name, description, icon, color, status, trigger_event, trigger_config, nodes, edges)
    VALUES (t_record.id,
      'Released declaration releases bonded lots',
      'Cargo that cleared customs should not sit under bond. Moves every linked lot from duty-suspended to duty-paid through SEAL''s append-only movement ledger.',
      'package-check', '#0f766e', 'DRAFT', 'declaration.released', '{}',
      '[
        {"id":"n1","type":"trigger","title":"Declaration released","eventOrAction":"declaration.released","position":{"x":100,"y":80},"config":{}},
        {"id":"n2","type":"forEach","title":"For each suspended lot","position":{"x":100,"y":200},"config":{"over":"suspendedLots","as":"lot"}},
        {"id":"n3","type":"action","title":"Release lot","eventOrAction":"seal.release_lot","position":{"x":100,"y":320},"config":{"input":{
            "lotId":"{{lot.id}}",
            "toCustomsStatus":"FOREIGN_DUTY_PAID",
            "reasonCode":"DECLARATION_RELEASED",
            "reference":"{{entityId}}"}}}
      ]'::jsonb,
      '[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"n3"}]'::jsonb);
  END IF;

END LOOP;
END $$;
