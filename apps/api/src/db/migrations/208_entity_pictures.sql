-- A picture is not a property of being a user account.
--
-- Only `users` could have one. Everybody else the platform shows as a face or
-- a mark was drawn from initials with no way to change that: a lead in CRM, a
-- supplier in Finance. Two tables were half-way there — `contacts.avatar_url`
-- existed but only Google sync ever wrote it, and `drivers.avatar_url` was
-- selected in FleetOps and Tracking but written by nothing at all.
--
-- These two columns complete the set, so one endpoint can serve every subject
-- the identity service knows about rather than each app inventing its own.
--
-- `drivers.photo_url` is deliberately left alone. It holds no data, but
-- tracking.routes.ts still reads it as a fallback (`avatar_url || photo_url`),
-- and dropping a column to tidy up is not worth breaking a live query for.
-- Writes go to avatar_url.

ALTER TABLE leads     ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN leads.avatar_url     IS 'Base64 data URI, set through PUT /v1/identity/leads/:id/avatar. Served as a blob, never embedded in list payloads.';
COMMENT ON COLUMN suppliers.avatar_url IS 'Base64 data URI, set through PUT /v1/identity/suppliers/:id/avatar. Served as a blob, never embedded in list payloads.';
