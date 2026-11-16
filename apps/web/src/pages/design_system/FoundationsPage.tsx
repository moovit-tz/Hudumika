import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tip } from '@/components/ui/tooltip';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { PersonAvatar, CompanyAvatar } from '../../components/PersonAvatar.js';
import { LauncherAppSvg } from '../../components/LauncherApps.js';
import {
  FONT_IDS,
  FONT_LABELS,
  FONT_STACKS,
  useDesignSystem,
} from '../../hooks/useDesignSystem.js';
import {
  contrastRatio,
  enforceContrastFloor,
  focusRingHex,
  lightenHex,
  pickForegroundHsl,
} from '../../lib/color.js';
import { formatAmount } from '../../lib/currency.js';
import {
  DesignSystemStudioBar,
  IconSystemSection,
  ThemePresetsAndEngineSection,
  useDesignStudioController,
} from './helpers.js';
import {
  BrandAndPaletteEditorSection,
  LayoutCustomizerSection,
  MotionEditorSection,
  ShapeAndElevationEditorSection,
  TypographyEditorSection,
} from './DesignStudioEditors.js';
import './DesignSystemApp.css';

const TOPICS = [
  { id: 'color', label: 'Color & Contrast' },
  { id: 'typography', label: 'Typography' },
  { id: 'spacing-layout', label: 'Spacing & Density' },
  { id: 'shape-elevation-icons', label: 'Shape, Icons & Avatars' },
  { id: 'motion-accessibility', label: 'Motion & A11y' },
] as const;

type TopicId = (typeof TOPICS)[number]['id'];

const CORE_TOKEN_SPECS = [
  { token: '--bg', role: 'Canvas background behind cards', usage: 'Page shell & recessed workspace areas' },
  { token: '--surface', role: 'Primary card & panel surface', usage: 'SectionCard, MetricCard, DataTable wrapper' },
  { token: '--card-sunken', role: 'Inset subtle container surface', usage: 'Code blocks, subtle callout strips, table headers' },
  { token: '--ink', role: 'Primary body & heading copy', usage: 'Titles, figures, form input values' },
  { token: '--ink2', role: 'Secondary supporting copy', usage: 'Descriptions, inactive nav labels, table subtext' },
  { token: '--ink3', role: 'Muted metadata & hints', usage: 'Eyebrows, timestamps, empty-state helper text' },
  { token: '--border', role: 'Hairline structural divider', usage: 'Card frames, table gridlines, input borders' },
  { token: '--teal', role: 'Configured active app accent', usage: 'PageHeader titleEm, active nav, selected row accent' },
  { token: '--teal-l', role: '10% app accent tint', usage: 'Active sidebar pill background, selected row tint' },
  { token: '--green', role: 'Semantic verified / positive', usage: 'Reconciled, active session, paid status paired with label' },
  { token: '--gold', role: 'Semantic caution / expiring', usage: 'Pending approval, expiring permit within SLA' },
  { token: '--red', role: 'Semantic danger / blocked', usage: 'Overdue, failed sync, irreversible delete CTA' },
  { token: '--blue', role: 'Semantic informational', usage: 'Informational notice or secondary comparison chart series' },
  { token: '--purple', role: 'Secondary categorical series', usage: 'Multi-series chart contrast when >3 series appear' },
];

export function FoundationsPage() {
  const { topic } = useParams<{ topic?: string }>();
  const navigate = useNavigate();
  const { tokens } = useDesignSystem();
  const studio = useDesignStudioController();

  const activeTopic: TopicId = TOPICS.some(t => t.id === topic) ? (topic as TopicId) : 'color';
  const [resolvedTokens, setResolvedTokens] = useState<Record<string, string>>({});
  const [probeHex, setProbeHex] = useState('#0284c7');
  const [motionTestActive, setMotionTestActive] = useState(false);

  useEffect(() => {
    const capture = () => {
      const cs = getComputedStyle(document.documentElement);
      const next: Record<string, string> = {};
      for (const spec of CORE_TOKEN_SPECS) {
        next[spec.token] = cs.getPropertyValue(spec.token).trim() || '(unset)';
      }
      setResolvedTokens(next);
    };
    capture();
    window.addEventListener('hudumika-ds-updated', capture);
    const observer = new MutationObserver(capture);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    return () => {
      window.removeEventListener('hudumika-ds-updated', capture);
      observer.disconnect();
    };
  }, []);

  const contrastStats = useMemo(() => {
    const valid = /^#[0-9a-fA-F]{6}$/.test(probeHex) ? probeHex : '#1257c6';
    const floored = enforceContrastFloor(valid);
    const darkVariant = lightenHex(valid, 0.45);
    const darkFloored = enforceContrastFloor(darkVariant);
    const whiteContrast = contrastRatio(valid, '#ffffff');
    const darkSurfaceContrast = contrastRatio(darkVariant, '#0f172a');
    return {
      valid,
      floored,
      darkVariant,
      darkFloored,
      fgHsl: pickForegroundHsl(floored.hex),
      ringLight: focusRingHex(floored.hex, '#f4f7fb'),
      ringDark: focusRingHex(darkFloored.hex, '#141820'),
      whiteContrast,
      darkSurfaceContrast,
    };
  }, [probeHex]);

  return (
    <div className="dsa-page">
      <PageHeader
        crumbs={['Design System', 'Foundations']}
        titlePlain="System"
        titleEm="foundations"
        subtitle="Live token contracts, semantic color boundaries, AA contrast flooring, typographic hierarchy, density presets, iconography, and motion standards."
        actions={
          <Tip label="Open role playbooks for Hudumika designers, developers, and marketers">
            <Button variant="outline" size="sm" asChild>
              <Link to="/design-system/guidance/designers">
                <Icon name="bookOpen" size={14} /> Staff Guidance
              </Link>
            </Button>
          </Tip>
        }
      />

      <DesignSystemStudioBar studio={studio} />

      <Tabs
        value={activeTopic}
        variant="segmented"
        onValueChange={val => navigate(`/design-system/foundations/${val}`)}
      >
        <TabsList className="flex-wrap">
          {TOPICS.map(t => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="color" className="space-y-5 mt-4">
          <SectionCard title="Platform Themes & Engine Mode">
            <ThemePresetsAndEngineSection studio={studio} />
          </SectionCard>

          <SectionCard title="Material 3 Seed Generator, Brand, Neutral & Semantic Scales">
            <BrandAndPaletteEditorSection studio={studio} />
          </SectionCard>

          <SectionCard title="Decorative color vs App identity vs Operational meaning">
            <div className="dsa-grid-3">
              <Card>
                <CardHeader>
                  <Badge variant="outline" className="w-fit">1. Neutral Surfaces (90% of screen)</Badge>
                  <CardTitle className="text-sm mt-1">Default Chrome & Data</CardTitle>
                  <CardDescription>
                    Cards, KPI tiles, shortcut grids, ordinary revenue/expense figures, and routine table rows stay strictly neutral (<code>--surface</code>, <code>--border</code>, <code>--ink</code>).
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1.5">
                  <div className="p-2.5 rounded-lg border border-border bg-card">
                    <div className="text-xs text-muted-foreground">Total Cash Position</div>
                    <div className="text-base font-bold text-foreground font-mono">TZS 142,800,000</div>
                  </div>
                  <p>Wait before coloring: if removing color doesn&apos;t hide an exception or primary action, keep it neutral.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <Badge variant="brand" className="w-fit">2. App Identity (--teal / --primary)</Badge>
                  <CardTitle className="text-sm mt-1">Where User Stands & Primary CTA</CardTitle>
                  <CardDescription>
                    Reserved for <code>PageHeader</code> <code>titleEm</code>, active sidebar nav item, selected rows, focus ring, and the single primary action per view.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm">Create Voucher</Button>
                    <Button size="sm" variant="outline">Export CSV</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Inherited cleanly from <code>WorkspaceApp</code> across wrappers and Radix portals.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <Badge variant="destructive" className="w-fit">3. Operational Meaning</Badge>
                  <CardTitle className="text-sm mt-1">Exceptions Always Paired with Labels</CardTitle>
                  <CardDescription>
                    Danger, warning, and verified states signal real status transitions using compact pills with explicit copy rather than full-row fills.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  <Badge variant="destructive">Overdue 14d</Badge>
                  <Badge variant="warning">Pending Approval</Badge>
                  <Badge variant="success">Reconciled</Badge>
                </CardContent>
              </Card>
            </div>
          </SectionCard>

          <SectionCard title="WCAG AA Contrast Floor & Dark-Mode Adaptation Simulator">
            <div className="dsa-grid-2">
              <div className="space-y-3">
                <Label htmlFor="foundation-hex-probe">Test any candidate app accent hex (#RRGGBB)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="foundation-hex-probe"
                    value={probeHex}
                    onChange={e => setProbeHex(e.target.value)}
                    placeholder="#0284c7"
                    className="font-mono max-w-[160px]"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => setProbeHex('#fbbc04')}>
                    Test Light Gold (#fbbc04)
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setProbeHex('#0d9488')}>
                    Test Axis (#0d9488)
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  <code>enforceContrastFloor()</code> walks an accent in 5% steps until button text clears 4.5:1 AA, while dark mode applies <code>lightenHex(color, 0.45)</code> to keep links/icons legible on dark cards.
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="dsa-waterfall-step">
                  <div className="flex items-center gap-2">
                    <span className="dsa-swatch-chip" style={{ background: contrastStats.floored.hex }} />
                    <div>
                      <div className="font-bold">Light Button Surface: {contrastStats.floored.hex}</div>
                      <div className="text-muted-foreground">
                        Contrast vs chosen foreground: {contrastStats.floored.to.toFixed(2)}:1{' '}
                        {contrastStats.floored.adjusted ? `(nudged from ${contrastStats.floored.from.toFixed(2)}:1)` : '(passed directly)'}
                      </div>
                    </div>
                  </div>
                  <Badge variant={contrastStats.floored.to >= 4.5 ? 'success' : 'warning'}>AA Pass</Badge>
                </div>

                <div className="dsa-waterfall-step">
                  <div className="flex items-center gap-2">
                    <span className="dsa-swatch-chip" style={{ background: contrastStats.darkVariant }} />
                    <div>
                      <div className="font-bold">Dark Mode Accent Text: {contrastStats.darkVariant}</div>
                      <div className="text-muted-foreground">
                        Ratio vs dark surface (#0f172a): {contrastStats.darkSurfaceContrast.toFixed(2)}:1
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary">lightenHex +45%</Badge>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Live Resolved CSS Tokens (Current Document Root)">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">Token</th>
                    <th className="py-2 pr-3 font-semibold">Live Resolved Value</th>
                    <th className="py-2 pr-3 font-semibold">Role</th>
                    <th className="py-2 font-semibold">Where to Use</th>
                  </tr>
                </thead>
                <tbody>
                  {CORE_TOKEN_SPECS.map(row => {
                    const val = resolvedTokens[row.token] ?? '...';
                    const isColor = val.startsWith('#') || val.startsWith('rgb') || val.startsWith('hsl');
                    return (
                      <tr key={row.token} className="border-b border-border/60">
                        <td className="py-2 pr-3 font-mono font-semibold text-foreground">{row.token}</td>
                        <td className="py-2 pr-3 font-mono text-muted-foreground">
                          <span className="inline-flex items-center gap-2">
                            {isColor && <span className="w-3.5 h-3.5 rounded border border-border inline-block shrink-0" style={{ background: val }} />}
                            {val}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-foreground">{row.role}</td>
                        <td className="py-2 text-muted-foreground">{row.usage}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="typography" className="space-y-5 mt-4">
          <SectionCard title="Font Family & Type Scale Tokens">
            <TypographyEditorSection studio={studio} />
          </SectionCard>

          <SectionCard title="Type Hierarchy & Active Platform Font Stack">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="brand">Active Font: {FONT_LABELS[tokens.typography.font]}</Badge>
                {FONT_IDS.map(f => (
                  <Badge key={f} variant="outline">{FONT_LABELS[f]}</Badge>
                ))}
              </div>

              <div className="space-y-3 border-t border-border pt-3">
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2 border-b border-border/60">
                  <div style={{ fontSize: 'var(--page-title-size)', fontWeight: 700, fontFamily: FONT_STACKS[tokens.typography.font] }}>
                    General <span style={{ color: 'var(--teal)' }}>ledger</span>
                  </div>
                  <code className="text-xs font-mono text-muted-foreground">--page-title-size (clamp 1.25rem → 1.625rem, 700)</code>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2 border-b border-border/60">
                  <div className="text-base font-bold">Section & Card Heading</div>
                  <code className="text-xs font-mono text-muted-foreground">16px · font-weight: 700 · line-height: 1.35</code>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2 border-b border-border/60">
                  <div className="text-sm">Body copy — invoices, form hints, and narrative explanations.</div>
                  <code className="text-xs font-mono text-muted-foreground">14px · font-weight: 400 · var(--ink)</code>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                  <div className="text-xs text-muted-foreground">Dense caption & metadata timestamp · Updated 12m ago</div>
                  <code className="text-xs font-mono text-muted-foreground">12px · font-weight: 500 · var(--ink3)</code>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Numeric Data, Currencies & Dense Tables (tabular-nums)">
            <p className="text-xs text-muted-foreground mb-3">
              Financial figures and quantities always right-align using <code>font-variant-numeric: tabular-nums</code> and <code>formatAmount(val, currency)</code>. Ordinary credits/debits stay neutral; color is applied only to explicit business exceptions.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 text-left font-semibold">Voucher #</th>
                    <th className="py-2 text-left font-semibold">Description</th>
                    <th className="py-2 text-right font-semibold">Debit</th>
                    <th className="py-2 text-right font-semibold">Credit</th>
                    <th className="py-2 text-right font-semibold">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/60">
                    <td className="py-2 font-mono">JRN-2026-0141</td>
                    <td className="py-2">Port handling disbursement</td>
                    <td className="py-2 text-right">{formatAmount(1240500, 'TZS')}</td>
                    <td className="py-2 text-right text-muted-foreground">—</td>
                    <td className="py-2 text-right text-muted-foreground">0.0%</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="py-2 font-mono">JRN-2026-0142</td>
                    <td className="py-2">Clearing retainer settlement</td>
                    <td className="py-2 text-right text-muted-foreground">—</td>
                    <td className="py-2 text-right">{formatAmount(9850000, 'TZS')}</td>
                    <td className="py-2 text-right text-destructive font-semibold">+14.2% Over Budget</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="spacing-layout" className="space-y-5 mt-4">
          <SectionCard title="Content Density, Shell Layout, Direction & Responsive Breakpoint">
            <LayoutCustomizerSection studio={studio} />
          </SectionCard>

          <SectionCard title="Responsive Breakpoints & Shell Layout Contracts">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">Viewport</th>
                    <th className="py-2 pr-3 font-semibold">Layout Behavior</th>
                    <th className="py-2 font-semibold">Rule</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/60"><td className="py-2 pr-3 font-mono">1440px+ Desktop</td><td className="py-2 pr-3">Expanded or collapsed AppSidebar + fluid main content + optional split rail</td><td className="py-2">Wrap standard routes inside PageLayout for unified footer</td></tr>
                  <tr className="border-b border-border/60"><td className="py-2 pr-3 font-mono">960px Split</td><td className="py-2 pr-3">Two-column settings/catalog splits collapse to single column</td><td className="py-2">Use minmax(0, 1fr) tracks to prevent code/table blowout</td></tr>
                  <tr className="border-b border-border/60"><td className="py-2 pr-3 font-mono">768px Tablet</td><td className="py-2 pr-3">Sidebar switches to overlay mobile drawer; grids drop to 2 columns</td><td className="py-2">Preserve ≥ 44px action buttons and wrapped header actions</td></tr>
                  <tr><td className="py-2 pr-3 font-mono">320px–375px Mobile</td><td className="py-2 pr-3">Single-column stack; ResponsiveTable flips to card rows</td><td className="py-2">Zero horizontal page overflow; tables/code use inner scroll</td></tr>
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="shape-elevation-icons" className="space-y-5 mt-4">
          <SectionCard title="Shape Presets, Radius & Stroke Controls & Elevation Scale">
            <ShapeAndElevationEditorSection studio={studio} />
          </SectionCard>

          <SectionCard title="People, Companies & Squircle App Identities">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <PersonAvatar name="Amina Hassan" size={40} />
                <div className="text-xs"><div className="font-bold">PersonAvatar</div><div className="text-muted-foreground">Deterministic hash palette</div></div>
              </div>
              <div className="flex items-center gap-3">
                <CompanyAvatar name="Rufiji Freight Ltd" size={40} />
                <div className="text-xs"><div className="font-bold">CompanyAvatar</div><div className="text-muted-foreground">Tenant & org mark</div></div>
              </div>
              <div className="flex items-center gap-3">
                <LauncherAppSvg id="design-system" color="var(--teal)" size={42} />
                <div className="text-xs"><div className="font-bold">Squircle Mask</div><div className="text-muted-foreground">40x40 geometric squircle</div></div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Platform Icon Libraries (Stroke · Twotone · Hugeicons Pro)">
            {!studio.isSuperAdmin && (
              <Alert className="mb-4">
                <Icon name="lock" size={14} />
                <AlertTitle>Browse &amp; local preview mode</AlertTitle>
                <AlertDescription>
                  All internal staff can browse and copy JSX snippets from any icon family below and test changes locally. Saving platform-wide defaults requires a SuperAdmin account.
                </AlertDescription>
              </Alert>
            )}
            <IconSystemSection />
          </SectionCard>
        </TabsContent>

        <TabsContent value="motion-accessibility" className="space-y-5 mt-4">
          <SectionCard title="Motion Durations, Easing Curve & Live Animation Sandbox">
            <MotionEditorSection studio={studio} />
          </SectionCard>

          <div className="dsa-grid-2">
            <SectionCard title="Motion Timing & Reduced Motion">
              <div className="space-y-3 text-xs">
                <div className="dsa-waterfall-step"><span><code>--dur-fast</code> · Hover, focus ring, toggle</span><strong>80ms cubic-bezier(0.4, 0, 0.2, 1)</strong></div>
                <div className="dsa-waterfall-step"><span><code>--dur</code> · Dropdowns, tab indicators</span><strong>150ms cubic-bezier(0.4, 0, 0.2, 1)</strong></div>
                <div className="dsa-waterfall-step"><span><code>--dur-slow</code> · Drawers, route panels</span><strong>300ms cubic-bezier(0.4, 0, 0.2, 1)</strong></div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-muted-foreground">Interactive transition sample:</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => setMotionTestActive(v => !v)}>
                    {motionTestActive ? 'Transition Active (80ms)' : 'Trigger Motion Sample'}
                  </Button>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Keyboard, Focus, Hit Targets & i18n Guarantees">
              <ul className="space-y-2 text-xs text-muted-foreground list-disc pl-4 leading-relaxed">
                <li><strong>Focus Halos:</strong> <code>--focus-ring-color</code> automatically maintains &gt;= 3:1 non-text contrast against the current surface (light or dark).</li>
                <li><strong>Touch & Pointer Targets:</strong> Controls enforce minimum 24x24px hit targets; primary buttons scale with <code>--action-h</code> (&gt;= 44px).</li>
                <li><strong>Screen Reader Hygiene:</strong> Automated scripts block unnamed icon-only buttons and unlinked form labels before merge.</li>
                <li><strong>Localization & RTL:</strong> Use <code>useLocale()</code> / <code>t(...)</code> in localized modules and logical spacing/wrapping tested by <code>check-ui-zoom-rtl.mjs</code>.</li>
              </ul>
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
