-- A carrier is a company, like a customer or supplier, and those already
-- carry a logo_url the identity API's SUBJECTS registry can serve — carriers
-- never got the same column, so every carrier rendered flat initials with no
-- way to ever change that. Nullable, no backfill: matches customers.logo_url
-- and suppliers.avatar_url, both added the same way.
ALTER TABLE carriers ADD COLUMN logo_url TEXT;
