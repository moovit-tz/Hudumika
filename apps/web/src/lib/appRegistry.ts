import { ALL_APP_IDS, type AppId } from '@hudumika/types';
import { APP_LABELS } from '../shells/WorkspaceApp.js';
import { DEFAULT_APP_COLORS, DEFAULT_BRAND_ACCENT, type ShellAppId } from './appDefaults.js';
import { readDesignSystemVersion } from '../hooks/useDesignSystem.js';

/** Canonical per-app default accents shared across shells, launcher, and configurator. */
export const APP_DEFAULT_COLORS: Record<ShellAppId, string> = DEFAULT_APP_COLORS;

export type AppColorSource =
  | 'design_system_v2'
  | 'tenant_app'
  | 'platform_app'
  | 'tenant_accent'
  | 'default';

export interface AppColorLayer {
  source: AppColorSource;
  label: string;
  key: string;
  value: string | null;
  active: boolean;
}

export interface AppColorResolution {
  appId: string;
  effective: string;
  source: AppColorSource;
  sourceLabel: string;
  defaultColor: string;
  layers: AppColorLayer[];
}

function normalizeLegacyAccent(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.toLowerCase() === '#0b1e3a' ? null : v;
}

/**
 * Mirrors useBranding().getAppColor() and returns BOTH the resolved accent and
 * the full 5-layer precedence chain so App Configurator can show admins
 * exactly *why* an app has its active color and which layer won.
 */
export function resolveAppColorDetails(appId: string): AppColorResolution {
  const defaultColor = DEFAULT_APP_COLORS[appId as ShellAppId] ?? DEFAULT_BRAND_ACCENT;
  const hasLs = typeof localStorage !== 'undefined';
  const dsv = readDesignSystemVersion();
  const v2Color = dsv.version === 'v2' ? dsv.v2Color : null;
  const tenantApp = hasLs ? normalizeLegacyAccent(localStorage.getItem(`hudumika_tenant_app_color_${appId}`)) : null;
  const platformApp = hasLs ? normalizeLegacyAccent(localStorage.getItem(`hudumika_app_color_${appId}`)) : null;
  const tenantAccent = hasLs ? normalizeLegacyAccent(localStorage.getItem('hudumika_tenant_accent')) : null;

  let source: AppColorSource = 'default';
  let sourceLabel = 'Code default (appDefaults.ts)';
  let effective = defaultColor;

  if (v2Color) {
    source = 'design_system_v2';
    sourceLabel = 'Mellon v2 unified override';
    effective = v2Color;
  } else if (tenantApp) {
    source = 'tenant_app';
    sourceLabel = 'Workspace per-app override';
    effective = tenantApp;
  } else if (platformApp) {
    source = 'platform_app';
    sourceLabel = 'Platform per-app branding';
    effective = platformApp;
  } else if (tenantAccent) {
    source = 'tenant_accent';
    sourceLabel = 'Workspace global accent';
    effective = tenantAccent;
  }

  return {
    appId,
    effective,
    source,
    sourceLabel,
    defaultColor,
    layers: [
      { source: 'design_system_v2', label: 'Mellon v2 lock', key: 'hudumika_ds_version', value: v2Color, active: source === 'design_system_v2' },
      { source: 'tenant_app', label: 'Workspace app override', key: `hudumika_tenant_app_color_${appId}`, value: tenantApp, active: source === 'tenant_app' },
      { source: 'platform_app', label: 'Platform app branding', key: `hudumika_app_color_${appId}`, value: platformApp, active: source === 'platform_app' },
      { source: 'tenant_accent', label: 'Workspace fallback accent', key: 'hudumika_tenant_accent', value: tenantAccent, active: source === 'tenant_accent' },
      { source: 'default', label: 'Canonical default', key: `DEFAULT_APP_COLORS.${appId}`, value: defaultColor, active: source === 'default' },
    ],
  };
}

/**
 * The one list of apps the admin surfaces render from.
 *
 * /admin/design-system and /admin/branding each kept their own hand-written
 * array — 12 apps and 20 apps against the 23 in ALL_APP_IDS — so SEAL,
 * Inventory and Studio had no accent colour, no name and no slogan a
 * SuperAdmin could set, and the two pages disagreed about what CargoTracker
 * and Ondi were even called. Adding an app meant remembering three places.
 *
 * Derived from ALL_APP_IDS, so an app added there appears on both screens
 * with no further edit. A brand-new id with no label and no slogan yet still
 * renders — humanised id, empty slogan — rather than silently vanishing,
 * which is the failure mode this replaces.
 */

/** Names come from APP_LABELS, the same map the app shells put in the TopBar,
 *  so a SuperAdmin sees the app called what its users call it. */
const SLOGANS: Partial<Record<AppId, string>> = {
  clearos:      'Customs & Freight clearance platform',
  finops:       'Financial accounts and payroll ledger',
  nexushr:      'People operations and shift rosters',
  bliss:        'Omnichannel customer helpdesk & ticketing',
  complyos:     'Compliance tracking, BRELA search & permits',
  crm:          'Customer relationships and sales deals',
  cloud:        'Enterprise document storage & cloud drive',
  email:        'Internal corporate messaging center',
  contacts:     'Stakeholder and client phone book',
  store:        'B2B procurement & equipment marketplace',
  workspace:    'Organization settings and configuration',
  admin:        'Platform governance, tenants & query builder',
  ondi:         'SSO, identity verification & biometrics',
  onesite:      'Content management & company intranet',
  onsite:       'Domains, DNS, hosting, deployments & cloud infrastructure',
  tracking:     'GPS fleet tracking, telemetry & live map',
  demurrage:    'Container demurrage tariffs and cost tracking',
  cargotracker: 'AWB and Bill of Lading shipment tracking',
  calendar:     'Scheduling & team calendar',
  tasks:        'To-dos & team task tracking',
  seal:         'Warehouse, inventory & bonded customs stock account',
  studio:       'Workflow builder and clearance automations',
  hudubi:       'Data layer & executive AI analytics engine',
  petti:        'Tenant petty-cash wallet, deposits & withdrawal approvals',
  pos:          'Register checkout, shifts, payments & receipts',
  sms:          'Bulk & transactional SMS — quick send, groups, templates & campaigns',
  tuma:         'Parcel logistics — booking, dispatch, delivery tracking & agent management',
  lexcore:      'Legal practice management — matters, time/billing, trust accounts & conflicts',
  ngao:         'Privacy & data protection compliance — assessments, registers & incident response',
  gereji:       'Automotive workshop — vehicle records, job cards, estimates, labour & parts',
  pulse:        'Marketing — audiences, email & SMS campaigns, journeys, social, ads and attribution',
};

/** Last-resort name for an app id added to ALL_APP_IDS but not yet to
 *  APP_LABELS — better a readable id than a missing row. */
function humanise(id: string): string {
  return id.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export interface AppMeta {
  id: AppId;
  name: string;
  slogan: string;
}

export interface ConfigurableAppMeta {
  id: ShellAppId;
  name: string;
  slogan: string;
  defaultColor: string;
  internalOnly?: boolean;
}

export const APP_REGISTRY: AppMeta[] = ALL_APP_IDS.map(id => ({
  id,
  name: APP_LABELS[id] ?? humanise(id),
  slogan: SLOGANS[id] ?? '',
}));

export const CONFIGURABLE_APP_REGISTRY: ConfigurableAppMeta[] = [
  ...APP_REGISTRY.map(a => ({
    ...a,
    defaultColor: DEFAULT_APP_COLORS[a.id] ?? DEFAULT_BRAND_ACCENT,
    internalOnly: a.id === 'lens',
  })),
  {
    id: 'design-system',
    name: 'Design System',
    slogan: 'Foundations, atomic components, interaction patterns & governance',
    defaultColor: DEFAULT_APP_COLORS['design-system'],
    internalOnly: true,
  },
];
