-- Migration 151: shareable landed-cost estimates behind a QR code.
--
-- The exported PDF carries a QR code. Scanning it opens a public page that
-- shows a teaser of the estimate and asks for an email address before it will
-- release the full downloadable report. The captured email becomes a CRM lead
-- for the tenant that produced the estimate, to be confirmed and onboarded.
--
-- `payload` holds the structured calculation result plus the customer/meta
-- block, not rendered HTML, so the public page re-renders through exactly the
-- same report code as the app and future layout changes apply retroactively.
--
-- Deliberately NOT tenant-isolated by RLS at read time: the whole point is
-- that an unauthenticated scanner can resolve a token. Isolation is by the
-- unguessable token instead. `tenant_id` is still recorded so the resulting
-- lead lands in the right tenant's pipeline, and every read path filters on
-- the token alone.

CREATE TABLE IF NOT EXISTS landed_cost_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT NOT NULL UNIQUE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hs_code       TEXT,
  description   TEXT,
  customer_name TEXT,
  -- Full LandedCostResult + ReportMeta + rate card, as sent to printReport().
  payload       JSONB NOT NULL,
  view_count    INTEGER NOT NULL DEFAULT 0,
  unlock_count  INTEGER NOT NULL DEFAULT 0,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL means it never expires; the create endpoint sets a default horizon.
  expires_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lc_shares_tenant ON landed_cost_shares(tenant_id, created_at DESC);

-- Every email captured from a scan. Kept separately from `leads` so a repeat
-- download by the same person doesn't create duplicate leads, and so we retain
-- the raw capture even if the lead is later merged or deleted.
CREATE TABLE IF NOT EXISTS landed_cost_share_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id      UUID NOT NULL REFERENCES landed_cost_shares(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT,
  company       TEXT,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (share_id, email)
);

CREATE INDEX IF NOT EXISTS idx_lc_share_leads_tenant ON landed_cost_share_leads(tenant_id, created_at DESC);
