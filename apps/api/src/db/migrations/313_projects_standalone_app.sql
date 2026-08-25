-- Migration 313: Projects becomes its own standalone app, not a Tasks mode.
--
-- User confirmed (session decision, not a guess): the "Projects" work that
-- shipped as a Tasks-mode toggle this session (migrations 306-312) should
-- instead be a real standalone app in the launcher, matching the scale of
-- the reference tools it's being built to match (monday/ClickUp/Jira-tier
-- project management, not a Tasks sub-feature). This migration renames the
-- gating entitlement key from 'tasks.advanced' to 'projects' — same
-- growth/enterprise (HuduPlus+) tiers as before, just under the app's own
-- real identity. package_features rows for the old key are removed so
-- nothing stays silently, permanently granted under a key no code checks
-- anymore.

DELETE FROM package_features WHERE feature_key = 'tasks.advanced';

INSERT INTO package_features (package_code, feature_key) VALUES
  ('growth', 'projects'),
  ('enterprise', 'projects')
ON CONFLICT DO NOTHING;

-- The Simple/Projects mode switch this migration's sibling (312) added is
-- being removed along with it — Tasks reverts to being only the personal
-- to-do app it always was; Projects lives at its own /projects app now.
ALTER TABLE user_app_settings DROP COLUMN IF EXISTS tasks_mode;
