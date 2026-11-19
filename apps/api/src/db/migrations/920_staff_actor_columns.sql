-- Follows 919_staff_console.sql.
--
-- 919 gave the "who did it" columns (granted_by, revoked_by, added_by, …)
-- foreign keys to users ON DELETE SET NULL, while the same rows reference the
-- grant holder with ON DELETE CASCADE. When one statement deletes both people
-- (deleting a workspace that contains staff), Postgres applies the SET NULL
-- update to a row whose staff membership has already been cascaded away, and
-- the update fails its own foreign-key check — the workspace cannot be deleted.
--
-- These columns are history: who granted or ended something. They keep the
-- user id as recorded and lose the constraint, the same way audit logs keep an
-- actor id after the person is gone.
ALTER TABLE staff_role_grants          DROP CONSTRAINT IF EXISTS staff_role_grants_granted_by_fkey,
                                       DROP CONSTRAINT IF EXISTS staff_role_grants_revoked_by_fkey;
ALTER TABLE staff_permission_overrides DROP CONSTRAINT IF EXISTS staff_permission_overrides_granted_by_fkey,
                                       DROP CONSTRAINT IF EXISTS staff_permission_overrides_revoked_by_fkey;
ALTER TABLE staff_scope_grants         DROP CONSTRAINT IF EXISTS staff_scope_grants_granted_by_fkey,
                                       DROP CONSTRAINT IF EXISTS staff_scope_grants_revoked_by_fkey;
ALTER TABLE staff_members              DROP CONSTRAINT IF EXISTS staff_members_created_by_fkey;
ALTER TABLE staff_roles                DROP CONSTRAINT IF EXISTS staff_roles_updated_by_fkey;
ALTER TABLE staff_teams                DROP CONSTRAINT IF EXISTS staff_teams_created_by_fkey;
ALTER TABLE staff_team_members         DROP CONSTRAINT IF EXISTS staff_team_members_added_by_fkey,
                                       DROP CONSTRAINT IF EXISTS staff_team_members_removed_by_fkey;
ALTER TABLE staff_customer_accounts    DROP CONSTRAINT IF EXISTS staff_customer_accounts_updated_by_fkey;
ALTER TABLE staff_customer_contacts    DROP CONSTRAINT IF EXISTS staff_customer_contacts_created_by_fkey;
ALTER TABLE staff_routing_rules        DROP CONSTRAINT IF EXISTS staff_routing_rules_created_by_fkey;
ALTER TABLE staff_access_sessions      DROP CONSTRAINT IF EXISTS staff_access_sessions_approved_by_fkey,
                                       DROP CONSTRAINT IF EXISTS staff_access_sessions_ended_by_fkey;
