import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';

interface NavItem { label: string; to: string; icon: IconName; }
interface Category {
  id: string;
  label: string;
  subtitle: string;
  root: string;
  icon: IconName;
  match: string[];
  items: NavItem[];
}

const CATS: Category[] = [
  {
    id: 'cfa',
    label: 'CFA',
    subtitle: 'Clearance & Freight',
    root: '/shipments',
    icon: 'anchor',
    match: ['/ops', '/shipments', '/demurrage', '/customs-tools', '/compliance', '/penalty'],
    items: [
      { label: 'Clearance Overview', to: '/shipments',     icon: 'container'  },
      { label: 'Operations',         to: '/ops',            icon: 'briefcase'  },
      { label: 'Demurrage',          to: '/demurrage',      icon: 'timer'      },
      { label: 'Landed Cost',        to: '/customs-tools',  icon: 'package'    },
      { label: 'Compliance',         to: '/compliance',     icon: 'shield'     },
      { label: 'Penalty Est.',       to: '/penalty',        icon: 'alertCircle'},
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    subtitle: 'Finance & Accounts',
    root: '/finance/overview',
    icon: 'barChart',
    match: ['/finance', '/billing', '/quotations', '/purchase-orders', '/expenses', '/accounts'],
    items: [],
  },
  {
    id: 'crm',
    label: 'CRM',
    subtitle: 'Customers & Leads',
    root: '/customers/overview',
    icon: 'users',
    match: ['/customers', '/customers/overview', '/leads', '/delivery-notes', '/crm/email'],
    items: [
      { label: 'Overview',        to: '/customers/overview', icon: 'pieChart'    },
      { label: 'Customers',       to: '/customers',          icon: 'users'       },
      { label: 'Leads',           to: '/leads',              icon: 'target'      },
      { label: 'Delivery Notes',  to: '/delivery-notes',     icon: 'receipt'     },
      { label: 'Email',           to: '/crm/email',          icon: 'mail'        },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    subtitle: 'Apps & Utilities',
    root: '/tools/overview',
    icon: 'grid',
    match: ['/documents', '/support', '/chat', '/escalations', '/hrm', '/settings', '/setup', '/utilities', '/reports', '/tools'],
    items: [
      { label: 'Overview',      to: '/tools/overview',  icon: 'activity'   },
      { label: 'File Manager',  to: '/documents',       icon: 'folder'     },
      { label: 'Support',       to: '/support',         icon: 'headphones' },
      { label: 'Chat',          to: '/chat',            icon: 'chatBubble' },
      { label: 'HR & People',   to: '/hrm',             icon: 'briefcase'  },
      { label: 'Settings',      to: '/settings',        icon: 'settings'   },
    ],
  },
];

function matchesCategory(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(p => pathname === p || pathname.startsWith(p + '/'));
}

export const HorizontalNav: React.FC = () => {
  const navigate     = useNavigate();
  const { pathname } = useLocation();

  if (pathname === '/') return null;

  const active = CATS.find(c => matchesCategory(pathname, c.match)) ?? null;

  /* Finance shell owns its own sub-nav (tab bar) — hide hnav-subs for all /finance routes */
  const isFinance = pathname === '/finance' || pathname.startsWith('/finance/');

  return (
    <nav className="hnav" aria-label="Main navigation">

      {/* ── Category tabs ── */}
      <div className="hnav-cats">
        <div className="hnav-cats-inner">
          {CATS.map(cat => (
            <button
              key={cat.id}
              type="button"
              className={`hnav-cat${active?.id === cat.id ? ' hnav-cat--active' : ''}`}
              onClick={() => navigate(cat.root)}
            >
              <span className="hnav-cat-icon">
                <Icon name={cat.icon} size={20} strokeWidth={1.6} />
              </span>
              <span className="hnav-cat-label">{cat.label}</span>
              <span className="hnav-cat-sub">{cat.subtitle}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Sub-items — hidden on finance routes (tab bar replaces this) ── */}
      {!isFinance && (
        <div className="hnav-subs">
          <div className="hnav-subs-inner">
            {active
              ? (() => {
                  const activeTo = active.items
                    .filter(item => pathname === item.to || pathname.startsWith(item.to + '/'))
                    .sort((a, b) => b.to.length - a.to.length)[0]?.to ?? null;
                  return active.items.map(item => (
                    <button
                      key={item.to}
                      type="button"
                      className={`hnav-sub${item.to === activeTo ? ' hnav-sub--active' : ''}`}
                      onClick={() => navigate(item.to)}
                    >
                      <Icon name={item.icon} size={13} strokeWidth={2} className="hnav-sub-icon" />
                      {item.label}
                    </button>
                  ));
                })()
              : null}
          </div>
        </div>
      )}

    </nav>
  );
};
