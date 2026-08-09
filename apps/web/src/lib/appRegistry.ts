import { ALL_APP_IDS, type AppId } from '@hudumika/types';
import { APP_LABELS } from '../shells/WorkspaceApp.js';

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
  ai:           'Document OCR, copilot & predictive analytics',
  store:        'B2B procurement & equipment marketplace',
  workspace:    'Organization settings and configuration',
  admin:        'Platform governance, tenants & query builder',
  oneid:        'SSO, identity verification & biometrics',
  onesite:      'Content management & company intranet',
  onsite:       'Domains, DNS, hosting, deployments & cloud infrastructure',
  tracking:     'GPS fleet tracking, telemetry & live map',
  demurrage:    'Container demurrage tariffs and cost tracking',
  cargotracker: 'AWB and Bill of Lading shipment tracking',
  calendar:     'Scheduling & team calendar',
  tasks:        'To-dos & team task tracking',
  seal:         'Bonded warehouse ledger & customs stock account',
  inventory:    'Stock counts, warehouses and item control',
  studio:       'Workflow builder and clearance automations',
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

export const APP_REGISTRY: AppMeta[] = ALL_APP_IDS.map(id => ({
  id,
  name: APP_LABELS[id] ?? humanise(id),
  slogan: SLOGANS[id] ?? '',
}));
