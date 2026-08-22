-- Petti workflows — configurable department-approval → finance-release
-- process for petty-cash withdrawals, resolved per wallet (default) with an
-- optional per-category override, plus receipt retirement on the FinOps side
-- of a disbursement. Builds on 261_petti_wallets.sql.
--
-- Deliberately its own small table rather than reusing the ClearOS
-- workflows/workflow_steps engine (105_workflows.sql) or the generic
-- workflow_instances engine (222_workflow_instances.sql): neither has any
-- concept of a per-step approver (role or person) at all — every step there
-- is a data-presence check (entryConditions), not an actor check. Retrofitting
-- approver semantics into the shared engine used by ClearOS clearance
-- workflows would be a much larger, cross-cutting change than this feature
-- needs; Petti's whole process is exactly two possible gates (department
-- approval, then finance release), so a single boolean plus a named,
-- editable row per tenant covers "multiple workflows for different natures
-- of expense" without inventing unused generality.
CREATE TABLE IF NOT EXISTS petti_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  requires_department_approval BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_petti_workflows_tenant ON petti_workflows(tenant_id);

ALTER TABLE petti_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE petti_workflows FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'petti_workflows'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON petti_workflows
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Wallet-level workflow config: a default workflow for the wallet, an
-- optional per-category override map ({ "STAFF_WELFARE": "<workflow-id>" }),
-- and the two people who can act on that wallet's department-approval step —
-- a *specific person*, not a role, since "department manager" has no
-- reliable org-chart resolution anywhere in this schema (hr_employments'
-- manager_id was dropped in 206, profile.reports_to is write-only and never
-- resolved). approver_backup_user_id is deliberately editable by the
-- approver themselves (not just an admin) so they can name a stand-in while
-- away, without needing a finance admin to intervene every time.
ALTER TABLE petti_wallets ADD COLUMN IF NOT EXISTS default_workflow_id UUID REFERENCES petti_workflows(id) ON DELETE SET NULL;
ALTER TABLE petti_wallets ADD COLUMN IF NOT EXISTS category_workflow_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE petti_wallets ADD COLUMN IF NOT EXISTS approver_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE petti_wallets ADD COLUMN IF NOT EXISTS approver_backup_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Stamped at request time so a later edit to the wallet's default workflow
-- (or its category overrides) never retroactively changes which process an
-- already-submitted request is following.
ALTER TABLE petti_withdrawal_requests ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES petti_workflows(id) ON DELETE SET NULL;

-- Receipt retirement, on the FinOps expense row itself (not on the Petti
-- request) — "documented in FinOps" per the product ask: a petty-cash
-- disbursement is a cash advance, and retiring it (attaching proof of spend,
-- reconciling any variance) is a FinOps bookkeeping action, visible and
-- actionable straight from the Expenses screen rather than requiring a trip
-- back into Petti. Left 'not_required' (the default) for every expense not
-- sourced from a cash advance — this column has no meaning for a normal
-- typed-in expense. No DB CHECK constraint, matching this table's and
-- petti_withdrawal_requests's existing status columns — validated in
-- application code, not the schema.
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS retirement_status VARCHAR(20) NOT NULL DEFAULT 'not_required'; -- not_required | pending | retired | short | written_off
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS retired_by UUID;
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS retirement_note TEXT;
