ALTER TABLE hr_overtime_requests
  ADD COLUMN IF NOT EXISTS policy_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN hr_overtime_requests.policy_version IS
  'Tenant payroll time-policy version used to classify and price this overtime claim.';
