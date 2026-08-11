-- Migration 218: platform workflow templates — the superadmin-managed,
-- versioned library that tenants see and adopt, plus adoption lineage.
--
-- Templates are platform-global (no tenant_id): the superadmin authors and
-- versions them; every tenant sees the published ones and can clone one into
-- their own workflows with "Use template". A template stores its steps
-- denormalized as JSONB (name/order/conditions/comms/sla/colour + next-by-key,
-- the same DefaultStepDef shape config/default-workflows.ts uses) because a
-- template is read-then-cloned, never queried per-step at runtime the way a
-- live tenant workflow is.
--
-- `source` distinguishes platform-shipped ('platform'), superadmin-authored
-- ('superadmin') and machine-proposed ('learned' — the self-learning phase
-- writes proposals here as draft versions for approval).
--
-- Lineage columns on `workflows` record which template (and which version) a
-- tenant workflow was seeded/adopted from, so a tenant's later edits can be
-- diffed against the template — the raw signal the self-learning phase mines.

CREATE TABLE IF NOT EXISTS workflow_templates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key      TEXT        NOT NULL,
  version           INTEGER     NOT NULL DEFAULT 1,
  name              TEXT        NOT NULL,
  description       TEXT        NOT NULL DEFAULT '',
  freight_modes     JSONB       NOT NULL DEFAULT '[]',
  consignment_types JSONB       NOT NULL DEFAULT '[]',
  steps             JSONB       NOT NULL DEFAULT '[]',
  status            TEXT        NOT NULL DEFAULT 'published',  -- draft | published | archived
  is_system         BOOLEAN     NOT NULL DEFAULT false,       -- shipped-by-platform vs superadmin/learned
  source            TEXT        NOT NULL DEFAULT 'platform',   -- platform | superadmin | learned
  created_by        UUID        REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_templates_key_version ON workflow_templates (template_key, version);
CREATE INDEX IF NOT EXISTS workflow_templates_published ON workflow_templates (template_key, status, version DESC);

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS origin_template_key TEXT;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS origin_template_version INTEGER;
