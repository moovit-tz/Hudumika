-- AgencyHost M8 — referral program: real attribution, real commission
-- tracking, deferred disbursement (no real mobile money aggregator is
-- connected anywhere in this platform yet — see referral-payout.service.ts).

ALTER TABLE tenants ADD COLUMN referred_by_tenant_id UUID REFERENCES tenants(id);

-- Platform-level, dual-tenant — same precedent as agency_managed_tenants
-- (migration 243): no RLS, because this table spans two tenants by design
-- and there is no precedent anywhere in this schema for a dual-tenant
-- OR-predicate RLS policy.
CREATE TABLE referral_commissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referring_tenant_id   UUID NOT NULL REFERENCES tenants(id),
  referred_tenant_id    UUID NOT NULL REFERENCES tenants(id),
  amount                NUMERIC(14,2) NOT NULL,
  currency              VARCHAR(3) NOT NULL,
  rate                  NUMERIC(5,4) NOT NULL,
  -- platform_transactions.tx_ref this commission was computed from — lets a
  -- human trace a commission back to the real payment event that earned it.
  source_payment_ref    VARCHAR(255),
  status                VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','flagged','approved','paid','rejected')),
  flagged_reason        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at            TIMESTAMPTZ,
  decided_by            UUID REFERENCES users(id),
  paid_at               TIMESTAMPTZ,
  -- Manual-payout fields — the same free-text method/note shape
  -- invoice_payments already uses, since no real disbursement provider
  -- exists to populate these automatically yet.
  payout_method         VARCHAR(50),
  payout_note           TEXT
);
CREATE INDEX idx_referral_commissions_referring ON referral_commissions(referring_tenant_id);
CREATE INDEX idx_referral_commissions_status ON referral_commissions(status);
-- One commission per referred tenant — a tenant only ever earns its
-- referrer a commission once (its own first payment), not on every payment.
CREATE UNIQUE INDEX idx_referral_commissions_referred_once ON referral_commissions(referred_tenant_id);
