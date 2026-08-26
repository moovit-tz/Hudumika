-- Migration 338: M9 of the corporate-tax build-out — AP approval workflow.
-- Ships opt-in (tenant_settings.ap_approval_required, default off/absent =
-- today's unchanged auto-post behavior) — a hard behavior change on every
-- existing tenant's bill flow is not something a migration should force.
--
-- Modeled directly on petti_workflows/petti_wallets' own real per-actor (not
-- per-role) approval pattern: a named approver + backup, both real FKs to
-- users(id), not a role string. supplier_bills.status gains 'PENDING_APPROVAL'
-- as a pure app-level value — confirmed via migration history that
-- supplier_bills.status has never carried a DB-level CHECK constraint, so no
-- schema change is needed for the enum itself.

CREATE TABLE IF NOT EXISTS ap_approval_workflows (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  -- A bill qualifies for the workflow with the highest min_amount it still
  -- clears — e.g. a 0-and-up "Finance Manager" tier and a 5,000,000-and-up
  -- "Director" tier for the same tenant.
  min_amount               NUMERIC(16,2) NOT NULL DEFAULT 0,
  approver_user_id         UUID NOT NULL REFERENCES users(id),
  approver_backup_user_id  UUID REFERENCES users(id),
  active                   BOOLEAN NOT NULL DEFAULT true,
  created_by               UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ap_approval_workflows_min_amount_valid CHECK (min_amount >= 0),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS ap_approval_workflows_tenant ON ap_approval_workflows (tenant_id, min_amount DESC);

ALTER TABLE ap_approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_approval_workflows FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON ap_approval_workflows
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS approval_workflow_id UUID REFERENCES ap_approval_workflows(id);
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS submitted_for_approval_at TIMESTAMPTZ;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id);
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
