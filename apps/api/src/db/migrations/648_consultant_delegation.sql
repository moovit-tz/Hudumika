-- Phase J: Consultant businesses and client delegation.
-- Scoped, time-limited, revocable mandates for cross-tenant delegation
-- with fine-grained permissions, staff assignments, and audit trails.

-- ── 1. Client portfolios (provider-tenant-scoped) ───────────────────────
-- A provider tenant (consultant firm) manages client relationships.
CREATE TABLE IF NOT EXISTS provider_client_portfolios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_tenant_id  UUID REFERENCES tenants(id) ON DELETE SET NULL,
  client_name       TEXT NOT NULL,
  client_type       TEXT NOT NULL DEFAULT 'workspace'
    CHECK (client_type IN ('workspace', 'external', 'prospect')),
  status            TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'onboarding', 'suspended', 'terminated', 'prospect')),
  contact_name      TEXT,
  contact_email     TEXT,
  contact_phone     TEXT,
  industry_key      TEXT,
  jurisdictions     TEXT[] NOT NULL DEFAULT '{}',
  onboarded_at      TIMESTAMPTZ,
  terminated_at     TIMESTAMPTZ,
  termination_reason TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE provider_client_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_client_portfolios FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'provider_client_portfolios'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON provider_client_portfolios
      USING (provider_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pcp_provider ON provider_client_portfolios(provider_tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pcp_client ON provider_client_portfolios(client_tenant_id);

-- ── 2. Delegation mandates ──────────────────────────────────────────────
-- Each mandate is a scoped, time-limited, revocable authorization from a
-- client (owner) to a provider, specifying exactly what can be accessed.
CREATE TABLE IF NOT EXISTS delegation_mandates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  portfolio_id      UUID REFERENCES provider_client_portfolios(id) ON DELETE SET NULL,
  mandate_code      TEXT NOT NULL,
  title             TEXT NOT NULL,
  purpose           TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended', 'expired', 'revoked', 'terminated')),
  scope_entities    UUID[] NOT NULL DEFAULT '{}',
  scope_permits     TEXT[] NOT NULL DEFAULT '{}',
  scope_apps        TEXT[] NOT NULL DEFAULT '{}',
  allowed_actions   TEXT[] NOT NULL DEFAULT '{}',
  document_scope    TEXT NOT NULL DEFAULT 'mandate_only'
    CHECK (document_scope IN ('mandate_only', 'entity_scoped', 'full_history')),
  history_scope     TEXT NOT NULL DEFAULT 'mandate_period'
    CHECK (history_scope IN ('mandate_period', 'current_status', 'full_history')),
  effective_from    DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to      DATE,
  auto_renew        BOOLEAN NOT NULL DEFAULT false,
  authorized_by     UUID REFERENCES users(id),
  authorized_at     TIMESTAMPTZ,
  revoked_by        UUID REFERENCES users(id),
  revoked_at        TIMESTAMPTZ,
  revocation_reason TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_tenant_id, provider_tenant_id, mandate_code)
);

ALTER TABLE delegation_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegation_mandates FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'delegation_mandate_policy' AND polrelid = 'delegation_mandates'::regclass) THEN
    CREATE POLICY delegation_mandate_policy ON delegation_mandates
      USING (
        owner_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR provider_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dm_owner ON delegation_mandates(owner_tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dm_provider ON delegation_mandates(provider_tenant_id, status);

-- ── 3. Mandate staff assignments ────────────────────────────────────────
-- Which provider employees are authorized to act under a given mandate.
CREATE TABLE IF NOT EXISTS mandate_staff_assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandate_id        UUID NOT NULL REFERENCES delegation_mandates(id) ON DELETE CASCADE,
  provider_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_mandate   TEXT NOT NULL DEFAULT 'handler'
    CHECK (role_in_mandate IN ('lead', 'handler', 'reviewer', 'viewer', 'billing')),
  granted_actions   TEXT[] NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'removed')),
  granted_by        UUID REFERENCES users(id),
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at        TIMESTAMPTZ,
  removed_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mandate_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandate_staff_assignments FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'mandate_staff_assignments'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON mandate_staff_assignments
      USING (provider_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_msa_mandate ON mandate_staff_assignments(mandate_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_msa_unique_active ON mandate_staff_assignments(mandate_id, user_id)
  WHERE status = 'active';

-- ── 4. Delegation audit log ─────────────────────────────────────────────
-- Every action taken under a mandate is recorded with true actor + on-behalf-of.
CREATE TABLE IF NOT EXISTS delegation_audit_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandate_id        UUID NOT NULL REFERENCES delegation_mandates(id) ON DELETE CASCADE,
  owner_tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id     UUID NOT NULL REFERENCES users(id),
  on_behalf_of_tenant UUID NOT NULL REFERENCES tenants(id),
  action_type       TEXT NOT NULL,
  action_detail     TEXT,
  target_record_type TEXT,
  target_record_id  UUID,
  app_id            TEXT,
  ip_address        TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE delegation_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegation_audit_log FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'delegation_audit_policy' AND polrelid = 'delegation_audit_log'::regclass) THEN
    CREATE POLICY delegation_audit_policy ON delegation_audit_log
      USING (
        owner_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR provider_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dal_mandate ON delegation_audit_log(mandate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dal_actor ON delegation_audit_log(actor_user_id, created_at DESC);

-- ── 5. Provider engagements (billing/work tracking) ─────────────────────
CREATE TABLE IF NOT EXISTS provider_engagements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  portfolio_id      UUID NOT NULL REFERENCES provider_client_portfolios(id) ON DELETE CASCADE,
  mandate_id        UUID REFERENCES delegation_mandates(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  engagement_type   TEXT NOT NULL DEFAULT 'retainer'
    CHECK (engagement_type IN ('retainer', 'project', 'ad_hoc', 'renewal_cycle')),
  status            TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'completed', 'cancelled', 'on_hold')),
  fee_amount        NUMERIC(14,2),
  fee_currency      TEXT NOT NULL DEFAULT 'TZS',
  billing_type      TEXT NOT NULL DEFAULT 'fixed'
    CHECK (billing_type IN ('fixed', 'hourly', 'per_item', 'retainer_monthly')),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE provider_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_engagements FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'provider_engagements'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON provider_engagements
      USING (provider_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pe_provider ON provider_engagements(provider_tenant_id, status);
