/**
 * Single-app entry mode — the "reusable app entry configuration" the
 * standalone-apps plan (docs/audits/STANDALONE_VERIFICATION_AND_PLAN_
 * 2026-11-05.md, milestone M1) calls for. Deliberately a runtime hostname
 * check, not a separate Vite build: this web app is already one SPA
 * serving every product, so a dedicated subdomain (onsite.hudumika.tz)
 * can point at the exact same build and API Caddy already serves for the
 * main domain — no second build artifact, no second deploy pipeline, and
 * trivially reversible (delete one entry here to fold an app back into
 * the shared launcher).
 *
 * Local/dev override: ?app_entry=<id> (persisted to localStorage) lets a
 * developer try the single-app experience against `npm run dev` without
 * needing a real subdomain or a second process — "native local start
 * path... without Docker" from the plan's own wording.
 */

// Values are the real first path segment each app's own Route already
// answers to in App.tsx (HubPage does `Navigate to={/${singleApp}}`), not
// an arbitrary app id — several differ from their product name (FinOps is
// '/finance', HuduFreight is '/tracking', CMS is '/cms' but its appId is
// 'onesite', eSign is '/sign', the tenant Admin console is '/workspace',
// SuperAdmin is '/admin'). Keep this in sync with LauncherApps.tsx's own
// LAUNCHER_APPS paths — that file is the other place these are listed.
const SINGLE_APP_HOSTS: Record<string, string> = {
  'onsite.hudumika.tz': 'onsite',
  'lens.hudumika.tz': 'lens',
  'complyos.hudumika.tz': 'complyos',
  'nexushr.hudumika.tz': 'nexushr',
  'developer.hudumika.tz': 'developer',
  'petti.hudumika.tz': 'petti',
  'clearos.hudumika.tz': 'clearos',
  'finops.hudumika.tz': 'finance',
  'bliss.hudumika.tz': 'bliss',
  'crm.hudumika.tz': 'crm',
  'cloud.hudumika.tz': 'cloud',
  'email.hudumika.tz': 'email',
  'contacts.hudumika.tz': 'contacts',
  'ondi.hudumika.tz': 'ondi',
  // HuduFreight and SafeTracker are the same product (freight/container
  // tracking, route /tracking) under two names used in different places —
  // both hostnames land on it, there is no separate SafeTracker route.
  'hudufreight.hudumika.tz': 'tracking',
  'safetracker.hudumika.tz': 'tracking',
  'calendar.hudumika.tz': 'calendar',
  'tasks.hudumika.tz': 'tasks',
  'seal.hudumika.tz': 'seal',
  'studio.hudumika.tz': 'studio',
  'cms.hudumika.tz': 'cms',
  'hudubi.hudumika.tz': 'hudubi',
  'esign.hudumika.tz': 'sign',
  'sms.hudumika.tz': 'sms',
  'projects.hudumika.tz': 'projects',
  // Tenant admin console ('Admin' in the product list) vs. the platform
  // console ('SuperAdmin') — kept on deliberately distinct hostnames so
  // neither name reads as the other.
  'workspace.hudumika.tz': 'workspace',
  'superadmin.hudumika.tz': 'admin',
};

// Standalone Ondi issuer origins this web app will ever call back directly
// (OndiAuthorize.tsx's api_base handling) — an explicit allowlist, not a
// hostname shape check, because this value drives a credentialed fetch
// (CSRF token attached) and the response's redirect_url is handed straight
// to window.location.href. An unvalidated api_base would let any link
// turn the real, trusted consent page into an open-redirect/phishing proxy
// pointed at an attacker's server. Local dev's standalone server (apps/api/
// src/ondi-standalone-server.ts, ONDI_STANDALONE_PORT) is the only entry
// today; a real deployment adds its real identity subdomain here, never a
// pattern or wildcard.
export const TRUSTED_ONDI_ISSUERS = new Set(['http://localhost:3010']);

// The only app IDs the ?app_entry= dev override may ever select — an
// arbitrary string here would persist to localStorage and silently hijack
// every later visit for whoever's browser it is. Keep in sync with
// SINGLE_APP_HOSTS's values.
const KNOWN_APP_IDS = new Set(Object.values(SINGLE_APP_HOSTS));

const OVERRIDE_KEY = 'hudumika_single_app_entry';

// The hostname mapping above is the real, always-on production mechanism.
// The ?app_entry= query override exists only so a developer can try the
// single-app experience against `npm run dev` without a real subdomain —
// it must never fire against a real deployed domain, where it would let
// any link silently flip a visitor's own browser into single-app mode.
function isLocalDev(): boolean {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export function getSingleAppEntry(): string | null {
  if (typeof window === 'undefined') return null;
  const hostMatch = SINGLE_APP_HOSTS[window.location.hostname] ?? null;
  if (hostMatch) return hostMatch;
  if (!isLocalDev()) return null;
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('app_entry');
    if (fromQuery) {
      if (!KNOWN_APP_IDS.has(fromQuery)) return null;
      localStorage.setItem(OVERRIDE_KEY, fromQuery);
      return fromQuery;
    }
    const stored = localStorage.getItem(OVERRIDE_KEY);
    if (stored && KNOWN_APP_IDS.has(stored)) return stored;
  } catch { /* localStorage unavailable (private mode, etc.) — no override */ }
  return null;
}
