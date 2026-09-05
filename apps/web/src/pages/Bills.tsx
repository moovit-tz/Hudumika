import React, { useState, useMemo, useEffect } from 'react';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { MetricsRow } from '../components/MetricCard.js';
import { FormPage } from '../components/FormPage.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Banner } from '../components/ui/alert.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { getCompany } from '../data/companyStore.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { Button } from '../components/ui/button.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { showAlert } from '../lib/alert.js';
import { useTaxCodes } from '../data/taxCodeData.js';

// ── Types ──────────────────────────────────────────────────────────────────────

type BillStatus = 'DRAFT'|'POSTED'|'PARTIAL'|'PAID'|'OVERDUE'|'VOID';
type RecurFreq  = 'WEEKLY'|'MONTHLY'|'QUARTERLY'|'ANNUAL';
type RecurState = 'ACTIVE'|'PAUSED'|'ENDED';
type BillCat    = 'FREIGHT'|'CUSTOMS'|'PORT'|'TRANSPORT'|'WAREHOUSE'|'INSURANCE'|'PROFESSIONAL'|'UTILITIES'|'OTHER';

interface BillLine {
  _key: string; description: string; category: BillCat;
  qty: number; unit_price: number; tax_rate: number; tax_code_id: string | null;
}

interface Bill {
  id: string; bill_number: string; supplier_id: string; supplier_name: string;
  bill_date: string; due_date: string; status: BillStatus; currency: string;
  subtotal: number; tax_amount: number; total: number; paid_amount: number;
  lines: BillLine[]; po_number?: string; shipment_ref?: string; notes?: string;
  recurring_id?: string; created_at: string;
  // EFD/VFD receipt verification (against the TRA verify portal)
  efd_receipt_number?: string;
  efd_verified?: boolean;
  efd_verified_at?: string;
  efd_verification_data?: Record<string, any>;
}

interface RecurringBill {
  id: string; name: string; supplier_id: string; supplier_name: string;
  frequency: RecurFreq; currency: string; amount: number; tax_rate: number; tax_code_id: string | null;
  category: BillCat; description: string; payment_terms: string;
  next_due: string; end_date?: string; state: RecurState;
  bills_generated: number; total_spend: number; created_at: string;
}

interface Payment {
  id: string; bill_id: string; amount: number; currency: string;
  date: string; method: string; reference: string; note?: string;
}

// form shapes
interface BillForm {
  supplier_id: string; bill_date: string; due_date: string;
  currency: string; po_number: string; shipment_ref: string; notes: string;
  lines: BillLine[];
}
interface RecurForm {
  name: string; supplier_id: string; frequency: RecurFreq; currency: string;
  amount: number; tax_rate: number; tax_code_id: string | null; category: BillCat; description: string;
  payment_terms: string; next_due: string; end_date: string;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<BillStatus, { label: string; color: string; bg: string }> = {
  DRAFT:   { label: 'Draft',    color: 'var(--ink3)',  bg: 'var(--bg)'       },
  POSTED:  { label: 'Posted',   color: 'var(--blue)',  bg: 'var(--blue-l)'   },
  PARTIAL: { label: 'Partial',  color: 'var(--gold)',  bg: 'var(--gold-l)'   },
  PAID:    { label: 'Paid',     color: 'var(--green)', bg: 'var(--green-l)'  },
  OVERDUE: { label: 'Overdue',  color: 'var(--red)',   bg: 'var(--red-l)'    },
  VOID:    { label: 'Void',     color: 'var(--ink3)',  bg: 'var(--bg)',       },
};

const CAT_CFG: Record<BillCat, { label: string; color: string }> = {
  FREIGHT:      { label: 'Freight',        color: 'var(--blue)'   },
  CUSTOMS:      { label: 'Customs',        color: 'var(--navy)'   },
  PORT:         { label: 'Port Charges',   color: 'var(--orange)' },
  TRANSPORT:    { label: 'Transport',      color: 'var(--gold)'   },
  WAREHOUSE:    { label: 'Warehouse',      color: 'var(--green)'  },
  INSURANCE:    { label: 'Insurance',      color: '#6e40c9'       },
  PROFESSIONAL: { label: 'Professional',   color: 'var(--teal)'   },
  UTILITIES:    { label: 'Utilities',      color: 'var(--ink2)'   },
  OTHER:        { label: 'Other',          color: 'var(--ink3)'   },
};

const FREQ_CFG: Record<RecurFreq, { label: string; color: string; bg: string }> = {
  WEEKLY:    { label: 'Weekly',    color: 'var(--red)',    bg: 'var(--red-l)'   },
  MONTHLY:   { label: 'Monthly',   color: 'var(--blue)',   bg: 'var(--blue-l)'  },
  QUARTERLY: { label: 'Quarterly', color: 'var(--teal)',   bg: 'var(--teal-l)'  },
  ANNUAL:    { label: 'Annual',    color: 'var(--green)',  bg: 'var(--green-l)' },
};

const PAYMENT_METHODS = ['Bank Transfer','Cash','Mobile Money','Cheque','Credit Card','RTGS'];
const CURRENCIES = ['USD','TZS','EUR','GBP','KES'];
const ALL_CATS = Object.keys(CAT_CFG) as BillCat[];
const ALL_FREQS = Object.keys(FREQ_CFG) as RecurFreq[];

type SupplierMap = Record<string, { name: string; email: string; terms: string; currency: string }>;

const PAYMENT_TERMS_DISPLAY: Record<string, string> = {
  cod: 'COD', net_15: 'Net 15', net_30: 'Net 30', net_45: 'Net 45', net_60: 'Net 60', net_90: 'Net 90', prepaid: 'Prepaid', advance: 'Advance',
};

function buildSupplierMap(suppliers: any[]): SupplierMap {
  return Object.fromEntries(suppliers.map((s) => [
    s.id,
    { name: s.name, email: s.email || '', terms: PAYMENT_TERMS_DISPLAY[s.payment_terms] || s.payment_terms || '', currency: s.currency || 'TZS' },
  ]));
}

// ── API Mapping ────────────────────────────────────────────────────────────────

function mapApiBill(d: any): Bill {
  return {
    id: d.id, bill_number: d.bill_number,
    supplier_id: d.supplier_id || '', supplier_name: d.supplier_name || '',
    bill_date: d.bill_date ? String(d.bill_date).split('T')[0] : '',
    due_date: d.due_date ? String(d.due_date).split('T')[0] : '',
    status: (d.status || 'DRAFT') as BillStatus,
    currency: d.currency || 'USD',
    subtotal: Number(d.subtotal) || 0, tax_amount: Number(d.tax_amount) || 0,
    total: Number(d.total) || 0, paid_amount: Number(d.paid_amount) || 0,
    po_number: d.po_number || undefined, shipment_ref: d.shipment_ref || undefined,
    notes: d.notes || undefined, recurring_id: d.recurring_id || undefined,
    efd_receipt_number: d.efd_receipt_number || undefined,
    efd_verified: !!d.efd_verified,
    efd_verified_at: d.efd_verified_at || undefined,
    efd_verification_data: d.efd_verification_data || undefined,
    lines: Array.isArray(d.lines) ? d.lines.map((l: any) => ({
      _key: l.id || String(Math.random()), description: l.description || '',
      category: (l.category || 'OTHER') as BillCat,
      qty: Number(l.qty), unit_price: Number(l.unit_price), tax_rate: Number(l.tax_rate),
      tax_code_id: l.tax_code_id ?? null,
    })) : [],
    created_at: d.created_at || new Date().toISOString(),
  };
}

function mapApiRecurring(d: any): RecurringBill {
  return {
    id: d.id, name: d.name || '', supplier_id: d.supplier_id || '',
    supplier_name: d.supplier_name || '', frequency: (d.frequency || 'MONTHLY') as RecurFreq,
    currency: d.currency || 'USD', amount: Number(d.amount) || 0,
    tax_rate: Number(d.tax_rate) || 0, tax_code_id: d.tax_code_id ?? null, category: (d.category || 'OTHER') as BillCat,
    description: d.description || '', payment_terms: d.payment_terms || '',
    next_due: d.next_due ? String(d.next_due).split('T')[0] : '',
    end_date: d.end_date ? String(d.end_date).split('T')[0] : undefined,
    state: (d.state || 'ACTIVE') as RecurState,
    bills_generated: Number(d.bills_generated) || 0, total_spend: Number(d.total_spend) || 0,
    created_at: d.created_at || new Date().toISOString(),
  };
}

function mapApiPayment(d: any): Payment {
  return {
    id: d.id, bill_id: d.bill_id,
    amount: Number(d.amount) || 0, currency: d.currency || 'USD',
    date: d.payment_date ? String(d.payment_date).split('T')[0] : '',
    method: d.method || '', reference: d.reference || '', note: d.note || undefined,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number, cur = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style:'currency', currency: cur, maximumFractionDigits: cur === 'TZS' ? 0 : 2, minimumFractionDigits: 0 }).format(n); }
  catch { return `${cur} ${n.toFixed(2)}`; }
}
function fmtDate(d?: string | null) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); }
function genId()  { return 'bill-' + Math.random().toString(36).slice(2, 9); }
function genNum(bills: Bill[]) { return `BILL-${new Date().getFullYear()}-${String(bills.length + 1).padStart(3, '0')}`; }
function lineTotal(l: BillLine) { return l.qty * l.unit_price * (1 + l.tax_rate / 100); }
function calcTotals(lines: BillLine[]) {
  const subtotal   = lines.reduce((a, l) => a + l.qty * l.unit_price, 0);
  const tax_amount = lines.reduce((a, l) => a + l.qty * l.unit_price * l.tax_rate / 100, 0);
  return { subtotal, tax_amount, total: subtotal + tax_amount };
}
function isOverdue(b: Bill) { return (b.status === 'POSTED' || b.status === 'PARTIAL') && new Date(b.due_date) < new Date(); }
function daysOverdue(due: string) { return Math.floor((Date.now() - new Date(due).getTime()) / 86400000); }
function newKey() { return Math.random().toString(36).slice(2, 9); }

// ── StatusBadge ────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<BillStatus, 'gray' | 'info' | 'warning' | 'success' | 'error'> = {
  DRAFT: 'gray', POSTED: 'info', PARTIAL: 'warning', PAID: 'success', OVERDUE: 'error', VOID: 'gray',
};
function StatusBadge({ status }: { status: BillStatus }) {
  const c = STATUS_CFG[status];
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'gray'} className="inline-flex items-center gap-1 whitespace-nowrap">
      <span style={{ width:5, height:5, borderRadius:'50%', background:'currentColor', flexShrink:0 }} />{c.label}
    </Badge>
  );
}

function FreqBadge({ freq }: { freq: RecurFreq }) {
  const c = FREQ_CFG[freq];
  return <span style={{ padding:'2px 9px', borderRadius: 'var(--r)', fontSize:11, fontWeight:700, background:c.bg, color:c.color }}>{c.label}</span>;
}

// ── Pay Modal ──────────────────────────────────────────────────────────────────

function PayModal({ bill, onPay, onClose }: {
  bill: Bill;
  onPay: (amount: number, date: string, method: string, ref: string, note: string) => void;
  onClose: () => void;
}) {
  const { fmt } = useCurrency();
  const balance = bill.total - bill.paid_amount;
  const [amount, setAmount]   = useState(balance);
  const [date, setDate]       = useState(new Date().toISOString().split('T')[0]);
  const [method, setMethod]   = useState('Bank Transfer');
  const [ref, setRef]         = useState('');
  const [note, setNote]       = useState('');
  const inp: React.CSSProperties = { width:'100%', padding:'9px 12px', border:'1px solid var(--border)', borderRadius: 'var(--r)', fontSize:13, outline:'none', background:'var(--white)', boxSizing:'border-box' as const, color:'var(--ink)', fontFamily:'inherit' };
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--white)', borderRadius: 'var(--r)', padding:28, width:440, boxShadow: 'var(--elev-lg)' }}>
        <div style={{ fontSize:16, fontWeight:800, color:'var(--ink)', marginBottom:4 }}>Record Payment</div>
        <div style={{ fontSize:13, color:'var(--ink3)', marginBottom:20 }}>{bill.bill_number} · Balance: <strong>{fmt(balance, bill.currency)}</strong></div>
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>Payment Amount *</label>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:12, fontWeight:700, color:'var(--ink3)' }}>{bill.currency}</span>
            <input type="number" title="Amount" value={amount} min={0.01} step={0.01} max={balance}
              onChange={e => setAmount(parseFloat(e.target.value) || 0)}
              style={{ ...inp, paddingLeft: bill.currency.length * 8 + 12 }} />
          </div>
          {amount > balance && <div style={{ fontSize:11.5, color:'var(--red)', marginTop:4 }}>Amount exceeds outstanding balance ({fmt(balance, bill.currency)})</div>}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
          <div><label style={lbl}>Payment Date *</label><DatePicker date={parseDateOnly(date)} onChange={d => setDate(toDateOnlyString(d))} /></div>
          <div><label style={lbl}>Method</label><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div style={{ marginBottom:14 }}><label style={lbl}>Reference / Transaction ID</label><input type="text" title="Reference" placeholder="e.g. TRX-CRDB-20260625-001" value={ref} onChange={e => setRef(e.target.value)} style={{ ...inp, fontFamily:'var(--mono)', fontSize:12 }} /></div>
        <div style={{ marginBottom:20 }}><label style={lbl}>Note (optional)</label><input type="text" title="Note" placeholder="Payment note…" value={note} onChange={e => setNote(e.target.value)} style={inp} /></div>
        <div style={{ background:'var(--teal-l)', borderRadius:9, padding:'11px 14px', marginBottom:20, display:'flex', justifyContent:'space-between', fontSize:13 }}>
          <span style={{ color:'var(--ink2)' }}>After this payment</span>
          <span style={{ fontWeight:800, color: amount >= balance ? 'var(--green)' : 'var(--gold)' }}>{amount >= balance ? '✓ Fully Paid' : `${fmt(balance - amount, bill.currency)} remaining`}</span>
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button type="button" title="Cancel" onClick={onClose} style={{ padding:'var(--ds-btn-py) 18px', border:'1px solid var(--border)', borderRadius: 'var(--r)', background:'var(--bg)', cursor:'pointer', fontWeight:600, fontSize:13, color:'var(--ink2)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
          <button type="button" title="Confirm payment" disabled={amount <= 0 || amount > balance} onClick={() => onPay(amount, date, method, ref, note)}
            style={{ padding:'var(--ds-btn-py) 20px', border:'none', borderRadius: 'var(--r)', background: amount > 0 && amount <= balance ? 'hsl(var(--primary))' : 'var(--border)', color: amount > 0 && amount <= balance ? 'hsl(var(--primary-foreground))' : 'var(--ink3)', cursor: amount > 0 && amount <= balance ? 'pointer' : 'default', fontWeight:700, fontSize:13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bill Form (create / edit) ──────────────────────────────────────────────────

function BillFormView({ initial, allBills, suppliers, onSupplierCreated, onSave, onClose }: {
  initial?: Bill; allBills: Bill[]; suppliers: any[]; onSupplierCreated: (s: any) => void;
  onSave: (f: BillForm) => void; onClose: () => void;
}) {
  const { fmt } = useCurrency();
  // Purchase-side treatments only: a sales-only code has no meaning on a bill,
  // and the API refuses one anyway.
  const purchaseTaxCodes = useTaxCodes().filter(c => c.appliesTo !== 'SALES');

  const [f, setF] = useState<BillForm>({
    supplier_id:  initial?.supplier_id  ?? '',
    bill_date:    initial?.bill_date    ?? new Date().toISOString().split('T')[0],
    due_date:     initial?.due_date     ?? '',
    currency:     initial?.currency     ?? getCompany().currency,
    po_number:    initial?.po_number    ?? '',
    shipment_ref: initial?.shipment_ref ?? '',
    notes:        initial?.notes        ?? '',
    lines:        initial?.lines.length ? initial.lines : [{ _key:newKey(), description:'', category:'OTHER', qty:1, unit_price:0, tax_rate:0, tax_code_id:null }],
  });

  const [supplierItem, setSupplierItem] = useState<PickerItem | null>(() => {
    const s = suppliers.find((s: any) => s.id === (initial?.supplier_id ?? ''));
    return s ? { id: s.id, label: s.name, sublabel: s.email || undefined } : null;
  });

  async function searchSuppliersLocal(q: string): Promise<PickerItem[]> {
    const ql = q.trim().toLowerCase();
    const filtered = ql
      ? suppliers.filter((s: any) => (s.name || '').toLowerCase().includes(ql) || (s.email || '').toLowerCase().includes(ql))
      : suppliers;
    return filtered.slice(0, 25).map((s: any) => ({ id: s.id, label: s.name, sublabel: s.email || undefined }));
  }

  async function createSupplierInline(name: string): Promise<PickerItem> {
    const created = await apiFetch('/v1/suppliers', { method: 'POST', body: JSON.stringify({ name }) });
    onSupplierCreated(created);
    return { id: created.id, label: created.name };
  }

  function handleSupplierChange(item: PickerItem | null) {
    setSupplierItem(item);
    setF(p => {
      const n = { ...p, supplier_id: item?.id ?? '' };
      if (item && !initial) {
        const full = suppliers.find((s: any) => s.id === item.id);
        if (full?.currency) n.currency = full.currency;
      }
      return n;
    });
  }

  const [shipmentItem, setShipmentItem] = useState<PickerItem | null>(
    initial?.shipment_ref ? { id: initial.shipment_ref, label: initial.shipment_ref } : null,
  );

  async function searchShipmentsLocal(q: string): Promise<PickerItem[]> {
    const qs = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : '';
    const res = await apiFetch(`/v1/shipments${qs}`).catch(() => ({ data: [] }));
    const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
    return list.slice(0, 25).map((s) => ({
      id: s.ref_number, label: s.ref_number,
      sublabel: [s.customer_name, s.goods_desc].filter(Boolean).join(' · '),
    }));
  }

  function handleShipmentChange(item: PickerItem | null) {
    setShipmentItem(item);
    setField('shipment_ref', item?.id ?? '');
  }

  function setField<K extends keyof BillForm>(k: K, v: BillForm[K]) {
    setF(p => ({ ...p, [k]: v }));
  }
  function updateLine(key: string, field: keyof BillLine, val: BillLine[keyof BillLine]) {
    setF(p => ({ ...p, lines: p.lines.map(l => l._key === key ? { ...l, [field]: val } : l) }));
  }
  /** The treatment decides the rate, so a line never carries two answers. */
  function setLineTaxCode(key: string, codeId: string) {
    const tc = purchaseTaxCodes.find(c => c.id === codeId);
    setF(p => ({ ...p, lines: p.lines.map(l =>
      l._key === key ? { ...l, tax_code_id: codeId, tax_rate: tc ? tc.rate : l.tax_rate } : l) }));
  }
  function addLine()    { setF(p => ({ ...p, lines: [...p.lines, { _key:newKey(), description:'', category:'OTHER', qty:1, unit_price:0, tax_rate:0, tax_code_id:null }] })); }
  function removeLine(k:string) { setF(p => ({ ...p, lines: p.lines.filter(l => l._key !== k) })); }

  const totals = calcTotals(f.lines);
  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid var(--border)', borderRadius:7, fontSize:13, outline:'none', background:'var(--white)', boxSizing:'border-box' as const, color:'var(--ink)', fontFamily:'inherit' };
  const lbl: React.CSSProperties = { fontSize:11.5, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:4 };
  const sec: React.CSSProperties = { fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 };

  return (
    <FormPage
      title={initial ? `Edit ${initial.bill_number}` : 'New Bill'}
      subtitle="Supplier bill with line items"
      onCancel={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => { if (!f.supplier_id || !f.due_date) { showAlert('Supplier and due date are required.'); return; } onSave(f); }}>
            <Icon name="save" size={13} /> {initial ? 'Update Bill' : 'Save Bill'}
          </button>
        </>
      }
    >
      <div className="card">
          <div style={{ ...sec, marginTop:0 }}>Bill Details</div>
          <div style={{ marginBottom:12 }}>
            <EntityPicker
              label="Supplier *" value={supplierItem} onChange={handleSupplierChange}
              search={searchSuppliersLocal} onCreate={createSupplierInline}
              createLabel={(q) => `Create new supplier "${q}"`}
              placeholder="Search suppliers…"
            />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div><label style={lbl}>Bill Date *</label><DatePicker date={parseDateOnly(f.bill_date)} onChange={d => setField('bill_date', toDateOnlyString(d))} /></div>
            <div><label style={lbl}>Due Date *</label><DatePicker date={parseDateOnly(f.due_date)} onChange={d => setField('due_date', toDateOnlyString(d))} /></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
            <div>
                <label style={lbl}>Currency {f.currency === getCompany().currency && <span style={{ fontWeight:400, color:'var(--teal)', fontSize:10.5 }}>· company default</span>}</label>
                <Select value={f.currency} onValueChange={v => setField('currency', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              </div>
            <div><label style={lbl}>PO Reference</label><input type="text" title="PO number" placeholder="PO-2026-..." value={f.po_number} onChange={e => setField('po_number', e.target.value)} style={{ ...inp, fontFamily:'var(--mono)', fontSize:12 }} /></div>
            <div>
              <EntityPicker
                label="Shipment Ref" value={shipmentItem} onChange={handleShipmentChange}
                search={searchShipmentsLocal} placeholder="Search shipments…"
              />
            </div>
          </div>

          <div style={sec}>Line Items</div>
          <div style={{ border:'1px solid var(--border)', borderRadius: 'var(--r)', overflow:'hidden', marginBottom:14 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
              <thead>
                <tr style={{ background:'var(--bg)' }}>
                  {['Description','Category','Qty','Unit Price','Tax %','Total',''].map(h => (
                    <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'var(--ink3)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.03em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {f.lines.map((ln, i) => (
                  <tr key={ln._key} style={{ borderBottom: i < f.lines.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding:'7px 10px', minWidth:200 }}>
                      <input type="text" title="Description" placeholder="Service description…" value={ln.description} onChange={e => updateLine(ln._key, 'description', e.target.value)}
                        style={{ width:'100%', padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:12, outline:'none', boxSizing:'border-box' as const }} />
                    </td>
                    <td style={{ padding:'7px 8px' }}>
                      <Select value={ln.category} onValueChange={v => updateLine(ln._key, 'category', v as BillCat)}>
                        <SelectTrigger className="h-7 px-2 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ALL_CATS.map(c => <SelectItem key={c} value={c}>{CAT_CFG[c].label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td style={{ padding:'7px 6px' }}>
                      <input type="number" title="Qty" value={ln.qty} min={1} step={1} onChange={e => updateLine(ln._key, 'qty', parseFloat(e.target.value)||1)}
                        style={{ width:60, padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:12, outline:'none', textAlign:'right' }} />
                    </td>
                    <td style={{ padding:'7px 6px' }}>
                      <input type="number" title="Unit price" value={ln.unit_price} min={0} step={0.01} onChange={e => updateLine(ln._key, 'unit_price', parseFloat(e.target.value)||0)}
                        style={{ width:90, padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:12, outline:'none', textAlign:'right' }} />
                    </td>
                    {/* A treatment, not a bare rate. On a purchase the treatment is
                        what decides whether the tax is claimable at all — a blocked
                        purchase is charged 18% you never get back, and a rate box
                        cannot say so. */}
                    <td style={{ padding:'7px 6px' }}>
                      <Select value={ln.tax_code_id ?? ''} onValueChange={v => setLineTaxCode(ln._key, v)}>
                        <SelectTrigger aria-label="Tax treatment" style={{ minWidth:140, height:'auto', padding:'6px 8px', fontSize:12 }}>
                          <SelectValue placeholder="Not classified" />
                        </SelectTrigger>
                        <SelectContent>
                          {purchaseTaxCodes.map(tc => (
                            <SelectItem key={tc.id} value={tc.id}>
                              {tc.code} · {tc.rate}%{tc.inputTaxRecoverable ? '' : ' · blocked'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td style={{ padding:'7px 10px', fontWeight:700, fontSize:12, textAlign:'right', whiteSpace:'nowrap', color:'var(--ink)' }}>{fmt(lineTotal(ln), f.currency)}</td>
                    <td style={{ padding:'7px 6px' }}>
                      <button type="button" title="Remove line" onClick={() => removeLine(ln._key)} disabled={f.lines.length === 1}
                        style={{ background:'none', border:'none', cursor: f.lines.length === 1 ? 'default' : 'pointer', color: f.lines.length === 1 ? 'var(--border)' : 'var(--red)', display:'flex', padding:4 }}>
                        <Icon name="x" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <button type="button" title="Add line item" onClick={addLine}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'var(--ds-btn-py-sm) 12px', border:'1px dashed var(--border)', borderRadius:'var(--r)', background:'none', cursor:'pointer', fontWeight:600, fontSize:12, color:'var(--teal)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                <Icon name="plus" size={12} /> Add Line
              </button>
              <div style={{ textAlign:'right', fontSize:13 }}>
                <div style={{ color:'var(--ink3)', marginBottom:2 }}>Subtotal: <strong style={{ color:'var(--ink)' }}>{fmt(totals.subtotal, f.currency)}</strong></div>
                <div style={{ color:'var(--ink3)', marginBottom:2 }}>Tax: <strong style={{ color:'var(--ink)' }}>{fmt(totals.tax_amount, f.currency)}</strong></div>
                <div style={{ fontSize:15, fontWeight:800, color:'var(--teal)' }}>Total: {fmt(totals.total, f.currency)}</div>
              </div>
            </div>
          </div>

          <div><label style={lbl}>Notes</label><textarea title="Notes" placeholder="Payment terms, references, or other notes…" value={f.notes} onChange={e => setField('notes', e.target.value)} rows={3} style={{ ...inp, resize:'vertical' }} /></div>
        </div>
    </FormPage>
  );
}

// ── Recurring Bill Form ────────────────────────────────────────────────────────

function RecurFormView({ initial, suppliers, onSupplierCreated, onSave, onClose }: {
  initial?: RecurringBill; suppliers: any[]; onSupplierCreated: (s: any) => void;
  onSave: (f: RecurForm) => void; onClose: () => void;
}) {
  const { fmt } = useCurrency();
  const recurTaxCodes = useTaxCodes().filter(c => c.appliesTo !== 'SALES');

  const [f, setF] = useState<RecurForm>({
    name:          initial?.name          ?? '',
    supplier_id:   initial?.supplier_id   ?? '',
    frequency:     initial?.frequency     ?? 'MONTHLY',
    currency:      initial?.currency      ?? getCompany().currency,
    amount:        initial?.amount        ?? 0,
    tax_rate:      initial?.tax_rate      ?? 0,
    tax_code_id:   initial?.tax_code_id    ?? null,
    category:      initial?.category      ?? 'OTHER',
    description:   initial?.description   ?? '',
    payment_terms: initial?.payment_terms ?? 'Net 30',
    next_due:      initial?.next_due      ?? '',
    end_date:      initial?.end_date      ?? '',
  });
  const set = <K extends keyof RecurForm>(k: K, v: RecurForm[K]) => setF(p => ({ ...p, [k]: v }));

  const [supplierItem, setSupplierItem] = useState<PickerItem | null>(() => {
    const s = suppliers.find((s: any) => s.id === (initial?.supplier_id ?? ''));
    return s ? { id: s.id, label: s.name, sublabel: s.email || undefined } : null;
  });

  async function searchSuppliersLocal(q: string): Promise<PickerItem[]> {
    const ql = q.trim().toLowerCase();
    const filtered = ql
      ? suppliers.filter((s: any) => (s.name || '').toLowerCase().includes(ql) || (s.email || '').toLowerCase().includes(ql))
      : suppliers;
    return filtered.slice(0, 25).map((s: any) => ({ id: s.id, label: s.name, sublabel: s.email || undefined }));
  }

  async function createSupplierInline(name: string): Promise<PickerItem> {
    const created = await apiFetch('/v1/suppliers', { method: 'POST', body: JSON.stringify({ name }) });
    onSupplierCreated(created);
    return { id: created.id, label: created.name };
  }

  function handleSupplierChange(item: PickerItem | null) {
    setSupplierItem(item);
    set('supplier_id', item?.id ?? '');
  }
  const inp: React.CSSProperties = { width:'100%', padding:'9px 12px', border:'1px solid var(--border)', borderRadius: 'var(--r)', fontSize:13, outline:'none', background:'var(--white)', boxSizing:'border-box' as const, color:'var(--ink)', fontFamily:'inherit' };
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 };
  const total = f.amount * (1 + f.tax_rate / 100);
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.3)', zIndex:400 }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:480, background:'var(--white)', zIndex:401, display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.14)' }}>
        <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:'var(--ink)' }}>{initial ? 'Edit Recurring Bill' : 'New Recurring Bill'}</div>
            <div style={{ fontSize:12, color:'var(--ink3)', marginTop:2 }}>Auto-generates bills on schedule</div>
          </div>
          <button type="button" title="Close" onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', display:'flex', padding:4 }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
          <div style={{ marginBottom:14 }}><label style={lbl}>Template Name *</label><input type="text" title="Name" placeholder="e.g. Monthly Retainer" value={f.name} onChange={e => set('name', e.target.value)} style={inp} /></div>
          <div style={{ marginBottom:14 }}>
            <EntityPicker
              label="Supplier *" value={supplierItem} onChange={handleSupplierChange}
              search={searchSuppliersLocal} onCreate={createSupplierInline}
              createLabel={(q) => `Create new supplier "${q}"`}
              placeholder="Search suppliers…"
            />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
            <div><label style={lbl}>Frequency</label><Select value={f.frequency} onValueChange={v => set('frequency', v as RecurFreq)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ALL_FREQS.map(fr => <SelectItem key={fr} value={fr}>{FREQ_CFG[fr].label}</SelectItem>)}</SelectContent></Select></div>
            <div><label style={lbl}>Category</label><Select value={f.category} onValueChange={v => set('category', v as BillCat)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ALL_CATS.map(c => <SelectItem key={c} value={c}>{CAT_CFG[c].label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:12, marginBottom:14 }}>
            <div><label style={lbl}>Amount</label><input type="number" title="Amount" value={f.amount} min={0} step={0.01} onChange={e => set('amount', parseFloat(e.target.value)||0)} style={inp} /></div>
            <div>
                <label style={lbl}>Currency {f.currency === getCompany().currency && <span style={{ fontWeight:400, color:'var(--teal)', fontSize:10.5 }}>· company default</span>}</label>
                <Select value={f.currency} onValueChange={v => set('currency', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              </div>
            <div>
              <label style={lbl}>Tax treatment</label>
              <Select value={f.tax_code_id ?? ''} onValueChange={v => {
                const tc = recurTaxCodes.find(c => c.id === v);
                setF(p => ({ ...p, tax_code_id: v, tax_rate: tc ? tc.rate : p.tax_rate }));
              }}>
                <SelectTrigger><SelectValue placeholder="Not classified" /></SelectTrigger>
                <SelectContent>
                  {recurTaxCodes.map(tc => (
                    <SelectItem key={tc.id} value={tc.id}>
                      {tc.code} · {tc.rate}%{tc.inputTaxRecoverable ? '' : ' · blocked'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div style={{ marginBottom:14 }}><label style={lbl}>Description</label><textarea title="Description" placeholder="Description of the recurring charge…" value={f.description} onChange={e => set('description', e.target.value)} rows={2} style={{ ...inp, resize:'vertical' }} /></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
            <div><label style={lbl}>First / Next Due Date</label><DatePicker date={parseDateOnly(f.next_due)} onChange={d => set('next_due', toDateOnlyString(d))} /></div>
            <div><label style={lbl}>End Date (optional)</label><DatePicker date={parseDateOnly(f.end_date)} onChange={d => set('end_date', toDateOnlyString(d))} /></div>
          </div>
          <div style={{ marginBottom:14 }}><label style={lbl}>Payment Terms</label><Select value={f.payment_terms} onValueChange={v => set('payment_terms', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['Net 15','Net 30','Net 45','Net 60','COD','Advance'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
          <div style={{ background:'var(--teal-l)', borderRadius: 'var(--r)', padding:'14px 16px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--teal)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Preview</div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div><div style={{ fontWeight:700, color:'var(--ink)', fontSize:13 }}>{f.name || 'Template Name'}</div><div style={{ fontSize:11.5, color:'var(--ink3)', marginTop:2 }}>{supplierItem?.label ?? '—'} · {FREQ_CFG[f.frequency].label}</div></div>
              <div style={{ textAlign:'right' }}><div style={{ fontWeight:800, fontSize:16, color:'var(--teal)' }}>{fmt(total, f.currency)}</div><div style={{ fontSize:11, color:'var(--ink3)' }}>per period</div></div>
            </div>
          </div>
        </div>
        <div style={{ padding:'14px 22px', borderTop:'1px solid var(--border)', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button type="button" title="Cancel" onClick={onClose} style={{ padding:'var(--ds-btn-py) 18px', border:'1px solid var(--border)', borderRadius: 'var(--r)', background:'var(--bg)', cursor:'pointer', fontWeight:600, fontSize:13, color:'var(--ink2)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
          <button type="button" title="Save recurring" onClick={() => { if (!f.name||!f.supplier_id||!f.next_due) { showAlert('Name, supplier and next due date are required.'); return; } onSave(f); }}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'var(--ds-btn-py) 20px', border:'none', borderRadius: 'var(--r)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', cursor:'pointer', fontWeight:700, fontSize:13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="save" size={13} /> {initial ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Detail View ────────────────────────────────────────────────────────────────

function DetailView({ bill, payments, supplierMap, onBack, onEdit, onPay, onPost, onVoid, onVerifyEfd, isMobile = false }: {
  bill: Bill; payments: Payment[]; supplierMap: SupplierMap;
  onBack: () => void; onEdit: () => void;
  onPay: () => void; onPost: () => void; onVoid: () => void;
  onVerifyEfd: (rctvnum: string) => Promise<{ verified?: boolean; error?: string }>;
  isMobile?: boolean;
}) {
  const { fmt } = useCurrency();
  const myPmts = payments.filter(p => p.bill_id === bill.id);
  const balance = bill.total - bill.paid_amount;
  const over = isOverdue(bill);

  const [efdInput, setEfdInput] = useState(bill.efd_receipt_number || '');
  const [efdChecking, setEfdChecking] = useState(false);
  const [efdError, setEfdError] = useState<string | null>(null);

  const [activity, setActivity] = useState<{ id: string; action: string; detail: string | null; actor_name: string | null; created_at: string }[]>([]);
  useEffect(() => {
    apiFetch(`/v1/bills/${bill.id}/activity`).then((r: any) => setActivity(r?.data ?? [])).catch(() => setActivity([]));
  }, [bill.id]);

  async function runVerify() {
    if (!efdInput.trim() || efdChecking) return;
    setEfdChecking(true);
    setEfdError(null);
    try {
      const result = await onVerifyEfd(efdInput.trim());
      if (!result.verified) setEfdError(result.error || 'Receipt could not be verified against TRA');
    } catch (err: any) {
      setEfdError(err?.message || 'Verification request failed');
    } finally {
      setEfdChecking(false);
    }
  }

  return (
    <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'18px 32px', borderBottom:'1px solid var(--border)', background:'var(--white)' }}>
        <button type="button" title="Back" onClick={onBack} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', fontSize:13, fontWeight:600, marginBottom:14, padding:0 }}>
          <Icon name="arrowLeft" size={14} /> All Bills
        </button>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
              <span style={{ fontFamily:'var(--mono)', fontSize:18, fontWeight:800, color:'var(--teal)' }}>{bill.bill_number}</span>
              <StatusBadge status={bill.status} />
              {bill.recurring_id && <span style={{ fontSize:11, fontWeight:700, color:'#6e40c9', background:'#f3eeff', padding:'2px 8px', borderRadius: 'var(--r)' }}>Recurring</span>}
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:2 }}>{bill.supplier_name}</div>
            <div style={{ fontSize:12.5, color:'var(--ink3)' }}>Billed {fmtDate(bill.bill_date)} · Due {fmtDate(bill.due_date)}{over ? ` — ${daysOverdue(bill.due_date)} days overdue` : ''}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {bill.status === 'DRAFT' && <button type="button" title="Post bill" onClick={onPost} style={{ display:'flex', alignItems:'center', gap:6, padding:'var(--ds-btn-py) 14px', border:'1px solid var(--blue)', borderRadius: 'var(--r)', background:'var(--blue-l)', color:'var(--blue)', cursor:'pointer', fontWeight:700, fontSize:13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}><Icon name="send" size={13} /> Post</button>}
            {(bill.status === 'POSTED'||bill.status === 'PARTIAL'||bill.status === 'OVERDUE') && <button type="button" title="Record payment" onClick={onPay} style={{ display:'flex', alignItems:'center', gap:6, padding:'var(--ds-btn-py) 14px', border:'none', borderRadius: 'var(--r)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', cursor:'pointer', fontWeight:700, fontSize:13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}><Icon name="dollarSign" size={13} /> Pay</button>}
            <button type="button" title="Edit bill" onClick={onEdit} style={{ display:'flex', alignItems:'center', gap:6, padding:'var(--ds-btn-py) 14px', border:'1px solid var(--border)', borderRadius: 'var(--r)', background:'var(--bg)', color:'var(--ink2)', cursor:'pointer', fontWeight:600, fontSize:13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}><Icon name="edit" size={13} /> Edit</button>
            <button type="button" title="Print bill" onClick={() => window.print()} style={{ display:'flex', alignItems:'center', gap:6, padding:'var(--ds-btn-py) 14px', border:'1px solid var(--border)', borderRadius: 'var(--r)', background:'var(--bg)', color:'var(--ink2)', cursor:'pointer', fontWeight:600, fontSize:13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}><Icon name="printer" size={13} /></button>
            {bill.status !== 'VOID' && bill.status !== 'PAID' && <button type="button" title="Void bill" onClick={onVoid} style={{ padding:'var(--ds-btn-py) 10px', border:'1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--r)', background:'rgba(239,68,68,0.04)', color:'var(--red)', cursor:'pointer', fontWeight:600, fontSize:13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Void</button>}
          </div>
        </div>
        {over && <Banner variant="error" className="mt-3">Payment overdue by {daysOverdue(bill.due_date)} days. Balance: {fmt(balance, bill.currency)}</Banner>}
      </div>

      <div style={{ flex:1, display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', overflow:'hidden' }}>
        {/* Left */}
        <div style={{ overflowY:'auto', padding:'22px 28px', borderRight:'1px solid var(--border)' }}>
          {/* Line items */}
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:12 }}>Line Items</div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr style={{ background:'var(--bg)' }}>
                {['Description','Category','Qty','Unit Price','Tax','Total'].map(h => (
                  <th key={h} style={{ padding:'9px 12px', textAlign: h === 'Total' ? 'right' : 'left', fontWeight:700, color:'var(--ink2)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.03em', borderBottom:'1px solid var(--border)' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {bill.lines.map(l => (
                  <tr key={l._key} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'10px 12px', fontWeight:600 }}>{l.description}</td>
                    <td style={{ padding:'10px 12px' }}><span style={{ fontSize:11, fontWeight:700, color:CAT_CFG[l.category].color }}>{CAT_CFG[l.category].label}</span></td>
                    <td style={{ padding:'10px 12px', textAlign:'center', color:'var(--ink2)' }}>{l.qty}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', color:'var(--ink2)' }}>{fmt(l.unit_price, bill.currency)}</td>
                    <td style={{ padding:'10px 12px', textAlign:'center', color:'var(--ink3)', fontSize:12 }}>{l.tax_rate > 0 ? `${l.tax_rate}%` : '—'}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', fontWeight:700 }}>{fmt(lineTotal(l), bill.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ background:'var(--bg)', padding:'12px 16px', display:'flex', flexDirection:'column', gap:5, alignItems:'flex-end', borderTop:'2px solid var(--border)' }}>
              <div style={{ fontSize:13, color:'var(--ink2)' }}>Subtotal: <strong style={{ color:'var(--ink)', minWidth:100, display:'inline-block', textAlign:'right' }}>{fmt(bill.subtotal, bill.currency)}</strong></div>
              <div style={{ fontSize:13, color:'var(--ink2)' }}>Tax: <strong style={{ color:'var(--ink)', minWidth:100, display:'inline-block', textAlign:'right' }}>{fmt(bill.tax_amount, bill.currency)}</strong></div>
              <div style={{ fontSize:16, fontWeight:800, color:'var(--ink)' }}>Total: <span style={{ minWidth:100, display:'inline-block', textAlign:'right', color:'var(--teal)' }}>{fmt(bill.total, bill.currency)}</span></div>
              {bill.paid_amount > 0 && <div style={{ fontSize:13, color:'var(--green)' }}>Paid: <strong style={{ minWidth:100, display:'inline-block', textAlign:'right' }}>{fmt(bill.paid_amount, bill.currency)}</strong></div>}
              {balance > 0 && <div style={{ fontSize:14, fontWeight:800, color: over ? 'var(--red)' : 'var(--gold)' }}>Balance Due: <span style={{ minWidth:100, display:'inline-block', textAlign:'right' }}>{fmt(balance, bill.currency)}</span></div>}
            </div>
          </div>

          {/* Payment History */}
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:12 }}>Payment History</div>
            {myPmts.length === 0 ? (
              <div style={{ padding:'24px', textAlign:'center', background:'var(--bg)', borderRadius: 'var(--r)', fontSize:13, color:'var(--ink3)' }}>No payments recorded yet.</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                {myPmts.map((p, i) => (
                  <div key={p.id} style={{ display:'flex', gap:14, paddingBottom:14, position:'relative' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--green-l)', display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="checkCircle" size={16} color="var(--green)" /></div>
                      {i < myPmts.length - 1 && <div style={{ width:2, flex:1, background:'var(--border)', marginTop:4 }} />}
                    </div>
                    <div style={{ flex:1, paddingTop:4 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                        <span style={{ fontWeight:700, fontSize:14, color:'var(--green)' }}>{fmt(p.amount, p.currency)}</span>
                        <span style={{ fontSize:12, color:'var(--ink3)' }}>{fmtDate(p.date)}</span>
                      </div>
                      <div style={{ fontSize:12.5, color:'var(--ink2)' }}>{p.method}</div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:11.5, color:'var(--ink3)', marginTop:2 }}>{p.reference}</div>
                      {p.note && <div style={{ fontSize:12, color:'var(--ink3)', marginTop:2, fontStyle:'italic' }}>{p.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {bill.notes && <div style={{ marginTop:18, padding:'13px 15px', background:'var(--bg)', borderRadius:9, fontSize:13, color:'var(--ink2)', lineHeight:1.6 }}><strong style={{ color:'var(--ink)' }}>Notes:</strong> {bill.notes}</div>}

          {/* Activity Log */}
          <div style={{ marginTop:24 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:12 }}>Activity</div>
            <div className="inv-tab-list">
              {activity.length === 0 && <div className="inv-tab-empty">No activity recorded yet.</div>}
              {activity.map(e => (
                <div key={e.id} className="inv-audit-item">
                  <Icon name="activity" size={13} color="var(--teal)" />
                  <div className="inv-audit-body">
                    <span className="inv-audit-action">{e.action.replace(/_/g, ' ')}{e.detail ? `: ${e.detail}` : ''}</span>
                    <span className="inv-audit-ts">{e.actor_name ? `${e.actor_name} · ` : ''}{new Date(e.created_at).toLocaleString('en-GB')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ overflowY:'auto', padding:'22px 20px' }}>
          <div style={{ background:'var(--bg)', borderRadius: 'var(--r)', padding:'16px', marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:12 }}>Bill Summary</div>
            {[
              { l:'Supplier',   v: bill.supplier_name },
              { l:'Bill Date',  v: fmtDate(bill.bill_date) },
              { l:'Due Date',   v: <span style={{ color: over ? 'var(--red)' : 'inherit' }}>{fmtDate(bill.due_date)}</span> },
              { l:'Currency',   v: bill.currency },
              { l:'PO Ref',     v: bill.po_number ? <span style={{ fontFamily:'var(--mono)', fontSize:12 }}>{bill.po_number}</span> : '—' },
              { l:'Shipment',   v: bill.shipment_ref ? <span style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--blue)' }}>{bill.shipment_ref}</span> : '—' },
            ].map(r => (
              <div key={r.l} style={{ display:'flex', justifyContent:'space-between', fontSize:12.5, marginBottom:8 }}>
                <span style={{ color:'var(--ink3)' }}>{r.l}</span>
                <span style={{ fontWeight:600, color:'var(--ink)', textAlign:'right', maxWidth:'55%' }}>{r.v}</span>
              </div>
            ))}
          </div>
          <div style={{ background: over ? 'var(--red-l)' : balance === 0 ? 'var(--green-l)' : 'var(--gold-l)', borderRadius: 'var(--r)', padding:'16px', textAlign:'center' }}>
            <div style={{ fontSize:11, fontWeight:700, color: over ? 'var(--red)' : balance === 0 ? 'var(--green)' : 'var(--gold)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>{balance === 0 ? 'Fully Paid' : over ? 'OVERDUE' : 'Balance Due'}</div>
            <div style={{ fontSize:26, fontWeight:900, color: over ? 'var(--red)' : balance === 0 ? 'var(--green)' : 'var(--ink)', letterSpacing:'-0.5px' }}>{fmt(balance, bill.currency)}</div>
            <div style={{ fontSize:12, color:'var(--ink3)', marginTop:4 }}>of {fmt(bill.total, bill.currency)} total</div>
          </div>
          {bill.supplier_id && (
            <div style={{ marginTop:14, padding:'12px 14px', border:'1px solid var(--border)', borderRadius: 'var(--r)' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Supplier</div>
              <div style={{ fontWeight:700, fontSize:13, color:'var(--ink)', marginBottom:3 }}>{supplierMap[bill.supplier_id]?.name}</div>
              <div style={{ fontSize:12, color:'var(--teal)' }}>{supplierMap[bill.supplier_id]?.email}</div>
              <div style={{ fontSize:12, color:'var(--ink3)', marginTop:2 }}>Terms: {supplierMap[bill.supplier_id]?.terms}</div>
            </div>
          )}

          {/* EFD/VFD receipt verification against the TRA verify portal */}
          <div style={{ marginTop:14, padding:'12px 14px', border:'1px solid var(--border)', borderRadius: 'var(--r)' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>EFD/VFD Verification</div>
            {bill.efd_verified ? (
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                <Icon name="checkCircle" size={14} color="var(--green)" />
                <span style={{ fontSize:12.5, fontWeight:700, color:'var(--green)' }}>Verified</span>
              </div>
            ) : bill.efd_receipt_number ? (
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                <Icon name="alertTriangle" size={14} color="var(--red)" />
                <span style={{ fontSize:12.5, fontWeight:700, color:'var(--red)' }}>Not verified</span>
              </div>
            ) : null}
            {bill.efd_receipt_number && (
              <div style={{ fontFamily:'var(--mono)', fontSize:11.5, color:'var(--ink3)', marginBottom:8, wordBreak:'break-all' }}>{bill.efd_receipt_number}</div>
            )}
            <input
              type="text" placeholder="RCTVNUM from supplier's receipt" value={efdInput}
              onChange={e => setEfdInput(e.target.value)}
              style={{ width:'100%', padding:'7px 9px', borderRadius:6, border:'1px solid var(--border)', background:'var(--white)', color:'var(--ink)', fontSize:12.5, fontFamily:'var(--mono)', outline:'none', boxSizing:'border-box' as const, marginBottom:8 }}
            />
            <button type="button" onClick={runVerify} disabled={!efdInput.trim() || efdChecking}
              style={{ width:'100%', padding:'var(--ds-btn-py) 0', borderRadius:'var(--r)', border:'none', background: efdChecking ? 'var(--ink3)' : 'hsl(var(--primary))', color: efdChecking ? 'var(--white)' : 'hsl(var(--primary-foreground))', fontSize:13, fontWeight:700, cursor: efdChecking ? 'default' : 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {efdChecking ? 'Checking with TRA…' : 'Verify against TRA'}
            </button>
            {efdError && <div style={{ marginTop:8, fontSize:11.5, color:'var(--red)' }}>{efdError}</div>}
            {bill.efd_verified_at && <div style={{ marginTop:8, fontSize:11, color:'var(--ink3)' }}>Last checked {fmtDate(bill.efd_verified_at)}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Recurring Tab ──────────────────────────────────────────────────────────────

function RecurringTab({ recurring, onEdit, onToggle, onGenerate, onDelete, isMobile = false }: {
  recurring: RecurringBill[];
  onEdit: (r: RecurringBill) => void;
  onToggle: (r: RecurringBill) => void;
  onGenerate: (r: RecurringBill) => void;
  onDelete: (r: RecurringBill) => void;
  isMobile?: boolean;
}) {
  const totalMonthly = recurring.filter(r => r.frequency === 'MONTHLY' && r.state === 'ACTIVE').reduce((a,r) => a + r.amount * (1 + r.tax_rate/100), 0);

  return (
    <div>
      {/* Recurring summary cards */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap:14, marginBottom:20 }}>
        {[
          { label:'Active Recurring', value:String(recurring.filter(r => r.state==='ACTIVE').length), color:'var(--teal)', bg:'var(--teal-l)', icon:'refresh' as const },
          { label:'Monthly Commitment', value:`$${totalMonthly.toFixed(0)}`, color:'var(--blue)', bg:'var(--blue-l)', icon:'dollarSign' as const },
          { label:'Bills Generated', value:String(recurring.reduce((a,r) => a+r.bills_generated,0)), color:'var(--green)', bg:'var(--green-l)', icon:'receipt' as const },
        ].map(c => (
          <div key={c.label} style={{ background:c.bg, borderRadius: 'var(--r)', padding:'16px 18px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius: 'var(--r)', background:c.color, display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name={c.icon} size={16} color="#fff" /></div>
            <div><div style={{ fontWeight:800, fontSize:20, color:c.color }}>{c.value}</div><div style={{ fontSize:12, color:'var(--ink3)', marginTop:1 }}>{c.label}</div></div>
          </div>
        ))}
      </div>

      <div style={{ background:'var(--white)', borderRadius: 'var(--r)', border:'1px solid var(--border)', overflow:'hidden' }}>
        {recurring.length === 0 ? (
          <div style={{ padding:'64px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign:'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Icon name="refresh" size={32} color="var(--ink3)" />
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--ink)' }}>No recurring bills set up yet</div>
          </div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl">
            <thead><tr style={{ background:'var(--bg)' }}>
              {['Template','Supplier','Frequency','Amount','Category','Next Due','Bills','State',''].map(h => (
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, color:'var(--ink2)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.03em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {recurring.map(r => {
                const total = r.amount * (1 + r.tax_rate / 100);
                const dueD  = new Date(r.next_due);
                const dueSoon = dueD.getTime() - Date.now() < 14 * 86400000;
                return (
                  <tr key={r.id} style={{ borderBottom:'1px solid var(--border)', opacity: r.state === 'PAUSED' ? 0.55 : 1 }}>
                    <td style={{ padding:'12px 14px' }}><div style={{ fontWeight:700, color:'var(--ink)' }}>{r.name}</div><div style={{ fontSize:11.5, color:'var(--ink3)', marginTop:2 }}>{r.description.length > 50 ? r.description.slice(0,50)+'…' : r.description}</div></td>
                    <td style={{ padding:'12px 14px', fontSize:13, color:'var(--ink2)' }}>{r.supplier_name}</td>
                    <td style={{ padding:'12px 14px' }}><FreqBadge freq={r.frequency} /></td>
                    <td style={{ padding:'12px 14px', fontWeight:700 }}>{fmt(total, r.currency)}</td>
                    <td style={{ padding:'12px 14px' }}><span style={{ fontSize:11, fontWeight:700, color:CAT_CFG[r.category].color }}>{CAT_CFG[r.category].label}</span></td>
                    <td style={{ padding:'12px 14px', color: dueSoon && r.state==='ACTIVE' ? 'var(--gold)' : 'var(--ink2)', fontWeight: dueSoon ? 700 : 400 }}>{fmtDate(r.next_due)}{dueSoon && r.state==='ACTIVE' && <span style={{ fontSize:10, display:'block', color:'var(--gold)' }}>Due soon</span>}</td>
                    <td style={{ padding:'12px 14px', textAlign:'center', fontWeight:700, color:'var(--ink2)' }}>{r.bills_generated}</td>
                    <td style={{ padding:'12px 14px' }}><span style={{ padding:'2px 9px', borderRadius: 'var(--r)', fontSize:11, fontWeight:700, background: r.state==='ACTIVE'?'var(--green-l)':r.state==='PAUSED'?'var(--gold-l)':'var(--bg)', color: r.state==='ACTIVE'?'var(--green)':r.state==='PAUSED'?'var(--gold)':'var(--ink3)' }}>{r.state}</span></td>
                    <td style={{ padding:'12px 10px' }}>
                      <div style={{ display:'flex', gap:2 }}>
                        <button type="button" title="Generate bill now" onClick={() => onGenerate(r)} disabled={r.state !== 'ACTIVE'}
                          style={{ background:'none', border:'none', cursor: r.state==='ACTIVE'?'pointer':'default', color: r.state==='ACTIVE'?'var(--teal)':'var(--border)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }}>
                          <Icon name="zap" size={14} />
                        </button>
                        <button type="button" title="Edit recurring" onClick={() => onEdit(r)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }}><Icon name="edit" size={14} /></button>
                        <button type="button" title={r.state==='ACTIVE'?'Pause':'Resume'} onClick={() => onToggle(r)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gold)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }}><Icon name={r.state==='ACTIVE' ? 'pause' : 'chevronRight'} size={14} /></button>
                        <button type="button" title="Delete recurring" onClick={() => onDelete(r)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }}><Icon name="trash" size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

type MainTab  = 'bills'|'recurring';
type AppView  = 'list'|'detail'|'form';

export const Bills: React.FC = () => {
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const [bills, setBills]           = useState<Bill[]>([]);
  const [recurring, setRecurring]   = useState<RecurringBill[]>([]);
  const [payments, setPayments]     = useState<Payment[]>([]);
  const [suppliers, setSuppliers]   = useState<any[]>([]);
  const [tab, setTab]               = useState<MainTab>('bills');
  const [view, setView]             = useState<AppView>('list');
  const [selected, setSelected]     = useState<Bill | null>(null);
  const [formBill, setFormBill]     = useState<Bill | null>(null);
  const [formRecur, setFormRecur]   = useState<RecurringBill | null>(null);
  const [showBillForm, setShowBillForm]   = useState(false);
  const [showRecurForm, setShowRecurForm] = useState(false);
  const [payTarget, setPayTarget]   = useState<Bill | null>(null);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL'|BillStatus>('ALL');
  const [supFilter, setSupFilter]   = useState('ALL');
  const [sortBy, setSortBy]         = useState<'bill_date'|'due_date'|'total'|'supplier'>('due_date');
  const [sortDir, setSortDir]       = useState<'asc'|'desc'>('asc');
  const [voidTarget, setVoidTarget] = useState<Bill | null>(null);

  // Load from API on mount
  useEffect(() => {
    apiFetch('/v1/bills')
      .then((d: any) => { if (Array.isArray(d)) setBills(d.map(mapApiBill)); })
      .catch(() => {});
    apiFetch('/v1/bills/recurring')
      .then((d: any) => { if (Array.isArray(d)) setRecurring(d.map(mapApiRecurring)); })
      .catch(() => {});
    apiFetch('/v1/bills/payments')
      .then((d: any) => { if (Array.isArray(d)) setPayments(d.map(mapApiPayment)); })
      .catch(() => {});
    apiFetch('/v1/suppliers')
      .then((d: any) => { if (Array.isArray(d)) setSuppliers(d); })
      .catch(() => {});
  }, []);

  const supplierMap = useMemo(() => buildSupplierMap(suppliers), [suppliers]);
  function handleSupplierCreated(s: any) { setSuppliers(prev => [...prev, s]); }
  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.section === 'bills') { setShowBillForm(true); setFormBill(null); }
    }
    window.addEventListener('fin:new-doc', handler);
    return () => window.removeEventListener('fin:new-doc', handler);
  }, []);

  // computed status for display (inject OVERDUE dynamically)
  const effectiveBills = useMemo(() => bills.map(b => isOverdue(b) ? { ...b, status: 'OVERDUE' as BillStatus } : b), [bills]);

  const displayed = useMemo(() => effectiveBills
    .filter(b => {
      if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
      if (supFilter !== 'ALL' && b.supplier_id !== supFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return b.bill_number.toLowerCase().includes(q) || b.supplier_name.toLowerCase().includes(q) || (b.shipment_ref||'').toLowerCase().includes(q) || (b.po_number||'').toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a,b) => {
      let cmp = 0;
      if (sortBy==='bill_date') cmp = a.bill_date.localeCompare(b.bill_date);
      if (sortBy==='due_date')  cmp = a.due_date.localeCompare(b.due_date);
      if (sortBy==='total')     cmp = a.total - b.total;
      if (sortBy==='supplier')  cmp = a.supplier_name.localeCompare(b.supplier_name);
      return sortDir === 'asc' ? cmp : -cmp;
    }), [effectiveBills, statusFilter, supFilter, search, sortBy, sortDir]);

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => d==='asc'?'desc':'asc');
    else { setSortBy(col); setSortDir('asc'); }
  }
  function SortIco({ col }: { col: typeof sortBy }) {
    if (sortBy !== col) return null;
    return <Icon name={sortDir==='asc'?'arrowUp':'arrowDown'} size={10} color="var(--teal)" />;
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  function handleSaveBill(f: BillForm) {
    const t = calcTotals(f.lines);
    const now = new Date().toISOString();
    const isEdit = !!formBill;
    if (isEdit) {
      setBills(p => p.map(b => b.id === formBill!.id ? { ...b, ...f, ...t } : b));
      if (selected?.id === formBill!.id) setSelected({ ...selected, ...f, ...t });
    } else {
      const nb: Bill = { id:genId(), bill_number:genNum(bills), ...f, ...t, supplier_name: supplierMap[f.supplier_id]?.name ?? f.supplier_id, paid_amount:0, status:'DRAFT', created_at:now };
      setBills(p => [nb, ...p]);
    }
    setShowBillForm(false); setFormBill(null);
    const payload = {
      supplier_id: f.supplier_id, supplier_name: supplierMap[f.supplier_id]?.name || f.supplier_id,
      bill_date: f.bill_date, due_date: f.due_date, currency: f.currency,
      po_number: f.po_number || null, shipment_ref: f.shipment_ref || null, notes: f.notes || null,
      items: f.lines.map((l, i) => ({ description: l.description, category: l.category, qty: l.qty, unit_price: l.unit_price, tax_rate: l.tax_rate, tax_code_id: l.tax_code_id, sort_order: i })),
    };
    apiFetch(isEdit ? `/v1/bills/${formBill!.id}` : '/v1/bills', {
      method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(payload),
    }).then(() => apiFetch('/v1/bills'))
      .then((d: any) => { if (Array.isArray(d)) setBills(d.map(mapApiBill)); })
      .catch(() => {});
  }

  function handleSaveRecur(f: RecurForm) {
    const now = new Date().toISOString();
    const isEdit = !!formRecur;
    if (isEdit) {
      setRecurring(p => p.map(r => r.id === formRecur!.id ? { ...r, ...f } : r));
    } else {
      const nr: RecurringBill = { id:'rec-'+genId(), ...f, supplier_name: supplierMap[f.supplier_id]?.name ?? f.supplier_id, state:'ACTIVE', bills_generated:0, total_spend:0, created_at:now };
      setRecurring(p => [nr, ...p]);
    }
    setShowRecurForm(false); setFormRecur(null);
    const payload = { ...f, supplier_name: supplierMap[f.supplier_id]?.name || f.supplier_id };
    apiFetch(isEdit ? `/v1/bills/recurring/${formRecur!.id}` : '/v1/bills/recurring', {
      method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(payload),
    }).then(() => apiFetch('/v1/bills/recurring'))
      .then((d: any) => { if (Array.isArray(d)) setRecurring(d.map(mapApiRecurring)); })
      .catch(() => {});
  }

  function handlePost(bill: Bill) {
    setBills(p => p.map(b => b.id === bill.id ? { ...b, status:'POSTED' } : b));
    if (selected?.id === bill.id) setSelected({ ...selected, status:'POSTED' });
    apiFetch(`/v1/bills/${bill.id}`, { method:'PATCH', body:JSON.stringify({ status:'POSTED' }) }).catch(() => {});
  }

  function handleVoid(bill: Bill) {
    setBills(p => p.map(b => b.id === bill.id ? { ...b, status:'VOID' } : b));
    if (selected?.id === bill.id) setSelected({ ...selected, status:'VOID' });
    setVoidTarget(null);
    apiFetch(`/v1/bills/${bill.id}`, { method:'PATCH', body:JSON.stringify({ status:'VOID' }) }).catch(() => {});
  }

  async function handleVerifyEfd(bill: Bill, rctvnum: string) {
    const result = await apiFetch('/v1/tra/verify-receipt', {
      method: 'POST',
      body: JSON.stringify({ rctvnum, bill_id: bill.id }),
    });
    const patch = {
      efd_receipt_number: rctvnum,
      efd_verified: !!result.verified,
      efd_verified_at: new Date().toISOString(),
      efd_verification_data: result.data ?? { error: result.error },
    };
    setBills(p => p.map(b => b.id === bill.id ? { ...b, ...patch } : b));
    if (selected?.id === bill.id) setSelected({ ...selected, ...patch });
    return result;
  }

  function handlePay(bill: Bill, amount: number, date: string, method: string, ref: string, note: string) {
    const newPaid = bill.paid_amount + amount;
    const newStatus: BillStatus = newPaid >= bill.total ? 'PAID' : 'PARTIAL';
    const pid = 'pay-' + genId();
    setPayments(p => [...p, { id:pid, bill_id:bill.id, amount, currency:bill.currency, date, method, reference:ref, note }]);
    setBills(p => p.map(b => b.id === bill.id ? { ...b, paid_amount:newPaid, status:newStatus } : b));
    if (selected?.id === bill.id) setSelected({ ...selected, paid_amount:newPaid, status:newStatus });
    setPayTarget(null);
    apiFetch(`/v1/bills/${bill.id}/payment`, {
      method: 'POST', body: JSON.stringify({ amount, currency: bill.currency, payment_date: date, method, reference: ref, note }),
    }).then(() => Promise.all([apiFetch('/v1/bills'), apiFetch('/v1/bills/payments')]))
      .then(([billsRes, paymentsRes]: any) => {
        if (Array.isArray(billsRes)) setBills(billsRes.map(mapApiBill));
        if (Array.isArray(paymentsRes)) setPayments(paymentsRes.map(mapApiPayment));
      })
      .catch(() => {});
  }

  function handleGenerate(r: RecurringBill) {
    // Real, server-side generation (recurring-documents.service.ts) — the
    // same function the daily cron job calls, just targeted at one
    // template. Previously this button built the bill and PATCHed the
    // template's counters entirely client-side.
    apiFetch(`/v1/bills/recurring/${r.id}/generate`, { method: 'POST' })
      .then(() => Promise.all([apiFetch('/v1/bills'), apiFetch('/v1/bills/recurring')]))
      .then(([billsRes, recurRes]: any) => {
        if (Array.isArray(billsRes)) setBills(billsRes.map(mapApiBill));
        if (Array.isArray(recurRes)) setRecurring(recurRes.map(mapApiRecurring));
      })
      .catch((err: any) => showAlert(err.message || 'Failed to generate bill'));
  }

  // ── Metrics ─────────────────────────────────────────────────────────────────

  const totalBills   = bills.length;
  const unpaidBills  = effectiveBills.filter(b => b.status === 'POSTED' || b.status === 'PARTIAL' || b.status === 'OVERDUE');
  const overdueBills = effectiveBills.filter(b => b.status === 'OVERDUE');
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const paidThisMonth= effectiveBills.filter(b => b.status === 'PAID' && b.bill_date.startsWith(currentMonthStr));
  const outstanding  = unpaidBills.reduce((a,b) => a + (b.total - b.paid_amount), 0);
  const overdueAmt   = overdueBills.reduce((a,b) => a + (b.total - b.paid_amount), 0);

  const thS: React.CSSProperties = { padding:'10px 14px', textAlign:'left', fontWeight:700, color:'var(--ink2)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.03em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap', cursor:'pointer', userSelect:'none' };

  const uniqueSups = Array.from(new Set(bills.map(b => b.supplier_id)));

  // Full page rather than a 620px drawer — a bill carries a supplier picker,
  // dates, a line-item table and totals.
  if (showBillForm) {
    return (
      <BillFormView
        initial={formBill ?? undefined}
        allBills={bills}
        suppliers={suppliers}
        onSupplierCreated={handleSupplierCreated}
        onSave={handleSaveBill}
        onClose={() => { setShowBillForm(false); setFormBill(null); }}
      />
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Modals */}
      {payTarget && (
        <PayModal bill={payTarget} onClose={() => setPayTarget(null)}
          onPay={(a,d,m,r,n) => handlePay(payTarget, a, d, m, r, n)} />
      )}
      {voidTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--white)', borderRadius: 'var(--r)', padding:28, width:400 }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>Void Bill</div>
            <div style={{ fontSize:13, color:'var(--ink2)', marginBottom:20 }}>Void <strong>{voidTarget.bill_number}</strong>? This cannot be undone. Payments already recorded will remain.</div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button type="button" title="Cancel" onClick={() => setVoidTarget(null)} style={{ padding:'var(--ds-btn-py) 18px', border:'1px solid var(--border)', borderRadius: 'var(--r)', background:'var(--bg)', cursor:'pointer', fontWeight:600, fontSize:13, color:'var(--ink2)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
              <Button type="button" variant="destructive" title="Confirm void" onClick={() => handleVoid(voidTarget)}>Void Bill</Button>
            </div>
          </div>
        </div>
      )}
      {showRecurForm && (
        <RecurFormView initial={formRecur ?? undefined} suppliers={suppliers} onSupplierCreated={handleSupplierCreated} onSave={handleSaveRecur} onClose={() => { setShowRecurForm(false); setFormRecur(null); }} />
      )}

      {/* Detail view */}
      {view === 'detail' && selected ? (
        <DetailView
          bill={{ ...selected, status: isOverdue(selected) ? 'OVERDUE' : selected.status }}
          payments={payments}
          supplierMap={supplierMap}
          onBack={() => { setView('list'); setSelected(null); }}
          onEdit={() => { setFormBill(selected); setShowBillForm(true); }}
          onPay={() => setPayTarget(selected)}
          onPost={() => handlePost(selected)}
          onVoid={() => setVoidTarget(selected)}
          onVerifyEfd={(rctvnum) => handleVerifyEfd(selected, rctvnum)}
          isMobile={isMobile}
        />
      ) : (
        <div style={{ flex:1, overflowY:'auto', padding: 0 }}>
          <PageHeader
            crumbs={['FINANCE', 'BILLS']}
            titlePlain="Supplier "
            titleEm="bills"
            subtitle="Supplier invoices, payment tracking and recurring billing schedules."
          />

          {/* Metrics Row matching reference format */}
          <MetricsRow cards={[
            { title:'TOTAL BILLS', value:String(totalBills), sub1Label:'DRAFT', sub1Value:String(bills.filter(b=>b.status==='DRAFT').length), sub2Label:'PAID', sub2Value:String(bills.filter(b=>b.status==='PAID').length), barHighlight:'var(--teal)' },
            { title:'OUTSTANDING BALANCE', value:`TZS ${outstanding.toLocaleString()}`, invertTrend:true, sub1Label:'UNPAID BILLS', sub1Value:String(unpaidBills.length), sub2Label:'PARTIAL', sub2Value:String(bills.filter(b=>b.status==='PARTIAL').length), barHighlight:'var(--gold)' },
            { title:'OVERDUE BILLS', value:String(overdueBills.length), sub1Label:'OVERDUE AMOUNT', sub1Value:`TZS ${overdueAmt.toLocaleString()}`, sub2Label:'AVG DAYS OVERDUE', sub2Value:overdueBills.length ? String(Math.round(overdueBills.reduce((a,b)=>a+daysOverdue(b.due_date),0)/overdueBills.length)) : '0', barHighlight:'var(--red)' },
          ]} />

          {/* Toolbar — tabs + filters on the left, search + New Bill on the right,
              one row per CLAUDE.md's toolbar convention (was 3 stacked rows). */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', marginBottom: 18 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <Tabs value={tab} onValueChange={v => setTab(v as MainTab)} variant="segmented">
                <TabsList>
                  {([{k:'bills',l:'Bills'},{k:'recurring',l:`Recurring (${recurring.length})`}] as {k:MainTab;l:string}[]).map(t => (
                    <TabsTrigger key={t.k} value={t.k} title={t.l}>{t.l}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              {tab === 'bills' && (
                <>
                  <SingleSelectFilter
                    label="Status"
                    options={(['DRAFT','POSTED','PARTIAL','OVERDUE','PAID','VOID'] as const).map(s => ({ value: s, label: STATUS_CFG[s]?.label ?? s }))}
                    value={statusFilter === 'ALL' ? null : statusFilter}
                    onChange={v => setStatusFilter((v as BillStatus) ?? 'ALL')}
                  />
                  <Combobox
                    options={[{ value: 'ALL', label: 'All Suppliers' }, ...uniqueSups.map(id => ({ value: id, label: supplierMap[id]?.name ?? id }))]}
                    value={supFilter} onChange={setSupFilter} triggerClassName="w-44"
                  />
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
              <div style={{ position: 'relative', flex: isMobile ? 1 : '0 0 220px' }}>
                <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="search"
                  placeholder="Search bill # or supplier…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <button
                type="button"
                onClick={() => { setFormBill(null); setShowBillForm(true); }}
                style={{ padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25 }}
              >
                <Icon name="plus" size={14} color="hsl(var(--primary-foreground))" /> New Bill
              </button>
            </div>
          </div>

          {tab === 'recurring' ? (
            <RecurringTab
              recurring={recurring}
              onEdit={r => { setFormRecur(r); setShowRecurForm(true); }}
              onToggle={r => {
                const newState = r.state === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
                setRecurring(p => p.map(x => x.id===r.id ? { ...x, state:newState } : x));
                apiFetch(`/v1/bills/recurring/${r.id}`, { method:'PATCH', body:JSON.stringify({ state:newState }) }).catch(() => {});
              }}
              onGenerate={handleGenerate}
              onDelete={r => {
                setRecurring(p => p.filter(x => x.id!==r.id));
                apiFetch(`/v1/bills/recurring/${r.id}`, { method:'DELETE' }).catch(() => {});
              }}
              isMobile={isMobile}
            />
          ) : (
            <>
              {/* Bills Table */}
              <div style={{ background:'var(--white)', borderRadius: 'var(--r)', border:'1px solid var(--border)', overflow:'hidden' }}>
                {displayed.length === 0 ? (
                  <div style={{ padding:'64px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign:'center' }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                      <Icon name="receipt" size={32} color="var(--ink3)" />
                    </div>
                    <div style={{ fontSize:15, fontWeight:700, color:'var(--ink)' }}>No bills found</div>
                    <div style={{ fontSize:13, color:'var(--ink3)', marginTop:4 }}>Adjust filters or use "+ New Bill" above.</div>
                  </div>
                ) : (
                  <>
                  <div className="rtbl-wrap">
                    <table className="rtbl">
                      <thead>
                        <tr style={{ background:'var(--bg)' }}>
                          <th style={{ ...thS, cursor:'default' }}>Bill #</th>
                          <th style={{ ...thS }} onClick={() => toggleSort('supplier')}>Supplier <SortIco col="supplier" /></th>
                          <th style={{ ...thS }} onClick={() => toggleSort('bill_date')}>Billed <SortIco col="bill_date" /></th>
                          <th style={{ ...thS }} onClick={() => toggleSort('due_date')}>Due <SortIco col="due_date" /></th>
                          <th style={{ ...thS, textAlign:'right' }} onClick={() => toggleSort('total')}>Total <SortIco col="total" /></th>
                          <th style={{ ...thS, textAlign:'right' }}>Paid</th>
                          <th style={{ ...thS, textAlign:'right' }}>Balance</th>
                          <th style={{ ...thS, cursor:'default' }}>Ref</th>
                          <th style={{ ...thS, cursor:'default' }}>Status</th>
                          <th style={{ ...thS, cursor:'default' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayed.map(b => {
                          const bal = b.total - b.paid_amount;
                          const over = b.status === 'OVERDUE';
                          return (
                            <tr key={b.id}
                              onClick={() => { setSelected(bills.find(x => x.id===b.id) ?? null); setView('detail'); }}
                              style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background 0.1s', background: over && bal>0 ? 'rgba(239,68,68,0.02)' : '' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                              onMouseLeave={e => (e.currentTarget.style.background = over && bal>0 ? 'rgba(239,68,68,0.02)' : '')}>
                              <td style={{ padding:'11px 14px' }}>
                                <div style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color:'var(--teal)' }}>{b.bill_number}</div>
                                {b.recurring_id && <div style={{ fontSize:10, color:'#6e40c9', fontWeight:600, marginTop:2 }}>↻ Recurring</div>}
                              </td>
                              <td style={{ padding:'11px 14px' }}>
                                <div style={{ fontWeight:600, color:'var(--ink)' }}>{b.supplier_name}</div>
                                {b.po_number && <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--ink3)', marginTop:1 }}>{b.po_number}</div>}
                              </td>
                              <td style={{ padding:'11px 14px', color:'var(--ink2)', fontSize:12.5 }}>{fmtDate(b.bill_date)}</td>
                              <td style={{ padding:'11px 14px', color: over ? 'var(--red)' : 'var(--ink2)', fontWeight: over ? 700 : 400, fontSize:12.5 }}>
                                {fmtDate(b.due_date)}
                                {over && <div style={{ fontSize:10, color:'var(--red)', fontWeight:600 }}>{daysOverdue(b.due_date)}d late</div>}
                              </td>
                              <td style={{ padding:'11px 14px', textAlign:'right', fontWeight:700 }}>{fmt(b.total, b.currency)}</td>
                              <td style={{ padding:'11px 14px', textAlign:'right', color:'var(--green)', fontWeight: b.paid_amount>0 ? 700 : 400 }}>{b.paid_amount > 0 ? fmt(b.paid_amount, b.currency) : '—'}</td>
                              <td style={{ padding:'11px 14px', textAlign:'right', fontWeight: bal>0 ? 700 : 400, color: bal>0 ? (over ? 'var(--red)' : 'var(--ink)') : 'var(--ink3)' }}>{bal > 0 ? fmt(bal, b.currency) : '—'}</td>
                              <td style={{ padding:'11px 14px', fontFamily:'var(--mono)', fontSize:11.5, color:'var(--blue)' }}>{b.shipment_ref || '—'}</td>
                              <td style={{ padding:'11px 14px' }}><StatusBadge status={b.status} /></td>
                              <td style={{ padding:'11px 10px' }} onClick={e => e.stopPropagation()}>
                                <div style={{ display:'flex', gap:2 }}>
                                  <button type="button" title="View bill" onClick={() => { setSelected(bills.find(x=>x.id===b.id)??null); setView('detail'); }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }} onMouseEnter={e=>(e.currentTarget.style.background='var(--bg)')} onMouseLeave={e=>(e.currentTarget.style.background='none')}><Icon name="eye" size={14} /></button>
                                  {(b.status==='POSTED'||b.status==='PARTIAL'||b.status==='OVERDUE') && <button type="button" title="Pay" onClick={() => setPayTarget(bills.find(x=>x.id===b.id)??null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--teal)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }} onMouseEnter={e=>(e.currentTarget.style.background='var(--teal-l)')} onMouseLeave={e=>(e.currentTarget.style.background='none')}><Icon name="dollarSign" size={14} /></button>}
                                  <button type="button" title="Edit" onClick={() => { setFormBill(bills.find(x=>x.id===b.id)??null); setShowBillForm(true); }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }} onMouseEnter={e=>(e.currentTarget.style.background='var(--bg)')} onMouseLeave={e=>(e.currentTarget.style.background='none')}><Icon name="edit" size={14} /></button>
                                  {b.status!=='PAID'&&b.status!=='VOID' && <button type="button" title="Void" onClick={() => setVoidTarget(bills.find(x=>x.id===b.id)??null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }} onMouseEnter={e=>(e.currentTarget.style.background='var(--red-l)')} onMouseLeave={e=>(e.currentTarget.style.background='none')}><Icon name="xCircle" size={14} /></button>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', fontSize:12, color:'var(--ink3)', display:'flex', justifyContent:'space-between' }}>
                    <span>Showing {displayed.length} of {bills.length} bills</span>
                    <span>{overdueBills.length} overdue · {unpaidBills.length} outstanding</span>
                  </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
