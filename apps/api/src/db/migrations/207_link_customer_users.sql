-- Which customer a CUSTOMER-role login actually belongs to.
--
-- Eleven places decided this by comparing `shipment.customer_id` to `user.sub`
-- — the login's own id — on the assumption that a customer user's row id is
-- also their `customers` row id. It never is. In this database the one customer
-- login is 299f590e… and their company record is bedf5db7…, and the number of
-- shipments whose customer_id equals that login's id is zero.
--
-- So every customer-scoped read returned nothing: a customer could not open
-- their own shipment ("Shipment not found"), and their invoices and quotations
-- came back empty. The portal worked perfectly and showed them none of their
-- own data.
--
-- One endpoint, GET /shipments/grouped, already did it correctly by looking the
-- customer up on matching email. That is the right answer but the wrong
-- mechanism to repeat eleven times: it is a query per request, and it silently
-- picks one row when two customers share an address. A column states the link
-- once.
--
-- ON DELETE SET NULL rather than CASCADE: removing a company record must not
-- delete the person's login.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_customer_id_idx ON users (customer_id) WHERE customer_id IS NOT NULL;

-- Backfill only where the match is unambiguous: one customer in the same
-- tenant with that email. A login whose address matches two customer records
-- is left NULL rather than attached to whichever the database returned first —
-- that is the mistake this migration exists to undo, and guessing again here
-- would just move it.
UPDATE users u
   SET customer_id = c.id
  FROM customers c
 WHERE u.role = 'CUSTOMER'
   AND u.customer_id IS NULL
   AND c.tenant_id = u.tenant_id
   AND lower(c.email) = lower(u.email)
   AND (SELECT count(*) FROM customers c2
         WHERE c2.tenant_id = u.tenant_id AND lower(c2.email) = lower(u.email)) = 1;

COMMENT ON COLUMN users.customer_id IS
  'For CUSTOMER-role logins: the customers row they act for. NULL means unlinked — such a user sees nothing, which is correct until somebody says who they are.';
