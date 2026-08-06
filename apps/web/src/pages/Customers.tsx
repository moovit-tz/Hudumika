import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import { StatusPill } from '@hudumika/ui';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { mapApiInvoice, invoiceTotals } from './Billing.js';
import type { ExpenseListItem } from './Expenses.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from '../components/ui/dropdown-menu.js';
import { showConfirm } from '../lib/confirm.js';
import { SkeletonPage } from '../components/ui/skeleton.js';

/* ── Types ── */
interface Customer {
  id: string;
  name: string;
  email?: string;
  phone_wa?: string;
  tax_id?: string;
  contact_name?: string;
  address?: string;
  created_at: string;
  shipment_count?: number;
  city?: string;
  country?: string;
  website?: string;
  vat_number?: string;
  import_license?: string;
  preferred_port?: string;
  freight_terms?: string;
  commodity_type?: string;
  credit_days?: string;
  client_type?: string;
  account_status?: 'Active' | 'Inactive' | 'Suspended';
  notes?: string;
  currency?: string;
  tancis_number?: string;
}

/* ── Avatar helper ── */
const AVATAR_COLORS = ['#0d7a6b','#0550ae','#6e40c9','#059669','#9a6700','#cf222e','#d05c30'];
function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
function avatarColor(name: string) {
  return AVATAR_COLORS[((name ?? '?').charCodeAt(0)) % AVATAR_COLORS.length];
}
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div style={{ background: avatarColor(name), width: size, height: size, fontSize: size * 0.35, borderRadius: size > 48 ? 16 : '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0, fontFamily: 'var(--font)', letterSpacing: '-0.02em' }}>
      {initials(name)}
    </div>
  );
}

/* ── Helpers ── */
const PAGE_SIZE = 10;

function fmtDate(d: string) {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ', ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
}

function fmtDateShort(d: string) {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function maskTin(tin?: string) {
  if (!tin) return null;
  const last4 = tin.replace(/\D/g, '').slice(-4);
  return `**** ${last4 || '????'}`;
}

function getPageNums(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  if (cur > 3) pages.push('…');
  for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) pages.push(p);
  if (cur < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

/* ── Status badge ── */
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Active:    { bg: 'var(--green-l)', color: 'var(--green)' },
  Inactive:  { bg: 'var(--bg)', color: 'var(--ink2)' },
  Suspended: { bg: 'var(--red-l)', color: 'var(--red)' },
};
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Active;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

/* ── TIN chip ── */
function TinChip({ tin }: { tin?: string }) {
  const masked = maskTin(tin);
  if (!masked) return <span style={{ color: 'var(--ink3)', fontSize: 12 }}>—</span>;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--bg)', borderRadius: 6, padding: '3px 8px' }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--blue)', letterSpacing: '0.04em', background: 'var(--blue-l)', borderRadius: 3, padding: '1px 4px' }}>TIN</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink2)' }}>{masked}</span>
    </div>
  );
}

/* ── Table header cell ── */
function Th({ children, align = 'left', width }: { children?: React.ReactNode; align?: 'left'|'right'|'center'; width?: number | string }) {
  return (
    <th style={{ textAlign: align, width }}>
      {children}
    </th>
  );
}

/* ── Actions dropdown ── */
function ActionsMenu({ onView, onEdit, onSuspend, onDelete }: { onView: () => void; onEdit: () => void; onSuspend: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="More actions" onClick={e => e.stopPropagation()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 8px', borderRadius: 'var(--r)', color: 'var(--ink3)', display: 'flex', alignItems: 'center', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="moreHorizontal" size={16} strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem onClick={onView} className="cursor-pointer"><Icon name="eye" size={13} className="text-muted-foreground" /> View Profile</DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit} className="cursor-pointer"><Icon name="edit" size={13} className="text-muted-foreground" /> Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={onSuspend} className="cursor-pointer"><Icon name="lock" size={13} className="text-muted-foreground" /> Suspend</DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="cursor-pointer text-destructive focus:text-destructive"><Icon name="trash" size={13} /> Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── View field — clean display of a label+value pair ── */
function ViewField({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: value ? 'var(--ink)' : 'var(--ink3)', fontFamily: mono ? 'var(--mono)' : 'var(--font)', fontStyle: value ? 'normal' : 'italic' }}>
        {value || '—'}
      </div>
    </div>
  );
}

/* ── Stat chip used in hero ── */
function HeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>{label}</div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Main component
══════════════════════════════════════════ */
export const Customers: React.FC = () => {
  const isMobile = useIsMobile();
  const [view, setView]           = useState<'list' | 'profile'>('list');
  const [searchParams] = useSearchParams();
  const deepLinkId = searchParams.get('id');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [expenses, setExpenses]   = useState<ExpenseListItem[]>([]);

  useEffect(() => {
    apiFetch('/v1/finance/expenses').then((res: any) => setExpenses(res?.data ?? [])).catch(() => {});
  }, []);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [visibleCols, setVisibleCols] = useState({ email: true, phone: true, contact: true, tin: true, joined: true });
  const [selected, setSelected]   = useState<Customer | null>(null);

  /* Profile navigation */
  const [mainTab, setMainTab]     = useState('overview');
  const [financeTab, setFinanceTab] = useState('invoices');
  const [shipTab, setShipTab]     = useState('shipments');
  const [supplyTab, setSupplyTab] = useState('projects');

  /* Profile edit */
  const [editMode, setEditMode]   = useState(false);
  const [form, setForm]           = useState<Partial<Customer>>({});
  const [saving, setSaving]       = useState(false);

  /* Shipments */
  const [custShipments, setCustShipments] = useState<any[]>([]);
  const [shipLoading, setShipLoading]     = useState(false);

  /* Notes */
  const [notes, setNotes]         = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  /* Finance data */
  const [custInvoices, setCustInvoices] = useState<any[]>([]);
  const [custPayments, setCustPayments] = useState<any[]>([]);
  const [finLoading, setFinLoading]     = useState(false);

  /* Supply chain */
  const [custTickets, setCustTickets]   = useState<any[]>([]);
  const [supplyLoading, setSupplyLoading] = useState(false);

  /* SEAL bonded storage (cross-app link) */
  const [custSealLots, setCustSealLots] = useState<any[]>([]);
  const [sealLoading, setSealLoading] = useState(false);

  /* Documents */
  const [custDocuments, setCustDocuments] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  /* Contacts */
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', role: '' });
  const [contactSaving, setContactSaving] = useState(false);

  /* Create modal */
  const [showCreate, setShowCreate] = useState(false);
  // Keys match the real POST /v1/customers body fields exactly (tax_id/
  // contact_name, not tax_id/contact_name) — this form used to send
  // the wrong key names, so the TIN and contact person were silently
  // dropped server-side on every "Add Customer" ever submitted here.
  const [createForm, setCreateForm] = useState({ name: '', email: '', phone_wa: '', tax_id: '', contact_name: '', address: '' });
  const [createSaving, setCreateSaving] = useState(false);

  /* List-view state */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage]           = useState(1);
  const [bulkAction, setBulkAction] = useState('');

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/v1/customers');
      setCustomers(res.data ?? res ?? []);
    } catch { /* empty */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  /* Auto-open customer when navigated from Support with ?id= */
  useEffect(() => {
    if (!deepLinkId || !customers.length) return;
    const match = customers.find(c => c.id === deepLinkId);
    if (match && !selected) openProfile(match);
  }, [deepLinkId, customers]); // eslint-disable-line react-hooks/exhaustive-deps

  const openProfile = (c: Customer) => {
    setSelected(c);
    setForm({ ...c });
    setMainTab('overview');
    setEditMode(false);
    setView('profile');
  };

  const loadShipments = useCallback(async (customerId: string) => {
    setShipLoading(true);
    try {
      const res = await apiFetch(`/v1/shipments?customer_id=${customerId}&limit=50`);
      setCustShipments(res.data ?? res ?? []);
    } catch { setCustShipments([]); } finally { setShipLoading(false); }
  }, []);

  useEffect(() => {
    // Loaded as soon as a customer is selected (not gated to the Shipments
    // tab) since Overview's KPIs and Carbon Footprint card need it immediately.
    if (selected) loadShipments(selected.id);
  }, [selected, loadShipments]);

  const loadFinance = useCallback(async (customerId: string) => {
    setFinLoading(true);
    try {
      const [inv, pay] = await Promise.all([
        apiFetch(`/v1/invoices?customer_id=${customerId}`).catch(() => []),
        apiFetch(`/v1/payments?customer_id=${customerId}`).catch(() => []),
      ]);
      setCustInvoices(Array.isArray(inv) ? inv : (inv?.data ?? []));
      setCustPayments(Array.isArray(pay) ? pay : (pay?.data ?? []));
    } catch { /* empty */ } finally { setFinLoading(false); }
  }, []);

  useEffect(() => {
    // Loaded as soon as a customer is selected — Overview's Invoices/Outstanding
    // KPIs need real totals immediately, not only once the Finance tab is opened.
    if (selected) loadFinance(selected.id);
  }, [selected, loadFinance]);

  const loadTickets = useCallback(async (customerId: string) => {
    setSupplyLoading(true);
    try {
      const res = await apiFetch(`/v1/support/tickets?customer_id=${customerId}`).catch(() => []);
      setCustTickets(Array.isArray(res) ? res : (res?.data ?? []));
    } catch { /* empty */ } finally { setSupplyLoading(false); }
  }, []);

  useEffect(() => {
    if (selected && mainTab === 'supply') loadTickets(selected.id);
  }, [selected, mainTab, loadTickets]);

  const loadSealLots = useCallback(async (customerId: string) => {
    setSealLoading(true);
    try {
      const res = await apiFetch(`/v1/seal/lots-for-customer?owner_id=${customerId}`).catch(() => []);
      setCustSealLots(Array.isArray(res) ? res : []);
    } catch { /* empty */ } finally { setSealLoading(false); }
  }, []);

  useEffect(() => {
    if (selected && mainTab === 'seal') loadSealLots(selected.id);
  }, [selected, mainTab, loadSealLots]);

  const loadDocuments = useCallback(async (customerId: string) => {
    setDocsLoading(true);
    try {
      const res = await apiFetch(`/v1/customers/${customerId}/documents`).catch(() => ({ data: [] }));
      setCustDocuments(Array.isArray(res?.data) ? res.data : []);
    } catch { /* empty */ } finally { setDocsLoading(false); }
  }, []);

  useEffect(() => {
    if (selected && mainTab === 'documents') loadDocuments(selected.id);
  }, [selected, mainTab, loadDocuments]);

  useEffect(() => {
    if (selected) setNotes(selected.notes || '');
  }, [selected]);

  async function handleSaveNote() {
    if (!selected) return;
    setNoteSaving(true);
    try {
      await apiFetch(`/v1/customers/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ notes }) });
      setSelected(prev => prev ? { ...prev, notes } : prev);
      setCustomers(cs => cs.map(c => c.id === selected.id ? { ...c, notes } : c));
    } catch (err: any) { showAlert(err.message || 'Failed to save notes'); } finally { setNoteSaving(false); }
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !contactForm.name) return;
    setContactSaving(true);
    try {
      await apiFetch(`/v1/customers/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ contact_name: contactForm.name, email: contactForm.email || selected.email, phone_wa: contactForm.phone || selected.phone_wa }),
      });
      setSelected(prev => prev ? { ...prev, contact_name: contactForm.name, email: contactForm.email || prev.email, phone_wa: contactForm.phone || prev.phone_wa } : prev);
      setCustomers(cs => cs.map(c => c.id === selected.id ? { ...c, contact_name: contactForm.name } : c));
      setShowAddContact(false);
      setContactForm({ name: '', email: '', phone: '', role: '' });
    } catch (err: any) { showAlert(err.message || 'Failed to save contact'); } finally { setContactSaving(false); }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/customers/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name, email: form.email, phone_wa: form.phone_wa, tax_id: form.tax_id,
          contact_name: form.contact_name, address: form.address, website: form.website,
          city: form.city, country: form.country, vat_number: form.vat_number,
          import_license: form.import_license, preferred_port: form.preferred_port,
          freight_terms: form.freight_terms, commodity_type: form.commodity_type,
          credit_days: form.credit_days ? Number(form.credit_days) : null, client_type: form.client_type,
          currency: form.currency, tancis_number: form.tancis_number,
        }),
      });
      setSelected(prev => prev ? { ...prev, ...form } : prev);
      setCustomers(cs => cs.map(c => c.id === selected.id ? { ...c, ...form } : c));
      setEditMode(false);
    } catch (err: any) { showAlert(err.message || 'Save failed'); } finally { setSaving(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSaving(true);
    try {
      await apiFetch('/v1/customers', { method: 'POST', body: JSON.stringify(createForm) });
      setShowCreate(false);
      setCreateForm({ name: '', email: '', phone_wa: '', tax_id: '', contact_name: '', address: '' });
      loadCustomers();
    } catch (err: any) { showAlert(err.message); } finally { setCreateSaving(false); }
  };

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone_wa?.includes(search) ||
      c.contact_name?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || (c.account_status || 'Active') === statusFilter;
    return matchSearch && matchStatus;
  });

  function exportCSV(rows: Customer[]) {
    const hdr = ['Name','Email','Phone','Contact Person','TIN Number','Status','Joined'].join(',');
    const body = rows.map(c => [
      `"${c.name.replace(/"/g,'""')}"`,
      `"${(c.email||'').replace(/"/g,'""')}"`,
      `"${(c.phone_wa||'').replace(/"/g,'""')}"`,
      `"${(c.contact_name||'').replace(/"/g,'""')}"`,
      `"${(c.tax_id||'').replace(/"/g,'""')}"`,
      c.account_status||'Active',
      c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : '',
    ].join(',')).join('\n');
    const blob = new Blob([hdr+'\n'+body], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `customers-${new Date().toISOString().slice(0,10)}.csv`;
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

  /* ══════════════════════════════
     LIST VIEW
  ══════════════════════════════ */
  if (loading && view === 'list') {
    return <SkeletonPage variant="table" />;
  }

  if (view === 'list') {
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 24px', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

        <PageHeader
          crumbs={['CRM', 'Customers']}
          titlePlain="Customer"
          titleEm="list"
          subtitle={`${customers.length.toLocaleString()} customers registered in this workspace.`}
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={() => exportCSV(filtered)} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font)' }}>
                <Icon name="download" size={14} strokeWidth={2} /> Export CSV
              </button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ fontFamily: 'var(--font)' }}>
                Import
              </button>
              <button type="button" onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--teal)', fontFamily: 'var(--font)' }}>
                <Icon name="plus" size={15} strokeWidth={2.5} color="#fff" /> Add Customer
              </button>
            </div>
          }
        />

        {/* Main card */}
        <div className="crm-card">

          {/* Toolbar */}
          <div className="crm-toolbar">
            {/* Bulk actions */}
            <Select value={bulkAction || '__none__'} onValueChange={v => setBulkAction(v === '__none__' ? '' : v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Bulk Action</SelectItem>
                <SelectItem value="delete">Delete Selected</SelectItem>
                <SelectItem value="export">Export Selected</SelectItem>
                <SelectItem value="active">Mark as Active</SelectItem>
                <SelectItem value="inactive">Mark as Inactive</SelectItem>
                <SelectItem value="suspend">Suspend</SelectItem>
              </SelectContent>
            </Select>
            <button type="button" onClick={handleBulkApply} disabled={!bulkAction || selectedIds.length === 0}
              style={{ padding: 'var(--ds-btn-py-sm) 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: bulkAction && selectedIds.length > 0 ? 'var(--teal)' : 'var(--white)', cursor: bulkAction && selectedIds.length > 0 ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', color: bulkAction && selectedIds.length > 0 ? '#fff' : 'var(--ink3)', transition: 'all .15s', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
              Apply
            </button>
            {selectedIds.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>{selectedIds.length} selected</span>
            )}

            <div style={{ flex: 1 }} />

            {/* Search — always visible */}
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={14} strokeWidth={1.75} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' } as React.CSSProperties} />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search name, email, phone…"
                style={{ padding: '6px 28px 6px 30px', border: '1.5px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', outline: 'none', width: 220, color: 'var(--ink)', background: 'var(--white)' }} />
              {search && (
                <button type="button" onClick={() => { setSearch(''); setPage(1); }}
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
              )}
            </div>

            {/* Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button"
                  style={{ width: 34, height: 34, border: `1.5px solid ${statusFilter !== 'all' ? 'var(--teal)' : 'var(--border)'}`, background: statusFilter !== 'all' ? 'var(--teal-l)' : 'none', borderRadius: 'var(--r)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: statusFilter !== 'all' ? 'var(--teal)' : 'var(--ink3)', position: 'relative' }}>
                  <Icon name="filter" size={15} strokeWidth={1.75} />
                  {statusFilter !== 'all' && <span style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', border: '1.5px solid var(--white)' }} />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <div style={{ padding: '4px 10px 6px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Status</div>
                {[
                  { value: 'all',       label: 'All Statuses' },
                  { value: 'Active',    label: 'Active' },
                  { value: 'Inactive',  label: 'Inactive' },
                  { value: 'Suspended', label: 'Suspended' },
                ].map(opt => (
                  <DropdownMenuItem key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1); }}
                    className={statusFilter === opt.value ? 'bg-accent text-accent-foreground font-semibold' : ''}>
                    {statusFilter === opt.value && <Icon name="check" size={12} strokeWidth={2.5} />}
                    {opt.label}
                  </DropdownMenuItem>
                ))}
                {statusFilter !== 'all' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { setStatusFilter('all'); setPage(1); }} className="text-destructive focus:text-destructive">
                      Clear filter
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Column settings */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Column settings"
                  style={{ width: 34, height: 34, border: '1.5px solid var(--border)', background: 'none', borderRadius: 'var(--r)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}>
                  <Icon name="settings" size={15} strokeWidth={1.75} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div style={{ padding: '4px 10px 6px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Columns</div>
                {([
                  { key: 'email',   label: 'Email' },
                  { key: 'phone',   label: 'Phone' },
                  { key: 'contact', label: 'Contact Person' },
                  { key: 'tin',     label: 'TIN Number' },
                  { key: 'joined',  label: 'Joined' },
                ] as { key: keyof typeof visibleCols; label: string }[]).map(col => (
                  <DropdownMenuCheckboxItem key={col.key} checked={visibleCols[col.key]}
                    onSelect={e => e.preventDefault()}
                    onCheckedChange={() => setVisibleCols(v => ({ ...v, [col.key]: !v[col.key] }))}>
                    {col.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="crm-table">
              <thead>
                <tr>
                  <Th width={40}>
                    <input type="checkbox" className="crm-checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} />
                  </Th>
                  <Th>Customer</Th>
                  {visibleCols.email   && <Th>Email</Th>}
                  {visibleCols.phone   && <Th>Phone</Th>}
                  {visibleCols.contact && <Th>Contact Person</Th>}
                  {visibleCols.tin     && <Th>TIN Number</Th>}
                  {visibleCols.joined  && <Th>Joined</Th>}
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const colCount = 4 + Object.values(visibleCols).filter(Boolean).length;
                  return (<>
                    {loading && <tr><td colSpan={colCount} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading customers…</td></tr>}
                    {!loading && paginated.length === 0 && (
                      <tr><td colSpan={colCount} style={{ padding: '48px 20px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--ink3)' }}>
                          <Icon name="users" size={32} strokeWidth={1.25} />
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink2)' }}>No customers found</div>
                          <div style={{ fontSize: 12.5 }}>Try adjusting your search or add a new customer</div>
                        </div>
                      </td></tr>
                    )}
                    {!loading && paginated.map(c => {
                      const isChecked = selectedIds.includes(c.id);
                      const status = c.account_status || 'Active';
                      return (
                        <tr key={c.id} style={{ background: isChecked ? 'var(--bg)' : 'var(--white)' }}
                          onClick={() => openProfile(c)}>
                          <td style={{ width: 40 }} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" className="crm-checkbox" aria-label={`Select ${c.name}`} checked={isChecked} onChange={() => toggleRow(c.id)} />
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Avatar name={c.name} size={36} />
                              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--navy)' }}>{c.name}</span>
                            </div>
                          </td>
                          {visibleCols.email   && <td style={{ fontSize: 13, color: 'var(--ink2)' }}>{c.email || <span style={{ color: 'var(--ink3)' }}>—</span>}</td>}
                          {visibleCols.phone   && <td style={{ fontSize: 13, color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{c.phone_wa || <span style={{ color: 'var(--ink3)', fontFamily: 'var(--font)' }}>—</span>}</td>}
                          {visibleCols.contact && <td style={{ fontSize: 13, color: 'var(--ink2)' }}>{c.contact_name || <span style={{ color: 'var(--ink3)' }}>—</span>}</td>}
                          {visibleCols.tin     && <td><TinChip tin={c.tax_id} /></td>}
                          {visibleCols.joined  && <td style={{ fontSize: 12.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fmtDate(c.created_at)}</td>}
                          <td><StatusBadge status={status} /></td>
                          <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                            <ActionsMenu
                              onView={() => openProfile(c)}
                              onEdit={() => { openProfile(c); setTimeout(() => setEditMode(true), 0); }}
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
                              }} />
                          </td>
                        </tr>
                      );
                    })}
                  </>);
                })()}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && filtered.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <PagBtn label="Prev" disabled={safePage === 1} onClick={() => setPage(p => p - 1)} />
                {getPageNums(safePage, totalPages).map((p, i) =>
                  p === '…' ? <span key={`e-${i}`} style={{ padding: '0 4px', color: 'var(--ink3)', fontSize: 13 }}>···</span>
                    : <PagBtn key={p} label={String(p)} active={p === safePage} onClick={() => setPage(p as number)} />
                )}
                <PagBtn label="Next" disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink3)' }}>
                <span style={{ fontWeight: 600, letterSpacing: '0.05em' }}>PAGE</span>
                <input type="number" value={safePage} min={1} max={totalPages} onChange={e => { const v = parseInt(e.target.value); if (v >= 1 && v <= totalPages) setPage(v); }} style={{ width: 42, padding: '4px 6px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13, textAlign: 'center', fontFamily: 'var(--font)', color: 'var(--ink)' }} />
                <span>OF {totalPages}</span>
              </div>
            </div>
          )}
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
            <div className="card" style={{ width: '90%', maxWidth: 480, padding: 24, borderRadius: 9, boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>New Customer</h2>
                <button type="button" className="dp-close" onClick={() => setShowCreate(false)}>×</button>
              </div>
              <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Company Name *', key: 'name',           placeholder: 'Acme Imports Ltd',             required: true },
                  { label: 'Email',          key: 'email',          placeholder: 'info@acme.co.tz'               },
                  { label: 'WhatsApp Number',key: 'phone_wa',       placeholder: '+255712345678'                 },
                  { label: 'TIN Number',     key: 'tax_id',         placeholder: '123-456-789'                   },
                  { label: 'Contact Person', key: 'contact_name',   placeholder: 'John Doe'                      },
                  { label: 'Address',        key: 'address',        placeholder: '14 Harbor Road, Dar es Salaam' },
                ].map(({ label, key, placeholder, required }) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>{label}</label>
                    <input type="text" className="input-field" placeholder={placeholder} required={required} value={(createForm as any)[key]} onChange={e => setCreateForm(p => ({ ...p, [key]: e.target.value }))} />
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={createSaving}>{createSaving ? 'Saving…' : 'Create Customer'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ══════════════════════════════
     PROFILE VIEW
  ══════════════════════════════ */
  if (!selected) return null;
  const sel = selected; // capture narrowed type for use inside closures/nested functions
  const shipCount = sel.shipment_count ?? custShipments.length;
  const status = sel.account_status || 'Active';

  const MAIN_TABS = [
    { key: 'overview',   label: 'Overview',      icon: 'grid'       as IconName },
    { key: 'profile',    label: 'Profile',        icon: 'user'       as IconName },
    { key: 'contacts',   label: 'Contacts',       icon: 'users'      as IconName },
    { key: 'finance',    label: 'Finance',        icon: 'barChart'   as IconName },
    { key: 'shipments',  label: 'Shipments',      icon: 'ship'       as IconName },
    { key: 'supply',     label: 'Supply Chain',   icon: 'layers'     as IconName },
    { key: 'seal',       label: 'Bonded Storage', icon: 'package'    as IconName },
    { key: 'documents',  label: 'Documents',      icon: 'folder'     as IconName },
    { key: 'notes',      label: 'Notes',          icon: 'edit'       as IconName },
  ];

  const btnS: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--white)', color: 'var(--ink2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' };

  function renderTabContent() {
    /* ── Overview ── */
    if (mainTab === 'overview') {
      const activeShipmentsCount = custShipments.filter(s => s.stage !== 'CLOSED').length;
      const ovTotalInvoiced = custInvoices.reduce((s: number, i: any) => s + invoiceTotals(mapApiInvoice(i)).grandTotalTZS, 0);
      const ovTotalPaid     = custPayments.reduce((s: number, p: any) => s + (parseFloat(p.amount ?? 0)), 0);
      const ovOutstanding   = ovTotalInvoiced - ovTotalPaid;
      return (
        <div style={{ padding: '24px 28px' }}>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Total Shipments', value: shipCount, icon: 'ship'      as IconName, color: 'var(--blue)', bg: 'var(--blue-l)' },
              { label: 'Active Shipments',value: shipLoading ? '…' : activeShipmentsCount, icon: 'activity' as IconName, color: 'var(--teal)', bg: 'var(--teal-l)' },
              { label: 'Invoices',         value: finLoading ? '…' : custInvoices.length, icon: 'fileText' as IconName, color: 'var(--purple)', bg: 'var(--purple-l)' },
              { label: 'Outstanding (TZS)',value: finLoading ? '…' : ovOutstanding.toLocaleString('en'), icon: 'alertCircle' as IconName, color: 'var(--red)', bg: 'var(--red-l)' },
            ].map(kpi => (
              <div key={kpi.label} className="crm-card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={kpi.icon} size={18} color={kpi.color} strokeWidth={1.75} />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)', lineHeight: 1.1 }}>{kpi.value}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 3 }}>{kpi.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Carbon footprint — summed live from this customer's own shipments
              (co2_emissions_kg / carbon_credits_saved, already returned by the
              shipments fetch above; not a registry-issued tradeable credit). */}
          {(() => {
            const calc = custShipments.filter(s => s.co2_emissions_kg != null);
            const totalCo2 = calc.reduce((s, sh) => s + Number(sh.co2_emissions_kg || 0), 0);
            const totalCredits = calc.reduce((s, sh) => s + Number(sh.carbon_credits_saved || 0), 0);
            return (
              <div className="crm-card" style={{ padding: '16px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="globe" size={18} color="var(--green)" strokeWidth={1.75} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Carbon Footprint</div>
                </div>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>{totalCo2.toLocaleString('en')} kg</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Total CO₂ emissions</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{totalCredits.toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Credits saved (est.)</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{calc.length} / {custShipments.length}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Shipments calculated</div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: 20 }}>
            {/* Recent shipments */}
            <div className="crm-card">
              <div className="crm-card-header">
                <span className="crm-card-title">Recent Shipments</span>
                <button type="button" onClick={() => setMainTab('shipments')} style={{ fontSize: 12, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>View all →</button>
              </div>
              {shipLoading ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Loading…</div>
              ) : custShipments.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)' }}>
                  <Icon name="ship" size={28} strokeWidth={1.25} />
                  <div style={{ fontSize: 13, marginTop: 8 }}>No shipments yet</div>
                </div>
              ) : custShipments.slice(0, 6).map(s => (
                <Link key={s.id} to={`/clearos/clearance/${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="ship" size={14} color="var(--teal)" strokeWidth={1.75} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.ref_number || 'CLR-???'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>{s.goods_desc || 'No description'}</div>
                  </div>
                  <StatusPill stage={s.stage} />
                  <span style={{ fontSize: 11.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{new Date(s.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                </Link>
              ))}
            </div>

            {/* Info card */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="crm-card" style={{ padding: '18px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', marginBottom: 14 }}>Key Information</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Contact Person', value: sel.contact_name },
                    { label: 'Email', value: sel.email },
                    { label: 'Phone / WhatsApp', value: sel.phone_wa },
                    { label: 'TIN Number', value: sel.tax_id, mono: true },
                    { label: 'Preferred Port', value: sel.preferred_port },
                    { label: 'Freight Terms', value: sel.freight_terms },
                    { label: 'Credit Terms', value: sel.credit_days ? `Net ${sel.credit_days} days` : undefined },
                  ].map(({ label, value, mono }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 12, color: 'var(--ink3)', flexShrink: 0 }}>{label}</span>
                      <span style={{ fontSize: 12.5, color: value ? 'var(--ink)' : 'var(--ink3)', fontFamily: mono ? 'var(--mono)' : 'var(--font)', textAlign: 'right', fontStyle: value ? 'normal' : 'italic' }}>{value || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="crm-card" style={{ padding: '18px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', marginBottom: 12 }}>Quick Actions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {([
                    { label: 'Create Invoice',    icon: 'fileText'   as IconName, path: `/billing?customer_id=${sel.id}&new=1` },
                    { label: 'Add Shipment',      icon: 'ship'       as IconName, action: () => setMainTab('shipments') },
                    { label: 'Record Payment',    icon: 'creditCard' as IconName, action: () => { setMainTab('finance'); setFinanceTab('payments'); } },
                    { label: 'Generate Statement',icon: 'barChart'   as IconName, action: () => { setMainTab('finance'); setFinanceTab('statement'); } },
                  ] as { label: string; icon: IconName; path?: string; action?: () => void }[]).map(action => {
                    const itemStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--bg)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left' as const, textDecoration: 'none' };
                    const hoverHandlers = {
                      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'var(--white)'),
                      onMouseLeave: (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'var(--bg)'),
                    };
                    return action.path ? (
                      <Link key={action.label} to={action.path} style={itemStyle} {...hoverHandlers}>
                        <Icon name={action.icon} size={13} color="var(--teal)" strokeWidth={1.75} /> {action.label}
                      </Link>
                    ) : (
                      <button key={action.label} type="button" onClick={action.action} style={itemStyle} {...hoverHandlers}>
                        <Icon name={action.icon} size={13} color="var(--teal)" strokeWidth={1.75} /> {action.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    /* ── Profile ── */
    if (mainTab === 'profile') {
      if (!editMode) {
        return (
          <div style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
              <button type="button" onClick={() => setEditMode(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                <Icon name="edit" size={14} strokeWidth={1.75} /> Edit Profile
              </button>
            </div>

            {/* Company Information */}
            <Section title="Company Information">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px 32px' }}>
                <ViewField label="Company Name" value={sel.name} />
                <ViewField label="Email" value={sel.email} />
                <ViewField label="Phone / WhatsApp" value={sel.phone_wa} />
                <ViewField label="Contact Person" value={sel.contact_name} />
                <ViewField label="Website" value={sel.website} />
                <ViewField label="Client Type" value={sel.client_type} />
                <ViewField label="Currency" value={sel.currency || 'TZS'} />
                <ViewField label="Credit Terms" value={sel.credit_days ? `Net ${sel.credit_days} days` : 'Cash on Delivery'} />
              </div>
            </Section>

            <Section title="Tax & Compliance">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px 32px' }}>
                <ViewField label="TIN Number" value={sel.tax_id} mono />
                <ViewField label="VAT / VRN Number" value={sel.vat_number} mono />
                <ViewField label="Import License No." value={sel.import_license} mono />
              </div>
            </Section>

            <Section title="Address">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px 32px' }}>
                <ViewField label="Street Address" value={sel.address} />
                <ViewField label="City / Town" value={sel.city} />
                <ViewField label="Country" value={sel.country} />
              </div>
            </Section>

            <Section title="Clearing & Forwarding">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px 32px' }}>
                <ViewField label="Preferred Port" value={sel.preferred_port} />
                <ViewField label="Default Freight Terms" value={sel.freight_terms} />
                <ViewField label="Primary Commodity" value={sel.commodity_type} />
                <ViewField label="TANCIS Registration" value={sel.tancis_number} mono />
              </div>
            </Section>
          </div>
        );
      }

      /* Edit mode */
      return (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            <Section title="Company Information">
              <div className="prof-grid">
                <div className="prof-field full"><label className="prof-label">Company Name *</label><input className="prof-input" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required /></div>
                <div className="prof-field"><label className="prof-label">Email</label><input className="prof-input" type="email" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
                <div className="prof-field"><label className="prof-label">Phone / WhatsApp</label><input className="prof-input" value={form.phone_wa || ''} onChange={e => setForm(p => ({ ...p, phone_wa: e.target.value }))} placeholder="+255..." /></div>
                <div className="prof-field"><label className="prof-label">Contact Person</label><input className="prof-input" value={form.contact_name || ''} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} /></div>
                <div className="prof-field"><label className="prof-label">Website</label><input className="prof-input" value={form.website || ''} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} placeholder="https://" /></div>
                <div className="prof-field"><label className="prof-label">Client Type</label>
                  <Select value={form.client_type || '__none__'} onValueChange={v => setForm(p => ({ ...p, client_type: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select type…</SelectItem>
                      <SelectItem value="Importer">Importer</SelectItem>
                      <SelectItem value="Exporter">Exporter</SelectItem>
                      <SelectItem value="Importer & Exporter">Importer & Exporter</SelectItem>
                      <SelectItem value="Manufacturer">Manufacturer</SelectItem>
                      <SelectItem value="Trader">Trader</SelectItem>
                      <SelectItem value="Embassy / NGO">Embassy / NGO</SelectItem>
                      <SelectItem value="Government Agency">Government Agency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="prof-field"><label className="prof-label">Currency</label>
                  <Select value={form.currency || 'TZS'} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TZS">TZS — Tanzanian Shilling</SelectItem>
                      <SelectItem value="USD">USD — US Dollar</SelectItem>
                      <SelectItem value="EUR">EUR — Euro</SelectItem>
                      <SelectItem value="KES">KES — Kenyan Shilling</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="prof-field"><label className="prof-label">Credit Terms</label>
                  <Select value={form.credit_days || '__none__'} onValueChange={v => setForm(p => ({ ...p, credit_days: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select terms…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select terms…</SelectItem>
                      <SelectItem value="0">Cash on Delivery</SelectItem>
                      <SelectItem value="15">Net 15 days</SelectItem>
                      <SelectItem value="30">Net 30 days</SelectItem>
                      <SelectItem value="45">Net 45 days</SelectItem>
                      <SelectItem value="60">Net 60 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Section>

            <Section title="Tax & Compliance">
              <div className="prof-grid">
                <div className="prof-field"><label className="prof-label">TIN Number</label><input className="prof-input" value={form.tax_id || ''} onChange={e => setForm(p => ({ ...p, tax_id: e.target.value }))} placeholder="xxx-xxx-xxx" style={{ fontFamily: 'var(--mono)' }} /></div>
                <div className="prof-field"><label className="prof-label">VAT / VRN Number</label><input className="prof-input" value={form.vat_number || ''} onChange={e => setForm(p => ({ ...p, vat_number: e.target.value }))} placeholder="10-xxxxxxx-x" style={{ fontFamily: 'var(--mono)' }} /></div>
                <div className="prof-field"><label className="prof-label">Import License No.</label><input className="prof-input" value={form.import_license || ''} onChange={e => setForm(p => ({ ...p, import_license: e.target.value }))} placeholder="TBS/IMP/..." /></div>
              </div>
            </Section>

            <Section title="Address">
              <div className="prof-grid">
                <div className="prof-field full"><label className="prof-label">Street Address</label><input className="prof-input" value={form.address || ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
                <div className="prof-field"><label className="prof-label">City / Town</label><input className="prof-input" value={form.city || ''} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="Dar es Salaam" /></div>
                <div className="prof-field"><label className="prof-label">Country</label>
                  <Select value={form.country || 'Tanzania'} onValueChange={v => setForm(p => ({ ...p, country: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Tanzania','Kenya','Uganda','Rwanda','Burundi','Zambia','Malawi','Mozambique','DRC Congo','Ethiopia','Other'].map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Section>

            <Section title="Clearing & Forwarding">
              <div className="prof-grid">
                <div className="prof-field"><label className="prof-label">Preferred Port</label>
                  <Select value={form.preferred_port || '__none__'} onValueChange={v => setForm(p => ({ ...p, preferred_port: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select port…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select port…</SelectItem>
                      <SelectItem value="DSM">Dar es Salaam (DSM)</SelectItem>
                      <SelectItem value="MOM">Mombasa (MOM)</SelectItem>
                      <SelectItem value="TNG">Tanga (TNG)</SelectItem>
                      <SelectItem value="ARU">Arusha Dry Port</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="prof-field"><label className="prof-label">Default Freight Terms</label>
                  <Select value={form.freight_terms || '__none__'} onValueChange={v => setForm(p => ({ ...p, freight_terms: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select terms…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select terms…</SelectItem>
                      <SelectItem value="CIF">CIF — Cost, Insurance, Freight</SelectItem>
                      <SelectItem value="FOB">FOB — Free on Board</SelectItem>
                      <SelectItem value="EXW">EXW — Ex Works</SelectItem>
                      <SelectItem value="DDP">DDP — Delivered Duty Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="prof-field"><label className="prof-label">Primary Commodity</label>
                  <Select value={form.commodity_type || '__none__'} onValueChange={v => setForm(p => ({ ...p, commodity_type: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select category…</SelectItem>
                      {['General Merchandise','Food & Agriculture','Electronics & ICT','Machinery & Equipment','Chemicals & Pharmaceuticals','Motor Vehicles & Parts','Construction Materials'].map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="prof-field"><label className="prof-label">TANCIS Registration</label><input className="prof-input" value={form.tancis_number || ''} onChange={e => setForm(p => ({ ...p, tancis_number: e.target.value }))} placeholder="TANCIS importer code…" style={{ fontFamily: 'var(--mono)' }} /></div>
              </div>
            </Section>
          </div>
          <div style={{ padding: '12px 28px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, background: 'var(--white)', flexShrink: 0 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setForm({ ...selected }); setEditMode(false); }}>Discard Changes</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      );
    }

    /* ── Contacts ── */
    if (mainTab === 'contacts') {
      return (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Contact Persons</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAddContact(true)}>+ Add Contact</button>
          </div>

          {sel.contact_name ? (
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
                <Avatar name={sel.contact_name} size={44} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>{sel.contact_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Primary Contact</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                    {sel.email && (
                      <a href={`mailto:${sel.email}`} style={{ fontSize: 12.5, color: 'var(--teal)', textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                        {sel.email}
                      </a>
                    )}
                    {sel.phone_wa && (
                      <a href={`https://wa.me/${sel.phone_wa.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 12.5, color: 'var(--ink2)', fontFamily: 'var(--mono)', textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--teal)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink2)')}>
                        {sel.phone_wa}
                      </a>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="badge badge-teal" style={{ fontSize: 9.5 }}>PRIMARY</span>
                  <button type="button" aria-label="Edit contact"
                    onClick={() => { setContactForm({ name: sel.contact_name || '', email: sel.email || '', phone: sel.phone_wa || '', role: 'Primary Contact' }); setShowAddContact(true); }}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 10px', cursor: 'pointer', fontSize: 12, color: 'var(--ink2)', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState icon="users" title="No contacts added" sub="Add contact persons for this customer" />
          )}

          {/* Add / Edit Contact modal */}
          {showAddContact && (
            <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowAddContact(false); setContactForm({ name: '', email: '', phone: '', role: '' }); } }}>
              <div className="card" style={{ width: '90%', maxWidth: 440, padding: 24, borderRadius: 9, boxShadow: 'var(--shadow-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>{contactForm.name ? 'Edit Contact' : 'Add Contact Person'}</h2>
                  <button type="button" className="dp-close" aria-label="Close" onClick={() => { setShowAddContact(false); setContactForm({ name: '', email: '', phone: '', role: '' }); }}>×</button>
                </div>
                <form onSubmit={handleAddContact} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Full Name *',    key: 'name',  placeholder: 'John Doe',            required: true  },
                    { label: 'Email',          key: 'email', placeholder: 'john@company.co.tz',  required: false },
                    { label: 'Phone / WhatsApp', key: 'phone', placeholder: '+255712345678',     required: false },
                    { label: 'Role / Title',   key: 'role',  placeholder: 'Procurement Manager', required: false },
                  ].map(({ label, key, placeholder, required }) => (
                    <div key={key}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>{label}</label>
                      <input type="text" className="input-field" placeholder={placeholder} required={required}
                        value={(contactForm as any)[key]}
                        onChange={e => setContactForm(p => ({ ...p, [key]: e.target.value }))} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowAddContact(false); setContactForm({ name: '', email: '', phone: '', role: '' }); }}>Cancel</button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={contactSaving}>{contactSaving ? 'Saving…' : 'Save Contact'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ── Notes ── */
    if (mainTab === 'notes') {
      return (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Internal Notes</span>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Only visible to your team</span>
          </div>
          <textarea className="prof-input" style={{ height: 220, resize: 'vertical', width: '100%', boxSizing: 'border-box', lineHeight: 1.7 }} placeholder={`Add internal notes about ${sel.name} — payment behavior, preferences, special instructions…`} value={notes} onChange={e => setNotes(e.target.value)} />
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{notes.length} characters</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveNote} disabled={noteSaving}>
              {noteSaving ? 'Saving…' : 'Save Notes'}
            </button>
          </div>
        </div>
      );
    }

    /* ── Finance ── */
    if (mainTab === 'finance') {
      const FIN_TABS = [
        { key: 'invoices',     label: 'Invoices'     },
        { key: 'payments',     label: 'Payments'     },
        { key: 'statement',    label: 'Statement'    },
        { key: 'proposals',    label: 'Proposals'    },
        { key: 'credit-notes', label: 'Credit Notes' },
        { key: 'expenses',     label: 'Expenses'     },
      ];

      const custExpenses = expenses.filter(e => e.customer_id === sel.id);

      const totalInvoiced = custInvoices.reduce((s: number, i: any) => s + invoiceTotals(mapApiInvoice(i)).grandTotalTZS, 0);
      const totalPaid     = custPayments.reduce((s: number, p: any) => s + (parseFloat(p.amount ?? 0)), 0);
      const outstanding   = totalInvoiced - totalPaid;

      const INV_STATUS: Record<string, { bg: string; color: string }> = {
        paid:     { bg: 'var(--green-l)', color: 'var(--green)' },
        unpaid:   { bg: 'var(--gold-l)',        color: 'var(--gold)'       },
        overdue:  { bg: 'var(--red-l)',   color: 'var(--red)'    },
        draft:    { bg: 'var(--bg)',      color: 'var(--ink3)'   },
        partial:  { bg: 'var(--purple-l)',        color: '#7c3aed'       },
      };

      return (
        <div>
          <SubTabBar tabs={FIN_TABS} active={financeTab} onChange={setFinanceTab} />

          {/* Invoices */}
          {financeTab === 'invoices' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
                  {finLoading ? 'Loading…' : `${custInvoices.length} invoice${custInvoices.length !== 1 ? 's' : ''}`}
                </span>
                <Link to={`/billing?customer_id=${sel.id}&new=1`} className="btn btn-primary btn-sm">+ Create Invoice</Link>
              </div>
              {finLoading && <div style={{ padding: '32px 28px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading invoices…</div>}
              {!finLoading && custInvoices.length === 0 && (
                <div style={{ padding: '32px 28px' }}>
                  <EmptyState icon="fileText" title="No invoices yet" sub="Invoices issued to this customer will appear here" />
                </div>
              )}
              {!finLoading && custInvoices.length > 0 && (
                <div className="rtbl-wrap">
                  <table className="rtbl" style={{ minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th className="col-hide-sm">Date</th>
                        <th className="col-hide-sm">Due</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {custInvoices.map((inv: any) => {
                        const st = (inv.status || 'draft').toLowerCase();
                        const sc = INV_STATUS[st] || INV_STATUS.draft;
                        return (
                          <tr key={inv.id}>
                            <td>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', fontFamily: 'var(--mono)' }}>{inv.invoice_number || inv.ref || `INV-${inv.id?.slice(-5)}`}</div>
                              {inv.description && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>{inv.description}</div>}
                            </td>
                            <td className="col-hide-sm">{inv.bill_date ? new Date(inv.bill_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td className="col-hide-sm">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)', textAlign: 'right' }}>{invoiceTotals(mapApiInvoice(inv)).grandTotalTZS.toLocaleString()}</td>
                            <td style={{ textAlign: 'center' }}><span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>{st.charAt(0).toUpperCase() + st.slice(1)}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Payments */}
          {financeTab === 'payments' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
                  {finLoading ? 'Loading…' : `${custPayments.length} payment${custPayments.length !== 1 ? 's' : ''}`}
                </span>
                <Link to={`/billing?customer_id=${sel.id}`} className="btn btn-primary btn-sm">+ Record Payment</Link>
              </div>
              {finLoading && <div style={{ padding: '32px 28px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading payments…</div>}
              {!finLoading && custPayments.length === 0 && (
                <div style={{ padding: '32px 28px' }}>
                  <EmptyState icon="creditCard" title="No payments recorded" sub="Payments received from this customer will appear here" />
                </div>
              )}
              {!finLoading && custPayments.length > 0 && (
                <div className="rtbl-wrap">
                  <table className="rtbl" style={{ minWidth: 520 }}>
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th className="col-hide-sm">Date</th>
                        <th className="col-hide-sm">Method</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {custPayments.map((p: any) => (
                        <tr key={p.id}>
                          <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{p.invoice_number || `PAY-${p.id?.slice(-5)}`}</td>
                          <td className="col-hide-sm">{p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                          <td className="col-hide-sm">{p.payment_method || p.method || '—'}</td>
                          <td style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)', textAlign: 'right' }}>+{Number(p.amount ?? 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Statement */}
          {financeTab === 'statement' && (
            <div style={{ padding: '24px 28px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
                {[
                  { label: 'Total Invoiced', value: totalInvoiced, color: 'var(--navy)' },
                  { label: 'Total Paid',     value: totalPaid,     color: 'var(--green)' },
                  { label: 'Outstanding',    value: outstanding,   color: outstanding > 0 ? 'var(--red)' : 'var(--green)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '18px 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'var(--mono)' }}>{s.value.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>TZS</div>
                  </div>
                ))}
              </div>
              {custInvoices.length === 0 && custPayments.length === 0 ? (
                <EmptyState icon="barChart" title="No financial activity" sub="Invoices and payments will build your statement" />
              ) : (
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Transaction History</div>
                  {[
                    ...custInvoices.map((i: any) => ({ type: 'invoice', date: i.bill_date, ref: i.invoice_number || `INV-${i.id?.slice(-5)}`, amount: invoiceTotals(mapApiInvoice(i)).grandTotalTZS, debit: true })),
                    ...custPayments.map((p: any) => ({ type: 'payment', date: p.payment_date, ref: p.invoice_number || `PAY-${p.id?.slice(-5)}`, amount: parseFloat(p.amount ?? 0), debit: false })),
                  ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).map((tx, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', gap: 14 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: tx.debit ? 'var(--red-l)' : 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={tx.debit ? 'fileText' : 'creditCard'} size={14} color={tx.debit ? 'var(--red)' : 'var(--green)'} strokeWidth={1.75} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{tx.ref}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1, textTransform: 'capitalize' }}>{tx.type}</div>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{tx.date ? new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: tx.debit ? 'var(--red)' : 'var(--green)' }}>{tx.debit ? '-' : '+'}{tx.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Expenses */}
          {financeTab === 'expenses' && (
            custExpenses.length > 0 ? (
              <div>
                <div style={{ display: 'flex', padding: '12px 28px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)' }}>
                  <div style={{ flex: 2 }}>Description</div>
                  <div style={{ flex: 1 }}>Date</div>
                  <div style={{ flex: 1 }}>Category</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>Amount (TZS)</div>
                </div>
                {custExpenses.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{e.name}</div>
                    </div>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--ink2)' }}>{e.date.split('T')[0]}</div>
                    <div style={{ flex: 1 }}><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink3)' }}>{e.category}</span></div>
                    <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: e.is_revenue ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>{e.is_revenue ? '+' : '-'}{(e.amount || 0).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '32px 28px' }}><EmptyState icon="receipt" title="No expenses" sub="Expenses linked to this customer will appear here" /></div>
            )
          )}

          {/* Proposals & Credit Notes — placeholder */}
          {(financeTab === 'proposals' || financeTab === 'credit-notes') && (
            <div style={{ padding: '32px 28px' }}>
              <EmptyState
                icon={financeTab === 'proposals' ? 'clipboard' : 'arrowLeft'}
                title={financeTab === 'proposals' ? 'No proposals' : 'No credit notes'}
                sub={financeTab === 'proposals' ? 'Quotations sent as proposals will appear here' : 'Issued credit notes will appear here'}
              />
            </div>
          )}
        </div>
      );
    }

    /* ── Shipments ── */
    if (mainTab === 'shipments') {
      const SHIP_TABS = [
        { key: 'shipments',    label: 'Shipments & B/L' },
        { key: 'declarations', label: 'Declarations'    },
        { key: 'containers',   label: 'Containers'      },
        { key: 'demurrage',    label: 'Demurrage'       },
        { key: 'permits',      label: 'Permits'         },
      ];

      if (shipTab === 'shipments') {
        return (
          <div>
            <SubTabBar tabs={SHIP_TABS} active={shipTab} onChange={setShipTab} />
            <div style={{ padding: '0 0 20px' }}>
              {shipLoading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Loading shipments…</div>}
              {!shipLoading && custShipments.length === 0 && <div style={{ padding: '24px 28px' }}><EmptyState icon="ship" title="No shipments recorded" sub="Shipments assigned to this customer will appear here" /></div>}
              {!shipLoading && custShipments.map(s => (
                <div key={s.id} className="cust-ship-row">
                  <span className="csr-ref">{s.ref_number || 'CLR-???'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="csr-desc">{s.goods_desc || 'No description'}</div>
                    {s.bl_number && <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontFamily: 'var(--mono)', marginTop: 1 }}>B/L: {s.bl_number}</div>}
                  </div>
                  <StatusPill stage={s.stage} />
                  <span className="csr-date">{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      if (shipTab === 'declarations') {
        const withDecl = custShipments.filter(s => s.tansad_number);
        return (
          <div>
            <SubTabBar tabs={SHIP_TABS} active={shipTab} onChange={setShipTab} />
            <div style={{ padding: '20px 28px' }}>
              {shipLoading && <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Loading…</div>}
              {!shipLoading && withDecl.length === 0 && <EmptyState icon="stamp" title="No declarations yet" sub="TANSAD / entry numbers will appear once registered" />}
              {!shipLoading && withDecl.map(s => (
                <div key={s.id} className="decl-block">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>{s.tansad_number}</span>
                    <StatusPill stage={s.stage} />
                  </div>
                  <div className="decl-grid">
                    <div className="decl-kv"><span className="decl-k">Reference</span><span className="decl-v">{s.ref_number}</span></div>
                    <div className="decl-kv"><span className="decl-k">Goods</span><span className="decl-v">{s.goods_desc || '—'}</span></div>
                    <div className="decl-kv"><span className="decl-k">B/L Number</span><span className="decl-v mono">{s.bl_number || '—'}</span></div>
                    <div className="decl-kv"><span className="decl-k">Date</span><span className="decl-v">{fmtDateShort(s.created_at)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      const shipMeta: Record<string, { icon: IconName; text: string; sub: string }> = {
        containers: { icon: 'package', text: 'No containers', sub: 'Container tracking records will appear here' },
        demurrage:  { icon: 'timer',   text: 'No demurrage charges', sub: 'Container free-day tracking will appear here' },
        permits:    { icon: 'award',   text: 'No permits', sub: 'Import/export permit records' },
      };
      const sm = shipMeta[shipTab] || shipMeta.containers;
      return (
        <div>
          <SubTabBar tabs={SHIP_TABS} active={shipTab} onChange={setShipTab} />
          <div style={{ padding: '32px 28px' }}><EmptyState icon={sm.icon} title={sm.text} sub={sm.sub} /></div>
        </div>
      );
    }

    /* ── Supply Chain ── */
    if (mainTab === 'supply') {
      const SUPPLY_TABS = [
        { key: 'projects', label: 'Projects' },
        { key: 'tasks',    label: 'Tasks'    },
        { key: 'tickets',  label: 'Tickets'  },
      ];

      const TICKET_STATUS: Record<string, { bg: string; color: string }> = {
        open:        { bg: 'var(--blue-l)', color: '#2563eb' },
        in_progress: { bg: '#ccfbf1', color: '#0d9488' },
        resolved:    { bg: 'var(--green-l)', color: 'var(--green)' },
        closed:      { bg: 'var(--bg)', color: 'var(--ink3)' },
        escalated:   { bg: 'var(--red-l)', color: 'var(--red)' },
      };

      return (
        <div>
          <SubTabBar tabs={SUPPLY_TABS} active={supplyTab} onChange={setSupplyTab} />

          {/* Tickets — loaded from API */}
          {supplyTab === 'tickets' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
                  {supplyLoading ? 'Loading…' : `${custTickets.length} ticket${custTickets.length !== 1 ? 's' : ''}`}
                </span>
                <Link to="/support/tickets" className="btn btn-primary btn-sm">+ New Ticket</Link>
              </div>
              {supplyLoading && <div style={{ padding: '32px 28px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading tickets…</div>}
              {!supplyLoading && custTickets.length === 0 && (
                <div style={{ padding: '32px 28px' }}>
                  <EmptyState icon="headphones" title="No support tickets" sub="Support tickets from this customer will appear here" />
                </div>
              )}
              {!supplyLoading && custTickets.length > 0 && custTickets.map((t: any) => {
                const st = (t.status || 'open').toLowerCase().replace(' ', '_');
                const sc = TICKET_STATUS[st] || TICKET_STATUS.open;
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="headphones" size={14} color="#2563eb" strokeWidth={1.75} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject || t.title || `Ticket #${t.id?.slice(-5)}`}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>{t.category || 'General'} · {t.created_at ? new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
                    </div>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                      {(t.status || 'Open').replace('_', ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Projects & Tasks — placeholder */}
          {(supplyTab === 'projects' || supplyTab === 'tasks') && (
            <div style={{ padding: '32px 28px' }}>
              <EmptyState
                icon={supplyTab === 'projects' ? 'layers' : 'check'}
                title={supplyTab === 'projects' ? 'No projects' : 'No tasks'}
                sub={supplyTab === 'projects' ? 'Supply chain projects for this client' : 'Open tasks assigned to this account'}
              />
            </div>
          )}
        </div>
      );
    }

    /* ── Bonded Storage (SEAL cross-app link) ── */
    if (mainTab === 'seal') {
      const SEAL_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
        FOREIGN_DUTY_SUSPENDED: { bg: 'var(--teal-l)', color: 'var(--teal)' },
        FOREIGN_DUTY_PAID: { bg: 'var(--blue-l)', color: 'var(--blue)' },
        EXPORTED: { bg: 'var(--green-l)', color: 'var(--green)' },
        SEIZED: { bg: 'var(--red-l)', color: 'var(--red)' },
        ABANDONED: { bg: 'var(--red-l)', color: 'var(--red)' },
      };
      const totalAtRisk = custSealLots.reduce((s: number, l: any) => s + (l.dutyAtRisk || 0) + (l.taxAtRisk || 0), 0);
      return (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Bonded Warehouse Lots (SEAL)</span>
            <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
              {sealLoading ? 'Loading…' : `${custSealLots.length} lot${custSealLots.length !== 1 ? 's' : ''} · ${totalAtRisk.toLocaleString()} at risk`}
            </span>
          </div>
          {sealLoading ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
          ) : custSealLots.length === 0 ? (
            <EmptyState icon="package" title="No bonded lots" sub="Lots this customer owns in SEAL's bonded warehouse ledger will appear here" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {custSealLots.map((l: any) => {
                const style = SEAL_STATUS_COLOR[l.customsStatus] || { bg: 'var(--bg)', color: 'var(--ink2)' };
                return (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{l.description}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                        {l.qtyOnHand.toLocaleString()} {l.uom}{l.entryReference ? ` · ${l.entryReference}` : ''}
                        {l.expiresOn ? ` · storage expires ${fmtDateShort(l.expiresOn)}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {(l.dutyAtRisk > 0 || l.taxAtRisk > 0) && (
                        <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{(l.dutyAtRisk + l.taxAtRisk).toLocaleString()} {l.currency ?? ''} at risk</span>
                      )}
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: style.bg, color: style.color, whiteSpace: 'nowrap' }}>
                        {l.customsStatus.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    /* ── Documents ── */
    if (mainTab === 'documents') {
      return (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Documents</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1.5px solid var(--teal)', borderRadius: 9, background: 'var(--teal)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
              <Icon name="upload" size={13} strokeWidth={2} />
              Upload File
              <input type="file" multiple style={{ display: 'none' }}
                onChange={async e => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  const fd = new FormData();
                  files.forEach(f => fd.append('files', f));
                  try {
                    await apiFetch(`/v1/customers/${sel.id}/documents`, { method: 'POST', body: fd });
                    showAlert(`${files.length} file(s) uploaded`);
                    loadDocuments(sel.id);
                  } catch (err: any) { showAlert(err.message || 'Upload failed'); }
                  e.target.value = '';
                }} />
            </label>
          </div>

          {/* Drop zone */}
          <div
            style={{ border: '2px dashed var(--border)', borderRadius: 9, padding: '40px 24px', textAlign: 'center', color: 'var(--ink3)', marginBottom: 18, background: 'var(--bg)' }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.background = 'var(--teal-l)'; }}
            onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg)'; }}
            onDrop={async e => {
              e.preventDefault();
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.background = 'var(--bg)';
              const files = Array.from(e.dataTransfer.files);
              if (!files.length) return;
              const fd = new FormData();
              files.forEach(f => fd.append('files', f));
              try {
                await apiFetch(`/v1/customers/${sel.id}/documents`, { method: 'POST', body: fd });
                showAlert(`${files.length} file(s) uploaded`);
                loadDocuments(sel.id);
              } catch (err: any) { showAlert(err.message || 'Upload failed'); }
            }}>
            <Icon name="upload" size={28} strokeWidth={1.25} />
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 10 }}>Drop files here to upload</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>PDF, DOCX, XLSX, images — any file type accepted</div>
          </div>

          {docsLoading && <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading documents…</div>}
          {!docsLoading && custDocuments.length === 0 && (
            <EmptyState icon="folder" title="No documents yet" sub="Uploaded documents for this customer will appear here" />
          )}
          {!docsLoading && custDocuments.length > 0 && (
            <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {custDocuments.map((d: any, i: number) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < custDocuments.length - 1 ? '1px solid var(--bg)' : 'none' }}>
                  <Icon name="fileText" size={18} color="var(--ink3)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                      {(d.size / 1024).toFixed(1)} KB · {new Date(d.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <button type="button" onClick={() => apiDownload(`/v1/customers/${sel.id}/documents/${d.id}/download`, d.filename).catch((err: any) => showAlert(err.message || 'Download failed'))}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 8px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    <Icon name="download" size={13} /> Download
                  </button>
                  <button type="button" onClick={async () => {
                    if (!(await showConfirm(`Delete "${d.filename}"?`, { confirmLabel: 'Delete' }))) return;
                    try {
                      await apiFetch(`/v1/customers/${sel.id}/documents/${d.id}`, { method: 'DELETE' });
                      setCustDocuments(prev => prev.filter(x => x.id !== d.id));
                    } catch (err: any) { showAlert(err.message || 'Delete failed'); }
                  }} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--red, #dc2626)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 8px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Hero header ── */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ padding: '20px 28px 0' }}>

          {/* Back link */}
          <button type="button" onClick={() => setView('list')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink3)', fontFamily: 'var(--font)', fontWeight: 600, marginBottom: 16, padding: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--teal)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink3)')}>
            <Icon name="chevronDown" size={13} color="var(--ink3)" style={{ transform: 'rotate(90deg)' }} /> Back to Customers
          </button>

          {/* Main hero row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
            <Avatar name={sel.name} size={72} />

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', margin: 0, letterSpacing: '-0.3px' }}>{sel.name}</h1>
                <StatusBadge status={status} />
                {sel.client_type && (
                  <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'var(--bg)', color: 'var(--ink2)', border: '1px solid var(--border)' }}>{sel.client_type}</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 16 }}>
                Member since {new Date(sel.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                {(sel.city || sel.country) && ` · ${[sel.city, sel.country].filter(Boolean).join(', ')}`}
                {sel.email && ` · ${sel.email}`}
              </div>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 28, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                <HeroStat label="Shipments" value={shipCount || 0} />
                <div style={{ width: 1, background: 'var(--border)' }} />
                <HeroStat label="Preferred Port" value={sel.preferred_port || '—'} />
                <div style={{ width: 1, background: 'var(--border)' }} />
                <HeroStat label="Freight Terms" value={sel.freight_terms || '—'} />
                <div style={{ width: 1, background: 'var(--border)' }} />
                <HeroStat label="Credit Terms" value={sel.credit_days ? `Net ${sel.credit_days}d` : 'COD'} />
                <div style={{ width: 1, background: 'var(--border)' }} />
                <HeroStat label="TIN" value={maskTin(sel.tax_id) || '—'} />
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button" style={btnS}
                onClick={() => sel.email && window.open(`mailto:${sel.email}`, '_blank')}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--white)')}>
                <Icon name="mail" size={13} strokeWidth={1.75} /> Email
              </button>
              <button type="button" style={btnS}
                onClick={() => { const p = sel.phone_wa?.replace(/\D/g, ''); if (p) window.open(`https://wa.me/${p}`, '_blank'); }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--white)')}>
                <Icon name="send" size={13} strokeWidth={1.75} /> WhatsApp
              </button>
              <Link to={`/shipments?customer_id=${sel.id}`}
                style={{ ...btnS, background: 'var(--teal)', border: 'none', color: '#fff', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                + New Shipment
              </Link>
            </div>
          </div>
        </div>

        {/* Horizontal tabs */}
        <div style={{ display: 'flex', padding: '0 28px', gap: 0, overflowX: 'auto' }}>
          {MAIN_TABS.map(tab => {
            const active = mainTab === tab.key;
            return (
              <button key={tab.key} type="button" onClick={() => { setMainTab(tab.key); setEditMode(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py-lg) 16px', border: 'none', borderBottom: active ? '2px solid var(--teal)' : '2px solid transparent', background: 'none', color: active ? 'var(--teal)' : 'var(--ink3)', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap', marginBottom: -1, minHeight: 'var(--ctl-h-lg)', boxSizing: 'border-box', lineHeight: 1.25}}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--ink)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--ink3)'; }}>
                <Icon name={tab.icon} size={13} color={active ? 'var(--teal)' : 'var(--ink3)'} strokeWidth={1.75} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: 'auto', background: mainTab === 'overview' ? 'var(--bg)' : 'var(--bg)' }}>
        {renderTabContent()}
      </div>
    </div>
  );
};

/* ── Section card wrapper ── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink3)', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>{title}</div>
      {children}
    </div>
  );
}

/* ── Sub-tab bar ── */
function SubTabBar({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '12px 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)' }}>
      {tabs.map(t => (
        <button key={t.key} type="button" onClick={() => onChange(t.key)}
          style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', border: active === t.key ? '1.5px solid var(--teal)' : '1px solid var(--border)', background: active === t.key ? 'var(--teal-l)' : 'var(--bg)', color: active === t.key ? 'var(--teal)' : 'var(--ink2)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── Empty state ── */
function EmptyState({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '48px 20px', color: 'var(--ink3)' }}>
      <div style={{ width: 56, height: 56, borderRadius: 9, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Icon name={icon} size={24} strokeWidth={1.25} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink2)' }}>{title}</div>
      <div style={{ fontSize: 12.5 }}>{sub}</div>
    </div>
  );
}

/* ── Pagination button ── */
function PagBtn({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      style={{ minWidth: 32, height: 32, padding: '0 8px', border: active ? 'none' : '1.5px solid var(--border)', borderRadius: 'var(--r)', background: active ? 'var(--navy)' : disabled ? 'var(--bg)' : '#fff', color: active ? '#fff' : disabled ? 'var(--ink3)' : 'var(--ink)', fontSize: 13, fontWeight: active ? 700 : 500, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)' }}>
      {label}
    </button>
  );
}
