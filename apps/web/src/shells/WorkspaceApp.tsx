// ─── WorkspaceApp — generic wrapper used by every app shell ──
// Sets the active app label in the TopBar brand area and wires
// the correct nav config into HorizontalNav.

import React, { useState, useRef, useEffect } from 'react';
import type { AppId } from '@hudumika/types';
import { useBranding } from '../hooks/useBranding.js';
import { RequireAppEnabled } from '../components/RequireAppEnabled.js';
import { parseHex, darkenHex, lightenHex, hexToHslTriplet, pickForegroundHsl, enforceContrastFloor } from '../lib/color.js';
import { SkeletonPage } from '../components/ui/skeleton.js';

// The SuperAdmin platform panel is never gated by a tenant's enabled-apps config —
// it's how a SuperAdmin fixes their own mistakes, so it can never lock itself out.
const UNGATED_APP_IDS = new Set<AppId>(['admin']);

interface WorkspaceAppProps {
  appId: AppId;
  children: React.ReactNode;
}

// Map app id → brand label shown next to the Hudumika logo
export const APP_LABELS: Record<AppId, string> = {
  lens:      'Lens',
  studio:    'Studio',
  clearos:   'ClearOS',
  finops:    'FinOps',
  complyos:  'ComplyOS',
  bliss:     'Bliss',
  nexushr:     'NexusHR',
  onesite:   'oneSite',
  oneid:     'Ondi',
  tracking:  'HuduFreight',
  cloud:     'Cloud',
  ai:        'AI',
  workspace: 'Admin',
  admin:     'Platform Admin',
  email:     'Hudumika Email',
  crm:       'CRM',
  contacts:  'Contacts',
  store:     'Store',
  calendar:  'Calendar',
  tasks:     'Tasks',
  demurrage:     'Demurrage',
  cargotracker:  'CargoTracker',
  seal:          'SEAL',
  inventory:     'Inventory Control',
};

// Every app defaults to the single brand accent (matches --teal in index.css)
// rather than its own hue — a SuperAdmin can still recolor individual apps
// via BrandingView (see useBranding.ts's getAppColor override), this is just
// the out-of-the-box default so switching apps doesn't re-theme the sidebar/
// avatar accent by default.
const DEFAULT_APP_COLOR = '#0b1e3a';
export const APP_COLORS: Record<AppId, string> = {
  // Slate, deliberately unlike the customer apps — it should not look like
  // one of them in a screenshot.
  lens:      '#475569',
  studio:    '#4361ee',
  clearos: DEFAULT_APP_COLOR, finops: DEFAULT_APP_COLOR, complyos: DEFAULT_APP_COLOR,
  bliss: DEFAULT_APP_COLOR, nexushr: DEFAULT_APP_COLOR, onesite: DEFAULT_APP_COLOR,
  oneid: DEFAULT_APP_COLOR, tracking: DEFAULT_APP_COLOR, cloud: DEFAULT_APP_COLOR,
  ai: DEFAULT_APP_COLOR, workspace: DEFAULT_APP_COLOR, admin: DEFAULT_APP_COLOR,
  email: DEFAULT_APP_COLOR, crm: DEFAULT_APP_COLOR, contacts: DEFAULT_APP_COLOR,
  store: DEFAULT_APP_COLOR, calendar: DEFAULT_APP_COLOR, tasks: DEFAULT_APP_COLOR,
  demurrage: DEFAULT_APP_COLOR, cargotracker: DEFAULT_APP_COLOR, seal: DEFAULT_APP_COLOR,
  inventory: DEFAULT_APP_COLOR,
};

/**
 * Which palette slot each app takes when a SuperAdmin applies a theme preset.
 *
 * This used to be `palette[i % palette.length]` over ALL_APP_IDS — assignment
 * by list position. With 23 apps and an 8-colour palette that wraps nearly
 * three times, so every colour is worn by two or three apps and *which* ones
 * depends on the order of an array nobody thinks of as significant. SEAL came
 * out wearing ClearOS's orange, and adding or reordering a single app
 * reshuffled the whole platform's identity.
 *
 * Slots are declared instead, grouped so apps that share a colour share it on
 * purpose: clearance together, warehouse together, platform tooling together.
 * A new app must pick a slot, which is the point — it is a design decision,
 * not an accident of where it landed in a list.
 */
export const APP_PALETTE_SLOT: Record<AppId, number> = {
  // Internal tooling — takes the neutral slot so a tenant's brand preset does
  // not recolour a developer tool.
  lens: 0,
  // 0 — clearance & customs
  clearos: 0, cargotracker: 0, demurrage: 0,
  // 1 — finance & commerce
  finops: 1, store: 1,
  // 2 — compliance & legal
  complyos: 2,
  // 3 — warehouse & stock
  seal: 3, inventory: 3,
  // 4 — people
  nexushr: 4,
  // 5 — fleet & freight
  tracking: 5,
  // 6 — support, comms & relationships
  bliss: 6, email: 6, crm: 6, contacts: 6,
  // 7 — platform, identity & tooling
  admin: 7, oneid: 7, onesite: 7, workspace: 7,
  studio: 7, ai: 7, calendar: 7, tasks: 7, cloud: 7,
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
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  );

  useEffect(() => {
    const handler = () => setDsRev(r => r + 1);
    window.addEventListener('hudumika-ds-updated', handler);
    return () => window.removeEventListener('hudumika-ds-updated', handler);
  }, []);

  // Per-app accent colors (APP_COLORS/BrandingView) are picked for light-mode
  // contrast and can go nearly invisible as text/highlight on a dark sidebar —
  // same reason applyDesignTokens() lightens the platform-wide brand.primary
  // for [data-theme="dark"] instead of reusing the light-mode hex as-is.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const effectiveColor = isDark ? lightenHex(appColor, 0.45) : appColor;
    const [r, g, b] = parseHex(effectiveColor);

    /**
     * The shadcn tokens have to move with the app too.
     *
     * Only --teal* was scoped here, while --primary/--ring/--sidebar-primary
     * stayed global, set once from the tenant's brand colour. Every ui/Button
     * uses bg-primary, so every primary button in every app rendered the
     * tenant orange no matter what colour the app was assigned — an orange
     * Save button in Admin, orange buttons in SEAL, while the page title
     * beside them correctly showed the app's own colour because titles read
     * --teal. Two colours from the same source, disagreeing on one screen.
     *
     * The contrast floor applies here for the same reason it does globally:
     * this is a button surface with a label on it, and a tenant may pick any
     * colour at all.
     */
    const surface = enforceContrastFloor(effectiveColor);
    const primaryHsl = hexToHslTriplet(surface.hex);
    const fgHsl = pickForegroundHsl(surface.hex);

    const vars: Record<string, string> = {
      '--teal': effectiveColor,
      '--teal-l': `rgba(${r},${g},${b},0.1)`,
      '--teal-m': `rgba(${r},${g},${b},0.18)`,
      '--teal-d': darkenHex(effectiveColor),

      /**
       * The accent as a *background fill*, which is not the same token as the
       * accent as text.
       *
       * --teal is lightened by 45% in dark mode so a heading or a link stays
       * readable on a dark page. Fill a large surface with it and you get the
       * opposite of what dark mode is for: ClearOS's #ea580c became a pale
       * #f3a379 and the shipment hero band glowed. --teal-d does not rescue
       * it either — it darkens the *already lightened* colour, landing on a
       * desaturated brown rather than a deep orange.
       *
       * So this one moves the other way: the true brand colour in light, and
       * the same brand colour taken *down* in dark. It stays per-app and
       * per-tenant like the rest, and it is the token to reach for on any
       * large accent-coloured surface.
       */
      '--teal-fill': isDark ? darkenHex(appColor, 0.45) : appColor,

      '--primary': primaryHsl,
      '--primary-foreground': fgHsl,
      '--ring': primaryHsl,
      '--sidebar-primary': primaryHsl,
      '--sidebar-primary-foreground': fgHsl,
      '--sidebar-ring': primaryHsl,

      /**
       * --accent-foreground is the *highlighted row* colour, and it was the
       * last one still global. useDesignSystem sets it from the tenant brand
       * on :root; nothing scoped it per app. Twelve ui/ components style their
       * hover/selected state with `focus:text-accent-foreground` — Select,
       * DropdownMenu, ContextMenu, Menubar, Command, Accordion, Toggle,
       * filter-dropdown and the rest — so the selected row of every menu in
       * every app painted the tenant's orange. In FinOps that put an #ea580c
       * "10 per page" inside a menu opened from a #0284c7 page.
       */
      '--accent-foreground': primaryHsl,

      // Tailwind v4 resolves its @theme variables where they are declared, so
      // `--color-primary: hsl(var(--primary))` captured the value of --primary
      // at :root and never re-reads it. Overriding --primary on a descendant is
      // therefore invisible to `bg-primary`, which is why the button here saw
      // the app's indigo in --primary and still painted the tenant's orange.
      '--color-primary': `hsl(${primaryHsl})`,
      '--color-primary-foreground': `hsl(${fgHsl})`,
      '--color-ring': `hsl(${primaryHsl})`,
      '--color-accent-foreground': `hsl(${primaryHsl})`,
    };

    /**
     * Both the wrapper and the document root get these.
     *
     * Every Radix overlay — Select, DropdownMenu, Popover, ContextMenu,
     * Tooltip, HoverCard, Menubar — renders through a portal attached to
     * document.body, which is *outside* this wrapper. A variable set only
     * here is invisible to all of them, so inside SEAL the page read
     * --teal: #059669 while every dropdown it opened read #ea580c and
     * painted the tenant's orange. Menus disagreed with the page that
     * opened them, in every app.
     *
     * Setting them on :root as well is safe because exactly one WorkspaceApp
     * is mounted at a time; the cleanup below hands the root back to the
     * tenant brand when you leave an app for the login or marketing screens.
     */
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) {
      el.style.setProperty(k, v);
      root.style.setProperty(k, v);
    }
    return () => {
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
    };
  }, [appColor, appId, dsRev, isDark]);

  const body = (
    <ActiveAppContext.Provider value={appId}>
      <MobileNavContext.Provider value={{ mobileOpen, setMobileOpen }}>
        <div ref={wrapperRef} className="app-color-scope">
          <React.Suspense fallback={<SkeletonPage />}>
            {children}
          </React.Suspense>
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
