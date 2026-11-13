-- Give a time interval an explicit, namespaced work-item reference.
-- Product IDs are intentionally stored as strings: independently deployed apps
-- may use different ID formats and own their own entity lifecycle.
ALTER TABLE hr_time_entries
  ADD COLUMN IF NOT EXISTS work_item_app_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS work_item_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS work_item_id VARCHAR(200),
  ADD COLUMN IF NOT EXISTS work_item_ref VARCHAR(200),
  ADD COLUMN IF NOT EXISTS work_item_label VARCHAR(200);

-- Backfill links where the legacy UUID can be resolved inside this tenant.
UPDATE hr_time_entries e
SET work_item_app_id = 'clearos',
    work_item_type = 'shipment',
    work_item_id = e.project_id::text,
    work_item_ref = COALESCE(e.project_ref, s.ref_number),
    work_item_label = COALESCE(s.goods_desc, s.ref_number)
FROM shipment_cases s
WHERE e.project_id = s.id
  AND e.tenant_id = s.tenant_id
  AND e.work_item_id IS NULL;

UPDATE hr_time_entries e
SET work_item_app_id = 'projects',
    work_item_type = 'project',
    work_item_id = e.project_id::text,
    work_item_ref = COALESCE(e.project_ref, p.name),
    work_item_label = p.name
FROM projects p
WHERE e.project_id = p.id
  AND e.tenant_id = p.tenant_id
  AND e.work_item_id IS NULL;

UPDATE hr_time_entries e
SET work_item_app_id = 'nexushr',
    work_item_type = 'task',
    work_item_id = e.task_id::text,
    work_item_ref = NULL,
    work_item_label = COALESCE(t.name, e.task_name)
FROM hr_tasks t
WHERE e.task_id = t.id
  AND e.tenant_id = t.tenant_id
  AND e.work_item_id IS NULL;

ALTER TABLE hr_time_entries
  ADD CONSTRAINT hr_time_work_item_shape
  CHECK (
    (work_item_app_id IS NULL AND work_item_type IS NULL AND work_item_id IS NULL)
    OR (work_item_app_id IS NOT NULL AND work_item_type IS NOT NULL AND work_item_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_hr_time_work_item
  ON hr_time_entries (tenant_id, work_item_app_id, work_item_type, work_item_id)
  WHERE work_item_id IS NOT NULL;
