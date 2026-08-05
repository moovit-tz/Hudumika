import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { parseHex, lightenHex, tintRgba, hexToHslTriplet, pickForegroundHsl, enforceContrastFloor } from '../lib/color.js';
import { themeFromSourceColor, argbFromHex, hexFromArgb } from '@material/material-color-utilities';

// ── Types ─────────────────────────────────────────────────────────────────────
//
// Every field here maps 1:1 onto a real CSS custom property already consumed
// across the app's hand-authored CSS (index.css + every page/component
// stylesheet) — not a parallel/unused variable namespace. See
// applyDesignTokens() below for the exact mapping.

export type FontId    = 'system' | 'inter' | 'plus-jakarta' | 'dm-sans' | 'roboto' | 'atlassian-sans';
export type DensityId = 'compact' | 'default' | 'comfortable';
export type ShadowId  = 'flat' | 'subtle' | 'default' | 'elevated'
  | 'halo' | 'hairline' | 'outline' | 'ring' | 'raised' | 'overlay'
  | 'stripe' | 'lifted' | 'layered'
  | 'material' | 'tailwind' | 'github' | 'soft' | 'ambient' | 'deep';

export interface NeutralSet {
  ink: string; ink2: string; ink3: string;
  bg: string; white: string;
  border: string; border2: string;
}

export interface SemanticSet {
  gold: string; red: string; green: string; blue: string; purple: string;
  navy: string; navy2: string;
}

export interface TypeScale {
  xs: number; sm: number; base: number; md: number; lg: number; xl: number; xxl: number; xxxl: number;
}

export interface ShapeTokens {
  rSm: number; r: number; rLg: number; badgeRadius: number;
  /** Border width (px) for the design system's core primitives — inputs,
   *  buttons, cards. Was a hardcoded `1px` literal scattered across index.css
   *  and the ui/ component library until this token existed. */
  borderWidth: number;
  /** Default stroke weight for every <Icon> that doesn't request its own
   *  (see Icon.tsx) — icons that explicitly ask for a bolder/thinner weight
   *  (e.g. an active nav icon at 2.5) are untouched by this. */
  iconStrokeWidth: number;
  /** Font size (px) of breadcrumb trails rendered by PageHeader. */
  breadcrumbSize: number;
}

/** How every Tabs component on the platform looks. Was three hardcoded
 *  Tailwind class strings inside ui/tabs.tsx, unreachable from the design
 *  system — so a tenant could restyle buttons, cards and badges but not tabs. */
export interface TabsTokens {
  /** underline = rule beneath the active tab; pill = filled active tab on a
   *  tinted track; segmented = bordered track with a raised active tab. */
  variant: 'underline' | 'pill' | 'segmented';
  radius: number;
  height: number;
  size: number;
}

export interface DesignTokens {
  brand: { primary: string };
  neutral: { light: NeutralSet; dark: NeutralSet };
  semantic: { light: SemanticSet; dark: SemanticSet };
  typography: { font: FontId; scale: TypeScale };
  shape: ShapeTokens;
  tabs: TabsTokens;
  elevation: ShadowId;
  density: DensityId;
  motion: { durFast: number; dur: number; durSlow: number; ease: string };
  /** The single mobile/desktop breakpoint every one of the 42+ call sites of
   *  useIsMobile() (and the 28 raw @media rules in index.css) reads from —
   *  previously hardcoded to 767px inside the hook itself, unreachable from
   *  the design system entirely. */
  responsive: { breakpoint: number };
}

// ── ID arrays for iteration ───────────────────────────────────────────────────

export const FONT_IDS:    FontId[]    = ['system', 'inter', 'plus-jakarta', 'dm-sans', 'roboto', 'atlassian-sans'];
export const DENSITY_IDS: DensityId[] = ['compact', 'default', 'comfortable'];
export const SHADOW_IDS:  ShadowId[]  = [
  // roughly ordered flat -> deep, so the picker reads as a scale
  'flat', 'outline', 'hairline', 'subtle', 'github', 'ring',
  'tailwind', 'default', 'raised', 'stripe', 'halo', 'soft',
  'material', 'elevated', 'lifted', 'overlay', 'ambient', 'layered', 'deep',
];

// ── Label maps ────────────────────────────────────────────────────────────────

export const FONT_LABELS: Record<FontId, string> = {
  'system':         'System',
  'inter':          'Inter',
  'plus-jakarta':   'Jakarta',
  'dm-sans':        'DM Sans',
  'roboto':         'Roboto',
  'atlassian-sans': 'Atlassian Sans',
};

export const FONT_STACKS: Record<FontId, string> = {
  'system':         "system-ui, sans-serif",
  'inter':          "'Inter', system-ui, sans-serif",
  'plus-jakarta':   "'Plus Jakarta Sans', system-ui, sans-serif",
  'dm-sans':        "'DM Sans', system-ui, sans-serif",
  'roboto':         "'Roboto', system-ui, sans-serif",
  'atlassian-sans': "'Atlassian Sans', system-ui, sans-serif",
};

// Local fonts (system, atlassian-sans) are already @font-face'd in index.css —
// nothing to fetch. Only CDN fonts need a stylesheet link injected.
export const FONT_URLS: Partial<Record<FontId, string>> = {
  'inter':        'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
  'plus-jakarta': 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap',
  'dm-sans':      'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap',
  'roboto':       'https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap',
};

export const DENSITY_LABELS: Record<DensityId, string> = {
  compact: 'Compact', default: 'Default', comfortable: 'Comfortable',
};

export const SHADOW_LABELS: Record<ShadowId, string> = {
  flat: 'Flat', subtle: 'Subtle', default: 'Default', elevated: 'Elevated',
  hairline: 'Hairline', outline: 'Outline', ring: 'Ring', halo: 'Halo',
  raised: 'Raised', stripe: 'Stripe', lifted: 'Lifted', overlay: 'Overlay',
  layered: 'Layered',
  material: 'Material', tailwind: 'Tailwind', github: 'GitHub',
  soft: 'Soft', ambient: 'Ambient', deep: 'Deep',
};

// ── Presets ───────────────────────────────────────────────────────────────────
// 'default' in each preset table matches today's static index.css values
// exactly, so leaving everything at defaults is a visual no-op.

interface DensityPreset { pagePadding: number; contentGap: number; btnPy: number; inputPy: number; cellPy: number }
/**
 * btnPy is the vertical padding of the *default* control, so it sets the
 * standard control height: roughly `2*btnPy + line-height + 2px border`.
 *
 * These were 7/10/13, which put the default button at 36/42/48px while
 * `.btn-sm` — used 265 times across the app against `.btn-md`'s 4 — sat at
 * 36px throughout. The app's real visual norm was the *small* size, so every
 * ui/Button and every `.btn-md` towered a full 12px over the buttons beside
 * it, and the effect grew with density. The ladder now lands the default on
 * 36-40px, which is where the app already draws almost every button, and sm
 * stays at exactly its current height so those 265 call sites do not move.
 *
 * inputPy tracks btnPy rather than running 1-4px ahead of it, so an input and
 * a button on the same toolbar row are the same height.
 */
export const DENSITY_PRESETS: Record<DensityId, DensityPreset> = {
  compact:     { pagePadding: 16, contentGap: 10, btnPy: 5, inputPy: 5, cellPy: 7  },
  default:     { pagePadding: 24, contentGap: 16, btnPy: 7, inputPy: 7, cellPy: 11 },
  comfortable: { pagePadding: 32, contentGap: 22, btnPy: 9, inputPy: 9, cellPy: 14 },
};

// Two-layer shadows (tight contact shadow + wide soft ambient one) — cards
// read as "floating" rather than boxed, borrowed from the Metronic/premium-
// admin-template look. 'default' is kept byte-for-byte in sync with
// index.css's static --shadow-sm/--shadow/--shadow-lg (see the comment
// there) since DesignSystemProvider — mounted at the app root, so this
// applies to every page, not just /admin/design-system — injects these
// live and they're meant to be a no-op vs. the static CSS at defaults.
interface ShadowTriad { sm: string; base: string; lg: string }
interface ShadowPreset { light: ShadowTriad; dark: ShadowTriad }
export const SHADOW_PRESETS: Record<ShadowId, ShadowPreset> = {
  /**
   * Flat surfaces, but overlays keep an edge.
   *
   * sm and base are what cards, buttons and inline panels read, so those go
   * to nothing — that is the point of the preset. `lg` is what dropdowns,
   * popovers and modals read, and a floating layer with neither shadow nor
   * border is genuinely unreadable against the page behind it. It gets a
   * hairline ring instead: no lift, still a boundary.
   */
  flat: {
    light: { sm: 'none', base: 'none', lg: 'rgba(0,0,0,0.08) 0px 0px 0px 1px' },
    dark:  { sm: 'none', base: 'none', lg: 'rgba(255,255,255,0.12) 0px 0px 0px 1px' },
  },
  subtle: {
    light: { sm: '0 1px 2px rgba(13,17,23,0.03)', base: '0 1px 2px rgba(13,17,23,0.04), 0 4px 12px rgba(13,17,23,0.04)', lg: '0 2px 4px rgba(13,17,23,0.05), 0 10px 24px rgba(13,17,23,0.06)' },
    dark:  { sm: '0 1px 3px rgba(0,0,0,0.4)', base: '0 1px 3px rgba(0,0,0,0.4), 0 6px 18px rgba(0,0,0,0.4)', lg: '0 4px 8px rgba(0,0,0,0.5), 0 16px 36px rgba(0,0,0,0.5)' },
  },
  default: {
    light: { sm: '0 1px 2px rgba(13,17,23,0.04), 0 1px 3px rgba(13,17,23,0.03)', base: '0 1px 3px rgba(13,17,23,0.06), 0 8px 24px rgba(13,17,23,0.06)', lg: '0 4px 8px rgba(13,17,23,0.08), 0 16px 40px rgba(13,17,23,0.10)' },
    dark:  { sm: '0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)', base: '0 2px 4px rgba(0,0,0,0.6), 0 12px 32px rgba(0,0,0,0.5)', lg: '0 8px 16px rgba(0,0,0,0.7), 0 24px 56px rgba(0,0,0,0.65)' },
  },
  elevated: {
    light: { sm: '0 2px 4px rgba(13,17,23,0.06)', base: '0 4px 8px rgba(13,17,23,0.10), 0 12px 32px rgba(13,17,23,0.10)', lg: '0 8px 16px rgba(13,17,23,0.14), 0 24px 56px rgba(13,17,23,0.16)' },
    dark:  { sm: '0 2px 8px rgba(0,0,0,0.55)', base: '0 4px 10px rgba(0,0,0,0.6), 0 16px 40px rgba(0,0,0,0.6)', lg: '0 12px 24px rgba(0,0,0,0.75), 0 32px 72px rgba(0,0,0,0.8)' },
  },

  /* ── Supplied presets ──────────────────────────────────────────────────
     Each was given as a single box-shadow; the system needs an sm/base/lg
     triad, so the supplied value is the `base` and sm/lg are tightened and
     opened-up versions of the *same* recipe rather than a different look at
     another size. Dark variants raise the alpha, because these are all tuned
     for a light surface and a 0.05-alpha shadow is invisible on a dark one. */

  // Flat 1px ring, no depth at all. Reads as a border you did not have to
  // reserve layout space for.
  outline: {
    light: { sm: 'rgba(0,0,0,0.04) 0px 0px 0px 1px', base: 'rgba(0,0,0,0.05) 0px 0px 0px 1px', lg: 'rgba(0,0,0,0.08) 0px 0px 0px 1px' },
    dark:  { sm: 'rgba(255,255,255,0.06) 0px 0px 0px 1px', base: 'rgba(255,255,255,0.09) 0px 0px 0px 1px', lg: 'rgba(255,255,255,0.13) 0px 0px 0px 1px' },
  },
  // The smallest possible lift — one soft 2px drop.
  hairline: {
    light: { sm: 'rgba(0,0,0,0.06) 0px 1px 1px 0px', base: 'rgba(0,0,0,0.1) 0px 1px 2px 0px', lg: 'rgba(0,0,0,0.12) 0px 2px 6px 0px' },
    dark:  { sm: 'rgba(0,0,0,0.4) 0px 1px 1px 0px', base: 'rgba(0,0,0,0.5) 0px 1px 2px 0px', lg: 'rgba(0,0,0,0.6) 0px 2px 6px 0px' },
  },
  // Outer ring plus an inner one, so the edge reads crisp from both sides.
  ring: {
    light: { sm: 'rgba(0,0,0,0.05) 0px 0px 0px 1px', base: 'rgba(0,0,0,0.05) 0px 0px 0px 1px, rgb(209,213,219) 0px 0px 0px 1px inset', lg: 'rgba(0,0,0,0.05) 0px 0px 0px 1px, rgb(209,213,219) 0px 0px 0px 1px inset, rgba(0,0,0,0.06) 0px 4px 12px 0px' },
    dark:  { sm: 'rgba(255,255,255,0.08) 0px 0px 0px 1px', base: 'rgba(255,255,255,0.08) 0px 0px 0px 1px, rgba(255,255,255,0.06) 0px 0px 0px 1px inset', lg: 'rgba(255,255,255,0.08) 0px 0px 0px 1px, rgba(255,255,255,0.06) 0px 0px 0px 1px inset, rgba(0,0,0,0.5) 0px 4px 12px 0px' },
  },
  // Even glow on all sides rather than a downward drop — no light direction.
  halo: {
    light: { sm: 'rgba(0,0,0,0.08) 0px 0px 3px 0px, rgba(0,0,0,0.08) 0px 0px 1px 0px', base: 'rgba(0,0,0,0.1) 0px 0px 5px 0px, rgba(0,0,0,0.1) 0px 0px 1px 0px', lg: 'rgba(0,0,0,0.12) 0px 0px 12px 0px, rgba(0,0,0,0.1) 0px 0px 1px 0px' },
    dark:  { sm: 'rgba(0,0,0,0.45) 0px 0px 3px 0px, rgba(0,0,0,0.45) 0px 0px 1px 0px', base: 'rgba(0,0,0,0.55) 0px 0px 6px 0px, rgba(0,0,0,0.5) 0px 0px 1px 0px', lg: 'rgba(0,0,0,0.65) 0px 0px 14px 0px, rgba(0,0,0,0.5) 0px 0px 1px 0px' },
  },
  // Atlassian's raised surface: a tight contact shadow with a faint spread ring.
  raised: {
    light: { sm: 'rgba(9,30,66,0.2) 0px 1px 1px 0px, rgba(9,30,66,0.1) 0px 0px 1px 0px', base: 'rgba(9,30,66,0.25) 0px 1px 1px 0px, rgba(9,30,66,0.13) 0px 0px 1px 1px', lg: 'rgba(9,30,66,0.25) 0px 4px 8px -2px, rgba(9,30,66,0.13) 0px 0px 1px 1px' },
    dark:  { sm: 'rgba(0,0,0,0.45) 0px 1px 1px 0px, rgba(0,0,0,0.3) 0px 0px 1px 0px', base: 'rgba(0,0,0,0.55) 0px 1px 1px 0px, rgba(255,255,255,0.08) 0px 0px 1px 1px', lg: 'rgba(0,0,0,0.6) 0px 4px 8px -2px, rgba(255,255,255,0.08) 0px 0px 1px 1px' },
  },
  // Atlassian's overlay: a real lift plus a hairline ring to hold the edge.
  overlay: {
    light: { sm: 'rgba(9,30,66,0.2) 0px 1px 2px -1px, rgba(9,30,66,0.08) 0px 0px 0px 1px', base: 'rgba(9,30,66,0.25) 0px 4px 8px -2px, rgba(9,30,66,0.08) 0px 0px 0px 1px', lg: 'rgba(9,30,66,0.25) 0px 8px 16px -4px, rgba(9,30,66,0.08) 0px 0px 0px 1px' },
    dark:  { sm: 'rgba(0,0,0,0.5) 0px 1px 2px -1px, rgba(255,255,255,0.07) 0px 0px 0px 1px', base: 'rgba(0,0,0,0.6) 0px 4px 8px -2px, rgba(255,255,255,0.07) 0px 0px 0px 1px', lg: 'rgba(0,0,0,0.7) 0px 8px 16px -4px, rgba(255,255,255,0.07) 0px 0px 0px 1px' },
  },
  // Stripe's signature blue-tinted lift.
  stripe: {
    light: { sm: 'rgba(50,50,105,0.1) 0px 1px 2px 0px, rgba(0,0,0,0.04) 0px 1px 1px 0px', base: 'rgba(50,50,105,0.15) 0px 2px 5px 0px, rgba(0,0,0,0.05) 0px 1px 1px 0px', lg: 'rgba(50,50,105,0.2) 0px 6px 16px 0px, rgba(0,0,0,0.06) 0px 1px 2px 0px' },
    dark:  { sm: 'rgba(0,0,0,0.45) 0px 1px 2px 0px, rgba(0,0,0,0.3) 0px 1px 1px 0px', base: 'rgba(0,0,0,0.55) 0px 2px 5px 0px, rgba(0,0,0,0.35) 0px 1px 1px 0px', lg: 'rgba(0,0,0,0.65) 0px 6px 16px 0px, rgba(0,0,0,0.4) 0px 1px 2px 0px' },
  },
  // A wide, very soft lift held together by a 1px ring.
  lifted: {
    light: { sm: 'rgba(0,0,0,0.04) 0px 2px 8px 0px, rgba(0,0,0,0.06) 0px 0px 0px 1px', base: 'rgba(0,0,0,0.05) 0px 6px 24px 0px, rgba(0,0,0,0.08) 0px 0px 0px 1px', lg: 'rgba(0,0,0,0.07) 0px 12px 40px 0px, rgba(0,0,0,0.08) 0px 0px 0px 1px' },
    dark:  { sm: 'rgba(0,0,0,0.45) 0px 2px 8px 0px, rgba(255,255,255,0.06) 0px 0px 0px 1px', base: 'rgba(0,0,0,0.55) 0px 6px 24px 0px, rgba(255,255,255,0.08) 0px 0px 0px 1px', lg: 'rgba(0,0,0,0.65) 0px 12px 40px 0px, rgba(255,255,255,0.08) 0px 0px 0px 1px' },
  },
  // Seven stacked layers with widening negative spread — the smoothest
  // falloff of the set, and the most expensive to paint.
  layered: {
    light: {
      sm: 'rgba(14,63,126,0.06) 0px 0px 0px 1px, rgba(42,51,70,0.03) 0px 1px 1px -0.5px, rgba(42,51,70,0.04) 0px 2px 2px -1px',
      base: 'rgba(14,63,126,0.06) 0px 0px 0px 1px, rgba(42,51,70,0.03) 0px 1px 1px -0.5px, rgba(42,51,70,0.04) 0px 2px 2px -1px, rgba(42,51,70,0.04) 0px 3px 3px -1.5px, rgba(42,51,70,0.03) 0px 5px 5px -2.5px, rgba(42,51,70,0.03) 0px 10px 10px -5px, rgba(42,51,70,0.03) 0px 24px 24px -8px',
      lg: 'rgba(14,63,126,0.06) 0px 0px 0px 1px, rgba(42,51,70,0.03) 0px 1px 1px -0.5px, rgba(42,51,70,0.04) 0px 2px 2px -1px, rgba(42,51,70,0.04) 0px 5px 5px -2.5px, rgba(42,51,70,0.03) 0px 10px 10px -5px, rgba(42,51,70,0.03) 0px 24px 24px -8px, rgba(42,51,70,0.03) 0px 48px 48px -12px',
    },
    dark: {
      sm: 'rgba(255,255,255,0.06) 0px 0px 0px 1px, rgba(0,0,0,0.3) 0px 1px 1px -0.5px, rgba(0,0,0,0.35) 0px 2px 2px -1px',
      base: 'rgba(255,255,255,0.06) 0px 0px 0px 1px, rgba(0,0,0,0.3) 0px 1px 1px -0.5px, rgba(0,0,0,0.35) 0px 2px 2px -1px, rgba(0,0,0,0.35) 0px 3px 3px -1.5px, rgba(0,0,0,0.3) 0px 5px 5px -2.5px, rgba(0,0,0,0.3) 0px 10px 10px -5px, rgba(0,0,0,0.3) 0px 24px 24px -8px',
      lg: 'rgba(255,255,255,0.06) 0px 0px 0px 1px, rgba(0,0,0,0.35) 0px 2px 2px -1px, rgba(0,0,0,0.3) 0px 5px 5px -2.5px, rgba(0,0,0,0.3) 0px 10px 10px -5px, rgba(0,0,0,0.3) 0px 24px 24px -8px, rgba(0,0,0,0.3) 0px 48px 48px -12px',
    },
  },
  /* The two inset entries that were here — a 2px recess and a 60px "well" —
     are gone. An inset shadow makes every card, button and popover read as
     pressed *into* the page, and the well was designed for one hero panel,
     not for a table row; neither survives being chosen platform-wide. The six
     below replace them, and each is a real ladder from the same collection
     rather than one value with sm/lg invented around it. */

  // Material Design's elevation steps 1/2/3.
  material: {
    light: { sm: 'rgba(0,0,0,0.12) 0px 1px 3px, rgba(0,0,0,0.24) 0px 1px 2px', base: 'rgba(0,0,0,0.16) 0px 3px 6px, rgba(0,0,0,0.23) 0px 3px 6px', lg: 'rgba(0,0,0,0.19) 0px 10px 20px, rgba(0,0,0,0.23) 0px 6px 6px' },
    dark:  { sm: 'rgba(0,0,0,0.5) 0px 1px 3px, rgba(0,0,0,0.6) 0px 1px 2px', base: 'rgba(0,0,0,0.55) 0px 3px 6px, rgba(0,0,0,0.6) 0px 3px 6px', lg: 'rgba(0,0,0,0.6) 0px 10px 20px, rgba(0,0,0,0.65) 0px 6px 6px' },
  },
  // Tailwind's own shadow scale — shadow-sm / shadow-md / shadow-lg.
  tailwind: {
    light: { sm: 'rgba(0,0,0,0.05) 0px 1px 2px 0px', base: 'rgba(0,0,0,0.1) 0px 4px 6px -1px, rgba(0,0,0,0.06) 0px 2px 4px -1px', lg: 'rgba(0,0,0,0.1) 0px 10px 15px -3px, rgba(0,0,0,0.05) 0px 4px 6px -2px' },
    dark:  { sm: 'rgba(0,0,0,0.4) 0px 1px 2px 0px', base: 'rgba(0,0,0,0.5) 0px 4px 6px -1px, rgba(0,0,0,0.4) 0px 2px 4px -1px', lg: 'rgba(0,0,0,0.55) 0px 10px 15px -3px, rgba(0,0,0,0.4) 0px 4px 6px -2px' },
  },
  // GitHub's: a hairline ring doing the work, with the faintest drop.
  github: {
    light: { sm: 'rgba(27,31,35,0.15) 0px 0px 0px 1px', base: 'rgba(0,0,0,0.02) 0px 1px 3px 0px, rgba(27,31,35,0.15) 0px 0px 0px 1px', lg: 'rgba(0,0,0,0.06) 0px 8px 24px 0px, rgba(27,31,35,0.15) 0px 0px 0px 1px' },
    dark:  { sm: 'rgba(255,255,255,0.1) 0px 0px 0px 1px', base: 'rgba(0,0,0,0.3) 0px 1px 3px 0px, rgba(255,255,255,0.1) 0px 0px 0px 1px', lg: 'rgba(0,0,0,0.5) 0px 8px 24px 0px, rgba(255,255,255,0.1) 0px 0px 0px 1px' },
  },
  // Cool near-black at low alpha; diffuse and quiet.
  soft: {
    light: { sm: 'rgba(17,17,26,0.05) 0px 1px 0px, rgba(17,17,26,0.1) 0px 0px 8px', base: 'rgba(17,17,26,0.05) 0px 4px 16px, rgba(17,17,26,0.05) 0px 8px 32px', lg: 'rgba(17,17,26,0.1) 0px 4px 16px, rgba(17,17,26,0.1) 0px 8px 24px, rgba(17,17,26,0.1) 0px 16px 56px' },
    dark:  { sm: 'rgba(0,0,0,0.4) 0px 1px 0px, rgba(0,0,0,0.45) 0px 0px 8px', base: 'rgba(0,0,0,0.45) 0px 4px 16px, rgba(0,0,0,0.45) 0px 8px 32px', lg: 'rgba(0,0,0,0.5) 0px 4px 16px, rgba(0,0,0,0.5) 0px 8px 24px, rgba(0,0,0,0.5) 0px 16px 56px' },
  },
  // A single wide grey haze with no hard contact edge — the most-copied
  // shadow in the set.
  ambient: {
    light: { sm: 'rgba(99,99,99,0.2) 0px 2px 8px 0px', base: 'rgba(100,100,111,0.2) 0px 7px 29px 0px', lg: 'rgba(149,157,165,0.2) 0px 8px 24px, rgba(100,100,111,0.2) 0px 16px 48px 0px' },
    dark:  { sm: 'rgba(0,0,0,0.45) 0px 2px 8px 0px', base: 'rgba(0,0,0,0.55) 0px 7px 29px 0px', lg: 'rgba(0,0,0,0.6) 0px 8px 24px, rgba(0,0,0,0.55) 0px 16px 48px 0px' },
  },
  // Stripe's own three steps: blue-tinted, with negative spread so the
  // shadow stays tucked under the element.
  deep: {
    light: { sm: 'rgba(50,50,93,0.25) 0px 2px 5px -1px, rgba(0,0,0,0.3) 0px 1px 3px -1px', base: 'rgba(50,50,93,0.25) 0px 6px 12px -2px, rgba(0,0,0,0.3) 0px 3px 7px -3px', lg: 'rgba(50,50,93,0.25) 0px 13px 27px -5px, rgba(0,0,0,0.3) 0px 8px 16px -8px' },
    dark:  { sm: 'rgba(0,0,0,0.5) 0px 2px 5px -1px, rgba(0,0,0,0.55) 0px 1px 3px -1px', base: 'rgba(0,0,0,0.55) 0px 6px 12px -2px, rgba(0,0,0,0.6) 0px 3px 7px -3px', lg: 'rgba(0,0,0,0.6) 0px 13px 27px -5px, rgba(0,0,0,0.65) 0px 8px 16px -8px' },
  },
};

// ── Defaults — copied verbatim from index.css's static :root values ───────────

export const NEUTRAL_LIGHT_DEFAULT: NeutralSet = {
  ink: '#0d1117', ink2: '#57606a', ink3: '#8b949e',
  bg: '#F7F5F0', white: '#ffffff',
  border: '#e1e4e8', border2: '#c9cdd4',
};

export const NEUTRAL_DARK_DEFAULT: NeutralSet = {
  ink: '#e2e8f0', ink2: '#94a3b8', ink3: '#64748b',
  bg: '#080b10', white: '#111218',
  border: 'rgba(255,255,255,0.07)', border2: 'rgba(255,255,255,0.13)',
};

export const SEMANTIC_LIGHT_DEFAULT: SemanticSet = {
  gold: '#9a6700', red: '#cf222e', green: '#059669', blue: '#0550ae', purple: '#6e40c9',
  navy: '#0e1f3d', navy2: '#1a3260',
};

export const SEMANTIC_DARK_DEFAULT: SemanticSet = {
  gold: '#c8920a', red: '#e84040', green: '#2db858', blue: '#4a9ef5', purple: '#9b72e8',
  navy: '#d8e4f4', navy2: '#b8ccdf',
};

export const TYPE_SCALE_DEFAULT: TypeScale = {
  xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 20, xxl: 24, xxxl: 30,
};

export const SHAPE_DEFAULT: ShapeTokens = {
  rSm: 5, r: 9, rLg: 9, badgeRadius: 20,
  borderWidth: 1, iconStrokeWidth: 1.75, breadcrumbSize: 10.5,
};

export const DESIGN_TOKENS_DEFAULTS: DesignTokens = {
  brand: { primary: '#0b1e3a' },
  neutral: { light: NEUTRAL_LIGHT_DEFAULT, dark: NEUTRAL_DARK_DEFAULT },
  semantic: { light: SEMANTIC_LIGHT_DEFAULT, dark: SEMANTIC_DARK_DEFAULT },
  typography: { font: 'system', scale: TYPE_SCALE_DEFAULT },
  shape: SHAPE_DEFAULT,
  elevation: 'default',
  density: 'default',
  motion: { durFast: 80, dur: 150, durSlow: 300, ease: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  tabs: { variant: 'underline', radius: 8, height: 38, size: 13 },
  responsive: { breakpoint: 768 },
};

// ── Platform themes ────────────────────────────────────────────────────────────
// Complete, curated color bundles a SuperAdmin can switch between in one
// click instead of picking every field individually — each one sets BOTH the
// single shared brand.primary (global chrome: buttons, links, focus rings)
// AND a per-app cycling palette (branding.apps.{id}.color), applied together
// by applyPlatformTheme() in DesignSystemView.tsx. Deliberately scoped to
// brand.primary + semantic.navy/navy2 (the header/sidebar tone) — never
// neutral.*, since that's the ink/bg/border scale everything else depends on
// for readability, and a bad preset there could make text unreadable.
//
// Every entry explicitly sets semantic.{light,dark}.navy/navy2 — even the
// ones that just want the plain default — so switching themes is always a
// full, clean swap. If an entry omitted it, updateTokens()'s merge (which
// replaces "semantic.light" wholesale rather than deep-merging into it, but
// leaves it untouched entirely when partial.semantic is absent) would let a
// PREVIOUS theme's navy tone silently leak into the newly-applied one.
//
// `palette` is a small cycling set of hex values assigned in order across
// ALL_APP_IDS rather than one hand-picked value per app. The single-hue
// themes (Midnight Navy, Deep Emerald, Charcoal & Bronze, Natural White)
// use a tonal family derived from their own brand.primary so per-app colors
// stay coordinated with the platform accent instead of clashing with it.
export interface PlatformTheme {
  id: string;
  name: string;
  description: string;
  tokens: Partial<DesignTokens>;
  palette: string[];
}

export const PLATFORM_THEMES: PlatformTheme[] = [
  {
    id: 'midnight-navy',
    name: 'Midnight Navy',
    description: 'Deep navy accent — trust, authority, calm.',
    tokens: {
      brand: { primary: '#0b1e3a' },
      semantic: { light: SEMANTIC_LIGHT_DEFAULT, dark: SEMANTIC_DARK_DEFAULT },
    },
    palette: ['#0b1e3a', '#14315c', '#1d4380', '#2c5aa0', '#3f74c0', '#0f2847', '#1a3a66', '#274e85'],
  },
  {
    id: 'deep-emerald',
    name: 'Deep Emerald',
    description: 'Forest green accent — premium, organic, calm.',
    tokens: {
      brand: { primary: '#0d5c46' },
      semantic: { light: SEMANTIC_LIGHT_DEFAULT, dark: SEMANTIC_DARK_DEFAULT },
    },
    palette: ['#0d5c46', '#0f7a5c', '#129c76', '#15bf8f', '#0a4a38', '#0c6b52', '#18ab82', '#22c99a'],
  },
  {
    id: 'charcoal-bronze',
    name: 'Charcoal & Bronze',
    description: 'Muted bronze accent on a near-black header — hospitality-grade luxury.',
    tokens: {
      brand: { primary: '#a9793f' },
      semantic: {
        light: { ...SEMANTIC_LIGHT_DEFAULT, navy: '#1c1c1e', navy2: '#2a2a2d' },
        dark:  { ...SEMANTIC_DARK_DEFAULT,  navy: '#1c1c1e', navy2: '#2a2a2d' },
      },
    },
    palette: ['#a9793f', '#c08a4a', '#8a6234', '#d4a15f', '#7a5528', '#bf9354', '#946b3a', '#5c4020'],
  },
  {
    id: 'vivid',
    name: 'Vivid',
    description: 'Bold, distinct color per app.',
    tokens: {
      brand: { primary: '#ea580c' },
      semantic: { light: SEMANTIC_LIGHT_DEFAULT, dark: SEMANTIC_DARK_DEFAULT },
    },
    palette: ['#ea580c', '#0284c7', '#7c3aed', '#059669', '#db2777', '#0891b2', '#d97706', '#4f46e5'],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Cool-only family — distinct but tonally coordinated.',
    tokens: {
      brand: { primary: '#0369a1' },
      semantic: { light: SEMANTIC_LIGHT_DEFAULT, dark: SEMANTIC_DARK_DEFAULT },
    },
    palette: ['#0369a1', '#0d9488', '#2563eb', '#0891b2', '#4338ca', '#0e7490', '#1d4ed8', '#0f766e'],
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm-only family — distinct but tonally coordinated.',
    tokens: {
      brand: { primary: '#c2410c' },
      semantic: { light: SEMANTIC_LIGHT_DEFAULT, dark: SEMANTIC_DARK_DEFAULT },
    },
    palette: ['#c2410c', '#b45309', '#be123c', '#a16207', '#9a3412', '#c026d3', '#ea580c', '#92400e'],
  },
  {
    id: 'natural',
    name: 'Natural White',
    description: 'One neutral tone for every app — no distinguishing color.',
    tokens: {
      brand: { primary: '#475569' },
      semantic: { light: SEMANTIC_LIGHT_DEFAULT, dark: SEMANTIC_DARK_DEFAULT },
    },
    palette: ['#475569'],
  },
  {
    id: 'atlassian',
    name: 'Atlassian',
    description: 'Jira blue with Confluence, Trello & Bitbucket accents.',
    tokens: {
      brand: { primary: '#0052CC' },
      semantic: { light: SEMANTIC_LIGHT_DEFAULT, dark: SEMANTIC_DARK_DEFAULT },
    },
    palette: ['#0052CC', '#00B8D9', '#36B37E', '#6554C0', '#FF5630', '#FFAB00', '#2684FF', '#205081'],
  },
  {
    id: 'meta',
    name: 'Meta',
    description: 'Facebook blue through the Meta family of apps.',
    tokens: {
      brand: { primary: '#0064E0' },
      semantic: { light: SEMANTIC_LIGHT_DEFAULT, dark: SEMANTIC_DARK_DEFAULT },
    },
    palette: ['#1877F2', '#0064E0', '#00B2FF', '#C13584', '#25D366', '#833AB4', '#0081FB', '#405DE6'],
  },
  {
    id: 'google',
    name: 'Google',
    description: "Google's iconic four-color palette.",
    tokens: {
      brand: { primary: '#4285F4' },
      semantic: { light: SEMANTIC_LIGHT_DEFAULT, dark: SEMANTIC_DARK_DEFAULT },
    },
    palette: ['#4285F4', '#EA4335', '#FBBC05', '#34A853', '#1A73E8', '#188038', '#D93025', '#F9AB00'],
  },
  {
    id: 'amazon',
    name: 'Amazon',
    description: 'Amazon orange with AWS blue and Prime accents.',
    tokens: {
      brand: { primary: '#FF9900' },
      semantic: { light: SEMANTIC_LIGHT_DEFAULT, dark: SEMANTIC_DARK_DEFAULT },
    },
    palette: ['#FF9900', '#146EB4', '#232F3E', '#00A8E1', '#FF6200', '#37475A', '#E47911', '#0073BB'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: "Claude's warm terracotta and clay tones.",
    tokens: {
      brand: { primary: '#CC785C' },
      semantic: { light: SEMANTIC_LIGHT_DEFAULT, dark: SEMANTIC_DARK_DEFAULT },
    },
    palette: ['#CC785C', '#DA7756', '#BD5D3A', '#A35F3B', '#D4A27F', '#8B4513', '#C08552', '#B5651D'],
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    description: 'The four-square logo palette, Azure & Teams accents.',
    tokens: {
      brand: { primary: '#0078D4' },
      semantic: { light: SEMANTIC_LIGHT_DEFAULT, dark: SEMANTIC_DARK_DEFAULT },
    },
    palette: ['#F25022', '#7FBA00', '#00A4EF', '#FFB900', '#0078D4', '#5C2D91', '#107C10', '#2564CF'],
  },
];

// ── Storage ───────────────────────────────────────────────────────────────────

const LS_KEY = 'hudumika_design_tokens';

export function readDesignTokens(): DesignTokens {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DESIGN_TOKENS_DEFAULTS,
        ...parsed,
        neutral: { ...DESIGN_TOKENS_DEFAULTS.neutral, ...parsed.neutral },
        semantic: { ...DESIGN_TOKENS_DEFAULTS.semantic, ...parsed.semantic },
        typography: { ...DESIGN_TOKENS_DEFAULTS.typography, ...parsed.typography },
        shape: { ...DESIGN_TOKENS_DEFAULTS.shape, ...parsed.shape },
        tabs:  { ...DESIGN_TOKENS_DEFAULTS.tabs,  ...parsed.tabs },
        motion: { ...DESIGN_TOKENS_DEFAULTS.motion, ...parsed.motion },
        responsive: { ...DESIGN_TOKENS_DEFAULTS.responsive, ...parsed.responsive },
      };
    }
  } catch { /* fallthrough */ }
  return { ...DESIGN_TOKENS_DEFAULTS };
}

function saveDesignTokensLocal(tokens: DesignTokens): void {
  localStorage.setItem(LS_KEY, JSON.stringify(tokens));
  window.dispatchEvent(new CustomEvent('hudumika-ds-updated'));
}

/**
 * Saves design tokens to the backend. Throws on failure — callers must
 * handle this (e.g. show an error) rather than swallow it, since a
 * silently-failed save looks identical to a successful one until someone
 * notices stale data later (see useBranding.ts's pushBranding for the
 * same fix applied to the branding endpoint this session).
 */
export async function pushDesignTokens(tokens: Partial<DesignTokens>): Promise<void> {
  await apiFetch('/v1/platform/design-tokens', {
    method: 'PUT',
    body: JSON.stringify(tokens),
  });
}

// ── M3 seed-color generation ─────────────────────────────────────────────────
// The one concrete Material Design 3 algorithmic contribution: derive a
// cohesive neutral scale + brand color from a single seed hex, using the
// same @material/material-color-utilities engine as before — but the
// output is written into the *real* tokens (ink/bg/border/teal), not into
// unused --md-sys-color-* variables.

export function generateFromSeed(seedHex: string): Pick<DesignTokens, 'brand' | 'neutral'> {
  const theme = themeFromSourceColor(argbFromHex(seedHex));
  const light = theme.schemes.light;
  const dark = theme.schemes.dark;
  return {
    brand: { primary: seedHex },
    neutral: {
      light: {
        ink: hexFromArgb(light.onBackground),
        ink2: hexFromArgb(light.onSurfaceVariant),
        ink3: hexFromArgb(light.outline),
        bg: hexFromArgb(light.background),
        white: hexFromArgb(light.surface),
        border: hexFromArgb(light.outlineVariant),
        border2: hexFromArgb(light.outline),
      },
      dark: {
        ink: hexFromArgb(dark.onBackground),
        ink2: hexFromArgb(dark.onSurfaceVariant),
        ink3: hexFromArgb(dark.outline),
        bg: hexFromArgb(dark.background),
        white: hexFromArgb(dark.surface),
        border: hexFromArgb(dark.outlineVariant),
        border2: hexFromArgb(dark.outline),
      },
    },
  };
}

// ── CSS application ───────────────────────────────────────────────────────────
// Writes a real <style> tag (:root + [data-theme="dark"] rule blocks)
// instead of inline root.style.setProperty() — inline styles on :root have
// higher specificity than the [data-theme="dark"] selector rule and would
// permanently win regardless of theme, breaking dark mode for any token
// touched. A stylesheet rule sitting after index.css in the cascade
// preserves the existing data-theme toggle behavior exactly.

const STYLE_TAG_ID = 'hudumika-design-tokens';

function block(vars: Record<string, string | number>): string {
  return Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n');
}

export function applyDesignTokens(tokens: DesignTokens): void {
  let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement('style');
    tag.id = STYLE_TAG_ID;
    document.head.appendChild(tag);
  }

  const [tr, tg, tb] = parseHex(tokens.brand.primary);
  const shadow = SHADOW_PRESETS[tokens.elevation] ?? SHADOW_PRESETS.default;
  const density = DENSITY_PRESETS[tokens.density] ?? DENSITY_PRESETS.default;
  const scale = tokens.typography.scale;
  const shape = tokens.shape;
  const motion = tokens.motion;
  const responsive = tokens.responsive;

  // Light-mode's brand hex is often too dark to read as an accent against the
  // dark-mode background (same reason index.css's static dark block brightens
  // #0b1e3a -> #6c8ec4 by hand) — lighten it here so any custom/preset brand
  // color stays legible in dark mode instead of nearly disappearing.
  const darkTeal = lightenHex(tokens.brand.primary, 0.45);
  const [dtr, dtg, dtb] = parseHex(darkTeal);

  // Bridges the single brand hex into the shadcn/Radix HSL tokens (--primary,
  // --ring, --sidebar-primary, ...) that Button/Switch/Select/Checkbox/
  // DropdownMenu/Dialog actually read — without this, every `ui/`-based
  // component (the ones CLAUDE.md mandates for all new UI) stays pinned to
  // the static Midnight Navy default regardless of the chosen theme preset
  // or per-app color, even though the legacy --teal-driven UI updates live.
  // --primary is a button *surface* with a label on it, so it has to clear
  // WCAG AA. The tenant's colour is used as picked wherever it is only a tint
  // or an accent (--teal and friends below); the floor applies only here,
  // where text sits directly on it. Colours that already pass are untouched.
  const primarySurfaceLight = enforceContrastFloor(tokens.brand.primary);
  const primarySurfaceDark = enforceContrastFloor(darkTeal);

  const primaryHslLight = hexToHslTriplet(primarySurfaceLight.hex);
  const primaryFgLight = pickForegroundHsl(primarySurfaceLight.hex);
  const primaryHslDark = hexToHslTriplet(primarySurfaceDark.hex);
  const primaryFgDark = pickForegroundHsl(primarySurfaceDark.hex);

  const lightVars: Record<string, string | number> = {
    '--teal': tokens.brand.primary,
    '--teal-l': `rgba(${tr},${tg},${tb},0.1)`,
    '--teal-m': `rgba(${tr},${tg},${tb},0.18)`,

    '--primary': primaryHslLight,
    '--primary-foreground': primaryFgLight,
    '--ring': primaryHslLight,
    '--sidebar-primary': primaryHslLight,
    '--sidebar-primary-foreground': primaryFgLight,
    '--sidebar-ring': primaryHslLight,
    '--accent-foreground': primaryHslLight,

    '--ink': tokens.neutral.light.ink,
    '--ink2': tokens.neutral.light.ink2,
    '--ink3': tokens.neutral.light.ink3,
    '--bg': tokens.neutral.light.bg,
    '--white': tokens.neutral.light.white,
    '--border': tokens.neutral.light.border,
    '--border2': tokens.neutral.light.border2,

    '--gold': tokens.semantic.light.gold,
    '--red': tokens.semantic.light.red,
    '--green': tokens.semantic.light.green,
    '--blue': tokens.semantic.light.blue,
    '--purple': tokens.semantic.light.purple,
    '--navy': tokens.semantic.light.navy,
    '--navy2': tokens.semantic.light.navy2,
    '--gold-l': lightenHex(tokens.semantic.light.gold, 0.92),
    '--red-l': lightenHex(tokens.semantic.light.red, 0.94),
    '--green-l': lightenHex(tokens.semantic.light.green, 0.92),
    '--blue-l': lightenHex(tokens.semantic.light.blue, 0.92),
    '--purple-l': lightenHex(tokens.semantic.light.purple, 0.92),

    '--font': FONT_STACKS[tokens.typography.font],
    '--text-xs': `${scale.xs}px`, '--text-sm': `${scale.sm}px`, '--text-base': `${scale.base}px`,
    '--text-md': `${scale.md}px`, '--text-lg': `${scale.lg}px`, '--text-xl': `${scale.xl}px`,
    '--text-2xl': `${scale.xxl}px`, '--text-3xl': `${scale.xxxl}px`,

    // Tailwind's radius scale is built on --radius (see index.css's
    // --radius-lg/md/sm bridge), which was a static 0.5rem literal and so
    // ignored the design system entirely: every ui/ Button, Input and Select
    // rendered at 8px while .input-field and .btn used --r-sm. Emitting it
    // from the same token puts both families on one radius.
    '--radius': `${shape.rSm}px`,
    '--tab-radius': `${tokens.tabs.radius}px`,
    '--tab-height': `${tokens.tabs.height}px`,
    '--tab-size': `${tokens.tabs.size}px`,
    '--r-sm': `${shape.rSm}px`, '--r': `${shape.r}px`, '--r-lg': `${shape.rLg}px`, '--badge-radius': `${shape.badgeRadius}px`,
    '--border-width': `${shape.borderWidth}px`,
    '--icon-stroke-width': `${shape.iconStrokeWidth}`,
    '--breadcrumb-size': `${shape.breadcrumbSize}px`,

    '--elev-sm': shadow.light.sm, '--elev': shadow.light.base, '--elev-lg': shadow.light.lg,

    '--page-padding': `${density.pagePadding}px`, '--content-gap': `${density.contentGap}px`,
    '--ds-btn-py': `${density.btnPy}px`, '--ds-input-py': `${density.inputPy}px`, '--ds-cell-py': `${density.cellPy}px`,
    // The sm/lg button steps are computed here rather than as a calc() inside a
    // Tailwind arbitrary value. `py-[calc(var(--ds-btn-py,9px)*0.6)]` silently
    // fails to compile — the control keeps its min-h floor and the size scale
    // collapses, which looks like inconsistent buttons rather than a broken
    // class. A plain `py-[var(--ds-btn-py-sm)]` is the form already proven to
    // work, so the arithmetic belongs in JS where it is reliable.
    //
    // Proportional, not fixed offsets: a -3px/+2px step made sm, default and
    // lg converge as density rose (45/48/50 at 13px), so three deliberate
    // sizes read as one control rendered sloppily.
    //
    // xs exists because `.btn-xs` was *used* but never *defined*: with no rule
    // to match, it fell through to `.btn`'s base padding and rendered at the
    // full default height — an "extra small" button 13px taller than the
    // `.btn-sm` next to it. That is the CMS Edit/Delete row.
    '--ds-btn-py-xs': `${Math.max(2, Math.round(density.btnPy * 0.45))}px`,
    '--ds-btn-py-sm': `${Math.max(3, Math.round(density.btnPy * 0.75))}px`,
    '--ds-btn-py-lg': `${Math.round(density.btnPy * 1.45)}px`,

    /**
     * Control heights, stated rather than derived.
     *
     * A button's height was the sum of padding + font-size + line-height +
     * border, and seven button systems each picked their own three of those.
     * Unifying padding still left SEAL at 34/36 (line-height 1.2) against 40
     * elsewhere, and every borderless primary sat 2px under the bordered
     * secondary beside it -- 72 rules declare `border: none`.
     *
     * Locking min-height makes the other three properties stop mattering: a
     * button is 40px whether its border is 0 or 1px and its line-height 1.2
     * or 1.5. The +22 is the content box the padding sits around (a ~20px
     * line plus 2px of border), so the ladder still tracks the density
     * setting instead of freezing at one number.
     */
    /**
     * Badges and chips, on two deliberate steps.
     *
     * 88 chip/badge/pill rules each hardcoded their own padding and font
     * size across eight values (9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5), so a
     * status pill in a table, a filter chip in a toolbar and a count badge
     * on a nav item were all different sizes with no rule behind which.
     *
     * `sm` is the count/notification step -- the small numeric bubble that
     * sits on a nav item or a tab. Everything else is the default step.
     */
    '--badge-py': `${Math.max(1, Math.round(density.btnPy * 0.33))}px`,
    '--badge-px': '8px',
    '--badge-fs': '11px',
    '--badge-min-h': `${Math.max(1, Math.round(density.btnPy * 0.33)) * 2 + 16}px`,
    '--badge-py-sm': '1px',
    '--badge-px-sm': '6px',
    '--badge-fs-sm': '10px',
    '--badge-min-h-sm': '16px',

    '--ctl-h-xs': `${Math.max(2, Math.round(density.btnPy * 0.45)) * 2 + 22}px`,
    '--ctl-h-sm': `${Math.max(3, Math.round(density.btnPy * 0.75)) * 2 + 22}px`,
    '--ctl-h': `${density.btnPy * 2 + 22}px`,
    '--ctl-h-lg': `${Math.round(density.btnPy * 1.45) * 2 + 22}px`,

    '--dur-fast': `${motion.durFast}ms`, '--dur': `${motion.dur}ms`, '--dur-slow': `${motion.durSlow}ms`, '--ease': motion.ease,

    '--mobile-breakpoint': `${responsive.breakpoint}px`,
  };

  const darkVars: Record<string, string | number> = {
    '--teal': darkTeal,

    '--primary': primaryHslDark,
    '--primary-foreground': primaryFgDark,
    '--ring': primaryHslDark,
    '--sidebar-primary': primaryHslDark,
    '--sidebar-primary-foreground': primaryFgDark,
    '--sidebar-ring': primaryHslDark,
    '--accent-foreground': primaryHslDark,

    '--ink': tokens.neutral.dark.ink,
    '--ink2': tokens.neutral.dark.ink2,
    '--ink3': tokens.neutral.dark.ink3,
    '--bg': tokens.neutral.dark.bg,
    '--white': tokens.neutral.dark.white,
    '--border': tokens.neutral.dark.border,
    '--border2': tokens.neutral.dark.border2,

    '--gold': tokens.semantic.dark.gold,
    '--red': tokens.semantic.dark.red,
    '--green': tokens.semantic.dark.green,
    '--blue': tokens.semantic.dark.blue,
    '--purple': tokens.semantic.dark.purple,
    '--navy': tokens.semantic.dark.navy,
    '--navy2': tokens.semantic.dark.navy2,
    '--gold-l': tintRgba(tokens.semantic.dark.gold, 0.18),
    '--red-l': tintRgba(tokens.semantic.dark.red, 0.14),
    '--green-l': tintRgba(tokens.semantic.dark.green, 0.13),
    '--blue-l': tintRgba(tokens.semantic.dark.blue, 0.13),
    '--purple-l': tintRgba(tokens.semantic.dark.purple, 0.13),
    '--teal-l': `rgba(${dtr},${dtg},${dtb},0.14)`,
    '--teal-m': `rgba(${dtr},${dtg},${dtb},0.26)`,

    '--elev-sm': shadow.dark.sm, '--elev': shadow.dark.base, '--elev-lg': shadow.dark.lg,
  };

  tag.textContent = `:root {\n${block(lightVars)}\n}\n[data-theme="dark"] {\n${block(darkVars)}\n}`;

  document.documentElement.setAttribute('data-tabs', tokens.tabs.variant);

  // Font stylesheet (CDN fonts only — local fonts are already @font-face'd)
  const fontUrl = FONT_URLS[tokens.typography.font];
  if (fontUrl) {
    let link = document.getElementById('hudumika-ds-font') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = 'hudumika-ds-font';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== fontUrl) link.href = fontUrl;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDesignSystem() {
  const [tokens, setTokens] = useState<DesignTokens>(readDesignTokens);

  useEffect(() => {
    applyDesignTokens(tokens);
  }, [tokens]);

  useEffect(() => {
    const handleUpdate = () => {
      const updated = readDesignTokens();
      setTokens(updated);
      applyDesignTokens(updated);
    };
    window.addEventListener('hudumika-ds-updated', handleUpdate);
    // Cross-tab sync — same fix as useBranding.ts's native 'storage' listener.
    const storageHandler = (e: StorageEvent) => {
      if (e.key === LS_KEY) handleUpdate();
    };
    window.addEventListener('storage', storageHandler);

    apiFetch('/v1/platform/design-tokens').then((data: any) => {
      if (!data || Object.keys(data).length === 0) return;
      const merged = {
        ...DESIGN_TOKENS_DEFAULTS,
        ...data,
        neutral: { ...DESIGN_TOKENS_DEFAULTS.neutral, ...data.neutral },
        semantic: { ...DESIGN_TOKENS_DEFAULTS.semantic, ...data.semantic },
        typography: { ...DESIGN_TOKENS_DEFAULTS.typography, ...data.typography },
        shape: { ...DESIGN_TOKENS_DEFAULTS.shape, ...data.shape },
        tabs:  { ...DESIGN_TOKENS_DEFAULTS.tabs,  ...data.tabs },
        motion: { ...DESIGN_TOKENS_DEFAULTS.motion, ...data.motion },
        responsive: { ...DESIGN_TOKENS_DEFAULTS.responsive, ...data.responsive },
      };
      localStorage.setItem(LS_KEY, JSON.stringify(merged));
      setTokens(merged);
      applyDesignTokens(merged);
    }).catch(() => {});

    return () => {
      window.removeEventListener('hudumika-ds-updated', handleUpdate);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  const updateTokens = async (partial: Partial<DesignTokens>) => {
    const next: DesignTokens = {
      ...tokens,
      ...partial,
      neutral: { ...tokens.neutral, ...partial.neutral },
      semantic: { ...tokens.semantic, ...partial.semantic },
      typography: { ...tokens.typography, ...partial.typography },
      shape: { ...tokens.shape, ...partial.shape },
      tabs:  { ...tokens.tabs,  ...partial.tabs },
      motion: { ...tokens.motion, ...partial.motion },
      responsive: { ...tokens.responsive, ...partial.responsive },
    };
    setTokens(next);
    saveDesignTokensLocal(next);
    await pushDesignTokens(next);
  };

  const resetToDefaults = async () => {
    setTokens(DESIGN_TOKENS_DEFAULTS);
    saveDesignTokensLocal(DESIGN_TOKENS_DEFAULTS);
    await pushDesignTokens(DESIGN_TOKENS_DEFAULTS);
  };

  return { tokens, updateTokens, resetToDefaults };
}
