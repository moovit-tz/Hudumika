import React from 'react';

// ── Launcher app list ──────────────────────────────────────────
// Shared between AppHeader (mobile app icon, collapsed-sidebar icon) and
// AppLauncher (the switcher panel itself) — kept in its own module so
// both can use it without one depending on the other's internals.

export const LAUNCHER_APPS: Array<{ id: string; name: string; color: string; path: string }> = [
  { id: 'clearos',   name: 'ClearOS',  color: '#ea580c', path: '/clearos'   },
  { id: 'finops',    name: 'FinOps',   color: '#0284c7', path: '/finance'   },
  { id: 'onepi',     name: 'NexusHR',  color: '#0d9488', path: '/onepi'     },
  { id: 'bliss',     name: 'Bliss',    color: '#7c3aed', path: '/bliss'     },
  { id: 'complyos',  name: 'ComplyOS', color: '#059669', path: '/complyos'  },
  { id: 'crm',       name: 'CRM',      color: '#16a34a', path: '/crm'       },
  { id: 'cloud',     name: 'Cloud',    color: '#0369a1', path: '/cloud'     },
  { id: 'email',     name: 'Email',    color: '#0078d4', path: '/email'     },
  { id: 'contacts',  name: 'Contacts', color: '#1a73e8', path: '/contacts'  },
  { id: 'ai',        name: 'AI',       color: '#6d28d9', path: '/ai'        },
  { id: 'store',     name: 'Store',    color: '#8b5cf6', path: '/store'     },
  { id: 'workspace', name: 'Admin',    color: '#64748b', path: '/workspace' },
];

// ── App SVG icons for launcher ─────────────────────────────────

export const LAUNCHER_SVG_ICONS: Record<string, React.ReactElement> = {
  clearos:  (<g stroke="white" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="20" cy="12" r="3"/><path d="M16 10.5L24 10.5"/><line x1="20" y1="15" x2="20" y2="30"/><line x1="12" y1="21" x2="28" y2="21"/><path d="M20 30 C14.5 30 11 27.5 11 24"/><path d="M20 30 C25.5 30 29 27.5 29 24"/></g>),
  finops:   (<g fill="white"><rect x="8" y="25" width="6.5" height="8" rx="2"/><rect x="17" y="18.5" width="6.5" height="14.5" rx="2" opacity="0.8"/><rect x="26" y="11" width="6.5" height="22" rx="2" opacity="0.65"/></g>),
  complyos: (<g><path d="M20 6L31 10L31 20.5C31 27 26.5 32 20 34C13.5 32 9 27 9 20.5L9 10Z" fill="white" opacity="0.92"/><path d="M14 21L17.5 25L26 16" stroke="#059669" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>),
  bliss:    (<g><path d="M7,3H25Q29,3 29,7V20Q29,24 25,24H13L8,31L12,24H7Q3,24 3,20V7Q3,3 7,3Z" fill="white"/><line x1="10" y1="11" x2="24" y2="11" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round"/><line x1="10" y1="16" x2="20" y2="16" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round"/></g>),
  onepi:    (<g stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L32 13L32 27L20 34L8 27L8 13Z" opacity="0.25" fill="white"/><circle cx="20" cy="12" r="2" fill="white"/><circle cx="14" cy="22" r="2" fill="white"/><circle cx="26" cy="22" r="2" fill="white"/><line x1="20" y1="12" x2="14" y2="22"/><line x1="20" y1="12" x2="26" y2="22"/><line x1="14" y1="22" x2="26" y2="22"/><circle cx="20" cy="19" r="3.5" fill="white"/></g>),
  cloud:    (<g><path d="M27.5 18C27 13.5 23.2 10 18.8 10C15.5 10 12.5 12 11 15C8 15.7 5.5 18.2 5.5 21.5C5.5 24.8 8.2 27.5 11.5 27.5L28.5 27.5C31.5 27.5 34 25 34 22C34 19.2 31.8 17 28.5 16.7Z" fill="white" opacity="0.9"/><g stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="20" y1="23.5" x2="20" y2="34"/><path d="M15.5 29L20 34L24.5 29"/></g></g>),
  ai:       (<g fill="white"><path d="M20 5L22.2 16L33 18.5L22.2 21L20 32L17.8 21L7 18.5L17.8 16Z"/><path d="M31 6L31.9 9L35 9.8L31.9 10.6L31 13.5L30.1 10.6L27 9.8L30.1 9Z" opacity="0.5"/><circle cx="8.5" cy="30" r="2" opacity="0.4"/></g>),
  workspace:(<g fill="white"><rect x="7.5" y="7.5" width="7.5" height="7.5" rx="2"/><rect x="16.5" y="7.5" width="7.5" height="7.5" rx="2"/><rect x="25" y="7.5" width="7.5" height="7.5" rx="2" opacity="0.55"/><rect x="7.5" y="16.5" width="7.5" height="7.5" rx="2"/><rect x="16.5" y="16.5" width="7.5" height="7.5" rx="2" opacity="0.8"/><rect x="25" y="16.5" width="7.5" height="7.5" rx="2" opacity="0.5"/><rect x="7.5" y="25" width="7.5" height="7.5" rx="2" opacity="0.65"/><rect x="16.5" y="25" width="7.5" height="7.5" rx="2" opacity="0.45"/><rect x="25" y="25" width="7.5" height="7.5" rx="2" opacity="0.3"/></g>),
  email:    (<g><rect x="6" y="11" width="28" height="20" rx="3" fill="white" opacity="0.95"/><path d="M6 14L20 23L34 14" stroke="#0078d4" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>),
  crm:      (<g fill="white"><circle cx="20" cy="11" r="4.5"/><path d="M10.5 33C10.5 26.5 14.7 22.5 20 22.5C25.3 22.5 29.5 26.5 29.5 33Z"/><circle cx="10" cy="17" r="3" opacity="0.6"/><path d="M4 31C4 26.5 6.7 23.5 10 23.5" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/><circle cx="30" cy="17" r="3" opacity="0.6"/><path d="M36 31C36 26.5 33.3 23.5 30 23.5" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/></g>),
  contacts: (<g fill="white"><circle cx="20" cy="12" r="5"/><path d="M10 28C10 22.5 14.5 19 20 19C25.5 19 30 22.5 30 28Z"/><circle cx="10" cy="18" r="3" opacity="0.6"/><path d="M4 27C4 23.5 6.5 21 10 21" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/><circle cx="30" cy="18" r="3" opacity="0.6"/><path d="M36 27C36 23.5 33.5 21 30 21" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/></g>),
  store:    (<g fill="white"><rect x="6" y="6" width="12" height="12" rx="2.5"/><rect x="22" y="6" width="12" height="12" rx="2.5"/><rect x="6" y="22" width="12" height="12" rx="2.5"/><rect x="22" y="22" width="12" height="12" rx="2.5" opacity="0.45"/><line x1="28" y1="25" x2="28" y2="31" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round"/><line x1="25" y1="28" x2="31" y2="28" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round"/></g>),
};

export function LauncherAppSvg({ id, color, logoUrl, size = 52 }: { id: string; color: string; logoUrl?: string; size?: number }) {
  const r = Math.round(size * 0.275);
  if (logoUrl) {
    return (
      <div className="app-lnch-custom-icon"
        style={{ '--lnch-bg': color, '--lnch-sz': `${size}px`, '--lnch-r': `${r}px` } as React.CSSProperties}>
        <img src={logoUrl} alt={id} className="app-lnch-custom-icon-img" />
      </div>
    );
  }
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className="app-lnch-svg-icon">
      <rect width={40} height={40} rx={11} fill={color} />
      {LAUNCHER_SVG_ICONS[id] ?? <rect x="10" y="10" width="20" height="20" rx="4" fill="white" opacity="0.7"/>}
    </svg>
  );
}
