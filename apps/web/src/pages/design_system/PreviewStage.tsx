import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tip } from '@/components/ui/tooltip';
import { Icon } from '../../components/Icon.js';
import { CONFIGURABLE_APP_REGISTRY, resolveAppColorDetails } from '../../lib/appRegistry.js';
import { DENSITY_IDS, DENSITY_PRESETS, useDesignSystem, type DensityId, type DesignTokens } from '../../hooks/useDesignSystem.js';
import { darkenHex, enforceContrastFloor, focusRingHex, hexToHslTriplet, lightenHex, parseHex, pickForegroundHsl } from '../../lib/color.js';

export type PreviewViewport = 'desktop' | '768px' | '375px' | '320px';
export type PreviewStateMode =
  | 'default'
  | 'hover'
  | 'focus'
  | 'selected'
  | 'disabled'
  | 'loading'
  | 'error'
  | 'long-content';

export interface PreviewContextValue {
  appId: string;
  accentHex: string;
  theme: 'light' | 'dark';
  density: DensityId;
  viewport: PreviewViewport;
  stateMode: PreviewStateMode;
}

interface PreviewStageProps {
  title?: string;
  subtitle?: string;
  initialAppId?: string;
  accentOverride?: string;
  defaultTheme?: 'light' | 'dark';
  defaultDensity?: DensityId;
  defaultViewport?: PreviewViewport;
  availableStates?: PreviewStateMode[];
  hideAppPicker?: boolean;
  hideStatePicker?: boolean;
  controlsExtra?: React.ReactNode;
  children: (ctx: PreviewContextValue) => React.ReactNode;
}

const VIEWPORT_OPTIONS: Array<{ id: PreviewViewport; label: string; width: string }> = [
  { id: 'desktop', label: 'Desktop (Full)', width: '100%' },
  { id: '768px', label: 'Tablet (768px)', width: '768px' },
  { id: '375px', label: 'Mobile (375px)', width: '375px' },
  { id: '320px', label: 'Narrow (320px)', width: '320px' },
];

export const ALL_PREVIEW_STATES: Array<{ id: PreviewStateMode; label: string }> = [
  { id: 'default', label: 'Default' },
  { id: 'hover', label: 'Hover' },
  { id: 'focus', label: 'Focus' },
  { id: 'selected', label: 'Selected' },
  { id: 'disabled', label: 'Disabled' },
  { id: 'loading', label: 'Loading' },
  { id: 'error', label: 'Error' },
  { id: 'long-content', label: 'Long Content' },
];

/** Compute strictly scoped CSS variables for an isolated preview container so
 *  neither localStorage nor document.documentElement is mutated. */
export function buildScopedStageVars(
  accentHex: string,
  theme: 'light' | 'dark',
  density: DensityId,
  tokens?: DesignTokens,
): React.CSSProperties {
  const safeHex = /^#[0-9a-fA-F]{6}$/.test(accentHex) ? accentHex : '#1257c6';
  const isDark = theme === 'dark';
  const effectiveColor = isDark ? lightenHex(safeHex, 0.45) : safeHex;
  const [r, g, b] = parseHex(effectiveColor);
  const surface = enforceContrastFloor(effectiveColor);
  const primaryHsl = hexToHslTriplet(surface.hex);
  const fgHsl = pickForegroundHsl(surface.hex);
  const dp = DENSITY_PRESETS[density] ?? DENSITY_PRESETS.default;
  const btnMdH = Math.round(dp.btnPy * 2 + 22);
  const btnSmH = Math.max(28, btnMdH - 4);
  const btnLgH = btnMdH + 6;
  const shape = tokens?.shape;
  const tabs = tokens?.tabs;

  const vars: Record<string, string> = {
    ...(shape ? {
      '--radius': `${shape.rSm}px`,
      '--r-sm': `${shape.rSm}px`,
      '--r': `${shape.r}px`,
      '--r-lg': `${shape.rLg}px`,
      '--card-radius': `${shape.rLg}px`,
      '--badge-radius': `${shape.badgeRadius}px`,
      '--border-width': `${shape.borderWidth}px`,
      '--card-border-width': `${shape.cardBorderWidth ?? 1}px`,
    } : {}),
    ...(tabs ? {
      '--tab-radius': `${tabs.radius}px`,
      '--tab-height': `${tabs.height}px`,
      '--tab-size': `${tabs.size}px`,
    } : {}),
    '--teal': effectiveColor,
    '--teal-l': `rgba(${r},${g},${b},0.10)`,
    '--teal-m': `rgba(${r},${g},${b},0.18)`,
    '--teal-d': darkenHex(effectiveColor),
    '--teal-fill-raw': safeHex,
    '--teal-fill': isDark ? darkenHex(safeHex, 0.45) : safeHex,
    '--primary': primaryHsl,
    '--primary-foreground': fgHsl,
    '--ring': primaryHsl,
    '--sidebar-primary': primaryHsl,
    '--sidebar-primary-foreground': fgHsl,
    '--sidebar-ring': primaryHsl,
    '--accent-foreground': primaryHsl,
    '--color-primary': `hsl(${primaryHsl})`,
    '--color-primary-foreground': `hsl(${fgHsl})`,
    '--color-ring': `hsl(${primaryHsl})`,
    '--color-accent-foreground': `hsl(${primaryHsl})`,
    '--ctl-h-xs': `${Math.max(24, btnSmH - 8)}px`,
    '--ctl-h-sm': `${btnSmH}px`,
    '--ctl-h': `${btnMdH}px`,
    '--ctl-h-lg': `${btnLgH}px`,
    '--action-h': `${Math.max(44, btnLgH)}px`,
    '--ds-cell-py': `${dp.cellPy}px`,
    '--card-padding': `${dp.pagePadding + 8}px`,
    '--ds-input-py': `${dp.inputPy}px`,
  };

  if (isDark) {
    const [ar, ag, ab] = parseHex(safeHex);
    const mix = (pct: number, base: [number, number, number]) =>
      `#${base.map((bv, i) => {
        const ch = [ar, ag, ab][i];
        return Math.max(0, Math.min(255, Math.round(ch * pct + bv * (1 - pct))))
          .toString(16).padStart(2, '0');
      }).join('')}`;
    const bgHex = mix(0.04, [10, 10, 10]);
    const cardHex = mix(0.06, [16, 16, 16]);
    const accentHexDark = mix(0.09, [24, 24, 24]);
    const bgHsl = hexToHslTriplet(bgHex);
    const cardHsl = hexToHslTriplet(cardHex);
    const accentHsl = hexToHslTriplet(accentHexDark);
    const inkHsl = '210 40% 96%';
    const mutedInkHsl = '215 20% 65%';

    Object.assign(vars, {
      colorScheme: 'dark',
      '--bg': bgHex,
      '--white': cardHex,
      '--surface': cardHex,
      '--surface2': accentHexDark,
      '--surface3': bgHex,
      '--card-sunken': accentHexDark,
      '--ink': '#f1f5f9',
      '--ink2': '#cbd5e1',
      '--ink3': '#94a3b8',
      '--border': '#2b3444',
      '--border2': '#475569',
      '--card-bg': cardHex,
      '--card-border': '1px solid #2b3444',
      '--focus-ring-color': focusRingHex(surface.hex, accentHexDark),
      '--background': bgHsl,
      '--foreground': inkHsl,
      '--card': cardHex ? cardHsl : bgHsl,
      '--card-foreground': inkHsl,
      '--popover': cardHsl,
      '--popover-foreground': inkHsl,
      '--secondary': accentHsl,
      '--secondary-foreground': inkHsl,
      '--muted': accentHsl,
      '--muted-foreground': mutedInkHsl,
      '--accent': accentHsl,
      '--shadcn-border': '218 22% 22%',
      '--shadcn-input': '217 20% 35%',
      '--color-background': `hsl(${bgHsl})`,
      '--color-foreground': `hsl(${inkHsl})`,
      '--color-card': `hsl(${cardHsl})`,
      '--color-card-foreground': `hsl(${inkHsl})`,
      '--color-popover': `hsl(${cardHsl})`,
      '--color-popover-foreground': `hsl(${inkHsl})`,
      '--color-secondary': `hsl(${accentHsl})`,
      '--color-secondary-foreground': `hsl(${inkHsl})`,
      '--color-muted': `hsl(${accentHsl})`,
      '--color-muted-foreground': `hsl(${mutedInkHsl})`,
      '--color-accent': `hsl(${accentHsl})`,
      '--color-border': 'hsl(218 22% 22%)',
      '--color-input': 'hsl(217 20% 35%)',
    });
  } else {
    Object.assign(vars, {
      colorScheme: 'light',
      '--bg': '#f4f7fb',
      '--white': '#ffffff',
      '--surface': '#ffffff',
      '--surface2': '#f8fafc',
      '--surface3': '#f4f7fb',
      '--card-sunken': '#f8fafc',
      '--ink': '#0f172a',
      '--ink2': '#475569',
      '--ink3': '#64748b',
      '--border': '#d5dde8',
      '--border2': '#8998ab',
      '--card-bg': '#ffffff',
      '--card-border': '1px solid #d5dde8',
      '--focus-ring-color': focusRingHex(surface.hex, '#f4f7fb'),
      '--background': '220 15.8% 96.3%',
      '--foreground': '216 27.8% 7.1%',
      '--card': '0 0% 100%',
      '--card-foreground': '216 27.8% 7.1%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '216 27.8% 7.1%',
      '--secondary': '220 15.8% 96.3%',
      '--secondary-foreground': '216 27.8% 7.1%',
      '--muted': '220 15.8% 96.3%',
      '--muted-foreground': '211.6 9.8% 37.8%',
      '--accent': '220 15.8% 96.3%',
      '--shadcn-border': '215 31% 87%',
      '--shadcn-input': '213 18% 60%',
      '--color-background': 'hsl(220 15.8% 96.3%)',
      '--color-foreground': 'hsl(216 27.8% 7.1%)',
      '--color-card': 'hsl(0 0% 100%)',
      '--color-card-foreground': 'hsl(216 27.8% 7.1%)',
      '--color-popover': 'hsl(0 0% 100%)',
      '--color-popover-foreground': 'hsl(216 27.8% 7.1%)',
      '--color-secondary': 'hsl(220 15.8% 96.3%)',
      '--color-secondary-foreground': 'hsl(216 27.8% 7.1%)',
      '--color-muted': 'hsl(220 15.8% 96.3%)',
      '--color-muted-foreground': 'hsl(211.6 9.8% 37.8%)',
      '--color-accent': 'hsl(220 15.8% 96.3%)',
      '--color-border': 'hsl(215 31% 87%)',
      '--color-input': 'hsl(213 18% 60%)',
    });
  }

  return vars as React.CSSProperties;
}

export function PreviewStage({
  title,
  subtitle,
  initialAppId = 'finops',
  accentOverride,
  defaultTheme = 'light',
  defaultDensity = 'default',
  defaultViewport = 'desktop',
  availableStates = ['default', 'hover', 'focus', 'selected', 'disabled', 'loading', 'error', 'long-content'],
  hideAppPicker = false,
  hideStatePicker = false,
  controlsExtra,
  children,
}: PreviewStageProps) {
  const { tokens } = useDesignSystem();
  const [appId, setAppId] = useState(initialAppId);
  const [theme, setTheme] = useState<'light' | 'dark'>(defaultTheme);
  const [density, setDensity] = useState<DensityId>(defaultDensity);
  const [viewport, setViewport] = useState<PreviewViewport>(defaultViewport);
  const [stateMode, setStateMode] = useState<PreviewStateMode>(availableStates[0] ?? 'default');

  const resolvedAccent = useMemo(() => {
    if (accentOverride) return accentOverride;
    return resolveAppColorDetails(appId).effective;
  }, [accentOverride, appId]);

  const scopedStyle = useMemo(
    () => buildScopedStageVars(resolvedAccent, theme, density, tokens),
    [resolvedAccent, theme, density, tokens],
  );

  const widthValue = VIEWPORT_OPTIONS.find(v => v.id === viewport)?.width ?? '100%';

  return (
    <div className="dsa-stage-shell">
      {(title || subtitle) && (
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div>
            {title && <div className="text-sm font-bold text-foreground">{title}</div>}
            {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
          </div>
          <Tip label={`Resolved scoped accent color for stage preview (${resolvedAccent})`}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="dsa-swatch-chip" style={{ background: resolvedAccent }} aria-hidden="true" />
              <span className="font-mono">{resolvedAccent}</span>
            </div>
          </Tip>
        </div>
      )}

      <div className="dsa-stage-controls">
        {!hideAppPicker && (
          <div className="dsa-stage-control-group">
            <span className="dsa-stage-label">App</span>
            <Tip label="Switch which registered Hudumika app accent scopes this stage">
              <div>
                <Select value={appId} onValueChange={setAppId}>
                  <SelectTrigger className="min-h-(--ctl-h-sm) h-(--ctl-h-sm) w-[145px] text-xs bg-background" aria-label="Preview app">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONFIGURABLE_APP_REGISTRY.map(app => (
                      <SelectItem key={app.id} value={app.id} className="text-xs">
                        {app.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Tip>
          </div>
        )}

        <div className="dsa-stage-control-group">
          <span className="dsa-stage-label">Theme</span>
          <div className="inline-flex rounded-[var(--r-sm)] border-[length:var(--border-width,1px)] border-border bg-background p-0.5 gap-0.5">
            <Tip label="Preview stage on light neutral surfaces (--bg / --white)">
              <Button
                type="button"
                size="xs"
                variant={theme === 'light' ? 'default' : 'ghost'}
                className="min-h-[28px] px-2.5 text-xs"
                onClick={() => setTheme('light')}
              >
                <Icon name="sun" size={12} />
                Light
              </Button>
            </Tip>
            <Tip label="Preview stage on dark surfaces with automatic 45% accent lightening">
              <Button
                type="button"
                size="xs"
                variant={theme === 'dark' ? 'default' : 'ghost'}
                className="min-h-[28px] px-2.5 text-xs"
                onClick={() => setTheme('dark')}
              >
                <Icon name="moon" size={12} />
                Dark
              </Button>
            </Tip>
          </div>
        </div>

        <div className="dsa-stage-control-group">
          <span className="dsa-stage-label">Density</span>
          <Tip label="Simulate Compact, Default, or Comfortable spacing & control heights inside this stage">
            <div>
              <Select value={density} onValueChange={v => setDensity(v as DensityId)}>
                <SelectTrigger className="min-h-(--ctl-h-sm) h-(--ctl-h-sm) w-[125px] text-xs bg-background" aria-label="Preview density">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DENSITY_IDS.map(d => (
                    <SelectItem key={d} value={d} className="text-xs capitalize">
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Tip>
        </div>

        <div className="dsa-stage-control-group">
          <span className="dsa-stage-label">Viewport</span>
          <Tip label="Constrain stage width to test 1440px, 768px tablet, 375px mobile, or 320px narrow reflow">
            <div>
              <Select value={viewport} onValueChange={v => setViewport(v as PreviewViewport)}>
                <SelectTrigger className="min-h-(--ctl-h-sm) h-(--ctl-h-sm) w-[135px] text-xs bg-background" aria-label="Preview viewport">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIEWPORT_OPTIONS.map(v => (
                    <SelectItem key={v.id} value={v.id} className="text-xs">
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Tip>
        </div>

        {!hideStatePicker && availableStates.length > 1 && (
          <div className="dsa-stage-control-group">
            <span className="dsa-stage-label">State</span>
            <Tip label="Inspect hover, focus ring, selected, disabled, loading, error, or long-content overflow states">
              <div>
                <Select value={stateMode} onValueChange={v => setStateMode(v as PreviewStateMode)}>
                  <SelectTrigger className="min-h-(--ctl-h-sm) h-(--ctl-h-sm) w-[125px] text-xs bg-background" aria-label="Preview state">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_PREVIEW_STATES.filter(s => availableStates.includes(s.id)).map(s => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Tip>
          </div>
        )}

        {controlsExtra}
      </div>

      <div className="dsa-stage-viewport-wrap">
        <div
          className="dsa-stage-viewport"
          data-theme={theme}
          data-preview-state={stateMode}
          data-preview-density={density}
          style={{ ...scopedStyle, width: widthValue }}
        >
          {children({
            appId: accentOverride ? initialAppId : appId,
            accentHex: resolvedAccent,
            theme,
            density,
            viewport,
            stateMode,
          })}
        </div>
      </div>
    </div>
  );
}
