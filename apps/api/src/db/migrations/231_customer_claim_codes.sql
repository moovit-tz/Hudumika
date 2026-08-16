-- Migration 231: Self-service claim codes for Organization ↔ customer linking.
--
-- Linking an Organization (migration 230) to a tenant's own customer record
-- is staff-initiated only — an Organization asserting "I am this customer"
-- unverified would be real cross-tenant data exposure. This gives staff a
-- safe self-service alternative: issue a one-time code that only reaches
-- the REAL customer's own registered email/WhatsApp, and only that code —
-- not a name or tax_id claim — can complete the link. Same trust model as
-- password_reset_tokens (possession of a token mailed to a controlled
-- address is the proof), whose shape this mirrors directly: a single-use
-- guard on the row itself (used_at), not a separate status enum.

CREATE TABLE customer_claim_codes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token          VARCHAR(64) NOT NULL UNIQUE,
  issued_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ,
  used_by_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_customer_claim_codes_token ON customer_claim_codes(token);
CREATE INDEX idx_customer_claim_codes_customer ON customer_claim_codes(customer_id);
