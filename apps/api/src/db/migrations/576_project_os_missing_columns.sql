-- Migration 576: Add computed/tracked Project OS columns expected by the service layer
-- Migration 448 created the core governance tables but the types drifted — these
-- columns were defined in the Kysely interface but never added to the DB.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS baseline_budget NUMERIC(16,4) NOT NULL DEFAULT 0.0000;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS current_budget NUMERIC(16,4) NOT NULL DEFAULT 0.0000;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(16,4) NOT NULL DEFAULT 0.0000;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS earned_value NUMERIC(16,4) NOT NULL DEFAULT 0.0000;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS planned_value NUMERIC(16,4) NOT NULL DEFAULT 0.0000;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS location_address VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

CREATE INDEX IF NOT EXISTS idx_projects_health ON projects(tenant_id, health_status);
