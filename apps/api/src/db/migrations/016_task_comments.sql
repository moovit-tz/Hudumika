-- Migration 016: Task comments with @mention support

CREATE TABLE IF NOT EXISTS task_comments (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id      UUID         NOT NULL REFERENCES shipment_tasks(id) ON DELETE CASCADE,
  shipment_id  UUID         NOT NULL,
  author_id    VARCHAR(255) NOT NULL,
  author_name  VARCHAR(255) NOT NULL,
  content      TEXT         NOT NULL,
  mentions     JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- [{user_id, name}]
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task    ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_tenant  ON task_comments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_ship    ON task_comments(shipment_id);
