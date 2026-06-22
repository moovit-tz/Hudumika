import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Icon } from '../components/Icon.js';
import { getCompany, subscribeCompany } from '../data/companyStore.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { apiFetch } from '../lib/api.js';

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

export interface InvNote     { id: string; ts: string; text: string; }
export interface InvTask     { id: string; desc: string; assignee: string; dueDate?: string; done: boolean; ts: string; }
export interface InvReminder { id: string; date: string; msg: string; done: boolean; }
export interface InvAuditEntry { id: string; ts: string; action: string; }

export interface Invoice {
  id: string;
  _dbId?: string;
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
  notes?: InvNote[];
  tasks?: InvTask[];
  reminders?: InvReminder[];
  auditLog?: InvAuditEntry[];
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
  let seed = id.split('').reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 17);
  let h = '';
  for (let i = 0; i < 6; i++) { h += chars[seed % chars.length]; seed = (seed * 1103515245 + 12345) >>> 0; }
  return `${h.slice(0, 3)}-${h.slice(3)}-V${String(version).padStart(2, '0')}`;
}

export const STATUS_STYLE: Record<Status, { bg: string; color: string; label: string }> = {
  Draft:    { bg: '#e5e7eb', color: '#374151', label: 'Draft'          },
  Partial:  { bg: '#dbeafe', color: '#1d4ed8', label: 'Partially paid' },
  Paid:     { bg: '#1e293b', color: '#f1f5f9', label: 'Fully paid'     },
  Credited: { bg: '#fce7f3', color: '#be185d', label: 'Credited'       },
  Unpaid:   { bg: '#fef3c7', color: '#b45309', label: 'Not paid'       },
  Overdue:  { bg: '#fee2e2', color: '#dc2626', label: 'Overdue'        },
};

const UNIT_OPTIONS = ['PER BIL', 'PER BILL', 'PER CONT', 'PER CONTAINER', 'BASIC RATE', 'FLAT', 'PER DAY', 'PER TON', 'PER CBM'];

export function mapApiInvoice(d: any): Invoice {
  return {
    id: d.invoice_number || d.id,
    _dbId: d.id,
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

/* ── Mock data ── */
export const INITIAL_INVOICES: Invoice[] = [
  {
    id: 'CLR-2026-0028 INV', client: 'Karibu Traders Ltd', version: 1,
    clientAddress: ['P.O. Box 4521', 'Kariakoo, Dar es Salaam', 'Tanzania', 'VAT: TZ 1234561-C'],
    blNumber: 'MSCU2456789', origin: 'SINGAPORE', destination: 'DAR ES SALAAM, TANZANIA', mode: 'SEA',
    billDate: '13-06-2026', dueDate: '27-06-2026', status: 'Draft', received: 0, exchangeRate: 2650,
    saleAgent: 'Amani Mwangi', hasNote: true,
    refCode: genRefCode('CLR-2026-0028 INV', 1),
    terms: 'Payment due within 14 days. All 3rd party charges are estimates and subject to actuals.',
    items: [
      { name: 'DOCUMENTATION',          unit: 'PER BIL',       rate: 132000,  qty: 1,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'AGENCY FEES – SEA 20"',  unit: 'PER CONT',      rate: 400000,  qty: 2,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'TRANSPORTATION',         unit: 'PER CONT',      rate: 700000,  qty: 2,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'DELIVERY ORDER CHARGES', unit: 'PER BIL',       rate: 15,      qty: 1,  taxPct: 18, group: 'shipping', currency: 'USD' },
      { name: 'SHIPPING FEES',          unit: 'PER CONTAINER', rate: 49.84,   qty: 2,  taxPct: 0,  group: 'shipping', currency: 'USD' },
      { name: 'FACILITATION',           unit: 'PER BIL',       rate: 950000,  qty: 1,  taxPct: 0,  group: 'other',    currency: 'TZS' },
      { name: 'TBS CHARGES',            unit: 'PER BIL',       rate: 180000,  qty: 1,  taxPct: 0,  group: 'other',    currency: 'TZS' },
      { name: 'WHARFAGE CHARGES',       unit: 'PER BIL',       rate: 320000,  qty: 1,  taxPct: 18, group: 'other',    currency: 'TZS' },
    ],
  },
  {
    id: 'CLR-2026-0027 INV', client: 'Tanga Cement Co.', version: 1,
    clientAddress: ['Industrial Area, Plot 14', 'Tanga, Tanzania', 'TZ 30100', 'VAT: TZ 9876543-B'],
    blNumber: 'TRHU3456789', origin: 'CHINA (GUANGZHOU)', destination: 'DAR ES SALAAM, TANZANIA', mode: 'SEA',
    billDate: '08-06-2026', dueDate: '22-06-2026', status: 'Draft', received: 0, exchangeRate: 2650,
    saleAgent: 'Fatuma Ally',
    refCode: genRefCode('CLR-2026-0027 INV', 1),
    terms: 'Payment due 14 days from invoice date.',
    items: [
      { name: 'DOCUMENTATION',          unit: 'PER BIL',   rate: 132000,   qty: 1,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'AGENCY FEES – BULK',     unit: 'PER CONT',  rate: 350000,   qty: 4,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'TRANSPORTATION',         unit: 'PER CONT',  rate: 700000,   qty: 4,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'DELIVERY ORDER CHARGES', unit: 'PER BIL',   rate: 15,       qty: 1,  taxPct: 18, group: 'shipping', currency: 'USD' },
      { name: 'DEMURRAGE (2 DAYS)',      unit: 'PER BILL',  rate: 470,      qty: 1,  taxPct: 0,  group: 'shipping', currency: 'USD' },
      { name: 'TBS CHARGES',            unit: 'PER BIL',   rate: 180000,   qty: 1,  taxPct: 0,  group: 'other',    currency: 'TZS' },
      { name: 'WHARFAGE CHARGES',       unit: 'PER BIL',   rate: 477696,   qty: 1,  taxPct: 18, group: 'other',    currency: 'TZS' },
    ],
  },
  {
    id: 'CLR-2026-0024 INV', client: 'Mombasa Freight Ltd', version: 1,
    clientAddress: ['Moi Avenue, Floor 3', 'Mombasa, Kenya', 'KE 80100', 'VAT: KE P051234567A'],
    blNumber: 'MAEU5678901', origin: 'DUBAI (UAE)', destination: 'MOMBASA, KENYA', mode: 'SEA',
    billDate: '13-06-2026', dueDate: '26-06-2026', status: 'Partial', received: 1550000, exchangeRate: 2650,
    saleAgent: 'Bakari Juma',
    refCode: genRefCode('CLR-2026-0024 INV', 1),
    terms: 'Remaining balance due immediately. A surcharge applies after 7 days.',
    items: [
      { name: 'DOCUMENTATION',          unit: 'PER BIL',       rate: 132000,  qty: 1,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'AGENCY FEES – SEA 20"',  unit: 'PER CONT',      rate: 400000,  qty: 2,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'TRANSPORTATION',         unit: 'PER CONT',      rate: 600000,  qty: 2,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'DELIVERY ORDER CHARGES', unit: 'PER BIL',       rate: 15,      qty: 1,  taxPct: 18, group: 'shipping', currency: 'USD' },
      { name: 'SHIPPING FEES',          unit: 'PER CONTAINER', rate: 49.84,   qty: 2,  taxPct: 0,  group: 'shipping', currency: 'USD' },
      { name: 'FACILITATION',           unit: 'PER BIL',       rate: 200000,  qty: 1,  taxPct: 0,  group: 'other',    currency: 'TZS' },
      { name: 'WHARFAGE CHARGES',       unit: 'PER BIL',       rate: 180000,  qty: 1,  taxPct: 18, group: 'other',    currency: 'TZS' },
    ],
  },
  {
    id: 'CLR-2026-0023 INV', client: 'Dar Engineering Co.', version: 1,
    clientAddress: ['Pugu Road, Block C', 'Dar es Salaam, Tanzania', 'TZ 11101', 'VAT: TZ 1122334-A'],
    blNumber: 'HLCU6789012', origin: 'CHINA (SHANGHAI)', destination: 'DAR ES SALAAM, TANZANIA', mode: 'SEA',
    billDate: '07-06-2026', dueDate: '21-06-2026', status: 'Paid', received: 0, exchangeRate: 2650,
    saleAgent: 'Amani Mwangi',
    refCode: genRefCode('CLR-2026-0023 INV', 1),
    terms: 'Payment received in full. Thank you.',
    items: [
      { name: 'DOCUMENTATION',          unit: 'PER BIL',   rate: 132000,  qty: 1,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'AGENCY FEES – FCL 20"',  unit: 'PER CONT',  rate: 400000,  qty: 1,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'TRANSPORTATION',         unit: 'PER CONT',  rate: 700000,  qty: 1,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'DELIVERY ORDER CHARGES', unit: 'PER BIL',   rate: 15,      qty: 1,  taxPct: 18, group: 'shipping', currency: 'USD' },
      { name: 'FACILITATION',           unit: 'PER BIL',   rate: 280000,  qty: 1,  taxPct: 0,  group: 'other',    currency: 'TZS' },
      { name: 'TBS CHARGES',            unit: 'PER BIL',   rate: 180000,  qty: 1,  taxPct: 0,  group: 'other',    currency: 'TZS' },
    ],
  },
  {
    id: 'CLR-2026-0019 INV', client: 'Arusha Supplies Ltd', version: 1,
    clientAddress: ['Sokoine Road, Shop 22', 'Arusha, Tanzania', 'TZ 23100', 'VAT: TZ 5566778-D'],
    blNumber: 'CMDU7890123', origin: 'INDIA (MUMBAI)', destination: 'DAR ES SALAAM, TANZANIA', mode: 'SEA',
    billDate: '05-06-2026', dueDate: '17-06-2026', status: 'Unpaid', received: 0, exchangeRate: 2650,
    saleAgent: 'Amani Mwangi',
    refCode: genRefCode('CLR-2026-0019 INV', 1),
    terms: 'Payment is overdue. Please settle immediately.',
    items: [
      { name: 'DOCUMENTATION',         unit: 'PER BIL',   rate: 132000,  qty: 1,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'AGENCY FEES – LCL',     unit: 'PER BIL',   rate: 350000,  qty: 1,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'TRANSPORTATION',        unit: 'PER BIL',   rate: 450000,  qty: 1,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'DELIVERY ORDER',        unit: 'PER BIL',   rate: 15,      qty: 1,  taxPct: 18, group: 'shipping', currency: 'USD' },
      { name: 'CFS HANDLING CHARGES',  unit: 'PER BIL',   rate: 85,      qty: 1,  taxPct: 0,  group: 'shipping', currency: 'USD' },
      { name: 'FACILITATION',          unit: 'PER BIL',   rate: 280000,  qty: 1,  taxPct: 0,  group: 'other',    currency: 'TZS' },
      { name: 'TBS CHARGES',           unit: 'PER BIL',   rate: 180000,  qty: 1,  taxPct: 0,  group: 'other',    currency: 'TZS' },
    ],
  },
  {
    id: 'CLR-2026-0014 INV', client: 'Moshi Tea Exporters', version: 2,
    clientAddress: ['Old Moshi Road, Unit 7', 'Moshi, Tanzania', 'TZ 25100', 'VAT: TZ 7788990-E'],
    blNumber: 'JKIA20240601', origin: 'NAIROBI (JKIA)', destination: 'MOSHI, TANZANIA', mode: 'AIR',
    billDate: '01-06-2026', dueDate: '15-06-2026', status: 'Overdue', received: 0, exchangeRate: 2650,
    saleAgent: 'Bakari Juma',
    refCode: genRefCode('CLR-2026-0014 INV', 2),
    terms: 'This invoice is overdue. Please contact our accounts team immediately.',
    items: [
      { name: 'AIR FREIGHT CLEARANCE', unit: 'PER AWB',  rate: 420000,  qty: 1,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'DOCUMENTATION',         unit: 'PER AWB',  rate: 80000,   qty: 1,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'AIRLINE DELIVERY FEE',  unit: 'PER AWB',  rate: 45,      qty: 1,  taxPct: 0,  group: 'shipping', currency: 'USD' },
      { name: 'FACILITATION',          unit: 'PER AWB',  rate: 200000,  qty: 1,  taxPct: 0,  group: 'other',    currency: 'TZS' },
      { name: 'PHYTOSANITARY CERT',    unit: 'PER AWB',  rate: 220000,  qty: 1,  taxPct: 0,  group: 'other',    currency: 'TZS' },
    ],
  },
  {
    id: 'CLR-2026-0010 INV', client: 'Dodoma Agri Exports', version: 1,
    clientAddress: ['Dodoma Municipal Road', 'Dodoma, Tanzania', 'TZ 41000', 'VAT: TZ 4433221-G'],
    blNumber: 'RDTUND20240522', origin: 'DODOMA, TANZANIA', destination: 'LUSAKA, ZAMBIA', mode: 'ROAD',
    billDate: '22-05-2026', dueDate: '05-06-2026', status: 'Partial', received: 320000, exchangeRate: 2650,
    saleAgent: 'Fatuma Ally',
    refCode: genRefCode('CLR-2026-0010 INV', 1),
    terms: 'Balance due immediately. Account on hold pending payment.',
    items: [
      { name: 'ROAD TRANSIT BOND',     unit: 'PER BIL',  rate: 280000,  qty: 1,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'DOCUMENTATION',         unit: 'PER BIL',  rate: 80000,   qty: 1,  taxPct: 0,  group: 'clearing', currency: 'TZS' },
      { name: 'BORDER AGENCY FEES',    unit: 'PER BIL',  rate: 250,     qty: 1,  taxPct: 0,  group: 'shipping', currency: 'USD' },
      { name: 'FACILITATION',          unit: 'PER BIL',  rate: 180000,  qty: 1,  taxPct: 0,  group: 'other',    currency: 'TZS' },
      { name: 'TBS EXPORT CERT',       unit: 'PER BIL',  rate: 120000,  qty: 1,  taxPct: 0,  group: 'other',    currency: 'TZS' },
    ],
  },
];

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
  font-family: 'Google Sans Flex';
  src: url('${window.location.origin}/fonts/GoogleSansFlex.ttf') format('truetype');
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Google Sans Flex',Arial,sans-serif;color:#111;padding:24px 32px;font-size:11px}
.top{display:flex;justify-content:space-between;margin-bottom:16px}
.inv-no{font-size:18px;font-weight:900;color:#e8461a;margin-bottom:4px}
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
.sec-hdr{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#374151;padding:4px 8px;background:#f3f4f6;border-left:3px solid #e8461a;margin-bottom:0}
table{width:100%;border-collapse:collapse}
thead tr{background:#f9fafb;border-bottom:1px solid #e5e7eb}
th{padding:4px 6px;text-align:left;font-size:9px;font-weight:700;color:#6b7280;letter-spacing:.04em}
td{padding:4px 6px;border-bottom:1px solid #f3f4f6;vertical-align:top;font-size:10.5px}
.subtotal{display:flex;justify-content:space-between;padding:4px 8px;background:#f9fafb;font-weight:700;font-size:11px;border-top:2px solid #e5e7eb}
.grand{display:flex;justify-content:flex-end;gap:32px;align-items:center;margin:8px 0;padding:8px 10px;background:#e8461a;color:#fff;border-radius:6px;font-size:12px;font-weight:800}
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
  <div style="text-align:right;font-size:12px;color:#6b7280">
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
${sectionHtml('Clearing Charges — Paid in TZS', 'TZS', T.cl, T.sub(T.cl), T.tax(T.cl), T.clearingTotal)}
${sectionHtml('Shipping Line Charges — Paid in USD', 'USD', T.sh, T.sub(T.sh), T.tax(T.sh), T.shippingTotal)}
${sectionHtml('Other Charges — Paid in TZS', 'TZS', T.ot, T.sub(T.ot), T.tax(T.ot), T.otherTotal)}
<div class="grand"><span>GRAND TOTAL</span><span>${fmtTZS(T.grandTotalTZS)}</span></div>
${inv.exchangeRate > 0 && T.shippingTotal > 0 ? `<div style="text-align:right;font-size:11px;color:#6b7280;margin-bottom:12px">USD shipping converted at 1 USD = TZS ${inv.exchangeRate.toLocaleString()}</div>` : ''}
${inv.received > 0 ? `<div class="due"><span>Less: Amount Received</span><span style="color:#16a34a">(${fmtTZS(inv.received)})</span></div>` : ''}
<div class="due"><span>Amount Due</span><span>${fmtTZS(Math.max(0, due))}</span></div>
<div style="margin-top:20px;padding:12px;background:#f9fafb;border-radius:6px;font-size:10px;color:#374151;border:1px solid #e5e7eb">
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

/* ── Charge section editor ── */
export type EditItem = LineItem & { uid: string };

function ChargeSectionEditor({ title, color, group, currency, items, onChange }: {
  title: string; color: string; group: ChargeGroup; currency: Currency;
  items: EditItem[]; onChange: (items: EditItem[]) => void;
}) {
  const fmt = (n: number) => fmtAmt(n, currency);
  const add = () => onChange([...items, { uid: String(Date.now()), name: '', unit: 'PER BIL', rate: 0, qty: 1, taxPct: 0, group, currency }]);
  const remove = (uid: string) => onChange(items.filter(i => i.uid !== uid));
  const update = (uid: string, k: keyof EditItem, v: string | number) =>
    onChange(items.map(i => i.uid === uid ? { ...i, [k]: v } : i));

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
            <tr><td colSpan={9} style={{ padding: '12px 10px', color: 'var(--ink3)', fontStyle: 'italic', fontSize: 12, textAlign: 'center', borderBottom: '1px solid var(--border)' }}>No charges — click "Add Item" below</td></tr>
          ) : items.map((item, i) => {
            const lineSub = item.qty * item.rate;
            const lineTax = lineSub * item.taxPct / 100;
            return (
              <tr key={item.uid} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--border)', cursor: 'grab', userSelect: 'none', verticalAlign: 'middle' }}>⋮⋮</td>
                <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--ink3)', textAlign: 'center', verticalAlign: 'middle' }}>{i + 1}</td>
                <td style={{ padding: '6px 4px' }}><input value={item.name} onChange={e => update(item.uid, 'name', e.target.value)} placeholder="Item name" style={{ ...inpS, fontWeight: 600 }} /></td>
                <td style={{ padding: '6px 4px' }}>
                  <select title="Unit type" value={item.unit} onChange={e => update(item.uid, 'unit', e.target.value)} style={{ ...inpS, cursor: 'pointer' }}>
                    {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
                    {!UNIT_OPTIONS.includes(item.unit) && <option>{item.unit}</option>}
                  </select>
                </td>
                <td style={{ padding: '6px 4px' }}><input type="number" min={0} value={item.rate || ''} onChange={e => update(item.uid, 'rate', parseFloat(e.target.value) || 0)} placeholder="0" style={{ ...inpS, textAlign: 'right', fontFamily: 'var(--mono)' }} /></td>
                <td style={{ padding: '6px 4px' }}><input type="number" min={1} value={item.qty} onChange={e => update(item.uid, 'qty', Math.max(1, parseInt(e.target.value) || 1))} style={{ ...inpS, textAlign: 'right' }} /></td>
                <td style={{ padding: '6px 4px' }}>
                  <select title="VAT rate" value={item.taxPct} onChange={e => update(item.uid, 'taxPct', parseInt(e.target.value))} style={{ ...inpS, cursor: 'pointer' }}>
                    <option value={0}>0%</option>
                    <option value={18}>18%</option>
                  </select>
                </td>
                <td style={{ padding: '6px 10px 6px 4px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  {(lineSub + lineTax) > 0 ? fmt(lineSub + lineTax) : '—'}
                </td>
                <td style={{ padding: '6px 4px', verticalAlign: 'middle' }}>
                  {items.length > 0 && (
                    <button type="button" onClick={() => remove(item.uid)}
                      style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
              <button type="button" onClick={add}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', border: `1px dashed ${color}`, borderRadius: 6, background: 'none', color, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--teal-l)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                <Icon name="plus" size={12} color={color} /> Add Line Item
              </button>
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
export function InvoiceEditor({ initial, nextId, onSave, onCancel, isMobile = false }: {
  initial: Invoice | null; nextId: string;
  onSave: (inv: Invoice) => void; onCancel: () => void; isMobile?: boolean;
}) {
  const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
  const [client, setClient]       = useState(initial?.client ?? '');
  const [addr, setAddr]           = useState(initial?.clientAddress.join('\n') ?? '');
  const [billDate, setBillDate]   = useState(initial?.billDate ?? today);
  const [dueDate, setDueDate]     = useState(initial?.dueDate ?? '');
  const [agent, setAgent]         = useState(initial?.saleAgent ?? '');
  const [blNo, setBlNo]           = useState(initial?.blNumber ?? '');
  const [origin, setOrigin]       = useState(initial?.origin ?? '');
  const [dest, setDest]           = useState(initial?.destination ?? '');
  const [mode, setMode]           = useState<Invoice['mode']>(initial?.mode ?? 'SEA');
  const [exRate, setExRate]       = useState(String(initial?.exchangeRate ?? 2650));
  const [terms, setTerms]         = useState(initial?.terms ?? 'Payment due within 14 days. All 3rd party charges are estimates and subject to actuals.');

  const toEditItems = (g: ChargeGroup) =>
    (initial?.items.filter(i => i.group === g) ?? []).map((it, i) => ({ ...it, uid: `${g}-${i}` }));

  const [clearing, setClearing] = useState<EditItem[]>(toEditItems('clearing'));
  const [shipping, setShipping] = useState<EditItem[]>(toEditItems('shipping'));
  const [other, setOther]       = useState<EditItem[]>(toEditItems('other'));

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)', overflow: 'hidden', minWidth: 0 }}>
      {/* Header */}
      <div style={{ padding: '11px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', flex: 1 }}>{initial ? `Edit ${initial.id}` : 'Create New Invoice'}</span>
        <button type="button" onClick={onCancel} style={tbBtn}>Cancel</button>
        <button type="button" onClick={() => handleSave(true)} style={{ ...tbBtn, borderColor: 'var(--teal)', color: 'var(--teal)', background: 'var(--teal-l)' }}>Save Draft</button>
        <button type="button" onClick={() => handleSave(false)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          <Icon name="send" size={13} color="#fff" /> Save &amp; Send
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '20px 28px' }}>
        {/* Top grid */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '12px 20px', marginBottom: 18 }}>
          <FormField label="Invoice #" value={invId} disabled />
          <FormField label="Client / Company" value={client} onChange={setClient} placeholder="Client name" />
          <FormField label="Sale Agent" value={agent} onChange={setAgent} placeholder="Agent name" />
          <FormField label="Invoice Date" value={billDate} onChange={setBillDate} placeholder="DD-MM-YYYY" />
          <FormField label="Due Date (optional)" value={dueDate} onChange={setDueDate} placeholder="DD-MM-YYYY" />
          <FormField label="Exchange Rate (TZS/USD)" value={exRate} onChange={setExRate} placeholder="2650" mono />
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
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 120px', gap: '10px 16px' }}>
            <FormField label="BL / AWB Number" value={blNo} onChange={setBlNo} placeholder="e.g. MSCU2456789" />
            <FormField label="Origin" value={origin} onChange={setOrigin} placeholder="e.g. SINGAPORE" />
            <FormField label="Destination" value={dest} onChange={setDest} placeholder="e.g. DAR ES SALAAM" />
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Mode</label>
              <select title="Transport mode" value={mode} onChange={e => setMode(e.target.value as Invoice['mode'])}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--font)', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' as const }}>
                <option value="SEA">SEA</option>
                <option value="AIR">AIR</option>
                <option value="ROAD">ROAD</option>
              </select>
            </div>
          </div>
        </div>

        {/* Three charge sections */}
        <ChargeSectionEditor title="Clearing Charges — Paid in TZS" color="#0d9488" group="clearing" currency="TZS" items={clearing} onChange={setClearing} />
        <ChargeSectionEditor title="Shipping Line Charges — Paid in USD" color="#2563eb" group="shipping" currency="USD" items={shipping} onChange={setShipping} />
        <ChargeSectionEditor title="Other Charges — Paid in TZS" color="#7c3aed" group="other" currency="TZS" items={other} onChange={setOther} />

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
      </div>
    </div>
  );
}

/* ── Invoice detail panel ── */
type DetailTab = 'invoice' | 'tasks' | 'activity' | 'reminders' | 'notes';

export interface DetailPanelProps {
  inv: Invoice;
  onClose: () => void; onEdit: () => void; onCopy: () => void;
  onDelete: () => void; onRecordPayment: (amount: number, method: string, date: string) => void;
  onUpdate?: (inv: Invoice) => void;
}

function auditEntry(action: string): InvAuditEntry {
  return { id: `al-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, ts: new Date().toLocaleString('en-GB'), action };
}
function withAudit(inv: Invoice, action: string): Invoice {
  return { ...inv, auditLog: [auditEntry(action), ...(inv.auditLog ?? [])] };
}

export function InvoiceDetailPanel({ inv, onClose, onEdit, onCopy, onDelete, onRecordPayment, onUpdate, isMobile = false }: DetailPanelProps & { isMobile?: boolean }) {
  const { fmt } = useCurrency();
  const [co, setCo] = useState(getCompany);
  useEffect(() => subscribeCompany(() => setCo(getCompany())), []);
  const [tab, setTab]                 = useState<DetailTab>('invoice');
  const [showMore, setShowMore]       = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
  const [payAmt, setPayAmt]     = useState('');
  const [payDate, setPayDate]   = useState(today);
  const [payMethod, setPayMethod] = useState('Bank Transfer');

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

  function update(updated: Invoice) { onUpdate?.(updated); }

  function addNote() {
    if (!newNote.trim()) return;
    const note: InvNote = { id: `n-${Date.now()}`, ts: new Date().toLocaleString('en-GB'), text: newNote.trim() };
    update(withAudit({ ...inv, notes: [note, ...(inv.notes ?? [])] }, 'Note added'));
    setNewNote('');
  }
  function deleteNote(id: string) {
    update(withAudit({ ...inv, notes: (inv.notes ?? []).filter(n => n.id !== id) }, 'Note deleted'));
  }

  function addTask() {
    if (!newTaskDesc.trim()) return;
    const task: InvTask = { id: `t-${Date.now()}`, desc: newTaskDesc.trim(), assignee: newTaskAssignee.trim(), dueDate: newTaskDue || undefined, done: false, ts: new Date().toLocaleString('en-GB') };
    update(withAudit({ ...inv, tasks: [...(inv.tasks ?? []), task] }, `Task added: ${task.desc}`));
    setNewTaskDesc(''); setNewTaskAssignee(''); setNewTaskDue(''); setShowTaskForm(false);
  }
  function toggleTask(id: string) {
    const tasks = (inv.tasks ?? []).map(t => t.id === id ? { ...t, done: !t.done } : t);
    const done = tasks.find(t => t.id === id)?.done;
    update(withAudit({ ...inv, tasks }, `Task marked ${done ? 'complete' : 'incomplete'}`));
  }
  function deleteTask(id: string) {
    update(withAudit({ ...inv, tasks: (inv.tasks ?? []).filter(t => t.id !== id) }, 'Task deleted'));
  }

  function addReminder() {
    if (!newRemDate || !newRemMsg.trim()) return;
    const rem: InvReminder = { id: `r-${Date.now()}`, date: newRemDate, msg: newRemMsg.trim(), done: false };
    update(withAudit({ ...inv, reminders: [...(inv.reminders ?? []), rem] }, `Reminder set for ${newRemDate}`) );
    setNewRemDate(''); setNewRemMsg(''); setShowRemForm(false);
  }
  function toggleReminder(id: string) {
    update({ ...inv, reminders: (inv.reminders ?? []).map(r => r.id === id ? { ...r, done: !r.done } : r) });
  }
  function deleteReminder(id: string) {
    update(withAudit({ ...inv, reminders: (inv.reminders ?? []).filter(r => r.id !== id) }, 'Reminder deleted'));
  }

  function sendEmail() {
    const T = invoiceTotals(inv);
    const body = encodeURIComponent(
      `Dear ${inv.client},\n\nPlease find attached Invoice ${inv.id} for ${fmtTZS(T.grandTotalTZS)}.\n\nBL/AWB: ${inv.blNumber}\nDue Date: ${inv.dueDate ?? 'Upon receipt'}\n\nKind regards,\n${co.name}`
    );
    window.open(`mailto:?subject=Invoice ${inv.id} – ${inv.client}&body=${body}`, '_blank');
    update(withAudit(inv, 'Email composed'));
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

  const TABS: { id: DetailTab; label: string }[] = [
    { id: 'invoice', label: 'Invoice' }, { id: 'tasks', label: 'Tasks' },
    { id: 'activity', label: 'Activity Log' }, { id: 'reminders', label: 'Reminders' }, { id: 'notes', label: 'Notes' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)', overflow: 'hidden', minWidth: 0 }}
      onClick={() => showMore && setShowMore(false)}>

      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '0 16px', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            style={{ padding: '11px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', color: tab === t.id ? 'var(--ink)' : 'var(--ink3)', borderBottom: tab === t.id ? '2px solid var(--ink)' : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {(['mail', 'eye', 'maximize'] as const).map((icon, i) => (
          <button key={icon} type="button"
            title={i === 0 ? 'Send email' : i === 1 ? 'View / Print' : 'Export PDF'}
            onClick={() => i === 0 ? (window.location.href = `mailto:?subject=${inv.id}`) : openPrintWindow(inv)}
            style={{ width: 32, height: 32, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <Icon name={icon} size={15} color="var(--ink3)" />
          </button>
        ))}
        <button type="button" onClick={onClose}
          style={{ width: 32, height: 32, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--red-l)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
          <Icon name="x" size={15} color="var(--ink3)" />
        </button>
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onEdit} style={tbBtn} title="Edit"><Icon name="edit" size={13} color="var(--ink2)" /></button>
        <button type="button" onClick={onCopy} style={tbBtn} title="Duplicate"><Icon name="copy" size={13} color="var(--ink2)" /></button>
        <div className="billing-more-wrap">
          <button type="button" onClick={e => { e.stopPropagation(); setShowMore(v => !v); }} style={tbBtn}>More <Icon name="chevronDown" size={10} color="var(--ink3)" /></button>
          {showMore && (
            <div onClick={e => e.stopPropagation()} className="billing-more-menu">
              <MoreItem icon="mail"        label="Send by Email" onClick={() => { sendEmail(); setShowMore(false); }} />
              <MoreItem icon="eye"         label="View / Print"  onClick={() => { openPrintWindow(inv); setShowMore(false); }} />
              <MoreItem icon="fileText"    label="Export PDF"    onClick={() => { openPrintWindow(inv); update(withAudit(inv, 'PDF exported')); setShowMore(false); }} />
              <div className="billing-more-sep" />
              <MoreItem icon="clipboard"   label="Add Note"      onClick={() => { setShowMore(false); setTab('notes');     }} />
              <MoreItem icon="bell"        label="Add Reminder"  onClick={() => { setShowMore(false); setTab('reminders'); setShowRemForm(true); }} />
              <MoreItem icon="checkCircle" label="Assign Task"   onClick={() => { setShowMore(false); setTab('tasks');     setShowTaskForm(true); }} />
              <MoreItem icon="activity"    label="Audit Log"     onClick={() => { setShowMore(false); setTab('activity');  }} />
              <div className="billing-more-sep" />
              <MoreItem icon="trash" label="Delete Invoice" onClick={() => { setShowMore(false); onDelete(); }} danger />
            </div>
          )}
        </div>
        <button type="button" onClick={() => { setShowPayment(v => !v); setPayAmt(String(Math.round(due))); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 9, border: 'none', background: showPayment ? '#15803d' : '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
          <Icon name="dollarSign" size={13} color="#fff" /> Payment
        </button>
      </div>

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
              <select title="Payment method" value={payMethod} onChange={e => setPayMethod(e.target.value)}
                style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--font)', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' as const }}>
                {['Bank Transfer', 'Cash', 'Cheque', 'Mobile Money'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 8 }}>Outstanding: <strong style={{ color: due > 0 ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--mono)' }}>{fmt(due, 'TZS')}</strong></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={submitPayment} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>Save Payment</button>
            <button type="button" onClick={() => setShowPayment(false)} style={tbBtn}>Cancel</button>
          </div>
        </div>
      )}

      {/* Tab content */}
      {tab === 'invoice' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', fontFamily: 'var(--font)' }}>

          {/* Header: from company ← QR code → bill-to */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
            {/* From */}
            <div>
              <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink3)', marginBottom: 4 }}>From</div>
              {co.logoUrl
                ? <img src={co.logoUrl} alt={co.name} style={{ height: 40, maxWidth: 140, objectFit: 'contain', marginBottom: 8, display: 'block' }} />
                : <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>{co.name}</div>
              }
              <div style={{ fontSize: 11, color: 'var(--ink2)', lineHeight: 1.8 }}>
                {co.address}<br />{co.city}, {co.country}<br />VAT: {co.taxId}
              </div>
            </div>

            {/* QR Code — center */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--bg)', alignSelf: 'flex-start', minWidth: 116 }}>
              <QRCodeSVG value={qrData} size={88} level="M" />
              <div style={{ fontSize: 9, color: 'var(--ink3)', textAlign: 'center', lineHeight: 1.4 }}>
                <div style={{ fontWeight: 700 }}>Ref: {inv.refCode}</div>
                <div>v{inv.version}</div>
              </div>
            </div>

            {/* Bill To */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink3)', marginBottom: 4 }}>Bill To</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', marginBottom: 4 }}>{inv.client}</div>
              <div style={{ fontSize: 11, color: 'var(--ink2)', lineHeight: 1.8, marginBottom: 12 }}>
                {inv.clientAddress.map((l, i) => <React.Fragment key={i}>{l}{i < inv.clientAddress.length - 1 && <br />}</React.Fragment>)}
              </div>
              <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink3)', marginBottom: 4 }}>Invoice Details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--teal)', color: '#fff', borderRadius: 9, padding: '12px 16px', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>TOTAL</span>
                <span style={{ fontSize: 15, fontWeight: 900, fontFamily: 'var(--mono)' }}>{fmt(T.grandTotalTZS, 'TZS')}</span>
              </div>
              {inv.received > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#16a34a', marginBottom: 4, paddingLeft: 4 }}>
                  <span>Less: Received</span><span style={{ fontFamily: 'var(--mono)' }}>({fmt(inv.received, 'TZS')})</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, color: due > 0 ? 'var(--red)' : '#16a34a', borderTop: '2px solid var(--border)', paddingTop: 8 }}>
                <span>Amount Due</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{fmt(Math.max(0, due), 'TZS')}</span>
              </div>
            </div>
          </div>

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
            {(inv.notes ?? []).length === 0 && <div className="inv-tab-empty">No notes yet.</div>}
            {(inv.notes ?? []).map(n => (
              <div key={n.id} className="inv-note-item">
                <div className="inv-note-meta">{n.ts}</div>
                <div className="inv-note-text">{n.text}</div>
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
                <input className="inv-tab-input" type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)} title="Due date" />
              </div>
              <div className="inv-tab-compose-foot">
                <button type="button" className="inv-tab-cancel" onClick={() => setShowTaskForm(false)}>Cancel</button>
                <button type="button" className="inv-tab-submit" onClick={addTask} disabled={!newTaskDesc.trim()}>Add Task</button>
              </div>
            </div>
          ) : (
            <div className="inv-tab-toolbar">
              <button type="button" className="inv-tab-submit" onClick={() => setShowTaskForm(true)}>
                <Icon name="plus" size={13} color="#fff" /> New Task
              </button>
            </div>
          )}
          <div className="inv-tab-list">
            {(inv.tasks ?? []).length === 0 && <div className="inv-tab-empty">No tasks yet.</div>}
            {(inv.tasks ?? []).map(t => (
              <div key={t.id} className={`inv-task-item${t.done ? ' inv-task-item--done' : ''}`}>
                <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} className="inv-task-check" title="Toggle task" />
                <div className="inv-task-body">
                  <span className="inv-task-desc">{t.desc}</span>
                  {t.assignee && <span className="inv-task-assignee">→ {t.assignee}</span>}
                  {t.dueDate  && <span className="inv-task-due">Due {t.dueDate}</span>}
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
                <input className="inv-tab-input" type="date" value={newRemDate} onChange={e => setNewRemDate(e.target.value)} title="Reminder date" />
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
                <Icon name="plus" size={13} color="#fff" /> New Reminder
              </button>
            </div>
          )}
          <div className="inv-tab-list">
            {(inv.reminders ?? []).length === 0 && <div className="inv-tab-empty">No reminders set.</div>}
            {(inv.reminders ?? []).sort((a, b) => a.date.localeCompare(b.date)).map(r => (
              <div key={r.id} className={`inv-task-item${r.done ? ' inv-task-item--done' : ''}`}>
                <input type="checkbox" checked={r.done} onChange={() => toggleReminder(r.id)} className="inv-task-check" title="Mark done" />
                <div className="inv-task-body">
                  <span className="inv-task-due">{r.date}</span>
                  <span className="inv-task-desc">{r.msg}</span>
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
            {(inv.auditLog ?? []).length === 0 && <div className="inv-tab-empty">No activity recorded yet.</div>}
            {(inv.auditLog ?? []).map(e => (
              <div key={e.id} className="inv-audit-item">
                <Icon name="activity" size={13} color="var(--teal)" />
                <div className="inv-audit-body">
                  <span className="inv-audit-action">{e.action}</span>
                  <span className="inv-audit-ts">{e.ts}</span>
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
  const navigate = useNavigate();
  const [invoices, setInvoices]         = useState<Invoice[]>(INITIAL_INVOICES);
  const [apiLoading, setApiLoading] = useState(false);
  const [selectedId, setSelectedId]     = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/v1/invoices')
      .then((data: any) => {
        if (Array.isArray(data) && data.length > 0) {
          setInvoices(data.map(mapApiInvoice));
        }
      })
      .catch(() => {});
  }, []);
  const [mode, setMode]                 = useState<PageMode>('list');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [search, setSearch]             = useState('');
  const [sortAsc, setSortAsc]           = useState(false);

  const selectedInvoice = selectedId ? (invoices.find(i => i.id === selectedId) ?? null) : null;
  const isSplit = mode !== 'list';

  const maxNumber = Math.max(...invoices.map(i => parseInt(i.id.match(/\d{4}/g)?.pop() || '0')), 0);
  const nextId = `CLR-2026-${String(maxNumber + 1).padStart(4, '0')} INV`;

  const filtered = invoices
    .filter(inv => filterStatus === 'all' || inv.status === filterStatus)
    .filter(inv => !search || [inv.client, inv.id, inv.blNumber].some(s => s.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => sortAsc ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id));

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

  function handleDeleteInvoice() {
    if (!selectedInvoice || !window.confirm(`Delete ${selectedInvoice.id}? This cannot be undone.`)) return;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Top bar */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '10px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={() => { setSelectedId(null); setMode('create'); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: 'none', background: '#111827', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          <Icon name="plus" size={13} color="#fff" /> Create New Invoice
        </button>
        <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          <Icon name="creditCard" size={13} color="var(--ink3)" /> Batch Payments
        </button>
        <button type="button" onClick={() => { setSearch(''); setFilterStatus('all'); }} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Reset filters">
          <Icon name="refresh" size={14} color="var(--ink3)" />
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          <Icon name="filter" size={13} color="var(--ink3)" /> Filters
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* List panel */}
        <div style={{ width: isSplit ? 420 : '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--white)', borderRight: isSplit ? '1px solid var(--border)' : 'none', transition: 'width 0.18s ease' }}>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
            {!isSplit && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(['all', 'Draft', 'Unpaid', 'Partial', 'Paid', 'Overdue', 'Credited'] as FilterStatus[]).map(s => {
                  const cnt = s === 'all' ? invoices.length : invoices.filter(i => i.status === s).length;
                  const active = filterStatus === s;
                  return (
                    <button key={s} type="button" onClick={() => setFilterStatus(s)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap', border: active ? '1.5px solid var(--teal)' : '1px solid var(--border)', background: active ? 'var(--teal-l)' : 'var(--bg)', color: active ? 'var(--teal)' : 'var(--ink2)' }}>
                      {s === 'all' ? 'All' : STATUS_STYLE[s as Status].label}
                      {cnt > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 9, background: active ? 'var(--teal)' : 'var(--border)', color: active ? '#fff' : 'var(--ink2)' }}>{cnt}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ flex: 1 }} />
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={13} color="var(--ink3)" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice, client, BL…"
                style={{ paddingLeft: 28, paddingRight: 8, paddingTop: 5, paddingBottom: 5, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12, fontFamily: 'var(--font)', width: isSplit ? 160 : 220, outline: 'none' }} />
            </div>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
            <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 5 }}>
                  <th style={{ ...thS, cursor: 'pointer' }} onClick={() => setSortAsc(v => !v)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>Invoice # <Icon name={sortAsc ? 'arrowUp' : 'arrowDown'} size={11} color="var(--ink3)" /></span>
                  </th>
                  {!isSplit && <th style={thS}>BL / AWB</th>}
                  <th style={thS}>Customer</th>
                  {!isSplit && <th style={thS}>Mode</th>}
                  <th style={{ ...thS, textAlign: 'right' }}>Total (TZS)</th>
                  <th style={thS}>Date</th>
                  {!isSplit && <th style={thS}>Due</th>}
                  <th style={thS}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv, i) => {
                  const isSelected = inv.id === selectedId;
                  const st = STATUS_STYLE[inv.status];
                  const total = invoiceTotal(inv);
                  return (
                    <tr key={inv.id}
                      onClick={() => { if (mode !== 'edit' && mode !== 'create') { setSelectedId(inv.id); setMode('view'); } }}
                      style={{ background: isSelected ? 'var(--teal-l)' : i % 2 === 0 ? 'var(--white)' : 'var(--bg)', borderBottom: '1px solid var(--border)', cursor: 'pointer', borderLeft: isSelected ? '3px solid var(--teal)' : '3px solid transparent' }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg)'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = i % 2 === 0 ? 'var(--white)' : 'var(--bg)'; }}>
                      <td style={tdS}><span style={{ color: 'var(--teal)', fontWeight: 600, fontFamily: 'var(--mono)', fontSize: 12 }}>{inv.id}</span></td>
                      {!isSplit && (
                        <td style={{ ...tdS, fontSize: 11.5 }}>
                          <button type="button"
                            onClick={e => { e.stopPropagation(); navigate(`/?search=${encodeURIComponent(inv.blNumber)}`); }}
                            title={`Open shipment ${inv.blNumber} in Ops Command`}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--blue)', fontWeight: 600, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>
                            {inv.blNumber}
                          </button>
                        </td>
                      )}
                      <td style={{ ...tdS, ...(isSplit ? { maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : {}) }}>
                        <button type="button"
                          onClick={e => { e.stopPropagation(); navigate(`/customers?search=${encodeURIComponent(inv.client)}`); }}
                          title={`View ${inv.client} profile`}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, color: 'var(--blue)', fontWeight: 600, textAlign: 'left', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>
                          {inv.client}
                        </button>
                      </td>
                      {!isSplit && <td style={{ ...tdS, fontSize: 11 }}><span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10.5, fontWeight: 700, background: inv.mode === 'SEA' ? '#dbeafe' : inv.mode === 'AIR' ? '#fce7f3' : '#dcfce7', color: inv.mode === 'SEA' ? '#1d4ed8' : inv.mode === 'AIR' ? '#be185d' : '#15803d' }}>{inv.mode}</span></td>}
                      <td style={{ ...tdS, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>{fmt(total, 'TZS')}</td>
                      <td style={{ ...tdS, color: 'var(--ink2)', whiteSpace: 'nowrap', fontSize: 12 }}>{inv.billDate}</td>
                      {!isSplit && <td style={{ ...tdS, color: inv.status === 'Overdue' ? 'var(--red)' : 'var(--ink2)', fontSize: 12, fontWeight: inv.status === 'Overdue' ? 700 : 400 }}>{inv.dueDate ?? '—'}</td>}
                      <td style={tdS}><span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>{st.label}</span></td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No invoices found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          {!isSplit && filtered.length > 0 && (
            <div style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '9px 14px', display: 'flex', gap: 24, flexShrink: 0, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{filtered.length} invoices</span>
              <span style={{ fontSize: 12, color: 'var(--ink2)' }}>Total: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{fmt(filtered.reduce((s, i) => s + invoiceTotal(i), 0), 'TZS')}</strong></span>
              <span style={{ fontSize: 12, color: 'var(--ink2)' }}>Received: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{fmt(filtered.reduce((s, i) => s + i.received, 0), 'TZS')}</strong></span>
              <span style={{ fontSize: 12, color: 'var(--ink2)' }}>Outstanding: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{fmt(filtered.reduce((s, i) => s + Math.max(0, invoiceTotal(i) - i.received), 0), 'TZS')}</strong></span>
            </div>
          )}
        </div>

        {/* Right panel */}
        {mode === 'view' && selectedInvoice && (
          <InvoiceDetailPanel inv={selectedInvoice} onClose={() => { setMode('list'); setSelectedId(null); }} onEdit={() => setMode('edit')} onCopy={handleCopyInvoice} onDelete={handleDeleteInvoice} onRecordPayment={handleRecordPayment} isMobile={isMobile} />
        )}
        {mode === 'edit' && selectedInvoice && (
          <InvoiceEditor initial={selectedInvoice} nextId={nextId} onSave={handleSaveInvoice} onCancel={() => setMode('view')} isMobile={isMobile} />
        )}
        {mode === 'create' && (
          <InvoiceEditor initial={null} nextId={nextId} onSave={handleSaveInvoice} onCancel={() => { setMode('list'); setSelectedId(null); }} isMobile={isMobile} />
        )}
      </div>
    </div>
  );
};

const thS: React.CSSProperties = { padding: '9px 12px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', letterSpacing: '0.02em', whiteSpace: 'nowrap' };
const tdS: React.CSSProperties = { padding: '11px 12px', verticalAlign: 'middle', fontSize: 13, color: 'var(--ink)' };
