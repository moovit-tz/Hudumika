import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tip } from '@/components/ui/tooltip';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { LauncherAppSvg } from '../../components/LauncherApps.js';
import { useDesignSystem } from '../../hooks/useDesignSystem.js';
import { CONFIGURABLE_APP_REGISTRY, resolveAppColorDetails } from '../../lib/appRegistry.js';
import { formatAmount } from '../../lib/currency.js';
import { useBranding } from '../../hooks/useBranding.js';
import { DesignSystemStudioBar, useDesignStudioController } from './helpers.js';
import './DesignSystemApp.css';

const GUIDANCE_TABS = [
  { id: 'principles', label: 'Product Principles', tip: 'Shared 2026 Hudumika standard across all teams and products' },
  { id: 'designers', label: 'For Designers', tip: 'Neutral surface discipline, responsive reflow, states, and token geometry' },
  { id: 'developers', label: 'For Company Developers', tip: 'Component mapping, PageLayout shells, tenant RLS, apiFetch & CI checks' },
  { id: 'marketers', label: 'For Marketers & Content', tip: 'Voice & tone matrix, blocking messages, brand nomenclature & campaign rules' },
] as const;

type GuidanceRoleTab = (typeof GUIDANCE_TABS)[number]['id'];

const PROMISE_PILLARS = [
  {
    title: 'Make the next action clear',
    desc: 'Put the user’s task and its current state before internal terminology or promotion.',
  },
  {
    title: 'Make important facts dependable',
    desc: 'Use real system state. Label estimates, stale data, missing integrations and unavailable services.',
  },
  {
    title: 'Preserve context',
    desc: 'Identity, tenant, people, contacts, notifications, audit history and finance should connect consistently.',
  },
  {
    title: 'Respect consequences',
    desc: 'Financial, legal, safety, HR, customs and customer actions need validation, permissions and recovery.',
  },
];

const DECISION_PRINCIPLES = [
  {
    num: 1,
    title: 'People before internal structure',
    desc: 'Design around real users, roles, goals and working conditions—not the org chart or database schema.',
  },
  {
    num: 2,
    title: 'Clear before clever',
    desc: 'Use familiar words, visible labels and explicit states. Progressive disclosure can hide complexity, not essential meaning.',
  },
  {
    num: 3,
    title: 'Trust through truth',
    desc: 'Never simulate a successful send, payment, sync, approval or delivery. Show queued, processing, complete, rejected or unknown accurately.',
  },
  {
    num: 4,
    title: 'One system, useful variation',
    desc: 'Share controls and behavior. Allow product-specific patterns only for validated domain needs, expressed as reusable and reviewed extensions.',
  },
  {
    num: 5,
    title: 'Choice with guardrails',
    desc: 'Explain material effects before spending money, exposing data, contacting customers, changing access or submitting to a regulator.',
  },
  {
    num: 6,
    title: 'Reliability is part of the interface',
    desc: 'Design loading, empty, partial, offline, denied, stale, conflict and failure states. Keep user work recoverable.',
  },
  {
    num: 7,
    title: 'Privacy and least access',
    desc: 'Show only what a person needs for their role. Enforce permissions server-side across search, exports, notifications and AI context.',
  },
  {
    num: 8,
    title: 'Accessibility is baseline quality',
    desc: 'Support keyboard, screen readers, contrast, focus, reduced motion, touch, zoom, localization and low-connectivity conditions.',
  },
];

const VISUAL_LANGUAGE_RULES = [
  { label: 'Brand', rule: 'Keep Hudumika’s platform identity and configured app accents. Do not copy another company’s visual identity or proprietary assets.' },
  { label: 'Color', rule: 'Use semantic tokens for meaning and app accents for identity. Never make color the only status signal. Use contrast-safe tokens for filled actions.' },
  { label: 'Shape and density', rule: 'Use global radii, spacing and control-height tokens. Compact layouts must remain readable and usable.' },
  { label: 'Typography', rule: 'Use the configured type scale. Keep titles, section headings, labels, body text and metadata distinct.' },
  { label: 'Icons', rule: 'Use the shared library. Pair icons with labels for unfamiliar or high-impact actions; icon-only actions need accessible names and hints.' },
  { label: 'Surfaces', rule: 'Cards group related information and work. Avoid decorative card sprawl and keep critical actions visible without page-wide horizontal scrolling.' },
  { label: 'Motion', rule: 'Explain changes and preserve orientation. Respect reduced motion; never imply completion before confirmation.' },
];

const VOICE_TONE_ROWS = [
  { moment: 'Routine work', tone: 'Brief and neutral', guidance: 'The task or result, without filler' },
  { moment: 'Success', tone: 'Calm and specific', guidance: 'What completed and what happens next' },
  { moment: 'Validation', tone: 'Helpful and local', guidance: 'What this field needs and how to correct it' },
  { moment: 'Technical issue', tone: 'Steady and candid', guidance: 'What was affected, whether data was saved, and a recovery step' },
  { moment: 'Risk or compliance', tone: 'Serious and precise', guidance: 'Facts versus signals, evidence and review path' },
  { moment: 'Money or irreversible action', tone: 'Explicit and complete', guidance: 'Amount, currency, recipient, timing and consequence' },
];

const DOMAIN_GUARDRAILS = [
  { area: 'Finance, Petti, tax', visible: 'Currency, period, ledger source, reconciliation and approval', guardrail: 'Exact values remain available in details and exports; distinguish draft, posted and paid.' },
  { area: 'ClearOS, customs', visible: 'Jurisdiction, references, rule source/freshness, deadlines and evidence', guardrail: 'Guidance is not an official determination; surface missing evidence and reviewer.' },
  { area: 'Freight, Tuma, Seal', visible: 'Shipment, owner, event time/time zone, custody and exceptions', guardrail: 'Distinguish device-reported events from human-confirmed events.' },
  { area: 'NexusHR, payroll', visible: 'Person, effective date, policy, approvals and corrections', guardrail: 'Role-scope sensitive records; explain calculation assumptions and exceptions.' },
  { area: 'CRM', visible: 'Identity, relationship, owner, next action, consent and history', guardrail: 'Prevent duplicate identities; show provenance and consent before outreach.' },
  { area: 'Bliss support', visible: 'Impact, severity, first response, ownership, resolution and feedback', guardrail: 'Measure speed and quality; don’t reward unsafe closure or manipulate ratings.' },
  { area: 'Ondi identity', visible: 'Account, tenant, role, session and application', guardrail: 'Make organization context, recovery and session termination discoverable.' },
  { area: 'Zentra oversight', visible: 'Signal source, evidence, confidence, scope and appeal path', guardrail: 'A risk signal is not proof; avoid unreviewed adverse decisions.' },
];

const ARCHITECTURE_LAYERS = [
  { name: 'Hudumika core', desc: 'Identity, tenancy, entitlements, design language, APIs, audit events and accessibility behavior.' },
  { name: 'Products', desc: 'Own specialist workflows and data semantics; use documented Ondi identity and authorized APIs for shared services.' },
  { name: 'Shared services', desc: 'Contacts, email, SMS, tasks, finance, HR, documents and compliance expose stable permission-aware APIs. No cross-product table shortcuts.' },
  { name: 'Events', desc: 'Define ownership, version, tenant scope, idempotency, retries and audit requirements; distinguish queued, accepted and confirmed outcomes.' },
  { name: 'Entitlements', desc: 'Backend checks enforce access. A locked feature explains its value without pretending it is active.' },
];

const TEAM_OWNERSHIP_ROWS = [
  { team: 'Product', owns: 'User problem, outcome, scope and measures', ask: 'Which user task improves, and how will we know?' },
  { team: 'Design', owns: 'Flow, hierarchy, content, accessibility and system reuse', ask: 'Can a new user understand state and next action without coaching?' },
  { team: 'Engineering', owns: 'Correct state, APIs, isolation, performance and resilience', ask: 'Is the result true, permission-checked, recoverable and observable?' },
  { team: 'Content', owns: 'Names, help, localization, errors and glossary', ask: 'Is the message clear in the user’s context?' },
  { team: 'Security & privacy', owns: 'Data classification, access, retention and audit', ask: 'Could this expose more than the user needs?' },
  { team: 'Operations & support', owns: 'Runbooks, escalation and service recovery', ask: 'What happens when this is delayed or unavailable?' },
  { team: 'Marketing', owns: 'Positioning, claims and channel-specific content', ask: 'Is the claim substantiated, accessible and clearly Hudumika-owned?' },
];

const DOD_CHECKLIST = [
  { id: 'dod-1', label: 'Shared components and tokens used; exceptions are reviewed.' },
  { id: 'dod-2', label: 'Relevant loading, empty, partial, success, denied, stale/offline and failure states work.' },
  { id: 'dod-3', label: 'Keyboard, screen reader, focus, contrast, motion, touch, zoom and small-screen behavior checked.' },
  { id: 'dod-4', label: 'Server-side tenant access tested, including a cross-tenant denial case.' },
  { id: 'dod-5', label: 'High-impact actions have confirmation, idempotency, audit trail and recovery.' },
  { id: 'dod-6', label: 'Copy, dates, time zones, currency, precision and provenance verified.' },
];

const EXTENSION_STEPS = [
  'Search the catalog and existing code.',
  'State the user need and why existing components cannot solve it.',
  'Design reusable behavior, including errors and recovery.',
  'Check accessibility, responsiveness, localization, tenant theme, density and dark mode.',
  'Put cross-product patterns in the shared system; keep one-product workflows composed from shared primitives.',
  'Document the rule, owner and review date; migrate old patterns in safe increments.',
];

const DESIGNER_EIGHT_STATES = [
  { state: 'Default', spec: 'Neutral card surface (--surface), 1px/token border (--border), clear primary next action.' },
  { state: 'Hover', spec: 'Subtle tint/border contrast without shifting layout geometry or hiding text.' },
  { state: 'Focus', spec: 'Visible 3:1 focus ring (--focus-ring-color) outside the control border across light and dark.' },
  { state: 'Selected', spec: 'Tokenized --teal-l fill + --teal text/indicator pill + aria-selected / aria-current.' },
  { state: 'Disabled / Locked', spec: 'aria-disabled on async loading to keep keyboard focus; explain why a gated feature is locked.' },
  { state: 'Loading', spec: 'Skeleton matching final layout height + ds-spinner with loadingText; no layout jump.' },
  { state: 'Empty / Partial', spec: 'Use EmptyState with plain explanation and single next step; show stale/partial warning if incomplete.' },
  { state: 'Error / Conflict', spec: 'Blocking-message formula: what happened, save/charge state, and direct recovery action.' },
];

const DESIGNER_HANDOFF_CHECKLIST = [
  { id: 'des-1', label: '90% neutral surface discipline: zero decorative rainbow gradients, colored drop shadows, or tinted passive KPI cards.' },
  { id: 'des-2', label: 'Narrow-first artboards verified at 320px, 375px, 768px, 1440px, and 200% zoom with zero page-level horizontal scroll.' },
  { id: 'des-3', label: 'Every icon-only button has a <Tip label="…"> tooltip + aria-label, and meets >= 24x24px target size (>= 44px for tabs/primary actions).' },
  { id: 'des-4', label: 'Multi-step flows designed as full-page routes (ComplyWizardPage pattern), reserving dialogs for confirmations.' },
  { id: 'des-5', label: 'All 8 states specified: Default, Hover, Focus, Selected, Disabled, Loading, Empty/Partial, Error/Conflict.' },
  { id: 'des-6', label: 'Numeric figures, currency totals (TZS / USD), and table columns use tabular numerals (tabular-nums) right-aligned.' },
];

const COMPONENT_MAPPING_ROWS = [
  { pattern: 'Buttons & CTAs', useThis: 'Button from @/components/ui/button (default/outline/destructive/ghost/link)', avoid: 'Raw <button className="btn"> or @hudumika/ui Button' },
  { pattern: 'Form inputs & pickers', useThis: 'Input, Label, Select, Checkbox, Switch, Textarea from @/components/ui/*', avoid: 'Unlabeled <input>, raw <select>, or custom checkbox spans' },
  { pattern: 'Cards & Panels', useThis: 'Card / SectionCard / MetricCard / PageHeader', avoid: 'Hand-rolled div boxes with hardcoded rounded-[12px] or hex fills' },
  { pattern: 'Tooltips', useThis: 'Tip or Tooltip from @/components/ui/tooltip', avoid: 'Native HTML title="..." attributes on interactive buttons/chips' },
  { pattern: 'Dialogs & Drawers', useThis: 'Dialog, AlertDialog, Sheet (full-page wizard routes for multi-step)', avoid: 'position:fixed overlays for multi-step forms or custom backdrop divs' },
  { pattern: 'Data fetching & HTTP', useThis: 'apiFetch(path, options) from @/lib/api', avoid: 'Direct fetch()/axios calls or dead @hudumika/api-client package' },
  { pattern: 'App icons & branding', useThis: 'Icon / LauncherAppSvg + useBranding()', avoid: 'Hardcoded SVG brand logos or uncontracted icon SVGs' },
];

const DEV_ROUTE_SNIPPET = `// 1. Register inside <Route element={<PageLayout />}> in apps/web/src/shells/<App>Shell.tsx
<Route element={<PageLayout />}>
  <Route path="invoices" element={<InvoicesPage />} />
  <Route path="invoices/new" element={<NewInvoiceWizardPage />} />
</Route>

// 2. Always fetch via apiFetch and check foreign IDs tenant-side in apps/api
const data = await apiFetch<InvoiceList>('/v1/finops/invoices');

// In apps/api route handler (withTenant + explicit .where('tenant_id', '=', tenantId)):
const row = await db
  .selectFrom('invoices')
  .selectAll()
  .where('tenant_id', '=', request.user.tenant_id)
  .where('id', '=', id)
  .executeTakeFirst();`;

const DEV_CI_COMMANDS = `npm run typecheck
node scripts/check-design-system.mjs
node scripts/check-icon-button-names.mjs
node scripts/check-field-labels.mjs
node scripts/check-ui-focus-targets.mjs
node scripts/check-ui-zoom-rtl.mjs
npx vitest run apps/web/src/lib/theme-contrast.test.ts`;

const MARKETERS_CAMPAIGN_CHECKLIST = [
  { id: 'mkt-1', label: 'Hudumika-owned identity: per-app accent & name read from useBranding(), never copying third-party brand marks.' },
  { id: 'mkt-2', label: 'Substantiated product claims tied to live capabilities — never mark beta, queued, or estimated metrics as guaranteed outcomes.' },
  { id: 'mkt-3', label: 'Explicit disclosure wherever AI Assist, OCR extraction, or compliance rule summaries assist a user.' },
  { id: 'mkt-4', label: 'CRM / SMS / WhatsApp / Email outreach verifies provenance, opt-in consent, and suppression lists before send.' },
  { id: 'mkt-5', label: 'Prices, quotas, and deadlines formatted via formatAmount() (e.g. TZS) and explicit timezone labels (EAT / UTC+3).' },
];

export function GuidancePage() {
  const { role } = useParams<{ role?: string }>();
  const navigate = useNavigate();
  const studio = useDesignStudioController();
  const { tokens, designSystemVersion } = useDesignSystem();
  const branding = useBranding();

  const activeTab: GuidanceRoleTab = GUIDANCE_TABS.some(t => t.id === role)
    ? (role as GuidanceRoleTab)
    : 'principles';

  const [filterText, setFilterText] = useState('');
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({
    'dod-1': true,
    'des-1': true,
    'mkt-1': true,
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function toggleCheck(id: string, val: boolean) {
    setCheckedMap(prev => ({ ...prev, [id]: val }));
  }

  function copySnippet(key: string, text: string) {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1400);
  }

  const normalizedFilter = filterText.trim().toLowerCase();

  const filteredPrinciples = useMemo(() => {
    if (!normalizedFilter) return DECISION_PRINCIPLES;
    return DECISION_PRINCIPLES.filter(
      p => p.title.toLowerCase().includes(normalizedFilter) || p.desc.toLowerCase().includes(normalizedFilter),
    );
  }, [normalizedFilter]);

  const filteredGuardrails = useMemo(() => {
    if (!normalizedFilter) return DOMAIN_GUARDRAILS;
    return DOMAIN_GUARDRAILS.filter(
      g =>
        g.area.toLowerCase().includes(normalizedFilter) ||
        g.visible.toLowerCase().includes(normalizedFilter) ||
        g.guardrail.toLowerCase().includes(normalizedFilter),
    );
  }, [normalizedFilter]);

  const filteredComponents = useMemo(() => {
    if (!normalizedFilter) return COMPONENT_MAPPING_ROWS;
    return COMPONENT_MAPPING_ROWS.filter(
      r =>
        r.pattern.toLowerCase().includes(normalizedFilter) ||
        r.useThis.toLowerCase().includes(normalizedFilter) ||
        r.avoid.toLowerCase().includes(normalizedFilter),
    );
  }, [normalizedFilter]);

  return (
    <div className="dsa-page">
      <PageHeader
        crumbs={['Design System', 'Staff Guidance']}
        titlePlain="Internal staff"
        titleEm="guidance"
        subtitle="Role-specific standards and production playbooks for Hudumika product designers, company developers, and marketers — grounded in our 2026 Product Design Principles."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand">Internal Hudumika Staff Only</Badge>
            <Tip label="Export or print the current guidance page to PDF using the browser print layout">
              <Button variant="outline" size="sm" type="button" onClick={() => window.print()}>
                <Icon name="printer" size={14} />
                Print / Save PDF
              </Button>
            </Tip>
          </div>
        }
      />

      <DesignSystemStudioBar studio={studio} />

      <div className="dsa-toolbar-card">
        <div className="flex-1 min-w-[220px] space-y-1">
          <Label htmlFor="ds-guidance-filter">Filter rules, guardrails & component guidance</Label>
          <Input
            id="ds-guidance-filter"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            placeholder="Filter e.g. ClearOS, PageLayout, WCAG, blocking message, TZS..."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tip label="Current active shape radii, border thickness, and density applied live to this page">
            <Badge variant="outline">
              Radius {tokens.shape.rSm}/{tokens.shape.r}/{tokens.shape.rLg}px · Border {tokens.shape.borderWidth}px · Card {tokens.shape.cardBorderWidth ?? 1}px
            </Badge>
          </Tip>
          {filterText && (
            <Tip label="Clear guidance filter">
              <Button type="button" variant="outline" size="sm" onClick={() => setFilterText('')}>
                <Icon name="x" size={13} />
                Clear
              </Button>
            </Tip>
          )}
        </div>
      </div>

      <Tabs
        value={activeTab}
        variant="segmented"
        onValueChange={val => navigate(`/design-system/guidance/${val}`)}
      >
        <TabsList className="flex-wrap">
          {GUIDANCE_TABS.map(tab => (
            <Tip key={tab.id} label={tab.tip}>
              <TabsTrigger value={tab.id}>{tab.label}</TabsTrigger>
            </Tip>
          ))}
        </TabsList>

        {/* 1. Product Design Principles (Full 2026 Standard) */}
        <TabsContent value="principles" className="space-y-4 mt-4">
          <div className="dsa-guidance-hero">
            <div className="dsa-guidance-eyebrow">Hudumika · Product, design &amp; engineering</div>
            <h2 className="dsa-guidance-h1">Design for work that matters.</h2>
            <p className="dsa-guidance-lede">
              A shared standard for building clear, dependable and connected products across Hudumika—and for giving every team room to solve its domain’s real problems.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Badge variant="secondary">Working standard · 2026</Badge>
              <Badge variant="outline">All products and departments</Badge>
              <Badge variant="brand">Adapted for Hudumika</Badge>
            </div>
          </div>

          <SectionCard title="01 · The promise — One platform. Specialist products. Shared trust.">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed m-0">
                Hudumika helps organizations coordinate work, money, people, records and services. A user should understand what is happening, what it means and what they can safely do next—on a phone in the field or at a desk reviewing an organization-wide report.
              </p>
              <div className="dsa-grid-2">
                {PROMISE_PILLARS.map(item => (
                  <Card key={item.title}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold text-foreground">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground leading-relaxed m-0">{item.desc}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="02 · Decision principles — How we choose what to build">
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground m-0">
                Use these principles when scope, speed, consistency and local needs compete. Record significant exceptions and their owner in the{' '}
                <Link to="/design-system/quality/exceptions" className="text-primary underline font-medium">Exception Register</Link>.
              </p>
              <div className="dsa-grid-2">
                {filteredPrinciples.map(p => (
                  <div key={p.num} className="dsa-guidance-tile">
                    <div className="flex items-center gap-2.5 mb-2">
                      <Tip label={`Decision Principle #${p.num}`}>
                        <span className="dsa-guidance-num">{p.num}</span>
                      </Tip>
                      <h3 className="text-sm font-bold text-primary m-0">{p.title}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed m-0">{p.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="03 · Shared visual language — Use the system; don’t freeze it in a page">
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground m-0">
                The runtime design system owns exact values and component behavior. Read <code className="font-mono">docs/DESIGN_SYSTEM.md</code> before adding UI.
              </p>
              <div className="dsa-grid-2">
                {VISUAL_LANGUAGE_RULES.map(rule => (
                  <div key={rule.label} className="dsa-waterfall-step items-start">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-foreground">{rule.label}</div>
                      <p className="text-xs text-muted-foreground leading-relaxed m-0">{rule.rule}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="dsa-guidance-callout">
                <strong>Responsive rule:</strong> Design narrow-first. Preserve task order, labels, values and primary actions; reflow grids and detail panels; use intentional table behavior. Check <code>320px</code>, <code>375px</code>, tablet, desktop and <code>200%</code> zoom.
              </div>
            </div>
          </SectionCard>

          <SectionCard title="04 · Voice & content — Clear, capable, considerate and candid">
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground m-0">Hudumika’s voice stays consistent. Tone changes with the user’s moment.</p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="dsa-guidance-table">
                  <thead>
                    <tr>
                      <th>Moment</th>
                      <th>Use this tone</th>
                      <th>Make sure the user knows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VOICE_TONE_ROWS.map(row => (
                      <tr key={row.moment}>
                        <td><strong>{row.moment}</strong></td>
                        <td>{row.tone}</td>
                        <td>{row.guidance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-5 leading-relaxed">
                <li>Put the key fact first. Use one action per button: <strong>Save changes</strong>, <strong>Review invoice</strong>.</li>
                <li>Never blame the user or use vague &ldquo;Something went wrong&rdquo; when the cause is known.</li>
                <li>Use consistent names. Define specialist terms for users who may not know them.</li>
                <li>Format dates, time zones, currencies, units and large figures for locale and context.</li>
                <li>Disclose estimates, AI assistance and uncertain matches. Let users verify consequential output.</li>
              </ul>
              <div className="dsa-guidance-callout">
                <strong>Blocking-message pattern:</strong> Say what happened. Explain whether the action or data was saved, sent or charged. Give a safe next step.
              </div>
            </div>
          </SectionCard>

          <SectionCard title="05 · Product-specific guardrails — Specialist context, shared quality">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground m-0">
                Each domain adds rules to prevent ambiguity. None may weaken tenant isolation, access control, auditability, accessibility or truthful status.
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="dsa-guidance-table">
                  <thead>
                    <tr>
                      <th>Product area</th>
                      <th>Make visible</th>
                      <th>Guardrail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGuardrails.map(row => (
                      <tr key={row.area}>
                        <td><strong>{row.area}</strong></td>
                        <td>{row.visible}</td>
                        <td>{row.guardrail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </SectionCard>

          <div className="dsa-grid-2">
            <SectionCard title="06 · Product architecture — Shared services, clear boundaries">
              <div className="space-y-2.5">
                {ARCHITECTURE_LAYERS.map(layer => (
                  <div key={layer.name} className="dsa-waterfall-step items-start">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-foreground">{layer.name}</div>
                      <p className="text-xs text-muted-foreground leading-relaxed m-0">{layer.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="08 · Extend & measure — Improve the system with evidence">
              <div className="space-y-3">
                <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal pl-5 leading-relaxed">
                  {EXTENSION_STEPS.map(step => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <div className="dsa-guidance-callout text-xs">
                  <strong>What we measure:</strong> Task completion and time, errors and retries, abandonment, support contacts, accessibility defects, mobile overflow, stale/conflicting data, privacy incidents, shared-component adoption and user confidence. Do not improve speed by shifting risk or hidden work to another team.
                </div>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="07 · Team responsibilities — Shared ownership, clear questions">
            <div className="space-y-5">
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="dsa-guidance-table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Owns</th>
                      <th>Ask before release</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TEAM_OWNERSHIP_ROWS.map(row => (
                      <tr key={row.team}>
                        <td><strong>{row.team}</strong></td>
                        <td>{row.owns}</td>
                        <td>{row.ask}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="dsa-grid-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Definition of ready</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground leading-relaxed m-0">
                      Identify users and roles, job, success measure, mobile/low-connectivity conditions, data sensitivity, failure states, source of truth, integrations and localization needs.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm">Definition of done</CardTitle>
                      <Badge variant="outline">
                        {DOD_CHECKLIST.filter(i => checkedMap[i.id]).length}/{DOD_CHECKLIST.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {DOD_CHECKLIST.map(item => (
                      <div key={item.id} className="flex items-start gap-2.5">
                        <Checkbox
                          id={item.id}
                          checked={Boolean(checkedMap[item.id])}
                          onCheckedChange={v => toggleCheck(item.id, Boolean(v))}
                        />
                        <Label htmlFor={item.id} className="text-xs leading-relaxed cursor-pointer">
                          {item.label}
                        </Label>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Sources and adaptation">
            <div className="space-y-2 text-xs text-muted-foreground">
              <p className="m-0">
                This Hudumika standard is informed by public design-system guidance. It is not Uber policy and does not reuse Uber’s identity or proprietary materials.
              </p>
              <ul className="space-y-1 list-disc pl-5">
                <li><a href="https://base.uber.com/" target="_blank" rel="noreferrer" className="text-primary underline">Uber Base design system overview</a></li>
                <li><a href="https://base.uber.com/6d2425e9f/v/0/p/040a13-product-voice" target="_blank" rel="noreferrer" className="text-primary underline">Uber Base product voice</a> · <a href="https://base.uber.com/6d2425e9f/p/4245c4-content" target="_blank" rel="noreferrer" className="text-primary underline">Content guidance</a></li>
                <li><a href="https://www.uber.com/us/en/marketplace/principles/" target="_blank" rel="noreferrer" className="text-primary underline">Uber marketplace principles</a></li>
                <li><a href="https://medium.com/uber-design/77-things-about-uber-design-4621516e495c" target="_blank" rel="noreferrer" className="text-primary underline">77 Things About Uber Design</a> · <a href="https://wolffolins.com/work/uber" target="_blank" rel="noreferrer" className="text-primary underline">Wolff Olins: Uber</a></li>
                <li><a href="https://www.uber.com/gb/en/advertising/specs/guidelines/" target="_blank" rel="noreferrer" className="text-primary underline">Universal creative guidelines</a> · <a href="https://www.uber.com/global/en/legal/global-advertising-content-policy/" target="_blank" rel="noreferrer" className="text-primary underline">Advertising content policy</a> · <a href="https://www.uber.com/iq/en/blog/creative-best-practices-the-rules-of-the-road-for-uber-advertising/" target="_blank" rel="noreferrer" className="text-primary underline">Creative best practices</a></li>
              </ul>
              <p className="m-0 pt-1">
                Implementation reference: <code className="font-mono">docs/DESIGN_SYSTEM.md</code> · Review this standard when Hudumika’s products, regions or user needs change.
              </p>
            </div>
          </SectionCard>
        </TabsContent>

        {/* 2. For Designers */}
        <TabsContent value="designers" className="space-y-4 mt-4">
          <div className="dsa-grid-2">
            <SectionCard
              title="Color & 90% neutral surface rule"
              action={
                <Tip label="Inspect AA contrast floor & semantic token pairs">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/design-system/foundations/color">Color Foundations</Link>
                  </Button>
                </Tip>
              }
            >
              <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
                <p className="m-0">
                  Every colored pixel must help the user <strong>find, distinguish, or act</strong>. Never tint ordinary KPI cards, hero banners, table rows, or icon tiles decoratively (see audited <Link to="/design-system/quality/pilots" className="text-primary underline">FinOps &amp; Axis pilots</Link>).
                </p>
                <div className="space-y-2">
                  <div className="dsa-waterfall-step">
                    <span><strong>90% Neutral</strong> · <code className="font-mono">--bg</code>, <code className="font-mono">--surface</code>, <code className="font-mono">--border</code></span>
                    <Badge variant="outline">Cards &amp; tables</Badge>
                  </div>
                  <div className="dsa-waterfall-step">
                    <span><strong>App Identity</strong> · <code className="font-mono">--teal</code>, <code className="font-mono">--primary</code></span>
                    <Badge variant="brand">Primary CTA &amp; active nav</Badge>
                  </div>
                  <div className="dsa-waterfall-step">
                    <span><strong>Operational Semantic</strong> · <code className="font-mono">--green</code> / <code className="font-mono">--gold</code> / <code className="font-mono">--red</code></span>
                    <Badge variant="warning">Paired with text label</Badge>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Live token geometry & heights (selected studio preset)"
              action={
                <Tip label="Adjust radius presets, border widths & density in Foundations">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/design-system/foundations/shape-elevation-icons">Edit Geometry</Link>
                  </Button>
                </Tip>
              }
            >
              <div className="space-y-2.5 text-xs">
                <p className="text-muted-foreground m-0">
                  All cards, inputs, buttons, badges, tabs, and tooltips in Hudumika bind live to the active tokens chosen in the studio bar above:
                </p>
                <div className="dsa-grid-2">
                  <div className="dsa-waterfall-step">
                    <span>Buttons &amp; Inputs radius</span>
                    <code className="font-mono font-bold">--r-sm: {tokens.shape.rSm}px</code>
                  </div>
                  <div className="dsa-waterfall-step">
                    <span>Field Cards &amp; Popups</span>
                    <code className="font-mono font-bold">--r: {tokens.shape.r}px</code>
                  </div>
                  <div className="dsa-waterfall-step">
                    <span>Section Cards &amp; Dialogs</span>
                    <code className="font-mono font-bold">--card-radius: {tokens.shape.rLg}px</code>
                  </div>
                  <div className="dsa-waterfall-step">
                    <span>Badges &amp; Status Chips</span>
                    <code className="font-mono font-bold">--badge-radius: {tokens.shape.badgeRadius}px</code>
                  </div>
                  <div className="dsa-waterfall-step">
                    <span>Control &amp; Tooltip Border</span>
                    <code className="font-mono font-bold">--border-width: {tokens.shape.borderWidth}px</code>
                  </div>
                  <div className="dsa-waterfall-step">
                    <span>Card Frame Stroke</span>
                    <code className="font-mono font-bold">--card-border-width: {tokens.shape.cardBorderWidth ?? 1}px</code>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="8-State completeness & full-page workflow rules"
            action={
              <Tip label="Inspect live component state toggles & full-page pattern recipes">
                <Button size="sm" variant="outline" asChild>
                  <Link to="/design-system/patterns">View Pattern Blueprints</Link>
                </Button>
              </Tip>
            }
          >
            <div className="space-y-4">
              <div className="dsa-grid-4">
                {DESIGNER_EIGHT_STATES.map(s => (
                  <div key={s.state} className="dsa-guidance-tile">
                    <div className="text-xs font-bold text-primary mb-1">{s.state}</div>
                    <p className="text-xs text-muted-foreground m-0 leading-relaxed">{s.spec}</p>
                  </div>
                ))}
              </div>
              <Alert>
                <Icon name="layoutDashboard" size={14} />
                <AlertTitle>Multi-step flows are dedicated routes, never overlay modals</AlertTitle>
                <AlertDescription className="text-xs">
                  Follow <code>ComplyWizardPage</code>, <code>OnboardingWizard</code>, and <code>TradeWizard</code>: trigger multi-step forms via <code>navigate()</code> inside <code>PageLayout</code>. Reserve centered modals for single-step confirmations.
                </AlertDescription>
              </Alert>
            </div>
          </SectionCard>

          <SectionCard
            title="Design review & Figma handoff checklist"
            action={
              <Badge variant="outline">
                {DESIGNER_HANDOFF_CHECKLIST.filter(i => checkedMap[i.id]).length}/{DESIGNER_HANDOFF_CHECKLIST.length} ready
              </Badge>
            }
          >
            <div className="dsa-grid-2">
              {DESIGNER_HANDOFF_CHECKLIST.map(item => (
                <div key={item.id} className="flex items-start gap-2.5">
                  <Checkbox
                    id={item.id}
                    checked={Boolean(checkedMap[item.id])}
                    onCheckedChange={v => toggleCheck(item.id, Boolean(v))}
                  />
                  <Label htmlFor={item.id} className="text-xs leading-relaxed cursor-pointer">
                    {item.label}
                  </Label>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        {/* 3. For Company Developers */}
        <TabsContent value="developers" className="space-y-4 mt-4">
          <SectionCard
            title="Authoritative component & API mapping (do not add a second pattern)"
            action={
              <Tip label="Explore interactive component specimens and copyable JSX">
                <Button size="sm" variant="outline" asChild>
                  <Link to="/design-system/components/atoms">Components Catalog</Link>
                </Button>
              </Tip>
            }
          >
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="dsa-guidance-table">
                <thead>
                  <tr>
                    <th>UI need</th>
                    <th>Authoritative Hudumika primitive</th>
                    <th>Banned / dead end (do not use)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredComponents.map(row => (
                    <tr key={row.pattern}>
                      <td><strong>{row.pattern}</strong></td>
                      <td><code>{row.useThis}</code></td>
                      <td className="text-destructive">{row.avoid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="dsa-grid-2">
            <SectionCard title="Non-negotiable backend & multi-tenant rules (apps/api)">
              <div className="space-y-2.5 text-xs text-muted-foreground">
                <div className="dsa-waterfall-step items-start">
                  <div>
                    <div className="font-bold text-foreground">FORCE ROW LEVEL SECURITY + Explicit WHERE</div>
                    <p className="m-0 mt-0.5">Call <code>withTenant()</code> AND always add <code>.where('tenant_id', '=', request.user.tenant_id)</code>. Validate foreign IDs (<code>customer_id</code>, <code>application_id</code>) belong to the same tenant before linking.</p>
                  </div>
                </div>
                <div className="dsa-waterfall-step items-start">
                  <div>
                    <div className="font-bold text-foreground">JWT Identity uses sub, never .id</div>
                    <p className="m-0 mt-0.5"><code>JWTPayload</code> exposes <code>request.user.sub</code> (UUID). Never copy latent bugs reading <code>request.user.id</code>.</p>
                  </div>
                </div>
                <div className="dsa-waterfall-step items-start">
                  <div>
                    <div className="font-bold text-foreground">Tailwind v4 variable syntax &amp; Tooltips</div>
                    <p className="m-0 mt-0.5">Write <code>w-(--var)</code> instead of <code>w-[--var]</code> (no <code>tailwind.config.js</code>). Wrap interactive icon buttons in <code>&lt;Tip label=&quot;…&quot;&gt;</code> instead of native <code>title=</code>.</p>
                  </div>
                </div>
                <div className="dsa-waterfall-step items-start">
                  <div>
                    <div className="font-bold text-foreground">Error shape &amp; PageLayout wrapping</div>
                    <p className="m-0 mt-0.5">Return <code>{'{ error, message }'}</code> from Fastify so <code>apiFetch</code> surfaces actionable UI messages. Wrap standard shell routes inside <code>&lt;Route element={'{<PageLayout />}'}&gt;</code>.</p>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Reference implementation & pre-merge verification gates"
              action={
                <Tip label="Copy shell route + multi-tenant Kysely pattern">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copySnippet('dev-route', DEV_ROUTE_SNIPPET)}
                  >
                    <Icon name={copiedKey === 'dev-route' ? 'check' : 'copy'} size={13} />
                    {copiedKey === 'dev-route' ? 'Copied' : 'Copy snippet'}
                  </Button>
                </Tip>
              }
            >
              <div className="space-y-3">
                <pre className="dsa-code-block">{DEV_ROUTE_SNIPPET}</pre>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground">Mandatory CI &amp; Accessibility Gates</span>
                  <Tip label="Copy verification shell commands">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => copySnippet('dev-ci', DEV_CI_COMMANDS)}
                    >
                      <Icon name={copiedKey === 'dev-ci' ? 'check' : 'copy'} size={12} />
                      {copiedKey === 'dev-ci' ? 'Copied' : 'Copy commands'}
                    </Button>
                  </Tip>
                </div>
                <pre className="dsa-code-block">{DEV_CI_COMMANDS}</pre>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        {/* 4. For Marketers & Content Teams */}
        <TabsContent value="marketers" className="space-y-4 mt-4">
          <div className="dsa-grid-2">
            <SectionCard title="Platform positioning & design system engine modes">
              <div className="space-y-2.5 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2 m-0">
                  <span>Hudumika balances distinct specialist products with unified organization trust. Active engine mode:</span>
                  <Badge variant="brand">
                    {designSystemVersion.version === 'v2' ? 'v2 Mellon' : designSystemVersion.version === 'v3' ? 'v3 Dreams Core' : 'v1 Per-App'}
                  </Badge>
                </div>
                <div className="dsa-waterfall-step items-start">
                  <div>
                    <div className="font-bold text-foreground">v1 · Per-App Identity (Default)</div>
                    <p className="m-0 mt-0.5">25 domain apps retain distinct accent hues and squircle marks configured via <code>useBranding()</code> while sharing neutral chrome.</p>
                  </div>
                </div>
                <div className="dsa-waterfall-step items-start">
                  <div>
                    <div className="font-bold text-foreground">v2 · Mellon Unified Enterprise</div>
                    <p className="m-0 mt-0.5">Single organization-wide corporate accent (e.g. <code>#1257c6</code>) for multi-department enterprises wanting cohesive suite branding.</p>
                  </div>
                </div>
                <div className="dsa-waterfall-step items-start">
                  <div>
                    <div className="font-bold text-foreground">v3 · Dreams Core Minimal Workspace</div>
                    <p className="m-0 mt-0.5">Calm high-focus workspace cards with bento rhythm and restrained ink accents for operations and dispatch teams.</p>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Campaign, localization & trust checklist">
              <div className="space-y-3">
                <div className="dsa-guidance-callout text-xs">
                  <strong>Blocking-message formula (in-app &amp; lifecycle messaging):</strong> State what happened · Confirm whether action/data/funds were saved, sent, or charged · Provide one concrete next step.
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-[var(--r-sm)] border-[length:var(--border-width,1px)] border border-border bg-card">
                    <span>Canonical Currency Formatting (<code className="font-mono">formatAmount</code>)</span>
                    <strong className="font-mono tabular-nums text-foreground">{formatAmount(180000, 'TZS')}</strong>
                  </div>
                  {MARKETERS_CAMPAIGN_CHECKLIST.map(item => (
                    <div key={item.id} className="flex items-start gap-2.5 pt-1">
                      <Checkbox
                        id={item.id}
                        checked={Boolean(checkedMap[item.id])}
                        onCheckedChange={v => toggleCheck(item.id, Boolean(v))}
                      />
                      <Label htmlFor={item.id} className="text-xs leading-relaxed cursor-pointer">
                        {item.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Registered app nomenclature & identity directory"
            action={
              <Tip label="Open App Configurator to inspect or update app names, slogans, accents, and logos">
                <Button size="sm" variant="outline" asChild>
                  <Link to="/design-system/configurator">Open App Configurator</Link>
                </Button>
              </Tip>
            }
          >
            <div className="dsa-grid-3">
              {CONFIGURABLE_APP_REGISTRY.slice(0, 12).map(app => {
                const details = resolveAppColorDetails(app.id);
                const liveName = branding.getAppName(app.id, app.name);
                const liveSlogan = branding.getAppSlogan(app.id, app.slogan);
                return (
                  <Card key={app.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3">
                        <LauncherAppSvg id={app.id} color={details.effective} size={40} />
                        <div className="min-w-0">
                          <CardTitle className="text-sm truncate">{liveName}</CardTitle>
                          <CardDescription className="text-xs font-mono">{app.id} · {details.effective}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground truncate">{liveSlogan || 'Workspace module'}</span>
                      <Tip label={`Inspect ${liveName} identity settings`}>
                        <Button size="xs" variant="outline" asChild>
                          <Link to={`/design-system/configurator/${app.id}`}>Inspect</Link>
                        </Button>
                      </Tip>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
