import React, { useState } from 'react';
import {
  Building2, ChevronsUpDown, Check, Plus,
  Copy, Archive, Trash2, Pencil, Share2, FolderKanban, Layers,
  Flag, CircleDot, GripVertical, Upload, AlertTriangle, ShieldCheck, Bell, XCircle,
  Eye, Send, Download,
  Sparkles, ShoppingBag, BarChart3, Wallet, FileCheck2,
} from 'lucide-react';
import { Tip } from '../components/ui/tooltip.js';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui/select.js';
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '../components/ui/command.js';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuLabel,
} from '../components/ui/dropdown-menu.js';
import { SingleSelectFilter, MultiSelectFilter, FilterOption } from '../components/ui/filter-dropdown.js';
import { CheckboxRow, SwitchRow, FeatureToggleRow } from '../components/ui/list-item-row.js';
import { DatePicker, DateRangePicker } from '../components/ui/date-picker.js';
import type { DateRange } from 'react-day-picker';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { TwotoneIcon } from '../components/ui/twotone-icon.js';

const SECTION = 'rounded-2xl border border-border bg-card p-6 shadow-sm';
const SECTION_TITLE = 'mb-1 text-base font-bold text-foreground';
const SECTION_DESC = 'mb-5 text-sm text-muted-foreground';

const SHIPMENT_MODES: FilterOption[] = [
  { value: 'SEA', label: 'Sea Freight' },
  { value: 'AIR', label: 'Air Freight' },
  { value: 'ROAD', label: 'Road Transport' },
  { value: 'RAIL', label: 'Rail Transport' },
];

const MODULE_OPTIONS: FilterOption[] = [
  { value: 'risk', label: 'Risk Management' },
  { value: 'audit', label: 'Audit Management' },
  { value: 'compliance', label: 'Compliance Management' },
  { value: 'strategy', label: 'Strategy Management' },
  { value: 'policy', label: 'Policy Management' },
  { value: 'continuity', label: 'Business Continuity' },
];

const STATUS_OPTIONS: FilterOption[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'closed', label: 'Closed' },
];

const WORKSPACES = [
  { id: 'skyline', name: 'Skyline Dynamics', color: 'var(--ink)', shortcut: '' },
  { id: 'vortex', name: 'Vortex Innovations', color: '#0891b2', shortcut: '⌘1' },
  { id: 'proxima', name: 'Proxima Ventures', color: '#6e40c9', shortcut: '⌘2' },
  { id: 'nexora', name: 'Nexora Labs', color: 'var(--gold)', shortcut: '⌘3' },
];

function WorkspaceAvatar({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, background: color, flexShrink: 0 }}
      className="flex items-center justify-center text-white">
      <Building2 style={{ width: size * 0.55, height: size * 0.55 }} />
    </div>
  );
}

// Embedded as Design System's "Components" section (DesignSystemView.tsx) —
// used to be its own routed page with its own PageHeader; that chrome is now
// the parent's, so this renders just the catalog grid.
export default function ComponentShowcase() {
  const [mode, setMode] = useState<string>('SEA');
  const [comboOpen, setComboOpen] = useState(false);
  const [comboValue, setComboValue] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>('open');
  const [modules, setModules] = useState<string[]>(['strategy']);
  const [activeWorkspace, setActiveWorkspace] = useState('skyline');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  const [twoFactor, setTwoFactor] = useState(true);
  const [autoAssign, setAutoAssign] = useState(false);
  const [featAi, setFeatAi] = useState(true);
  const [featShop, setFeatShop] = useState(true);
  const [featAnalytics, setFeatAnalytics] = useState(true);
  const [featPayments, setFeatPayments] = useState(false);
  const [singleDate, setSingleDate] = useState<Date | undefined>(new Date());
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  return (
    <div>
      <p className="mb-6 text-sm text-muted-foreground max-w-prose">
        Themed Select / DropdownMenu / Popover / Filter / Date picker / Accordion primitives — use the theme toggle to review in dark mode.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Select + Combobox */}
        <section className={SECTION}>
          <div className={SECTION_TITLE}>Select &amp; Combobox</div>
          <div className={SECTION_DESC}>Replaces native &lt;select&gt; — static list vs. searchable list.</div>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Shipment mode</label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIPMENT_MODES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Search shipment mode (combobox)</label>
              <Popover open={comboOpen} onOpenChange={setComboOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className="flex w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-medium">
                    {comboValue ? SHIPMENT_MODES.find(o => o.value === comboValue)?.label : 'Select mode…'}
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search…" />
                    <CommandList>
                      <CommandEmpty>No results.</CommandEmpty>
                      <CommandGroup>
                        {SHIPMENT_MODES.map((o) => (
                          <CommandItem key={o.value} onSelect={() => { setComboValue(o.value); setComboOpen(false); }}>
                            <Check className={`h-4 w-4 ${comboValue === o.value ? 'opacity-100 text-primary' : 'opacity-0'}`} />
                            {o.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </section>

        {/* DropdownMenu */}
        <section className={SECTION}>
          <div className={SECTION_TITLE}>Dropdown menu</div>
          <div className={SECTION_DESC}>Icons, keyboard shortcuts, checkmark selection, submenu, dividers.</div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="rounded-lg border border-input px-4 py-2 text-sm font-semibold hover:border-primary/40">
                Actions ▾
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Shipment actions</DropdownMenuLabel>
              <DropdownMenuItem><Pencil className="text-muted-foreground" /> Edit<DropdownMenuShortcut>⌘E</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem><Copy className="text-muted-foreground" /> Duplicate<DropdownMenuShortcut>⌘D</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem><Share2 className="text-muted-foreground" /> Share<DropdownMenuShortcut>⌘S</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><FolderKanban className="text-muted-foreground" /> Move to</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem><Flag className="text-muted-foreground" /> At Risk</DropdownMenuItem>
                  <DropdownMenuItem><CircleDot className="text-muted-foreground" /> My Cases</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem><Archive className="text-muted-foreground" /> Archive</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive"><Trash2 /> Delete<DropdownMenuShortcut>⌫</DropdownMenuShortcut></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </section>

        {/* Tooltip + document actions — the platform's one tooltip (Tip), same
            as the header, on the icon-only row actions used across documents. */}
        <section className={SECTION}>
          <div className={SECTION_TITLE}>Tooltip &amp; document actions</div>
          <div className={SECTION_DESC}>The one platform tooltip (<code>Tip</code>, same style as the header) on the icon-only document actions — view, share, download, replace/upload, verified. Hover any icon.</div>
          <div className="flex flex-wrap items-center gap-2">
            <Tip label="View document"><button type="button" aria-label="View document" className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg border border-input text-muted-foreground hover:border-primary/40"><Eye className="h-4 w-4" /></button></Tip>
            <Tip label="Share document"><button type="button" aria-label="Share document" className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg border border-input text-muted-foreground hover:border-primary/40"><Send className="h-4 w-4" /></button></Tip>
            <Tip label="Download document"><button type="button" aria-label="Download document" className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg border border-input text-muted-foreground hover:border-primary/40"><Download className="h-4 w-4" /></button></Tip>
            <Tip label="Replace / upload"><button type="button" aria-label="Replace or upload document" className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg border border-input text-muted-foreground hover:border-primary/40"><Upload className="h-4 w-4" /></button></Tip>
            <Tip label="Verified"><span className="inline-flex items-center gap-1 rounded-full bg-(--teal) px-2.5 py-1 text-[10px] font-bold text-white"><Check className="h-3 w-3" strokeWidth={3} /> Verified</span></Tip>
          </div>
        </section>

        {/* Workspace switcher */}
        <section className={SECTION}>
          <div className={SECTION_TITLE}>Workspace switcher</div>
          <div className={SECTION_DESC}>Avatar + name + shortcut + checkmark rows, composed from DropdownMenu.</div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex w-64 items-center gap-2.5 rounded-lg border border-input px-3 py-2.5 text-left hover:border-primary/40">
                <WorkspaceAvatar color={WORKSPACES.find(w => w.id === activeWorkspace)!.color} size={24} />
                <span className="flex-1 truncate text-sm font-bold">{WORKSPACES.find(w => w.id === activeWorkspace)!.name}</span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {WORKSPACES.map((w) => (
                <DropdownMenuItem key={w.id} onSelect={() => setActiveWorkspace(w.id)}>
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                  <WorkspaceAvatar color={w.color} size={22} />
                  <span className="flex-1 truncate">{w.name}</span>
                  {w.id === activeWorkspace
                    ? <Check className="h-4 w-4 text-primary" />
                    : w.shortcut && <DropdownMenuShortcut>{w.shortcut}</DropdownMenuShortcut>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem><Plus className="text-muted-foreground" /> New workspace<DropdownMenuShortcut>⌘W</DropdownMenuShortcut></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </section>

        {/* Filter pills */}
        <section className={SECTION}>
          <div className={SECTION_TITLE}>Filter dropdowns</div>
          <div className={SECTION_DESC}>Trigger pill + popover — single-select and multi-select with search.</div>
          <div className="flex flex-wrap gap-2">
            <SingleSelectFilter
              label="Status" icon={<CircleDot className="h-3.5 w-3.5" />}
              options={STATUS_OPTIONS} value={status} onChange={setStatus}
            />
            <MultiSelectFilter
              label="Module Type" icon={<Layers className="h-3.5 w-3.5" />}
              options={MODULE_OPTIONS} values={modules} onChange={setModules}
            />
          </div>
        </section>

        {/* Date pickers */}
        <section className={SECTION}>
          <div className={SECTION_TITLE}>Date &amp; date range picker</div>
          <div className={SECTION_DESC}>Replaces native &lt;input type="date"&gt; — single date and range selection.</div>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">ETA</label>
              <DatePicker date={singleDate} onChange={setSingleDate} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Free-time window</label>
              <DateRangePicker range={dateRange} onChange={setDateRange} />
            </div>
          </div>
        </section>

        {/* Accordion */}
        <section className={SECTION}>
          <div className={SECTION_TITLE}>Accordion</div>
          <div className={SECTION_DESC}>Card-style grouped sections — FAQs, document checklists, filters.</div>
          <Accordion type="single" collapsible defaultValue="item-1" className="flex flex-col gap-2">
            <AccordionItem value="item-1">
              <AccordionTrigger>Required documents</AccordionTrigger>
              <AccordionContent>Bill of Lading, Commercial Invoice, Packing List, and Certificate of Origin are required before customs submission.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Demurrage &amp; storage</AccordionTrigger>
              <AccordionContent>Free time is 7 days from vessel discharge. Charges accrue daily thereafter per the carrier's published tariff.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>Payment terms</AccordionTrigger>
              <AccordionContent>Duties and taxes are due on assessment. Clearing fees are invoiced on completion, net 15 days.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Featured icons */}
        <section className={SECTION}>
          <div className={SECTION_TITLE}>Featured icons</div>
          <div className={SECTION_DESC}>Soft-tint icon badges — empty states, document rows, notification lists, card headers.</div>
          <div className="flex flex-wrap items-center gap-4">
            <FeaturedIcon variant="brand"><Upload className="h-5 w-5" /></FeaturedIcon>
            <FeaturedIcon variant="success"><ShieldCheck className="h-5 w-5" /></FeaturedIcon>
            <FeaturedIcon variant="warning"><AlertTriangle className="h-5 w-5" /></FeaturedIcon>
            <FeaturedIcon variant="error"><XCircle className="h-5 w-5" /></FeaturedIcon>
            <FeaturedIcon variant="info"><Bell className="h-5 w-5" /></FeaturedIcon>
            <FeaturedIcon variant="gray"><FolderKanban className="h-5 w-5" /></FeaturedIcon>
            <FeaturedIcon variant="brand" shape="circle" size="lg"><Building2 className="h-6 w-6" /></FeaturedIcon>
          </div>
        </section>

        {/* Badges */}
        <section className={SECTION}>
          <div className={SECTION_TITLE}>Badges</div>
          <div className={SECTION_DESC}>Soft-tint status pills — no solid fill, matching-hue text.</div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="brand">In Transit</Badge>
            <Badge variant="success">Cleared</Badge>
            <Badge variant="warning">Awaiting Docs</Badge>
            <Badge variant="error">Overdue</Badge>
            <Badge variant="info">Draft</Badge>
            <Badge variant="gray">Archived</Badge>
          </div>
        </section>

        {/* Checkbox / Switch rows */}
        <section className={`${SECTION} lg:col-span-2`}>
          <div className={SECTION_TITLE}>Checkbox &amp; Switch rows</div>
          <div className={SECTION_DESC}>Label + helper text composition for settings/preference lists.</div>
          <div className="grid grid-cols-1 gap-x-10 gap-y-1 md:grid-cols-2">
            <div>
              <CheckboxRow
                title="Email notifications" description="Get notified by email when a shipment updates."
                checked={notifyEmail} onCheckedChange={setNotifyEmail}
              />
              <CheckboxRow
                title="SMS notifications" description="Get a text message for urgent alerts only."
                checked={notifySms} onCheckedChange={setNotifySms}
              />
            </div>
            <div>
              <SwitchRow
                title="Two-factor authentication" description="Require a verification code at sign-in."
                checked={twoFactor} onCheckedChange={setTwoFactor}
              />
              <SwitchRow
                title="Auto-assign new cases" description="Route new shipments to the least-loaded officer."
                checked={autoAssign} onCheckedChange={setAutoAssign}
              />
            </div>
          </div>
        </section>

        {/* Feature toggle rows */}
        <section className={`${SECTION} lg:col-span-2`}>
          <div className={SECTION_TITLE}>Feature toggle rows</div>
          <div className={SECTION_DESC}>Icon-leading remote kill-switches — mobile-app feature flags, per-tenant module switches. Disabled rows (e.g. a not-yet-available feature) grey out the icon and switch together.</div>
          <div>
            <FeatureToggleRow
              icon={<Sparkles className="h-5 w-5" />}
              title="Nemo AI" description="The AI assistant / conversational-action screen."
              checked={featAi} onCheckedChange={setFeatAi}
            />
            <FeatureToggleRow
              icon={<ShoppingBag className="h-5 w-5" />}
              title="Nemo Shop" description="Wholesale ordering marketplace."
              checked={featShop} onCheckedChange={setFeatShop}
            />
            <FeatureToggleRow
              icon={<BarChart3 className="h-5 w-5" />}
              title="Analytics" description="Business analytics screen."
              checked={featAnalytics} onCheckedChange={setFeatAnalytics}
            />
            <FeatureToggleRow
              icon={<Wallet className="h-5 w-5" />}
              title="Payments" description="Payment methods screen."
              checked={featPayments} onCheckedChange={setFeatPayments}
            />
            <FeatureToggleRow
              icon={<FileCheck2 className="h-5 w-5" />}
              title="Compliance" description="Tax and regulatory compliance checklist."
              checked={false} onCheckedChange={() => {}} disabled
            />
          </div>
        </section>

        {/* Twotone Rounded Icons Gallery (Hugeicons Collection) */}
        <section className={`${SECTION} lg:col-span-2`}>
          <div className="flex items-center justify-between gap-4 flex-wrap mb-1">
            <div className={SECTION_TITLE}>Twotone Rounded Icons (Hugeicons Collection)</div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--teal-l)] text-[var(--teal)] border border-[var(--teal)]/20">
              Dual-Layer 24×24 SVG
            </span>
          </div>
          <div className={SECTION_DESC}>
            Extracted Hugeicons Twotone Rounded icons with primary crisp 1.75px outline stroke and secondary 20% opacity depth layer.
          </div>

          <TwotoneShowcaseGrid />
        </section>
      </div>
    </div>
  );
}

const TWOTONE_NAMES = [
  'shield', 'lock', 'key', 'folder', 'document', 'download', 'upload',
  'smartphone', 'laptop', 'user', 'users', 'grid', 'trash', 'clock',
  'checkCircle', 'alertTriangle', 'fingerprint', 'database', 'sparkle',
  'bell', 'settings', 'creditCard', 'link', 'activity', 'building'
] as const;

function TwotoneShowcaseGrid() {
  const [selectedColor, setSelectedColor] = useState<'teal' | 'green' | 'gold' | 'purple' | 'red' | 'ink'>('teal');
  const [iconSize, setIconSize] = useState<number>(24);
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const colorMap = {
    teal: 'var(--teal)',
    green: 'var(--green, #10b981)',
    gold: 'var(--gold, #f59e0b)',
    purple: 'var(--purple, #8b5cf6)',
    red: 'var(--red, #ef4444)',
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
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap p-3 rounded-xl bg-muted/40 border border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color Palette:</span>
          <div className="flex items-center gap-1.5">
            {(['teal', 'green', 'gold', 'purple', 'red', 'ink'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedColor(c)}
                className={`w-6 h-6 rounded-full border transition-transform ${
                  selectedColor === c ? 'scale-110 ring-2 ring-primary ring-offset-2' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: colorMap[c], borderColor: 'var(--border)' }}
                title={`Select ${c}`}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {TWOTONE_NAMES.map((name) => (
          <div
            key={name}
            onClick={() => handleCopy(name)}
            className="group relative flex flex-col items-center justify-center p-3.5 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer shadow-xs hover:shadow-sm"
          >
            <div className="h-12 flex items-center justify-center">
              <TwotoneIcon
                name={name as any}
                size={iconSize}
                color={colorMap[selectedColor]}
                secondaryColor={colorMap[selectedColor]}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground mt-2 truncate max-w-full">
              {copiedName === name ? (
                <span className="text-emerald-500 font-bold">Copied!</span>
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

