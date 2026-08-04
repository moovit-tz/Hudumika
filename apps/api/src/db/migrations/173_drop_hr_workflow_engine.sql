-- Drop NexusHR's own workflow engine.
--
-- These five tables were a third workflow engine sitting alongside the two the
-- platform actually uses: the clearance workflow (workflow_steps, which other
-- tables reference by row) and Workflow Studio (a JSONB node graph). Nothing
-- routed to this one — no screen called its endpoints, no job or event emitted
-- into it, and every table was empty in every tenant. Meanwhile HR now emits
-- domain events (hr.leave_requested, hr.leave_approved, hr.staff_role_changed
-- and the rest) that Studio triggers can act on, so the automation this engine
-- was meant to provide has somewhere real to live.
--
-- Keeping it would mean a third set of concepts for anyone extending HR to
-- choose between, and a set of tables whose emptiness reads as "nobody has set
-- one up yet" rather than "this was never wired in".
--
-- hr_documents.case_id is dropped with them: it existed only to attach a
-- document to one of these cases, and no row in any tenant has it set.

BEGIN;

-- The one reference from outside the group.
ALTER TABLE IF EXISTS hr_documents DROP COLUMN IF EXISTS case_id;

-- Dropped children-first; CASCADE covers the intra-group FKs either way.
DROP TABLE IF EXISTS hr_workflow_conditions CASCADE;
DROP TABLE IF EXISTS hr_workflow_tasks      CASCADE;
DROP TABLE IF EXISTS hr_workflow_cases      CASCADE;
DROP TABLE IF EXISTS hr_workflow_stages     CASCADE;
DROP TABLE IF EXISTS hr_workflow_definitions CASCADE;

COMMIT;
