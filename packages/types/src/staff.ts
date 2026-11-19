/**
 * Hudumika staff console — the platform staff permission model.
 *
 * Platform staff access is separate from workspace roles: a tenant ADMIN,
 * MANAGER or FINANCE role grants nothing here. A user becomes staff only
 * through a staff membership plus role grants (apps/api migration 919), and
 * every request re-reads those grants (services/staff-access.service.ts).
 *
 * This file is shared by the API (enforcement) and the console (navigation
 * and route guards), so both derive from the same definitions. The console's
 * checks are presentation only; the API is the authority.
 */

// ── Permissions ──────────────────────────────────────────────────────────
// Read, change, export and sensitive-content access are separate permissions.
export const STAFF_PERMISSIONS = {
  'overview.platform': 'See the platform overview (all customers and products)',
  'overview.operations': 'See the operations overview for your scope',
  'work.own': 'See and work on cases assigned to you',
  'customers.view': 'See customer relationship metadata (owner, teams, plan, products, readiness)',
  'customers.manage': 'Change customer ownership, teams, contacts and service terms',
  'customers.export': 'Export customer lists',
  'products.view': 'See products, their health and affected customers',
  'products.manage': 'Change product operations settings',
  'teams.view': 'See teams, members and coverage',
  'teams.manage': 'Create teams and change members and coverage',
  'cases.view': 'See cases in your scope',
  'cases.claim': 'Claim unassigned cases',
  'cases.assign': 'Assign, reassign and hand off cases',
  'cases.update': 'Change case status, priority, severity and due dates',
  'cases.internal_notes': 'Read and write internal case notes',
  'cases.reply': 'Send customer-visible replies on cases',
  'cases.verify_outcome': 'Confirm the customer outcome of a case',
  'cases.export': 'Export cases',
  'incidents.view': 'See product incidents and affected customers',
  'incidents.manage': 'Declare, update and resolve incidents',
  'lens.view': 'See linked Lens engineering issues',
  'lens.link': 'Link cases and incidents to Lens issues',
  'access.request': 'Open a controlled access session to a customer',
  'access.approve': 'Approve other staff members’ access sessions',
  'access.oversee': 'See and revoke every access session',
  'security.view': 'See security posture, sign-ins and sessions',
  'security.revoke': 'Revoke sessions and credentials',
  'security.export': 'Export security records',
  'billing.view': 'See subscriptions, invoices and payments',
  'billing.change': 'Change plans and billing settings',
  'billing.export': 'Export billing records',
  'monitoring.view': 'See service health, jobs, deliveries and deployments',
  'maintenance.manage': 'Put products into or out of maintenance',
  'audit.view': 'See audit history',
  'audit.export': 'Export audit history',
  'staff.view': 'See staff members, roles and grants',
  'staff.manage': 'Grant and revoke staff roles, permissions and scopes',
  'settings.view': 'See platform settings',
  'settings.manage': 'Change platform settings (opens the SuperAdmin tools)',
} as const;
export type StaffPermission = keyof typeof STAFF_PERMISSIONS;
export const ALL_STAFF_PERMISSIONS = Object.keys(STAFF_PERMISSIONS) as StaffPermission[];

// ── Role templates ───────────────────────────────────────────────────────
// Templates are seeded into staff_roles and can be edited there; these are
// the initial definitions. `broadScope` grants every product and customer —
// any other role sees only what its teams and assignments cover.
export interface StaffRoleTemplate {
  key: string;
  name: string;
  description: string;
  permissions: StaffPermission[];
  defaultHome: StaffHomeId;
  broadScope: boolean;
}

export const STAFF_ROLE_TEMPLATES: StaffRoleTemplate[] = [
  { key: 'superadmin', name: 'SuperAdmin', description: 'Everything, across every product and customer.', permissions: ALL_STAFF_PERMISSIONS, defaultHome: 'platform', broadScope: true },
  {
    key: 'operations_manager', name: 'Operations Manager', description: 'Runs the operations teams: queues, assignment, escalations and incidents.', defaultHome: 'operations', broadScope: false,
    permissions: ['overview.operations', 'work.own', 'customers.view', 'customers.manage', 'customers.export', 'products.view', 'teams.view', 'teams.manage', 'cases.view', 'cases.claim', 'cases.assign', 'cases.update', 'cases.internal_notes', 'cases.reply', 'cases.verify_outcome', 'cases.export', 'incidents.view', 'incidents.manage', 'lens.view', 'lens.link', 'access.request', 'access.approve', 'monitoring.view', 'audit.view', 'staff.view'],
  },
  {
    key: 'product_ops_lead', name: 'Product Operations Lead', description: 'Owns operations for assigned products: their cases, incidents and customers.', defaultHome: 'product', broadScope: false,
    permissions: ['overview.operations', 'work.own', 'customers.view', 'products.view', 'products.manage', 'teams.view', 'cases.view', 'cases.claim', 'cases.assign', 'cases.update', 'cases.internal_notes', 'cases.reply', 'cases.verify_outcome', 'incidents.view', 'incidents.manage', 'lens.view', 'lens.link', 'access.request', 'monitoring.view'],
  },
  {
    key: 'operations_agent', name: 'Operations Agent', description: 'Works cases in assigned queues.', defaultHome: 'my_work', broadScope: false,
    permissions: ['work.own', 'customers.view', 'products.view', 'teams.view', 'cases.view', 'cases.claim', 'cases.update', 'cases.internal_notes', 'cases.reply', 'cases.verify_outcome', 'incidents.view', 'lens.view', 'access.request'],
  },
  {
    key: 'customer_success_manager', name: 'Customer Success Manager', description: 'Owns customer relationships, onboarding and readiness.', defaultHome: 'my_customers', broadScope: false,
    permissions: ['overview.operations', 'work.own', 'customers.view', 'customers.manage', 'products.view', 'teams.view', 'cases.view', 'cases.claim', 'cases.update', 'cases.internal_notes', 'cases.reply', 'cases.verify_outcome', 'incidents.view', 'access.request'],
  },
  {
    key: 'security_admin', name: 'Security Administrator', description: 'Investigates sign-ins and sessions, revokes access, oversees staff access sessions.', defaultHome: 'security', broadScope: true,
    permissions: ['security.view', 'security.revoke', 'security.export', 'access.oversee', 'access.approve', 'audit.view', 'audit.export', 'staff.view', 'customers.view'],
  },
  {
    key: 'billing_admin', name: 'Billing Administrator', description: 'Subscriptions, invoices and payments.', defaultHome: 'billing', broadScope: true,
    permissions: ['billing.view', 'billing.change', 'billing.export', 'customers.view', 'audit.view'],
  },
  {
    key: 'platform_engineer', name: 'Platform Engineer', description: 'Service health, jobs, deliveries, deployments and engineering issues.', defaultHome: 'service_health', broadScope: true,
    permissions: ['monitoring.view', 'maintenance.manage', 'products.view', 'incidents.view', 'incidents.manage', 'lens.view', 'lens.link', 'cases.view', 'cases.internal_notes', 'audit.view'],
  },
  {
    key: 'auditor', name: 'Auditor', description: 'Read-only audit history and reports.', defaultHome: 'audit', broadScope: true,
    permissions: ['audit.view', 'audit.export', 'staff.view', 'customers.view', 'security.view', 'billing.view'],
  },
];

// ── Sections and homes ───────────────────────────────────────────────────
// Navigation and route guards both come from this table. A section is shown
// when the viewer holds any of `anyOf`.
export interface StaffSection {
  id: string;
  label: string;
  path: string;
  icon: string;
  anyOf: StaffPermission[];
}

export const STAFF_SECTIONS: StaffSection[] = [
  { id: 'overview', label: 'Overview', path: '/console/overview', icon: 'monitor', anyOf: ['overview.platform', 'overview.operations', 'monitoring.view', 'security.view', 'billing.view'] },
  { id: 'my-work', label: 'My Work', path: '/console/my-work', icon: 'inbox', anyOf: ['work.own'] },
  { id: 'customers', label: 'Customers', path: '/console/customers', icon: 'building', anyOf: ['customers.view'] },
  { id: 'products', label: 'Products', path: '/console/products', icon: 'package', anyOf: ['products.view'] },
  { id: 'teams', label: 'Teams & Assignments', path: '/console/teams', icon: 'users', anyOf: ['teams.view', 'staff.view'] },
  { id: 'cases', label: 'Cases & Incidents', path: '/console/cases', icon: 'alertCircle', anyOf: ['cases.view', 'incidents.view'] },
  { id: 'security', label: 'Identity & Security', path: '/console/security', icon: 'shield', anyOf: ['security.view', 'access.oversee'] },
  { id: 'billing', label: 'Billing & Subscriptions', path: '/console/billing', icon: 'creditCard', anyOf: ['billing.view'] },
  { id: 'audit', label: 'Reports & Audit', path: '/console/audit', icon: 'fileText', anyOf: ['audit.view'] },
  { id: 'settings', label: 'Platform Settings', path: '/console/settings', icon: 'settings', anyOf: ['settings.view', 'maintenance.manage'] },
];

// ── Platform tools (the former /admin pages, now inside the console) ─────
// Each tool lives under a section. The APIs behind these tools are not
// filtered per customer, so a non-SuperAdmin needs the permission AND
// platform-wide scope (every customer and product, no exclusions) — the same
// rule apps/api/src/services/platform-admin-access.ts enforces. `superadmin`
// tools are platform configuration and stay with the SuperAdmin role.
export interface StaffTool {
  id: string;
  section: string;
  label: string;
  path: string;
  icon: string;
  /** Former /admin path, redirected here. */
  legacyPath: string;
  requires: { perm: StaffPermission } | 'superadmin';
}

export const STAFF_TOOLS: StaffTool[] = [
  { id: 'platform-dashboard', section: 'overview', label: 'Platform dashboard', path: '/console/overview/platform', icon: 'monitor', legacyPath: '/admin/dashboard', requires: { perm: 'overview.platform' } },
  { id: 'companies', section: 'customers', label: 'Companies', path: '/console/customers/companies', icon: 'building', legacyPath: '/admin/companies', requires: { perm: 'customers.view' } },
  { id: 'kyb', section: 'customers', label: 'Business verification', path: '/console/customers/verification', icon: 'fingerprint', legacyPath: '/admin/kyb', requires: { perm: 'customers.view' } },
  { id: 'announcements', section: 'customers', label: 'Announcements', path: '/console/customers/announcements', icon: 'bell', legacyPath: '/admin/announcements', requires: { perm: 'customers.view' } },
  { id: 'domains', section: 'products', label: 'Domains', path: '/console/products/domains', icon: 'globe', legacyPath: '/admin/domains', requires: { perm: 'products.view' } },
  { id: 'app-status', section: 'products', label: 'App status', path: '/console/products/app-status', icon: 'shield', legacyPath: '/admin/app-status', requires: { perm: 'monitoring.view' } },
  { id: 'subscriptions', section: 'billing', label: 'Subscriptions', path: '/console/billing/subscriptions', icon: 'creditCard', legacyPath: '/admin/subscriptions', requires: { perm: 'billing.view' } },
  { id: 'packages', section: 'billing', label: 'Packages', path: '/console/billing/packages', icon: 'package', legacyPath: '/admin/packages', requires: { perm: 'billing.view' } },
  { id: 'transactions', section: 'billing', label: 'Transactions', path: '/console/billing/transactions', icon: 'receipt', legacyPath: '/admin/transactions', requires: { perm: 'billing.view' } },
  { id: 'finance', section: 'billing', label: 'Finance', path: '/console/billing/finance', icon: 'dollarSign', legacyPath: '/admin/finance', requires: { perm: 'billing.view' } },
  { id: 'referrals', section: 'billing', label: 'Referral commissions', path: '/console/billing/referrals', icon: 'link', legacyPath: '/admin/referrals', requires: { perm: 'billing.view' } },
  { id: 'activity', section: 'audit', label: 'Activity log', path: '/console/audit/activity', icon: 'clock', legacyPath: '/admin/activity', requires: { perm: 'audit.view' } },
  { id: 'analytics', section: 'audit', label: 'Analytics', path: '/console/audit/analytics', icon: 'trendingUp', legacyPath: '/admin/analytics', requires: { perm: 'overview.platform' } },
  { id: 'platform-settings', section: 'settings', label: 'Platform configuration', path: '/console/settings/platform', icon: 'settings', legacyPath: '/admin/settings', requires: 'superadmin' },
  { id: 'design-system', section: 'settings', label: 'Design system', path: '/console/settings/design-system', icon: 'sliders', legacyPath: '/admin/design-system', requires: 'superadmin' },
  { id: 'seo', section: 'settings', label: 'SEO & analytics', path: '/console/settings/seo', icon: 'trendingUp', legacyPath: '/admin/seo', requires: 'superadmin' },
  { id: 'cms-pages', section: 'settings', label: 'CMS pages', path: '/console/settings/cms-pages', icon: 'fileText', legacyPath: '/admin/cms-pages', requires: 'superadmin' },
  { id: 'sms-gateways', section: 'settings', label: 'SMS gateways', path: '/console/settings/sms-gateways', icon: 'messageSquare', legacyPath: '/admin/sms-gateways', requires: 'superadmin' },
  { id: 'signing-cert', section: 'settings', label: 'Signing certificate', path: '/console/settings/signing-cert', icon: 'lock', legacyPath: '/admin/signing-cert', requires: 'superadmin' },
];

/** Former /admin paths that moved to a console section rather than a tool. */
export const STAFF_LEGACY_REDIRECTS: Record<string, string> = {
  '/admin/issues': '/console/cases',
  '/admin/branding': '/console/settings/design-system?section=identity',
  '/admin/components': '/console/settings/design-system?section=components',
  '/admin/devices': '/nexushr/platform-devices',
};

/** Tool ids the viewer may open — the same rule as the API guard. */
export function staffTools(perms: readonly string[], isSuperAdmin: boolean, platformWide: boolean): StaffTool[] {
  return STAFF_TOOLS.filter(t => {
    if (isSuperAdmin) return true;
    if (t.requires === 'superadmin') return false;
    return platformWide && perms.includes(t.requires.perm);
  });
}

/** The console path a former /admin URL now lives at (null when unknown). */
export function consolePathForLegacyAdmin(pathname: string, search = ''): string | null {
  const clean = pathname.replace(/\/+$/, '');
  if (clean === '/admin') return '/console';
  const redirect = STAFF_LEGACY_REDIRECTS[clean];
  if (redirect) return redirect.includes('?') || !search ? redirect : redirect + search;
  const tool = STAFF_TOOLS.find(t => t.legacyPath === clean);
  return tool ? tool.path + search : null;
}

export type StaffHomeId = 'platform' | 'operations' | 'product' | 'my_work' | 'my_customers' | 'security' | 'billing' | 'service_health' | 'audit';

export const STAFF_HOMES: Record<StaffHomeId, { label: string; path: string; anyOf: StaffPermission[] }> = {
  platform: { label: 'Platform overview', path: '/console/overview', anyOf: ['overview.platform'] },
  operations: { label: 'Operations overview', path: '/console/overview?view=operations', anyOf: ['overview.operations'] },
  product: { label: 'Assigned product overview', path: '/console/products', anyOf: ['products.view'] },
  my_work: { label: 'My work', path: '/console/my-work', anyOf: ['work.own'] },
  my_customers: { label: 'My customers', path: '/console/customers?mine=1', anyOf: ['customers.view'] },
  security: { label: 'Security overview', path: '/console/security', anyOf: ['security.view'] },
  billing: { label: 'Billing overview', path: '/console/billing', anyOf: ['billing.view'] },
  service_health: { label: 'Service health', path: '/console/overview?view=health', anyOf: ['monitoring.view'] },
  audit: { label: 'Audit and reports', path: '/console/audit', anyOf: ['audit.view'] },
};

/** Deterministic fallback order when the configured home is unavailable. */
export const STAFF_HOME_FALLBACK_ORDER: StaffHomeId[] = ['platform', 'operations', 'my_work', 'my_customers', 'product', 'service_health', 'security', 'billing', 'audit'];

export function staffHas(perms: readonly string[], anyOf: readonly string[]): boolean {
  return anyOf.some(p => perms.includes(p));
}

/** Visible sections for a permission set — the same list nav and guards use. */
export function staffSections(perms: readonly string[]): StaffSection[] {
  return STAFF_SECTIONS.filter(s => staffHas(perms, s.anyOf));
}

/**
 * The home to open: the user's chosen home if still permitted, else the first
 * role's default if permitted, else the first permitted home in fallback
 * order, else null (no access assigned).
 */
export function resolveStaffHome(perms: readonly string[], preferred: (StaffHomeId | null | undefined)[]): StaffHomeId | null {
  for (const h of preferred) if (h && STAFF_HOMES[h] && staffHas(perms, STAFF_HOMES[h].anyOf)) return h;
  for (const h of STAFF_HOME_FALLBACK_ORDER) if (staffHas(perms, STAFF_HOMES[h].anyOf)) return h;
  return null;
}

/**
 * A return destination after sign-in is accepted only if it is an internal
 * console path (no scheme, host, protocol-relative or backslash tricks) whose
 * section the viewer may open.
 */
export function safeStaffReturnPath(raw: string | null | undefined, perms: readonly string[], allowedTools?: readonly string[]): string | null {
  if (!raw || typeof raw !== 'string' || raw.length > 500) return null;
  if (!raw.startsWith('/console/') || raw.startsWith('//') || raw.includes('\\') || /[\u0000-\u001f]/.test(raw)) return null;
  let url: URL;
  try { url = new URL(raw, 'https://console.invalid'); } catch { return null; }
  if (url.origin !== 'https://console.invalid') return null;
  const section = STAFF_SECTIONS.find(s => url.pathname === s.path || url.pathname.startsWith(`${s.path}/`));
  if (!section || !staffHas(perms, section.anyOf)) return null;
  const tool = STAFF_TOOLS.find(t => url.pathname === t.path || url.pathname.startsWith(`${t.path}/`));
  if (tool && allowedTools && !allowedTools.includes(tool.id)) return null;
  return url.pathname + url.search;
}

// ── Shapes returned by GET /v1/staff/me ──────────────────────────────────
export interface StaffScope {
  allProducts: boolean;
  allCustomers: boolean;
  productIds: string[];
  customerIds: string[];
  excludedProductIds: string[];
  excludedCustomerIds: string[];
}

export interface StaffMe {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  roles: { key: string; name: string; expiresAt: string | null }[];
  permissions: StaffPermission[];
  scope: StaffScope;
  teams: { id: string; name: string; kind: string }[];
  home: StaffHomeId | null;
  homePath: string | null;
  preferredHome: StaffHomeId | null;
  availableHomes: StaffHomeId[];
  sections: string[];
  isSuperAdmin: boolean;
  /** Every customer and product, no exclusions — needed for the platform tools. */
  platformWide: boolean;
  /** STAFF_TOOLS ids this viewer may open. */
  tools: string[];
  activeAccessSession: StaffAccessSessionView | null;
}

export interface StaffAccessSessionView {
  id: string;
  tenantId: string;
  tenantName: string;
  appId: string | null;
  actions: string[];
  purpose: string;
  caseId: string | null;
  basis: 'customer_approval' | 'standing_authorization';
  status: 'pending_approval' | 'active' | 'ended' | 'revoked' | 'expired' | 'denied';
  startsAt: string | null;
  expiresAt: string;
}
