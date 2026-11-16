import { type PreviewStateMode } from './PreviewStage.js';

export type AtomicLayer = 'atoms' | 'molecules' | 'organisms' | 'templates' | 'examples';
export type StabilityStatus = 'stable' | 'domain' | 'deprecated';

export interface CatalogEntry {
  id: string;
  name: string;
  layer: AtomicLayer;
  status: StabilityStatus;
  sourcePath: string;
  summary: string;
  whenToUse: string;
  whenNotToUse: string;
  variants: string[];
  states: PreviewStateMode[];
  a11yNotes: string[];
  tokensUsed: string[];
  codeExample: string;
  relatedIds?: string[];
}

export interface PatternSpec {
  id: string;
  title: string;
  category: string;
  summary: string;
  rules: string[];
  a11yChecklist: string[];
  sourceFiles: string[];
  codeSnippet: string;
}

export interface QualityCheckSpec {
  id: string;
  name: string;
  command: string;
  status: 'automated' | 'manual' | 'pending';
  lastResult: string;
  scope: string;
  description: string;
}

export interface ExceptionEntry {
  id: string;
  surface: string;
  category: string;
  reason: string;
  reviewDate: string;
  status: 'active-waiver' | 'in-remediation';
}

export interface PilotAppRow {
  appId: string;
  appName: string;
  route: string;
  shellFile: string;
  status: 'audited-clean' | 'in-progress' | 'baseline';
  adoptionScore: string;
  highlights: string[];
}

export const ATOMIC_LAYER_META: Record<AtomicLayer, { label: string; badge: string; description: string }> = {
  atoms: {
    label: 'Foundations & Atoms',
    badge: 'Level 1',
    description: 'Indivisible primitives: tokens, icons, buttons, badges, inputs, switches, checkboxes, avatars, and indicators.',
  },
  molecules: {
    label: 'Molecules',
    badge: 'Level 2',
    description: 'Focused multi-element groups: labelled form fields, search & filter controls, date ranges, breadcrumbs, tabs, pagination, menus, and feedback banners.',
  },
  organisms: {
    label: 'Organisms',
    badge: 'Level 3',
    description: 'Standalone UI sections: PageHeader, DataTable, ResponsiveTable, AppSidebar, Toolbars, MetricCard/SectionCard, Dialog/Drawer, CommandMenu, Charts, FileUploader, and Empty States.',
  },
  templates: {
    label: 'Templates',
    badge: 'Level 4',
    description: 'Page-level layout blueprints: Register List, Detail Drawer/Page, Long Stepped Form, Executive Dashboard, Work Queue, Settings, and Master/Detail Inbox.',
  },
  examples: {
    label: 'Working Examples',
    badge: 'Level 5',
    description: 'Real multi-component screens assembled for Axis (nexushr) and FinOps (finops) showing neutral surfaces with purposeful app-accent hierarchy.',
  },
};

export const CATALOG_ENTRIES: CatalogEntry[] = [
  // ── ATOMS ──
  {
    id: 'button',
    name: 'Button',
    layer: 'atoms',
    status: 'stable',
    sourcePath: 'apps/web/src/components/ui/button.tsx',
    summary: 'Primary interactive trigger with 8 semantic variants and responsive minimum touch heights (--ctl-h*).',
    whenToUse: 'Any user-initiated action: Save, Submit, Export, Delete confirmation, or toolbar triggers.',
    whenNotToUse: 'Pure page navigation without state side effects (use Link styled neutrally or with buttonVariants instead).',
    variants: ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link', 'soft', 'neutral', 'size: sm', 'size: default', 'size: lg', 'size: icon'],
    states: ['default', 'hover', 'focus', 'disabled', 'loading', 'long-content'],
    a11yNotes: [
      'Icon-only buttons (size="icon") MUST include aria-label or sit inside <Tip label="..."> (enforced by check:icon-button-names).',
      'Minimum interactive target >= 24px enforced globally; primary buttons track --action-h (44px+ touch safe).',
      'Never nest a clickable element inside Button; use asChild for router Link.',
    ],
    tokensUsed: ['--primary', '--primary-foreground', '--ring', '--ctl-h', '--ctl-h-sm', '--ctl-h-lg', '--action-h'],
    codeExample: `import { Button } from '@/components/ui/button';
import { Icon } from '@/components/Icon';

<div className="flex flex-wrap gap-2">
  <Button>Save Changes</Button>
  <Button variant="outline"><Icon name="download" size={14} /> Export CSV</Button>
  <Button variant="destructive">Revoke Access</Button>
</div>`,
  },
  {
    id: 'badge',
    name: 'Badge & Status Pill',
    layer: 'atoms',
    status: 'stable',
    sourcePath: 'apps/web/src/components/ui/badge.tsx',
    summary: 'Compact status, exception, and count indicators paired with text labels.',
    whenToUse: 'Operational states (Overdue, Active, Pending, Blocked), category tags (secondary/outline), and counts.',
    whenNotToUse: 'Decorating every card header or routine list row with saturated rainbow pills.',
    variants: ['default', 'secondary', 'outline', 'destructive', 'success', 'warning', 'teal', 'soft', 'purple', 'muted'],
    states: ['default', 'long-content'],
    a11yNotes: [
      'Always pair color with explicit text or icon cue — never convey Approved vs Rejected by hue alone.',
      'Avoid interactive cursor or click handlers on static Badge; use Toggle or Button instead.',
    ],
    tokensUsed: ['--teal', '--green', '--gold', '--red', '--purple', '--border'],
    codeExample: `import { Badge } from '@/components/ui/badge';

<div className="flex flex-wrap gap-2">
  <Badge variant="secondary">Routine Label</Badge>
  <Badge variant="success">Verified</Badge>
  <Badge variant="warning">Due in 48h</Badge>
  <Badge variant="destructive">Blocked</Badge>
</div>`,
  },
  {
    id: 'input-controls',
    name: 'Input, Textarea, Checkbox, Radio & Switch',
    layer: 'atoms',
    status: 'stable',
    sourcePath: 'apps/web/src/components/ui/input.tsx',
    summary: 'Form input primitives sharing the control-contract focus ring, border contrast, and density heights.',
    whenToUse: 'All structured data capture, settings toggles, and inline filter boxes.',
    whenNotToUse: 'Raw unstyled HTML <input> without data-ui-field="input" or Label association.',
    variants: ['default', 'textarea', 'checkbox', 'radio-group', 'switch', 'input-otp', 'slider'],
    states: ['default', 'focus', 'selected', 'disabled', 'error', 'long-content'],
    a11yNotes: [
      'Every field preceded by <Label> MUST bind htmlFor -> id or supply aria-label (enforced by check:field-labels).',
      'Invalid fields set aria-invalid="true" and link inline validation copy via aria-describedby.',
      'Keyboard: Space toggles Checkbox/Switch; Arrow keys navigate RadioGroup items.',
    ],
    tokensUsed: ['--shadcn-input', '--ring', '--focus-ring-color', '--ctl-h', '--destructive'],
    codeExample: `import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

<div className="space-y-3">
  <div>
    <Label htmlFor="tin-input">TIN Registration</Label>
    <Input id="tin-input" placeholder="102-445-890" />
  </div>
  <div className="flex items-center gap-2">
    <Switch id="auto-sync" />
    <Label htmlFor="auto-sync">Auto-reconcile feed</Label>
  </div>
</div>`,
  },
  {
    id: 'icons-media',
    name: 'Icon, TwotoneIcon, FeaturedIcon & Avatar',
    layer: 'atoms',
    status: 'stable',
    sourcePath: 'apps/web/src/components/Icon.tsx',
    summary: 'Switchable Stroke / Twotone / Hugeicons vector icon pipeline plus PersonAvatar and CompanyAvatar identity marks.',
    whenToUse: 'Consistent UI symbology, people identity dots, and company/app squircle marks.',
    whenNotToUse: 'Arbitrary emojis inside headings or duplicate inline <svg> paths for icons already in Icon.tsx.',
    variants: ['stroke', 'twotone', 'hugeicons', 'featured-icon', 'person-avatar', 'company-avatar'],
    states: ['default', 'loading'],
    a11yNotes: [
      'Decorative icons beside text carry aria-hidden="true".',
      'PersonAvatar deterministically hashes user name across AVATAR_PALETTE in lib/identity.ts.',
    ],
    tokensUsed: ['--teal', '--teal-l', '--ink', '--border'],
    codeExample: `import { Icon } from '@/components/Icon';
import { FeaturedIcon } from '@/components/ui/featured-icon';
import { PersonAvatar } from '@/components/PersonAvatar';

<div className="flex items-center gap-3">
  <FeaturedIcon variant="brand" size="md"><Icon name="shield" size={16} /></FeaturedIcon>
  <PersonAvatar name="Amina Hassan" size={32} />
</div>`,
  },
  {
    id: 'typography-indicators',
    name: 'Link, Label, Separator, Spinner, Skeleton & Progress',
    layer: 'atoms',
    status: 'stable',
    sourcePath: 'apps/web/src/components/ui/spinner.tsx',
    summary: 'Foundational text links, accessible labels, dividers, deterministic progress bars, and loading skeletons.',
    whenToUse: 'Indicate async state transitions, section separation, and hierarchy cues.',
    whenNotToUse: 'Avoid full-page blocking spinners when a SkeletonPage preserves layout stability.',
    variants: ['spinner', 'skeleton', 'progress', 'separator', 'scroll-area', 'toggle'],
    states: ['default', 'loading'],
    a11yNotes: [
      'Progress uses aria-valuenow/min/max via Radix Progress.',
      'Links use real <Link to="..."> or <a href="..."> rather than clickable <div> tags.',
    ],
    tokensUsed: ['--primary', '--border', '--teal', '--ink3'],
    codeExample: `import { Spinner } from '@/components/ui/spinner';
import { Progress } from '@/components/ui/progress';
import { SkeletonText } from '@/components/ui/skeleton';

<div className="space-y-3">
  <Spinner size="sm" />
  <Progress value={68} />
  <SkeletonText lines={2} />
</div>`,
  },
  {
    id: 'deprecated-atoms',
    name: 'Deprecated / Legacy Primitives (@hudumika/ui, TopBar, .btn)',
    layer: 'atoms',
    status: 'deprecated',
    sourcePath: 'packages/ui/src/index.ts',
    summary: 'Dead or superseded packages and legacy un-contracted CSS classes kept visible so teams never import them for new work.',
    whenToUse: 'Never for new code — migrate touched files to apps/web/src/components/ui/* and apiFetch.',
    whenNotToUse: 'Any new page, drawer, dialog, or route in apps/web or packages/*.',
    variants: ['@hudumika/ui', '@hudumika/api-client', 'TopBar.tsx', 'legacy .btn'],
    states: ['default'],
    a11yNotes: [
      'Legacy packages lack control-contract focus-visible halos, AA contrast flooring, and icon-button lint guarantees.',
    ],
    tokensUsed: [],
    codeExample: `// DO NOT USE:
// import { Button } from '@hudumika/ui';
// import { ApiClient } from '@hudumika/api-client';

// USE PRODUCTION PRIMITIVES INSTEAD:
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';`,
  },

  // ── MOLECULES ──
  {
    id: 'search-filter-controls',
    name: 'SearchToolbar, FilterBar, Combobox & Select',
    layer: 'molecules',
    status: 'stable',
    sourcePath: 'apps/web/src/components/ui/filter-dropdown.tsx',
    summary: 'Unified register toolbar with debounced search, MultiSelect/SingleSelect filter dropdowns, and searchable Combobox.',
    whenToUse: 'List and register views needing search + structured multi-facet filtering alongside a primary CTA.',
    whenNotToUse: 'Ad-hoc flex rows mixing hardcoded borders and bespoke search inputs.',
    variants: ['SearchToolbar', 'FilterBar', 'SingleSelectFilter', 'MultiSelectFilter', 'Combobox', 'Select'],
    states: ['default', 'focus', 'selected', 'disabled', 'long-content'],
    a11yNotes: [
      'Search inputs automatically carry aria-label from placeholder/label.',
      'Select & Combobox support ArrowUp/ArrowDown, Enter, and Escape dismissal via Radix.',
    ],
    tokensUsed: ['--accent-foreground', '--teal-l', '--border', '--ctl-h-sm'],
    codeExample: `import { SearchToolbar, SingleSelectFilter } from '@/components/ui/filter-dropdown';

<SearchToolbar
  layout="register"
  search={query}
  onSearch={setQuery}
  placeholder="Search vouchers..."
  filters={
    <SingleSelectFilter
      label="Status"
      value={status}
      onChange={setStatus}
      options={[{ value: 'posted', label: 'Posted' }, { value: 'draft', label: 'Draft' }]}
    />
  }
/>`,
  },
  {
    id: 'date-color-controls',
    name: 'DatePicker, DateFilterRow & ColorSwatchPicker',
    layer: 'molecules',
    status: 'stable',
    sourcePath: 'apps/web/src/components/ui/date-picker.tsx',
    summary: 'Calendar popover date/range pickers, quick date presets, and curated WCAG-checked swatch selector.',
    whenToUse: 'Report date windows, payroll cutoffs, and workspace/app accent configuration.',
    whenNotToUse: 'Freeform text inputs asking users to type ISO dates manually without picker support.',
    variants: ['DatePicker', 'DateRangePicker', 'DateFilterRow', 'ColorSwatchPicker', 'ColorPicker'],
    states: ['default', 'selected', 'disabled', 'error'],
    a11yNotes: [
      'Always associate <Label htmlFor> or aria-label with DatePicker triggers.',
      'ColorSwatchPicker swatches pair hex values with tooltip/aria labels.',
    ],
    tokensUsed: ['--primary', '--teal', '--border', '--card'],
    codeExample: `import { DateFilterRow } from '@/components/ui/date-filter-row';
import { ColorSwatchPicker, PLATFORM_SWATCHES } from '@/components/ui/color-swatch-picker';

<DateFilterRow from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />`,
  },
  {
    id: 'navigation-molecules',
    name: 'Tabs, Breadcrumb, PaginationBar, Accordion & ToggleGroup',
    layer: 'molecules',
    status: 'stable',
    sourcePath: 'apps/web/src/components/ui/tabs.tsx',
    summary: 'Section switching (underline, pill, segmented), path breadcrumbs, canonical list pagination, and collapsible FAQ/settings groups.',
    whenToUse: 'Sub-navigation inside a page, drill-down trails, paginated registers, and grouped settings.',
    whenNotToUse: 'Replacing primary sidebar navigation with top tab strips.',
    variants: ['Tabs (default/underline/segmented)', 'Breadcrumb', 'PaginationBar', 'Accordion', 'ToggleGroup'],
    states: ['default', 'hover', 'focus', 'selected', 'long-content'],
    a11yNotes: [
      'Tabs implement roving Left/Right Arrow key navigation automatically.',
      'Breadcrumb renders <nav aria-label="breadcrumb"> with aria-current="page" on final crumb.',
    ],
    tokensUsed: ['--teal', '--teal-l', '--nav-item-r', '--border'],
    codeExample: `import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PaginationBar } from '@/components/PaginationBar';

<Tabs defaultValue="all" variant="segmented">
  <TabsList>
    <TabsTrigger value="all">All Records</TabsTrigger>
    <TabsTrigger value="open">Needs Review</TabsTrigger>
  </TabsList>
</Tabs>`,
  },
  {
    id: 'feedback-molecules',
    name: 'Alert, HeaderPill, EntityPicker, Menus & BackButton',
    layer: 'molecules',
    status: 'stable',
    sourcePath: 'apps/web/src/components/ui/alert.tsx',
    summary: 'Contextual banners, header notification/status pills, searchable customer/staff EntityPicker, DropdownMenu/Popover, and consistent BackButton.',
    whenToUse: 'Inline validation alerts, read-only permission notices, contextual overflow menus, and entity selection.',
    whenNotToUse: 'Global blocking modal alerts for non-critical status messages.',
    variants: ['Alert (default/destructive/warning/success)', 'HeaderPill', 'EntityPicker', 'DropdownMenu', 'Tooltip', 'BackButton'],
    states: ['default', 'error', 'loading', 'long-content'],
    a11yNotes: [
      'Alert applies role="alert" for assistive screen reader announcement.',
      'DropdownMenu and Tooltip portal cleanly and inherit active app accent from WorkspaceApp.',
    ],
    tokensUsed: ['--teal', '--red', '--gold', '--green', '--popover'],
    codeExample: `import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { BackButton } from '@/components/ui/BackButton';

<BackButton to="/finance" label="Back to FinOps" />
<Alert>
  <AlertTitle>Read-only preview</AlertTitle>
  <AlertDescription>Editing stays isolated until Publish.</AlertDescription>
</Alert>`,
  },

  // ── ORGANISMS ──
  {
    id: 'page-header',
    name: 'PageHeader',
    layer: 'organisms',
    status: 'stable',
    sourcePath: 'apps/web/src/components/PageHeader.tsx',
    summary: 'Signature Hudumika header featuring breadcrumb trail, two-tone titlePlain + lowercase accent titleEm, subtitle, and right-aligned action cluster.',
    whenToUse: 'Top of every content page inside a workspace shell.',
    whenNotToUse: 'Custom inline H1 headers with rainbow spans or trailing periods on titleEm.',
    variants: ['standard', 'with-backTo', 'with-crumbs', 'hero-summary'],
    states: ['default', 'long-content'],
    a11yNotes: [
      'Outputs semantic <h1> for the primary landmark heading; breadcrumbs supply <nav>.',
      'Right action container wraps gracefully at 320px/375px viewports.',
    ],
    tokensUsed: ['--teal', '--ink', '--ink3', '--page-title-size', '--page-title-font'],
    codeExample: `import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';

<PageHeader
  crumbs={['FinOps', 'Ledger']}
  titlePlain="General"
  titleEm="ledger"
  subtitle="Double-entry journal lines reconciled against active fiscal periods."
  actions={<Button>New Journal Entry</Button>}
/>`,
  },
  {
    id: 'data-table',
    name: 'DataTable & ResponsiveTable',
    layer: 'organisms',
    status: 'stable',
    sourcePath: 'apps/web/src/components/ui/DataTable.tsx',
    summary: 'Full-featured operational register table with sorting, multi-row selection, sticky columns, skeleton loading, retry errors, empty states, and ResponsiveTable mobile stacking.',
    whenToUse: 'Any tabular business entity register (invoices, shipments, staff directories, exception logs).',
    whenNotToUse: 'Ad-hoc <table> markup missing empty/loading/error handling or tabular-nums money alignment.',
    variants: ['DataTable', 'ResponsiveTable', 'with-bulk-selection', 'loading-skeleton', 'error-retry', 'empty-action'],
    states: ['default', 'selected', 'loading', 'error', 'long-content'],
    a11yNotes: [
      'Header selects and row checkboxes carry explicit labels.',
      'Tabular figures align cleanly with font-variant-numeric: tabular-nums.',
      'At <= 640px ResponsiveTable switches cells to data-label key/value rows.',
    ],
    tokensUsed: ['--teal-l', '--border', '--card-sunken', '--ds-cell-py', '--elev'],
    codeExample: `import { DataTable } from '@/components/ui/DataTable';

<DataTable
  columns={[
    { key: 'ref', label: 'Reference' },
    { key: 'status', label: 'Status' },
    { key: 'amount', label: 'Amount', align: 'right' },
  ]}
  rows={rows}
  selectedIds={selected}
  onSelectionChange={setSelected}
  pageSize={10}
/>`,
  },
  {
    id: 'cards-metrics',
    name: 'MetricCard, StatCard, SectionCard & ListItemRow',
    layer: 'organisms',
    status: 'stable',
    sourcePath: 'apps/web/src/components/MetricCard.tsx',
    summary: 'Neutral surface KPI cards with typographic figure hierarchy, trend indicators, SectionCard panels, and ListItemRow action rows.',
    whenToUse: 'Summary rows above registers, operational dashboard panels, and drill-down settings lists.',
    whenNotToUse: 'Assigning 4+ unrelated bright border colors or gradient fills to passive KPI cards (per FinOps & Axis pilots).',
    variants: ['MetricCard', 'MetricsRow', 'StatCard', 'SectionCard', 'ListItemRow'],
    states: ['default', 'hover', 'loading', 'long-content'],
    a11yNotes: [
      'Metric numbers preserve tabular alignment; avoid embedding interactive links inside clickable cards without clear focus bounds.',
    ],
    tokensUsed: ['--surface', '--border', '--elev', '--card-padding', '--card-radius'],
    codeExample: `import { MetricCard, MetricsRow } from '@/components/MetricCard';
import { SectionCard } from '@/components/SectionCard';

<MetricsRow>
  <MetricCard label="Posted Payroll" value="TZS 48.2M" sub="34 staff · verified" />
  <MetricCard label="Open Exceptions" value="3" sub="2 overdue" trend="down" />
</MetricsRow>`,
  },
  {
    id: 'overlays-dialogs',
    name: 'Dialog, Sheet (Drawer), CommandMenu & ConfirmHost',
    layer: 'organisms',
    status: 'stable',
    sourcePath: 'apps/web/src/components/ui/dialog.tsx',
    summary: 'Accessible portalled confirmations (showConfirm), quick-edit side Sheet drawers, Dialog modals, and Cmd/Ctrl+K Command search.',
    whenToUse: 'Single-purpose confirmations (Dialog/showConfirm), quick record inspection without losing list scroll (Sheet), and keyboard command palette.',
    whenNotToUse: 'Multi-step creation wizards inside fixed dialogs (must be dedicated routes/pages per AGENTS.md).',
    variants: ['Dialog', 'Sheet', 'Drawer', 'Command', 'ConfirmHost (showConfirm)'],
    states: ['default', 'focus', 'error', 'long-content'],
    a11yNotes: [
      'Focus trap, aria-labelledby, aria-modal, and Escape-to-close managed automatically by Radix Dialog.',
      'Returns focus to the triggering element on close.',
    ],
    tokensUsed: ['--popover', '--border', '--elev-lg', '--primary'],
    codeExample: `import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { showConfirm } from '@/lib/confirm';

const ok = await showConfirm('Archive 3 expired permits?', {
  confirmLabel: 'Archive Permits',
  danger: true,
});`,
  },
  {
    id: 'charts-boards-upload',
    name: 'ChartContainer, KanbanBoard, FileUploader & Calendar',
    layer: 'organisms',
    status: 'stable',
    sourcePath: 'apps/web/src/components/ui/chart.tsx',
    summary: 'Token-themed Recharts wrapper, paginated Kanban columns, drag-and-drop FileUploader, and inline Calendar widget.',
    whenToUse: 'Time-series comparison charts, workflow board pipelines, and multi-file document ingestion.',
    whenNotToUse: 'Unbounded SVG charts ignoring axis grid restraint or drag-only Kanban with no select fallback.',
    variants: ['ChartContainer', 'KanbanBoard', 'FileUploader', 'Calendar'],
    states: ['default', 'loading', 'error'],
    a11yNotes: [
      'KanbanBoard renders an accessible Select status switcher fallback alongside HTML drag-and-drop.',
      'Charts pair distinct series colors with direct legends/tooltips.',
    ],
    tokensUsed: ['--teal', '--blue', '--green', '--gold', '--border'],
    codeExample: `import { KanbanBoard } from '@/components/ui/kanban-board';
import { FileUploader } from '@/components/ui/file-uploader';

<FileUploader accept=".csv,.pdf" maxSizeMb={10} onFilesSelected={handleUpload} />`,
  },
  {
    id: 'shell-navigation-org',
    name: 'WorkspaceApp, AppSidebar, AppHeader, PageLayout & DetailPanel',
    layer: 'organisms',
    status: 'domain',
    sourcePath: 'apps/web/src/shells/WorkspaceApp.tsx',
    summary: 'Core app frame injecting app-scoped CSS tokens (--teal, --primary, dark tints), responsive nav drawer, unified header, and footer.',
    whenToUse: 'Every app shell in apps/web/src/shells/* wrapped around <Route element={<PageLayout />}>.',
    whenNotToUse: 'Ad-hoc shell wrappers duplicating TopBar.tsx or omitting PageLayout on non-exempt pages.',
    variants: ['WorkspaceApp', 'AppSidebar', 'AppHeader', 'PageLayout', 'DetailPanel'],
    states: ['default', 'selected'],
    a11yNotes: [
      'AppSidebar Escape handler closes mobile nav drawer and locks background body scroll.',
      'WorkspaceApp writes scoped variables to :root so Radix portals always match the active app.',
    ],
    tokensUsed: ['--teal', '--teal-l', '--teal-fill', '--nav-header-bg', '--sb-color'],
    codeExample: `import { WorkspaceApp } from '@/shells/WorkspaceApp';
import { AppSidebar } from '@/components/AppSidebar';
import { PageLayout } from '@/components/PageLayout';`,
  },

  // ── TEMPLATES ──
  {
    id: 'template-register',
    name: 'List & Register Page Template',
    layer: 'templates',
    status: 'stable',
    sourcePath: 'apps/web/src/pages/design_system/ComponentsCatalogPage.tsx',
    summary: 'PageHeader -> MetricsRow -> SearchToolbar -> DataTable -> PaginationBar with bulk action bar and slide-over Sheet detail.',
    whenToUse: 'Standard operational registers across ClearOS, FinOps, Axis, ComplyOS, and CRM.',
    whenNotToUse: 'Full-bleed canvas tools like live maps, calendar grids, or POS checkout terminals.',
    variants: ['register-with-kpis', 'register-minimal'],
    states: ['default', 'selected', 'loading', 'error'],
    a11yNotes: ['Maintains a single <h1> in PageHeader followed by landmarks for toolbar and data table.'],
    tokensUsed: ['--page-pad-x', '--content-gap', '--card-radius', '--teal'],
    codeExample: `<div className="page-stack">
  <PageHeader crumbs={['FinOps', 'Invoices']} titlePlain="Sales" titleEm="invoices" actions={<Button>New Invoice</Button>} />
  <MetricsRow>{/* 3-4 neutral KPI cards */}</MetricsRow>
  <SectionCard>
    <SearchToolbar layout="register" ... />
    <DataTable ... />
  </SectionCard>
</div>`,
  },
  {
    id: 'template-master-detail',
    name: 'Master / Detail & Settings Split Template',
    layer: 'templates',
    status: 'stable',
    sourcePath: 'apps/web/src/shells/AdminShell.tsx',
    summary: 'Two-column responsive rail + live workspace pane collapsing to single column with quick-select below 960px.',
    whenToUse: 'Settings consoles, component catalogs, App Configurator, inbox threads, and documentation viewers.',
    whenNotToUse: 'Simple 2-field confirmation forms (use Dialog) or high-column tables.',
    variants: ['rail-plus-detail', 'stepped-wizard-route'],
    states: ['default', 'selected', 'long-content'],
    a11yNotes: ['Active rail button sets aria-current="true" or aria-pressed="true".'],
    tokensUsed: ['--surface', '--border', '--teal-l', '--teal'],
    codeExample: `<div className="dsa-split-workspace">
  <aside className="dsa-list-rail">{/* Search + category items */}</aside>
  <main className="space-y-4">{/* Active item workspace */}</main>
</div>`,
  },
  {
    id: 'template-dashboard',
    name: 'Executive Operations Dashboard Template',
    layer: 'templates',
    status: 'stable',
    sourcePath: 'apps/web/src/pages/FinanceDashboard.tsx',
    summary: 'Neutral surface KPI row, restrained multi-series trend card, urgent action work queue, and clean navigation shortcuts.',
    whenToUse: 'App landing overviews (FinOps Overview, Axis Overview, Zentra Dashboard) prioritizing signal over decorative color.',
    whenNotToUse: 'Multi-colored rainbow tiles competing with exceptions or primary CTAs.',
    variants: ['ops-overview', 'work-queue'],
    states: ['default', 'loading'],
    a11yNotes: ['Reserve color for actionable exceptions and primary CTA; rely on weight & spacing for hierarchy.'],
    tokensUsed: ['--surface', '--bg', '--border', '--teal', '--red', '--gold'],
    codeExample: `<PageHeader crumbs={['FinOps']} titlePlain="Financial" titleEm="overview" actions={<Button>New Voucher</Button>} />
<MetricsRow>
  <MetricCard label="Cash Position" value="TZS 142.8M" />
  <MetricCard label="Overdue AR" value="TZS 12.4M" trend="down" />
</MetricsRow>`,
  },

  // ── WORKING EXAMPLES ──
  {
    id: 'example-finops',
    name: 'FinOps Pilot — Neutral Ledger & Restraint Example',
    layer: 'examples',
    status: 'stable',
    sourcePath: 'apps/web/src/pages/FinanceDashboard.tsx',
    summary: 'Live assembled FinOps view reflecting the FinOps Color Audit: neutral KPI cards, tabular-nums currency, restrained exception badges, and #0284c7 accent reserved for primary CTA and active nav.',
    whenToUse: 'Reference template when designing or auditing financial tables, dashboards, and variance figures.',
    whenNotToUse: 'Do not wrap routine income/expense numbers or card borders in decorative gradients or teal shadows.',
    variants: ['finops-overview'],
    states: ['default', 'selected', 'loading'],
    a11yNotes: ['Meaningful variance flags pair color with explicit sign/label ("Over budget +14%").'],
    tokensUsed: ['--teal (#0284c7 default)', '--surface', '--border', '--red', '--green'],
    codeExample: `// Neutral KPI cards + single primary CTA + tabular-nums register
<MetricCard label="Operating Cash" value={formatAmount(142800000, 'TZS')} sub="Across 3 treasury accounts" />`,
  },
  {
    id: 'example-axis',
    name: 'Axis (NexusHR) Pilot — People & Shift Hub Example',
    layer: 'examples',
    status: 'stable',
    sourcePath: 'apps/web/src/pages/hrm/HrmDashboard.tsx',
    summary: 'Live assembled Axis People workspace implementing neutral KPI panels, calm upcoming-holiday card, accessible quick-links, and configured #0d9488 accent focused on primary actions.',
    whenToUse: 'Reference template for HR rosters, payroll summaries, leave approval queues, and attendance widgets.',
    whenNotToUse: 'Do not paint 16-tile rainbow shortcut grids or full-width primary holiday hero banners.',
    variants: ['axis-people-hub'],
    states: ['default', 'selected', 'error'],
    a11yNotes: ['Action buttons inherit active --teal app accent rather than hardcoded green/teal strings.'],
    tokensUsed: ['--teal (#0d9488 default)', '--surface', '--border', '--ink2'],
    codeExample: `// Neutral shortcut card + single configured app accent CTA
<Button asChild><Link to="/nexushr/people">Open Directory</Link></Button>`,
  },
];

export const PATTERN_SPECS: PatternSpec[] = [
  {
    id: 'form-validation',
    title: 'Form Validation & Accessible Field Labelling',
    category: 'Forms & Workflows',
    summary: 'Bind every Label explicitly to its control, validate on submit and blur, announce field errors inline, and keep neutral form containers.',
    rules: [
      'Every <Label htmlFor="field-id"> matches its <Input id="field-id" /> or carries explicit aria-label (verified by check-field-labels.mjs).',
      'Display inline error copy immediately below the invalid field and set aria-invalid="true" + aria-describedby.',
      'Summarize blocked submission only when server validation fails across multiple hidden sections.',
      'Multi-step forms must use dedicated routes (never fixed modal overlays).',
    ],
    a11yChecklist: [
      'Focus moves to or clarifies the first invalid control on failed submission.',
      'Error color (--red / --destructive) is always paired with an icon or explicit error text.',
    ],
    sourceFiles: ['apps/web/src/components/ui/input.tsx', 'apps/web/src/components/ui/label.tsx', 'scripts/check-field-labels.mjs'],
    codeSnippet: `<div className="space-y-1.5">
  <Label htmlFor="vendor-tin">Vendor TIN *</Label>
  <Input
    id="vendor-tin"
    aria-invalid={Boolean(errors.tin)}
    aria-describedby={errors.tin ? 'vendor-tin-err' : undefined}
    value={tin}
    onChange={e => setTin(e.target.value)}
  />
  {errors.tin && (
    <p id="vendor-tin-err" role="alert" className="text-xs text-destructive flex items-center gap-1">
      <Icon name="alertCircle" size={12} /> {errors.tin}
    </p>
  )}
</div>`,
  },
  {
    id: 'destructive-confirmation',
    title: 'Destructive Confirmation & Irreversible Actions',
    category: 'Dialogs & Safety',
    summary: 'Intercept irreversible delete, void, or tenant revocation flows with clear consequence copy and a distinct destructive action button.',
    rules: [
      'Never execute permanent deletes on a single click from a table row or dropdown.',
      'Use showConfirm() (ConfirmHost) for standard confirmations or a controlled Dialog when typed phrase verification is needed.',
      'Place Cancel cleanly alongside a clearly labelled destructive CTA (e.g. "Void Invoice", not generic "OK").',
    ],
    a11yChecklist: [
      'Initial focus lands safely or traps keyboard Tab inside the confirmation dialog; Escape cancels cleanly.',
    ],
    sourceFiles: ['apps/web/src/lib/confirm.ts', 'apps/web/src/components/ConfirmHost.tsx', 'apps/web/src/components/ui/dialog.tsx'],
    codeSnippet: `const confirmed = await showConfirm(
  'Voiding INV-2026-0412 reverses ledger postings and notifies the customer.',
  {
    title: 'Void sales invoice?',
    confirmLabel: 'Void Invoice',
    danger: true,
  }
);
if (confirmed) await apiFetch('/v1/finance/invoices/412/void', { method: 'POST' });`,
  },
  {
    id: 'table-bulk-actions',
    title: 'Table Bulk Actions, Filter Reset & Empty States',
    category: 'Tables & Registers',
    summary: 'Reveal batch operations only while rows are selected, and distinguish true empty states from filtered-zero results.',
    rules: [
      'Keep ordinary table cells and money amounts visually neutral with tabular numerals.',
      'Render a contextual selection bar showing "{n} selected", bulk actions, and "Clear selection" when selectedIds.length > 0.',
      'Provide a one-click "Clear filters" action inside DataTable filteredEmpty when search/filter hides all rows.',
    ],
    a11yChecklist: [
      'Master checkbox carries aria-label="Select all visible rows"; bulk bar buttons remain keyboard-reachable.',
    ],
    sourceFiles: ['apps/web/src/components/ui/DataTable.tsx', 'apps/web/src/components/ui/filter-dropdown.tsx'],
    codeSnippet: `{selectedIds.length > 0 && (
  <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-lg border bg-card">
    <span className="text-xs font-semibold">{selectedIds.length} records selected</span>
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={handleBulkApprove}>Approve</Button>
      <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Clear</Button>
    </div>
  </div>
)}`,
  },
  {
    id: 'permission-gates',
    title: 'Role, Entitlement & Read-Only Permission Gates',
    category: 'Access Control',
    summary: 'Separate browse visibility from mutation authority both in API guards and explicit UI states.',
    rules: [
      'Use <RequireRoles roles={...}> for route-level blocking and backend requireRole()/requireEntitlement() as enforcement.',
      'When staff can browse documentation/settings read-only (e.g. Design System App Configurator), show an informative Alert rather than hiding the screen or failing silently.',
      'Distinguish SUPER_ADMIN platform publish controls from ADMIN/TENANT_ADMIN workspace publish controls.',
    ],
    a11yChecklist: [
      'Explain why a control is disabled or read-only via visible helper copy, not a silent inert button.',
    ],
    sourceFiles: ['apps/web/src/components/RequireRoles.tsx', 'apps/web/src/lib/permissions.ts'],
    codeSnippet: `const canPublishPlatform = user?.role === 'SUPER_ADMIN';
const canPublishWorkspace = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user?.role ?? '');

{!canPublishWorkspace && (
  <Alert>
    <AlertTitle>Read-only preview mode</AlertTitle>
    <AlertDescription>Staff members can inspect defaults and test drafts locally. Ask a Workspace or Platform Admin to publish.</AlertDescription>
  </Alert>
)}`,
  },
  {
    id: 'retry-error-flows',
    title: 'Loading, Retry & Graceful Error Recovery',
    category: 'Resilience',
    summary: 'Show layout-matched skeletons on load, preserve user draft state on transient API errors, and expose immediate Retry actions.',
    rules: [
      'Use <SkeletonPage /> or table skeletons while initial requests resolve.',
      'Display API errors from { error, message } cleanly via inline <Alert variant="destructive"> with a Retry button.',
      'Never clear unsaved draft edits or report "Saved" when pushBranding / apiFetch rejects.',
    ],
    a11yChecklist: [
      'Error containers carry role="alert" so keyboard and screen-reader users notice failed saves immediately.',
    ],
    sourceFiles: ['apps/web/src/lib/api.ts', 'apps/web/src/components/ui/skeleton.tsx', 'apps/web/src/components/ui/DataTable.tsx'],
    codeSnippet: `{error && (
  <Alert variant="destructive">
    <AlertTitle>Could not load register</AlertTitle>
    <AlertDescription className="flex items-center justify-between gap-3">
      <span>{error}</span>
      <Button size="sm" variant="outline" onClick={reload}>Retry</Button>
    </AlertDescription>
  </Alert>
)}`,
  },
  {
    id: 'master-detail-register',
    title: 'Responsive Split Master / Detail & App Shell Composition',
    category: 'Layouts',
    summary: 'Combine WorkspaceApp, AppSidebar, AppHeader, PageLayout, and a responsive two-column split that adapts seamlessly down to 320px.',
    rules: [
      'Wrap every standard route inside <Route element={<PageLayout />}> so copyright and legal links render consistently.',
      'Prevent horizontal table or code-block overflow at 320px/375px with minmax(0, 1fr) grid tracks and overflow-x: auto wrappers.',
    ],
    a11yChecklist: [
      'Touch/pointer controls stay >= 24px (prefer >= 36px for primary mobile controls).',
    ],
    sourceFiles: ['apps/web/src/components/PageLayout.tsx', 'apps/web/src/shells/DesignSystemShell.tsx'],
    codeSnippet: `<Routes>
  <Route element={<PageLayout />}>
    <Route index element={<OverviewPage />} />
    <Route path="items/:id" element={<DetailPage />} />
  </Route>
</Routes>`,
  },
];

export const QUALITY_CHECKS: QualityCheckSpec[] = [
  {
    id: 'check-design-system',
    name: 'Design System Gate (check:design-system)',
    command: 'npm run check:design-system',
    status: 'automated',
    lastResult: 'Enforced in typecheck & CI',
    scope: 'apps/web/src/** (excluding documented exceptions)',
    description: 'Verifies required ui/ primitives, PageLayout wiring, PageHeader titleEm discipline, design-token CSS variable adoption, and pilot hygiene.',
  },
  {
    id: 'check-icon-buttons',
    name: 'Accessible Icon Button Names',
    command: 'node scripts/check-icon-button-names.mjs',
    status: 'automated',
    lastResult: '0 violations across apps/web',
    scope: 'All icon-only <Button> & <button> elements',
    description: 'Fails build if any icon-only trigger lacks aria-label, title, or wrapping <Tip label="...">. ',
  },
  {
    id: 'check-field-labels',
    name: 'Explicit Form Field Labelling',
    command: 'node scripts/check-field-labels.mjs',
    status: 'automated',
    lastResult: '0 violations across apps/web',
    scope: 'Input, Textarea, SelectTrigger, Combobox, DatePicker',
    description: 'Verifies fields preceded by <Label> associate htmlFor->id or aria-label for assistive technologies.',
  },
  {
    id: 'check-focus-targets',
    name: 'Focus Halo & Minimum Target Size Audit',
    command: 'node scripts/check-ui-focus-targets.mjs',
    status: 'automated',
    lastResult: 'Automated contract check',
    scope: 'Buttons, links, switches, checkboxes >= 24px',
    description: 'Checks rendered interactive hit targets >= 24px and visible focus-visible indicator rings across light and dark modes.',
  },
  {
    id: 'check-zoom-rtl',
    name: 'Zoom 200% & RTL Direction Gate',
    command: 'node scripts/check-ui-zoom-rtl.mjs',
    status: 'automated',
    lastResult: 'Automated layout audit',
    scope: 'Shells and shared templates at 200% zoom & dir="rtl"',
    description: 'Ensures flex/grid headers wrap cleanly without clipping text or overlapping controls.',
  },
  {
    id: 'theme-contrast-test',
    name: 'WCAG AA Contrast Floor Unit Suite',
    command: 'npx vitest run apps/web/src/tests/theme-contrast.test.ts',
    status: 'automated',
    lastResult: 'AA >= 4.5:1 text / >= 3:1 focus',
    scope: 'lib/color.ts & useDesignSystem.ts presets',
    description: 'Mathematically tests enforceContrastFloor() and focusRingHex() across all curated platform themes.',
  },
  {
    id: 'live-playwright-ds',
    name: 'Playwright Cross-App Configurator & Pilot E2E',
    command: 'npx tsx scripts/verify-design-system-app.mts',
    status: 'pending',
    lastResult: 'Runs in final verification step',
    scope: '/design-system/*, /finance/*, /nexushr/*',
    description: 'Verifies deep links, search, keyboard navigation, 320px–1440px viewports, draft isolation, role gating, and live app accent propagation.',
  },
];

export const EXCEPTION_REGISTER: ExceptionEntry[] = [
  { id: 'EX-01', surface: 'ClearOSShell / ClearOS CSS', category: 'Domain branding & maps', reason: 'Legacy clearance workflow palette and Leaflet map panes pending Phase 2 audit.', reviewDate: '2026-Q4', status: 'in-remediation' },
  { id: 'EX-02', surface: 'ComplyOSShell / ComplyOS pages', category: 'Third-party & regulatory cards', reason: 'Regulatory risk cards scheduled right after Axis pilot completion.', reviewDate: '2026-Q4', status: 'in-remediation' },
  { id: 'EX-03', surface: 'Full-viewport Canvas Apps (POS, Email, Calendar, Tracking Map)', category: 'PageLayout exemption', reason: 'Require edge-to-edge 100vh viewport split; footer intentionally excluded inside canvas mode.', reviewDate: 'Permanent architectural waiver', status: 'active-waiver' },
  { id: 'EX-04', surface: 'ContactsApp (.contacts-avatar-rainbow)', category: 'Brand signifier', reason: 'Google-Contacts-inspired multi-color "+" creation button preserved by design.', reviewDate: 'Permanent architectural waiver', status: 'active-waiver' },
  { id: 'EX-05', surface: 'ClearOS PDF Export Templates (LandedCostPage)', category: 'Print & PDF stylesheet', reason: 'Signature ClearOS #161A1E dark hero print sheet preserved per AGENTS.md print invariant.', reviewDate: 'Permanent architectural waiver', status: 'active-waiver' },
  { id: 'EX-06', surface: '@hudumika/ui & @hudumika/api-client', category: 'Deprecated workspace packages', reason: 'Legacy 2-site import holdovers; frozen against new imports until deleted.', reviewDate: '2026-Q4', status: 'in-remediation' },
  { id: 'EX-07', surface: 'LauncherApps SVG multi-tone artwork (complyos, hudubi, petti)', category: 'Brand vector artwork', reason: 'App launcher squircle SVG illustrations use intentional multi-hue accent strokes.', reviewDate: 'Permanent visual waiver', status: 'active-waiver' },
];

export const PILOT_APPS: PilotAppRow[] = [
  {
    appId: 'finops',
    appName: 'FinOps',
    route: '/finance',
    shellFile: 'apps/web/src/shells/FinOpsShell.tsx',
    status: 'audited-clean',
    adoptionScore: '100% pilot audited (28 files)',
    highlights: [
      'Removed decorative gradients, teal-tinted borders, and rainbow KPI/report card fills across Dashboard, Industries, POS, Budgets, Bank Reconciliation, and Financial Statements.',
      'Neutralized passive debit/credit/revenue/expense figures with tabular-nums alignment.',
      'Reserved configured --teal (#0284c7 default) strictly for PageHeader titleEm, active nav, selected items, and primary CTAs.',
    ],
  },
  {
    appId: 'nexushr',
    appName: 'Axis (NexusHR)',
    route: '/nexushr',
    shellFile: 'apps/web/src/shells/NexusHRShell.tsx',
    status: 'audited-clean',
    adoptionScore: 'Dashboard, People & shared controls audited',
    highlights: [
      'Neutralized passive KPI icon tiles and rainbow 16-module shortcut grid in HrmDashboard.tsx / HRMDashboard.css.',
      'Replaced full-bleed primary hero fill on Next Holiday card with calm bordered neutral card + compact holiday badge.',
      'Unified ActionBtn and Peoples designation/filter colors onto configured app accent tokens (--teal) and shared AVATAR_COLORS.',
    ],
  },
  {
    appId: 'clearos',
    appName: 'ClearOS',
    route: '/clearos',
    shellFile: 'apps/web/src/shells/ClearOSShell.tsx',
    status: 'baseline',
    adoptionScore: 'Next audit wave',
    highlights: [
      'Canonical app accent unified to #ea580c across launcher and shell.',
      'Uses PageHeader, MetricCard, and SectionCard; legacy CSS overrides queued for color restraint audit.',
    ],
  },
  {
    appId: 'complyos',
    appName: 'ComplyOS',
    route: '/complyos',
    shellFile: 'apps/web/src/shells/ComplyOSShell.tsx',
    status: 'baseline',
    adoptionScore: 'Next audit wave',
    highlights: [
      'Full-page wizard pattern (`ComplyWizardPage.tsx`) serves as platform reference.',
      'Canonical app accent unified to #059669 across shell and Configurator.',
    ],
  },
  {
    appId: 'zentra',
    appName: 'Zentra',
    route: '/zentra',
    shellFile: 'apps/web/src/shells/ZentraShell.tsx',
    status: 'in-progress',
    adoptionScore: 'Security UI refactored to DS tokens',
    highlights: [
      'Workspace and activity views recently rebuilt with neutral cards and semantic exception pills.',
    ],
  },
];

export const ADOPTION_BASELINE_METRICS = [
  { label: 'UI Primitives Cataloged', value: String(CATALOG_ENTRIES.length), sub: '100% mapped to production files in components/ui/' },
  { label: 'Hardcoded Color Reduction (Pilots)', value: '28 + 4 files', sub: 'FinOps full suite + Axis core cleaned to token discipline' },
  { label: 'Deprecated Primitives Frozen', value: '4 legacy paths', sub: '@hudumika/ui (2 sites), TopBar.tsx (0), api-client (0), .btn' },
  { label: 'Active Governance Gates', value: '6 automated', sub: 'typecheck, icon-names, field-labels, focus-targets, zoom-rtl, AA' },
];
