import React, { useState, useEffect, useMemo } from 'react';
import { FormPage } from '../components/FormPage.js';
import { Icon } from '../components/Icon.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import {
  useProducts, addProduct, updateProduct, deleteProduct,
  Product, ProductType, ProductStatus,
  PRODUCT_UNITS, PRODUCT_CATEGORIES, PRODUCT_TYPE_COLOR,
} from '../data/productData.js';
import { useTaxCodes, defaultTaxCode, TAX_CODE_KIND_HINT } from '../data/taxCodeData.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showConfirm } from '../lib/confirm.js';

function newId() { return 'PRD-' + Date.now().toString(36).toUpperCase(); }

/** Same page size the rest of the platform uses (landed-cost history, Bliss
 *  notifications), so a page of rows is a page of rows wherever you are. */
const PAGE_SIZE = 25;

/** Padding and radius come from the density tokens rather than fixed pixels,
 *  so these two sit on the same ladder as every other control in the app. */
const pagerBtn = (disabled: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: 'var(--ds-btn-py-sm) 12px',
  minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25,
  border: '1px solid var(--border)', borderRadius: 'var(--r)',
  background: 'var(--white)', color: 'var(--ink2)',
  fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.45 : 1,
});
function autoCode(name: string) { return 'SVC-' + name.trim().toUpperCase().replace(/\s+/g, '-').slice(0, 8); }

const EMPTY_PRODUCT: Product = {
  id: '', code: '', name: '', type: 'service', description: '',
  category: 'Clearance Services', unit: 'shipment',
  salePrice: 0, purchasePrice: 0, currency: 'TZS',
  // No hardcoded 18 — a new product takes the workspace's default treatment,
  // which carries its own rate. See ProductForm.
  taxRate: 0, taxCodeId: null, status: 'active', createdAt: '',
};

/* ── Detail Panel ───────────────────────────────────────────────────────────── */
function ProductDetail({ product, onClose, onEdit, isMobile }: {
  product: Product; onClose: () => void; onEdit: (p: Product) => void; isMobile?: boolean;
}) {
  const { fmt } = useCurrency();
  const tc = PRODUCT_TYPE_COLOR[product.type];
  const taxCode = useTaxCodes().find(c => c.id === product.taxCodeId);
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
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Tax</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{product.taxRate}%</div>
            {/* The rate alone does not say which treatment it is. A 0% item may
                be zero-rated, exempt, reverse-charge or out of scope, and only
                one of those lets you recover input tax. */}
            <div style={{ fontSize: 10.5, fontWeight: 600, color: taxCode ? 'var(--ink3)' : 'var(--gold)', marginTop: 2 }}>
              {taxCode ? taxCode.name : 'Not classified'}
            </div>
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
  // Sales-side treatments only — a blocked-input-tax code is a purchase
  // concept and the API refuses it on an invoice anyway.
  const taxCodes = useTaxCodes().filter(c => c.appliesTo !== 'PURCHASE');

  // A new product starts on the workspace default rather than a literal 18.
  // Only once, and only while the field is still untouched.
  useEffect(() => {
    if (product || form.taxCodeId || taxCodes.length === 0) return;
    const d = defaultTaxCode(taxCodes);
    if (d) setForm(f => ({ ...f, taxCodeId: d.id, taxRate: d.rate }));
  }, [taxCodes, product, form.taxCodeId]);

  const selectedCode = taxCodes.find(c => c.id === form.taxCodeId);

  function set(k: keyof Product, v: string | number) { setForm(f => ({ ...f, [k]: v })); }

  /** The code decides the rate, so the two can never contradict each other. */
  function setTaxCode(id: string) {
    const c = taxCodes.find(x => x.id === id);
    setForm(f => ({ ...f, taxCodeId: id, taxRate: c ? c.rate : f.taxRate }));
  }

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
    <FormPage
      title={product ? `Edit ${product.name}` : 'New Product / Service'}
      subtitle="What you sell or bill for — its code, price, tax treatment and category."
      onCancel={onClose}
      actions={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving || !form.name.trim()} className="btn btn-primary">
            <Icon name="check" size={14} color="#fff" /> {saving ? 'Saving…' : product ? 'Save Changes' : 'Add Item'}
          </button>
        </>
      }
    >

      <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
          {/* Tax treatment, not a bare rate. The old control offered 0% and 18%
              and labelled 0% "(Exempt)" — which is one of four things 0% can
              mean, and the wrong one for most of what this catalogue sells. */}
          <F label="Tax Treatment">
            <Select value={form.taxCodeId ?? ''} onValueChange={setTaxCode}>
              <SelectTrigger><SelectValue placeholder="Not classified" /></SelectTrigger>
              <SelectContent>
                {taxCodes.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name} — {c.rate}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div style={{ fontSize: 11, color: 'var(--ink3)', lineHeight: 1.4, marginTop: 2 }}>
              {selectedCode
                ? TAX_CODE_KIND_HINT[selectedCode.kind]
                : 'This item has no recorded treatment — it will not classify correctly on a return.'}
            </div>
          </F>
          <F label="Description" col2>
            <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' } as React.CSSProperties}
              value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description…" />
          </F>
        </div>

    </FormPage>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */
export function FinanceProducts() {
  const { fmt } = useCurrency();
  const isMobile = useIsMobile();
  const products = useProducts();
  const taxCodes = useTaxCodes().filter(c => c.appliesTo !== 'PURCHASE');
  const codeById = useMemo(() => new Map(taxCodes.map(c => [c.id, c])), [taxCodes]);

  const [search, setSearch]             = useState('');
  const [filterType, setFilterType]     = useState<ProductType | ''>('');
  const [filterCat, setFilterCat]       = useState('');
  const [filterStatus, setFilterStatus] = useState<'active' | 'inactive' | ''>('');
  const [selected, setSelected]         = useState<Product | null>(null);
  const [showForm, setShowForm]         = useState(false);
  const [editProduct, setEditProduct]   = useState<Product | null>(null);
  const [page, setPage]                 = useState(1);

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

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Filtering can shrink the list under the page you are standing on — narrow
  // a 200-item list to 3 while on page 5 and you would be looking at an empty
  // table with no clue why. Clamping keeps the last page reachable instead.
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const paged = useMemo(() => filtered.slice(offset, offset + PAGE_SIZE), [filtered, offset]);

  // Any change to what is being filtered starts again from the first page.
  useEffect(() => { setPage(1); }, [search, filterType, filterCat, filterStatus]);

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

  async function handleDelete(id: string) {
    if (!(await showConfirm('Delete this item? This cannot be undone.', { confirmLabel: 'Delete' }))) return;
    deleteProduct(id);
    if (selected?.id === id) setSelected(null);
  }

  // The form replaces the list rather than layering over it — see FormPage.
  if (showForm) {
    return (
      <ProductForm
        product={editProduct}
        onSave={handleSave}
        onClose={() => { setShowForm(false); setEditProduct(null); }}
      />
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Products & Services']}
        titlePlain="Products &"
        titleEm="services"
        subtitle="Define the items and services your business buys and sells."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => { setEditProduct(null); setShowForm(true); }}>
            <Icon name="plus" size={13} color="#fff" /> New Item
          </button>
        }
      />
      <MetricsRow cards={[
        {
          title: 'Total Items',
          value: String(stats.total),
          sub1Label: 'SERVICES', sub1Value: String(stats.services),
          sub2Label: 'PRODUCTS', sub2Value: String(stats.prods), barHighlight: 'var(--teal)',
        },
        {
          title: 'Active Items',
          value: String(stats.active),
          sub1Label: 'RATE', sub1Value: `${stats.total ? Math.round((stats.active / stats.total) * 100) : 0}%`,
          sub2Label: 'INACTIVE', sub2Value: String(stats.total - stats.active), barHighlight: 'var(--green)',
        },
        {
          title: 'Services',
          value: String(stats.services),
          sub1Label: 'SHARE', sub1Value: `${stats.total ? Math.round((stats.services / stats.total) * 100) : 0}%`,
          sub2Label: 'PRODUCTS', sub2Value: String(stats.prods), barHighlight: 'var(--purple)',
        },
        {
          title: 'Avg Sale Price',
          value: fmt(products.length ? Math.round(products.reduce((s, p) => s + p.salePrice, 0) / products.length) : 0),
          sub1Label: 'MAX PRICE', sub1Value: fmt(products.length ? Math.max(...products.map(p => p.salePrice)) : 0),
          sub2Label: 'MIN PRICE', sub2Value: fmt(products.length ? Math.min(...products.map(p => p.salePrice)) : 0), barHighlight: 'var(--gold)',
        },
      ]} />

      {/* Toolbar Card */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
        </div>

        <div style={{ position: 'relative', width: isMobile ? '100%' : 260 }}>
          <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' } as React.CSSProperties} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search products & services…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid var(--border)', borderRadius: 'var(--r, 6px)', fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Split body */}
      <div style={{ display: 'flex', margin: '0 0 20px' }}>
        {/* Table */}
        <div style={{ flex: 1, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'auto', minWidth: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                {['Code', 'Name', 'Type', 'Category', 'Unit', 'Sale Price', 'Tax', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink3)', fontSize: 13 }}>No items found</td></tr>
              )}
              {paged.map(p => {
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
                    <td style={{ padding: '11px 14px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>
                      {p.taxRate}%
                      <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: p.taxCodeId ? 'var(--ink3)' : 'var(--gold)' }}>
                        {codeById.get(p.taxCodeId || '')?.code ?? 'unclassified'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, fontWeight: 700, background: p.status === 'active' ? '#ecfdf5' : '#f1f5f9', color: p.status === 'active' ? '#065f46' : '#64748b' }}>
                        {p.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '11px 10px', whiteSpace: 'nowrap' }}>
                      <button type="button" title="Edit" onClick={e => { e.stopPropagation(); setEditProduct(p); setShowForm(true); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)', borderRadius: 'var(--r)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <Icon name="edit" size={14} />
                      </button>
                      <button type="button" title="Delete" onClick={e => { e.stopPropagation(); handleDelete(p.id); }}
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

          {/* Pager. Same shape as the landed-cost history footer: what you are
              looking at on the left, the controls on the right. Hidden when
              everything already fits on one page — a pager that can only ever
              say "Page 1 of 1" is noise. */}
          {filtered.length > PAGE_SIZE && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              flexWrap: 'wrap', padding: '14px 18px', borderTop: '1px solid var(--border)',
              fontSize: 12.5, color: 'var(--ink3)',
            }}>
              <span>
                {offset + 1}–{Math.min(offset + PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()} item{filtered.length === 1 ? '' : 's'}
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" disabled={currentPage === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  style={pagerBtn(currentPage === 1)}>
                  <Icon name="arrowLeft" size={12} /> Previous
                </button>
                <span style={{ minWidth: 70, textAlign: 'center' }}>Page {currentPage} of {pageCount}</span>
                <button type="button" disabled={currentPage === pageCount}
                  onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                  style={pagerBtn(currentPage === pageCount)}>
                  Next <Icon name="arrowRight" size={12} />
                </button>
              </div>
            </div>
          )}
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

    </div>
  );
}
