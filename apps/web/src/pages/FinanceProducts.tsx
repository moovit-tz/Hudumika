import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow, spark } from '../components/MetricCard.js';
import {
  useProducts, addProduct, updateProduct, deleteProduct,
  Product, ProductType, ProductStatus,
  PRODUCT_UNITS, PRODUCT_CATEGORIES, PRODUCT_TYPE_COLOR, TAX_RATES,
} from '../data/productData.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

function newId() { return 'PRD-' + Date.now().toString(36).toUpperCase(); }
function autoCode(name: string) { return 'SVC-' + name.trim().toUpperCase().replace(/\s+/g, '-').slice(0, 8); }

const EMPTY_PRODUCT: Product = {
  id: '', code: '', name: '', type: 'service', description: '',
  category: 'Clearance Services', unit: 'shipment',
  salePrice: 0, purchasePrice: 0, currency: 'TZS',
  taxRate: 18, status: 'active', createdAt: '',
};

/* ── Detail Panel ───────────────────────────────────────────────────────────── */
function ProductDetail({ product, onClose, onEdit, isMobile }: {
  product: Product; onClose: () => void; onEdit: (p: Product) => void; isMobile?: boolean;
}) {
  const { fmt } = useCurrency();
  const tc = PRODUCT_TYPE_COLOR[product.type];
  const margin = product.purchasePrice > 0
    ? Math.round(((product.salePrice - product.purchasePrice) / product.salePrice) * 100)
    : null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--white)', borderLeft: '1px solid var(--border)',
      ...(isMobile ? { position: 'fixed', inset: 0, zIndex: 300 } : { width: 340, flexShrink: 0 }),
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, fontWeight: 700, ...tc }}>
              {product.type === 'service' ? 'SERVICE' : 'PRODUCT'}
            </span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, fontWeight: 700, background: product.status === 'active' ? '#ecfdf5' : '#f1f5f9', color: product.status === 'active' ? '#065f46' : '#64748b' }}>
              {product.status.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', lineHeight: 1.3 }}>{product.name}</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3, fontFamily: 'var(--mono)' }}>{product.code}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button type="button" onClick={() => onEdit(product)} title="Edit"
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="edit" size={14} color="var(--ink2)" />
          </button>
          <button type="button" onClick={onClose} title="Close"
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={14} color="var(--ink2)" />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {/* Pricing cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
          <div style={{ padding: '13px 14px', background: 'var(--teal-l)', borderRadius: 9, border: '1px solid var(--teal-m)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Sale Price</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--teal)', fontFamily: 'var(--mono)' }}>{fmt(product.salePrice)}</div>
            <div style={{ fontSize: 10, color: 'var(--teal)', marginTop: 3 }}>per {product.unit}</div>
          </div>
          <div style={{ padding: '13px 14px', background: 'var(--bg)', borderRadius: 9, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Purchase Price</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{fmt(product.purchasePrice)}</div>
            <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 3 }}>per {product.unit}</div>
          </div>
        </div>

        {/* Margin & Tax row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          <div style={{ padding: '10px 12px', background: margin !== null && margin > 0 ? '#ecfdf5' : 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Margin</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: margin !== null && margin > 0 ? '#059669' : 'var(--ink3)' }}>{margin !== null ? `${margin}%` : '—'}</div>
          </div>
          <div style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>VAT Rate</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{product.taxRate}%</div>
          </div>
        </div>

        {/* Info */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Details</div>
          {[
            { label: 'Category', value: product.category },
            { label: 'Unit',     value: product.unit },
            { label: 'Currency', value: product.currency },
            { label: 'Code',     value: product.code, mono: true },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
              <span style={{ color: 'var(--ink3)' }}>{r.label}</span>
              <span style={{ fontWeight: 600, color: 'var(--ink)', fontFamily: r.mono ? 'var(--mono)' : undefined }}>{r.value}</span>
            </div>
          ))}
        </div>

        {product.description && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Description</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6, background: 'var(--bg)', padding: '10px 12px', borderRadius: 8 }}>{product.description}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Add / Edit Modal ───────────────────────────────────────────────────────── */
function ProductForm({ product, onSave, onClose }: {
  product: Product | null; onSave: (p: Product) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<Product>(product ?? { ...EMPTY_PRODUCT });
  const [saving, setSaving] = useState(false);

  function set(k: keyof Product, v: string | number) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    const now = new Date().toISOString().split('T')[0];
    const code = form.code.trim() || autoCode(form.name);
    const saved: Product = { ...form, code, id: form.id || newId(), createdAt: form.createdAt || now };
    onSave(saved);
    setSaving(false);
  }

  const F = ({ label, children, col2 }: { label: string; children: React.ReactNode; col2?: boolean }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: col2 ? '1 / -1' : undefined }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
    </div>
  );
  const inp: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const sel: React.CSSProperties = { ...inp, cursor: 'pointer' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', maxWidth: 540, background: 'var(--white)', borderRadius: 12, boxShadow: '0 24px 64px rgba(0,0,0,.20)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--navy)' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{product ? 'Edit Item' : 'New Product / Service'}</span>
          <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 8, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={14} color="#fff" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <F label="Name *" col2>
            <input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Standard Customs Clearance" />
          </F>
          <F label="Type *">
            <Select value={form.type} onValueChange={v => set('type', v as ProductType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="product">Product</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Status">
            <Select value={form.status} onValueChange={v => set('status', v as ProductStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Code">
            <input style={inp} value={form.code} onChange={e => set('code', e.target.value)} placeholder="Auto-generated if blank" />
          </F>
          <F label="Category *">
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRODUCT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Unit *">
            <Select value={form.unit} onValueChange={v => set('unit', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRODUCT_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Currency">
            <Select value={form.currency} onValueChange={v => set('currency', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['TZS', 'USD', 'EUR', 'KES'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Sale Price (TZS) *">
            <input style={inp} type="number" min={0} value={form.salePrice} onChange={e => set('salePrice', +e.target.value)} />
          </F>
          <F label="Purchase / Cost Price">
            <input style={inp} type="number" min={0} value={form.purchasePrice} onChange={e => set('purchasePrice', +e.target.value)} />
          </F>
          <F label="VAT Rate (%)">
            <Select value={String(form.taxRate)} onValueChange={v => set('taxRate', +v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TAX_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%{r === 18 ? ' (Standard)' : ' (Exempt)'}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Description" col2>
            <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' } as React.CSSProperties}
              value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description…" />
          </F>
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose}
            style={{ padding: '9px 18px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--white)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !form.name.trim()}
            style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: !form.name.trim() ? 'var(--border)' : 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: form.name.trim() ? 'pointer' : 'default', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="check" size={14} color="#fff" /> {product ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */
export function FinanceProducts() {
  const { fmt } = useCurrency();
  const isMobile = useIsMobile();
  const products = useProducts();

  const [search, setSearch]             = useState('');
  const [filterType, setFilterType]     = useState<ProductType | ''>('');
  const [filterCat, setFilterCat]       = useState('');
  const [filterStatus, setFilterStatus] = useState<'active' | 'inactive' | ''>('');
  const [selected, setSelected]         = useState<Product | null>(null);
  const [showForm, setShowForm]         = useState(false);
  const [editProduct, setEditProduct]   = useState<Product | null>(null);

  /* fin:new-doc listener */
  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.section === 'products') { setEditProduct(null); setShowForm(true); }
    }
    window.addEventListener('fin:new-doc', handler);
    return () => window.removeEventListener('fin:new-doc', handler);
  }, []);

  const filtered = useMemo(() => products.filter(p => {
    if (filterType && p.type !== filterType) return false;
    if (filterCat && p.category !== filterCat) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
  }), [products, search, filterType, filterCat, filterStatus]);

  const stats = useMemo(() => ({
    total:    products.length,
    services: products.filter(p => p.type === 'service').length,
    prods:    products.filter(p => p.type === 'product').length,
    active:   products.filter(p => p.status === 'active').length,
  }), [products]);

  function handleSave(p: Product) {
    if (products.find(x => x.id === p.id)) updateProduct(p);
    else addProduct(p);
    setShowForm(false);
    setEditProduct(null);
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this item? This cannot be undone.')) return;
    deleteProduct(id);
    if (selected?.id === id) setSelected(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--white)' }}>
      <PageHeader
        crumbs={['Finance', 'Products & Services']}
        titlePlain="Products &"
        titleEm="services"
        subtitle="Define the items and services your business buys and sells."
      />
      <MetricsRow cards={[
        {
          title: 'Total Items',
          value: String(stats.total),
          trend: 8.3,
          sub1Label: 'SERVICES', sub1Value: String(stats.services),
          sub2Label: 'PRODUCTS', sub2Value: String(stats.prods),
          bars: spark(90, 12, 'up'), barColor: 'var(--teal-l)', barHighlight: 'var(--teal)',
        },
        {
          title: 'Active Items',
          value: String(stats.active),
          trend: 5.1,
          sub1Label: 'RATE', sub1Value: `${stats.total ? Math.round((stats.active / stats.total) * 100) : 0}%`,
          sub2Label: 'INACTIVE', sub2Value: String(stats.total - stats.active),
          bars: spark(91, 12, 'up'), barColor: 'var(--green-l)', barHighlight: 'var(--green)',
        },
        {
          title: 'Services',
          value: String(stats.services),
          trend: 4.7,
          sub1Label: 'SHARE', sub1Value: `${stats.total ? Math.round((stats.services / stats.total) * 100) : 0}%`,
          sub2Label: 'PRODUCTS', sub2Value: String(stats.prods),
          bars: spark(92, 12, 'up'), barColor: 'var(--purple-l)', barHighlight: 'var(--purple)',
        },
        {
          title: 'Avg Sale Price',
          value: fmt(products.length ? Math.round(products.reduce((s, p) => s + p.salePrice, 0) / products.length) : 0),
          trend: 1.5,
          sub1Label: 'MAX PRICE', sub1Value: fmt(products.length ? Math.max(...products.map(p => p.salePrice)) : 0),
          sub2Label: 'MIN PRICE', sub2Value: fmt(products.length ? Math.min(...products.map(p => p.salePrice)) : 0),
          bars: spark(93, 12, 'flat'), barColor: 'var(--gold-l)', barHighlight: 'var(--gold)',
        },
      ]} />

      {/* Toolbar */}
      <div style={{ padding: '16px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search products & services…"
            style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <Select value={filterType || '__all__'} onValueChange={v => setFilterType(v === '__all__' ? '' : v as ProductType)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Types</SelectItem>
            <SelectItem value="service">Service</SelectItem>
            <SelectItem value="product">Product</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCat || '__all__'} onValueChange={v => setFilterCat(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Categories</SelectItem>
            {PRODUCT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus || '__all__'} onValueChange={v => setFilterStatus(v === '__all__' ? '' : v as 'active' | 'inactive')}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <button type="button"
          onClick={() => { setEditProduct(null); setShowForm(true); }}
          style={{ padding: '8px 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
          <Icon name="plus" size={14} color="#fff" /> New Item
        </button>
      </div>

      {/* Split body */}
      <div style={{ display: 'flex', margin: '0 20px 20px' }}>
        {/* Table */}
        <div style={{ flex: 1, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'auto', minWidth: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                {['Code', 'Name', 'Type', 'Category', 'Unit', 'Sale Price', 'VAT', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink3)', fontSize: 13 }}>No items found</td></tr>
              )}
              {filtered.map(p => {
                const tc = PRODUCT_TYPE_COLOR[p.type];
                const isActive = selected?.id === p.id;
                return (
                  <tr key={p.id}
                    onClick={() => setSelected(isActive ? null : p)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isActive ? 'var(--teal-l)' : undefined, transition: 'background .1s' }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isActive ? 'var(--teal-l)' : ''; }}
                  >
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{p.code}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--ink)', maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, fontWeight: 700, ...tc }}>{p.type === 'service' ? 'SERVICE' : 'PRODUCT'}</span>
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{p.category}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{p.unit}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmt(p.salePrice)}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{p.taxRate}%</td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, fontWeight: 700, background: p.status === 'active' ? '#ecfdf5' : '#f1f5f9', color: p.status === 'active' ? '#065f46' : '#64748b' }}>
                        {p.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '11px 10px', whiteSpace: 'nowrap' }}>
                      <button type="button" title="Edit" onClick={e => { e.stopPropagation(); setEditProduct(p); setShowForm(true); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)', borderRadius: 6 }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <Icon name="edit" size={14} />
                      </button>
                      <button type="button" title="Delete" onClick={e => { e.stopPropagation(); handleDelete(p.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)', borderRadius: 6 }}
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
          <ProductDetail
            product={selected}
            onClose={() => setSelected(null)}
            onEdit={p => { setEditProduct(p); setShowForm(true); }}
            isMobile={isMobile}
          />
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <ProductForm
          product={editProduct}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditProduct(null); }}
        />
      )}
    </div>
  );
}
