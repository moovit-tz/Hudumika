-- Migration 219: self-learning workflow evolution.
--
-- Two surfaces. `workflow_learning_signals` is the aggregated, cross-tenant
-- "what are tenants actually changing about this template" table — rebuilt each
-- analysis run by diffing every tenant workflow against the template it was
-- seeded/adopted from (the origin_template_key/version lineage from migration
-- 218) and counting, per distinct tenant, how often each edit recurs. Both the
-- superadmin and a tenant admin read it — it is the transparent evidence, not a
-- black box.
--
-- `workflow_template_proposals` is a machine-proposed next template version:
-- when a set of edits recurs across enough tenants above a support threshold,
-- the analyzer synthesises the consensus workflow and files it here as
-- `pending` for the superadmin to approve. Approval publishes it as a real new
-- `workflow_templates` version (source='learned'); rejection archives it. A new
-- analysis run supersedes an older still-pending proposal for the same key.

CREATE TABLE IF NOT EXISTS workflow_learning_signals (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key     TEXT        NOT NULL,
  base_version     INTEGER     NOT NULL,
  edit_type        TEXT        NOT NULL,   -- STEP_ADDED | STEP_REMOVED | CONDITION_ADDED | CONDITION_REMOVED | SLA_CHANGED
  step_signature   TEXT        NOT NULL,   -- normalized step name the edit concerns
  anchor_after     TEXT        NOT NULL DEFAULT '',  -- normalized name of the step a STEP_ADDED commonly follows ('' = start)
  detail           JSONB       NOT NULL DEFAULT '{}',
  support_tenants  INTEGER     NOT NULL DEFAULT 0,    -- distinct tenants exhibiting this edit
  editing_tenants  INTEGER     NOT NULL DEFAULT 0,    -- distinct tenants who edited this template at all (denominator)
  support_pct      NUMERIC     NOT NULL DEFAULT 0,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_learning_signals_key
  ON workflow_learning_signals (template_key, edit_type, step_signature, anchor_after);

CREATE TABLE IF NOT EXISTS workflow_template_proposals (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key       TEXT        NOT NULL,
  base_version       INTEGER     NOT NULL,
  proposed_version   INTEGER     NOT NULL,
  name               TEXT        NOT NULL,
  description        TEXT        NOT NULL DEFAULT '',
  freight_modes      JSONB       NOT NULL DEFAULT '[]',
  consignment_types  JSONB       NOT NULL DEFAULT '[]',
  steps              JSONB       NOT NULL DEFAULT '[]',   -- synthesised DefaultStepDef[]
  rationale          JSONB       NOT NULL DEFAULT '[]',   -- the signals that drove it
  supporting_tenants INTEGER     NOT NULL DEFAULT 0,
  editing_tenants    INTEGER     NOT NULL DEFAULT 0,
  confidence         NUMERIC     NOT NULL DEFAULT 0,
  status             TEXT        NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | superseded
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by         UUID        REFERENCES users(id),
  decided_at         TIMESTAMPTZ,
  decision_note      TEXT
);
CREATE INDEX IF NOT EXISTS workflow_template_proposals_status
  ON workflow_template_proposals (template_key, status);
