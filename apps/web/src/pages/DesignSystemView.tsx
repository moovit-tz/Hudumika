import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useDesignSystem, DesignTokens, NeutralSet, SemanticSet, DesignSystemVersion, DensityId,
  FONT_IDS, FONT_LABELS, DENSITY_IDS, DENSITY_LABELS, SHADOW_IDS, SHADOW_LABELS,
  SHADOW_PRESETS, generateFromSeed, PLATFORM_THEMES,
  ICON_LIBRARY_IDS, ICON_LIBRARY_LABELS, ICON_LIBRARY_DESCRIPTIONS, type IconLibraryId,
} from '../hooks/useDesignSystem.js';
import { pushBranding } from '../hooks/useBranding.js';
import { ALL_APP_IDS } from '@hudumika/types';
import './DesignSystemView.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { APP_PALETTE_SLOT } from '../shells/WorkspaceApp.js';
import { PageHeader } from '../components/PageHeader.js';
import { BrandingIdentitySection, BrandingAppsSection, BrandingLoginSection } from './BrandingView.js';
import ComponentShowcase from './ComponentShowcase.js';
import { TwotoneIcon, TWOTONE_ICONS } from '../components/ui/twotone-icon.js';
const OscarCatalog        = React.lazy(() => import('./OscarCatalog.js'));
const AnimationsShowcase  = React.lazy(() => import('./AnimationsShowcase.js'));
const BuildingBlocksShowcase = React.lazy(() => import('./BuildingBlocksShowcase.js'));
// HugeiconsIcon itself is a small runtime wrapper (cheap to import
// statically), but the actual icon artwork (hugeicons-map.ts, ~130 SVG
// modules) is deliberately NOT imported here — this file sits on the same
// eagerly-bundled path as the rest of the SuperAdmin shell, and a static
// import of that data would defeat Icon.tsx's own React.lazy() split for
// it. HugeiconsIconGrid below loads it via a dynamic import() instead.
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';

type SectionGroup = 'theming' | 'layout' | 'platform' | 'catalog';
const SECTIONS: { id: string; group: SectionGroup; label: string; icon: IconName; desc: string }[] = [
  { id: 'themes',     group: 'theming', label: 'Themes',            icon: 'sparkle',         desc: 'Global color presets & version engine' },
  { id: 'brand',      group: 'theming', label: 'Brand & Neutral',   icon: 'sun',             desc: 'Brand primary & neutral surface scales' },
  { id: 'semantic',   group: 'theming', label: 'Semantic',          icon: 'tag',             desc: 'Status, alert & feedback colors' },
  { id: 'typography', group: 'theming', label: 'Typography',        icon: 'fileText',        desc: 'Font family & type scale ladder' },
  { id: 'shape',      group: 'theming', label: 'Shape & Radius',    icon: 'shapes',          desc: 'Corner radii, borders & icon weights' },
  { id: 'tabs',       group: 'theming', label: 'Tabs & Strips',     icon: 'layoutDashboard', desc: 'Tab variants, track styling & sizes' },
  { id: 'elevation',  group: 'theming', label: 'Elevation',         icon: 'layers',          desc: 'Layered shadow & depth scales' },
  { id: 'density',    group: 'theming', label: 'Density',           icon: 'grid3',           desc: 'Component compact & comfortable scale' },
  { id: 'motion',     group: 'theming', label: 'Motion',            icon: 'zap',             desc: 'Transition durations & easing curves' },
  { id: 'menu',       group: 'layout',  label: 'Menu Behavior',     icon: 'sidebar',         desc: 'Sidebar initial collapse & expansion' },
  { id: 'navbar',     group: 'layout',  label: 'Navbar Mode',       icon: 'layoutDashboard', desc: 'Sticky, static or hidden top navigation' },
  { id: 'content',    group: 'layout',  label: 'Content Width',     icon: 'maximize',        desc: 'Boxed compact vs full-bleed wide layout' },
  { id: 'skin',       group: 'layout',  label: 'Surface Skin',      icon: 'image',           desc: 'Default sleek vs high-contrast bordered' },
  { id: 'semidark',   group: 'layout',  label: 'Semi Dark',         icon: 'moon',            desc: 'Dark sidebar navigation in light mode' },
  { id: 'direction',  group: 'layout',  label: 'Text Direction',    icon: 'compass',         desc: 'Left-to-Right and RTL text flow' },
  { id: 'mobile',     group: 'layout',  label: 'Responsive Break',  icon: 'smartphone',      desc: 'Adaptive mobile viewport breakpoint' },
  { id: 'identity',   group: 'platform', label: 'Identity & Brand', icon: 'image',           desc: 'Nomenclature, logos, favicons & assets' },
  { id: 'apps',       group: 'platform', label: 'App Configurator', icon: 'grid',            desc: 'Per-app names, accents, slogans & icons' },
  { id: 'login',      group: 'platform', label: 'Login Screen',     icon: 'logIn',           desc: 'Authentication screen themes & headers' },
  { id: 'components', group: 'catalog',  label: 'Component Catalog',icon: 'layers',          desc: 'Live interactive Radix component showcase' },
  { id: 'blocks',     group: 'catalog',  label: 'Building Blocks',  icon: 'layoutDashboard', desc: 'Pre-built page sections, metric grids & form blocks inspired by shadcn/ui' },
  { id: 'dropdowns',  group: 'catalog',  label: 'Dropdowns & Selects', icon: 'chevronDown',   desc: 'Select menus, popover dropdowns & combo box varieties' },
  { id: 'icons',      group: 'catalog',  label: 'Icon System',      icon: 'sparkle',         desc: 'Stroke icons & Twotone Rounded collection' },
  { id: 'oscar',      group: 'catalog',  label: 'Oscar Catalog',    icon: 'star',            desc: 'Oscar/DaisyUI-inspired component catalog with style switchers' },
  { id: 'animations', group: 'catalog',  label: 'Animations',       icon: 'zap',             desc: 'Keyframe animations, transitions, easing curves & micro-interactions' },
];

const SECTION_GROUPS: { id: SectionGroup; label: string; icon: IconName }[] = [
  { id: 'theming',  label: 'Theming',    icon: 'sparkle'  },
  { id: 'layout',   label: 'Layout',     icon: 'maximize' },
  { id: 'platform', label: 'Platform',   icon: 'shield'   },
  { id: 'catalog',  label: 'Catalog',    icon: 'layers'   },
];

/** Sections with no separate "live token preview" rail. */
const PANEL_ONLY_SECTIONS = new Set(['identity', 'apps', 'login', 'components', 'blocks', 'dropdowns', 'icons', 'oscar', 'animations']);

const NEUTRAL_LABELS: Record<keyof NeutralSet, { title: string; desc: string }> = {
  ink:        { title: 'Text Primary',      desc: 'Main headings and primary reading copy' },
  ink2:       { title: 'Text Secondary',    desc: 'Supporting body text, labels and metadata' },
  ink3:       { title: 'Text Muted',        desc: 'Placeholders, subtle timestamps and hints' },
  bg:         { title: 'Page Background',   desc: 'Underlying canvas and scaffold surface' },
  white:      { title: 'Card / Surface',    desc: 'Panels, popovers and elevated surfaces' },
  cardSunken: { title: 'Sunken Surface',    desc: 'Card headers, code blocks and detail insets' },
  border:     { title: 'Border Default',    desc: 'Subtle separators and input perimeters' },
  border2:    { title: 'Border Strong',     desc: 'Focused states and emphasized cards' },
};

const SEMANTIC_CONFIG: Record<keyof SemanticSet, { title: string; desc: string; sample: string }> = {
  gold:   { title: 'Warning',   desc: 'Pending actions, caution alerts and review banners', sample: 'Pending' },
  red:    { title: 'Danger',    desc: 'Destructive actions, error badges and overdue items', sample: 'Overdue' },
  green:  { title: 'Success',   desc: 'Completed transactions, active states and clearance', sample: 'Approved' },
  blue:   { title: 'Info',      desc: 'Informational toasts, notes and status indicators', sample: 'In Transit' },
  purple: { title: 'Accent',    desc: 'Special highlights, AI recommendations and milestones', sample: 'Premium' },
  navy:   { title: 'Navy Deep', desc: 'Contrasting solid surfaces and dark banners', sample: 'Platform' },
  navy2:  { title: 'Navy Alt',  desc: 'Secondary dark containers and header chrome', sample: 'System' },
};

function ColorField({
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
  const [local, setLocal] = useState(value);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(local);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  const isValidHex = /^#[0-9a-f]{6}$/i.test(local);

  return (
    <div className="ds-field-card">
      <div className="ds-field-info">
        <div className="ds-field-title-row">
          <span className="ds-field-label">{label}</span>
          {badgeText && <span className="ds-field-badge">{badgeText}</span>}
        </div>
        {description && <span className="ds-field-desc">{description}</span>}
      </div>

      <div className="ds-color-control">
        <div
          className="ds-swatch-box"
          style={{ backgroundColor: isValidHex ? local : '#888888' }}
          title="Click to pick color"
        >
          <input
            type="color"
            className="ds-swatch-native"
            value={isValidHex ? local : '#888888'}
            onChange={e => {
              setLocal(e.target.value);
              onChange(e.target.value);
            }}
          />
        </div>

        <div className="ds-color-input-wrap">
          <span className="ds-color-hash">#</span>
          <input
            type="text"
            className="ds-color-text-input"
            value={local.replace(/^#/, '')}
            onChange={e => {
              const val = '#' + e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
              setLocal(val);
            }}
            onBlur={() => {
              if (isValidHex) onChange(local);
            }}
          />
          <button
            type="button"
            className="ds-color-copy-btn"
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy Hex'}
          >
            <Icon name={copied ? 'check' : 'copy'} size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function NumberField({
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
        <input
          type="number"
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
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap p-3 rounded-xl bg-muted/40 border border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {STROKE_ICON_NAMES.length} stroke icons · click to copy JSX
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Size:</span>
          <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
            {[16, 20, 24, 28].map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setIconSize(sz)}
                className={`px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${
                  iconSize === sz ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {sz}px
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {STROKE_ICON_NAMES.map((name) => (
          <div
            key={name}
            onClick={() => handleCopy(name)}
            className="group relative flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer shadow-xs hover:shadow-sm"
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
          </div>
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
    teal:   'var(--teal)',
    green:  'var(--green, #10b981)',
    gold:   'var(--gold, #f59e0b)',
    purple: 'var(--purple, #8b5cf6)',
    red:    'var(--red, #ef4444)',
    ink:    'var(--ink)',
  };

  const handleCopy = (name: string) => {
    const code = `<TwotoneIcon name="${name}" size={${iconSize}} color="${colorMap[selectedColor]}" />`;
    navigator.clipboard?.writeText(code);
    setCopiedName(name);
    setTimeout(() => setCopiedName(null), 1200);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap p-3 rounded-xl bg-muted/40 border border-border">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color:</span>
          <div className="flex items-center gap-1.5">
            {(['teal', 'green', 'gold', 'purple', 'red', 'ink'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${
                  selectedColor === c ? 'scale-110 ring-2 ring-primary ring-offset-2' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: colorMap[c], borderColor: 'transparent' }}
                title={c}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Size:</span>
          <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
            {[18, 22, 26, 32].map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setIconSize(sz)}
                className={`px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${
                  iconSize === sz ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {sz}px
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {TWOTONE_ICON_NAMES.map((name) => (
          <div
            key={name}
            onClick={() => handleCopy(name)}
            className="group relative flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer shadow-xs hover:shadow-sm"
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
          </div>
        ))}
      </div>
    </div>
  );
}

// Real, officially licensed Hugeicons free-tier artwork
// (@hugeicons/core-free-icons) — its name→icon map is loaded via a dynamic
// import() rather than a static one at the top of this file, so its ~130
// SVG modules only ever download for someone who actually opens this tab,
// not for every SuperAdmin page load. Coverage is intentionally partial
// (verified real matches only, not guessed) — a name with no entry here is
// what Icon.tsx itself falls back to Stroke for platform-wide.
function HugeiconsIconGrid() {
  const [selectedColor, setSelectedColor] = useState<'teal' | 'green' | 'gold' | 'purple' | 'red' | 'ink'>('teal');
  const [iconSize, setIconSize] = useState(24);
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const [map, setMap] = useState<Record<string, IconSvgElement> | null>(null);

  useEffect(() => {
    let alive = true;
    import('../components/hugeicons-map.js').then((m) => { if (alive) setMap(m.HUGEICONS_MAP as Record<string, IconSvgElement>); });
    return () => { alive = false; };
  }, []);

  const colorMap = {
    teal: 'var(--teal)', green: 'var(--green, #10b981)', gold: 'var(--gold, #f59e0b)',
    purple: 'var(--purple, #8b5cf6)', red: 'var(--red, #ef4444)', ink: 'var(--ink)',
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
              <button
                key={c}
                type="button"
                onClick={() => setSelectedColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${
                  selectedColor === c ? 'scale-110 ring-2 ring-primary ring-offset-2' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: colorMap[c], borderColor: 'transparent' }}
                title={c}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Size:</span>
          <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
            {[18, 22, 26, 32].map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setIconSize(sz)}
                className={`px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${
                  iconSize === sz ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {sz}px
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {names.map((name) => (
          <div
            key={name}
            onClick={() => handleCopy(name)}
            className="group relative flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer shadow-xs hover:shadow-sm"
          >
            <div className="h-8 flex items-center justify-center">
              <HugeiconsIcon icon={map[name]} size={iconSize} color={colorMap[selectedColor]} />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground truncate max-w-full leading-tight text-center">
              {copiedName === name ? (
                <span className="text-emerald-500 font-bold">✓ copied</span>
              ) : (
                name
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ICON_TAB_META: Record<IconLibraryId, { label: string; count: number | null }> = {
  stroke: { label: 'Stroke Icons', count: STROKE_ICON_NAMES.length },
  twotone: { label: 'Twotone Rounded', count: TWOTONE_ICON_NAMES.length },
  hugeicons: { label: 'Hugeicons', count: null }, // resolved async once the tab is opened — see HugeiconsIconGrid
};

function IconSystemSection() {
  const { tokens, updateTokens } = useDesignSystem();
  // Browsing tab starts on whichever library is actually live for this
  // tenant — the same as opening any other design-system section on its
  // current value — but clicking around to look at another one doesn't by
  // itself change anything; that's what the "Use platform-wide" button
  // below is for.
  const [tab, setTab] = useState<IconLibraryId>(tokens.iconLibrary);
  const isActiveLibrary = tab === tokens.iconLibrary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="ds-section-header-block">
        <h3 className="ds-section-heading">Icon System</h3>
        <p className="ds-section-sub">
          Hudumika ships three icon libraries, switchable platform-wide.
          <strong> Stroke</strong> — the platform's own crisp 24×24 outline set (covers every icon name, the default).
          <strong> Twotone Rounded</strong> — a hand-authored Hugeicons-inspired dual-layer style.
          <strong> Hugeicons</strong> — real, officially licensed Hugeicons free-tier artwork.
          Browse a library below, then use <strong>Use platform-wide</strong> to make it what every &lt;Icon&gt; in the app actually renders — a name the chosen library doesn't cover quietly falls back to Stroke rather than going blank.
        </p>
      </div>

      {/* Library picker tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40 border border-border w-fit">
        {ICON_LIBRARY_IDS.map(id => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === id
                ? 'bg-card shadow-sm text-foreground border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
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

      {/* Description + platform-wide apply */}
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
          >
            Use {ICON_TAB_META[tab].label} platform-wide
          </button>
        )}
      </div>

      {/* Usage snippet */}
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

      {/* Icon grid */}
      {tab === 'stroke' && <StrokeIconGrid />}
      {tab === 'twotone' && <TwotoneIconGrid />}
      {tab === 'hugeicons' && <HugeiconsIconGrid />}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

export function DesignSystemView() {
  const { tokens, updateTokens, resetToDefaults, designSystemVersion, updateDesignSystemVersion } = useDesignSystem();
  const [v2ColorDraft, setV2ColorDraft] = useState(designSystemVersion.v2Color);
  useEffect(() => setV2ColorDraft(designSystemVersion.v2Color), [designSystemVersion.v2Color]);
  const isMobileNow = useIsMobile();

  const [themeTab, setThemeTab] = useState<'light' | 'dark'>('light');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [seed, setSeed] = useState(tokens.brand.primary);
  const [saveErrors, setSaveErrors] = useState<Record<string, string | undefined>>({});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  // Search & Mobile Drawer States
  const [railSearch, setRailSearch] = useState('');
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Motion test trigger state
  const [motionTrigger, setMotionTrigger] = useState(0);

  const [searchParams, setSearchParams] = useSearchParams();
  const initialSection = SECTIONS.some(s => s.id === searchParams.get('section')) ? searchParams.get('section')! : 'themes';
  const [activeSection, setActiveSectionState] = useState(initialSection);

  function setActiveSection(id: string) {
    setActiveSectionState(id);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('section', id);
      return next;
    }, { replace: true });
  }

  const activeTheme = PLATFORM_THEMES.find(
    t => t.tokens.brand?.primary?.toLowerCase() === tokens.brand.primary.toLowerCase()
  )?.id ?? null;

  async function save(section: string, partial: Partial<DesignTokens>) {
    try {
      await updateTokens(partial);
      setSaveErrors(e => ({ ...e, [section]: undefined }));
      setSavedFlash(section);
      window.setTimeout(() => setSavedFlash(f => (f === section ? null : f)), 1600);
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
    try {
      await Promise.all([
        updateTokens(theme.tokens),
        pushBranding({ apps, accentColor: theme.tokens.brand!.primary }),
      ]);
      setSaveErrors(e => ({ ...e, theme: undefined, apps: undefined }));
      setSavedFlash('theme');
      window.setTimeout(() => setSavedFlash(f => (f === 'theme' ? null : f)), 1600);
    } catch (err: any) {
      setSaveErrors(e => ({ ...e, theme: err?.message || 'Failed to apply theme preset' }));
    }
  }

  async function setVersion(version: DesignSystemVersion) {
    try {
      await updateDesignSystemVersion({ version });
      setSaveErrors(e => ({ ...e, version: undefined }));
      setSavedFlash('version');
      window.setTimeout(() => setSavedFlash(f => (f === 'version' ? null : f)), 1600);
    } catch (err: any) {
      setSaveErrors(e => ({ ...e, version: err?.message || 'Failed to update version' }));
    }
  }

  async function commitV2Color() {
    if (!/^#[0-9a-f]{6}$/i.test(v2ColorDraft)) return;
    try {
      await updateDesignSystemVersion({ v2Color: v2ColorDraft });
      setSaveErrors(e => ({ ...e, version: undefined }));
      setSavedFlash('version');
      window.setTimeout(() => setSavedFlash(f => (f === 'version' ? null : f)), 1600);
    } catch (err: any) {
      setSaveErrors(e => ({ ...e, version: err?.message || 'Failed to update Mellon color' }));
    }
  }

  const neutralKeys: (keyof NeutralSet)[] = ['ink', 'ink2', 'ink3', 'bg', 'white', 'cardSunken', 'border', 'border2'];
  const semanticKeys: (keyof SemanticSet)[] = ['gold', 'red', 'green', 'blue', 'purple', 'navy', 'navy2'];

  // Layout customizer states
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

  const currentSectionMeta = SECTIONS.find(s => s.id === activeSection);

  // Built once and mounted in two places — the permanent desktop sidebar
  // and the mobile "Browse sections" drawer (same Dialog pattern already
  // used for the live-preview FAB below) — so both stay in lock-step with
  // zero duplicated markup.
  const isSearching = !!railSearch.trim();
  const q = railSearch.toLowerCase().trim();
  const sidebarNavContent = (
    <>
      <div className="ds-sidebar-search">
        <Icon name="search" size={13} className="ds-sidebar-search-icon" />
        <input
          type="text"
          className="ds-sidebar-search-input"
          placeholder="Search sections…"
          value={railSearch}
          onChange={(e) => setRailSearch(e.target.value)}
        />
        {railSearch && (
          <button type="button" className="ds-sidebar-search-clear" onClick={() => setRailSearch('')}>
            <Icon name="x" size={11} />
          </button>
        )}
      </div>

      <nav className="ds-sidebar-nav">
        {SECTION_GROUPS.map((g) => {
          const items = SECTIONS.filter((s) => s.group === g.id
            && (!isSearching || s.label.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q)));
          if (items.length === 0) return null;
          return (
            <div className="ds-sidebar-group" key={g.id}>
              <div className="ds-sidebar-group-label">
                <Icon name={g.icon} size={12} />
                <span>{g.label}</span>
              </div>
              {items.map((s) => {
                const isActive = activeSection === s.id;
                const isSpecial = s.id === 'blocks' || s.id === 'dropdowns' || s.id === 'oscar' || s.id === 'animations' || s.id === 'components';
                const badgeText = s.id === 'blocks' ? 'shadcn' : s.id === 'dropdowns' ? 'Radix' : s.id === 'oscar' ? 'Oscar' : s.id === 'animations' ? 'New' : s.id === 'components' ? 'Radix' : s.id === 'icons' ? '3 sets' : null;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`ds-sidebar-item ${isActive ? 'active' : ''}`}
                    onClick={() => { setActiveSection(s.id); setMobileNavOpen(false); }}
                    title={s.desc}
                  >
                    <Icon name={s.icon} size={15} className="ds-sidebar-item-icon" />
                    <span className="ds-sidebar-item-label">{s.label}</span>
                    {badgeText && (
                      <span className={`ds-sidebar-item-badge ${isSpecial ? 'special' : ''}`}>{badgeText}</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}

        {isSearching && SECTIONS.every((s) => !(s.label.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q))) && (
          <span className="ds-sidebar-empty">
            No section matches "{railSearch.trim()}" — try a different word, or{' '}
            <button type="button" className="ds-sidebar-empty-clear" onClick={() => setRailSearch('')}>clear the search</button>.
          </span>
        )}
      </nav>
    </>
  );

  return (
    <div className="ds-root">
      {/* Studio Header */}
      <PageHeader
        crumbs={['Platform Admin', 'Design System']}
        titlePlain="Design"
        titleEm="studio"
        subtitle="Manage platform-wide design tokens, tenant theming engines, layout parameters, and the shared component design system."
        actions={
          <div className="ds-header-actions">
            {!PANEL_ONLY_SECTIONS.has(activeSection) && (
              <button
                type="button"
                className="btn btn-secondary ds-btn-reset"
                onClick={() => resetToDefaults()}
              >
                <Icon name="refresh" size={14} />
                <span>Reset to defaults</span>
              </button>
            )}
            <div className="ds-version-chip">
              <span className="ds-version-dot" />
              <span>{designSystemVersion.version === 'v2' ? 'Mellon Brand' : 'v1 Standard'}</span>
            </div>
          </div>
        }
      />

      {/* Global system switches — v1/v2 engine, platform theme preset,
          icon library. Not navigation (that's the sidebar below), just the
          studio's own cross-cutting controls, so it gets its own slim bar
          rather than living in the section list. */}
      <div className="ds-system-bar">
        <div className="ds-top-switcher-pills">
          <button
            type="button"
            className={`ds-top-pill ${designSystemVersion.version === 'v1' ? 'active' : ''}`}
            onClick={() => setVersion('v1')}
          >
            v1 Standard
          </button>
          <button
            type="button"
            className={`ds-top-pill ${designSystemVersion.version === 'v2' ? 'active' : ''}`}
            onClick={() => setVersion('v2')}
          >
            v2 Mellon
          </button>
        </div>

        <div className="ds-top-switcher-divider" />

        <Select
          value={activeTheme || 'custom'}
          onValueChange={(val) => {
            if (val !== 'custom') applyPlatformTheme(val);
          }}
        >
          <SelectTrigger className="w-full sm:w-[160px] h-[34px] sm:h-[30px] text-xs font-semibold bg-background">
            <SelectValue placeholder="Custom Palette" />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_THEMES.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full border border-border inline-block flex-shrink-0"
                    style={{ backgroundColor: t.tokens.brand?.primary }}
                  />
                  <span>{t.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ds-top-switcher-divider" />

        <div className="ds-top-switcher-pills">
          {(['stroke', 'twotone', 'hugeicons'] as const).map((lib) => (
            <button
              key={lib}
              type="button"
              className={`ds-top-pill ${tokens.iconLibrary === lib ? 'active' : ''}`}
              onClick={() => updateTokens({ iconLibrary: lib })}
            >
              {lib === 'stroke' ? 'Stroke' : lib === 'twotone' ? 'Twotone' : 'Hugeicons'}
            </button>
          ))}
        </div>

        {/* Opens the same nav below in a drawer — the permanent sidebar is
            hidden below the mobile breakpoint. */}
        <button type="button" className="ds-mobile-nav-trigger" onClick={() => setMobileNavOpen(true)}>
          <Icon name="menu" size={14} />
          <span>Browse sections</span>
        </button>
      </div>

      {/* Studio Shell: permanent sidebar + content */}
      <div className="ds-studio-shell">
        <aside className="ds-sidebar">
          {sidebarNavContent}
        </aside>

        <div className="ds-main-column">
          {/* Main Studio Full-Bleed Grid */}
          <div className={`ds-layout ds-layout-fullbleed ${PANEL_ONLY_SECTIONS.has(activeSection) ? 'ds-layout--full' : ''}`}>


            {/* Configuration Panel */}
            <main className="ds-panel">
          
          {/* Active Section Banner */}
          {currentSectionMeta && (
            <div className="ds-section-hero">
              <FeaturedIcon variant="brand" size="lg" shape="square" className="ds-hero-icon-box">
                <Icon name={currentSectionMeta.icon} size={20} />
              </FeaturedIcon>
              <div className="ds-hero-text">
                <span className="ds-hero-eyebrow">
                  {SECTION_GROUPS.find((g) => g.id === currentSectionMeta.group)?.label ?? currentSectionMeta.group}
                </span>
                <h2 className="ds-hero-title">{currentSectionMeta.label}</h2>
                <p className="ds-hero-desc">{currentSectionMeta.desc}</p>
              </div>
              {savedFlash && (
                <div className="ds-hero-toast">
                  <Icon name="check" size={13} />
                  <span>Changes saved live</span>
                </div>
              )}
            </div>
          )}

          {/* 1. Themes */}
          {activeSection === 'themes' && (
            <section className="ds-card-section">
              <div className="ds-section-header-block">
                <h3 className="ds-section-heading">Platform Theme Presets</h3>
                <p className="ds-section-sub">
                  One-click application of a cohesive brand palette and coordinated per-app accent colors across all tenant workspaces.
                </p>
              </div>

              {/* Version Selector */}
              <div className="ds-engine-card">
                <div className="ds-engine-header">
                  <div className="ds-engine-title-wrap">
                    <span className="ds-engine-badge">ENGINE MODE</span>
                    <h4 className="ds-engine-title">Design System Architecture Version</h4>
                  </div>
                </div>

                <div className="ds-version-grid">
                  {[
                    { id: 'v1', title: 'v1 — Per-App Colors', desc: 'Active multi-hue palette with unique colors per application.' },
                    { id: 'v2', title: 'Mellon — Unified Brand', desc: 'Locks all applications to a single unified corporate brand color.' },
                    { id: 'v3', title: 'v3 — Next Gen', desc: 'Reserved next-generation token engine (runs standard v1 fallback).' },
                  ].map(ver => {
                    const isSelected = designSystemVersion.version === ver.id;
                    return (
                      <button
                        key={ver.id}
                        type="button"
                        className={`ds-version-card${isSelected ? ' ds-version-card--active' : ''}`}
                        onClick={() => setVersion(ver.id as DesignSystemVersion)}
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
                    <div className="ds-color-control">
                      <div className="ds-swatch-box" style={{ backgroundColor: v2ColorDraft }}>
                        <input
                          type="color"
                          className="ds-swatch-native"
                          value={v2ColorDraft}
                          onChange={e => {
                            setV2ColorDraft(e.target.value);
                            updateDesignSystemVersion({ v2Color: e.target.value });
                          }}
                        />
                      </div>
                      <div className="ds-color-input-wrap">
                        <span className="ds-color-hash">#</span>
                        <input
                          type="text"
                          className="ds-color-text-input"
                          value={v2ColorDraft.replace(/^#/, '')}
                          onChange={e => setV2ColorDraft('#' + e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6))}
                          onBlur={commitV2Color}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {saveErrors.version && <p className="ds-alert-error">{saveErrors.version}</p>}
              </div>

              {/* Theme Grid */}
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
                          <span key={i} className="ds-theme-palette-dot" style={{ background: c }} title={c} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
              {saveErrors.theme && <p className="ds-alert-error">{saveErrors.theme}</p>}
            </section>
          )}

          {/* 2. Brand & Neutral */}
          {activeSection === 'brand' && (
            <section className="ds-card-section">
              {/* Seed Generator Hero */}
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
                    <div className="ds-color-control">
                      <div className="ds-swatch-box" style={{ backgroundColor: seed }}>
                        <input
                          type="color"
                          className="ds-swatch-native"
                          value={seed}
                          onChange={e => setSeed(e.target.value)}
                        />
                      </div>
                      <div className="ds-color-input-wrap">
                        <span className="ds-color-hash">#</span>
                        <input
                          type="text"
                          className="ds-color-text-input"
                          value={seed.replace(/^#/, '')}
                          onChange={e => setSeed('#' + e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6))}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary ds-btn-generate"
                      onClick={handleGenerateFromSeed}
                    >
                      <Icon name="sparkle" size={14} />
                      <span>Generate Tonal Scale</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Primary Color Field */}
              <div className="ds-subgroup-title">Primary Brand Token</div>
              <ColorField
                label="Brand Primary Accent"
                description="The global anchor hue used for primary action buttons, active tabs, focus rings, and accents."
                badgeText="Essential"
                value={tokens.brand.primary}
                onChange={v => save('brand', { brand: { primary: v } })}
              />

              {/* Light / Dark Mode Toggle */}
              <div className="ds-palette-tabs-header">
                <span className="ds-subgroup-title">Neutral Palette Scales</span>
                <div className="ds-mode-tabs">
                  <button
                    type="button"
                    className={`ds-mode-tab${themeTab === 'light' ? ' ds-mode-tab--active' : ''}`}
                    onClick={() => setThemeTab('light')}
                  >
                    <Icon name="sun" size={13} />
                    <span>Light Mode</span>
                  </button>
                  <button
                    type="button"
                    className={`ds-mode-tab${themeTab === 'dark' ? ' ds-mode-tab--active' : ''}`}
                    onClick={() => setThemeTab('dark')}
                  >
                    <Icon name="moon" size={13} />
                    <span>Dark Mode</span>
                  </button>
                </div>
              </div>

              {/* Neutral Tokens Grid */}
              <div className="ds-tokens-grid">
                {neutralKeys.map(key => (
                  <ColorField
                    key={key}
                    label={NEUTRAL_LABELS[key]?.title ?? key}
                    description={NEUTRAL_LABELS[key]?.desc}
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

              {(saveErrors.brand || saveErrors.neutral) && (
                <p className="ds-alert-error">{saveErrors.brand || saveErrors.neutral}</p>
              )}
            </section>
          )}

          {/* 3. Semantic */}
          {activeSection === 'semantic' && (
            <section className="ds-card-section">
              <div className="ds-palette-tabs-header">
                <div>
                  <h3 className="ds-section-heading">Semantic &amp; Status Colors</h3>
                  <p className="ds-section-sub">Colors governing badges, alerts, system notifications and workflow statuses.</p>
                </div>
                <div className="ds-mode-tabs">
                  <button
                    type="button"
                    className={`ds-mode-tab${themeTab === 'light' ? ' ds-mode-tab--active' : ''}`}
                    onClick={() => setThemeTab('light')}
                  >
                    <Icon name="sun" size={13} />
                    <span>Light Mode</span>
                  </button>
                  <button
                    type="button"
                    className={`ds-mode-tab${themeTab === 'dark' ? ' ds-mode-tab--active' : ''}`}
                    onClick={() => setThemeTab('dark')}
                  >
                    <Icon name="moon" size={13} />
                    <span>Dark Mode</span>
                  </button>
                </div>
              </div>

              <div className="ds-tokens-grid">
                {semanticKeys.map(key => {
                  const cfg = SEMANTIC_CONFIG[key];
                  return (
                    <div key={key} className="ds-semantic-card-wrap">
                      <ColorField
                        label={cfg?.title ?? key}
                        description={cfg?.desc}
                        badgeText={cfg?.sample}
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

              {saveErrors.semantic && <p className="ds-alert-error">{saveErrors.semantic}</p>}
            </section>
          )}

          {/* 4. Typography */}
          {activeSection === 'typography' && (
            <section className="ds-card-section">
              <div className="ds-section-header-block">
                <h3 className="ds-section-heading">Font Family &amp; Type Hierarchy</h3>
                <p className="ds-section-sub">Base font stack used platform-wide alongside precise font size scale step mappings.</p>
              </div>

              <div className="ds-form-group-card">
                <div className="ds-field-title-row">
                  <span className="ds-field-label">Base Font Family</span>
                  <span className="ds-field-badge">Active: {FONT_LABELS[tokens.typography.font]}</span>
                </div>
                <p className="ds-field-desc">Primary sans-serif typeface loaded across all shells and document interfaces.</p>
                <div className="ds-font-select-wrap">
                  <Select
                    value={tokens.typography.font}
                    onValueChange={v => save('typography', { typography: { ...tokens.typography, font: v as any } })}
                  >
                    <SelectTrigger className="ds-select-trigger">
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

              <div className="ds-subgroup-title">Type Scale Steps (px)</div>
              <div className="ds-numbers-grid">
                {(Object.keys(tokens.typography.scale) as (keyof typeof tokens.typography.scale)[]).map(key => (
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

              {saveErrors.typography && <p className="ds-alert-error">{saveErrors.typography}</p>}
            </section>
          )}

          {/* 5. Shape & Radius */}
          {activeSection === 'shape' && (
            <section className="ds-card-section">
              <div className="ds-section-header-block">
                <h3 className="ds-section-heading">Shape, Radius &amp; Strokes</h3>
                <p className="ds-section-sub">Corner curvatures, border thickness, breadcrumb typography, and Lucide icon stroke weights.</p>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Shape &amp; Radius Variety Presets</div>
                <div className="ds-variant-cards-grid">
                  {[
                    { id: 'sharp', title: 'Sharp Minimal', desc: 'Tight 4px radius with crisp 1px borders.', rSm: 2, r: 4, rLg: 6, badgeRadius: 4, bw: 1 },
                    { id: 'sleek', title: 'Sleek Modern', desc: 'Balanced 8px radius for enterprise web tools.', rSm: 4, r: 8, rLg: 12, badgeRadius: 8, bw: 1 },
                    { id: 'standard', title: 'Standard Curved', desc: 'Standard 10px radius with 1.5px borders.', rSm: 6, r: 10, rLg: 16, badgeRadius: 10, bw: 1.5 },
                    { id: 'soft', title: 'Soft Rounded', desc: 'Generous 14px radius for relaxed UI panels.', rSm: 8, r: 14, rLg: 20, badgeRadius: 14, bw: 1.5 },
                    { id: 'pill', title: 'Ultra Pill', desc: 'Pill-shaped 20px radius with 2px borders.', rSm: 12, r: 20, rLg: 28, badgeRadius: 20, bw: 2 },
                  ].map(p => {
                    const isSelected = tokens.shape.r === p.r && tokens.shape.rLg === p.rLg;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`ds-variant-card${isSelected ? ' ds-variant-card--active' : ''}`}
                        onClick={() => save('shape', { shape: { ...tokens.shape, rSm: p.rSm, r: p.r, rLg: p.rLg, badgeRadius: p.badgeRadius, borderWidth: p.bw } })}
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
                  description="Input and card outline thickness"
                  suffix="px"
                  step={0.5}
                  min={0}
                  value={tokens.shape.borderWidth}
                  onChange={v => save('shape', { shape: { ...tokens.shape, borderWidth: v } })}
                />
                <NumberField
                  label="Icon Stroke Weight"
                  description="Default SVG stroke thickness"
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
                  step={0.5}
                  min={8}
                  value={tokens.shape.breadcrumbSize}
                  onChange={v => save('shape', { shape: { ...tokens.shape, breadcrumbSize: v } })}
                />
              </div>

              {/* Dynamic Shape Swatches Preview */}
              <div className="ds-shape-demo-box">
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

              {saveErrors.shape && <p className="ds-alert-error">{saveErrors.shape}</p>}
            </section>
          )}

          {/* 6. Tabs */}
          {activeSection === 'tabs' && (
            <section className="ds-card-section">
              <div className="ds-section-header-block">
                <h3 className="ds-section-heading">Tabs &amp; Navigation Strips</h3>
                <p className="ds-section-sub">Configure platform tab styling variants, corner radius, track height, and typography.</p>
              </div>

              <div className="ds-variant-cards-grid">
                {[
                  { id: 'underline', title: 'Underline Rule', desc: 'Minimalist active border line under the selected tab.' },
                  { id: 'pill', title: 'Soft Pill', desc: 'Rounded background tint highlighting the active tab on a clean track.' },
                  { id: 'segmented', title: 'Segmented Control', desc: 'Raised surface card on an inset sunken background track.' },
                ].map(v => {
                  const isSelected = tokens.tabs.variant === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={`ds-variant-card${isSelected ? ' ds-variant-card--active' : ''}`}
                      onClick={() => save('tabs', { tabs: { ...tokens.tabs, variant: v.id as any } })}
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

              <div className="ds-numbers-grid" style={{ marginTop: 20 }}>
                <NumberField
                  label="Corner Radius"
                  suffix="px"
                  min={0}
                  value={tokens.tabs.radius}
                  onChange={v => save('tabs', { tabs: { ...tokens.tabs, radius: v } })}
                />
                <NumberField
                  label="Track Height"
                  suffix="px"
                  min={24}
                  value={tokens.tabs.height}
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
            </section>
          )}

          {/* 7. Elevation */}
          {activeSection === 'elevation' && (
            <section className="ds-card-section">
              <div className="ds-section-header-block">
                <h3 className="ds-section-heading">Elevation &amp; Shadows</h3>
                <p className="ds-section-sub">Choose the active platform-wide shadow and depth profile.</p>
              </div>

              <div className="ds-shadow-cards-grid">
                {SHADOW_IDS.map(id => {
                  const isSelected = tokens.elevation === id;
                  const shadowCss = SHADOW_PRESETS[id][previewTheme]?.base || 'none';
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`ds-shadow-card${isSelected ? ' ds-shadow-card--active' : ''}`}
                      onClick={() => save('elevation', { elevation: id })}
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
              {saveErrors.elevation && <p className="ds-alert-error">{saveErrors.elevation}</p>}
            </section>
          )}

          {/* 8. Density */}
          {activeSection === 'density' && (
            <section className="ds-card-section">
              <div className="ds-section-header-block">
                <h3 className="ds-section-heading">Spacing &amp; Density</h3>
                <p className="ds-section-sub">Control padding, button sizes, and information density across tables, forms, and toolbars.</p>
              </div>

              <div className="ds-variant-cards-grid">
                {DENSITY_IDS.map(id => {
                  const isSelected = tokens.density === id;
                  const descMap: Record<DensityId, string> = {
                    compact: 'High data density for heavy analytical and operational tables (~28-32px rows).',
                    default: 'Balanced ergonomic spacing optimized for general business SaaS screens.',
                    comfortable: 'Spacious layout with generous touch targets and relaxed padding (~44-48px).',
                  };
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`ds-variant-card${isSelected ? ' ds-variant-card--active' : ''}`}
                      onClick={() => save('density', { density: id })}
                    >
                      <div className="ds-variant-top">
                        <span className="ds-variant-title">{DENSITY_LABELS[id]}</span>
                        {isSelected && <span className="ds-version-check"><Icon name="check" size={11} /></span>}
                      </div>
                      <p className="ds-variant-desc">{descMap[id]}</p>
                    </button>
                  );
                })}
              </div>
              {saveErrors.density && <p className="ds-alert-error">{saveErrors.density}</p>}
            </section>
          )}

          {/* 9. Motion */}
          {activeSection === 'motion' && (
            <section className="ds-card-section">
              <div className="ds-section-header-block">
                <h3 className="ds-section-heading">Animation &amp; Transitions</h3>
                <p className="ds-section-sub">Durations and bezier easing curves for micro-interactions, modal flyouts, and dropdowns.</p>
              </div>

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

              <div className="ds-form-group-card" style={{ marginTop: 16 }}>
                <span className="ds-field-label">Easing Curve (CSS timing-function)</span>
                <input
                  type="text"
                  className="input-field ds-easing-input"
                  value={tokens.motion.ease}
                  onChange={e => save('motion', { motion: { ...tokens.motion, ease: e.target.value } })}
                />
              </div>

              {/* Interactive Motion Sandbox */}
              <div className="ds-interactive-preview-card" style={{ marginTop: 20 }}>
                <div className="ds-motion-sandbox-top">
                  <span className="ds-preview-mini-label">LIVE ANIMATION SANDBOX</span>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setMotionTrigger(c => c + 1)}
                  >
                    <Icon name="zap" size={13} />
                    <span>Trigger Animation Test</span>
                  </button>
                </div>

                <div className="ds-motion-sandbox-track">
                  <div
                    key={motionTrigger}
                    className="ds-motion-ball"
                    style={{
                      transition: `all ${tokens.motion.dur}ms ${tokens.motion.ease}`,
                      transform: motionTrigger % 2 === 1 ? 'translateX(280px)' : 'translateX(0)',
                    }}
                  >
                    <Icon name="sparkle" size={16} />
                  </div>
                </div>
              </div>

              {saveErrors.motion && <p className="ds-alert-error">{saveErrors.motion}</p>}
            </section>
          )}

          {/* 10. Menu */}
          {activeSection === 'menu' && (
            <section className="ds-card-section">
              <div className="ds-section-header-block">
                <h3 className="ds-section-heading">Sidebar Menu Default State</h3>
                <p className="ds-section-sub">Choose whether the navigation sidebar opens expanded or collapsed into icon-only mode.</p>
              </div>

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
                      onClick={() => setMenuDefault(opt.id as any)}
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
            </section>
          )}

          {/* 11. Navbar Mode */}
          {activeSection === 'navbar' && (
            <section className="ds-card-section">
              <div className="ds-section-header-block">
                <h3 className="ds-section-heading">Top Navigation Bar Type</h3>
                <p className="ds-section-sub">Choose the header anchoring behavior across all applications.</p>
              </div>

              <div className="ds-layout-options-grid">
                {[
                  { id: 'sticky', title: 'Sticky Topbar', desc: 'Stays pinned at the top while the viewport content scrolls underneath.' },
                  { id: 'static', title: 'Static Topbar', desc: 'Scrolls naturally with the page content body.' },
                  { id: 'hidden', title: 'Hidden Header', desc: 'Compact mode hiding topbar chrome for full screen immersive flows.' },
                ].map(opt => {
                  const isSelected = navbarType === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`ds-layout-option-card${isSelected ? ' ds-layout-option-card--active' : ''}`}
                      onClick={() => setNavbarType(opt.id as any)}
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
            </section>
          )}

          {/* 12. Content Width */}
          {activeSection === 'content' && (
            <section className="ds-card-section">
              <div className="ds-section-header-block">
                <h3 className="ds-section-heading">Canvas Content Width</h3>
                <p className="ds-section-sub">Standardize max-width bounds for page layouts.</p>
              </div>

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
                      onClick={() => setContentWidth(opt.id as any)}
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
            </section>
          )}

          {/* 13. Skin */}
          {activeSection === 'skin' && (
            <section className="ds-card-section">
              <div className="ds-section-header-block">
                <h3 className="ds-section-heading">Surface Skin Styling</h3>
                <p className="ds-section-sub">Toggle between soft elevated card surfaces or crisp bordered structural perimeters.</p>
              </div>

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
                      onClick={() => setSkin(opt.id as any)}
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
            </section>
          )}

          {/* 14. Semi Dark */}
          {activeSection === 'semidark' && (
            <section className="ds-card-section">
              <div className="ds-section-header-block">
                <h3 className="ds-section-heading">Semi-Dark Navigation Mode</h3>
                <p className="ds-section-sub">Maintains a sleek dark sidebar navigation aesthetic even when light mode is active on pages.</p>
              </div>

              <div className="ds-layout-options-grid">
                {[
                  { id: false, title: 'Disabled (Matched Theme)', desc: 'Sidebar adapts to the active light/dark theme automatically.' },
                  { id: true, title: 'Enabled (Always Dark Sidebar)', desc: 'Sidebar stays dark navy regardless of light mode setting.' },
                ].map(opt => {
                  const isSelected = semiDark === opt.id;
                  return (
                    <button
                      key={String(opt.id)}
                      type="button"
                      className={`ds-layout-option-card${isSelected ? ' ds-layout-option-card--active' : ''}`}
                      onClick={() => setSemiDark(opt.id)}
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
            </section>
          )}

          {/* 15. Direction */}
          {activeSection === 'direction' && (
            <section className="ds-card-section">
              <div className="ds-section-header-block">
                <h3 className="ds-section-heading">Text Flow &amp; Direction</h3>
                <p className="ds-section-sub">Configure standard Left-to-Right (LTR) or Right-to-Left (RTL) document direction flow.</p>
              </div>

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
                      onClick={() => setDirection(opt.id as any)}
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
            </section>
          )}

          {/* 16. Mobile Breakpoint */}
          {activeSection === 'mobile' && (
            <section className="ds-card-section">
              <div className="ds-section-header-block">
                <h3 className="ds-section-heading">Responsive Viewport Breakpoint</h3>
                <p className="ds-section-sub">
                  The unified screen threshold (px) utilized across the platform (42+ components via useIsMobile) to transition between desktop and adaptive mobile layouts.
                </p>
              </div>

              <div className="ds-numbers-grid">
                <NumberField
                  label="Adaptive Breakpoint"
                  description="Threshold width for mobile drawer / bottom bar switch"
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
                <span className={`badge ${isMobileNow ? 'badge-gold' : 'badge-teal'}`}>
                  {isMobileNow ? '📱 Mobile Layout Active' : '🖥️ Desktop Layout Active'}
                </span>
              </div>

              {saveErrors.responsive && <p className="ds-alert-error">{saveErrors.responsive}</p>}
            </section>
          )}

          {/* 17-20: Platform sections */}
          {activeSection === 'identity' && (
            <section className="ds-platform-section">
              <BrandingIdentitySection />
            </section>
          )}

          {activeSection === 'apps' && (
            <section className="ds-platform-section">
              <BrandingAppsSection />
            </section>
          )}

          {activeSection === 'login' && (
            <section className="ds-platform-section">
              <BrandingLoginSection />
            </section>
          )}

          {activeSection === 'components' && (
            <section className="ds-platform-section">
              <ComponentShowcase />
            </section>
          )}

          {activeSection === 'icons' && (
            <section className="ds-platform-section">
              <IconSystemSection />
            </section>
          )}

          {activeSection === 'oscar' && (
            <section className="ds-platform-section">
              <React.Suspense fallback={<div className="p-8 text-center text-sm text-[var(--ink3)]">Loading Oscar Catalog...</div>}>
                <OscarCatalog />
              </React.Suspense>
            </section>
          )}

          {activeSection === 'animations' && (
            <section className="ds-platform-section">
              <React.Suspense fallback={<div className="p-8 text-center text-sm text-[var(--ink3)]">Loading Animations Showcase...</div>}>
                <AnimationsShowcase />
              </React.Suspense>
            </section>
          )}

          {activeSection === 'blocks' && (
            <section className="ds-platform-section">
              <React.Suspense fallback={<div className="p-8 text-center text-sm text-[var(--ink3)]">Loading Building Blocks...</div>}>
                <BuildingBlocksShowcase />
              </React.Suspense>
            </section>
          )}

          {activeSection === 'dropdowns' && (
            <section className="ds-platform-section">
              <div className="ds-card-section">
                <div className="ds-section-header-block">
                  <h3 className="ds-section-heading">Dropdowns, Selects &amp; Popover Varieties</h3>
                  <p className="ds-section-sub">Select popover style, dropdown menu hover feedback, trigger density, and list item spacing.</p>
                </div>

                <div className="ds-variant-cards-grid">
                  {[
                    { id: 'clean', title: 'Clean Bordered Select', desc: 'Crisp 1px outline popup with subtle gray item hover highlighting.' },
                    { id: 'floating', title: 'Floating Soft Shadow', desc: 'Elevated popover with soft shadow depth and rounded item corners.' },
                    { id: 'tinted', title: 'Teal Accent Highlight', desc: 'Vibrant teal background tint on hovered and selected menu items.' },
                    { id: 'compact', title: 'High-Density Compact', desc: 'Compact 28px trigger height and tight row padding for data grids.' },
                  ].map(v => (
                    <div key={v.id} className="ds-variant-card ds-variant-card--active" style={{ padding: 18 }}>
                      <div className="ds-variant-top">
                        <span className="ds-variant-title">{v.title}</span>
                        <Badge variant="brand">Active</Badge>
                      </div>
                      <p className="ds-variant-desc">{v.desc}</p>
                      <div style={{ marginTop: 12 }}>
                        <Select defaultValue="option-1">
                          <SelectTrigger style={{ width: '100%' }}><SelectValue placeholder="Choose option..." /></SelectTrigger>
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
            </section>
          )}

        </main>

        {/* 3. Studio Live Preview Pane (For theming & layout sections) */}
        {!PANEL_ONLY_SECTIONS.has(activeSection) && (
          <aside className="ds-preview" data-theme={previewTheme === 'dark' ? 'dark' : undefined}>
            <div className="ds-preview-bar">
              <div className="ds-preview-header-left">
                <span className="ds-preview-status-dot" />
                <span className="ds-preview-title">STUDIO PLAYGROUND</span>
              </div>
              <div className="ds-preview-toggle">
                <button
                  type="button"
                  className={`ds-tab${previewTheme === 'light' ? ' ds-tab--active' : ''}`}
                  onClick={() => setPreviewTheme('light')}
                >
                  <Icon name="sun" size={12} />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  className={`ds-tab${previewTheme === 'dark' ? ' ds-tab--active' : ''}`}
                  onClick={() => setPreviewTheme('dark')}
                >
                  <Icon name="moon" size={12} />
                  <span>Dark</span>
                </button>
              </div>
            </div>

            <div className="ds-preview-body">
              
              {/* Buttons Playground */}
              <div className="ds-playground-block">
                <span className="ds-playground-label">BUTTON PRIMITIVES</span>
                <div className="ds-preview-row">
                  <button type="button" className="btn btn-primary">Primary</button>
                  <button type="button" className="btn btn-secondary">Secondary</button>
                  <button type="button" className="btn btn-ghost">Ghost</button>
                  <button type="button" className="btn btn-danger">Danger</button>
                </div>
              </div>

              {/* Status Badges */}
              <div className="ds-playground-block">
                <span className="ds-playground-label">SEMANTIC BADGES</span>
                <div className="ds-preview-row">
                  <span className="badge badge-teal">Teal Brand</span>
                  <span className="badge badge-gold">Warning</span>
                  <span className="badge badge-red">Danger</span>
                  <span className="badge badge-green">Success</span>
                  <span className="badge badge-blue">Info</span>
                  <span className="badge badge-purple">Accent</span>
                </div>
              </div>

              {/* Status Pills */}
              <div className="ds-playground-block">
                <span className="ds-playground-label">STATUS PILLS</span>
                <div className="ds-preview-row">
                  <span className="status-pill spl-teal">Active</span>
                  <span className="status-pill spl-amber">Pending</span>
                  <span className="status-pill spl-red">Overdue</span>
                  <span className="status-pill spl-green">Cleared</span>
                </div>
              </div>

              {/* Live Specimen Dashboard Card */}
              <div className="card ds-preview-card">
                <div className="ds-preview-card-header">
                  <div className="ds-preview-card-title-group">
                    <span className="ds-preview-card-badge">LIVE METRICS</span>
                    <h4 className="ds-preview-card-title">Customs Operational Hub</h4>
                  </div>
                  <span className="status-pill spl-green">Synced</span>
                </div>
                <p className="ds-preview-card-body">
                  Real-time component demonstration reacting live to active brand primary, neutral tonal scales, corner radius, and elevation tokens.
                </p>
                <div className="ds-preview-card-footer">
                  <div className="ds-preview-nav-item">
                    <Icon name="sparkle" size={13} />
                    <span>Active Workspace</span>
                  </div>
                  <span className="ds-preview-card-stat">99.8% Compliance</span>
                </div>
              </div>

              {/* Type Hierarchy Specimen */}
              <div className="ds-playground-block">
                <span className="ds-playground-label">TYPE SPECIMEN SCALE</span>
                <div className="ds-preview-type-scale">
                  <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700 }}>Heading 3XL</div>
                  <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Heading 2XL</div>
                  <div style={{ fontSize: 'var(--text-xl)', fontWeight: 600 }}>Heading XL</div>
                  <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Heading LG</div>
                  <div style={{ fontSize: 'var(--text-md)' }}>Body MD Regular Text</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink2)' }}>Caption SM Muted Metadata</div>
                </div>
              </div>

            </div>
          </aside>
        )}

      </div>
        </div>
      </div>

      {/* Mobile "Browse sections" drawer — same nav content as the
          permanent sidebar, just reached through a Dialog instead of
          always being on screen. */}
      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent className="ds-mobile-nav-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Icon name="menu" size={18} />
              <span>Browse sections</span>
            </DialogTitle>
          </DialogHeader>
          <div className="ds-sidebar ds-sidebar--in-dialog">
            {sidebarNavContent}
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating Action Button for Mobile Live Playground */}
      <button
        type="button"
        className="ds-mobile-preview-fab"
        onClick={() => setMobilePreviewOpen(true)}
        title="Open Live Component Playground"
      >
        <Icon name="sparkle" size={16} />
        <span>Live Playground</span>
      </button>

      {/* Mobile Live Playground Drawer Dialog */}
      <Dialog open={mobilePreviewOpen} onOpenChange={setMobilePreviewOpen}>
        <DialogContent className="ds-mobile-preview-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Icon name="sparkle" size={18} className="text-teal-600" />
              <span>Studio Live Playground</span>
            </DialogTitle>
          </DialogHeader>

          <div className="ds-preview-body p-2 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Buttons Playground */}
            <div className="ds-playground-block">
              <span className="ds-playground-label">BUTTON PRIMITIVES</span>
              <div className="ds-preview-row">
                <button type="button" className="btn btn-primary">Primary</button>
                <button type="button" className="btn btn-secondary">Secondary</button>
                <button type="button" className="btn btn-ghost">Ghost</button>
                <button type="button" className="btn btn-danger">Danger</button>
              </div>
            </div>

            {/* Status Badges */}
            <div className="ds-playground-block">
              <span className="ds-playground-label">SEMANTIC BADGES</span>
              <div className="ds-preview-row flex-wrap">
                <span className="badge badge-teal">Teal Brand</span>
                <span className="badge badge-gold">Warning</span>
                <span className="badge badge-red">Danger</span>
                <span className="badge badge-green">Success</span>
                <span className="badge badge-blue">Info</span>
                <span className="badge badge-purple">Accent</span>
              </div>
            </div>

            {/* Live Specimen Dashboard Card */}
            <div className="card ds-preview-card">
              <div className="ds-preview-card-header">
                <div className="ds-preview-card-title-group">
                  <span className="ds-preview-card-badge">LIVE METRICS</span>
                  <h4 className="ds-preview-card-title">Customs Operational Hub</h4>
                </div>
                <span className="status-pill spl-green">Synced</span>
              </div>
              <p className="ds-preview-card-body text-xs">
                Real-time component demonstration reacting live to active brand primary, neutral tonal scales, corner radius, and elevation tokens.
              </p>
              <div className="ds-preview-card-footer">
                <div className="ds-preview-nav-item">
                  <Icon name="sparkle" size={13} />
                  <span>Active Workspace</span>
                </div>
                <span className="ds-preview-card-stat">99.8% Compliance</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DesignSystemView;
