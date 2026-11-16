import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { SkeletonText } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FeaturedIcon } from '@/components/ui/featured-icon';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BackButton } from '@/components/ui/BackButton';
import { DataTable, type TableColumn } from '@/components/ui/DataTable';
import { SearchToolbar } from '@/components/ui/filter-dropdown';
import { DateFilterRow } from '@/components/ui/date-filter-row';
import { ColorSwatchPicker, PLATFORM_SWATCHES } from '@/components/ui/color-swatch-picker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tip } from '@/components/ui/tooltip';
import { PageHeader } from '../../components/PageHeader.js';
import { MetricsRow } from '../../components/MetricCard.js';
import { SectionCard } from '../../components/SectionCard.js';
import { PersonAvatar, CompanyAvatar } from '../../components/PersonAvatar.js';
import { LauncherAppSvg } from '../../components/LauncherApps.js';
import { PaginationBar } from '../../components/PaginationBar.js';
import { Icon } from '../../components/Icon.js';
import { PreviewStage, type PreviewContextValue } from './PreviewStage.js';
import {
  ATOMIC_LAYER_META,
  CATALOG_ENTRIES,
  type AtomicLayer,
  type CatalogEntry,
  type StabilityStatus,
} from './dsCatalogData.js';
import ComponentShowcase from '../ComponentShowcase.js';
import { DesignSystemStudioBar, useDesignStudioController } from './helpers.js';
import { TabsAndDropdownsEditorSection } from './DesignStudioEditors.js';
import './DesignSystemApp.css';

const OscarCatalog = React.lazy(() => import('../OscarCatalog.js'));
const AnimationsShowcase = React.lazy(() => import('../AnimationsShowcase.js'));
const BuildingBlocksShowcase = React.lazy(() => import('../BuildingBlocksShowcase.js'));

interface SampleRow {
  id: string;
  ref: string;
  party: string;
  status: string;
  amount: string;
}

const SAMPLE_ROWS: SampleRow[] = [
  { id: '1', ref: 'INV-2026-0412', party: 'Rufiji Clearing Ltd', status: 'Posted', amount: 'TZS 4,820,000' },
  { id: '2', ref: 'INV-2026-0413', party: 'Kigoma Logistics Corp', status: 'Overdue', amount: 'TZS 1,290,000' },
  { id: '3', ref: 'INV-2026-0414', party: 'Mwanza Depot SA', status: 'Draft', amount: 'TZS 845,500' },
];

const STATUS_BADGE: Record<StabilityStatus, { label: string; variant: 'success' | 'brand' | 'destructive' }> = {
  stable: { label: 'Stable', variant: 'success' },
  domain: { label: 'Domain Core', variant: 'brand' },
  deprecated: { label: 'Deprecated', variant: 'destructive' },
};

const LAYERS: Array<{ id: AtomicLayer | 'all'; label: string }> = [
  { id: 'all', label: 'All Layers' },
  { id: 'atoms', label: 'Atoms' },
  { id: 'molecules', label: 'Molecules' },
  { id: 'organisms', label: 'Organisms' },
  { id: 'templates', label: 'Templates' },
  { id: 'examples', label: 'Working Examples' },
];

export function ComponentsCatalogPage() {
  const { layer } = useParams<{ layer?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const studio = useDesignStudioController();

  const rawView = searchParams.get('view');
  const activeView: 'catalog' | 'tabs-config' | 'blocks' | 'radix' | 'oscar' | 'animations' =
    rawView === 'tabs-config' ||
    rawView === 'blocks' ||
    rawView === 'radix' ||
    rawView === 'oscar' ||
    rawView === 'animations'
      ? rawView
      : 'catalog';

  function setActiveView(view: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (view === 'catalog') next.delete('view');
      else next.set('view', view);
      return next;
    });
  }

  const activeLayer: AtomicLayer | 'all' = LAYERS.some(l => l.id === layer)
    ? (layer as AtomicLayer | 'all')
    : 'all';

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Interactive specimen state
  const [sampleSwitch, setSampleSwitch] = useState(true);
  const [sampleRadio, setSampleRadio] = useState('weekly');
  const [sampleCheck, setSampleCheck] = useState(true);
  const [sampleSlider, setSampleSlider] = useState([65]);
  const [sampleSearch, setSampleSearch] = useState('');
  const [sampleStatus, setSampleStatus] = useState<string | null>(null);
  const [sampleFrom, setSampleFrom] = useState('');
  const [sampleTo, setSampleTo] = useState('');
  const [sampleColor, setSampleColor] = useState('#0284c7');
  const [samplePage, setSamplePage] = useState(1);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set(['1']));

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG_ENTRIES.filter(entry => {
      if (activeLayer !== 'all' && entry.layer !== activeLayer) return false;
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
      if (!q) return true;
      return (
        entry.name.toLowerCase().includes(q) ||
        entry.summary.toLowerCase().includes(q) ||
        entry.sourcePath.toLowerCase().includes(q) ||
        entry.variants.some(v => v.toLowerCase().includes(q))
      );
    });
  }, [activeLayer, statusFilter, query]);

  const requestedItem = searchParams.get('item');
  const selectedEntry: CatalogEntry =
    filteredEntries.find(e => e.id === requestedItem) ??
    filteredEntries[0] ??
    CATALOG_ENTRIES[0]!;

  function selectEntry(entry: CatalogEntry) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('item', entry.id);
      return next;
    });
  }

  function copySnippet(entry: CatalogEntry) {
    navigator.clipboard?.writeText(entry.codeExample);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1400);
  }

  function renderSpecimen(entry: CatalogEntry, ctx: PreviewContextValue) {
    const isDisabled = ctx.stateMode === 'disabled';
    const isLoading = ctx.stateMode === 'loading';
    const isError = ctx.stateMode === 'error';
    const isSelected = ctx.stateMode === 'selected';
    const isHover = ctx.stateMode === 'hover';
    const isFocus = ctx.stateMode === 'focus';
    const isLong = ctx.stateMode === 'long-content';

    switch (entry.id) {
      case 'button':
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={isDisabled}
                className={isHover ? 'opacity-90' : isFocus ? 'ring-2 ring-ring ring-offset-2' : undefined}
              >
                {isLoading && <Spinner size={14} />}
                {isLong ? 'Publish Verified Tenant Configuration Package' : 'Save Configuration'}
              </Button>
              <Button variant="outline" disabled={isDisabled}>
                <Icon name="download" size={14} />
                Export CSV
              </Button>
              <Button variant="secondary" disabled={isDisabled}>Secondary</Button>
              <Button variant="ghost" disabled={isDisabled}>Ghost</Button>
              <Button variant="destructive" disabled={isDisabled}>Revoke</Button>
              <Button size="icon" variant="outline" aria-label="Refresh list" disabled={isDisabled}>
                <Icon name="refresh" size={14} />
              </Button>
            </div>
            {isError && (
              <Alert variant="destructive">
                <AlertTitle>Save rejected (403)</AlertTitle>
                <AlertDescription>SuperAdmin permission required to modify platform branding.</AlertDescription>
              </Alert>
            )}
          </div>
        );

      case 'badge':
        return (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{isLong ? 'Routine Category Metadata Label Truncation Check' : 'Routine Label'}</Badge>
            <Badge variant="outline">Neutral Tag</Badge>
            <Badge variant="brand">Active App</Badge>
            <Badge variant="success">Reconciled</Badge>
            <Badge variant="warning">Pending Approval</Badge>
            <Badge variant="destructive">Overdue 14d</Badge>
          </div>
        );

      case 'input-controls':
        return (
          <div className="space-y-4 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="cat-tin-input">
                {isLong ? 'Taxpayer Identification Number (Issued by TRA Registry)' : 'Vendor TIN'}
              </Label>
              <Input
                id="cat-tin-input"
                disabled={isDisabled}
                aria-invalid={isError}
                className={isFocus ? 'ring-2 ring-ring ring-offset-1' : undefined}
                defaultValue={isError ? 'INVALID-99' : '102-445-890'}
              />
              {isError && <p className="text-xs text-destructive">TIN must match 9-digit numeric format.</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-notes-input">Audit Note</Label>
              <Textarea id="cat-notes-input" rows={2} disabled={isDisabled} placeholder="Reason for manual adjustment..." />
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-2">
                <Switch id="cat-switch" checked={isSelected || sampleSwitch} onCheckedChange={setSampleSwitch} disabled={isDisabled} />
                <Label htmlFor="cat-switch">Auto-reconcile</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="cat-check" checked={isSelected || sampleCheck} onCheckedChange={v => setSampleCheck(Boolean(v))} disabled={isDisabled} />
                <Label htmlFor="cat-check">Notify auditor</Label>
              </div>
            </div>

            <RadioGroup value={sampleRadio} onValueChange={setSampleRadio} disabled={isDisabled} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="daily" id="cat-r-daily" />
                <Label htmlFor="cat-r-daily">Daily</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="weekly" id="cat-r-weekly" />
                <Label htmlFor="cat-r-weekly">Weekly</Label>
              </div>
            </RadioGroup>

            <div className="space-y-1.5">
              <Label htmlFor="cat-slider">Threshold ({sampleSlider[0]}%)</Label>
              <Slider id="cat-slider" value={sampleSlider} onValueChange={setSampleSlider} max={100} step={5} disabled={isDisabled} />
            </div>
          </div>
        );

      case 'icons-media':
        return (
          <div className="flex flex-wrap items-center gap-5">
            <FeaturedIcon variant="brand" size="md"><Icon name="shield" size={18} /></FeaturedIcon>
            <FeaturedIcon variant="gray" size="md"><Icon name="layers" size={18} /></FeaturedIcon>
            <PersonAvatar name="Amina Hassan" size={38} />
            <CompanyAvatar name="Kigoma Logistics" size={38} />
            <LauncherAppSvg id={ctx.appId} color={ctx.accentHex} size={40} />
          </div>
        );

      case 'typography-indicators':
        return (
          <div className="space-y-3 max-w-md">
            <div className="flex items-center gap-3">
              <Spinner size={16} />
              <span className="text-sm font-medium">{isLoading ? 'Synchronizing chart of accounts...' : 'Ready'}</span>
            </div>
            <Progress value={isLoading ? 35 : 78} />
            {isLoading && <SkeletonText lines={2} />}
          </div>
        );

      case 'deprecated-atoms':
        return (
          <Alert variant="destructive">
            <AlertTitle>Frozen Legacy Packages — Do Not Import</AlertTitle>
            <AlertDescription>
              <code>@hudumika/ui</code>, <code>@hudumika/api-client</code>, <code>TopBar.tsx</code>, and standalone <code>.btn</code> classes lack theme contrast guards and fail design governance reviews. Use <code>@/components/ui/*</code> and <code>apiFetch</code>.
            </AlertDescription>
          </Alert>
        );

      case 'search-filter-controls':
        return (
          <SearchToolbar
            layout="register"
            search={sampleSearch}
            onSearch={setSampleSearch}
            placeholder={isLong ? 'Search across vouchers, TANCIS references, consignees...' : 'Search vouchers...'}
            quickFilter={{
              label: 'Status',
              allLabel: 'All Status',
              value: sampleStatus,
              onChange: setSampleStatus,
              options: [
                { value: 'posted', label: 'Posted' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'draft', label: 'Draft' },
              ],
            }}
            actions={<Button size="sm">New Entry</Button>}
          />
        );

      case 'date-color-controls':
        return (
          <div className="space-y-4">
            <DateFilterRow from={sampleFrom} to={sampleTo} onChange={(f, t) => { setSampleFrom(f); setSampleTo(t); }} />
            <div className="space-y-1.5">
              <Label htmlFor="cat-swatch-note">Curated Platform Swatches</Label>
              <div id="cat-swatch-note">
                <ColorSwatchPicker value={sampleColor} onChange={setSampleColor} swatches={PLATFORM_SWATCHES} />
              </div>
            </div>
          </div>
        );

      case 'navigation-molecules':
        return (
          <div className="space-y-4">
            <Tabs defaultValue={isSelected ? 'review' : 'all'} variant="segmented">
              <TabsList>
                <TabsTrigger value="all">All Records (42)</TabsTrigger>
                <TabsTrigger value="review">Needs Review (3)</TabsTrigger>
                <TabsTrigger value="archived">Archived</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="text-xs text-muted-foreground pt-2">All active register entries shown cleanly below.</TabsContent>
              <TabsContent value="review" className="text-xs text-muted-foreground pt-2">3 items waiting manager sign-off.</TabsContent>
              <TabsContent value="archived" className="text-xs text-muted-foreground pt-2">Read-only closed fiscal periods.</TabsContent>
            </Tabs>
            <PaginationBar page={samplePage} pageSize={10} total={48} onPageChange={setSamplePage} itemLabel="invoice" />
          </div>
        );

      case 'feedback-molecules':
        return (
          <div className="space-y-3">
            <BackButton onClick={() => {}} label="Back to Register" />
            <Alert variant={isError ? 'destructive' : 'default'}>
              <AlertTitle>{isError ? 'Sync failed' : 'Portal accent synchronized'}</AlertTitle>
              <AlertDescription>
                {isError
                  ? 'Upstream TRA service returned 503. Previous local edits remain intact.'
                  : 'Dropdowns, dialogs, and tooltips inherit the active WorkspaceApp accent.'}
              </AlertDescription>
            </Alert>
          </div>
        );

      case 'page-header':
        return (
          <PageHeader
            crumbs={[ctx.appId.toUpperCase(), 'Register']}
            titlePlain={isLong ? 'Consolidated Financial Operations' : 'General'}
            titleEm="ledger"
            subtitle="Double-entry journal lines aligned to active company fiscal periods."
            actions={
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm">Export</Button>
                <Button size="sm">New Voucher</Button>
              </div>
            }
          />
        );

      case 'data-table': {
        const columns: TableColumn<SampleRow>[] = [
          { key: 'ref', header: 'Reference', sortable: true },
          { key: 'party', header: isLong ? 'Counterparty Legal Entity Name' : 'Counterparty' },
          {
            key: 'status',
            header: 'Status',
            render: row => (
              <Badge variant={row.status === 'Overdue' ? 'destructive' : row.status === 'Posted' ? 'success' : 'secondary'}>
                {row.status}
              </Badge>
            ),
          },
          { key: 'amount', header: 'Amount', align: 'right', render: row => <span className="font-mono">{row.amount}</span> },
        ];
        return (
          <DataTable
            columns={columns}
            rows={isError ? [] : SAMPLE_ROWS}
            loading={isLoading}
            error={isError ? 'Could not connect to ledger API.' : undefined}
            onRetry={() => {}}
            selectedIds={isSelected ? new Set(['1', '2']) : selectedRowIds}
            onSelectionChange={setSelectedRowIds}
            pageSize={5}
          />
        );
      }

      case 'cards-metrics':
        return (
          <MetricsRow
            cards={[
              { title: 'Cash Position', value: 'TZS 142.8M', sub1Label: 'ACCOUNTS', sub1Value: '3 verified banks' },
              { title: 'Payables Due', value: 'TZS 12.4M', sub1Label: 'QUEUE', sub1Value: '4 awaiting approval', trend: -4.2, invertTrend: true },
              { title: 'Month Variance', value: '+1.8%', sub1Label: 'STATUS', sub1Value: 'Within threshold', trend: 1.8 },
            ]}
          />
        );

      case 'overlays-dialogs':
        return (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open Accessible Confirmation Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Voucher Post</DialogTitle>
                <DialogDescription>
                  Posting locks journal line edits and updates the period trial balance.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button">Post Voucher</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );

      case 'example-finops':
        return (
          <div className="space-y-4">
            <PageHeader
              crumbs={['FinOps', 'Overview']}
              titlePlain="Financial"
              titleEm="overview"
              subtitle="Audited pilot: neutral cards & tabular numbers; color reserved for CTA and exceptions."
              actions={
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">Export Report</Button>
                  <Button size="sm">New Invoice</Button>
                </div>
              }
            />
            <MetricsRow
              cards={[
                { title: 'Operating Cash', value: 'TZS 142.8M', sub1Label: 'TREASURY', sub1Value: '3 accounts' },
                { title: 'Receivables Overdue', value: 'TZS 9.2M', sub1Label: 'AGING', sub1Value: '2 invoices > 30d', trend: -8.5, invertTrend: true },
                { title: 'Monthly Burn', value: 'TZS 24.1M', sub1Label: 'BASELINE', sub1Value: 'Neutral figure' },
              ]}
            />
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Recent Exceptions</CardTitle>
                <Badge variant="destructive">2 Attention Required</Badge>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Ordinary ledger balances remain neutral; overdue invoices carry compact red pill + text cue.
              </CardContent>
            </Card>
          </div>
        );

      case 'example-axis':
        return (
          <div className="space-y-4">
            <PageHeader
              crumbs={['Axis', 'People Hub']}
              titlePlain="People &"
              titleEm="operations"
              subtitle="Audited pilot: calm neutral KPIs & upcoming holiday panel with configured app accent CTA."
              actions={<Button size="sm">Add Team Member</Button>}
            />
            <MetricsRow
              cards={[
                { title: 'Active Headcount', value: '128', sub1Label: 'SYNCED', sub1Value: '4 departments' },
                { title: 'Pending Leave Requests', value: '3', sub1Label: 'ACTION', sub1Value: 'Manager review' },
                { title: 'Next Payroll Run', value: 'TZS 48.2M', sub1Label: 'WINDOW', sub1Value: 'Closes in 5 days' },
              ]}
            />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Upcoming Public Holiday</CardTitle>
                <CardDescription>Calm neutral panel replacing full-bleed solid banner.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm font-semibold">Nyerere Day · 14 Oct</div>
                <Badge variant="brand">Statutory Holiday</Badge>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return (
          <SectionCard title={entry.name} action={<Badge variant="outline">{entry.layer}</Badge>}>
            <p className="text-sm text-muted-foreground mb-3">{entry.summary}</p>
            <div className="flex flex-wrap gap-2">
              {entry.variants.map(v => (
                <Badge key={v} variant="secondary">{v}</Badge>
              ))}
            </div>
          </SectionCard>
        );
    }
  }

  const stability = STATUS_BADGE[selectedEntry.status];

  return (
    <div className="dsa-page">
      <PageHeader
        crumbs={['Design System', 'Components']}
        titlePlain="Atomic"
        titleEm="components"
        subtitle="Live production UI catalog derived from apps/web/src/components/ui/ with interactive theme, app accent, density, viewport & state controls."
      />

      <DesignSystemStudioBar studio={studio} />

      <Tabs value={activeView} onValueChange={setActiveView} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="catalog">Atomic Catalog</TabsTrigger>
          <TabsTrigger value="tabs-config">Tabs &amp; Dropdowns Studio</TabsTrigger>
          <TabsTrigger value="blocks">Building Blocks</TabsTrigger>
          <TabsTrigger value="radix">Radix Showcases</TabsTrigger>
          <TabsTrigger value="oscar">Oscar Catalog</TabsTrigger>
          <TabsTrigger value="animations">Animations</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-4 mt-2">
          <Tabs
            value={activeLayer}
            variant="segmented"
            onValueChange={val => navigate(val === 'all' ? '/design-system/components' : `/design-system/components/${val}`)}
          >
        <TabsList className="flex-wrap">
          {LAYERS.map(l => (
            <TabsTrigger key={l.id} value={l.id}>
              {l.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {activeLayer !== 'all' && (
        <div className="text-xs text-muted-foreground px-1">
          <strong>{ATOMIC_LAYER_META[activeLayer].label} ({ATOMIC_LAYER_META[activeLayer].badge}):</strong>{' '}
          {ATOMIC_LAYER_META[activeLayer].description}
        </div>
      )}

      <div className="dsa-split-workspace">
        <aside className="dsa-list-rail" aria-label="Component index">
          <div className="space-y-2">
            <Label htmlFor="catalog-filter-input">Filter components</Label>
            <Input
              id="catalog-filter-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search primitive or source..."
            />
          </div>

          <div className="flex flex-wrap gap-1 pt-1">
            {(['all', 'stable', 'domain', 'deprecated'] as const).map(st => (
              <Button
                key={st}
                type="button"
                size="sm"
                variant={statusFilter === st ? 'default' : 'outline'}
                className="h-7 px-2 text-xs capitalize"
                onClick={() => setStatusFilter(st)}
              >
                {st}
              </Button>
            ))}
          </div>

          <div className="dsa-list-scroll pt-1">
            {filteredEntries.map(entry => {
              const active = entry.id === selectedEntry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => selectEntry(entry)}
                  aria-current={active ? 'true' : undefined}
                  className={`dsa-rail-item ${active ? 'dsa-rail-item--active' : ''}`}
                  data-ui-native-button=""
                >
                  <span className="truncate">{entry.name}</span>
                  <Badge variant={STATUS_BADGE[entry.status].variant}>{entry.layer}</Badge>
                </button>
              );
            })}
            {filteredEntries.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">No matching components.</p>
            )}
          </div>
        </aside>

        <main className="space-y-5 min-w-0">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={stability.variant}>{stability.label}</Badge>
                    <Badge variant="outline" className="capitalize">{selectedEntry.layer}</Badge>
                  </div>
                  <CardTitle className="text-lg">{selectedEntry.name}</CardTitle>
                  <CardDescription className="mt-1">{selectedEntry.summary}</CardDescription>
                </div>
                <Tip label={`Copy production JSX snippet for ${selectedEntry.name}`}>
                  <Button variant="outline" size="sm" onClick={() => copySnippet(selectedEntry)}>
                    <Icon name={copiedId === selectedEntry.id ? 'check' : 'copy'} size={13} />
                    {copiedId === selectedEntry.id ? 'Copied Snippet' : 'Copy Example'}
                  </Button>
                </Tip>
              </div>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <div>
                <span className="font-semibold text-foreground">Source: </span>
                <a href={`file:///D:/Apps/Hudumika/${selectedEntry.sourcePath}`} className="font-mono text-primary underline underline-offset-4">
                  {selectedEntry.sourcePath}
                </a>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="font-semibold text-foreground">Variants:</span>
                {selectedEntry.variants.map(v => <Badge key={v} variant="secondary">{v}</Badge>)}
              </div>
            </CardContent>
          </Card>

          <PreviewStage
            title={`Live Interactive Preview — ${selectedEntry.name}`}
            subtitle="Switch app accent, light/dark theme, density, viewport width, and interaction states safely in isolation."
            initialAppId={selectedEntry.id === 'example-axis' ? 'nexushr' : 'finops'}
            availableStates={selectedEntry.states}
          >
            {ctx => renderSpecimen(selectedEntry, ctx)}
          </PreviewStage>

          <div className="dsa-grid-2">
            <SectionCard title="Usage Guidance">
              <div className="space-y-3 text-xs">
                <div>
                  <div className="font-bold text-foreground mb-0.5">When to use</div>
                  <p className="text-muted-foreground leading-relaxed">{selectedEntry.whenToUse}</p>
                </div>
                <div>
                  <div className="font-bold text-foreground mb-0.5">When not to use</div>
                  <p className="text-muted-foreground leading-relaxed">{selectedEntry.whenNotToUse}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Accessibility, Keyboard & Tokens">
              <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
                {selectedEntry.a11yNotes.map(note => <li key={note}>{note}</li>)}
              </ul>
              {selectedEntry.tokensUsed.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
                  {selectedEntry.tokensUsed.map(tok => (
                    <code key={tok} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-foreground">
                      {tok}
                    </code>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="Production Code Example"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/design-system/patterns">See Composition Patterns</Link>
              </Button>
            }
          >
            <pre className="dsa-code-block">{selectedEntry.codeExample}</pre>
          </SectionCard>
        </main>
      </div>
        </TabsContent>

        <TabsContent value="tabs-config" className="mt-2">
          <SectionCard title="Global Tabs, Navigation Strips &amp; Select Varieties">
            <TabsAndDropdownsEditorSection studio={studio} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="blocks" className="mt-2">
          <SectionCard title="Production Building Blocks Showcase">
            <React.Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Building Blocks...</div>}>
              <BuildingBlocksShowcase />
            </React.Suspense>
          </SectionCard>
        </TabsContent>

        <TabsContent value="radix" className="mt-2">
          <SectionCard title="Radix Primitives Showcase">
            <ComponentShowcase />
          </SectionCard>
        </TabsContent>

        <TabsContent value="oscar" className="mt-2">
          <SectionCard title="Oscar Component Catalog">
            <React.Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Oscar Catalog...</div>}>
              <OscarCatalog />
            </React.Suspense>
          </SectionCard>
        </TabsContent>

        <TabsContent value="animations" className="mt-2">
          <SectionCard title="Animation Keyframes &amp; Micro-Interactions Showcase">
            <React.Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Animations Showcase...</div>}>
              <AnimationsShowcase />
            </React.Suspense>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
