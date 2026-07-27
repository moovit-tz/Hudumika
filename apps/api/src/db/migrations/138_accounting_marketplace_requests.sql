-- 138_accounting_marketplace_requests.sql
-- AccountingIntegrations.tsx's Marketplace tab (Wave/FreshBooks/Zoho/NetSuite/
-- MYOB/Odoo/Stripe/Square/Flutterwave/M-Pesa/PayPal/Airtel — 12 providers with
-- no real integration built) had a "+ Add Integration" button whose handler
-- was a bare setTimeout that claimed "Our team will reach out to complete
-- setup" without ever recording the request anywhere — no team could ever
-- actually follow up. This table gives that message something real behind
-- it: a persisted request a human can act on.
CREATE TABLE IF NOT EXISTS accounting_marketplace_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  provider_id VARCHAR(50) NOT NULL,
  provider_name VARCHAR(100) NOT NULL,
  requested_by UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'completed', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acct_mkt_requests_tenant ON accounting_marketplace_requests(tenant_id);
