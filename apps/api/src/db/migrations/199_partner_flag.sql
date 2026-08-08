-- Chain partners are not the same records as customers.
--
-- GET /v1/customers/partners selected every row of `customers` with no filter,
-- so the CRM's "Chain Partners" page and its "Customers" page showed the same
-- 50 records under two menu items. Creating a "partner" created a customer,
-- which then appeared in both lists. There was no way to tell the two apart
-- because nothing distinguished them.
--
-- Flags rather than a type column, because in this business a company is
-- routinely both: a peer clearing agent who also ships their own consignments
-- is a partner *and* a customer, and a single `kind` would force somebody to
-- choose one and then duplicate the record to get the other.
--
-- Every existing row becomes a customer and not a partner. That is the
-- conservative reading: they were all created through customer flows, and the
-- partners page was showing them only because it had no filter. The page will
-- be empty until somebody marks the real partners, which is correct — an empty
-- list of partners is true, and a list of every customer was not.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_customer BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_partner  BOOLEAN NOT NULL DEFAULT false,
  -- What kind of partner, once one is marked. Free text rather than an enum:
  -- the list differs by trade lane and nobody has agreed one yet.
  ADD COLUMN IF NOT EXISTS partner_role VARCHAR(60);

-- A record that is neither is unreachable from either page — it would exist
-- and be invisible, which is worse than not existing.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_is_something;
ALTER TABLE customers ADD CONSTRAINT customers_is_something
  CHECK (is_customer OR is_partner);

CREATE INDEX IF NOT EXISTS customers_partner_lookup
  ON customers (tenant_id, is_partner) WHERE is_partner;

CREATE INDEX IF NOT EXISTS customers_customer_lookup
  ON customers (tenant_id, is_customer) WHERE is_customer;
