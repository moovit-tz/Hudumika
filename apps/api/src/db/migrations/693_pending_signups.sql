-- Hosted-checkout onboarding: a signup that requires real payment can't
-- create its tenant synchronously (the customer pays on Flutterwave's own
-- page, confirmed later by a webhook) — this table holds the validated
-- signup payload (password already hashed) between "checkout created" and
-- "webhook confirmed payment", at which point onboarding.service.ts's
-- completeOnboarding() runs for real, same function used by every other
-- signup path. No RLS: pre-tenant by definition, same reasoning as
-- platform_transactions/billing_webhook_events being dbPlatform-only.
CREATE TABLE IF NOT EXISTS pending_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_ref TEXT UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  completed_tenant_id UUID REFERENCES tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_signups_tx_ref ON pending_signups(tx_ref);
