-- Migration 018: Task Enhancements (descriptions, labels, cover, checklists)

-- ── Enhance shipment_tasks ────────────────────────────────────────────────────
ALTER TABLE shipment_tasks
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS labels      JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cover_color VARCHAR(20);

-- ── Checklists ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_checklists (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id     UUID         NOT NULL REFERENCES shipment_tasks(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL DEFAULT 'Checklist',
  position    INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_checklists_task   ON task_checklists(task_id);
CREATE INDEX IF NOT EXISTS idx_task_checklists_tenant ON task_checklists(tenant_id);

-- ── Checklist Items ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_checklist_items (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id  UUID         NOT NULL REFERENCES task_checklists(id) ON DELETE CASCADE,
  task_id       UUID         NOT NULL,
  title         TEXT         NOT NULL,
  completed     BOOLEAN      NOT NULL DEFAULT FALSE,
  completed_by  VARCHAR(255),
  completed_at  TIMESTAMPTZ,
  due_date      DATE,
  assigned_to   VARCHAR(255),
  position      INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tcl_items_checklist ON task_checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_tcl_items_task      ON task_checklist_items(task_id);
