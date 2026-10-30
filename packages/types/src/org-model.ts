/**
 * Shared organizational model types.
 * Used by all apps — HR, Finance, ClearOS, ComplyOS, etc.
 */

// ── Entity types ────────────────────────────────────────────────────────────

export type EntityType = 'parent' | 'subsidiary' | 'branch' | 'division' | 'joint_venture' | 'other';
export type EntityStatus = 'active' | 'dormant' | 'dissolved' | 'pending_registration';

export interface TenantEntity {
  id: string;
  tenant_id: string;
  legal_name: string;
  short_name: string | null;
  registration_no: string | null;
  tax_id: string | null;
  country_code: string;
  currency: string;
  entity_type: EntityType;
  parent_entity_id: string | null;
  status: EntityStatus;
  registered_address: string | null;
  primary_industry: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEntityInput {
  legal_name: string;
  short_name?: string;
  registration_no?: string;
  tax_id?: string;
  country_code?: string;
  currency?: string;
  entity_type?: EntityType;
  parent_entity_id?: string;
  registered_address?: string;
  primary_industry?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateEntityInput {
  legal_name?: string;
  short_name?: string | null;
  registration_no?: string | null;
  tax_id?: string | null;
  country_code?: string;
  currency?: string;
  entity_type?: EntityType;
  parent_entity_id?: string | null;
  status?: EntityStatus;
  registered_address?: string | null;
  primary_industry?: string | null;
  metadata?: Record<string, unknown>;
}

// ── Site types ──────────────────────────────────────────────────────────────

export type SiteType = 'office' | 'factory' | 'warehouse' | 'retail' | 'clinic' | 'mine' | 'farm' | 'port' | 'other';
export type SiteStatus = 'active' | 'inactive' | 'under_construction' | 'closed';

export interface TenantSite {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  name: string;
  code: string | null;
  site_type: SiteType;
  address: string | null;
  city: string | null;
  region: string | null;
  country_code: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  status: SiteStatus;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSiteInput {
  entity_id?: string;
  name: string;
  code?: string;
  site_type?: SiteType;
  address?: string;
  city?: string;
  region?: string;
  country_code?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateSiteInput {
  entity_id?: string | null;
  name?: string;
  code?: string | null;
  site_type?: SiteType;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country_code?: string;
  timezone?: string;
  status?: SiteStatus;
  latitude?: number | null;
  longitude?: number | null;
  metadata?: Record<string, unknown>;
}

// ── Entity ↔ Industry junction ──────────────────────────────────────────────

export type EntityIndustryStatus = 'active' | 'inactive' | 'pending';

export interface EntityIndustry {
  id: string;
  tenant_id: string;
  entity_id: string;
  industry_key: string;
  is_primary: boolean;
  effective_from: string;
  effective_to: string | null;
  status: EntityIndustryStatus;
  created_at: string;
}

export interface AssignEntityIndustryInput {
  entity_id: string;
  industry_key: string;
  is_primary?: boolean;
  effective_from?: string;
}

// ── Site ↔ Activity junction ────────────────────────────────────────────────

export type SiteActivityStatus = 'active' | 'inactive' | 'pending_approval';

export interface SiteActivity {
  id: string;
  tenant_id: string;
  site_id: string;
  industry_key: string;
  activity_name: string;
  status: SiteActivityStatus;
  license_ref: string | null;
  created_at: string;
}

export interface AddSiteActivityInput {
  site_id: string;
  industry_key: string;
  activity_name: string;
  license_ref?: string;
}

// ── Tenant-level industry activation ────────────────────────────────────────

export interface TenantIndustry {
  id: string;
  tenant_id: string;
  industry_key: string;
  is_primary: boolean;
  activated_at: string;
  activated_by: string | null;
  deactivated_at: string | null;
}

// ── Industry registry (platform-scoped) ─────────────────────────────────────

export type IndustryStatus = 'proposed' | 'pilot' | 'accepted' | 'unavailable' | 'retired';

export interface IndustryRegistryEntry {
  id: string;
  key: string;
  parent_key: string | null;
  name: string;
  description: string | null;
  aliases: string[];
  isic_code: string | null;
  naics_code: string | null;
  status: IndustryStatus;
  app_capabilities: Record<string, unknown>;
  recommended_finance_caps: string[];
  jurisdiction_coverage: string[];
  config_version: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type IndustryAppCapabilityStatus = 'proposed' | 'pilot' | 'accepted' | 'unavailable' | 'retired';

export interface IndustryAppCapability {
  id: string;
  industry_key: string;
  app_id: string;
  capability_key: string;
  capability_name: string;
  status: IndustryAppCapabilityStatus;
  description: string | null;
  config_schema: unknown;
  created_at: string;
  updated_at: string;
}

// ── User org assignment ────────────────────────────────────────────────────

export interface UserOrgAssignment {
  id: string;
  tenant_id: string;
  user_id: string;
  entity_id: string | null;
  site_id: string | null;
  is_primary: boolean;
  assigned_by: string | null;
  created_at: string;
}

export interface AssignUserOrgInput {
  user_id: string;
  entity_id?: string;
  site_id?: string;
  is_primary?: boolean;
}

// ── Platform operator audit ────────────────────────────────────────────────

export interface PlatformOperatorAuditEntry {
  id: string;
  operator_id: string;
  affected_tenant_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  reason: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

// ── Org model summary (returned by the org-scope API) ───────────────────────

export interface OrgModelSummary {
  entities: TenantEntity[];
  sites: TenantSite[];
  industries: TenantIndustry[];
  entityIndustries: EntityIndustry[];
  siteActivities: SiteActivity[];
}
