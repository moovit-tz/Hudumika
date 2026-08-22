-- Tasks + Calendar (079_tasks_calendar_app.sql, extended by 283/284) have
-- carried real tenant data since they shipped with zero Row Level Security —
-- the one app family in this platform that never got the FORCE RLS pass
-- (241_rls_restricted_roles.sql / 242_force_row_level_security.sql) applied
-- to it. Every route in tasks.routes.ts does correctly filter by tenant_id
-- via withTenant(), so this has not been an active leak in the code as
-- written — but with no database-level backstop at all, a single missed
-- .where('tenant_id', ...) in a future change would silently cross tenants
-- with nothing to catch it. Closing that gap here, matching the exact
-- tenant_isolation_policy pattern every other table in this platform uses
-- (see 001_tenancy.sql and, most recently, 280_package_app_quotas.sql).
--
-- Deliberately tenant-only, not user-level: this platform's RLS has never
-- encoded per-user/owner/assignee/share visibility (Notes' visibility model
-- — 282_notes_enterprise.sql — is enforced in application code, not RLS,
-- for the same reason) — inventing that here would be a novel, inconsistent
-- departure. The owner/assignee/shared-list access logic tasks.routes.ts
-- already implements (resolveTaskAccess) stays exactly as it is; this only
-- adds the same cross-tenant backstop every other table already has.

-- task_subtasks never had its own tenant_id (rows only ever reachable via
-- their parent task) — every other RLS'd table in this platform has a
-- direct column, so add one here rather than writing the one JOIN-based
-- policy that would otherwise exist nowhere else in the codebase.
ALTER TABLE task_subtasks ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE task_subtasks ts SET tenant_id = t.tenant_id
FROM tasks t WHERE t.id = ts.task_id AND ts.tenant_id IS NULL;
ALTER TABLE task_subtasks ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_subtasks_tenant ON task_subtasks(tenant_id);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['task_lists', 'tasks', 'task_subtasks', 'calendar_events', 'user_app_settings', 'todo_comments', 'task_list_shares']
  LOOP
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
