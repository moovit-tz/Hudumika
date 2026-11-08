-- S05 (payments/settlement): invoices.routes.ts's POST /:id/gateway-checkout
-- already makes a real outbound call to Stripe/Flutterwave/Paystack and
-- returns a real hosted checkout link, but nothing records that a checkout
-- was started, so there was no way for an inbound webhook to resolve a
-- gateway's own transaction reference back to the invoice/tenant it
-- belongs to, or to tell "already settled" from "still pending" to stay
-- idempotent against a provider's at-least-once webhook delivery (duplicate
-- events, or a late webhook arriving after the browser already redirected).
-- This table is the missing other half: one row per checkout attempt,
-- created right after the gateway accepts it, updated exactly once by
-- whichever happens first — the webhook or an explicit reconciliation poll.
CREATE TABLE IF NOT EXISTS gateway_checkout_sessions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id              UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  gateway                 VARCHAR(20) NOT NULL,
  tx_ref                  VARCHAR(150) NOT NULL,
  amount                  NUMERIC(16,2) NOT NULL,
  currency                VARCHAR(10) NOT NULL,
  -- pending: checkout created, no provider result yet.
  -- settled: a provider confirmation (webhook or verify-by-reference) has
  --          been applied — exactly once; see the unique partial index
  --          below and the row's own invoice_payment_id.
  -- failed:  the provider itself reported the attempt did not succeed
  --          (declined, cancelled, expired) — distinct from "pending",
  --          since this one is a fact already known, not still waiting.
  status                  VARCHAR(16) NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'settled', 'failed')),
  provider_transaction_id VARCHAR(100),
  invoice_payment_id      UUID REFERENCES invoice_payments(id),
  created_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at              TIMESTAMPTZ
);

-- A tenant's own tx_ref values must not collide (two checkouts for the same
-- invoice get distinct refs already via Date.now(), but the constraint is
-- what actually keeps a webhook lookup unambiguous).
CREATE UNIQUE INDEX IF NOT EXISTS gateway_checkout_sessions_tenant_txref_uq
  ON gateway_checkout_sessions (tenant_id, gateway, tx_ref);

CREATE INDEX IF NOT EXISTS gateway_checkout_sessions_invoice_idx
  ON gateway_checkout_sessions (invoice_id);

ALTER TABLE gateway_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_checkout_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gateway_checkout_sessions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
