import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import type { TenantPlan } from '@hudumika/types';
import { PLAN_LEVELS } from '@hudumika/types';

/* ── Plan detection ─────────────────────────────────────────── */
function usePlan(): TenantPlan {
  const stored = localStorage.getItem('hudumika_tenant_plan') as TenantPlan | null;
  if (stored && stored in PLAN_LEVELS) return stored;
  return 'enterprise'; // default: all features visible until plan is set
}

function planHas(userPlan: TenantPlan, required: TenantPlan): boolean {
  return PLAN_LEVELS[userPlan] >= PLAN_LEVELS[required];
}

const PLAN_LABEL: Record<TenantPlan, string> = {
  starter:      'Starter',
  growth:       'Growth',
  scale:        'Scale',
  operations:   'Operations',
  finance:      'Finance',
  professional: 'Finance',
  enterprise:   'Enterprise',
};

/* ── Nav counts ── */
type NavCounts = {
  allShipments?: number;
  atRisk?: number;
  slaBreached?: number;
  inTransit?: number;
  delivered?: number;
  awaitingDocs?: number;
  invoices?: number;
  dutyTzs?: number;
  customers?: number;
};

function useNavCounts(): NavCounts {
  const [counts, setCounts] = useState<NavCounts>({});
  useEffect(() => {
    apiFetch('/v1/analytics/kpi')
      .then((d: any) => {
        setCounts({
          allShipments: d.total_cases    ?? d.active_cases,
          atRisk:       d.demurrage_risk,
          slaBreached:  d.sla_breached,
          inTransit:    d.in_transit,
          delivered:    d.delivered_today,
          awaitingDocs: d.awaiting_docs,
          invoices:     d.invoices_pending,
          dutyTzs:      d.duty_payments_tzs,
          customers:    d.customer_count,
        });
      })
      .catch(() => {});
  }, []);
  return counts;
}

function fmt(n?: number): string {
  if (n === undefined || n === null) return '';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k+';
  return String(n);
}

/* ── Plan gate component ── */
interface PlanGateProps {
  plan: TenantPlan;
  required: TenantPlan;
  children?: React.ReactNode;
  label?: string; // what this section unlocks
}

function PlanGate({ plan, required, children, label }: PlanGateProps) {
  const navigate = useNavigate();
  if (planHas(plan, required)) return <>{children}</>;

  return (
    <div className="lnav-plan-gate">
      <div className="lnav-plan-gate-inner">
        <Icon name="lock" size={11} className="lnav-plan-gate-icon" />
        <span className="lnav-plan-gate-text">
          {label ?? 'This module'}
        </span>
        <button
          type="button"
          className="lnav-plan-gate-btn"
          onClick={() => navigate('/subscription')}
        >
          {PLAN_LABEL[required]} plan
        </button>
      </div>
    </div>
  );
}

/* ── Nav item ── */
interface NavItemProps {
  label: string;
  icon: IconName;
  path?: string;
  badge?: string | number;
  badgeCls?: string;
  onClick?: () => void;
}

function NavItem({ label, icon, path, badge, badgeCls, onClick }: NavItemProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { onMobileClose } = React.useContext(NavGroupCtx);
  const active = path ? (() => {
    const [p, q] = path.split('?');
    if (q) return location.pathname === p && location.search.includes(q);
    return location.pathname === p || (p !== '/' && location.pathname.startsWith(p));
  })() : false;

  function handleClick() {
    onMobileClose?.();
    if (onClick) { onClick(); return; }
    if (path) navigate(path);
  }

  return (
    <button
      type="button"
      className={`lnav-item${active ? ' active' : ''}`}
      onClick={handleClick}
      title={label}
    >
      <Icon name={icon} size={16} strokeWidth={active ? 2.4 : 2.1} className="lnav-item-icon" />
      <span className="lnav-item-label">{label}</span>
      {badge !== undefined && badge !== '' && (
        <span className={`nav-badge${badgeCls ? ' ' + badgeCls : ''}`}>{badge}</span>
      )}
    </button>
  );
}

function SectionHdr({ title }: { title: string }) {
  return <div className="lnav-group-hdr">{title}</div>;
}

/* ── Shared types & context ── */
export interface GroupItem { label: string; icon: IconName; path: string; }

export interface NavGroupCtxType {
  openLabel: string | null;
  setOpenLabel: (label: string | null) => void;
  navCollapsed: boolean;
  onMobileClose?: () => void;
}
export const NavGroupCtx = React.createContext<NavGroupCtxType>({
  openLabel: null, setOpenLabel: () => {}, navCollapsed: false,
});

/* ── Expandable group ── */
interface ExpandableGroupProps {
  label: string;
  icon: IconName;
  items: GroupItem[];
}

function ExpandableGroup({ label, icon, items }: ExpandableGroupProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { openLabel, setOpenLabel, navCollapsed, onMobileClose } = React.useContext(NavGroupCtx);
  const isOpen = openLabel === label;

  function isItemActive(itemPath: string): boolean {
    const [p, q] = itemPath.split('?');
    if (q) return location.pathname === p && location.search.includes(q.split('=')[1] ?? q);
    return location.pathname === p || location.pathname.startsWith(p + '/');
  }

  const hasActiveChild = items.some(i => isItemActive(i.path));

  React.useEffect(() => {
    if (hasActiveChild && !navCollapsed) setOpenLabel(label);
  }, [hasActiveChild, navCollapsed]); // eslint-disable-line

  const groupClass = hasActiveChild
    ? 'lnav-item parent-active'
    : isOpen
      ? 'lnav-item open'
      : 'lnav-item';

  return (
    <>
      <button
        type="button"
        className={groupClass}
        onClick={() => !navCollapsed && setOpenLabel(isOpen ? null : label)}
        title={label}
      >
        <Icon name={icon} size={16} strokeWidth={hasActiveChild ? 2.3 : isOpen ? 2.2 : 2.1} className="lnav-item-icon" />
        {!navCollapsed && <span className="lnav-item-label">{label}</span>}
        {!navCollapsed && (
          <span className="lnav-expand-badge">{isOpen ? '−' : '+'}</span>
        )}
      </button>

      {!navCollapsed && (
        <div
          className="lnav-sub-group"
          style={{ maxHeight: isOpen ? `${items.length * 36 + 8}px` : '0' }}
        >
          {items.map(item => {
            const active = isItemActive(item.path);
            return (
              <button
                key={item.path}
                type="button"
                className={`lnav-sub-item${active ? ' active' : ''}`}
                onClick={() => { onMobileClose?.(); navigate(item.path); }}
              >
                <Icon name={item.icon} size={12} strokeWidth={active ? 2.2 : 1.9} style={{ flexShrink: 0 } as React.CSSProperties} />
                <span className="lnav-sub-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ── Main nav ── */
interface LeftNavProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const LeftNav: React.FC<LeftNavProps> = ({ collapsed, onToggle: _onToggle, mobileOpen, onMobileClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const counts = useNavCounts();
  const isMobile = useIsMobile();
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const plan = usePlan();

  const role = user?.role;
  const isSuperAdmin  = role === 'SUPER_ADMIN';
  const isAdmin       = role === 'ADMIN' || role === 'TENANT_ADMIN';
  const isManager     = role === 'MANAGER';
  const isFinance     = role === 'FINANCE';
  const isSales       = role === 'SALES';
  const isSenior      = role === 'SENIOR';
  const isJunior      = role === 'JUNIOR' || role === 'OFFICER';
  const isCustomer    = role === 'CUSTOMER';

  const canSeeAllCases  = isSenior || isManager || isAdmin || isSuperAdmin;
  const canSeeFinance   = isFinance || isManager || isAdmin || isSuperAdmin;
  const canSeeNetwork   = isSales   || isManager || isAdmin || isSuperAdmin || isSenior;
  const canSeeHRM       = isManager || isAdmin   || isSuperAdmin;
  const canSeeSetup     = isAdmin   || isSuperAdmin;

  // Plan gate flags
  const hasOperations = planHas(plan, 'operations');
  const hasFinance    = planHas(plan, 'finance');
  const hasEnterprise = planHas(plan, 'enterprise');

  return (
    <NavGroupCtx.Provider value={{ openLabel, setOpenLabel, navCollapsed: collapsed, onMobileClose }}>
      {isMobile && mobileOpen && (
        <div className="mob-nav-backdrop" onClick={onMobileClose} />
      )}
    <nav className={`lnav${collapsed ? ' collapsed' : ''}${isMobile && mobileOpen ? ' mobile-open' : ''}`}>
      <div className="lnav-scroll">

        {/* ══ CUSTOMER PORTAL ══ */}
        {isCustomer && (
          <>
            <SectionHdr title="MY ACCOUNT" />
            <NavItem path="/"            icon="monitor"    label="Dashboard" />
            <NavItem path="/quotations"  icon="clipboard"  label="Request Quote" />
            <NavItem path="/documents"   icon="folder"     label="My Files" />

            {/* Shipments locked for starter customers */}
            {hasOperations ? (
              <NavItem path="/shipments" icon="layers" label="My Shipments" />
            ) : (
              <PlanGate plan={plan} required="operations" label="Shipment tracking">
                {null}
              </PlanGate>
            )}

            {/* Invoices locked for starter customers */}
            {hasFinance ? (
              <NavItem path="/billing" icon="invoice" label="My Invoices" />
            ) : (
              <PlanGate plan={plan} required="finance" label="Invoice access">
                {null}
              </PlanGate>
            )}

            <SectionHdr title="APPS" />
            <NavItem path="/chat"        icon="chatBubble" label="Chat" badge={12} badgeCls="t" />
            <ExpandableGroup label="Support" icon="headphones" items={[
              { label: 'Overview',    icon: 'activity',  path: '/support/overview' },
              { label: 'My Tickets', icon: 'clipboard', path: '/support/tickets'  },
            ]} />
          </>
        )}

        {/* ══ SUPER ADMIN PORTAL ══ */}
        {isSuperAdmin && (
          <>
            <SectionHdr title="SUPER ADMIN" />
            <NavItem path="/admin?v=dashboard" icon="monitor" label="SA Dashboard" />
            <ExpandableGroup label="Tenants" icon="building" items={[
              { label: 'Companies', icon: 'building', path: '/admin?v=companies' },
              { label: 'Users',     icon: 'users',    path: '/admin?v=users'     },
              { label: 'Domains',   icon: 'globe',    path: '/admin?v=domains'   },
            ]} />
            <ExpandableGroup label="Billing" icon="creditCard" items={[
              { label: 'Subscriptions', icon: 'creditCard', path: '/admin?v=subscriptions' },
              { label: 'Packages',      icon: 'package',    path: '/admin?v=packages'      },
              { label: 'Transactions',  icon: 'receipt',    path: '/admin?v=transactions'  },
              { label: 'Finance',       icon: 'dollarSign', path: '/admin?v=finance'       },
            ]} />
            <ExpandableGroup label="Platform" icon="settings" items={[
              { label: 'Activity Log',  icon: 'clock',    path: '/admin?v=activity' },
              { label: 'SA Settings',   icon: 'settings', path: '/admin?v=settings' },
              { label: 'System Update', icon: 'upload',   path: '/system-update'    },
            ]} />
          </>
        )}

        {/* ══ STAFF PORTAL ══ */}
        {!isCustomer && !isSuperAdmin && (
          <>
            {/* ── HOME ── */}
            <SectionHdr title="HOME" />
            <NavItem path="/" icon="home" label="Dashboard" />

            {/* ── OPERATIONS ── */}
            <SectionHdr title={isJunior ? 'MY CASES' : 'OPERATIONS'} />
            <NavItem path="/ops" icon="monitor"
              label={isJunior ? 'My Cases' : 'Ops Command'}
              badge={fmt(counts.allShipments)} />

            {/* Shipments — requires Operations plan */}
            {hasOperations ? (
              <>
                <ExpandableGroup label="Shipments" icon="layers" items={[
                  ...(canSeeAllCases ? ([
                    { label: 'Shipments', icon: 'barChart' as IconName, path: '/shipments' },
                  ] as GroupItem[]) : []),
                  { label: 'Demurrage', icon: 'alertTriangle' as IconName, path: '/demurrage' } as GroupItem,
                ]} />
                {(isJunior || isSenior) && (
                  <NavItem path="/escalations" icon="arrowUpRight" label="Escalations" />
                )}
              </>
            ) : (
              <PlanGate plan={plan} required="operations" label="Shipments, Demurrage & Declarations" />
            )}

            {/* ── FINANCE ── */}
            {canSeeFinance && (
              hasFinance ? (
                <>
                  <SectionHdr title="FINANCE" />
                  <NavItem path="/finance" icon="pieChart" label="Finance Dashboard" />
                  <ExpandableGroup label="Sales" icon="trendingUp" items={[
                    { label: 'Sales Overview',      icon: 'barChart',   path: '/sales'            },
                    { label: 'Invoices',            icon: 'invoice',    path: '/billing'          },
                    { label: 'Delivery Notes',      icon: 'truck',      path: '/delivery-notes'   },
                    { label: 'Payments',            icon: 'creditCard', path: '/finance/payments' },
                    { label: 'Quotes',              icon: 'clipboard',  path: '/quotations'       },
                    { label: 'Products & Services', icon: 'package',    path: '/finance/products' },
                  ]} />
                  <ExpandableGroup label="Purchases" icon="package" items={[
                    { label: 'Purchases Overview', icon: 'barChart',      path: '/finance/purchases' },
                    { label: 'Bills',              icon: 'receipt',       path: '/finance/bills'     },
                    { label: 'Purchase Orders',    icon: 'clipboardList', path: '/purchase-orders'   },
                    { label: 'Suppliers',          icon: 'building',      path: '/finance/suppliers' },
                    { label: 'Expenses',           icon: 'receipt',       path: '/expenses'          },
                  ]} />
                  <ExpandableGroup label="Reports" icon="activity" items={[
                    { label: 'Sales Report',      icon: 'trendingUp', path: '/finance/reports/sales'              },
                    { label: 'Expenses Report',   icon: 'receipt',    path: '/finance/reports/expenses'           },
                    { label: 'Income vs Expense', icon: 'pieChart',   path: '/finance/reports/income-vs-expenses' },
                    { label: 'Tax Report',        icon: 'fileText',   path: '/finance/reports/tax'                },
                    { label: 'Cash Flow',         icon: 'activity',   path: '/finance/cash-flow'                  },
                  ]} />
                  <ExpandableGroup label="Accounts" icon="columns" items={[
                    { label: 'Account Overview', icon: 'pieChart',     path: '/accounts'                  },
                    { label: 'Master Reporting', icon: 'activity',     path: '/finance/reporting'         },
                    { label: 'Ledger Summary',   icon: 'fileText',     path: '/accounts/ledger'           },
                    { label: 'Trial Balance',    icon: 'clipboard',    path: '/accounts/trial-balance'    },
                    { label: 'Balance Sheet',    icon: 'layers',       path: '/accounts/balance-sheet'    },
                    { label: 'Profit & Loss',    icon: 'trendingUp',   path: '/accounts/profit-loss'      },
                    { label: 'Aged Receivables', icon: 'arrowUpRight', path: '/accounts/aged-receivables' },
                    { label: 'Aged Payables',    icon: 'arrowDown',    path: '/accounts/aged-payables'    },
                  ]} />
                </>
              ) : (
                <>
                  <SectionHdr title="FINANCE" />
                  <PlanGate plan={plan} required="finance" label="Full Finance Suite — Invoicing, Reports, Accounts" />
                </>
              )
            )}

            {/* ── SALES-ONLY (quotations + invoices read, always starter) ── */}
            {isSales && (
              <>
                <SectionHdr title="SALES" />
                <NavItem path="/sales"            icon="trendingUp" label="Sales Overview" />
                <NavItem path="/billing"          icon="invoice"    label="Invoices" />
                <NavItem path="/quotations"       icon="clipboard"  label="Quotes" />
                <NavItem path="/finance/payments" icon="creditCard" label="Payments" />
                <NavItem path="/leads"            icon="target"     label="Leads" />
              </>
            )}

            {/* ── NETWORK / CRM ── (starter plan) ── */}
            {canSeeNetwork && (
              <>
                <SectionHdr title="NETWORK" />
                {(isManager || isAdmin) ? (
                  <ExpandableGroup label="Customers" icon="building" items={[
                    { label: 'Overview',      icon: 'pieChart', path: '/customers/overview'    },
                    { label: 'Customer List', icon: 'users',    path: '/customers'             },
                    { label: 'Bulk Upload',   icon: 'upload',   path: '/customers/bulk-upload' },
                  ]} />
                ) : (
                  <NavItem path="/customers" icon="building" label="Customers" />
                )}
                {!isSales && (
                  <NavItem path="/leads" icon="target" label="Leads" />
                )}
                <NavItem path="/documents" icon="folder" label="File Manager" />
              </>
            )}
            {isJunior && (
              <>
                <SectionHdr title="NETWORK" />
                <NavItem path="/customers" icon="building" label="My Customers" />
                <NavItem path="/documents" icon="folder"   label="File Manager" />
              </>
            )}

            {/* ── APPS ── */}
            <SectionHdr title="APPS" />
            <NavItem path="/tools/overview" icon="activity" label="Tools Overview" />
            <NavItem path="/chat" icon="chatBubble" label="Chat" badge={12} badgeCls="t" />
            {(isSenior || isManager || isAdmin) ? (
              <ExpandableGroup label="Support" icon="headphones" items={[
                { label: 'Overview',    icon: 'activity',  path: '/support/overview' },
                { label: 'All Tickets', icon: 'clipboard', path: '/support/tickets'  },
              ]} />
            ) : (
              <NavItem path="/support/tickets" icon="headphones" label="Support Tickets" />
            )}
            {(isManager || isAdmin) && (
              <NavItem path="/documents" icon="folder" label="File Manager" />
            )}

            {/* ── PEOPLE / HR ── requires Enterprise ── */}
            {canSeeHRM && (
              <>
                <SectionHdr title="PEOPLE" />
                {hasEnterprise ? (
                  <ExpandableGroup label="HR Management" icon="briefcase" items={[
                    { label: 'Leave Management', icon: 'calendar',   path: '/hrm/leaves'        },
                    { label: 'Attendance',       icon: 'clock',      path: '/hrm/attendance'    },
                    { label: 'Shifts',           icon: 'timer',      path: '/hrm/shifts'        },
                    { label: 'Holidays',         icon: 'sun',        path: '/hrm/holidays'      },
                    { label: 'Designations',     icon: 'award',      path: '/hrm/designations'  },
                    { label: 'Payroll',          icon: 'dollarSign', path: '/hrm/payroll'       },
                    { label: 'Announcements',    icon: 'volume2',    path: '/hrm/announcements' },
                  ]} />
                ) : (
                  <PlanGate plan={plan} required="enterprise" label="HR, Payroll & Attendance" />
                )}
              </>
            )}

            {/* ── SETUP ── (always visible to admins regardless of plan) ── */}
            {canSeeSetup && (
              <>
                <SectionHdr title="SETUP" />
                <ExpandableGroup label="Manage Staff" icon="users" items={[
                  { label: 'Manage Staff',        icon: 'users',      path: '/hrm/employees'         },
                  { label: 'Roles & Permissions', icon: 'shield',     path: '/hrm/roles'             },
                  { label: 'Delete Requests',     icon: 'userMinus',  path: '/hrm/delete-requests'   },
                  { label: 'Departments',         icon: 'building',   path: '/hrm/departments'       },
                  { label: 'Teams',               icon: 'users',      path: '/hrm/teams'             },
                  { label: 'Invitations',         icon: 'userPlus',   path: '/hrm/invitations'       },
                  { label: 'User Activity Logs',  icon: 'activity',   path: '/hrm/activity-logs'     },
                  { label: 'Login History',       icon: 'lock',       path: '/hrm/login-history'     },
                  ...(hasEnterprise
                    ? [{ label: 'Device Management', icon: 'smartphone' as IconName, path: '/hrm/device-management' }]
                    : []
                  ),
                ]} />
                <ExpandableGroup label="General" icon="settings" items={[
                  { label: 'Company Information', icon: 'building', path: '/settings?s=company'      },
                  { label: 'Localization',        icon: 'globe',    path: '/settings?s=localization' },
                  { label: 'Email',               icon: 'mail',     path: '/settings?s=email'        },
                  { label: 'System Update',       icon: 'download', path: '/settings?s=update'       },
                  { label: 'System / Server Info',icon: 'monitor',  path: '/settings?s=server'       },
                ]} />
              </>
            )}
            {isManager && (
              <>
                <SectionHdr title="SETUP" />
                <ExpandableGroup label="Manage Staff" icon="users" items={[
                  { label: 'Manage Staff',  icon: 'users',    path: '/hrm/employees'   },
                  { label: 'Invitations',   icon: 'userPlus', path: '/hrm/invitations' },
                  { label: 'Teams',         icon: 'users',    path: '/hrm/teams'       },
                ]} />
              </>
            )}
          </>
        )}
      </div>

      {/* ── Nav footer: plan badge ── */}
      {user && (isAdmin || isManager || isSuperAdmin) && (
        <div className="lnav-footer" style={{ padding: collapsed ? '10px 8px' : '12px', borderTop: '1px solid var(--border)' }}>
          {!collapsed ? (
            <div style={{
              background: 'var(--teal-l)',
              borderRadius: 9, padding: '12px 14px',
              border: '1px solid var(--teal-m)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <Icon name="package" size={12} color="var(--teal)" />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                  {PLAN_LABEL[plan]}
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 700, background: 'var(--teal)', color: '#fff',
                  borderRadius: 3, padding: '1px 4px', letterSpacing: '0.02em',
                }}>ACTIVE</span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/subscription')}
                style={{
                  fontSize: 11, color: 'var(--teal)', fontWeight: 600,
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 0, fontFamily: 'var(--font)', display: 'block', textAlign: 'left'
                }}
              >
                Manage subscription →
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/subscription')}
              title={`${PLAN_LABEL[plan]} plan — Manage subscription`}
              style={{
                width: '100%', height: 36, borderRadius: 'var(--r)',
                border: 'none', background: 'var(--teal-l)',
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon name="package" size={16} color="var(--teal)" />
            </button>
          )}
        </div>
      )}
    </nav>
    </NavGroupCtx.Provider>
  );
};
