// ─── WorkspaceApp — generic wrapper used by every app shell ──
// Sets the active app label in the TopBar brand area and wires
// the correct nav config into HorizontalNav.

import React, { useState, useRef, useEffect } from 'react';
import type { AppId } from '@hudumika/types';
import { useBranding } from '../hooks/useBranding.js';
import { RequireAppEnabled } from '../components/RequireAppEnabled.js';
import { parseHex, darkenHex } from '../lib/color.js';

// The SuperAdmin platform panel is never gated by a tenant's enabled-apps config —
// it's how a SuperAdmin fixes their own mistakes, so it can never lock itself out.
const UNGATED_APP_IDS = new Set<AppId>(['admin']);

interface WorkspaceAppProps {
  appId: AppId;
  children: React.ReactNode;
}

// Map app id → brand label shown next to the Hudumika logo
export const APP_LABELS: Record<AppId, string> = {
  clearos:   'ClearOS',
  finops:    'FinOps',
  complyos:  'ComplyOS',
  bliss:     'Bliss',
  onepi:     'NexusHR',
  onesite:   'oneSite',
  oneid:     'Ondi',
  cloud:     'Cloud',
  ai:        'AI',
  workspace: 'Admin',
  admin:     'Platform Admin',
  email:     'Hudumika Email',
  crm:       'CRM',
  contacts:  'Contacts',
  store:     'Store',
};

export const APP_COLORS: Record<AppId, string> = {
  clearos:   '#ea580c',
  finops:    '#0284c7',
  complyos:  '#059669',
  bliss:     '#7c3aed',
  onepi:     '#0d9488',
  onesite:   '#db2777',
  oneid:     '#4361EE',
  cloud:     '#0369a1',
  ai:        '#6d28d9',
  workspace: '#64748b',
  admin:     '#dc2626',
  email:     '#0078d4',
  crm:       '#16a34a',
  contacts:  '#1a73e8',
  store:     '#8b5cf6',
};

export const ActiveAppContext = React.createContext<AppId | null>(null);

export const MobileNavContext = React.createContext<{
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}>({ mobileOpen: false, setMobileOpen: () => {} });

export function WorkspaceApp({ appId, children }: WorkspaceAppProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const branding = useBranding();
  const [dsRev, setDsRev] = useState(0);
  const appColor = branding.getAppColor(appId, APP_COLORS[appId] ?? '#64748b');

  useEffect(() => {
    const handler = () => setDsRev(r => r + 1);
    window.addEventListener('hudumika-ds-updated', handler);
    return () => window.removeEventListener('hudumika-ds-updated', handler);
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const [r, g, b] = parseHex(appColor);
    el.style.setProperty('--teal',   appColor);
    el.style.setProperty('--teal-l', `rgba(${r},${g},${b},0.1)`);
    el.style.setProperty('--teal-m', `rgba(${r},${g},${b},0.18)`);
    el.style.setProperty('--teal-d', darkenHex(appColor));

    // App-level DS tokens removed in favor of global M3 tokens
  }, [appColor, appId, dsRev]);

  const body = (
    <ActiveAppContext.Provider value={appId}>
      <MobileNavContext.Provider value={{ mobileOpen, setMobileOpen }}>
        <div ref={wrapperRef} className="app-color-scope">
          {children}
        </div>
      </MobileNavContext.Provider>
    </ActiveAppContext.Provider>
  );

  if (UNGATED_APP_IDS.has(appId)) return body;
  return <RequireAppEnabled appId={appId}>{body}</RequireAppEnabled>;
}

export function useActiveApp(): AppId | null {
  return React.useContext(ActiveAppContext);
}
