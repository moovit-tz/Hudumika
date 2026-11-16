import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '../../components/PageHeader.js';
import { MetricCard, MetricsRow } from '../../components/MetricCard.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { Tip } from '@/components/ui/tooltip';
import { FeaturedIcon } from '@/components/ui/featured-icon';
import { useAuth } from '../../hooks/useAuth.js';
import { CONFIGURABLE_APP_REGISTRY, resolveAppColorDetails } from '../../lib/appRegistry.js';
import { useDesignSystem } from '../../hooks/useDesignSystem.js';
import { CATALOG_ENTRIES, PATTERN_SPECS, QUALITY_CHECKS } from './dsCatalogData.js';
import {
  DesignSystemStudioBar,
  ThemePresetsAndEngineSection,
  useDesignStudioController,
} from './helpers.js';
import './DesignSystemApp.css';

interface SearchResult {
  id: string;
  kind: 'Guidance' | 'Foundation' | 'Component' | 'Pattern' | 'App' | 'Quality';
  title: string;
  subtitle: string;
  to: string;
}

const GUIDANCE_INDEX: Array<{ id: string; title: string; subtitle: string; to: string }> = [
  { id: 'g-principles', title: 'Product Design Principles (2026 Standard)', subtitle: '8 decision principles, voice & tone matrix, blocking messages, 8 product guardrails & ownership.', to: '/design-system/guidance/principles' },
  { id: 'g-designers', title: 'For Designers — Product Design Playbook', subtitle: '90% neutral rule, live geometry/radii, narrow-first viewports, 8-state matrix & full-page wizards.', to: '/design-system/guidance/designers' },
  { id: 'g-developers', title: 'For Company Developers — Engineering Playbook', subtitle: 'components/ui mapping, PageLayout shells, multi-tenant RLS, JWTPayload.sub, Tailwind v4 & CI checks.', to: '/design-system/guidance/developers' },
  { id: 'g-marketers', title: 'For Marketers & Content — Brand & Messaging Playbook', subtitle: 'v1/v2/v3 positioning, blocking-message formula, registered app identity, consent & TZS formatting.', to: '/design-system/guidance/marketers' },
];

const FOUNDATIONS_INDEX: Array<{ id: string; title: string; subtitle: string; to: string }> = [
  { id: 'f-color', title: 'Color, Contrast Floor & Semantic Roles', subtitle: 'Light/dark surfaces, 5-layer accent chain, AA floor >= 4.5:1, semantic danger/warning/success.', to: '/design-system/foundations/color' },
  { id: 'f-type', title: 'Typography & Tabular Numerals', subtitle: 'Font stacks, page header clamp sizing, dense table scale, formatAmount() alignment.', to: '/design-system/foundations/typography' },
  { id: 'f-space', title: 'Spacing, Layout & Content Density', subtitle: 'Compact/default/comfortable density presets, PageLayout footer vs full-bleed canvas rules.', to: '/design-system/foundations/spacing-layout' },
  { id: 'f-shape', title: 'Shape, Elevation, Icons & Avatars', subtitle: 'Squircles, radius scale, layered shadows, Stroke/Twotone/Hugeicons, PersonAvatar.', to: '/design-system/foundations/shape-elevation-icons' },
  { id: 'f-a11y', title: 'Motion, Focus Rings, Localization & A11y', subtitle: 'Reduced motion, keyboard focus halos, >= 24px targets, RTL & useLocale() conventions.', to: '/design-system/foundations/motion-accessibility' },
];

const ENTRY_CARDS: Array<{
  title: string;
  desc: string;
  to: string;
  cta: string;
  icon: IconName;
  meta: string;
}> = [
  {
    title: 'Staff Guidance',
    desc: 'Internal playbooks & 2026 Product Design Principles tailored for Hudumika designers, company developers, and marketers.',
    to: '/design-system/guidance/principles',
    cta: 'Open Staff Guidance',
    icon: 'bookOpen',
    meta: 'Principles + 3 role guides',
  },
  {
    title: 'Foundations',
    desc: 'Tokens, resolved light/dark values, accent contrast floor, typography, density, icons, avatars, and accessibility rules.',
    to: '/design-system/foundations/color',
    cta: 'Explore Foundations',
    icon: 'sliders',
    meta: '5 deep-linkable topics',
  },
  {
    title: 'Components',
    desc: 'Interactive atomic catalog backed by real apps/web/src/components/ui/ primitives with isolated state, theme, density & viewport controls.',
    to: '/design-system/components/atoms',
    cta: 'Browse Catalog',
    icon: 'layers',
    meta: `${CATALOG_ENTRIES.length} entries across 5 atomic levels`,
  },
  {
    title: 'Patterns',
    desc: 'Copyable blueprints for form validation, destructive confirmation, table bulk actions, permission gates, and retry flows.',
    to: '/design-system/patterns',
    cta: 'View Patterns',
    icon: 'gitBranch',
    meta: `${PATTERN_SPECS.length} end-to-end recipes`,
  },
  {
    title: 'App Configurator',
    desc: 'Single source of truth for per-app branding, 5-layer color inheritance waterfall, isolated light/dark previews, and role-gated publish.',
    to: '/design-system/configurator',
    cta: 'Configure Apps',
    icon: 'color',
    meta: `${CONFIGURABLE_APP_REGISTRY.length} registered apps`,
  },
  {
    title: 'Quality & Governance',
    desc: 'CI gates, icon/label compliance checks, exception register, FinOps & Axis pilots, deprecated blockers, and release checklist.',
    to: '/design-system/quality',
    cta: 'Inspect Quality',
    icon: 'shield',
    meta: `${QUALITY_CHECKS.length} tracked quality gates`,
  },
];

export function DesignSystemOverviewPage() {
  const { user } = useAuth();
  const { designSystemVersion } = useDesignSystem();
  const studio = useDesignStudioController();
  const [query, setQuery] = useState('');

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isWorkspaceAdmin = isSuperAdmin || ['ADMIN', 'TENANT_ADMIN'].includes(user?.role ?? '');

  const searchResults = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: SearchResult[] = [];
    for (const g of GUIDANCE_INDEX) {
      if (g.title.toLowerCase().includes(q) || g.subtitle.toLowerCase().includes(q)) {
        results.push({ id: g.id, kind: 'Guidance', title: g.title, subtitle: g.subtitle, to: g.to });
      }
    }
    for (const f of FOUNDATIONS_INDEX) {
      if (f.title.toLowerCase().includes(q) || f.subtitle.toLowerCase().includes(q)) {
        results.push({ id: f.id, kind: 'Foundation', title: f.title, subtitle: f.subtitle, to: f.to });
      }
    }
    for (const c of CATALOG_ENTRIES) {
      if (c.name.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q) || c.sourcePath.toLowerCase().includes(q)) {
        results.push({
          id: `c-${c.id}`,
          kind: 'Component',
          title: c.name,
          subtitle: `${c.layer} · ${c.summary}`,
          to: `/design-system/components/${c.layer}?item=${c.id}`,
        });
      }
    }
    for (const p of PATTERN_SPECS) {
      if (p.title.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q)) {
        results.push({ id: `p-${p.id}`, kind: 'Pattern', title: p.title, subtitle: p.summary, to: `/design-system/patterns/${p.id}` });
      }
    }
    for (const a of CONFIGURABLE_APP_REGISTRY) {
      if (a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || a.slogan.toLowerCase().includes(q)) {
        results.push({
          id: `a-${a.id}`,
          kind: 'App',
          title: `${a.name} (${a.id})`,
          subtitle: a.slogan || 'Configurable workspace app accent & identity',
          to: `/design-system/configurator/${a.id}`,
        });
      }
    }
    for (const qc of QUALITY_CHECKS) {
      if (qc.name.toLowerCase().includes(q) || qc.description.toLowerCase().includes(q)) {
        results.push({ id: `q-${qc.id}`, kind: 'Quality', title: qc.name, subtitle: qc.command, to: '/design-system/quality/checks' });
      }
    }
    return results.slice(0, 12);
  }, [query]);

  const sampleFinops = resolveAppColorDetails('finops');
  const sampleAxis = resolveAppColorDetails('nexushr');

  return (
    <div className="dsa-page">
      <PageHeader
        crumbs={['Hudumika', 'Design System']}
        titlePlain="Hudumika"
        titleEm="design system"
        subtitle="The internal platform home for token foundations, atomic components, UI patterns, app appearance configuration, and quality governance."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tip label="Open Product Design Principles & role playbooks for designers, developers, and marketers">
              <Button variant="outline" size="sm" asChild>
                <Link to="/design-system/guidance/principles">
                  <Icon name="bookOpen" size={14} />
                  Staff Guidance
                </Link>
              </Button>
            </Tip>
            <Tip label="Inspect CI checks, exception waivers, and audited FinOps & Axis pilots">
              <Button variant="outline" size="sm" asChild>
                <Link to="/design-system/quality">
                  <Icon name="shield" size={14} />
                  Quality &amp; Pilots
                </Link>
              </Button>
            </Tip>
            <Tip label="Inspect & publish app names, slogans, logos, and color accents">
              <Button size="sm" asChild>
                <Link to="/design-system/configurator">
                  <Icon name="sliders" size={14} />
                  Open App Configurator
                </Link>
              </Button>
            </Tip>
          </div>
        }
      />

      <DesignSystemStudioBar studio={studio} />

      <MetricsRow
        cards={[
          { title: 'Cataloged Primitives', value: String(CATALOG_ENTRIES.length), sub1Label: 'SOURCE', sub1Value: 'components/ui/' },
          { title: 'Registered Apps', value: String(CONFIGURABLE_APP_REGISTRY.length), sub1Label: 'DEFAULTS', sub1Value: 'appDefaults.ts' },
          { title: 'Pattern Blueprints', value: String(PATTERN_SPECS.length), sub1Label: 'COVERAGE', sub1Value: 'Forms, tables, gates' },
          {
            title: 'Active Engine Mode',
            value:
              designSystemVersion.version === 'v2'
                ? 'v2 Mellon'
                : designSystemVersion.version === 'v3'
                  ? 'v3 Dreams Core'
                  : 'v1 Standard',
            sub1Label: 'ACCESS',
            sub1Value: isSuperAdmin ? 'Platform + Workspace' : isWorkspaceAdmin ? 'Workspace Write' : 'Staff Read-Only',
          },
        ]}
      />

      <SectionCard
        title="Search tokens, components, patterns, apps & checks"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Browse: All Staff ({user?.role ?? 'STAFF'})</Badge>
            <Badge variant={isSuperAdmin ? 'success' : isWorkspaceAdmin ? 'brand' : 'outline'}>
              {isSuperAdmin ? 'Publish: Platform + Workspace' : isWorkspaceAdmin ? 'Publish: Workspace Override' : 'Publish: Admin Required'}
            </Badge>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Label htmlFor="ds-global-search" className="sr-only">
              Search Design System documentation and apps
            </Label>
            <div className="relative flex-1">
              <Input
                id="ds-global-search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search e.g. DataTable, Contrast Floor, FinOps, form validation, @hudumika/ui..."
              />
            </div>
            {query && (
              <Button type="button" variant="outline" size="sm" onClick={() => setQuery('')}>
                Clear search
              </Button>
            )}
          </div>

          {query.trim() && (
            <div className="space-y-1.5" role="region" aria-label="Search results">
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">No matching tokens, components, patterns, or apps for &ldquo;{query}&rdquo;.</p>
              ) : (
                searchResults.map(res => (
                  <Link
                    key={res.id}
                    to={res.to}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors no-underline"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{res.kind}</Badge>
                        <span className="text-sm font-semibold text-foreground truncate">{res.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{res.subtitle}</p>
                    </div>
                    <Icon name="chevronRight" size={14} color="var(--ink3)" />
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
      </SectionCard>

      <div className="dsa-grid-3">
        {ENTRY_CARDS.map(card => (
          <Card key={card.title} className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex items-center justify-between gap-2 mb-2">
                <FeaturedIcon variant="brand" size="md">
                  <Icon name={card.icon} size={16} />
                </FeaturedIcon>
                <Badge variant="outline">{card.meta}</Badge>
              </div>
              <CardTitle className="text-base">{card.title}</CardTitle>
              <CardDescription>{card.desc}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link to={card.to}>
                  {card.cta}
                  <Icon name="arrowRight" size={13} />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <SectionCard title="Platform Theme Presets & Engine Mode">
        <ThemePresetsAndEngineSection studio={studio} />
      </SectionCard>

      <SectionCard title="How appearance configuration reaches every workspace screen">
        <div className="dsa-grid-2">
          <div className="space-y-2.5 text-sm">
            <p className="text-muted-foreground leading-relaxed">
              Every app shell wraps its routes in <code>WorkspaceApp</code>, which resolves the app&apos;s accent through{' '}
              <code>useBranding().getAppColor()</code>, applies an automatic light/dark contrast transformation (<code>lightenHex(color, 0.45)</code> in dark mode + <code>enforceContrastFloor(..., 4.5)</code> for buttons), and writes both <code>--teal*</code> and shadcn <code>--primary</code>/<code>--color-primary</code> onto both the wrapper and <code>:root</code> so portalled Radix menus always agree with the page.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Tip label={`Inspect live FinOps resolution chain (${sampleFinops.effective})`}>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/design-system/configurator/finops">Inspect FinOps ({sampleFinops.effective})</Link>
                </Button>
              </Tip>
              <Tip label={`Inspect live Axis resolution chain (${sampleAxis.effective})`}>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/design-system/configurator/nexushr">Inspect Axis ({sampleAxis.effective})</Link>
                </Button>
              </Tip>
              <Tip label="Read the shared 2026 Hudumika Product Design Principles and team checklists">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/design-system/guidance/principles">Product Design Principles</Link>
                </Button>
              </Tip>
            </div>
          </div>

          <div className="space-y-2">
            {[
              { step: '1. Mellon v2 override', desc: 'Uniform platform color when design_system_version = v2', key: 'hudumika_ds_version' },
              { step: '2. Workspace app override', desc: 'Per-tenant customization saved via PUT /v1/settings/branding', key: 'hudumika_tenant_app_color_<appId>' },
              { step: '3. Platform app branding', desc: 'SuperAdmin default saved via PUT /v1/platform/branding', key: 'hudumika_app_color_<appId>' },
              { step: '4. Workspace global accent', desc: 'Organization-wide fallback when no per-app override exists', key: 'hudumika_tenant_accent' },
              { step: '5. Canonical code default', desc: 'Single source of truth in lib/appDefaults.ts (e.g. FinOps #0284c7, Axis #0d9488)', key: 'DEFAULT_APP_COLORS' },
            ].map(layer => (
              <div key={layer.step} className="dsa-waterfall-step">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-foreground">{layer.step}</div>
                  <div className="text-xs text-muted-foreground">{layer.desc}</div>
                </div>
                <code className="text-[11px] font-mono text-muted-foreground shrink-0">{layer.key}</code>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
