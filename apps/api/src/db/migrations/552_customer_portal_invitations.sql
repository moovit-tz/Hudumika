-- ── Migration 552: Customer portal invitations ──
-- Backs POST /v1/customers/:id/invite — creates a one-time token that lets a
-- customer set up their own portal login. Separate from hr_invitations (which
-- is for staff) so that the `customer_id` FK and the CUSTOMER-only role
-- constraint live in one clear place instead of being bolted onto a staff table.
CREATE TABLE IF NOT EXISTS customer_invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email        VARCHAR(255) NOT NULL,
  token        VARCHAR(64) NOT NULL UNIQUE,
  invited_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING | ACCEPTED | EXPIRED | REVOKED
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cust_inv_tenant     ON customer_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cust_inv_token      ON customer_invitations(token);
CREATE INDEX IF NOT EXISTS idx_cust_inv_customer   ON customer_invitations(customer_id);
CREATE INDEX IF NOT EXISTS idx_cust_inv_email      ON customer_invitations(email);

ALTER TABLE customer_invitations ENABLE ROW LEVEL SECURITY;

-- Staff (non-CUSTOMER roles) can see and manage invitations for their own tenant.
CREATE POLICY customer_invitations_tenant ON customer_invitations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
