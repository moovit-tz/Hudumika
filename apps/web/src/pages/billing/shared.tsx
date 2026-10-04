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
export type Currency = 'TZS' | 'USD';

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
  id: string;
  _dbId?: string;
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

export function fmtAmt(n: number, cur: Currency) { return cur === 'USD' ? fmtUSD(n) : fmtTZS(n); }

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
  return { cl, sh, ot, sub, tax, tot, clearingTotal, shippingTotal, otherTotal, grandTotalTZS };
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

export const UNIT_OPTIONS = ['PER BIL', 'PER BILL', 'PER CONT', 'PER CONTAINER', 'BASIC RATE', 'FLAT', 'PER DAY', 'PER TON', 'PER CBM'];

export function mapApiInvoice(d: any): Invoice {
  return {
    id: d.invoice_number || d.id,
    _dbId: d.id,
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
    exchangeRate: Number(d.exchange_rate) || 2650,
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
      currency: (it.currency || 'TZS') as Currency,
    })) : [],
  };
}

/* ── Print / PDF ── */
export function openPrintWindow(inv: Invoice) {
  const T = invoiceTotals(inv);
  const due = T.grandTotalTZS - inv.received;
  const co = getCompany();

  const sectionHtml = (
    title: string, currency: Currency, items: LineItem[], subTotal: number, taxAmt: number, total: number
  ) => {
    const fmt = (n: number) => currency === 'USD' ? fmtUSD(n) : fmtTZS(n);
    const rows = items.map((it, i) => {
      const lineSub = it.qty * it.rate;
      const lineTax = lineSub * it.taxPct / 100;
      return `<tr>
        <td>${it.name}</td><td>${it.unit}</td>
        <td style="text-align:right;font-family:monospace">${fmt(it.rate)}</td>
        <td style="text-align:right">${it.qty}</td>
        <td style="text-align:right;font-family:monospace">${fmt(lineSub)}</td>
        <td style="text-align:right;font-family:monospace">${lineTax > 0 ? fmt(lineTax) : '0'}</td>
        <td style="text-align:right;font-family:monospace;font-weight:700">${fmt(lineSub + lineTax)}</td>
      </tr>`;
    }).join('');
    const emptyRow = `<tr><td colspan="6" style="color:#9ca3af;font-style:italic;padding:10px 12px">No charges</td><td style="text-align:right;font-family:monospace">0</td></tr>`;
    return `
      <div class="section">
        <div class="sec-hdr">${title}</div>
        <table><thead><tr>
          <th>Item</th><th>Unit</th><th style="text-align:right">Amount/Unit</th>
          <th style="text-align:right">Qty</th><th style="text-align:right">Sub total</th>
          <th style="text-align:right">VAT Tax</th><th style="text-align:right">Total Amount</th>
        </tr></thead><tbody>${items.length ? rows : emptyRow}</tbody></table>
        <div class="subtotal"><span>SUB-TOTAL</span><span style="font-family:monospace">${items.length ? fmt(total) : fmt(0)}</span></div>
      </div>`;
  };

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${inv.id}</title><style>
@font-face {
  font-family: 'Atlassian Sans';
  src: url('${window.location.origin}/fonts/AtlassianSans.ttf') format('truetype');
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Atlassian Sans',Arial,sans-serif;color:#111;padding:24px 32px;font-size:11px}
.top{display:flex;justify-content:space-between;margin-bottom:16px}
.inv-no{font-size:18px;font-weight:900;color:#0b1e3a;margin-bottom:4px}
.from{line-height:1.6;color:#555}.from strong{color:#111;font-size:12px}
.bill{text-align:right}.bill .lbl{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:2px}
.bill .client{font-size:12px;font-weight:700;color:#2563eb;margin-bottom:2px}.bill .addr{color:#555;line-height:1.6}
.meta div{display:flex;gap:6px;justify-content:flex-end;margin-top:2px}
.meta .ml{font-weight:700;color:#9ca3af}
.mid{display:flex;align-items:flex-start;justify-content:space-between;padding:8px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;margin-bottom:12px}
.to-block{}.to-block .to-lbl{font-size:8px;font-weight:800;text-transform:uppercase;color:#9ca3af;letter-spacing:.08em;margin-bottom:4px}
.to-block .to-client{font-size:13px;font-weight:700;color:#111;margin-bottom:2px}
.to-block .to-addr{color:#555;line-height:1.6}
.qr-block{display:flex;flex-direction:column;align-items:center;gap:2px}
.qr-block .qr-lbl{font-size:8px;color:#9ca3af;text-align:center;font-weight:700;letter-spacing:.04em}
.ship{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;padding:6px 10px;background:#f9fafb;border-radius:6px;margin-bottom:12px;font-size:10px}
.ship strong{color:#374151}
.section{margin-bottom:8px}
.sec-hdr{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#374151;padding:4px 8px;background:#f3f4f6;border-left:3px solid #0b1e3a;margin-bottom:0}
table{width:100%;border-collapse:collapse}
thead tr{background:#f9fafb;border-bottom:1px solid #e5e7eb}
th{padding:4px 6px;text-align:left;font-size:9px;font-weight:700;color:#6b7280;letter-spacing:.04em}
td{padding:4px 6px;border-bottom:1px solid #f3f4f6;vertical-align:top;font-size:10.5px}
.subtotal{display:flex;justify-content:space-between;padding:4px 8px;background:#f9fafb;font-weight:700;font-size:11px;border-top:2px solid #e5e7eb}
.grand{display:flex;justify-content:flex-end;gap:32px;align-items:center;margin:8px 0;padding:8px 10px;background:#0b1e3a;color:#fff;border-radius:6px;font-size:12px;font-weight:800}
.due{display:flex;justify-content:flex-end;gap:32px;margin-bottom:12px;font-size:12px;font-weight:700;color:#dc2626}
.terms{padding-top:8px;border-top:1px solid #e5e7eb}
.terms h4{font-size:10px;font-weight:700;margin-bottom:4px;color:#374151}
.terms p{font-size:10px;color:#6b7280;line-height:1.6}
@media print{body{padding:10px 16px}}
</style></head><body>
<div class="top">
  <div>
    <div class="from">
      ${co.logoUrl ? `<img src="${co.logoUrl}" style="max-height:38px;max-width:140px;object-fit:contain;margin-bottom:4px" alt="${co.name}">` : `<div style="font-size:16px;font-weight:800;color:#111;margin-bottom:4px">${co.name}</div>`}
      <br>${co.address}<br>${co.city}, ${co.country} · VAT: ${co.taxId}
    </div>
  </div>
</div>
<div class="mid">
  <div class="to-block">
    <div class="to-lbl">Bill To</div>
    <div class="to-client">${inv.client}</div>
    <div class="to-addr">${inv.clientAddress.join('<br>')}</div>
  </div>
  <div class="qr-block">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(JSON.stringify({ ref: inv.refCode, inv: inv.id, amt: T.grandTotalTZS }))}" alt="QR" style="width:64px;height:64px;border:1px solid #e5e7eb;padding:2px;border-radius:6px">
    <div class="qr-lbl">Ref: ${inv.refCode}<br>v${inv.version}</div>
  </div>
  <div style="text-align:right;font-size:12px;color:#555">
    <div style="font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px;font-size:9px">Invoice Details</div>
    <div style="margin-bottom:4px;display:flex;justify-content:flex-end;gap:12px"><span>Invoice #:</span><strong style="color:#0d9488">${inv.id}</strong></div>
    <div style="margin-bottom:4px;display:flex;justify-content:flex-end;gap:12px"><span>Invoice Date:</span><strong style="color:#111">${inv.billDate}</strong></div>
    ${inv.dueDate ? `<div style="margin-bottom:4px;display:flex;justify-content:flex-end;gap:12px"><span>Due Date:</span><strong style="${inv.status === 'Overdue' ? 'color:#dc2626' : 'color:#111'}">${inv.dueDate}</strong></div>` : ''}
    <div style="margin-bottom:4px;display:flex;justify-content:flex-end;gap:12px"><span>Agent:</span><strong style="color:#111">${inv.saleAgent}</strong></div>
  </div>
</div>
<div class="ship">
  <div><strong>BIL:</strong> ${inv.blNumber}</div>
  <div><strong>ORIGIN:</strong> ${inv.origin}</div>
  <div><strong>MODE:</strong> ${inv.mode}</div>
  <div><strong>DESTINATION:</strong> ${inv.destination}</div>
</div>
${sectionHtml('Clearing Charges – Paid in TZS', 'TZS', T.cl, T.sub(T.cl), T.tax(T.cl), T.clearingTotal)}
${sectionHtml('Shipping Line Charges – Paid in USD', 'USD', T.sh, T.sub(T.sh), T.tax(T.sh), T.shippingTotal)}
${sectionHtml('Other Charges – Paid in TZS', 'TZS', T.ot, T.sub(T.ot), T.tax(T.ot), T.otherTotal)}
<div class="grand"><span>GRAND TOTAL</span><span>${fmtTZS(T.grandTotalTZS)}</span></div>
${inv.exchangeRate > 0 && T.shippingTotal > 0 ? `<div style="text-align:right;font-size:11px;color:#555;margin-bottom:12px">USD shipping converted at 1 USD = TZS ${inv.exchangeRate.toLocaleString()}</div>` : ''}
${inv.received > 0 ? `<div class="due"><span>Less: Amount Received</span><span style="color:#059669">(${fmtTZS(inv.received)})</span></div>` : ''}
<div class="due"><span>Amount Due</span><span>${fmtTZS(Math.max(0, due))}</span></div>
${inv.shipmentCarbon ? `
<div style="margin-top:12px;padding:12px;background:#dafbe1;border-radius:6px;font-size:10px;color:#111;border:1px solid #a7f3d0">
  <div style="font-weight:800;text-transform:uppercase;margin-bottom:6px;color:#111">Carbon Footprint (Estimate)</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;line-height:1.6">
    <div><strong>CO₂ Emissions:</strong> ${Number(inv.shipmentCarbon.co2_emissions_kg).toLocaleString()} kg</div>
    <div><strong style="color:#059669">Credits Saved:</strong> ${Number(inv.shipmentCarbon.carbon_credits_saved).toFixed(2)}</div>
    ${inv.shipmentCarbon.distance_km ? `<div><strong>Distance:</strong> ${inv.shipmentCarbon.distance_km} km</div>` : ''}
  </div>
  <div style="font-size:8.5px;color:#9ca3af;margin-top:6px;font-style:italic">GLEC v3.2 / ISO 14083 methodology. Internal ESG estimate – not a registry-issued or tradeable carbon credit.</div>
</div>` : ''}
<div style="margin-top:20px;padding:12px;background:#f9fafb;border-radius:6px;font-size:10px;color:#111;border:1px solid #e5e7eb">
  <div style="font-weight:800;text-transform:uppercase;margin-bottom:6px;color:#111">Payment Information</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;line-height:1.6">
    <div>
      <div><strong>Bank Name:</strong> CRDB Bank Plc</div>
      <div><strong>Account Name:</strong> Moovit ClearOS Ltd</div>
      <div><strong>Account No:</strong> 0150244433200</div>
      <div><strong>Swift Code:</strong> CORUTZTZ</div>
    </div>
    <div>
      <div style="margin-bottom:2px"><strong>Pay Online:</strong></div>
      <a href="https://pay.moovit.co.tz/invoice/${inv.id}" style="color:#2563eb;text-decoration:none">https://pay.moovit.co.tz/invoice/${inv.id}</a>
    </div>
  </div>
</div>
${inv.terms ? `<div class="terms"><h4>TERMS &amp; CONDITIONS</h4><p>${inv.terms}</p></div>` : ''}
<script>window.onload=function(){window.print()}</script>
</body></html>`;

  const win = window.open('', '_blank', 'width=860,height=1000');
  if (win) { win.document.write(html); win.document.close(); }
}
