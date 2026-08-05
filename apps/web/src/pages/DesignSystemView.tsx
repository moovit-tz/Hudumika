import React, { useState } from 'react';
import {
  useDesignSystem, DesignTokens, NeutralSet, SemanticSet,
  FONT_IDS, FONT_LABELS, DENSITY_IDS, DENSITY_LABELS, SHADOW_IDS, SHADOW_LABELS,
  SHADOW_PRESETS, generateFromSeed, PLATFORM_THEMES,
} from '../hooks/useDesignSystem.js';
import { useBranding, pushBranding } from '../hooks/useBranding.js';
import { ALL_APP_IDS } from '@hudumika/types';
import './DesignSystemView.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { APP_PALETTE_SLOT } from '../shells/WorkspaceApp.js';

const SECTIONS: { id: string; group: 'theming' | 'layout'; label: string; icon: IconName }[] = [
  { id: 'themes',     group: 'theming', label: 'Themes',           icon: 'sparkle' },
  { id: 'brand',      group: 'theming', label: 'Brand & Neutral',  icon: 'sun' },
  { id: 'semantic',   group: 'theming', label: 'Semantic',         icon: 'tag' },
  { id: 'typography', group: 'theming', label: 'Typography',       icon: 'fileText' },
  { id: 'shape',      group: 'theming', label: 'Shape',            icon: 'shapes' },
  { id: 'tabs',       group: 'theming', label: 'Tabs',             icon: 'layoutDashboard' },
  { id: 'elevation',  group: 'theming', label: 'Elevation',        icon: 'layers' },
  { id: 'density',    group: 'theming', label: 'Density',          icon: 'grid3' },
  { id: 'motion',     group: 'theming', label: 'Motion',           icon: 'zap' },
  { id: 'apps',       group: 'theming', label: 'Per-App Colors',   icon: 'grid' },
  { id: 'menu',       group: 'layout',  label: 'Menu',             icon: 'sidebar' },
  { id: 'navbar',     group: 'layout',  label: 'Navbar Type',      icon: 'layoutDashboard' },
  { id: 'content',    group: 'layout',  label: 'Content',          icon: 'maximize' },
  { id: 'skin',       group: 'layout',  label: 'Skin',             icon: 'image' },
  { id: 'semidark',   group: 'layout',  label: 'Semi Dark',        icon: 'moon' },
  { id: 'direction',  group: 'layout',  label: 'Direction',        icon: 'compass' },
  { id: 'mobile',     group: 'layout',  label: 'Mobile',           icon: 'smartphone' },
];

// Every app defaults to the single brand accent (matches WorkspaceApp.tsx's
// APP_COLORS / BrandingView.tsx's APP_META_BRAND) rather than its own hue —
// this list is only the *fallback* shown until a SuperAdmin picks a custom
// per-app color here.
const DEFAULT_APP_COLOR = '#0b1e3a';
const APPS: { id: string; name: string; color: string }[] = [
  { id: 'clearos',   name: 'ClearOS',  color: DEFAULT_APP_COLOR },
  { id: 'finops',    name: 'FinOps',   color: DEFAULT_APP_COLOR },
  { id: 'nexushr',     name: 'NexusHR',  color: DEFAULT_APP_COLOR },
  { id: 'bliss',     name: 'Bliss',    color: DEFAULT_APP_COLOR },
  { id: 'complyos',  name: 'ComplyOS', color: DEFAULT_APP_COLOR },
  { id: 'crm',       name: 'CRM',      color: DEFAULT_APP_COLOR },
  { id: 'cloud',     name: 'Cloud',    color: DEFAULT_APP_COLOR },
  { id: 'email',     name: 'Email',    color: DEFAULT_APP_COLOR },
  { id: 'contacts',  name: 'Contacts', color: DEFAULT_APP_COLOR },
  { id: 'ai',        name: 'AI',       color: DEFAULT_APP_COLOR },
  { id: 'store',     name: 'Store',    color: DEFAULT_APP_COLOR },
  { id: 'workspace', name: 'Admin',    color: DEFAULT_APP_COLOR },
];

const NEUTRAL_LABELS: Record<keyof NeutralSet, string> = {
  ink: 'Text (primary)', ink2: 'Text (secondary)', ink3: 'Text (muted)',
  bg: 'Page background', white: 'Surface', border: 'Border', border2: 'Border (strong)',
};

const SEMANTIC_LABELS: Record<keyof SemanticSet, string> = {
  gold: 'Warning', red: 'Danger', green: 'Success', blue: 'Info', purple: 'Accent',
  navy: 'Navy', navy2: 'Navy (alt)',
};

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  React.useEffect(() => setLocal(value), [value]);
  return (
    <div className="ds-field">
      <span className="ds-field-label">{label}</span>
      <div className="ds-color-row">
        <input type="color" className="ds-swatch" value={/^#[0-9a-f]{6}$/i.test(local) ? local : '#888888'}
          onChange={e => { setLocal(e.target.value); onChange(e.target.value); }} />
        <input type="text" className="input-field ds-color-text" value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => onChange(local)} />
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, suffix, step, min }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; step?: number; min?: number }) {
  return (
    <div className="ds-field">
      <span className="ds-field-label">{label}</span>
      <div className="ds-number-row">
        <input type="number" className="input-field ds-number-input" value={value} step={step} min={min}
          onChange={e => onChange(Number(e.target.value) || 0)} />
        {suffix && <span className="ds-number-suffix">{suffix}</span>}
      </div>
    </div>
  );
}

export function DesignSystemView() {
  const { tokens, updateTokens, resetToDefaults } = useDesignSystem();
  const branding = useBranding();
  const isMobileNow = useIsMobile();

  const [themeTab, setThemeTab] = useState<'light' | 'dark'>('light');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [seed, setSeed] = useState(tokens.brand.primary);
  const [saveErrors, setSaveErrors] = useState<Record<string, string | undefined>>({});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('themes');

  const activeTheme = PLATFORM_THEMES.find(
    t => t.tokens.brand?.primary?.toLowerCase() === tokens.brand.primary.toLowerCase()
  )?.id ?? null;

  async function save(section: string, partial: Partial<DesignTokens>) {
    try {
      await updateTokens(partial);
      setSaveErrors(e => ({ ...e, [section]: undefined }));
      setSavedFlash(section);
      window.setTimeout(() => setSavedFlash(f => (f === section ? null : f)), 1400);
    } catch (err: any) {
      setSaveErrors(e => ({ ...e, [section]: err?.message || 'Failed to save' }));
    }
  }

  async function saveAppColor(appId: string, color: string) {
    // Update the local cache + notify same-tab listeners immediately (same
    // pattern as BrandingView.tsx's saveApp) — otherwise the swatch and every
    // other reader of branding.getAppColor() only pick up the change on the
    // next full page load, when useBranding() re-fetches from the server.
    localStorage.setItem(`hudumika_app_color_${appId}`, color);
    window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
    try {
      await pushBranding({ apps: { [appId]: { color } } });
      setSaveErrors(e => ({ ...e, apps: undefined }));
    } catch (err: any) {
      setSaveErrors(e => ({ ...e, apps: err?.message || 'Failed to save' }));
    }
  }

  async function handleGenerateFromSeed() {
    await save('brand', generateFromSeed(seed));
  }

  /** One click applies a full platform theme: the shared brand.primary +
   *  semantic tokens (design-tokens endpoint) AND every app's accent color
   *  cycled from the theme's palette AND the platform accent color used by
   *  documents/login (branding endpoint, batched into one PUT instead of
   *  19+1 — the backend already merges apps.{id} keys independently, see
   *  platform.routes.ts). Branding's own Accent Color field can be edited
   *  afterward as a later write to the same key, which naturally overrides
   *  this default — the same last-write-wins model per-app colors already use. */
  async function applyPlatformTheme(themeId: string) {
    const theme = PLATFORM_THEMES.find(t => t.id === themeId);
    if (!theme) return;
    const apps: Record<string, { color: string }> = {};
    ALL_APP_IDS.forEach((appId) => {
      // Declared slot, not list position — see APP_PALETTE_SLOT. Falls back to
      // slot 0 only if an app was added without choosing one, which keeps the
      // apply working while making the omission visible rather than silently
      // shifting every other app's colour.
      const slot = APP_PALETTE_SLOT[appId] ?? 0;
      const color = theme.palette[slot % theme.palette.length];
      apps[appId] = { color };
      localStorage.setItem(`hudumika_app_color_${appId}`, color);
    });
    window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
    try {
      await Promise.all([
        updateTokens(theme.tokens),
        pushBranding({ apps, accentColor: theme.tokens.brand!.primary }),
      ]);
      setSaveErrors(e => ({ ...e, theme: undefined, apps: undefined }));
      setSavedFlash('theme');
      window.setTimeout(() => setSavedFlash(f => (f === 'theme' ? null : f)), 1400);
    } catch (err: any) {
      setSaveErrors(e => ({ ...e, theme: err?.message || 'Failed to save' }));
    }
  }

  const neutralKeys: (keyof NeutralSet)[] = ['ink', 'ink2', 'ink3', 'bg', 'white', 'border', 'border2'];
  const semanticKeys: (keyof SemanticSet)[] = ['gold', 'red', 'green', 'blue', 'purple', 'navy', 'navy2'];

  // ── Layout Customizer ──────────────────────────────────────────────────
  // Global (not per-user) prefs, same model as the color theming above —
  // AppHeader.tsx applies these as <html> attributes on mount (see the
  // "Layout Customizer prefs" effect there); menu default additionally fans
  // out to every app's own per-app collapsed key so it takes effect the
  // first time any app is opened, not just the one active right now.
  const [menuDefault, setMenuDefaultState] = useState<'expanded' | 'collapsed'>(
    () => (localStorage.getItem('menu-default') === 'collapsed' ? 'collapsed' : 'expanded')
  );
  const [contentWidth, setContentWidthState] = useState<'compact' | 'wide'>(
    () => (localStorage.getItem('layout') === 'full' ? 'wide' : 'compact')
  );
  const [navbarType, setNavbarTypeState] = useState<'sticky' | 'static' | 'hidden'>(
    () => (localStorage.getItem('navbar-type') as any) || 'static'
  );
  const [skin, setSkinState] = useState<'default' | 'bordered'>(
    () => (localStorage.getItem('skin') === 'bordered' ? 'bordered' : 'default')
  );
  const [semiDark, setSemiDarkState] = useState(() => localStorage.getItem('semi-dark') === 'true');
  const [direction, setDirectionState] = useState<'ltr' | 'rtl'>(
    () => (localStorage.getItem('direction') as any) || (document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr')
  );

  function setMenuDefault(mode: 'expanded' | 'collapsed') {
    localStorage.setItem('menu-default', mode);
    ALL_APP_IDS.forEach(appId => localStorage.setItem(`${appId}-sidebar-collapsed`, String(mode === 'collapsed')));
    window.dispatchEvent(new CustomEvent('sidebar-toggled', { detail: { collapsed: mode === 'collapsed' } }));
    setMenuDefaultState(mode);
  }

  function setContentWidth(mode: 'compact' | 'wide') {
    localStorage.setItem('layout', mode === 'wide' ? 'full' : 'boxed');
    if (mode === 'wide') document.documentElement.setAttribute('data-layout', 'full');
    else document.documentElement.removeAttribute('data-layout');
    window.dispatchEvent(new CustomEvent('hudumika-layout-updated'));
    setContentWidthState(mode);
  }

  function setNavbarType(type: 'sticky' | 'static' | 'hidden') {
    localStorage.setItem('navbar-type', type);
    if (type === 'static') document.documentElement.removeAttribute('data-navbar');
    else document.documentElement.setAttribute('data-navbar', type);
    setNavbarTypeState(type);
  }

  function setSkin(s: 'default' | 'bordered') {
    localStorage.setItem('skin', s);
    if (s === 'bordered') document.documentElement.setAttribute('data-skin', 'bordered');
    else document.documentElement.removeAttribute('data-skin');
    setSkinState(s);
  }

  function setSemiDark(v: boolean) {
    localStorage.setItem('semi-dark', String(v));
    if (v) document.documentElement.setAttribute('data-semi-dark', 'true');
    else document.documentElement.removeAttribute('data-semi-dark');
    setSemiDarkState(v);
  }

  function setDirection(dir: 'ltr' | 'rtl') {
    localStorage.setItem('direction', dir);
    document.documentElement.setAttribute('dir', dir);
    setDirectionState(dir);
  }

  return (
    <div className="ds-root">
      <div className="ds-header">
        <div>
          <h1 className="ds-title">Design System</h1>
          <p className="ds-sub">
            Controls the real CSS tokens every app renders from — Bliss, ClearOS, FinOps and the rest.
            Changes apply live and persist for every tenant.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => resetToDefaults()}>Reset to defaults</button>
      </div>

      <div className="ds-layout">
        <nav className="ds-rail">
          <div className="ds-rail-group-label">Theming</div>
          {SECTIONS.filter(s => s.group === 'theming').map(s => (
            <button key={s.id} type="button"
              className={`ds-rail-item${activeSection === s.id ? ' ds-rail-item--active' : ''}`}
              onClick={() => setActiveSection(s.id)}>
              <Icon name={s.icon} size={15} />
              {s.label}
            </button>
          ))}
          <div className="ds-rail-group-label">Layout</div>
          {SECTIONS.filter(s => s.group === 'layout').map(s => (
            <button key={s.id} type="button"
              className={`ds-rail-item${activeSection === s.id ? ' ds-rail-item--active' : ''}`}
              onClick={() => setActiveSection(s.id)}>
              <Icon name={s.icon} size={15} />
              {s.label}
            </button>
          ))}
        </nav>

        <div className="ds-panel">

          {/* Themes */}
          {activeSection === 'themes' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Themes</h2>
            <p className="ds-section-hint">
              Switch the whole platform to a pre-designed color bundle in one click — sets the shared
              accent (buttons, links, focus states) and every app's individual color together, instead
              of picking each one separately. You can still fine-tune any value afterward, and it flows
              through to Branding's Accent Color as the default there too.
            </p>
            <div className="ds-theme-grid">
              {PLATFORM_THEMES.map(theme => {
                const isActive = activeTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    className={`ds-theme-card${isActive ? ' ds-theme-card--active' : ''}`}
                    onClick={() => applyPlatformTheme(theme.id)}
                  >
                    {isActive && <span className="ds-theme-check"><Icon name="check" size={11} /></span>}
                    <span className="ds-theme-swatch" style={{ background: theme.tokens.brand?.primary }} />
                    <span className="ds-theme-dots">
                      {(theme.palette.length > 1 ? theme.palette : [theme.palette[0], theme.palette[0], theme.palette[0]]).slice(0, 6).map((c, i) => (
                        <span key={i} className="ds-theme-dot" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="ds-theme-name">{theme.name}</span>
                    <span className="ds-theme-desc">{theme.description}</span>
                  </button>
                );
              })}
            </div>
            {saveErrors.theme && <p className="ds-error">{saveErrors.theme}</p>}
            {savedFlash === 'theme' && <p className="ds-saved">Saved</p>}
          </section>
          )}

          {/* Brand & Neutral */}
          {activeSection === 'brand' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Brand &amp; Neutral Colors</h2>
            <p className="ds-section-hint">
              Pick a seed color to auto-generate a cohesive neutral scale (Material 3 tonal palette
              algorithm), or edit each value directly.
            </p>
            <div className="ds-seed-row">
              <input type="color" className="ds-swatch" value={seed} onChange={e => setSeed(e.target.value)} />
              <input type="text" className="input-field ds-color-text" value={seed} onChange={e => setSeed(e.target.value)} />
              <button type="button" className="btn btn-primary btn-sm" onClick={handleGenerateFromSeed}>Generate</button>
            </div>

            <ColorField label="Brand primary" value={tokens.brand.primary}
              onChange={v => save('brand', { brand: { primary: v } })} />

            <div className="ds-tabs">
              <button type="button" className={`ds-tab${themeTab === 'light' ? ' ds-tab--active' : ''}`} onClick={() => setThemeTab('light')}>Light mode</button>
              <button type="button" className={`ds-tab${themeTab === 'dark' ? ' ds-tab--active' : ''}`} onClick={() => setThemeTab('dark')}>Dark mode</button>
            </div>

            {neutralKeys.map(key => (
              <ColorField key={key} label={NEUTRAL_LABELS[key]} value={tokens.neutral[themeTab][key]}
                onChange={v => save('neutral', { neutral: { ...tokens.neutral, [themeTab]: { ...tokens.neutral[themeTab], [key]: v } } })} />
            ))}
            {(saveErrors.brand || saveErrors.neutral) && <p className="ds-error">{saveErrors.brand || saveErrors.neutral}</p>}
            {(savedFlash === 'brand' || savedFlash === 'neutral') && <p className="ds-saved">Saved</p>}
          </section>
          )}

          {/* Semantic */}
          {activeSection === 'semantic' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Semantic Colors</h2>
            <p className="ds-section-hint">Status colors used for badges, pills, and alerts — editing {themeTab} mode.</p>
            {semanticKeys.map(key => (
              <ColorField key={key} label={SEMANTIC_LABELS[key]} value={tokens.semantic[themeTab][key]}
                onChange={v => save('semantic', { semantic: { ...tokens.semantic, [themeTab]: { ...tokens.semantic[themeTab], [key]: v } } })} />
            ))}
            {saveErrors.semantic && <p className="ds-error">{saveErrors.semantic}</p>}
            {savedFlash === 'semantic' && <p className="ds-saved">Saved</p>}
          </section>
          )}

          {/* Typography */}
          {activeSection === 'typography' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Typography</h2>
            <div className="ds-field">
              <span className="ds-field-label">Base font family</span>
              <Select value={tokens.typography.font}
                onValueChange={v => save('typography', { typography: { ...tokens.typography, font: v as any } })}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_IDS.map(id => <SelectItem key={id} value={id}>{FONT_LABELS[id]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="ds-scale-grid">
              {(Object.keys(tokens.typography.scale) as (keyof typeof tokens.typography.scale)[]).map(key => (
                <NumberField key={key} label={key.toUpperCase()} suffix="px" value={tokens.typography.scale[key]}
                  onChange={v => save('typography', { typography: { ...tokens.typography, scale: { ...tokens.typography.scale, [key]: v } } })} />
              ))}
            </div>
            {saveErrors.typography && <p className="ds-error">{saveErrors.typography}</p>}
            {savedFlash === 'typography' && <p className="ds-saved">Saved</p>}
          </section>
          )}

          {/* Tabs */}
          {activeSection === 'tabs' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Tabs</h2>
            <p className="ds-section-hint">
              Applies to every tab strip on the platform. The variant changes layout, so it is set here rather than
              per page — an individual screen can still override it when it genuinely needs to.
            </p>
            <div className="ds-preset-row">
              {(['underline', 'pill', 'segmented'] as const).map(v => (
                <button key={v} type="button"
                  className={`ds-preset-btn ${tokens.tabs.variant === v ? 'ds-preset-btn--active' : ''}`}
                  onClick={() => save('tabs', { tabs: { ...tokens.tabs, variant: v } })}>
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <div className="ds-scale-grid" style={{ marginTop: 16 }}>
              <NumberField label="Corner radius" suffix="px" min={0} value={tokens.tabs.radius}
                onChange={v => save('tabs', { tabs: { ...tokens.tabs, radius: v } })} />
              <NumberField label="Height" suffix="px" min={24} value={tokens.tabs.height}
                onChange={v => save('tabs', { tabs: { ...tokens.tabs, height: v } })} />
              <NumberField label="Label size" suffix="px" step={0.5} min={9} value={tokens.tabs.size}
                onChange={v => save('tabs', { tabs: { ...tokens.tabs, size: v } })} />
            </div>
            <div style={{ marginTop: 18 }}>
              <div className="ds-preview-label">Live preview</div>
              <Tabs defaultValue="one">
                <TabsList>
                  <TabsTrigger value="one">Overview</TabsTrigger>
                  <TabsTrigger value="two">Activity</TabsTrigger>
                  <TabsTrigger value="three">Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="one">This panel is the active tab's content.</TabsContent>
                <TabsContent value="two">Second panel.</TabsContent>
                <TabsContent value="three">Third panel.</TabsContent>
              </Tabs>
            </div>
          </section>
          )}

          {/* Shape */}
          {activeSection === 'shape' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Shape</h2>
            <div className="ds-scale-grid">
              <NumberField label="Small radius" suffix="px" value={tokens.shape.rSm} onChange={v => save('shape', { shape: { ...tokens.shape, rSm: v } })} />
              <NumberField label="Base radius" suffix="px" value={tokens.shape.r} onChange={v => save('shape', { shape: { ...tokens.shape, r: v } })} />
              <NumberField label="Large radius" suffix="px" value={tokens.shape.rLg} onChange={v => save('shape', { shape: { ...tokens.shape, rLg: v } })} />
              <NumberField label="Badge radius" suffix="px" value={tokens.shape.badgeRadius} onChange={v => save('shape', { shape: { ...tokens.shape, badgeRadius: v } })} />
              <NumberField label="Border width" suffix="px" step={0.5} min={0} value={tokens.shape.borderWidth} onChange={v => save('shape', { shape: { ...tokens.shape, borderWidth: v } })} />
              <NumberField label="Icon stroke weight" step={0.25} min={1} value={tokens.shape.iconStrokeWidth} onChange={v => save('shape', { shape: { ...tokens.shape, iconStrokeWidth: v } })} />
              <NumberField label="Breadcrumb size" suffix="px" step={0.5} min={8} value={tokens.shape.breadcrumbSize} onChange={v => save('shape', { shape: { ...tokens.shape, breadcrumbSize: v } })} />
            </div>
            <div className="ds-shape-preview">
              <div className="ds-shape-swatch" style={{ borderRadius: tokens.shape.rSm }} />
              <div className="ds-shape-swatch" style={{ borderRadius: tokens.shape.r }} />
              <div className="ds-shape-swatch" style={{ borderRadius: tokens.shape.rLg }} />
              <div className="ds-shape-swatch" style={{ borderRadius: tokens.shape.badgeRadius }} />
              <div className="ds-shape-swatch" style={{ borderRadius: tokens.shape.r, border: `${tokens.shape.borderWidth}px solid var(--teal)` }} />
              <div className="ds-shape-swatch" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="shapes" size={22} strokeWidth={tokens.shape.iconStrokeWidth} color="var(--teal)" />
              </div>
            </div>
            <p className="ds-hint">
              Border width applies to inputs, buttons and cards platform-wide. The
              "active" border color on a focused input already tracks your brand
              primary color (Brand &amp; Neutral tab) — no separate setting needed,
              it's the same teal swatch shown in the border-width preview square.
              Icon stroke weight is the default every icon uses unless a specific
              spot in the app deliberately asks for a bolder or thinner one (e.g.
              an active nav icon). Breadcrumb size controls the small uppercase
              trail at the top of every page header (Dashboard &gt; Operations).
            </p>
            {saveErrors.shape && <p className="ds-error">{saveErrors.shape}</p>}
            {savedFlash === 'shape' && <p className="ds-saved">Saved</p>}
          </section>
          )}

          {/* Elevation */}
          {activeSection === 'elevation' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Elevation</h2>
            <div className="ds-preset-row">
              {SHADOW_IDS.map(id => (
                <button key={id} type="button"
                  className={`ds-preset-btn${tokens.elevation === id ? ' ds-preset-btn--active' : ''}`}
                  onClick={() => save('elevation', { elevation: id })}>
                  <span className="ds-preset-swatch" style={{ boxShadow: SHADOW_PRESETS[id][previewTheme].base }} />
                  {SHADOW_LABELS[id]}
                </button>
              ))}
            </div>
            {saveErrors.elevation && <p className="ds-error">{saveErrors.elevation}</p>}
            {savedFlash === 'elevation' && <p className="ds-saved">Saved</p>}
          </section>
          )}

          {/* Density */}
          {activeSection === 'density' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Spacing &amp; Density</h2>
            <div className="ds-preset-row">
              {DENSITY_IDS.map(id => (
                <button key={id} type="button"
                  className={`ds-preset-btn${tokens.density === id ? ' ds-preset-btn--active' : ''}`}
                  onClick={() => save('density', { density: id })}>
                  {DENSITY_LABELS[id]}
                </button>
              ))}
            </div>
            {saveErrors.density && <p className="ds-error">{saveErrors.density}</p>}
            {savedFlash === 'density' && <p className="ds-saved">Saved</p>}
          </section>
          )}

          {/* Motion */}
          {activeSection === 'motion' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Motion</h2>
            <div className="ds-scale-grid">
              <NumberField label="Fast" suffix="ms" value={tokens.motion.durFast} onChange={v => save('motion', { motion: { ...tokens.motion, durFast: v } })} />
              <NumberField label="Base" suffix="ms" value={tokens.motion.dur} onChange={v => save('motion', { motion: { ...tokens.motion, dur: v } })} />
              <NumberField label="Slow" suffix="ms" value={tokens.motion.durSlow} onChange={v => save('motion', { motion: { ...tokens.motion, durSlow: v } })} />
            </div>
            <div className="ds-field">
              <span className="ds-field-label">Easing</span>
              <input type="text" className="input-field" value={tokens.motion.ease}
                onChange={e => save('motion', { motion: { ...tokens.motion, ease: e.target.value } })} />
            </div>
            {saveErrors.motion && <p className="ds-error">{saveErrors.motion}</p>}
            {savedFlash === 'motion' && <p className="ds-saved">Saved</p>}
          </section>
          )}

          {/* Per-app accents */}
          {activeSection === 'apps' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Per-App Accent Colors</h2>
            <p className="ds-section-hint">
              Pick a theme on the Themes tab to prefill every app's color at once, or edit any app
              individually here.
            </p>
            <div className="ds-app-grid">
              {APPS.map(app => (
                <div key={app.id} className="ds-app-cell">
                  <input type="color" className="ds-swatch" value={branding.getAppColor(app.id, app.color)}
                    onChange={e => saveAppColor(app.id, e.target.value)} />
                  <span className="ds-app-name">{branding.getAppName(app.id, app.name)}</span>
                </div>
              ))}
            </div>
            {saveErrors.apps && <p className="ds-error">{saveErrors.apps}</p>}
            {savedFlash === 'apps' && <p className="ds-saved">Saved</p>}
          </section>
          )}

          {/* Menu */}
          {activeSection === 'menu' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Menu (Navigation)</h2>
            <p className="ds-section-hint">Default sidebar state the first time any app is opened.</p>
            <div className="ds-preset-row">
              {(['expanded', 'collapsed'] as const).map(mode => (
                <button key={mode} type="button"
                  className={`ds-preset-btn${menuDefault === mode ? ' ds-preset-btn--active' : ''}`}
                  onClick={() => setMenuDefault(mode)}>
                  {mode === 'expanded' ? 'Expanded' : 'Collapsed'}
                </button>
              ))}
            </div>
          </section>
          )}

          {/* Navbar type */}
          {activeSection === 'navbar' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Navbar Type</h2>
            <div className="ds-preset-row">
              {(['sticky', 'static', 'hidden'] as const).map(type => (
                <button key={type} type="button"
                  className={`ds-preset-btn${navbarType === type ? ' ds-preset-btn--active' : ''}`}
                  onClick={() => setNavbarType(type)}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </section>
          )}

          {/* Content width */}
          {activeSection === 'content' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Content</h2>
            <div className="ds-preset-row">
              {(['compact', 'wide'] as const).map(mode => (
                <button key={mode} type="button"
                  className={`ds-preset-btn${contentWidth === mode ? ' ds-preset-btn--active' : ''}`}
                  onClick={() => setContentWidth(mode)}>
                  {mode === 'compact' ? 'Compact' : 'Wide'}
                </button>
              ))}
            </div>
          </section>
          )}

          {/* Skin */}
          {activeSection === 'skin' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Skin</h2>
            <div className="ds-preset-row">
              {(['default', 'bordered'] as const).map(s => (
                <button key={s} type="button"
                  className={`ds-preset-btn${skin === s ? ' ds-preset-btn--active' : ''}`}
                  onClick={() => setSkin(s)}>
                  {s === 'default' ? 'Default' : 'Bordered'}
                </button>
              ))}
            </div>
          </section>
          )}

          {/* Semi Dark */}
          {activeSection === 'semidark' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Semi Dark</h2>
            <p className="ds-section-hint">Keeps the sidebar dark regardless of the page's own light/dark theme.</p>
            <div className="ds-preset-row">
              <button type="button" className={`ds-preset-btn${!semiDark ? ' ds-preset-btn--active' : ''}`} onClick={() => setSemiDark(false)}>Off</button>
              <button type="button" className={`ds-preset-btn${semiDark ? ' ds-preset-btn--active' : ''}`} onClick={() => setSemiDark(true)}>On</button>
            </div>
          </section>
          )}

          {/* Direction */}
          {activeSection === 'direction' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Direction</h2>
            <p className="ds-section-hint">
              Sets the page's text direction. Note: layout mirroring is partial today — most of the platform's
              CSS doesn't yet have RTL-aware rules, so switching this flips text direction but won't fully
              re-mirror every layout. Full RTL support is separate, larger follow-up work.
            </p>
            <div className="ds-preset-row">
              <button type="button" className={`ds-preset-btn${direction === 'ltr' ? ' ds-preset-btn--active' : ''}`} onClick={() => setDirection('ltr')}>Left to Right</button>
              <button type="button" className={`ds-preset-btn${direction === 'rtl' ? ' ds-preset-btn--active' : ''}`} onClick={() => setDirection('rtl')}>Right to Left</button>
            </div>
          </section>
          )}

          {/* Mobile */}
          {activeSection === 'mobile' && (
          <section className="card ds-section">
            <h2 className="ds-section-title">Mobile</h2>
            <p className="ds-section-hint">
              The single breakpoint every adaptive page in the platform reads from
              (useIsMobile() — 42 files, ~90 call sites). Below this width, pages
              switch to their mobile layout live, no reload. A handful of raw CSS
              media queries (scrollbars, a couple of layout edge cases) are fixed
              at their own values and don't follow this — CSS can't reference a
              custom property inside @media, only JavaScript-driven layout can.
            </p>
            <div className="ds-scale-grid">
              <NumberField label="Breakpoint" suffix="px" step={1} min={320}
                value={tokens.responsive.breakpoint}
                onChange={v => save('responsive', { responsive: { breakpoint: v } })} />
            </div>
            <div className="ds-field" style={{ marginTop: 4 }}>
              <span className="ds-field-label">This browser window right now</span>
              <span className={`badge ${isMobileNow ? 'badge-gold' : 'badge-teal'}`}>
                {isMobileNow ? 'Mobile layout' : 'Desktop layout'}
              </span>
            </div>
            {saveErrors.responsive && <p className="ds-error">{saveErrors.responsive}</p>}
            {savedFlash === 'responsive' && <p className="ds-saved">Saved</p>}
          </section>
          )}

        </div>

        {/* Live preview */}
        <div className="ds-preview" data-theme={previewTheme === 'dark' ? 'dark' : undefined}>
          <div className="ds-preview-bar">
            <span className="ds-preview-label">Live preview</span>
            <div className="ds-preview-toggle">
              <button type="button" className={`ds-tab${previewTheme === 'light' ? ' ds-tab--active' : ''}`} onClick={() => setPreviewTheme('light')}>Light</button>
              <button type="button" className={`ds-tab${previewTheme === 'dark' ? ' ds-tab--active' : ''}`} onClick={() => setPreviewTheme('dark')}>Dark</button>
            </div>
          </div>

          <div className="ds-preview-body">
            <div className="ds-preview-row">
              <button type="button" className="btn btn-primary">Filled</button>
              <button type="button" className="btn btn-secondary">Secondary</button>
              <button type="button" className="btn btn-ghost">Ghost</button>
              <button type="button" className="btn btn-danger">Danger</button>
            </div>

            <div className="ds-preview-row">
              <span className="badge badge-teal">Teal</span>
              <span className="badge badge-gold">Warning</span>
              <span className="badge badge-red">Danger</span>
              <span className="badge badge-green">Success</span>
              <span className="badge badge-blue">Info</span>
              <span className="badge badge-purple">Accent</span>
            </div>

            <div className="ds-preview-row">
              <span className="status-pill spl-teal">Active</span>
              <span className="status-pill spl-amber">Pending</span>
              <span className="status-pill spl-red">Overdue</span>
              <span className="status-pill spl-green">Done</span>
            </div>

            <div className="card ds-preview-card">
              <h3 className="ds-preview-card-title">Card title</h3>
              <p className="ds-preview-card-body">
                This card uses the app's real <code>.card</code> class — background, border,
                radius and shadow all come straight from the tokens on the left.
              </p>
              <div className="ds-preview-nav-item">Navigation item</div>
            </div>

            <div className="ds-preview-type-scale">
              <div style={{ fontSize: 'var(--text-3xl)' }}>Heading 3XL</div>
              <div style={{ fontSize: 'var(--text-2xl)' }}>Heading 2XL</div>
              <div style={{ fontSize: 'var(--text-xl)' }}>Heading XL</div>
              <div style={{ fontSize: 'var(--text-lg)' }}>Heading LG</div>
              <div style={{ fontSize: 'var(--text-md)' }}>Body MD</div>
              <div style={{ fontSize: 'var(--text-base)' }}>Body base</div>
              <div style={{ fontSize: 'var(--text-sm)' }}>Caption SM</div>
              <div style={{ fontSize: 'var(--text-xs)' }}>Caption XS</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DesignSystemView;
