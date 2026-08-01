-- Migration 165: let a Studio workflow supersede the code subscriber it replaces.
--
-- Every migrated workflow is seeded DRAFT because the TypeScript subscribers are
-- still registered and still doing the work — activating a copy would double
-- every ticket, notification and ledger line. That made "activate it" a footgun
-- with no safe path, and left retirement as an all-or-nothing code deletion.
--
-- This column is the handover. A subscriber checks whether an ACTIVE workflow
-- for THIS tenant declares that it supersedes it, and stands down if so. The
-- consequences:
--
--   * Cutover is per tenant. One tenant can move to Studio while others stay on
--     code — no coordinated flag day.
--   * It is reversible. Pause the workflow and the subscriber resumes on the
--     next event; nothing is deleted to try it.
--   * Exactly one of the two runs, always. There is no window where both do.
--
-- The code path is only deleted once every tenant has superseded it, and that
-- becomes an observation rather than a leap.

ALTER TABLE workflow_studio_apps ADD COLUMN IF NOT EXISTS supersedes_subscriber TEXT;

CREATE INDEX IF NOT EXISTS workflow_studio_apps_supersedes
  ON workflow_studio_apps (tenant_id, supersedes_subscriber)
  WHERE status = 'ACTIVE' AND supersedes_subscriber IS NOT NULL;

-- Keys match the subscriber file that owns the behaviour, so the pairing is
-- greppable from either side.
UPDATE workflow_studio_apps SET supersedes_subscriber = 'bliss.sla_breach'
  WHERE name = 'SLA breach raises a support ticket';
UPDATE workflow_studio_apps SET supersedes_subscriber = 'cargotracker.demurrage_risk'
  WHERE name = 'Demurrage risk alerts the assigned officer';
UPDATE workflow_studio_apps SET supersedes_subscriber = 'hrm.case_opened'
  WHERE name = 'Case assignment logs to the officer''s HR activity';
UPDATE workflow_studio_apps SET supersedes_subscriber = 'finance.declaration_released'
  WHERE name = 'Released declaration books the customs duty';
UPDATE workflow_studio_apps SET supersedes_subscriber = 'tracking.stage_advanced'
  WHERE name = 'Stage change notifies linked trip dispatchers';
UPDATE workflow_studio_apps SET supersedes_subscriber = 'seal.declaration_released'
  WHERE name = 'Released declaration releases bonded lots';
