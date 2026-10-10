import { formatAmount } from '../../lib/currency.js';
import { showAlert } from '../../lib/alert.js';
import { getCompany } from '../../data/companyStore.js';

/* ── In-progress invoice draft, preserved across a trip to the full
   customer-onboarding page and back (see InvoiceEditor's createCustomer/
   restoreDraft below) – sessionStorage, not localStorage, since it should
   only survive this one tab's round trip, not linger indefinitely. */
const INVOICE_DRAFT_KEY = 'hudumika_invoice_draft';

export interface InvoiceDraft {
  client: string; addr: string; billDate: string; dueDate: string; agent: string;
  blNo: string; origin: string; dest: string; mode: string; exRate: string; terms: string;
  clearing: EditItem[]; shipping: EditItem[]; other: EditItem[];
  businessLineId?: string;
  documentCurrency?: string;
}

export function saveInvoiceDraft(draft: InvoiceDraft) {
  try { sessionStorage.setItem(INVOICE_DRAFT_KEY, JSON.stringify(draft)); } catch {}
}

export function takeInvoiceDraft(): InvoiceDraft | null {
  try {
    const raw = sessionStorage.getItem(INVOICE_DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(INVOICE_DRAFT_KEY);
    return JSON.parse(raw);
  } catch { return null; }
}

/* ── Types ── */
export type Status = 'Draft' | 'Partial' | 'Paid' | 'Credited' | 'Unpaid' | 'Overdue';
export type PageMode = 'list' | 'view' | 'edit' | 'create';
export type FilterStatus = 'all' | Status;
export type ChargeGroup = 'clearing' | 'shipping' | 'other';
export type Currency = string;

export interface LineItem {
  name: string;
  unit: string;      // 'PER BIL', 'PER CONT', 'BASIC RATE', etc.
  rate: number;
  qty: number;
  taxPct: number;
  group: ChargeGroup;
  currency: Currency;
}

export interface InvNote       { id: string; author_name: string; content: string; created_at: string; }
export interface InvTask       { id: string; description: string; assignee: string | null; due_date: string | null; done: boolean; created_at: string; }
export interface InvReminder   { id: string; remind_date: string; message: string; done: boolean; }
export interface InvAuditEntry { id: string; action: string; detail: string | null; actor_name: string | null; created_at: string; }

export interface Invoice {
  payments?: {id:string;amount:number;method:string;date:string}[];
  id: string;
  _dbId?: string;
  documentCurrency?: string;
  customerId?: string;
  businessLineId?: string;
  shipmentRef?: string;
  client: string;
  clientAddress: string[];
  blNumber: string;
  origin: string;
  destination: string;
  mode: 'SEA' | 'AIR' | 'ROAD';
  billDate: string;
  dueDate: string | null;
  saleAgent: string;
  terms: string;
  items: LineItem[];
  exchangeRate: number;
  refCode: string;
  version: number;
  status: Status;
  received: number;
  hasNote?: boolean;
  // TRA VFD fiscalization
  traStatus?: string;       // 'pending' | 'submitted' | 'failed' | 'skipped'
  traRctvnum?: string;      // Verification number printed/QR-encoded on the receipt
  traQrUrl?: string;        // Real TRA verify-portal URL for the QR code
  traAckCode?: number;      // 0 = accepted by TRA
  traAckMsg?: string;
  // Carbon segment – resolved live from the linked shipment (by shipment_ref
  // → ref_number match), not stored on the invoice. Internal ESG estimate,
  // not a registry-issued tradeable credit.
  shipmentCarbon?: { co2_emissions_kg: number; carbon_credits_saved: number; distance_km: number | null; mode: string | null } | null;
}

/* ── EditItem – LineItem with a stable local uid for the editor ── */
export type EditItem = LineItem & { uid: string };

/* ── Helpers ── */
export const fmtTZS = (n: number) => `TZS ${Math.round(n).toLocaleString()}`;
export const fmtUSD = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function fmtAmt(n: number, cur: Currency) { return formatAmount(n, cur); }

export function invoiceTotals(inv: Invoice) {
  const grp = (g: ChargeGroup) => inv.items.filter(i => i.group === g);
  const sub  = (items: LineItem[]) => items.reduce((s, i) => s + i.qty * i.rate, 0);
  const tax  = (items: LineItem[]) => items.reduce((s, i) => s + i.qty * i.rate * i.taxPct / 100, 0);
  const tot  = (items: LineItem[]) => sub(items) + tax(items);
  const cl = grp('clearing'); const sh = grp('shipping'); const ot = grp('other');
  const clearingTotal = tot(cl);
  const shippingTotal = tot(sh);          // USD
  const otherTotal    = tot(ot);
  const grandTotalTZS = clearingTotal + otherTotal + shippingTotal * inv.exchangeRate;
  const documentCurrency = (inv.documentCurrency || 'TZS').toUpperCase();
  const documentTotal = Math.round(inv.items.reduce((sum, item) => {
    const gross = Math.round(item.qty * item.rate * (1 + item.taxPct / 100) * 100) / 100;
    const converted = (item.currency || documentCurrency).toUpperCase() === documentCurrency ? gross : Math.round(gross * inv.exchangeRate * 100) / 100;
    return sum + converted;
  }, 0) * 100) / 100;
  return { cl, sh, ot, sub, tax, tot, clearingTotal, shippingTotal, otherTotal, grandTotalTZS, documentTotal };
}

export function invoiceTotal(inv: Invoice) { return invoiceTotals(inv).grandTotalTZS; }

export function genRefCode(id: string, version: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let seed = (id ?? '').split('').reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 17);
  let h = '';
  for (let i = 0; i < 6; i++) { h += chars[seed % chars.length]; seed = (seed * 1103515245 + 12345) >>> 0; }
  return `${h.slice(0, 3)}-${h.slice(3)}-V${String(version).padStart(2, '0')}`;
}

export function normalizeStatus(st?: string): Status {
  if (!st) return 'Draft';
  const s = st.trim().toLowerCase();
  if (s === 'draft') return 'Draft';
  if (s === 'partial' || s === 'partially paid' || s === 'partially_paid') return 'Partial';
  if (s === 'paid' || s === 'fully paid' || s === 'fully_paid') return 'Paid';
  if (s === 'credited') return 'Credited';
  if (s === 'unpaid' || s === 'not paid' || s === 'not_paid') return 'Unpaid';
  if (s === 'overdue') return 'Overdue';
  return 'Draft';
}

export const STATUS_STYLE: Record<Status, { bg: string; color: string; label: string }> = {
  Draft:    { bg: 'var(--border)', color: 'var(--ink)', label: 'Draft'          },
  Partial:  { bg: 'var(--blue-l)', color: 'var(--blue)', label: 'Partially paid' },
  Paid:     { bg: 'var(--ink)', color: 'var(--white)', label: 'Fully paid'     },
  Credited: { bg: 'var(--purple-l)', color: 'var(--purple)', label: 'Credited' },
  Unpaid:   { bg: 'var(--gold-l)', color: 'var(--gold)', label: 'Not paid'       },
  Overdue:  { bg: 'var(--red-l)', color: 'var(--red)', label: 'Overdue'        },
};

export function getStatusStyle(st?: string): { bg: string; color: string; label: string } {
  const norm = normalizeStatus(st);
  return STATUS_STYLE[norm] || STATUS_STYLE.Draft;
}

const STATUS_VARIANT: Record<Status, 'gray' | 'info' | 'success' | 'warning' | 'error' | 'default'> = {
  Draft: 'gray', Partial: 'info', Paid: 'default', Credited: 'info',
  Unpaid: 'warning', Overdue: 'error',
};
export function getStatusVariant(st?: string) {
  const norm = normalizeStatus(st);
  return { variant: STATUS_VARIANT[norm] || ('gray' as const), label: (STATUS_STYLE[norm] || STATUS_STYLE.Draft).label };
}

export const UNIT_OPTIONS = ['PER BIL', 'PER BILL', 'PER CONT', 'PER CONTAINER', 'BASIC RATE', 'FLAT', 'PER DAY', 'PER TON', 'PER CBM'];

export function mapApiInvoice(d: any): Invoice {
  return {
    id: d.invoice_number || d.id,
    _dbId: d.id,
    payments: Array.isArray(d.payments) ? d.payments.map((payment: any) => ({id:payment.id,amount:Number(payment.amount),method:payment.method,date:String(payment.payment_date || '').split('T')[0]})) : undefined,
    documentCurrency: d.currency || 'TZS',
    customerId: d.customer_id || undefined,
    businessLineId: d.business_line_id || undefined,
    shipmentRef: d.shipment_ref || undefined,
    client: d.client_name || '',
    clientAddress: (() => { try { return Array.isArray(d.client_address) ? d.client_address : JSON.parse(d.client_address || '[]'); } catch { return []; } })(),
    blNumber: d.bl_number || '',
    origin: d.origin || '',
    destination: d.destination || '',
    mode: (d.mode || 'SEA') as Invoice['mode'],
    billDate: d.bill_date ? String(d.bill_date).split('T')[0].split('-').reverse().join('-') : '',
    dueDate: d.due_date ? String(d.due_date).split('T')[0].split('-').reverse().join('-') : null,
    saleAgent: d.sale_agent || '',
    terms: d.payment_terms || '',
    exchangeRate: Number(d.exchange_rate) || 1,
    status: normalizeStatus(d.status),
    received: Number(d.received) || 0,
    version: Number(d.version) || 1,
    refCode: d.ref_code || genRefCode(d.invoice_number || d.id, Number(d.version) || 1),
    traStatus: d.tra_status || 'pending',
    traRctvnum: d.tra_rctvnum || undefined,
    traQrUrl: d.tra_qr_url || undefined,
    traAckCode: d.tra_ack_code ?? undefined,
    traAckMsg: d.tra_ack_msg || undefined,
    shipmentCarbon: d.shipment_carbon ?? null,
    items: Array.isArray(d.items) ? d.items.map((it: any) => ({
      name: it.name, unit: it.unit || 'PER BIL', rate: Number(it.rate),
      qty: Number(it.qty), taxPct: Number(it.tax_pct),
      group: (it.line_group || 'other') as ChargeGroup,
      currency: (it.currency || d.currency || 'TZS') as Currency,
    })) : [],
  };
}

/* ── Print / PDF ── */
export function openPrintWindow(inv: Invoice) {
  const source = Array.from(document.querySelectorAll<HTMLElement>('[data-invoice-document]')).find(node => node.dataset.invoiceDocument === inv.id);
  if (!source) {
    showAlert('Open the Invoice tab before viewing or printing this invoice.');
    return;
  }
  const win = window.open('', '_blank', 'width=860,height=1000');
  if (!win) {
    showAlert('Allow pop-ups for Hudumika to view or print this invoice.');
    return;
  }
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(node=>node.outerHTML).join('');
  // App styles include other tools' print rules; the standalone invoice owns its page format.
  win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Invoice</title>${styles}<style>
    @page { size:A4; margin:12mm; }
    html,body{height:auto;overflow:visible;background:white;color:#0b1220}
    body{padding:24px;margin:0}
    [data-invoice-document]{background:white;color:#0b1220;box-shadow:none}
    @media print{body{padding:0} body *{visibility:visible!important} table{width:100%} tr{break-inside:avoid}}
  </style></head><body></body></html>`);
  win.document.title = `Invoice ${inv.id}`;
  const computed = getComputedStyle(source);
  for (const property of Array.from(computed)) {
    if (property.startsWith('--')) win.document.body.style.setProperty(property, computed.getPropertyValue(property));
  }
  for (const [property, value] of Object.entries({
    '--background':'0 0% 100%', '--foreground':'216 28% 7%',
    '--card':'0 0% 100%', '--card-foreground':'216 28% 7%',
    '--muted-foreground':'212 10% 38%', '--border':'214 24% 90%',
    '--ink':'#0b1220', '--ink2':'#374151', '--ink3':'#5b6472',
    '--bg':'#ffffff', '--surface':'#ffffff', '--white':'#ffffff',
  })) win.document.body.style.setProperty(property, value);
  win.document.body.appendChild(source.cloneNode(true));
  win.addEventListener('load',()=>{void win.document.fonts.ready.then(()=>win.print());},{once:true});
  win.document.close();
}
