import { FinanceDocumentListExport } from '../components/FinanceDocumentListExport.js';
import { useFinanceDraft, clearFinanceDrafts, hasFinanceDraft } from '../hooks/useFinanceDraft.js';
import { useFinanceDocumentRoute } from '../hooks/useFinanceDocumentRoute.js';
import { FinanceDocumentActions } from '../components/FinanceDocumentActions.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { SectionCard } from '../components/SectionCard.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SkeletonTable } from '../components/ui/skeleton.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { Input } from '../components/ui/input.js';
import { formatAmount, formatCompact } from '../lib/currency.js';
import { Button } from '../components/ui/button.js';
import { Textarea } from '../components/ui/textarea.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js';
import { showAlert } from '../lib/alert.js';
import { useTaxCodes } from '../data/taxCodeData.js';
import { useFinanceConfiguration } from '../hooks/useFinanceConfiguration.js';
import { useFinanceCapabilities } from '../hooks/useFinanceCapabilities.js';
import { Tip } from '../components/ui/tooltip.js';
import { FinanceCatalogPicker } from '../components/FinanceCatalogPicker.js';
import { financeCatalogOptions } from '@hudumika/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type BillStatus = 'DRAFT'|'PENDING_APPROVAL'|'POSTED'|'PARTIAL'|'PAID'|'OVERDUE'|'VOID';
type RecurFreq  = 'WEEKLY'|'MONTHLY'|'QUARTERLY'|'ANNUAL';
type RecurState = 'ACTIVE'|'PAUSED'|'ENDED';
type BillCat = string;

interface BillLine {
  _key: string; description: string; category: BillCat;
  qty: number; unit_price: number; tax_rate: number; tax_code_id: string | null;
}

interface Bill {
  id: string; bill_number: string; supplier_id: string; supplier_name: string;
  bill_date: string; due_date: string; status: BillStatus; currency: string;
  subtotal: number; tax_amount: number; total: number; paid_amount: number; credited_amount?: number;
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
    total: Number(d.total) || 0, paid_amount: Number(d.paid_amount) || 0, credited_amount: Number(d.credited_amount) || 0,
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
  return formatAmount(n, cur);
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
  const balance = Math.max(0, bill.total - bill.paid_amount - (bill.credited_amount ?? 0));
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
        <div style={{ marginBottom:14 }}><label style={lbl}>Reference / Transaction ID</label><Input type="text" aria-label="Payment reference" maxLength={200} placeholder="e.g. TRX-CRDB-20260625-001" value={ref} onChange={e => setRef(e.target.value)} style={{ ...inp, fontFamily:'var(--font)', fontSize:"var(--text-base)" }} /></div>
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

  const [f, setF] = useFinanceDraft<BillForm>('f',{
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
    return s ? { id: s.id, label: s.name, sublabel: s.email || undefined, avatarUserId: s.id, avatarKind: 'suppliers' as const, avatarType: 'company' as const } : null;
  });

  async function searchSuppliersLocal(q: string): Promise<PickerItem[]> {
    const ql = q.trim().toLowerCase();
    const filtered = ql
      ? suppliers.filter((s: any) => (s.name || '').toLowerCase().includes(ql) || (s.email || '').toLowerCase().includes(ql))
      : suppliers;
    return filtered.slice(0, 25).map((s: any) => ({
      id: s.id,
      label: s.name,
      sublabel: s.email || undefined,
      avatarUserId: s.id,
      avatarKind: 'suppliers' as const,
      avatarType: 'company' as const,
      avatarUrl: s.avatar_url || s.logo_url || undefined,
    }));
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
      title={initial ? `Edit ${initial.bill_number}` : 'New bill'}
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
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap:12, marginBottom:12 }}>
            <div><label style={lbl}>Bill Date *</label><DatePicker date={parseDateOnly(f.bill_date)} onChange={d => setField('bill_date', toDateOnlyString(d))} /></div>
            <div><label style={lbl}>Due Date *</label><DatePicker date={parseDateOnly(f.due_date)} onChange={d => setField('due_date', toDateOnlyString(d))} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap:12, marginBottom:16 }}>
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
            {(financeConfiguration.data?.industries.includes('logistics') || shipmentItem) && <div>
              <EntityPicker
                label="Shipment Ref" value={shipmentItem} onChange={handleShipmentChange}
                search={searchShipmentsLocal} placeholder="Search shipments…"
              />
            </div>}
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
          <div className="mb-4"><FinanceCatalogPicker currency={f.currency} purchase onSelect={product=>setF(previous=>({...previous,lines:[...previous.lines.filter(line=>line.description.trim()),{_key:newKey(),description:[product.name,product.billing_description].filter(Boolean).join('\n'),category:product.category || 'OTHER',qty:1,unit_price:Number(product.purchase_price)||0,tax_rate:Number(product.tax_rate)||0,tax_code_id:product.tax_code_id ?? null}]}))}/></div>
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
                      <input data-ui-field="input" type="text" title="Description" placeholder="Service description…" value={ln.description} onChange={e => updateLine(ln._key, 'description', e.target.value)}
                        style={{ width:'100%', padding:"var(--ds-input-py) var(--space-md)", border:'1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize:"var(--text-base)", outline:'none', boxSizing:'border-box' as const }} />
                    </td>
                    <td style={{ padding:'7px 8px' }}>
                      <Select value={ln.category} onValueChange={v => updateLine(ln._key, 'category', v as BillCat)}>
                        <SelectTrigger className="h-7 px-2 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[...new Set([...financeCatalogOptions(financeConfiguration.data?.industries ?? []).expenses,...f.lines.map(line=>line.category)])].map(c => <SelectItem key={c} value={c}>{CAT_CFG[c]?.label ?? c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td style={{ padding:'7px 6px' }}>
                      <Input type="number" title="Qty" value={ln.qty} min={1} step={1} onChange={e => updateLine(ln._key, 'qty', parseFloat(e.target.value)||1)}
                        style={{ width:60, textAlign:'right' }} />
                    </td>
                    <td style={{ padding:'7px 6px' }}>
                      <Input type="number" title="Unit price" value={ln.unit_price} min={0} step={0.01} onChange={e => updateLine(ln._key, 'unit_price', parseFloat(e.target.value)||0)}
                        style={{ width:90, textAlign:'right' }} />
                    </td>
                    {/* A treatment, not a bare rate. On a purchase the treatment is
                        what decides whether the tax is claimable at all — a blocked
                        purchase is charged 18% you never get back, and a rate box
                        cannot say so. */}
                    <td style={{ padding:'7px 6px' }}>
                      <Select value={ln.tax_code_id ?? ''} onValueChange={v => setLineTaxCode(ln._key, v)}>
                        <SelectTrigger aria-label="Tax treatment" style={{ minWidth:140, height:'auto', padding:"var(--ds-input-py) var(--space-md)", fontSize:"var(--text-base)" }}>
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
                            style={{ background:'none', border:'none', cursor: f.lines.length === 1 ? 'default' : 'pointer', color: f.lines.length === 1 ? 'var(--border)' : 'var(--red)', display:'flex', padding:"var(--action-py) var(--space-md)" }} data-ui-native-button="">
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
                style={{ display:'flex', alignItems:'center', gap:5, padding:'var(--ds-btn-py-sm) 12px', border:'1px dashed var(--border)', borderRadius:'var(--r)', background:'none', cursor:'pointer', fontWeight:600, fontSize:"var(--text-base)", color:'var(--teal)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
                <Icon name="plus" size={12} /> Add Line
              </button>
              <div style={{ textAlign:'right', fontSize:13 }}>
                <div style={{ color:'var(--ink3)', marginBottom:2 }}>Subtotal: <strong style={{ color:'var(--ink)' }}>{fmt(totals.subtotal, f.currency)}</strong></div>
                <div style={{ color:'var(--ink3)', marginBottom:2 }}>Tax: <strong style={{ color:'var(--ink)' }}>{fmt(totals.tax_amount, f.currency)}</strong></div>
                <div style={{ fontSize:15, fontWeight:800, color:'var(--teal)' }}>Total: {fmt(totals.total, f.currency)}</div>
              </div>
            </div>
          </div>

          <div><label style={lbl}>Notes</label><Textarea title="Notes" placeholder="Payment terms, references, or other notes…" value={f.notes} onChange={e => setField('notes', e.target.value)} rows={3} style={{ ...inp, resize:'vertical' }} aria-label="Notes" /></div>
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

  const [f, setF] = useFinanceDraft<RecurForm>('f',{
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
    return s ? { id: s.id, label: s.name, sublabel: s.email || undefined, avatarUserId: s.id, avatarKind: 'suppliers' as const, avatarType: 'company' as const } : null;
  });

  async function searchSuppliersLocal(q: string): Promise<PickerItem[]> {
    const ql = q.trim().toLowerCase();
    const filtered = ql
      ? suppliers.filter((s: any) => (s.name || '').toLowerCase().includes(ql) || (s.email || '').toLowerCase().includes(ql))
      : suppliers;
    return filtered.slice(0, 25).map((s: any) => ({ id: s.id, label: s.name, sublabel: s.email || undefined, avatarUserId: s.id, avatarKind: 'suppliers' as const, avatarType: 'company' as const }));
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
          <div style={{ marginBottom:14 }}><label style={lbl}>Template Name *</label><Input type="text" title="Name" placeholder="e.g. Monthly Retainer" value={f.name} onChange={e => set('name', e.target.value)} style={inp} /></div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap:12, marginBottom:14 }}>
            <div><label style={lbl}>Frequency</label><Select value={f.frequency} onValueChange={v => set('frequency', v as RecurFreq)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ALL_FREQS.map(fr => <SelectItem key={fr} value={fr}>{FREQ_CFG[fr].label}</SelectItem>)}</SelectContent></Select></div>
            <div><label style={lbl}>Category</label><Select value={f.category} onValueChange={v => set('category', v as BillCat)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[...new Set([...financeCatalogOptions(financeConfiguration.data?.industries ?? []).expenses,f.category])].map(c => <SelectItem key={c} value={c}>{CAT_CFG[c]?.label ?? c}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap:12, marginBottom:14 }}>
            <div><label style={lbl}>Amount</label><Input type="number" title="Amount" value={f.amount} min={0} step={0.01} onChange={e => set('amount', parseFloat(e.target.value)||0)} style={inp} aria-label="Amount" /></div>
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
          <div style={{ marginBottom:14 }}><label style={lbl}>Description</label><Textarea title="Description" placeholder="Description of the recurring charge…" value={f.description} onChange={e => set('description', e.target.value)} rows={2} style={{ ...inp, resize:'vertical' }} aria-label="Description" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap:12, marginBottom:14 }}>
            <div><label style={lbl}>First / Next Due Date</label><DatePicker date={parseDateOnly(f.next_due)} onChange={d => set('next_due', toDateOnlyString(d))} aria-label="First / Next Due Date" /></div>
            <div><label style={lbl}>End Date (optional)</label><DatePicker date={parseDateOnly(f.end_date)} onChange={d => set('end_date', toDateOnlyString(d))} aria-label="End Date (optional)" /></div>
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
        <div style={{ padding:'14px 22px', borderTop:'1px solid var(--border)', display:'flex', gap:8, justifyContent:'flex-end', flexWrap: 'wrap' }}>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={() => { if (!f.name||!f.supplier_id||!f.next_due) { showAlert('Name, supplier and next due date are required.'); return; } onSave(f); }}>
            <Icon name="save" size={13} /> {initial ? 'Update' : 'Create'}
          </Button>
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
  const balance = Math.max(0, bill.total - bill.paid_amount - (bill.credited_amount ?? 0));
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
      <PageHeader crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Bills', to: '/finance/bills' }]} titleEm={bill.bill_number} subtitle={bill.supplier_name || 'Supplier bill'} onBack={onBack} backLabel="All bills" />
      <div style={{ padding:'16px 18px', border:'var(--card-border, 1px solid var(--border))', borderRadius:'var(--card-radius, var(--r))', background:'var(--white)', boxShadow:'var(--card-shadow, none)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:14 }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:12, minWidth:0 }}>
            <PersonAvatar kind="suppliers" userId={bill.supplier_id || undefined} name={bill.supplier_name || 'Supplier'} size={36} />
            <div style={{ minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                <span style={{ fontFamily:'var(--font)', fontSize:16, fontWeight:700, color:'var(--teal)', fontVariantNumeric:'tabular-nums' }}>{bill.bill_number}</span>
                <StatusBadge status={bill.status} />
                {bill.recurring_id && <Badge variant="brand">Recurring</Badge>}
              </div>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--ink)', marginBottom:2 }}>{bill.supplier_name || 'Unassigned supplier'}</div>
              <div style={{ fontSize:12.5, color:'var(--ink3)' }}>Billed {fmtDate(bill.bill_date)} · Due {fmtDate(bill.due_date)}{over ? ` — ${daysOverdue(bill.due_date)} days overdue` : ''}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            {(bill.status === 'DRAFT' || bill.status === 'PENDING_APPROVAL') && <Button type="button" variant="outline" size="sm" onClick={onPost}><Icon name="send" size={13} /> {bill.status === 'DRAFT' ? 'Submit' : 'Approve'}</Button>}
            {(bill.status === 'POSTED'||bill.status === 'PARTIAL'||bill.status === 'OVERDUE') && <Button type="button" variant="default" size="sm" onClick={onPay}><Icon name="dollarSign" size={13} /> Pay</Button>}
            <Button type="button" variant="outline" size="sm" onClick={onEdit}><Icon name="edit" size={13} /> Edit</Button>
            <FinanceDocumentActions kind="bill" id={bill.id} label={bill.bill_number}/>
            {bill.status !== 'VOID' && bill.status !== 'PAID' && <Button type="button" variant="destructive" size="sm" onClick={onVoid}>Void</Button>}
          </div>
        </div>
        {over && <Banner variant="error" className="mt-3">Payment overdue by {daysOverdue(bill.due_date)} days. Balance: {fmt(balance, bill.currency)}</Banner>}
      </div>

      <div style={{ flex:1, display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 310px', gap:20, marginTop:18, alignItems:'start' }}>
        {/* Left */}
        <div style={{ minWidth:0, display:'flex', flexDirection:'column', gap:18 }}>
          <SectionCard title="Line Items" collapsible={false} padded={false}>
            <div className="rtbl-wrap">
              <table className="rtbl" style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead><tr style={{ background:'var(--bg)' }}>
                  {['Description','Category','Qty','Unit Price','Tax','Total'].map(h => (
                    <th key={h} style={{ padding:'9px 12px', textAlign: h === 'Total' ? 'right' : 'left', fontWeight:700, color:'var(--ink2)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.03em', borderBottom:'1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {bill.lines.map(l => (
                    <tr key={l._key} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'10px 12px', fontWeight:600 }}>{l.description}</td>
                      <td style={{ padding:'10px 12px' }}><span style={{ fontSize:11, fontWeight:700, color:CAT_CFG[l.category]?.color ?? 'var(--ink2)' }}>{CAT_CFG[l.category]?.label ?? l.category}</span></td>
                      <td style={{ padding:'10px 12px', textAlign:'center', color:'var(--ink2)', fontVariantNumeric:'tabular-nums' }}>{l.qty}</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', color:'var(--ink2)', fontVariantNumeric:'tabular-nums' }}>{fmt(l.unit_price, bill.currency)}</td>
                      <td style={{ padding:'10px 12px', textAlign:'center', color:'var(--ink3)', fontSize:12, fontVariantNumeric:'tabular-nums' }}>{l.tax_rate > 0 ? `${l.tax_rate}%` : '—'}</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{fmt(lineTotal(l), bill.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ background:'var(--bg)', padding:'14px 18px', display:'flex', flexDirection:'column', gap:5, alignItems:'flex-end', borderTop:'1px solid var(--border)' }}>
              <div style={{ fontSize:13, color:'var(--ink2)' }}>Subtotal: <strong style={{ color:'var(--ink)', minWidth:110, display:'inline-block', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(bill.subtotal, bill.currency)}</strong></div>
              <div style={{ fontSize:13, color:'var(--ink2)' }}>Tax: <strong style={{ color:'var(--ink)', minWidth:110, display:'inline-block', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(bill.tax_amount, bill.currency)}</strong></div>
              <div style={{ fontSize:16, fontWeight:800, color:'var(--ink)' }}>Total: <span style={{ minWidth:110, display:'inline-block', textAlign:'right', color:'var(--teal)', fontVariantNumeric:'tabular-nums' }}>{fmt(bill.total, bill.currency)}</span></div>
              {bill.paid_amount > 0 && <div style={{ fontSize:13, color:'var(--green)' }}>Paid: <strong style={{ minWidth:110, display:'inline-block', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(bill.paid_amount, bill.currency)}</strong></div>}
              {(bill.credited_amount ?? 0) > 0 && <div style={{ fontSize:13, color:'var(--ink2)' }}>Supplier credits: <strong style={{ minWidth:110, display:'inline-block', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(bill.credited_amount ?? 0, bill.currency)}</strong></div>}
              {balance > 0 && <div style={{ fontSize:14, fontWeight:800, color: over ? 'var(--red)' : 'var(--ink)' }}>Balance Due: <span style={{ minWidth:110, display:'inline-block', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(balance, bill.currency)}</span></div>}
            </div>
          </SectionCard>

          <SectionCard title="Payment History" collapsible={false}>
            {myPmts.length === 0 ? (
              <div style={{ padding:'12px', textAlign:'center', fontSize:13, color:'var(--ink3)' }}>No payments recorded yet.</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                {myPmts.map((p, i) => (
                  <div key={p.id} style={{ display:'flex', gap:14, paddingBottom: i < myPmts.length - 1 ? 14 : 0, position:'relative' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--green-l)', display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="checkCircle" size={16} color="var(--green)" /></div>
                      {i < myPmts.length - 1 && <div style={{ width:2, flex:1, background:'var(--border)', marginTop:4 }} />}
                    </div>
                    <div style={{ flex:1, paddingTop:4 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                        <span style={{ fontWeight:700, fontSize:14, color:'var(--green)', fontVariantNumeric:'tabular-nums' }}>{fmt(p.amount, p.currency)}</span>
                        <span style={{ fontSize:12, color:'var(--ink3)' }}>{fmtDate(p.date)}</span>
                      </div>
                      <div style={{ fontSize:12.5, color:'var(--ink2)' }}>{p.method}</div>
                      {p.reference && <div style={{ fontFamily:'var(--font)', fontSize:11.5, color:'var(--ink3)', marginTop:2 }}>{p.reference}</div>}
                      {p.note && <div style={{ fontSize:12, color:'var(--ink3)', marginTop:2, fontStyle:'italic' }}>{p.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {bill.notes && (
            <SectionCard title="Notes" collapsible={false}>
              <div style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.6 }}>{bill.notes}</div>
            </SectionCard>
          )}

          <SectionCard title="Activity" collapsible={false} padded={false}>
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
          </SectionCard>
        </div>

        {/* Right sidebar */}
        <div style={{ display:'flex', flexDirection:'column', gap:14, minWidth:0 }}>
          <div style={{ background:'var(--white)', border:'var(--card-border, 1px solid var(--border))', borderRadius:'var(--card-radius, var(--r))', padding:'16px', textAlign:'center' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:10 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                {balance === 0 ? 'Settlement Status' : over ? 'Balance Overdue' : 'Balance Due'}
              </span>
              <StatusBadge status={bill.status} />
            </div>
            <div style={{ fontSize:26, fontWeight:800, color: over ? 'var(--red)' : balance === 0 ? 'var(--green)' : 'var(--ink)', letterSpacing:'-0.5px', fontVariantNumeric:'tabular-nums' }}>
              {fmt(balance, bill.currency)}
            </div>
            <div style={{ fontSize:12, color:'var(--ink3)', marginTop:4, fontVariantNumeric:'tabular-nums' }}>
              of {fmt(bill.total, bill.currency)} total
            </div>
          </div>

          <SectionCard title="Bill Summary" collapsible={false}>
            {[
              { l:'Supplier',   v: bill.supplier_name || '—' },
              { l:'Bill Date',  v: fmtDate(bill.bill_date) },
              { l:'Due Date',   v: <span style={{ color: over ? 'var(--red)' : 'inherit' }}>{fmtDate(bill.due_date)}</span> },
              { l:'Currency',   v: bill.currency },
              { l:'Business Line', v: businessLine ? `${businessLine.name} (${businessLine.code})` : '—' },
              { l:'PO Ref',     v: bill.po_number ? <span style={{ fontFamily:'var(--font)', fontSize:12 }}>{bill.po_number}</span> : '—' },
              { l:'Shipment',   v: bill.shipment_ref ? <span style={{ fontFamily:'var(--font)', fontSize:12, color:'var(--teal)' }}>{bill.shipment_ref}</span> : '—' },
            ].map((r, idx, arr) => (
              <div key={r.l} style={{ display:'flex', justifyContent:'space-between', fontSize:12.5, marginBottom: idx < arr.length - 1 ? 8 : 0, gap:8 }}>
                <span style={{ color:'var(--ink3)' }}>{r.l}</span>
                <span style={{ fontWeight:600, color:'var(--ink)', textAlign:'right', maxWidth:'58%', overflowWrap:'anywhere' }}>{r.v}</span>
              </div>
            ))}
          </SectionCard>

          {bill.supplier_id && (
            <SectionCard title="Supplier" collapsible={false}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <PersonAvatar kind="suppliers" userId={bill.supplier_id} name={supplierMap[bill.supplier_id]?.name || bill.supplier_name || 'Supplier'} size={36} />
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:'var(--ink)' }}>{supplierMap[bill.supplier_id]?.name || bill.supplier_name}</div>
                  {supplierMap[bill.supplier_id]?.email && <div style={{ fontSize:12, color:'var(--teal)', overflowWrap:'anywhere' }}>{supplierMap[bill.supplier_id]?.email}</div>}
                  <div style={{ fontSize:12, color:'var(--ink3)', marginTop:2 }}>Terms: {supplierMap[bill.supplier_id]?.terms || '—'}</div>
                </div>
              </div>
            </SectionCard>
          )}

          {/* EFD/VFD receipt verification against the TRA verify portal */}
          <SectionCard title="EFD/VFD Verification" collapsible={false}>
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
            <Input
              type="text" placeholder="RCTVNUM from supplier's receipt" value={efdInput}
              onChange={e => setEfdInput(e.target.value)}
              style={{ width:'100%', marginBottom:8 }}
              aria-label="EFD receipt number"
            />
            <Button type="button" size="sm" className="w-full" onClick={runVerify} disabled={!efdInput.trim() || efdChecking}>
              {efdChecking ? 'Checking with TRA…' : 'Verify against TRA'}
            </Button>
            {efdError && <div style={{ marginTop:8, fontSize:11.5, color:'var(--red)' }}>{efdError}</div>}
            {bill.efd_verified_at && <div style={{ marginTop:8, fontSize:11, color:'var(--ink3)' }}>Last checked {fmtDate(bill.efd_verified_at)}</div>}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ── Recurring Tab ──────────────────────────────────────────────────────────────

interface RecurringSummary { active: number; generated: number; monthly: {currency:string;amount:number}[] }
function RecurringTab({
  recurring,
  totalCount,
  loading,
  error,
  hasActiveFilters,
  onRetry,
  onClearFilters,
  onCreate,
  onEdit,
  onToggle,
  onGenerate,
  onDelete,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  recurring: RecurringBill[];
  totalCount: number;
  loading: boolean;
  error: string;
  hasActiveFilters: boolean;
  onRetry: () => void;
  onClearFilters: () => void;
  onCreate: () => void;
  onEdit: (r: RecurringBill) => void;
  onToggle: (r: RecurringBill) => void;
  onGenerate: (r: RecurringBill) => void;
  onDelete: (r: RecurringBill) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  return (
    <SectionCard collapsible={false} padded={false}>
      <div style={{ background: 'var(--white)' }}>
        {loading ? (
          <SkeletonTable rows={5} cols={8} />
        ) : error ? (
          <div className="ds-empty-state" role="alert">
            <FeaturedIcon variant="error" size="lg" shape="circle">
              <Icon name="alertTriangle" size={22} />
            </FeaturedIcon>
            <h3>Could not load recurring bills</h3>
            <p>{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <Icon name="refresh" size={13} /> Retry
            </Button>
          </div>
        ) : recurring.length === 0 ? (
          hasActiveFilters ? (
            <div className="ds-empty-state">
              <FeaturedIcon variant="gray" size="lg" shape="circle">
                <Icon name="search" size={22} />
              </FeaturedIcon>
              <h3>No recurring templates match your filters</h3>
              <p>No scheduled supplier bill templates matched your current search or filter selection.</p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
                  <Icon name="x" size={13} /> Clear filters
                </Button>
                <Button type="button" size="sm" onClick={onCreate}>
                  <Icon name="plus" size={14} /> New recurring bill
                </Button>
              </div>
            </div>
          ) : (
            <div className="ds-empty-state">
              <FeaturedIcon variant="brand" size="lg" shape="squircle">
                <Icon name="refresh" size={22} />
              </FeaturedIcon>
              <h3>No recurring bills set up yet</h3>
              <p>Automate rent, retainers, subscriptions, and regular supplier invoices on a weekly, monthly, quarterly, or annual cycle.</p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                <Button type="button" size="sm" onClick={onCreate}>
                  <Icon name="plus" size={14} /> New recurring bill
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl">
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '12px 24px', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Template</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Supplier</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Frequency</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Amount</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Category</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Next Due</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Bills</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>State</th>
                  <th aria-label="Actions" style={{ padding: '12px 24px 12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }} />
                </tr>
              </thead>
              <tbody>
                {recurring.map(r => {
                  const total = r.amount * (1 + r.tax_rate / 100);
                  const dueD = r.next_due ? new Date(r.next_due) : null;
                  const dueSoon = !!dueD && dueD.getTime() - Date.now() < 14 * 86400000;
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', opacity: r.state === 'PAUSED' ? 0.65 : 1 }}>
                      <td style={{ padding: '14px 24px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.name || 'Untitled template'}</div>
                        {r.description && (
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                            {r.description.length > 50 ? `${r.description.slice(0, 50)}…` : r.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <PersonAvatar kind="suppliers" userId={r.supplier_id || undefined} name={r.supplier_name || 'Supplier'} size={28} />
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground truncate">{r.supplier_name || 'Unassigned supplier'}</div>
                            {r.payment_terms && <div className="text-[11px] text-muted-foreground">{r.payment_terms}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}><FreqBadge freq={r.frequency} /></td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(total, r.currency)}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: CAT_CFG[r.category]?.color ?? 'var(--ink2)' }}>
                          {CAT_CFG[r.category]?.label ?? r.category}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', color: dueSoon && r.state === 'ACTIVE' ? 'var(--gold)' : 'var(--ink2)', fontWeight: dueSoon && r.state === 'ACTIVE' ? 700 : 400, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {fmtDate(r.next_due)}
                        {dueSoon && r.state === 'ACTIVE' && <span style={{ fontSize: 10, display: 'block', color: 'var(--gold)' }}>Due soon</span>}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums' }}>{r.bills_generated}</td>
                      <td style={{ padding: '14px 16px' }}><Badge variant={r.state === 'ACTIVE' ? 'success' : r.state === 'PAUSED' ? 'warning' : 'gray'}>{r.state}</Badge></td>
                      <td style={{ padding: '14px 24px 14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div className="inline-flex items-center justify-end gap-1">
                          <Tip label="Generate bill now">
                            <span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                iconOnly
                                aria-label={`Generate bill from ${r.name || 'template'}`}
                                onClick={() => onGenerate(r)}
                                disabled={r.state !== 'ACTIVE'}
                              >
                                <Icon name="zap" size={14} color={r.state === 'ACTIVE' ? 'var(--teal)' : undefined} />
                              </Button>
                            </span>
                          </Tip>
                          <Tip label="Edit recurring bill">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              iconOnly
                              aria-label={`Edit ${r.name || 'recurring bill'}`}
                              onClick={() => onEdit(r)}
                            >
                              <Icon name="edit" size={14} />
                            </Button>
                          </Tip>
                          <Tip label={r.state === 'ACTIVE' ? 'Pause recurring bill' : 'Resume recurring bill'}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              iconOnly
                              aria-label={`${r.state === 'ACTIVE' ? 'Pause' : 'Resume'} ${r.name || 'recurring bill'}`}
                              onClick={() => onToggle(r)}
                            >
                              <Icon name={r.state === 'ACTIVE' ? 'pause' : 'chevronRight'} size={14} color="var(--gold)" />
                            </Button>
                          </Tip>
                          <Tip label="Delete recurring bill">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              iconOnly
                              aria-label={`Delete ${r.name || 'recurring bill'}`}
                              onClick={() => onDelete(r)}
                            >
                              <Icon name="trash" size={14} color="var(--red)" />
                            </Button>
                          </Tip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={totalCount}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          pageSizeOptions={[10, 25, 50, 100]}
          itemLabel="recurring template"
          bordered={true}
        />
      </div>
    </SectionCard>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

type MainTab  = 'bills'|'recurring';
type AppView  = 'list'|'detail'|'form';
type ViewMode = 'table'|'grid';

export const Bills: React.FC = () => {
  const documentRoute=useFinanceDocumentRoute("bills");
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const [bills, setBills]           = useState<Bill[]>([]);
  const [recurring, setRecurring]   = useState<RecurringBill[]>([]);
  const [recurringPage,setRecurringPage] = useState(1);
  const [recurringPageSize, setRecurringPageSize] = useState(25);
  const [recurringTotal,setRecurringTotal] = useState(0);
  const [recurringSummary,setRecurringSummary] = useState<RecurringSummary>({active:0,generated:0,monthly:[]});
  const [recurringRefresh,setRecurringRefresh] = useState(0);
  const [recurringLoading,setRecurringLoading] = useState(true);
  const [recurringError,setRecurringError] = useState('');
  const [recurSearch, setRecurSearch] = useState('');
  const [recurStateFilter, setRecurStateFilter] = useState<'ALL'|RecurState>('ALL');
  const [recurFreqFilter, setRecurFreqFilter] = useState<'ALL'|RecurFreq>('ALL');
  const [payments, setPayments]     = useState<Payment[]>([]);
  const [suppliers, setSuppliers]   = useState<any[]>([]);
  const [tab, setTab]               = useState<MainTab>('bills');
  const [viewMode, setViewMode]     = useState<ViewMode>('table');
  const [view, setView]             = useState<AppView>('list');
  const [selected, setSelected]     = useState<Bill | null>(null);
  const [formBill, setFormBill]     = useState<Bill | null>(null);
  const [formRecur, setFormRecur]   = useState<RecurringBill | null>(null);
  const [showBillForm, setShowBillForm]   = useState(false);
  const [showRecurForm, setShowRecurForm] = useState(false);
  const [payTarget, setPayTarget]   = useState<Bill | null>(null);
  const [searchParams] = useSearchParams();
  const qSupplierId = searchParams.get('supplier_id');
  const qNew = searchParams.get('new');
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL'|BillStatus>('ALL');
  const [supFilter, setSupFilter]   = useState(qSupplierId || 'ALL');
  const [sortBy, setSortBy]         = useState<'bill_date'|'due_date'|'total'|'supplier'>('due_date');
  const [sortDir, setSortDir]       = useState<'asc'|'desc'>('asc');
  const [voidTarget, setVoidTarget] = useState<Bill | null>(null);
  const [voidReason, setVoidReason] = useState('');

  useEffect(() => {
    if (qSupplierId) {
      setSupFilter(qSupplierId);
      if (qNew === '1') {
        setFormBill({
          id: '', bill_number: '', supplier_id: qSupplierId, supplier_name: '',
          bill_date: new Date().toISOString().slice(0, 10),
          due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          subtotal: 0, tax: 0, total: 0, paid_amount: 0,
          currency: 'TZS', status: 'DRAFT', items: [],
          shipment_ref: '', po_number: '', po_id: '', notes: '',
          business_line_id: null, business_line_name: null, business_line_code: null,
        } as any);
        setShowBillForm(true);
      }
    }
  }, [qSupplierId, qNew]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [matchCount, setMatchCount] = useState(0);
  const [loadingBills, setLoadingBills] = useState(true);
  const [billError, setBillError] = useState('');
  const [billRefresh, setBillRefresh] = useState(0);
  const [billSummary, setBillSummary] = useState<any>(null);
  const filterKey = JSON.stringify([search, statusFilter, supFilter, sortBy, sortDir, pageSize]);
  const previousFilters = useRef(filterKey);
  useEffect(() => {
    if (previousFilters.current !== filterKey) { previousFilters.current = filterKey; setPage(1); }
  }, [filterKey]);
  const billQuery = new URLSearchParams({ page: String(page), page_size: String(pageSize), sort_by: sortBy, sort_dir: sortDir });
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
    apiFetch(`/v1/bills/recurring?page=${recurringPage}&page_size=${recurringPageSize}`).then(data=>{
      if(!active)return;
      setRecurring(data.items.map(mapApiRecurring));setRecurringTotal(data.total);setRecurringSummary(data.summary);
      if(recurringPage>1&&!data.items.length)setRecurringPage(Math.max(1,Math.ceil(data.total/recurringPageSize)));
    }).catch(error=>{if(active){setRecurring([]);setRecurringError(error.message);}}).finally(()=>{if(active)setRecurringLoading(false);});
    return()=>{active=false;};
  },[recurringPage,recurringPageSize,recurringRefresh]);
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
      if ((e as CustomEvent).detail?.section === 'bills') { documentRoute.open('new'); }
    }
    window.addEventListener('fin:new-doc', handler);
    return () => window.removeEventListener('fin:new-doc', handler);
  }, []);

  // computed status for display (inject OVERDUE dynamically)
  const effectiveBills = useMemo(() => bills.map(b => isOverdue(b) ? { ...b, status: 'OVERDUE' as BillStatus } : b), [bills]);

  const displayed = loadingBills ? [] : effectiveBills;

  const filteredRecurring = useMemo(() => {
    const q = recurSearch.trim().toLowerCase();
    return recurring.filter(r => {
      if (recurStateFilter !== 'ALL' && r.state !== recurStateFilter) return false;
      if (recurFreqFilter !== 'ALL' && r.frequency !== recurFreqFilter) return false;
      if (q) {
        const hay = `${r.name} ${r.supplier_name} ${CAT_CFG[r.category]?.label ?? r.category} ${r.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [recurring, recurSearch, recurStateFilter, recurFreqFilter]);

  const openBillSequence = useRef(0);
  async function openBill(id: string, edit = false, syncRoute = true) {
    const sequence = ++openBillSequence.current;
    try {
      const payload = await apiFetch(`/v1/bills/${id}`);
      const full = mapApiBill(payload);
      if (sequence !== openBillSequence.current) return;
      setPayments((payload.payments ?? []).map((payment: any) => mapApiPayment({ ...payment, bill_number: payload.bill_number, supplier_name: payload.supplier_name })));
      if (edit) { setFormBill(full); setShowBillForm(true); }
      else { setSelected(full); setView('detail'); }
      if(syncRoute)documentRoute.open(edit?'edit':'detail',id);
    } catch (error) { showAlert(error instanceof Error ? error.message : 'Could not open bill.'); }
  }
  useEffect(()=>{if(documentRoute.mode==='new'){setFormBill(null);setShowBillForm(true);setView('list');}else if(documentRoute.id){setShowBillForm(false);void openBill(documentRoute.id,documentRoute.mode==='edit',false);}else{setShowBillForm(false);setFormBill(null);setSelected(null);setView('list');}},[documentRoute.path]);
  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => d==='asc'?'desc':'asc');
    else { setSortBy(col); setSortDir('asc'); }
  }
  function SortIco({ col }: { col: typeof sortBy }) {
    if (sortBy !== col) return <Icon name="arrowUpDown" size={11} color="var(--ink3)" duotone={false} />;
    return <Icon name={sortDir==='asc'?'chevronUp':'chevronDown'} size={11} color="var(--teal)" duotone={false} />;
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
      const saved = await apiFetch(isEdit ? `/v1/bills/${formBill!.id}` : '/v1/bills', {
        method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(payload),
      });
      setBillRefresh(value => value + 1);
      setShowBillForm(false); setFormBill(null);
      clearFinanceDrafts();documentRoute.open('detail',saved.id);
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

  // ── Metrics & Filters ──────────────────────────────────────────────────────

  const totalBills   = billSummary?.total_bills ?? matchCount;
  const draftCount   = billSummary?.status_counts?.DRAFT ?? 0;
  const pendingCount = billSummary?.status_counts?.PENDING_APPROVAL ?? 0;
  const postedCount  = billSummary?.status_counts?.POSTED ?? 0;
  const partialCount = billSummary?.status_counts?.PARTIAL ?? 0;
  const paidCount    = billSummary?.status_counts?.PAID ?? 0;

  const unpaidBills  = effectiveBills.filter(b => b.status === 'POSTED' || b.status === 'PARTIAL' || b.status === 'OVERDUE');
  const overdueBills = effectiveBills.filter(b => b.status === 'OVERDUE');

  const overdueCount = useMemo(() => {
    let count = 0;
    if (billSummary?.currency_totals) {
      for (const cur of Object.values(billSummary.currency_totals) as any[]) {
        count += Number(cur?.overdue_count || 0);
      }
    }
    return count || overdueBills.length;
  }, [billSummary, overdueBills]);

  const dueSoonCount = useMemo(() => {
    const now = Date.now();
    const in48h = now + 48 * 3600 * 1000;
    return effectiveBills.filter(b => {
      if (b.status === 'PAID' || b.status === 'VOID') return false;
      const due = new Date(b.due_date).getTime();
      return due >= now && due <= in48h;
    }).length;
  }, [effectiveBills]);

  const totalOutstanding = billSummary?.total_outstanding ?? 0;

  const hasActiveBillFilters = Boolean(search.trim() || statusFilter !== 'ALL' || supFilter !== 'ALL');
  const hasActiveRecurFilters = Boolean(recurSearch.trim() || recurStateFilter !== 'ALL' || recurFreqFilter !== 'ALL');

  type Metric = 'active' | 'due_soon' | 'overdue' | 'pending' | 'paid' | 'recurring' | null;
  const [selectedMetric, setSelectedMetric] = useState<Metric>(null);

  function clearBillFilters() {
    setSearch('');
    setStatusFilter('ALL');
    setSupFilter('ALL');
    setSelectedMetric(null);
    setPage(1);
  }

  function clearRecurFilters() {
    setRecurSearch('');
    setRecurStateFilter('ALL');
    setRecurFreqFilter('ALL');
    setSelectedMetric(null);
    setRecurringPage(1);
  }

  // 7 KPI cells matching ClearOS Shipment Operations metric strip
  const kpiCells = [
    {
      key: 'active',
      label: 'Active Bills',
      value: loadingBills && !billSummary ? '—' : String(totalBills),
      metric: 'active' as Metric,
      color: 'var(--teal)',
      bg: 'var(--teal-l)',
    },
    {
      key: 'due_soon',
      label: 'Due Soon ≤48h',
      value: loadingBills && !billSummary ? '—' : String(dueSoonCount),
      metric: 'due_soon' as Metric,
      color: 'var(--gold)',
      bg: 'var(--gold-l)',
      cell: dueSoonCount > 0 ? 'warning' : 'normal',
    },
    {
      key: 'overdue',
      label: 'Free Time Overdue',
      value: loadingBills && !billSummary ? '—' : String(overdueCount),
      metric: 'overdue' as Metric,
      color: 'var(--red)',
      bg: 'var(--red-l)',
      cell: 'alert',
    },
    {
      key: 'pending',
      label: 'Pending Approval',
      value: loadingBills && !billSummary ? '—' : String(pendingCount),
      metric: 'pending' as Metric,
      color: 'var(--gold)',
      bg: 'var(--gold-l)',
      cell: pendingCount > 0 ? 'warning' : 'normal',
    },
    {
      key: 'paid',
      label: 'Paid This Month',
      value: loadingBills && !billSummary ? '—' : String(paidCount),
      metric: 'paid' as Metric,
      color: 'var(--green)',
      bg: 'var(--green-l)',
    },
    {
      key: 'outstanding',
      label: 'Total Outstanding',
      value: loadingBills && !billSummary ? '—' : formatCompact(totalOutstanding, getCompany().currency),
      metric: null as Metric,
      color: 'var(--blue)',
      bg: 'var(--blue-l)',
    },
    {
      key: 'recurring',
      label: 'Recurring Active',
      value: recurringLoading ? '—' : String(recurringSummary.active),
      metric: 'recurring' as Metric,
      color: 'var(--purple)',
      bg: 'var(--purple-l)',
    },
  ];

  const kpiCell = (cell: (typeof kpiCells)[number]) => {
    const clickable = cell.metric !== null;
    const active = clickable && (
      cell.metric === 'recurring' ? tab === 'recurring' :
      cell.metric === 'overdue' ? (tab === 'bills' && statusFilter === 'OVERDUE') :
      cell.metric === 'pending' ? (tab === 'bills' && statusFilter === 'PENDING_APPROVAL') :
      cell.metric === 'paid' ? (tab === 'bills' && statusFilter === 'PAID') :
      cell.metric === 'active' ? (tab === 'bills' && statusFilter === 'ALL') :
      selectedMetric === cell.metric
    );
    // Raised = alert cell with non-zero value (matches ClearOS FREE TIME OVERDUE in Image 2)
    const raised = cell.cell === 'alert' && cell.value !== '0' && cell.value !== '—';
    const cls = [
      'cc-pipeline-step',
      clickable ? 'cc-pipeline-step--clickable' : '',
      active ? 'cc-pipeline-step--active' : '',
      raised ? 'cc-pipeline-step--raised' : '',
    ].filter(Boolean).join(' ');

    const inner = (
      <>
        <span className="cc-pipeline-num">{cell.value}</span>
        <span className="cc-pipeline-label">{cell.label}</span>
      </>
    );

    const handleCellClick = () => {
      if (cell.metric === 'recurring') {
        setTab(tab === 'recurring' ? 'bills' : 'recurring');
        setSelectedMetric(selectedMetric === 'recurring' ? null : 'recurring');
      } else if (cell.metric === 'overdue') {
        setTab('bills');
        const next = statusFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE';
        setStatusFilter(next);
        setSelectedMetric(next === 'OVERDUE' ? 'overdue' : null);
      } else if (cell.metric === 'pending') {
        setTab('bills');
        const next = statusFilter === 'PENDING_APPROVAL' ? 'ALL' : 'PENDING_APPROVAL';
        setStatusFilter(next);
        setSelectedMetric(next === 'PENDING_APPROVAL' ? 'pending' : null);
      } else if (cell.metric === 'paid') {
        setTab('bills');
        const next = statusFilter === 'PAID' ? 'ALL' : 'PAID';
        setStatusFilter(next);
        setSelectedMetric(next === 'PAID' ? 'paid' : null);
      } else if (cell.metric === 'active') {
        setTab('bills');
        setStatusFilter('ALL');
        setSelectedMetric(null);
      } else if (cell.metric === 'due_soon') {
        setTab('bills');
        setSelectedMetric(selectedMetric === 'due_soon' ? null : 'due_soon');
      }
    };

    return clickable ? (
      <button
        data-ui-native-button=""
        key={cell.key}
        type="button"
        className={cls}
        aria-pressed={active}
        onClick={handleCellClick}
        title={active ? 'Filtering — click to clear' : 'Click to filter'}
      >
        {inner}
      </button>
    ) : (
      <div key={cell.key} className={cls} title={cell.label}>{inner}</div>
    );
  };

  const thS: React.CSSProperties = {
    padding: '12px 16px',
    textAlign: 'left',
    fontWeight: 700,
    color: 'var(--ink2)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
  };

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
        onClose={() => documentRoute.open('list')}
      />
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>
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
              <Textarea value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Reason for voiding" aria-label="Reason for voiding" className="mb-5" />
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <Button type="button" variant="outline" onClick={() => setVoidTarget(null)}>Cancel</Button>
                <Button type="button" variant="destructive" onClick={() => handleVoid(voidTarget)}>Void bill</Button>
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
          onBack={() => documentRoute.open('list')}
          onEdit={() => documentRoute.open('edit',selected.id)}
          onPay={() => setPayTarget(selected)}
          onPost={() => handlePost(selected)}
          onVoid={() => setVoidTarget(selected)}
          onVerifyEfd={(rctvnum) => handleVerifyEfd(selected, rctvnum)}
          isMobile={isMobile}
        />
      ) : (
        <div className="cc-frame">
          <div className="cc-shell">
            <div className="cc-main">
              {/* ── Page Header matching ClearOS Operations ── */}
              <PageHeader
                crumbs={['ClearOS', 'Finance']}
                titlePlain="Supplier"
                titleEm="bills"
                subtitle="Every supplier invoice in the pipeline — filter by status or switch to recurring schedules below."
                actions={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="cc-view-toggle">
                      {(['table', 'grid'] as const).map(m => (
                        <button
                          key={m}
                          type="button"
                          title={m === 'table' ? 'List view' : 'Grid view'}
                          className={`cc-view-btn${viewMode === m ? ' active' : ''}`}
                          onClick={() => setViewMode(m)}
                          data-ui-native-button=""
                        >
                          {m === 'table' ? (
                            <><Icon name="list" size={13} />List</>
                          ) : (
                            <><Icon name="layoutGrid" size={13} />Grid</>
                          )}
                        </button>
                      ))}
                    </div>

                    <Button
                      size="sm"
                      style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                      onClick={() => documentRoute.open('new')}
                    >
                      <Icon name="plus" size={13} color="currentColor" />
                      {isMobile ? 'New' : 'New Bill'}
                    </Button>

                    <FinanceDocumentListExport kind="bill" />
                  </div>
                }
              />

              {/* ── ClearOS 7-Cell KPI Pipeline Strip ── */}
              <div className="cc-pipeline" style={{ marginLeft: 0, marginRight: 0 }}>
                {kpiCells.map(kpiCell)}
              </div>

              {/* ── ClearOS Toolbar Row (Pills + Search + Sort & Supplier dropdowns) ── */}
              <div className="cc-toolbar-row" style={{ paddingLeft: 0, paddingRight: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', width: '100%' }}>
                <div className="cc-toolbar-buttons" style={{ flexShrink: 0, overflowX: 'auto', maxWidth: '100%' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="cc-toolbar-button"
                    aria-pressed={tab === 'bills' && statusFilter === 'ALL'}
                    onClick={() => { setTab('bills'); setStatusFilter('ALL'); setSelectedMetric('active'); }}
                  >
                    Active
                    <span style={{
                      fontSize: 10,
                      padding: '0 6px',
                      borderRadius: 'var(--r)',
                      background: (tab === 'bills' && statusFilter === 'ALL') ? 'var(--teal-l)' : 'var(--border)',
                      color: (tab === 'bills' && statusFilter === 'ALL') ? 'var(--teal)' : 'var(--ink3)',
                      fontWeight: 700
                    }}>
                      {totalBills}
                    </span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="cc-toolbar-button"
                    aria-pressed={tab === 'bills' && statusFilter === 'DRAFT'}
                    onClick={() => { setTab('bills'); setStatusFilter(statusFilter === 'DRAFT' ? 'ALL' : 'DRAFT'); }}
                  >
                    Draft
                    <span style={{
                      fontSize: 10,
                      padding: '0 6px',
                      borderRadius: 'var(--r)',
                      background: (tab === 'bills' && statusFilter === 'DRAFT') ? 'var(--teal-l)' : 'var(--border)',
                      color: (tab === 'bills' && statusFilter === 'DRAFT') ? 'var(--teal)' : 'var(--ink3)',
                      fontWeight: 700
                    }}>
                      {draftCount}
                    </span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="cc-toolbar-button"
                    aria-pressed={tab === 'bills' && statusFilter === 'PENDING_APPROVAL'}
                    onClick={() => { setTab('bills'); setStatusFilter(statusFilter === 'PENDING_APPROVAL' ? 'ALL' : 'PENDING_APPROVAL'); }}
                  >
                    Pending
                    <span style={{
                      fontSize: 10,
                      padding: '0 6px',
                      borderRadius: 'var(--r)',
                      background: (tab === 'bills' && statusFilter === 'PENDING_APPROVAL') ? 'var(--teal-l)' : 'var(--border)',
                      color: (tab === 'bills' && statusFilter === 'PENDING_APPROVAL') ? 'var(--teal)' : 'var(--ink3)',
                      fontWeight: 700
                    }}>
                      {pendingCount}
                    </span>
                  </Button>

                  <div style={{ width: 1, height: 16, background: 'var(--ink3)', opacity: 0.2, alignSelf: 'center', margin: '0 4px' }} />

                  <Button
                    variant="outline"
                    size="sm"
                    className="cc-toolbar-button"
                    aria-pressed={tab === 'bills' && statusFilter === 'OVERDUE'}
                    onClick={() => { setTab('bills'); setStatusFilter(statusFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE'); }}
                    style={overdueCount > 0 ? { color: 'var(--red)' } : {}}
                  >
                    Overdue
                    {overdueCount > 0 && (
                      <span style={{
                        fontSize: 10,
                        padding: '0 6px',
                        borderRadius: 'var(--r)',
                        background: 'var(--red-l)',
                        color: 'var(--red)',
                        fontWeight: 700
                      }}>
                        {overdueCount}
                      </span>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="cc-toolbar-button"
                    aria-pressed={tab === 'bills' && statusFilter === 'PAID'}
                    onClick={() => { setTab('bills'); setStatusFilter(statusFilter === 'PAID' ? 'ALL' : 'PAID'); }}
                  >
                    Paid
                    <span style={{
                      fontSize: 10,
                      padding: '0 6px',
                      borderRadius: 'var(--r)',
                      background: (tab === 'bills' && statusFilter === 'PAID') ? 'var(--teal-l)' : 'var(--border)',
                      color: (tab === 'bills' && statusFilter === 'PAID') ? 'var(--teal)' : 'var(--ink3)',
                      fontWeight: 700
                    }}>
                      {paidCount}
                    </span>
                  </Button>

                  <div style={{ width: 1, height: 16, background: 'var(--ink3)', opacity: 0.2, alignSelf: 'center', margin: '0 4px' }} />

                  <Button
                    variant="outline"
                    size="sm"
                    className="cc-toolbar-button"
                    aria-pressed={tab === 'recurring'}
                    onClick={() => setTab(tab === 'recurring' ? 'bills' : 'recurring')}
                  >
                    Recurring
                    <span style={{
                      fontSize: 10,
                      padding: '0 6px',
                      borderRadius: 'var(--r)',
                      background: tab === 'recurring' ? 'var(--teal-l)' : 'var(--border)',
                      color: tab === 'recurring' ? 'var(--teal)' : 'var(--ink3)',
                      fontWeight: 700
                    }}>
                      {recurringTotal}
                    </span>
                  </Button>
                </div>

                {/* Filter chips / search & dropdowns */}
                <div className="cc-toolbar-filters" style={{ minWidth: 'auto', flex: 'none' }}>
                  <div className="filter-chips">
                    <div className="cc-search" role="search">
                      <Icon name="search" size={13} />
                      <input
                        data-ui-field="input"
                        type="text"
                        value={tab === 'bills' ? search : recurSearch}
                        onChange={e => tab === 'bills' ? setSearch(e.target.value) : setRecurSearch(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') tab === 'bills' ? setSearch('') : setRecurSearch(''); }}
                        placeholder="Search bill # or supplier…"
                        aria-label="Search bills"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      {(tab === 'bills' ? search : recurSearch) && (
                        <button
                          type="button"
                          onClick={() => tab === 'bills' ? setSearch('') : setRecurSearch('')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 0 }}
                          title="Clear search"
                        >
                          <Icon name="x" size={12} />
                        </button>
                      )}
                    </div>

                    {/* Sort Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="filter-chip-btn">
                          <Icon name="arrowUpDown" size={12} className="mr-1 text-muted-foreground" />
                          Sort by
                          <Icon name="chevronDown" size={12} className="ml-1 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => { setSortBy('due_date'); setSortDir('asc'); }}>
                          Due date (Soonest first)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSortBy('bill_date'); setSortDir('desc'); }}>
                          Bill date (Newest first)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSortBy('total'); setSortDir('desc'); }}>
                          Total amount (Highest first)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSortBy('supplier'); setSortDir('asc'); }}>
                          Supplier name (A-Z)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Supplier Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="filter-chip-btn">
                          <Icon name="filter" size={12} className="mr-1 text-muted-foreground" />
                          {supFilter !== 'ALL' && supplierMap[supFilter] ? supplierMap[supFilter].name : 'All suppliers'}
                          <Icon name="chevronDown" size={12} className="ml-1 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 max-h-60 overflow-y-auto">
                        <DropdownMenuItem onClick={() => setSupFilter('ALL')}>
                          All suppliers
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {uniqueSups.map(id => (
                          <DropdownMenuItem key={id} onClick={() => setSupFilter(id)}>
                            {supplierMap[id]?.name ?? id}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {(tab === 'bills' ? hasActiveBillFilters : hasActiveRecurFilters) && (
                      <Button variant="ghost" size="xs" onClick={tab === 'bills' ? clearBillFilters : clearRecurFilters}>
                        <Icon name="x" size={12} /> Clear
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Content View ── */}
              <div style={{ marginTop: 16 }}>

          {tab === 'recurring' ? (
            <RecurringTab
              recurring={filteredRecurring}
              totalCount={recurringTotal}
              loading={recurringLoading}
              error={recurringError}
              hasActiveFilters={hasActiveRecurFilters}
              onRetry={() => setRecurringRefresh(value => value + 1)}
              onClearFilters={clearRecurFilters}
              onCreate={() => { setFormRecur(null); setShowRecurForm(true); }}
              onEdit={r => { setFormRecur(r); setShowRecurForm(true); }}
              onToggle={async r => {
                const newState = r.state === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
                try {
                  await apiFetch(`/v1/bills/recurring/${r.id}`, { method: 'PATCH', body: JSON.stringify({ state: newState }) });
                  setRecurringRefresh(value => value + 1);
                } catch (err) {
                  showAlert(err instanceof Error ? err.message : 'Could not update this recurring bill.');
                }
              }}
              onGenerate={handleGenerate}
              onDelete={async r => {
                try {
                  await apiFetch(`/v1/bills/recurring/${r.id}`, { method: 'DELETE' });
                  setRecurringRefresh(value => value + 1);
                } catch (err) {
                  showAlert(err instanceof Error ? err.message : 'Could not delete this recurring bill.');
                }
              }}
              page={recurringPage}
              pageSize={recurringPageSize}
              onPageChange={setRecurringPage}
              onPageSizeChange={size => { setRecurringPageSize(size); setRecurringPage(1); }}
            />
          ) : (
            <div style={{
              background: 'var(--white)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}>
              {loadingBills ? (
                <SkeletonTable rows={6} cols={8} />
              ) : billError ? (
                <div className="ds-empty-state" role="alert" style={{ padding: '48px 24px' }}>
                  <FeaturedIcon variant="error" size="lg" shape="circle">
                    <Icon name="alertTriangle" size={22} />
                  </FeaturedIcon>
                  <h3>Could not load bills</h3>
                  <p>{billError}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setBillRefresh(value => value + 1)}>
                    <Icon name="refresh" size={13} /> Retry
                  </Button>
                </div>
              ) : displayed.length === 0 ? (
                <div style={{
                  padding: '64px 32px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <div style={{
                    width: 58,
                    height: 58,
                    borderRadius: '50%',
                    background: 'var(--blue-l, #f0f9ff)',
                    border: '1px solid var(--border, #e0f2fe)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--blue, #0284c7)',
                    marginBottom: 16,
                  }}>
                    <Icon name="fileText" size={26} />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 6px' }}>
                    {hasActiveBillFilters ? 'No bills found' : 'No supplier bills yet'}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '0 0 20px', maxWidth: 420 }}>
                    {hasActiveBillFilters
                      ? 'Adjust filters or use "+ New bill" above.'
                      : 'Record supplier invoices to track payables, due dates, partial payments, and TRA EFD receipts.'}
                  </p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {hasActiveBillFilters ? (
                      <>
                        <Button type="button" variant="outline" size="sm" onClick={clearBillFilters}>
                          <Icon name="x" size={13} /> Clear filters
                        </Button>
                        <Button type="button" size="sm" onClick={() => documentRoute.open('new')}>
                          <Icon name="plus" size={14} /> New bill
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button type="button" size="sm" onClick={() => documentRoute.open('new')}>
                          <Icon name="plus" size={14} /> New bill
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setTab('recurring')}>
                          <Icon name="refresh" size={14} /> Recurring schedule
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : viewMode === 'grid' ? (
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-5">
                    {displayed.map(b => {
                      const bal = Math.max(0, b.total - b.paid_amount - (b.credited_amount ?? 0));
                      const over = b.status === 'OVERDUE';
                      const canPay = b.status === 'POSTED' || b.status === 'PARTIAL' || b.status === 'OVERDUE';
                      const canSubmit = b.status === 'DRAFT' || b.status === 'PENDING_APPROVAL';
                      return (
                        <div
                          key={b.id}
                          onClick={() => void openBill(b.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); void openBill(b.id); } }}
                          style={{
                            background: 'var(--white)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--r)',
                            padding: '20px 24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 14,
                            cursor: 'pointer',
                            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--teal-m)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <Link
                                to={`/finance/bills/${b.id}`}
                                onClick={e => e.stopPropagation()}
                                style={{ fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: 700, color: 'var(--teal)', fontVariantNumeric: 'tabular-nums' }}
                              >
                                {b.bill_number}
                              </Link>
                              {b.recurring_id && <div style={{ fontSize: 10.5, color: 'var(--purple)', fontWeight: 600, marginTop: 2 }}>↻ Recurring</div>}
                            </div>
                            <StatusBadge status={b.status} />
                          </div>

                          <div className="flex items-center gap-3 min-w-0">
                            <PersonAvatar kind="suppliers" userId={b.supplier_id || undefined} name={b.supplier_name || 'Supplier'} size={32} />
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-foreground truncate">{b.supplier_name || 'Unassigned supplier'}</div>
                              <div className="text-xs text-muted-foreground truncate mt-0.5">
                                {[b.po_number, supplierMap[b.supplier_id]?.terms, b.shipment_ref].filter(Boolean).join(' · ') || 'No PO / shipment ref'}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                            <div>
                              <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">Billed</div>
                              <div className="font-semibold tabular-nums mt-1">{fmtDate(b.bill_date)}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">Due Date</div>
                              <div className="tabular-nums mt-1" style={{ fontWeight: over ? 700 : 600, color: over ? 'var(--red)' : 'var(--ink)' }}>
                                {fmtDate(b.due_date)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">Balance</div>
                              <div className="font-bold tabular-nums mt-1" style={{ color: bal > 0 ? (over ? 'var(--red)' : 'var(--ink)') : 'var(--green)' }}>
                                {bal > 0 ? formatAmount(bal, b.currency) : 'Settled'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 border-t border-border pt-3" onClick={e => e.stopPropagation()}>
                            <div className="text-xs text-muted-foreground tabular-nums">
                              Total <strong className="text-foreground font-bold">{formatAmount(b.total, b.currency)}</strong>
                            </div>
                            <div className="inline-flex items-center gap-1.5">
                              {canPay && (
                                <Button type="button" variant="outline" size="xs" onClick={() => setPayTarget(bills.find(x => x.id === b.id) ?? null)}>
                                  Pay
                                </Button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button type="button" variant="ghost" size="icon" iconOnly aria-label={`Actions for ${b.bill_number}`}>
                                    <Icon name="moreHorizontal" size={14} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem onSelect={() => void openBill(b.id)}>
                                    <Icon name="eye" size={13} className="mr-2" /> View bill
                                  </DropdownMenuItem>
                                  {canPay && (
                                    <DropdownMenuItem onSelect={() => setPayTarget(bills.find(x => x.id === b.id) ?? null)}>
                                      <Icon name="dollarSign" size={13} className="mr-2" /> Record payment
                                    </DropdownMenuItem>
                                  )}
                                  {canSubmit && (
                                    <DropdownMenuItem onSelect={() => void handlePost(b)}>
                                      <Icon name="send" size={13} className="mr-2" /> {b.status === 'DRAFT' ? 'Submit bill' : 'Approve bill'}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onSelect={() => void openBill(b.id, true)}>
                                    <Icon name="edit" size={13} className="mr-2" /> Edit bill
                                  </DropdownMenuItem>
                                  {b.status !== 'PAID' && b.status !== 'VOID' && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setVoidTarget(bills.find(x => x.id === b.id) ?? null)}>
                                        <Icon name="xCircle" size={13} className="mr-2" /> Void bill
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <PaginationBar
                    page={page}
                    pageSize={pageSize}
                    total={matchCount}
                    onPageChange={setPage}
                    onPageSizeChange={size => { setPageSize(size); setPage(1); }}
                    pageSizeOptions={[10, 25, 50, 100]}
                    itemLabel="bill"
                    bordered={true}
                  />
                </div>
              ) : (
                <div>
                  <div className="rtbl-wrap">
                    <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ width: 44, padding: '12px 14px 12px 24px', textAlign: 'center' }} aria-label="Expand" />
                          <th style={{ ...thS, padding: '12px 16px' }}>
                            <button type="button" onClick={() => toggleSort('supplier')} className="dt-sort-button">
                              Supplier <SortIco col="supplier" />
                            </button>
                          </th>
                          <th style={{ ...thS, padding: '12px 16px' }}>Bill &amp; PO Ref</th>
                          <th style={{ ...thS, padding: '12px 16px' }}>
                            <button type="button" onClick={() => toggleSort('bill_date')} className="dt-sort-button">
                              Billed <SortIco col="bill_date" />
                            </button>
                          </th>
                          <th style={{ ...thS, padding: '12px 16px' }}>
                            <button type="button" onClick={() => toggleSort('due_date')} className="dt-sort-button">
                              Due Date <SortIco col="due_date" />
                            </button>
                          </th>
                          <th style={{ ...thS, padding: '12px 16px', textAlign: 'right' }}>
                            <button type="button" onClick={() => toggleSort('total')} className="dt-sort-button" style={{ justifyContent: 'flex-end' }}>
                              Total <SortIco col="total" />
                            </button>
                          </th>
                          <th style={{ ...thS, padding: '12px 16px', textAlign: 'right', cursor: 'default' }}>Balance</th>
                          <th style={{ ...thS, padding: '12px 16px', cursor: 'default' }}>Status</th>
                          <th aria-label="Actions" style={{ ...thS, padding: '12px 24px 12px 16px', textAlign: 'right', cursor: 'default' }} />
                        </tr>
                      </thead>
                      <tbody>
                        {displayed.map(b => {
                          const bal = Math.max(0, b.total - b.paid_amount - (b.credited_amount ?? 0));
                          const over = b.status === 'OVERDUE';
                          const canPay = b.status === 'POSTED' || b.status === 'PARTIAL' || b.status === 'OVERDUE';
                          const canSubmit = b.status === 'DRAFT' || b.status === 'PENDING_APPROVAL';
                          const subMeta = [b.po_number, b.shipment_ref, supplierMap[b.supplier_id]?.terms].filter(Boolean).join(' · ');
                          return (
                            <tr
                              key={b.id}
                              onClick={() => void openBill(b.id)}
                              tabIndex={0}
                              onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); void openBill(b.id); } }}
                              style={{
                                borderBottom: '1px solid var(--border)',
                                cursor: 'pointer',
                                transition: 'background 0.12s ease',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                              onMouseLeave={e => (e.currentTarget.style.background = '')}
                            >
                              <td style={{ padding: '14px 8px 14px 24px', textAlign: 'center', width: 44 }} onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => void openBill(b.id)}
                                  className="ch-chevron"
                                  title="View bill details"
                                  style={{
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--ink3)',
                                    padding: 0,
                                  }}
                                  data-ui-native-button=""
                                >
                                  <Icon name="chevronRight" size={14} />
                                </button>
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                <div className="flex items-center gap-3 min-w-0">
                                  <PersonAvatar kind="suppliers" userId={b.supplier_id || undefined} name={b.supplier_name || 'Supplier'} size={32} />
                                  <div className="min-w-0">
                                    <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 13.5 }} className="truncate">
                                      {b.supplier_name || 'Unassigned supplier'}
                                    </div>
                                    {subMeta && (
                                      <div style={{ fontSize: 11.5, fontFamily: 'var(--font)', color: 'var(--ink3)', marginTop: 2 }} className="truncate">
                                        {subMeta}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                                <div style={{ fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700, color: 'var(--teal)', fontVariantNumeric: 'tabular-nums' }}>
                                  <Link to={`/finance/bills/${b.id}`} onClick={e => e.stopPropagation()}>
                                    {b.bill_number}
                                  </Link>
                                </div>
                                {b.recurring_id ? (
                                  <div style={{ fontSize: 11, color: 'var(--purple)', fontWeight: 600, marginTop: 2 }}>↻ Recurring</div>
                                ) : b.po_number ? (
                                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>PO: {b.po_number}</div>
                                ) : null}
                              </td>
                              <td style={{ padding: '14px 16px', color: 'var(--ink2)', fontSize: 13, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                {fmtDate(b.bill_date)}
                              </td>
                              <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                <div style={{ color: over ? 'var(--red)' : 'var(--ink)', fontWeight: over ? 700 : 500, fontSize: 13 }}>
                                  {fmtDate(b.due_date)}
                                </div>
                                {over && (
                                  <div style={{ marginTop: 3 }}>
                                    <span style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 3,
                                      fontSize: 10.5,
                                      fontWeight: 700,
                                      color: 'var(--red)',
                                      background: 'var(--red-l)',
                                      padding: '1px 6px',
                                      borderRadius: 4,
                                    }}>
                                      <Icon name="alertTriangle" size={10} color="var(--red)" />
                                      {daysOverdue(b.due_date)}d overdue
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '14px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                <div style={{ fontWeight: 800, color: 'var(--ink)', fontSize: 13.5 }}>{formatAmount(b.total, b.currency)}</div>
                                {b.paid_amount > 0 && (
                                  <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, marginTop: 2 }}>
                                    Paid {formatAmount(b.paid_amount, b.currency)}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '14px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                {bal > 0 ? (
                                  <div style={{ fontWeight: 700, color: over ? 'var(--red)' : 'var(--ink)', fontSize: 13.5 }}>
                                    {formatAmount(bal, b.currency)}
                                  </div>
                                ) : (
                                  <span style={{
                                    display: 'inline-block',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: 'var(--green)',
                                    background: 'var(--green-l)',
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                  }}>
                                    Settled
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                                <StatusBadge status={b.status} />
                              </td>
                              <td style={{ padding: '14px 24px 14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  {canPay && (
                                    <Button type="button" variant="outline" size="xs" onClick={() => setPayTarget(bills.find(x => x.id === b.id) ?? null)}>
                                      Pay
                                    </Button>
                                  )}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button type="button" variant="ghost" size="icon" iconOnly aria-label={`Actions for ${b.bill_number}`}>
                                        <Icon name="moreHorizontal" size={14} />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44">
                                      <DropdownMenuItem onSelect={() => void openBill(b.id)}>
                                        <Icon name="eye" size={13} className="mr-2" /> View bill
                                      </DropdownMenuItem>
                                      {canPay && (
                                        <DropdownMenuItem onSelect={() => setPayTarget(bills.find(x => x.id === b.id) ?? null)}>
                                          <Icon name="dollarSign" size={13} className="mr-2" /> Record payment
                                        </DropdownMenuItem>
                                      )}
                                      {canSubmit && (
                                        <DropdownMenuItem onSelect={() => void handlePost(b)}>
                                          <Icon name="send" size={13} className="mr-2" /> {b.status === 'DRAFT' ? 'Submit bill' : 'Approve bill'}
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem onSelect={() => void openBill(b.id, true)}>
                                        <Icon name="edit" size={13} className="mr-2" /> Edit bill
                                      </DropdownMenuItem>
                                      {b.status !== 'PAID' && b.status !== 'VOID' && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setVoidTarget(bills.find(x => x.id === b.id) ?? null)}>
                                            <Icon name="xCircle" size={13} className="mr-2" /> Void bill
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    page={page}
                    pageSize={pageSize}
                    total={matchCount}
                    onPageChange={setPage}
                    onPageSizeChange={size => { setPageSize(size); setPage(1); }}
                    pageSizeOptions={[10, 25, 50, 100]}
                    itemLabel="bill"
                    bordered={true}
                  />
                </div>
              )}
            </div>
          )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
