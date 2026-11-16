import type { AppId } from '@hudumika/types';

/** Internal platform shells that live inside apps/web without being customer-billable
 *  apps in ALL_APP_IDS (which is guarded by legal/entitlement tests). */
export type ShellAppId = AppId | 'design-system';

export const DEFAULT_BRAND_ACCENT = '#1257c6';

/** Canonical per-app default accent colors — single source of truth shared by
 *  WorkspaceApp (CSS variables), LauncherApps (launcher icons), AppLauncher,
 *  appRegistry, BrandingView, and AppConfiguratorPage. */
export const DEFAULT_APP_COLORS: Record<ShellAppId, string> = {
  // Internal tooling
  lens:           '#475569',
  'design-system':'#1257c6',
  // Customer & operations suites
  clearos:        '#ea580c',
  finops:         '#0284c7',
  complyos:       '#059669',
  bliss:          '#7c3aed',
  nexushr:        '#0d9488',
  onesite:        '#06b6d4',
  onsite:         '#0f172a',
  ondi:           '#4253d1',
  tracking:       '#0891b2',
  cloud:          '#0369a1',
  ai:             '#1257c6',
  workspace:      '#64748b',
  admin:          '#1257c6',
  email:          '#0078d4',
  crm:            '#059669',
  contacts:       '#1a73e8',
  store:          '#8b5cf6',
  calendar:       '#db2777',
  tasks:          '#0f766e',
  notes:          '#fbbc04',
  sign:           '#2563eb',
  demurrage:      '#ea580c',
  cargotracker:   '#4f46e5',
  seal:           '#0f766e',
  hudubi:         '#18181b',
  petti:          '#16a34a',
  pos:            '#1257c6',
  sms:            '#1257c6',
  projects:       '#f59e0b',
  developer:      '#0f766e',
  studio:         '#4361ee',
  travel:         '#7c3aed',
  tuma:           '#0891b2',
  lexcore:        '#7c3aed',
  ngao:           '#059669',
  gereji:         '#d97706',
  zentra:         '#0f766e',
  pulse:          '#e11d48',
};
