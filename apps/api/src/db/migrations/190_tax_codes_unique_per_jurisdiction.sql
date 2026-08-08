-- A workspace can be in more than one country.
--
-- `tax_codes` has been unique on (tenant_id, code) since migration 180, which
-- was right while every workspace lived in one jurisdiction. It stops being
-- right the moment a tenant operates in two: a Kenyan STD at 16% and a
-- Tanzanian STD at 18% are different codes with the same handle, and the old
-- index made the second one impossible to create.
--
-- Uniqueness moves to (tenant_id, jurisdiction, code). That is what the handle
-- always meant — "the standard code, here" — and it is what lets a tenant
-- switch or add a country without renaming anything.
--
-- Nothing existing collides: every tenant currently holds codes for exactly one
-- jurisdiction, so this widens the constraint rather than relaxing a rule
-- anything depended on.

DROP INDEX IF EXISTS tax_codes_tenant_code_uq;

CREATE UNIQUE INDEX IF NOT EXISTS tax_codes_tenant_juris_code_uq
  ON tax_codes (tenant_id, jurisdiction, code);

-- The one-default-per-side index becomes one default per side *per country*,
-- for the same reason: a tenant selling in Tanzania and Kenya needs a default
-- sales treatment in each.
DROP INDEX IF EXISTS tax_codes_tenant_default_uq;
CREATE UNIQUE INDEX IF NOT EXISTS tax_codes_tenant_default_uq
  ON tax_codes (tenant_id, jurisdiction, applies_to) WHERE is_default;

COMMENT ON COLUMN tax_codes.code IS
  'Short handle, unique per tenant per jurisdiction — "the standard code here". '
  'A tenant in two countries holds a STD in each, at each country''s own rate.';
