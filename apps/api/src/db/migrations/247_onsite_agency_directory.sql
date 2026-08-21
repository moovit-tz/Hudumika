-- AgencyHost M7 — public agency directory.
--
-- A public, filterable marketplace where prospective clients browse and
-- match with hosting agencies — the platform's own lead-gen channel.
-- Independent of the agency-client chain (M1): any tenant may submit a
-- profile, whether or not it currently manages any clients yet.
--
-- Platform-level, like marketplace_apps (077_marketplace_apps.sql) — no RLS.
-- The whole point of an approved row is public visibility to a caller with
-- no tenant session at all, which RLS has nothing to key off; store.routes.ts
-- is the direct precedent for a platform table with the same submit →
-- moderate → public-list shape.
CREATE TABLE onsite_agency_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL UNIQUE REFERENCES tenants(id),
  headline          VARCHAR(200) NOT NULL,
  description       TEXT NOT NULL,
  service_tags      JSONB NOT NULL DEFAULT '[]',
  portfolio_links   JSONB NOT NULL DEFAULT '[]',
  pricing_tier      VARCHAR(20) NOT NULL CHECK (pricing_tier IN ('budget', 'standard', 'premium')),
  region            VARCHAR(100),
  languages         JSONB NOT NULL DEFAULT '[]',
  status            VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Genuinely incremented on real events (a real GET /:id, a real inquiry
  -- submission) — never seeded. See onsite-agency-directory.routes.ts.
  -- client_count is deliberately NOT a column here: it's a live COUNT(*)
  -- against agency_managed_tenants at read time, so it can never drift from
  -- the real relationship the M1-M4 milestones already built.
  profile_views     INT NOT NULL DEFAULT 0,
  inquiries_count   INT NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_onsite_agency_profiles_status ON onsite_agency_profiles(status);
CREATE INDEX idx_onsite_agency_profiles_region ON onsite_agency_profiles(region) WHERE region IS NOT NULL;
