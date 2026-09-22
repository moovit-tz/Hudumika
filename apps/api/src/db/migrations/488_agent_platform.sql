-- Milestone 0 of the Agentic Platform build (docs/architecture/
-- HUDUMIKA_AGENTIC_IMPLEMENTATION_2026-09-19.html). Nothing reads or writes
-- these tables yet — apps/api/src/services/agent-registry.ts (milestone 1)
-- is a pure library addition with no route, and later milestones are the
-- ones that actually populate these. Landed now, ahead of the code that
-- uses them, the same way migration 176 (ai_conversations/ai_messages/
-- ai_memory) preceded the chat feature it backs.
--
-- Seven tables, one per concept the ADR calls out as missing:
--
--   agent_identities      a registered agent — a real, named actor distinct
--                         from the human who asked it to act.
--   agent_tool_grants     which tools an identity may call, under what
--                         conditions, until when.
--   agent_runs            one user goal or event-driven execution.
--   agent_run_steps       the plan/tool-call/tool-result/transition history
--                         of one run, normalized (workflow_studio_runs'
--                         step_results JSONB blob is the closest existing
--                         shape, but a run here can span many tools across
--                         apps, not one workflow's fixed node graph).
--   agent_approvals       a durable human decision gate before consequential
--                         work — modeled on hr_offers' expiry+supersession
--                         (migration 399) and Ondi's dual-control quorum
--                         (migration 365), not a new invention.
--   agent_artifacts       something the agent produced (a worklist, a draft,
--                         a report) for a person to review or use.
--   agent_evidence        what grounds a claim the agent made — a real
--                         Hudumika record or a retrieved source, so an
--                         answer can be checked, not just trusted.
--
-- Every table is tenant_id-scoped and RLS-enforced per CLAUDE.md's rule —
-- the API still filters tenant_id explicitly in every query; RLS is the
-- second line, not the first.

CREATE TABLE IF NOT EXISTS agent_identities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- 'platform' = the one built-in "Workspace Agent" every tenant gets;
  -- 'specialist' = a future narrower agent (e.g. a FinOps-collections agent)
  -- registered against a subset of tools.
  kind          TEXT NOT NULL DEFAULT 'platform' CHECK (kind IN ('platform', 'specialist')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  -- Who registered/owns this identity — accountable for what it's granted.
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_tool_grants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id     UUID NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  -- References agent-registry.ts's AGENT_TOOL_REGISTRY ids, which are code,
  -- not a DB table — there is nothing to foreign-key against.
  tool_id      TEXT NOT NULL,
  -- Extra scoping beyond "may call this tool at all" — e.g. {"appId": "finops"}
  -- or {"maxAmountTzs": 500000} — read and enforced by the policy-decision
  -- step (milestone 2), not by this table.
  conditions   JSONB NOT NULL DEFAULT '{}'::jsonb,
  granted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  -- NULL = does not expire. Same convention as ondi_org_role_members.expires_at
  -- (migration 364) — the one grant-expiry pattern already proven in this codebase.
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, tool_id)
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id         UUID REFERENCES agent_identities(id) ON DELETE SET NULL,
  -- The human whose goal this is — always required, even for an
  -- event-triggered run (attributed to whoever owns that trigger).
  initiator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled')),
  -- The instruction, in the user's own words, or a synthesized description
  -- for an event-driven run.
  goal             TEXT NOT NULL,
  -- Which app/page the run was started from, so a run list can be filtered
  -- to "what did the agent do while I was in NexusHR" — not a foreign key,
  -- since an app id is code-defined (studio/triggers.ts's AppId), not a table.
  app_context      TEXT,
  provider         TEXT,
  model            TEXT,
  -- Ties a run back to an ai_conversations thread when the run began as a
  -- chat message, or to a domain_events row when event-triggered. Nullable
  -- and untyped (no FK) since it can point at either table.
  correlation_id   UUID,
  -- Cumulative estimated cost in USD across every model call this run made.
  cost_usd         NUMERIC(10, 4) NOT NULL DEFAULT 0,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_run_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id      UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  -- 1-based, in execution order — a run's transcript is `ORDER BY sequence`.
  sequence    INTEGER NOT NULL,
  step_type   TEXT NOT NULL CHECK (step_type IN ('plan', 'message', 'tool_call', 'tool_result', 'approval_requested', 'transition')),
  tool_id     TEXT,
  input       JSONB,
  output      JSONB,
  status      TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'skipped', 'simulated')),
  latency_ms  INTEGER,
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, sequence)
);

CREATE TABLE IF NOT EXISTS agent_approvals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id              UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_id             UUID REFERENCES agent_run_steps(id) ON DELETE SET NULL,
  tool_id             TEXT NOT NULL,
  -- What the tool would do, in plain language, plus its structured input —
  -- shown to the approver before they decide. Built from the same
  -- simulate() dry-run path Studio actions already support (actions.ts's
  -- ctx.simulate), not a separate preview implementation.
  requested_effect    TEXT NOT NULL,
  preview             JSONB,
  -- A role, not a specific person — mirrors every existing role-gated
  -- approval in this codebase (hr_offers.approved_by is a person, but the
  -- eligibility check is role-based; Ondi's break-glass is the one place a
  -- fixed head-count of *distinct* people is required, hence required_approvals).
  approver_role       TEXT NOT NULL,
  -- >1 only for the highest-risk tools, mirroring Ondi's break-glass
  -- dual-control (migration 365) — most approvals need exactly one decision.
  required_approvals  INTEGER NOT NULL DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  decided_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at          TIMESTAMPTZ,
  decision_note       TEXT,
  -- A pending approval nobody acts on must not sit forever — same
  -- "expires_in_hours becomes a real timestamp" shape as
  -- ondi_org_access_requests.
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per distinct approver on a quorum approval (required_approvals > 1)
-- — same shape as ondi_org_access_request_approvals (migration 365), which
-- is what makes "two different people" enforceable instead of one person
-- clicking twice.
CREATE TABLE IF NOT EXISTS agent_approval_decisions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  approval_id  UUID NOT NULL REFERENCES agent_approvals(id) ON DELETE CASCADE,
  approver_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision     TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (approval_id, approver_id)
);

CREATE TABLE IF NOT EXISTS agent_artifacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id            UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('worklist', 'draft', 'report', 'plan')),
  title             TEXT NOT NULL,
  content           JSONB NOT NULL,
  classification    TEXT NOT NULL DEFAULT 'internal' CHECK (classification IN ('internal', 'sensitive')),
  -- NULL = kept indefinitely (same as ai_conversations today has no retention job).
  retention_days    INTEGER,
  source_entity_type TEXT,
  source_entity_id   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_evidence (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id          UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_id         UUID REFERENCES agent_run_steps(id) ON DELETE SET NULL,
  -- The specific claim this evidence backs, e.g. "Aleka Holdings owes TZS 4.2M".
  claim           TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  -- A snapshot marker (e.g. the row's updated_at at read time) so a claim
  -- can be checked against what the record said *then*, not what it says now.
  entity_version  TEXT,
  source_url      TEXT,
  accessed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  access_decision TEXT NOT NULL DEFAULT 'allowed' CHECK (access_decision IN ('allowed', 'denied')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_identities_tenant ON agent_identities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_tool_grants_agent ON agent_tool_grants(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant_user ON agent_runs(tenant_id, initiator_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_run_steps_run ON agent_run_steps(run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_tenant_status ON agent_approvals(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_run ON agent_approvals(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_approval_decisions_approval ON agent_approval_decisions(approval_id);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run ON agent_artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_evidence_run ON agent_evidence(run_id);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_identities', 'agent_tool_grants', 'agent_runs', 'agent_run_steps',
    'agent_approvals', 'agent_approval_decisions', 'agent_artifacts', 'agent_evidence'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;
