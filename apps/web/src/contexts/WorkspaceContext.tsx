import React, { createContext, useContext, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { AppId } from '@hudumika/types';

// ── Active-app detection ──────────────────────────────────────

const APP_PREFIXES: Array<[string, AppId]> = [
  // New prefix-based routes (Phase 1+)
  ['/clearos',          'clearos'],
  ['/finops',           'finops'],
  ['/nexushr',            'nexushr'],
  ['/bliss',            'bliss'],
  ['/cloud',            'cloud'],
  ['/ai',               'ai'],
  ['/workspace',        'workspace'],
  // Legacy/current routes (until Phase 1 migration is complete)
  ['/ops',              'clearos'],
  ['/shipments',        'clearos'],
  ['/clearance',        'clearos'],
  ['/tracker',          'cargotracker'],
  ['/cargotracker',     'cargotracker'],
  ['/customs-tools',    'clearos'],
  ['/compliance',       'clearos'],
  ['/penalty',          'clearos'],
  ['/delivery-notes',   'clearos'],
  ['/customers',        'clearos'],
  ['/leads',            'clearos'],
  ['/sales',            'clearos'],
  ['/crm',              'clearos'],
  ['/chat',             'clearos'],
  ['/finance',          'finops'],
  ['/billing',          'finops'],
  ['/quotations',       'finops'],
  ['/purchase-orders',  'finops'],
  ['/expenses',         'finops'],
  ['/accounts',         'finops'],
  ['/hrm',              'nexushr'],
  ['/support',          'bliss'],
  ['/escalations',      'bliss'],
  ['/documents',        'cloud'],
  ['/admin',            'workspace'],
  ['/tenant-management','workspace'],
  ['/system-update',    'workspace'],
  ['/settings',         'workspace'],
  ['/petti',            'petti'],
];

function detectApp(pathname: string): AppId | null {
  for (const [prefix, app] of APP_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return app;
  }
  return null; // workspace home
}

// ── Context ───────────────────────────────────────────────────

interface WorkspaceCtx {
  activeApp: AppId | null;
}

const WorkspaceContext = createContext<WorkspaceCtx>({ activeApp: null });

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const value = useMemo<WorkspaceCtx>(() => ({ activeApp: detectApp(pathname) }), [pathname]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceCtx {
  return useContext(WorkspaceContext);
}
