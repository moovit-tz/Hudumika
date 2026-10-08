import React, { useState, useEffect } from 'react';
import { ColorSwatchPicker } from '../../components/ui/color-swatch-picker.js';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { Tip } from '../../components/ui/tooltip.js';
import { TwotoneIcon, TWOTONE_ICONS } from '../../components/ui/twotone-icon.js';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import {
  useDesignSystem, ICON_LIBRARY_IDS, ICON_LIBRARY_DESCRIPTIONS, type IconLibraryId,
} from '../../hooks/useDesignSystem.js';

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
               data-ui-native-button="">
                {sz}px
              </button>
            ))}
          </div>
        </div>
      </div>
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
    green:  'var(--green)',
    gold:   'var(--gold)',
    purple: 'var(--purple)',
    red:    'var(--red)',
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
      <div className="flex items-center justify-between gap-4 flex-wrap p-3 rounded-xl bg-muted/40 border border-border">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color:</span>
          <div className="flex items-center gap-1.5">
            {(['teal', 'green', 'gold', 'purple', 'red', 'ink'] as const).map((c) => (
              <Tip key={c} label={c}>
                <button
                  type="button"
                  aria-label={`Use ${c} icon color`}
                  onClick={() => setSelectedColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${
                    selectedColor === c ? 'scale-110 ring-2 ring-primary ring-offset-2' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: colorMap[c], borderColor: 'transparent' }}
                 data-ui-native-button=""/>
              </Tip>
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
               data-ui-native-button="">
                {sz}px
              </button>
            ))}
          </div>
        </div>
      </div>
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

// Real, officially licensed Hugeicons free-tier artwork loaded via dynamic
// import() — its ~130 SVG modules only ever download for someone who opens
// this tab, not for every SuperAdmin page load.
function HugeiconsIconGrid() {
  const [selectedColor, setSelectedColor] = useState<'teal' | 'green' | 'gold' | 'purple' | 'red' | 'ink'>('teal');
  const [iconSize, setIconSize] = useState(24);
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const [map, setMap] = useState<Record<string, IconSvgElement> | null>(null);

  useEffect(() => {
    let alive = true;
    import('../../components/hugeicons-map.js').then((m) => { if (alive) setMap(m.HUGEICONS_MAP as Record<string, IconSvgElement>); });
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
              <Tip key={c} label={c}>
                <button
                  type="button"
                  aria-label={`Use ${c} icon color`}
                  onClick={() => setSelectedColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${
                    selectedColor === c ? 'scale-110 ring-2 ring-primary ring-offset-2' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: colorMap[c], borderColor: 'transparent' }}
                 data-ui-native-button=""/>
              </Tip>
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
               data-ui-native-button="">
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
  hugeicons: { label: 'Hugeicons', count: null },
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
          <strong> Stroke</strong> — the platform's own crisp 24×24 outline set (covers every icon name, the default).
          <strong> Twotone Rounded</strong> — a hand-authored Hugeicons-inspired dual-layer style.
          <strong> Hugeicons</strong> — real, officially licensed Hugeicons free-tier artwork.
          Browse a library below, then use <strong>Use platform-wide</strong> to make it what every &lt;Icon&gt; in the app actually renders — a name the chosen library doesn't cover quietly falls back to Stroke rather than going blank.
        </p>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40 border border-border w-fit" data-ds-tabstrip="">
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
