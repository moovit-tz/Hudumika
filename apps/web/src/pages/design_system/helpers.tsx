import React, { useState, useEffect } from 'react';
import { ALL_APP_IDS } from '@hudumika/types';
import { ColorSwatchPicker } from '../../components/ui/color-swatch-picker.js';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { Tip } from '../../components/ui/tooltip.js';
import { TwotoneIcon, TWOTONE_ICONS } from '../../components/ui/twotone-icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import {
  useDesignSystem, ICON_LIBRARY_IDS, ICON_LIBRARY_DESCRIPTIONS,
  PLATFORM_THEMES, generateFromSeed,
  type IconLibraryId, type DesignTokens, type DesignSystemVersion,
} from '../../hooks/useDesignSystem.js';
import { pushBranding } from '../../hooks/useBranding.js';
import { useAuth } from '../../hooks/useAuth.js';
import { APP_PALETTE_SLOT } from '../../shells/WorkspaceApp.js';
import '../DesignSystemView.css';
import { useIsPlatformSuperAdmin } from '../console/console-shared.js';

export type SidebarStyle = 'dark' | 'light' | 'system';

export function useDesignStudioController() {
  const { user } = useAuth();
  const isSuperAdmin = useIsPlatformSuperAdmin(user?.role);
  const { tokens, updateTokens, resetToDefaults, designSystemVersion, updateDesignSystemVersion } = useDesignSystem();

  const [v2ColorDraft, setV2ColorDraft] = useState(designSystemVersion.v2Color);
  useEffect(() => setV2ColorDraft(designSystemVersion.v2Color), [designSystemVersion.v2Color]);

  const [seed, setSeed] = useState(tokens.brand.primary);
  useEffect(() => setSeed(tokens.brand.primary), [tokens.brand.primary]);

  const [themeTab, setThemeTab] = useState<'light' | 'dark'>('light');
  const [motionTrigger, setMotionTrigger] = useState(0);
  const [saveErrors, setSaveErrors] = useState<Record<string, string | undefined>>({});
  const [savedNotice, setSavedNotice] = useState<{ mode: 'live' | 'preview'; text: string } | null>(null);

  const [menuDefault, setMenuDefaultState] = useState<'expanded' | 'collapsed'>(
    () => (localStorage.getItem('menu-default') === 'collapsed' ? 'collapsed' : 'expanded'),
  );
  const [contentWidth, setContentWidthState] = useState<'compact' | 'wide'>(
    () => (localStorage.getItem('layout') === 'full' ? 'wide' : 'compact'),
  );
  const [navbarType, setNavbarTypeState] = useState<'sticky' | 'static' | 'hidden'>(
    () => (localStorage.getItem('navbar-type') as 'sticky' | 'static' | 'hidden') || 'static',
  );
  const [skin, setSkinState] = useState<'default' | 'bordered'>(
    () => (localStorage.getItem('skin') === 'bordered' ? 'bordered' : 'default'),
  );
  const [sidebarStyle, setSidebarStyleState] = useState<SidebarStyle>(() => {
    const v = localStorage.getItem('sidebar-style') as SidebarStyle | null;
    if (v === 'light' || v === 'system') return v;
    if (!v && localStorage.getItem('semi-dark') === 'true') return 'dark';
    return 'dark';
  });
  const [direction, setDirectionState] = useState<'ltr' | 'rtl'>(
    () => (localStorage.getItem('direction') as 'ltr' | 'rtl') || (document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'),
  );

  function flashSaved(mode: 'live' | 'preview', text: string) {
    setSavedNotice({ mode, text });
    window.setTimeout(() => {
      setSavedNotice(cur => (cur?.text === text ? null : cur));
    }, 2200);
  }

  function applyLocalTokensOnly(partial: Partial<DesignTokens>) {
    const next: DesignTokens = {
      ...tokens,
      ...partial,
      neutral: { ...tokens.neutral, ...partial.neutral },
      semantic: { ...tokens.semantic, ...partial.semantic },
      typography: { ...tokens.typography, ...partial.typography },
      shape: { ...tokens.shape, ...partial.shape },
      tabs: { ...tokens.tabs, ...partial.tabs },
      motion: { ...tokens.motion, ...partial.motion },
      responsive: { ...tokens.responsive, ...partial.responsive },
    };
    localStorage.setItem('hudumika_design_tokens', JSON.stringify(next));
    if (next.brand?.primary) {
      localStorage.setItem('hudumika_email_accent', next.brand.primary);
    }
    window.dispatchEvent(new CustomEvent('hudumika-ds-updated'));
    window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
  }

  async function save(section: string, partial: Partial<DesignTokens>) {
    if (!isSuperAdmin) {
      applyLocalTokensOnly(partial);
      setSaveErrors(e => ({ ...e, [section]: undefined }));
      flashSaved('preview', 'Local preview applied (SuperAdmin publishes platform-wide)');
      return;
    }
    try {
      await updateTokens(partial);
      setSaveErrors(e => ({ ...e, [section]: undefined }));
      flashSaved('live', 'Changes saved live');
    } catch (err: any) {
      setSaveErrors(e => ({ ...e, [section]: err?.message || 'Failed to save configuration' }));
    }
  }

  async function handleGenerateFromSeed() {
    await save('brand', generateFromSeed(seed));
  }

  async function applyPlatformTheme(themeId: string) {
    const theme = PLATFORM_THEMES.find(t => t.id === themeId);
    if (!theme) return;
    const apps: Record<string, { color: string }> = {};
    ALL_APP_IDS.forEach((appId) => {
      const slot = APP_PALETTE_SLOT[appId] ?? 0;
      const color = theme.palette[slot % theme.palette.length];
      apps[appId] = { color };
      localStorage.setItem(`hudumika_app_color_${appId}`, color);
    });
    window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));

    if (!isSuperAdmin) {
      applyLocalTokensOnly(theme.tokens);
      if (themeId === 'dreams-core') {
        localStorage.setItem('hudumika_design_system_version', JSON.stringify({ ...designSystemVersion, version: 'v3' }));
        window.dispatchEvent(new CustomEvent('hudumika-ds-updated'));
      }
      setSaveErrors(e => ({ ...e, theme: undefined }));
      flashSaved('preview', `Previewing ${theme.name} locally`);
      return;
    }

    try {
      const promises: Promise<any>[] = [
        updateTokens(theme.tokens),
        pushBranding({ apps, accentColor: theme.tokens.brand!.primary }),
      ];
      if (themeId === 'dreams-core') {
        promises.push(updateDesignSystemVersion({ version: 'v3' }));
      }
      await Promise.all(promises);
      setSaveErrors(e => ({ ...e, theme: undefined, apps: undefined }));
      flashSaved('live', `Applied ${theme.name} platform-wide`);
    } catch (err: any) {
      setSaveErrors(e => ({ ...e, theme: err?.message || 'Failed to apply theme preset' }));
    }
  }

  async function setVersion(version: DesignSystemVersion) {
    if (!isSuperAdmin) {
      localStorage.setItem('hudumika_design_system_version', JSON.stringify({ ...designSystemVersion, version }));
      window.dispatchEvent(new CustomEvent('hudumika-ds-updated'));
      window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
      setSaveErrors(e => ({ ...e, version: undefined }));
      flashSaved('preview', `Previewing ${version} locally`);
      return;
    }
    try {
      await updateDesignSystemVersion({ version });
      setSaveErrors(e => ({ ...e, version: undefined }));
      flashSaved('live', 'Engine version saved live');
    } catch (err: any) {
      setSaveErrors(e => ({ ...e, version: err?.message || 'Failed to update engine version' }));
    }
  }

  async function commitV2Color(nextColor = v2ColorDraft) {
    if (!/^#[0-9a-f]{6}$/i.test(nextColor)) return;
    setV2ColorDraft(nextColor);
    if (!isSuperAdmin) {
      localStorage.setItem('hudumika_design_system_version', JSON.stringify({ ...designSystemVersion, v2Color: nextColor }));
      window.dispatchEvent(new CustomEvent('hudumika-ds-updated'));
      window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
      flashSaved('preview', 'Previewing Mellon accent locally');
      return;
    }
    try {
      await updateDesignSystemVersion({ v2Color: nextColor });
      setSaveErrors(e => ({ ...e, version: undefined }));
      flashSaved('live', 'Mellon brand color saved live');
    } catch (err: any) {
      setSaveErrors(e => ({ ...e, version: err?.message || 'Failed to update Mellon color' }));
    }
  }

  async function handleResetToDefaults() {
    if (!isSuperAdmin) {
      localStorage.removeItem('hudumika_design_tokens');
      localStorage.removeItem('hudumika_design_system_version');
      window.dispatchEvent(new CustomEvent('hudumika-ds-updated'));
      window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
      flashSaved('preview', 'Local token preview reset');
      return;
    }
    try {
      await resetToDefaults();
      setSaveErrors({});
      flashSaved('live', 'Platform tokens reset to defaults');
    } catch (err: any) {
      setSaveErrors(e => ({ ...e, reset: err?.message || 'Failed to reset platform tokens' }));
    }
  }

  function setMenuDefault(mode: 'expanded' | 'collapsed') {
    localStorage.setItem('menu-default', mode);
    ALL_APP_IDS.forEach(appId => localStorage.setItem(`${appId}-sidebar-collapsed`, String(mode === 'collapsed')));
    window.dispatchEvent(new CustomEvent('sidebar-toggled', { detail: { collapsed: mode === 'collapsed' } }));
    setMenuDefaultState(mode);
    flashSaved(isSuperAdmin ? 'live' : 'preview', `Sidebar default set to ${mode}`);
  }

  function setContentWidth(mode: 'compact' | 'wide') {
    localStorage.setItem('layout', mode === 'wide' ? 'full' : 'boxed');
    if (mode === 'wide') document.documentElement.setAttribute('data-layout', 'full');
    else document.documentElement.removeAttribute('data-layout');
    window.dispatchEvent(new CustomEvent('hudumika-layout-updated'));
    setContentWidthState(mode);
    flashSaved(isSuperAdmin ? 'live' : 'preview', `Content width set to ${mode}`);
  }

  function setNavbarType(type: 'sticky' | 'static' | 'hidden') {
    localStorage.setItem('navbar-type', type);
    if (type === 'static') document.documentElement.removeAttribute('data-navbar');
    else document.documentElement.setAttribute('data-navbar', type);
    setNavbarTypeState(type);
    flashSaved(isSuperAdmin ? 'live' : 'preview', `Navbar mode set to ${type}`);
  }

  function setSkin(s: 'default' | 'bordered') {
    localStorage.setItem('skin', s);
    if (s === 'bordered') document.documentElement.setAttribute('data-skin', 'bordered');
    else document.documentElement.removeAttribute('data-skin');
    setSkinState(s);
    flashSaved(isSuperAdmin ? 'live' : 'preview', `Surface skin set to ${s}`);
  }

  function setSidebarStyle(v: SidebarStyle) {
    localStorage.setItem('sidebar-style', v);
    document.documentElement.setAttribute('data-sidebar-style', v);
    localStorage.removeItem('semi-dark');
    document.documentElement.removeAttribute('data-semi-dark');
    setSidebarStyleState(v);
    flashSaved(isSuperAdmin ? 'live' : 'preview', `Sidebar style set to ${v}`);
  }

  function setDirection(dir: 'ltr' | 'rtl') {
    localStorage.setItem('direction', dir);
    document.documentElement.setAttribute('dir', dir);
    setDirectionState(dir);
    flashSaved(isSuperAdmin ? 'live' : 'preview', `Text direction set to ${dir.toUpperCase()}`);
  }

  const activeTheme = PLATFORM_THEMES.find(
    t => t.tokens.brand?.primary?.toLowerCase() === tokens.brand.primary.toLowerCase(),
  )?.id ?? null;

  return {
    isSuperAdmin,
    tokens,
    designSystemVersion,
    v2ColorDraft,
    setV2ColorDraft,
    seed,
    setSeed,
    themeTab,
    setThemeTab,
    motionTrigger,
    setMotionTrigger,
    saveErrors,
    savedNotice,
    activeTheme,
    save,
    handleGenerateFromSeed,
    applyPlatformTheme,
    setVersion,
    commitV2Color,
    handleResetToDefaults,
    menuDefault,
    setMenuDefault,
    contentWidth,
    setContentWidth,
    navbarType,
    setNavbarType,
    skin,
    setSkin,
    sidebarStyle,
    setSidebarStyle,
    direction,
    setDirection,
  };
}

export type DesignStudioController = ReturnType<typeof useDesignStudioController>;

export function DesignSystemStudioBar({ studio }: { studio: DesignStudioController }) {
  const {
    isSuperAdmin,
    tokens,
    designSystemVersion,
    activeTheme,
    save,
    applyPlatformTheme,
    setVersion,
    handleResetToDefaults,
    savedNotice,
    saveErrors,
  } = studio;
  const firstError = Object.values(saveErrors).find(Boolean);

  return (
    <div className="space-y-2">
      <div className="ds-system-bar" role="region" aria-label="Platform theme and engine studio controls">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div className="ds-global-control-group">
            <span className="ds-global-control-label">System</span>
            <div className="ds-top-switcher-pills">
              {([
                { id: 'v1', label: 'v1 Standard', tip: 'Per-app identity mode (25 unique app hues)' },
                { id: 'v2', label: 'v2 Mellon', tip: 'Mellon unified enterprise accent across all apps' },
                { id: 'v3', label: 'v3 Dreams Core', tip: 'Minimal bento cards with subtle ambient surfaces' },
              ] as const).map(ver => (
                <Tip key={ver.id} label={ver.tip}>
                  <button
                    type="button"
                    className={`ds-top-pill ${designSystemVersion.version === ver.id ? 'active' : ''}`}
                    onClick={() => setVersion(ver.id)}
                    data-ui-native-button=""
                  >
                    {ver.label}
                  </button>
                </Tip>
              ))}
            </div>
          </div>

          <div className="ds-top-switcher-divider" />

          <div className="ds-global-control-group">
            <span className="ds-global-control-label">Global theme</span>
            <Tip label="Apply a curated platform color, surface, typography, and geometry preset">
              <div>
                <Select
                  value={activeTheme || 'custom'}
                  onValueChange={(val) => {
                    if (val !== 'custom') applyPlatformTheme(val);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[175px] min-h-(--ctl-h-sm) h-(--ctl-h-sm) text-xs font-semibold bg-background" aria-label="Global theme">
                    <SelectValue placeholder="Custom Palette" />
                  </SelectTrigger>
                  <SelectContent>
                    {!activeTheme && <SelectItem value="custom" className="text-xs">Custom Palette</SelectItem>}
                    {PLATFORM_THEMES.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full border border-border inline-block flex-shrink-0" style={{ backgroundColor: t.tokens.brand?.primary }} />
                          <span>{t.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Tip>
          </div>

          <div className="ds-top-switcher-divider" />

          <div className="ds-global-control-group">
            <span className="ds-global-control-label">Icon library</span>
            <div className="ds-top-switcher-pills">
              {([
                { id: 'stroke', label: 'Stroke', tip: 'Crisp 24x24 universal fallback outline icon family' },
                { id: 'twotone', label: 'Twotone', tip: 'Dual-layer tinted icon style for dashboard & feature cards' },
                { id: 'hugeicons', label: 'Hugeicons', tip: 'Platform default proprietary Hugeicons Pro icon artwork' },
              ] as const).map((lib) => (
                <Tip key={lib.id} label={lib.tip}>
                  <button
                    type="button"
                    className={`ds-top-pill ${tokens.iconLibrary === lib.id ? 'active' : ''}`}
                    onClick={() => save('iconLibrary', { iconLibrary: lib.id })}
                    data-ui-native-button=""
                  >
                    {lib.label}
                  </button>
                </Tip>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {savedNotice ? (
            <Badge variant={savedNotice.mode === 'live' ? 'success' : 'secondary'}>
              <Icon name="check" size={11} />
              {savedNotice.text}
            </Badge>
          ) : !isSuperAdmin ? (
            <Tip label="You can test all tokens locally in this browser; SuperAdmins persist changes platform-wide">
              <Badge variant="outline">Local Preview · SuperAdmin publishes</Badge>
            </Tip>
          ) : null}
          <Tip label="Restore platform design tokens and engine version to canonical defaults">
            <Button variant="outline" size="sm" type="button" onClick={handleResetToDefaults}>
              <Icon name="refresh" size={13} />
              Reset to defaults
            </Button>
          </Tip>
        </div>
      </div>

      {firstError && (
        <p className="ds-alert-error m-0">{firstError}</p>
      )}
    </div>
  );
}

export function ThemePresetsAndEngineSection({ studio }: { studio: DesignStudioController }) {
  const {
    designSystemVersion,
    v2ColorDraft,
    commitV2Color,
    setVersion,
    activeTheme,
    applyPlatformTheme,
    saveErrors,
  } = studio;

  return (
    <div className="space-y-4">
      <div className="ds-engine-card">
        <div className="ds-engine-header">
          <div className="ds-engine-title-wrap">
            <span className="ds-engine-badge">ENGINE MODE</span>
            <h4 className="ds-engine-title">Design System Architecture Version</h4>
          </div>
        </div>

        <div className="ds-version-grid">
          {[
            { id: 'v1' as const, title: 'v1 — Per-App Colors', desc: 'Active multi-hue palette with unique colors per application.' },
            { id: 'v2' as const, title: 'Mellon — Unified Brand', desc: 'Locks all applications to a single unified corporate brand color.' },
            { id: 'v3' as const, title: 'Dreams Core — Bento & Logistics', desc: 'Activates modern bento grid cards, Plus Jakarta Sans typography, ambient diffuse surfaces, and vibrant badges.' },
          ].map(ver => {
            const isSelected = designSystemVersion.version === ver.id;
            return (
              <button
                key={ver.id}
                type="button"
                className={`ds-version-card${isSelected ? ' ds-version-card--active' : ''}`}
                onClick={() => setVersion(ver.id)}
                data-ui-native-button=""
              >
                <div className="ds-version-top">
                  <span className="ds-version-name">{ver.title}</span>
                  {isSelected && (
                    <span className="ds-version-check">
                      <Icon name="check" size={12} />
                    </span>
                  )}
                </div>
                <p className="ds-version-desc">{ver.desc}</p>
              </button>
            );
          })}
        </div>

        {designSystemVersion.version === 'v2' && (
          <div className="ds-v2-picker-row">
            <span className="ds-v2-label">Mellon Global Brand Color:</span>
            <ColorSwatchPicker
              value={v2ColorDraft}
              onChange={v => {
                commitV2Color(v);
              }}
            />
          </div>
        )}
        {saveErrors.version && <p className="ds-alert-error">{saveErrors.version}</p>}
      </div>

      <div className="ds-theme-grid">
        {PLATFORM_THEMES.map(theme => {
          const isActive = activeTheme === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              className={`ds-theme-card${isActive ? ' ds-theme-card--active' : ''}`}
              onClick={() => applyPlatformTheme(theme.id)}
              data-ui-native-button=""
            >
              <div className="ds-theme-card-top">
                <div className="ds-theme-avatar-wrap">
                  <span className="ds-theme-swatch" style={{ background: theme.tokens.brand?.primary }} />
                  <span className="ds-theme-swatch-ring" style={{ borderColor: theme.tokens.brand?.primary }} />
                </div>
                {isActive && (
                  <span className="ds-theme-active-tag">
                    <Icon name="check" size={11} />
                    <span>Active</span>
                  </span>
                )}
              </div>

              <div className="ds-theme-info">
                <span className="ds-theme-name">{theme.name}</span>
                <span className="ds-theme-desc">{theme.description}</span>
              </div>

              <div className="ds-theme-palette-bar">
                {(theme.palette.length > 1 ? theme.palette : [theme.palette[0], theme.palette[0], theme.palette[0]]).slice(0, 6).map((c, i) => (
                  <Tip key={`${c}-${i}`} label={c}>
                    <span className="ds-theme-palette-dot" style={{ background: c }} />
                  </Tip>
                ))}
              </div>
            </button>
          );
        })}
      </div>
      {saveErrors.theme && <p className="ds-alert-error">{saveErrors.theme}</p>}
    </div>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  description,
  badgeText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  description?: string;
  badgeText?: string;
}) {
  return (
    <div className="ds-field-card">
      <div className="ds-field-info">
        <div className="ds-field-title-row">
          <span className="ds-field-label">{label}</span>
          {badgeText && <span className="ds-field-badge">{badgeText}</span>}
        </div>
        {description && <span className="ds-field-desc">{description}</span>}
      </div>

      <ColorSwatchPicker value={value} onChange={onChange} />
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  step = 1,
  min = 0,
  max,
  description,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  description?: string;
}) {
  return (
    <div className="ds-number-field-card">
      <div className="ds-number-info">
        <span className="ds-number-label">{label}</span>
        {description && <span className="ds-number-desc">{description}</span>}
      </div>
      <div className="ds-number-input-group">
        <input data-ui-field="input"
          type="number"
          aria-label={label}
          className="ds-number-input"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={e => onChange(Number(e.target.value) || 0)}
        />
        {suffix && <span className="ds-number-unit">{suffix}</span>}
      </div>
    </div>
  );
}

// ─── Icon System Showcase ──────────────────────────────────────────────────

const STROKE_ICON_NAMES: IconName[] = [
  'grid', 'list', 'menu', 'sidebar', 'home', 'search', 'filter', 'download', 'upload',
  'refresh', 'file', 'fileText', 'folder', 'archive', 'receipt', 'invoice',
  'user', 'users', 'userCheck', 'contact', 'dollarSign', 'creditCard', 'trendingUp',
  'barChart', 'ship', 'truck', 'plane', 'package', 'globe', 'mapPin',
  'warning', 'checkCircle', 'alertCircle', 'xCircle', 'info', 'check', 'clock', 'calendar',
  'settings', 'edit', 'trash', 'copy', 'lock', 'key', 'bell', 'send',
  'zap', 'eye', 'star', 'tag', 'activity', 'building', 'briefcase', 'camera',
  'mail', 'shield', 'sun', 'moon', 'sparkle', 'logIn', 'logOut', 'smartphone',
  'link', 'share', 'image', 'phone', 'layers', 'flag',
];

const TWOTONE_ICON_NAMES = Object.keys(TWOTONE_ICONS) as string[];

function StrokeIconGrid() {
  const [iconSize, setIconSize] = useState(20);
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const handleCopy = (name: string) => {
    const code = `<Icon name="${name}" size={${iconSize}} />`;
    navigator.clipboard?.writeText(code);
    setCopiedName(name);
    setTimeout(() => setCopiedName(null), 1200);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap p-3 rounded-xl bg-muted/40 border border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {STROKE_ICON_NAMES.length} stroke icons · click to copy JSX
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Size:</span>
          <div className="flex items-center gap-1 bg-background border border-border rounded-[var(--r-sm)] p-0.5">
            {[16, 20, 24, 28].map((sz) => (
              <Tip key={sz} label={`Preview stroke icons at ${sz}px`}>
                <button
                  type="button"
                  onClick={() => setIconSize(sz)}
                  data-ui-target="" className={`relative min-h-[28px] min-w-[28px] px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${iconSize === sz ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  data-ui-native-button="">
                  {sz}px
                </button>
              </Tip>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {STROKE_ICON_NAMES.map((name) => (
          <Tip key={name} label={`Copy <Icon name="${name}" size={${iconSize}} />`}>
            <button
              type="button"
              aria-label={`Copy ${name} icon JSX`}
              onClick={() => handleCopy(name)}
              data-ui-native-button=""
              className="group relative flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-[var(--r-sm)] border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer shadow-xs hover:shadow-sm"
            >
              <div className="h-8 flex items-center justify-center">
                <Icon name={name} size={iconSize} />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground truncate max-w-full leading-tight text-center">
                {copiedName === name ? (
                  <span className="text-emerald-500 font-bold">✓ copied</span>
                ) : (
                  name
                )}
              </span>
            </button>
          </Tip>
        ))}
      </div>
    </div>
  );
}

function TwotoneIconGrid() {
  const [selectedColor, setSelectedColor] = useState<'teal' | 'green' | 'gold' | 'purple' | 'red' | 'ink'>('teal');
  const [iconSize, setIconSize] = useState(24);
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const colorMap = {
    teal: 'var(--teal)',
    green: 'var(--green)',
    gold: 'var(--gold)',
    purple: 'var(--purple)',
    red: 'var(--red)',
    ink: 'var(--ink)',
  };

  const handleCopy = (name: string) => {
    const code = `<TwotoneIcon name="${name}" size={${iconSize}} color="${colorMap[selectedColor]}" />`;
    navigator.clipboard?.writeText(code);
    setCopiedName(name);
    setTimeout(() => setCopiedName(null), 1200);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap p-3 rounded-xl bg-muted/40 border border-border">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color:</span>
          <div className="flex items-center gap-1.5">
            {(['teal', 'green', 'gold', 'purple', 'red', 'ink'] as const).map((c) => (
              <Tip key={c} label={`Preview Twotone icons with var(--${c})`}>
                <button
                  type="button"
                  aria-label={`Use ${c} icon color`}
                  onClick={() => setSelectedColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${selectedColor === c ? 'scale-110 ring-2 ring-primary ring-offset-2' : 'hover:scale-105'
                    }`}
                  style={{ backgroundColor: colorMap[c], borderColor: 'transparent', borderRadius: '9999px' }}
                  data-ui-native-button="" />
              </Tip>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Size:</span>
          <div className="flex items-center gap-1 bg-background border border-border rounded-[var(--r-sm)] p-0.5">
            {[18, 22, 26, 32].map((sz) => (
              <Tip key={sz} label={`Preview Twotone icons at ${sz}px`}>
                <button
                  type="button"
                  onClick={() => setIconSize(sz)}
                  data-ui-target="" className={`relative min-h-[28px] min-w-[28px] px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${iconSize === sz ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  data-ui-native-button="">
                  {sz}px
                </button>
              </Tip>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {TWOTONE_ICON_NAMES.map((name) => (
          <Tip key={name} label={`Copy <TwotoneIcon name="${name}" size={${iconSize}} />`}>
            <button
              type="button"
              aria-label={`Copy ${name} twotone icon JSX`}
              onClick={() => handleCopy(name)}
              data-ui-native-button=""
              className="group relative flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-[var(--r-sm)] border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer shadow-xs hover:shadow-sm"
            >
              <div className="h-8 flex items-center justify-center">
                <TwotoneIcon
                  name={name as any}
                  size={iconSize}
                  color={colorMap[selectedColor]}
                  secondaryColor={colorMap[selectedColor]}
                />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground truncate max-w-full leading-tight text-center">
                {copiedName === name ? (
                  <span className="text-emerald-500 font-bold">✓ copied</span>
                ) : (
                  name
                )}
              </span>
            </button>
          </Tip>
        ))}
      </div>
    </div>
  );
}

// Real, owned Hugeicons Pro artwork loaded via dynamic import() — its SVG
// markup only ever downloads for someone who opens this tab, not for every
// SuperAdmin page load.
function HugeiconsIconGrid() {
  const [selectedColor, setSelectedColor] = useState<'teal' | 'green' | 'gold' | 'purple' | 'red' | 'ink'>('teal');
  const [iconSize, setIconSize] = useState(24);
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const [map, setMap] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let alive = true;
    import('../../components/hugeicons-pro-map.js').then((m) => { if (alive) setMap(m.HUGEICONS_PRO_MAP as Record<string, string>); });
    return () => { alive = false; };
  }, []);

  const colorMap = {
    teal: 'var(--teal)', green: 'var(--green)', gold: 'var(--gold)',
    purple: 'var(--purple)', red: 'var(--red)', ink: 'var(--ink)',
  };

  const handleCopy = (name: string) => {
    const code = `<Icon name="${name}" size={${iconSize}} />`;
    navigator.clipboard?.writeText(code);
    setCopiedName(name);
    setTimeout(() => setCopiedName(null), 1200);
  };

  if (!map) {
    return <div className="p-6 text-center text-xs text-muted-foreground">Loading Hugeicons artwork…</div>;
  }

  const names = Object.keys(map);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap p-3 rounded-xl bg-muted/40 border border-border">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color:</span>
          <div className="flex items-center gap-1.5">
            {(['teal', 'green', 'gold', 'purple', 'red', 'ink'] as const).map((c) => (
              <Tip key={c} label={`Preview Hugeicons artwork with var(--${c})`}>
                <button
                  type="button"
                  aria-label={`Use ${c} icon color`}
                  onClick={() => setSelectedColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${selectedColor === c ? 'scale-110 ring-2 ring-primary ring-offset-2' : 'hover:scale-105'
                    }`}
                  style={{ backgroundColor: colorMap[c], borderColor: 'transparent', borderRadius: '9999px' }}
                  data-ui-native-button="" />
              </Tip>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Size:</span>
          <div className="flex items-center gap-1 bg-background border border-border rounded-[var(--r-sm)] p-0.5">
            {[18, 22, 26, 32].map((sz) => (
              <Tip key={sz} label={`Preview Hugeicons icons at ${sz}px`}>
                <button
                  type="button"
                  onClick={() => setIconSize(sz)}
                  data-ui-target="" className={`relative min-h-[28px] min-w-[28px] px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${iconSize === sz ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  data-ui-native-button="">
                  {sz}px
                </button>
              </Tip>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {names.map((name) => (
          <Tip key={name} label={`Copy <Icon name="${name}" size={${iconSize}} />`}>
            <button
              type="button"
              aria-label={`Copy ${name} hugeicons JSX`}
              onClick={() => handleCopy(name)}
              data-ui-native-button=""
              className="group relative flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-[var(--r-sm)] border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer shadow-xs hover:shadow-sm"
            >
              <div className="h-8 flex items-center justify-center">
                <svg
                  width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none"
                  style={{ color: colorMap[selectedColor] }}
                  dangerouslySetInnerHTML={{ __html: map[name]! }}
                />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground truncate max-w-full leading-tight text-center">
                {copiedName === name ? (
                  <span className="text-emerald-500 font-bold">✓ copied</span>
                ) : (
                  name
                )}
              </span>
            </button>
          </Tip>
        ))}
      </div>
    </div>
  );
}

const ICON_TAB_META: Record<IconLibraryId, { label: string; count: number | null }> = {
  stroke: { label: 'Stroke Icons', count: STROKE_ICON_NAMES.length },
  twotone: { label: 'Twotone Rounded', count: TWOTONE_ICON_NAMES.length },
  hugeicons: { label: 'Hugeicons Pro', count: null },
};

export function IconSystemSection() {
  const { tokens, updateTokens } = useDesignSystem();
  const [tab, setTab] = useState<IconLibraryId>(tokens.iconLibrary);
  const isActiveLibrary = tab === tokens.iconLibrary;

  return (
    <div className="space-y-6">
      <div className="ds-section-header-block">
        <h3 className="ds-section-heading">Icon System</h3>
        <p className="ds-section-sub">
          Hudumika ships three icon libraries, switchable platform-wide.
          <strong> Hugeicons Pro</strong> — real, owned Hugeicons Pro artwork, the platform default.
          <strong> Stroke</strong> — the platform's own crisp 24×24 outline set (covers every icon name — the fallback every other library uses for a name it doesn't cover).
          <strong> Twotone Rounded</strong> — a hand-authored Hugeicons-inspired dual-layer style.
          Browse a library below, then use <strong>Use platform-wide</strong> to make it what every &lt;Icon&gt; in the app actually renders — a name the chosen library doesn't cover quietly falls back to Stroke rather than going blank.
        </p>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40 border border-border w-fit" data-ds-tabstrip="">
        {ICON_LIBRARY_IDS.map(id => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${tab === id
              ? 'bg-card shadow-sm text-foreground border border-border'
              : 'text-muted-foreground hover:text-foreground'
              }`}
            data-ds-selected={tab === id} data-ui-native-button="" aria-pressed={tab === id}>
            {id === 'twotone'
              ? <TwotoneIcon name="sparkle" size={14} color="var(--teal)" secondaryColor="var(--teal)" />
              : <Icon name="sparkle" size={14} />}
            {ICON_TAB_META[id].label}
            {ICON_TAB_META[id].count !== null && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-primary/10 text-primary">
                {ICON_TAB_META[id].count}
              </span>
            )}
            {tokens.iconLibrary === id && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/15 text-emerald-600">live</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap p-4 rounded-xl bg-muted/40 border border-border">
        <p className="text-xs text-muted-foreground m-0">{ICON_LIBRARY_DESCRIPTIONS[tab]}</p>
        {isActiveLibrary ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <Icon name="checkCircle" size={13} /> Currently active platform-wide
          </span>
        ) : (
          <button
            type="button"
            onClick={() => updateTokens({ iconLibrary: tab })}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            data-ui-native-button="">
            Use {ICON_TAB_META[tab].label} platform-wide
          </button>
        )}
      </div>

      <div className="p-4 rounded-xl bg-muted/40 border border-border font-mono text-xs text-muted-foreground space-y-1.5">
        {tab === 'stroke' && (
          <>
            <div><span className="text-primary">import</span> {'{ Icon }'} <span className="text-primary">from</span> <span className="text-emerald-500">'../components/Icon'</span>;</div>
            <div className="text-foreground">{'<Icon name="shield" size={20} />'}</div>
          </>
        )}
        {tab === 'twotone' && (
          <>
            <div><span className="text-primary">import</span> {'{ TwotoneIcon }'} <span className="text-primary">from</span> <span className="text-emerald-500">'../components/ui/twotone-icon'</span>;</div>
            <div className="text-foreground">{'<TwotoneIcon name="shield" size={24} color="var(--teal)" secondaryColor="var(--teal)" />'}</div>
          </>
        )}
        {tab === 'hugeicons' && (
          <>
            <div className="text-muted-foreground">// Same &lt;Icon&gt; call as Stroke — Hugeicons renders once it's the active platform-wide library above.</div>
            <div><span className="text-primary">import</span> {'{ Icon }'} <span className="text-primary">from</span> <span className="text-emerald-500">'../components/Icon'</span>;</div>
            <div className="text-foreground">{'<Icon name="shield" size={20} />'}</div>
          </>
        )}
      </div>

      {tab === 'stroke' && <StrokeIconGrid />}
      {tab === 'twotone' && <TwotoneIconGrid />}
      {tab === 'hugeicons' && <HugeiconsIconGrid />}
    </div>
  );
}
