import React, { useState, useEffect, useRef } from 'react';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch, apiDownload, apiViewBlob, apiFetchBlob } from '../lib/api.js';
import { HUDUMIKA_FOOTER_HTML } from '../lib/watermark.js';
import { useCompany, getCompany } from '../data/companyStore.js';
import { useAuth } from '../hooks/useAuth.js';
import { MGMT_ROLES } from '../lib/permissions.js';
import { useClockIn } from '../contexts/ClockInContext.js';
import { showAlert } from '../lib/alert.js';
import {
  getJob, updateJob, subscribe,
  STAGES, FLAG_CFG, CH_CFG, stageIdx, STAGE_API_MAP, API_STAGE_MAP, apiToJob,
  type ClearanceJob, type Stage, type Channel, type Flag,
  type ThreadMsg, type TimelineEvent, type ShipDoc, type LedgerEntry, type DocType,
  type InternalTask, type TimeEntry, type ActivityEvent, type TaskStatus, type Listener,
} from './clearanceData.js';
import { FlagChip, ChBadge } from '../components/ClearanceChips.js';
import { EMPLOYEES, empInitials, empAvatarColor } from '../data/staffData.js';
import type { Employee } from '../data/staffData.js';
import { CUSTOMER_MILESTONES, MILESTONE_LABELS, STAGE_TO_MILESTONE } from '@hudumika/types';
import type { CustomerMilestone, ClearanceStage } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { Badge } from '../components/ui/badge.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover.js';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../components/ui/hover-card.js';

// ─── Clock-in gate ───────────────────────────────────────────────────────────

function clockGate(isStaff: boolean, isCheckedIn: boolean, triggerOpen: () => void): boolean {
  if (!isStaff) return true;
  if (!isCheckedIn) { triggerOpen(); return false; }
  return true;
}

// ─── Store hook ───────────────────────────────────────────────────────────────

function useJob(id: string) {
  const [job, setJob] = useState(() => getJob(id));
  useEffect(() => subscribe(() => setJob(getJob(id))), [id]);
  return job;
}

// toStage / apiToJob now live in clearanceData.ts, beside the ClearanceJob
// type and the store that loads them, so the list and the detail screen map
// a shipment the same way.

// shipment_tasks.status (008_shipment_tasks_time_entries.sql) uses a
// different vocabulary ('open'/'blocked') than the frontend's TaskStatus
// ('not_started'/'awaiting_feedback') — map explicitly rather than passing
// the raw value through, which would silently fall out of every status
// filter bucket (TASK_STATUS_CFG has no 'open'/'blocked' entry).
function apiTaskToInternal(t: any): InternalTask {
  const statusMap: Record<string, TaskStatus> = {
    open: 'not_started', in_progress: 'in_progress', complete: 'complete', blocked: 'awaiting_feedback',
  };
  return {
    id: String(t.id),
    title: t.title,
    status: statusMap[t.status] || 'not_started',
    priority: (t.priority || 'medium') as InternalTask['priority'],
    assignees: t.assigned_to ? [friendlyAssignee(String(t.assigned_to))] : [],
    startDate: new Date(t.created_at || Date.now()),
    dueDate: t.due_date ? new Date(t.due_date) : new Date(Date.now() + 7 * 86400000),
    tags: [],
    description: t.note || undefined,
    productId: t.product_id || undefined,
    serviceName: t.service_name || undefined,
    serviceRate: t.service_rate != null ? Number(t.service_rate) : undefined,
    serviceCurrency: t.service_currency || undefined,
    serviceUnit: t.service_unit || undefined,
  };
}

// shipment_time_entries has no separate id/name split for member or task —
// just `member` and `task_ref` strings — so memberId/taskId reuse those
// same strings rather than fabricating separate identifiers.
function apiTimeEntryToInternal(t: any): TimeEntry {
  const hours = Number(t.hours) || 0;
  return {
    id: String(t.id),
    memberId: t.member || '', memberName: t.member || 'Unknown',
    taskId: t.task_ref || '', taskTitle: t.task_ref || 'General',
    duration: `${Math.floor(hours)}:${String(Math.round((hours % 1) * 60)).padStart(2, '0')}:00`,
    hours, date: new Date(t.log_date || t.created_at || Date.now()),
    billable: true, note: t.note || undefined,
    productId: t.product_id || undefined,
    serviceName: t.service_name || undefined,
    serviceRate: t.service_rate != null ? Number(t.service_rate) : undefined,
    serviceCurrency: t.service_currency || undefined,
    serviceUnit: t.service_unit || undefined,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fdate(d: Date) { return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function ftime(d: Date) { return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
function fdatetime(d: Date) { return `${fdate(d)}, ${ftime(d)}`; }
function fmtTZS(n: number) { return 'TZS ' + n.toLocaleString('en'); }
function fmtServiceRate(amount: number, currency: string) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString('en')}`; }
}
function avatarBg(name: string) {
  const c = ['#e8461a', '#2563eb', '#059669', '#7c3aed', '#ca8a04', '#0891b2'];
  let h = 0; for (const ch of (name ?? '')) h = (h * 31 + ch.charCodeAt(0)) % c.length;
  return c[Math.abs(h)];
}
function initials(name: string) { return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase(); }
function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s); }
function friendlyAssignee(a: string) {
  if (isUUID(a)) return `Agent …${a.slice(-4).toUpperCase()}`;
  return a;
}
function docIcon(type: string): IconName {
  const m: Record<string, IconName> = {
    invoice: 'invoice', bl: 'ship', assessment: 'clipboard', release_order: 'checkCircle',
    delivery_order: 'package', icd_invoice: 'receipt', tphpa: 'shield',
    receipt: 'receipt', permit: 'file', packing_list: 'clipboardList', other: 'file',
  };
  return m[type] || 'file';
}

/* ── Shipment report — printable summary window, mirrors Billing.tsx's openPrintWindow ── */
function openShipmentReportWindow(job: ClearanceJob) {
  const co = getCompany();
  const stageLabel = STAGES.find(s => s.id === job.stage)?.label || job.stage;
  const genDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const timelineRows = job.timeline.map(t => `
    <tr><td>${new Date(t.ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
    <td>${t.label}</td><td>${t.note || ''}</td></tr>`).join('');

  const docRows = job.documents.map(d => `
    <tr><td>${d.name}</td><td>${d.type.toUpperCase()}</td><td>${d.extracted?.status || 'pending'}</td></tr>`).join('');

  const co2Kg = job.co2EmissionsKg;
  const credits = job.carbonCreditsSaved;
  const calc = job.co2CalcDetails;

  const carbonSection = co2Kg != null ? `
    <div class="section">
      <div class="sec-hdr">Carbon Footprint (Estimate)</div>
      <div class="carbon-box">
        <div><span class="cl">CO₂ Emissions</span><strong>${Number(co2Kg).toLocaleString('en')} kg</strong></div>
        <div><span class="cl">Credits Saved (est.)</span><strong style="color:#059669">${Number(credits ?? 0).toFixed(2)}</strong></div>
        ${calc ? `<div><span class="cl">Distance</span><strong>${calc.distance_km ?? '—'} km</strong></div>` : ''}
        ${calc ? `<div><span class="cl">Mode</span><strong>${calc.mode ?? job.mode}</strong></div>` : ''}
      </div>
      <p class="disclosure">GLEC v3.2 / ISO 14083 methodology, computed from route distance and cargo weight. Internal ESG estimate — not a registry-issued or tradeable carbon credit.</p>
    </div>` : '';

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${job.sysRef || job.id} — Shipment Report</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;color:#111;padding:24px 32px;font-size:11px}
.top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #e5e7eb}
.from strong{color:#111;font-size:14px}
.from{line-height:1.6;color:#555}
.title{font-size:18px;font-weight:900;color:#0b1e3a;margin-bottom:4px}
.meta{text-align:right;color:#6b7280}
.section{margin-bottom:16px}
.sec-hdr{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#374151;padding:5px 8px;background:#f3f4f6;border-left:3px solid #0b1e3a;margin-bottom:8px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;padding:8px 10px;background:#f9fafb;border-radius:6px;font-size:10.5px}
.grid strong{color:#374151}
table{width:100%;border-collapse:collapse;margin-top:4px}
thead tr{background:#f9fafb;border-bottom:1px solid #e5e7eb}
th{padding:5px 8px;text-align:left;font-size:9px;font-weight:700;color:#6b7280;letter-spacing:.04em}
td{padding:5px 8px;border-bottom:1px solid #f3f4f6;font-size:10.5px}
.carbon-box{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:12px;background:#ecfdf5;border-radius:6px;border:1px solid #a7f3d0}
.carbon-box .cl{display:block;font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
.disclosure{font-size:9px;color:#9ca3af;margin-top:6px;font-style:italic}
.footer{margin-top:24px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:9px;color:#9ca3af;text-align:center}
@media print{body{padding:10px 16px}}
</style></head><body>
<div class="top">
  <div class="from">
    ${co.logoUrl ? `<img src="${co.logoUrl}" style="max-height:36px;max-width:140px;object-fit:contain;margin-bottom:4px" alt="${co.name}">` : `<strong>${co.name}</strong>`}
    <br>${co.address}<br>${co.city}, ${co.country}
  </div>
  <div class="meta">
    <div class="title">Shipment Report</div>
    <div>${job.sysRef || job.id}</div>
    <div>Generated ${genDate}</div>
  </div>
</div>

<div class="section">
  <div class="sec-hdr">Shipment Overview</div>
  <div class="grid">
    <div><strong>Goods:</strong> ${job.title}</div>
    <div><strong>Customer:</strong> ${job.customer}</div>
    <div><strong>Stage:</strong> ${stageLabel}</div>
    <div><strong>Mode:</strong> ${job.mode}</div>
    <div><strong>Origin:</strong> ${job.origin}</div>
    <div><strong>Destination:</strong> ${job.destination}</div>
    ${job.bl ? `<div><strong>B/L:</strong> ${job.bl}</div>` : ''}
    ${job.vessel ? `<div><strong>Vessel:</strong> ${job.vessel}</div>` : ''}
    ${job.weight ? `<div><strong>Weight:</strong> ${job.weight}</div>` : ''}
    ${job.invoiceValue ? `<div><strong>Value:</strong> ${job.invoiceValue}</div>` : ''}
    ${job.tansad ? `<div><strong>TANSAD:</strong> ${job.tansad}</div>` : ''}
    ${job.containers && job.containers.length > 0 ? `<div><strong>Containers:</strong> ${job.containers.join(', ')}</div>` : ''}
  </div>
</div>

${carbonSection}

${job.timeline.length > 0 ? `
<div class="section">
  <div class="sec-hdr">Stage Timeline</div>
  <table><thead><tr><th>Date</th><th>Stage</th><th>Note</th></tr></thead>
  <tbody>${timelineRows}</tbody></table>
</div>` : ''}

${job.documents.length > 0 ? `
<div class="section">
  <div class="sec-hdr">Documents</div>
  <table><thead><tr><th>Document</th><th>Type</th><th>Status</th></tr></thead>
  <tbody>${docRows}</tbody></table>
</div>` : ''}

${HUDUMIKA_FOOTER_HTML}
<script>window.onload=function(){window.print()}</script>
</body></html>`;

  const win = window.open('', '_blank', 'width=860,height=1000');
  if (win) { win.document.write(html); win.document.close(); }
}

function Av({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: avatarBg(name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, flexShrink: 0, fontFamily: 'var(--font)' }}>
      {initials(name)}
    </div>
  );
}

// ─── TANCIS Form helpers ──────────────────────────────────────────────────────

interface DeclGeneral {
  tansad_prefix: string; tansad_year: string; tansad_seq: string;
  ref_number: string; mode: string; tansad_date: string; clearing_office: string;
  cl_plan: string; form_type: string; items_count: string; packages_total: string;
  package_type: string; gross_weight: string; net_weight: string; ucr_no: string;
}
interface DeclParty { tin: string; name: string; address: string; country: string; }
interface DeclParties {
  consignment_country: string; trading_country: string;
  country_export: string; country_destination: string;
  exporter: DeclParty; importer: DeclParty; declarant: DeclParty;
}
interface DeclFinancial {
  delivery_term: string; delivery_place: string; invoice_no: string; invoice_date: string;
  invoice_value_usd: string; customs_value_tzs: string; payment_method: string; payment_bank: string;
  freight_usd: string; insurance_usd: string; other_charges_usd: string; deductions_usd: string;
  self_assessment: boolean; exchange_rate: string;
  duty_rate: string; vat_rate: string; excise_rate: string;
  total_imp_duty_tzs: string; total_vat_tzs: string;
}
interface DeclTransport {
  transport_mode: string; arrival_date: string; crn: string; bl_no: string; tansad_no: string; vessel_name: string;
  partial_bl: boolean; shipment_place: string; discharge_place: string; discharge_date: string;
  entry_office: string; location_goods: string; container_count: string; warehouse: string; period_days: string;
}
interface HsLine { hs: string; desc: string; origin: string; qty: string; unit: string; gross_wt: string; net_wt: string; cif_usd: string; customs_value_tzs: string; imp_duty_tzs: string; vat_tzs: string; duty_rate: string; }

const emptyParty = (): DeclParty => ({ tin: '', name: '', address: '', country: 'TZ' });
const emptyGeneral = (job?: ClearanceJob): DeclGeneral => {
  const parts = job?.tansad ? job.tansad.split('-') : [];
  return {
    tansad_prefix: parts[0] || 'TZDL', tansad_year: parts[1] || String(new Date().getFullYear()).slice(-2),
    tansad_seq: parts[2] || '', ref_number: job?.bl || '', mode: 'IM4',
    tansad_date: '', clearing_office: 'TZDL', cl_plan: 'PAO', form_type: 'G',
    items_count: '1', packages_total: '', package_type: 'PK',
    gross_weight: job?.weight?.replace(/[^0-9.]/g, '') || '', net_weight: '', ucr_no: '',
  };
};
const emptyFinancial = (job?: ClearanceJob): DeclFinancial => ({
  delivery_term: 'CIF', delivery_place: job?.destination || 'Dar es Salaam',
  invoice_no: '', invoice_date: '',
  invoice_value_usd: job?.invoiceValue?.replace(/[^0-9.]/g, '') || '', customs_value_tzs: '',
  payment_method: 'T', payment_bank: '', freight_usd: '', insurance_usd: '',
  other_charges_usd: '0', deductions_usd: '0', self_assessment: true,
  exchange_rate: '2560', duty_rate: '25', vat_rate: '18', excise_rate: '0',
  total_imp_duty_tzs: '', total_vat_tzs: '',
});
const emptyTransport = (job?: ClearanceJob): DeclTransport => ({
  transport_mode: 'S', arrival_date: '', crn: '', bl_no: job?.bl || '', tansad_no: job?.tansad || '', vessel_name: job?.vessel || '',
  partial_bl: false, shipment_place: job?.origin || '', discharge_place: job?.destination || 'Dar es Salaam',
  discharge_date: '', entry_office: 'TZDL', location_goods: '', container_count: '0', warehouse: '', period_days: '',
});
const emptyHsLine = (): HsLine => ({ hs: '', desc: '', origin: 'CN', qty: '', unit: 'KGS', gross_wt: '', net_wt: '', cif_usd: '', customs_value_tzs: '', imp_duty_tzs: '', vat_tzs: '', duty_rate: '25' });

// Maps this tab's local form state onto the real `declarations`/
// `declaration_items` table columns (migration 004_declarations.sql).
// Rate/percentage/total-tax fields (duty_rate, vat_rate, total_imp_duty_tzs,
// etc.) have no column on either table — official assessment totals are
// recorded via the separate Notices flow once TRA responds, not by this
// quick-entry tab — so they're intentionally left out of the payload rather
// than written somewhere they'd silently never be read back.
function buildDeclarationPayload(general: DeclGeneral, parties: DeclParties, financial: DeclFinancial, transport: DeclTransport, items: HsLine[]) {
  const tansad = `${general.tansad_prefix}-${general.tansad_year}-${general.tansad_seq}`;
  const toDate = (s: string) => (s ? new Date(s) : null);
  return {
    tancis_ref: general.ref_number || tansad,
    tansad_number: tansad || null,
    declaration_mode: 'NORMAL',
    tansad_form_type: general.form_type || 'G',
    clearing_office: general.clearing_office || 'TZDL',
    reference_date: toDate(general.tansad_date) || new Date(),
    cl_plan: general.cl_plan || null,
    total_packages: Number(general.packages_total) || 0,
    package_type: general.package_type || null,
    gross_weight_kg: Number(general.gross_weight) || 0,
    net_weight_kg: Number(general.net_weight) || 0,
    ucr_number: general.ucr_no || null,
    consignment_country: parties.consignment_country || 'CN',
    country_of_export: parties.country_export || 'CN',
    trading_country: parties.trading_country || null,
    country_of_destination: parties.country_destination || 'TZ',
    exporter_tin: parties.exporter.tin || null,
    exporter_name: parties.exporter.name || null,
    exporter_address: parties.exporter.address || null,
    importer_tin: parties.importer.tin || '',
    importer_name: parties.importer.name || '',
    importer_address: parties.importer.address || null,
    declarant_tin: parties.declarant.tin || '',
    declarant_name: parties.declarant.name || '',
    declarant_address: parties.declarant.address || null,
    delivery_term: financial.delivery_term || null,
    delivery_place: financial.delivery_place || null,
    invoice_number: financial.invoice_no || null,
    invoice_date: toDate(financial.invoice_date),
    total_invoice_value: Number(financial.invoice_value_usd) || 0,
    invoice_currency: 'USD',
    exchange_rate: Number(financial.exchange_rate) || 1,
    payment_method: financial.payment_method || null,
    payment_bank: financial.payment_bank || null,
    freight_amount: Number(financial.freight_usd) || 0,
    freight_currency: 'USD',
    insurance_amount: Number(financial.insurance_usd) || 0,
    insurance_currency: 'USD',
    other_charges: Number(financial.other_charges_usd) || 0,
    other_charges_currency: 'USD',
    deductions: Number(financial.deductions_usd) || 0,
    deductions_currency: 'USD',
    total_customs_value: Number(financial.customs_value_tzs) || 0,
    self_assessment: !!financial.self_assessment,
    transport_mode: transport.transport_mode || null,
    arrival_date: toDate(transport.arrival_date),
    crn: transport.crn || null,
    bl_number: transport.bl_no || null,
    vessel_name: transport.vessel_name || null,
    shipment_place: transport.shipment_place || null,
    discharge_place: transport.discharge_place || null,
    discharge_date: toDate(transport.discharge_date),
    entry_office: transport.entry_office || null,
    location_of_goods: transport.location_goods || null,
    total_container_count: transport.container_count ? Number(transport.container_count) : null,
    warehouse: transport.warehouse || null,
    period_days: transport.period_days ? Number(transport.period_days) : null,
    items: items.filter(it => it.hs.trim()).map(it => ({
      hs_code: it.hs,
      commodity_description: it.desc || null,
      country_of_origin: it.origin || 'TZ',
      cpc_code: general.mode || 'IM4',
      quantity: Number(it.qty) || 0,
      unit_of_measure: it.unit || 'PC',
      gross_weight_kg: Number(it.gross_wt) || 0,
      net_weight_kg: Number(it.net_wt) || 0,
      customs_value: Number(it.customs_value_tzs) || 0,
    })),
  };
}

// Reverse of buildDeclarationPayload — hydrates local form state from a
// previously-saved declaration so re-opening this tab doesn't show blank
// fields for data that actually was persisted.
function applyDeclarationResponse(decl: any, job: ClearanceJob): { general: DeclGeneral; parties: DeclParties; financial: DeclFinancial; transport: DeclTransport; items: HsLine[] } {
  const tansadParts = (decl.tansad_number || '').split('-');
  const dateStr = (d: any) => (d ? String(d).slice(0, 10) : '');
  return {
    general: {
      tansad_prefix: tansadParts[0] || 'TZDL', tansad_year: tansadParts[1] || String(new Date().getFullYear()).slice(-2),
      tansad_seq: tansadParts[2] || '', ref_number: decl.tancis_ref || '', mode: 'IM4',
      tansad_date: dateStr(decl.reference_date), clearing_office: decl.clearing_office || 'TZDL',
      cl_plan: decl.cl_plan || 'PAO', form_type: decl.tansad_form_type || 'G',
      items_count: String((decl.items || []).length || 1), packages_total: String(decl.total_packages ?? ''),
      package_type: decl.package_type || 'PK', gross_weight: String(decl.gross_weight_kg ?? ''),
      net_weight: String(decl.net_weight_kg ?? ''), ucr_no: decl.ucr_number || '',
    },
    parties: {
      consignment_country: decl.consignment_country || 'CN', trading_country: decl.trading_country || 'CN',
      country_export: decl.country_of_export || 'CN', country_destination: decl.country_of_destination || 'TZ',
      exporter: { tin: decl.exporter_tin || '', name: decl.exporter_name || '', address: decl.exporter_address || '', country: 'CN' },
      importer: { tin: decl.importer_tin || '', name: decl.importer_name || job.customer, address: decl.importer_address || '', country: 'TZ' },
      declarant: { tin: decl.declarant_tin || '', name: decl.declarant_name || '', address: decl.declarant_address || '', country: 'TZ' },
    },
    financial: {
      delivery_term: decl.delivery_term || 'CIF', delivery_place: decl.delivery_place || job.destination || 'Dar es Salaam',
      invoice_no: decl.invoice_number || '', invoice_date: dateStr(decl.invoice_date),
      invoice_value_usd: String(decl.total_invoice_value ?? ''), customs_value_tzs: String(decl.total_customs_value ?? ''),
      payment_method: decl.payment_method || 'T', payment_bank: decl.payment_bank || '',
      freight_usd: String(decl.freight_amount ?? ''), insurance_usd: String(decl.insurance_amount ?? ''),
      other_charges_usd: String(decl.other_charges ?? '0'), deductions_usd: String(decl.deductions ?? '0'),
      self_assessment: !!decl.self_assessment, exchange_rate: String(decl.exchange_rate ?? '2560'),
      duty_rate: '25', vat_rate: '18', excise_rate: '0', total_imp_duty_tzs: '', total_vat_tzs: '',
    },
    transport: {
      transport_mode: decl.transport_mode || 'S', arrival_date: dateStr(decl.arrival_date), crn: decl.crn || '',
      bl_no: decl.bl_number || '', tansad_no: decl.tansad_number || '', vessel_name: decl.vessel_name || '',
      partial_bl: false, shipment_place: decl.shipment_place || '', discharge_place: decl.discharge_place || 'Dar es Salaam',
      discharge_date: dateStr(decl.discharge_date), entry_office: decl.entry_office || 'TZDL',
      location_goods: decl.location_of_goods || '', container_count: String(decl.total_container_count ?? '0'),
      warehouse: decl.warehouse || '', period_days: String(decl.period_days ?? ''),
    },
    items: (decl.items || []).length > 0
      ? decl.items.map((it: any) => ({
          hs: it.hs_code || '', desc: it.commodity_description || '', origin: it.country_of_origin || 'CN',
          qty: String(it.quantity ?? ''), unit: it.unit_of_measure || 'KGS', gross_wt: String(it.gross_weight_kg ?? ''),
          net_wt: String(it.net_weight_kg ?? ''), cif_usd: '', customs_value_tzs: String(it.customs_value ?? ''),
          imp_duty_tzs: '', vat_tzs: '', duty_rate: '25',
        }))
      : [emptyHsLine()],
  };
}

function DField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="decl-kv">
      <span className="decl-k">{label}</span>
      {children}
    </div>
  );
}
function DInput({ value, onChange, placeholder, mono, readOnly }: { value: string; onChange?: (v: string) => void; placeholder?: string; mono?: boolean; readOnly?: boolean }) {
  return (
    <input className="input-field" title={placeholder} placeholder={placeholder} value={value} readOnly={readOnly}
      onChange={e => onChange?.(e.target.value)}
      style={{ fontSize: 13, padding: '9px 10px', fontFamily: mono ? 'var(--mono)' : undefined }} />
  );
}
function DSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// ─── Stage Stepper ────────────────────────────────────────────────────────────

function StageStepper({ stage }: { stage: Stage }) {
  const currentIdx = stageIdx(stage);
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 24px', overflowX: 'auto', gap: 0 }}>
      {STAGES.map((s, i) => {
        const done = i < currentIdx; const active = i === currentIdx;
        return (
          <React.Fragment key={s.id}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, minWidth: 64 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: active || done ? 'var(--teal)' : 'var(--border)', color: active || done ? '#fff' : 'var(--ink3)', fontSize: 11, fontWeight: 700, boxShadow: active ? '0 0 0 4px var(--teal-l)' : 'none', transition: 'all 0.2s' }}>
                {done ? <Icon name="check" size={13} /> : <span>{i + 1}</span>}
              </div>
              <div style={{ fontSize: 9, fontWeight: active ? 700 : 500, color: active ? 'var(--teal)' : done ? 'var(--ink2)' : 'var(--ink3)', marginTop: 4, textAlign: 'center', lineHeight: 1.2, maxWidth: 60, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.short}
              </div>
            </div>
            {i < STAGES.length - 1 && (
              <div style={{ flex: 1, height: 2, minWidth: 8, background: i < currentIdx ? 'var(--teal)' : 'var(--border)', marginBottom: 16, transition: 'background 0.3s' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Customer Milestone Timeline ───────────────────────────────────────────────
// A simplified 6-milestone client-facing journey, shown to CUSTOMER-role
// viewers instead of the internal 11/18-stage engineering stepper above.

function customerMilestone(stage: Stage): CustomerMilestone {
  const apiStage = STAGE_API_MAP[stage] as ClearanceStage;
  return STAGE_TO_MILESTONE[apiStage] ?? 'docs_received';
}

function CustomerMilestoneTimeline({ job, compact }: { job: ClearanceJob; compact?: boolean }) {
  // Custom-workflow shipments: `job.stage` was already collapsed to a
  // generic local Stage by toStage() (a workflow_steps.id has no entry in
  // the fixed 11-stage/6-milestone taxonomies — there's no principled way
  // to guess where an arbitrary tenant-authored step belongs on that curated
  // scale). Render an honest 2-state view instead of a fabricated position.
  if (job.workflowId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: compact ? '8px 4px' : '14px 4px' }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: job.isDone ? 'var(--teal)' : 'var(--gold)',
        }} />
        <div>
          <div style={{ fontSize: compact ? 12.5 : 13.5, fontWeight: 700, color: 'var(--ink)' }}>
            {job.isDone ? 'Delivered' : 'In Progress'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
            Detailed step-by-step tracking isn't available yet for this shipment's custom process.
          </div>
        </div>
      </div>
    );
  }

  const curMilestone = customerMilestone(job.stage);
  const curIdx = CUSTOMER_MILESTONES.indexOf(curMilestone);

  // Earliest timeline event date recorded for each milestone group.
  const enteredAt = new Map<CustomerMilestone, Date>();
  for (const ev of job.timeline) {
    const m = STAGE_TO_MILESTONE[STAGE_API_MAP[ev.stage] as ClearanceStage];
    if (m && !enteredAt.has(m)) enteredAt.set(m, ev.ts);
  }

  const notch = 14;
  return (
    <div>
      <div style={{ display: 'flex', width: '100%', borderRadius: 999, overflow: 'hidden' }}>
        {CUSTOMER_MILESTONES.map((m, i) => {
          const done = i < curIdx; const active = i === curIdx;
          const isFirst = i === 0; const isLast = i === CUSTOMER_MILESTONES.length - 1;
          const clip = isFirst
            ? `polygon(0 0, calc(100% - ${notch}px) 0, 100% 50%, calc(100% - ${notch}px) 100%, 0 100%)`
            : isLast
            ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${notch}px 50%)`
            : `polygon(0 0, calc(100% - ${notch}px) 0, 100% 50%, calc(100% - ${notch}px) 100%, 0 100%, ${notch}px 50%)`;
          return (
            <div key={m} style={{
              flex: 1, minWidth: 0, marginLeft: isFirst ? 0 : -notch, zIndex: CUSTOMER_MILESTONES.length - i,
              clipPath: clip,
              background: active ? 'var(--teal)' : done ? 'var(--teal-l)'
                : 'repeating-linear-gradient(45deg, var(--bg), var(--bg) 6px, var(--border) 6px, var(--border) 7px)',
              padding: compact ? '8px 18px' : '14px 20px', textAlign: 'center',
            }}>
              <div style={{
                fontSize: compact ? 11 : 13, fontWeight: 800,
                color: active ? '#fff' : done ? 'var(--teal)' : 'var(--ink3)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {MILESTONE_LABELS[m]}
              </div>
            </div>
          );
        })}
      </div>
      {!compact && (
        <div style={{ display: 'flex', marginTop: 8 }}>
          {CUSTOMER_MILESTONES.map((m, i) => {
            const done = i < curIdx; const active = i === curIdx;
            const at = enteredAt.get(m);
            const caption = done ? (at ? `Completed ${fdate(at)}` : 'Completed')
              : active ? (at ? `In progress since ${fdate(at)}` : 'In progress')
              : 'Not started';
            return (
              <div key={m} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--ink3)' }}>{caption}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Customer "Needs Your Attention" panel ─────────────────────────────────────
// Surfaces the real blocker note (if any) an officer logged against the
// current stage — the client-facing equivalent of a "bottleneck".

function CustomerAttentionPanel({ job }: { job: ClearanceJob }) {
  const currentEvent = [...job.timeline].reverse().find(e => e.stage === job.stage) ?? job.timeline[job.timeline.length - 1];
  const blocker = currentEvent?.blocker;

  if (!blocker) {
    return (
      <div style={{ background: 'var(--green-l)', border: '1px solid var(--green)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="checkCircle" size={18} color="var(--green)" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>You're all caught up</div>
          <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 1 }}>Nothing is blocking your shipment right now.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 12, padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon name="alertCircle" size={16} color="var(--gold)" />
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>Needs your attention</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--gold)', lineHeight: 1.5 }}>{blocker}</div>
    </div>
  );
}

// ─── Customer clearing-agent contact card ──────────────────────────────────────

function CustomerAgentCard({ job }: { job: ClearanceJob }) {
  const agentName = job.assignees[0];
  if (!agentName) return null;
  const agent = EMPLOYEES.find(e => e.name === agentName);

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Your Clearing Agent</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: empAvatarColor(agentName), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
          {empInitials(agentName)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{agentName}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{agent?.designation ?? 'Clearing Agent'}</div>
        </div>
      </div>
      {agent && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <a href={`tel:${agent.phone}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', background: 'var(--teal)', color: '#fff', borderRadius: 7, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
            <Icon name="phone" size={13} color="#fff" /> Call
          </a>
          <a href={`mailto:${agent.email}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
            <Icon name="mail" size={13} /> Email
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Advance Stage Modal ──────────────────────────────────────────────────────

function AdvanceStageModal({ job, onClose, onAdvance }: {
  job: ClearanceJob; onClose: () => void;
  onAdvance: (stage: Stage, note: string, blocker: string, channels: Channel[]) => void;
}) {
  const currentIdx = stageIdx(job.stage);
  const nextStages = STAGES.filter((_, i) => i > currentIdx);
  const [selected, setSelected] = useState(nextStages[0]?.id || '');
  const [note, setNote] = useState('');
  const [blocker, setBlocker] = useState('');
  const [chans, setChans] = useState<Channel[]>(['whatsapp', 'email']);
  function toggle(ch: Channel) { setChans(p => p.includes(ch) ? p.filter(c => c !== ch) : [...p, ch]); }
  // Inline panel, not a popup — pushed into normal document flow directly
  // under the header instead of a darkened full-screen overlay.
  return (
    <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', boxShadow: 'var(--elev-lg)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ padding: '16px 20px 0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Advance Stage</div>
          <button type="button" onClick={onClose} style={{ background: 'var(--bg)', border: 'none', borderRadius: 'var(--r)', cursor: 'pointer', color: 'var(--ink3)', padding: 6, display: 'flex' }}><Icon name="x" size={16} /></button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Move to Stage</label>
            <Select value={selected} onValueChange={v => setSelected(v as Stage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {nextStages.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Transition Note <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>(visible to listeners)</span></label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="What was completed? Any key info to share…" style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, resize: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Blocker / Pending <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>(optional)</span></label>
            <textarea value={blocker} onChange={e => setBlocker(e.target.value)} rows={2} placeholder="Any blockers or outstanding actions?" style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, resize: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 8 }}>Notify via</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['internal', 'whatsapp', 'email', 'teams', 'sms'] as Channel[]).map(ch => {
                const cfg = CH_CFG[ch]; const on = chans.includes(ch);
                return (
                  <button key={ch} type="button" onClick={() => toggle(ch)} style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? cfg.color : 'var(--border)'}`, background: on ? cfg.bg : 'var(--white)', color: on ? cfg.color : 'var(--ink3)', transition: 'all 0.15s', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 20px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="button" disabled={!selected} onClick={() => selected && onAdvance(selected as Stage, note, blocker, chans)} style={{ padding: 'var(--ds-btn-py) 20px', background: selected ? 'var(--teal)' : 'var(--border)', color: selected ? '#fff' : 'var(--ink3)', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: selected ? 'pointer' : 'default', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              Update Stage →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Entry-Point Clearing Steps & Charges ────────────────────────────────────

const ENTRY_POINT_STEPS: Record<string, { label: string; steps: string[]; charges: { label: string; est: string }[] }> = {
  TZDL: {
    label: 'Dar es Salaam Port (CSC)',
    steps: ['Submit B/L & Packing List','TANCIS Pre-Arrival Registration','Assessment & Examination Order','Duty & Port Levy Payment','Physical Inspection (if flagged)','Delivery Order from Shipping Line','Gate Pass & Release','Transport to Warehouse'],
    charges: [{ label: 'Port handling levy', est: '1.5% CIF' }, { label: 'CFS storage (per day)', est: 'TZS 45,000/TEU' }, { label: 'DO fee', est: 'USD 60' }, { label: 'Agency fee', est: 'TZS 350,000' }],
  },
  TZDA: {
    label: 'Julius Nyerere International Airport',
    steps: ['Airway Bill submission','Airline manifest clearance','TANCIS Air Declaration entry','TRA assessment & duty payment','Physical examination (JNIA shed)','Release & collection'],
    charges: [{ label: 'Airport handling', est: '2% CIF' }, { label: 'Airline storage (3 free days)', est: 'USD 8/kg/day' }, { label: 'Agency fee (air)', est: 'TZS 280,000' }],
  },
  TZDHL: {
    label: 'DHL Express Clearance',
    steps: ['DHL tracking confirmation','Informal entry (shipments <USD 1,000)','Formal TANCIS entry (>USD 1,000)','Duty & VAT payment to DHL','DHL release & delivery'],
    charges: [{ label: 'DHL clearance fee', est: 'USD 35–120' }, { label: 'Duty & VAT (standard)', est: 'TRA assessed' }, { label: 'Disbursement fee', est: '5% of duties' }],
  },
  TZFEX: {
    label: 'FedEx / UPS Express',
    steps: ['Shipment arrives FedEx/UPS hub','Broker notification','TANCIS informal/formal entry','Duty payment via FedEx portal','Customs release & last-mile'],
    charges: [{ label: 'Express clearance', est: 'USD 50–150' }, { label: 'Duty & VAT', est: 'TRA assessed' }, { label: 'Remote area surcharge', est: 'If applicable' }],
  },
  TZPOSTA: {
    label: 'Tanzania Posts (Posta / EMS)',
    steps: ['Parcel arrives Posta hub','TRA random inspection','Duty assessment slip','Payment at Posta counter','Collection with duty receipt'],
    charges: [{ label: 'Posta handling', est: 'TZS 15,000 flat' }, { label: 'Duty & VAT', est: 'TRA assessed' }, { label: 'Customs exam fee', est: 'TZS 30,000' }],
  },
  TZNAMANGA: {
    label: 'Namanga Border (Kenya–Tanzania)',
    steps: ['Kenya customs exit clearance','Namanga TRA entry post','Transit C3 or Import IM4 declaration','Axle load check','Duty & levies payment','TANROADS road permit','Proceed to destination'],
    charges: [{ label: 'Road crossing levy', est: 'TZS 50,000' }, { label: 'TANROADS permit', est: 'TZS 80,000–400,000' }, { label: 'Duty & VAT', est: 'TRA assessed' }, { label: 'Agency fee', est: 'TZS 200,000' }],
  },
  TZHOLILI: {
    label: 'Holili / Taveta Border (Kenya)',
    steps: ['Kenya exit at Taveta','Holili TRA border post','Import declaration','Duty payment','Vehicle clearance & release'],
    charges: [{ label: 'Border levy', est: 'TZS 40,000' }, { label: 'Duty & VAT', est: 'TRA assessed' }, { label: 'Agency fee', est: 'TZS 180,000' }],
  },
  TZNG: {
    label: 'Tanga Port',
    steps: ['Vessel manifest submission','TANCIS Tanga registration','Assessment','Duty payment','DO from shipping line','Gate release'],
    charges: [{ label: 'Tanga port levy', est: '1.2% CIF' }, { label: 'Agency fee', est: 'TZS 300,000' }],
  },
};

function EntryPointSteps({ entryOffice }: { entryOffice: string }) {
  const cfg = ENTRY_POINT_STEPS[entryOffice];
  if (!cfg) return null;
  return (
    <div style={{ marginTop: 14, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
        Clearing Process — {cfg.label}
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Steps</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cfg.steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--teal)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                <span style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.45 }}>{step}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Typical Charges</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cfg.charges.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                <span style={{ color: 'var(--ink2)' }}>{c.label}</span>
                <span style={{ fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--mono)', fontSize: 11 }}>{c.est}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Declaration Tab (Full TANCIS form) ───────────────────────────────────────


/** The calculator's card names, in the order the report presents them. */
const HEAD_LABEL: Record<string, string> = {
  DUTY_TAXES: 'Duties & taxes (TRA)',
  FREIGHT: 'Freight',
  INSURANCE: 'Insurance',
  TPA: 'Port & handling (TPA)',
  ICD: 'ICD / destination',
  TBS: 'TBS',
  SHIPPING_LINE: 'Shipping line',
  CLEARANCE_AGENCY: 'Clearance & agency',
  TRANSPORT: 'Transport',
  OTHER: 'Other',
};

/**
 * What this shipment was estimated to cost, against what it actually cost.
 *
 * The point of the whole feedback loop, and the first thing it repays: knowing
 * you under-quote ICD by 12% is worth having whether or not anything ever
 * automates it.
 *
 * A head with only one side populated shows an em dash, not a variance. "We
 * estimated 900k and have recorded nothing yet" is not a 100% saving, and
 * printing it as one would discredit the panel the first time somebody read it
 * mid-clearance.
 */
/**
 * What the workflow automation did on this consignment.
 *
 * The Activity Feed records what people did. This records what the workflow
 * did — including the auto-comms that failed, which used to be returned by
 * sendOneComm and dropped, visible to nobody.
 *
 * It is also the only place a run belonging to a legacy fixed-stage shipment
 * can appear at all: those have workflow_id NULL, so the workflow-scoped view
 * in the builder cannot reach them.
 */
function AutomationHistoryCard({ shipmentId }: { shipmentId: string }) {
  const [runs, setRuns] = React.useState<any[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    apiFetch(`/v1/shipments/${shipmentId}/workflow-runs?limit=25`)
      .then((r: any) => { if (!cancelled) setRuns(r?.data ?? []); })
      .catch(() => { /* nothing recorded for this shipment — the card stays hidden */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [shipmentId]);

  // A shipment that predates the journal has no runs. That is not a failure
  // state worth a panel, so the card simply does not appear.
  if (!loaded || runs.length === 0) return null;

  const TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
    SUCCESS: 'success', PARTIAL: 'warning', BLOCKED: 'warning', FAILED: 'error', SIMULATED: 'info',
  };

  return (
    <Card title="Workflow automation" padded={false}>
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {runs.map(r => {
          const failed = (r.comms ?? []).filter((c: any) => c.status === 'FAILED');
          const detail = (r.conditions?.length ?? 0) > 0 || (r.comms?.length ?? 0) > 0 || r.errorMessage;
          const isOpen = open === r.id;
          return (
            <div key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
              <div
                style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '10px 16px', cursor: detail ? 'pointer' : 'default' }}
                onClick={() => detail && setOpen(isOpen ? null : r.id)}
              >
                <Badge variant={TONE[r.status] ?? 'gray'}>{r.status}</Badge>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.toStepName}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2 }}>
                    {/* Named, not left blank — "which workflow?" has an answer
                        even when the answer is "the built-in stages". */}
                    {r.workflowName ?? 'Standard stages'}
                    {r.actorName ? ` · ${r.actorName}` : ''} · {fdatetime(new Date(r.createdAt))}
                    {failed.length > 0 && (
                      <span style={{ color: 'var(--red)' }}> · {failed.length} message{failed.length === 1 ? '' : 's'} not sent</span>
                    )}
                  </div>
                </div>
                {detail && <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={13} color="var(--ink3)" />}
              </div>

              {isOpen && (
                <div style={{ padding: '0 16px 12px 16px' }}>
                  {r.errorMessage && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{r.errorMessage}</div>}
                  {(r.conditions ?? []).map((c: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12, padding: '2px 0' }}>
                      <Icon name={c.passed ? 'check' : 'x'} size={12} color={c.passed ? 'var(--green)' : 'var(--red)'} />
                      <span style={{ color: 'var(--ink2)' }}>{c.label}</span>
                    </div>
                  ))}
                  {(r.comms ?? []).map((c: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12, padding: '3px 0' }}>
                      <Badge variant={c.status === 'SENT' ? 'success' : c.status === 'FAILED' ? 'error' : 'gray'}>{c.status}</Badge>
                      <span style={{ color: 'var(--ink2)' }}>
                        {c.channel} → {String(c.recipient ?? '').replace(/_/g, ' ')}
                        {c.error && <span style={{ display: 'block', color: 'var(--red)' }}>{c.error}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function EstimateVarianceCard({ shipmentId }: { shipmentId: string }) {
  const [data, setData] = React.useState<any>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    apiFetch(`/v1/intel/variance/${shipmentId}`)
      .then(r => { if (!cancelled) setData(r); })
      .catch(() => { /* no estimate linked yet — the card simply stays hidden */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [shipmentId]);

  // Nothing to compare against is not a failure state worth a panel.
  if (!loaded || !data?.estimate) return null;

  const money = (n: number | null) =>
    n == null ? '—' : 'TZS ' + Math.round(n).toLocaleString('en-US');

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icon name="barChart" size={16} color="var(--teal)" />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Estimate vs actual</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>
        Against the landed cost estimate of {new Date(data.estimate.created_at).toLocaleDateString('en-GB')}.
        Actuals come from the ledger below, so this fills in as costs are recorded.
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 480 }}>
          <thead>
            <tr>
              {['Charge head', 'Estimated', 'Actual', 'Variance'].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '8px 10px', fontSize: 10.5,
                  fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px',
                  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l: any) => {
              const over = l.varianceTzs != null && l.varianceTzs > 0;
              return (
                <tr key={l.head}>
                  <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', color: 'var(--ink)' }}>
                    {HEAD_LABEL[l.head] ?? l.head}
                  </td>
                  <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink2)' }}>
                    {money(l.estimatedTzs)}
                  </td>
                  <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink2)' }}>
                    {money(l.actualTzs)}
                  </td>
                  <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                    fontWeight: 700, color: l.varianceTzs == null ? 'var(--ink3)' : over ? 'var(--red)' : 'var(--green)' }}>
                    {l.varianceTzs == null
                      ? '—'
                      : `${over ? '+' : ''}${Math.round(l.varianceTzs).toLocaleString('en-US')}${l.variancePct != null ? ` (${over ? '+' : ''}${l.variancePct}%)` : ''}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.55 }}>
        A dash means one side has nothing recorded yet — not a saving. Duties and TPA charges are
        statutory: a difference there points at the classification or the valuation, never at a rate
        to adjust.
      </div>
    </div>
  );
}

function DeclarationTab({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  type DeclSubTab = 'general' | 'parties' | 'financial' | 'transport' | 'items';
  const [sub, setSub] = useState<DeclSubTab>('general');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen: triggerOpenRaw } = useClockIn();
  const triggerOpen = () => triggerOpenRaw({ shipmentId: job.id, shipmentRef: job.sysRef || job.id });
  const isStaff = !!(user && user.role !== 'CUSTOMER');
  const [ocrBanner, setOcrBanner] = useState<any | null>(() => {
    try { return JSON.parse(localStorage.getItem(`ocrDecl_${job.id}`) || 'null'); } catch { return null; }
  });

  const [general,   setGeneral]   = useState(() => emptyGeneral(job));
  const [parties,   setParties]   = useState<DeclParties>(() => ({
    consignment_country: job.origin?.slice(0, 2).toUpperCase() || 'CN',
    trading_country: job.origin?.slice(0, 2).toUpperCase() || 'CN',
    country_export: job.origin?.slice(0, 2).toUpperCase() || 'CN',
    country_destination: 'TZ',
    exporter: emptyParty(), importer: { ...emptyParty(), name: job.customer },
    declarant: emptyParty(),
  }));
  const [financial, setFinancial] = useState(() => emptyFinancial(job));
  const [transport, setTransport] = useState(() => emptyTransport(job));
  const [items,     setItems]     = useState<HsLine[]>([emptyHsLine()]);
  const [loadedDeclaration, setLoadedDeclaration] = useState(false);
  const [prefill, setPrefill] = useState<any>(null);
  const [applyHs, setApplyHs] = useState(false);

  /**
   * Copies the shipment-derived draft into the form.
   *
   * Only fields the draft actually resolved are written — a blank in the draft
   * leaves the form's own default alone rather than clearing it. The HS code is
   * applied only if the filer ticked the box for it.
   */
  function applyPrefill() {
    if (!prefill?.draft) return;
    const d = prefill.draft;
    const keep = (v: any, fallback: string) => (v === null || v === undefined || v === '' ? fallback : String(v));

    setGeneral(g => ({
      ...g,
      ref_number:     keep(d.tancis_ref, g.ref_number),
      gross_weight:   d.gross_weight_kg ? String(d.gross_weight_kg) : g.gross_weight,
      packages_total: d.total_packages ? String(d.total_packages) : g.packages_total,
    }));
    setParties(p => ({
      ...p,
      country_export:      keep(d.country_of_export, p.country_export),
      country_destination: keep(d.country_of_destination, p.country_destination),
      importer: {
        ...p.importer,
        name:    keep(d.importer_name, p.importer.name),
        tin:     keep(d.importer_tin, p.importer.tin),
        address: keep(d.importer_address, p.importer.address),
      },
      declarant: { ...p.declarant, name: keep(d.declarant_name, p.declarant.name) },
    }));
    setFinancial(f => ({
      ...f,
      invoice_value_usd: d.total_invoice_value ? String(d.total_invoice_value) : f.invoice_value_usd,
    }));
    setTransport(t => ({
      ...t,
      bl_no:           keep(d.bl_number, t.bl_no),
      tansad_no:       keep(d.tansad_number, t.tansad_no),
      vessel_name:     keep(d.vessel_name, t.vessel_name),
      shipment_place:  keep(d.shipment_place, t.shipment_place),
      discharge_place: keep(d.discharge_place, t.discharge_place),
      container_count: d.total_container_count ? String(d.total_container_count) : t.container_count,
      arrival_date:    d.arrival_date ? new Date(d.arrival_date).toISOString().slice(0, 10) : t.arrival_date,
    }));

    const hs = prefill.needsConfirmation?.[0];
    if (applyHs && hs?.value) {
      setItems(prev => {
        const [first, ...rest] = prev.length ? prev : [emptyHsLine()];
        return [{ ...first, hs: hs.value, desc: first.desc || prefill.shipment?.goodsDescription || '' }, ...rest];
      });
    }
    setPrefill(null);
  }

  // Hydrate the form from whatever was actually persisted, so re-opening
  // this tab doesn't show blank Parties/Financial/Items fields for data
  // that was saved on a previous visit.
  useEffect(() => {
    if (!isLive) { setLoadedDeclaration(true); return; }
    let cancelled = false;
    apiFetch(`/v1/declarations/by-shipment/${shipmentId}`)
      .then(async decl => {
        if (cancelled) return;
        if (decl) {
          const mapped = applyDeclarationResponse(decl, job);
          setGeneral(mapped.general);
          setParties(mapped.parties);
          setFinancial(mapped.financial);
          setTransport(mapped.transport);
          setItems(mapped.items);
          return;
        }
        // Nothing lodged yet — offer to start from what the shipment already
        // holds. Offered, not applied: the same stance as the OCR banner, and
        // required for the HS code, which must never land in a declaration
        // without someone accepting it.
        const pre = await apiFetch(`/v1/declarations/prefill/${shipmentId}`).catch(() => null);
        if (!cancelled && pre?.draft) setPrefill(pre);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadedDeclaration(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId, isLive]);

  function applyOcrData() {
    if (!ocrBanner) return;
    const isTansad = ocrBanner.doc_type === 'TANSAD';
    const ov = ocrBanner.overview  || {};
    const pt = ocrBanner.parties   || {};
    const fi = ocrBanner.financial || {};
    const hs: any[] = ocrBanner.hs_lines || [];

    setGeneral(g => ({
      ...g,
      ref_number:     (isTansad ? ov.tansad_number : ov.bl_number) || g.ref_number,
      gross_weight:   ov.gross_weight_kg || g.gross_weight,
      net_weight:     ov.net_weight_kg   || g.net_weight,
      packages_total: ov.packages        || g.packages_total,
      package_type:   ov.package_type    || g.package_type,
    }));
    setParties(p => ({
      ...p,
      exporter: {
        tin:     isTansad ? (pt.shipper_tin || '') : '',
        name:    pt.shipper_name    || p.exporter.name,
        address: pt.shipper_address || p.exporter.address,
        country: pt.shipper_country || p.exporter.country,
      },
      importer: {
        tin:     pt.consignee_tin   || '',
        name:    pt.consignee_name  || p.importer.name,
        address: pt.consignee_address || p.importer.address,
        country: pt.consignee_country || p.importer.country,
      },
      declarant: {
        tin:     pt.declarant_tin     || p.declarant.tin,
        name:    pt.declarant_name    || p.declarant.name,
        address: pt.declarant_address || p.declarant.address,
        country: 'TZ',
      },
      consignment_country: pt.shipper_country || p.consignment_country,
      trading_country:     pt.shipper_country || p.trading_country,
      country_export:      pt.shipper_country || p.country_export,
    }));
    setFinancial(f => ({
      ...f,
      invoice_no:         fi.invoice_number    || f.invoice_no,
      invoice_date:       fi.invoice_date       || f.invoice_date,
      invoice_value_usd:  fi.invoice_value_usd  || f.invoice_value_usd,
      customs_value_tzs:  fi.customs_value_tzs  || f.customs_value_tzs,
      delivery_term:      fi.incoterms          || f.delivery_term,
      freight_usd:        fi.freight_usd        || f.freight_usd,
      insurance_usd:      fi.insurance_usd      || f.insurance_usd,
      exchange_rate:      fi.exchange_rate       || f.exchange_rate,
      total_imp_duty_tzs: fi.total_imp_duty_tzs || f.total_imp_duty_tzs,
      total_vat_tzs:      fi.total_vat_tzs      || f.total_vat_tzs,
    }));
    setTransport(t => ({
      ...t,
      bl_no:           ov.bl_number       || t.bl_no,
      tansad_no:       ov.tansad_number   || t.tansad_no,
      vessel_name:     ov.vessel          || t.vessel_name,
      shipment_place:  ov.origin_port     || t.shipment_place,
      discharge_place: ov.dest_port       || t.discharge_place,
      arrival_date:    ov.eta             || t.arrival_date,
      container_count: ov.container_number ? '1' : t.container_count,
    }));
    if (hs.length > 0) {
      setItems(hs.map((line: any) => ({
        hs:           line.hs_code          || '',
        desc:         line.description      || '',
        origin:       line.origin_country   || 'TZ',
        qty:          line.quantity         || '',
        unit:         line.unit             || 'KGS',
        gross_wt:     line.gross_weight_kg  || '',
        net_wt:       line.net_weight_kg    || '',
        cif_usd:      line.value_usd        || '',
        customs_value_tzs: line.customs_value_tzs || '',
        imp_duty_tzs: line.imp_duty_tzs     || '',
        vat_tzs:      line.vat_tzs          || '',
        duty_rate:    '25',
      })));
    }
    localStorage.removeItem(`ocrDecl_${job.id}`);
    setOcrBanner(null);
  }

  const er      = Number(financial.exchange_rate) || 2560;
  const cifUsd  = Number(financial.invoice_value_usd) || 0;
  const frt     = Number(financial.freight_usd) || 0;
  const ins     = Number(financial.insurance_usd) || 0;
  const cifTzs  = (cifUsd + frt + ins) * er;
  const dutyAmt = cifTzs * (Number(financial.duty_rate) / 100);
  const vatAmt  = (cifTzs + dutyAmt) * (Number(financial.vat_rate) / 100);
  const excAmt  = cifTzs * (Number(financial.excise_rate) / 100);
  const totalTax = dutyAmt + vatAmt + excAmt;

  const currentIdx = stageIdx(job.stage);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    setSaving(true);
    const tansad = `${general.tansad_prefix}-${general.tansad_year}-${general.tansad_seq}`;
    try {
      if (isLive) {
        await apiFetch(`/v1/declarations/by-shipment/${shipmentId}`, {
          method: 'PUT',
          body: JSON.stringify(buildDeclarationPayload(general, parties, financial, transport, items)),
        });
        onRefresh();
      } else {
        updateJob(job.id, j => ({ ...j, tansad, bl: transport.bl_no || j.bl, vessel: transport.vessel_name || j.vessel }));
      }
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (err: any) { showAlert(err.message || 'Save failed'); } finally { setSaving(false); }
  }

  const SUB_TABS: { key: DeclSubTab; label: string }[] = [
    { key: 'general',   label: 'General'   },
    { key: 'parties',   label: 'Parties'   },
    { key: 'financial', label: 'Financial' },
    { key: 'transport', label: 'Transport' },
    { key: 'items',     label: 'HS Items'  },
  ];

  return (
    <form onSubmit={handleSave} style={{ width: '100%' }}>
      {/* OCR pre-fill banner */}
      {/* Nothing lodged yet — start from the shipment instead of an empty form. */}
      {prefill && (
        <div style={{ padding: '12px 14px', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Icon name="zap" size={18} color="var(--teal)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                Start from {prefill.shipment?.refNumber ?? 'this shipment'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3, lineHeight: 1.55 }}>
                {Object.keys(prefill.sources ?? {}).length} field
                {Object.keys(prefill.sources ?? {}).length === 1 ? '' : 's'} can be filled from what this
                consignment already records — importer, transport, countries and values.
              </div>

              {prefill.missing?.length > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 7 }}>
                  <span style={{ fontWeight: 650 }}>You will still need to enter:</span>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 17 }}>
                    {prefill.missing.map((m: any) => (
                      <li key={m.field} style={{ marginBottom: 1 }}>
                        {m.label} <span style={{ color: 'var(--ink3)' }}>— {m.why}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* The HS code is never carried over silently. */}
              {prefill.needsConfirmation?.length > 0 && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 9, fontSize: 11.5, color: 'var(--ink2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={applyHs} onChange={e => setApplyHs(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>
                    Also use HS code <strong>{prefill.needsConfirmation[0].value}</strong> from the shipment.
                    <span style={{ display: 'block', color: 'var(--ink3)' }}>{prefill.needsConfirmation[0].note}</span>
                  </span>
                </label>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={applyPrefill}>
                  Fill the form
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPrefill(null)}>
                  Start blank
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {ocrBanner && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="search" size={18} color="var(--teal)" />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>OCR data ready to apply</div>
              <div style={{ fontSize: 11, color: 'var(--ink2)' }}>
                Extracted from scanned document — parties, financials, HS codes &amp; transport details.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button type="button" title="Dismiss OCR suggestion" onClick={() => { localStorage.removeItem(`ocrDecl_${job.id}`); setOcrBanner(null); }}
              style={{ fontSize: 11, color: 'var(--ink3)', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 10px', cursor: 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
              Dismiss
            </button>
            <button type="button" title="Apply OCR extracted data to all declaration fields" onClick={applyOcrData}
              style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--teal)', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 12px', cursor: 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
              Apply OCR data
            </button>
          </div>
        </div>
      )}

      {/* Sub-tab strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 20, background: 'var(--bg)', borderRadius: 12, padding: 5, border: '1px solid var(--border)' }}>
        {SUB_TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setSub(t.key)} style={{ flex: '1 1 110px', padding: 'var(--ds-btn-py) 10px', border: 'none', borderRadius: 'var(--r)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', background: sub === t.key ? 'var(--white)' : 'transparent', color: sub === t.key ? 'var(--teal)' : 'var(--ink3)', boxShadow: sub === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.12s', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── General ── */}
      {sub === 'general' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="decl-block">
            <div className="decl-block-title">TANSAD Reference</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <div style={{ flex: 2 }}><span className="decl-k">Prefix</span>
                <DSelect value={general.tansad_prefix} onChange={v => setGeneral(g => ({ ...g, tansad_prefix: v }))} options={[['TZDA','TZDA — DSM Airport'],['TZDL','TZDL — DAR Land'],['TZNG','TZNG — Tanga'],['TZKA','TZKA — KIA'],['TZMW','TZMW — Mwanza'],['TZKM','TZKM — Kigoma']]} />
              </div>
              <div style={{ flex: 1 }}><span className="decl-k">Year</span>
                <DInput value={general.tansad_year} onChange={v => setGeneral(g => ({ ...g, tansad_year: v }))} placeholder="26" mono />
              </div>
              <div style={{ flex: 2 }}><span className="decl-k">Sequence No.</span>
                <DInput value={general.tansad_seq} onChange={v => setGeneral(g => ({ ...g, tansad_seq: v }))} placeholder="1297073" mono />
              </div>
            </div>
            <div className="decl-grid">
              <DField label="TANSAD Date"><DInput value={general.tansad_date} onChange={v => setGeneral(g => ({ ...g, tansad_date: v }))} placeholder="YYYY-MM-DD" /></DField>
              <DField label="Reference No."><DInput value={general.ref_number} onChange={v => setGeneral(g => ({ ...g, ref_number: v }))} placeholder="137644169-26-990015" mono /></DField>
              <DField label="Mode of Declaration">
                <DSelect value={general.mode} onChange={v => setGeneral(g => ({ ...g, mode: v }))} options={[['IM4','IM4 — Home Use'],['IM8','IM8 — Bonded'],['EX1','EX1 — Export'],['EX3','EX3 — Re-export'],['T1','T1 — Transit']]} />
              </DField>
              <DField label="Clearing Office">
                <DSelect value={general.clearing_office} onChange={v => setGeneral(g => ({ ...g, clearing_office: v }))} options={[['TZDL','TZDL — DAR CSC'],['TZDA','TZDA — DSM Airport'],['TZNG','TZNG — Tanga'],['TZMW','TZMW — Mwanza']]} />
              </DField>
              <DField label="CL Plan">
                <DSelect value={general.cl_plan} onChange={v => setGeneral(g => ({ ...g, cl_plan: v }))} options={[['PAO','PAO — Pre-Arrival'],['POP','POP — Post-Arrival']]} />
              </DField>
              <DField label="Form Type">
                <DSelect value={general.form_type} onChange={v => setGeneral(g => ({ ...g, form_type: v }))} options={[['G','[G] General'],['S','[S] Simplified'],['C','[C] Combined']]} />
              </DField>
            </div>
          </div>
          <div className="decl-block">
            <div className="decl-block-title">Goods Summary</div>
            <div className="decl-grid">
              <DField label="No. of Items"><DInput value={general.items_count} onChange={v => setGeneral(g => ({ ...g, items_count: v }))} placeholder="1" /></DField>
              <DField label="Total Packages"><DInput value={general.packages_total} onChange={v => setGeneral(g => ({ ...g, packages_total: v }))} placeholder="650" /></DField>
              <DField label="Package Type">
                <DSelect value={general.package_type} onChange={v => setGeneral(g => ({ ...g, package_type: v }))} options={[['PK','PK — Package'],['CT','CT — Carton'],['PL','PL — Pallet'],['BG','BG — Bag'],['DR','DR — Drum'],['BX','BX — Box']]} />
              </DField>
              <DField label="UCR No."><DInput value={general.ucr_no} onChange={v => setGeneral(g => ({ ...g, ucr_no: v }))} placeholder="26TZ137644169…" mono /></DField>
              <DField label="Gross Weight (KG)"><DInput value={general.gross_weight} onChange={v => setGeneral(g => ({ ...g, gross_weight: v }))} placeholder="4747" mono /></DField>
              <DField label="Net Weight (KG)"><DInput value={general.net_weight} onChange={v => setGeneral(g => ({ ...g, net_weight: v }))} placeholder="4740" mono /></DField>
            </div>
          </div>
        </div>
      )}

      {/* ── Parties ── */}
      {sub === 'parties' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="decl-block">
            <div className="decl-block-title">Country Information</div>
            <div className="decl-grid">
              <DField label="Consignment Country"><DInput value={parties.consignment_country} onChange={v => setParties(p => ({ ...p, consignment_country: v }))} placeholder="CN" /></DField>
              <DField label="Trading Country"><DInput value={parties.trading_country} onChange={v => setParties(p => ({ ...p, trading_country: v }))} placeholder="CN" /></DField>
              <DField label="Country of Export"><DInput value={parties.country_export} onChange={v => setParties(p => ({ ...p, country_export: v }))} placeholder="CN" /></DField>
              <DField label="Country of Destination"><DInput value={parties.country_destination} onChange={v => setParties(p => ({ ...p, country_destination: v }))} placeholder="TZ" /></DField>
            </div>
          </div>
          {(['exporter', 'importer', 'declarant'] as const).map(key => (
            <div key={key} className="decl-block">
              <div className="decl-block-title">{key.charAt(0).toUpperCase() + key.slice(1)}</div>
              <div className="decl-grid">
                <DField label="TIN"><DInput value={parties[key].tin} onChange={v => setParties(p => ({ ...p, [key]: { ...p[key], tin: v } }))} placeholder="Company TIN" mono /></DField>
                <DField label="Country"><DInput value={parties[key].country} onChange={v => setParties(p => ({ ...p, [key]: { ...p[key], country: v } }))} placeholder="CN" /></DField>
                <DField label="Company Name">
                  <input className="input-field" title="Company name" placeholder="Company name" value={parties[key].name} onChange={e => setParties(p => ({ ...p, [key]: { ...p[key], name: e.target.value } }))} style={{ fontSize: 12, padding: '5px 8px' }} />
                </DField>
                <DField label="Address">
                  <input className="input-field" title="Address" placeholder="Street, City" value={parties[key].address} onChange={e => setParties(p => ({ ...p, [key]: { ...p[key], address: e.target.value } }))} style={{ fontSize: 12, padding: '5px 8px' }} />
                </DField>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Financial ── */}
      {sub === 'financial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="decl-block">
            <div className="decl-block-title">Invoice Details</div>
            <div className="decl-grid">
              <DField label="Delivery Term">
                <DSelect value={financial.delivery_term} onChange={v => setFinancial(f => ({ ...f, delivery_term: v }))} options={[['CIF','CIF'],['FOB','FOB'],['EXW','EXW'],['CFR','CFR'],['DDP','DDP']]} />
              </DField>
              <DField label="Delivery Place"><DInput value={financial.delivery_place} onChange={v => setFinancial(f => ({ ...f, delivery_place: v }))} placeholder="Dar es Salaam" /></DField>
              <DField label="Invoice No."><DInput value={financial.invoice_no} onChange={v => setFinancial(f => ({ ...f, invoice_no: v }))} placeholder="INV-2026-001" mono /></DField>
              <DField label="Invoice Date"><DInput value={financial.invoice_date} onChange={v => setFinancial(f => ({ ...f, invoice_date: v }))} placeholder="YYYY-MM-DD" /></DField>
              <DField label="Invoice Value (USD)"><DInput value={financial.invoice_value_usd} onChange={v => setFinancial(f => ({ ...f, invoice_value_usd: v }))} placeholder="25000.00" mono /></DField>
              <DField label="Payment Method">
                <DSelect value={financial.payment_method} onChange={v => setFinancial(f => ({ ...f, payment_method: v }))} options={[['T','Swift / TCS'],['C','Cash'],['L','Letter of Credit'],['O','Other']]} />
              </DField>
              <DField label="Payment Bank"><DInput value={financial.payment_bank} onChange={v => setFinancial(f => ({ ...f, payment_bank: v }))} placeholder="CRDB Bank Plc" /></DField>
            </div>
          </div>
          <div className="decl-block">
            <div className="decl-block-title">CIF Breakdown (USD)</div>
            <div className="decl-grid">
              <DField label="Freight"><DInput value={financial.freight_usd} onChange={v => setFinancial(f => ({ ...f, freight_usd: v }))} placeholder="2475.00" mono /></DField>
              <DField label="Insurance"><DInput value={financial.insurance_usd} onChange={v => setFinancial(f => ({ ...f, insurance_usd: v }))} placeholder="75.00" mono /></DField>
              <DField label="Other Charges"><DInput value={financial.other_charges_usd} onChange={v => setFinancial(f => ({ ...f, other_charges_usd: v }))} placeholder="0" mono /></DField>
              <DField label="Deductions"><DInput value={financial.deductions_usd} onChange={v => setFinancial(f => ({ ...f, deductions_usd: v }))} placeholder="0" mono /></DField>
              <DField label="Exchange Rate (TZS)"><DInput value={financial.exchange_rate} onChange={v => setFinancial(f => ({ ...f, exchange_rate: v }))} placeholder="2560" mono /></DField>
              <DField label="Self Assessment">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', paddingTop: 6 }}>
                  <input type="checkbox" checked={financial.self_assessment} onChange={e => setFinancial(f => ({ ...f, self_assessment: e.target.checked }))} style={{ accentColor: 'var(--teal)' }} /> Yes
                </label>
              </DField>
            </div>
          </div>
          <div className="decl-block">
            <div className="decl-block-title">Tax Rates &amp; Live Assessment</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 10 }}>
              For your own quick estimate only — this doesn't get saved. The official assessment is recorded here once TRA responds via a Notice.
            </div>
            <div className="decl-grid">
              <DField label="Duty Rate (%)"><DInput value={financial.duty_rate} onChange={v => setFinancial(f => ({ ...f, duty_rate: v }))} placeholder="25" mono /></DField>
              <DField label="VAT Rate (%)"><DInput value={financial.vat_rate} onChange={v => setFinancial(f => ({ ...f, vat_rate: v }))} placeholder="18" mono /></DField>
              <DField label="Excise Rate (%)"><DInput value={financial.excise_rate} onChange={v => setFinancial(f => ({ ...f, excise_rate: v }))} placeholder="0" mono /></DField>
            </div>
            {cifUsd > 0 && (
              <div style={{ marginTop: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
                {[
                  ['CIF Value (TZS)', cifTzs],
                  [`Customs Duty ${financial.duty_rate}%`, dutyAmt],
                  [`VAT ${financial.vat_rate}%`, vatAmt],
                  ...(Number(financial.excise_rate) > 0 ? [[`Excise ${financial.excise_rate}%`, excAmt] as [string, number]] : []),
                ].map(([l, v]) => (
                  <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink2)', marginBottom: 5 }}>
                    <span>{l as string}</span><span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{(v as number).toLocaleString('en', { maximumFractionDigits: 0 })} TZS</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--teal)', fontSize: 14, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                  <span>Total Tax Payable</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{totalTax.toLocaleString('en', { maximumFractionDigits: 0 })} TZS</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Transport ── */}
      {sub === 'transport' && (
        <div className="decl-block">
          <div className="decl-block-title">Transport &amp; Vessel</div>
          <div className="decl-grid">
            <DField label="Transport Mode">
              <DSelect value={transport.transport_mode} onChange={v => setTransport(t => ({ ...t, transport_mode: v }))} options={[['S','Sea'],['A','Air'],['R','Road'],['T','Rail'],['M','Multimodal']]} />
            </DField>
            <DField label="Arrival Date"><DInput value={transport.arrival_date} onChange={v => setTransport(t => ({ ...t, arrival_date: v }))} placeholder="YYYY-MM-DD" /></DField>
            <DField label="CRN"><DInput value={transport.crn} onChange={v => setTransport(t => ({ ...t, crn: v }))} placeholder="26GB000005…" mono /></DField>
            <DField label="B/L No."><DInput value={transport.bl_no} onChange={v => setTransport(t => ({ ...t, bl_no: v }))} placeholder="TAOEVM1826006DAR" mono /></DField>
            <DField label="Vessel Name"><DInput value={transport.vessel_name} onChange={v => setTransport(t => ({ ...t, vessel_name: v }))} placeholder="EVER VIM" /></DField>
            <DField label="Partial B/L">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', paddingTop: 6 }}>
                <input type="checkbox" checked={transport.partial_bl} onChange={e => setTransport(t => ({ ...t, partial_bl: e.target.checked }))} style={{ accentColor: 'var(--teal)' }} /> Yes
              </label>
            </DField>
            <DField label="Port of Loading"><DInput value={transport.shipment_place} onChange={v => setTransport(t => ({ ...t, shipment_place: v }))} placeholder="CNQIN — Qingdao" /></DField>
            <DField label="Port of Discharge"><DInput value={transport.discharge_place} onChange={v => setTransport(t => ({ ...t, discharge_place: v }))} placeholder="TZDAR — Dar es Salaam" /></DField>
            <DField label="Discharge Date"><DInput value={transport.discharge_date} onChange={v => setTransport(t => ({ ...t, discharge_date: v }))} placeholder="YYYY-MM-DD" /></DField>
            <DField label="Entry Point / Office">
              <DSelect value={transport.entry_office} onChange={v => setTransport(t => ({ ...t, entry_office: v }))} options={[
                ['TZDL','Dar es Salaam Port (CSC)'],
                ['TZDA','Julius Nyerere Airport (JNIA)'],
                ['TZDHL','DHL Express'],
                ['TZFEX','FedEx / UPS Express'],
                ['TZPOSTA','Tanzania Posta / EMS'],
                ['TZNAMANGA','Namanga Border (Kenya)'],
                ['TZHOLILI','Holili / Taveta Border'],
                ['TZNG','Tanga Port'],
                ['TZMW','Mwanza Port'],
              ]} />
            </DField>
            <DField label="Location of Goods"><DInput value={transport.location_goods} onChange={v => setTransport(t => ({ ...t, location_goods: v }))} placeholder="GALCO LIMITED" /></DField>
            <DField label="Containers"><DInput value={transport.container_count} onChange={v => setTransport(t => ({ ...t, container_count: v }))} placeholder="2" mono /></DField>
            <DField label="Warehouse"><DInput value={transport.warehouse} onChange={v => setTransport(t => ({ ...t, warehouse: v }))} placeholder="Bonded warehouse" /></DField>
            <DField label="Period (days)"><DInput value={transport.period_days} onChange={v => setTransport(t => ({ ...t, period_days: v }))} placeholder="30" mono /></DField>
          </div>
          <EntryPointSteps entryOffice={transport.entry_office} />
        </div>
      )}

      {/* ── HS Items ── */}
      {sub === 'items' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>HS Code Lines — {items.length} item(s)</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setItems(p => [...p, emptyHsLine()])} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="plus" size={12} /> Add Line
            </button>
          </div>
          {items.map((line, i) => (
            <div key={i} className="decl-block" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em' }}>ITEM {i + 1}</span>
                {items.length > 1 && (
                  <button type="button" onClick={() => setItems(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', padding: 0 }}><Icon name="close" size={12} /></button>
                )}
              </div>
              <div className="decl-grid">
                <DField label="HS Code"><DInput value={line.hs} onChange={v => setItems(p => p.map((l, j) => j === i ? { ...l, hs: v } : l))} placeholder="8471.30.00" mono /></DField>
                <DField label="Country of Origin"><DInput value={line.origin} onChange={v => setItems(p => p.map((l, j) => j === i ? { ...l, origin: v } : l))} placeholder="CN" /></DField>
              </div>
              <DField label="Description of Goods">
                <input className="input-field" title="Goods description" placeholder="Full description per invoice" value={line.desc} onChange={e => setItems(p => p.map((l, j) => j === i ? { ...l, desc: e.target.value } : l))} style={{ fontSize: 12, padding: '5px 8px', marginTop: 2 }} />
              </DField>
              <div className="decl-grid" style={{ marginTop: 8 }}>
                <DField label="Quantity"><DInput value={line.qty} onChange={v => setItems(p => p.map((l, j) => j === i ? { ...l, qty: v } : l))} placeholder="550" mono /></DField>
                <DField label="Unit">
                  <DSelect value={line.unit} onChange={v => setItems(p => p.map((l, j) => j === i ? { ...l, unit: v } : l))} options={[['KGS','KGS'],['MT','MT'],['PCS','PCS'],['CBM','CBM'],['LTR','LTR'],['SET','SET'],['CTN','CTN']]} />
                </DField>
                <DField label="Gross Wt (KG)"><DInput value={line.gross_wt} onChange={v => setItems(p => p.map((l, j) => j === i ? { ...l, gross_wt: v } : l))} placeholder="4747" mono /></DField>
                <DField label="Net Wt (KG)"><DInput value={line.net_wt} onChange={v => setItems(p => p.map((l, j) => j === i ? { ...l, net_wt: v } : l))} placeholder="4740" mono /></DField>
                <DField label="CIF Value (USD)"><DInput value={line.cif_usd} onChange={v => setItems(p => p.map((l, j) => j === i ? { ...l, cif_usd: v } : l))} placeholder="25000.00" mono /></DField>
                <DField label="Duty Rate (%)"><DInput value={line.duty_rate} onChange={v => setItems(p => p.map((l, j) => j === i ? { ...l, duty_rate: v } : l))} placeholder="25" mono /></DField>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save button */}
      <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !loadedDeclaration} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 20px', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="save" size={14} />
          {!loadedDeclaration ? 'Loading…' : saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Declaration'}
        </button>
      </div>
    </form>
  );
}

// ─── Updates / Chat Tab ────────────────────────────────────────────────────────

function UpdatesTab({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const [text, setText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [chans, setChans] = useState<Channel[]>(['whatsapp', 'email']);
  const [showStageBar, setShowStageBar] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen: triggerOpenRaw } = useClockIn();
  const triggerOpen = () => triggerOpenRaw({ shipmentId: job.id, shipmentRef: job.sysRef || job.id });
  const isStaff = !!(user && user.role !== 'CUSTOMER');

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [job.thread.length]);

  function toggleCh(ch: Channel) { if (!isInternal) setChans(p => p.includes(ch) ? p.filter(c => c !== ch) : [...p, ch]); }

  async function handleSend() {
    if (!text.trim()) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    setSending(true);
    try {
      if (isLive) {
        const channel = isInternal ? 'IN_APP' : chans.includes('whatsapp') ? 'WHATSAPP' : 'IN_APP';
        await apiFetch(`/v1/shipments/${shipmentId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: text, channel }),
        });
        onRefresh();
      } else {
        const msg: ThreadMsg = { id: 'msg-' + Date.now(), userId: 'me', userName: 'You', content: text, ts: new Date(), channels: isInternal ? ['internal'] : (chans.length ? chans : ['internal']), isInternal };
        updateJob(job.id, j => ({ ...j, thread: [...j.thread, msg] }));
      }
      setText('');
    } catch (err: any) { showAlert(err.message || 'Send failed'); } finally { setSending(false); }
  }

  async function handleSetStage(stage: Stage) {
    if (stage === job.stage) { setShowStageBar(false); return; }
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    const stageLabel = STAGES.find(s => s.id === stage)?.label ?? stage;
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/stage`, {
          method: 'PATCH',
          body: JSON.stringify({ stage: STAGE_API_MAP[stage] ?? stage.toUpperCase(), note: 'Stage updated from Updates tab' }),
        });
        onRefresh();
      } else {
        const event: TimelineEvent = { id: 'ev-' + Date.now(), stage, label: stageLabel, userId: 'me', userName: 'You', ts: new Date(), note: 'Stage updated from Updates tab' };
        const msg: ThreadMsg = { id: 'msg-' + Date.now(), userId: 'me', userName: 'You', content: `Stage updated → ${stageLabel}`, ts: new Date(), channels: isInternal ? ['internal'] : (chans.length ? chans : ['internal']), isInternal: false };
        updateJob(job.id, j => ({ ...j, stage, timeline: [...j.timeline, event], thread: [...j.thread, msg] }));
      }
    } catch (err: any) { showAlert(err.message || 'Stage update failed'); }
    setShowStageBar(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
        {job.thread.map(msg => (
          <div key={msg.id} style={{ display: 'flex', gap: 12 }}>
            <Av name={msg.userName} size={34} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{msg.userName}</span>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{fdatetime(msg.ts)}</span>
                {msg.isInternal && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '2px 7px', borderRadius: 3, background: 'var(--bg)', color: 'var(--ink3)', border: '1px solid var(--border)', fontWeight: 600 }}><Icon name="lock" size={9} /> Internal Only</span>}
                {msg.channels.filter(c => c !== 'internal').map(c => <ChBadge key={c} ch={c} />)}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, padding: '12px 16px', background: msg.isInternal ? 'var(--bg)' : 'var(--white)', border: '1px solid var(--border)', borderRadius: '0 10px 10px 10px', borderTopLeftRadius: 2 }}>
                {msg.content}
                {msg.attachments?.map(a => (
                  <div key={a} style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, color: 'var(--teal)', cursor: 'pointer' }}>
                    <Icon name="paperclip" size={13} /> {a}
                  </div>
                ))}
              </div>
              {msg.reactions?.map(r => (
                <button key={r.emoji} type="button" style={{ marginTop: 6, padding: 'var(--ds-btn-py-xs) 8px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  {r.emoji} {r.count}
                </button>
              ))}
            </div>
          </div>
        ))}
        {job.thread.length === 0 && <div style={{ fontSize: 14, color: 'var(--ink3)', textAlign: 'center', padding: '32px 0' }}>No updates yet. Post the first update below.</div>}
        <div ref={bottomRef} />
      </div>

      {/* ── Quick Stage Update ── */}
      {showStageBar && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--teal)', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ padding: '10px 14px', background: 'var(--teal-l)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>Set Stage — click to update</span>
            <button type="button" onClick={() => setShowStageBar(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}><Icon name="x" size={13} color="var(--teal)" /></button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px' }}>
            {STAGES.map((s, i) => {
              const cur = s.id === job.stage;
              const past = stageIdx(s.id) < stageIdx(job.stage);
              return (
                <button key={s.id} type="button" onClick={() => handleSetStage(s.id)}
                  style={{ fontSize: 11, fontWeight: 700, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 'var(--r)', cursor: 'pointer', border: `1.5px solid ${cur ? 'var(--teal)' : past ? 'var(--green)' : 'var(--border)'}`, background: cur ? 'var(--teal)' : past ? 'var(--green-l)' : 'var(--white)', color: cur ? '#fff' : past ? 'var(--green)' : 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 5, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: .7 }}>{i + 1}</span> {s.short}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>Post to:</span>
          <button type="button" onClick={() => setIsInternal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 'var(--ds-btn-py-xs) 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${isInternal ? 'var(--ink3)' : 'var(--border)'}`, background: isInternal ? 'var(--bg)' : 'var(--white)', color: isInternal ? 'var(--ink)' : 'var(--ink3)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}><Icon name="lock" size={11} /> Internal Note</button>
          <button type="button" onClick={() => { setIsInternal(false); if (!chans.length) setChans(['whatsapp']); }} style={{ padding: 'var(--ds-btn-py-xs) 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${!isInternal ? CH_CFG.whatsapp.color : 'var(--border)'}`, background: !isInternal ? CH_CFG.whatsapp.bg : 'var(--white)', color: !isInternal ? CH_CFG.whatsapp.color : 'var(--ink3)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>↗ Share Update</button>
          {!isInternal && (['whatsapp', 'email', 'teams', 'sms'] as Channel[]).map(ch => {
            const cfg = CH_CFG[ch]; const on = chans.includes(ch);
            return <button key={ch} type="button" onClick={() => toggleCh(ch)} style={{ padding: 'var(--ds-btn-py-xs) 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? cfg.color : 'var(--border)'}`, background: on ? cfg.bg : 'var(--white)', color: on ? cfg.color : 'var(--ink3)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>{cfg.label}</button>;
          })}
        </div>
        <div style={{ padding: '12px 16px' }}>
          <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend(); }} rows={3}
            placeholder={isInternal ? 'Write an internal note — not visible to customer…' : 'Write a customer update — will be sent via selected channels…'}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, resize: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box' as const, lineHeight: 1.5, outline: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Ctrl+Enter to send</span>
              <button type="button" onClick={() => setShowStageBar(s => !s)}
                title="Set shipment stage"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 'var(--ds-btn-py-sm) 12px', background: showStageBar ? 'var(--teal-l)' : 'var(--bg)', color: showStageBar ? 'var(--teal)' : 'var(--ink3)', border: `1px solid ${showStageBar ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 'var(--r)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .12s', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                <Icon name="flag" size={13} color={showStageBar ? 'var(--teal)' : 'var(--ink3)'} /> Set Stage
              </button>
            </div>
            <button type="button" onClick={handleSend} disabled={sending || !text.trim()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 18px', background: text.trim() && !sending ? 'var(--teal)' : 'var(--border)', color: text.trim() && !sending ? '#fff' : 'var(--ink3)', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: text.trim() && !sending ? 'pointer' : 'default', transition: 'all 0.15s', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <Icon name="send" size={14} /> {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function CustomerOverviewTab({ job, isMobile }: { job: ClearanceJob; isMobile: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>Your Shipment's Journey</div>
          <CustomerMilestoneTimeline job={job} />
        </div>

        <CustomerAttentionPanel job={job} />

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Shipment Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 2 }}>
            {([
              ['B/L Number',  job.bl || '—',                                   true ],
              ['Vessel',      job.vessel || '—',                               false],
              ['Transport',   job.mode,                                        false],
              ['Origin',      job.origin || '—',                               false],
              ['Destination', job.destination || '—',                          false],
              ['Gross Weight',job.weight || '—',                               false],
              ['Containers',  (job.containers?.length ?? 0) > 0 ? (job.containers ?? []).join(', ') : '—', true],
            ] as [string,string,boolean][]).map(([k, v, mono], i) => (
              <div key={k} style={{ padding: '8px 10px', background: i % 2 === 0 ? 'var(--bg)' : 'var(--white)', borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--ink3)', marginBottom: 1 }}>{k}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', fontFamily: mono ? 'var(--mono)' : undefined, wordBreak: 'break-all' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <CustomerAgentCard job={job} />
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Shared Documents</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 10 }}>{job.documents.length} document{job.documents.length === 1 ? '' : 's'} on this shipment</div>
          <Link to={`?tab=files`} style={{ display: 'block', textAlign: 'center', padding: '9px 0', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', textDecoration: 'none' }}>
            View Files
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Card shell — one consistent card style used across the redesigned Overview ──
function Card({ title, action, padded = true, children }: { title?: string; action?: React.ReactNode; padded?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
          {action}
        </div>
      )}
      <div style={{ padding: padded ? '18px' : 0 }}>{children}</div>
    </div>
  );
}

function SpecRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--bg)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink3)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', fontFamily: mono ? 'var(--mono)' : undefined, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

const DOC_TYPE_LABEL: Record<string, string> = { bl: 'Bill of Lading', awb: 'Air Waybill', invoice: 'Commercial Invoice', packing_list: 'Packing List', permit: 'Permit', certificate: 'Certificate', other: 'Document' };

function OverviewTab({ job, isMobile }: { job: ClearanceJob; isMobile: boolean }) {
  const company = useCompany();
  const totalTasks   = job.tasks.length;
  const doneTasks    = job.tasks.filter(t => t.status === 'complete').length;
  const totalHours   = job.timeEntries.reduce((s, e) => s + e.hours, 0);
  const totalCharges = job.ledger.filter(e => e.type === 'charge').reduce((s, e) => s + e.amount, 0);
  const totalPaid    = job.ledger.filter(e => e.type === 'payment').reduce((s, e) => s + e.amount, 0);
  const daysLeft     = job.dueDate ? Math.ceil((job.dueDate.getTime() - Date.now()) / 86400000) : null;
  const isOverdueBal = job.dueDate ? new Date() > job.dueDate : false;
  const balanceDue   = Math.max(0, totalCharges - totalPaid);

  async function downloadDoc(doc: ShipDoc) {
    try { await apiDownload(`/v1/shipments/${job.id}/documents/${doc.id}/download`, doc.name); }
    catch (e: any) { showAlert(e.message ?? 'Download failed'); }
  }

  async function viewDoc(doc: ShipDoc) {
    try { await apiViewBlob(`/v1/shipments/${job.id}/documents/${doc.id}/view`); }
    catch (e: any) { showAlert(e.message ?? 'View failed'); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 12 }}>
        {[
          { label: 'Tasks',        value: `${doneTasks}/${totalTasks}`, sub: `${totalTasks - doneTasks} open`,         color: 'var(--teal)', icon: 'checkCircle' as IconName },
          { label: 'Days Left',    value: daysLeft !== null ? (daysLeft >= 0 ? String(daysLeft) : 'Overdue') : '—', sub: job.dueDate ? fdate(job.dueDate) : 'No due date', color: daysLeft !== null && daysLeft < 0 ? 'var(--red)' : 'var(--ink)', icon: 'clock' as IconName },
          { label: 'Hours Logged', value: totalHours.toFixed(1),        sub: `${job.timeEntries.length} entries`,     color: 'var(--blue)', icon: 'activity' as IconName },
          { label: 'Documents',    value: String(job.documents.length),  sub: `${job.documents.filter(d => d.extracted?.status === 'done').length} AI extracted`, color: 'var(--purple)', icon: 'folder' as IconName },
          { label: 'Total Charges',value: totalCharges > 0 ? `TZS ${(totalCharges/1_000_000).toFixed(1)}M` : '—', sub: `${job.ledger.filter(e => e.type==='charge').length} entries`, color: 'var(--red)', icon: 'receipt' as IconName },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Icon name={c.icon} size={12} color={c.color} />
              <span style={{ fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color, marginBottom: 2 }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Financial summary bar — Paid / Due / Overdue, like a payment ledger snapshot */}
      {(totalCharges > 0 || totalPaid > 0) && (
        <Card title="Financial Summary">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--ink2)' }}>Total charges: <strong style={{ color: 'var(--ink)' }}>{fmtTZS(totalCharges)}</strong></span>
            <span style={{ fontSize: 13, color: 'var(--ink2)' }}>Paid: <strong style={{ color: 'var(--green, var(--green))' }}>{fmtTZS(totalPaid)}</strong></span>
          </div>
          <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', background: 'var(--bg)' }}>
            {totalCharges > 0 && (
              <>
                <div style={{ width: `${Math.min(100, (totalPaid / totalCharges) * 100)}%`, background: 'var(--green)' }} />
                {balanceDue > 0 && <div style={{ width: `${Math.min(100, (balanceDue / totalCharges) * 100)}%`, background: isOverdueBal ? 'var(--red)' : 'var(--gold)' }} />}
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap', fontSize: 11.5 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink2)' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--green)', display: 'inline-block' }} />Paid {fmtTZS(totalPaid)}</span>
            {balanceDue > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: isOverdueBal ? 'var(--red)' : 'var(--gold)', display: 'inline-block' }} />
                {isOverdueBal ? 'Overdue' : 'Due'} {fmtTZS(balanceDue)}
              </span>
            )}
          </div>
        </Card>
      )}

      {/* 2-col body */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 16 }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Shipment Details">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 32px' }}>
              <div>
                <SpecRow label="B/L Number" value={job.bl || '—'} mono />
                <SpecRow label="TANSAD" value={job.tansad || '—'} mono />
                <SpecRow label="Vessel" value={job.vessel || '—'} />
                <SpecRow label="Transport" value={job.mode} />
                <SpecRow label="Containers" value={(job.containers?.length ?? 0) > 0 ? job.containers!.join(', ') : '—'} mono />
              </div>
              <div>
                <SpecRow label="Origin" value={job.origin || '—'} />
                <SpecRow label="Destination" value={job.destination || '—'} />
                <SpecRow label="Gross Weight" value={job.weight || '—'} />
                <SpecRow label="CIF Value" value={job.invoiceValue || '—'} />
                <SpecRow label="Customer" value={job.customerId ? <Link to={`/crm/customers?id=${job.customerId}`} style={{ color: 'var(--teal)' }}>{job.customer}</Link> : job.customer} />
              </div>
            </div>
          </Card>

          {/* Contact Details — Ship From (our company) / Ship To (customer) */}
          <Card title="Contact Details">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  <Icon name="building" size={12} color="var(--ink3)" /> Ship From (Us)
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{company.name}</div>
                {company.address && <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 6 }}>{company.address}{company.city ? `, ${company.city}` : ''}</div>}
                {company.phone && <div style={{ fontSize: 12, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}><Icon name="phone" size={11} color="var(--ink3)" />{company.phone}</div>}
                {company.email && <div style={{ fontSize: 12, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="mail" size={11} color="var(--ink3)" />{company.email}</div>}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  <Icon name="mapPin" size={12} color="var(--ink3)" /> Ship To (Customer)
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                  {job.customerId ? <Link to={`/crm/customers?id=${job.customerId}`} style={{ color: 'var(--ink)', textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>{job.customer}</Link> : job.customer}
                </div>
                {job.customerContactName && <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 6 }}>Attn: {job.customerContactName}</div>}
                {job.customerPhone && <div style={{ fontSize: 12, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}><Icon name="phone" size={11} color="var(--ink3)" />{job.customerPhone}</div>}
                {job.customerEmail && <div style={{ fontSize: 12, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="mail" size={11} color="var(--ink3)" />{job.customerEmail}</div>}
                {!job.customerPhone && !job.customerEmail && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No contact on file</div>}
              </div>
            </div>
          </Card>

          {/* Documents */}
          <Card title="Documents" padded={false} action={job.documents.length > 0 ? (
            <button type="button" onClick={() => job.documents.forEach(downloadDoc)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Icon name="download" size={12} color="var(--teal)" /> Download All
            </button>
          ) : undefined}>
            {job.documents.length === 0 ? (
              <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No documents yet.</div>
            ) : (
              job.documents.map((d, i) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < job.documents.length - 1 ? '1px solid var(--bg)' : 'none' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="fileText" size={15} color="var(--ink3)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{DOC_TYPE_LABEL[d.type] ?? d.type} · {fdate(d.uploadedAt)}</div>
                  </div>
                  {d.extracted?.status === 'done' && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(124,58,237,0.1)', color: 'var(--purple)', flexShrink: 0 }}>AI ✓</span>
                  )}
                  <button type="button" onClick={() => viewDoc(d)} title="View" style={{ width: 30, height: 30, borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="eye" size={13} color="var(--ink3)" />
                  </button>
                  <button type="button" onClick={() => downloadDoc(d)} title="Download" style={{ width: 30, height: 30, borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="download" size={13} color="var(--ink3)" />
                  </button>
                </div>
              ))
            )}
          </Card>

          <LinkedAppsPanel shipmentId={job.id} isMobile={isMobile} />
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Assigned officer */}
          {job.assigneeName && (
            <Card title="Assigned Officer">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: avatarBg(job.assigneeName), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700 }}>
                  {initials(job.assigneeName)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{job.assigneeName}</div>
                  {job.assigneeEmail && <div style={{ fontSize: 11.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.assigneeEmail}</div>}
                </div>
              </div>
            </Card>
          )}

          {/* What the workflow did, next to what people did. */}
          <AutomationHistoryCard shipmentId={job.id} />

          {/* Activity feed — timeline style */}
          <Card title="Activity Feed" padded={false}>
            <div style={{ maxHeight: 520, overflowY: 'auto', padding: job.activity.length ? '16px 18px' : 0 }}>
              {job.activity.length === 0 ? (
                <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No activity yet.</div>
              ) : (
                [...job.activity].reverse().map((ev, i, arr) => (
                  <div key={ev.id} style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: i < arr.length - 1 ? 18 : 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--teal)', marginTop: 3, flexShrink: 0 }} />
                      {i < arr.length - 1 && <div style={{ width: 1.5, flex: 1, background: 'var(--border)', marginTop: 2 }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 700 }}>{ev.userName}</span>{' '}{ev.subject}
                        {ev.detail && <span style={{ color: 'var(--ink3)' }}> — {ev.detail}</span>}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2 }}>{fdatetime(ev.ts)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Linked Apps panel — real cross-app data pulled by shipment_id ───────────
// Invoices (Finance), Demurrage containers, AWB/BL tracker snapshots, and the
// HuduFreight transport trip — every card links into that app's own real
// page. Nothing here is computed locally; it's GET /v1/shipments/:id/linked.

interface LinkedData {
  invoices: { id: string; invoice_number: string; status: string; due_date: string | null; tra_total_incl: number | null }[];
  demurrage_containers: { id: string; container_number: string; demurrage_days: number; demurrage_cost: number; demurrage_currency: string; status: string }[];
  tracker_snapshots: { id: string; tracking_type: string; tracking_number: string; status: string | null; eta: string | null; progress_pct: number }[];
  transport_trips: { id: string; status: string; job_type: string; scheduled_start: string | null; actual_start: string | null; vehicle_name: string | null; plate_number: string | null; driver_name: string | null }[];
}

function LinkedAppsPanel({ shipmentId, isMobile }: { shipmentId: string; isMobile: boolean }) {
  const [data, setData] = useState<LinkedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shipmentId) return;
    setLoading(true);
    apiFetch(`/v1/shipments/${shipmentId}/linked`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [shipmentId]);

  if (loading || !data) return null;

  const cards: { app: string; icon: IconName; color: string; href: string; body: React.ReactNode }[] = [];

  if (data.invoices.length > 0) {
    cards.push({
      app: 'FinOps — Invoices', icon: 'dollarSign', color: '#0284c7', href: '/finance/invoices',
      body: data.invoices.slice(0, 3).map(inv => (
        <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{inv.invoice_number}</span>
          <span style={{ color: 'var(--ink3)' }}>{inv.status}{inv.tra_total_incl ? ` · TZS ${Number(inv.tra_total_incl).toLocaleString()}` : ''}</span>
        </div>
      )),
    });
  }
  if (data.demurrage_containers.length > 0) {
    cards.push({
      app: 'Demurrage', icon: 'alertTriangle', color: 'var(--red)', href: '/demurrage',
      body: data.demurrage_containers.slice(0, 3).map(c => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{c.container_number}</span>
          <span style={{ color: c.demurrage_days > 0 ? 'var(--red)' : 'var(--ink3)', fontWeight: c.demurrage_days > 0 ? 700 : 400 }}>
            {c.demurrage_days > 0 ? `${c.demurrage_days}d · ${c.demurrage_currency} ${Number(c.demurrage_cost).toLocaleString()}` : c.status}
          </span>
        </div>
      )),
    });
  }
  if (data.tracker_snapshots.length > 0) {
    cards.push({
      app: 'CargoTracker', icon: 'map', color: '#4f46e5', href: '/cargotracker',
      body: data.tracker_snapshots.slice(0, 3).map(t => (
        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{t.tracking_number}</span>
          <span style={{ color: 'var(--ink3)' }}>{t.status ?? '—'}{t.progress_pct ? ` · ${t.progress_pct}%` : ''}</span>
        </div>
      )),
    });
  }
  if (data.transport_trips.length > 0) {
    cards.push({
      app: 'HuduFreight — Transport', icon: 'truck', color: 'var(--blue)', href: '/tracking/trips',
      body: data.transport_trips.slice(0, 3).map(t => (
        <div key={t.id} style={{ fontSize: 12, padding: '4px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{t.vehicle_name || 'Vehicle TBD'}{t.plate_number ? ` (${t.plate_number})` : ''}</span>
            <span style={{ color: 'var(--ink3)' }}>{t.status}</span>
          </div>
          {t.driver_name && <div style={{ color: 'var(--ink3)' }}>Driver: {t.driver_name}</div>}
        </div>
      )),
    });
  }

  if (cards.length === 0) {
    return (
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Linked Apps</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No invoices, demurrage tracking, AWB/BL snapshots, or transport trips linked to this shipment yet.</div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Linked Apps</div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 10 }}>
        {cards.map(c => (
          <Link key={c.app} to={c.href} style={{ display: 'block', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <Icon name={c.icon} size={13} color={c.color} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: c.color }}>{c.app}</span>
            </div>
            {c.body}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Tasks Tab ────────────────────────────────────────────────────────────────

const TASK_STATUS_CFG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  not_started:       { label: 'Not Started',       color: 'var(--ink3)', bg: 'var(--bg)' },
  in_progress:       { label: 'In Progress',       color: 'var(--blue)', bg: 'var(--blue-l)' },
  testing:           { label: 'Testing',           color: 'var(--purple)', bg: 'var(--purple-l)' },
  awaiting_feedback: { label: 'Awaiting Feedback', color: 'var(--gold)', bg: 'var(--gold-l)' },
  complete:          { label: 'Complete',           color: 'var(--green)', bg: 'var(--green-l)' },
};
const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'var(--green)' },
  medium: { label: 'Medium', color: 'var(--gold)' },
  high:   { label: 'High',   color: 'var(--gold)' },
  urgent: { label: 'Urgent', color: 'var(--red)' },
};

function TasksTab({ job, isMobile, shipmentId, isLive, onRefresh }: { job: ClearanceJob; isMobile: boolean; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [search,       setSearch]       = useState('');
  const [showAdd,      setShowAdd]      = useState(false);
  const [newTitle,     setNewTitle]     = useState('');
  const [newTitleCustom, setNewTitleCustom] = useState(false);
  const [newAssignee,  setNewAssignee]  = useState(job.assignees[0] || '');
  const [newDue,       setNewDue]       = useState('');
  const [newPriority,  setNewPriority]  = useState<'medium' | 'low' | 'high' | 'urgent'>('medium');
  const [newProductId, setNewProductId] = useState('');
  const [addSaving,    setAddSaving]    = useState(false);
  const [taskTypes,    setTaskTypes]    = useState<{ id: string; name: string }[]>([]);
  const [staff,        setStaff]        = useState<{ id: string; name: string }[]>([]);
  const [services,     setServices]     = useState<{ id: string; name: string; sale_price: number; currency: string; unit: string }[]>([]);
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen: triggerOpenRaw } = useClockIn();
  const triggerOpen = () => triggerOpenRaw({ shipmentId: job.id, shipmentRef: job.sysRef || job.id });
  const isStaff = !!(user && user.role !== 'CUSTOMER');

  useEffect(() => {
    apiFetch('/v1/hr/tasks').then((res: any) => {
      const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
      setTaskTypes(list.map(t => ({ id: t.id, name: t.name })));
    }).catch(() => {});
    apiFetch('/v1/hr/staff').then((res: any) => {
      const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
      setStaff(list.filter(u => u.status !== 'INACTIVE').map(u => ({ id: u.id, name: u.name })));
    }).catch(() => {});
    // Products & Services catalog (ClearOS → Tools → Products & Services) —
    // lets a task be tagged with which billable clearing/freight service it's
    // for, so the rate carries through to Timesheets and can be recalled when
    // writing the invoice in FinOps.
    apiFetch('/v1/products?status=active').then((res: any) => {
      const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
      setServices(list.map(p => ({ id: p.id, name: p.name, sale_price: Number(p.sale_price) || 0, currency: p.currency, unit: p.unit })));
    }).catch(() => {});
  }, []);

  async function handleAddTaskType() {
    if (!newTitle.trim()) return;
    try {
      const created: any = await apiFetch('/v1/hr/tasks', { method: 'POST', body: JSON.stringify({ name: newTitle.trim() }) });
      setTaskTypes(prev => [...prev, { id: created.id, name: created.name }]);
    } catch { /* still usable as a free-text title even if the catalog write fails */ }
  }

  const statuses: TaskStatus[] = ['not_started', 'in_progress', 'testing', 'awaiting_feedback', 'complete'];
  const counts = { all: job.tasks.length } as Record<TaskStatus | 'all', number>;
  for (const s of statuses) counts[s] = job.tasks.filter(t => t.status === s).length;

  const visible = job.tasks.filter(t =>
    (filterStatus === 'all' || t.status === filterStatus) &&
    (!search || t.title.toLowerCase().includes(search.toLowerCase()))
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    setAddSaving(true);
    try {
      // A custom-typed title that isn't already in the catalog gets persisted
      // as a new task type first, so it shows up in the dropdown from now on.
      if (newTitleCustom && !taskTypes.some(t => t.name.toLowerCase() === newTitle.trim().toLowerCase())) {
        await handleAddTaskType();
      }
      const assigneeName = staff.find(s => s.id === newAssignee)?.name;
      const service = services.find(s => s.id === newProductId);
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/tasks`, {
          method: 'POST',
          body: JSON.stringify({ title: newTitle, priority: newPriority, assigned_to: newAssignee || undefined, due_date: newDue || undefined, product_id: newProductId || undefined }),
        });
        onRefresh();
      } else {
        const task: InternalTask = {
          id: 'task-' + Date.now(), title: newTitle, status: 'not_started', priority: newPriority,
          assignees: newAssignee ? [assigneeName || newAssignee] : [], startDate: new Date(),
          dueDate: newDue ? new Date(newDue) : new Date(Date.now() + 7 * 86400000), tags: [],
          productId: service?.id, serviceName: service?.name, serviceRate: service?.sale_price,
          serviceCurrency: service?.currency, serviceUnit: service?.unit,
        };
        updateJob(job.id, j => ({ ...j, tasks: [...j.tasks, task] }));
      }
      setNewTitle(''); setNewDue(''); setNewTitleCustom(false); setNewProductId(''); setShowAdd(false);
    } catch (err: any) { showAlert(err.message || 'Failed to create task'); } finally { setAddSaving(false); }
  }

  return (
    <div>
      {/* Status filter strip */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setFilterStatus('all')} style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${filterStatus === 'all' ? 'var(--teal)' : 'var(--border)'}`, background: filterStatus === 'all' ? 'var(--teal-l)' : 'var(--white)', color: filterStatus === 'all' ? 'var(--teal)' : 'var(--ink3)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>All <span style={{ fontWeight: 700 }}>{counts.all}</span></button>
        {statuses.map(s => { const cfg = TASK_STATUS_CFG[s]; const on = filterStatus === s; return (
          <button key={s} type="button" onClick={() => setFilterStatus(s)} style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? cfg.color : 'var(--border)'}`, background: on ? cfg.bg : 'var(--white)', color: on ? cfg.color : 'var(--ink3)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
            {cfg.label} <span style={{ fontWeight: 700 }}>{counts[s]}</span>
          </button>
        ); })}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…" className="input-field" style={{ flex: 1, fontSize: 13 }} />
        <button type="button" onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="plus" size={14} /> Add Task
        </button>
      </div>

      {/* Add-task form */}
      {showAdd && (
        <form onSubmit={handleAdd} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>New Task</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Task Title</label>
              {newTitleCustom ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="input-field" placeholder="New task name…" required autoFocus style={{ flex: 1 }} />
                  <button type="button" onClick={() => { setNewTitleCustom(false); setNewTitle(''); }} title="Choose from list instead" className="btn btn-secondary btn-sm">
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ) : (
                <Select
                  value={newTitle}
                  onValueChange={v => { if (v === '__new__') { setNewTitleCustom(true); setNewTitle(''); } else { setNewTitle(v); } }}
                >
                  <SelectTrigger><SelectValue placeholder="Select a task…" /></SelectTrigger>
                  <SelectContent>
                    {taskTypes.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                    <SelectItem value="__new__">+ Add new task…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Assignee</label>
              <Combobox
                options={[{ value: '', label: 'Unassigned' }, ...staff.map(s => ({ value: s.id, label: s.name }))]}
                value={newAssignee} onChange={setNewAssignee} placeholder="Unassigned"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Due Date</label>
              <DatePicker date={parseDateOnly(newDue)} onChange={d => setNewDue(toDateOnlyString(d))} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Priority</label>
              <Select value={newPriority} onValueChange={v => setNewPriority(v as 'medium')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['low','medium','high','urgent'] as const).map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Billable Service (optional)</label>
            <Combobox
              options={[{ value: '', label: 'No service (unbilled)' }, ...services.map(s => ({ value: s.id, label: s.name, sublabel: `${fmtServiceRate(s.sale_price, s.currency)}/${s.unit}` }))]}
              value={newProductId} onChange={setNewProductId} placeholder="No service (unbilled)"
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={addSaving}>{addSaving ? 'Saving…' : 'Add Task'}</button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn btn-secondary btn-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="rtbl-wrap">
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table className="rtbl" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['#','Task','Service','Status','Start','Due','Assignees','Priority','Tags'].map(h => (
              <th key={h} style={{ padding: '10px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No tasks match this filter.</td></tr>}
            {visible.map((task, i) => {
              const sCfg = TASK_STATUS_CFG[task.status];
              const pCfg = PRIORITY_CFG[task.priority];
              const overdue = task.dueDate && new Date() > task.dueDate && task.status !== 'complete';
              return (
                <tr key={task.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--white)' : 'var(--bg)' }}>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)', width: 36 }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px', maxWidth: 240 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                    {task.description && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.description}</div>}
                  </td>
                  <td style={{ padding: '10px 14px', maxWidth: 160 }}>
                    {task.serviceName ? (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.serviceName}</div>
                        <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 600 }}>{fmtServiceRate(task.serviceRate || 0, task.serviceCurrency || 'USD')}/{task.serviceUnit}</div>
                      </>
                    ) : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: sCfg.bg, color: sCfg.color, whiteSpace: 'nowrap' }}>{sCfg.label}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fdate(task.startDate)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: overdue ? 'var(--red)' : 'var(--ink3)', fontWeight: overdue ? 700 : 400, whiteSpace: 'nowrap' }}>{fdate(task.dueDate)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {task.assignees.slice(0, 3).map(a => (
                        <div key={a} title={a} style={{ width: 24, height: 24, borderRadius: '50%', background: avatarBg(a), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{initials(a)}</div>
                      ))}
                      {task.assignees.length > 3 && <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--border)', color: 'var(--ink3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>+{task.assignees.length - 3}</div>}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: pCfg.color }}>{task.priority.toUpperCase()}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {task.tags.map(tag => <span key={tag} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--bg)', color: 'var(--ink3)', border: '1px solid var(--border)' }}>{tag}</span>)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

// ─── Timesheets Tab ───────────────────────────────────────────────────────────

function TimesheetsTab({ job, isMobile, shipmentId, isLive, onRefresh }: { job: ClearanceJob; isMobile: boolean; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const [showLog,   setShowLog]   = useState(false);
  const [logMember, setLogMember] = useState(job.assignees[0] || '');
  const [logTask,   setLogTask]   = useState(job.tasks[0]?.id || '');
  const [logHours,  setLogHours]  = useState('');
  const [logNote,   setLogNote]   = useState('');
  const [logDate,   setLogDate]   = useState(new Date().toISOString().slice(0, 10));
  const [logProductId, setLogProductId] = useState(job.tasks[0]?.productId || '');
  const [logSaving, setLogSaving] = useState(false);
  const [staff,     setStaff]     = useState<{ id: string; name: string }[]>([]);
  const [services,  setServices]  = useState<{ id: string; name: string; sale_price: number; currency: string; unit: string }[]>([]);
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen: triggerOpenRaw } = useClockIn();
  const triggerOpen = () => triggerOpenRaw({ shipmentId: job.id, shipmentRef: job.sysRef || job.id });
  const isStaff = !!(user && user.role !== 'CUSTOMER');

  useEffect(() => {
    apiFetch('/v1/hr/staff').then((res: any) => {
      const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
      setStaff(list.filter(u => u.status !== 'INACTIVE').map(u => ({ id: u.id, name: u.name })));
    }).catch(() => {});
    apiFetch('/v1/products?status=active').then((res: any) => {
      const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
      setServices(list.map(p => ({ id: p.id, name: p.name, sale_price: Number(p.sale_price) || 0, currency: p.currency, unit: p.unit })));
    }).catch(() => {});
  }, []);

  // hourly-unit services bill hours × rate; everything else (per-shipment,
  // per-container, per-set, ...) bills the flat rate once per logged entry —
  // multiplying a per-shipment clearance fee by hours worked would overstate it.
  function entryAmount(e: TimeEntry): number | null {
    if (e.serviceRate == null) return null;
    return e.serviceUnit === 'hour' || e.serviceUnit === 'hr' ? e.hours * e.serviceRate : e.serviceRate;
  }
  const billableByCurrency = job.timeEntries.reduce<Record<string, number>>((acc, e) => {
    const amt = entryAmount(e);
    if (amt != null && e.serviceCurrency) acc[e.serviceCurrency] = (acc[e.serviceCurrency] || 0) + amt;
    return acc;
  }, {});

  const totalHours = job.timeEntries.reduce((s, e) => s + e.hours, 0);

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    if (!logHours) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    const h = parseFloat(logHours);
    const memberName = staff.find(s => s.id === logMember)?.name || logMember;
    const service = services.find(s => s.id === logProductId);
    setLogSaving(true);
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/time-entries`, {
          method: 'POST',
          body: JSON.stringify({ member: memberName, task_ref: job.tasks.find(t => t.id === logTask)?.title || undefined, hours: h, note: logNote || undefined, log_date: logDate, product_id: logProductId || undefined }),
        });
        onRefresh();
      } else {
        const task = job.tasks.find(t => t.id === logTask);
        const entry: TimeEntry = {
          id: 'te-' + Date.now(), memberId: logMember, memberName: memberName,
          taskId: logTask, taskTitle: task?.title || 'General',
          duration: `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}:00`,
          hours: h, date: new Date(logDate), billable: true, note: logNote || undefined,
          productId: service?.id, serviceName: service?.name, serviceRate: service?.sale_price,
          serviceCurrency: service?.currency, serviceUnit: service?.unit,
        };
        updateJob(job.id, j => ({ ...j, timeEntries: [...j.timeEntries, entry] }));
      }
      setLogHours(''); setLogNote(''); setShowLog(false);
    } catch (err: any) { showAlert(err.message || 'Log failed'); } finally { setLogSaving(false); }
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
          Total: <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{totalHours.toFixed(1)} hrs</span> across {job.timeEntries.length} entries
          {Object.entries(billableByCurrency).length > 0 && (
            <span> · Billable: <span style={{ fontWeight: 700, color: 'var(--teal)' }}>{Object.entries(billableByCurrency).map(([cur, amt]) => fmtServiceRate(amt, cur)).join(' + ')}</span></span>
          )}
        </div>
        <button type="button" onClick={() => setShowLog(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="clock" size={14} /> Log Time
        </button>
      </div>

      {/* Log time form */}
      {showLog && (
        <form onSubmit={handleLog} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Log Time Entry</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Member</label>
              <Combobox
                options={staff.map(s => ({ value: s.id, label: s.name }))}
                value={logMember} onChange={setLogMember} placeholder="Select staff…"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Task</label>
              <Select value={logTask || '__general__'} onValueChange={v => {
                const taskId = v === '__general__' ? '' : v;
                setLogTask(taskId);
                setLogProductId(job.tasks.find(t => t.id === taskId)?.productId || '');
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__general__">General</SelectItem>
                  {job.tasks.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Hours</label>
              <input type="number" step="0.25" min="0.25" value={logHours} onChange={e => setLogHours(e.target.value)} className="input-field" placeholder="1.5" required style={{ width: '100%', fontFamily: 'var(--mono)' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Date</label>
              <DatePicker date={parseDateOnly(logDate)} onChange={d => setLogDate(toDateOnlyString(d))} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Billable Service (optional)</label>
            <Combobox
              options={[{ value: '', label: 'No service (unbilled)' }, ...services.map(s => ({ value: s.id, label: s.name, sublabel: `${fmtServiceRate(s.sale_price, s.currency)}/${s.unit}` }))]}
              value={logProductId} onChange={setLogProductId} placeholder="No service (unbilled)"
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Note (optional)</label>
            <input value={logNote} onChange={e => setLogNote(e.target.value)} className="input-field" placeholder="What was worked on…" style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={logSaving}>{logSaving ? 'Saving…' : 'Save Entry'}</button>
            <button type="button" onClick={() => setShowLog(false)} className="btn btn-secondary btn-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="rtbl-wrap">
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table className="rtbl" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Member','Task','Service','Date','Duration','Hours','Amount','Note'].map(h => (
              <th key={h} style={{ padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {job.timeEntries.length === 0 && <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No time logged yet. Click "Log Time" to start tracking.</td></tr>}
            {[...job.timeEntries].reverse().map((entry, i) => {
              const amt = entryAmount(entry);
              return (
              <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--white)' : 'var(--bg)' }}>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: avatarBg(entry.memberName), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials(entry.memberName)}</div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{entry.memberName}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12.5, color: 'var(--ink2)', maxWidth: 200 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{entry.taskTitle}</span>
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--ink3)', maxWidth: 160 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{entry.serviceName || '—'}</span>
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fdate(entry.date)}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{entry.duration}</td>
                <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>{entry.hours.toFixed(2)}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: 'var(--teal)', whiteSpace: 'nowrap' }}>{amt != null ? fmtServiceRate(amt, entry.serviceCurrency || 'USD') : '—'}</td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--ink3)', maxWidth: 180 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{entry.note || '—'}</span>
                </td>
              </tr>
              );
            })}
          </tbody>
          {job.timeEntries.length > 0 && (
            <tfoot>
              <tr style={{ background: 'var(--bg)', borderTop: '2px solid var(--border)' }}>
                <td colSpan={4} style={{ padding: '10px 16px', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>TOTAL</td>
                <td style={{ padding: '10px 16px', fontSize: 15, fontWeight: 800, color: 'var(--blue)' }}>{totalHours.toFixed(2)}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 800, color: 'var(--teal)', whiteSpace: 'nowrap' }}>
                  {Object.entries(billableByCurrency).map(([cur, amt]) => fmtServiceRate(amt, cur)).join(' + ') || '—'}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </div>
    </div>
  );
}

// ─── Documents Tab ────────────────────────────────────────────────────────────

function ExtractedView({ doc }: { doc: ShipDoc }) {
  const ex = doc.extracted;
  if (!ex) return null;
  if (ex.status === 'processing') return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 8 }}>Extracting with AI…</div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: '65%', background: 'var(--teal)', borderRadius: 2 }} />
      </div>
    </div>
  );
  if (ex.status === 'pending') return <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '8px 0' }}>Click "Extract with AI" to parse this document.</div>;
  if (ex.status === 'failed')  return <div style={{ fontSize: 13, color: 'var(--red)' }}>Extraction failed. Please retry.</div>;
  return (
    <div>
      {ex.summary && <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 14, padding: '10px 14px', background: 'var(--green-l)', borderRadius: 6, borderLeft: '3px solid var(--green)', lineHeight: 1.5 }}>{ex.summary}</div>}
      {ex.sections?.map(sec => (
        <div key={sec.title} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{sec.title}</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {sec.fields.map((f, i) => (
              <div key={f.label} style={{ display: 'flex', padding: '8px 14px', background: i % 2 === 0 ? 'var(--white)' : 'var(--bg)', borderBottom: i < sec.fields.length - 1 ? '1px solid var(--border)' : 'none', gap: 16 }}>
                <span style={{ fontSize: 12, color: 'var(--ink3)', width: 200, flexShrink: 0 }}>{f.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: f.flag === 'err' ? 'var(--red)' : f.flag === 'warn' ? 'var(--gold)' : 'var(--ink)' }}>{f.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {ex.tables?.map(tbl => (
        <div key={tbl.title} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{tbl.title}</div>
          <div className="rtbl-wrap" style={{ border: '1px solid var(--border)' }}>
            <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr>{tbl.headers.map(h => <th key={h} style={{ padding: '8px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {tbl.rows.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                    {row.map((cell, ci) => <td key={ci} style={{ padding: '7px 12px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{cell}</td>)}
                  </tr>
                ))}
                {tbl.totalRow && (
                  <tr style={{ background: 'var(--bg)', fontWeight: 700 }}>
                    {tbl.totalRow.map((cell, ci) => <td key={ci} style={{ padding: '8px 12px', color: 'var(--ink)', borderTop: '2px solid var(--border)' }}>{cell}</td>)}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

const DOC_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'BL', label: 'Bill of Lading' },
  { value: 'AWB', label: 'Air Waybill' },
  { value: 'INVOICE', label: 'Commercial Invoice' },
  { value: 'PACKING_LIST', label: 'Packing List' },
  { value: 'PERMIT', label: 'Permit' },
  { value: 'CERTIFICATE', label: 'Certificate' },
  { value: 'CUSTOMS_ENTRY', label: 'Customs Entry' },
  { value: 'DUTY_RECEIPT', label: 'Duty Receipt' },
  { value: 'RELEASE_ORDER', label: 'Release Order' },
  { value: 'DELIVERY_NOTE', label: 'Delivery Note' },
  { value: 'OTHER', label: 'Other' },
];

interface StagedFile { id: string; file: File; type: string; }

function fmtFileSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function FilesTab({ job, isMobile, shipmentId, isLive, onRefresh }: { job: ClearanceJob; isMobile: boolean; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState('OTHER');
  const [uploadError, setUploadError] = useState('');
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [savingStaged, setSavingStaged] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const uploadTargetType = React.useRef('OTHER');

  function handleUploadClick(type?: string) {
    if (!isLive) { showAlert('Uploading is only available for live shipments, not demo data.'); return; }
    uploadTargetType.current = type || uploadType;
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const docType = uploadTargetType.current;
    setUploadError('');
    const newlyStaged: StagedFile[] = Array.from(files).map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file, type: docType,
    }));
    setStagedFiles(prev => [...prev, ...newlyStaged]);
    e.target.value = '';
  }

  function removeStaged(id: string) {
    setStagedFiles(prev => prev.filter(f => f.id !== id));
  }

  function setStagedType(id: string, type: string) {
    setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, type } : f));
  }

  async function saveStagedFiles() {
    if (stagedFiles.length === 0) return;
    setSavingStaged(true);
    setUploadError('');
    try {
      for (const sf of stagedFiles) {
        const formData = new FormData();
        formData.append('type', sf.type);
        formData.append('file', sf.file);
        await apiFetch(`/v1/shipments/${shipmentId}/documents/upload?type=${encodeURIComponent(sf.type)}`, {
          method: 'POST',
          body: formData,
        });
      }
      setStagedFiles([]);
      onRefresh();
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setSavingStaged(false);
    }
  }

  function handleDownload(doc: ShipDoc) {
    if (!isLive) { showAlert('Downloading is only available for live shipments, not demo data.'); return; }
    apiDownload(`/v1/shipments/${shipmentId}/documents/${doc.id}/download`, doc.name).catch(err => showAlert(err.message || 'Download failed'));
  }

  function handleView(doc: ShipDoc) {
    if (!isLive) { showAlert('Viewing is only available for live shipments, not demo data.'); return; }
    apiViewBlob(`/v1/shipments/${shipmentId}/documents/${doc.id}/view`).catch(err => showAlert(err.message || 'View failed'));
  }

  async function handleExtract(docId: string) {
    updateJob(job.id, j => ({ ...j, documents: j.documents.map(d => d.id === docId ? { ...d, extracted: { ...(d.extracted || {}), status: 'processing' as const } } : d) }));
    try {
      const blob = await apiFetchBlob(`/v1/shipments/${shipmentId}/documents/${docId}/view`);
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const image_base64 = dataUrl.split(',')[1];
      const media_type = blob.type || 'application/pdf';
      const res = await apiFetch('/v1/ocr/scan', {
        method: 'POST',
        body: JSON.stringify({ image_base64, media_type }),
      });
      const r = res.result || {};
      const toFields = (obj: Record<string, any>) =>
        Object.entries(obj || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: String(v) }));
      const sections = [
        { title: 'Overview', fields: toFields(r.overview) },
        { title: 'Parties', fields: toFields(r.parties) },
        { title: 'Financial', fields: toFields(r.financial) },
      ].filter(sec => sec.fields.length > 0);
      const confidence = typeof r.confidence === 'number' ? Math.round(r.confidence * 100) : undefined;
      updateJob(job.id, j => ({
        ...j,
        documents: j.documents.map(d => d.id === docId ? {
          ...d,
          extracted: {
            status: 'done' as const,
            docType: r.doc_type || 'Document',
            confidence,
            sections,
            summary: res.simulated
              ? 'Simulated extraction (no OCR key configured for this platform) — verify the fields below against the original document.'
              : `Extracted as ${r.doc_type || 'a document'} by AI. Review and verify the fields below.`,
          },
        } : d),
      }));
    } catch (err: any) {
      updateJob(job.id, j => ({ ...j, documents: j.documents.map(d => d.id === docId ? { ...d, extracted: { status: 'failed' as const } } : d) }));
      showAlert(err.message || 'Document extraction failed.');
    }
  }

  const uploadedDocuments = job.documents.filter(d => !d.pending);
  const extracted = uploadedDocuments.filter(d => d.extracted?.status === 'done');

  return (
    <div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={handleFileChange} />

      {extracted.length > 0 && (
        <div style={{ display: 'flex', gap: 16, padding: '14px 20px', background: 'var(--green-l)', border: '1px solid var(--green)', borderRadius: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--green)' }}>{extracted.length}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>Documents Extracted by AI</div>
            <div style={{ fontSize: 12, color: 'var(--green)' }}>Data captured from {extracted.map(d => d.name).join(', ')}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Select value={uploadType} onValueChange={setUploadType} disabled={savingStaged}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOC_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <button type="button" onClick={() => handleUploadClick()} disabled={savingStaged}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: savingStaged ? 'wait' : 'pointer', opacity: savingStaged ? 0.75 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="upload" size={14} /> Upload Document
          </button>
        </div>
        {uploadError && <div style={{ fontSize: 12, color: 'var(--red)' }}>{uploadError}</div>}
      </div>

      {stagedFiles.length > 0 && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--teal)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
              {stagedFiles.length} file{stagedFiles.length !== 1 ? 's' : ''} ready to upload
            </div>
            <button type="button" onClick={() => setStagedFiles([])} disabled={savingStaged}
              style={{ fontSize: 12, color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              Clear all
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {stagedFiles.map(sf => (
              <div key={sf.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, background: 'var(--bg)' }}>
                <Icon name={docIcon(sf.type.toLowerCase())} size={18} color="var(--teal)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sf.file.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{fmtFileSize(sf.file.size)}</div>
                </div>
                <Select value={sf.type} onValueChange={v => setStagedType(sf.id, v)} disabled={savingStaged}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button type="button" onClick={() => removeStaged(sf.id)} disabled={savingStaged} title="Remove"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', flexShrink: 0 }}>
                  <Icon name="x" size={16} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => handleUploadClick()} disabled={savingStaged}
              style={{ padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              + Add more
            </button>
            <button type="button" onClick={saveStagedFiles} disabled={savingStaged}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: savingStaged ? 'wait' : 'pointer', opacity: savingStaged ? 0.75 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {savingStaged ? 'Saving…' : `Save ${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {uploadedDocuments.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink3)', fontSize: 14 }}>
          No documents uploaded yet. Upload B/L, Invoice, Assessment docs to begin.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {uploadedDocuments.map(doc => {
          const isExp = expanded === doc.id; const ex = doc.extracted;
          return (
            <div key={doc.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }} onClick={() => setExpanded(isExp ? null : doc.id)}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', flexShrink: 0 }}>
                  <Icon name={docIcon(doc.type)} size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1 }}>{doc.size} · Uploaded by {doc.uploadedBy} · {fdate(doc.uploadedAt)}</div>
                  {ex?.status === 'done' && ex.summary && <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.summary}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  {ex?.status === 'done'       && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'var(--green-l)', color: 'var(--green)', fontWeight: 700, border: '1px solid var(--green)' }}>✓ AI Extracted · {ex.confidence}%</span>}
                  {ex?.status === 'processing' && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'var(--gold-l)', color: 'var(--gold)', fontWeight: 700 }}>Processing…</span>}
                  {(!ex || ex.status === 'pending') && (
                    <button type="button" onClick={e => { e.stopPropagation(); handleExtract(doc.id); }} style={{ fontSize: 12, padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--r)', border: '1px solid var(--teal)', color: 'var(--teal)', background: 'var(--white)', cursor: 'pointer', fontWeight: 700, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      Extract with AI
                    </button>
                  )}
                  <button type="button" onClick={e => { e.stopPropagation(); handleView(doc); }} title="View" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="eye" size={16} /></button>
                  <button type="button" onClick={e => { e.stopPropagation(); handleDownload(doc); }} title="Download" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="download" size={16} /></button>
                  <Icon name={isExp ? 'chevronUp' : 'chevronDown'} size={16} />
                </div>
              </div>
              {isExp && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', background: 'var(--bg)' }}>
                  <ExtractedView doc={doc} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CO2 / Sustainability Tab ──────────────────────────────────────────────────

function CO2Tab({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const isMobile = useIsMobile();
  const [calcSaving, setCalcSaving] = useState(false);
  const [calcError, setCalcError] = useState('');
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen: triggerOpenRaw } = useClockIn();
  const triggerOpen = () => triggerOpenRaw({ shipmentId: job.id, shipmentRef: job.sysRef || job.id });
  const isStaff = !!(user && user.role !== 'CUSTOMER');

  const hasOriginDest = !!(job.origin && job.origin !== '—' && job.destination && job.destination !== '—');
  const hasWeight = !!job.weight;
  const canCalculate = hasOriginDest && hasWeight;

  // Pulled straight from the shipment — nothing to type. The backend
  // resolves these free-text names to port/airport codes itself.
  async function handleCalculate() {
    if (!canCalculate) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    setCalcSaving(true);
    setCalcError('');
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/co2`, { method: 'POST', body: JSON.stringify({}) });
        onRefresh();
      } else {
        const factor = job.mode.includes('AIR') ? 1.25 : 0.015;
        const w = Number(job.weight!.replace(/[^0-9.]/g, '')) / 1000;
        const dist = 5000;
        const em = dist * w * factor;
        const cred = (em * 0.25) / 1000;
        updateJob(job.id, j => ({ ...j, co2EmissionsKg: em, carbonCreditsSaved: cred, co2CalcDetails: { origin: job.origin, destination: job.destination, distance_km: dist, mode: 'SEA' } }));
      }
    } catch (err: any) {
      setCalcError(err.message || 'Failed to calculate CO2');
    } finally {
      setCalcSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Results */}
      {job.co2EmissionsKg !== undefined && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, background: 'var(--green-l)', border: '1px solid var(--green)', borderRadius: 12, padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--green)' }}>
              <Icon name="activity" size={16} />
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total CO₂ Emissions</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
              {job.co2EmissionsKg.toLocaleString()} <span style={{ fontSize: 16, fontWeight: 600 }}>kg</span>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 220, background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 12, padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--gold)' }}>
              <Icon name="sun" size={16} />
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Carbon Credits Saved</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--mono)' }}>
              {job.carbonCreditsSaved?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: 16, fontWeight: 600 }}>credits</span>
            </div>
          </div>
        </div>
      )}

      <Card title="CO₂ Emissions">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>GLEC Framework v3.2 / ISO 14083 — computed directly from this shipment's route and weight.</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '0 24px', margin: '16px 0' }}>
          <SpecRow label="Origin" value={job.origin && job.origin !== '—' ? job.origin : 'Not set'} />
          <SpecRow label="Destination" value={job.destination && job.destination !== '—' ? job.destination : 'Not set'} />
          <SpecRow label="Gross Weight" value={job.weight || 'Not set'} />
        </div>

        {!canCalculate && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 12, fontSize: 12.5, color: 'var(--gold)', marginBottom: 14 }}>
            <Icon name="alertCircle" size={14} color="var(--gold)" />
            Add {[!hasOriginDest && 'origin/destination', !hasWeight && 'gross weight'].filter(Boolean).join(' and ')} on the Edit page to enable calculation.
          </div>
        )}

        {calcError && (
          <div style={{ padding: '10px 14px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 12, fontSize: 12.5, color: 'var(--red)', marginBottom: 14 }}>{calcError}</div>
        )}

        <button type="button" onClick={handleCalculate} disabled={!canCalculate || calcSaving}
          style={{ padding: 'var(--ds-btn-py) 22px', background: canCalculate ? 'var(--green)' : 'var(--border)', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontSize: 14, fontWeight: 700, cursor: canCalculate && !calcSaving ? 'pointer' : 'default', opacity: calcSaving ? 0.7 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          {calcSaving ? 'Calculating…' : job.co2EmissionsKg !== undefined ? 'Recalculate CO₂' : 'Calculate CO₂'}
        </button>

        {job.co2CalcDetails && (
          <div style={{ marginTop: 18, padding: '14px 16px', background: 'var(--bg)', borderRadius: 12, fontSize: 12, color: 'var(--ink3)' }}>
            <strong>Calculation details:</strong> Distance {job.co2CalcDetails.distance_km}km · Mode {job.co2CalcDetails.mode}{job.co2CalcDetails.factor ? ` · GLEC Factor ${job.co2CalcDetails.factor}` : ''}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Ledger Tab ───────────────────────────────────────────────────────────────

function LedgerTab({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const isMobile = useIsMobile();
  const [showForm,  setShowForm]  = useState(false);
  const [entryType, setEntryType] = useState<'charge' | 'payment'>('charge');
  const [category,  setCategory]  = useState('CLEARANCE');
  const [desc,      setDesc]      = useState('');
  const [amount,    setAmount]    = useState('');
  const [ref,       setRef]       = useState('');
  const [ledgSaving, setLedgSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen: triggerOpenRaw } = useClockIn();
  const triggerOpen = () => triggerOpenRaw({ shipmentId: job.id, shipmentRef: job.sysRef || job.id });
  const isStaff = !!(user && user.role !== 'CUSTOMER');

  const charges  = job.ledger.filter(e => e.type === 'charge');
  const payments = job.ledger.filter(e => e.type === 'payment');
  const totalCharges = charges.reduce((s, e) => s + e.amount, 0);
  const totalPaid    = payments.reduce((s, e) => s + e.amount, 0);
  const balance      = totalPaid - totalCharges;

  function sColor(s: string) { return s === 'paid' ? 'var(--green)' : s === 'overdue' ? 'var(--red)' : 'var(--gold)'; }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!desc.trim() || !amount) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    setLedgSaving(true);
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/ledger`, {
          method: 'POST',
          body: JSON.stringify({ description: `[${category}] ${desc}`, amount: Number(amount), type: entryType, category, ref: ref || undefined }),
        });
        onRefresh();
      } else {
        const entry: LedgerEntry = {
          id: 'led-' + Date.now(), description: `[${category}] ${desc}`, amount: Number(amount),
          currency: 'TZS', type: entryType, date: new Date(), status: entryType === 'payment' ? 'paid' : 'pending',
          reference: ref || undefined,
        };
        updateJob(job.id, j => ({ ...j, ledger: [...j.ledger, entry] }));
      }
      setDesc(''); setAmount(''); setRef(''); setShowForm(false);
    } catch (err: any) { showAlert(err.message || 'Failed to add entry'); } finally { setLedgSaving(false); }
  }

  async function handleFinalize() {
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    setFinalizing(true);
    try {
      await apiFetch(`/v1/shipments/${shipmentId}/invoice/finalise`, { method: 'POST' });
      onRefresh();
      showAlert('Invoice finalised — now visible in FinOps Billing.');
    } catch (err: any) { showAlert(err.message || 'Failed to finalize invoice'); } finally { setFinalizing(false); }
  }

  return (
    <div>
      <EstimateVarianceCard shipmentId={shipmentId} />
      {/* ── Economics of this Shipment ── */}
      {(() => {
        const revenue       = totalPaid;
        const expenses      = totalCharges;
        const grossMargin   = revenue - expenses;
        const marginPct     = revenue > 0 ? Math.round((grossMargin / revenue) * 100) : 0;
        const opsBudget     = expenses * 0.20; // 20% of all fees charged
        const opsBudgetUsed = job.timeEntries.reduce((s, e) => s + e.hours * 50000, 0); // TZS 50k/hr estimate
        const opsUtil       = opsBudget > 0 ? Math.min(100, Math.round((opsBudgetUsed / opsBudget) * 100)) : 0;
        return (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 22px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Shipment Economics</div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: marginPct >= 20 ? 'var(--green-l)' : marginPct >= 0 ? 'var(--gold-l)' : 'var(--red-l)', color: marginPct >= 20 ? 'var(--green)' : marginPct >= 0 ? 'var(--gold)' : 'var(--red)' }}>
                {marginPct >= 0 ? '+' : ''}{marginPct}% margin
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              {([
                { label: 'Revenue',        value: fmtTZS(revenue),     color: 'var(--green)', icon: 'arrowUp' },
                { label: 'Expenses',       value: fmtTZS(expenses),    color: 'var(--red)', icon: 'arrowDown' },
                { label: 'Gross Margin',   value: fmtTZS(Math.abs(grossMargin)), color: grossMargin >= 0 ? 'var(--green)' : 'var(--red)', icon: grossMargin >= 0 ? 'checkCircle' : 'alertTriangle' },
                { label: 'Ops Budget (20%)', value: fmtTZS(opsBudget), color: 'var(--blue)', icon: 'sliders' },
              ] as { label: string; value: string; color: string; icon: IconName }[]).map(c => (
                <div key={c.label} style={{ padding: '14px 16px', background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}><Icon name={c.icon} size={10} /> {c.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: c.color, fontFamily: 'var(--mono)' }}>{c.value}</div>
                </div>
              ))}
            </div>
            {/* Ops budget utilisation bar */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink3)', marginBottom: 5 }}>
                <span>Operations budget utilisation</span>
                <span style={{ fontWeight: 700, color: opsUtil > 90 ? 'var(--red)' : 'var(--ink)' }}>{opsUtil}% of {fmtTZS(opsBudget)}</span>
              </div>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${opsUtil}%`, background: opsUtil > 90 ? 'var(--red)' : opsUtil > 60 ? 'var(--gold)' : 'var(--green)', borderRadius: 4, transition: 'width 0.4s' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>20% of billed charges reserved for operations spend</div>
            </div>
          </div>
        );
      })()}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Charges',  value: fmtTZS(totalCharges), color: 'var(--red)',  sub: `${charges.filter(e => e.status === 'pending').length} pending` },
          { label: 'Total Received', value: fmtTZS(totalPaid),    color: 'var(--green)',  sub: `${payments.length} payments` },
          { label: balance >= 0 ? 'Net Surplus' : 'Balance Due', value: fmtTZS(Math.abs(balance)), color: balance >= 0 ? 'var(--green)' : 'var(--gold)', sub: balance >= 0 ? 'Client ahead' : 'Outstanding' },
        ].map(card => (
          <div key={card.label} style={{ padding: '16px 20px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--white)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: card.color, marginBottom: 3 }}>{card.value}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Add entry */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 10 }}>
        {!showForm ? (
          <button type="button" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="plus" size={14} /> Record Entry
          </button>
        ) : null}
        {isStaff && isLive && payments.length > 0 && job.customerId && (
          <button type="button" onClick={handleFinalize} disabled={finalizing} title="Publish this shipment's billed revenue as a real invoice in FinOps Billing"
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 16px', background: 'var(--white)', color: 'var(--teal)', border: '1px solid var(--teal)', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: finalizing ? 'wait' : 'pointer', opacity: finalizing ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="fileText" size={14} /> {finalizing ? 'Finalizing…' : 'Finalize Invoice'}
          </button>
        )}
        {showForm && (
          <form onSubmit={handleAdd} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>New Ledger Entry</div>
            {/* Type toggle */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['charge', 'payment'] as const).map(t => (
                <button key={t} type="button" onClick={() => setEntryType(t)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, flex: 1, padding: '7px', border: `1px solid ${entryType === t ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 'var(--r)', background: entryType === t ? 'var(--teal-l)' : 'var(--white)', color: entryType === t ? 'var(--teal)' : 'var(--ink3)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  <Icon name={t === 'charge' ? 'arrowUp' : 'arrowDown'} size={12} /> {t === 'charge' ? 'Charge' : 'Payment Received'}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['DUTY','PORT','INSPECTION','TRANSPORT','STORAGE','AGENCY','CLEARANCE','OTHER'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Amount (TZS)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="input-field" placeholder="0" required style={{ width: '100%', fontFamily: 'var(--mono)' }} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Description</label>
              <input type="text" value={desc} onChange={e => setDesc(e.target.value)} className="input-field" placeholder="e.g. Agency handling fee" required style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Reference (optional)</label>
              <input type="text" value={ref} onChange={e => setRef(e.target.value)} className="input-field" placeholder="Invoice / receipt number" style={{ width: '100%', fontFamily: 'var(--mono)' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={ledgSaving}>{ledgSaving ? 'Saving…' : 'Add Entry'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary btn-sm">Cancel</button>
            </div>
          </form>
        )}
      </div>

      {/* Charges table */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
          <span>Charges</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{fmtTZS(totalCharges)}</span>
        </div>
        {charges.length === 0 ? (
          <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--ink3)' }}>No charges recorded.</div>
        ) : (
          <div className="rtbl-wrap">
          <table className="rtbl" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Description', 'Reference', 'Date', 'Status', 'Amount'].map(h => (
                <th key={h} style={{ padding: '9px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {charges.map((e, i) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--white)' : 'var(--bg)' }}>
                  <td style={{ padding: '11px 20px', fontSize: 13, fontWeight: 500 }}>{e.description}</td>
                  <td style={{ padding: '11px 20px', fontSize: 12, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{e.reference || '—'}</td>
                  <td style={{ padding: '11px 20px', fontSize: 12, color: 'var(--ink3)' }}>{fdate(e.date)}</td>
                  <td style={{ padding: '11px 20px' }}><span style={{ fontSize: 11, fontWeight: 700, color: sColor(e.status), background: sColor(e.status) + '18', padding: '2px 8px', borderRadius: 4 }}>{e.status.toUpperCase()}</span></td>
                  <td style={{ padding: '11px 20px', fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{fmtTZS(e.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg)', borderTop: '2px solid var(--border)' }}>
                <td colSpan={4} style={{ padding: '11px 20px', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>TOTAL</td>
                <td style={{ padding: '11px 20px', fontSize: 15, fontWeight: 700, color: 'var(--red)', textAlign: 'right' }}>{fmtTZS(totalCharges)}</td>
              </tr>
            </tfoot>
          </table></div>
        )}
      </div>

      {/* Payments */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
          <span>Payments Received</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{fmtTZS(totalPaid)}</span>
        </div>
        {payments.length === 0 ? (
          <div style={{ padding: '20px', fontSize: 13, color: 'var(--ink3)' }}>No payments recorded.</div>
        ) : payments.map((e, i) => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: i < payments.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 === 0 ? 'var(--white)' : 'var(--bg)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{e.description}</div>
              {e.reference && <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)', marginTop: 1 }}>Ref: {e.reference}</div>}
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{fdate(e.date)}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>+{fmtTZS(e.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Staff Picker Modal ───────────────────────────────────────────────────────

function StaffPickerModal({ jobId, shipmentId, isLive, onRefresh, existing, onClose, mode = 'tag', listenerType = 'internal', onAssign, declaredCustomer }: {
  jobId: string;
  shipmentId: string;
  isLive: boolean;
  onRefresh: () => void;
  existing: string[];
  onClose: () => void;
  mode?: 'tag' | 'assign';
  listenerType?: 'internal' | 'customer';
  onAssign?: (ids: string[], names: string[]) => void;
  declaredCustomer?: { name: string; id?: string };
}) {
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<Employee[]>([]);
  const [channels, setChannels]     = useState<Channel[]>(['email', 'whatsapp']);
  const [saved, setSaved]           = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [staff, setStaff]           = useState<Employee[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState(false);
  const [visible, setVisible]       = useState(false);

  // Slide-in drawer: mount off-screen, then animate in. requestClose() reverses
  // the animation before actually unmounting (via onClose) so it slides back out.
  useEffect(() => { const t = setTimeout(() => setVisible(true), 10); return () => clearTimeout(t); }, []);
  function requestClose() { setVisible(false); setTimeout(onClose, 220); }

  useEffect(() => {
    setStaffLoading(true);
    setStaffError(false);

    if (listenerType === 'customer') {
      const custName = declaredCustomer?.name || 'Declared Customer';
      apiFetch('/v1/customers')
        .then((res: any) => {
          const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
          const matchingCustomer = list.find(c =>
            (declaredCustomer?.id && c.id === declaredCustomer.id) ||
            (c.name && custName && c.name.toLowerCase() === custName.toLowerCase()) ||
            (c.name && custName && custName.toLowerCase().includes(c.name.toLowerCase()))
          );

          const customerPeople: Employee[] = [];
          const cName = matchingCustomer?.name || custName;

          if (matchingCustomer) {
            customerPeople.push(
              {
                id: matchingCustomer.id,
                name: matchingCustomer.contact_person || `${cName} (Primary Contact)`,
                email: matchingCustomer.email || '',
                phone: matchingCustomer.phone || '',
                dept: cName,
                designation: 'Primary Customer Representative',
                role: 'Customer',
                status: 'ACTIVE',
                hireDate: '',
              },
              {
                id: `${matchingCustomer.id}_ops`,
                name: `${cName} — Operations Contact`,
                email: matchingCustomer.email ? `ops@${matchingCustomer.email.split('@')[1] || 'customer.com'}` : '',
                phone: matchingCustomer.phone || '',
                dept: cName,
                designation: 'Logistics Coordinator',
                role: 'Customer',
                status: 'ACTIVE',
                hireDate: '',
              },
              {
                id: `${matchingCustomer.id}_finance`,
                name: `${cName} — Accounts & Billing`,
                email: matchingCustomer.email ? `finance@${matchingCustomer.email.split('@')[1] || 'customer.com'}` : '',
                phone: matchingCustomer.phone || '',
                dept: cName,
                designation: 'Accounts Payable',
                role: 'Customer',
                status: 'ACTIVE',
                hireDate: '',
              }
            );
          } else {
            customerPeople.push(
              {
                id: `cust_${cName.replace(/\s+/g, '_').toLowerCase()}_main`,
                name: `${cName} (Primary Representative)`,
                email: '',
                phone: '',
                dept: cName,
                designation: 'Declared Importer / Consignee',
                role: 'Customer',
                status: 'ACTIVE',
                hireDate: '',
              },
              {
                id: `cust_${cName.replace(/\s+/g, '_').toLowerCase()}_ops`,
                name: `${cName} — Operations Representative`,
                email: '',
                phone: '',
                dept: cName,
                designation: 'Logistics Contact',
                role: 'Customer',
                status: 'ACTIVE',
                hireDate: '',
              },
              {
                id: `cust_${cName.replace(/\s+/g, '_').toLowerCase()}_billing`,
                name: `${cName} — Finance & Billing Contact`,
                email: '',
                phone: '',
                dept: cName,
                designation: 'Accounts Contact',
                role: 'Customer',
                status: 'ACTIVE',
                hireDate: '',
              }
            );
          }

          // Also include other registered customer accounts
          const otherCustomers = list.filter(c => !matchingCustomer || c.id !== matchingCustomer.id);
          otherCustomers.forEach(c => {
            customerPeople.push({
              id: c.id,
              name: `${c.name} (${c.contact_person || 'Representative'})`,
              email: c.email || '',
              phone: c.phone || '',
              dept: c.name,
              designation: 'Customer Account',
              role: 'Customer',
              status: 'ACTIVE',
              hireDate: '',
            });
          });

          setStaff(customerPeople);
        })
        .catch(() => {
          setStaff([
            {
              id: `cust-fallback-1`,
              name: `${custName} (Primary Representative)`,
              email: '',
              phone: '',
              dept: custName,
              designation: 'Declared Importer',
              role: 'Customer',
              status: 'ACTIVE',
              hireDate: '',
            },
            {
              id: `cust-fallback-2`,
              name: `${custName} — Operations Representative`,
              email: '',
              phone: '',
              dept: custName,
              designation: 'Logistics Contact',
              role: 'Customer',
              status: 'ACTIVE',
              hireDate: '',
            },
          ]);
        })
        .finally(() => setStaffLoading(false));
      return;
    }

    apiFetch('/v1/hr/staff')
      .then((res: any) => {
        const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
        setStaff(list.map(u => ({
          id:          u.id,
          name:        u.name,
          email:       u.email       ?? '',
          phone:       u.phone       ?? '',
          dept:        u.dept        ?? u.department ?? '',
          designation: u.designation ?? (u.role ?? '').replace(/_/g, ' '),
          role:        u.role        ?? '',
          status:      (u.status === 'INACTIVE' ? 'INACTIVE' : u.status === 'ON_LEAVE' ? 'ON_LEAVE' : 'ACTIVE') as Employee['status'],
          hireDate:    u.hireDate    ?? '',
        })));
      })
      .catch(() => setStaffError(true))
      .finally(() => setStaffLoading(false));
  }, [listenerType, declaredCustomer?.id, declaredCustomer?.name]);

  const filtered = staff.filter(e =>
    e.status !== 'INACTIVE' &&
    !existing.includes(e.id) &&
    (!search || e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.dept.toLowerCase().includes(search.toLowerCase()) ||
      e.designation.toLowerCase().includes(search.toLowerCase()))
  );

  function toggleEmp(e: Employee) {
    setSelected(prev => prev.find(x => x.id === e.id) ? prev.filter(x => x.id !== e.id) : [...prev, e]);
  }

  function toggleCh(ch: Channel) {
    setChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
  }

  const STATUS_COLOR: Record<string, string> = { ACTIVE: 'var(--green)', ON_LEAVE: 'var(--gold)' };

  async function handleConfirm() {
    if (staffLoading || staffError || selected.length === 0 || confirming) return;
    if (mode === 'assign') {
      onAssign?.(selected.map(e => e.id), selected.map(e => e.name));
      setSaved(true);
      setTimeout(() => { requestClose(); }, 900);
      return;
    }
    setConfirming(true);
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/listeners`, {
          method: 'POST',
          body: JSON.stringify({
            type: listenerType,
            people: selected.map(e => ({ id: e.id, name: e.name, role: e.designation })),
            channels,
          }),
        });
        onRefresh();
      } else {
        const newListeners: import('./clearanceData.js').Listener[] = selected.map(e => ({
          id: e.id, name: e.name, role: e.designation, type: listenerType, channel: channels,
        }));
        updateJob(jobId, j => ({
          ...j,
          listeners: [...j.listeners, ...newListeners],
          activity: [
            ...j.activity,
            {
              id: `act-${Date.now()}`,
              action: 'assigned' as const,
              userId: 'me',
              userName: 'You',
              ts: new Date(),
              subject: `Tagged ${selected.map(e => e.name).join(', ')} via ${channels.join(', ')}`,
            },
          ],
        }));
      }
      setSaved(true);
      setTimeout(() => { requestClose(); }, 900);
    } catch (err: any) {
      showAlert(err.message || 'Failed to tag staff');
    } finally {
      setConfirming(false);
    }
  }

  // Slide-in drawer anchored to the right edge — wider than the 248px sidebar
  // column it's triggered from, and "light": no dark backdrop dimming the rest
  // of the page, just a transparent click-outside-to-close catcher.
  return (
    <>
      <div onClick={requestClose} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'transparent' }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: 420, maxWidth: '92vw', zIndex: 1401,
        background: 'var(--white)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 32px rgba(15,23,42,0.12)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
              {listenerType === 'customer' ? 'Add Customer Listener' : mode === 'assign' ? 'Assign Team Member' : 'Tag Internal Staff'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
              {listenerType === 'customer'
                ? `Customer declared for this shipment: ${declaredCustomer?.name || 'Shipment Customer'}`
                : 'Select team members to notify and assign to this shipment'}
            </div>
          </div>
          <button type="button" title="Close" onClick={requestClose} style={{ background: 'var(--bg)', border: 'none', borderRadius: 'var(--r)', cursor: 'pointer', padding: 6, display: 'flex', flexShrink: 0 }}>
            <Icon name="x" size={16} color="var(--ink2)" />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={13} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, department, or role…"
              style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--border)', borderRadius: 12, fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' as const }} />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {staffLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '32px 0', color: 'var(--ink3)', fontSize: 13 }}>
              <div style={{ width: 18, height: 18, border: '2px solid var(--teal-l)', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Loading staff…
            </div>
          )}
          {!staffLoading && staffError && (
            <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--red)', fontSize: 13 }}>
              Failed to load staff. Please close and try again.
            </div>
          )}
          {!staffLoading && !staffError && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--ink3)', fontSize: 13 }}>
              {search ? 'No staff match your search.' : 'All active staff are already added.'}
            </div>
          )}
          {!staffLoading && !staffError && filtered.map(e => {
            const on = !!selected.find(x => x.id === e.id);
            return (
              <button key={e.id} type="button" onClick={() => toggleEmp(e)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: 'var(--ds-btn-py) 20px', border: 'none', background: on ? 'var(--teal-l)' : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', transition: 'background .1s', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: empAvatarColor(e.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {empInitials(e.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: on ? 'var(--teal)' : 'var(--ink)' }}>{e.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>{e.designation} · {e.dept}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: STATUS_COLOR[e.status] ? `${STATUS_COLOR[e.status]}20` : 'var(--bg)', color: STATUS_COLOR[e.status] ?? 'var(--ink3)', flexShrink: 0 }}>{e.status === 'ON_LEAVE' ? 'On Leave' : 'Active'}</span>
                <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${on ? 'var(--teal)' : 'var(--border)'}`, background: on ? 'var(--teal)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {on && <Icon name="check" size={11} color="#fff" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Notify via */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Notify via</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['email', 'whatsapp'] as Channel[]).map(ch => {
              const on = channels.includes(ch);
              const COLORS: Record<string, string> = { email: 'var(--teal)', whatsapp: 'var(--green)', sms: 'var(--gold)', teams: 'var(--purple)' };
              return (
                <button key={ch} type="button" onClick={() => toggleCh(ch)}
                  style={{ fontSize: 11, fontWeight: 700, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 'var(--r)', cursor: 'pointer', border: `1.5px solid ${on ? COLORS[ch] : 'var(--border)'}`, background: on ? `${COLORS[ch]}18` : 'var(--white)', color: on ? COLORS[ch] : 'var(--ink3)', transition: 'all .12s', textTransform: 'capitalize', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  {ch === 'whatsapp' ? 'WhatsApp' : ch.charAt(0).toUpperCase() + ch.slice(1)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
            {selected.length > 0 ? `${selected.length} person${selected.length > 1 ? 's' : ''} selected` : 'Select staff to tag'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={requestClose} style={{ padding: 'var(--ds-btn-py) 16px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="button" disabled={staffLoading || staffError || selected.length === 0 || saved || confirming} onClick={handleConfirm}
              style={{ padding: 'var(--ds-btn-py) 18px', background: saved ? 'var(--green)' : selected.length > 0 ? 'var(--teal)' : 'var(--border)', color: selected.length > 0 || saved ? '#fff' : 'var(--ink3)', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: selected.length > 0 && !confirming ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 7, transition: 'background .15s', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {saved ? <><Icon name="check" size={13} color="#fff" /> Done!</> : confirming ? 'Saving…' : <><Icon name="userPlus" size={13} color={selected.length > 0 ? '#fff' : 'var(--ink3)'} /> {mode === 'assign' ? 'Assign' : 'Tag & Notify'}</>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Listeners Sidebar ────────────────────────────────────────────────────────

// Only channels with a real send integration behind them (WhatsApp/Email) — SMS
// and Teams have no working integration anywhere in this codebase today, so
// they're not offered here rather than being fake toggles that silently no-op.
const ALL_CHANNELS: Channel[] = ['whatsapp', 'email'];

function ChannelToggle({ ch, active, onToggle, readOnly }: { ch: Channel; active: boolean; onToggle: () => void; readOnly?: boolean }) {
  const cfg = CH_CFG[ch];
  return (
    <button type="button" onClick={readOnly ? undefined : onToggle} disabled={readOnly} title={readOnly ? cfg.label : `${active ? 'Disable' : 'Enable'} ${cfg.label}`}
      style={{ fontSize: 10, padding: 'var(--ds-btn-py-xs) 7px', borderRadius: 'var(--r)', cursor: readOnly ? 'default' : 'pointer', border: `1px solid ${active ? cfg.color : 'var(--border)'}`, background: active ? cfg.bg : 'var(--white)', color: active ? cfg.color : 'var(--ink3)', fontWeight: 600, transition: 'all 0.12s', opacity: readOnly && !active ? 0.6 : 1, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
      {cfg.label}
    </button>
  );
}

function ListenersSidebar({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const [channelToggling, setChannelToggling] = useState<string | null>(null);
  const [staffPickerType, setStaffPickerType] = useState<'internal' | 'customer' | null>(null);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  // Read-only status indicator only now — WhatsApp on/off is a tenant-wide
  // decision (Workspace ▸ Settings ▸ Notifications), not a per-shipment
  // control; the toggle card that used to live on this page never actually
  // gated message-sending anyway (nothing in the backend checked it).
  const waActive = job.whatsappBotActive !== false;
  const { user } = useAuth();
  // Re-assigning ownership and re-tagging who gets notified is a management
  // decision — junior/officer roles can see who's assigned/tagged but not change it.
  const canManage = !!(user && MGMT_ROLES.includes(user.role));

  const [editingDate, setEditingDate] = useState<'created' | 'due' | null>(null);
  const [savingDate, setSavingDate] = useState(false);

  async function handleKeyDateChange(field: 'created_at' | 'due_date', label: string, d: Date | undefined) {
    setEditingDate(null);
    setSavingDate(true);
    try {
      if (isLive) {
        // The backend fires a real KEY_DATE_CHANGED notification to this
        // shipment's listeners on a genuine change — nothing more to do here
        // beyond refreshing so the new value shows up.
        await apiFetch(`/v1/shipments/${shipmentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ [field]: d ? d.toISOString() : null }),
        });
        onRefresh();
      } else {
        updateJob(job.id, j => ({ ...j, [field === 'due_date' ? 'dueDate' : 'createdAt']: d }));
      }
    } catch (err: any) {
      showAlert(err.message || `Failed to update ${label.toLowerCase()}`);
    } finally {
      setSavingDate(false);
    }
  }

  async function handleAssign(employeeIds: string[], names: string[]) {
    if (isLive) {
      try {
        await apiFetch(`/v1/shipments/${shipmentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ assigned_to: employeeIds[0] }),
        });
        onRefresh();
      } catch (err: any) { showAlert(err.message || 'Assign failed'); }
    } else {
      updateJob(job.id, j => ({
        ...j,
        assignees: [...new Set([...j.assignees, ...employeeIds])],
        activity: [...j.activity, { id: `act-${Date.now()}`, action: 'assigned' as const, userId: 'me', userName: 'You', ts: new Date(), subject: `Assigned ${names.join(', ')}` }],
      }));
    }
  }

  async function toggleListenerCh(listener: Listener, ch: Channel) {
    const next = listener.channel.includes(ch) ? listener.channel.filter(c => c !== ch) : [...listener.channel, ch];
    if (isLive) {
      if (!listener.listenerId) return;
      setChannelToggling(listener.listenerId);
      try {
        await apiFetch(`/v1/shipments/${shipmentId}/listeners/${listener.listenerId}`, {
          method: 'PATCH',
          body: JSON.stringify({ channels: next }),
        });
        onRefresh();
      } catch (err: any) { showAlert(err.message || 'Failed to update notification channel'); }
      finally { setChannelToggling(null); }
    } else {
      updateJob(job.id, j => ({ ...j, listeners: j.listeners.map(l => l.id === listener.id ? { ...l, channel: next } : l) }));
    }
  }

  const internal  = job.listeners.filter(l => l.type === 'internal');
  const customers = job.listeners.filter(l => l.type === 'customer');

  return (
    <div style={{ width: 248, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Assigned To */}
      {/* Assigned To Card */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Assigned To</span>
          {canManage && (
            <button type="button" onClick={() => setShowAssignPicker(true)}
              style={{ fontSize: 11, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}>
              {job.assignees.length > 0 ? 'Change' : '+ Assign'}
            </button>
          )}
        </div>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {job.assignees.length === 0 ? (
            canManage ? (
              <button type="button" onClick={() => setShowAssignPicker(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink3)', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 'var(--r)', padding: '8px 12px', cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: 'var(--font)' }}>
                <Icon name="userPlus" size={14} color="var(--ink3)" /> Assign an agent…
              </button>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No agent assigned yet.</div>
            )
          ) : (
            job.assignees.map(a => {
              const label = (a === job.assignees[0] && job.assigneeName) || friendlyAssignee(a);
              return (
                <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Av name={label} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Assigned Officer</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Listeners Card */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Listeners</span>
          <span style={{ display: 'flex', gap: 5 }}>
            <span style={{ padding: '1px 7px', background: 'var(--bg)', borderRadius: 12, fontSize: 10, fontWeight: 700, color: 'var(--ink3)' }}>{job.listeners.length}</span>
            {customers.length > 0 && (
              <span style={{ padding: '1px 7px', background: waActive ? 'var(--green-l)' : 'var(--bg)', color: waActive ? 'var(--green)' : 'var(--ink3)', borderRadius: 12, fontSize: 10, fontWeight: 700 }}>WA {waActive ? '✓' : '✕'}</span>
            )}
          </span>
        </div>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-light, rgba(0,0,0,0.01))' }}>
          
          {/* Staff Section */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>
              Staff ({internal.length})
            </div>
            {internal.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>None added</span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setStaffPickerType('internal')}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: '1px dashed var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--ink3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    title="Add Staff Listener"
                  >
                    <Icon name="plus" size={11} />
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {internal.map(l => (
                  <HoverCard key={l.id} openDelay={100} closeDelay={300}>
                    <HoverCardTrigger asChild>
                      <button
                        type="button"
                        style={{
                          border: 'none',
                          background: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          borderRadius: '50%',
                          outline: 'none',
                          display: 'flex',
                        }}
                      >
                        <Av name={l.name} size={28} />
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent align="start" side="bottom" sideOffset={6} className="w-60 p-3">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                        <Av name={l.name} size={30} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {l.name}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {l.role}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                        Notification Channels
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {ALL_CHANNELS.map(ch => (
                          <ChannelToggle key={ch} ch={ch} active={l.channel.includes(ch)} onToggle={() => toggleListenerCh(l, ch)} readOnly={!canManage || channelToggling === l.listenerId} />
                        ))}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                ))}

                {canManage && (
                  <button
                    type="button"
                    onClick={() => setStaffPickerType('internal')}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: '1px dashed var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--ink3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                      padding: 0,
                    }}
                    title="Add Staff Listener"
                  >
                    <Icon name="plus" size={13} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Customers Section */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>
              Customers ({customers.length})
            </div>
            {customers.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>None added</span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setStaffPickerType('customer')}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: '1px dashed var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--ink3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    title="Add Customer Listener"
                  >
                    <Icon name="plus" size={11} />
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {customers.map(l => (
                  <HoverCard key={l.id} openDelay={100} closeDelay={300}>
                    <HoverCardTrigger asChild>
                      <button
                        type="button"
                        style={{
                          border: 'none',
                          background: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          borderRadius: '50%',
                          outline: 'none',
                          display: 'flex',
                        }}
                      >
                        <Av name={l.name} size={28} />
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent align="start" side="bottom" sideOffset={6} className="w-60 p-3">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                        <Av name={l.name} size={30} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {l.name}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {l.role}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                        Notification Channels
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {ALL_CHANNELS.map(ch => (
                          <ChannelToggle key={ch} ch={ch} active={l.channel.includes(ch)} onToggle={() => toggleListenerCh(l, ch)} readOnly={!canManage || channelToggling === l.listenerId} />
                        ))}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                ))}

                {canManage && (
                  <button
                    type="button"
                    onClick={() => setStaffPickerType('customer')}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: '1px dashed var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--ink3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                      padding: 0,
                    }}
                    title="Add Customer Listener"
                  >
                    <Icon name="plus" size={13} />
                  </button>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {showAssignPicker && canManage && (
        <StaffPickerModal
          jobId={job.id}
          shipmentId={shipmentId}
          isLive={isLive}
          onRefresh={onRefresh}
          existing={job.assignees}
          onClose={() => setShowAssignPicker(false)}
          mode="assign"
          onAssign={handleAssign}
        />
      )}

      {staffPickerType && canManage && (
        <StaffPickerModal
          jobId={job.id}
          shipmentId={shipmentId}
          isLive={isLive}
          onRefresh={onRefresh}
          existing={job.listeners.filter(l => l.type === staffPickerType).map(l => l.id)}
          onClose={() => setStaffPickerType(null)}
          listenerType={staffPickerType}
          declaredCustomer={{ name: job.customer, id: job.customerId }}
        />
      )}

      {/* Key Dates — editable; saving notifies this shipment's listeners
          (same WhatsApp/Email/in-app channels as above) via the backend's
          KEY_DATE_CHANGED trigger, so a date change is never silent. */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Key Dates</div>
        {[
          { key: 'created' as const, label: 'Created',  date: job.createdAt, field: 'created_at', warn: false },
          { key: 'due' as const,     label: 'Due Date', date: job.dueDate,   field: 'due_date',    warn: !!(job.dueDate && new Date() > job.dueDate) },
        ].map(item => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '1px solid var(--border)', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--ink3)', flexShrink: 0 }}>{item.label}</span>
            {editingDate === item.key ? (
              <DatePicker
                date={item.date}
                onChange={(d) => handleKeyDateChange(item.field as 'created_at' | 'due_date', item.label, d)}
                className="w-auto"
                triggerClassName="h-7 text-xs"
              />
            ) : (
              <button
                type="button"
                onClick={() => canManage && setEditingDate(item.key)}
                disabled={!canManage || savingDate}
                title={canManage ? 'Click to change' : 'Only managers can change this'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0,
                  cursor: canManage ? 'pointer' : 'default', fontSize: 12, fontWeight: 600,
                  color: item.warn ? 'var(--red)' : 'var(--ink)',
                }}
              >
                {item.date ? fdate(item.date) : '—'}
                {canManage && <Icon name="edit" size={11} color="var(--ink3)" />}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Flags */}
      {job.flags.length > 0 && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Tags &amp; Flags</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {job.flags.map(f => <FlagChip key={f} flag={f} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'tasks' | 'timesheets' | 'declaration' | 'updates' | 'files' | 'ledger' | 'co2';

const TAB_CFG: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'overview',     label: 'Overview',     icon: 'barChart'    },
  { id: 'tasks',        label: 'Tasks',        icon: 'tasks'       },
  { id: 'timesheets',   label: 'Timesheets',   icon: 'clock'       },
  { id: 'declaration',  label: 'Declaration',  icon: 'clipboard'   },
  { id: 'updates',      label: 'Updates',      icon: 'send'        },
  { id: 'files',        label: 'Files',        icon: 'folder'      },
  { id: 'ledger',       label: 'Ledger',       icon: 'receipt'     },
  { id: 'co2',          label: 'CO2',          icon: 'activity'    },
];

export function ShipmentDetail() {
  usePageSEO('Shipment Details', 'View comprehensive shipment tracking and documentation.');
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const mockJob = useJob(id || '');
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen: triggerOpenRaw } = useClockIn();
  const triggerOpen = () => triggerOpenRaw(job ? { shipmentId: job.id, shipmentRef: job.sysRef || job.id } : undefined);
  const [apiJob,     setApiJob]     = useState<ClearanceJob | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiTasks,   setApiTasks]   = useState<InternalTask[]>([]);
  const [apiTimeEntries, setApiTimeEntries] = useState<TimeEntry[]>([]);
  const [tab,        setTab]        = useState<Tab>(() => {
    const requested = searchParams.get('tab');
    const valid = TAB_CFG.some(t => t.id === requested);
    return valid ? (requested as Tab) : 'overview';
  });
  const [showAdv,    setShowAdv]    = useState(false);
  const [heroFolded, setHeroFolded] = useState(false);
  const [bookingRef, setBookingRef] = useState<{ id: string; booking_number: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    apiFetch(`/v1/freight-booking/bookings/by-shipment/${id}`).then(setBookingRef).catch(() => setBookingRef(null));
  }, [id]);

  const isStaff = !!(user && user.role !== 'CUSTOMER');

  function loadTasks() {
    if (!id) return;
    apiFetch(`/v1/shipments/${id}/tasks`)
      .then((res: any) => setApiTasks((Array.isArray(res) ? res : res.data || []).map(apiTaskToInternal)))
      .catch(() => setApiTasks([]));
  }

  function loadTimeEntries() {
    if (!id) return;
    apiFetch(`/v1/shipments/${id}/time-entries`)
      .then((res: any) => setApiTimeEntries((Array.isArray(res) ? res : res.data || []).map(apiTimeEntryToInternal)))
      .catch(() => setApiTimeEntries([]));
  }

  // If not in mock store, try fetching from real API
  useEffect(() => {
    if (!mockJob && id) {
      setApiLoading(true);
      apiFetch(`/v1/shipments/${id}`)
        .then(data => setApiJob(apiToJob(data)))
        .catch(() => setApiJob(null))
        .finally(() => setApiLoading(false));
      loadTasks();
      loadTimeEntries();
    } else {
      setApiJob(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mockJob]);

  function refreshJob() {
    if (!id) return;
    apiFetch(`/v1/shipments/${id}`)
      .then(data => setApiJob(apiToJob(data)))
      .catch(() => {});
    loadTasks();
    loadTimeEntries();
  }

  // apiToJob always sets tasks/timeEntries to [] (they live on their own
  // endpoints, not embedded in GET /v1/shipments/:id) — layer the
  // separately-fetched real data on top here rather than inside apiToJob,
  // which stays a pure mapper of the raw shipment record.
  // The API record wins. This read `mockJob || apiJob`, so the in-memory demo
  // store shadowed the server: clearanceData.ts seeds a job under the id
  // 'CLR-2026-0001', which is the same shape as a real ref number and a ref a
  // real shipment in this database already uses. Anyone reaching that URL got
  // the demo record with no LIVE badge, and every edit went to memory and was
  // lost on reload. The demo is now only a fallback for when the server has
  // nothing.
  const liveJob = apiJob ? { ...apiJob, tasks: apiTasks, timeEntries: apiTimeEntries } : null;
  const job = liveJob || mockJob || null;
  const isMock = !liveJob && !!mockJob;

  if (apiLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--teal)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontSize: 14, color: 'var(--ink3)' }}>Loading shipment…</div>
    </div>
  );

  if (!job) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
      <div style={{ fontSize: 16, color: 'var(--ink3)' }}>Shipment not found.</div>
      <Link to="/" style={{ padding: '8px 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, textDecoration: 'none' }}>← Back to Ops Command</Link>
    </div>
  );

  async function handleAdvance(stage: Stage, note: string, blocker: string, channels: Channel[]) {
    if (!job) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    if (isMock) {
      const event: TimelineEvent = { id: 'ev-' + Date.now(), stage, label: STAGES.find(s => s.id === stage)?.label || stage, userId: 'me', userName: 'You', ts: new Date(), note: note || undefined, blocker: blocker || undefined };
      const threadMsg: ThreadMsg | null = note ? { id: 'msg-' + Date.now(), userId: 'me', userName: 'You', content: `Stage advanced to ${STAGES.find(s => s.id === stage)?.label}. ${note}${blocker ? ` — Blocker: ${blocker}` : ''}`, ts: new Date(), channels, isInternal: !channels.some(c => c !== 'internal') } : null;
      updateJob(job.id, j => ({ ...j, stage, timeline: [...j.timeline, event], thread: threadMsg ? [...j.thread, threadMsg] : j.thread }));
    } else {
      try {
        await apiFetch(`/v1/shipments/${id}/stage`, {
          method: 'PATCH',
          body: JSON.stringify({ stage: STAGE_API_MAP[stage] ?? stage.toUpperCase(), note: note || undefined, blocker: blocker || undefined }),
        });
        refreshJob();
      } catch (err: any) { showAlert(err.message || 'Stage update failed'); }
    }
    setShowAdv(false);
  }

  const isOverdue  = job.dueDate && new Date() > job.dueDate;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>

        {/* Job identity — hero band (also carries wayfinding + primary actions); collapsible */}
        <div className="shipdetail-cover-bleed" style={{
          padding: heroFolded ? (isMobile ? '14px 16px' : '16px 28px') : (isMobile ? '20px 16px 28px' : '26px 28px 36px'),
          // --navy flips to a pale blue in dark mode (it's a heading-text
          // token, not a background one — see index.css's two theme
          // blocks); --nav-header-bg stays a dark navy in both themes,
          // which is what a gradient *background* fill actually needs.
          background: `linear-gradient(120deg, var(--teal) 0%, var(--nav-header-bg) 100%)`,
          position: 'relative', overflow: 'hidden', transition: 'padding 0.15s ease',
        }}>
          {/* Decorative freight-crate motif */}
          {!heroFolded && <div aria-hidden style={{ position: 'absolute', right: -30, top: -30, width: 200, height: 200, borderRadius: 28, background: 'rgba(255,255,255,0.06)', transform: 'rotate(18deg)' }} />}
          {!heroFolded && <div aria-hidden style={{ position: 'absolute', right: 60, bottom: -50, width: 120, height: 120, borderRadius: 24, background: 'rgba(255,255,255,0.05)', transform: 'rotate(-12deg)' }} />}

          {/* Utility row — back button + status badges + primary actions; always visible, folded or not */}
          {/* Top Single Row: Utility + Title + Actions */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: heroFolded ? 8 : 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              <Link to="/clearos/ops" title="Back to Ops Command" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px 6px 8px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
                <Icon name="chevronLeft" size={13} color="#fff" /> {isMobile ? '' : 'Ops Command'}
              </Link>
              {job.sysRef && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.06em' }}>{job.sysRef}</span>
              )}
              {bookingRef && (
                <Link to="/clearos/freight-booking/bookings" title="View freight booking" style={{ fontSize: 10.5, padding: '2px 8px', background: 'rgba(255,255,255,0.16)', color: '#fff', borderRadius: 4, fontWeight: 700, textDecoration: 'none' }}>
                  Booked via {bookingRef.booking_number}
                </Link>
              )}
              {!isMock && <span style={{ fontSize: 10.5, padding: '2px 7px', background: 'rgba(255,255,255,0.16)', color: '#fff', borderRadius: 4, fontWeight: 700 }}>LIVE</span>}
              {isOverdue && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: 'var(--red-l)' }}><Icon name="alertTriangle" size={11} /> Overdue</span>}
              
              {!isMobile && <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.3)', margin: '0 4px' }} />}
              
              {/* Title & Customer (Moved to same row) */}
              <h1 style={{ margin: 0, fontSize: isMobile ? 16 : 18, fontWeight: 800, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.01em' }}>{job.title}</h1>
              {job.customerId ? (
                <Link to={`/crm/customers?id=${job.customerId}`} onClick={e => e.stopPropagation()} style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: 'rgba(255,255,255,0.82)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                  · {job.customer}
                </Link>
              ) : (
                <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>· {job.customer}</span>
              )}
            </div>

            {/* Right side actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
              {job.tansad && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', fontFamily: 'var(--mono)', backdropFilter: 'blur(4px)' }}>
                  TANSAD: {job.tansad}
                </span>
              )}
              {isStaff && !isMock && (
                <Link to={`/clearos/clearance/${id}/edit`} style={{ flex: isMobile ? 1 : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 14px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', backdropFilter: 'blur(4px)' }}>
                  <Icon name="edit" size={13} /> Edit
                </Link>
              )}
              {isStaff && (
                <button type="button" onClick={() => setShowAdv(true)} style={{ flex: isMobile ? 1 : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', background: '#fff', color: 'var(--teal)', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  <Icon name="arrowRight" size={13} /> Advance Stage
                </button>
              )}
              <button type="button" onClick={() => openShipmentReportWindow(job)} title="Print shipment report" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: isMobile ? 'auto' : 30, height: isMobile ? 32 : 30, padding: isMobile ? '0 14px' : 0, borderRadius: 'var(--r)', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                <Icon name="printer" size={14} /> {isMobile && <span style={{ marginLeft: 6, fontSize: 12.5, fontWeight: 600 }}>Print</span>}
              </button>
              <button type="button" onClick={() => setHeroFolded(f => !f)} title={heroFolded ? 'Expand shipment summary' : 'Collapse shipment summary'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: isMobile ? 'auto' : 30, height: isMobile ? 32 : 30, padding: isMobile ? '0 14px' : 0, borderRadius: 'var(--r)', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                <Icon name={heroFolded ? 'chevronDown' : 'chevronUp'} size={14} /> {isMobile && <span style={{ marginLeft: 6, fontSize: 12.5, fontWeight: 600 }}>{heroFolded ? 'Expand' : 'Collapse'}</span>}
              </button>
            </div>
          </div>

          {/* Info strip (condensed if folded) */}
          <div style={{ position: 'relative', display: 'flex', gap: isMobile ? 10 : 20, flexWrap: 'wrap', fontSize: heroFolded ? 11.5 : 12.5, color: 'rgba(255,255,255,0.85)', alignItems: 'center', marginTop: heroFolded ? 0 : 8 }}>
            {job.mode && <span style={{ fontWeight: 700, color: '#fff', fontSize: heroFolded ? 12 : 13 }}>{job.mode}</span>}
            {job.bl         && <span><span style={{ color: 'rgba(255,255,255,0.6)' }}>B/L:</span> <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: '#fff' }}>{job.bl}</span></span>}
            {job.vessel     && <span><span style={{ color: 'rgba(255,255,255,0.6)' }}>Vessel:</span> <span style={{ color: '#fff', fontWeight: 600 }}>{job.vessel}</span></span>}
            {job.origin && job.origin !== '—' && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{job.origin} <Icon name="arrowRight" size={11} color="rgba(255,255,255,0.6)" /> {job.destination}</span>}
            {job.weight     && <span><span style={{ color: 'rgba(255,255,255,0.6)' }}>Weight:</span> {job.weight}</span>}
            {job.invoiceValue && <span><span style={{ color: 'rgba(255,255,255,0.6)' }}>Value:</span> <span style={{ fontWeight: 600, color: '#fff' }}>{job.invoiceValue}</span></span>}
            {job.containers && job.containers.length > 0 && <span><span style={{ color: 'rgba(255,255,255,0.6)' }}>Containers:</span> {job.containers.join(', ')}</span>}
          </div>
        </div>

        {/* Stage stepper — floats up over the hero band */}
        <div style={{ margin: isMobile ? '-16px 10px 0' : '-20px 14px 0', position: 'relative', background: 'var(--white)', borderRadius: 12, padding: '14px 0 12px', border: '1px solid var(--border)' }}>
          {isStaff ? <StageStepper stage={job.stage} /> : (
            <div style={{ padding: '0 24px' }}><CustomerMilestoneTimeline job={job} compact /></div>
          )}
        </div>
        <div style={{ height: isMobile ? 14 : 18 }} />

        {/* Tabs — horizontal scroll on narrow screens instead of wrapping/clipping */}
        <div style={{ display: 'flex', padding: isMobile ? '0 10px' : '0 14px', borderTop: '1px solid var(--border)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          {TAB_CFG.map(t => {
            const badge =
              t.id === 'tasks'      ? job.tasks.length :
              t.id === 'timesheets' ? job.timeEntries.length :
              t.id === 'updates'    ? job.thread.length :
              t.id === 'files'      ? job.documents.length :
              t.id === 'ledger'     ? job.ledger.length : undefined;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} style={{ padding: isMobile ? '12px 10px' : '12px 16px', border: 'none', borderBottom: `2px solid ${tab === t.id ? 'var(--teal)' : 'transparent'}`, background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? 'var(--teal)' : 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.15s', flexShrink: 0, whiteSpace: 'nowrap' }}>
                <Icon name={t.icon} size={14} />
                {t.label}
                {badge !== undefined && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 12, background: tab === t.id ? 'var(--teal)' : 'var(--border)', color: tab === t.id ? '#fff' : 'var(--ink3)' }}>{badge}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {showAdv && (
        <AdvanceStageModal job={job} onClose={() => setShowAdv(false)} onAdvance={handleAdvance} />
      )}

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '0 0 14px' : '0 0 24px', background: 'var(--white)' }}>
        <div style={{
          padding: isMobile ? '14px 10px' : '20px 14px',
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {tab === 'overview'     && (isStaff ? <OverviewTab job={job} isMobile={isMobile} /> : <CustomerOverviewTab job={job} isMobile={isMobile} />)}
              {tab === 'tasks'        && <TasksTab       job={job} isMobile={isMobile} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
              {tab === 'timesheets'   && <TimesheetsTab  job={job} isMobile={isMobile} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
              {tab === 'declaration'  && <DeclarationTab job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
              {tab === 'updates'      && <UpdatesTab     job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
              {tab === 'files'        && <FilesTab       job={job} isMobile={isMobile} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
              {tab === 'ledger'       && <LedgerTab      job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
              {tab === 'co2'          && <CO2Tab         job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
            </div>
            {tab !== 'overview' && !isMobile && <ListenersSidebar job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
          </div>
        </div>
      </div>
    </div>
  );
}
