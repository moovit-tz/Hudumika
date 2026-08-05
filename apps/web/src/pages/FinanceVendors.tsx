import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow, spark } from '../components/MetricCard.js';
import { apiFetch } from '../lib/api.js';
import {
  Vendor, VendorCategory, VendorStatus, PaymentTerms,
  VENDOR_CATEGORY_LABEL, PAYMENT_TERMS_LABEL, VENDOR_STATUS_COLOR,
} from '../data/vendorData.js';
import type { ExpenseListItem } from './Expenses.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showConfirm } from '../lib/confirm.js';

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
  DRAFT:   { bg: '#f1f5f9', color: '#64748b' },
  POSTED:  { bg: '#dbeafe', color: '#1d4ed8' },
  PARTIAL: { bg: '#fef3c7', color: '#b45309' },
  PAID:    { bg: '#ecfdf5', color: '#065f46' },
  OVERDUE: { bg: '#fee2e2', color: '#dc2626' },
  VOID:    { bg: '#f1f5f9', color: '#64748b' },
};

/* ── Detail Panel ───────────────────────────────────────────────────────────── */
const PO_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  DRAFT:     { bg: '#f1f5f9', color: '#64748b' },
  SENT:      { bg: '#dbeafe', color: '#1d4ed8' },
  PARTIAL:   { bg: '#fef3c7', color: '#b45309' },
  RECEIVED:  { bg: '#ecfdf5', color: '#065f46' },
  CANCELLED: { bg: '#fee2e2', color: '#dc2626' },
};

function VendorDetail({ vendor, bills, expenses, purchaseOrders, onClose, onEdit, isMobile }: {
  vendor: Vendor; bills: any[]; expenses: ExpenseListItem[]; purchaseOrders: any[];
  onClose: () => void; onEdit: (v: Vendor) => void; isMobile?: boolean;
}) {
  const { fmt } = useCurrency();
  const sc = VENDOR_STATUS_COLOR[vendor.status];
  const vendorBills = bills.filter(b => b.supplier_id === vendor.id);
  const vendorExpenses = expenses.filter(e => e.supplier_id === vendor.id);
  const vendorPOs = purchaseOrders.filter(po => po.supplier_id === vendor.id);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--white)', borderLeft: '1px solid var(--border)',
      ...(isMobile ? { position: 'fixed', inset: 0, zIndex: 300 } : { width: 360, flexShrink: 0 }),
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vendor.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, fontWeight: 700, ...sc }}>{vendor.status.toUpperCase()}</span>
            <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{VENDOR_CATEGORY_LABEL[vendor.category]}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={() => onEdit(vendor)} title="Edit vendor"
            style={{ width: 30, height: 30, borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="edit" size={14} color="var(--ink2)" />
          </button>
          <button type="button" onClick={onClose} title="Close"
            style={{ width: 30, height: 30, borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={14} color="var(--ink2)" />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {/* Balance summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Outstanding', value: fmt(vendor.balance), color: vendor.balance > 0 ? '#dc2626' : '#059669' },
            { label: 'Total Paid', value: fmt(vendor.totalPaid), color: 'var(--ink)' },
          ].map(c => (
            <div key={c.label} style={{ padding: '14px 16px', background: 'var(--bg)', borderRadius: 9, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: c.color, fontFamily: 'var(--mono)' }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Payment terms */}
        <div style={{ padding: '10px 14px', background: 'var(--teal-l)', borderRadius: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="clock" size={14} color="var(--teal)" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>Payment Terms: {PAYMENT_TERMS_LABEL[vendor.paymentTerms]}</span>
        </div>

        {/* Contact info */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Contact Details</div>
          {[
            { icon: 'user'    as const, label: 'Contact Person', value: vendor.contactPerson || '—' },
            { icon: 'mail'    as const, label: 'Email',          value: vendor.email || '—' },
            { icon: 'phone'   as const, label: 'Phone',          value: vendor.phone || '—' },
            { icon: 'mapPin'  as const, label: 'Address',        value: [vendor.address, vendor.city, vendor.country].filter(Boolean).join(', ') || '—' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <Icon name={r.icon} size={14} color="var(--ink3)" style={{ marginTop: 1, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, color: 'var(--ink3)', marginBottom: 2 }}>{r.label}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-word' }}>{r.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tax & Bank */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Tax & Banking</div>
          {[
            { label: 'Tax ID / TIN', value: vendor.taxId || '—' },
            { label: 'Bank', value: vendor.bankName || '—' },
            { label: 'Account No.', value: vendor.bankAccount || '—' },
            { label: 'Currency', value: vendor.currency },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <span style={{ color: 'var(--ink3)' }}>{r.label}</span>
              <span style={{ fontWeight: 600, color: 'var(--ink)', fontFamily: r.label === 'Account No.' ? 'var(--mono)' : undefined }}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* Bills */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Bills ({vendorBills.length})
          </div>
          {vendorBills.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic', padding: '10px 0' }}>No bills recorded for this supplier yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {vendorBills.map((b) => {
                const bc = BILL_STATUS_COLOR[b.status] || BILL_STATUS_COLOR.DRAFT;
                return (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg)', borderRadius: 7 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{b.bill_number}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{b.bill_date ? String(b.bill_date).slice(0, 10) : '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{fmt(Number(b.total) || 0, b.currency)}</div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 5, ...bc }}>{b.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Purchase Orders */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Purchase Orders ({vendorPOs.length})
          </div>
          {vendorPOs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic', padding: '10px 0' }}>No purchase orders placed with this supplier yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {vendorPOs.map((po) => {
                const pc = PO_STATUS_COLOR[po.status] || PO_STATUS_COLOR.DRAFT;
                return (
                  <div key={po.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg)', borderRadius: 7 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{po.po_number}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{po.order_date ? String(po.order_date).slice(0, 10) : '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{fmt(Number(po.total) || 0, po.currency)}</div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 5, ...pc }}>{po.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Expenses */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Expenses ({vendorExpenses.length})
          </div>
          {vendorExpenses.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic', padding: '10px 0' }}>No expenses logged for this supplier yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {vendorExpenses.map((e) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg)', borderRadius: 7 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{e.date.split('T')[0]}</div>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: e.is_revenue ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                    {e.is_revenue ? '+' : '-'}{fmt(e.amount, 'TZS')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {vendor.notes && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Notes</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6, background: 'var(--bg)', padding: '10px 12px', borderRadius: 8 }}>{vendor.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const inp: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const sel: React.CSSProperties = { ...inp, cursor: 'pointer' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', maxWidth: 560, background: 'var(--white)', borderRadius: 12, boxShadow: '0 24px 64px rgba(0,0,0,.20)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--navy)' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{vendor ? 'Edit Vendor' : 'New Vendor'}</span>
          <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 'var(--r)', cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={14} color="#fff" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose}
            style={{ padding: 'var(--ds-btn-py) 18px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !form.name.trim()}
            style={{ padding: 'var(--ds-btn-py) 20px', border: 'none', borderRadius: 'var(--r)', background: !form.name.trim() ? 'var(--border)' : 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: form.name.trim() ? 'pointer' : 'default', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 7, minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}>
            <Icon name="check" size={14} color="#fff" /> {vendor ? 'Save Changes' : 'Add Vendor'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */
export function FinanceVendors() {
  const { fmt } = useCurrency();
  const isMobile = useIsMobile();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<ExpenseListItem[]>([]);

  useEffect(() => {
    apiFetch('/v1/finance/expenses').then((res: any) => setExpenses(res?.data ?? [])).catch(() => {});
  }, []);

  const [search, setSearch]           = useState('');
  const [filterCat, setFilterCat]     = useState<VendorCategory | ''>('');
  const [filterStatus, setFilterStatus] = useState<VendorStatus | ''>('');
  const [selected, setSelected]       = useState<Vendor | null>(null);
  const [showForm, setShowForm]       = useState(false);
  const [editVendor, setEditVendor]   = useState<Vendor | null>(null);

  function loadVendors() {
    Promise.all([
      apiFetch('/v1/suppliers').catch(() => []),
      apiFetch('/v1/bills').catch(() => []),
      apiFetch('/v1/purchase-orders').catch(() => ({ purchase_orders: [] })),
    ]).then(([suppliers, fetchedBills, posRes]: [any[], any[], any]) => {
      const billList = Array.isArray(fetchedBills) ? fetchedBills : [];
      setBills(billList);
      setPurchaseOrders(Array.isArray(posRes?.purchase_orders) ? posRes.purchase_orders : []);
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

  useEffect(() => { loadVendors(); }, []);

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

  const stats = useMemo(() => ({
    total:       vendors.length,
    active:      vendors.filter(v => v.status === 'active').length,
    outstanding: vendors.reduce((s, v) => s + v.balance, 0),
    totalPaid:   vendors.reduce((s, v) => s + v.totalPaid, 0),
  }), [vendors]);

  async function handleSave(v: Vendor) {
    const payload = {
      name: v.name, contact_name: v.contactPerson, email: v.email, phone: v.phone,
      address: v.address, city: v.city, country: v.country, tax_id: v.taxId,
      category: v.category, currency: v.currency, payment_terms: v.paymentTerms, status: v.status,
      bank_name: v.bankName, bank_account: v.bankAccount, notes: v.notes,
    };
    if (v.id) await apiFetch(`/v1/suppliers/${v.id}`, { method: 'PATCH', body: JSON.stringify(payload) }).catch(() => {});
    else await apiFetch('/v1/suppliers', { method: 'POST', body: JSON.stringify(payload) }).catch(() => {});
    setShowForm(false);
    setEditVendor(null);
    loadVendors();
  }

  async function handleDelete(id: string) {
    if (!(await showConfirm('Delete this vendor? This cannot be undone.', { confirmLabel: 'Delete' }))) return;
    apiFetch(`/v1/suppliers/${id}`, { method: 'DELETE' })
      .then(() => { setVendors(prev => prev.filter(v => v.id !== id)); if (selected?.id === id) setSelected(null); })
      .catch(() => {});
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--white)' }}>
      <PageHeader
        crumbs={['Finance', 'Vendors']}
        titlePlain="Vendor"
        titleEm="directory"
        subtitle="Manage supplier relationships, payment terms and outstanding balances."
      />
      <MetricsRow cards={[
        {
          title: 'Total Vendors',
          value: String(stats.total),
          trend: 5.2,
          sub1Label: 'ACTIVE', sub1Value: String(stats.active),
          sub2Label: 'INACTIVE', sub2Value: String(stats.total - stats.active),
          bars: spark(80, 12, 'up'), barColor: 'var(--teal-l)', barHighlight: 'var(--teal)',
        },
        {
          title: 'Outstanding Balance',
          value: fmt(stats.outstanding),
          trend: -3.8,
          invertTrend: true,
          sub1Label: 'PAYABLE', sub1Value: fmt(Math.round(stats.outstanding * 0.6)),
          sub2Label: 'OVERDUE', sub2Value: fmt(Math.round(stats.outstanding * 0.4)),
          bars: spark(81, 12, 'down'), barColor: 'var(--red-l)', barHighlight: 'var(--red)',
        },
        {
          title: 'Total Paid',
          value: fmt(stats.totalPaid),
          trend: 12.1,
          sub1Label: 'LIFETIME', sub1Value: fmt(stats.totalPaid),
          sub2Label: 'THIS MONTH', sub2Value: fmt(Math.round(stats.totalPaid * 0.07)),
          bars: spark(82, 12, 'up'), barColor: 'var(--green-l)', barHighlight: 'var(--green)',
        },
        {
          title: 'Active Rate',
          value: `${stats.total ? Math.round((stats.active / stats.total) * 100) : 0}%`,
          trend: 2.5,
          sub1Label: 'ACTIVE', sub1Value: String(stats.active),
          sub2Label: 'TOTAL', sub2Value: String(stats.total),
          bars: spark(83, 12, 'up'), barColor: 'var(--blue-l)', barHighlight: 'var(--blue)',
        },
      ]} />

      {/* Toolbar */}
      <div style={{ padding: '16px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search vendors…"
            style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <Select value={filterCat || '__all__'} onValueChange={v => setFilterCat(v === '__all__' ? '' : v as VendorCategory)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{VENDOR_CATEGORY_LABEL[c]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus || '__all__'} onValueChange={v => setFilterStatus(v === '__all__' ? '' : v as VendorStatus)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
        <button type="button"
          onClick={() => { setEditVendor(null); setShowForm(true); }}
          style={{ padding: 'var(--ds-btn-py) 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}>
          <Icon name="plus" size={14} color="#fff" /> New Vendor
        </button>
      </div>

      {/* Split body */}
      <div style={{ display: 'flex', margin: '0 20px 20px' }}>
        {/* Table */}
        <div style={{ flex: 1, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'auto', minWidth: 0 }}>
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
                const isActive = selected?.id === v.id;
                return (
                  <tr key={v.id}
                    onClick={() => setSelected(isActive ? null : v)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isActive ? 'var(--teal-l)' : undefined, transition: 'background .1s' }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isActive ? 'var(--teal-l)' : ''; }}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{v.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{v.id}</div>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{VENDOR_CATEGORY_LABEL[v.category]}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{v.contactPerson || '—'}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 12 }}>{v.phone || '—'}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: v.balance > 0 ? '#dc2626' : 'var(--ink3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmt(v.balance)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, fontWeight: 700, ...sc }}>{v.status.toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>
                      <button type="button" title="Edit" onClick={e => { e.stopPropagation(); setEditVendor(v); setShowForm(true); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)', borderRadius: 'var(--r)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <Icon name="edit" size={14} />
                      </button>
                      <button type="button" title="Delete" onClick={e => { e.stopPropagation(); handleDelete(v.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)', borderRadius: 'var(--r)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#dc2626')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink3)')}>
                        <Icon name="trash2" size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selected && (
          <VendorDetail
            vendor={selected}
            bills={bills}
            expenses={expenses}
            purchaseOrders={purchaseOrders}
            onClose={() => setSelected(null)}
            onEdit={v => { setEditVendor(v); setShowForm(true); }}
            isMobile={isMobile}
          />
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <VendorForm
          vendor={editVendor}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditVendor(null); }}
        />
      )}
    </div>
  );
}
