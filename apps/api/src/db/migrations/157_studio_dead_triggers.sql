-- Migration 157: stand down the seeded Workflow Studio workflows that can
-- never fire, and stop them claiming to be ACTIVE while the executor is a stub.
--
-- Two separate problems with what migration 155 seeded:
--
-- 1. Dead triggers. The seeds fire on 'shipment.created', 'shipment.arrived'
--    and 'penalty.high_risk'. Grepping every emitDomainEvent() call site, the
--    only domain events this platform actually emits are:
--
--      shipment.case_opened     shipment.stage_advanced   shipment.sla_breach
--      shipment.demurrage_risk  declaration.released
--
--    None of the three seeded triggers exists, so none of these 21 rows (7
--    tenants x 3) could ever have run, regardless of anything else.
--
-- 2. No executor. workflow-studio.routes.ts walks the node graph and pushes a
--    hardcoded status:'SUCCESS' with a Math.random() duration for every node —
--    no action is performed, no service is called. A row marked ACTIVE
--    therefore promises automation that does not exist.
--
-- 'shipment.created' is repointed to the real 'shipment.case_opened', which is
-- the same moment in the lifecycle under the name actually emitted. The other
-- two have no real equivalent yet and keep their trigger so the intent is not
-- lost; they simply cannot be enabled until the trigger is emitted and the
-- executor is real.
--
-- Everything goes to DRAFT rather than being deleted: these are reasonable
-- automations to want, and a tenant that edited one should not lose the work.
-- Re-running is safe — the WHERE clauses only match rows still in the seeded
-- state.

UPDATE workflow_studio_apps
SET trigger_event = 'shipment.case_opened',
    nodes = REPLACE(nodes::text, 'shipment.created', 'shipment.case_opened')::jsonb,
    updated_at = NOW()
WHERE trigger_event = 'shipment.created';

UPDATE workflow_studio_apps
SET status = 'DRAFT',
    updated_at = NOW()
WHERE status = 'ACTIVE'
  AND trigger_event IN ('shipment.case_opened', 'shipment.arrived', 'penalty.high_risk');
