-- Migration 449: a real activity timeline for the CRM — Gap #7 of the
-- CRM-vs-top-10 analysis ("Next" tier). One record per lead/deal/customer
-- interaction (call, email, meeting, note) plus system events (created,
-- stage_change), so a database row becomes an actual relationship history
-- instead of a name with no context.
--
-- One table, not three — a lead becomes a deal (447_crm_deals.sql) and a
-- deal is often tied to a customer, so an activity naturally wants to be
-- visible from more than one angle. Rather than duplicating rows across
-- per-entity tables, subject_type/subject_id is a plain polymorphic pair
-- (no FK — the three subject tables don't share a namespace) and the CHECK
-- constraint below is the only thing keeping it honest at the DB layer;
-- every route that writes here validates the subject exists and belongs to
-- the caller's tenant before inserting, exactly the same trust boundary
-- contact_label_mappings' EXISTS-based RLS policy already established for
-- an FK-less relation.
--
-- meta is JSONB for event-specific detail (stage_change's from/to) that
-- doesn't want its own column and will never be queried on — body is the
-- human-readable line every activity type renders from.

CREATE TABLE crm_activities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('lead', 'deal', 'customer')),
  subject_id   UUID NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'note', 'stage_change', 'created')),
  body         TEXT NOT NULL,
  meta         JSONB,
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_activities_subject ON crm_activities(tenant_id, subject_type, subject_id, created_at DESC);

ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON crm_activities
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
