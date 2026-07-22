import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';
import './ComplyOSSidebar.css';

interface NavItem    { type: 'item';    label: string; icon: IconName; path: string }
interface NavSep     { type: 'sep' }
interface NavSection { type: 'section'; label: string }
type NavEntry = NavItem | NavSep | NavSection;

const NAV: NavEntry[] = [
  { type: 'item',    label: 'Dashboard',         icon: 'grid',      path: '/complyos'               },
  { type: 'sep' },
  { type: 'section', label: 'Applications' },
  { type: 'item',    label: 'All Applications',  icon: 'fileText',  path: '/complyos/applications'  },
  { type: 'item',    label: 'Obligations',       icon: 'list',      path: '/complyos/obligations'   },
  { type: 'sep' },
  { type: 'section', label: 'Compliance' },
  { type: 'item',    label: 'Certificate Vault', icon: 'shield',    path: '/complyos/vault'         },
  { type: 'item',    label: 'Calendar',          icon: 'calendar',  path: '/complyos/calendar'      },
  { type: 'sep' },
  { type: 'section', label: 'Automation' },
  { type: 'item',    label: 'Workflows',         icon: 'zap',       path: '/complyos/workflows'     },
  { type: 'sep' },
  { type: 'section', label: 'Marketplace' },
  { type: 'item',    label: 'Legal Firms',       icon: 'briefcase', path: '/complyos/legal'         },
  { type: 'sep' },
  { type: 'section', label: 'Reference' },
  { type: 'item',    label: 'Gov Agencies',      icon: 'building',  path: '/complyos/agencies'      },
];

interface Props {
  collapsed:   boolean;
  open:        boolean;         // mobile overlay open
  onCollapse:  () => void;      // desktop icon-only toggle
  onClose:     () => void;      // mobile close
}

export function ComplyOSSidebar({ collapsed, open, onCollapse, onClose }: Props) {
  const location = useLocation();
  const navigate = useNavigate();

  // Desktop: collapsed = icon-only (70px). Mobile: open = overlay visible.
  const isIconOnly = collapsed;

  function isActive(path: string) {
    if (path === '/complyos') return location.pathname === '/complyos' || location.pathname === '/complyos/';
    return location.pathname.startsWith(path);
  }

  function handleNav(path: string) {
    navigate(path);
    onClose(); // close mobile overlay on navigate
  }

  return (
    <aside
      className={[
        'comply-sidebar',
        isIconOnly ? 'comply-sidebar--collapsed' : '',
        open       ? 'comply-sidebar--open'      : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Brand */}
      <div className="comply-sb-brand">
        <div className="comply-sb-brand-icon">
          <Icon name="shield" size={16} color="#fff" />
        </div>
        {!isIconOnly && (
          <div className="comply-sb-brand-text">
            <div className="comply-sb-brand-name">ComplyOS</div>
            <div className="comply-sb-brand-sub">Compliance Platform</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="comply-sb-nav">
        {NAV.map((entry, i) => {
          if (entry.type === 'sep') {
            return <div key={i} className="comply-sb-sep" />;
          }
          if (entry.type === 'section') {
            if (isIconOnly) return null;
            return <div key={i} className="comply-sb-section">{entry.label}</div>;
          }
          const active = isActive(entry.path);
          return (
            <button
              key={entry.path}
              type="button"
              className={`comply-sb-item${active ? ' active' : ''}`}
              onClick={() => handleNav(entry.path)}
              title={isIconOnly ? entry.label : undefined}
            >
              <span className="comply-sb-item-icon">
                <Icon name={entry.icon} size={16} strokeWidth={active ? 2.2 : 1.8} />
              </span>
              {!isIconOnly && <span className="comply-sb-label">{entry.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle (desktop only — hidden on mobile via CSS) */}
      <div className="comply-sb-toggle">
        <button
          type="button"
          className="comply-sb-toggle-btn"
          onClick={onCollapse}
          title={isIconOnly ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="comply-sb-toggle-icon">
            <Icon name={isIconOnly ? 'chevronRight' : 'chevronLeft'} size={14} strokeWidth={2} />
          </span>
          {!isIconOnly && <span className="comply-sb-toggle-label">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
