-- 421_metric_kpi_targets_period.sql
--
-- kpi-targets.service.ts (Phase M2 of METRICS_AND_SIGN_PLAN.md, in
-- progress concurrently) reads/writes a real `period` column
-- ('daily'|'weekly'|'monthly'|'quarterly', defaulting to 'monthly' and
-- used to convert a target into a day-count window) that
-- 420_metric_kpi_targets.sql never actually added — the service and the
-- TypeScript row type both already expected it; only the real schema was
-- missing it. Additive, matching the service's own fallback default.
ALTER TABLE metric_kpi_targets
  ADD COLUMN IF NOT EXISTS period TEXT NOT NULL DEFAULT 'monthly'
  CHECK (period IN ('daily', 'weekly', 'monthly', 'quarterly'));
