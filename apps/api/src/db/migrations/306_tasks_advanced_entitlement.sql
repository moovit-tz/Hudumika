-- Migration 306: 'tasks.advanced' entitlement — Projects/Milestones/PM mode
-- gated to HuduPlus and Hudu Advanced only.
--
-- Migration 213 granted the base 'tasks' key to every package purely to make
-- the app governable (its own comment: "this migration makes the apps
-- governable, it does not re-price anything") — tasks.routes.ts never
-- actually called requireEntitlement('tasks') though, so that grant was
-- inert. This migration closes that gap (the preHandler is added in the same
-- change) and, unlike 213/275's "every tier gets every module" default,
-- deliberately withholds the new Projects/Milestones/multi-collaborator/
-- billable/activity-log/attachments feature set from 'starter' (HuduStarter)
-- — a one-off, user-confirmed exception for this specific feature, not a
-- reversal of the platform's general per-seat-pricing philosophy.
--
-- package_code values are current tenants.plan codes (033/063/275): starter
-- (HuduStarter), growth (HuduPlus), enterprise (Hudu Advanced). 'scale' is
-- deactivated (275) with no tenants left on it, so it's omitted here.

INSERT INTO package_features (package_code, feature_key) VALUES
  ('growth', 'tasks.advanced'),
  ('enterprise', 'tasks.advanced')
ON CONFLICT DO NOTHING;
