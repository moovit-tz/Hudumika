import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Icon } from '../components/Icon.js';
import { getCompany, subscribeCompany } from '../data/companyStore.js';
import { useIsDarkMode } from '../hooks/useIsDarkMode.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover.js';
import { Button } from '../components/ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import './Billing.css';
import { showConfirm } from '../lib/confirm.js';
import { showAlert } from '../lib/alert.js';
import { PageHeader } from '../components/PageHeader.js';
import { FormPage } from '../components/FormPage.js';
import { MetricsRow } from '../components/MetricCard.js';

/* ── In-progress invoice draft, preserved across a trip to the full
   customer-onboarding page and back (see InvoiceEditor's createCustomer/
   restoreDraft below) — sessionStorage, not localStorage, since it should
   only survive this one tab's round trip, not linger indefinitely. */
const INVOICE_DRAFT_KEY = 'hudumika_invoice_draft';

interface InvoiceDraft {
  client: string; addr: string; billDate: string; dueDate: string; agent: string;
  blNo: string; origin: string; dest: string; mode: string; exRate: string; terms: string;
  clearing: EditItem[]; shipping: EditItem[]; other: EditItem[];
}

function saveInvoiceDraft(draft: InvoiceDraft) {
  try { sessionStorage.setItem(INVOICE_DRAFT_KEY, JSON.stringify(draft)); } catch {}
}

function takeInvoiceDraft(): InvoiceDraft | null {
  try {
    const raw = sessionStorage.getItem(INVOICE_DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(INVOICE_DRAFT_KEY);
    return JSON.parse(raw);
  } catch { return null; }
}

/* ── Types ── */
export type Status = 'Draft' | 'Partial' | 'Paid' | 'Credited' | 'Unpaid' | 'Overdue';
type PageMode = 'list' | 'view' | 'edit' | 'create';
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
  // Carbon segment — resolved live from the linked shipment (by shipment_ref
  // → ref_number match), not stored on the invoice. Internal ESG estimate,
  // not a registry-issued tradeable credit.
  shipmentCarbon?: { co2_emissions_kg: number; carbon_credits_saved: number; distance_km: number | null; mode: string | null } | null;
}

/* ── Helpers ── */
export const fmtTZS = (n: number) => `TZS ${Math.round(n).toLocaleString()}`;
const fmtUSD = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtAmt(n: number, cur: Currency) { return cur === 'USD' ? fmtUSD(n) : fmtTZS(n); }

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

export const STATUS_STYLE: Record<Status, { bg: string; color: string; label: string }> = {
  Draft:    { bg: '#e5e7eb', color: 'var(--ink)', label: 'Draft'          },
  Partial:  { bg: 'var(--blue-l)', color: 'var(--blue)', label: 'Partially paid' },
  Paid:     { bg: '#1e293b', color: '#f1f5f9', label: 'Fully paid'     },
  Credited: { bg: '#fce7f3', color: '#be185d', label: 'Credited'       },
  Unpaid:   { bg: 'var(--gold-l)', color: 'var(--gold)', label: 'Not paid'       },
  Overdue:  { bg: 'var(--red-l)', color: 'var(--red)', label: 'Overdue'        },
};

const UNIT_OPTIONS = ['PER BIL', 'PER BILL', 'PER CONT', 'PER CONTAINER', 'BASIC RATE', 'FLAT', 'PER DAY', 'PER TON', 'PER CBM'];

export function mapApiInvoice(d: any): Invoice {
  return {
    id: d.invoice_number || d.id,
    _dbId: d.id,
    customerId: d.customer_id || undefined,
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
    status: (d.status || 'Draft') as Status,
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

const tbBtn: React.CSSProperties = {
  height: 30, padding: '0 10px', borderRadius: 7, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
  fontFamily: 'var(--font)', whiteSpace: 'nowrap' as const,
};

function MoreItem({ icon, label, onClick, danger }: { icon: import('../components/Icon.js').IconName; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`billing-more-item${danger ? ' billing-more-item--danger' : ''}`}>
      <Icon name={icon} size={14} color={danger ? 'var(--red)' : 'var(--ink3)'} /> {label}
    </button>
  );
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
    const emptyRow = `<tr><td colspan="6" style="color:var(--ink3);font-style:italic;padding:10px 12px">No charges</td><td style="text-align:right;font-family:monospace">0</td></tr>`;
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
  font-family: 'Google Sans Flex';
  src: url('${window.location.origin}/fonts/GoogleSansFlex.ttf') format('truetype');
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Google Sans Flex',Arial,sans-serif;color:#111;padding:24px 32px;font-size:11px}
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
  <div style="text-align:right;font-size:12px;color:var(--ink2)">
    <div style="font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px;font-size:9px">Invoice Details</div>
    <div style="margin-bottom:4px;display:flex;justify-content:flex-end;gap:12px"><span>Invoice #:</span><strong style="color:#0d9488">${inv.id}</strong></div>
    <div style="margin-bottom:4px;display:flex;justify-content:flex-end;gap:12px"><span>Invoice Date:</span><strong style="color:#111">${inv.billDate}</strong></div>
    ${inv.dueDate ? `<div style="margin-bottom:4px;display:flex;justify-content:flex-end;gap:12px"><span>Due Date:</span><strong style="${inv.status === 'Overdue' ? 'color:var(--red)' : 'color:#111'}">${inv.dueDate}</strong></div>` : ''}
    <div style="margin-bottom:4px;display:flex;justify-content:flex-end;gap:12px"><span>Agent:</span><strong style="color:#111">${inv.saleAgent}</strong></div>
  </div>
</div>
<div class="ship">
  <div><strong>BIL:</strong> ${inv.blNumber}</div>
  <div><strong>ORIGIN:</strong> ${inv.origin}</div>
  <div><strong>MODE:</strong> ${inv.mode}</div>
  <div><strong>DESTINATION:</strong> ${inv.destination}</div>
</div>
${sectionHtml('Clearing Charges — Paid in TZS', 'TZS', T.cl, T.sub(T.cl), T.tax(T.cl), T.clearingTotal)}
${sectionHtml('Shipping Line Charges — Paid in USD', 'USD', T.sh, T.sub(T.sh), T.tax(T.sh), T.shippingTotal)}
${sectionHtml('Other Charges — Paid in TZS', 'TZS', T.ot, T.sub(T.ot), T.tax(T.ot), T.otherTotal)}
<div class="grand"><span>GRAND TOTAL</span><span>${fmtTZS(T.grandTotalTZS)}</span></div>
${inv.exchangeRate > 0 && T.shippingTotal > 0 ? `<div style="text-align:right;font-size:11px;color:var(--ink2);margin-bottom:12px">USD shipping converted at 1 USD = TZS ${inv.exchangeRate.toLocaleString()}</div>` : ''}
${inv.received > 0 ? `<div class="due"><span>Less: Amount Received</span><span style="color:#059669">(${fmtTZS(inv.received)})</span></div>` : ''}
<div class="due"><span>Amount Due</span><span>${fmtTZS(Math.max(0, due))}</span></div>
${inv.shipmentCarbon ? `
<div style="margin-top:12px;padding:12px;background:var(--green-l);border-radius:6px;font-size:10px;color:var(--ink);border:1px solid #a7f3d0">
  <div style="font-weight:800;text-transform:uppercase;margin-bottom:6px;color:#111">Carbon Footprint (Estimate)</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;line-height:1.6">
    <div><strong>CO₂ Emissions:</strong> ${Number(inv.shipmentCarbon.co2_emissions_kg).toLocaleString()} kg</div>
    <div><strong style="color:#059669">Credits Saved:</strong> ${Number(inv.shipmentCarbon.carbon_credits_saved).toFixed(2)}</div>
    ${inv.shipmentCarbon.distance_km ? `<div><strong>Distance:</strong> ${inv.shipmentCarbon.distance_km} km</div>` : ''}
  </div>
  <div style="font-size:8.5px;color:var(--ink3);margin-top:6px;font-style:italic">GLEC v3.2 / ISO 14083 methodology. Internal ESG estimate — not a registry-issued or tradeable carbon credit.</div>
</div>` : ''}
<div style="margin-top:20px;padding:12px;background:#f9fafb;border-radius:6px;font-size:10px;color:var(--ink);border:1px solid #e5e7eb">
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

/* ── Small helpers ── */
function FormField({ label, value, onChange, placeholder, disabled, mono }: { label: string; value: string; onChange?: (v: string) => void; placeholder?: string; disabled?: boolean; mono?: boolean }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>{label}</label>
      <input value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} disabled={disabled}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: disabled ? 'var(--bg)' : 'var(--white)', color: disabled ? 'var(--ink3)' : 'var(--ink)', fontSize: 13, fontFamily: mono ? 'var(--mono)' : 'var(--font)', outline: 'none', boxSizing: 'border-box' as const }} />
    </div>
  );
}

/* ── Charge section table (view mode) ── */
function ChargeSectionView({ title, color, currency, items, subTotal, taxAmt, sectionTotal }: {
  title: string; color: string; currency: Currency;
  items: LineItem[]; subTotal: number; taxAmt: number; sectionTotal: number;
}) {
  const fmt = (n: number) => fmtAmt(n, currency);
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#fff', background: color, padding: '6px 14px', borderRadius: '6px 6px 0 0' }}>{title}</div>
      <div className="rtbl-wrap" style={{ border: '1px solid var(--border)', borderTop: 'none' }}>
      <table className="rtbl" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {['Item', 'Unit', 'Amount/Unit', 'Qty', 'Sub Total', 'VAT Tax', 'Total Amount'].map((h, i) => (
              <th key={h} style={{ padding: '7px 10px', textAlign: i >= 2 ? 'right' : 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan={7} style={{ padding: '10px 12px', color: 'var(--ink3)', fontStyle: 'italic', fontSize: 12 }}>No charges — 0</td></tr>
          ) : items.map((item, i) => {
            const lineSub = item.qty * item.rate;
            const lineTax = lineSub * item.taxPct / 100;
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px', fontSize: 13, fontWeight: 600, color: 'var(--ink)', verticalAlign: 'top' }}>{item.name}</td>
                <td style={{ padding: '10px', fontSize: 11, color: 'var(--ink3)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{item.unit}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, verticalAlign: 'top' }}>{fmt(item.rate)}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontSize: 12, verticalAlign: 'top' }}>{item.qty}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, verticalAlign: 'top' }}>{fmt(lineSub)}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: lineTax > 0 ? 'var(--ink)' : 'var(--ink3)', verticalAlign: 'top' }}>{lineTax > 0 ? fmt(lineTax) : '0'}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--ink)', verticalAlign: 'top' }}>{fmt(lineSub + lineTax)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--bg)', borderTop: '2px solid var(--border)' }}>
            <td colSpan={4} style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>SUB-TOTAL</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{fmt(subTotal)}</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{taxAmt > 0 ? fmt(taxAmt) : '—'}</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800, color }}>{fmt(sectionTotal)}</td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  );
}

/* ── Import Timesheets Modal ── */
// A logged time entry that carries its own rate — snapshotted at log time from
// the Products & Services catalog (see migration 143), never a re-join, so it
// still reads correctly a year later even if the catalog price changed since.
interface RatedTimeEntry {
  id: string; member: string; task_ref: string | null; hours: number;
  log_date: string; product_id: string | null; service_name: string | null;
  service_rate: number | null; service_currency: string | null; service_unit: string | null;
}

// hourly-unit services bill hours × rate; everything else (per-shipment,
// per-container, per-set, ...) bills the flat rate once — the same rule
// TimesheetsTab.entryAmount() uses, kept in sync with it.
function timeEntryAmount(e: RatedTimeEntry): number {
  if (e.service_rate == null) return 0;
  return e.service_unit === 'hour' || e.service_unit === 'hr' ? e.hours * e.service_rate : e.service_rate;
}

function ImportTimesheetsModal({ shipmentId, shipmentRef, sectionCurrency, onImport, onClose }: {
  shipmentId: string; shipmentRef: string; sectionCurrency: Currency;
  onImport: (lines: Omit<EditItem, 'uid'>[]) => void;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<RatedTimeEntry[]>([]);
  const [otherCurrencyCount, setOtherCurrencyCount] = useState(0);
  const [taxByProduct, setTaxByProduct] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      // The real source: logged, rated shipment time entries — not the
      // shipment record itself, which never carries them.
      apiFetch(`/v1/shipments/${shipmentId}/time-entries`).catch(() => ({ data: [] })),
      apiFetch('/v1/products?status=active').catch(() => []),
    ]).then(([teRes, prodRes]: [any, any]) => {
      const rows: any[] = Array.isArray(teRes) ? teRes : (teRes?.data ?? []);
      // Billable = actually tagged with a real service at log time. An entry
      // logged with no product has no rate to bill and is left off the list
      // rather than guessed at.
      const rated = rows.filter(r => r.service_rate != null);
      const sameCurrency = rated.filter(r => (r.service_currency || 'TZS') === sectionCurrency);
      setOtherCurrencyCount(rated.length - sameCurrency.length);
      setEntries(sameCurrency);
      setSelected(new Set(sameCurrency.map((r: any) => r.id)));

      const products: any[] = Array.isArray(prodRes) ? prodRes : (prodRes?.data ?? []);
      setTaxByProduct(new Map(products.map(p => [p.id, Number(p.tax_rate) || 0])));
    }).finally(() => setLoading(false));
  }, [shipmentId, sectionCurrency]);

  function handleImport() {
    const lines = entries.filter(e => selected.has(e.id)).map(e => ({
      name: e.service_name || 'Logged time',
      unit: e.service_unit || 'PER HR',
      rate: e.service_rate || 0,
      qty: e.service_unit === 'hour' || e.service_unit === 'hr' ? e.hours : 1,
      taxPct: e.product_id ? (taxByProduct.get(e.product_id) ?? 0) : 0,
      group: 'other' as ChargeGroup,
      currency: sectionCurrency,
    }));
    onImport(lines);
  }

  const selectedTotal = entries.filter(e => selected.has(e.id)).reduce((s, e) => s + timeEntryAmount(e), 0);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 20 }}>
      <div style={{ background: 'var(--white)', borderRadius: 12, width: '100%', maxWidth: 520, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh', boxShadow: 'var(--elev-lg)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Import Timesheets</span>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><Icon name="x" size={16} color="var(--ink2)" /></button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 4 }}>
            {loading ? 'Loading…' : `${entries.length} rated time entr${entries.length === 1 ? 'y' : 'ies'} for`} <strong style={{ color: 'var(--ink)' }}>{shipmentRef}</strong>, each at the rate it was logged against.
          </div>
          {otherCurrencyCount > 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>
              {otherCurrencyCount} more {otherCurrencyCount === 1 ? 'entry is' : 'entries are'} rated in a different currency — add {otherCurrencyCount === 1 ? 'it' : 'them'} from the matching charges section instead.
            </div>
          )}
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)' }}>Loading timesheets…</div>
          ) : entries.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)' }}>No time entries with a billable rate found. Time logged with no service attached has nothing to bill and isn't listed.</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {entries.map(e => (
                <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected.has(e.id) ? 'var(--teal-l)' : 'var(--white)' }}>
                  <input type="checkbox" checked={selected.has(e.id)} onChange={() => {
                    setSelected(prev => {
                      const next = new Set(prev);
                      if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                      return next;
                    });
                  }} />
                  <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>
                    <div style={{ fontWeight: 600 }}>{e.service_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{e.member} · {new Date(e.log_date).toLocaleDateString()} · {fmtAmt(e.service_rate || 0, sectionCurrency)}/{e.service_unit || 'unit'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 13 }}>{fmtAmt(timeEntryAmount(e), sectionCurrency)}</div>
                    {(e.service_unit === 'hour' || e.service_unit === 'hr') && <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{Number(e.hours).toFixed(1)} hrs</div>}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'var(--bg)' }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink2)' }}>
            {selected.size > 0 && <>Total: <strong style={{ fontFamily: 'var(--mono)' }}>{fmtAmt(selectedTotal, sectionCurrency)}</strong></>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="button" onClick={handleImport} disabled={selected.size === 0} style={{ padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, cursor: selected.size ? 'pointer' : 'default', opacity: selected.size ? 1 : 0.5, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Import {selected.size} {selected.size === 1 ? 'Entry' : 'Entries'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Charge section editor ── */
export type EditItem = LineItem & { uid: string };

function ChargeSectionEditor({ title, color, group, currency, items, onChange, customerId }: {
  title: string; color: string; group: ChargeGroup; currency: Currency;
  items: EditItem[]; onChange: (items: EditItem[]) => void;
  /** When set, the catalog is priced for this customer — an agreed contract
   *  price replaces the list price on the item that is picked. */
  customerId?: string;
}) {
  const fmt = (n: number) => fmtAmt(n, currency);
  const add = () => onChange([...items, { uid: String(Date.now()), name: '', unit: 'PER BIL', rate: 0, qty: 1, taxPct: 0, group, currency }]);
  const remove = (uid: string) => onChange(items.filter(i => i.uid !== uid));
  const update = (uid: string, k: keyof EditItem, v: string | number) =>
    onChange(items.map(i => i.uid === uid ? { ...i, [k]: v } : i));

  const productCacheRef = useRef<Map<string, any>>(new Map());
  async function searchProducts(q: string): Promise<PickerItem[]> {
    const qs = `?status=active${customerId ? `&customer_id=${encodeURIComponent(customerId)}` : ''}${q.trim() ? `&search=${encodeURIComponent(q.trim())}` : ''}`;
    const res: any = await apiFetch(`/v1/products${qs}`).catch(() => []);
    const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
    // This section's rate/tax math sums raw numbers under one shared currency
    // (see sub()/tax()/tot() above) — a catalog item priced in a different
    // currency than the section would silently blend into that total as if
    // its number were already in `currency`, badly under- or over-stating the
    // charge (e.g. a $150 USD line read as 150 TZS). Only offer same-currency
    // items here; the other currency's items are one click away in the
    // section paying in that currency.
    const sameCurrency = list.filter((p) => (p.currency || 'TZS') === currency);
    sameCurrency.forEach((p) => productCacheRef.current.set(p.id, p));
    return sameCurrency.slice(0, 25).map((p) => ({
      id: p.id, label: p.name,
      sublabel: [p.code, `${fmtAmt(Number(p.sale_price) || 0, (p.currency || 'TZS') as Currency)}/${p.unit}${p.has_agreed_price ? ' · agreed' : ''}`].filter(Boolean).join(' · '),
    }));
  }
  function addFromProduct(item: PickerItem | null) {
    if (!item) return;
    const p = productCacheRef.current.get(item.id);
    if (!p) return;
    onChange([...items, {
      uid: String(Date.now()), name: p.name, unit: p.unit || 'PER BIL',
      rate: Number(p.sale_price) || 0, qty: 1, taxPct: Number(p.tax_rate) || 0,
      group, currency,
    }]);
  }

  const inpS: React.CSSProperties = { padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 12, fontFamily: 'var(--font)', outline: 'none', width: '100%', boxSizing: 'border-box' as const };

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#fff', background: color, padding: '6px 14px', borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{title}</span>
        <span style={{ fontSize: 10, opacity: 0.85 }}>{currency}</span>
      </div>
      <div className="rtbl-wrap" style={{ border: '1px solid var(--border)', borderTop: 'none' }}>
      <table className="rtbl" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {['', '#', 'Item Name', 'Unit', 'Rate', 'Qty', 'Tax %', 'Amount', ''].map((h, i) => (
              <th key={i} style={{ padding: '7px 8px', textAlign: i >= 4 && i <= 7 ? 'right' : 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)', ...(i === 0 ? { width: 22 } : i === 1 ? { width: 26 } : i === 3 ? { width: 110 } : i === 4 ? { width: 110 } : i === 5 ? { width: 56 } : i === 6 ? { width: 70 } : i === 7 ? { width: 110 } : i === 8 ? { width: 30 } : {}) }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan={10} style={{ padding: '12px 10px', color: 'var(--ink3)', fontStyle: 'italic', fontSize: 12, textAlign: 'center', borderBottom: '1px solid var(--border)' }}>No charges — click "Add Item" below</td></tr>
          ) : items.map((item, i) => {
            const lineSub = item.qty * item.rate;
            const lineTax = lineSub * item.taxPct / 100;
            return (
              <tr key={item.uid} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--border)', cursor: 'grab', userSelect: 'none', verticalAlign: 'middle' }}>⋮⋮</td>
                <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--ink3)', textAlign: 'center', verticalAlign: 'middle' }}>{i + 1}</td>
                <td style={{ padding: '6px 4px' }}><input value={item.name} onChange={e => update(item.uid, 'name', e.target.value)} placeholder="Item name" style={{ ...inpS, fontWeight: 600 }} /></td>
                <td style={{ padding: '6px 4px' }}>
                  <Select value={item.unit} onValueChange={v => update(item.uid, 'unit', v)}>
                    <SelectTrigger className="h-7 px-2 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      {!UNIT_OPTIONS.includes(item.unit) && <SelectItem value={item.unit}>{item.unit}</SelectItem>}
                    </SelectContent>
                  </Select>
                </td>
                <td style={{ padding: '6px 4px' }}><input type="number" min={0} value={item.rate || ''} onChange={e => update(item.uid, 'rate', parseFloat(e.target.value) || 0)} placeholder="0" style={{ ...inpS, textAlign: 'right', fontFamily: 'var(--mono)' }} /></td>
                <td style={{ padding: '6px 4px' }}><input type="number" min={1} value={item.qty} onChange={e => update(item.uid, 'qty', Math.max(1, parseInt(e.target.value) || 1))} style={{ ...inpS, textAlign: 'right' }} /></td>
                <td style={{ padding: '6px 4px' }}>
                  <Select value={String(item.taxPct)} onValueChange={v => update(item.uid, 'taxPct', parseInt(v))}>
                    <SelectTrigger className="h-7 px-2 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="18">18%</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td style={{ padding: '6px 10px 6px 4px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  {(lineSub + lineTax) > 0 ? fmt(lineSub + lineTax) : '—'}
                </td>
                <td style={{ padding: '6px 4px', verticalAlign: 'middle' }}>
                  {items.length > 0 && (
                    <button type="button" onClick={() => remove(item.uid)}
                      style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--red-l)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      <Icon name="trash" size={12} color="var(--red)" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--bg)', borderTop: '2px solid var(--border)' }}>
            <td colSpan={7} style={{ padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={add}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 'var(--ds-btn-py-sm) 12px', border: `1px dashed ${color}`, borderRadius: 'var(--r)', background: 'none', color, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--teal-l)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <Icon name="plus" size={12} color={color} /> Add Line Item
                </button>
                <div style={{ width: 220 }}>
                  <EntityPicker value={null} onChange={addFromProduct} search={searchProducts} placeholder="Add from catalog…" />
                </div>
              </div>
            </td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 800, color }} colSpan={2}>
              {fmt(items.reduce((s, i) => s + i.qty * i.rate * (1 + i.taxPct / 100), 0))}
            </td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  );
}

/* ── Invoice Editor (Create + Edit) ── */
export function InvoiceEditor({ initial, nextId, onSave, onCancel, isMobile = false, presetCustomer = null }: {
  initial: Invoice | null; nextId: string;
  onSave: (inv: Invoice) => void; onCancel: () => void; isMobile?: boolean; presetCustomer?: PickerItem | null;
}) {
  const navigate = useNavigate();
  const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
  // Only a fresh "create" editor (no `initial`) ever restores a draft — never
  // let a leftover sessionStorage entry bleed into editing a real invoice.
  // Consumed once (takeInvoiceDraft clears the key) so a plain page refresh
  // afterwards doesn't keep re-applying a stale draft.
  const [draft] = useState<InvoiceDraft | null>(() => (initial ? null : takeInvoiceDraft()));
  const [client, setClient]       = useState(initial?.client ?? draft?.client ?? presetCustomer?.label ?? '');
  const [addr, setAddr]           = useState(draft?.addr ?? initial?.clientAddress.join('\n') ?? '');
  const [billDate, setBillDate]   = useState(draft?.billDate ?? initial?.billDate ?? today);
  const [dueDate, setDueDate]     = useState(draft?.dueDate ?? initial?.dueDate ?? '');
  const [agent, setAgent]         = useState(draft?.agent ?? initial?.saleAgent ?? '');
  const [blNo, setBlNo]           = useState(draft?.blNo ?? initial?.blNumber ?? '');
  const [origin, setOrigin]       = useState(draft?.origin ?? initial?.origin ?? '');
  const [dest, setDest]           = useState(draft?.dest ?? initial?.destination ?? '');
  const [mode, setMode]           = useState<Invoice['mode']>((draft?.mode as Invoice['mode']) ?? initial?.mode ?? 'SEA');
  const [exRate, setExRate]       = useState(draft?.exRate ?? String(initial?.exchangeRate ?? 2650));
  // Never auto-applied — a fetched rate only fills the field when the user
  // clicks "Use this", same provenance rule editable duty/VAT/FX overrides
  // already follow elsewhere: a typed figure must never look system-sourced,
  // and a system-sourced one must stay visibly distinct until accepted.
  const [todayFxRate, setTodayFxRate] = useState<{ rate: number; date: string } | null>(null);
  useEffect(() => {
    apiFetch('/v1/fx-rates/latest?base=USD&quote=TZS').then(setTodayFxRate).catch(() => setTodayFxRate(null));
  }, []);
  const [terms, setTerms]         = useState(draft?.terms ?? initial?.terms ?? 'Payment due within 14 days. All 3rd party charges are estimates and subject to actuals.');

  const [customer, setCustomer] = useState<PickerItem | null>(
    initial?.customerId ? { id: initial.customerId, label: initial.client } : presetCustomer,
  );
  const [shipment, setShipment] = useState<PickerItem | null>(
    initial?.shipmentRef ? { id: initial.shipmentRef, label: initial.shipmentRef } : null,
  );
  const customerCacheRef = useRef<Map<string, any>>(new Map());
  const shipmentCacheRef = useRef<Map<string, any>>(new Map());

  async function searchCustomers(q: string): Promise<PickerItem[]> {
    const res = await apiFetch('/v1/customers').catch(() => ({ data: [] }));
    const raw: any[] = Array.isArray(res) ? res : (res.data ?? []);
    // Excludes draft companies (active===false) — e.g. BRELA imports still
    // sitting in Company Directory that haven't been marked complete yet —
    // from the invoice/bill customer picker.
    const list = raw.filter((c) => c.active !== false);
    const ql = q.trim().toLowerCase();
    const filtered = ql
      ? list.filter((c) => (c.name || '').toLowerCase().includes(ql) || (c.email || '').toLowerCase().includes(ql) || (c.phone || '').includes(ql))
      : list;
    filtered.forEach((c) => customerCacheRef.current.set(c.id, c));
    return filtered.slice(0, 25).map((c) => ({ id: c.id, label: c.name, sublabel: c.email || c.phone || undefined }));
  }

  // A brand-new customer needs more than the bare `{ name }` this used to
  // POST silently (no email/phone/tax id/address — every invoice customer
  // created this way started with an empty CRM profile). Hands off to the
  // full onboarding page instead, preserving everything already typed into
  // this invoice so there's actually something to "come back to" — without
  // this, "create new customer" mid-invoice would throw away the bill date,
  // line items, etc. the moment you navigated away.
  function createCustomer(name: string): Promise<PickerItem> {
    saveInvoiceDraft({
      client, addr, billDate, dueDate, agent, blNo, origin, dest, mode, exRate, terms,
      clearing, shipping, other,
    });
    navigate(`/crm/customers/new?name=${encodeURIComponent(name)}&returnTo=${encodeURIComponent('/finance/invoices')}`);
    // Never resolves — the page is navigating away, so EntityPicker's own
    // "Creating…" state just stays until this component unmounts.
    return new Promise<PickerItem>(() => {});
  }

  function handleCustomerChange(item: PickerItem | null) {
    setCustomer(item);
    if (!item) return;
    setClient(item.label);
    const full = customerCacheRef.current.get(item.id);
    if (full && !addr.trim()) {
      const lines = [
        full.contact_name ? `Attn: ${full.contact_name}` : null,
        full.email || null,
        full.phone || full.phone_wa || null,
        full.tax_id ? `VAT: ${full.tax_id}` : null,
      ].filter(Boolean);
      if (lines.length) setAddr(lines.join('\n'));
    }
  }

  async function searchShipments(q: string): Promise<PickerItem[]> {
    const qs = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : '';
    const res = await apiFetch(`/v1/shipments${qs}`).catch(() => ({ data: [] }));
    const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
    list.forEach((s) => shipmentCacheRef.current.set(s.ref_number, s));
    return list.slice(0, 25).map((s) => ({
      id: s.ref_number, label: s.ref_number,
      sublabel: [s.bl_number || s.awb_number, s.customer_name, s.goods_desc].filter(Boolean).join(' · '),
    }));
  }

  function handleShipmentChange(item: PickerItem | null) {
    setShipment(item);
    if (!item) return;
    const full = shipmentCacheRef.current.get(item.id);
    if (!full) return;
    if (!blNo.trim()) setBlNo(full.bl_number || full.awb_number || '');
    if (!origin.trim()) setOrigin(full.origin_port || '');
    if (!dest.trim()) setDest(full.dest_port || '');
    const t = String(full.type || '');
    if (t.startsWith('SEA')) setMode('SEA'); else if (t.startsWith('AIR')) setMode('AIR'); else if (t.startsWith('ROAD')) setMode('ROAD');
    if (!client.trim() && full.customer_name) handleCustomerChange({ id: full.customer_id, label: full.customer_name });
  }

  const toEditItems = (g: ChargeGroup) =>
    (initial?.items.filter(i => i.group === g) ?? []).map((it, i) => ({ ...it, uid: `${g}-${i}` }));

  const [clearing, setClearing] = useState<EditItem[]>(draft?.clearing ?? toEditItems('clearing'));
  const [shipping, setShipping] = useState<EditItem[]>(draft?.shipping ?? toEditItems('shipping'));
  const [other, setOther]       = useState<EditItem[]>(draft?.other ?? toEditItems('other'));

  const [showTimesheets, setShowTimesheets] = useState(false);

  const activeShipmentFull = shipment ? shipmentCacheRef.current.get(shipment.id) : null;

  const allItems: LineItem[] = [...clearing, ...shipping, ...other].map(({ uid: _uid, ...rest }) => rest);
  const exRateNum = parseFloat(exRate) || 2650;

  const clTotal = clearing.reduce((s, i) => s + i.qty * i.rate * (1 + i.taxPct / 100), 0);
  const shTotal = shipping.reduce((s, i) => s + i.qty * i.rate * (1 + i.taxPct / 100), 0);
  const otTotal = other.reduce((s, i) => s + i.qty * i.rate * (1 + i.taxPct / 100), 0);
  const grandTotal = clTotal + otTotal + shTotal * exRateNum;

  const version = (initial?.version ?? 0) + (initial ? 1 : 0);
  const invId = initial?.id ?? nextId;

  function handleSave(asDraft: boolean) {
    const newVersion = (initial?.version ?? 0) + 1;
    const inv: Invoice = {
      id: invId, client: client || 'Unknown Client',
      customerId: customer?.id || undefined, shipmentRef: shipment?.id || undefined,
      clientAddress: addr.split('\n').filter(Boolean),
      blNumber: blNo, origin, destination: dest, mode,
      billDate, dueDate: dueDate || null,
      saleAgent: agent, terms,
      items: allItems,
      exchangeRate: exRateNum,
      refCode: genRefCode(invId, newVersion),
      version: newVersion,
      status: asDraft ? 'Draft' : (initial?.status === 'Paid' || initial?.status === 'Partial' ? initial.status : 'Unpaid'),
      received: initial?.received ?? 0,
    };
    onSave(inv);
  }

  return (
    <FormPage
      title={initial ? `Edit ${initial.id}` : 'New Invoice'}
      subtitle="Parties, dates, the linked shipment and every charge line."
      onCancel={onCancel}
      actions={
        <>
          <button type="button" onClick={onCancel} className="btn btn-secondary">Cancel</button>
          <button type="button" onClick={() => handleSave(true)} className="btn btn-secondary">Save Draft</button>
          <button type="button" onClick={() => handleSave(false)} className="btn btn-primary">
            <Icon name="send" size={13} color="hsl(var(--primary-foreground))" /> Save &amp; Send
          </button>
        </>
      }
    >
        {/* Top grid */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '12px 20px', marginBottom: 18 }}>
          <FormField label="Invoice #" value={invId} disabled />
          <EntityPicker
            label="Client / Company" value={customer ?? (client ? { id: '', label: client } : null)} onChange={handleCustomerChange}
            search={searchCustomers} onCreate={createCustomer}
            createLabel={(q) => `Create new customer "${q}"`}
            placeholder="Search customers…"
          />
          <FormField label="Sale Agent" value={agent} onChange={setAgent} placeholder="Agent name" />
          <FormField label="Invoice Date" value={billDate} onChange={setBillDate} placeholder="DD-MM-YYYY" />
          <FormField label="Due Date (optional)" value={dueDate} onChange={setDueDate} placeholder="DD-MM-YYYY" />
          <div>
            <FormField label="Exchange Rate (TZS/USD)" value={exRate} onChange={setExRate} placeholder="2650" mono />
            {todayFxRate && (
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                Today's rate: <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink2)' }}>{todayFxRate.rate.toLocaleString()}</span>
                <button type="button" onClick={() => setExRate(String(todayFxRate.rate))}
                  style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontWeight: 700, fontSize: 11, padding: 0 }}>
                  Use this
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bill To */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Client Address — one line per entry</label>
          <textarea value={addr} onChange={e => setAddr(e.target.value)} rows={3} placeholder={'Company Name\nStreet / P.O. Box\nCity, Country\nVAT Number'}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 12.5, fontFamily: 'var(--font)', resize: 'vertical', outline: 'none', lineHeight: 1.7, boxSizing: 'border-box' as const }} />
        </div>

        {/* Shipment details */}
        <div style={{ background: 'var(--bg)', borderRadius: 9, padding: '12px 16px', marginBottom: 22, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink3)', marginBottom: 10 }}>Shipment Details</div>
          <div style={{ marginBottom: 10 }}>
            <EntityPicker
              label="Linked Shipment (optional)" value={shipment} onChange={handleShipmentChange}
              search={searchShipments}
              placeholder="Search by ref, BL number or goods description…"
              hint={shipment ? undefined : 'Link a shipment to auto-fill BL/AWB, origin, destination and mode below.'}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 120px', gap: '10px 16px' }}>
            <FormField label="BL / AWB Number" value={blNo} onChange={setBlNo} placeholder="e.g. MSCU2456789" />
            <FormField label="Origin" value={origin} onChange={setOrigin} placeholder="e.g. SINGAPORE" />
            <FormField label="Destination" value={dest} onChange={setDest} placeholder="e.g. DAR ES SALAAM" />
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Mode</label>
              <Select value={mode} onValueChange={v => setMode(v as Invoice['mode'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SEA">SEA</SelectItem>
                  <SelectItem value="AIR">AIR</SelectItem>
                  <SelectItem value="ROAD">ROAD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Timesheet Import Modal */}
        {showTimesheets && activeShipmentFull && (
          <ImportTimesheetsModal
            shipmentId={activeShipmentFull.id}
            shipmentRef={activeShipmentFull.ref_number}
            sectionCurrency="TZS"
            onClose={() => setShowTimesheets(false)}
            onImport={(lines) => {
              setOther(prev => [
                ...prev,
                ...lines.map((l, i) => ({ ...l, uid: `ts-${Date.now()}-${i}` }))
              ]);
              setShowTimesheets(false);
            }}
          />
        )}

        {/* Three charge sections. The customer flows in so the catalog picker
            offers each service at this customer's agreed price when one exists. */}
        <ChargeSectionEditor title="Clearing Charges — Paid in TZS" color="var(--teal)" group="clearing" currency="TZS" items={clearing} onChange={setClearing} customerId={customer?.id || undefined} />
        <ChargeSectionEditor title="Shipping Line Charges — Paid in USD" color="var(--blue)" group="shipping" currency="USD" items={shipping} onChange={setShipping} customerId={customer?.id || undefined} />
        <div style={{ position: 'relative' }}>
          {shipment && activeShipmentFull && (
            <button type="button" onClick={() => setShowTimesheets(true)} style={{ position: 'absolute', top: 3, right: 10, display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 'var(--r)', background: 'var(--purple-l)', color: 'var(--purple)', border: '1px solid var(--purple)', fontSize: 11, fontWeight: 700, cursor: 'pointer', zIndex: 10, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <Icon name="clock" size={12} color="var(--purple)" /> Import Unbilled Time
            </button>
          )}
          <ChargeSectionEditor title="Other Charges — Paid in TZS" color="var(--purple)" group="other" currency="TZS" items={other} onChange={setOther} customerId={customer?.id || undefined} />
        </div>

        {/* Grand total */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, paddingRight: 8, marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--ink2)' }}>
            <span>Clearing:</span><span style={{ fontFamily: 'var(--mono)' }}>{fmtTZS(clTotal)}</span>
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--ink2)' }}>
            <span>Shipping (USD → TZS @ {exRateNum}):</span><span style={{ fontFamily: 'var(--mono)' }}>{fmtUSD(shTotal)} → {fmtTZS(shTotal * exRateNum)}</span>
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--ink2)' }}>
            <span>Other:</span><span style={{ fontFamily: 'var(--mono)' }}>{fmtTZS(otTotal)}</span>
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 15, fontWeight: 800, color: 'var(--red)', borderTop: '2px solid var(--border)', paddingTop: 8, marginTop: 4, minWidth: 320 }}>
            <span style={{ flex: 1 }}>GRAND TOTAL</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{fmtTZS(grandTotal)}</span>
          </div>
        </div>

        {/* Version info */}
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 18 }}>
          Invoice version will be: <strong>{version}</strong> · Ref: <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{genRefCode(invId, version)}</span>
        </div>

        {/* Terms */}
        <div>
          <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Terms &amp; Conditions</label>
          <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={3}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 12.5, fontFamily: 'var(--font)', resize: 'vertical', outline: 'none', lineHeight: 1.7, boxSizing: 'border-box' as const }} />
        </div>
    </FormPage>
  );
}

/* ── Invoice detail panel ── */
type DetailTab = 'invoice' | 'tasks' | 'activity' | 'reminders' | 'notes';

export interface DetailPanelProps {
  inv: Invoice;
  onClose: () => void; onEdit: () => void; onCopy: () => void;
  onDelete: () => void; onRecordPayment: (amount: number, method: string, date: string) => void;
  onSubmitTRA?: () => Promise<void>;
}

/** Single-step "tag an approver + optional note" form — a Dialog, not a
 *  dedicated page, matching the same precedent SignTemplates.tsx's own
 *  BulkSendModal already established: CLAUDE.md's no-popup-forms rule is
 *  about *multi-step* forms, and this collects exactly one flat request. */
function RequestStampDialog({ invoiceLabel, onClose }: { invoiceLabel: string; onClose: () => void }) {
  const [approver, setApprover] = useState<PickerItem | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!approver) return;
    setSending(true);
    try {
      await apiFetch('/v1/sign/stamp-requests', {
        method: 'POST',
        body: JSON.stringify({ approver_id: approver.id, target_type: 'invoice', target_ref: invoiceLabel, note: note.trim() || undefined }),
      });
      setSent(true);
    } catch (e: any) {
      showAlert(e?.message || 'Failed to send the request', { title: 'Could not send request' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-105">
        <DialogHeader><DialogTitle>Request stamping</DialogTitle></DialogHeader>
        {sent ? (
          <>
            <p style={{ fontSize: 13.5, color: 'var(--ink2)' }}>Your request has been sent — you'll get a notification once it's decided.</p>
            <Button variant="default" onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '0 0 10px' }}>
              Your role doesn't have direct stamp access for <strong>{invoiceLabel}</strong>. Tag who should approve it.
            </p>
            <EntityPicker
              label="Approver" placeholder="Search staff…"
              value={approver} onChange={setApprover}
              search={async q => {
                const rows = await apiFetch(`/v1/hr/staff?search=${encodeURIComponent(q)}`).catch(() => []);
                return rows.map((u: any) => ({ id: u.id, label: u.name, sublabel: u.email }));
              }}
            />
            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', marginBottom: 4 }}>Note (optional)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Button variant="outline" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
              <Button variant="default" onClick={submit} disabled={!approver || sending} style={{ flex: 2 }}>
                {sending ? 'Sending…' : 'Send Request'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function InvoiceDetailPanel({ inv, onClose, onEdit, onCopy, onDelete, onRecordPayment, onSubmitTRA, isMobile = false }: DetailPanelProps & { isMobile?: boolean }) {
  const { fmt } = useCurrency();
  const [co, setCo] = useState(getCompany);
  useEffect(() => subscribeCompany(() => setCo(getCompany())), []);
  const isDark = useIsDarkMode();
  const docLogoSrc = isDark ? (co.logoUrlDark || co.logoUrl) : co.logoUrl;
  const [tab, setTab]                 = useState<DetailTab>('invoice');
  const [showMore, setShowMore]       = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [traSubmitting, setTraSubmitting] = useState(false);
  const [traError, setTraError]           = useState<string | null>(null);
  const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
  const [payAmt, setPayAmt]     = useState('');
  const [payDate, setPayDate]   = useState(today);
  const [payMethod, setPayMethod] = useState('Bank Transfer');

  /* ── Notes/Tasks/Reminders/Activity — real, persisted per invoice ── */
  const [notes, setNotes]         = useState<InvNote[]>([]);
  const [tasks, setTasks]         = useState<InvTask[]>([]);
  const [reminders, setReminders] = useState<InvReminder[]>([]);
  const [activity, setActivity]   = useState<InvAuditEntry[]>([]);

  const dbId = inv._dbId;
  const navigate = useNavigate();
  function handleIssueCreditNote() {
    if (!dbId) return;
    const qs = new URLSearchParams({ invoice_id: dbId, client_name: inv.client || '' });
    navigate(`/finance/credit-notes/new?${qs.toString()}`);
  }

  function loadNotes()     { if (dbId) apiFetch(`/v1/invoices/${dbId}/notes`).then((r: any) => setNotes(r?.data ?? [])).catch(() => {}); }
  function loadTasks()     { if (dbId) apiFetch(`/v1/invoices/${dbId}/tasks`).then((r: any) => setTasks(r?.data ?? [])).catch(() => {}); }
  function loadReminders() { if (dbId) apiFetch(`/v1/invoices/${dbId}/reminders`).then((r: any) => setReminders(r?.data ?? [])).catch(() => {}); }
  function loadActivity()  { if (dbId) apiFetch(`/v1/invoices/${dbId}/activity`).then((r: any) => setActivity(r?.data ?? [])).catch(() => {}); }

  /* ── Sign & Stamp (M6 cross-app stamp API) ── */
  const [stampAllowed, setStampAllowed] = useState<boolean | null>(null);
  const [stampedFileUrl, setStampedFileUrl] = useState<string | null>(null);
  const [stamping, setStamping] = useState(false);
  const [showRequestStamp, setShowRequestStamp] = useState(false);

  function loadStampStatus() {
    if (!dbId) return;
    apiFetch('/v1/sign/stamps/access').then(r => setStampAllowed(r.allowed)).catch(() => setStampAllowed(false));
    apiFetch(`/v1/invoices/${dbId}`).then((r: any) => setStampedFileUrl(r?.stamped_file_url ?? null)).catch(() => {});
  }

  async function handleSignAndStamp() {
    if (!dbId) return;
    setStamping(true);
    try {
      const r = await apiFetch(`/v1/invoices/${dbId}/sign-stamp`, { method: 'POST' });
      setStampedFileUrl(r.stamped_file_url);
    } catch (e: any) {
      showAlert(e?.message || 'Failed to apply the stamp', { title: 'Could not stamp this invoice' });
    } finally {
      setStamping(false);
    }
  }

  useEffect(() => {
    setNotes([]); setTasks([]); setReminders([]); setActivity([]);
    setStampAllowed(null); setStampedFileUrl(null);
    if (!dbId) return;
    loadNotes(); loadTasks(); loadReminders(); loadActivity(); loadStampStatus();
  }, [dbId]); // eslint-disable-line

  /* ── Notes state ── */
  const [newNote, setNewNote] = useState('');

  /* ── Tasks state ── */
  const [newTaskDesc, setNewTaskDesc]         = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskDue, setNewTaskDue]           = useState('');
  const [showTaskForm, setShowTaskForm]       = useState(false);

  /* ── Reminders state ── */
  const [newRemDate, setNewRemDate] = useState('');
  const [newRemMsg, setNewRemMsg]   = useState('');
  const [showRemForm, setShowRemForm] = useState(false);

  function addNote() {
    if (!newNote.trim() || !dbId) return;
    apiFetch(`/v1/invoices/${dbId}/notes`, { method: 'POST', body: JSON.stringify({ content: newNote.trim() }) })
      .then(() => { loadNotes(); loadActivity(); }).catch(() => {});
    setNewNote('');
  }
  async function deleteNote(id: string) {
    if (!dbId || !(await showConfirm('Delete this note?', { confirmLabel: 'Delete' }))) return;
    apiFetch(`/v1/invoices/${dbId}/notes/${id}`, { method: 'DELETE' }).then(loadNotes).catch(() => {});
  }

  function addTask() {
    if (!newTaskDesc.trim() || !dbId) return;
    apiFetch(`/v1/invoices/${dbId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ description: newTaskDesc.trim(), assignee: newTaskAssignee.trim() || null, due_date: newTaskDue || null }),
    }).then(() => { loadTasks(); loadActivity(); }).catch(() => {});
    setNewTaskDesc(''); setNewTaskAssignee(''); setNewTaskDue(''); setShowTaskForm(false);
  }
  function toggleTask(id: string) {
    if (!dbId) return;
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    apiFetch(`/v1/invoices/${dbId}/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ done: !t.done }) })
      .then(() => { loadTasks(); loadActivity(); }).catch(() => {});
  }
  async function deleteTask(id: string) {
    if (!dbId || !(await showConfirm('Delete this task?', { confirmLabel: 'Delete' }))) return;
    apiFetch(`/v1/invoices/${dbId}/tasks/${id}`, { method: 'DELETE' }).then(loadTasks).catch(() => {});
  }

  function addReminder() {
    if (!newRemDate || !newRemMsg.trim() || !dbId) return;
    apiFetch(`/v1/invoices/${dbId}/reminders`, {
      method: 'POST', body: JSON.stringify({ remind_date: newRemDate, message: newRemMsg.trim() }),
    }).then(() => { loadReminders(); loadActivity(); }).catch(() => {});
    setNewRemDate(''); setNewRemMsg(''); setShowRemForm(false);
  }
  function toggleReminder(id: string) {
    if (!dbId) return;
    const r = reminders.find(x => x.id === id);
    if (!r) return;
    apiFetch(`/v1/invoices/${dbId}/reminders/${id}`, { method: 'PATCH', body: JSON.stringify({ done: !r.done }) })
      .then(loadReminders).catch(() => {});
  }
  async function deleteReminder(id: string) {
    if (!dbId || !(await showConfirm('Delete this reminder?', { confirmLabel: 'Delete' }))) return;
    apiFetch(`/v1/invoices/${dbId}/reminders/${id}`, { method: 'DELETE' }).then(loadReminders).catch(() => {});
  }

  function sendEmail() {
    const T = invoiceTotals(inv);
    const body = encodeURIComponent(
      `Dear ${inv.client},\n\nPlease find attached Invoice ${inv.id} for ${fmtTZS(T.grandTotalTZS)}.\n\nBL/AWB: ${inv.blNumber}\nDue Date: ${inv.dueDate ?? 'Upon receipt'}\n\nKind regards,\n${co.name}`
    );
    window.open(`mailto:?subject=Invoice ${inv.id} – ${inv.client}&body=${body}`, '_blank');
  }

  const T = invoiceTotals(inv);
  const due = T.grandTotalTZS - inv.received;
  const st = STATUS_STYLE[inv.status];

  const qrData = [inv.id, inv.blNumber, `TZS ${Math.round(T.grandTotalTZS).toLocaleString()}`, inv.refCode].join(' | ');

  function submitPayment() {
    const amt = parseFloat(payAmt.replace(/,/g, ''));
    if (!amt || amt <= 0) return;
    onRecordPayment(Math.min(amt, due), payMethod, payDate);
    setShowPayment(false); setPayAmt('');
  }

  const traFiscalized = inv.traStatus === 'submitted' && inv.traAckCode === 0;

  async function submitToTRA() {
    if (!onSubmitTRA || traSubmitting) return;
    setTraSubmitting(true);
    setTraError(null);
    try {
      await onSubmitTRA();
    } catch (err: any) {
      setTraError(err?.message || 'TRA submission failed');
    } finally {
      setTraSubmitting(false);
    }
  }

  const TABS: { id: DetailTab; label: string }[] = [
    { id: 'invoice', label: 'Invoice' }, { id: 'tasks', label: 'Tasks' },
    { id: 'activity', label: 'Activity Log' }, { id: 'reminders', label: 'Reminders' }, { id: 'notes', label: 'Notes' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)', overflow: 'hidden', minWidth: 0 }}
      onClick={() => showMore && setShowMore(false)}>

      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '0 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', overflowX: 'auto', flex: 1, minWidth: 0 }}>
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              style={{ padding: 'var(--ds-btn-py) 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', color: tab === t.id ? 'var(--ink)' : 'var(--ink3)', borderBottom: tab === t.id ? '2px solid var(--ink)' : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap', flexShrink: 0, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {/* Was three icons (mail / eye / maximize) — "Export PDF" opened the
              exact same print window as "View / Print" (there's no separate
              PDF export, just the browser's own print-to-PDF), and the mail
              icon fired a bare `mailto:?subject=` with no body while the
              proper message lived only in sendEmail() below. Down to the two
              that do something distinct, both routed through the real
              implementations. */}
          {!isMobile && (['mail', 'eye'] as const).map((icon, i) => (
            <button key={icon} type="button"
              title={i === 0 ? 'Send email' : 'View / Print'}
              onClick={() => i === 0 ? sendEmail() : openPrintWindow(inv)}
              style={{ width: 32, height: 32, borderRadius: 'var(--r)', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <Icon name={icon} size={15} color="var(--ink3)" />
            </button>
          ))}
          <button type="button" onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 'var(--r)', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--red-l)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <Icon name="x" size={15} color="var(--ink3)" />
          </button>
        </div>
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
        {traFiscalized ? (
          <span title={`Verification #: ${inv.traRctvnum}`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'var(--green-l)', color: 'var(--green)' }}>
            <Icon name="checkCircle" size={12} color="var(--green)" /> TRA Fiscalized
          </span>
        ) : onSubmitTRA ? (
          <button type="button" onClick={submitToTRA} disabled={traSubmitting || inv.status === 'Draft' || !inv._dbId}
            title={
              inv.status === 'Draft' ? 'Save & Send this invoice first — drafts cannot be fiscalized'
              : !inv._dbId ? 'This invoice only exists locally and was never saved to the server'
              : inv.traStatus === 'failed' ? (inv.traAckMsg || 'Previous submission failed — retry')
              : 'Submit this invoice to TRA EFDMS for fiscalization'
            }
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 700, cursor: (traSubmitting || inv.status === 'Draft' || !inv._dbId) ? 'default' : 'pointer', background: inv.status === 'Draft' || !inv._dbId ? 'var(--bg)' : inv.traStatus === 'failed' ? 'var(--red-l)' : 'var(--gold-l)', color: inv.status === 'Draft' || !inv._dbId ? 'var(--ink3)' : inv.traStatus === 'failed' ? 'var(--red)' : 'var(--gold)', opacity: traSubmitting ? 0.7 : 1, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name={inv.traStatus === 'failed' ? 'refresh' : 'send'} size={12} color={inv.status === 'Draft' || !inv._dbId ? 'var(--ink3)' : inv.traStatus === 'failed' ? 'var(--red)' : 'var(--gold)'} />
            {traSubmitting ? 'Submitting…' : inv.traStatus === 'failed' ? 'Retry TRA Submission' : 'Submit to TRA'}
          </button>
        ) : null}
        {dbId && (
          stampedFileUrl ? (
            <button type="button" onClick={() => apiDownload(`/v1/invoices/${dbId}/stamped-pdf`, `${inv.id} — stamped.pdf`)}
              title="Download the company-stamped copy"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'var(--green-l)', color: 'var(--green)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }}>
              <Icon name="checkCircle" size={12} color="var(--green)" /> Stamped
            </button>
          ) : stampAllowed === true ? (
            <button type="button" onClick={handleSignAndStamp} disabled={stamping}
              title="Apply the company stamp to this invoice"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 700, cursor: stamping ? 'default' : 'pointer', background: 'var(--blue-l)', color: 'var(--blue)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }}>
              <Icon name="stamp" size={12} color="var(--blue)" /> {stamping ? 'Stamping…' : 'Sign & Stamp'}
            </button>
          ) : stampAllowed === false ? (
            <button type="button" onClick={() => setShowRequestStamp(true)}
              title="Your role doesn't have direct stamp access — tag someone who can approve it"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 20, border: '1px solid var(--border)', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'var(--bg)', color: 'var(--ink2)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }}>
              <Icon name="stamp" size={12} color="var(--ink3)" /> Request Stamping
            </button>
          ) : null
        )}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onEdit} style={tbBtn} title="Edit"><Icon name="edit" size={13} color="var(--ink2)" /></button>
        <button type="button" onClick={onCopy} style={tbBtn} title="Duplicate"><Icon name="copy" size={13} color="var(--ink2)" /></button>
        <div className="billing-more-wrap">
          <button type="button" onClick={e => { e.stopPropagation(); setShowMore(v => !v); }} style={tbBtn}>More <Icon name="chevronDown" size={10} color="var(--ink3)" /></button>
          {showMore && (
            <div onClick={e => e.stopPropagation()} className="billing-more-menu">
              <MoreItem icon="mail"        label="Send by Email" onClick={() => { sendEmail(); setShowMore(false); }} />
              <MoreItem icon="eye"         label="View / Print"  onClick={() => { openPrintWindow(inv); setShowMore(false); }} />
              <div className="billing-more-sep" />
              {/* Add Note / Assign Task / Audit Log dropped — each just
                  switched to a tab that's already one click away in the tab
                  bar above, with no other effect. Add Reminder earns its
                  keep by also pre-opening the new-reminder form. */}
              <MoreItem icon="bell"        label="Add Reminder"  onClick={() => { setShowMore(false); setTab('reminders'); setShowRemForm(true); }} />
              <div className="billing-more-sep" />
              <MoreItem icon="minusCircle" label="Issue Credit Note" onClick={() => { setShowMore(false); handleIssueCreditNote(); }} />
              <div className="billing-more-sep" />
              <MoreItem icon="trash" label="Delete Invoice" onClick={() => { setShowMore(false); onDelete(); }} danger />
            </div>
          )}
        </div>
        <button type="button" onClick={() => { setShowPayment(v => !v); setPayAmt(String(Math.round(due))); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py-sm) 14px', borderRadius: 'var(--r)', border: 'none', background: showPayment ? 'var(--green)' : 'var(--green)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="dollarSign" size={13} color="#fff" /> Payment
        </button>
      </div>

      {traError && (
        <div style={{ padding: '8px 20px', background: 'var(--red-l)', color: 'var(--red)', fontSize: 12, fontWeight: 600, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          TRA submission failed: {traError}
        </div>
      )}

      {/* Payment form */}
      {showPayment && (
        <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 20px', background: 'var(--bg)', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Record Payment — {inv.id}</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
            {[['Amount (TZS)', payAmt, (v: string) => setPayAmt(v), 'number', 'var(--mono)'],
              ['Payment Date', payDate, (v: string) => setPayDate(v), 'text', 'var(--font)']].map(([label, val, setter, type]) => (
              <div key={String(label)}>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{String(label)}</label>
                <input type={String(type)} value={String(val)} onChange={e => (setter as (v: string) => void)(e.target.value)}
                  style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--mono)', outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Method</label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Bank Transfer', 'Cash', 'Cheque', 'Mobile Money'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 8 }}>Outstanding: <strong style={{ color: due > 0 ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--mono)' }}>{fmt(due, 'TZS')}</strong></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={submitPayment} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'var(--green)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Save Payment</button>
            <button type="button" onClick={() => setShowPayment(false)} style={tbBtn}>Cancel</button>
          </div>
        </div>
      )}

      {showRequestStamp && dbId && (
        <RequestStampDialog invoiceLabel={inv.id} onClose={() => setShowRequestStamp(false)} />
      )}

      {/* Tab content */}
      {tab === 'invoice' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px 28px', fontFamily: 'var(--font)' }}>

          {/* Header: from company ← QR code → bill-to */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
            {/* From */}
            <div>
              <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink3)', marginBottom: 4 }}>From</div>
              {docLogoSrc
                ? <img src={docLogoSrc} alt={co.name} style={{ height: 40, maxWidth: 140, objectFit: 'contain', marginBottom: 8, display: 'block' }} />
                : <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>{co.name}</div>
              }
              <div style={{ fontSize: 11, color: 'var(--ink2)', lineHeight: 1.8 }}>
                {co.address}<br />{co.city}, {co.country}<br />VAT: {co.taxId}
              </div>
            </div>

            {/* QR Code — center. Once fiscalized, this must be the TRA verify-portal
                URL (what a real EFD receipt prints), not an internal reference code. */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px', border: '1px solid var(--border)', borderRadius: 9, background: traFiscalized ? 'var(--green-l)' : 'var(--bg)', alignSelf: 'flex-start', minWidth: 116 }}>
              <QRCodeSVG value={traFiscalized ? inv.traQrUrl! : qrData} size={88} level="M" />
              <div style={{ fontSize: 9, color: 'var(--ink3)', textAlign: 'center', lineHeight: 1.4 }}>
                {traFiscalized ? (
                  <>
                    <div style={{ fontWeight: 700, color: 'var(--green)' }}>TRA Verified</div>
                    <div>{inv.traRctvnum}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 700 }}>Ref: {inv.refCode}</div>
                    <div>v{inv.version}{inv.status !== 'Draft' ? ' · not fiscalized' : ''}</div>
                  </>
                )}
              </div>
            </div>

            {/* Bill To */}
            <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
              <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink3)', marginBottom: 4 }}>Bill To</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', marginBottom: 4 }}>{inv.client}</div>
              <div style={{ fontSize: 11, color: 'var(--ink2)', lineHeight: 1.8, marginBottom: 12 }}>
                {inv.clientAddress.map((l, i) => <React.Fragment key={i}>{l}{i < inv.clientAddress.length - 1 && <br />}</React.Fragment>)}
              </div>
              <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink3)', marginBottom: 4 }}>Invoice Details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: isMobile ? 'flex-start' : 'flex-end' }}>
                <div style={{ display: 'flex', gap: 8, fontSize: 12 }}><span style={{ color: 'var(--ink3)', fontWeight: 700 }}>Invoice #:</span><span style={{ color: 'var(--teal)', fontWeight: 700 }}>{inv.id}</span></div>
                <div style={{ display: 'flex', gap: 8, fontSize: 12 }}><span style={{ color: 'var(--ink3)', fontWeight: 700 }}>Invoice Date:</span><span style={{ color: 'var(--ink)', fontWeight: 600 }}>{inv.billDate}</span></div>
                {inv.dueDate && <div style={{ display: 'flex', gap: 8, fontSize: 12 }}><span style={{ color: 'var(--ink3)', fontWeight: 700 }}>Due Date:</span><span style={{ color: inv.status === 'Overdue' ? 'var(--red)' : 'var(--ink)', fontWeight: inv.status === 'Overdue' ? 700 : 600 }}>{inv.dueDate}</span></div>}
                <div style={{ display: 'flex', gap: 8, fontSize: 12 }}><span style={{ color: 'var(--ink3)', fontWeight: 700 }}>Agent:</span><span style={{ color: 'var(--ink)', fontWeight: 600 }}>{inv.saleAgent}</span></div>
              </div>
            </div>
          </div>

          {/* Shipment details strip */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 8, background: 'var(--bg)', borderRadius: 9, padding: '10px 14px', marginBottom: 20, border: '1px solid var(--border)' }}>
            {[['BL / AWB', inv.blNumber], ['Mode', inv.mode], ['Origin', inv.origin], ['Destination', inv.destination]].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink3)', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Three charge sections */}
          <ChargeSectionView title="Clearing Charges — Paid in TZS" color="var(--teal)" currency="TZS" items={T.cl} subTotal={T.sub(T.cl)} taxAmt={T.tax(T.cl)} sectionTotal={T.clearingTotal} />
          <ChargeSectionView title="Shipping Line Charges — Paid in USD" color="var(--navy)" currency="USD" items={T.sh} subTotal={T.sub(T.sh)} taxAmt={T.tax(T.sh)} sectionTotal={T.shippingTotal} />
          <ChargeSectionView title="Other Charges — Paid in TZS" color="var(--ink2)" currency="TZS" items={T.ot} subTotal={T.sub(T.ot)} taxAmt={T.tax(T.ot)} sectionTotal={T.otherTotal} />

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <div style={{ minWidth: 340 }}>
              {T.shippingTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4, paddingBottom: 4, borderBottom: '1px dashed var(--border)' }}>
                  <span>USD {fmtUSD(T.shippingTotal)} × {inv.exchangeRate.toLocaleString()}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{fmtTZS(T.shippingTotal * inv.exchangeRate)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderRadius: 9, padding: '12px 16px', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>TOTAL</span>
                <span style={{ fontSize: 15, fontWeight: 900, fontFamily: 'var(--mono)' }}>{fmt(T.grandTotalTZS, 'TZS')}</span>
              </div>
              {inv.received > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--green)', marginBottom: 4, paddingLeft: 4 }}>
                  <span>Less: Received</span><span style={{ fontFamily: 'var(--mono)' }}>({fmt(inv.received, 'TZS')})</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, color: due > 0 ? 'var(--red)' : 'var(--green)', borderTop: '2px solid var(--border)', paddingTop: 8 }}>
                <span>Amount Due</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{fmt(Math.max(0, due), 'TZS')}</span>
              </div>
            </div>
          </div>

          {/* Carbon segment — live from the linked shipment, not a tradeable credit */}
          {inv.shipmentCarbon && (
            <div style={{ background: 'var(--green-l)', border: '1px solid var(--green)', borderRadius: 9, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Icon name="globe" size={15} color="var(--green)" strokeWidth={1.75} />
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)' }}>Carbon Footprint (Estimate)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{Number(inv.shipmentCarbon.co2_emissions_kg).toLocaleString('en')} kg</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>CO₂ emissions</div>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)' }}>{Number(inv.shipmentCarbon.carbon_credits_saved).toFixed(2)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Credits saved (est.)</div>
                </div>
                {inv.shipmentCarbon.distance_km != null && (
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{inv.shipmentCarbon.distance_km} km</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Route distance</div>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 10, fontStyle: 'italic' }}>
                GLEC v3.2 / ISO 14083 methodology. Internal ESG estimate — not a registry-issued or tradeable carbon credit.
              </div>
            </div>
          )}

          {/* Payment Info */}
          <div style={{ background: 'var(--bg)', borderRadius: 9, padding: '16px 20px', marginBottom: 24, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', marginBottom: 12 }}>Payment Information</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 24, fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6 }}>
              <div>
                <div style={{ display: 'flex', gap: 8 }}><span style={{ minWidth: 100, fontWeight: 600 }}>Bank Name:</span><span>CRDB Bank Plc</span></div>
                <div style={{ display: 'flex', gap: 8 }}><span style={{ minWidth: 100, fontWeight: 600 }}>Account Name:</span><span>Moovit ClearOS Ltd</span></div>
                <div style={{ display: 'flex', gap: 8 }}><span style={{ minWidth: 100, fontWeight: 600 }}>Account No:</span><span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>0150244433200</span></div>
                <div style={{ display: 'flex', gap: 8 }}><span style={{ minWidth: 100, fontWeight: 600 }}>Swift Code:</span><span style={{ fontFamily: 'var(--mono)' }}>CORUTZTZ</span></div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Pay Online</div>
                <a href={`https://pay.moovit.co.tz/invoice/${inv.id}`} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                  https://pay.moovit.co.tz/invoice/{inv.id}
                </a>
              </div>
            </div>
          </div>

          {/* Terms */}
          {inv.terms && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', marginBottom: 6 }}>Terms &amp; Conditions</div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.8 }}>{inv.terms}</div>
            </div>
          )}
        </div>
      ) : tab === 'notes' ? (
        <div className="inv-tab-panel">
          <div className="inv-tab-compose">
            <textarea
              className="inv-tab-textarea"
              placeholder="Write a note…"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote(); }}
              rows={3}
            />
            <div className="inv-tab-compose-foot">
              <span className="inv-tab-hint">⌘↵ to save</span>
              <button type="button" className="inv-tab-submit" onClick={addNote} disabled={!newNote.trim()}>Add Note</button>
            </div>
          </div>
          <div className="inv-tab-list">
            {notes.length === 0 && <div className="inv-tab-empty">No notes yet.</div>}
            {notes.map(n => (
              <div key={n.id} className="inv-note-item">
                <div className="inv-note-meta">{n.author_name} · {new Date(n.created_at).toLocaleString('en-GB')}</div>
                <div className="inv-note-text">{n.content}</div>
                <button type="button" className="inv-note-del" title="Delete note" onClick={() => deleteNote(n.id)}>
                  <Icon name="x" size={12} color="var(--ink3)" />
                </button>
              </div>
            ))}
          </div>
        </div>

      ) : tab === 'tasks' ? (
        <div className="inv-tab-panel">
          {showTaskForm ? (
            <div className="inv-task-form">
              <input className="inv-tab-input" placeholder="Task description…" value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)} />
              <div className="inv-task-form-row">
                <input className="inv-tab-input" placeholder="Assignee" value={newTaskAssignee} onChange={e => setNewTaskAssignee(e.target.value)} />
                <DatePicker date={parseDateOnly(newTaskDue)} onChange={d => setNewTaskDue(toDateOnlyString(d))} />
              </div>
              <div className="inv-tab-compose-foot">
                <button type="button" className="inv-tab-cancel" onClick={() => setShowTaskForm(false)}>Cancel</button>
                <button type="button" className="inv-tab-submit" onClick={addTask} disabled={!newTaskDesc.trim()}>Add Task</button>
              </div>
            </div>
          ) : (
            <div className="inv-tab-toolbar">
              <button type="button" className="inv-tab-submit" onClick={() => setShowTaskForm(true)}>
                <Icon name="plus" size={13} color="hsl(var(--primary-foreground))" /> New Task
              </button>
            </div>
          )}
          <div className="inv-tab-list">
            {tasks.length === 0 && <div className="inv-tab-empty">No tasks yet.</div>}
            {tasks.map(t => (
              <div key={t.id} className={`inv-task-item${t.done ? ' inv-task-item--done' : ''}`}>
                <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} className="inv-task-check" title="Toggle task" />
                <div className="inv-task-body">
                  <span className="inv-task-desc">{t.description}</span>
                  {t.assignee && <span className="inv-task-assignee">→ {t.assignee}</span>}
                  {t.due_date && <span className="inv-task-due">Due {t.due_date}</span>}
                </div>
                <button type="button" className="inv-note-del" title="Delete task" onClick={() => deleteTask(t.id)}>
                  <Icon name="x" size={12} color="var(--ink3)" />
                </button>
              </div>
            ))}
          </div>
        </div>

      ) : tab === 'reminders' ? (
        <div className="inv-tab-panel">
          {showRemForm ? (
            <div className="inv-task-form">
              <div className="inv-task-form-row">
                <DatePicker date={parseDateOnly(newRemDate)} onChange={d => setNewRemDate(toDateOnlyString(d))} />
                <input className="inv-tab-input" placeholder="Reminder message…" value={newRemMsg} onChange={e => setNewRemMsg(e.target.value)} />
              </div>
              <div className="inv-tab-compose-foot">
                <button type="button" className="inv-tab-cancel" onClick={() => setShowRemForm(false)}>Cancel</button>
                <button type="button" className="inv-tab-submit" onClick={addReminder} disabled={!newRemDate || !newRemMsg.trim()}>Set Reminder</button>
              </div>
            </div>
          ) : (
            <div className="inv-tab-toolbar">
              <button type="button" className="inv-tab-submit" onClick={() => setShowRemForm(true)}>
                <Icon name="plus" size={13} color="hsl(var(--primary-foreground))" /> New Reminder
              </button>
            </div>
          )}
          <div className="inv-tab-list">
            {reminders.length === 0 && <div className="inv-tab-empty">No reminders set.</div>}
            {[...reminders].sort((a, b) => a.remind_date.localeCompare(b.remind_date)).map(r => (
              <div key={r.id} className={`inv-task-item${r.done ? ' inv-task-item--done' : ''}`}>
                <input type="checkbox" checked={r.done} onChange={() => toggleReminder(r.id)} className="inv-task-check" title="Mark done" />
                <div className="inv-task-body">
                  <span className="inv-task-due">{r.remind_date}</span>
                  <span className="inv-task-desc">{r.message}</span>
                </div>
                <button type="button" className="inv-note-del" title="Delete reminder" onClick={() => deleteReminder(r.id)}>
                  <Icon name="x" size={12} color="var(--ink3)" />
                </button>
              </div>
            ))}
          </div>
        </div>

      ) : tab === 'activity' ? (
        <div className="inv-tab-panel">
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
      ) : null}
    </div>
  );
}

/* ── Main Billing page ── */
export const Billing: React.FC = () => {
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const location = useLocation();
  const [invoices, setInvoices]         = useState<Invoice[]>([]);
  const [apiLoading, setApiLoading] = useState(true);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [presetCustomer, setPresetCustomer] = useState<PickerItem | null>(null);

  useEffect(() => {
    apiFetch('/v1/invoices')
      .then((data: any) => {
        setInvoices(Array.isArray(data) ? data.map(mapApiInvoice) : []);
      })
      .catch(() => setInvoices([]))
      .finally(() => setApiLoading(false));
  }, []);
  const [mode, setMode]                 = useState<PageMode>('list');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [search, setSearch]             = useState('');
  const [sortAsc, setSortAsc]           = useState(false);

  // Arriving from a customer's profile (Customers.tsx "+ Create Invoice" /
  // "+ Record Payment") — previously this query param was silently ignored,
  // dropping the user on a generic, unscoped Billing page.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const customerId = params.get('customer_id');
    if (!customerId) return;
    apiFetch(`/v1/customers/${customerId}`)
      .then((c: any) => {
        const item: PickerItem = { id: c.id, label: c.name };
        setPresetCustomer(item);
        if (params.get('new') === '1') {
          setSelectedId(null);
          setMode('create');
        } else {
          setSearch(c.name);
        }
      })
      .catch(() => {});
  }, [location.search]);

  // Arriving from the Finance dashboard's "Recent Invoices" row — deep-link
  // straight to that invoice's detail panel instead of the generic list.
  // Waits on `invoices` since the id only resolves once the list has loaded.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const invoiceId = params.get('id');
    if (!invoiceId || !invoices.length) return;
    // A deep link may carry either the display id (invoice_number, what
    // this page's own rows are keyed by) or the real database UUID
    // (_dbId) — a note's subject_id (NotesApp.tsx's "Related to" link)
    // always stores the real UUID, never the display number, so matching
    // on i.id alone silently failed for any invoice linked from a note.
    const match = invoices.find(i => i.id === invoiceId || i._dbId === invoiceId);
    if (match) {
      setSelectedId(match.id);
      setMode('view');
    }
  }, [location.search, invoices]);

  /* ── Filters popover ── */
  const [showFilters, setShowFilters]     = useState(false);
  const [filterMode, setFilterMode]       = useState<'all' | Invoice['mode']>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo]     = useState('');
  const activeFilterCount = (filterMode !== 'all' ? 1 : 0) + (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0);

  /* ── Row selection → bulk export ── keyed by invoice id, not filtered
     index, so a selection survives the user narrowing/widening the table
     with the status tabs / filters / search afterward. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectedInvoice = selectedId ? (invoices.find(i => i.id === selectedId) ?? null) : null;
  const isSplit = mode !== 'list';

  const maxNumber = Math.max(...invoices.map(i => parseInt(i.id.match(/\d{4}/g)?.pop() || '0')), 0);
  const nextId = `CLR-2026-${String(maxNumber + 1).padStart(4, '0')} INV`;

  const billDateToIso = (d: string) => { const [dd, mm, yyyy] = d.split('-'); return `${yyyy}-${mm}-${dd}`; };

  const filtered = invoices
    .filter(inv => filterStatus === 'all' || inv.status === filterStatus)
    .filter(inv => filterMode === 'all' || inv.mode === filterMode)
    .filter(inv => !filterDateFrom || (inv.billDate && billDateToIso(inv.billDate) >= filterDateFrom))
    .filter(inv => !filterDateTo || (inv.billDate && billDateToIso(inv.billDate) <= filterDateTo))
    .filter(inv => !search || [inv.client, inv.id, inv.blNumber].some(s => s.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => sortAsc ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id));

  const invStats = (() => {
    const draftCount = invoices.filter(i => i.status === 'Draft').length;
    const paidCount = invoices.filter(i => i.status === 'Paid').length;
    const overdueInvoices = invoices.filter(i => i.status === 'Overdue');
    const overdueTotal = overdueInvoices.reduce((s, i) => s + Math.max(0, invoiceTotal(i) - i.received), 0);
    const outstandingTotal = invoices.reduce((s, i) => s + Math.max(0, invoiceTotal(i) - i.received), 0);
    const totalReceived = invoices.reduce((s, i) => s + i.received, 0);
    const totalBilled = invoices.reduce((s, i) => s + invoiceTotal(i), 0);
    return {
      total: invoices.length, draftCount, paidCount,
      outstandingTotal, overdueTotal, dueSoonTotal: Math.max(0, outstandingTotal - overdueTotal),
      totalReceived,
      collectionRate: totalBilled ? Math.round((totalReceived / totalBilled) * 100) : 0,
    };
  })();

  const selectedInvoicesList = invoices.filter(inv => selectedIds.has(inv.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every(inv => selectedIds.has(inv.id));

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleSelectAllFiltered() {
    setSelectedIds(prev => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filtered.forEach(inv => next.delete(inv.id));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach(inv => next.add(inv.id));
      return next;
    });
  }

  function exportSelectedCsv() {
    const rows = [
      ['Invoice ID', 'Client', 'BL/AWB', 'Origin', 'Destination', 'Mode', 'Date', 'Due Date', 'Status', 'Grand Total (TZS)', 'Received (TZS)', 'Balance Due (TZS)'],
      ...selectedInvoicesList.map(inv => {
        const total = invoiceTotal(inv);
        return [inv.id, inv.client, inv.blNumber, inv.origin, inv.destination, inv.mode, inv.billDate, inv.dueDate ?? '', inv.status, Math.round(total), Math.round(inv.received), Math.round(Math.max(0, total - inv.received))];
      }),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const [downloadingAll, setDownloadingAll] = useState(false);
  async function downloadAllSelected() {
    if (downloadingAll) return;
    setDownloadingAll(true);
    // Sequential, not Promise.all — back-to-back a.click() downloads
    // fired all at once are exactly what triggers a browser's
    // multiple-automatic-downloads block; pacing them by each fetch's own
    // network time avoids that.
    for (const inv of selectedInvoicesList) {
      if (!inv._dbId) continue;
      try { await apiDownload(`/v1/invoices/${inv._dbId}/pdf`, `${inv.id}.pdf`); } catch { /* continue with the rest */ }
    }
    setDownloadingAll(false);
  }

  function handleSaveInvoice(inv: Invoice) {
    const isCreate = mode === 'create';
    if (isCreate) {
      setInvoices(prev => [inv, ...prev]);
      setSelectedId(inv.id);
    } else {
      setInvoices(prev => prev.map(i => i.id === inv.id ? inv : i));
    }
    setMode('view');

    const apiPayload = {
      invoice_number: inv.id,
      // Both accepted by the backend (see fastify.post/patch '/v1/invoices'
      // in invoices.routes.ts) since before this page existed — the editor's
      // Client and Linked Shipment pickers set inv.customerId/inv.shipmentRef
      // correctly, but this payload never sent either, so the link only
      // ever lived in local state and was gone on the next page load.
      customer_id: inv.customerId || null,
      shipment_ref: inv.shipmentRef || null,
      client_name: inv.client,
      client_address: inv.clientAddress,
      bl_number: inv.blNumber,
      origin: inv.origin,
      destination: inv.destination,
      mode: inv.mode,
      bill_date: inv.billDate ? inv.billDate.split('-').reverse().join('-') : null,
      due_date: inv.dueDate ? inv.dueDate.split('-').reverse().join('-') : null,
      sale_agent: inv.saleAgent,
      payment_terms: inv.terms,
      exchange_rate: inv.exchangeRate,
      ref_code: inv.refCode,
      version: inv.version,
      notes: '',
      items: inv.items.map((it, i) => ({
        name: it.name, unit: it.unit, rate: it.rate, qty: it.qty,
        tax_pct: it.taxPct, line_group: it.group, currency: it.currency, sort_order: i,
      })),
    };
    const dbId = (!isCreate && selectedInvoice?._dbId) ? selectedInvoice._dbId : null;
    apiFetch(dbId ? `/v1/invoices/${dbId}` : '/v1/invoices', {
      method: dbId ? 'PATCH' : 'POST',
      body: JSON.stringify(apiPayload),
    }).then(() => apiFetch('/v1/invoices'))
      .then((data: any) => { if (Array.isArray(data)) setInvoices(data.map(mapApiInvoice)); })
      .catch(() => {});
  }

  function handleCopyInvoice() {
    if (!selectedInvoice) return;
    const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
    const newId = nextId;
    const copy: Invoice = { ...selectedInvoice, id: newId, status: 'Draft', received: 0, billDate: today, dueDate: null, version: 1, refCode: genRefCode(newId, 1) };
    setInvoices(prev => [copy, ...prev]);
    setSelectedId(copy.id);
    setMode('view');
  }

  async function handleDeleteInvoice() {
    if (!selectedInvoice || !(await showConfirm(`Delete ${selectedInvoice.id}? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
    if (selectedInvoice._dbId) {
      apiFetch(`/v1/invoices/${selectedInvoice._dbId}`, { method: 'DELETE' }).catch(() => {});
    }
    setInvoices(prev => prev.filter(i => i.id !== selectedInvoice.id));
    setSelectedId(null); setMode('list');
  }

  function handleRecordPayment(amount: number, payMethod: string, payDate: string) {
    if (!selectedInvoice) return;
    const newReceived = Math.min(selectedInvoice.received + amount, invoiceTotal(selectedInvoice));
    const newStatus: Status = newReceived >= invoiceTotal(selectedInvoice) ? 'Paid' : 'Partial';
    setInvoices(prev => prev.map(i => i.id === selectedInvoice.id ? { ...i, received: newReceived, status: newStatus } : i));
    if (selectedInvoice._dbId) {
      apiFetch(`/v1/invoices/${selectedInvoice._dbId}/payment`, {
        method: 'POST',
        body: JSON.stringify({ amount, method: payMethod, payment_date: payDate }),
      }).then(() => apiFetch('/v1/invoices'))
        .then((data: any) => { if (Array.isArray(data)) setInvoices(data.map(mapApiInvoice)); })
        .catch(() => {});
    }
  }

  async function handleSubmitTRA() {
    if (!selectedInvoice?._dbId) return;
    try {
      const res: any = await apiFetch(`/v1/tra/invoices/${selectedInvoice._dbId}/submit`, { method: 'POST' });
      setInvoices(prev => prev.map(i => i.id === selectedInvoice.id ? {
        ...i,
        traStatus: 'submitted',
        traRctvnum: res.rctvNum,
        traQrUrl: res.qrUrl,
        traAckCode: res.ackCode,
        traAckMsg: res.ackMsg
      } : i));
    } catch (err) {
      throw err;
    }
  }

  return (
    <div className="inv-shell">
      {mode !== 'create' && mode !== 'edit' && (
      <>
      <PageHeader
        crumbs={['Finance', 'Invoices']}
        titlePlain="Sales"
        titleEm="invoices"
        subtitle="Every invoice raised, what has been received and what is still due."
      />
      <MetricsRow cards={[
        {
          title: 'Total Invoices', value: String(invStats.total),
          sub1Label: 'DRAFT', sub1Value: String(invStats.draftCount),
          sub2Label: 'SENT', sub2Value: String(invStats.total - invStats.draftCount), barHighlight: 'var(--teal)',
        },
        {
          title: 'Outstanding', value: fmt(invStats.outstandingTotal, 'TZS'),
          invertTrend: true,
          sub1Label: 'DUE SOON', sub1Value: fmt(invStats.dueSoonTotal, 'TZS'),
          sub2Label: 'OVERDUE', sub2Value: fmt(invStats.overdueTotal, 'TZS'), barHighlight: 'var(--red)',
        },
        {
          title: 'Total Received', value: fmt(invStats.totalReceived, 'TZS'),
          sub1Label: 'PAID', sub1Value: String(invStats.paidCount),
          sub2Label: 'ALL INVOICES', sub2Value: String(invStats.total), barHighlight: 'var(--green)',
        },
        {
          title: 'Collection Rate', value: `${invStats.collectionRate}%`,
          sub1Label: 'PAID', sub1Value: String(invStats.paidCount),
          sub2Label: 'TOTAL', sub2Value: String(invStats.total), barHighlight: 'var(--blue)',
        },
      ]} />
      </>
      )}

      {/* While creating or editing, the form takes the whole body — the list
          panel is hidden rather than the form being squeezed into the right
          column beside it, matching how Quotations gives its form the page. */}
      <div className={`inv-body${isSplit ? ' inv-body--split' : ''}${selectedInvoice || mode === 'create' ? ' inv-body--has-selection' : ''}${mode === 'create' || mode === 'edit' ? ' inv-body--form' : ''}`}>
        {/* List panel */}
        <div className="inv-list-panel">

          {/* Toolbar — tabs, actions and search all in one row. The tabs +
              actions + search live inside .inv-toolbar-scroll, which scrolls
              sideways on a viewport too narrow to fit them all (instead of
              wrapping into a second row); Create Invoice sits outside that
              scroller as a fixed sibling, so the primary action is never
              something a user has to scroll to discover. */}
          <div className="inv-list-toolbar">
          <div className="inv-toolbar-scroll">
            {!isSplit && (
              <div className="ds-tabs-list" data-variant="segmented">
                {(['all', 'Draft', 'Unpaid', 'Partial', 'Paid', 'Overdue', 'Credited'] as FilterStatus[]).map(s => {
                  const cnt = s === 'all' ? invoices.length : invoices.filter(i => i.status === s).length;
                  const active = filterStatus === s;
                  return (
                    <button key={s} type="button" className="ds-tabs-trigger" data-variant="segmented"
                      data-state={active ? 'active' : 'inactive'} onClick={() => setFilterStatus(s)}>
                      {s === 'all' ? 'All' : STATUS_STYLE[s as Status].label}
                      {cnt > 0 && <span className="inv-status-chip-count">{cnt}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="inv-topbar-spacer" />
            <div className="inv-toolbar-actions">
              {/* Bulk export — only appears once at least one row is
                  checked, rather than a permanently-visible "Export"
                  button that acted on the whole filtered list regardless
                  of what (if anything) the user had actually picked. */}
              {selectedIds.size > 0 && (
                <div className="inv-bulk-actions">
                  <span className="inv-bulk-count">{selectedIds.size} selected</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={exportSelectedCsv}>
                    <Icon name="download" size={13} /> Export CSV
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={downloadAllSelected} disabled={downloadingAll}>
                    <Icon name="file" size={13} /> {downloadingAll ? 'Downloading…' : 'Download all'}
                  </button>
                  <button type="button" className="inv-bulk-clear" onClick={() => setSelectedIds(new Set())} title="Clear selection">
                    <Icon name="x" size={13} />
                  </button>
                </div>
              )}
              {/* A real Radix Popover, not a hand-rolled absolute-positioned
                  div — that version rendered inside .inv-toolbar-scroll,
                  whose overflow-x:auto (needed for the horizontal-scroll
                  toolbar) computes overflow-y to auto too, clipping any
                  plain absolutely-positioned child that extended below the
                  row. PopoverContent portals to document.body, so it always
                  escapes that clip regardless of which row it's triggered
                  from. It also gets outside-click/Escape dismissal for free,
                  replacing the manual stopPropagation + shell-level onClick
                  dance that used to do the same job a second way. */}
              <Popover open={showFilters} onOpenChange={setShowFilters}>
                <PopoverTrigger asChild>
                  <button type="button" className={`btn btn-secondary btn-sm${activeFilterCount > 0 ? ' inv-btn--active' : ''}`}>
                    <Icon name="filter" size={13} color={activeFilterCount > 0 ? 'var(--teal)' : 'var(--ink3)'} /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={6} className="w-72 flex flex-col gap-2.5">
                  <div className="inv-filters-field">
                    <label>Mode</label>
                    <Select value={filterMode} onValueChange={v => setFilterMode(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All modes</SelectItem>
                        <SelectItem value="SEA">SEA</SelectItem>
                        <SelectItem value="AIR">AIR</SelectItem>
                        <SelectItem value="ROAD">ROAD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="inv-filters-row">
                    <div className="inv-filters-field">
                      <label>From</label>
                      <DatePicker date={parseDateOnly(filterDateFrom)} onChange={d => setFilterDateFrom(toDateOnlyString(d))} />
                    </div>
                    <div className="inv-filters-field">
                      <label>To</label>
                      <DatePicker date={parseDateOnly(filterDateTo)} onChange={d => setFilterDateTo(toDateOnlyString(d))} />
                    </div>
                  </div>
                  <div className="inv-filters-foot">
                    <button type="button" className="btn btn-secondary" onClick={() => { setFilterMode('all'); setFilterDateFrom(''); setFilterDateTo(''); }}>Clear</button>
                    <button type="button" className="btn btn-primary" onClick={() => setShowFilters(false)}>Done</button>
                  </div>
                </PopoverContent>
              </Popover>
              <Link to="/finance/invoices/recurring" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                <Icon name="calendar" size={13} /> Recurring
              </Link>
              <div className="inv-search-wrap">
                <Icon name="search" size={13} color="var(--ink3)" className="inv-search-icon" />
                <input className="inv-search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice, client, BL…" />
              </div>
            </div>
          </div>
          <button type="button" onClick={() => { setSelectedId(null); setMode('create'); }}
            className="inv-toolbar-cta"
            style={{ padding: 'var(--ds-btn-py-sm) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>
            <Icon name="plus" size={13} color="hsl(var(--primary-foreground))" /> Create Invoice
          </button>
          </div>

          {/* Table */}
          <div className="inv-table-wrap">
            <table className="rtbl inv-table">
              <thead>
                <tr>
                  <th className="th--checkbox">
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} title="Select all" />
                  </th>
                  <th className="th--sortable" onClick={() => setSortAsc(v => !v)}>
                    <span>Invoice # <Icon name={sortAsc ? 'arrowUp' : 'arrowDown'} size={11} color="var(--ink3)" /></span>
                  </th>
                  {!isSplit && <th>BL / AWB</th>}
                  <th>Customer</th>
                  {!isSplit && <th>Mode</th>}
                  <th className="th--right">Total (TZS)</th>
                  <th>Date</th>
                  {!isSplit && <th>Due</th>}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const isSelected = inv.id === selectedId;
                  const isChecked = selectedIds.has(inv.id);
                  const st = STATUS_STYLE[inv.status];
                  const total = invoiceTotal(inv);
                  return (
                    <tr key={inv.id}
                      className={isSelected ? 'inv-row--selected' : ''}
                      onClick={() => { if (mode !== 'edit' && mode !== 'create') { setSelectedId(inv.id); setMode('view'); } }}>
                      <td className="th--checkbox" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isChecked} onChange={() => toggleSelect(inv.id)} />
                      </td>
                      <td><span className="inv-cell-id">{inv.id}</span></td>
                      {!isSplit && (
                        <td>
                          <Link to={`/clearos/ops?search=${encodeURIComponent(inv.blNumber)}`} onClick={e => e.stopPropagation()}
                            title={`Open shipment ${inv.blNumber} in Ops Command`} className="inv-cell-link">
                            {inv.blNumber}
                          </Link>
                        </td>
                      )}
                      <td className="inv-cell-client">
                        {/* Customers.tsx only reads ?id=, not ?search= — a
                            name-search param there was silently ignored, so
                            this deep-links straight to the record instead
                            (falls back to the plain list on legacy invoices
                            with no linked customer). */}
                        <Link to={inv.customerId ? `/crm/customers?id=${encodeURIComponent(inv.customerId)}` : '/crm/customers'} onClick={e => e.stopPropagation()}
                          title={`View ${inv.client} profile`} className="inv-cell-client-link">
                          {inv.client}
                        </Link>
                      </td>
                      {!isSplit && <td><span className="inv-mode-badge" data-mode={inv.mode}>{inv.mode}</span></td>}
                      <td className="inv-cell-total">{fmt(total, 'TZS')}</td>
                      <td className="inv-cell-date">{inv.billDate}</td>
                      {!isSplit && <td className={`inv-cell-due${inv.status === 'Overdue' ? ' inv-cell-due--overdue' : ''}`}>{inv.dueDate ?? '—'}</td>}
                      <td><span className="inv-status-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                    </tr>
                  );
                })}
                {apiLoading && (
                  <tr><td colSpan={10} className="inv-table-msg">Loading invoices…</td></tr>
                )}
                {!apiLoading && filtered.length === 0 && invoices.length === 0 && (
                  <tr><td colSpan={10} className="inv-table-msg">
                    <div className="inv-empty-title">No invoices yet</div>
                    <div className="inv-empty-sub">Create your first invoice to start billing customers.</div>
                    <button type="button" className="btn btn-primary" onClick={() => { setSelectedId(null); setMode('create'); }}>
                      <Icon name="plus" size={14} color="hsl(var(--primary-foreground))" /> Create New Invoice
                    </button>
                  </td></tr>
                )}
                {!apiLoading && filtered.length === 0 && invoices.length > 0 && (
                  <tr><td colSpan={10} className="inv-table-msg">No invoices match your filters</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          {!isSplit && filtered.length > 0 && (
            <div className="inv-list-footer">
              <span style={{ color: 'var(--ink3)' }}>{filtered.length} invoices</span>
              <span style={{ color: 'var(--ink2)' }}>Total: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{fmt(filtered.reduce((s, i) => s + invoiceTotal(i), 0), 'TZS')}</strong></span>
              <span style={{ color: 'var(--ink2)' }}>Received: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{fmt(filtered.reduce((s, i) => s + i.received, 0), 'TZS')}</strong></span>
              <span style={{ color: 'var(--ink2)' }}>Outstanding: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{fmt(filtered.reduce((s, i) => s + Math.max(0, invoiceTotal(i) - i.received), 0), 'TZS')}</strong></span>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="inv-detail-panel" style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
          {mode === 'view' && selectedInvoice && (
            <InvoiceDetailPanel inv={selectedInvoice} onClose={() => { setMode('list'); setSelectedId(null); }} onEdit={() => setMode('edit')} onCopy={handleCopyInvoice} onDelete={handleDeleteInvoice} onRecordPayment={handleRecordPayment} onSubmitTRA={handleSubmitTRA} isMobile={isMobile} />
          )}
          {mode === 'edit' && selectedInvoice && (
            <InvoiceEditor initial={selectedInvoice} nextId={nextId} onSave={handleSaveInvoice} onCancel={() => setMode('view')} isMobile={isMobile} />
          )}
          {mode === 'create' && (
            <InvoiceEditor initial={null} nextId={nextId} onSave={handleSaveInvoice} onCancel={() => { setMode('list'); setSelectedId(null); }} isMobile={isMobile} presetCustomer={presetCustomer} />
          )}
        </div>
      </div>

      {/* Batch Payments modal */}
    </div>
  );
};
