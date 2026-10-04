import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import type { IconName } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Tip } from '../../components/ui/tooltip.js';
import { PersonAvatar, CompanyAvatar } from '../../components/PersonAvatar.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { showAlert } from '../../lib/alert.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem,
} from '../../components/ui/dropdown-menu.js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '../../components/ui/dialog.js';
import { showConfirm } from '../../lib/confirm.js';
import { SkeletonPage } from '../../components/ui/skeleton.js';
import type { Customer } from './customer-types.js';
import { fmtDate, maskTin, STATUS_VARIANT, PAGE_SIZE, getPageNums } from './customer-types.js';

function Th({ children, width, align, className }: { children?: React.ReactNode; width?: number; align?: 'right'; className?: string }) {
  return (
    <th className={className} style={{ width, textAlign: align }}>
      {children}
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'success'} className="whitespace-nowrap">{status}</Badge>;
}

function TinChip({ tin }: { tin?: string }) {
  const [copied, setCopied] = useState(false);
  const masked = maskTin(tin);
  if (!masked) return <span style={{ color: 'var(--ink3)', fontSize: 12 }}>—</span>;
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tin) return;
    navigator.clipboard.writeText(tin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Tip label={copied ? 'Copied!' : `TIN: ${tin} — click to copy`} side="top">
      <div onClick={handleCopy}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '3px 8px', cursor: 'pointer' }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--blue)', letterSpacing: '0.04em', background: 'var(--blue-l)', borderRadius: 'var(--r-sm)', padding: '1px 4px' }}>TIN</span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 12, color: 'var(--ink)' }}>{masked}</span>
        {copied
          ? <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700 }}>✓</span>
          : <Icon name="copy" size={11} style={{ color: 'var(--ink3)', opacity: 0.65 }} />}
      </div>
    </Tip>
  );
}

function ActionsMenu({ onView, onEdit, onSuspend, onDelete }: { onView: () => void; onEdit: () => void; onSuspend: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" style={{ padding: '0 7px', height: 30 }} aria-label="Row actions">
          <Icon name="moreHorizontal" size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <button type="button" className="dd-item" onClick={onView}><Icon name="user" size={13} /> View Profile</button>
        <button type="button" className="dd-item" onClick={onEdit}><Icon name="edit" size={13} /> Edit</button>
        <button type="button" className="dd-item" onClick={onSuspend}><Icon name="pause" size={13} /> Toggle Status</button>
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        <button type="button" className="dd-item dd-item-danger" onClick={onDelete}><Icon name="trash" size={13} /> Delete</button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <CompanyAvatar
      name={name}
      size={38}
      shape="square"
      style={{ borderRadius: 'var(--r)', boxShadow: 'var(--elev-sm)', border: '1px solid var(--border)' }}
    />
  );
}

function PagBtn({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      style={{ minWidth: 32, height: 32, padding: '0 8px', border: active ? 'none' : '1.5px solid var(--border)', borderRadius: 'var(--r)', background: active ? 'hsl(var(--primary))' : disabled ? 'var(--bg)' : 'var(--card-bg, var(--white))', color: active ? 'hsl(var(--primary-foreground))' : disabled ? 'var(--ink3)' : 'var(--ink)', fontSize: 13, fontWeight: active ? 700 : 500, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)' }}>
      {label}
    </button>
  );
}

/* ══════════════════════════════════════════
   CustomerDirectoryPage
══════════════════════════════════════════ */
export const CustomerDirectoryPage: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    client_type: 'Corporate',
    email: '',
    phone_wa: '',
    tax_id: '',
    vat_number: '',
    contact_name: '',
    address: '',
    city: 'Dar es Salaam',
    country: 'Tanzania',
    preferred_port: 'Dar es Salaam Port',
    credit_days: '30',
  });
  const [createSaving, setCreateSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [bulkAction, setBulkAction] = useState('');
  const [listTab, setListTab] = useState<'all' | 'active' | 'corporate' | 'shipments' | 'inactive'>('all');
  const [clientTypeFilter, setClientTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [visibleCols, setVisibleCols] = useState({
    email: true, phone: true, contact: true, tin: true, trade: true, joined: true,
  });

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/v1/customers');
      setCustomers(res.data ?? res ?? []);
    } catch { /* empty */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  /* ── Metrics ── */
  const totalCount = customers.length;
  const activeCount = customers.filter(c => (c.account_status || 'Active') === 'Active').length;
  const inactiveCount = customers.filter(c => (c.account_status || 'Active') !== 'Active').length;
  const corporateCount = customers.filter(c => {
    const t = (c.client_type || '').toLowerCase();
    const n = c.name.toLowerCase();
    return t === 'corporate' || n.includes('ltd') || n.includes('limited') || n.includes('corp') || n.includes('industries') || n.includes('holdings') || n.includes('enterprises') || n.includes('group');
  }).length;
  const withShipmentsCount = customers.filter(c => (c.shipment_count ?? 0) > 0).length;
  const totalShipments = customers.reduce((s, c) => s + (c.shipment_count ?? 0), 0);
  const verifiedTinCount = customers.filter(c => !!c.tax_id).length;
  const tinRate = totalCount > 0 ? Math.round((verifiedTinCount / totalCount) * 100) : 0;

  const filtered = useMemo(() => {
    return customers.filter(c => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q ||
        c.name.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone_wa || '').toLowerCase().includes(q) ||
        (c.contact_name || '').toLowerCase().includes(q) ||
        (c.tax_id || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        (c.preferred_port || '').toLowerCase().includes(q);

      const status = c.account_status || 'Active';
      const matchStatus = statusFilter === 'all' || status === statusFilter;

      const isCorporate = (c.client_type || '').toLowerCase() === 'corporate' ||
        c.name.toLowerCase().includes('ltd') ||
        c.name.toLowerCase().includes('limited') ||
        c.name.toLowerCase().includes('corp') ||
        c.name.toLowerCase().includes('industries') ||
        c.name.toLowerCase().includes('holdings');

      const clientType = c.client_type || (isCorporate ? 'Corporate' : 'SME');
      const matchClientType = clientTypeFilter === 'all' || clientType === clientTypeFilter;

      let matchListTab = true;
      if (listTab === 'active') matchListTab = status === 'Active';
      else if (listTab === 'inactive') matchListTab = status !== 'Active';
      else if (listTab === 'corporate') matchListTab = isCorporate;
      else if (listTab === 'shipments') matchListTab = (c.shipment_count ?? 0) > 0;

      return matchSearch && matchStatus && matchClientType && matchListTab;
    });
  }, [customers, search, statusFilter, clientTypeFilter, listTab]);

  function exportCSV(rows: Customer[]) {
    const hdr = ['Name', 'Client Type', 'Email', 'Phone', 'Contact Person', 'TIN Number', 'City', 'Preferred Port', 'Shipments', 'Status', 'Joined'].join(',');
    const body = rows.map(c => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.client_type || 'Corporate'}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${(c.phone_wa || '').replace(/"/g, '""')}"`,
      `"${(c.contact_name || '').replace(/"/g, '""')}"`,
      `"${(c.tax_id || '').replace(/"/g, '""')}"`,
      `"${(c.city || '').replace(/"/g, '""')}"`,
      `"${(c.preferred_port || '').replace(/"/g, '""')}"`,
      c.shipment_count ?? 0,
      c.account_status || 'Active',
      c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : '',
    ].join(',')).join('\n');
    const blob = new Blob([hdr + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  async function handleBulkApply() {
    if (!bulkAction || selectedIds.length === 0) return;
    const ids = [...selectedIds];
    try {
      if (bulkAction === 'delete') {
        if (!(await showConfirm(`Delete ${ids.length} customer${ids.length > 1 ? 's' : ''}? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
        await Promise.all(ids.map(id => apiFetch(`/v1/customers/${id}`, { method: 'DELETE' })));
        setCustomers(cs => cs.filter(c => !ids.includes(c.id)));
      } else if (bulkAction === 'export') {
        exportCSV(customers.filter(c => ids.includes(c.id)));
      } else {
        const s: Customer['account_status'] = bulkAction === 'active' ? 'Active' : bulkAction === 'inactive' ? 'Inactive' : 'Suspended';
        await Promise.all(ids.map(id => apiFetch(`/v1/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ account_status: s }) })));
        setCustomers(cs => cs.map(c => ids.includes(c.id) ? { ...c, account_status: s } : c));
      }
      setSelectedIds([]); setBulkAction('');
    } catch (err: any) { showAlert(err.message || 'Action failed'); }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSaving(true);
    try {
      await apiFetch('/v1/customers', { method: 'POST', body: JSON.stringify(createForm) });
      setShowCreate(false);
      setCreateForm({
        name: '', client_type: 'Corporate', email: '', phone_wa: '', tax_id: '',
        vat_number: '', contact_name: '', address: '', city: 'Dar es Salaam',
        country: 'Tanzania', preferred_port: 'Dar es Salaam Port', credit_days: '30',
      });
      loadCustomers();
      showAlert('Customer created successfully', { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Failed to create customer', { variant: 'error' });
    } finally { setCreateSaving(false); }
  };

  if (loading) return <SkeletonPage variant="table" />;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const allChecked = paginated.length > 0 && paginated.every(c => selectedIds.includes(c.id));
  const someChecked = paginated.some(c => selectedIds.includes(c.id));

  function toggleRow(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleAll() {
    if (allChecked) setSelectedIds(prev => prev.filter(id => !paginated.some(c => c.id === id)));
    else setSelectedIds(prev => [...new Set([...prev, ...paginated.map(c => c.id)])]);
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 32px', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

      <PageHeader
        crumbs={['CRM', 'Customers']}
        titlePlain="Customer"
        titleEm="directory"
        subtitle={`${totalCount.toLocaleString()} client accounts, commercial terms, billing statements, and trade history.`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="download" size={14} strokeWidth={2} /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/crm/customers/bulk-upload')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="upload" size={14} strokeWidth={2} /> Import
            </Button>
            <Button variant="default" size="sm" onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={15} strokeWidth={2.5} color="hsl(var(--primary-foreground))" /> Add Customer
            </Button>
          </div>
        }
      />

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* KPI ribbon */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 14 }}>
          {[
            { label: 'Total Customers',    main: totalCount,         sub: <><span style={{ color: 'var(--green)', fontWeight: 600 }}>{activeCount} active</span> · {inactiveCount} inactive</>, icon: 'users'     as IconName, variant: 'brand'   as const },
            { label: 'Corporate Accounts', main: corporateCount,     sub: `${Math.round((corporateCount / Math.max(1, totalCount)) * 100)}% of client portfolio`,                               icon: 'briefcase' as IconName, variant: 'success' as const },
            { label: 'Trade Shipments',    main: totalShipments,     sub: `Across ${withShipmentsCount} active trading clients`,                                                                 icon: 'ship'      as IconName, variant: 'info'    as const },
            { label: 'Tax Compliance Rate',main: `${tinRate}%`,      sub: <><span style={{ color: 'var(--teal)', fontWeight: 600 }}>{verifiedTinCount}</span> verified TIN records</>,          icon: 'shield'    as IconName, variant: 'warning' as const },
          ].map(kpi => (
            <div key={kpi.label} style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)' }}>{kpi.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', marginTop: 4, lineHeight: 1.1 }}>{kpi.main}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>{kpi.sub}</div>
              </div>
              <FeaturedIcon variant={kpi.variant} size="md" shape="square"><Icon name={kpi.icon} size={18} /></FeaturedIcon>
            </div>
          ))}
        </div>

        {/* Segmented list tabs */}
        <Tabs value={listTab} onValueChange={v => { setListTab(v as typeof listTab); setPage(1); }} variant="segmented">
          <TabsList style={{ overflowX: 'auto' }}>
            <TabsTrigger value="all">All Accounts ({totalCount})</TabsTrigger>
            <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
            <TabsTrigger value="corporate">Corporate & Key ({corporateCount})</TabsTrigger>
            <TabsTrigger value="shipments">With Shipments ({withShipmentsCount})</TabsTrigger>
            <TabsTrigger value="inactive">Inactive / Suspended ({inactiveCount})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Main card */}
        <div className="crm-card" style={{ borderRadius: 'var(--r)', background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', boxShadow: 'var(--elev-sm)' }}>

          {/* Toolbar */}
          <div className="crm-toolbar" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Select value={bulkAction || '__none__'} onValueChange={v => setBulkAction(v === '__none__' ? '' : v)}>
                <SelectTrigger className="w-40 h-8.5 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Bulk Action</SelectItem>
                  <SelectItem value="active">Mark as Active</SelectItem>
                  <SelectItem value="inactive">Mark as Inactive</SelectItem>
                  <SelectItem value="suspend">Suspend Selected</SelectItem>
                  <SelectItem value="export">Export Selected</SelectItem>
                  <SelectItem value="delete">Delete Selected</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant={bulkAction && selectedIds.length > 0 ? 'default' : 'outline'}
                onClick={handleBulkApply} disabled={!bulkAction || selectedIds.length === 0} style={{ height: 34 }}>
                Apply
              </Button>
            </div>

            {selectedIds.length > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--teal-l)', border: '1px solid var(--teal-m, var(--border))', borderRadius: 'var(--r-sm)', padding: '3px 8px', fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>
                <span>{selectedIds.length} selected</span>
                <button type="button" onClick={() => setSelectedIds([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
              </div>
            )}

            <Select value={clientTypeFilter} onValueChange={v => { setClientTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-36 h-8.5 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Client Types</SelectItem>
                <SelectItem value="Corporate">Corporate</SelectItem>
                <SelectItem value="SME">SME / Trading</SelectItem>
                <SelectItem value="Government">Government</SelectItem>
                <SelectItem value="Individual">Individual</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-34 h-8.5 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
                <SelectItem value="Suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>

            <div style={{ flex: 1 }} />

            <div style={{ position: 'relative', minWidth: 240 }}>
              <Icon name="search" size={14} strokeWidth={1.75} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search customer, contact, TIN, port…"
                style={{ padding: '7px 28px 7px 32px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm, 6px)', fontSize: 13, fontFamily: 'var(--font)', outline: 'none', width: '100%', color: 'var(--ink)', background: 'var(--card-bg, var(--white))' }}
              />
              {search && (
                <button type="button" onClick={() => { setSearch(''); setPage(1); }}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 14, padding: 0 }}>
                  ×
                </button>
              )}
            </div>

            {/* View mode toggle */}
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r-sm, 6px)', overflow: 'hidden', background: 'var(--bg)' }}>
              {[{ mode: 'table', icon: 'list' }, { mode: 'grid', icon: 'grid' }].map(v => (
                <Tip key={v.mode} label={`${v.mode.charAt(0).toUpperCase() + v.mode.slice(1)} View`} side="bottom">
                  <button type="button" onClick={() => setViewMode(v.mode as 'table' | 'grid')}
                    style={{ padding: '6px 10px', border: 'none', background: viewMode === v.mode ? 'var(--card-bg, var(--white))' : 'transparent', color: viewMode === v.mode ? 'var(--teal)' : 'var(--ink3)', cursor: 'pointer', boxShadow: viewMode === v.mode ? 'var(--elev-sm)' : 'none', display: 'flex', alignItems: 'center' }}>
                    <Icon name={v.icon as IconName} size={15} />
                  </button>
                </Tip>
              ))}
            </div>

            {/* Column settings */}
            <Tip label="Column visibility" side="bottom">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" style={{ padding: '0 8px', height: 34 }}>
                    <Icon name="settings" size={14} style={{ color: 'var(--ink3)' }} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div style={{ padding: '6px 10px 4px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Visible Columns</div>
                  {([
                    { key: 'email',   label: 'Email' },
                    { key: 'phone',   label: 'Phone / WhatsApp' },
                    { key: 'contact', label: 'Primary Contact' },
                    { key: 'tin',     label: 'TIN Number' },
                    { key: 'trade',   label: 'Trade Volume' },
                    { key: 'joined',  label: 'Joined Date' },
                  ] as { key: keyof typeof visibleCols; label: string }[]).map(col => (
                    <DropdownMenuCheckboxItem
                      key={col.key}
                      checked={visibleCols[col.key]}
                      onSelect={e => e.preventDefault()}
                      onCheckedChange={() => setVisibleCols(v => ({ ...v, [col.key]: !v[col.key] }))}
                    >
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </Tip>
          </div>

          {/* Table view */}
          {viewMode === 'table' && (
            <div className="crm-customer-table-scroll" style={{ overflowX: 'auto' }}>
              <table className="crm-table crm-customer-table">
                <thead>
                  <tr>
                    <Th width={42}><Checkbox checked={allChecked ? true : someChecked ? 'indeterminate' : false} onCheckedChange={toggleAll} /></Th>
                    <Th className="crm-col-company" width={360}>Customer / Company</Th>
                    {visibleCols.contact && <Th className="crm-col-contact">Primary Contact</Th>}
                    {visibleCols.email   && <Th className="crm-col-email">Email Address</Th>}
                    {visibleCols.phone   && <Th className="crm-col-phone">Phone / WhatsApp</Th>}
                    {visibleCols.tin     && <Th className="crm-col-tin">TIN & Compliance</Th>}
                    {visibleCols.trade   && <Th className="crm-col-trade">Trade Volume</Th>}
                    {visibleCols.joined  && <Th className="crm-col-joined">Joined</Th>}
                    <Th>Status</Th>
                    <Th className="crm-col-actions" align="right" width={80}>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const colCount = 4 + Object.values(visibleCols).filter(Boolean).length;
                    if (paginated.length === 0) {
                      return (
                        <tr>
                          <td colSpan={colCount} style={{ padding: '64px 20px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--ink3)' }}>
                              <FeaturedIcon variant="brand" size="lg" shape="circle"><Icon name="users" size={24} /></FeaturedIcon>
                              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>No customers found</div>
                              <div style={{ fontSize: 13, maxWidth: 360 }}>No client accounts match your current filters. Try changing your search query or add a new customer.</div>
                              <Button size="sm" onClick={() => setShowCreate(true)} style={{ marginTop: 6 }}>
                                <Icon name="plus" size={14} /> Add Customer
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return paginated.map(c => {
                      const isChecked = selectedIds.includes(c.id);
                      const status = c.account_status || 'Active';
                      const isCorporate = (c.client_type || '').toLowerCase() === 'corporate' || c.name.toLowerCase().includes('ltd') || c.name.toLowerCase().includes('limited') || c.name.toLowerCase().includes('corp');
                      const clientTag = c.client_type || (isCorporate ? 'Corporate' : 'SME');
                      return (
                        <tr key={c.id}
                          style={{ background: isChecked ? 'var(--teal-l, var(--bg))' : 'var(--card-bg, var(--white))', cursor: 'pointer', transition: 'background 0.1s ease' }}
                          onClick={() => navigate(`/crm/customers/${c.id}`)}>
                          <td style={{ width: 42 }} onClick={e => e.stopPropagation()}>
                            <Checkbox aria-label={`Select ${c.name}`} checked={isChecked} onCheckedChange={() => toggleRow(c.id)} />
                          </td>
                          <td className="crm-col-company crm-company-cell">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <Avatar name={c.name} />
                              <div>
                                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>{c.name}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                  <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>{clientTag}</span>
                                  {c.city && <><span style={{ color: 'var(--border)' }}>·</span><span style={{ fontSize: 11, color: 'var(--ink3)' }}>{c.city}</span></>}
                                  {c.preferred_port && <><span style={{ color: 'var(--border)' }}>·</span><span style={{ fontSize: 10.5, color: 'var(--teal)', fontWeight: 600 }}>{c.preferred_port}</span></>}
                                </div>
                              </div>
                            </div>
                          </td>
                          {visibleCols.contact && (
                            <td className="crm-col-contact">
                              {c.contact_name ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <PersonAvatar name={c.contact_name} size={24} />
                                  <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{c.contact_name}</span>
                                </div>
                              ) : <span style={{ color: 'var(--ink3)', fontSize: 12.5 }}>—</span>}
                            </td>
                          )}
                          {visibleCols.email && (
                            <td className="crm-col-email">
                              {c.email ? (
                                <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}
                                  style={{ fontSize: 13, color: 'var(--ink)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                                  className="hover:underline">
                                  <Icon name="mail" size={13} style={{ color: 'var(--ink3)' }} />{c.email}
                                </a>
                              ) : <span style={{ color: 'var(--ink3)', fontSize: 12.5 }}>—</span>}
                            </td>
                          )}
                          {visibleCols.phone && (
                            <td className="crm-col-phone">
                              {c.phone_wa ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Tip label={`Open WhatsApp — ${c.phone_wa}`} side="top">
                                    <a href={`https://wa.me/${c.phone_wa.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontFamily: 'var(--font)', color: 'var(--ink)', textDecoration: 'none', background: 'var(--bg)', padding: '2px 7px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                                      <Icon name="phone" size={12} style={{ color: 'var(--green)' }} />{c.phone_wa}
                                    </a>
                                  </Tip>
                                </div>
                              ) : <span style={{ color: 'var(--ink3)', fontSize: 12.5 }}>—</span>}
                            </td>
                          )}
                          {visibleCols.tin && <td className="crm-col-tin"><TinChip tin={c.tax_id} /></td>}
                          {visibleCols.trade && (
                            <td className="crm-col-trade">
                              {(c.shipment_count ?? 0) > 0 ? (
                                <Badge variant="info" className="gap-1 font-semibold">
                                  <Icon name="ship" size={11} />{c.shipment_count} shipments
                                </Badge>
                              ) : <span style={{ color: 'var(--ink3)', fontSize: 12 }}>None</span>}
                            </td>
                          )}
                          {visibleCols.joined && (
                            <td className="crm-col-joined" style={{ fontSize: 12.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                              {fmtDate(c.created_at)}
                            </td>
                          )}
                          <td><StatusBadge status={status} /></td>
                          <td className="crm-col-actions" style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                            <ActionsMenu
                              onView={() => navigate(`/crm/customers/${c.id}`)}
                              onEdit={() => navigate(`/crm/customers/${c.id}/profile`)}
                              onSuspend={() => {
                                const next = c.account_status === 'Suspended' ? 'Active' : 'Suspended';
                                apiFetch(`/v1/customers/${c.id}`, { method: 'PATCH', body: JSON.stringify({ account_status: next }) })
                                  .then(() => setCustomers(cs => cs.map(x => x.id === c.id ? { ...x, account_status: next } : x)))
                                  .catch(err => showAlert(err.message || 'Failed'));
                              }}
                              onDelete={async () => {
                                if (!(await showConfirm(`Delete ${c.name}? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
                                apiFetch(`/v1/customers/${c.id}`, { method: 'DELETE' })
                                  .then(() => setCustomers(cs => cs.filter(x => x.id !== c.id)))
                                  .catch(err => showAlert(err.message || 'Delete failed'));
                              }}
                            />
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {/* Grid view */}
          {viewMode === 'grid' && (
            <div style={{ padding: 18, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {paginated.map(c => {
                const status = c.account_status || 'Active';
                const isChecked = selectedIds.includes(c.id);
                return (
                  <div key={c.id} onClick={() => navigate(`/crm/customers/${c.id}`)}
                    style={{ background: isChecked ? 'var(--teal-l)' : 'var(--card-bg, var(--white))', border: `1px solid ${isChecked ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 'var(--r)', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14, cursor: 'pointer', boxShadow: 'var(--elev-sm)' }}
                    className="hover:shadow-md hover:border-primary/40">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={c.name} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>{c.name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{c.client_type || 'Corporate'}{c.city ? ` · ${c.city}` : ''}</div>
                        </div>
                      </div>
                      <StatusBadge status={status} />
                    </div>
                    <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                      {c.contact_name && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--ink3)' }}>Contact:</span>
                          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.contact_name}</span>
                        </div>
                      )}
                      {c.tax_id && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--ink3)' }}>TIN:</span>
                          <span style={{ fontFamily: 'var(--font)', fontWeight: 600 }}>{maskTin(c.tax_id)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--ink3)' }}>Trade Shipments:</span>
                        <span style={{ fontWeight: 700, color: (c.shipment_count ?? 0) > 0 ? 'var(--blue)' : 'var(--ink3)' }}>{c.shipment_count ?? 0}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {c.email && (
                          <Tip label={`Email — ${c.email}`} side="top">
                            <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} style={{ width: 30, height: 30, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink2)', background: 'var(--card-bg, var(--white))' }}>
                              <Icon name="mail" size={13} />
                            </a>
                          </Tip>
                        )}
                        {c.phone_wa && (
                          <Tip label={`WhatsApp — ${c.phone_wa}`} side="top">
                            <a href={`https://wa.me/${c.phone_wa.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ width: 30, height: 30, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)', background: 'var(--card-bg, var(--white))' }}>
                              <Icon name="phone" size={13} />
                            </a>
                          </Tip>
                        )}
                      </div>
                      <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); navigate(`/crm/customers/${c.id}`); }} style={{ height: 30, fontSize: 12 }}>
                        Profile
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {filtered.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
                Showing <strong style={{ color: 'var(--ink)' }}>{Math.min(filtered.length, (safePage - 1) * PAGE_SIZE + 1)}</strong>–<strong style={{ color: 'var(--ink)' }}>{Math.min(filtered.length, safePage * PAGE_SIZE)}</strong> of <strong style={{ color: 'var(--ink)' }}>{filtered.length}</strong> customers
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <PagBtn label="Prev" disabled={safePage === 1} onClick={() => setPage(p => p - 1)} />
                {getPageNums(safePage, totalPages).map((p, i) =>
                  p === '…'
                    ? <span key={`e-${i}`} style={{ padding: '0 4px', color: 'var(--ink3)', fontSize: 13 }}>···</span>
                    : <PagBtn key={p} label={String(p)} active={p === safePage} onClick={() => setPage(p as number)} />
                )}
                <PagBtn label="Next" disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink3)' }}>
                <span style={{ fontWeight: 600, letterSpacing: '0.04em' }}>PAGE</span>
                <input type="number" value={safePage} min={1} max={totalPages} onChange={e => { const v = parseInt(e.target.value); if (v >= 1 && v <= totalPages) setPage(v); }}
                  style={{ width: 44, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 12.5, textAlign: 'center', fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--card-bg, var(--white))' }} />
                <span>OF {totalPages}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Customer Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Register an enterprise client account with commercial credit terms, tax identification, and preferred customs ports.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <DialogBody>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Company / Legal Name *</label>
                  <input type="text" required value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Acme Industrial Supplies Ltd" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--card-bg, var(--white))', color: 'var(--ink)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Client Classification</label>
                  <Select value={createForm.client_type} onValueChange={v => setCreateForm(p => ({ ...p, client_type: v }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Corporate">Corporate / Enterprise</SelectItem>
                      <SelectItem value="SME">SME / Trading Firm</SelectItem>
                      <SelectItem value="Government">Government / Public Agency</SelectItem>
                      <SelectItem value="Individual">Individual Trader</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Primary Contact Person</label>
                  <input type="text" value={createForm.contact_name} onChange={e => setCreateForm(p => ({ ...p, contact_name: e.target.value }))} placeholder="e.g. John Doe (Director)" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--card-bg, var(--white))', color: 'var(--ink)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Official Email Address</label>
                  <input type="email" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} placeholder="accounts@company.co.tz" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--card-bg, var(--white))', color: 'var(--ink)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>WhatsApp / Phone Number</label>
                  <input type="text" value={createForm.phone_wa} onChange={e => setCreateForm(p => ({ ...p, phone_wa: e.target.value }))} placeholder="+255 712 345 678" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--card-bg, var(--white))', color: 'var(--ink)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Taxpayer ID (TIN Number)</label>
                  <input type="text" value={createForm.tax_id} onChange={e => setCreateForm(p => ({ ...p, tax_id: e.target.value }))} placeholder="e.g. 123-456-789" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--card-bg, var(--white))', color: 'var(--ink)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>VAT Registration Number</label>
                  <input type="text" value={createForm.vat_number} onChange={e => setCreateForm(p => ({ ...p, vat_number: e.target.value }))} placeholder="e.g. 40-001234-V" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--card-bg, var(--white))', color: 'var(--ink)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Preferred Port / ICD</label>
                  <Select value={createForm.preferred_port} onValueChange={v => setCreateForm(p => ({ ...p, preferred_port: v }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dar es Salaam Port">Dar es Salaam Port (TZ)</SelectItem>
                      <SelectItem value="Mombasa Port">Mombasa Port (KE)</SelectItem>
                      <SelectItem value="Tanga Port">Tanga Port (TZ)</SelectItem>
                      <SelectItem value="Zanzibar Malindi">Zanzibar Malindi Port</SelectItem>
                      <SelectItem value="Mtwara Port">Mtwara Port</SelectItem>
                      <SelectItem value="Kurasini ICD">Kurasini ICD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Commercial Payment Terms</label>
                  <Select value={createForm.credit_days} onValueChange={v => setCreateForm(p => ({ ...p, credit_days: v }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Cash on Delivery (COD)</SelectItem>
                      <SelectItem value="15">15 Days Net</SelectItem>
                      <SelectItem value="30">30 Days Net (Standard)</SelectItem>
                      <SelectItem value="60">60 Days Net</SelectItem>
                      <SelectItem value="90">90 Days Net (Special)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Physical Address & Location</label>
                  <input type="text" value={createForm.address} onChange={e => setCreateForm(p => ({ ...p, address: e.target.value }))} placeholder="e.g. Plot 45, Nyerere Road, Industrial Area, Dar es Salaam" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--card-bg, var(--white))', color: 'var(--ink)' }} />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createSaving || !createForm.name.trim()}>
                {createSaving ? 'Creating Account…' : 'Create Customer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
