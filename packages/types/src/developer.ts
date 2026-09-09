// ─── packages/types/src/developer.ts ────────────────────────────
// TypeScript definitions for Hudumika Developer Platform

export type DeveloperAccountType = 'INDIVIDUAL' | 'ORGANIZATION';
export type DeveloperAccountStatus = 'active' | 'suspended' | 'pending_verification';

export type OrgMemberRole = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'BILLING_ADMIN' | 'SECURITY_ADMIN' | 'VIEWER';
export type OrgVerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export type BillingAccountType = 'PREPAID' | 'POSTPAID' | 'INVOICE' | 'INTERNAL';
export type EnvironmentType = 'DEVELOPMENT' | 'SANDBOX' | 'PRODUCTION';
export type CredentialType = 'API_KEY' | 'OAUTH_CLIENT' | 'SERVICE_ACCOUNT';

export type ApiExecutionMode = 'NATIVE' | 'EXTERNAL' | 'HYBRID';
export type ApiProductStatus = 'DRAFT' | 'SANDBOX_ONLY' | 'BETA' | 'PUBLIC' | 'DEPRECATED' | 'RETIRED';
export type ApiBillingUnit = 'request' | 'successful_request' | 'record' | 'megabyte' | 'seat';
export type PlanType = 'FREE' | 'PAY_AS_YOU_GO' | 'TIERED' | 'GROWTH' | 'ENTERPRISE' | 'INTERNAL';
export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

export interface DeveloperAccount {
  id: string;
  type: DeveloperAccountType;
  name: string;
  slug: string;
  owner_user_id: string;
  status: DeveloperAccountStatus;
  metadata?: Record<string, unknown>;
  organization?: DeveloperOrganization | null;
  billing_account?: DeveloperBillingAccount | null;
  created_at: string;
  updated_at: string;
}

export interface DeveloperOrganization {
  id: string;
  developer_account_id: string;
  legal_name: string;
  registration_number?: string | null;
  tin?: string | null;
  country: string;
  industry?: string | null;
  website?: string | null;
  verification_status: OrgVerificationStatus;
  verified_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeveloperOrgMember {
  id: string;
  developer_account_id: string;
  user_id: string;
  name?: string;
  email?: string;
  role: OrgMemberRole;
  status: 'active' | 'invited' | 'suspended';
  created_at: string;
}

export interface DeveloperBillingAccount {
  id: string;
  developer_account_id: string;
  name: string;
  billing_type: BillingAccountType;
  currency: string;
  balance_credits: number;
  credit_limit: number;
  tax_id?: string | null;
  billing_email?: string | null;
  billing_address?: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeveloperProject {
  id: string;
  developer_account_id: string;
  name: string;
  slug: string;
  description?: string | null;
  is_internal_hudumika: boolean;
  status: 'active' | 'archived' | 'suspended';
  created_by: string;
  created_at: string;
  updated_at: string;
  environments?: DeveloperEnvironment[];
  active_credentials_count?: number;
  active_entitlements_count?: number;
}

export interface DeveloperEnvironment {
  id: string;
  project_id: string;
  environment: EnvironmentType;
  is_enabled: boolean;
  settings?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DeveloperCredential {
  id: string;
  project_id: string;
  environment: EnvironmentType;
  type: CredentialType;
  name: string;
  key_prefix: string;
  client_id?: string | null;
  allowed_ips: string[];
  allowed_origins: string[];
  scopes: string[];
  rate_limit_override?: number | null;
  expires_at?: string | null;
  revoked_at?: string | null;
  revoked_reason?: string | null;
  last_used_at?: string | null;
  created_by: string;
  created_at: string;
  // Raw token is only returned once on creation:
  raw_key?: string;
}

export interface ApiProvider {
  id: string;
  code: string;
  name: string;
  adapter_type: 'HudumikaInternal' | 'ExternalREST' | 'GovernmentAPI' | 'PartnerAPI';
  base_url?: string | null;
  auth_type: string;
  health_status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'MAINTENANCE';
  last_health_check?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiProduct {
  id: string;
  code: string;
  name: string;
  short_description: string;
  long_description?: string | null;
  category: string;
  execution_mode: ApiExecutionMode;
  supported_environments: EnvironmentType[];
  status: ApiProductStatus;
  is_partner_product: boolean;
  partner_name?: string | null;
  icon_name: string;
  documentation_md?: string | null;
  openapi_spec?: Record<string, unknown> | null;
  versions?: ApiVersion[];
  pricing_plans?: ApiPricingPlan[];
  created_at: string;
  updated_at: string;
}

export interface ApiVersion {
  id: string;
  api_product_id: string;
  version_str: string;
  status: 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'RETIRED';
  changelog?: string | null;
  openapi_spec?: Record<string, unknown> | null;
  is_default: boolean;
  operations?: ApiOperation[];
  created_at: string;
  updated_at: string;
}

export interface ApiOperation {
  id: string;
  api_product_id: string;
  api_version_id: string;
  operation_id: string;
  http_method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path_pattern: string;
  name: string;
  description?: string | null;
  execution_mode: 'NATIVE' | 'EXTERNAL';
  billing_unit: ApiBillingUnit;
  default_rate_limit: number;
  default_quota_limit?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ApiPricingPlan {
  id: string;
  api_product_id: string;
  code: string;
  name: string;
  plan_type: PlanType;
  currency: string;
  monthly_base_fee: number;
  included_units: number;
  overage_unit_price: number;
  rate_limit_per_min: number;
  quota_limit_per_mo?: number | null;
  is_public: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
  created_at: string;
  updated_at: string;
}

export interface ApiSubscription {
  id: string;
  developer_account_id: string;
  billing_account_id: string;
  api_product_id: string;
  pricing_plan_id: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  custom_pricing_override?: Record<string, unknown> | null;
  product_name?: string;
  plan_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ApiEntitlement {
  id: string;
  project_id: string;
  environment: EnvironmentType;
  api_product_id: string;
  subscription_id?: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  rate_limit_per_min: number;
  monthly_quota?: number | null;
  allowed_operations: string[];
  expires_at?: string | null;
  product?: ApiProduct;
  created_at: string;
  updated_at: string;
}

export interface ApiUsageEvent {
  id: string;
  event_id: string;
  request_id: string;
  developer_account_id: string;
  project_id: string;
  environment: EnvironmentType;
  api_product_id: string;
  api_version_id: string;
  operation_id: string;
  credential_id?: string | null;
  provider_id?: string | null;
  billing_unit: string;
  quantity: number;
  is_billable: boolean;
  provider_unit_cost: number;
  developer_unit_price: number;
  currency: string;
  status_code: number;
  is_success: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ApiBillingEvent {
  id: string;
  usage_event_id?: string | null;
  developer_account_id: string;
  billing_account_id: string;
  event_type: 'CHARGE' | 'INCLUDED_ALLOWANCE' | 'CREDIT_DEDUCTION' | 'OVERAGE' | 'REFUND' | 'ADJUSTMENT';
  units_billed: number;
  amount: number;
  currency: string;
  description: string;
  invoice_id?: string | null;
  created_at: string;
}

export interface DeveloperTelemetrySummary {
  total_requests: number;
  successful_requests: number;
  error_requests: number;
  avg_latency_ms: number;
  billable_units: number;
  total_cost: number;
  currency: string;
  active_credentials: number;
  active_projects: number;
  daily_series: Array<{
    date: string;
    requests: number;
    errors: number;
    latency_ms: number;
    units: number;
  }>;
}
