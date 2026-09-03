-- Password policy enforcement — Ondi ▸ Policies gains real complexity,
-- breach-check and rotation-age settings (alongside the session-timeout /
-- MFA-required fields it already had). Rotation is enforced as a visible
-- "your password is old, change it" signal, not a hard login block — a
-- third party's outage or a mis-set policy must never be able to lock an
-- entire tenant out of their own workspace. password_changed_at backs that
-- signal; backfilled to created_at so an existing account's age is real,
-- not "just changed" for everyone on upgrade day.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL;
