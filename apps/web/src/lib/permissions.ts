import type { UserRole } from '@hudumika/types';

// ── Role groups (convenience constants) ───────────────────────
export const MGMT_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];
export const OPS_ROLES: UserRole[]  = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR', 'OFFICER'];
export const FIN_ROLES: UserRole[]  = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'];
export const CRM_ROLES: UserRole[]  = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR'];
export const ALL_STAFF: UserRole[]  = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER'];
export const CFA_ROLES: UserRole[]  = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR', 'OFFICER', 'FINANCE'];

// ── Where each role lands after login ─────────────────────────
const ROLE_HOME_MAP: Partial<Record<string, string>> = {
  FINANCE: '/finance/overview',
  SALES:   '/customers/overview',
  SENIOR:  '/shipments',
  JUNIOR:  '/shipments',
  OFFICER: '/shipments',
};

/** Returns the home path for the given role (defaults to '/' for management). */
export function roleHomePath(role: string | undefined): string {
  return ROLE_HOME_MAP[role ?? ''] ?? '/';
}

// ── Dashboard module visibility per role ──────────────────────
export const MODULE_ROLES: Record<string, UserRole[]> = {
  cfa:     CFA_ROLES,
  finance: FIN_ROLES,
  crm:     CRM_ROLES,
  tools:   ALL_STAFF,
};

// ── Route-level access rules ──────────────────────────────────
// Listed from most-specific to least-specific; first match wins.
const ROUTE_RULES: Array<{ prefix: string; roles: UserRole[] }> = [
  // Super-admin-only
  { prefix: '/admin',             roles: ['SUPER_ADMIN'] },
  { prefix: '/tenant-management', roles: ['SUPER_ADMIN'] },
  { prefix: '/system-update',     roles: ['SUPER_ADMIN'] },
  // Management-only
  { prefix: '/hrm',               roles: MGMT_ROLES },
  { prefix: '/settings',          roles: MGMT_ROLES },
  { prefix: '/reports',           roles: [...MGMT_ROLES, 'FINANCE'] },
  { prefix: '/escalations',       roles: [...MGMT_ROLES, 'SENIOR'] },
  // Finance & Sales only
  { prefix: '/finance',           roles: FIN_ROLES },
  { prefix: '/billing',           roles: FIN_ROLES },
  { prefix: '/quotations',        roles: [...FIN_ROLES, 'SENIOR'] },
  { prefix: '/purchase-orders',   roles: FIN_ROLES },
  { prefix: '/expenses',          roles: FIN_ROLES },
  { prefix: '/accounts',          roles: FIN_ROLES },
  // CRM — Sales + management + senior
  { prefix: '/leads',             roles: [...MGMT_ROLES, 'SALES'] },
  // Ops — CFA officers + management + finance (view-only)
  { prefix: '/ops',               roles: OPS_ROLES },
  { prefix: '/demurrage',         roles: OPS_ROLES },
  { prefix: '/cargotracker',      roles: OPS_ROLES },
  { prefix: '/customs-tools',     roles: OPS_ROLES },
  { prefix: '/compliance',        roles: OPS_ROLES },
  { prefix: '/penalty',           roles: OPS_ROLES },
];

/**
 * Returns true when the given role is permitted to access the given path.
 * Routes not listed in ROUTE_RULES are open to all authenticated staff.
 */
export function canAccess(role: UserRole | string | undefined, path: string): boolean {
  if (!role) return false;
  const sorted = [...ROUTE_RULES].sort((a, b) => b.prefix.length - a.prefix.length);
  const rule = sorted.find(r => path === r.prefix || path.startsWith(r.prefix + '/'));
  if (!rule) return true;
  return rule.roles.includes(role as UserRole);
}
