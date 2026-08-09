-- ============================================================
-- 208 — Onsite: Infrastructure Control Plane
--
-- Creates the core schema for the Onsite infrastructure platform.
-- Every table is tenant-scoped (tenant_id). Cross-tenant isolation
-- is enforced at the query layer (every query WHERE tenant_id = ...).
--
-- No status column here records an assertion — every status is the
-- output of an actual probe, job run, or provider API call.
-- ============================================================

BEGIN;

-- ─── Projects ────────────────────────────────────────────────
-- A project is a logical grouping of infrastructure resources.
-- An agency managing 10 client sites creates one project per client.
CREATE TABLE IF NOT EXISTS onsite_projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        varchar(255) NOT NULL,
  description text,
  color       varchar(7),  -- hex colour for visual grouping
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onsite_projects_tenant ON onsite_projects(tenant_id);

-- ─── Domains ─────────────────────────────────────────────────
-- Tenant-level domain management. Separate from platform_domains
-- (which is a superadmin-level custom domain verifier for the CMS).
-- Here each row is a domain the tenant *manages* through Onsite.
CREATE TABLE IF NOT EXISTS onsite_domains (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          uuid REFERENCES onsite_projects(id) ON DELETE SET NULL,
  domain              varchar(253) NOT NULL,
  -- Where the domain is registered/managed
  registrar           varchar(255),
  -- Nameservers currently delegated (JSONB array of strings)
  nameservers         jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Registration / expiry information (may be null if unknown)
  registered_at       timestamptz,
  expires_at          timestamptz,
  auto_renew          boolean NOT NULL DEFAULT false,
  -- Last verified DNS status — only set by the probe job, never asserted
  dns_status          varchar(20) NOT NULL DEFAULT 'unknown'
                        CHECK (dns_status IN ('unknown','active','misconfigured','failed')),
  dns_checked_at      timestamptz,
  -- SSL status from the last TLS probe
  ssl_status          varchar(20) NOT NULL DEFAULT 'unknown'
                        CHECK (ssl_status IN ('unknown','active','expiring','expired','none','failed')),
  ssl_checked_at      timestamptz,
  ssl_expires_at      timestamptz,
  -- Overall domain health
  status              varchar(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','active','transferred','expired','suspended','deleted')),
  notes               text,
  created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
-- One tenant per domain — two tenants cannot manage the same domain
CREATE UNIQUE INDEX IF NOT EXISTS idx_onsite_domains_unique ON onsite_domains(tenant_id, lower(domain));
CREATE INDEX IF NOT EXISTS idx_onsite_domains_tenant ON onsite_domains(tenant_id);

-- ─── DNS Zones ───────────────────────────────────────────────
-- A DNS zone corresponds to one managed domain. A tenant can have
-- a zone for a domain they own even if the authoritative nameserver
-- is external (Cloudflare, Route53); the zone here is Onsite's
-- local record of what should be there.
CREATE TABLE IF NOT EXISTS onsite_dns_zones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain_id   uuid NOT NULL REFERENCES onsite_domains(id) ON DELETE CASCADE,
  -- External zone ID if synced to a DNS provider (e.g. Cloudflare zone ID)
  provider    varchar(50),   -- 'internal' | 'cloudflare' | 'route53' | etc.
  external_id varchar(255),  -- provider-assigned zone ID
  status      varchar(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','syncing','error')),
  last_synced_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onsite_dns_zones_tenant ON onsite_dns_zones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onsite_dns_zones_domain ON onsite_dns_zones(domain_id);

-- ─── DNS Records ─────────────────────────────────────────────
-- Individual DNS records within a zone.
-- Supports: A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, ALIAS, PTR
CREATE TABLE IF NOT EXISTS onsite_dns_records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  zone_id     uuid NOT NULL REFERENCES onsite_dns_zones(id) ON DELETE CASCADE,
  -- Record fields
  name        varchar(255) NOT NULL,  -- '@', 'www', 'mail', etc.
  type        varchar(10)  NOT NULL
                CHECK (type IN ('A','AAAA','CNAME','MX','TXT','NS','SRV','CAA','ALIAS','PTR')),
  value       text NOT NULL,
  ttl         integer NOT NULL DEFAULT 3600,
  priority    integer,   -- MX, SRV
  -- Provider sync state
  external_id varchar(255),   -- provider-assigned record ID
  synced_at   timestamptz,
  sync_status varchar(20) NOT NULL DEFAULT 'pending'
                CHECK (sync_status IN ('pending','synced','error','local_only')),
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onsite_dns_records_tenant ON onsite_dns_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onsite_dns_records_zone   ON onsite_dns_records(zone_id);

-- ─── SSL Certificates ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onsite_ssl_certificates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain_id     uuid NOT NULL REFERENCES onsite_domains(id) ON DELETE CASCADE,
  -- Source of the certificate
  provider      varchar(50) NOT NULL DEFAULT 'manual'
                  CHECK (provider IN ('letsencrypt','manual','provider','self_signed')),
  issuer        varchar(255),
  subject       varchar(255),  -- the CN / primary domain
  sans          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- Subject Alternative Names
  -- Key dates — only set after a real TLS probe or issuance event
  issued_at     timestamptz,
  expires_at    timestamptz,
  -- Lifecycle status
  status        varchar(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','active','expiring','expired','revoked','failed')),
  -- Last probe metadata
  last_checked_at  timestamptz,
  last_error       text,
  -- If provisioned via ACME, track the order
  acme_order_id  varchar(255),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onsite_ssl_tenant  ON onsite_ssl_certificates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onsite_ssl_domain  ON onsite_ssl_certificates(domain_id);
CREATE INDEX IF NOT EXISTS idx_onsite_ssl_expires ON onsite_ssl_certificates(expires_at) WHERE expires_at IS NOT NULL;

-- ─── Websites ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onsite_websites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES onsite_projects(id) ON DELETE SET NULL,
  domain_id   uuid REFERENCES onsite_domains(id) ON DELETE SET NULL,
  name        varchar(255) NOT NULL,
  type        varchar(30) NOT NULL DEFAULT 'static'
                CHECK (type IN ('static','php','nodejs','python','container','cms','custom')),
  status      varchar(20) NOT NULL DEFAULT 'inactive'
                CHECK (status IN ('inactive','active','deploying','failed','suspended')),
  -- Hosting target
  hosting_provider varchar(50),  -- 'internal' | 'vercel' | 'netlify' | future
  hosting_id       varchar(255), -- provider-assigned resource ID
  -- HTTP health
  url              varchar(1024),
  last_health_at   timestamptz,
  last_health_status integer,    -- last HTTP response code
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onsite_websites_tenant ON onsite_websites(tenant_id);

-- ─── Applications ────────────────────────────────────────────
-- A deployable application — may be a website, API, worker, etc.
CREATE TABLE IF NOT EXISTS onsite_applications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES onsite_projects(id) ON DELETE SET NULL,
  domain_id     uuid REFERENCES onsite_domains(id) ON DELETE SET NULL,
  name          varchar(255) NOT NULL,
  runtime       varchar(30) NOT NULL DEFAULT 'nodejs'
                  CHECK (runtime IN ('static','nodejs','python','php','ruby','go','rust','container','custom')),
  -- Source control
  repo_provider varchar(30),   -- 'github' | 'gitlab' | 'bitbucket'
  repo_owner    varchar(255),
  repo_name     varchar(255),
  repo_url      varchar(1024),
  -- Build configuration
  build_command varchar(1024),
  start_command varchar(1024),
  output_dir    varchar(255),  -- e.g. 'dist', 'public', 'build'
  port          integer,
  -- Deployment configuration
  auto_deploy   boolean NOT NULL DEFAULT false,
  -- Current state
  status        varchar(20) NOT NULL DEFAULT 'inactive'
                  CHECK (status IN ('inactive','active','deploying','failed','suspended')),
  current_version varchar(100),
  last_deployed_at timestamptz,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onsite_applications_tenant ON onsite_applications(tenant_id);

-- ─── Environments ────────────────────────────────────────────
-- Each application can have multiple environments (dev/staging/prod).
-- Environments hold their own branch, domain, and secrets.
CREATE TABLE IF NOT EXISTS onsite_environments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES onsite_applications(id) ON DELETE CASCADE,
  name           varchar(50) NOT NULL
                   CHECK (name IN ('development','staging','production','preview')),
  branch         varchar(255),    -- git branch mapped to this env
  domain_id      uuid REFERENCES onsite_domains(id) ON DELETE SET NULL,
  -- Health snapshot
  status         varchar(20) NOT NULL DEFAULT 'inactive'
                   CHECK (status IN ('inactive','active','deploying','failed')),
  url            varchar(1024),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(application_id, name)
);
CREATE INDEX IF NOT EXISTS idx_onsite_environments_tenant ON onsite_environments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onsite_environments_app    ON onsite_environments(application_id);

-- ─── Secrets ─────────────────────────────────────────────────
-- Environment variables and secrets, encrypted at the application layer
-- using AES-256-GCM before insertion. The ciphertext is stored here;
-- the key (ONSITE_SECRETS_KEY) lives only in the environment.
-- The value column is NEVER returned as plaintext by any API endpoint
-- — only "•••••••••" masked values are shown after initial creation.
CREATE TABLE IF NOT EXISTS onsite_secrets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES onsite_environments(id) ON DELETE CASCADE,
  key            varchar(255) NOT NULL,
  -- AES-256-GCM encrypted value: "iv:authTag:ciphertext" (hex-encoded, colon-separated)
  value_cipher   text NOT NULL,
  is_secret      boolean NOT NULL DEFAULT true,  -- false = plain env var (still encrypted, but user can reveal)
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(environment_id, key)
);
CREATE INDEX IF NOT EXISTS idx_onsite_secrets_tenant ON onsite_secrets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onsite_secrets_env    ON onsite_secrets(environment_id);

-- ─── Deployments ─────────────────────────────────────────────
-- A deployment is one execution of the build + deploy pipeline
-- for a specific application environment.
CREATE TABLE IF NOT EXISTS onsite_deployments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES onsite_applications(id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES onsite_environments(id) ON DELETE CASCADE,
  -- Source information
  trigger        varchar(30) NOT NULL DEFAULT 'manual'
                   CHECK (trigger IN ('manual','push','webhook','schedule','rollback')),
  triggered_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Git information at the time of deployment
  commit_sha     varchar(40),
  commit_message text,
  branch         varchar(255),
  tag            varchar(255),
  -- CI/CD integration
  ci_provider    varchar(30),  -- 'circleci' | 'github_actions' | 'internal'
  ci_pipeline_id varchar(255), -- provider's pipeline/workflow ID
  ci_build_url   varchar(1024),
  -- Deployment lifecycle
  status         varchar(20) NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','building','deploying','succeeded','failed','cancelled','rolling_back')),
  version        varchar(100),   -- semantic version or short commit SHA
  -- Timing
  queued_at      timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  completed_at   timestamptz,
  -- Output
  log_reference  text,  -- S3/MinIO path or external log URL
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onsite_deployments_tenant ON onsite_deployments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onsite_deployments_app    ON onsite_deployments(application_id);
CREATE INDEX IF NOT EXISTS idx_onsite_deployments_env    ON onsite_deployments(environment_id);
CREATE INDEX IF NOT EXISTS idx_onsite_deployments_status ON onsite_deployments(status);

-- ─── Servers ─────────────────────────────────────────────────
-- Compute resources managed through Onsite (VPS, bare metal, etc.)
-- Uses a provider abstraction — the actual provider is in provider_connections.
CREATE TABLE IF NOT EXISTS onsite_servers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES onsite_projects(id) ON DELETE SET NULL,
  name            varchar(255) NOT NULL,
  -- Provider abstraction
  provider        varchar(50) NOT NULL DEFAULT 'manual'
                    CHECK (provider IN ('manual','digitalocean','hetzner','aws','gcp','azure','internal')),
  external_id     varchar(255),  -- provider-assigned server ID
  region          varchar(100),
  -- Hardware specification (as reported or configured)
  os              varchar(100),
  cpu_count       integer,
  ram_mb          integer,
  disk_gb         integer,
  -- Network
  ip_address      varchar(45),   -- IPv4 or IPv6
  ipv6_address    varchar(45),
  -- Status — only from probe, never asserted
  status          varchar(20) NOT NULL DEFAULT 'unknown'
                    CHECK (status IN ('unknown','running','stopped','error','provisioning','deleted')),
  last_checked_at timestamptz,
  -- Latest metrics snapshot (from provider API or agent)
  cpu_percent     numeric(5,2),
  ram_percent     numeric(5,2),
  disk_percent    numeric(5,2),
  metrics_at      timestamptz,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onsite_servers_tenant ON onsite_servers(tenant_id);

-- ─── Provider Connections ────────────────────────────────────
-- Stores encrypted credentials for external providers.
-- The config_cipher column holds AES-256-GCM encrypted JSON
-- (same scheme as onsite_secrets) and is never returned in plaintext.
CREATE TABLE IF NOT EXISTS onsite_provider_connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider      varchar(50) NOT NULL,  -- 'github' | 'circleci' | 'cloudflare' | 'digitalocean' | etc.
  name          varchar(255) NOT NULL,  -- user-given label e.g. "Our GitHub Org"
  -- Encrypted credentials JSON: { token?, clientId?, clientSecret?, ... }
  config_cipher text NOT NULL,
  -- OAuth tokens (also encrypted) — stored separately so we can refresh without re-encrypting all config
  access_token_cipher  text,
  refresh_token_cipher text,
  token_expires_at     timestamptz,
  -- Provider-side identity
  external_id   varchar(255),  -- e.g. GitHub organization ID
  external_name varchar(255),  -- e.g. GitHub organization login
  -- Health
  status        varchar(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','revoked','error','pending')),
  last_verified_at timestamptz,
  error_message    text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- One connection per provider per tenant (can be extended to per-account later)
  UNIQUE(tenant_id, provider, name)
);
CREATE INDEX IF NOT EXISTS idx_onsite_provider_connections_tenant ON onsite_provider_connections(tenant_id);

-- ─── Health Checks / Uptime Monitors ─────────────────────────
CREATE TABLE IF NOT EXISTS onsite_health_checks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- What is being monitored
  name           varchar(255) NOT NULL,
  url            varchar(1024) NOT NULL,
  method         varchar(10) NOT NULL DEFAULT 'GET',
  expected_status integer NOT NULL DEFAULT 200,
  timeout_ms     integer NOT NULL DEFAULT 10000,
  -- How often to check (seconds)
  interval_s     integer NOT NULL DEFAULT 300,  -- default: every 5 minutes
  -- Current state — only set by the monitor job
  status         varchar(20) NOT NULL DEFAULT 'unknown'
                   CHECK (status IN ('unknown','healthy','warning','critical')),
  last_checked_at  timestamptz,
  last_response_ms integer,
  last_status_code integer,
  last_error       text,
  -- Uptime tracking (rolling 30-day window, updated by job)
  uptime_30d       numeric(5,2),  -- percentage
  -- Relationships
  application_id   uuid REFERENCES onsite_applications(id) ON DELETE SET NULL,
  domain_id        uuid REFERENCES onsite_domains(id) ON DELETE SET NULL,
  -- Notifications
  notify_on_fail   boolean NOT NULL DEFAULT true,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onsite_health_checks_tenant ON onsite_health_checks(tenant_id);

-- ─── Entitlement Registration ────────────────────────────────
-- Ensure 'onsite' feature key is registered for all plans.
-- Migration 102 already did this but may not be idempotent
-- across different environments. ON CONFLICT DO NOTHING is safe.
INSERT INTO package_features (package_code, feature_key)
SELECT p, 'onsite'
FROM unnest(ARRAY['starter','operations','growth','professional','finance','scale','enterprise']) AS p
ON CONFLICT DO NOTHING;

INSERT INTO app_status (app_id, status)
VALUES ('onsite', 'active')
ON CONFLICT (app_id) DO NOTHING;

COMMIT;
