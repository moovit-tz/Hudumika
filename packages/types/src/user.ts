// ─── Hudumika User & Auth Types ───────────────────────────────

// ── Hudumika App IDs ─────────────────────────────────────────

export type AppId =
  | 'clearos'    // Customs Clearance & Freight
  | 'finops'     // Finance & Accounts
  | 'complyos'   // Compliance
  | 'bliss'      // Support & Helpdesk
  | 'nexushr'      // People & HR
  | 'onesite'    // Web & CMS
  | 'onsite'     // Hosting, domains, DNS & cloud infrastructure. Distinct from
                 // 'onesite' above despite the one-letter difference: that is
                 // the CMS (/cms, CMSShell, cms.routes.ts). OnsiteShell shipped
                 // declaring appId="onesite", so both apps resolved to one
                 // identity — same colour, same label, same entitlement — and
                 // Onsite appeared in neither the launcher nor the hub.
  | 'oneid'      // Identity & Access
  | 'tracking'   // Vehicle GPS & Geospatial Tracking
  | 'cloud'      // File Storage
  | 'ai'         // AI Assistant
  | 'workspace'  // Tenant Admin & Settings
  | 'admin'      // Platform Super Admin Console
  | 'email'      // Hudumika Email
  | 'crm'        // Customers & Leads
  | 'contacts'   // Google Contacts Clone
  | 'store'      // Hudumika Marketplace — add-ons & plugins
  | 'calendar'   // Calendar — free app
  | 'tasks'      // Tasks / To-do — free app
  | 'demurrage'    // Container demurrage tariffs & tracking (split out of ClearOS)
  | 'cargotracker' // AWB/BL shipment tracking (split out of ClearOS)
  | 'seal'         // Bonded / customs-controlled warehouse
  | 'inventory'    // General multi-warehouse stock control (separate from SEAL's bonded-warehouse domain)
  | 'studio'       // Workflow Studio — the platform's automation control plane
  | 'hudubi'       // Data Layer & AI Analytics Engine
  | 'petti'        // Tenant petty-cash wallet — deposits, request/approve/disburse withdrawals
  | 'notes'        // Google Keep style notes app — free app
  | 'lens';        // Internal developer record — SuperAdmin only, never customer-facing

export const ALL_APP_IDS: AppId[] = [
  'clearos', 'finops', 'complyos', 'bliss',
  'nexushr', 'onesite', 'onsite', 'oneid', 'tracking', 'cloud', 'ai', 'workspace', 'admin', 'email', 'crm', 'contacts', 'store',
  'calendar', 'tasks', 'notes',
  'demurrage', 'cargotracker', 'seal', 'inventory', 'studio', 'hudubi', 'petti',
  // Internal tooling. Present so the app shell and design system can resolve it
  // like any other app; the launcher filters it out for non-SuperAdmins and
  // both its route and its endpoints require that role.
  'lens',
];

// ── Roles ────────────────────────────────────────────────────
export type UserRole =
  | 'SUPER_ADMIN'    // Platform operator — all tenants
  | 'ADMIN'          // Clearing company director — own tenant
  | 'MANAGER'        // Operations manager — all cases, finance oversight
  | 'FINANCE'        // Finance officer — financial data, approvals
  | 'SALES'          // Sales officer — leads, quotations, customers
  | 'SENIOR'         // Senior clearing officer — all cases, limited metrics
  | 'JUNIOR'         // Junior clearing officer — assigned cases, escalates up
  | 'CUSTOMER'       // Customer portal — own consignments only, one tenant
  | 'ORG'            // Organization portal — same real-world company tracked
                      // across every tenant that has linked a customer record
                      // to it. Structurally different from CUSTOMER: no
                      // tenant_id claim at all: see customer-identity vs
                      // organizations.routes.ts. Locked to an explicit route
                      // allowlist in middleware/auth.ts, not free to browse
                      // the rest of the API the way other roles are.
  // Legacy aliases kept for backward compatibility
  | 'TENANT_ADMIN'   // @deprecated — treated as ADMIN
  | 'OFFICER';       // @deprecated — treated as JUNIOR

export const INTERNAL_ROLES: UserRole[] = [
  'SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR',
];

export const ALL_ROLES: UserRole[] = [
  'SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR', 'CUSTOMER',
];

// ── User ─────────────────────────────────────────────────────

// Optional self-service profile fields with no dedicated columns — stored as
// one JSONB blob on users.profile rather than one column each, since none of
// these are ever filtered/joined on.
export interface UserProfileFields {
  bio?: string;
  job_title?: string;
  city?: string;
  country?: string;
  timezone?: string;
  language?: string;
  website?: string;
  cover_url?: string;
  
  // HR/Staff Fields
  employee_code?: string;
  department?: string;
  reports_to?: string;
  employment_type?: string;
  address?: string;
  gender?: string;
  date_of_birth?: string;
  biometric_id?: string;
}

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  password_hash?: string;     // never sent to client
  role: UserRole;
  name: string;
  phone?: string;
  avatar_url?: string;        // base64 or URL of profile photo
  avatar_initials?: string;   // computed from name, e.g. 'MK'
  profile?: UserProfileFields;
  location_id?: string;       // assigned location for officers
  app_permissions?: AppId[];  // null/undefined = access to all apps; array = restricted set
  active: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

// ── User (safe for client consumption) ───────────────────────

/**
 * `impersonated_by`/`impersonated_by_name` are session properties (carried on
 * the JWT, see JWTPayload below), not columns on the `users` row itself — a
 * real user record never has them, only a session minted by /auth/impersonate
 * or /auth/impersonate-customer does. Echoed back here so the client can
 * derive `isImpersonating` from the (cookie-authenticated) user object rather
 * than from a token it can no longer read directly.
 */
export type SafeUser = Omit<User, 'password_hash'> & {
  impersonated_by?: string;
  impersonated_by_name?: string;
};

// ── Tenant ───────────────────────────────────────────────────

/**
 * SaaS plan tiers — each tier is a superset of the one below it.
 *
 *  starter     → CRM only (Customers, Leads, Quotes, Chat, Support)
 *  operations  → + Shipments, Consignments, Demurrage, Declarations
 *  finance     → + Full Finance Suite (Invoices, Bills, Reports, Accounts)
 *  enterprise  → + HR/People, Payroll, Integrations, Advanced Analytics
 *  professional→ legacy alias treated as finance
 */
export type TenantPlan =
  | 'starter'
  | 'growth'
  | 'scale'
  | 'enterprise'
  | 'operations' // legacy
  | 'finance'    // legacy
  | 'professional' // legacy
  // Internal marker, never purchased directly (packages.is_active = false) —
  // a client tenant created and managed by an agency (AgencyHost M1). Grants
  // nothing on its own; 'onsite' access while attached comes from
  // middleware/entitlement.ts checking agency_managed_tenants directly, not
  // from this plan's (nonexistent) package_features rows.
  | 'agency-managed'
  // Real, purchasable (packages.is_active = true) — grants only 'onsite'.
  // The landing spot for a former agency-managed client once its
  // agency_managed_tenants relationship ends (AgencyHost M3/M4), and the
  // direct answer for a signup that wants hosting alone.
  | 'onsite-standalone';

export const PLAN_LEVELS: Record<TenantPlan, number> = {
  'agency-managed': 0, // grants no tier-gated feature on its own — see TenantPlan's doc comment
  'onsite-standalone': 0, // grants exactly one feature (onsite), not a tier
  starter:      1,
  operations:   2,
  growth:       2,
  professional: 3, // legacy alias
  finance:      3, // legacy alias
  scale:        3,
  enterprise:   4,
};

/** Returns true when the tenant's current plan includes the required tier. */
export function planHas(userPlan: TenantPlan, required: TenantPlan): boolean {
  return PLAN_LEVELS[userPlan] >= PLAN_LEVELS[required];
}

/**
 * Which roles are available per plan tier.
 * Higher plans include all roles from lower plans.
 */
export const PLAN_ROLES: Record<TenantPlan, UserRole[]> = {
  'agency-managed': ['ADMIN', 'CUSTOMER'],
  'onsite-standalone': ['ADMIN', 'CUSTOMER'],
  starter:      ['ADMIN', 'SALES', 'CUSTOMER'],
  operations:   ['ADMIN', 'SALES', 'CUSTOMER', 'JUNIOR', 'SENIOR'],
  growth:       ['ADMIN', 'SALES', 'CUSTOMER', 'JUNIOR', 'SENIOR'],
  professional: ['ADMIN', 'SALES', 'CUSTOMER', 'JUNIOR', 'SENIOR', 'FINANCE', 'MANAGER'],
  finance:      ['ADMIN', 'SALES', 'CUSTOMER', 'JUNIOR', 'SENIOR', 'FINANCE', 'MANAGER'],
  scale:        ['ADMIN', 'SALES', 'CUSTOMER', 'JUNIOR', 'SENIOR', 'FINANCE', 'MANAGER'],
  enterprise:   ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR', 'CUSTOMER'],
};

export interface Tenant {
  id: string;
  slug: string;               // e.g. 'msomi-freight'
  name: string;
  plan: TenantPlan;
  wa_phone_id?: string;       // WhatsApp Business phone ID
  wa_token?: string;          // Meta Cloud API token (encrypted)
  smtp_config?: string;       // SMTP config JSON (encrypted)
  logo_url?: string;
  primary_color?: string;     // custom branding
  active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Customer ─────────────────────────────────────────────────

export type CustomerCategory = 'enterprise' | 'sme' | 'individual';
export type PreferredChannel = 'WHATSAPP' | 'EMAIL' | 'WECHAT';

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;                // company name
  contact_name?: string;       // primary contact person
  email?: string;
  phone?: string;
  phone_wa?: string;           // WhatsApp number (+2557XXXXXXXX)
  phone_wechat?: string;       // for Chinese customers
  category?: CustomerCategory;
  preferred_channel?: PreferredChannel;
  tax_id?: string;             // TIN for invoicing
  avatar_color?: string;       // hex color for avatar background
  avatar_initials?: string;    // computed from company name
  assigned_officer_id?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  // BRELA-derived company profile fields — only populated for companies
  // imported via ComplyOS's BRELA Search ('brela_import'), left undefined
  // for ordinary manually-created customers.
  source?: string;                   // 'manual' | 'brela_import'
  registry_number?: string;          // BRELA registration/incorporation number (dedup key)
  entity_type?: string;              // e.g. "Private Limited Company", "Business Name"
  registration_status?: string;      // e.g. "Registered", "Pending Annual Return"
  registered_address?: string;
  incorporation_date?: string;
}

// ── Auth Types ───────────────────────────────────────────────

export interface LoginInput {
  email: string;
  password: string;
  totp?: string; // 6-digit code, required only when the account has 2FA enabled (see user_totp)
}

export interface CustomerOTPInput {
  phone_wa: string;
}

export interface CustomerVerifyInput {
  phone_wa: string;
  otp: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SafeUser;
}

export interface JWTPayload {
  sub: string;          // user_id
  tenant_id: string;
  role: UserRole;
  email: string;
  name: string;
  iat: number;
  exp: number;
  device_id?: string;   // hr_devices.id created at sign-in — lets a specific session be revoked (see hr_devices.revoked_at)
  // Set only by /auth/impersonate and /auth/impersonate-customer — the real
  // SUPER_ADMIN users.id (and a name snapshot, so audit/UI never need a join
  // back to a possibly-deleted user) behind a session whose role/tenant_id
  // claims belong to whoever is being impersonated. Absent on every normal
  // login. See isPlatformSuperAdmin() in middleware/rbac.ts.
  impersonated_by?: string;
  impersonated_by_name?: string;
}

// ── Organization (platform-level identity, spans tenants) ──────

/** Login credentials for `POST /auth/org-login`. A separate table
 *  (organization_users) and endpoint from staff/customer login — see
 *  migration 230 and auth.routes.ts. */
export interface OrgLoginInput {
  email: string;
  password: string;
}

export interface Organization {
  id: string;
  name: string;
  email?: string;
  tax_id?: string;
  created_at: string;
  updated_at: string;
}

/** Client-safe shape of an organization_users row. No tenant_id — an
 *  Organization is a peer of `tenants`, not scoped to one. */
export interface SafeOrgUser {
  id: string;
  org_id: string;
  email: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrgAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SafeOrgUser;
}

/** JWT claims for an 'ORG'-role login. Structurally different from
 *  JWTPayload: no tenant_id at all, and no device_id (V1 has no
 *  per-device "sign out" support for org logins). middleware/auth.ts locks
 *  this role to an explicit route allowlist rather than trusting every
 *  route file to reject an unfamiliar shape on its own. */
export interface OrgJWTPayload {
  sub: string;          // organization_users.id
  org_id: string;
  role: 'ORG';
  email: string;
  name: string;
  iat: number;
  exp: number;
}
