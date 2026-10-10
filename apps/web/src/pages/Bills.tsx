import React, { useState, useMemo, useEffect, useRef } from 'react';
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
import { Input } from '../components/ui/input.js';
import { formatAmount } from '../lib/currency.js';
import { Button } from '../components/ui/button.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Textarea } from '../components/ui/textarea.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js';
import { showAlert } from '../lib/alert.js';
import { useTaxCodes } from '../data/taxCodeData.js';
import { useFinanceConfiguration } from '../hooks/useFinanceConfiguration.js';
import { useFinanceCapabilities } from '../hooks/useFinanceCapabilities.js';
import { Tip } from '../components/ui/tooltip.js';

// ── Types ──────────────────────────────────────────────────────────────────────

type BillStatus = 'DRAFT'|'PENDING_APPROVAL'|'POSTED'|'PARTIAL'|'PAID'|'OVERDUE'|'VOID';
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
  lines: BillLine[]; po_id?: string; po_number?: string; shipment_ref?: string; notes?: string;
  recurring_id?: string; created_at: string;
  business_line_id?: string;
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
  business_line_id?: string;
}

interface Payment {
  id: string; bill_id: string; amount: number; currency: string;
  date: string; method: string; reference: string; note?: string;
}

// form shapes
interface BillForm {
  supplier_id: string; bill_date: string; due_date: string;
  currency: string; po_id: string; po_number: string; shipment_ref: string; notes: string;
  business_line_id: string;
  lines: BillLine[];
}
interface RecurForm {
  name: string; supplier_id: string; frequency: RecurFreq; currency: string;
  amount: number; tax_rate: number; tax_code_id: string | null; category: BillCat; description: string;
  payment_terms: string; next_due: string; end_date: string;
  business_line_id: string;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<BillStatus, { label: string; color: string; bg: string }> = {
  DRAFT:   { label: 'Draft',    color: 'var(--ink3)',  bg: 'var(--bg)'       },
  PENDING_APPROVAL: { label: 'Pending approval', color: 'var(--gold)', bg: 'var(--gold-l)' },
  POSTED:  { label: 'Posted',   color: 'var(--blue)',  bg: 'var(--blue-l)'   },
  PARTIAL: { label: 'Partial',  color: 'var(--gold)',  bg: 'var(--gold-l)'   },
  PAID:    { label: 'Paid',     color: 'var(--green)', bg: 'var(--green-l)'  },
  OVERDUE: { label: 'Overdue',  color: 'var(--red)',   bg: 'var(--red-l)'    },
  VOID:    { label: 'Void',     color: 'var(--ink3)',  bg: 'var(--bg)',       },
};

const CAT_CFG: Record<BillCat, { label: string; color: string }> = {
  FREIGHT:      { label: 'Freight',        color: 'var(--blue)'   },
  CUSTOMS:      { label: 'Customs',        color: 'var(--ink)'   },
  PORT:         { label: 'Port Charges',   color: 'var(--red)'    },
  TRANSPORT:    { label: 'Transport',      color: 'var(--gold)'   },
  WAREHOUSE:    { label: 'Warehouse',      color: 'var(--green)'  },
  INSURANCE:    { label: 'Insurance',      color: 'var(--purple)' },
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
    po_id: d.po_id || undefined, po_number: d.po_number || undefined, shipment_ref: d.shipment_ref || undefined,
    notes: d.notes || undefined, recurring_id: d.recurring_id || undefined,
    business_line_id: d.business_line_id || undefined,
    efd_receipt_number: d.efd_receipt_number || undefined,
    efd_verified: !!d.efd_verified,
    efd_verified_at: d.efd_verified_at || undefined,
    efd_verification_data: d.efd_verification_data || undefined,
    lines: Array.isArray(d.items ?? d.lines) ? (d.items ?? d.lines).map((l: any) => ({
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
    business_line_id: d.business_line_id || undefined,
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
  DRAFT: 'gray', PENDING_APPROVAL: 'warning', POSTED: 'info', PARTIAL: 'warning', PAID: 'success', OVERDUE: 'error', VOID: 'gray',
};
function StatusBadge({ status }: { status: BillStatus }) {
  const c = STATUS_CFG[status];
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'gray'} className="inline-flex items-center gap-1 whitespace-nowrap">
      <span style={{ width:5, height:5, borderRadius:'50%', background:'currentColor', flexShrink:0 }} />{c.label}
    </Badge>
  );
}

const FREQ_VARIANT: Record<RecurFreq, 'error' | 'info' | 'brand' | 'success'> = {
  WEEKLY: 'error', MONTHLY: 'info', QUARTERLY: 'brand', ANNUAL: 'success',
};
function FreqBadge({ freq }: { freq: RecurFreq }) {
  return <Badge variant={FREQ_VARIANT[freq]}>{FREQ_CFG[freq].label}</Badge>;
}

// ── Pay Modal ──────────────────────────────────────────────────────────────────

function PayModal({ bill, onPay, onClose }: {
  bill: Bill;
  onPay: (amount: number, date: string, method: string, ref: string, note: string) => Promise<void>;
  onClose: () => void;
}) {
  const fmt = formatAmount;
  const [saving, setSaving] = useState(false);
  const balance = bill.total - bill.paid_amount;
  const [amount, setAmount]   = useState(balance);
  const [date, setDate]       = useState(new Date().toISOString().split('T')[0]);
  const [method, setMethod]   = useState('Bank Transfer');
  const [ref, setRef]         = useState('');
  const [note, setNote]       = useState('');
  const inp: React.CSSProperties = { width:'100%', padding:'9px 12px', border:'1px solid var(--border)', borderRadius: 'var(--r)', fontSize:13, outline:'none', background:'var(--white)', boxSizing:'border-box' as const, color:'var(--ink)', fontFamily:'inherit' };
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 };
  return (
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-110 gap-0" style={{ padding:28 }}>
        <DialogTitle style={{ fontSize:16, fontWeight:800, color:'var(--ink)', marginBottom:4 }}>Record Payment</DialogTitle>
        <div style={{ fontSize:13, color:'var(--ink3)', marginBottom:20 }}>{bill.bill_number} · Balance: <strong>{fmt(balance, bill.currency)}</strong></div>
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>Payment Amount *</label>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:12, fontWeight:700, color:'var(--ink3)' }}>{bill.currency}</span>
            <Input type="number" aria-label="Payment amount" value={amount} min={0.01} step={0.01} max={balance}
              onChange={e => setAmount(parseFloat(e.target.value) || 0)}
              style={{ ...inp, paddingLeft: bill.currency.length * 8 + 12 }} />
          </div>
          {amount > balance && <div style={{ fontSize:11.5, color:'var(--red)', marginTop:4 }}>Amount exceeds outstanding balance ({fmt(balance, bill.currency)})</div>}
        </div>
        <div className="mb-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label style={lbl}>Payment Date *</label><DatePicker date={parseDateOnly(date)} onChange={d => setDate(toDateOnlyString(d))} /></div>
          <div><label style={lbl}>Method</label><Select value={method} onValueChange={setMethod}><SelectTrigger aria-label="Payment method"><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div style={{ marginBottom:14 }}><label style={lbl}>Reference / Transaction ID</label><Input type="text" aria-label="Payment reference" maxLength={200} placeholder="e.g. TRX-CRDB-20260625-001" value={ref} onChange={e => setRef(e.target.value)} style={{ ...inp, fontFamily:'var(--font)', fontSize:12 }} /></div>
        <div style={{ marginBottom:20 }}><label style={lbl}>Note (optional)</label><Input type="text" aria-label="Payment note" maxLength={2000} placeholder="Payment note…" value={note} onChange={e => setNote(e.target.value)} style={inp} /></div>
        <div style={{ background:'var(--teal-l)', borderRadius: 'var(--r)', padding:'11px 14px', marginBottom:20, display:'flex', justifyContent:'space-between', fontSize:13 }}>
          <span style={{ color:'var(--ink2)' }}>After this payment</span>
          <span style={{ fontWeight:800, color: amount >= balance ? 'var(--green)' : 'var(--gold)' }}>{amount >= balance ? '✓ Fully Paid' : `${fmt(balance - amount, bill.currency)} remaining`}</span>
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || !Number.isFinite(amount) || amount <= 0 || amount > balance || !date} onClick={async () => {
            setSaving(true);
            try { await onPay(amount, date, method, ref, note); } finally { setSaving(false); }
          }}>{saving ? 'Recording…' : 'Confirm payment'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Bill Form (create / edit) ──────────────────────────────────────────────────

function BillFormView({ initial, allBills, suppliers, onSupplierCreated, onSave, onClose }: {
  initial?: Bill; allBills: Bill[]; suppliers: any[]; onSupplierCreated: (s: any) => void;
  onSave: (f: BillForm) => Promise<void>; onClose: () => void;
}) {
  const [savingBill, setSavingBill] = useState(false);
  const saveBillBusy = useRef(false);
  const { fmt } = useCurrency();
  // Purchase-side treatments only: a sales-only code has no meaning on a bill,
  // and the API refuses one anyway.
  const purchaseTaxCodes = useTaxCodes().filter(c => c.appliesTo !== 'SALES');
  const financeConfiguration = useFinanceConfiguration();
  const financeCapabilities = useFinanceCapabilities();
  const canUseBusinessLines = financeCapabilities.isEnabled('finance.accounting.advanced');

  const [f, setF] = useState<BillForm>({
    supplier_id:  initial?.supplier_id  ?? '',
    bill_date:    initial?.bill_date    ?? new Date().toISOString().split('T')[0],
    due_date:     initial?.due_date     ?? '',
    currency:     initial?.currency     ?? getCompany().currency,
    po_id:        initial?.po_id        ?? '',
    po_number:    initial?.po_number    ?? '',
    shipment_ref: initial?.shipment_ref ?? '',
    notes:        initial?.notes        ?? '',
    business_line_id: initial?.business_line_id ?? '',
    lines:        initial?.lines.length ? initial.lines : [{ _key:newKey(), description:'', category:'OTHER', qty:1, unit_price:0, tax_rate:0, tax_code_id:null }],
  });

  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  useEffect(() => {
    apiFetch('/v1/purchase-orders')
      .then((result: any) => setPurchaseOrders(Array.isArray(result?.purchase_orders) ? result.purchase_orders : []))
      .catch(() => setPurchaseOrders([]));
  }, []);

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
  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid var(--border)', borderRadius: 'var(--r)', fontSize:13, outline:'none', background:'var(--white)', boxSizing:'border-box' as const, color:'var(--ink)', fontFamily:'inherit' };
  const lbl: React.CSSProperties = { fontSize:11.5, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:4 };
  const sec: React.CSSProperties = { fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 };

  return (
    <FormPage
      title={initial ? `Edit ${initial.bill_number}` : 'New Bill'}
      subtitle="Supplier bill with line items"
      onCancel={onClose}
      actions={
        <>
          <Button type="button" variant="outline" disabled={savingBill} onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={savingBill} onClick={async () => { if (saveBillBusy.current) return; if (!f.supplier_id || !f.due_date) { showAlert('Supplier and due date are required.'); return; } saveBillBusy.current = true; setSavingBill(true); try { await onSave(f); } finally { saveBillBusy.current = false; setSavingBill(false); } }}>
            <Icon name="save" size={13} /> {savingBill ? 'Saving…' : initial ? 'Update Bill' : 'Save Bill'}
          </Button>
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
            <div>
              <label style={lbl}>Purchase Order</label>
              <Combobox
                options={purchaseOrders
                  .filter(po => !f.supplier_id || !po.supplier_id || po.supplier_id === f.supplier_id)
                  .map(po => ({ value: po.id, label: po.po_number, sublabel: po.supplier_name || undefined }))}
                value={f.po_id}
                onChange={value => {
                  const po = purchaseOrders.find(item => item.id === value);
                  setF(current => ({
                    ...current,
                    po_id: value,
                    po_number: po?.po_number ?? '',
                    business_line_id: po?.business_line_id ?? current.business_line_id,
                  }));
                }}
                placeholder="No linked purchase order"
                disabled={Boolean(initial && initial.status !== 'DRAFT')}
              />
            </div>
            <div>
              <EntityPicker
                label="Shipment Ref" value={shipmentItem} onChange={handleShipmentChange}
                search={searchShipmentsLocal} placeholder="Search shipments…"
              />
            </div>
          </div>
          {canUseBusinessLines && (
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>Business Line</label>
              <Combobox
                options={financeConfiguration.data?.businessLines.filter(line => line.active || line.id === f.business_line_id).map(line => ({ value: line.id, label: `${line.name} · ${line.code}` })) ?? []}
                value={f.business_line_id}
                onChange={value => setField('business_line_id', value)}
                placeholder="No business line"
                disabled={Boolean(initial && initial.status !== 'DRAFT')}
              />
            </div>
          )}

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
                        style={{ width:'100%', padding:'6px 8px', border:'1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize:12, outline:'none', boxSizing:'border-box' as const }} />
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
                        style={{ width:60, padding:'6px 8px', border:'1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize:12, outline:'none', textAlign:'right' }} />
                    </td>
                    <td style={{ padding:'7px 6px' }}>
                      <input type="number" title="Unit price" value={ln.unit_price} min={0} step={0.01} onChange={e => updateLine(ln._key, 'unit_price', parseFloat(e.target.value)||0)}
                        style={{ width:90, padding:'6px 8px', border:'1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize:12, outline:'none', textAlign:'right' }} />
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
                      <Tip label="Remove line">
                        <span>
                          <button type="button" aria-label="Remove line" onClick={() => removeLine(ln._key)} disabled={f.lines.length === 1}
                            style={{ background:'none', border:'none', cursor: f.lines.length === 1 ? 'default' : 'pointer', color: f.lines.length === 1 ? 'var(--border)' : 'var(--red)', display:'flex', padding:4 }} data-ui-native-button="">
                            <Icon name="x" size={13} />
                          </button>
                        </span>
                      </Tip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <button type="button" onClick={addLine}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'var(--ds-btn-py-sm) 12px', border:'1px dashed var(--border)', borderRadius:'var(--r)', background:'none', cursor:'pointer', fontWeight:600, fontSize:12, color:'var(--teal)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
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
  const financeConfiguration = useFinanceConfiguration();
  const financeCapabilities = useFinanceCapabilities();
  const canUseBusinessLines = financeCapabilities.isEnabled('finance.accounting.advanced');

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
    business_line_id: initial?.business_line_id ?? '',
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
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent className="w-120 sm:max-w-120 flex flex-col p-0 gap-0">
        <SheetHeader style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)' }}>
          <SheetTitle style={{ fontWeight:800, fontSize:15, color:'var(--ink)' }}>{initial ? 'Edit Recurring Bill' : 'New Recurring Bill'}</SheetTitle>
          <div style={{ fontSize:12, color:'var(--ink3)', marginTop:2 }}>Auto-generates bills on schedule</div>
        </SheetHeader>
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
          {canUseBusinessLines && (
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>Business Line</label>
              <Combobox
                options={financeConfiguration.data?.businessLines.filter(line => line.active || line.id === f.business_line_id).map(line => ({ value: line.id, label: `${line.name} · ${line.code}` })) ?? []}
                value={f.business_line_id}
                onChange={value => set('business_line_id', value)}
                placeholder="No business line"
              />
            </div>
          )}
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
          <button type="button" onClick={onClose} style={{ padding:'var(--ds-btn-py) 18px', border:'1px solid var(--border)', borderRadius: 'var(--r)', background:'var(--bg)', cursor:'pointer', fontWeight:600, fontSize:13, color:'var(--ink2)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">Cancel</button>
          <button type="button" onClick={() => { if (!f.name||!f.supplier_id||!f.next_due) { showAlert('Name, supplier and next due date are required.'); return; } onSave(f); }}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'var(--ds-btn-py) 20px', border:'none', borderRadius: 'var(--r)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', cursor:'pointer', fontWeight:700, fontSize:13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
            <Icon name="save" size={13} /> {initial ? 'Update' : 'Create'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
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
  const financeConfiguration = useFinanceConfiguration();
  const businessLine = financeConfiguration.data?.businessLines.find(line => line.id === bill.business_line_id);
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
        <button type="button" onClick={onBack} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', fontSize:13, fontWeight:600, marginBottom:14, padding:0 }} data-ui-native-button="">
          <Icon name="arrowLeft" size={14} /> All Bills
        </button>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
              <span style={{ fontFamily:'var(--font)', fontSize:18, fontWeight:800, color:'var(--teal)' }}>{bill.bill_number}</span>
              <StatusBadge status={bill.status} />
              {bill.recurring_id && <Badge variant="brand">Recurring</Badge>}
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:2 }}>{bill.supplier_name}</div>
            <div style={{ fontSize:12.5, color:'var(--ink3)' }}>Billed {fmtDate(bill.bill_date)} · Due {fmtDate(bill.due_date)}{over ? ` — ${daysOverdue(bill.due_date)} days overdue` : ''}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {(bill.status === 'DRAFT' || bill.status === 'PENDING_APPROVAL') && <button type="button" onClick={onPost} style={{ display:'flex', alignItems:'center', gap:6, padding:'var(--ds-btn-py) 14px', border:'1px solid var(--blue)', borderRadius: 'var(--r)', background:'var(--blue-l)', color:'var(--blue)', cursor:'pointer', fontWeight:700, fontSize:13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button=""><Icon name="send" size={13} /> {bill.status === 'DRAFT' ? 'Submit' : 'Approve'}</button>}
            {(bill.status === 'POSTED'||bill.status === 'PARTIAL'||bill.status === 'OVERDUE') && <button type="button" onClick={onPay} style={{ display:'flex', alignItems:'center', gap:6, padding:'var(--ds-btn-py) 14px', border:'none', borderRadius: 'var(--r)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', cursor:'pointer', fontWeight:700, fontSize:13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button=""><Icon name="dollarSign" size={13} /> Pay</button>}
            <button type="button" onClick={onEdit} style={{ display:'flex', alignItems:'center', gap:6, padding:'var(--ds-btn-py) 14px', border:'1px solid var(--border)', borderRadius: 'var(--r)', background:'var(--bg)', color:'var(--ink2)', cursor:'pointer', fontWeight:600, fontSize:13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button=""><Icon name="edit" size={13} /> Edit</button>
            <Tip label="Print bill">
              <button type="button" aria-label="Print bill" onClick={() => window.print()} style={{ display:'flex', alignItems:'center', gap:6, padding:'var(--ds-btn-py) 14px', border:'1px solid var(--border)', borderRadius: 'var(--r)', background:'var(--bg)', color:'var(--ink2)', cursor:'pointer', fontWeight:600, fontSize:13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button=""><Icon name="printer" size={13} /></button>
            </Tip>
            {bill.status !== 'VOID' && bill.status !== 'PAID' && <button type="button" onClick={onVoid} style={{ padding:'var(--ds-btn-py) 10px', border:'1px solid var(--red)', borderRadius: 'var(--r)', background:'var(--red-l)', color:'var(--red)', cursor:'pointer', fontWeight:600, fontSize:13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">Void</button>}
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
                      <div style={{ fontFamily:'var(--font)', fontSize:11.5, color:'var(--ink3)', marginTop:2 }}>{p.reference}</div>
                      {p.note && <div style={{ fontSize:12, color:'var(--ink3)', marginTop:2, fontStyle:'italic' }}>{p.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {bill.notes && <div style={{ marginTop:18, padding:'13px 15px', background:'var(--bg)', borderRadius: 'var(--r)', fontSize:13, color:'var(--ink2)', lineHeight:1.6 }}><strong style={{ color:'var(--ink)' }}>Notes:</strong> {bill.notes}</div>}

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
              { l:'Business Line', v: businessLine ? `${businessLine.name} (${businessLine.code})` : '—' },
              { l:'PO Ref',     v: bill.po_number ? <span style={{ fontFamily:'var(--font)', fontSize:12 }}>{bill.po_number}</span> : '—' },
              { l:'Shipment',   v: bill.shipment_ref ? <span style={{ fontFamily:'var(--font)', fontSize:12, color:'var(--blue)' }}>{bill.shipment_ref}</span> : '—' },
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
              <div style={{ fontFamily:'var(--font)', fontSize:11.5, color:'var(--ink3)', marginBottom:8, wordBreak:'break-all' }}>{bill.efd_receipt_number}</div>
            )}
            <input
              type="text" placeholder="RCTVNUM from supplier's receipt" value={efdInput}
              onChange={e => setEfdInput(e.target.value)}
              style={{ width:'100%', padding:'7px 9px', borderRadius: 'var(--r-sm)', border:'1px solid var(--border)', background:'var(--white)', color:'var(--ink)', fontSize:12.5, fontFamily:'var(--font)', outline:'none', boxSizing:'border-box' as const, marginBottom:8 }}
            />
            <button type="button" onClick={runVerify} disabled={!efdInput.trim() || efdChecking}
              style={{ width:'100%', padding:'var(--ds-btn-py) 0', borderRadius:'var(--r)', border:'none', background: efdChecking ? 'var(--ink3)' : 'hsl(var(--primary))', color: efdChecking ? 'var(--white)' : 'hsl(var(--primary-foreground))', fontSize:13, fontWeight:700, cursor: efdChecking ? 'default' : 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
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

interface RecurringSummary { active: number; generated: number; monthly: {currency:string;amount:number}[] }
function RecurringTab({ recurring, summary, onEdit, onToggle, onGenerate, onDelete, isMobile = false }: {
  recurring: RecurringBill[];
  summary: RecurringSummary;
  onEdit: (r: RecurringBill) => void;
  onToggle: (r: RecurringBill) => void;
  onGenerate: (r: RecurringBill) => void;
  onDelete: (r: RecurringBill) => void;
  isMobile?: boolean;
}) {

  return (
    <div>
      {/* Recurring summary cards */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap:14, marginBottom:20 }}>
        {[
          { label:'Active Recurring', value:String(summary.active), color:'var(--teal)', bg:'var(--teal-l)', icon:'refresh' as const },
          { label:'Monthly Commitment', value:summary.monthly.map(item => fmt(item.amount,item.currency)).join(' · ') || '—', color:'var(--blue)', bg:'var(--blue-l)', icon:'dollarSign' as const },
          { label:'Bills Generated', value:String(summary.generated), color:'var(--green)', bg:'var(--green-l)', icon:'receipt' as const },
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
                        <Tip label="Generate bill now"><span><button type="button" aria-label="Generate bill now" onClick={() => onGenerate(r)} disabled={r.state !== 'ACTIVE'}
                          style={{ background:'none', border:'none', cursor: r.state==='ACTIVE'?'pointer':'default', color: r.state==='ACTIVE'?'var(--teal)':'var(--border)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }} data-ui-native-button="">
                          <Icon name="zap" size={14} />
                        </button></span></Tip>
                        <Tip label="Edit recurring bill"><button type="button" aria-label="Edit recurring bill" onClick={() => onEdit(r)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }} data-ui-native-button=""><Icon name="edit" size={14} /></button></Tip>
                        <Tip label={r.state==='ACTIVE'?'Pause recurring bill':'Resume recurring bill'}><button type="button" aria-label={r.state==='ACTIVE'?'Pause recurring bill':'Resume recurring bill'} onClick={() => onToggle(r)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gold)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }} data-ui-native-button=""><Icon name={r.state==='ACTIVE' ? 'pause' : 'chevronRight'} size={14} /></button></Tip>
                        <Tip label="Delete recurring bill"><button type="button" aria-label="Delete recurring bill" onClick={() => onDelete(r)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }} data-ui-native-button=""><Icon name="trash" size={14} /></button></Tip>
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
  const [recurringPage,setRecurringPage] = useState(1);
  const [recurringTotal,setRecurringTotal] = useState(0);
  const [recurringSummary,setRecurringSummary] = useState<RecurringSummary>({active:0,generated:0,monthly:[]});
  const [recurringRefresh,setRecurringRefresh] = useState(0);
  const [recurringLoading,setRecurringLoading] = useState(true);
  const [recurringError,setRecurringError] = useState('');
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
  const [voidReason, setVoidReason] = useState('');

  const [page, setPage] = useState(1);
  const [matchCount, setMatchCount] = useState(0);
  const [loadingBills, setLoadingBills] = useState(false);
  const [billError, setBillError] = useState('');
  const [billRefresh, setBillRefresh] = useState(0);
  const [billSummary, setBillSummary] = useState<any>(null);
  const filterKey = JSON.stringify([search, statusFilter, supFilter, sortBy, sortDir]);
  const previousFilters = useRef(filterKey);
  useEffect(() => {
    if (previousFilters.current !== filterKey) { previousFilters.current = filterKey; setPage(1); }
  }, [filterKey]);
  const billQuery = new URLSearchParams({ page: String(page), page_size: '25', sort_by: sortBy, sort_dir: sortDir });
  if (search.trim()) billQuery.set('search', search.trim());
  if (statusFilter !== 'ALL') billQuery.set('status', statusFilter);
  if (supFilter !== 'ALL') billQuery.set('supplier_id', supFilter);
  const billListUrl = `/v1/bills?${billQuery}`;
  useEffect(() => {
    let active = true;
    setLoadingBills(true);
    const timer = setTimeout(() => {
      apiFetch(billListUrl).then((data: any) => {
        if (!active) return;
        setBills(data.items.map(mapApiBill)); setMatchCount(data.total); setBillError('');
        if (page > 1 && !data.items.length) setPage(Math.max(1, data.total_pages));
      }).catch(error => { if (active) { setBills([]); setBillError(error.message); } })
        .finally(() => { if (active) setLoadingBills(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [billListUrl, billRefresh]);
  useEffect(() => {
    let active = true;
    apiFetch('/v1/bills/stats').then(data => { if (active) setBillSummary(data); }).catch(error => { if (active) setBillError(error.message); });
    return () => { active = false; };
  }, [billRefresh]);
  useEffect(() => {
    let active=true;setRecurringLoading(true);setRecurringError('');
    apiFetch(`/v1/bills/recurring?page=${recurringPage}&page_size=25`).then(data=>{
      if(!active)return;
      setRecurring(data.items.map(mapApiRecurring));setRecurringTotal(data.total);setRecurringSummary(data.summary);
      if(recurringPage>1&&!data.items.length)setRecurringPage(Math.max(1,Math.ceil(data.total/25)));
    }).catch(error=>{if(active){setRecurring([]);setRecurringError(error.message);}}).finally(()=>{if(active)setRecurringLoading(false);});
    return()=>{active=false;};
  },[recurringPage,recurringRefresh]);
  // Load from API on mount
  useEffect(() => {
    apiFetch('/v1/suppliers')
      .then((d: any) => { if (Array.isArray(d)) setSuppliers(d); })
      .catch((err: unknown) => showAlert(err instanceof Error ? err.message : 'Could not load suppliers.'));
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

  const displayed = loadingBills ? [] : effectiveBills;

  const openBillSequence = useRef(0);
  async function openBill(id: string, edit = false) {
    const sequence = ++openBillSequence.current;
    try {
      const payload = await apiFetch(`/v1/bills/${id}`);
      const full = mapApiBill(payload);
      if (sequence !== openBillSequence.current) return;
      setPayments((payload.payments ?? []).map((payment: any) => mapApiPayment({ ...payment, bill_number: payload.bill_number, supplier_name: payload.supplier_name })));
      if (edit) { setFormBill(full); setShowBillForm(true); }
      else { setSelected(full); setView('detail'); }
    } catch (error) { showAlert(error instanceof Error ? error.message : 'Could not open bill.'); }
  }
  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => d==='asc'?'desc':'asc');
    else { setSortBy(col); setSortDir('asc'); }
  }
  function SortIco({ col }: { col: typeof sortBy }) {
    if (sortBy !== col) return null;
    return <Icon name={sortDir==='asc'?'arrowUp':'arrowDown'} size={10} color="var(--teal)" />;
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async function handleSaveBill(f: BillForm) {
    const isEdit = !!formBill;
    const payload = {
      supplier_id: f.supplier_id, supplier_name: supplierMap[f.supplier_id]?.name || f.supplier_id,
      bill_date: f.bill_date, due_date: f.due_date, currency: f.currency,
      po_id: f.po_id || null, po_number: f.po_number || null, shipment_ref: f.shipment_ref || null, notes: f.notes || null,
      business_line_id: f.business_line_id || null,
      items: f.lines.map((l, i) => ({ description: l.description, category: l.category, qty: l.qty, unit_price: l.unit_price, tax_rate: l.tax_rate, tax_code_id: l.tax_code_id, sort_order: i })),
    };
    try {
      await apiFetch(isEdit ? `/v1/bills/${formBill!.id}` : '/v1/bills', {
        method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(payload),
      });
      setBillRefresh(value => value + 1);
      setShowBillForm(false); setFormBill(null);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not save this bill.');
    }
  }

  async function handleSaveRecur(f: RecurForm) {
    const isEdit = !!formRecur;
    const payload = { ...f, supplier_name: supplierMap[f.supplier_id]?.name || f.supplier_id };
    try {
      await apiFetch(isEdit ? `/v1/bills/recurring/${formRecur!.id}` : '/v1/bills/recurring', {
        method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(payload),
      });
      setRecurringRefresh(value=>value+1);
      setShowRecurForm(false); setFormRecur(null);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not save this recurring bill.');
    }
  }

  async function handlePost(bill: Bill) {
    try {
      const action = bill.status === 'PENDING_APPROVAL' ? 'approve' : 'submit';
      const updated = await apiFetch(`/v1/bills/${bill.id}/${action}`, { method:'POST' });
      const mapped = mapApiBill(updated);
      setBills(p => p.map(b => b.id === bill.id ? mapped : b));
      if (selected?.id === bill.id) setSelected({ ...mapped, lines: selected.lines });
      setBillRefresh(value => value + 1);
      showAlert(mapped.status === 'PENDING_APPROVAL' ? 'Bill submitted for approval.' : 'Bill posted successfully.', { variant: 'success' });
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not submit this bill.');
    }
  }

  async function handleVoid(bill: Bill) {
    if (!voidReason.trim()) return showAlert('A reason is required to void this bill.');
    try {
      await apiFetch(`/v1/bills/${bill.id}/void`, { method:'POST', body:JSON.stringify({ reason:voidReason.trim() }) });
      const updated = { ...bill, status:'VOID' as BillStatus };
      setBills(p => p.map(b => b.id === bill.id ? updated : b));
      if (selected?.id === bill.id) setSelected(updated);
      setVoidTarget(null);
      setVoidReason('');
      setBillRefresh(value => value + 1);
      showAlert('Bill voided and its journal entries were reversed.', { variant: 'success' });
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not void this bill.');
    }
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

  const paymentAttempt = useRef<{signature:string;key:string}|null>(null);
  const paymentBusy = useRef(false);
  async function handlePay(bill: Bill, amount: number, date: string, method: string, ref: string, note: string) {
    if (paymentBusy.current) return;
    const signature = JSON.stringify([bill.id,amount,date,method,ref,note]);
    if(paymentAttempt.current?.signature !== signature) paymentAttempt.current = {signature,key:crypto.randomUUID()};
    paymentBusy.current = true;
    try {
      const recorded = await apiFetch(`/v1/bills/${bill.id}/payment`, {
        method: 'POST', headers: {'Idempotency-Key':paymentAttempt.current!.key}, body: JSON.stringify({ amount, currency: bill.currency, payment_date: date, method, reference: ref, note }),
      });
      const paidBill = { ...bill, paid_amount: Number(recorded.paid_amount), status: recorded.status as BillStatus };
      setBills(prev => prev.map(item => item.id === bill.id ? paidBill : item));
      if (selected?.id === bill.id) setSelected(paidBill);
      paymentAttempt.current = null;
      setPayTarget(null);
      setBillRefresh(value => value + 1);
      try {
      const full = await apiFetch(`/v1/bills/${bill.id}`);
      if (selected?.id === bill.id) {
        setSelected(mapApiBill(full));
        setPayments((full.payments ?? []).map((payment: any) => mapApiPayment({ ...payment, bill_number: full.bill_number, supplier_name: full.supplier_name })));
      }
      } catch { showAlert('Payment recorded. Could not refresh bills; reload to see the latest history.'); }
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not record this payment.');
    }
    finally { paymentBusy.current = false; }
  }

  function handleGenerate(r: RecurringBill) {
    // Real, server-side generation (recurring-documents.service.ts) — the
    // same function the daily cron job calls, just targeted at one
    // template. Previously this button built the bill and PATCHed the
    // template's counters entirely client-side.
    apiFetch(`/v1/bills/recurring/${r.id}/generate`, { method: 'POST' })
      .then(() => {
        setBillRefresh(value => value + 1);
        setRecurringRefresh(value=>value+1);
      })
      .catch((err: any) => showAlert(err.message || 'Failed to generate bill'));
  }

  // ── Metrics ─────────────────────────────────────────────────────────────────

  const totalBills   = billSummary?.total_bills ?? 0;
  const unpaidBills  = effectiveBills.filter(b => b.status === 'POSTED' || b.status === 'PARTIAL' || b.status === 'OVERDUE');
  const overdueBills = effectiveBills.filter(b => b.status === 'OVERDUE');
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const paidThisMonth= effectiveBills.filter(b => b.status === 'PAID' && b.bill_date.startsWith(currentMonthStr));
  const outstanding  = unpaidBills.reduce((a,b) => a + (b.total - b.paid_amount), 0);
  const overdueAmt   = overdueBills.reduce((a,b) => a + (b.total - b.paid_amount), 0);

  const thS: React.CSSProperties = { padding:'10px 14px', textAlign:'left', fontWeight:700, color:'var(--ink2)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.03em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap', cursor:'pointer', userSelect:'none' };

  const uniqueSups = suppliers.map(supplier => supplier.id);

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
      <Dialog open={!!voidTarget} onOpenChange={o => { if (!o) { setVoidTarget(null); setVoidReason(''); } }}>
        <DialogContent className="max-w-100 gap-0" style={{ padding:28 }}>
          {voidTarget && (
            <>
              <DialogTitle style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>Void Bill</DialogTitle>
              <div style={{ fontSize:13, color:'var(--ink2)', marginBottom:12 }}>Void <strong>{voidTarget.bill_number}</strong>? The related journal entries will be reversed.</div>
              <Textarea value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Reason for voiding" className="mb-5" />
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button type="button" onClick={() => setVoidTarget(null)} style={{ padding:'var(--ds-btn-py) 18px', border:'1px solid var(--border)', borderRadius: 'var(--r)', background:'var(--bg)', cursor:'pointer', fontWeight:600, fontSize:13, color:'var(--ink2)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">Cancel</button>
                <Button type="button" variant="destructive" onClick={() => handleVoid(voidTarget)}>Void Bill</Button>
              </div>

            </>
          )}
        </DialogContent>
      </Dialog>
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
            titlePlain="Supplier"
            titleEm="bills"
            subtitle="Supplier invoices, payment tracking and recurring billing schedules."
          />

          {/* Metrics Row matching reference format */}
          <MetricsRow cards={[
            { title:'TOTAL BILLS', value:String(totalBills), sub1Label:'DRAFT', sub1Value:String(billSummary?.status_counts?.DRAFT ?? 0), sub2Label:'PAID', sub2Value:String(billSummary?.status_counts?.PAID ?? 0), barHighlight:'var(--teal)' },
            { title:'OUTSTANDING · TZS', value:formatAmount(billSummary?.currency_totals?.TZS?.outstanding ?? 0, 'TZS'), invertTrend:true, sub1Label:'UNPAID BILLS', sub1Value:String((billSummary?.status_counts?.POSTED ?? 0) + (billSummary?.status_counts?.PARTIAL ?? 0)), sub2Label:'PARTIAL', sub2Value:String(billSummary?.status_counts?.PARTIAL ?? 0), barHighlight:'var(--gold)' },
            { title:'OVERDUE · TZS', value:String(billSummary?.currency_totals?.TZS?.overdue_count ?? 0), sub1Label:'OVERDUE AMOUNT', sub1Value:formatAmount(billSummary?.currency_totals?.TZS?.overdue_amount ?? 0, 'TZS'), sub2Label:'CURRENCY', sub2Value:'TZS', barHighlight:'var(--red)' },
          ]} />

          {/* Toolbar — tabs + filters on the left, search + New Bill on the right,
              one row per CLAUDE.md's toolbar convention (was 3 stacked rows). */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', marginBottom: 18 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <Tabs value={tab} onValueChange={v => setTab(v as MainTab)} variant="segmented">
                <TabsList>
                  {([{k:'bills',l:'Bills'},{k:'recurring',l:`Recurring (${recurringTotal})`}] as {k:MainTab;l:string}[]).map(t => (
                    <TabsTrigger key={t.k} value={t.k} title={t.l}>{t.l}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              {tab === 'bills' && (
                <>
                  <SingleSelectFilter
                    label="Status"
                    options={(['DRAFT','PENDING_APPROVAL','POSTED','PARTIAL','OVERDUE','PAID','VOID'] as const).map(s => ({ value: s, label: STATUS_CFG[s]?.label ?? s }))}
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
              {tab === 'bills' && <div style={{ position: 'relative', flex: isMobile ? 1 : '0 0 220px' }}>
                <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="search"
                  placeholder="Search bill # or supplier…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>}
              <Button onClick={() => { if(tab==='recurring'){setFormRecur(null);setShowRecurForm(true);}else{setFormBill(null);setShowBillForm(true);} }}>
                <Icon name="plus" size={14} /> {tab==='recurring'?'New recurring bill':'New Bill'}
              </Button>
            </div>
          </div>

          {tab === 'recurring' ? (
            <>
            {recurringError && <div role="alert">{recurringError} <Button variant="outline" onClick={()=>setRecurringRefresh(value=>value+1)}>Retry</Button></div>}
            {recurringLoading ? <SectionLoading label="Loading recurring bills…" /> : <RecurringTab
              recurring={recurring}
              summary={recurringSummary}
              onEdit={r => { setFormRecur(r); setShowRecurForm(true); }}
              onToggle={async r => {
                const newState = r.state === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
                try {
                  await apiFetch(`/v1/bills/recurring/${r.id}`, { method:'PATCH', body:JSON.stringify({ state:newState }) });
                  setRecurringRefresh(value=>value+1);
                } catch (err) {
                  showAlert(err instanceof Error ? err.message : 'Could not update this recurring bill.');
                }
              }}
              onGenerate={handleGenerate}
              onDelete={async r => {
                try {
                  await apiFetch(`/v1/bills/recurring/${r.id}`, { method:'DELETE' });
                  setRecurringRefresh(value=>value+1);
                } catch (err) {
                  showAlert(err instanceof Error ? err.message : 'Could not delete this recurring bill.');
                }
              }}
              isMobile={isMobile}
            />}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span>{recurringTotal} templates · Page {recurringPage} of {Math.max(1,Math.ceil(recurringTotal/25))}</span><div className="flex gap-2"><Button variant="outline" disabled={recurringLoading||recurringPage===1} onClick={()=>setRecurringPage(value=>value-1)}>Previous</Button><Button variant="outline" disabled={recurringLoading||recurringPage*25>=recurringTotal} onClick={()=>setRecurringPage(value=>value+1)}>Next</Button></div></div>
            </>
          ) : (
            <>
              {billError && <div role="alert" className="mb-3 text-sm" style={{color:'var(--red)'}}>{billError} <Button variant="outline" onClick={() => setBillRefresh(value => value + 1)}>Retry</Button></div>}
              {/* Bills Table */}
              <div style={{ background:'var(--white)', borderRadius: 'var(--r)', border:'1px solid var(--border)', overflow:'hidden' }}>
                {displayed.length === 0 ? (
                  <div style={{ padding:'64px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign:'center' }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                      <Icon name="receipt" size={32} color="var(--ink3)" />
                    </div>
                    <div style={{ fontSize:15, fontWeight:700, color:'var(--ink)' }}>{loadingBills ? 'Loading bills…' : billError ? 'Could not load bills' : 'No bills found'}</div>
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
                              onClick={() => void openBill(b.id)}
                              style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background 0.1s', background: over && bal>0 ? 'rgba(239,68,68,0.02)' : '' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                              onMouseLeave={e => (e.currentTarget.style.background = over && bal>0 ? 'rgba(239,68,68,0.02)' : '')}>
                              <td style={{ padding:'11px 14px' }}>
                                <div style={{ fontFamily:'var(--font)', fontSize:12, fontWeight:700, color:'var(--teal)' }}>{b.bill_number}</div>
                                {b.recurring_id && <div style={{ fontSize:10, color:'var(--purple)', fontWeight:600, marginTop:2 }}>↻ Recurring</div>}
                              </td>
                              <td style={{ padding:'11px 14px' }}>
                                <div style={{ fontWeight:600, color:'var(--ink)' }}>{b.supplier_name}</div>
                                {b.po_number && <div style={{ fontSize:11, fontFamily:'var(--font)', color:'var(--ink3)', marginTop:1 }}>{b.po_number}</div>}
                              </td>
                              <td style={{ padding:'11px 14px', color:'var(--ink2)', fontSize:12.5 }}>{fmtDate(b.bill_date)}</td>
                              <td style={{ padding:'11px 14px', color: over ? 'var(--red)' : 'var(--ink2)', fontWeight: over ? 700 : 400, fontSize:12.5 }}>
                                {fmtDate(b.due_date)}
                                {over && <div style={{ fontSize:10, color:'var(--red)', fontWeight:600 }}>{daysOverdue(b.due_date)}d late</div>}
                              </td>
                              <td style={{ padding:'11px 14px', textAlign:'right', fontWeight:700 }}>{formatAmount(b.total, b.currency)}</td>
                              <td style={{ padding:'11px 14px', textAlign:'right', color:'var(--green)', fontWeight: b.paid_amount>0 ? 700 : 400 }}>{b.paid_amount > 0 ? formatAmount(b.paid_amount, b.currency) : '—'}</td>
                              <td style={{ padding:'11px 14px', textAlign:'right', fontWeight: bal>0 ? 700 : 400, color: bal>0 ? (over ? 'var(--red)' : 'var(--ink)') : 'var(--ink3)' }}>{bal > 0 ? formatAmount(bal, b.currency) : '—'}</td>
                              <td style={{ padding:'11px 14px', fontFamily:'var(--font)', fontSize:11.5, color:'var(--blue)' }}>{b.shipment_ref || '—'}</td>
                              <td style={{ padding:'11px 14px' }}><StatusBadge status={b.status} /></td>
                              <td style={{ padding:'11px 10px' }} onClick={e => e.stopPropagation()}>
                                <div style={{ display:'flex', gap:2 }}>
                                  <Tip label="View bill"><button type="button" aria-label="View bill" onClick={() => void openBill(b.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }} onMouseEnter={e=>(e.currentTarget.style.background='var(--hover-bg)')} onMouseLeave={e=>(e.currentTarget.style.background='none')} data-ui-native-button=""><Icon name="eye" size={14} /></button></Tip>
                                  {(b.status==='POSTED'||b.status==='PARTIAL'||b.status==='OVERDUE') && <Tip label="Record payment"><button type="button" aria-label="Record payment" onClick={() => setPayTarget(bills.find(x=>x.id===b.id)??null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--teal)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }} onMouseEnter={e=>(e.currentTarget.style.background='var(--teal-l)')} onMouseLeave={e=>(e.currentTarget.style.background='none')} data-ui-native-button=""><Icon name="dollarSign" size={14} /></button></Tip>}
                                  <Tip label="Edit bill"><button type="button" aria-label="Edit bill" onClick={() => void openBill(b.id, true)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }} onMouseEnter={e=>(e.currentTarget.style.background='var(--hover-bg)')} onMouseLeave={e=>(e.currentTarget.style.background='none')} data-ui-native-button=""><Icon name="edit" size={14} /></button></Tip>
                                  {b.status!=='PAID'&&b.status!=='VOID' && <Tip label="Void bill"><button type="button" aria-label="Void bill" onClick={() => setVoidTarget(bills.find(x=>x.id===b.id)??null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red)', padding:5, borderRadius:'var(--r-sm)', display:'flex' }} onMouseEnter={e=>(e.currentTarget.style.background='var(--red-l)')} onMouseLeave={e=>(e.currentTarget.style.background='none')} data-ui-native-button=""><Icon name="xCircle" size={14} /></button></Tip>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', fontSize:12, color:'var(--ink3)', display:'flex', justifyContent:'space-between' }}>
                    <span>Showing {displayed.length} of {matchCount} matching bills</span>
                    <span>Page records: {overdueBills.length} overdue · {unpaidBills.length} outstanding</span>
                  </div>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 py-3" aria-label="Bill pagination">
                <span>Page {page} of {Math.max(1, Math.ceil(matchCount/25))}</span>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={loadingBills || page===1} onClick={() => setPage(value => value-1)}>Previous</Button>
                  <Button variant="outline" disabled={loadingBills || page*25>=matchCount} onClick={() => setPage(value => value+1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
