-- Migration 443: Hudumika Developer Platform Foundation
-- Architecture Decision 1, 2, 3: Two customer types (Individual vs Organization),
-- Dual API Gateway (Native, External, Hybrid), Provider Abstraction,
-- Sole Pricing Authority, Metering & Provider Settlements.

-- 1. Developer Accounts (Commercial/Developer identity)
CREATE TABLE IF NOT EXISTS developer_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                VARCHAR(30) NOT NULL CHECK (type IN ('INDIVIDUAL', 'ORGANIZATION')),
  name                VARCHAR(255) NOT NULL,
  slug                VARCHAR(100) NOT NULL UNIQUE,
  owner_user_id       UUID NOT NULL REFERENCES users(id),
  status              VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending_verification')),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_accounts_owner ON developer_accounts(owner_user_id);

-- 2. Developer Organizations
CREATE TABLE IF NOT EXISTS developer_organizations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_account_id UUID NOT NULL UNIQUE REFERENCES developer_accounts(id) ON DELETE CASCADE,
  legal_name          VARCHAR(255) NOT NULL,
  registration_number VARCHAR(100),
  tin                 VARCHAR(100),
  country             CHAR(2) NOT NULL DEFAULT 'TZ',
  industry            VARCHAR(100),
  website             VARCHAR(255),
  verification_status VARCHAR(30) NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  verified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Developer Organization Members
CREATE TABLE IF NOT EXISTS developer_org_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_account_id UUID NOT NULL REFERENCES developer_accounts(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                VARCHAR(30) NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'DEVELOPER', 'BILLING_ADMIN', 'SECURITY_ADMIN', 'VIEWER')),
  invited_by          UUID REFERENCES users(id),
  status              VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (developer_account_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_dev_org_members_user ON developer_org_members(user_id);

-- 4. Billing Accounts
CREATE TABLE IF NOT EXISTS developer_billing_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_account_id UUID NOT NULL REFERENCES developer_accounts(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL DEFAULT 'Primary Billing Account',
  billing_type        VARCHAR(30) NOT NULL DEFAULT 'PREPAID' CHECK (billing_type IN ('PREPAID', 'POSTPAID', 'INVOICE', 'INTERNAL')),
  currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
  balance_credits     NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
  credit_limit        NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
  tax_id              VARCHAR(100),
  billing_email       VARCHAR(255),
  billing_address     JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_billing_account ON developer_billing_accounts(developer_account_id);

-- 5. Developer Projects (Named dev_projects to prevent collisions with SaaS projects)
CREATE TABLE IF NOT EXISTS dev_projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_account_id UUID NOT NULL REFERENCES developer_accounts(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  slug                VARCHAR(100) NOT NULL,
  description         TEXT,
  is_internal_hudumika BOOLEAN NOT NULL DEFAULT false,
  status              VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'suspended')),
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (developer_account_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_dev_projects_acc ON dev_projects(developer_account_id);

-- 6. Developer Project Members
CREATE TABLE IF NOT EXISTS dev_project_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES dev_projects(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                VARCHAR(30) NOT NULL DEFAULT 'DEVELOPER' CHECK (role IN ('ADMIN', 'DEVELOPER', 'VIEWER')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

-- 7. Developer Environments
CREATE TABLE IF NOT EXISTS dev_environments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES dev_projects(id) ON DELETE CASCADE,
  environment         VARCHAR(30) NOT NULL CHECK (environment IN ('DEVELOPMENT', 'SANDBOX', 'PRODUCTION')),
  is_enabled          BOOLEAN NOT NULL DEFAULT true,
  settings            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, environment)
);

-- 8. Developer Credentials
CREATE TABLE IF NOT EXISTS dev_credentials (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES dev_projects(id) ON DELETE CASCADE,
  environment         VARCHAR(30) NOT NULL CHECK (environment IN ('DEVELOPMENT', 'SANDBOX', 'PRODUCTION')),
  type                VARCHAR(30) NOT NULL CHECK (type IN ('API_KEY', 'OAUTH_CLIENT', 'SERVICE_ACCOUNT')),
  name                VARCHAR(255) NOT NULL,
  key_prefix          VARCHAR(20) NOT NULL,
  key_hash            VARCHAR(128) NOT NULL UNIQUE,
  client_id           VARCHAR(64),
  client_secret_hash  VARCHAR(128),
  allowed_ips         JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_origins     JSONB NOT NULL DEFAULT '[]'::jsonb,
  scopes              JSONB NOT NULL DEFAULT '[]'::jsonb,
  rate_limit_override INTEGER,
  expires_at          TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  revoked_reason      TEXT,
  last_used_at        TIMESTAMPTZ,
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_credentials_lookup ON dev_credentials(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dev_credentials_proj ON dev_credentials(project_id, environment);

-- 9. API Providers
CREATE TABLE IF NOT EXISTS api_providers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                VARCHAR(100) NOT NULL UNIQUE,
  name                VARCHAR(255) NOT NULL,
  adapter_type        VARCHAR(50) NOT NULL CHECK (adapter_type IN ('HudumikaInternal', 'ExternalREST', 'GovernmentAPI', 'PartnerAPI')),
  base_url            VARCHAR(500),
  auth_type           VARCHAR(50) NOT NULL DEFAULT 'NONE' CHECK (auth_type IN ('NONE', 'API_KEY', 'BEARER_TOKEN', 'BASIC_AUTH', 'OAUTH2_CLIENT_CREDENTIALS', 'MTLS')),
  auth_config_encrypted TEXT,
  health_status       VARCHAR(30) NOT NULL DEFAULT 'HEALTHY' CHECK (health_status IN ('HEALTHY', 'DEGRADED', 'DOWN', 'MAINTENANCE')),
  last_health_check   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. API Products
CREATE TABLE IF NOT EXISTS api_products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                VARCHAR(100) NOT NULL UNIQUE,
  name                VARCHAR(255) NOT NULL,
  short_description   VARCHAR(500) NOT NULL,
  long_description    TEXT,
  category            VARCHAR(100) NOT NULL DEFAULT 'business',
  execution_mode      VARCHAR(30) NOT NULL CHECK (execution_mode IN ('NATIVE', 'EXTERNAL', 'HYBRID')),
  supported_environments JSONB NOT NULL DEFAULT '["DEVELOPMENT", "SANDBOX", "PRODUCTION"]'::jsonb,
  status              VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SANDBOX_ONLY', 'BETA', 'PUBLIC', 'DEPRECATED', 'RETIRED')),
  is_partner_product  BOOLEAN NOT NULL DEFAULT false,
  partner_name        VARCHAR(255),
  icon_name           VARCHAR(100) NOT NULL DEFAULT 'grid',
  documentation_md    TEXT,
  openapi_spec        JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. API Versions
CREATE TABLE IF NOT EXISTS api_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_product_id      UUID NOT NULL REFERENCES api_products(id) ON DELETE CASCADE,
  version_str         VARCHAR(50) NOT NULL,
  status              VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'DEPRECATED', 'RETIRED')),
  changelog           TEXT,
  openapi_spec        JSONB,
  is_default          BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (api_product_id, version_str)
);

-- 12. API Operations
CREATE TABLE IF NOT EXISTS api_operations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_product_id      UUID NOT NULL REFERENCES api_products(id) ON DELETE CASCADE,
  api_version_id      UUID NOT NULL REFERENCES api_versions(id) ON DELETE CASCADE,
  operation_id        VARCHAR(100) NOT NULL,
  http_method         VARCHAR(10) NOT NULL CHECK (http_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  path_pattern        VARCHAR(500) NOT NULL,
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  execution_mode      VARCHAR(30) NOT NULL CHECK (execution_mode IN ('NATIVE', 'EXTERNAL')),
  billing_unit        VARCHAR(50) NOT NULL DEFAULT 'successful_request' CHECK (billing_unit IN ('request', 'successful_request', 'record', 'megabyte', 'seat')),
  default_rate_limit  INTEGER NOT NULL DEFAULT 60,
  default_quota_limit INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (api_version_id, http_method, path_pattern)
);

-- 13. API Operation Providers
CREATE TABLE IF NOT EXISTS api_operation_providers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id        UUID NOT NULL REFERENCES api_operations(id) ON DELETE CASCADE,
  provider_id         UUID NOT NULL REFERENCES api_providers(id) ON DELETE RESTRICT,
  target_path         VARCHAR(500),
  timeout_ms          INTEGER NOT NULL DEFAULT 10000,
  retry_count         INTEGER NOT NULL DEFAULT 1,
  provider_unit_cost  NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
  provider_currency   VARCHAR(10) NOT NULL DEFAULT 'TZS',
  is_primary          BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (operation_id, provider_id)
);

-- 14. API Pricing Plans
CREATE TABLE IF NOT EXISTS api_pricing_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_product_id      UUID NOT NULL REFERENCES api_products(id) ON DELETE CASCADE,
  code                VARCHAR(100) NOT NULL,
  name                VARCHAR(255) NOT NULL,
  plan_type           VARCHAR(30) NOT NULL CHECK (plan_type IN ('FREE', 'PAY_AS_YOU_GO', 'TIERED', 'GROWTH', 'ENTERPRISE', 'INTERNAL')),
  currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
  monthly_base_fee    NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
  included_units      INTEGER NOT NULL DEFAULT 0,
  overage_unit_price  NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
  rate_limit_per_min  INTEGER NOT NULL DEFAULT 60,
  quota_limit_per_mo  INTEGER,
  is_public           BOOLEAN NOT NULL DEFAULT true,
  status              VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (api_product_id, code)
);

-- 15. API Subscriptions
CREATE TABLE IF NOT EXISTS api_subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_account_id UUID NOT NULL REFERENCES developer_accounts(id) ON DELETE CASCADE,
  billing_account_id  UUID NOT NULL REFERENCES developer_billing_accounts(id) ON DELETE RESTRICT,
  api_product_id      UUID NOT NULL REFERENCES api_products(id) ON DELETE RESTRICT,
  pricing_plan_id     UUID NOT NULL REFERENCES api_pricing_plans(id) ON DELETE RESTRICT,
  status              VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end   TIMESTAMPTZ NOT NULL,
  custom_pricing_override JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_subs_account ON api_subscriptions(developer_account_id);

-- 16. API Entitlements
CREATE TABLE IF NOT EXISTS api_entitlements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES dev_projects(id) ON DELETE CASCADE,
  environment         VARCHAR(30) NOT NULL CHECK (environment IN ('DEVELOPMENT', 'SANDBOX', 'PRODUCTION')),
  api_product_id      UUID NOT NULL REFERENCES api_products(id) ON DELETE CASCADE,
  subscription_id     UUID REFERENCES api_subscriptions(id) ON DELETE SET NULL,
  status              VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'EXPIRED')),
  rate_limit_per_min  INTEGER NOT NULL DEFAULT 60,
  monthly_quota       INTEGER,
  allowed_operations  JSONB NOT NULL DEFAULT '["*"]'::jsonb,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, environment, api_product_id)
);
CREATE INDEX IF NOT EXISTS idx_api_entitlements_lookup ON api_entitlements(project_id, environment, api_product_id);

-- 17. Raw API Gateway Ingress Requests (Telemetry)
CREATE TABLE IF NOT EXISTS dev_gateway_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          VARCHAR(64) NOT NULL UNIQUE,
  project_id          UUID REFERENCES dev_projects(id) ON DELETE SET NULL,
  environment         VARCHAR(30),
  credential_id       UUID REFERENCES dev_credentials(id) ON DELETE SET NULL,
  api_product_id      UUID REFERENCES api_products(id) ON DELETE SET NULL,
  operation_id        UUID REFERENCES api_operations(id) ON DELETE SET NULL,
  http_method         VARCHAR(10) NOT NULL,
  path                VARCHAR(500) NOT NULL,
  status_code         INTEGER NOT NULL,
  duration_ms         INTEGER NOT NULL,
  ip_address          VARCHAR(45),
  user_agent          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_gw_req_time ON dev_gateway_requests(project_id, created_at DESC);

-- 18. Canonical Normalized Usage Events (Metering)
CREATE TABLE IF NOT EXISTS dev_usage_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            VARCHAR(64) NOT NULL UNIQUE,
  request_id          VARCHAR(64) NOT NULL,
  developer_account_id UUID NOT NULL REFERENCES developer_accounts(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES dev_projects(id) ON DELETE CASCADE,
  environment         VARCHAR(30) NOT NULL,
  api_product_id      UUID NOT NULL REFERENCES api_products(id) ON DELETE RESTRICT,
  api_version_id      UUID NOT NULL REFERENCES api_versions(id) ON DELETE RESTRICT,
  operation_id        UUID NOT NULL REFERENCES api_operations(id) ON DELETE RESTRICT,
  credential_id       UUID REFERENCES dev_credentials(id) ON DELETE SET NULL,
  provider_id         UUID REFERENCES api_providers(id) ON DELETE SET NULL,
  billing_unit        VARCHAR(50) NOT NULL,
  quantity            INTEGER NOT NULL DEFAULT 1,
  is_billable         BOOLEAN NOT NULL DEFAULT true,
  provider_unit_cost  NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
  developer_unit_price NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
  currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
  status_code         INTEGER NOT NULL,
  is_success          BOOLEAN NOT NULL DEFAULT true,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_usage_events_acc ON dev_usage_events(developer_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_usage_events_proj ON dev_usage_events(project_id, environment, created_at DESC);

-- 19. Billing Events (Financial ledger)
CREATE TABLE IF NOT EXISTS dev_billing_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_event_id      UUID REFERENCES dev_usage_events(id) ON DELETE SET NULL,
  developer_account_id UUID NOT NULL REFERENCES developer_accounts(id) ON DELETE CASCADE,
  billing_account_id  UUID NOT NULL REFERENCES developer_billing_accounts(id) ON DELETE RESTRICT,
  event_type          VARCHAR(30) NOT NULL CHECK (event_type IN ('CHARGE', 'INCLUDED_ALLOWANCE', 'CREDIT_DEDUCTION', 'OVERAGE', 'REFUND', 'ADJUSTMENT')),
  units_billed        INTEGER NOT NULL DEFAULT 1,
  amount              NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
  currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
  description         TEXT NOT NULL,
  invoice_id          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_billing_events_acc ON dev_billing_events(developer_account_id, created_at DESC);

-- 20. Provider Settlement Ledger
CREATE TABLE IF NOT EXISTS dev_provider_settlements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_event_id      UUID NOT NULL UNIQUE REFERENCES dev_usage_events(id) ON DELETE CASCADE,
  provider_id         UUID NOT NULL REFERENCES api_providers(id) ON DELETE RESTRICT,
  developer_account_id UUID NOT NULL REFERENCES developer_accounts(id) ON DELETE CASCADE,
  units               INTEGER NOT NULL DEFAULT 1,
  provider_cost       NUMERIC(14,4) NOT NULL,
  developer_price     NUMERIC(14,4) NOT NULL,
  gross_platform_revenue NUMERIC(14,4) NOT NULL,
  currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
  is_settled          BOOLEAN NOT NULL DEFAULT false,
  settled_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_settlements_prov ON dev_provider_settlements(provider_id, is_settled);

-- Seed initial API Providers
INSERT INTO api_providers (code, name, adapter_type, base_url, auth_type, health_status)
VALUES
  ('hudumika_internal', 'Hudumika Core Internal Services', 'HudumikaInternal', NULL, 'NONE', 'HEALTHY'),
  ('brela_gov_adapter', 'BRELA Business Registry Gateway', 'GovernmentAPI', 'https://api.brela.go.tz/v1', 'API_KEY', 'HEALTHY'),
  ('tra_tax_adapter', 'TRA Taxpayer & VFD Gateway', 'GovernmentAPI', 'https://api.tra.go.tz/v2', 'BEARER_TOKEN', 'HEALTHY')
ON CONFLICT (code) DO NOTHING;

-- Seed initial API Products
INSERT INTO api_products (id, code, name, short_description, long_description, category, execution_mode, status, icon_name, documentation_md)
VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    'business-verification',
    'Business Verification API',
    'Verify company registrations, legal status, TIN numbers, and corporate structure in real-time across East Africa.',
    'The Hudumika Business Verification API connects developers to verified commercial registers, BRELA, and regulatory databases with unified JSON responses, caching, and cryptographic audit proofs.',
    'identity',
    'HYBRID',
    'PUBLIC',
    'shield',
    '# Business Verification API\n\nVerify business entities across Tanzania and East Africa with instant lookups and verification seals.'
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    'esign-execution-seal',
    'Digital Execution Seal API',
    'Cryptographic execution seals, document hashing, and tamper-proof verification API.',
    'Programmatically seal agreements, contracts, and certificates with legal non-repudiation and automated forensic diffing against baseline PDFs.',
    'security',
    'NATIVE',
    'PUBLIC',
    'lock',
    '# Digital Execution Seal API\n\nIssue, inspect, and verify cryptographic execution seals directly in your application workflow.'
  ),
  (
    'a1000000-0000-0000-0000-000000000003',
    'customs-landed-cost',
    'Customs & Landed Cost Computation API',
    'Compute EAC HS code tariffs, import duty, VAT, excise, and port clearance rate cards.',
    'Automated trade engine calculating complete CIF breakdowns, demurrage liability, and multi-currency customs clearance estimations.',
    'trade',
    'NATIVE',
    'PUBLIC',
    'calculator',
    '# Customs & Landed Cost API\n\nCalculate import duties, tax liabilities, and landed cost breakdowns for any HS code.'
  )
ON CONFLICT (code) DO NOTHING;

-- Seed versions for API Products
INSERT INTO api_versions (id, api_product_id, version_str, status, is_default, changelog)
VALUES
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'v1', 'ACTIVE', true, 'Initial release with search, verify, and KYC endpoints.'),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'v1', 'ACTIVE', true, 'Initial release with seal creation, validation, and forensic verification.'),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'v1', 'ACTIVE', true, 'Initial release with EAC Common External Tariff 2026 engine.')
ON CONFLICT (api_product_id, version_str) DO NOTHING;

-- Seed operations for Business Verification API (Hybrid)
INSERT INTO api_operations (id, api_product_id, api_version_id, operation_id, http_method, path_pattern, name, description, execution_mode, billing_unit, default_rate_limit)
VALUES
  ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'business.search', 'GET', '/v1/business/search', 'Search Businesses', 'Query registered businesses by name or registration number.', 'EXTERNAL', 'successful_request', 120),
  ('c1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'business.verify', 'POST', '/v1/business/verify', 'Verify Business Identity', 'Fetch official registration certificate details, directors, and status.', 'EXTERNAL', 'successful_request', 60),
  ('c1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'business.compliance', 'GET', '/v1/business/compliance', 'Check Compliance Standing', 'Hudumika native risk score and regulatory filing check.', 'NATIVE', 'successful_request', 60),
  -- Digital Seal Operations (Native)
  ('c1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'seal.issue', 'POST', '/v1/seal/issue', 'Issue Digital Seal', 'Generate cryptographic execution seal for a signed document manifest.', 'NATIVE', 'successful_request', 60),
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'seal.verify', 'POST', '/v1/seal/verify', 'Verify Execution Seal', 'Cryptographically verify seal authenticity against canonical ledger.', 'NATIVE', 'request', 300),
  -- Landed Cost Operations (Native)
  ('c1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000003', 'landed_cost.compute', 'POST', '/v1/landed-cost/compute', 'Compute Landed Cost', 'Calculate import tariffs, VAT, port dues, and ICD clearance charges.', 'NATIVE', 'successful_request', 120)
ON CONFLICT (api_version_id, http_method, path_pattern) DO NOTHING;

-- Seed operation providers (Cost vs Price mapping)
INSERT INTO api_operation_providers (operation_id, provider_id, provider_unit_cost, provider_currency, is_primary)
VALUES
  ('c1000000-0000-0000-0000-000000000001', (SELECT id FROM api_providers WHERE code = 'brela_gov_adapter'), 150.0000, 'TZS', true),
  ('c1000000-0000-0000-0000-000000000002', (SELECT id FROM api_providers WHERE code = 'brela_gov_adapter'), 300.0000, 'TZS', true),
  ('c1000000-0000-0000-0000-000000000003', (SELECT id FROM api_providers WHERE code = 'hudumika_internal'), 0.0000, 'TZS', true),
  ('c1000000-0000-0000-0000-000000000004', (SELECT id FROM api_providers WHERE code = 'hudumika_internal'), 0.0000, 'TZS', true),
  ('c1000000-0000-0000-0000-000000000005', (SELECT id FROM api_providers WHERE code = 'hudumika_internal'), 0.0000, 'TZS', true),
  ('c1000000-0000-0000-0000-000000000006', (SELECT id FROM api_providers WHERE code = 'hudumika_internal'), 0.0000, 'TZS', true)
ON CONFLICT (operation_id, provider_id) DO NOTHING;

-- Seed Pricing Plans
INSERT INTO api_pricing_plans (api_product_id, code, name, plan_type, currency, monthly_base_fee, included_units, overage_unit_price, rate_limit_per_min, quota_limit_per_mo)
VALUES
  -- Business Verification Plans
  ('a1000000-0000-0000-0000-000000000001', 'free', 'Sandbox & Developer Free', 'FREE', 'TZS', 0.0000, 100, 500.0000, 30, 100),
  ('a1000000-0000-0000-0000-000000000001', 'payg', 'Pay As You Go', 'PAY_AS_YOU_GO', 'TZS', 0.0000, 50, 500.0000, 120, NULL),
  ('a1000000-0000-0000-0000-000000000001', 'growth', 'Growth Tier', 'GROWTH', 'TZS', 150000.0000, 500, 350.0000, 300, 5000),
  ('a1000000-0000-0000-0000-000000000001', 'enterprise', 'Enterprise Custom', 'ENTERPRISE', 'TZS', 500000.0000, 2500, 250.0000, 1000, NULL),
  -- Digital Seal Plans
  ('a1000000-0000-0000-0000-000000000002', 'free', 'Free Tier', 'FREE', 'TZS', 0.0000, 50, 1000.0000, 30, 50),
  ('a1000000-0000-0000-0000-000000000002', 'growth', 'Production Tier', 'GROWTH', 'TZS', 200000.0000, 500, 600.0000, 300, NULL),
  -- Landed Cost Plans
  ('a1000000-0000-0000-0000-000000000003', 'free', 'Free Tier', 'FREE', 'TZS', 0.0000, 100, 200.0000, 60, 100),
  ('a1000000-0000-0000-0000-000000000003', 'growth', 'Trade Engine Pro', 'GROWTH', 'TZS', 100000.0000, 1000, 120.0000, 300, NULL)
ON CONFLICT (api_product_id, code) DO NOTHING;
