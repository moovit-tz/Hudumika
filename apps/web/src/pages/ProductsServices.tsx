import React, { useState, useEffect, useRef } from 'react';
import { MetricsRow, spark } from '../components/MetricCard.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

// -- Types ---------------------------------------------------------------------

export interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  description: string;
  unit: string;
  unit_price: number;
  currency: string;
  tax_rate: number;
  status: 'ACTIVE' | 'INACTIVE';
  notes?: string;
  created_at: string;
  updated_at?: string;
}

interface ProductForm {
  name: string; code: string; category: string; description: string;
  unit: string; unit_price: number; currency: string; tax_rate: number;
  status: 'ACTIVE' | 'INACTIVE'; notes: string;
}

type CatFilter = 'ALL' | string;

// -- Constants -----------------------------------------------------------------

const CATEGORIES = ['FREIGHT','CLEARANCE','HANDLING','TRANSPORT','DUTY','INSURANCE','OTHER'];
const CAT_CFG: Record<string, { label: string; color: string; bg: string }> = {
  FREIGHT:   { label: 'Freight',        color: 'var(--blue)',   bg: 'var(--blue-l)'   },
  CLEARANCE: { label: 'Clearance',      color: 'var(--teal)',   bg: 'var(--teal-l)'   },
  HANDLING:  { label: 'Handling',       color: 'var(--orange)', bg: '#fff7ed'         },
  TRANSPORT: { label: 'Transport',      color: 'var(--gold)',   bg: 'var(--gold-l)'   },
  DUTY:      { label: 'Duty & Taxes',   color: 'var(--red)',    bg: 'var(--red-l)'    },
  INSURANCE: { label: 'Insurance',      color: 'var(--green)',  bg: 'var(--green-l)'  },
  OTHER:     { label: 'Other',          color: 'var(--ink3)',   bg: 'var(--bg)'       },
};

const UNITS = ['shipment','container','kg','CBM','trip','day','hour','set','certificate','%','unit','m³','ton'];
const CURRENCIES = ['USD','TZS','EUR','GBP','KES','ZAR','AED'];
const STORAGE_KEY = 'cls_products';

// -- Seed data (freight industry service catalog) -------------------------------

const SEED_PRODUCTS: Product[] = [
  { id:'p-sf1',  name:'Sea Freight – 20ft FCL',           code:'SF-FCL-20',   category:'FREIGHT',   unit:'container', unit_price:1200, currency:'USD', tax_rate:0,  status:'ACTIVE', description:'Full container load sea freight – 20ft standard container',              created_at:'2024-01-01T00:00:00Z' },
  { id:'p-sf2',  name:'Sea Freight – 40ft FCL',           code:'SF-FCL-40',   category:'FREIGHT',   unit:'container', unit_price:1800, currency:'USD', tax_rate:0,  status:'ACTIVE', description:'Full container load sea freight – 40ft standard container',              created_at:'2024-01-01T00:00:00Z' },
  { id:'p-sf3',  name:'Sea Freight – 40ft HC',            code:'SF-FCL-40H',  category:'FREIGHT',   unit:'container', unit_price:2000, currency:'USD', tax_rate:0,  status:'ACTIVE', description:'Full container load sea freight – 40ft high cube container',              created_at:'2024-01-01T00:00:00Z' },
  { id:'p-sf4',  name:'Sea Freight – LCL',                code:'SF-LCL',      category:'FREIGHT',   unit:'CBM',       unit_price:85,   currency:'USD', tax_rate:0,  status:'ACTIVE', description:'Less than container load sea freight (per CBM)',                          created_at:'2024-01-01T00:00:00Z' },
  { id:'p-af1',  name:'Air Freight',                      code:'AF-KG',       category:'FREIGHT',   unit:'kg',        unit_price:4.5,  currency:'USD', tax_rate:0,  status:'ACTIVE', description:'Air freight charge per kilogram (chargeable weight)',                     created_at:'2024-01-01T00:00:00Z' },
  { id:'p-af2',  name:'Air Freight – Minimum',            code:'AF-MIN',      category:'FREIGHT',   unit:'shipment',  unit_price:350,  currency:'USD', tax_rate:0,  status:'ACTIVE', description:'Air freight minimum charge per shipment',                                 created_at:'2024-01-01T00:00:00Z' },
  { id:'p-rd1',  name:'Road Transport – Local',           code:'RT-LOCAL',    category:'TRANSPORT', unit:'trip',      unit_price:450,  currency:'USD', tax_rate:18, status:'ACTIVE', description:'Local inland transport and delivery',                                     created_at:'2024-01-01T00:00:00Z' },
  { id:'p-rd2',  name:'Road Transport – Upcountry',       code:'RT-UPCTRY',   category:'TRANSPORT', unit:'trip',      unit_price:850,  currency:'USD', tax_rate:18, status:'ACTIVE', description:'Upcountry delivery to inland destination',                               created_at:'2024-01-01T00:00:00Z' },
  { id:'p-cl1',  name:'Customs Clearance',                code:'CL-BASIC',    category:'CLEARANCE', unit:'shipment',  unit_price:350,  currency:'USD', tax_rate:18, status:'ACTIVE', description:'Customs clearance and entry lodgement at port',                          created_at:'2024-01-01T00:00:00Z' },
  { id:'p-cl2',  name:'Documentation Fee',                code:'CL-DOCS',     category:'CLEARANCE', unit:'set',       unit_price:75,   currency:'USD', tax_rate:18, status:'ACTIVE', description:'Preparation of shipping documentation and certificates',                  created_at:'2024-01-01T00:00:00Z' },
  { id:'p-cl3',  name:'Bill of Lading Processing',        code:'CL-BL',       category:'CLEARANCE', unit:'set',       unit_price:60,   currency:'USD', tax_rate:18, status:'ACTIVE', description:'Bill of lading processing and handling fee',                             created_at:'2024-01-01T00:00:00Z' },
  { id:'p-cl4',  name:'Pre-Shipment Inspection',          code:'CL-PSI',      category:'CLEARANCE', unit:'shipment',  unit_price:200,  currency:'USD', tax_rate:18, status:'ACTIVE', description:'Pre-shipment inspection (PVoC / CoC)',                                   created_at:'2024-01-01T00:00:00Z' },
  { id:'p-cl5',  name:'Phytosanitary Certificate',        code:'CL-PHYTO',    category:'CLEARANCE', unit:'certificate', unit_price:80, currency:'USD', tax_rate:18, status:'ACTIVE', description:'Phytosanitary / health certificate processing',                          created_at:'2024-01-01T00:00:00Z' },
  { id:'p-ph1',  name:'Terminal Handling Charge',         code:'PH-THC',      category:'HANDLING',  unit:'container', unit_price:250,  currency:'USD', tax_rate:0,  status:'ACTIVE', description:'Terminal handling charges at port of loading or discharge',              created_at:'2024-01-01T00:00:00Z' },
  { id:'p-ph2',  name:'Port Scanning / X-Ray',            code:'PH-SCAN',     category:'HANDLING',  unit:'container', unit_price:50,   currency:'USD', tax_rate:0,  status:'ACTIVE', description:'Port scanner / X-ray inspection fee',                                   created_at:'2024-01-01T00:00:00Z' },
  { id:'p-ph3',  name:'Weighbridge Certificate',          code:'PH-WGH',      category:'HANDLING',  unit:'truck',     unit_price:30,   currency:'USD', tax_rate:18, status:'ACTIVE', description:'Weighbridge measurement and certificate fee',                            created_at:'2024-01-01T00:00:00Z' },
  { id:'p-ph4',  name:'Fumigation Treatment',             code:'PH-FUM',      category:'HANDLING',  unit:'container', unit_price:150,  currency:'USD', tax_rate:18, status:'ACTIVE', description:'Fumigation treatment and phytosanitary certificate',                     created_at:'2024-01-01T00:00:00Z' },
  { id:'p-dt1',  name:'Import Duty',                      code:'DT-IMP',      category:'DUTY',      unit:'%',         unit_price:0,    currency:'USD', tax_rate:0,  status:'ACTIVE', description:'Customs import duty (percentage of CIF value) — rate varies by HS code', created_at:'2024-01-01T00:00:00Z' },
  { id:'p-dt2',  name:'VAT on Import',                    code:'DT-VAT',      category:'DUTY',      unit:'%',         unit_price:0,    currency:'USD', tax_rate:0,  status:'ACTIVE', description:'Value added tax assessed on imported goods',                             created_at:'2024-01-01T00:00:00Z' },
  { id:'p-dt3',  name:'Excise Duty',                      code:'DT-EXC',      category:'DUTY',      unit:'%',         unit_price:0,    currency:'USD', tax_rate:0,  status:'INACTIVE', description:'Excise duty applicable on specific commodities',                      created_at:'2024-01-01T00:00:00Z' },
  { id:'p-ins1', name:'Marine Cargo Insurance',           code:'INS-CARGO',   category:'INSURANCE', unit:'%',         unit_price:0,    currency:'USD', tax_rate:18, status:'ACTIVE', description:'Marine cargo insurance — percentage of insured cargo value',             created_at:'2024-01-01T00:00:00Z' },
  { id:'p-ot1',  name:'Storage / Demurrage',              code:'OT-STOR',     category:'OTHER',     unit:'day',       unit_price:25,   currency:'USD', tax_rate:18, status:'ACTIVE', description:'Container or cargo storage charge per day',                              created_at:'2024-01-01T00:00:00Z' },
  { id:'p-ot2',  name:'Port Congestion Surcharge',        code:'OT-CONG',     category:'OTHER',     unit:'container', unit_price:150,  currency:'USD', tax_rate:0,  status:'ACTIVE', description:'Port congestion surcharge (applied when applicable)',                   created_at:'2024-01-01T00:00:00Z' },
  { id:'p-ot3',  name:'Dangerous Goods / IMO Fee',        code:'OT-DG',       category:'OTHER',     unit:'shipment',  unit_price:120,  currency:'USD', tax_rate:18, status:'ACTIVE', description:'Handling surcharge for IMO / DG classified cargo',                      created_at:'2024-01-01T00:00:00Z' },
];

// -- Local store (falls back when API unavailable) -----------------------------

function loadLocal(): Product[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Product[];
  } catch {}
  return SEED_PRODUCTS.map(p => ({ ...p }));
}

function saveLocal(items: Product[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

function genId() { return 'p-' + Math.random().toString(36).slice(2, 10); }

function genCode(name: string, category: string): string {
  const abbr = CATEGORIES.indexOf(category) >= 0
    ? ['SF','CL','PH','RT','DT','INS','OT'][CATEGORIES.indexOf(category)]
    : 'SV';
  const slug = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return `${abbr}-${slug}`;
}

// -- Helpers -------------------------------------------------------------------

function fmt(amount: number, currency = 'USD') {
  if (amount === 0) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  } catch { return `${currency} ${amount}`; }
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const ACOLORS = ['#0d7a6b','#0550ae','#6e40c9','#059669','#9a6700','#cf222e','#d05c30'];
function acolor(s: string) { return ACOLORS[s.charCodeAt(0) % ACOLORS.length]; }

// -- Category badge ------------------------------------------------------------

function CatBadge({ cat }: { cat: string }) {
  const c = CAT_CFG[cat] ?? CAT_CFG.OTHER;
  return <span style={{ padding: '2px 9px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>{c.label}</span>;
}

// -- Status toggle -------------------------------------------------------------

function StatusPill({ status }: { status: 'ACTIVE' | 'INACTIVE' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: status === 'ACTIVE' ? 'var(--green-l)' : 'var(--bg)', color: status === 'ACTIVE' ? 'var(--green)' : 'var(--ink3)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: status === 'ACTIVE' ? 'var(--green)' : 'var(--ink3)', display: 'inline-block' }} />
      {status === 'ACTIVE' ? 'Active' : 'Inactive'}
    </span>
  );
}

// -- Delete confirm modal ------------------------------------------------------

function DeleteModal({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 400, boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Delete Service</div>
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 20 }}>
          Are you sure you want to delete <strong>{name}</strong>? This cannot be undone and may affect quotations using this item.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" title="Cancel" onClick={onCancel} style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--bg)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--ink2)' }}>Cancel</button>
          <button type="button" title="Confirm delete" onClick={onConfirm} style={{ padding: '8px 18px', border: 'none', borderRadius: 9, background: 'var(--red)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// -- Product Form (slide-in panel) ---------------------------------------------

function ProductForm({ initial, onSave, onClose, isMobile }: {
  initial?: Product;
  onSave: (data: ProductForm) => Promise<void>;
  onClose: () => void;
  isMobile: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<ProductForm>({
    name:        initial?.name        ?? '',
    code:        initial?.code        ?? '',
    category:    initial?.category    ?? 'FREIGHT',
    description: initial?.description ?? '',
    unit:        initial?.unit        ?? 'shipment',
    unit_price:  initial?.unit_price  ?? 0,
    currency:    initial?.currency    ?? 'USD',
    tax_rate:    initial?.tax_rate    ?? 0,
    status:      initial?.status      ?? 'ACTIVE',
    notes:       initial?.notes       ?? '',
  });

  function set<K extends keyof ProductForm>(k: K, v: ProductForm[K]) {
    setF(p => {
      const next = { ...p, [k]: v };
      if (k === 'name' && !initial) next.code = genCode(String(v), next.category);
      if (k === 'category' && !initial) next.code = genCode(next.name, String(v));
      return next;
    });
  }

  async function submit() {
    if (!f.name.trim()) { alert('Service name is required.'); return; }
    setSaving(true);
    try { await onSave(f); } finally { setSaving(false); }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, outline: 'none', background: 'var(--white)', boxSizing: 'border-box' as const, color: 'var(--ink)', fontFamily: 'inherit' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };
  const row: React.CSSProperties = { marginBottom: 16 };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 400 }} />
      {/* Panel */}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: isMobile ? '100%' : 480, background: 'var(--white)', zIndex: 401, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{initial ? 'Edit Service' : 'New Service'}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{initial ? `Editing ${initial.code}` : 'Add to your service catalog'}</div>
          </div>
          <button type="button" title="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', padding: 4 }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={row}>
            <label style={lbl}>Service Name *</label>
            <input type="text" title="Service name" placeholder="e.g. Sea Freight – 20ft FCL" value={f.name} onChange={e => set('name', e.target.value)} style={inp} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Service Code / SKU</label>
              <input type="text" title="Service code" placeholder="e.g. SF-FCL-20" value={f.code} onChange={e => set('code', e.target.value.toUpperCase())} style={{ ...inp, fontFamily: 'var(--mono)', fontSize: 12 }} />
            </div>
            <div>
              <label style={lbl}>Category</label>
              <Select value={f.category} onValueChange={v => set('category', v)}>
                <SelectTrigger aria-label="Category" style={inp}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CAT_CFG[c].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div style={row}>
            <label style={lbl}>Description</label>
            <textarea title="Description" placeholder="Brief description of the service…" value={f.description} onChange={e => set('description', e.target.value)} rows={3}
              style={{ ...inp, resize: 'vertical' }} />
          </div>

          {/* Pricing */}
          <div style={{ background: 'var(--bg)', borderRadius: 9, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pricing</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lbl}>Unit Price</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{f.currency}</span>
                  <input type="number" title="Unit price" value={f.unit_price} min={0} step={0.01} onChange={e => set('unit_price', parseFloat(e.target.value) || 0)}
                    style={{ ...inp, paddingLeft: f.currency.length * 8 + 14 }} />
                </div>
              </div>
              <div>
                <label style={lbl}>Currency</label>
                <Select value={f.currency} onValueChange={v => set('currency', v)}>
                  <SelectTrigger aria-label="Currency" style={inp}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Unit of Measure</label>
                <Select value={f.unit} onValueChange={v => set('unit', v)}>
                  <SelectTrigger aria-label="Unit" style={inp}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={lbl}>Tax Rate (%)</label>
                <input type="number" title="Tax rate" value={f.tax_rate} min={0} max={100} step={0.5} onChange={e => set('tax_rate', parseFloat(e.target.value) || 0)} style={inp} />
              </div>
            </div>
          </div>

          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg)', borderRadius: 9, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Status</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Inactive services are hidden in quotations</div>
            </div>
            <button type="button" title="Toggle status" onClick={() => set('status', f.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--white)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: f.status === 'ACTIVE' ? 'var(--green)' : 'var(--ink3)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.status === 'ACTIVE' ? 'var(--green)' : 'var(--ink3)' }} />
              {f.status === 'ACTIVE' ? 'Active' : 'Inactive'}
            </button>
          </div>

          <div style={row}>
            <label style={lbl}>Internal Notes</label>
            <textarea title="Notes" placeholder="Any internal notes about this service…" value={f.notes} onChange={e => set('notes', e.target.value)} rows={2}
              style={{ ...inp, resize: 'vertical' }} />
          </div>

          {/* Live preview */}
          <div style={{ background: 'var(--teal-l)', border: '1px solid var(--teal-m, var(--teal))', borderRadius: 9, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Preview</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{f.name || 'Service Name'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2, fontFamily: 'var(--mono)' }}>{f.code || '—'} · {CAT_CFG[f.category]?.label}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--teal)' }}>{f.unit_price > 0 ? fmt(f.unit_price, f.currency) : '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>per {f.unit}{f.tax_rate > 0 ? ` · ${f.tax_rate}% tax` : ' · no tax'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" title="Cancel" onClick={onClose} style={{ padding: '9px 18px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--bg)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--ink2)' }}>Cancel</button>
          <button type="button" title="Save service" onClick={submit} disabled={saving}
            style={{ padding: '9px 20px', border: 'none', borderRadius: 9, background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="save" size={13} /> {saving ? 'Saving…' : initial ? 'Update Service' : 'Add Service'}
          </button>
        </div>
      </div>
    </>
  );
}

// -- Detail Panel (right slide-in) ---------------------------------------------

function DetailPanel({ product, onEdit, onDelete, onToggleStatus, onClose }: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onClose: () => void;
}) {
  const cat = CAT_CFG[product.category] ?? CAT_CFG.OTHER;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, background: 'var(--white)', zIndex: 401, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.12)' }}>
        <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--teal)', fontWeight: 700, marginBottom: 4 }}>{product.code}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3 }}>{product.name}</div>
          </div>
          <button type="button" title="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', padding: 4, flexShrink: 0 }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
          {/* Pricing hero */}
          <div style={{ background: 'var(--bg)', borderRadius: 9, padding: '18px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Unit Price</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--teal)', letterSpacing: '-0.5px' }}>{product.unit_price > 0 ? fmt(product.unit_price, product.currency) : '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>per {product.unit}{product.tax_rate > 0 ? ` · +${product.tax_rate}% tax` : ''}</div>
            </div>
            <StatusPill status={product.status} />
          </div>

          {/* Meta */}
          {[
            { label: 'Category',   value: <CatBadge cat={product.category} /> },
            { label: 'Unit',       value: product.unit },
            { label: 'Currency',   value: product.currency },
            { label: 'Tax Rate',   value: product.tax_rate > 0 ? `${product.tax_rate}%` : 'No tax' },
            { label: 'Created',    value: fmtDate(product.created_at) },
            { label: 'Updated',    value: fmtDate(product.updated_at) },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--ink3)' }}>{r.label}</span>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.value}</span>
            </div>
          ))}

          {product.description && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Description</div>
              <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6 }}>{product.description}</div>
            </div>
          )}

          {product.notes && (
            <div style={{ background: 'var(--gold-l)', borderRadius: 9, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Notes</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>{product.notes}</div>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 22px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" title="Edit service" onClick={onEdit}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', border: 'none', borderRadius: 9, background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            <Icon name="edit" size={14} /> Edit Service
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" title="Toggle active/inactive" onClick={onToggleStatus}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--bg)', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, color: 'var(--ink2)' }}>
              <Icon name="eye" size={13} /> {product.status === 'ACTIVE' ? 'Set Inactive' : 'Set Active'}
            </button>
            <button type="button" title="Delete service" onClick={onDelete}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 9, background: 'rgba(239,68,68,0.04)', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, color: 'var(--red)' }}>
              <Icon name="trash" size={13} /> Delete
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// -- Main Page -----------------------------------------------------------------

export const ProductsServices: React.FC = () => {
  const isMobile = useIsMobile();
  const [products, setProducts]   = useState<Product[]>([]);
  const [loading, setLoading]     = useState(true);
  const [catFilter, setCatFilter] = useState<CatFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<Product | null>(null);
  const [editing, setEditing]     = useState<Product | 'new' | null>(null);
  const [deleting, setDeleting]   = useState<Product | null>(null);
  const [sortBy, setSortBy]       = useState<'name' | 'price' | 'category' | 'created'>('name');
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('asc');

  // -- Load -------------------------------------------------------------------

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch('/v1/products');
        const list = Array.isArray(data) ? data : (data.data ?? []);
        if (list.length > 0) {
          setProducts(list);
          saveLocal(list);
        } else {
          setProducts(loadLocal());
        }
      } catch {
        setProducts(loadLocal());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // -- CRUD -------------------------------------------------------------------

  async function handleSave(data: ProductForm) {
    const isNew = editing === 'new';
    const now = new Date().toISOString();

    if (isNew) {
      const product: Product = { id: genId(), ...data, code: data.code || genCode(data.name, data.category), created_at: now };
      const next = [product, ...products];
      setProducts(next); saveLocal(next);
      try { await apiFetch('/v1/products', { method: 'POST', body: JSON.stringify(data) }); } catch {}
    } else {
      const target = editing as Product;
      const product: Product = { ...target, ...data, updated_at: now };
      const next = products.map(p => p.id === target.id ? product : p);
      setProducts(next); saveLocal(next);
      if (selected?.id === target.id) setSelected(product);
      try { await apiFetch(`/v1/products/${target.id}`, { method: 'PATCH', body: JSON.stringify(data) }); } catch {}
    }
    setEditing(null);
  }

  async function handleDelete(product: Product) {
    const next = products.filter(p => p.id !== product.id);
    setProducts(next); saveLocal(next);
    if (selected?.id === product.id) setSelected(null);
    setDeleting(null);
    try { await apiFetch(`/v1/products/${product.id}`, { method: 'DELETE' }); } catch {}
  }

  async function handleToggleStatus(product: Product) {
    const updated = { ...product, status: (product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE') as 'ACTIVE' | 'INACTIVE', updated_at: new Date().toISOString() };
    const next = products.map(p => p.id === product.id ? updated : p);
    setProducts(next); saveLocal(next);
    if (selected?.id === product.id) setSelected(updated);
    try { await apiFetch(`/v1/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ status: updated.status }) }); } catch {}
  }

  // -- Filter + Sort ----------------------------------------------------------

  const displayed = products
    .filter(p => {
      if (catFilter !== 'ALL' && p.category !== catFilter) return false;
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s) || p.description.toLowerCase().includes(s) || p.category.toLowerCase().includes(s);
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name')     cmp = a.name.localeCompare(b.name);
      if (sortBy === 'price')    cmp = a.unit_price - b.unit_price;
      if (sortBy === 'category') cmp = a.category.localeCompare(b.category);
      if (sortBy === 'created')  cmp = a.created_at.localeCompare(b.created_at);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  }

  function SortIcon({ col }: { col: typeof sortBy }) {
    if (sortBy !== col) return <Icon name="arrowUp" size={10} color="var(--border)" />;
    return <Icon name={sortDir === 'asc' ? 'arrowUp' : 'arrowDown'} size={10} color="var(--teal)" />;
  }

  // -- Metrics ----------------------------------------------------------------

  const active    = products.filter(p => p.status === 'ACTIVE').length;
  const inactive  = products.filter(p => p.status === 'INACTIVE').length;
  const avgPrice  = products.filter(p => p.unit_price > 0).length
    ? products.filter(p => p.unit_price > 0).reduce((s, p) => s + p.unit_price, 0) / products.filter(p => p.unit_price > 0).length
    : 0;
  const topCat    = CATEGORIES.reduce((best, c) => products.filter(p => p.category === c).length > products.filter(p => p.category === best).length ? c : best, 'FREIGHT');

  // -- Render -----------------------------------------------------------------

  return (
    <>
      {editing !== null && (
        <ProductForm
          initial={editing === 'new' ? undefined : editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          isMobile={isMobile}
        />
      )}
      {deleting && (
        <DeleteModal
          name={deleting.name}
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
      {selected && !editing && !deleting && (
        <DetailPanel
          product={selected}
          onEdit={() => setEditing(selected)}
          onDelete={() => { setDeleting(selected); setSelected(null); }}
          onToggleStatus={() => handleToggleStatus(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      <div style={{ padding: isMobile ? '14px 16px' : '24px 32px', flex: 1, overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Products &amp; Services</h1>
            <p style={{ fontSize: 13, color: 'var(--ink3)', margin: 0 }}>Manage your freight service catalog — used in quotations, invoices, and purchase orders.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" title="Reset to default catalog" onClick={() => { if (confirm('Reset to the default freight services catalog? Custom items will be lost.')) { const d = SEED_PRODUCTS.map(p => ({ ...p })); setProducts(d); saveLocal(d); } }}
              style={{ padding: '9px 14px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--white)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="refresh" size={13} /> Reset Catalog
            </button>
            <button type="button" title="Add new service" onClick={() => setEditing('new')}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', border: 'none', borderRadius: 9, background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              <Icon name="plus" size={14} /> New Service
            </button>
          </div>
        </div>

        {/* Metrics */}
        <MetricsRow cards={[
          { title: 'Total Services', value: String(products.length), trend: 0, sub1Label: 'ACTIVE', sub1Value: String(active), sub2Label: 'INACTIVE', sub2Value: String(inactive), bars: spark(10, 15, 'flat'), barColor: 'var(--blue-l)', barHighlight: 'var(--blue)' },
          { title: 'Active Services', value: String(active), trend: 0, sub1Label: 'WITH PRICE', sub1Value: String(products.filter(p => p.unit_price > 0).length), sub2Label: 'FREE/DUTY', sub2Value: String(products.filter(p => p.unit_price === 0).length), bars: spark(11, 15, 'flat'), barColor: 'var(--green-l)', barHighlight: 'var(--green)' },
          { title: 'Avg Unit Price', value: avgPrice > 0 ? `$${Math.round(avgPrice)}` : '—', trend: 0, sub1Label: 'CATEGORIES', sub1Value: String(new Set(products.map(p => p.category)).size), sub2Label: 'TOP CAT', sub2Value: CAT_CFG[topCat]?.label ?? '—', bars: spark(12, 15, 'flat'), barColor: 'var(--gold-l)', barHighlight: 'var(--gold)' },
        ]} />

        {/* Filters */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[{ key: 'ALL', label: `All (${products.length})` }, ...CATEGORIES.map(c => ({ key: c, label: `${CAT_CFG[c].label} (${products.filter(p => p.category === c).length})` }))].map(t => (
              <button key={t.key} type="button" title={`Filter: ${t.label}`} onClick={() => setCatFilter(t.key)}
                style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 9, cursor: 'pointer', transition: 'all 0.1s', background: catFilter === t.key ? 'var(--navy)' : 'var(--bg)', color: catFilter === t.key ? '#fff' : 'var(--ink2)' }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', padding: 3, borderRadius: 9 }}>
              {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(s => (
                <button key={s} type="button" title={`Status: ${s}`} onClick={() => setStatusFilter(s)}
                  style={{ padding: '5px 10px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', background: statusFilter === s ? 'var(--white)' : 'transparent', color: statusFilter === s ? 'var(--ink)' : 'var(--ink3)', boxShadow: statusFilter === s ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
                  {s === 'ALL' ? 'All Status' : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' } as React.CSSProperties} />
              <input type="text" title="Search services" placeholder="Search services…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, outline: 'none', background: 'var(--white)', width: 220, boxSizing: 'border-box' as const }} />
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading services…</div>
          ) : displayed.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ marginBottom: 12 }}><Icon name="package" size={44} color="var(--border)" /></div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>No services found</div>
              <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 20 }}>{search ? 'Try a different search.' : 'Add your first service to the catalog.'}</div>
              {!search && <button type="button" title="Add service" onClick={() => setEditing('new')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', border: 'none', borderRadius: 9, background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}><Icon name="plus" size={13} /> New Service</button>}
            </div>
          ) : (
            <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
              <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {[
                      { label: 'Code',      col: null        },
                      { label: 'Name',      col: 'name' as const },
                      { label: 'Category',  col: 'category' as const },
                      { label: 'Unit',      col: null        },
                      { label: 'Unit Price',col: 'price' as const },
                      { label: 'Tax',       col: null        },
                      { label: 'Status',    col: null        },
                      { label: 'Added',     col: 'created' as const },
                      { label: '',          col: null        },
                    ].map(h => (
                      <th key={h.label}
                        onClick={() => h.col && toggleSort(h.col)}
                        style={{ padding: '10px 14px', textAlign: h.label === 'Unit Price' ? 'right' : 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', cursor: h.col ? 'pointer' : 'default', userSelect: 'none' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {h.label}{h.col && <SortIcon col={h.col} />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(p => (
                    <tr key={p.id}
                      onClick={() => setSelected(p)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s', opacity: p.status === 'INACTIVE' ? 0.6 : 1 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--teal)', fontWeight: 700, whiteSpace: 'nowrap' }}>{p.code}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{p.name}</div>
                        {p.description && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>}
                      </td>
                      <td style={{ padding: '11px 14px' }}><CatBadge cat={p.category} /></td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--ink2)' }}>{p.unit}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700 }}>{p.unit_price > 0 ? fmt(p.unit_price, p.currency) : <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>—</span>}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--ink3)' }}>{p.tax_rate > 0 ? `${p.tax_rate}%` : '—'}</td>
                      <td style={{ padding: '11px 14px' }}><StatusPill status={p.status} /></td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--ink3)' }}>{fmtDate(p.created_at)}</td>
                      <td style={{ padding: '11px 10px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 2 }}>
                          {[
                            { title: 'Edit',   icon: 'edit'  as const, fn: () => setEditing(p)              },
                            { title: 'Delete', icon: 'trash' as const, fn: () => setDeleting(p), red: true  },
                          ].map(a => (
                            <button key={a.title} type="button" title={a.title} onClick={a.fn}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: a.red ? 'var(--red)' : 'var(--ink3)', padding: 5, borderRadius: 5, display: 'flex' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                              <Icon name={a.icon} size={14} />
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--ink3)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Showing {displayed.length} of {products.length} services</span>
                <span>{active} active · {inactive} inactive</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
