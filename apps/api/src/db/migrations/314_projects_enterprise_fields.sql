-- Migration 314: enterprise-parity fields on `projects` (M1 of the
-- standalone Projects app program) — project number, customer link,
-- billing type/rate/currency, and a status taxonomy matching the reference
-- product (Not Started/In Progress/On Hold/Cancelled/Finished) instead of
-- the placeholder active/on_hold/completed/archived set migration 308
-- shipped with before any billing concept existed.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS ref TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS billing_type TEXT NOT NULL DEFAULT 'fixed'
  CHECK (billing_type IN ('fixed', 'hourly'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_rate NUMERIC(12,2);
-- Matches sales_invoices' own default (013_invoices_bills_settings.sql) —
-- this platform's established base currency.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS currency VARCHAR(5) NOT NULL DEFAULT 'TZS';

-- Status taxonomy widened to match the reference product exactly. Mapping
-- existing rows: active -> in_progress (a project mid-flight), completed
-- and archived both -> finished (this platform never distinguished "done"
-- from "done and put away" the way archived implied, and neither maps
-- naturally to "cancelled").
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
UPDATE projects SET status = 'in_progress' WHERE status = 'active';
UPDATE projects SET status = 'finished' WHERE status IN ('completed', 'archived');
ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'not_started';
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('not_started', 'in_progress', 'on_hold', 'cancelled', 'finished'));

CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id) WHERE customer_id IS NOT NULL;
