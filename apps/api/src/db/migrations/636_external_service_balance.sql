-- External Services Balance (ESB) — Phase 2 of the commercial plan.
--
-- A per-tenant TZS prepaid balance that funds metered external service
-- consumption (AI provider calls, SMS delivery, OCR, future providers).
-- NOT the same as AI credits (usage allowance, no money) or Petti wallets
-- (GL-backed petty cash). ESB is platform billing infrastructure: real
-- money in via Flutterwave top-ups, real money out via provider charges.
--
-- Append-only ledger with a reservation pattern:
--   1. Consumer quotes a maximum cost → RESERVE posting (negative)
--   2. Provider call completes → CAPTURE posting (adjusts to actual)
--   3. If call fails or underruns → RELEASE posting (returns unused)
--   4. Uncertain outcomes → RECONCILE (manual or scheduled)
--
-- Available balance = SUM(amount) WHERE status IN ('posted','captured')
-- i.e. reserves reduce available funds; releases/refunds restore them.

-- One wallet row per tenant (auto-created on first top-up or usage).
CREATE TABLE IF NOT EXISTS esb_wallets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  currency    VARCHAR(5) NOT NULL DEFAULT 'TZS',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_esb_wallets_tenant ON esb_wallets(tenant_id);

-- Append-only ledger — every money movement is an immutable posting.
-- Positive = funds in (top-up, release, refund).
-- Negative = funds out (reserve, capture).
CREATE TABLE IF NOT EXISTS esb_postings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wallet_id       UUID NOT NULL REFERENCES esb_wallets(id) ON DELETE CASCADE,
  -- posting_type drives the lifecycle:
  --   top_up   — customer funded the wallet (always positive)
  --   reserve  — hold placed for an in-flight service call (negative)
  --   capture  — actual charge after provider response (negative, replaces reserve)
  --   release  — return of unused reservation (positive)
  --   refund   — correction/provider credit (positive)
  posting_type    VARCHAR(20) NOT NULL CHECK (posting_type IN ('top_up','reserve','capture','release','refund')),
  amount          NUMERIC(15,2) NOT NULL,
  currency        VARCHAR(5) NOT NULL DEFAULT 'TZS',
  -- Links a reserve→capture→release chain
  reservation_id  UUID REFERENCES esb_postings(id) ON DELETE SET NULL,
  -- What service consumed this
  service_kind    VARCHAR(50),  -- 'ai', 'sms', 'ocr', etc.
  service_ref     TEXT,         -- provider-specific reference (run_id, message_id, etc.)
  -- Supplier cost in the provider's own currency (for FX reconciliation)
  supplier_amount NUMERIC(15,4),
  supplier_currency VARCHAR(5),
  -- Top-up payment references
  gateway_provider TEXT,        -- 'flutterwave', etc.
  gateway_tx_ref   TEXT,        -- our tx_ref sent to gateway
  gateway_tx_id    TEXT,        -- gateway's own transaction ID
  -- Metadata
  description     TEXT,
  initiated_by    UUID,         -- user who triggered (null for system/automated)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_esb_postings_tenant ON esb_postings(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esb_postings_wallet ON esb_postings(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esb_postings_reservation ON esb_postings(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_esb_postings_type ON esb_postings(tenant_id, posting_type) WHERE posting_type = 'reserve';

-- Service operations — tracks the lifecycle of a single external call,
-- from quote through dispatch to settlement. Each operation links to its
-- reserve/capture/release postings but carries the provider-level detail
-- (model, tokens, segments) that the financial posting shouldn't.
CREATE TABLE IF NOT EXISTS esb_operations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wallet_id       UUID NOT NULL REFERENCES esb_wallets(id) ON DELETE CASCADE,
  service_kind    VARCHAR(50) NOT NULL,
  -- quote → reserved → dispatched → captured → released | failed | reconciling
  status          VARCHAR(20) NOT NULL DEFAULT 'quote'
                  CHECK (status IN ('quote','reserved','dispatched','captured','released','failed','reconciling')),
  -- The cost ceiling the consumer consented to (TZS)
  quoted_amount   NUMERIC(15,2) NOT NULL,
  -- Actual charge after provider response (null until captured)
  actual_amount   NUMERIC(15,2),
  -- Supplier-side cost
  supplier_amount NUMERIC(15,4),
  supplier_currency VARCHAR(5),
  -- Provider detail (model name, token counts, segment counts, etc.)
  provider_detail JSONB NOT NULL DEFAULT '{}',
  -- Linked postings
  reserve_posting_id  UUID REFERENCES esb_postings(id) ON DELETE SET NULL,
  capture_posting_id  UUID REFERENCES esb_postings(id) ON DELETE SET NULL,
  release_posting_id  UUID REFERENCES esb_postings(id) ON DELETE SET NULL,
  -- Who/what triggered this
  initiated_by    UUID,
  source_app      VARCHAR(50),
  source_ref      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_esb_operations_tenant ON esb_operations(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esb_operations_status ON esb_operations(tenant_id, status) WHERE status IN ('reserved','dispatched','reconciling');

-- RLS on all three tables
ALTER TABLE esb_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE esb_wallets FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'esb_wallets'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON esb_wallets
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE esb_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE esb_postings FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'esb_postings'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON esb_postings
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE esb_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE esb_operations FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'esb_operations'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON esb_operations
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
