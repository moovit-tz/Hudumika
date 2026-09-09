-- Tasks-app audit turned up a gap in a different app: task_comments,
-- task_checklists and task_checklist_items (008/016_task_comments.sql-era
-- tables, actually ClearOS's shipment-task discussion/checklist feature —
-- shipments.routes.ts, not the personal/team Tasks app despite the shared
-- "task_" prefix) had zero RLS at the database layer. Missed by
-- 242_force_row_level_security.sql (predates it) and by every later
-- retrofit pass (296_finops_core_rls.sql, 397_hr_core_rls.sql,
-- 405_bliss_rls_gap.sql, 440_contacts_rls_gap.sql) — none of those audits
-- had ClearOS's task checklists in scope either. Confirmed live against
-- the dev DB's pg_class: relrowsecurity/relforcerowsecurity were false on
-- all three before this migration, despite shipments.routes.ts already
-- scoping every query on tenant_id (RLS is the second line of defense
-- CLAUDE.md describes, not a substitute for that).
--
-- task_comments and task_checklists both carry tenant_id directly and get
-- the standard direct policy. task_checklist_items carries no tenant_id of
-- its own (shipments.routes.ts's own comment: "it inherits scope from its
-- checklist") — its policy scopes through task_checklists via EXISTS,
-- same shape as sales_invoice_lines' policy in 296_finops_core_rls.sql and
-- contact_label_mappings' in 440_contacts_rls_gap.sql.

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'task_comments'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON task_comments
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE task_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_checklists FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'task_checklists'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON task_checklists
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE task_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_checklist_items FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'task_checklist_items'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON task_checklist_items
      USING (EXISTS (
        SELECT 1 FROM task_checklists tc
        WHERE tc.id = task_checklist_items.checklist_id
          AND tc.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      ));
  END IF;
END $$;
