import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { parseHex, lightenHex, tintRgba } from '../lib/color.js';
import { themeFromSourceColor, argbFromHex, hexFromArgb } from '@material/material-color-utilities';

// ── Types ─────────────────────────────────────────────────────────────────────
//
// Every field here maps 1:1 onto a real CSS custom property already consumed
// across the app's hand-authored CSS (index.css + every page/component
// stylesheet) — not a parallel/unused variable namespace. See
// applyDesignTokens() below for the exact mapping.

export type FontId    = 'system' | 'inter' | 'plus-jakarta' | 'dm-sans' | 'roboto' | 'atlassian-sans';
export type DensityId = 'compact' | 'default' | 'comfortable';
export type ShadowId  = 'flat' | 'subtle' | 'default' | 'elevated';

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
}

export interface DesignTokens {
  brand: { primary: string };
  neutral: { light: NeutralSet; dark: NeutralSet };
  semantic: { light: SemanticSet; dark: SemanticSet };
  typography: { font: FontId; scale: TypeScale };
  shape: ShapeTokens;
  elevation: ShadowId;
  density: DensityId;
  motion: { durFast: number; dur: number; durSlow: number; ease: string };
}

// ── ID arrays for iteration ───────────────────────────────────────────────────

export const FONT_IDS:    FontId[]    = ['system', 'inter', 'plus-jakarta', 'dm-sans', 'roboto', 'atlassian-sans'];
export const DENSITY_IDS: DensityId[] = ['compact', 'default', 'comfortable'];
export const SHADOW_IDS:  ShadowId[]  = ['flat', 'subtle', 'default', 'elevated'];

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
};

// ── Presets ───────────────────────────────────────────────────────────────────
// 'default' in each preset table matches today's static index.css values
// exactly, so leaving everything at defaults is a visual no-op.

interface DensityPreset { pagePadding: number; contentGap: number; btnPy: number; inputPy: number; cellPy: number }
export const DENSITY_PRESETS: Record<DensityId, DensityPreset> = {
  compact:     { pagePadding: 16, contentGap: 10, btnPy: 5,  inputPy: 6,  cellPy: 7  },
  default:     { pagePadding: 24, contentGap: 16, btnPy: 7,  inputPy: 8,  cellPy: 11 },
  comfortable: { pagePadding: 32, contentGap: 22, btnPy: 10, inputPy: 11, cellPy: 14 },
};

interface ShadowTriad { sm: string; base: string; lg: string }
interface ShadowPreset { light: ShadowTriad; dark: ShadowTriad }
export const SHADOW_PRESETS: Record<ShadowId, ShadowPreset> = {
  flat: {
    light: { sm: 'none', base: 'none', lg: 'none' },
    dark:  { sm: 'none', base: 'none', lg: 'none' },
  },
  subtle: {
    light: { sm: '0 1px 2px rgba(0,0,0,0.03)', base: '0 1px 4px rgba(0,0,0,0.05)', lg: '0 4px 12px rgba(0,0,0,0.06)' },
    dark:  { sm: '0 1px 3px rgba(0,0,0,0.4)',  base: '0 2px 10px rgba(0,0,0,0.5)', lg: '0 8px 26px rgba(0,0,0,0.6)' },
  },
  default: {
    light: { sm: '0 1px 2px rgba(0,0,0,0.04)', base: '0 2px 8px rgba(0,0,0,0.07)', lg: '0 6px 20px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)' },
    dark:  { sm: '0 1px 4px rgba(0,0,0,0.5)',  base: '0 4px 16px rgba(0,0,0,0.6)', lg: '0 12px 40px rgba(0,0,0,0.72)' },
  },
  elevated: {
    light: { sm: '0 2px 6px rgba(0,0,0,0.08)', base: '0 6px 18px rgba(0,0,0,0.12)', lg: '0 14px 36px rgba(0,0,0,0.16), 0 4px 10px rgba(0,0,0,0.08)' },
    dark:  { sm: '0 2px 8px rgba(0,0,0,0.55)', base: '0 8px 24px rgba(0,0,0,0.65)', lg: '0 20px 50px rgba(0,0,0,0.8)' },
  },
};

// ── Defaults — copied verbatim from index.css's static :root values ───────────

export const NEUTRAL_LIGHT_DEFAULT: NeutralSet = {
  ink: '#0d1117', ink2: '#57606a', ink3: '#8b949e',
  bg: '#f4f5f7', white: '#ffffff',
  border: '#e1e4e8', border2: '#c9cdd4',
};

export const NEUTRAL_DARK_DEFAULT: NeutralSet = {
  ink: '#e2e8f0', ink2: '#94a3b8', ink3: '#64748b',
  bg: '#080b10', white: '#111218',
  border: 'rgba(255,255,255,0.07)', border2: 'rgba(255,255,255,0.13)',
};

export const SEMANTIC_LIGHT_DEFAULT: SemanticSet = {
  gold: '#9a6700', red: '#cf222e', green: '#1a7f37', blue: '#0550ae', purple: '#6e40c9',
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
};

export const DESIGN_TOKENS_DEFAULTS: DesignTokens = {
  brand: { primary: '#e8461a' },
  neutral: { light: NEUTRAL_LIGHT_DEFAULT, dark: NEUTRAL_DARK_DEFAULT },
  semantic: { light: SEMANTIC_LIGHT_DEFAULT, dark: SEMANTIC_DARK_DEFAULT },
  typography: { font: 'system', scale: TYPE_SCALE_DEFAULT },
  shape: SHAPE_DEFAULT,
  elevation: 'default',
  density: 'default',
  motion: { durFast: 80, dur: 150, durSlow: 300, ease: 'cubic-bezier(0.4, 0, 0.2, 1)' },
};

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
        motion: { ...DESIGN_TOKENS_DEFAULTS.motion, ...parsed.motion },
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

  const lightVars: Record<string, string | number> = {
    '--teal': tokens.brand.primary,
    '--teal-l': `rgba(${tr},${tg},${tb},0.1)`,
    '--teal-m': `rgba(${tr},${tg},${tb},0.18)`,

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

    '--r-sm': `${shape.rSm}px`, '--r': `${shape.r}px`, '--r-lg': `${shape.rLg}px`, '--badge-radius': `${shape.badgeRadius}px`,

    '--shadow-sm': shadow.light.sm, '--shadow': shadow.light.base, '--shadow-lg': shadow.light.lg,

    '--page-padding': `${density.pagePadding}px`, '--content-gap': `${density.contentGap}px`,
    '--ds-btn-py': `${density.btnPy}px`, '--ds-input-py': `${density.inputPy}px`, '--ds-cell-py': `${density.cellPy}px`,

    '--dur-fast': `${motion.durFast}ms`, '--dur': `${motion.dur}ms`, '--dur-slow': `${motion.durSlow}ms`, '--ease': motion.ease,
  };

  const darkVars: Record<string, string | number> = {
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
    '--teal-l': `rgba(${tr},${tg},${tb},0.14)`,
    '--teal-m': `rgba(${tr},${tg},${tb},0.26)`,

    '--shadow-sm': shadow.dark.sm, '--shadow': shadow.dark.base, '--shadow-lg': shadow.dark.lg,
  };

  tag.textContent = `:root {\n${block(lightVars)}\n}\n[data-theme="dark"] {\n${block(darkVars)}\n}`;

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
        motion: { ...DESIGN_TOKENS_DEFAULTS.motion, ...data.motion },
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
      motion: { ...tokens.motion, ...partial.motion },
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
