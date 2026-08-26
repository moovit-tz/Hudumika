-- Migration 340: M11 of the corporate-tax build-out — expense claims
-- approval. Ships opt-in (tenant_settings.finance_expenses_require_approval,
-- default off/absent = today's unchanged instant-post behavior). No
-- per-category workflow config needed here, unlike M9's ap_approval_workflows
-- — a single tenant-wide flag is enough, so these are plain columns on
-- finance_expenses itself rather than a separate table, shaped after
-- hr_timesheet_approvals' own status/reviewed_by/reviewed_at/note fields.
--
-- DEFAULT 'APPROVED' — every existing row, and every row a tenant with the
-- flag off ever creates, is retroactively/immediately "approved": that's
-- the honest description of what "post straight to the ledger" has always
-- meant, and it's what keeps postExpenseToGl's unconditional-on-create
-- behavior correct without a second code path for the opted-out majority.
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'APPROVED';
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE finance_expenses DROP CONSTRAINT IF EXISTS finance_expenses_status_valid;
ALTER TABLE finance_expenses ADD CONSTRAINT finance_expenses_status_valid
  CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'));
