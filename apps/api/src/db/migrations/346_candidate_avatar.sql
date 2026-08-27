-- A recruiting candidate is a person the same way a driver or a contact is,
-- but hr_candidates never got a picture column — every candidate card
-- rendered flat initials with no way to ever change that. Nullable, no
-- backfill: same shape as drivers.avatar_url / contacts.avatar_url.
ALTER TABLE hr_candidates ADD COLUMN avatar_url TEXT;
