import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';

interface NavItem  { label: string; to: string; icon: IconName }
interface NavGroup { id: string; label: string; icon: IconName; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    id: 'receivables',
    label: 'Receivables',
    icon: 'trendingUp',
    items: [
      { label: 'Invoices',       to: '/finance/invoices',       icon: 'receipt'  },
      { label: 'Quotations',     to: '/finance/quotations',     icon: 'fileText' },
      { label: 'Delivery Notes', to: '/finance/delivery-notes', icon: 'package'  },
      { label: 'Sales Report',   to: '/finance/reports/sales',  icon: 'barChart' },
    ],
  },
  {
    id: 'payables',
    label: 'Payables',
    icon: 'creditCard',
    items: [
      { label: 'Purchase Orders', to: '/finance/purchase-orders', icon: 'shoppingCart' },
      { label: 'Bills',           to: '/finance/bills',           icon: 'receipt'      },
      { label: 'Vendors',         to: '/finance/vendors',         icon: 'building'     },
      { label: 'Expenses',        to: '/finance/expenses',        icon: 'creditCard'   },
    ],
  },
  {
    id: 'accounts',
    label: 'Accounts',
    icon: 'bookOpen',
    items: [
      { label: 'Payments',         to: '/finance/payments',                      icon: 'dollarSign'    },
      { label: 'Products',         to: '/finance/products',                      icon: 'package'       },
      { label: 'Chart of Accounts',to: '/finance/accounts/chart-of-accounts',    icon: 'list'      },
      { label: 'Ledger',           to: '/finance/accounts/ledger',               icon: 'bookOpen'  },
      { label: 'Trial Balance',    to: '/finance/accounts/trial-balance',        icon: 'barChart'  },
      { label: 'Balance Sheet',    to: '/finance/accounts/balance-sheet',        icon: 'layers'    },
      { label: 'Profit & Loss',    to: '/finance/accounts/profit-loss',          icon: 'trendingUp'},
      { label: 'Aged Receivables', to: '/finance/accounts/aged-receivables',     icon: 'clock'     },
      { label: 'Aged Payables',    to: '/finance/accounts/aged-payables',        icon: 'clock'     },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: 'fileText',
    items: [
      { label: 'Income vs Expenses', to: '/finance/reports/income-vs-expenses', icon: 'barChart'   },
      { label: 'Cash Flow',          to: '/finance/reports/cash-flow',          icon: 'trendingUp' },
      { label: 'Tax Report',         to: '/finance/reports/tax',                icon: 'percent'    },
      { label: 'Expenses Report',    to: '/finance/reports/expenses',           icon: 'creditCard' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: 'zap',
    items: [
      { label: 'Accounting Sync', to: '/finance/integrations', icon: 'zap' },
    ],
  },
];

function isGroupActive(group: NavGroup, pathname: string) {
  return group.items.some(i => pathname === i.to || pathname.startsWith(i.to + '/'));
}

export function FinOpsSidebar() {
  const nav      = useNavigate();
  const { pathname } = useLocation();

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('finops-sidebar-collapsed') === 'true';
  });

  const [open, setOpen] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const g of GROUPS) {
      if (isGroupActive(g, pathname)) s.add(g.id);
    }
    return s;
  });

  function toggle(id: string) {
    setOpen(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('finops-sidebar-collapsed', String(next));
  }

  const isDashboard = pathname === '/finance' || pathname === '/finance/overview';

  return (
    <aside className={`finops-sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* Brand */}
      <div className="finops-sidebar-brand">
        <div className="finops-sidebar-brand-icon">
          <Icon name="barChart" size={16} color="#fff"/>
        </div>
        {!collapsed && (
          <div>
            <div className="finops-sidebar-brand-name">FinOps</div>
            <div className="finops-sidebar-brand-sub">Finance &amp; Accounts</div>
          </div>
        )}
      </div>

      {/* Scrollable nav */}
      <nav className="finops-sidebar-nav">

        {/* Dashboard */}
        <button
          type="button"
          title="Dashboard"
          className={`fnav-item${isDashboard ? ' fnav-item--active' : ''}`}
          onClick={() => nav('/finance')}
        >
          <Icon name="barChart" size={15} className="fnav-item-icon"/>
          {!collapsed && <span>Dashboard</span>}
        </button>

        <div className="fnav-divider"/>

        {/* Groups */}
        {GROUPS.map(group => {
          const active = isGroupActive(group, pathname);
          const isOpen = !collapsed && open.has(group.id);

          return (
            <div key={group.id} className="fnav-group">
              <button
                type="button"
                title={group.label}
                className={`fnav-group-hdr${active ? ' fnav-group-hdr--active' : ''}`}
                onClick={() => collapsed ? nav(group.items[0].to) : toggle(group.id)}
              >
                <Icon name={group.icon} size={15} className="fnav-item-icon"/>
                {!collapsed && <span className="fnav-group-label">{group.label}</span>}
                {!collapsed && (
                  <Icon
                    name="chevronRight"
                    size={13}
                    className={`fnav-chevron${isOpen ? ' fnav-chevron--open' : ''}`}
                  />
                )}
              </button>

              {isOpen && (
                <div className="fnav-group-items">
                  {group.items.map(item => {
                    const itemActive = pathname === item.to || pathname.startsWith(item.to + '/');
                    return (
                      <button
                        key={item.to}
                        type="button"
                        title={item.label}
                        className={`fnav-subitem${itemActive ? ' fnav-subitem--active' : ''}`}
                        onClick={() => nav(item.to)}
                      >
                        <Icon name={item.icon} size={13} className="fnav-item-icon"/>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="fnav-divider"/>

        {/* Bottom links */}
        <button type="button" title="Settings" className="fnav-item" onClick={() => nav('/settings')}>
          <Icon name="settings" size={15} className="fnav-item-icon"/>
          {!collapsed && <span>Settings</span>}
        </button>
        <button type="button" title="Help & Support" className="fnav-item" onClick={() => nav('/support')}>
          <Icon name="headphones" size={15} className="fnav-item-icon"/>
          {!collapsed && <span>Help &amp; Support</span>}
        </button>
      </nav>

      {/* Collapse toggle */}
      <button type="button" className="fnav-collapse-toggle" onClick={toggleCollapse}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={14}/>
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
