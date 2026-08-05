-- Two tables the SuperAdmin console has been pretending to have.
--
-- Its Activity Log rendered a MOCK_ACTIVITY array — invented superadmin
-- actions against companies that do not exist. Its Domains screen rendered a
-- DOMAINS array of ten fabricated hostnames, six of them claiming a valid SSL
-- certificate. Both read as a live record of the platform and neither was.
--
-- These give both screens something real to read. The activity log is written
-- by the superadmin routes themselves, so it records what was actually done;
-- the domains table records what was actually checked, with no status a real
-- DNS or TLS probe did not produce.

BEGIN;

-- ─── Activity log ───────────────────────────────────────────────────────────
-- Deliberately cross-tenant: it is a platform-level audit trail, readable only
-- by SUPER_ADMIN. tenant_id is the company an action was *about*, not the
-- actor's own tenant, and is null for platform-wide actions.
--
-- actor_name and target_name are snapshots taken at write time. An audit trail
-- that resolves names by join stops being able to say who did something once
-- that user is deleted — which is exactly when it matters most.
CREATE TABLE IF NOT EXISTS platform_activity_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name    varchar(255) NOT NULL,
  action        text         NOT NULL,
  category      varchar(20)  NOT NULL CHECK (category IN ('company','user','billing','system')),
  target_type   varchar(40),
  target_id     uuid,
  target_name   varchar(255),
  tenant_id     uuid REFERENCES tenants(id) ON DELETE SET NULL,
  metadata      jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_activity_created  ON platform_activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_activity_tenant   ON platform_activity_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_activity_category ON platform_activity_log (category);

-- ─── Custom domains ─────────────────────────────────────────────────────────
-- Every status field here is the outcome of a probe, not an assertion:
--   dns_verified_at  set only when the TXT record was actually resolved
--   ssl_verified_at  set only when a TLS handshake actually returned a cert
--                    valid for this host
-- A domain nobody has checked yet is 'pending' with both null, which reads as
-- "not verified", not as "broken".
CREATE TABLE IF NOT EXISTS platform_domains (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain             varchar(253) NOT NULL,
  verification_token varchar(64)  NOT NULL,
  status             varchar(20)  NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','active','failed')),
  dns_verified_at    timestamptz,
  ssl_verified_at    timestamptz,
  ssl_expires_at     timestamptz,
  last_checked_at    timestamptz,
  last_error         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- One tenant per hostname: two companies cannot both serve the same domain.
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_domains_domain ON platform_domains (lower(domain));
CREATE INDEX IF NOT EXISTS idx_platform_domains_tenant ON platform_domains (tenant_id);

COMMIT;
