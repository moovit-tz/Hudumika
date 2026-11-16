import React, { useState } from 'react';
import '../DesignSystemView.css';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColorSwatchPicker } from '@/components/ui/color-swatch-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import {
  DENSITY_IDS,
  DENSITY_LABELS,
  DENSITY_PRESETS,
  FONT_IDS,
  FONT_LABELS,
  SHADOW_IDS,
  SHADOW_LABELS,
  SHADOW_PRESETS,
  type DensityId,
  type FontId,
  type NeutralSet,
  type SemanticSet,
  type TabsTokens,
} from '../../hooks/useDesignSystem.js';
import { ColorField, NumberField, type DesignStudioController, type SidebarStyle } from './helpers.js';

const NEUTRAL_LABELS: Record<keyof NeutralSet, { title: string; desc: string }> = {
  ink: { title: 'Text Primary', desc: 'Main headings and primary reading copy' },
  ink2: { title: 'Text Secondary', desc: 'Supporting body text, labels and metadata' },
  ink3: { title: 'Text Muted', desc: 'Placeholders, subtle timestamps and hints' },
  bg: { title: 'Page Background', desc: 'Underlying canvas and scaffold surface' },
  white: { title: 'Card / Surface', desc: 'Panels, popovers and elevated surfaces' },
  cardSunken: { title: 'Sunken Surface', desc: 'Card headers, code blocks and detail insets' },
  border: { title: 'Border Default', desc: 'Subtle separators and input perimeters' },
  border2: { title: 'Border Strong', desc: 'Focused states and emphasized cards' },
};

const SEMANTIC_CONFIG: Record<keyof SemanticSet, { title: string; desc: string; sample: string }> = {
  gold: { title: 'Warning', desc: 'Pending actions, caution alerts and review banners', sample: 'Pending' },
  red: { title: 'Danger', desc: 'Destructive actions, error badges and overdue items', sample: 'Overdue' },
  green: { title: 'Success', desc: 'Completed transactions, active states and clearance', sample: 'Approved' },
  blue: { title: 'Info', desc: 'Informational toasts, notes and status indicators', sample: 'In Transit' },
  purple: { title: 'Accent', desc: 'Special highlights, AI recommendations and milestones', sample: 'Premium' },
  navy: { title: 'Navy Deep', desc: 'Contrasting solid surfaces and dark banners', sample: 'Platform' },
  navy2: { title: 'Navy Alt', desc: 'Secondary dark containers and header chrome', sample: 'System' },
};

const SHAPE_PRESETS = [
  { id: 'sharp', title: 'Sharp Minimal', desc: 'Tight 4px radius with crisp 1px borders.', rSm: 2, r: 4, rLg: 6, badgeRadius: 4, bw: 1 },
  { id: 'sleek', title: 'Sleek Modern', desc: 'Balanced 8px radius for enterprise web tools.', rSm: 4, r: 8, rLg: 12, badgeRadius: 8, bw: 1 },
  { id: 'standard', title: 'Standard Curved', desc: 'Standard 10px radius with 1.5px borders.', rSm: 6, r: 10, rLg: 16, badgeRadius: 10, bw: 1.5 },
  { id: 'soft', title: 'Soft Rounded', desc: 'Generous 14px radius for relaxed UI panels.', rSm: 8, r: 14, rLg: 20, badgeRadius: 14, bw: 1.5 },
  { id: 'pill', title: 'Ultra Pill', desc: 'Pill-shaped 20px radius with 2px borders.', rSm: 12, r: 20, rLg: 28, badgeRadius: 20, bw: 2 },
] as const;

const TAB_VARIANT_OPTIONS: { id: TabsTokens['variant']; title: string; desc: string }[] = [
  { id: 'underline', title: 'Underline Rule', desc: 'Minimalist active border line under the selected tab.' },
  { id: 'pill', title: 'Soft Pill', desc: 'Rounded background tint highlighting the active tab on a clean track.' },
  { id: 'segmented', title: 'Segmented Control', desc: 'Raised surface card on an inset sunken background track.' },
  { id: 'boxed', title: 'Boxed Chips', desc: 'Discrete bordered chips, not a shared track — the active chip gets a tinted fill.' },
  { id: 'outline', title: 'Outlined Chips', desc: 'Discrete chips where selection reads through the border alone, no fill change.' },
  { id: 'lifted', title: 'Lifted Tab', desc: 'Browser-tab style — the active tab rises to meet the panel below it.' },
];

export function BrandAndPaletteEditorSection({ studio }: { studio: DesignStudioController }) {
  const { tokens, seed, setSeed, themeTab, setThemeTab, handleGenerateFromSeed, save, saveErrors } = studio;
  const neutralKeys = Object.keys(NEUTRAL_LABELS) as (keyof NeutralSet)[];
  const semanticKeys = Object.keys(SEMANTIC_CONFIG) as (keyof SemanticSet)[];

  return (
    <div className="space-y-5">
      <div className="ds-generator-hero">
        <div className="ds-generator-content">
          <div className="ds-generator-title-row">
            <Icon name="sparkle" size={16} />
            <span className="ds-generator-title">Material 3 Tonal Palette Generator</span>
          </div>
          <p className="ds-generator-desc">
            Pick a seed brand color to mathematically derive a balanced neutral scale and primary tokens automatically.
          </p>
          <div className="ds-seed-control-group">
            <ColorSwatchPicker value={seed} onChange={setSeed} />
            <Button className="ds-btn-generate" type="button" onClick={handleGenerateFromSeed}>
              <Icon name="sparkle" size={14} />
              <span>Generate Tonal Scale</span>
            </Button>
          </div>
        </div>
      </div>

      <div>
        <div className="ds-subgroup-title">Primary Brand Token</div>
        <ColorField
          label="Brand Primary Accent"
          description="The global anchor hue used for primary action buttons, active tabs, focus rings, and accents."
          badgeText="Essential"
          value={tokens.brand.primary}
          onChange={v => save('brand', { brand: { primary: v } })}
        />
      </div>

      <div>
        <div className="ds-palette-tabs-header">
          <span className="ds-subgroup-title">Neutral &amp; Surface Scales</span>
          <div className="ds-mode-tabs">
            <button
              type="button"
              className={`ds-mode-tab${themeTab === 'light' ? ' ds-mode-tab--active' : ''}`}
              onClick={() => setThemeTab('light')}
              data-ui-native-button=""
            >
              <Icon name="sun" size={13} />
              <span>Light Mode</span>
            </button>
            <button
              type="button"
              className={`ds-mode-tab${themeTab === 'dark' ? ' ds-mode-tab--active' : ''}`}
              onClick={() => setThemeTab('dark')}
              data-ui-native-button=""
            >
              <Icon name="moon" size={13} />
              <span>Dark Mode</span>
            </button>
          </div>
        </div>

        <div className="ds-tokens-grid">
          {neutralKeys.map(key => (
            <ColorField
              key={key}
              label={NEUTRAL_LABELS[key].title}
              description={NEUTRAL_LABELS[key].desc}
              value={tokens.neutral[themeTab][key] ?? ''}
              onChange={v =>
                save('neutral', {
                  neutral: {
                    ...tokens.neutral,
                    [themeTab]: { ...tokens.neutral[themeTab], [key]: v },
                  },
                })
              }
            />
          ))}
        </div>
      </div>

      <div>
        <div className="ds-subgroup-title">Semantic &amp; Status Colors ({themeTab === 'light' ? 'Light Mode' : 'Dark Mode'})</div>
        <div className="ds-tokens-grid">
          {semanticKeys.map(key => {
            const cfg = SEMANTIC_CONFIG[key];
            return (
              <div key={key} className="ds-semantic-card-wrap">
                <ColorField
                  label={cfg.title}
                  description={cfg.desc}
                  badgeText={cfg.sample}
                  value={tokens.semantic[themeTab][key]}
                  onChange={v =>
                    save('semantic', {
                      semantic: {
                        ...tokens.semantic,
                        [themeTab]: { ...tokens.semantic[themeTab], [key]: v },
                      },
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      {(saveErrors.brand || saveErrors.neutral || saveErrors.semantic) && (
        <p className="ds-alert-error">{saveErrors.brand || saveErrors.neutral || saveErrors.semantic}</p>
      )}
    </div>
  );
}

export function TypographyEditorSection({ studio }: { studio: DesignStudioController }) {
  const { tokens, save, saveErrors } = studio;
  const scaleKeys = Object.keys(tokens.typography.scale) as (keyof typeof tokens.typography.scale)[];

  return (
    <div className="space-y-4">
      <div className="ds-form-group-card">
        <div className="ds-field-title-row">
          <span className="ds-field-label">Base Font Family</span>
          <span className="ds-field-badge">Active: {FONT_LABELS[tokens.typography.font]}</span>
        </div>
        <p className="ds-field-desc">Primary sans-serif typeface loaded across all shells and document interfaces.</p>
        <div className="ds-font-select-wrap">
          <Select
            value={tokens.typography.font}
            onValueChange={v => save('typography', { typography: { ...tokens.typography, font: v as FontId } })}
          >
            <SelectTrigger className="ds-select-trigger" aria-label="Primary font">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_IDS.map(id => (
                <SelectItem key={id} value={id}>
                  {FONT_LABELS[id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <div className="ds-subgroup-title">Type Scale Steps (px)</div>
        <div className="ds-numbers-grid">
          {scaleKeys.map(key => (
            <NumberField
              key={key}
              label={`Step ${key.toUpperCase()}`}
              suffix="px"
              min={8}
              max={96}
              value={tokens.typography.scale[key]}
              onChange={v =>
                save('typography', {
                  typography: {
                    ...tokens.typography,
                    scale: { ...tokens.typography.scale, [key]: v },
                  },
                })
              }
            />
          ))}
        </div>
      </div>

      {saveErrors.typography && <p className="ds-alert-error">{saveErrors.typography}</p>}
    </div>
  );
}

export function LayoutCustomizerSection({ studio }: { studio: DesignStudioController }) {
  const {
    tokens,
    save,
    saveErrors,
    menuDefault,
    setMenuDefault,
    sidebarStyle,
    setSidebarStyle,
    navbarType,
    setNavbarType,
    contentWidth,
    setContentWidth,
    skin,
    setSkin,
    direction,
    setDirection,
  } = studio;
  const isMobileNow = useIsMobile();

  const densityDesc: Record<DensityId, string> = {
    compact: 'High data density for heavy analytical and operational tables (~28-32px rows).',
    default: 'Balanced ergonomic spacing optimized for general business SaaS screens.',
    comfortable: 'Spacious layout with generous touch targets and relaxed padding (~44-48px).',
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="ds-subgroup-title">Content Density Presets</div>
        <div className="ds-variant-cards-grid">
          {DENSITY_IDS.map(id => {
            const isSelected = tokens.density === id;
            const p = DENSITY_PRESETS[id];
            return (
              <button
                key={id}
                type="button"
                className={`ds-variant-card${isSelected ? ' ds-variant-card--active' : ''}`}
                onClick={() => save('density', { density: id })}
                data-ui-native-button=""
              >
                <div className="ds-variant-top">
                  <span className="ds-variant-title">{DENSITY_LABELS[id]}</span>
                  {isSelected && <span className="ds-version-check"><Icon name="check" size={11} /></span>}
                </div>
                <p className="ds-variant-desc">{densityDesc[id]}</p>
                <p className="text-[11px] font-mono text-muted-foreground mt-2">
                  gap {p.contentGap}px · btn {p.btnPy}px · input {p.inputPy}px · cell {p.cellPy}px
                </p>
              </button>
            );
          })}
        </div>
        {saveErrors.density && <p className="ds-alert-error">{saveErrors.density}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="ds-subgroup-title">Sidebar Menu Default State</div>
          <div className="ds-layout-options-grid">
            {[
              { id: 'expanded', title: 'Expanded Sidebar', desc: 'Full width navigation with labels and section groups visible.' },
              { id: 'collapsed', title: 'Collapsed Sidebar', desc: 'Compact icon-only rail maximizing horizontal workspace area.' },
            ].map(opt => {
              const isSelected = menuDefault === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`ds-layout-option-card${isSelected ? ' ds-layout-option-card--active' : ''}`}
                  onClick={() => setMenuDefault(opt.id as 'expanded' | 'collapsed')}
                  data-ui-native-button=""
                >
                  <div className="ds-layout-option-top">
                    <span className="ds-layout-option-title">{opt.title}</span>
                    {isSelected && <span className="ds-version-check"><Icon name="check" size={11} /></span>}
                  </div>
                  <p className="ds-layout-option-desc">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="ds-subgroup-title">Canvas Content Width</div>
          <div className="ds-layout-options-grid">
            {[
              { id: 'compact', title: 'Compact (Boxed)', desc: 'Constrained centered layout with optimal ergonomic reading line lengths.' },
              { id: 'wide', title: 'Wide (Full Bleed)', desc: 'Spans the entire available browser width for dense data dashboards.' },
            ].map(opt => {
              const isSelected = contentWidth === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`ds-layout-option-card${isSelected ? ' ds-layout-option-card--active' : ''}`}
                  onClick={() => setContentWidth(opt.id as 'compact' | 'wide')}
                  data-ui-native-button=""
                >
                  <div className="ds-layout-option-top">
                    <span className="ds-layout-option-title">{opt.title}</span>
                    {isSelected && <span className="ds-version-check"><Icon name="check" size={11} /></span>}
                  </div>
                  <p className="ds-layout-option-desc">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="ds-subgroup-title">Sidebar Navigation Style</div>
          <div className="ds-layout-options-grid">
            {[
              { id: 'dark' as SidebarStyle, title: 'Dark (Default)', desc: "Always deep dark forest sidebar regardless of the page's light or dark mode." },
              { id: 'light' as SidebarStyle, title: 'Light', desc: 'Clean white sidebar — works in both light and dark page themes.' },
              { id: 'system' as SidebarStyle, title: 'System (Match Page)', desc: 'Adapts automatically: light in light mode, dark in dark mode.' },
            ].map(opt => {
              const isSelected = sidebarStyle === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`ds-layout-option-card${isSelected ? ' ds-layout-option-card--active' : ''}`}
                  onClick={() => setSidebarStyle(opt.id)}
                  data-ui-native-button=""
                >
                  <div className="ds-layout-option-top">
                    <span className="ds-layout-option-title">{opt.title}</span>
                    {isSelected && <span className="ds-version-check"><Icon name="check" size={11} /></span>}
                  </div>
                  <p className="ds-layout-option-desc">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="ds-subgroup-title">Top Navigation Bar Type</div>
          <div className="ds-layout-options-grid">
            {[
              { id: 'sticky', title: 'Sticky Topbar', desc: 'Stays pinned at the top while viewport content scrolls underneath.' },
              { id: 'static', title: 'Static Topbar', desc: 'Scrolls naturally with the page content body.' },
              { id: 'hidden', title: 'Hidden Header', desc: 'Compact mode hiding topbar chrome for full screen immersive flows.' },
            ].map(opt => {
              const isSelected = navbarType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`ds-layout-option-card${isSelected ? ' ds-layout-option-card--active' : ''}`}
                  onClick={() => setNavbarType(opt.id as 'sticky' | 'static' | 'hidden')}
                  data-ui-native-button=""
                >
                  <div className="ds-layout-option-top">
                    <span className="ds-layout-option-title">{opt.title}</span>
                    {isSelected && <span className="ds-version-check"><Icon name="check" size={11} /></span>}
                  </div>
                  <p className="ds-layout-option-desc">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="ds-subgroup-title">Surface Skin Styling</div>
          <div className="ds-layout-options-grid">
            {[
              { id: 'default', title: 'Default (Elevated)', desc: 'Clean cards with subtle layered shadows and soft background tone.' },
              { id: 'bordered', title: 'Bordered (High Contrast)', desc: 'Explicit outline borders around every card, panel, and toolbar element.' },
            ].map(opt => {
              const isSelected = skin === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`ds-layout-option-card${isSelected ? ' ds-layout-option-card--active' : ''}`}
                  onClick={() => setSkin(opt.id as 'default' | 'bordered')}
                  data-ui-native-button=""
                >
                  <div className="ds-layout-option-top">
                    <span className="ds-layout-option-title">{opt.title}</span>
                    {isSelected && <span className="ds-version-check"><Icon name="check" size={11} /></span>}
                  </div>
                  <p className="ds-layout-option-desc">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="ds-subgroup-title">Text Flow &amp; Direction</div>
          <div className="ds-layout-options-grid">
            {[
              { id: 'ltr', title: 'Left to Right (LTR)', desc: 'Standard Latin and international left-to-right text orientation.' },
              { id: 'rtl', title: 'Right to Left (RTL)', desc: 'Mirrored text direction for Arabic and Hebrew language locales.' },
            ].map(opt => {
              const isSelected = direction === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`ds-layout-option-card${isSelected ? ' ds-layout-option-card--active' : ''}`}
                  onClick={() => setDirection(opt.id as 'ltr' | 'rtl')}
                  data-ui-native-button=""
                >
                  <div className="ds-layout-option-top">
                    <span className="ds-layout-option-title">{opt.title}</span>
                    {isSelected && <span className="ds-version-check"><Icon name="check" size={11} /></span>}
                  </div>
                  <p className="ds-layout-option-desc">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="ds-subgroup-title">Responsive Viewport Breakpoint</div>
        <div className="ds-numbers-grid">
          <NumberField
            label="Adaptive Breakpoint"
            description="Threshold width for mobile drawer / bottom bar switch across useIsMobile()"
            suffix="px"
            step={1}
            min={320}
            max={1200}
            value={tokens.responsive.breakpoint}
            onChange={v => save('responsive', { responsive: { breakpoint: v } })}
          />
        </div>
        <div className="ds-live-breakpoint-status">
          <span className="ds-breakpoint-label">Current Viewport State:</span>
          <Badge variant={isMobileNow ? 'warning' : 'brand'}>
            {isMobileNow ? 'Mobile Layout Active' : 'Desktop Layout Active'}
          </Badge>
        </div>
        {saveErrors.responsive && <p className="ds-alert-error">{saveErrors.responsive}</p>}
      </div>
    </div>
  );
}

export function ShapeAndElevationEditorSection({ studio }: { studio: DesignStudioController }) {
  const { tokens, save, saveErrors } = studio;
  const [shadowPreviewTheme, setShadowPreviewTheme] = useState<'light' | 'dark'>('light');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="ds-subgroup-title">Shape &amp; Radius Variety Presets</div>
        <div className="ds-variant-cards-grid">
          {SHAPE_PRESETS.map(p => {
            const isSelected = tokens.shape.r === p.r && tokens.shape.rLg === p.rLg;
            return (
              <button
                key={p.id}
                type="button"
                className={`ds-variant-card${isSelected ? ' ds-variant-card--active' : ''}`}
                onClick={() =>
                  save('shape', {
                    shape: {
                      ...tokens.shape,
                      rSm: p.rSm,
                      r: p.r,
                      rLg: p.rLg,
                      badgeRadius: p.badgeRadius,
                      borderWidth: p.bw,
                    },
                  })
                }
                data-ui-native-button=""
              >
                <div className="ds-variant-top">
                  <span className="ds-variant-title">{p.title}</span>
                  {isSelected && <span className="ds-version-check"><Icon name="check" size={11} /></span>}
                </div>
                <p className="ds-variant-desc">{p.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="ds-numbers-grid">
        <NumberField
          label="Small Radius (sm)"
          description="Badges, mini buttons & chips"
          suffix="px"
          value={tokens.shape.rSm}
          onChange={v => save('shape', { shape: { ...tokens.shape, rSm: v } })}
        />
        <NumberField
          label="Base Radius (default)"
          description="Inputs, standard buttons & dialogs"
          suffix="px"
          value={tokens.shape.r}
          onChange={v => save('shape', { shape: { ...tokens.shape, r: v } })}
        />
        <NumberField
          label="Large Radius (lg)"
          description="Cards, panels & major containers"
          suffix="px"
          value={tokens.shape.rLg}
          onChange={v => save('shape', { shape: { ...tokens.shape, rLg: v } })}
        />
        <NumberField
          label="Badge Radius"
          description="Status indicators & count pills"
          suffix="px"
          value={tokens.shape.badgeRadius}
          onChange={v => save('shape', { shape: { ...tokens.shape, badgeRadius: v } })}
        />
        <NumberField
          label="Border Width"
          description="Input and button outline thickness"
          suffix="px"
          step={0.5}
          min={0}
          value={tokens.shape.borderWidth}
          onChange={v => save('shape', { shape: { ...tokens.shape, borderWidth: v } })}
        />
        <NumberField
          label="Card Border Width"
          description="Card outlines following Border Default"
          suffix="px"
          step={0.5}
          min={0}
          value={tokens.shape.cardBorderWidth ?? 1}
          onChange={v => save('shape', { shape: { ...tokens.shape, cardBorderWidth: v } })}
        />
        <NumberField
          label="Icon Stroke Weight"
          description="Default SVG stroke thickness"
          suffix="px"
          step={0.25}
          min={1}
          max={3.5}
          value={tokens.shape.iconStrokeWidth}
          onChange={v => save('shape', { shape: { ...tokens.shape, iconStrokeWidth: v } })}
        />
        <NumberField
          label="Breadcrumb Size"
          description="Header uppercase breadcrumb trail"
          suffix="px"
          min={9}
          max={16}
          value={tokens.shape.breadcrumbSize}
          onChange={v => save('shape', { shape: { ...tokens.shape, breadcrumbSize: v } })}
        />
      </div>

      <div className="ds-interactive-preview-card">
        <span className="ds-preview-mini-label">LIVE SHAPE MORPHING</span>
        <div className="ds-shape-swatch-row">
          <div className="ds-shape-specimen" style={{ borderRadius: `${tokens.shape.rSm}px` }}>
            <span>sm ({tokens.shape.rSm}px)</span>
          </div>
          <div className="ds-shape-specimen" style={{ borderRadius: `${tokens.shape.r}px` }}>
            <span>base ({tokens.shape.r}px)</span>
          </div>
          <div className="ds-shape-specimen" style={{ borderRadius: `${tokens.shape.rLg}px` }}>
            <span>lg ({tokens.shape.rLg}px)</span>
          </div>
          <div className="ds-shape-specimen" style={{ borderRadius: `${tokens.shape.badgeRadius}px` }}>
            <span>badge ({tokens.shape.badgeRadius}px)</span>
          </div>
          <div
            className="ds-shape-specimen ds-shape-specimen--stroke"
            style={{
              borderRadius: `${tokens.shape.r}px`,
              borderWidth: `${tokens.shape.borderWidth}px`,
            }}
          >
            <Icon name="shapes" size={20} strokeWidth={tokens.shape.iconStrokeWidth} color="var(--teal)" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="ds-palette-tabs-header">
          <div>
            <div className="ds-subgroup-title">Elevation &amp; Shadows ({SHADOW_IDS.length} Presets)</div>
            <p className="text-xs text-muted-foreground">Select the active platform-wide shadow and depth profile.</p>
          </div>
          <div className="ds-mode-tabs">
            <button
              type="button"
              className={`ds-mode-tab${shadowPreviewTheme === 'light' ? ' ds-mode-tab--active' : ''}`}
              onClick={() => setShadowPreviewTheme('light')}
              data-ui-native-button=""
            >
              <Icon name="sun" size={13} />
              <span>Light Samples</span>
            </button>
            <button
              type="button"
              className={`ds-mode-tab${shadowPreviewTheme === 'dark' ? ' ds-mode-tab--active' : ''}`}
              onClick={() => setShadowPreviewTheme('dark')}
              data-ui-native-button=""
            >
              <Icon name="moon" size={13} />
              <span>Dark Samples</span>
            </button>
          </div>
        </div>

        <div
          className="ds-shadow-cards-grid p-3 rounded-xl border border-border"
          data-theme={shadowPreviewTheme === 'dark' ? 'dark' : undefined}
          style={{
            background: shadowPreviewTheme === 'dark' ? 'var(--bg)' : undefined,
          }}
        >
          {SHADOW_IDS.map(id => {
            const isSelected = tokens.elevation === id;
            const shadowCss = SHADOW_PRESETS[id][shadowPreviewTheme]?.base || 'none';
            return (
              <button
                key={id}
                type="button"
                className={`ds-shadow-card${isSelected ? ' ds-shadow-card--active' : ''}`}
                onClick={() => save('elevation', { elevation: id })}
                data-ui-native-button=""
              >
                <div className="ds-shadow-sample" style={{ boxShadow: shadowCss }} />
                <div className="ds-shadow-meta">
                  <span className="ds-shadow-title">{SHADOW_LABELS[id]}</span>
                  {isSelected && <span className="ds-theme-check-mini"><Icon name="check" size={10} /></span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {(saveErrors.shape || saveErrors.elevation) && (
        <p className="ds-alert-error">{saveErrors.shape || saveErrors.elevation}</p>
      )}
    </div>
  );
}

export function MotionEditorSection({ studio }: { studio: DesignStudioController }) {
  const { tokens, motionTrigger, setMotionTrigger, save, saveErrors } = studio;
  const isMobile = useIsMobile();

  return (
    <div className="space-y-4">
      <div className="ds-numbers-grid">
        <NumberField
          label="Fast Duration"
          description="Hovers & toggle switches"
          suffix="ms"
          value={tokens.motion.durFast}
          onChange={v => save('motion', { motion: { ...tokens.motion, durFast: v } })}
        />
        <NumberField
          label="Base Duration"
          description="Dropdowns & popovers"
          suffix="ms"
          value={tokens.motion.dur}
          onChange={v => save('motion', { motion: { ...tokens.motion, dur: v } })}
        />
        <NumberField
          label="Slow Duration"
          description="Page transitions & slideouts"
          suffix="ms"
          value={tokens.motion.durSlow}
          onChange={v => save('motion', { motion: { ...tokens.motion, durSlow: v } })}
        />
      </div>

      <div className="ds-form-group-card space-y-2">
        <Label htmlFor="ds-motion-easing" className="ds-field-label">
          Easing Curve (CSS timing-function)
        </Label>
        <Input
          id="ds-motion-easing"
          type="text"
          className="font-mono text-xs"
          value={tokens.motion.ease}
          onChange={e => save('motion', { motion: { ...tokens.motion, ease: e.target.value } })}
        />
      </div>

      <div className="ds-interactive-preview-card">
        <div className="ds-motion-sandbox-top">
          <span className="ds-preview-mini-label">LIVE ANIMATION SANDBOX</span>
          <Button size="sm" type="button" onClick={() => setMotionTrigger(c => c + 1)}>
            <Icon name="zap" size={13} />
            <span>Trigger Animation Test</span>
          </Button>
        </div>

        <div className="ds-motion-sandbox-track overflow-hidden">
          <div
            className="ds-motion-ball"
            style={{
              transition: `all ${tokens.motion.dur}ms ${tokens.motion.ease}`,
              transform: motionTrigger % 2 === 1 ? (isMobile ? 'translateX(160px)' : 'translateX(280px)') : 'translateX(0)',
            }}
          >
            <Icon name="sparkle" size={16} />
          </div>
        </div>
      </div>

      {saveErrors.motion && <p className="ds-alert-error">{saveErrors.motion}</p>}
    </div>
  );
}

export function TabsAndDropdownsEditorSection({ studio }: { studio: DesignStudioController }) {
  const { tokens, save, saveErrors } = studio;
  const [tabsBadgeDemo, setTabsBadgeDemo] = useState('all');

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="ds-section-header-block">
          <h3 className="ds-section-heading">Tabs &amp; Navigation Strips</h3>
          <p className="ds-section-sub">
            One format for tabs and navigation strips across apps. Tab touch targets remain at least 44px.
          </p>
        </div>

        <div className="ds-variant-cards-grid">
          {TAB_VARIANT_OPTIONS.map(v => {
            const isSelected = tokens.tabs.variant === v.id;
            return (
              <button
                key={v.id}
                type="button"
                className={`ds-variant-card${isSelected ? ' ds-variant-card--active' : ''}`}
                onClick={() => save('tabs', { tabs: { ...tokens.tabs, variant: v.id } })}
                data-ui-native-button=""
              >
                <div className="ds-variant-top">
                  <span className="ds-variant-title">{v.title}</span>
                  {isSelected && <span className="ds-version-check"><Icon name="check" size={11} /></span>}
                </div>
                <p className="ds-variant-desc">{v.desc}</p>
              </button>
            );
          })}
        </div>

        <div className="ds-numbers-grid">
          <NumberField
            label="Corner Radius"
            suffix="px"
            min={0}
            value={tokens.tabs.radius}
            onChange={v => save('tabs', { tabs: { ...tokens.tabs, radius: v } })}
          />
          <NumberField
            label="Tab Height"
            suffix="px"
            min={44}
            value={Math.max(44, tokens.tabs.height)}
            onChange={v => save('tabs', { tabs: { ...tokens.tabs, height: v } })}
          />
          <NumberField
            label="Label Font Size"
            suffix="px"
            step={0.5}
            min={9}
            value={tokens.tabs.size}
            onChange={v => save('tabs', { tabs: { ...tokens.tabs, size: v } })}
          />
        </div>

        <div className="ds-interactive-preview-card">
          <span className="ds-preview-mini-label">LIVE TAB COMPONENT RENDERING</span>
          <Tabs defaultValue="one" className="ds-preview-tab-wrapper">
            <TabsList>
              <TabsTrigger value="one">Overview</TabsTrigger>
              <TabsTrigger value="two">Declarations</TabsTrigger>
              <TabsTrigger value="three">Audit History</TabsTrigger>
            </TabsList>
            <TabsContent value="one" className="ds-tab-content-box">
              <p>Tab panel for <strong>Overview</strong> demonstrating active token variant and height.</p>
            </TabsContent>
            <TabsContent value="two" className="ds-tab-content-box">
              <p>Declarations data stream view panel.</p>
            </TabsContent>
            <TabsContent value="three" className="ds-tab-content-box">
              <p>Audit history records table preview.</p>
            </TabsContent>
          </Tabs>
        </div>

        <div className="ds-interactive-preview-card">
          <span className="ds-preview-mini-label">FILTER ROW WITH COUNT BADGES — SAME CONTROL</span>
          <Tabs value={tabsBadgeDemo} onValueChange={setTabsBadgeDemo}>
            <TabsList>
              {[
                { key: 'all', icon: 'grid' as IconName, label: 'All', count: 27 },
                { key: 'logistics', icon: 'package' as IconName, label: 'Logistics & Trade', count: 6 },
                { key: 'finance', icon: 'dollarSign' as IconName, label: 'Finance & Accounts', count: 2 },
              ].map(t => (
                <TabsTrigger key={t.key} value={t.key}>
                  <Icon name={t.icon} size={13} />
                  <span className="ds-tabs-trigger-label">{t.label}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 'var(--r-lg)',
                      lineHeight: 1.5,
                      background: tabsBadgeDemo === t.key ? 'var(--teal-l)' : 'var(--bg)',
                      color: tabsBadgeDemo === t.key ? 'var(--teal)' : 'var(--ink3)',
                    }}
                  >
                    {t.count}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {saveErrors.tabs && <p className="ds-alert-error">{saveErrors.tabs}</p>}
      </div>

      <div className="space-y-3">
        <div className="ds-section-header-block">
          <h3 className="ds-section-heading">Dropdowns, Selects &amp; Popover Varieties</h3>
          <p className="ds-section-sub">Select popover style, dropdown menu hover feedback, trigger density, and list item spacing.</p>
        </div>

        <div className="ds-variant-cards-grid">
          {[
            { id: 'clean', title: 'Clean Bordered Select', desc: 'Crisp 1px outline popup with subtle gray item hover highlighting.' },
            { id: 'floating', title: 'Floating Soft Shadow', desc: 'Elevated popover with soft shadow depth and rounded item corners.' },
            { id: 'tinted', title: 'Teal Accent Highlight', desc: 'Vibrant teal background tint on hovered and selected menu items.' },
            { id: 'compact', title: 'High-Density Compact', desc: 'Compact trigger height and tight row padding for data grids.' },
          ].map(v => (
            <div key={v.id} className="ds-variant-card ds-variant-card--active" style={{ padding: 18 }}>
              <div className="ds-variant-top">
                <span className="ds-variant-title">{v.title}</span>
                <Badge variant="brand">Active</Badge>
              </div>
              <p className="ds-variant-desc">{v.desc}</p>
              <div style={{ marginTop: 12 }}>
                <Select defaultValue="option-1">
                  <SelectTrigger style={{ width: '100%' }} aria-label={`${v.title} example`}>
                    <SelectValue placeholder="Choose option..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="option-1">Option 1 — Standard Selection</SelectItem>
                    <SelectItem value="option-2">Option 2 — Secondary Item</SelectItem>
                    <SelectItem value="option-3">Option 3 — Analytics Metric</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
