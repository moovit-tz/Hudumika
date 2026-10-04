-- Migration 553: add 'owner_change' to crm_activities.type CHECK, and a
-- crm_tasks table for next-action tasks attached to deals and leads.
--
-- 'owner_change' fills the gap where PATCH /deals/:id and PATCH /leads/:id
-- already update owner_id / assigned_to_id but had no way to log the
-- reassignment onto the activity timeline (the old CHECK only covered the
-- six original types).

-- 1. Extend crm_activities.type to include owner_change and task types
ALTER TABLE crm_activities
  DROP CONSTRAINT IF EXISTS crm_activities_type_check;

ALTER TABLE crm_activities
  ADD CONSTRAINT crm_activities_type_check
    CHECK (type IN ('call', 'email', 'meeting', 'note', 'stage_change', 'created', 'owner_change', 'task_added', 'task_done'));

-- 2. crm_tasks — next-action tasks pinned to a deal or lead
CREATE TABLE IF NOT EXISTS crm_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('deal', 'lead')),
  subject_id   UUID NOT NULL,
  title        TEXT NOT NULL,
  due_at       TIMESTAMPTZ,
  done         BOOLEAN NOT NULL DEFAULT FALSE,
  done_at      TIMESTAMPTZ,
  assigned_to  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_subject ON crm_tasks(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_tenant  ON crm_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due     ON crm_tasks(tenant_id, due_at) WHERE done = FALSE;

ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_tasks_tenant ON crm_tasks
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 3. deal_quotation_id — soft link from a deal to a canonical quotation
ALTER TABLE deals ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES quotations(id) ON DELETE SET NULL;
