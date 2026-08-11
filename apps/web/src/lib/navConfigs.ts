// ─── Per-app HorizontalNav configurations ────────────────────
// Each app exports its own Category[] that HorizontalNav renders.
// Import getCatsForRole for ClearOS — it handles role-based filtering.

import type { UserRole } from '@hudumika/types';
import type { AppId } from '@hudumika/types';
import type { IconName } from '../components/Icon.js';
import { MGMT_ROLES, OPS_ROLES, CRM_ROLES, ALL_STAFF, CFA_ROLES } from './permissions.js';

export interface NavItem {
  label: string;
  to: string;
  icon: IconName;
  roles: UserRole[];
}

export interface NavCategory {
  id: string;
  label: string;
  subtitle: string;
  root: string;
  icon: IconName;
  match: string[];
  roles: UserRole[];
  items: NavItem[];
}

// ── ClearOS ───────────────────────────────────────────────────

const clearosNav: NavCategory[] = [
  {
    id: 'cfa',
    label: 'CFA',
    subtitle: 'Clearance & Freight',
    root: '/clearos/shipments',
    icon: 'anchor',
    roles: CFA_ROLES,
    match: ['/clearos/ops', '/clearos/shipments', '/clearos/tracker', '/clearos/demurrage', '/clearos/customs-tools', '/clearos/compliance', '/clearos/penalty'],
    items: [
      { label: 'Clearance Overview', to: '/clearos/shipments',    icon: 'container',   roles: CFA_ROLES },
      { label: 'Operations',         to: '/clearos/ops',           icon: 'briefcase',   roles: OPS_ROLES },
      { label: 'AWB / BL Tracker',   to: '/cargotracker/track',    icon: 'map',         roles: OPS_ROLES },
      { label: 'Demurrage',          to: '/cargotracker/demurrage', icon: 'timer',       roles: OPS_ROLES },
      { label: 'Landed Cost',        to: '/clearos/customs-tools', icon: 'package',     roles: OPS_ROLES },
      { label: 'Compliance',         to: '/clearos/compliance',    icon: 'shield',      roles: OPS_ROLES },
      { label: 'Penalty Est.',       to: '/clearos/penalty',       icon: 'alertCircle', roles: OPS_ROLES },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    subtitle: 'Apps & Utilities',
    root: '/tools/overview',
    icon: 'grid',
    roles: ALL_STAFF,
    match: ['/documents', '/support', '/chat', '/escalations', '/tools'],
    items: [
      { label: 'Overview',     to: '/tools/overview', icon: 'activity',   roles: ALL_STAFF },
      { label: 'File Manager', to: '/documents',      icon: 'folder',     roles: ALL_STAFF },
      { label: 'Support',      to: '/support',        icon: 'headphones', roles: ALL_STAFF },
      { label: 'Chat',         to: '/chat',           icon: 'chatBubble', roles: ALL_STAFF },
    ],
  },
];

// ── FinOps ────────────────────────────────────────────────────
// Nav is handled by AppSidebar (see FinOpsShell) — HorizontalNav is
// suppressed for finops. The comment used to name FinOpsSidebar, which was
// never mounted by anything and has been removed.

// ── onePI ─────────────────────────────────────────────────────

const onepiNav: NavCategory[] = [
  {
    id: 'people',
    label: 'People',
    subtitle: 'Employees & Roles',
    root: '/hrm',
    icon: 'users',
    roles: MGMT_ROLES,
    match: ['/hrm/employees', '/hrm/staff', '/hrm/roles', '/hrm/departments', '/hrm/teams', '/hrm/designations', '/hrm/invitations', '/hrm/org-chart', '/hrm/staff-directory', '/hrm/delete-requests'],
    items: [
      { label: 'Employees',      to: '/hrm/employees',      icon: 'users',     roles: MGMT_ROLES },
      { label: 'Staff Directory',to: '/hrm/staff-directory',icon: 'list',      roles: MGMT_ROLES },
      { label: 'Org Chart',      to: '/hrm/org-chart',      icon: 'gitBranch', roles: MGMT_ROLES },
      { label: 'Departments',    to: '/hrm/departments',    icon: 'grid',      roles: MGMT_ROLES },
      { label: 'Roles',          to: '/hrm/roles',          icon: 'shield',    roles: MGMT_ROLES },
      { label: 'Invitations',    to: '/hrm/invitations',    icon: 'mail',      roles: MGMT_ROLES },
    ],
  },
  {
    id: 'time',
    label: 'Time',
    subtitle: 'Attendance & Leaves',
    root: '/hrm/attendance',
    icon: 'clock',
    roles: MGMT_ROLES,
    match: ['/hrm/attendance', '/hrm/leaves', '/hrm/shifts', '/hrm/holidays'],
    items: [
      { label: 'Attendance', to: '/hrm/attendance', icon: 'clock',      roles: MGMT_ROLES },
      { label: 'Leaves',     to: '/hrm/leaves',     icon: 'calendar',   roles: MGMT_ROLES },
      { label: 'Shifts',     to: '/hrm/shifts',     icon: 'clock',      roles: MGMT_ROLES },
      { label: 'Holidays',   to: '/hrm/holidays',   icon: 'sun',        roles: MGMT_ROLES },
    ],
  },
  {
    id: 'payroll',
    label: 'Payroll',
    subtitle: 'Salary & Payslips',
    root: '/hrm/payroll',
    icon: 'dollarSign',
    roles: MGMT_ROLES,
    match: ['/hrm/payroll'],
    items: [
      { label: 'Payroll', to: '/hrm/payroll', icon: 'dollarSign', roles: MGMT_ROLES },
    ],
  },
  {
    id: 'activity',
    label: 'Activity',
    subtitle: 'Logs & Security',
    root: '/hrm/activity-logs',
    icon: 'activity',
    roles: MGMT_ROLES,
    match: ['/hrm/activity-logs', '/hrm/login-history', '/hrm/device-management', '/hrm/permissions', '/hrm/announcements'],
    items: [
      { label: 'Activity Logs',    to: '/hrm/activity-logs',     icon: 'activity', roles: MGMT_ROLES },
      { label: 'Login History',    to: '/hrm/login-history',     icon: 'key',      roles: MGMT_ROLES },
      { label: 'Announcements',    to: '/hrm/announcements',     icon: 'bell',     roles: MGMT_ROLES },
      { label: 'Permissions',      to: '/hrm/permissions',       icon: 'lock',     roles: MGMT_ROLES },
    ],
  },
];

// ── Bliss ─────────────────────────────────────────────────────

const blissNav: NavCategory[] = [
  {
    id: 'tickets',
    label: 'Tickets',
    subtitle: 'Support Requests',
    root: '/support/tickets',
    icon: 'inbox',
    roles: ALL_STAFF,
    match: ['/support/tickets', '/support'],
    items: [
      { label: 'All Tickets',   to: '/support/tickets',  icon: 'inbox',         roles: ALL_STAFF },
      { label: 'Overview',      to: '/support/overview', icon: 'activity',      roles: ALL_STAFF },
      { label: 'Escalations',   to: '/escalations',      icon: 'alertTriangle', roles: [...MGMT_ROLES, 'SENIOR'] },
    ],
  },
];

// ── Cloud ─────────────────────────────────────────────────────

const cloudNav: NavCategory[] = [
  {
    id: 'files',
    label: 'Files',
    subtitle: 'File Storage',
    root: '/documents',
    icon: 'folder',
    roles: ALL_STAFF,
    match: ['/documents'],
    items: [],
  },
];

// ── Admin/Workspace ───────────────────────────────────────────

const workspaceNav: NavCategory[] = [
  {
    id: 'system',
    label: 'System',
    subtitle: 'Admin & Config',
    root: '/settings',
    icon: 'settings',
    roles: MGMT_ROLES,
    match: ['/settings', '/setup', '/utilities', '/reports', '/admin', '/tenant-management', '/system-update'],
    items: [
      { label: 'Settings',        to: '/settings',          icon: 'settings',   roles: MGMT_ROLES },
      { label: 'Setup',           to: '/setup',             icon: 'tool',       roles: MGMT_ROLES },
      { label: 'Reports',         to: '/reports',           icon: 'barChart',   roles: [...MGMT_ROLES, 'FINANCE'] },
      { label: 'Tenants',         to: '/tenant-management', icon: 'building',   roles: ['SUPER_ADMIN'] },
      { label: 'Admin',           to: '/admin',             icon: 'shield',     roles: ['SUPER_ADMIN'] },
      { label: 'System Update',   to: '/system-update',     icon: 'download',   roles: ['SUPER_ADMIN'] },
    ],
  },
];

// ── Email ─────────────────────────────────────────────────────

const emailNav: NavCategory[] = [
  {
    id: 'inbox',
    label: 'Mail',
    subtitle: 'Hudumika Email',
    root: '/email',
    icon: 'mail',
    roles: ALL_STAFF,
    match: ['/email'],
    items: [],
  },
];

// ── CRM ───────────────────────────────────────────────────────

const crmNav: NavCategory[] = [
  {
    id: 'customers',
    label: 'Customers',
    subtitle: 'Accounts & Contacts',
    root: '/crm/customers',
    icon: 'users',
    roles: CRM_ROLES,
    match: ['/crm/customers', '/crm/overview'],
    items: [
      { label: 'All Customers',  to: '/crm/customers',          icon: 'users',    roles: CRM_ROLES },
      { label: 'Overview',       to: '/crm/overview',           icon: 'pieChart', roles: CRM_ROLES },
      { label: 'Bulk Upload',    to: '/crm/customers/bulk-upload', icon: 'upload', roles: CRM_ROLES },
    ],
  },
  {
    id: 'leads',
    label: 'Leads',
    subtitle: 'Pipeline & Prospects',
    root: '/crm/leads',
    icon: 'target',
    roles: [...MGMT_ROLES, 'SALES'],
    match: ['/crm/leads', '/crm/sales'],
    items: [
      { label: 'All Leads', to: '/crm/leads', icon: 'target',     roles: [...MGMT_ROLES, 'SALES'] },
      { label: 'Sales',     to: '/crm/sales', icon: 'trendingUp', roles: CRM_ROLES },
    ],
  },
];

// ── Master map ────────────────────────────────────────────────

export const NAV_CONFIGS: Record<AppId, NavCategory[]> = {
  // Lens builds its own sidebar in LensShell.tsx.
  lens: [],
  // Onsite likewise — OnsiteShell.tsx passes its own NAV.
  onsite: [],
  // Studio builds its own sidebar in StudioShell.tsx, like the other
  // shells that outgrew this map.
  studio: [],
  clearos:   clearosNav,
  finops:    [],
  nexushr:     onepiNav,
  bliss:     blissNav,
  cloud:     cloudNav,
  workspace: workspaceNav,
  email:     emailNav,
  crm:       crmNav,
  complyos:  [],
  onesite:   [],
  oneid:     [],
  tracking:  [],
  ai:        [],
  admin:     [],
  contacts:  [],
  store:     [],
  demurrage:     [],
  cargotracker:  [],
  calendar:      [],
  tasks:         [],
  seal:          [],
  inventory:     [],
  hudubi:        [],
};

/** Filter a nav config to only categories and items the given role can see. */
export function filterNavForRole(cats: NavCategory[], role: UserRole | string): NavCategory[] {
  return cats
    .filter(cat => cat.roles.includes(role as UserRole))
    .map(cat => ({
      ...cat,
      items: cat.items.filter(item => item.roles.includes(role as UserRole)),
    }));
}
