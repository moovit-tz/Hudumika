import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { FormPage } from '../components/FormPage.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { apiFetch } from '../lib/api.js';
import {
  Vendor, VendorCategory, VendorStatus, PaymentTerms,
  VENDOR_CATEGORY_LABEL, PAYMENT_TERMS_LABEL, VENDOR_STATUS_COLOR,
} from '../data/vendorData.js';
import type { ExpenseListItem } from './Expenses.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Button } from '../components/ui/button.js';
import { SearchToolbar, SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { showConfirm } from '../lib/confirm.js';
import { showAlert } from '../lib/alert.js';
import { SectionCard } from '../components/SectionCard.js';
import { Tip } from '../components/ui/tooltip.js';

function mapApiSupplier(s: any, balancesById: Map<string, { balance: number; totalPaid: number }>): Vendor {
  const b = balancesById.get(s.id);
  return {
    id: s.id, name: s.name || '', contactPerson: s.contact_name || '', email: s.email || '', phone: s.phone || '',
    address: s.address || '', city: s.city || '', country: s.country || 'Tanzania', taxId: s.tax_id || '',
    category: (s.category || 'other') as VendorCategory, currency: s.currency || 'TZS',
    paymentTerms: (s.payment_terms || 'net_30') as PaymentTerms, status: (s.status || 'active') as VendorStatus,
    balance: b?.balance ?? 0, totalPaid: b?.totalPaid ?? 0,
    bankName: s.bank_name || '', bankAccount: s.bank_account || '',
    createdAt: s.created_at ? String(s.created_at).slice(0, 10) : '', notes: s.notes || '',
  };
}

const CATEGORIES: VendorCategory[] = ['port_services', 'customs', 'freight', 'warehouse', 'transport', 'consulting', 'utility', 'other'];
const STATUSES: VendorStatus[] = ['active', 'inactive', 'blocked'];
const TERMS: PaymentTerms[] = ['cod', 'net_15', 'net_30', 'net_60', 'net_90', 'prepaid'];

const EMPTY_VENDOR: Vendor = {
  id: '', name: '', contactPerson: '', email: '', phone: '',
  address: '', city: '', country: 'Tanzania', taxId: '',
  category: 'other', currency: 'TZS', paymentTerms: 'net_30',
  status: 'active', balance: 0, totalPaid: 0,
  bankName: '', bankAccount: '', createdAt: '', notes: '',
};

const BILL_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  DRAFT:   { bg: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
  POSTED:  { bg: 'var(--blue-l)', color: 'var(--blue)' },
  PARTIAL: { bg: 'var(--gold-l)', color: 'var(--gold)' },
  PAID:    { bg: 'var(--green-l)', color: 'var(--green)' },
  OVERDUE: { bg: 'var(--red-l)', color: 'var(--red)' },
  VOID:    { bg: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
};



/* ── Add / Edit Modal ───────────────────────────────────────────────────────── */
function VendorForm({ vendor, onSave, onClose }: {
  vendor: Vendor | null; onSave: (v: Vendor) => void | Promise<void>; onClose: () => void;
}) {
  const [form, setForm] = useState<Vendor>(vendor ?? { ...EMPTY_VENDOR });
  const [saving, setSaving] = useState(false);

  function set(k: keyof Vendor, v: string | number) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
    </div>
  );
  const inp: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const sel: React.CSSProperties = { ...inp, cursor: 'pointer' };

  return (
    <FormPage
      title={vendor ? `Edit ${vendor.name}` : 'New Vendor'}
      subtitle="Contact, payment terms and tax details for a supplier you buy from."
      onCancel={onClose}
      actions={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary" data-ui-native-button="">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving || !form.name.trim()} className="btn btn-primary" data-ui-native-button="">
            <Icon name="check" size={14} color="#fff" /> {saving ? 'Saving…' : vendor ? 'Save Changes' : 'Add Vendor'}
          </button>
        </>
      }
    >
      <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <F label="Vendor Name *">
              <input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Tanzania Ports Authority" />
            </F>
          </div>
          <F label="Category *">
            <Select value={form.category} onValueChange={v => set('category', v as VendorCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{VENDOR_CATEGORY_LABEL[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Status">
            <Select value={form.status} onValueChange={v => set('status', v as VendorStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Contact Person">
            <input style={inp} value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} placeholder="Full name" />
          </F>
          <F label="Email">
            <input style={inp} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="billing@vendor.com" />
          </F>
          <F label="Phone">
            <input style={inp} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+255 700 000 000" />
          </F>
          <F label="Payment Terms *">
            <Select value={form.paymentTerms} onValueChange={v => set('paymentTerms', v as PaymentTerms)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TERMS.map(t => <SelectItem key={t} value={t}>{PAYMENT_TERMS_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Address">
            <input style={inp} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street address" />
          </F>
          <F label="City">
            <input style={inp} value={form.city} onChange={e => set('city', e.target.value)} placeholder="Dar es Salaam" />
          </F>
          <F label="Country">
            <input style={inp} value={form.country} onChange={e => set('country', e.target.value)} placeholder="Tanzania" />
          </F>
          <F label="Tax ID / TIN">
            <input style={inp} value={form.taxId} onChange={e => set('taxId', e.target.value)} placeholder="TIN-300000000" />
          </F>
          <F label="Currency">
            <Select value={form.currency} onValueChange={v => set('currency', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['TZS', 'USD', 'EUR', 'KES', 'GBP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Bank Name">
            <input style={inp} value={form.bankName} onChange={e => set('bankName', e.target.value)} placeholder="CRDB Bank" />
          </F>
          <F label="Account Number">
            <input style={inp} value={form.bankAccount} onChange={e => set('bankAccount', e.target.value)} placeholder="0150xxxxxxxxx" />
          </F>
          <div style={{ gridColumn: '1 / -1' }}>
            <F label="Notes">
              <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' } as React.CSSProperties} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional notes…" />
            </F>
          </div>
        </div>

    </FormPage>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */
export function FinanceVendors() {
  const navigate = useNavigate();
  const { fmt } = useCurrency();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const deepLinkId = searchParams.get('id');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [billPayments, setBillPayments] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<ExpenseListItem[]>([]);

  useEffect(() => {
    apiFetch('/v1/finance/expenses').then((res: any) => setExpenses(res?.data ?? [])).catch(() => { /* expenses are supplementary vendor context; don't interrupt the page */ });
  }, []);

  const [search, setSearch]           = useState('');
  const [filterCat, setFilterCat]     = useState<VendorCategory | ''>('');
  const [filterStatus, setFilterStatus] = useState<VendorStatus | ''>('');
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = (filterCat ? 1 : 0) + (filterStatus ? 1 : 0);
  const [showForm, setShowForm]       = useState(false);
  const [editVendor, setEditVendor]   = useState<Vendor | null>(null);
  const [vStats, setVStats] = useState<{ total: number; active: number; activeRate: number } | null>(null);
  const fetchStats = useCallback(() => { apiFetch('/v1/suppliers/stats').then(setVStats).catch(() => {}); }, []);

  function loadVendors() {
    Promise.all([
      apiFetch('/v1/suppliers').catch((err: unknown) => { showAlert(err instanceof Error ? err.message : 'Could not load vendors.'); return []; }),
      apiFetch('/v1/bills').catch(() => []),
      apiFetch('/v1/purchase-orders').catch(() => ({ purchase_orders: [] })),
      apiFetch('/v1/bills/payments').catch(() => []),
    ]).then(([suppliers, fetchedBills, posRes, payments]: [any[], any[], any, any[]]) => {
      const billList = Array.isArray(fetchedBills) ? fetchedBills : [];
      setBills(billList);
      setPurchaseOrders(Array.isArray(posRes?.purchase_orders) ? posRes.purchase_orders : []);
      setBillPayments(Array.isArray(payments) ? payments : []);
      const balancesById = new Map<string, { balance: number; totalPaid: number }>();
      for (const b of billList) {
        if (!b.supplier_id) continue;
        const prev = balancesById.get(b.supplier_id) ?? { balance: 0, totalPaid: 0 };
        const total = Number(b.total) || 0;
        const paid = Number(b.paid_amount) || 0;
        balancesById.set(b.supplier_id, {
          balance: prev.balance + Math.max(0, total - paid),
          totalPaid: prev.totalPaid + paid,
        });
      }
      if (Array.isArray(suppliers)) setVendors(suppliers.map((s) => mapApiSupplier(s, balancesById)));
    });
  }

  useEffect(() => { loadVendors(); fetchStats(); }, [fetchStats]);

  // Deep-link redirect to vendor's dedicated profile page
  useEffect(() => {
    if (deepLinkId) {
      navigate(`/finance/vendors/${deepLinkId}`, { replace: true });
    }
  }, [deepLinkId, navigate]);

  /* fin:new-doc listener */
  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.section === 'vendors') { setEditVendor(null); setShowForm(true); }
    }
    window.addEventListener('fin:new-doc', handler);
    return () => window.removeEventListener('fin:new-doc', handler);
  }, []);

  const filtered = useMemo(() => vendors.filter(v => {
    if (filterCat && v.category !== filterCat) return false;
    if (filterStatus && v.status !== filterStatus) return false;
    const q = search.toLowerCase();
    return !q || v.name.toLowerCase().includes(q) || v.contactPerson.toLowerCase().includes(q) || v.email.toLowerCase().includes(q);
  }), [vendors, search, filterCat, filterStatus]);

  const stats = useMemo(() => {
    const now = new Date();
    // Overdue = actually past its due_date and still carrying a balance —
    // same rule Bills.tsx's own isOverdue() uses — not a guessed share of
    // the total. "Payable" is simply what's left of outstanding once the
    // real overdue portion is subtracted, so the two always sum to the
    // real total rather than two independently-guessed percentages.
    const overdue = bills.reduce((s, b) => {
      const balance = Math.max(0, (Number(b.total) || 0) - (Number(b.paid_amount) || 0));
      const isOverdue = balance > 0 && (b.status === 'POSTED' || b.status === 'PARTIAL') && b.due_date && new Date(b.due_date) < now;
      return s + (isOverdue ? balance : 0);
    }, 0);
    const paidThisMonth = billPayments.reduce((s, p) => {
      // Raw API field is payment_date (Bills.tsx's mapApiPayment renames it
      // to `date` for its own state — this reads the unmapped response).
      const d = p.payment_date ? new Date(p.payment_date) : null;
      const inThisMonth = d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      return s + (inThisMonth ? (Number(p.amount) || 0) : 0);
    }, 0);
    const outstanding = vendors.reduce((s, v) => s + v.balance, 0);
    return {
      total:       vendors.length,
      active:      vendors.filter(v => v.status === 'active').length,
      outstanding,
      totalPaid:   vendors.reduce((s, v) => s + v.totalPaid, 0),
      overdue,
      payable:     Math.max(0, outstanding - overdue),
      paidThisMonth,
    };
  }, [vendors, bills, billPayments]);

  async function handleSave(v: Vendor) {
    const payload = {
      name: v.name, contact_name: v.contactPerson, email: v.email, phone: v.phone,
      address: v.address, city: v.city, country: v.country, tax_id: v.taxId,
      category: v.category, currency: v.currency, payment_terms: v.paymentTerms, status: v.status,
      bank_name: v.bankName, bank_account: v.bankAccount, notes: v.notes,
    };
    try {
      if (v.id) await apiFetch(`/v1/suppliers/${v.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await apiFetch('/v1/suppliers', { method: 'POST', body: JSON.stringify(payload) });
      setShowForm(false);
      setEditVendor(null);
      await loadVendors();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not save this vendor.');
    }
  }

  async function handleDelete(id: string) {
    if (!(await showConfirm('Delete this vendor? This cannot be undone.', { confirmLabel: 'Delete' }))) return;
    apiFetch(`/v1/suppliers/${id}`, { method: 'DELETE' })
      .then(() => { setVendors(prev => prev.filter(v => v.id !== id)); })
      .catch((err: unknown) => showAlert(err instanceof Error ? err.message : 'Could not delete this vendor.'));
  }

  // The create/edit form replaces the list rather than layering over it, the
  // same way Quotations already worked. A vendor record is ~14 fields; in a
  // modal that scrolls inside a box inside the scrolling page behind it.
  if (showForm) {
    return (
      <VendorForm
        vendor={editVendor}
        onSave={handleSave}
        onClose={() => { setShowForm(false); setEditVendor(null); }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        crumbs={['Finance', 'Vendors']}
        titlePlain="Vendor"
        titleEm="directory"
        subtitle="Manage supplier relationships, payment terms and outstanding balances."
        actions={
          <Button onClick={() => { setEditVendor(null); setShowForm(true); }}>
            <Icon name="plus" size={14} /> New Vendor
          </Button>
        }
      />
      <MetricsRow cards={[
        {
          title: 'Total Vendors',
          value: String(vStats?.total ?? stats.total), loading: !vStats,
          sub1Label: 'ACTIVE', sub1Value: String(vStats?.active ?? stats.active),
          sub2Label: 'INACTIVE', sub2Value: String((vStats?.total ?? stats.total) - (vStats?.active ?? stats.active)), barHighlight: 'var(--teal)',
        },
        {
          title: 'Outstanding Balance',
          value: fmt(stats.outstanding),
          invertTrend: true,
          sub1Label: 'PAYABLE', sub1Value: fmt(stats.payable),
          sub2Label: 'OVERDUE', sub2Value: fmt(stats.overdue), barHighlight: 'var(--red)',
        },
        {
          title: 'Total Paid',
          value: fmt(stats.totalPaid),
          sub1Label: 'LIFETIME', sub1Value: fmt(stats.totalPaid),
          sub2Label: 'THIS MONTH', sub2Value: fmt(stats.paidThisMonth), barHighlight: 'var(--green)',
        },
        {
          title: 'Active Rate',
          value: `${vStats?.activeRate ?? (stats.total ? Math.round((stats.active / stats.total) * 100) : 0)}%`, loading: !vStats,
          sub1Label: 'ACTIVE', sub1Value: String(vStats?.active ?? stats.active),
          sub2Label: 'TOTAL', sub2Value: String(vStats?.total ?? stats.total), barHighlight: 'var(--blue)',
        },
      ]} />

      {/* Search + filter toolbar */}
      <div style={{ padding: '16px 0 8px' }}>
        <SearchToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search vendors…"
          activeFilterCount={activeFilterCount}
          onFiltersClick={() => setShowFilters(f => !f)}
          filtersOpen={showFilters}
        />
        {showFilters && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 0 4px' }}>
            <SingleSelectFilter
              label="Category"
              options={CATEGORIES.map(c => ({ value: c, label: VENDOR_CATEGORY_LABEL[c] }))}
              value={filterCat || null}
              onChange={v => setFilterCat((v as VendorCategory) || '')}
              allLabel="All Categories"
            />
            <SingleSelectFilter
              label="Status"
              options={STATUSES.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
              value={filterStatus || null}
              onChange={v => setFilterStatus((v as VendorStatus) || '')}
              allLabel="All Statuses"
            />
          </div>
        )}
      </div>

      {/* Vendors Table */}
      <div style={{ margin: '0 0 20px' }}>
        <SectionCard padded={false}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                {['Vendor', 'Category', 'Contact', 'Phone', 'Outstanding', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink3)', fontSize: 13 }}>No vendors found</td></tr>
              )}
              {filtered.map(v => {
                const sc = VENDOR_STATUS_COLOR[v.status];
                return (
                  <tr key={v.id}
                    onClick={() => navigate(`/finance/vendors/${v.id}`)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{v.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2, fontFamily: 'var(--font)' }}>{v.id}</div>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{VENDOR_CATEGORY_LABEL[v.category]}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{v.contactPerson || '—'}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)', whiteSpace: 'nowrap', fontFamily: 'var(--font)', fontSize: 12 }}>{v.phone || '—'}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: v.balance > 0 ? 'var(--red)' : 'var(--ink3)', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>{fmt(v.balance)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--r-sm)', fontWeight: 700, ...sc }}>{v.status.toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '12px 10px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <Tip label="View Profile"><button type="button" aria-label={`View ${v.name} profile`} onClick={e => { e.stopPropagation(); navigate(`/finance/vendors/${v.id}`); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--teal)', borderRadius: 'var(--r)', marginRight: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--teal-l)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')} data-ui-native-button="">
                        <Icon name="externalLink" size={14} />
                      </button></Tip>
                      <Tip label="Edit"><button type="button" aria-label={`Edit ${v.name}`} onClick={e => { e.stopPropagation(); setEditVendor(v); setShowForm(true); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)', borderRadius: 'var(--r)', marginRight: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')} data-ui-native-button="">
                        <Icon name="edit" size={14} />
                      </button></Tip>
                      <Tip label="Delete"><button type="button" aria-label={`Delete ${v.name}`} onClick={e => { e.stopPropagation(); handleDelete(v.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)', borderRadius: 'var(--r)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink3)')} data-ui-native-button="">
                        <Icon name="trash2" size={14} />
                      </button></Tip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>
      </div>

      {/* Form modal */}
    </div>
  );
}
