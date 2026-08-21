// ─── Onsite — Shared TypeScript Interfaces ────────────────────
// Consumed by both apps/api and apps/web. Mirrors the DB schema
// in 208_onsite_core.sql.

// ── Common ───────────────────────────────────────────────────

export type OnsiteProviderName =
  | 'github'
  | 'circleci'
  | 'cloudflare'
  | 'route53'
  | 'digitalocean'
  | 'hetzner'
  | 'aws'
  | 'gcp'
  | 'azure'
  | 'letsencrypt'
  | 'internal'
  | 'manual';

// ── Projects ─────────────────────────────────────────────────

export interface OnsiteProject {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Counts populated by API joins
  domain_count?: number;
  app_count?: number;
}

// ── Domains ──────────────────────────────────────────────────

export type OnsiteDomainStatus =
  | 'pending'
  | 'active'
  | 'transferred'
  | 'expired'
  | 'suspended'
  | 'deleted';

export type OnsiteDnsStatus = 'unknown' | 'active' | 'misconfigured' | 'failed';
export type OnsiteSslStatus = 'unknown' | 'active' | 'expiring' | 'expired' | 'none' | 'failed';

export interface OnsiteDomain {
  id: string;
  tenant_id: string;
  project_id: string | null;
  domain: string;
  registrar: string | null;
  nameservers: string[];
  registered_at: string | null;
  expires_at: string | null;
  auto_renew: boolean;
  dns_status: OnsiteDnsStatus;
  dns_checked_at: string | null;
  ssl_status: OnsiteSslStatus;
  ssl_checked_at: string | null;
  ssl_expires_at: string | null;
  status: OnsiteDomainStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Websites ─────────────────────────────────────────────────

export interface OnsiteWebsite {
  id: string;
  tenant_id: string;
  project_id: string | null;
  domain_id: string | null;
  name: string;
  type: string;
  status: string;
  hosting_provider: string | null;
  hosting_id: string | null;
  url: string | null;
  last_health_at: string | null;
  last_health_status: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}


// ── DNS ──────────────────────────────────────────────────────

export type DnsRecordType =
  | 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT'
  | 'NS' | 'SRV' | 'CAA' | 'ALIAS' | 'PTR';

export interface OnsiteDnsZone {
  id: string;
  tenant_id: string;
  domain_id: string;
  provider: string;
  external_id: string | null;
  status: 'active' | 'syncing' | 'error';
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  records?: OnsiteDnsRecord[];
}

export interface OnsiteDnsRecord {
  id: string;
  tenant_id: string;
  zone_id: string;
  name: string;
  type: DnsRecordType;
  value: string;
  ttl: number;
  priority: number | null;
  external_id: string | null;
  synced_at: string | null;
  sync_status: 'pending' | 'synced' | 'error' | 'local_only';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DnsPropagationResult {
  resolver: string;
  resolver_url: string;
  expected: string;
  actual: string | null;
  propagated: boolean;
  error: string | null;
}

// ── SSL ──────────────────────────────────────────────────────

export interface OnsiteSslCertificate {
  id: string;
  tenant_id: string;
  domain_id: string;
  provider: 'letsencrypt' | 'manual' | 'provider' | 'self_signed';
  issuer: string | null;
  subject: string | null;
  sans: string[];
  issued_at: string | null;
  expires_at: string | null;
  status: 'pending' | 'active' | 'expiring' | 'expired' | 'revoked' | 'failed';
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

// ── Applications ─────────────────────────────────────────────

export type OnsiteRuntime =
  | 'static' | 'nodejs' | 'python' | 'php'
  | 'ruby' | 'go' | 'rust' | 'container' | 'custom';

export interface OnsiteApplication {
  id: string;
  tenant_id: string;
  project_id: string | null;
  domain_id: string | null;
  name: string;
  runtime: OnsiteRuntime;
  repo_provider: string | null;
  repo_owner: string | null;
  repo_name: string | null;
  repo_url: string | null;
  build_command: string | null;
  start_command: string | null;
  output_dir: string | null;
  port: number | null;
  auto_deploy: boolean;
  status: 'inactive' | 'active' | 'deploying' | 'failed' | 'suspended';
  current_version: string | null;
  last_deployed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  environments?: OnsiteEnvironment[];
  domain?: Pick<OnsiteDomain, 'id' | 'domain' | 'status'> | null;
}

// ── Environments ─────────────────────────────────────────────

export type OnsiteEnvironmentName = 'development' | 'staging' | 'production' | 'preview';

export interface OnsiteEnvironment {
  id: string;
  tenant_id: string;
  application_id: string;
  name: OnsiteEnvironmentName;
  branch: string | null;
  domain_id: string | null;
  status: 'inactive' | 'active' | 'deploying' | 'failed';
  url: string | null;
  created_at: string;
  updated_at: string;
}

// ── Secrets ──────────────────────────────────────────────────

/** The API never returns the actual value — only key + masked indicator. */
export interface OnsiteSecretPublic {
  id: string;
  tenant_id: string;
  environment_id: string;
  key: string;
  is_secret: boolean;
  /** Always '••••••••' in API responses. Call a separate reveal endpoint
   *  (with appropriate permission) to get the actual value. */
  value_masked: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Deployments ──────────────────────────────────────────────

export type OnsiteDeploymentStatus =
  | 'queued' | 'building' | 'deploying'
  | 'succeeded' | 'failed' | 'cancelled' | 'rolling_back';

export interface OnsiteDeployment {
  id: string;
  tenant_id: string;
  application_id: string;
  environment_id: string;
  trigger: 'manual' | 'push' | 'webhook' | 'schedule' | 'rollback';
  triggered_by: string | null;
  commit_sha: string | null;
  commit_message: string | null;
  branch: string | null;
  tag: string | null;
  ci_provider: string | null;
  ci_pipeline_id: string | null;
  ci_build_url: string | null;
  status: OnsiteDeploymentStatus;
  version: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  log_reference: string | null;
  error_message: string | null;
  created_at: string;
  // Joined
  application?: Pick<OnsiteApplication, 'id' | 'name' | 'runtime'>;
  environment?: Pick<OnsiteEnvironment, 'id' | 'name'>;
  triggered_by_name?: string | null;
}

// ── Servers ──────────────────────────────────────────────────

export interface OnsiteServer {
  id: string;
  tenant_id: string;
  project_id: string | null;
  name: string;
  provider: string;
  external_id: string | null;
  region: string | null;
  os: string | null;
  cpu_count: number | null;
  ram_mb: number | null;
  disk_gb: number | null;
  ip_address: string | null;
  ipv6_address: string | null;
  status: 'unknown' | 'running' | 'stopped' | 'error' | 'provisioning' | 'deleted';
  last_checked_at: string | null;
  cpu_percent: number | null;
  ram_percent: number | null;
  disk_percent: number | null;
  metrics_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Provider Connections ─────────────────────────────────────

export interface OnsiteProviderConnection {
  id: string;
  tenant_id: string;
  provider: OnsiteProviderName;
  name: string;
  /** config_cipher is NEVER returned by the API — this field is omitted. */
  external_id: string | null;
  external_name: string | null;
  status: 'active' | 'revoked' | 'error' | 'pending';
  last_verified_at: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Health Checks ────────────────────────────────────────────

export interface OnsiteHealthCheck {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  method: string;
  expected_status: number;
  timeout_ms: number;
  interval_s: number;
  status: 'unknown' | 'healthy' | 'warning' | 'critical';
  last_checked_at: string | null;
  last_response_ms: number | null;
  last_status_code: number | null;
  last_error: string | null;
  uptime_30d: number | null;
  application_id: string | null;
  domain_id: string | null;
  notify_on_fail: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Dashboard Summary ─────────────────────────────────────────

export interface OnsiteDashboard {
  projects: number;
  domains: number;
  domains_expiring_soon: number;   // < 30 days
  ssl_expiring_soon: number;       // < 30 days
  applications: number;
  deployments_today: number;
  failed_deployments_today: number;
  servers: number;
  servers_healthy: number;
  health_checks: number;
  health_checks_critical: number;
  recent_deployments: OnsiteDeployment[];
  alerts: OnsiteAlert[];
}

export interface OnsiteAlert {
  id: string;
  severity: 'warning' | 'critical';
  type: 'domain_expiring' | 'ssl_expiring' | 'deployment_failed' |
        'server_down' | 'health_check_failed' | 'dns_error';
  message: string;
  resource_type: string;
  resource_id: string;
  resource_name: string;
}

/** AgencyHost M1 — a client tenant an agency created and manages. */
export type AgencyManagedClientStatus = 'active' | 'detached';

export interface AgencyManagedClient {
  id: string;
  status: AgencyManagedClientStatus;
  attached_at: string;
  detached_at: string | null;
  tenant_id: string;
  tenant_name: string;
  tenant_subdomain: string | null;
  tenant_created_at: string;
}

/** AgencyHost M7 — a tenant's public listing in the agency directory. */
export type AgencyProfileStatus = 'pending' | 'approved' | 'rejected';
export type AgencyPricingTier = 'budget' | 'standard' | 'premium';

export interface OnsiteAgencyProfile {
  id: string;
  tenant_id: string;
  headline: string;
  description: string;
  service_tags: string[];
  portfolio_links: string[];
  pricing_tier: AgencyPricingTier;
  region: string | null;
  languages: string[];
  status: AgencyProfileStatus;
  profile_views: number;
  inquiries_count: number;
  created_at: string;
  updated_at: string;
  // Joined / computed, present on public + admin listings
  tenant_name?: string;
  /** Live COUNT(*) against agency_managed_tenants at read time — never stored. */
  client_count?: number;
}

/** AgencyHost M6 — a snapshot of a tenant's own Onsite configuration
 *  (domains, DNS, applications, environments, secrets, websites, health
 *  checks, provider connections) — never a website's actual files or
 *  database, which this platform has never stored a copy of. */
export interface OnsiteBackup {
  id: string;
  trigger: 'manual' | 'scheduled';
  status: 'completed' | 'failed';
  size_bytes: number;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
}
