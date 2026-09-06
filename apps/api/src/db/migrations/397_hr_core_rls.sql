-- NexusHR/Recruitment RLS retrofit.
--
-- Confirmed live against pg_class during a full HR & Recruitment
-- production-readiness audit: relrowsecurity = false, zero policies, on
-- every one of the 27 tables below — including hr_payroll (exact per-period
-- basic_pay/allowances/deductions), hr_compensations (salary history),
-- hr_contracts, hr_documents (contracts, national ID scans, certificates)
-- and the recruitment pipeline (hr_job_openings/hr_candidates/hr_interviews).
-- Only hr_leave_balances, hr_leave_types, hr_overtime_requests, hr_cases,
-- hr_checklists/hr_checklist_items and hr_benefit_enrollments — all added
-- after the platform-wide RLS-hardening project (migrations 240-242) or in
-- their own dedicated RLS migration — actually got it.
--
-- Same root cause as 245_onsite_rls.sql: these tables predate that project
-- and were simply never swept up by it. The application layer has been
-- consistently scoping every query here by tenant_id (verified by reading
-- hr.routes.ts, nexushr.routes.ts and nexushr.service.ts in full during this
-- audit), so this is not evidence of an actual cross-tenant leak having
-- occurred — but until now this was the platform's single largest
-- concentration of sensitive tables (pay, banking-adjacent identity fields,
-- HR documents, candidate PII) with no second line of defense at all: one
-- missed `.where('tenant_id', ...)` anywhere in this surface, ever, would
-- have leaked silently with nothing in Postgres to catch it.
--
-- Same policy shape as every other table (e.g. 004_declarations.sql), same
-- FORCE rationale as 242_force_row_level_security.sql.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_job_openings', 'hr_candidates', 'hr_interviews',
    'hr_payroll', 'hr_documents', 'hr_document_requirements',
    'hr_contracts', 'hr_compensations', 'hr_assets', 'hr_goals',
    'hr_review_cycles', 'hr_review_instances', 'hr_leaves', 'hr_attendance',
    'hr_delete_requests', 'hr_invitations', 'hr_legal_entities',
    'hr_shifts', 'hr_shift_assignments', 'hr_designations',
    'hr_teams', 'hr_holidays', 'hr_tasks', 'hr_announcements',
    'hr_survey_templates', 'hr_survey_instances', 'hr_survey_responses'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;
