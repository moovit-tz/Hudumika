-- 415_data_quality_findings.sql
--
-- Milestone 4 of the Metric Registry program (see 411/413/414): a real
-- data-quality checker over domain_events and the tenant tables that feed
-- the metric registry (stage_history, support_tickets) — §26/§27 of the
-- metrics program, scoped to checks this schema can actually support
-- rather than every item on that list. Two were skipped on purpose after
-- checking the real schema first, not built and then found redundant:
--   - "orphan actor_id" — domain_events.actor_id already carries a real
--     FK (REFERENCES users(id), migration 204) — Postgres itself makes
--     this impossible, so a checker for it would never find anything.
--   - "missing tenant scope" — tenant_id is NOT NULL with a real FK on
--     every RLS-enabled table already; same reasoning.
--
-- Cross-tenant by design (a platform engineering/ops surface, same shape
-- as reports.service.ts's own tenant-comparison metrics) — no RLS here,
-- SUPER_ADMIN-only at the route layer, same as Lens and the rest of
-- HuduBI's "PLATFORM · SUPER ADMIN" nav section this is added alongside.
CREATE TABLE data_quality_findings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL,
  run_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id    UUID REFERENCES tenants(id) ON DELETE CASCADE,
  check_key    TEXT NOT NULL,
  severity     TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  table_name   TEXT NOT NULL,
  finding_count INTEGER NOT NULL,
  sample_ids   JSONB NOT NULL DEFAULT '[]',
  description  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dqf_run ON data_quality_findings(run_id);
CREATE INDEX idx_dqf_tenant_check ON data_quality_findings(tenant_id, check_key, run_at DESC);
