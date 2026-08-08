-- Identity that every app can read the same way.
--
-- A company rendered differently depending on which app was showing it:
-- `customers` carried avatar_color and avatar_initials, `chain_partners`
-- carried nothing at all, and every page that showed a company invented its own
-- fallback. Colour and initials are now derived from the name in one place
-- (identity.routes.ts) so they agree everywhere without needing to be stored,
-- which also means they cannot drift out of sync with a renamed company.
--
-- What genuinely does need storing is a real logo, which no table had.

-- Only `customers` here, because there is no partners table: GET
-- /v1/customers/partners selects every row of `customers` with no filter, so
-- the CRM's "Chain Partners" page and its "Customers" page show the same
-- records. That is worth fixing and is not this migration's job — noted so the
-- absence of a chain_partners table is not read as an oversight here.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- The derived pair on `customers` is left in place rather than dropped. Other
-- code still reads it, and a column that is merely redundant is not worth a
-- breaking change in the same migration that introduces its replacement.
COMMENT ON COLUMN customers.avatar_color IS
  'Superseded by the colour derived in identity.routes.ts. Kept for existing readers.';
COMMENT ON COLUMN customers.avatar_initials IS
  'Superseded by the initials derived in identity.routes.ts. Kept for existing readers.';
