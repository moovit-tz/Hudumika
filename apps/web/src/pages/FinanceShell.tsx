import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useCurrency } from '../hooks/useCurrency.js';
import {
  INITIAL_INVOICES,
  Invoice, Status, FilterStatus,
  invoiceTotals, invoiceTotal, genRefCode, STATUS_STYLE, mapApiInvoice,
  InvoiceDetailPanel, InvoiceEditor,
} from './Billing.js';
import { FinanceDashboard }       from './FinanceDashboard.js';
import { Bills }                  from './Bills.js';
import { Quotations }             from './Quotations.js';
import { PurchaseOrders }         from './PurchaseOrders.js';
import { Expenses }               from './Expenses.js';
import { FinancePayments }        from './FinancePayments.js';
import { AccountsQuery }          from './AccountsQuery.js';
import { FinanceReportingMaster } from './FinanceReportingMaster.js';
import { FinanceVendors }         from './FinanceVendors.js';
import { FinanceProducts }        from './FinanceProducts.js';
import { PageHeader }             from '../components/PageHeader.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '../components/ui/dropdown-menu.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showConfirm } from '../lib/confirm.js';

/* ── Section & nav types ── */
type SectionId = 'overview' | 'invoices' | 'bills' | 'quotations' | 'purchase-orders' | 'expenses' | 'payments' | 'vendors' | 'products' | 'accounts' | 'reports';

const URL_TO_SECTION: Record<string, SectionId> = {
  '/finance':                  'overview',
  '/finance/overview':         'overview',
  '/finance/invoices':         'invoices',
  '/finance/bills':            'bills',
  '/finance/quotations':       'quotations',
  '/finance/purchase-orders':  'purchase-orders',
  '/finance/expenses':         'expenses',
  '/finance/payments':         'payments',
  '/finance/vendors':          'vendors',
  '/finance/products':         'products',
  '/finance/accounts':         'accounts',
  '/finance/reports':          'reports',
};

const SECTION_TO_URL: Record<SectionId, string> = {
  overview:          '/finance/overview',
  invoices:          '/finance/invoices',
  bills:             '/finance/bills',
  quotations:        '/finance/quotations',
  'purchase-orders': '/finance/purchase-orders',
  expenses:          '/finance/expenses',
  payments:          '/finance/payments',
  vendors:           '/finance/vendors',
  products:          '/finance/products',
  accounts:          '/finance/accounts',
  reports:           '/finance/reports',
};

interface NavLeaf {
  kind: 'leaf';
  id: SectionId;
  label: string;
  icon: string;
  color: string;
}

interface NavSection {
  kind: 'section';
  label: string;
  items: NavLeaf[];
}

type NavEntry = NavLeaf | NavSection;

const ALL_SECTIONS: NavLeaf[] = [
  { kind: 'leaf', id: 'overview',        label: 'Overview',            icon: 'home',          color: '#0d9488' },
  { kind: 'leaf', id: 'invoices',        label: 'Sales Invoices',      icon: 'fileText',      color: '#0d9488' },
  { kind: 'leaf', id: 'bills',           label: 'Bills',               icon: 'receipt',       color: '#2563eb' },
  { kind: 'leaf', id: 'quotations',      label: 'Quotations',          icon: 'copy',          color: '#7c3aed' },
  { kind: 'leaf', id: 'purchase-orders', label: 'Purchase Orders',     icon: 'clipboardList', color: '#b45309' },
  { kind: 'leaf', id: 'expenses',        label: 'Expenses',            icon: 'creditCard',    color: '#dc2626' },
  { kind: 'leaf', id: 'payments',        label: 'Payments',            icon: 'dollarSign',    color: '#059669' },
  { kind: 'leaf', id: 'vendors',         label: 'Vendors',             icon: 'truck',         color: '#0891b2' },
  { kind: 'leaf', id: 'products',        label: 'Products & Services', icon: 'package',       color: '#7c3aed' },
  { kind: 'leaf', id: 'accounts',        label: 'Accounts',            icon: 'barChart',      color: '#374151' },
  { kind: 'leaf', id: 'reports',         label: 'Reports',             icon: 'pieChart',      color: '#6b7280' },
];

function sec(id: SectionId) { return ALL_SECTIONS.find(s => s.id === id)!; }

/* Sidebar nav — static section headers, items always visible */
const NAV_ENTRIES: NavEntry[] = [
  sec('overview'),
  {
    kind: 'section', label: 'Sales',
    items: [sec('invoices'), sec('quotations'), sec('purchase-orders')],
  },
  {
    kind: 'section', label: 'Purchases',
    items: [sec('bills'), sec('expenses')],
  },
  sec('payments'),
  {
    kind: 'section', label: 'Catalogue',
    items: [sec('vendors'), sec('products')],
  },
  {
    kind: 'section', label: 'Accounts',
    items: [sec('accounts'), sec('reports')],
  },
];

function findSection(id: SectionId): NavLeaf {
  return ALL_SECTIONS.find(s => s.id === id) ?? ALL_SECTIONS[0];
}

/* Per-section "+ New" / action button config */
const NEW_DOC_CONFIG: Record<SectionId, { label: string; icon: string; kind: 'invoice' | 'signal' | 'csv' }> = {
  overview:          { label: 'New',                icon: 'plus',     kind: 'signal'  },
  invoices:          { label: 'New Invoice',         icon: 'plus',     kind: 'invoice' },
  quotations:        { label: 'New Quotation',       icon: 'plus',     kind: 'signal'  },
  'purchase-orders': { label: 'New PO',              icon: 'plus',     kind: 'signal'  },
  bills:             { label: 'New Bill',            icon: 'plus',     kind: 'signal'  },
  expenses:          { label: 'New Expense',         icon: 'plus',     kind: 'signal'  },
  payments:          { label: 'New Payment',         icon: 'plus',     kind: 'signal'  },
  vendors:           { label: 'New Vendor',          icon: 'plus',     kind: 'signal'  },
  products:          { label: 'New Item',            icon: 'plus',     kind: 'signal'  },
  accounts:          { label: 'Export CSV',          icon: 'download', kind: 'csv'     },
  reports:           { label: 'Export CSV',          icon: 'download', kind: 'csv'     },
};

/* ── Tab / group types ── */
interface DocTab {
  id: string;
  sectionId: SectionId;
  docId: string;
  title: string;
  customName?: string;
  invoice?: Invoice;
}

interface TabGroup {
  id: string;
  name: string;
  color: string;
  tabIds: string[];
  collapsed: boolean;
}


/* ── Helpers ── */
const fmtTZS = (n: number) => `TZS ${Math.round(n).toLocaleString()}`;

function toTitleCase(s: string): string {
  return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function parseDDMMYYYY(s: string | null): Date | null {
  if (!s) return null;
  const [d, m, y] = s.split('-').map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function monthLabel(dateStr: string): string {
  const d = parseDDMMYYYY(dateStr);
  if (!d) return 'Unknown';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function dueDaysDiff(dueStr: string | null): number | null {
  const d = parseDDMMYYYY(dueStr);
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

/* ─────────────────────────────────────────────
   SIDEBAR
───────────────────────────────────────────── */
function FinSidebar({ section, onSection, collapsed, onToggle, mobileOpen, onMobileClose }: {
  section: SectionId;
  onSection: (s: SectionId) => void;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  function renderLeaf(leaf: NavLeaf) {
    const active = leaf.id === section;
    return (
      <div key={leaf.id} className="fin-nav-tooltip-wrap" data-tip={collapsed ? leaf.label : undefined}>
        <button
          type="button"
          className={`fin-nav-item${active ? ' fin-nav-item--active' : ''}`}
          onClick={() => { onSection(leaf.id); onMobileClose(); }}
          title={collapsed ? leaf.label : undefined}
        >
          <span className="fin-nav-icon">
            <Icon name={leaf.icon as any} size={18} color={active ? 'var(--teal)' : 'var(--ink3)'} />
          </span>
          {!collapsed && <span className="fin-nav-label">{leaf.label}</span>}
        </button>
      </div>
    );
  }

  function renderEntry(entry: NavEntry) {
    if (entry.kind === 'leaf') return renderLeaf(entry);
    return (
      <div key={entry.label} className="fin-nav-section">
        {!collapsed && <div className="fin-nav-section-label">{entry.label}</div>}
        {collapsed && <div className="fin-nav-section-divider" />}
        {entry.items.map(renderLeaf)}
      </div>
    );
  }

  return (
    <>
      {mobileOpen && <div className="fin-sidebar-backdrop" onClick={onMobileClose} />}
      <aside className={`fin-sidebar${collapsed ? ' fin-sidebar--collapsed' : ''}${mobileOpen ? ' fin-sidebar--open' : ''}`}>
        <div className="fin-sidebar-header">
          {!collapsed && <span className="fin-sidebar-title">Finance</span>}
          <button
            type="button"
            className="fin-sidebar-toggle"
            onClick={onToggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={14} color="var(--ink3)" />
          </button>
        </div>
        <nav className="fin-sidebar-nav">
          {NAV_ENTRIES.map(renderEntry)}
        </nav>
      </aside>
    </>
  );
}

/* ─────────────────────────────────────────────
   TAB BAR  (full-width, across top of shell)
───────────────────────────────────────────── */
function FinTabBar({ section, tabs, tabGroups, activeTabId, onTabClick, onTabClose, onTabRename, onToggleGroup, onNewDoc }: {
  section: SectionId;
  tabs: DocTab[];
  tabGroups: TabGroup[];
  activeTabId: string | null;
  onTabClick: (id: string | null) => void;
  onTabClose: (id: string) => void;
  onTabRename: (id: string, name: string) => void;
  onToggleGroup: (id: string) => void;
  onNewDoc: () => void;
}) {
  const sec = findSection(section);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  const groupedTabIds = new Set(tabGroups.flatMap(g => g.tabIds));
  const sectionTabs = tabs.filter(t => t.sectionId === section);
  const ungroupedTabs = sectionTabs.filter(t => !groupedTabIds.has(t.id));

  useEffect(() => {
    if (renamingId && renameRef.current) renameRef.current.focus();
  }, [renamingId]);

  function startRename(tab: DocTab) {
    setRenamingId(tab.id);
    setRenameVal(tab.customName ?? tab.title);
  }

  function commitRename() {
    if (renamingId && renameVal.trim()) onTabRename(renamingId, renameVal.trim());
    setRenamingId(null);
  }

  function renderTab(tab: DocTab) {
    const isActive = tab.id === activeTabId;
    const label = tab.customName ?? tab.title;

    if (renamingId === tab.id) {
      return (
        <div key={tab.id} className={`fin-tab fin-tab--renaming${isActive ? ' fin-tab--active' : ''}`}>
          <input
            ref={renameRef}
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
            className="fin-tab-rename-input"
            title="Rename tab"
            placeholder="Tab name"
          />
        </div>
      );
    }

    return (
      <div key={tab.id} className={`fin-tab${isActive ? ' fin-tab--active' : ''}`}>
        <button
          type="button"
          className="fin-tab-click-area"
          onClick={() => onTabClick(tab.id)}
          onDoubleClick={() => startRename(tab)}
          title={`${label} — double-click to rename`}
        >
          <Icon name="fileText" size={12} color={isActive ? 'var(--teal)' : 'var(--ink3)'} />
          <span className="fin-tab-label">{label}</span>
        </button>
        <button
          type="button"
          className="fin-tab-close"
          onClick={e => { e.stopPropagation(); onTabClose(tab.id); }}
          title="Close tab"
        >×</button>
      </div>
    );
  }

  return (
    <div className="fin-tabs">
      {/* Home (section) tab — always first */}
      <button
        type="button"
        className={`fin-tab--home${activeTabId === null ? ' fin-tab--active' : ''}`}
        onClick={() => onTabClick(null)}
        title={sec.label}
      >
        <Icon name={sec.icon as any} size={14} color={activeTabId === null ? sec.color : 'var(--ink3)'} />
        <span className="fin-tab-label fin-tab-label--home">{sec.label}</span>
      </button>

      <div className="fin-tabs-scroll">
        {/* Groups — click header to fold/unfold */}
        {tabGroups.map(group => {
          const groupTabs = group.tabIds
            .map(id => tabs.find(t => t.id === id))
            .filter(Boolean) as DocTab[];
          const isGroupActive = !group.collapsed && groupTabs.some(t => t.id === activeTabId);

          return (
            <div key={group.id} className={`fin-tab-group${isGroupActive ? ' fin-tab-group--active' : ''}`} style={{ '--gc': group.color, '--fin-dot-color': group.color } as React.CSSProperties}>
              {/* Clickable group header */}
              <button
                type="button"
                className="fin-tab-group-header"
                onClick={() => onToggleGroup(group.id)}
                title={group.collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
              >
                <span className="fin-tab-group-dot" />
                <span className="fin-tab-group-name">{group.name}</span>
                <span className="fin-tab-group-chevron">{group.collapsed ? '+' : '−'}</span>
              </button>
              {/* Tabs — hidden when group is collapsed */}
              {!group.collapsed && groupTabs.map(renderTab)}
            </div>
          );
        })}

        {/* Ungrouped tabs */}
        {ungroupedTabs.map(renderTab)}
      </div>

      {/* + / Export button — compact, shows full label as tooltip */}
      {(() => {
        const cfg = NEW_DOC_CONFIG[section];
        const isExport = cfg.kind === 'csv';
        return (
          <button type="button" className={`fin-tab-new${isExport ? ' fin-tab-new--export' : ''}`} onClick={onNewDoc} title={cfg.label}>
            {isExport
              ? <Icon name="download" size={13} color="var(--ink2)" />
              : <span className="fin-tab-new-plus" aria-label={cfg.label}>+ New</span>
            }
          </button>
        );
      })()}
    </div>
  );
}

/* ─────────────────────────────────────────────
   DUE DATE BADGE
───────────────────────────────────────────── */
function DueBadge({ inv }: { inv: Invoice }) {
  if (inv.status === 'Paid') return <span className="fin-due-badge fin-due-badge--paid">Paid ✓</span>;
  if (inv.status === 'Credited') return <span className="fin-due-badge fin-due-badge--hold">Credited</span>;
  const diff = dueDaysDiff(inv.dueDate);
  if (diff === null) return <span className="fin-due-badge fin-due-badge--neutral">No Due Date</span>;
  if (diff > 0)  return <span className="fin-due-badge fin-due-badge--warn">{diff} Days</span>;
  if (diff === 0) return <span className="fin-due-badge fin-due-badge--due">Due Today</span>;
  return <span className="fin-due-badge fin-due-badge--over">{diff} Days</span>;
}

/* ─────────────────────────────────────────────
   INVOICE ARCHIVE LIST
───────────────────────────────────────────── */
/* Deterministic avatar color from client name initial */
const AVATAR_PALETTES = [
  { bg: '#fce7f3', fg: '#be185d' },
  { bg: '#dbeafe', fg: '#1d4ed8' },
  { bg: '#d1fae5', fg: '#065f46' },
  { bg: '#ede9fe', fg: '#6d28d9' },
  { bg: '#fef3c7', fg: '#92400e' },
  { bg: '#fee2e2', fg: '#991b1b' },
  { bg: '#e0f2fe', fg: '#0369a1' },
  { bg: '#ecfdf5', fg: '#047857' },
];
function clientPalette(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

function Sparkline({ id, data, color }: { id: string; data: number[]; color: string }) {
  if (data.length < 2) return null;
  const W = 96, H = 44;
  const px = 4, py = 6;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const xs = data.map((_, i) => px + (i / (data.length - 1)) * (W - px * 2));
  const ys = data.map(v => py + (1 - (v - min) / range) * (H - py * 2));

  /* Cardinal spline → cubic bezier */
  function curvePath(): string {
    const t = 0.35;
    let d = `M${f(xs[0])},${f(ys[0])}`;
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = i > 0 ? xs[i - 1] : xs[0], y0 = i > 0 ? ys[i - 1] : ys[0];
      const x1 = xs[i], y1 = ys[i];
      const x2 = xs[i + 1], y2 = ys[i + 1];
      const x3 = i < xs.length - 2 ? xs[i + 2] : xs[xs.length - 1];
      const y3 = i < xs.length - 2 ? ys[i + 2] : ys[ys.length - 1];
      const cp1x = x1 + (x2 - x0) * t, cp1y = y1 + (y2 - y0) * t;
      const cp2x = x2 - (x3 - x1) * t, cp2y = y2 - (y3 - y1) * t;
      d += ` C${f(cp1x)},${f(cp1y)} ${f(cp2x)},${f(cp2y)} ${f(x2)},${f(y2)}`;
    }
    return d;
  }
  function f(n: number) { return n.toFixed(2); }

  const line  = curvePath();
  const area  = `${line} L${f(xs[xs.length - 1])},${H} L${f(xs[0])},${H} Z`;
  const gradId = `spk-${id}`;
  const lx = xs[xs.length - 1], ly = ys[ys.length - 1];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="fin-sparkline-svg">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={f(lx)} cy={f(ly)} r="4" fill="var(--white)" />
      <circle cx={f(lx)} cy={f(ly)} r="2.5" fill={color} />
    </svg>
  );
}

function InvoiceArchiveList({ invoices, activeId, search, onSearch, filterStatus, onFilter, onOpen, onNew, onEditDirect, onDeleteDirect }: {
  invoices: Invoice[];
  activeId: string | null;
  search: string;
  onSearch: (s: string) => void;
  filterStatus: FilterStatus;
  onFilter: (f: FilterStatus) => void;
  onOpen: (inv: Invoice) => void;
  onNew: () => void;
  onEditDirect: (inv: Invoice) => void;
  onDeleteDirect: (inv: Invoice) => void;
}) {
  const { fmt } = useCurrency();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sortField, setSortField] = useState<'id' | 'date' | 'amount' | null>('id');
  const [sortAsc, setSortAsc] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  function toggleSort(field: 'id' | 'date' | 'amount') {
    if (sortField === field) setSortAsc(v => !v);
    else { setSortField(field); setSortAsc(true); }
    setPage(1);
  }

  /* KPI stats with sparkline data */
  const stats = useMemo(() => {
    function parseDMY(s: string): Date | null {
      if (!s) return null;
      const [d, m, y] = s.split('-').map(Number);
      return isNaN(d) ? null : new Date(y, m - 1, d);
    }

    const sorted = [...invoices]
      .map(inv => ({ inv, date: parseDMY(inv.billDate), T: invoiceTotals(inv) }))
      .filter(x => x.date !== null)
      .sort((a, b) => a.date!.getTime() - b.date!.getTime());

    const now = new Date();
    const cm = now.getMonth(), cy = now.getFullYear();
    const pm = cm === 0 ? 11 : cm - 1, py = cm === 0 ? cy - 1 : cy;

    const thisM = sorted.filter(x => x.date!.getMonth() === cm && x.date!.getFullYear() === cy);
    const prevM = sorted.filter(x => x.date!.getMonth() === pm && x.date!.getFullYear() === py);

    const clients = new Set(invoices.map(i => i.client)).size;
    const cThis = new Set(thisM.map(x => x.inv.client)).size;
    const cPrev = new Set(prevM.map(x => x.inv.client)).size;

    let paid = 0, pending = 0, paidThis = 0, pendingThis = 0, paidPrev = 0, pendingPrev = 0;
    for (const { inv, date, T } of sorted) {
      const recv = inv.received ?? 0;
      const out = Math.max(0, T.grandTotalTZS - recv);
      paid += recv; pending += out;
      if (date!.getMonth() === cm && date!.getFullYear() === cy) { paidThis += recv; pendingThis += out; }
      if (date!.getMonth() === pm && date!.getFullYear() === py) { paidPrev += recv; pendingPrev += out; }
    }

    function trendLabel(curr: number, prev: number, isCount = false): string {
      const delta = curr - prev;
      if (isCount) return delta === 0 ? 'same as last month' : `${delta > 0 ? '+' : ''}${delta} vs last month`;
      if (prev === 0) return curr > 0 ? 'new this month' : 'no change';
      const p = Math.round(((curr - prev) / prev) * 100);
      return `${p >= 0 ? '+' : ''}${p}% vs last month`;
    }
    function trendDir(curr: number, prev: number): 'up' | 'down' | 'flat' {
      return curr > prev ? 'up' : curr < prev ? 'down' : 'flat';
    }

    /* Sparkline series — use per-invoice values for natural variation */
    const clientSpark  = sorted.map((_, i) => new Set(sorted.slice(0, i + 1).map(x => x.inv.client)).size);
    const invSpark     = sorted.map(x => x.T.grandTotalTZS);                                      // invoice value per deal
    const paidSpark    = (() => { let r = 0; return sorted.map(x => { r += x.inv.received ?? 0; return r; }); })(); // cumulative payments
    const pendingSpark = sorted.map(x => Math.max(0, x.T.grandTotalTZS - (x.inv.received ?? 0))); // outstanding per deal

    return {
      clients, clientTrend: trendLabel(cThis, cPrev, true), clientDir: trendDir(cThis, cPrev), clientSpark,
      total: invoices.length, invTrend: trendLabel(thisM.length, prevM.length, true), invDir: trendDir(thisM.length, prevM.length), invSpark,
      paid, paidTrend: trendLabel(paidThis, paidPrev), paidDir: trendDir(paidThis, paidPrev), paidSpark,
      pending, pendingTrend: trendLabel(pendingThis, pendingPrev), pendingDir: trendDir(pendingThis, pendingPrev), pendingSpark,
    };
  }, [invoices]);

  const filtered = useMemo(() => {
    let list = invoices
      .filter(inv => filterStatus === 'all' || inv.status === filterStatus)
      .filter(inv => !search || [inv.client, inv.id, inv.blNumber].some(s => s?.toLowerCase().includes(search.toLowerCase())));
    if (sortField === 'id')     list = [...list].sort((a, b) => sortAsc ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id));
    if (sortField === 'date')   list = [...list].sort((a, b) => { const [da, db] = [parseDDMMYYYY(a.billDate)?.getTime() ?? 0, parseDDMMYYYY(b.billDate)?.getTime() ?? 0]; return sortAsc ? da - db : db - da; });
    if (sortField === 'amount') list = [...list].sort((a, b) => { const [ta, tb] = [invoiceTotals(a).grandTotalTZS, invoiceTotals(b).grandTotalTZS]; return sortAsc ? ta - tb : tb - ta; });
    return list;
  }, [invoices, filterStatus, search, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const from = filtered.length === 0 ? 0 : (page - 1) * perPage + 1;
  const to   = Math.min(page * perPage, filtered.length);

  const ALL_STATUSES: FilterStatus[] = ['all', 'Draft', 'Unpaid', 'Partial', 'Paid', 'Overdue', 'Credited'];

  function SortIcon({ field }: { field: 'id' | 'date' | 'amount' }) {
    if (sortField !== field) return <Icon name="chevronsUpDown" size={11} color="var(--ink3)" className="fin-arch-sort-icon" />;
    return <Icon name={sortAsc ? 'chevronUp' : 'chevronDown'} size={11} color="var(--teal)" />;
  }

  return (
    <div className="fin-list" ref={listRef}>

      <div style={{ padding: '0 20px' }}>
        <PageHeader
          crumbs={['Finance', 'Sales Invoices']}
          titlePlain="Sales"
          titleEm="invoices"
          subtitle="Issue, track and reconcile freight invoices — from clearance to final payment."
        />
      </div>

      {/* ── KPI stat cards ── */}
      <div className="fin-kpi-row">

        <div className="fin-kpi-card">
          <div className="fin-kpi-head">
            <div className="fin-kpi-icon fin-kpi-icon--clients"><Icon name="users" size={18} color="var(--teal)" /></div>
            <span className="fin-kpi-label">Clients</span>
          </div>
          <div className="fin-kpi-foot">
            <div className="fin-kpi-body">
              <span className="fin-kpi-value">{stats.clients}</span>
              <span className={`fin-kpi-trend fin-kpi-trend--${stats.clientDir}`}>
                {stats.clientDir === 'up' ? '▲' : stats.clientDir === 'down' ? '▼' : '–'}
                <span className="fin-kpi-trend-sub">{stats.clientTrend}</span>
              </span>
            </div>
            <Sparkline id="clients" data={stats.clientSpark} color="var(--teal)" />
          </div>
        </div>

        <div className="fin-kpi-card">
          <div className="fin-kpi-head">
            <div className="fin-kpi-icon fin-kpi-icon--invoices"><Icon name="fileText" size={18} color="#7c3aed" /></div>
            <span className="fin-kpi-label">Invoices</span>
          </div>
          <div className="fin-kpi-foot">
            <div className="fin-kpi-body">
              <span className="fin-kpi-value">{stats.total}</span>
              <span className={`fin-kpi-trend fin-kpi-trend--${stats.invDir}`}>
                {stats.invDir === 'up' ? '▲' : stats.invDir === 'down' ? '▼' : '–'}
                <span className="fin-kpi-trend-sub">{stats.invTrend}</span>
              </span>
            </div>
            <Sparkline id="invoices" data={stats.invSpark} color="#7c3aed" />
          </div>
        </div>

        <div className="fin-kpi-card">
          <div className="fin-kpi-head">
            <div className="fin-kpi-icon fin-kpi-icon--paid"><Icon name="checkCircle" size={18} color="#059669" /></div>
            <span className="fin-kpi-label">Paid</span>
          </div>
          <div className="fin-kpi-foot">
            <div className="fin-kpi-body">
              <span className="fin-kpi-value">{fmt(stats.paid, 'TZS')}</span>
              <span className={`fin-kpi-trend fin-kpi-trend--${stats.paidDir}`}>
                {stats.paidDir === 'up' ? '▲' : stats.paidDir === 'down' ? '▼' : '–'}
                <span className="fin-kpi-trend-sub">{stats.paidTrend}</span>
              </span>
            </div>
            <Sparkline id="paid" data={stats.paidSpark} color="#059669" />
          </div>
        </div>

        <div className="fin-kpi-card">
          <div className="fin-kpi-head">
            <div className="fin-kpi-icon fin-kpi-icon--pending"><Icon name="alertCircle" size={18} color="#dc2626" /></div>
            <span className="fin-kpi-label">Outstanding</span>
          </div>
          <div className="fin-kpi-foot">
            <div className="fin-kpi-body">
              <span className="fin-kpi-value">{fmt(stats.pending, 'TZS')}</span>
              <span className={`fin-kpi-trend fin-kpi-trend--${stats.pendingDir}`}>
                {stats.pendingDir === 'up' ? '▲' : stats.pendingDir === 'down' ? '▼' : '–'}
                <span className="fin-kpi-trend-sub">{stats.pendingTrend}</span>
              </span>
            </div>
            <Sparkline id="pending" data={stats.pendingSpark} color="#dc2626" />
          </div>
        </div>

      </div>

      {/* ── Table card ── */}
      <div className="fin-table-card">

        {/* Card header */}
        <div className="fin-table-card-hd">
          <span className="fin-table-card-title">Invoices</span>
          <div className="fin-table-card-hd-right">
            <Select value={filterStatus} onValueChange={v => { onFilter(v as FilterStatus); setPage(1); }}>
              <SelectTrigger aria-label="Filter by status" className="fin-status-filter-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : (STATUS_STYLE[s as Status]?.label ?? s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button type="button" className="fin-btn-primary" onClick={onNew}>
              <Icon name="plus" size={13} color="#fff" /> Create Invoice
            </button>
          </div>
        </div>

        {/* Toolbar: entries selector left, search right */}
        <div className="fin-table-toolbar">
          <label className="fin-entries-label">
            Show
            <Select value={String(perPage)} onValueChange={v => { setPerPage(Number(v)); setPage(1); }}>
              <SelectTrigger aria-label="Entries per page" className="fin-per-page"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            entries
          </label>
          <div className="fin-arch-search-wrap">
            <Icon name="search" size={14} color="var(--ink3)" className="fin-arch-search-icon" />
            <input
              value={search}
              onChange={e => { onSearch(e.target.value); setPage(1); }}
              placeholder="Search invoice…"
              className="fin-arch-search-input"
            />
          </div>
        </div>

        {/* Column headers */}
        <div className="fin-archive-header">
          <div className="fin-arch-col fin-arch-col--num fin-arch-col--sortable" onClick={() => toggleSort('id')}>
            # <SortIcon field="id" />
          </div>
          <div className="fin-arch-col fin-arch-col--client">Client</div>
          <div className="fin-arch-col fin-arch-col--bl">BL / AWB</div>
          <div className="fin-arch-col fin-arch-col--due">Due Date</div>
          <div className="fin-arch-col fin-arch-col--amt fin-arch-col--sortable" onClick={() => toggleSort('amount')}>
            Total <SortIcon field="amount" />
          </div>
          <div className="fin-arch-col fin-arch-col--balance">Balance</div>
          <div className="fin-arch-col fin-arch-col--status">Status</div>
          <div className="fin-arch-col fin-arch-col--actions">Action</div>
        </div>

        {/* Rows */}
        <div className="fin-list-body">
          {paged.length === 0 && (
            <div className="fin-empty-state">
              {search || filterStatus !== 'all' ? 'No invoices match your filters.' : 'No invoices yet — create your first one.'}
            </div>
          )}
          {paged.map(inv => {
            const T       = invoiceTotals(inv);
            const balance = Math.max(0, T.grandTotalTZS - (inv.received ?? 0));
            const isActive  = inv.id === activeId;
            const isDraft   = inv.status === 'Draft';
            const diff      = dueDaysDiff(inv.dueDate);
            const isOverdue = diff !== null && diff < 0 && inv.status !== 'Paid' && inv.status !== 'Credited';
            const palIdx    = AVATAR_PALETTES.indexOf(clientPalette(inv.client));
            const initials  = inv.client.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

            return (
              <div
                key={inv.id}
                className={`fin-arch-row${isActive ? ' fin-arch-row--active' : ''}`}
                onClick={() => onOpen(inv)}
              >
                {/* # */}
                <div className="fin-arch-col fin-arch-col--num">
                  <span className="fin-arch-id">{inv.id}</span>
                </div>

                {/* Client: avatar + name */}
                <div className="fin-arch-col fin-arch-col--client">
                  <div className="fin-client-avatar" data-av={palIdx}>
                    {initials}
                  </div>
                  <span className="fin-arch-client">{inv.client}</span>
                </div>

                {/* BL */}
                <div className="fin-arch-col fin-arch-col--bl">
                  <span className="fin-arch-bl">{inv.blNumber || '—'}</span>
                </div>

                {/* Due date */}
                <div className="fin-arch-col fin-arch-col--due">
                  {inv.dueDate ? (
                    <div className="fin-arch-due-cell">
                      <span className={isOverdue ? 'fin-arch-due--overdue' : 'fin-arch-date'}>{inv.dueDate}</span>
                      {isOverdue && <span className="fin-arch-overdue-label">Overdue</span>}
                    </div>
                  ) : <span className="fin-arch-date">—</span>}
                </div>

                {/* Total */}
                <div className="fin-arch-col fin-arch-col--amt">
                  <span className="fin-arch-total">{fmt(T.grandTotalTZS, 'TZS')}</span>
                </div>

                {/* Balance */}
                <div className="fin-arch-col fin-arch-col--balance">
                  <span className={balance === 0 ? 'fin-arch-balance--zero' : 'fin-arch-balance--due'}>
                    {fmt(balance, 'TZS')}
                  </span>
                </div>

                {/* Status badge */}
                <div className="fin-arch-col fin-arch-col--status">
                  <span className="fin-arch-status-pill" data-status={inv.status}>
                    {STATUS_STYLE[inv.status].label}
                  </span>
                </div>

                {/* Actions */}
                <div className="fin-arch-col fin-arch-col--actions" onClick={e => e.stopPropagation()}>
                  <button type="button" className="fin-act-btn" title="View" onClick={() => onOpen(inv)}>
                    <Icon name="eye" size={15} color="var(--ink3)" />
                  </button>
                  <button type="button" className="fin-act-btn" title="Download">
                    <Icon name="download" size={15} color="var(--ink3)" />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="fin-act-btn" title="More">
                        <Icon name="moreVertical" size={15} color="var(--ink3)" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onOpen(inv)}>
                        <Icon name="eye" size={13} color="var(--ink2)" /> View Invoice
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Icon name="download" size={13} color="var(--ink2)" /> Download
                      </DropdownMenuItem>
                      {isDraft && <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onEditDirect(inv)}>
                          <Icon name="edit" size={13} color="#2563eb" /> Edit Invoice
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDeleteDirect(inv)} className="text-destructive focus:text-destructive">
                          <Icon name="trash" size={13} color="#dc2626" /> Delete
                        </DropdownMenuItem>
                      </>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        <div className="fin-archive-pagination">
          <span className="fin-pagination-info">
            Showing {from} to {to} of {filtered.length} entries
          </span>
          <div className="fin-pagination-btns">
            <button type="button" className="fin-page-btn fin-page-btn--nav" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <Icon name="chevronLeft" size={13} color="var(--ink2)" /> Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} type="button" className={`fin-page-btn${p === page ? ' fin-page-btn--active' : ''}`} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button type="button" className="fin-page-btn fin-page-btn--nav" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              Next <Icon name="chevronRight" size={13} color="var(--ink2)" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   NARROW INVOICE STRIP — horizontal IDs
───────────────────────────────────────────── */
function NarrowInvoiceStrip({ invoices, activeId, filterStatus, onOpen }: {
  invoices: Invoice[];
  activeId: string | null;
  filterStatus: FilterStatus;
  onOpen: (inv: Invoice) => void;
}) {
  const STRIP_PAGE_SIZE = 15;
  const [filterOpen, setFilterOpen]   = useState(false);
  const [searchOpen, setSearchOpen]   = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [stripPage, setStripPage]     = useState(1);
  const stripRef  = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /* Auto-focus search input when it opens */
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  /* Close search panel when clicking outside the strip */
  useEffect(() => {
    if (!searchOpen) return;
    function handleClick(e: MouseEvent) {
      if (stripRef.current && !stripRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [searchOpen]);

  const allMonths = useMemo(
    () => [...new Set(invoices.map(inv => monthLabel(inv.billDate)))],
    [invoices]
  );
  const allClients = useMemo(
    () => [...new Set(invoices.map(inv => inv.client))],
    [invoices]
  );

  const hasFilter = !!(monthFilter || clientFilter);

  const visible = invoices
    .filter(inv => filterStatus === 'all' || inv.status === filterStatus)
    .filter(inv => !monthFilter || monthLabel(inv.billDate) === monthFilter)
    .filter(inv => !clientFilter || inv.client === clientFilter)
    .filter(inv => !searchQuery || [inv.id, inv.client, inv.blNumber].some(s => s?.toLowerCase().includes(searchQuery.toLowerCase())));

  const stripTotalPages = Math.max(1, Math.ceil(visible.length / STRIP_PAGE_SIZE));
  const pagedVisible = visible.slice((stripPage - 1) * STRIP_PAGE_SIZE, stripPage * STRIP_PAGE_SIZE);

  function toggleSearch() {
    setSearchOpen(v => !v);
    setFilterOpen(false);
    if (searchOpen) setSearchQuery('');
    setStripPage(1);
  }

  return (
    <div className="fin-narrow-strip" ref={stripRef}>
      <div className="fin-narrow-header">
        <button
          type="button"
          className={`fin-narrow-search-btn${searchOpen ? ' fin-narrow-search-btn--active' : ''}`}
          onClick={toggleSearch}
          title="Search invoices"
        >
          <Icon name="search" size={14} color={searchOpen ? 'var(--teal)' : 'var(--ink3)'} />
        </button>
        <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`fin-narrow-filter-btn${hasFilter ? ' fin-narrow-filter-btn--active' : ''}`}
              onClick={() => setSearchOpen(false)}
              title="Filter invoices"
            >
              <Icon name="filter" size={14} color={hasFilter ? 'var(--teal)' : 'var(--ink3)'} />
              {hasFilter && <span className="fin-narrow-filter-dot" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Month</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setMonthFilter(null)} className={!monthFilter ? 'bg-accent text-accent-foreground' : ''}>All months</DropdownMenuItem>
            {allMonths.map(m => (
              <DropdownMenuItem key={m} onClick={() => { setMonthFilter(prev => prev === m ? null : m); setStripPage(1); }}
                className={monthFilter === m ? 'bg-accent text-accent-foreground' : ''}>
                {m}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Customer</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setClientFilter(null)} className={!clientFilter ? 'bg-accent text-accent-foreground' : ''}>All customers</DropdownMenuItem>
            {allClients.map(c => (
              <DropdownMenuItem key={c} onClick={() => { setClientFilter(prev => prev === c ? null : c); setStripPage(1); }}
                className={clientFilter === c ? 'bg-accent text-accent-foreground' : ''}>
                {c}
              </DropdownMenuItem>
            ))}
            {hasFilter && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setMonthFilter(null); setClientFilter(null); setStripPage(1); }} className="text-destructive focus:text-destructive font-semibold">
                  Clear filters
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Inline search box — drops inside the strip below the header */}
      {searchOpen && (
        <div className="fin-narrow-search-box">
          <Icon name="search" size={12} color="var(--ink3)" />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Invoice, client, BL…"
            className="fin-narrow-search-input"
            title="Search invoices"
          />
          {searchQuery && (
            <button type="button" className="fin-narrow-search-clear" onClick={() => setSearchQuery('')} title="Clear search">×</button>
          )}
        </div>
      )}

      <div className="fin-narrow-list">
        {visible.length === 0 && <div className="fin-narrow-empty">No invoices</div>}
        {pagedVisible.map(inv => {
          const isActive = inv.id === activeId;
          const label = inv.id.replace(/ INV$/, '');
          return (
            <button
              key={inv.id}
              type="button"
              className={`fin-narrow-item${isActive ? ' fin-narrow-item--active' : ''}`}
              onClick={() => onOpen(inv)}
              title={`${inv.id} — ${inv.client}`}
            >
              <span className="fin-narrow-dot" data-status={inv.status} />
              <span className="fin-narrow-id">{label}</span>
            </button>
          );
        })}
      </div>

      {visible.length > STRIP_PAGE_SIZE && (
        <div className="fin-narrow-pager">
          <button type="button" className="fin-narrow-pager-btn" disabled={stripPage === 1} onClick={() => setStripPage(p => p - 1)} title="Previous page">
            <Icon name="chevronLeft" size={12} color="var(--ink3)" />
          </button>
          <span className="fin-narrow-pager-info">{stripPage} / {stripTotalPages}</span>
          <button type="button" className="fin-narrow-pager-btn" disabled={stripPage === stripTotalPages} onClick={() => setStripPage(p => p + 1)} title="Next page">
            <Icon name="chevronRight" size={12} color="var(--ink3)" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   SECTION PLACEHOLDER
───────────────────────────────────────────── */
function SectionPlaceholder({ section }: { section: NavLeaf }) {
  return (
    <div className="fin-list fin-section-placeholder">
      <Icon name={section.icon as any} size={40} color="var(--border)" />
      <div className="fin-placeholder-text">
        <div className="fin-placeholder-title">{section.label}</div>
        <div className="fin-placeholder-sub">Full module coming soon</div>
      </div>
    </div>
  );
}

const GROUP_COLOR_KEYS = ['blue', 'purple', 'red'] as const;
type GroupColorKey = typeof GROUP_COLOR_KEYS[number];
const GROUP_COLOR_MAP: Record<GroupColorKey, string> = { blue: '#2563eb', purple: '#7c3aed', red: '#dc2626' };
function hexToColorKey(hex: string): GroupColorKey {
  return ((Object.entries(GROUP_COLOR_MAP).find(([, v]) => v === hex)?.[0]) ?? 'blue') as GroupColorKey;
}

/* ─────────────────────────────────────────────
   GROUP MODAL
───────────────────────────────────────────── */
function GroupModal({ tabs, existingGroups, pendingInvoice, onConfirm, onJoin, onClose }: {
  tabs: DocTab[];
  existingGroups: TabGroup[];
  pendingInvoice?: Invoice | null;
  onConfirm: (name: string, color: string, tabIds: string[]) => void;
  onJoin: (groupId: string, tabIds: string[]) => void;
  onClose: () => void;
}) {
  const alreadyGrouped = new Set(existingGroups.flatMap(g => g.tabIds));
  const availableTabs = tabs.filter(t => !alreadyGrouped.has(t.id));
  const canCreate = existingGroups.length < 3;

  /* mode: 'create' or 'join-<groupId>' */
  const defaultMode = canCreate ? 'create' : (existingGroups[0]?.id ? `join-${existingGroups[0].id}` : 'create');
  const [mode, setMode] = useState<string>(defaultMode);

  /* Create-mode state */
  const defaultColorKey = GROUP_COLOR_KEYS[existingGroups.length % GROUP_COLOR_KEYS.length];
  const [name, setName] = useState(`Group ${existingGroups.length + 1}`);
  const [colorKey, setColorKey] = useState<GroupColorKey>(defaultColorKey);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(pendingInvoice ? availableTabs.map(t => t.id) : [])
  );

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const isCreate = mode === 'create';
  const joinTargetId = isCreate ? null : mode.replace('join-', '');
  const joinTarget = existingGroups.find(g => g.id === joinTargetId) ?? null;

  return (
    <div className="fin-modal-overlay" onClick={onClose}>
      <div className="fin-modal" onClick={e => e.stopPropagation()}>
        <div className="fin-modal-header">
          <span className="fin-modal-title">{isCreate ? 'Create Tab Group' : `Join "${joinTarget?.name ?? ''}"`}</span>
          <button type="button" className="fin-modal-close" onClick={onClose} title="Close">×</button>
        </div>

        {pendingInvoice && (
          <div className="fin-modal-prompt">
            <Icon name="alertCircle" size={14} color="#b45309" />
            <span>Too many ungrouped tabs. Group some to open <strong>{pendingInvoice.id}</strong>.</span>
          </div>
        )}

        {/* Mode switcher — only shown when groups exist */}
        {existingGroups.length > 0 && (
          <div className="fin-modal-body fin-modal-body--compact">
            <div className="fin-modal-mode-row">
              {canCreate && (
                <button type="button" className={`fin-modal-mode-btn${isCreate ? ' fin-modal-mode-btn--active' : ''}`} onClick={() => setMode('create')}>
                  + New Group {existingGroups.length + 1}
                </button>
              )}
              {existingGroups.map(g => (
                <button key={g.id} type="button"
                  className={`fin-modal-mode-btn${mode === `join-${g.id}` ? ' fin-modal-mode-btn--active' : ''}`}
                  onClick={() => setMode(`join-${g.id}`)}>
                  <span className="fin-modal-join-dot" data-gc={hexToColorKey(g.color)} />
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="fin-modal-body">
          {isCreate ? (
            <>
              <div className="fin-modal-field">
                <label className="fin-modal-label" htmlFor="group-name-input">Group Name</label>
                <input id="group-name-input" value={name} onChange={e => setName(e.target.value)} className="fin-modal-input" title="Group name" placeholder="Group name" />
              </div>
              <div className="fin-modal-field">
                <label className="fin-modal-label">Color</label>
                <div className="fin-modal-colors">
                  {GROUP_COLOR_KEYS.map(key => (
                    <button key={key} type="button" data-gc={key} className={`fin-color-swatch${colorKey === key ? ' fin-color-swatch--active' : ''}`} onClick={() => setColorKey(key)} title={`Use ${key}`} />
                  ))}
                </div>
              </div>
              <div className="fin-modal-field">
                <label className="fin-modal-label">Select Tabs ({availableTabs.length} available)</label>
                {availableTabs.length === 0 ? (
                  <div className="fin-modal-empty">All open tabs are already in a group.</div>
                ) : (
                  <div className="fin-modal-tab-list">
                    {availableTabs.map(tab => (
                      <label key={tab.id} className={`fin-modal-tab-row${selected.has(tab.id) ? ' fin-modal-tab-row--selected' : ''}`}>
                        <input type="checkbox" checked={selected.has(tab.id)} onChange={() => toggle(tab.id)} className="fin-modal-checkbox" title={`Select ${tab.customName ?? tab.title}`} />
                        <span className="fin-modal-tab-name">{tab.customName ?? tab.title}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : joinTarget ? (
            <div className="fin-modal-field">
              <div className="fin-modal-join-group">
                <span className="fin-modal-join-dot" data-gc={hexToColorKey(joinTarget.color)} />
                <span>Move the current ungrouped tabs ({availableTabs.length}) into <strong>{joinTarget.name}</strong>.</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="fin-modal-footer">
          <button type="button" className="fin-modal-btn-cancel" onClick={onClose}>Cancel</button>
          {isCreate ? (
            <button type="button" className="fin-modal-btn-confirm" disabled={selected.size === 0 || !name.trim()}
              onClick={() => onConfirm(name.trim(), GROUP_COLOR_MAP[colorKey], Array.from(selected))}>
              {pendingInvoice ? 'Create Group & Open' : 'Create Group'}
            </button>
          ) : (
            <button type="button" className="fin-modal-btn-confirm" disabled={availableTabs.length === 0 || !joinTarget}
              onClick={() => joinTarget && onJoin(joinTarget.id, availableTabs.map(t => t.id))}>
              {pendingInvoice ? 'Join Group & Open' : 'Join Group'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN FINANCE SHELL
───────────────────────────────────────────── */
export const FinanceShell: React.FC = () => {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  /* Derive section from URL; default to overview */
  const section: SectionId = URL_TO_SECTION[pathname] ?? 'overview';
  function setSection(s: SectionId) { navigate(SECTION_TO_URL[s]); }

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const [openTabs, setOpenTabs] = useState<DocTab[]>([]);
  const [tabGroups, setTabGroups] = useState<TabGroup[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [pendingInvoiceToOpen, setPendingInvoiceToOpen] = useState<Invoice | null>(null);

  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [invoiceMode, setInvoiceMode] = useState<'view' | 'edit' | 'create'>('view');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  useEffect(() => {
    apiFetch('/v1/invoices')
      .then((data: any) => { if (Array.isArray(data) && data.length > 0) setInvoices(data.map(mapApiInvoice)); })
      .catch(() => {});
  }, []);

  /* Auto-collapse sidebar when a doc tab opens */
  useEffect(() => {
    if (activeTabId) setSidebarCollapsed(true);
  }, [activeTabId]);

  const activeTab = openTabs.find(t => t.id === activeTabId) ?? null;
  const activeInvoice = activeTab?.invoice ?? null;
  const maxNumber = Math.max(...invoices.map(i => parseInt(i.id.match(/\d{4}/g)?.pop() ?? '0')), 0);
  const nextInvId = `CLR-2026-${String(maxNumber + 1).padStart(4, '0')} INV`;
  const sectionTabs = openTabs.filter(t => t.sectionId === section);
  const docIsOpen = activeTabId !== null;

  function exportCSV() {
    const rows: string[][] = [
      ['Invoice #', 'Client', 'BL Number', 'Issue Date', 'Due Date', 'Status', 'Amount (TZS)', 'VAT (TZS)', 'Received (TZS)'],
      ...invoices.map(inv => {
        const T = invoiceTotals(inv);
        const vat = T.tax(T.cl) + T.tax(T.sh) * inv.exchangeRate + T.tax(T.ot);
        return [
          inv.id, inv.client, inv.blNumber ?? '',
          inv.billDate ?? '', inv.dueDate ?? '', inv.status,
          String(Math.round(T.grandTotalTZS)),
          String(Math.round(vat)),
          String(Math.round(inv.received ?? 0)),
        ];
      }),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `hudumika-${section}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function handleNewDoc() {
    const cfg = NEW_DOC_CONFIG[section];
    if (cfg.kind === 'invoice') { setActiveTabId(null); setInvoiceMode('create'); return; }
    if (cfg.kind === 'csv') { exportCSV(); return; }
    /* For other sections, signal the page component via a custom event */
    window.dispatchEvent(new CustomEvent('fin:new-doc', { detail: { section } }));
  }

  /* Direct open — bypasses the 5-tab guard (used internally after group creation) */
  function _doOpenInvoice(inv: Invoice) {
    const tabId = `invoice-${inv.id}`;
    setOpenTabs(prev => {
      const exists = prev.find(t => t.id === tabId);
      if (exists) return prev.map(t => t.id === tabId ? { ...t, invoice: inv } : t);
      return [...prev, { id: tabId, sectionId: 'invoices', docId: inv.id, title: inv.id, invoice: inv }];
    });
    setActiveTabId(tabId);
    setInvoiceMode('view');
  }

  /* Public open — blocks at 5 open invoice tabs (the 6th item in tab bar) */
  function openInvoice(inv: Invoice) {
    const tabId = `invoice-${inv.id}`;
    const alreadyOpen = openTabs.some(t => t.id === tabId);
    const allGroupedIds = new Set(tabGroups.flatMap(g => g.tabIds));
    const ungroupedInvoiceTabs = openTabs.filter(t => t.sectionId === 'invoices' && !allGroupedIds.has(t.id));
    if (!alreadyOpen && ungroupedInvoiceTabs.length >= 4) {
      setPendingInvoiceToOpen(inv);
      setShowGroupModal(true);
      return;
    }
    _doOpenInvoice(inv);
  }

  function openInvoiceEdit(inv: Invoice) {
    _doOpenInvoice(inv);
    setInvoiceMode('edit');
  }

  async function deleteInvoiceDirect(inv: Invoice) {
    if (!(await showConfirm(`Delete invoice ${inv.id}? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
    setInvoices(prev => prev.filter(i => i.id !== inv.id));
    const tabId = `invoice-${inv.id}`;
    setOpenTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTabId === tabId) setActiveTabId(null);
  }

  function closeTab(tabId: string) {
    setOpenTabs(prev => prev.filter(t => t.id !== tabId));
    setTabGroups(prev =>
      prev.map(g => ({ ...g, tabIds: g.tabIds.filter(id => id !== tabId) })).filter(g => g.tabIds.length > 0)
    );
    if (activeTabId === tabId) setActiveTabId(null);
  }

  function renameTab(tabId: string, name: string) {
    setOpenTabs(prev => prev.map(t => t.id === tabId ? { ...t, customName: name } : t));
  }

  function toggleGroup(groupId: string) {
    setTabGroups(prev => prev.map(g => g.id === groupId ? { ...g, collapsed: !g.collapsed } : g));
  }

  function createGroup(name: string, color: string, tabIds: string[]) {
    setTabGroups(prev => {
      if (prev.length >= 3) return prev;
      return [...prev, { id: `group-${Date.now()}`, name, color, tabIds, collapsed: true }];
    });
    if (pendingInvoiceToOpen) {
      _doOpenInvoice(pendingInvoiceToOpen);
      setPendingInvoiceToOpen(null);
    }
    setShowGroupModal(false);
  }

  function joinGroup(groupId: string, tabIds: string[]) {
    setTabGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, tabIds: [...new Set([...g.tabIds, ...tabIds])] } : g
    ));
    if (pendingInvoiceToOpen) {
      _doOpenInvoice(pendingInvoiceToOpen);
      setPendingInvoiceToOpen(null);
    }
    setShowGroupModal(false);
  }

  function handleUpdateInvoice(updated: Invoice) {
    setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
  }

  function handleSaveInvoice(inv: Invoice) {
    const isCreate = invoiceMode === 'create';
    setInvoices(prev => isCreate ? [inv, ...prev] : prev.map(i => i.id === inv.id ? inv : i));
    setInvoiceMode('view');
    const tabId = `invoice-${inv.id}`;
    if (isCreate) {
      setOpenTabs(prev => [...prev, { id: tabId, sectionId: 'invoices', docId: inv.id, title: inv.id, invoice: inv }]);
      setActiveTabId(tabId);
    } else {
      setOpenTabs(prev => prev.map(t => t.id === tabId ? { ...t, invoice: inv } : t));
    }
    const dbId = (!isCreate && activeInvoice?._dbId) ? activeInvoice._dbId : null;
    apiFetch(dbId ? `/v1/invoices/${dbId}` : '/v1/invoices', {
      method: dbId ? 'PATCH' : 'POST',
      body: JSON.stringify({
        invoice_number: inv.id, customer_id: inv.customerId || null, client_name: inv.client, client_address: inv.clientAddress,
        shipment_ref: inv.shipmentRef || null,
        bl_number: inv.blNumber, origin: inv.origin, destination: inv.destination, mode: inv.mode,
        bill_date: inv.billDate ? inv.billDate.split('-').reverse().join('-') : null,
        due_date: inv.dueDate ? inv.dueDate.split('-').reverse().join('-') : null,
        sale_agent: inv.saleAgent, payment_terms: inv.terms, exchange_rate: inv.exchangeRate,
        ref_code: inv.refCode, version: inv.version, status: inv.status, notes: '',
        items: inv.items.map((it, i) => ({ name: it.name, unit: it.unit, rate: it.rate, qty: it.qty, tax_pct: it.taxPct, line_group: it.group, currency: it.currency, sort_order: i })),
      }),
    }).then(() => apiFetch('/v1/invoices'))
      .then((data: any) => { if (Array.isArray(data)) setInvoices(data.map(mapApiInvoice)); })
      .catch(() => {});
  }

  function handleCopyInvoice() {
    if (!activeInvoice) return;
    const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
    const copy: Invoice = { ...activeInvoice, id: nextInvId, status: 'Draft', received: 0, billDate: today, dueDate: null, version: 1, refCode: genRefCode(nextInvId, 1) };
    setInvoices(prev => [copy, ...prev]);
    openInvoice(copy);
  }

  async function handleDeleteInvoice() {
    if (!activeInvoice || !(await showConfirm(`Delete ${activeInvoice.id}? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
    if (activeInvoice._dbId) apiFetch(`/v1/invoices/${activeInvoice._dbId}`, { method: 'DELETE' }).catch(() => {});
    setInvoices(prev => prev.filter(i => i.id !== activeInvoice.id));
    closeTab(`invoice-${activeInvoice.id}`);
  }

  async function handleSubmitTRA() {
    if (!activeInvoice?._dbId) throw new Error('Save the invoice before submitting it to TRA');
    const dbId = activeInvoice._dbId;
    const tabId = activeTabId;
    try {
      await apiFetch(`/v1/tra/invoices/${dbId}/submit`, { method: 'POST' });
    } finally {
      // Refresh either way — the backend persists tra_status on both success and failure.
      const fresh = await apiFetch(`/v1/invoices/${dbId}`).catch(() => null);
      if (fresh) {
        const updated = mapApiInvoice(fresh);
        setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
        setOpenTabs(prev => prev.map(t => t.id === tabId ? { ...t, invoice: updated } : t));
      }
    }
  }

  function handleRecordPayment(amount: number, payMethod: string, payDate: string) {
    if (!activeInvoice) return;
    const newRec = Math.min(activeInvoice.received + amount, invoiceTotal(activeInvoice));
    const newStatus: Status = newRec >= invoiceTotal(activeInvoice) ? 'Paid' : 'Partial';
    const updated = { ...activeInvoice, received: newRec, status: newStatus };
    setInvoices(prev => prev.map(i => i.id === activeInvoice.id ? updated : i));
    setOpenTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, invoice: updated } : t));
    if (activeInvoice._dbId) {
      apiFetch(`/v1/invoices/${activeInvoice._dbId}/payment`, {
        method: 'POST',
        body: JSON.stringify({ amount, method: payMethod, payment_date: payDate }),
      }).then(() => apiFetch('/v1/invoices'))
        .then((data: any) => { if (Array.isArray(data)) setInvoices(data.map(mapApiInvoice)); })
        .catch(() => {});
    }
  }

  const activeSec = findSection(section);
  const showingEditor = section === 'invoices' && (invoiceMode === 'create' || invoiceMode === 'edit');
  const showingDetail = section === 'invoices' && invoiceMode === 'view' && !!activeInvoice;

  return (
    <div className="fin-shell">
      {/* Mobile top bar */}
      {isMobile && (
        <div className="fin-mobile-bar">
          <button type="button" className="fin-hamburger" onClick={() => setMobileOpen(true)} title="Open menu">
            <Icon name="menu" size={18} color="var(--ink2)" />
          </button>
          <span className="fin-mobile-title">{activeSec.label}</span>
        </div>
      )}

      {/* ① TAB BAR — full width at very top */}
      <FinTabBar
        section={section}
        tabs={openTabs}
        tabGroups={tabGroups}
        activeTabId={activeTabId}
        onTabClick={id => { setActiveTabId(id); if (id !== null) setInvoiceMode('view'); }}
        onTabClose={closeTab}
        onTabRename={renameTab}
        onToggleGroup={toggleGroup}
        onNewDoc={handleNewDoc}
      />

      {/* ② BODY — sidebar + content side by side */}
      <div className="fin-shell-body">
        <FinSidebar
          section={section}
          onSection={setSection}
          collapsed={sidebarCollapsed && !mobileOpen}
          onToggle={() => setSidebarCollapsed(v => !v)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />

        <div className="fin-main">
          <div className={`fin-content${docIsOpen || showingEditor ? ' fin-content--split' : ''}`}>
            {section === 'invoices' ? (
              <>
                {/* List: full archive or narrow strip */}
                {(!isMobile || (!showingDetail && !showingEditor)) && (
                  docIsOpen || showingEditor ? (
                    <NarrowInvoiceStrip
                      invoices={invoices}
                      activeId={activeInvoice?.id ?? null}
                      filterStatus={filterStatus}
                      onOpen={openInvoice}
                    />
                  ) : (
                    <InvoiceArchiveList
                      invoices={invoices}
                      activeId={activeInvoice?.id ?? null}
                      search={search}
                      onSearch={setSearch}
                      filterStatus={filterStatus}
                      onFilter={setFilterStatus}
                      onOpen={openInvoice}
                      onNew={() => setInvoiceMode('create')}
                      onEditDirect={openInvoiceEdit}
                      onDeleteDirect={deleteInvoiceDirect}
                    />
                  )
                )}

                {/* Detail / editor panel */}
                {(showingEditor || showingDetail) && (
                  <div className={`fin-detail${isMobile ? ' fin-detail--mobile-full' : ''}`}>
                    {showingEditor ? (
                      <InvoiceEditor
                        initial={invoiceMode === 'edit' ? activeInvoice : null}
                        nextId={nextInvId}
                        onSave={handleSaveInvoice}
                        onCancel={() => { setInvoiceMode('view'); if (invoiceMode === 'create') setActiveTabId(null); }}
                        isMobile={isMobile}
                      />
                    ) : activeInvoice ? (
                      <InvoiceDetailPanel
                        inv={activeInvoice}
                        onClose={() => setActiveTabId(null)}
                        onEdit={() => setInvoiceMode('edit')}
                        onCopy={handleCopyInvoice}
                        onDelete={handleDeleteInvoice}
                        onRecordPayment={handleRecordPayment}
                        onSubmitTRA={handleSubmitTRA}
                        isMobile={isMobile}
                      />
                    ) : null}
                  </div>
                )}
              </>
            ) : (
              <div className="fin-section-page">
                {section === 'overview'        && <FinanceDashboard />}
                {section === 'bills'           && <Bills />}
                {section === 'quotations'      && <Quotations />}
                {section === 'purchase-orders' && <PurchaseOrders />}
                {section === 'expenses'        && <Expenses />}
                {section === 'payments'        && <FinancePayments />}
                {section === 'vendors'         && <FinanceVendors />}
                {section === 'products'        && <FinanceProducts />}
                {section === 'accounts'        && <AccountsQuery />}
                {section === 'reports'         && <FinanceReportingMaster />}
              </div>
            )}
          </div>
        </div>
      </div>

      {showGroupModal && (
        <GroupModal
          tabs={sectionTabs}
          existingGroups={tabGroups}
          pendingInvoice={pendingInvoiceToOpen}
          onConfirm={createGroup}
          onJoin={joinGroup}
          onClose={() => { setShowGroupModal(false); setPendingInvoiceToOpen(null); }}
        />
      )}
    </div>
  );
};
