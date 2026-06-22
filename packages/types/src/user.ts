// ─── ClearOS User & Auth Types ───────────────────────────────

// ── Roles ────────────────────────────────────────────────────
export type UserRole =
  | 'SUPER_ADMIN'    // Platform operator — all tenants
  | 'ADMIN'          // Clearing company director — own tenant
  | 'MANAGER'        // Operations manager — all cases, finance oversight
  | 'FINANCE'        // Finance officer — financial data, approvals
  | 'SALES'          // Sales officer — leads, quotations, customers
  | 'SENIOR'         // Senior clearing officer — all cases, limited metrics
  | 'JUNIOR'         // Junior clearing officer — assigned cases, escalates up
  | 'CUSTOMER'       // Customer portal — own consignments only
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
  location_id?: string;       // assigned location for officers
  active: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

// ── User (safe for client consumption) ───────────────────────

export type SafeUser = Omit<User, 'password_hash'>;

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
  | 'operations'
  | 'finance'
  | 'enterprise'
  | 'professional'; // @deprecated — treated as finance

export const PLAN_LEVELS: Record<TenantPlan, number> = {
  starter:      1,
  operations:   2,
  professional: 3, // legacy alias
  finance:      3,
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
  starter:      ['ADMIN', 'SALES', 'CUSTOMER'],
  operations:   ['ADMIN', 'SALES', 'CUSTOMER', 'JUNIOR', 'SENIOR'],
  professional: ['ADMIN', 'SALES', 'CUSTOMER', 'JUNIOR', 'SENIOR', 'FINANCE', 'MANAGER'],
  finance:      ['ADMIN', 'SALES', 'CUSTOMER', 'JUNIOR', 'SENIOR', 'FINANCE', 'MANAGER'],
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
}

// ── Auth Types ───────────────────────────────────────────────

export interface LoginInput {
  email: string;
  password: string;
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
}
