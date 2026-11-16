-- The HR app's customer-facing name is now Axis (it was NexusHR).
--
-- Only display labels change. The app id, entitlement key, route
-- (/nexushr), event keys and every database identifier stay 'nexushr'.
--
-- What is rewritten, and why it is safe:
--   * Platform branding (the global settings row): apps.nexushr.name, only
--     while it still holds the old default 'NexusHR'. A name a SuperAdmin
--     deliberately changed to something else is left alone. Workspace
--     (tenant) branding rows are NOT touched: a workspace that typed a name
--     chose it, whatever it is.
--   * The `application` label on email templates, marketplace templates and
--     comm events: a grouping label set by the platform, never typed by a
--     customer.
--   * The app name printed in the header cell of seeded email templates —
--     platform marketplace copies always, workspace copies only when they
--     were never edited (revision 1 and no updated_by). An edited template
--     keeps its text.
--   * The owner label of the system-managed "Personnel Records" drive.
--
-- Rollback: run the same statements with 'Axis' and 'NexusHR' swapped. The
-- edited-template guard means a rollback cannot touch customer edits either.

UPDATE tenant_settings
SET settings = jsonb_set(settings::jsonb, '{branding,apps,nexushr,name}', '"Axis"'::jsonb)
WHERE tenant_id = '00000000-0000-0000-0000-000000000000'
  AND settings::jsonb #>> '{branding,apps,nexushr,name}' = 'NexusHR';

UPDATE marketplace_email_templates SET application = 'Axis' WHERE application = 'NexusHR';
UPDATE email_templates SET application = 'Axis' WHERE application = 'NexusHR';
UPDATE comm_events SET application = 'Axis' WHERE application = 'NexusHR';

UPDATE marketplace_email_templates
SET body_html = replace(body_html, '>NexusHR</td>', '>Axis</td>')
WHERE body_html LIKE '%>NexusHR</td>%';

UPDATE email_templates
SET body_html = replace(body_html, '>NexusHR</td>', '>Axis</td>')
WHERE body_html LIKE '%>NexusHR</td>%'
  AND revision = 1 AND updated_by IS NULL;

UPDATE cloud_drives SET owner_name = 'Axis'
WHERE managed_purpose = 'nexushr' AND owner_name = 'NexusHR';
