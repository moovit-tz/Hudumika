-- Self-service profile fields (bio, job title override, city, country,
-- timezone, language, website) that the "My Profile" page's Personal Info
-- form already collects but had nowhere to persist. Kept as one JSONB blob
-- rather than seven skinny nullable columns — same convention already used
-- by tenant_settings.settings, since none of these are ever filtered/joined
-- on, only read back whole for one user at a time.
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile JSONB DEFAULT '{}'::jsonb;
