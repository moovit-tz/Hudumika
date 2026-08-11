import React from 'react';

// ── Launcher app list ──────────────────────────────────────────
// Shared between AppHeader (mobile app icon, collapsed-sidebar icon) and
// AppLauncher (the switcher panel itself) — kept in its own module so
// both can use it without one depending on the other's internals.

/** Apps that are internal tooling, not customer-facing. The launcher filters
 *  these out unless the signed-in user is a SuperAdmin. */
export const INTERNAL_APP_IDS = new Set(['lens']);

export const LAUNCHER_APPS: Array<{ id: string; name: string; color: string; path: string }> = [
  { id: 'lens',      name: 'Lens',     color: '#475569', path: '/lens'      },
  { id: 'clearos',   name: 'ClearOS',  color: '#ea580c', path: '/clearos'   },
  { id: 'finops',    name: 'FinOps',   color: '#0284c7', path: '/finance'   },
  { id: 'nexushr',     name: 'NexusHR',  color: '#0d9488', path: '/nexushr'     },
  { id: 'bliss',     name: 'Bliss',    color: '#7c3aed', path: '/bliss'     },
  { id: 'complyos',  name: 'ComplyOS', color: '#059669', path: '/complyos'  },
  { id: 'crm',       name: 'CRM',      color: '#059669', path: '/crm'       },
  { id: 'cloud',     name: 'Cloud',    color: '#0369a1', path: '/cloud'     },
  { id: 'email',     name: 'Email',    color: '#0078d4', path: '/email'     },
  { id: 'contacts',  name: 'Contacts', color: '#1a73e8', path: '/contacts'  },
  { id: 'ai',        name: 'AI',       color: '#6d28d9', path: '/ai'        },
  { id: 'store',     name: 'Store',    color: '#8b5cf6', path: '/store'     },
  { id: 'oneid',     name: 'Ondi',     color: '#4361EE', path: '/ondi'     },
  { id: 'tracking',  name: 'HuduFreight', color: '#0891b2', path: '/tracking'  },
  { id: 'workspace', name: 'Admin',    color: '#64748b', path: '/workspace' },
  { id: 'calendar',  name: 'Calendar', color: '#db2777', path: '/calendar'  },
  { id: 'tasks',     name: 'Tasks',    color: '#0f766e', path: '/tasks'     },
  { id: 'cargotracker',  name: 'CargoTracker', color: '#4f46e5', path: '/cargotracker' },
  { id: 'seal',      name: 'SEAL',     color: '#0f766e', path: '/seal'      },
  { id: 'inventory', name: 'Inventory', color: '#0f766e', path: '/inventory' },
  { id: 'studio',    name: 'Studio',   color: '#4361ee', path: '/studio'    },
  // Onsite ships with its own id rather than the CMS's 'onesite' — see the
  // AppId union. Without an entry here it appeared in neither this launcher
  // nor the workspace hub, since WorkspaceHome builds its grid from this
  // same list.
  { id: 'onsite',    name: 'Onsite',   color: '#0f172a', path: '/onsite'    },
  { id: 'hudubi',    name: 'HuduBI',   color: '#18181b', path: '/hudubi'    },
];

// ── App SVG icons for launcher ─────────────────────────────────

export const LAUNCHER_SVG_ICONS: Record<string, React.ReactElement> = {
  // A lens: what the tool is for — looking closely at the platform itself.
  lens:     (<g stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round"><circle cx="17" cy="17" r="9"/><line x1="24" y1="24" x2="32" y2="32"/><line x1="13.5" y1="17" x2="20.5" y2="17" opacity="0.7"/><line x1="17" y1="13.5" x2="17" y2="20.5" opacity="0.7"/></g>),
  onsite:   (<g stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="7" width="24" height="8" rx="2"/><rect x="6" y="21" width="24" height="8" rx="2"/><circle cx="11" cy="11" r="1.6" fill="white" stroke="none"/><circle cx="11" cy="25" r="1.6" fill="white" stroke="none"/><line x1="17" y1="11" x2="25" y2="11" opacity="0.75"/><line x1="17" y1="25" x2="25" y2="25" opacity="0.75"/><line x1="18" y1="15" x2="18" y2="21" opacity="0.6"/></g>),
  studio:   (<g fill="white"><path d="M11 8H29V12H11Z" /><path d="M11 15H29V19H11Z" opacity="0.8" /><path d="M11 22H29V26H11Z" opacity="0.6" /><circle cx="7" cy="10" r="2.5" /><circle cx="7" cy="17" r="2.5" /><circle cx="7" cy="24" r="2.5" /></g>),
  clearos:  (<g stroke="white" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="20" cy="12" r="3"/><path d="M16 10.5L24 10.5"/><line x1="20" y1="15" x2="20" y2="30"/><line x1="12" y1="21" x2="28" y2="21"/><path d="M20 30 C14.5 30 11 27.5 11 24"/><path d="M20 30 C25.5 30 29 27.5 29 24"/></g>),
  finops:   (<g fill="white"><rect x="8" y="25" width="6.5" height="8" rx="2"/><rect x="17" y="18.5" width="6.5" height="14.5" rx="2" opacity="0.8"/><rect x="26" y="11" width="6.5" height="22" rx="2" opacity="0.65"/></g>),
  complyos: (<g><path d="M8 6H21L28 13V32C28 33.1 27.1 34 26 34H8C6.9 34 6 33.1 6 32V8C6 6.9 6.9 6 8 6Z" fill="none" stroke="#22c55e" strokeWidth="2.8" strokeLinejoin="round" /><path d="M21 6V13H28" fill="#facc15" stroke="#22c55e" strokeWidth="2.8" strokeLinejoin="round" /><path d="M21 17C25.5 17 29 19 29 23C29 28 24.5 31.5 21 33C17.5 31.5 13 28 13 23C13 19 16.5 17 21 17Z" fill="#facc15" stroke="#22c55e" strokeWidth="2.8" strokeLinejoin="round" /><path d="M17 23L19.8 25.8L25 20" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></g>),
  bliss:    (<g><path d="M7,3H25Q29,3 29,7V20Q29,24 25,24H13L8,31L12,24H7Q3,24 3,20V7Q3,3 7,3Z" fill="white"/><line x1="10" y1="11" x2="24" y2="11" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round"/><line x1="10" y1="16" x2="20" y2="16" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round"/></g>),
  nexushr:    (<g stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L32 13L32 27L20 34L8 27L8 13Z" opacity="0.25" fill="white"/><circle cx="20" cy="12" r="2" fill="white"/><circle cx="14" cy="22" r="2" fill="white"/><circle cx="26" cy="22" r="2" fill="white"/><line x1="20" y1="12" x2="14" y2="22"/><line x1="20" y1="12" x2="26" y2="22"/><line x1="14" y1="22" x2="26" y2="22"/><circle cx="20" cy="19" r="3.5" fill="white"/></g>),
  cloud:    (<g><path d="M27.5 18C27 13.5 23.2 10 18.8 10C15.5 10 12.5 12 11 15C8 15.7 5.5 18.2 5.5 21.5C5.5 24.8 8.2 27.5 11.5 27.5L28.5 27.5C31.5 27.5 34 25 34 22C34 19.2 31.8 17 28.5 16.7Z" fill="white" opacity="0.9"/><g stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="20" y1="23.5" x2="20" y2="34"/><path d="M15.5 29L20 34L24.5 29"/></g></g>),
  ai:       (<g fill="white"><path d="M20 5L22.2 16L33 18.5L22.2 21L20 32L17.8 21L7 18.5L17.8 16Z"/><path d="M31 6L31.9 9L35 9.8L31.9 10.6L31 13.5L30.1 10.6L27 9.8L30.1 9Z" opacity="0.5"/><circle cx="8.5" cy="30" r="2" opacity="0.4"/></g>),
  workspace:(<g fill="white"><rect x="7.5" y="7.5" width="7.5" height="7.5" rx="2"/><rect x="16.5" y="7.5" width="7.5" height="7.5" rx="2"/><rect x="25" y="7.5" width="7.5" height="7.5" rx="2" opacity="0.55"/><rect x="7.5" y="16.5" width="7.5" height="7.5" rx="2"/><rect x="16.5" y="16.5" width="7.5" height="7.5" rx="2" opacity="0.8"/><rect x="25" y="16.5" width="7.5" height="7.5" rx="2" opacity="0.5"/><rect x="7.5" y="25" width="7.5" height="7.5" rx="2" opacity="0.65"/><rect x="16.5" y="25" width="7.5" height="7.5" rx="2" opacity="0.45"/><rect x="25" y="25" width="7.5" height="7.5" rx="2" opacity="0.3"/></g>),
  email:    (<g><rect x="6" y="11" width="28" height="20" rx="3" fill="white" opacity="0.95"/><path d="M6 14L20 23L34 14" stroke="#0078d4" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>),
  crm:      (<g fill="white"><circle cx="20" cy="11" r="4.5"/><path d="M10.5 33C10.5 26.5 14.7 22.5 20 22.5C25.3 22.5 29.5 26.5 29.5 33Z"/><circle cx="10" cy="17" r="3" opacity="0.6"/><path d="M4 31C4 26.5 6.7 23.5 10 23.5" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/><circle cx="30" cy="17" r="3" opacity="0.6"/><path d="M36 31C36 26.5 33.3 23.5 30 23.5" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/></g>),
  contacts: (<g fill="white"><circle cx="20" cy="12" r="5"/><path d="M10 28C10 22.5 14.5 19 20 19C25.5 19 30 22.5 30 28Z"/><circle cx="10" cy="18" r="3" opacity="0.6"/><path d="M4 27C4 23.5 6.5 21 10 21" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/><circle cx="30" cy="18" r="3" opacity="0.6"/><path d="M36 27C36 23.5 33.5 21 30 21" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/></g>),
  store:    (<g fill="white"><rect x="6" y="6" width="12" height="12" rx="2.5"/><rect x="22" y="6" width="12" height="12" rx="2.5"/><rect x="6" y="22" width="12" height="12" rx="2.5"/><rect x="22" y="22" width="12" height="12" rx="2.5" opacity="0.45"/><line x1="28" y1="25" x2="28" y2="31" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round"/><line x1="25" y1="28" x2="31" y2="28" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round"/></g>),
  seal:     (<g stroke="white" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L31 11V20C31 27 26.5 31.5 20 34C13.5 31.5 9 27 9 20V11L20 6Z"/><path d="M15 20L18.5 23.5L26 15" strokeWidth="2.5"/></g>),
  inventory: (<g stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M6 13L20 6L34 13V27L20 34L6 27Z"/><path d="M6 13L20 20L34 13"/><line x1="20" y1="20" x2="20" y2="34"/></g>),
  oneid:    (<g><circle cx="20" cy="12" r="5.5" fill="white"/><path d="M7 38C7 26.5 12.5 21 20 21C27.5 21 33 26.5 33 38Z" fill="white"/><path d="M14 38C14 30.5 16.5 27.5 20 27.5C23.5 27.5 26 30.5 26 38Z" fill="#4361EE"/></g>),
  tracking: (<g><path d="M20 4C13 4 8 9.5 8 16C8 25 20 36 20 36C20 36 32 25 32 16C32 9.5 27 4 20 4Z" fill="white"/><circle cx="20" cy="16" r="5.5" fill="#0891b2"/></g>),
  calendar: (<g fill="white"><path d="M11 9h18v3H11z" /><path d="M11 14h18v15H11z" opacity="0.6"/><rect x="15" y="6" width="2" height="5" rx="1" fill="white" /><rect x="23" y="6" width="2" height="5" rx="1" fill="white" /></g>),
  tasks:    (<g stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M14 20l4 4 8-8" /><circle cx="20" cy="20" r="10" /></g>),
  demurrage: (<g stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L34 30H6Z"/><line x1="20" y1="15" x2="20" y2="23"/><circle cx="20" cy="27" r="0.6" fill="white"/></g>),
  cargotracker: (<g stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="17" height="14"/><path d="M21 15h6l5 5v4h-11z"/><circle cx="11" cy="27" r="2.3" fill="white" stroke="none"/><circle cx="26" cy="27" r="2.3" fill="white" stroke="none"/></g>),
  hudubi: (<g fill="white"><rect x="8" y="24" width="5.5" height="10" rx="1.5"/><rect x="17.25" y="16" width="5.5" height="18" rx="1.5" opacity="0.85"/><rect x="26.5" y="8" width="5.5" height="26" rx="1.5" opacity="0.7"/><path d="M7 18 L16 11 L23 15 L33 6" stroke="#fcd34d" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/><circle cx="33" cy="6" r="2" fill="#fcd34d"/></g>),
  // Not part of LAUNCHER_APPS (that list is shared with the header/AppLauncher
  // switcher, which every tenant user sees, unfiltered by role) — this icon is
  // only referenced directly, by id, from WorkspaceHome's own SUPER_ADMIN-only
  // "SuperAdmin" tile, so a regular tenant user never sees this entry anywhere.
  superadmin: (<g stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L31 11V20C31 27 26.5 31.5 20 34C13.5 31.5 9 27 9 20V11L20 6Z"/><path d="M15.5 19.5L18.5 22.5L25 15.5" strokeWidth="2.5"/></g>),
};

export function LauncherAppSvg({ id, color, logoUrl, size = 52 }: { id: string; color: string; logoUrl?: string; size?: number }) {
  const r = Math.round(size * 0.275);
  const [broken, setBroken] = React.useState(false);
  // A stale/invalid saved logo URL (deleted upload, bad path) must never show
  // the browser's broken-image glyph — fall back to the vector brand icon.
  if (logoUrl && !broken) {
    return (
      <div className="app-lnch-custom-icon"
        style={{ '--lnch-bg': color, '--lnch-sz': `${size}px`, '--lnch-r': `${r}px` } as React.CSSProperties}>
        <img src={logoUrl} alt={id} className="app-lnch-custom-icon-img" onError={() => setBroken(true)} />
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
