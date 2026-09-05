import React, { useState, useEffect, useRef } from 'react';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { ExaminationsQueue } from '../components/ExaminationsQueue.js';
import { DangerousGoodsPanel } from '../components/DangerousGoodsPanel.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Icon } from '../components/Icon.js';
import { Spinner, PageLoading } from '../components/ui/spinner.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Banner } from '../components/ui/alert.js';
import { SectionCard } from '../components/SectionCard.js';
import { RelatedRecordsPanel } from '../components/RelatedRecordsPanel.js';
import { Tip } from '../components/ui/tooltip.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch, apiDownload, apiViewBlob, apiFetchBlob } from '../lib/api.js';
import { HUDUMIKA_FOOTER_HTML } from '../lib/watermark.js';
import { useCompany, getCompany } from '../data/companyStore.js';
import { useAuth } from '../hooks/useAuth.js';
import { MGMT_ROLES } from '../lib/permissions.js';
import { useClockIn } from '../contexts/ClockInContext.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import {
  getJob, updateJob, subscribe,
  STAGES, FLAG_CFG, CH_CFG, stageIdx, STAGE_API_MAP, API_STAGE_MAP, apiToJob,
  jobUiSteps, jobCurrentIdx, jobStageLabel, jobBackendStage,
  type ClearanceJob, type Stage, type Channel, type Flag,
  type ThreadMsg, type TimelineEvent, type ShipDoc, type LedgerEntry, type DocType,
  type InternalTask, type TimeEntry, type ActivityEvent, type TaskStatus, type Listener,
} from './clearanceData.js';
import { ChBadge } from '../components/ClearanceChips.js';
import { VesselLiveStatus } from '../components/VesselLiveStatus.js';
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
import { SwitchRow } from '../components/ui/list-item-row.js';

// ─── Clock-in gate ───────────────────────────────────────────────────────────

function clockGate(isStaff: boolean, isCheckedIn: boolean, triggerOpen: () => void): boolean {
  if (!isStaff) return true;
  if (!isCheckedIn) { triggerOpen(); return false; }
  return true;
}

// Shared by the Timesheets and Ledger tabs so both read the same number:
// hourly-unit services bill hours × rate; everything else (per-shipment,
// per-container, per-set, ...) bills the flat rate once per logged entry.
// Returns null when the entry was logged with no service attached — nothing
// to bill, not a rate of zero.
function entryAmount(e: TimeEntry): number | null {
  if (e.serviceRate == null) return null;
  return e.serviceUnit === 'hour' || e.serviceUnit === 'hr' ? e.hours * e.serviceRate : e.serviceRate;
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
    testing: 'testing',
  };
  return {
    id: String(t.id),
    title: t.title,
    status: statusMap[t.status] || 'not_started',
    priority: (t.priority || 'medium') as InternalTask['priority'],
    assignees: t.assigned_to ? [friendlyAssignee(String(t.assigned_to))] : [],
    assignedToId: t.assigned_to ? String(t.assigned_to) : undefined,
    closedAt: t.closed_at ? new Date(t.closed_at) : undefined,
    closedById: t.closed_by ? String(t.closed_by) : undefined,
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

/**
 * Builds the Shipment Report HTML — same generator this app's own manual
 * "Print shipment report" button uses (openShipmentReportWindow, just below)
 * AND the server-side scheduled/on-demand report job (see
 * shipment-report.service.ts on the API, which mirrors this markup exactly
 * so the emailed PDF and the in-app print preview never drift apart —
 * confirm both are updated together if this template changes again).
 *
 * "Days Since Declaration" is relative to the case's own initialization —
 * the earliest stage-timeline event's date, not the generation date itself.
 */
export function buildShipmentReportHtml(job: ClearanceJob, opts?: { generatedAt?: Date; company?: Partial<ReturnType<typeof getCompany>>; stageLabel?: string }): string {
  // Falls back to this browser's own hydrated company store for the normal
  // in-app "Print shipment report" button; the public share page (which has
  // no authenticated session, so no local company store to read) instead
  // passes the owning tenant's own company info fetched from the public API.
  const co = { ...getCompany(), ...opts?.company };
  // The public share page has no resolved `workflow` block to derive this
  // from (jobStageLabel needs workflowKind/workflowSteps, which the trimmed
  // public payload doesn't carry) — it passes the server's own already-
  // correct stage label instead, resolved the same way for both legacy and
  // custom-workflow shipments (see shipment-report.service.ts).
  const stageLabel = opts?.stageLabel ?? jobStageLabel(job);
  const generatedAt = opts?.generatedAt ?? new Date();
  const genDate = generatedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const genTime = generatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const sortedTimeline = [...job.timeline].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  const declaredAt = sortedTimeline[0]?.ts ? new Date(sortedTimeline[0].ts) : null;
  const dayFmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const daysSince = (d: Date) => declaredAt ? Math.round((d.getTime() - declaredAt.getTime()) / 86400000) : null;
  const daysAsOf = declaredAt ? daysSince(generatedAt) : null;

  const timelineRows = sortedTimeline.map(t => {
    const n = daysSince(new Date(t.ts));
    return `<tr>
      <td>${dayFmt(new Date(t.ts))}</td>
      <td class="stage-tag">${t.label}</td>
      <td>${t.note || ''}</td>
      <td class="num"><span class="day-count${n === 0 ? ' zero' : ''}">Day ${n ?? '—'}</span></td>
    </tr>`;
  }).join('');

  const statusClass: Record<string, string> = { pending: 'pending', processing: 'pending', done: 'received', failed: 'failed' };
  const statusLabel: Record<string, string> = { pending: 'Pending', processing: 'Processing', done: 'Received', failed: 'Failed' };
  const docRows = job.documents.map(d => {
    const st = d.extracted?.status || 'pending';
    return `<tr>
      <td>${d.name}</td>
      <td>${d.type.toUpperCase()}</td>
      <td><span class="status-flag ${statusClass[st] || 'pending'}">${statusLabel[st] || st}</span></td>
    </tr>`;
  }).join('');

  const co2Kg = job.co2EmissionsKg;
  const credits = job.carbonCreditsSaved;
  const calc = job.co2CalcDetails;
  const carbonSection = co2Kg != null ? `
  <div class="section-title">Carbon Footprint (Estimate)</div>
  <table class="kv">
    <tr>
      <td class="k">CO₂ Emissions</td><td class="v">${Number(co2Kg).toLocaleString('en')} kg</td>
      <td class="k">Credits Saved (est.)</td><td class="v">${Number(credits ?? 0).toFixed(2)}</td>
    </tr>
    ${calc ? `<tr>
      <td class="k">Distance</td><td class="v">${calc.distance_km ?? '—'} km</td>
      <td class="k">Mode</td><td class="v">${calc.mode ?? job.mode}</td>
    </tr>` : ''}
  </table>
  <div class="note-line">GLEC v3.2 / ISO 14083 methodology, computed from route distance and cargo weight. Internal ESG estimate — not a registry-issued or tradeable carbon credit.</div>` : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${job.sysRef || job.id} — Shipment Report</title>
<style>
  @page { size: A4; margin: 14mm 14mm 12mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: Arial, Helvetica, sans-serif; color: #171717; font-size: 11px; line-height: 1.4; }
  .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 14mm 12mm 14mm; background: #fff; }

  .doc-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #171717; padding-bottom: 8px; }
  .org-logo { height: 26px; display: block; }
  .org-name { font-size: 14px; font-weight: 700; }
  .org-addr { font-size: 9.5px; color: #555; margin-top: 6px; }
  .doc-id-block { text-align: right; }
  .doc-label { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: #555; }
  .doc-number { font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }
  .doc-generated { font-size: 9.5px; color: #555; margin-top: 2px; }

  .metrics-strip { display: table; width: 100%; table-layout: fixed; border: 1px solid #171717; border-top: none; margin-bottom: 14px; }
  .metric-cell { display: table-cell; border-right: 1px solid #d0d0d0; padding: 7px 10px; vertical-align: middle; }
  .metric-cell:last-child { border-right: none; }
  .metric-cell.emph { background: #171717; }
  .metric-label { font-size: 8.5px; letter-spacing: 0.6px; text-transform: uppercase; color: #666; }
  .metric-cell.emph .metric-label { color: #ccc; }
  .metric-value { font-size: 13px; font-weight: 700; margin-top: 1px; }
  .metric-cell.emph .metric-value { color: #fff; }

  .section-title { font-size: 10.5px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; padding: 4px 0; margin-top: 14px; margin-bottom: 6px; border-bottom: 1px solid #171717; }

  table.kv { width: 100%; border-collapse: collapse; border: 1px solid #c8c8c8; }
  table.kv td { border: 1px solid #c8c8c8; padding: 5px 8px; font-size: 10.5px; vertical-align: top; }
  table.kv td.k { width: 17%; background: #f4f4f4; font-weight: 700; color: #444; font-size: 9px; letter-spacing: 0.4px; text-transform: uppercase; }
  table.kv td.v { width: 33%; font-weight: 600; }
  td.mono { font-family: "Courier New", monospace; letter-spacing: 0.2px; }

  table.tl { width: 100%; border-collapse: collapse; font-size: 10px; }
  table.tl th { text-align: left; font-size: 8.5px; letter-spacing: 0.5px; text-transform: uppercase; color: #fff; background: #171717; padding: 5px 8px; border: 1px solid #171717; }
  table.tl th.num, table.tl td.num { text-align: right; }
  table.tl td { padding: 5px 8px; border: 1px solid #d8d8d8; vertical-align: top; }
  table.tl tr:nth-child(even) td { background: #fafafa; }
  .stage-tag { font-weight: 700; font-size: 9.5px; }
  .day-count { font-family: "Courier New", monospace; font-weight: 700; }
  .day-count.zero { color: #555; }

  table.docs { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  table.docs th { text-align: left; font-size: 8.5px; letter-spacing: 0.5px; text-transform: uppercase; color: #fff; background: #171717; padding: 5px 8px; border: 1px solid #171717; }
  table.docs td { padding: 6px 8px; border: 1px solid #d8d8d8; }
  table.docs tr:nth-child(even) td { background: #fafafa; }
  .status-flag { font-size: 9px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; padding: 1px 6px; border: 1px solid #171717; display: inline-block; }
  .status-flag.pending { color: #7a4b00; border-color: #b8860b; background: #fff8ea; }
  .status-flag.received { color: #145a32; border-color: #1e8449; background: #eafaf1; }
  .status-flag.failed { color: #7a1a1a; border-color: #b83030; background: #fff0f0; }

  .doc-footer { margin-top: 22px; padding-top: 6px; border-top: 1px solid #171717; display: flex; justify-content: space-between; font-size: 8.5px; color: #666; }
  .note-line { margin-top: 8px; font-size: 8.5px; color: #777; font-style: italic; }

  @media print { .sheet { width: auto; min-height: 0; margin: 0; padding: 0; } }
</style>
</head><body>
<div class="sheet">

  <div class="doc-header">
    <div>
      ${co.logoUrl ? `<img class="org-logo" src="${co.logoUrl}" alt="${co.name}">` : `<div class="org-name">${co.name}</div>`}
      <div class="org-addr">${co.address} &nbsp;|&nbsp; ${co.city}, ${co.country}</div>
    </div>
    <div class="doc-id-block">
      <div class="doc-label">Shipment Report</div>
      <div class="doc-number">${job.sysRef || job.id}</div>
      <div class="doc-generated">Generated: ${genDate}, ${genTime}</div>
    </div>
  </div>

  <div class="metrics-strip">
    <div class="metric-cell">
      <div class="metric-label">Current Stage</div>
      <div class="metric-value">${stageLabel}</div>
    </div>
    <div class="metric-cell">
      <div class="metric-label">Declaration Date</div>
      <div class="metric-value">${declaredAt ? dayFmt(declaredAt) : '—'}</div>
    </div>
    <div class="metric-cell emph">
      <div class="metric-label">Days Since Declaration</div>
      <div class="metric-value">${daysAsOf ?? '—'} Days</div>
    </div>
    <div class="metric-cell">
      <div class="metric-label">Mode</div>
      <div class="metric-value">${job.mode}</div>
    </div>
  </div>

  <div class="section-title">Shipment Overview</div>
  <table class="kv">
    <tr>
      <td class="k">Goods</td><td class="v">${job.title}</td>
      <td class="k">Customer</td><td class="v">${job.customer}</td>
    </tr>
    <tr>
      <td class="k">Origin</td><td class="v">${job.origin}</td>
      <td class="k">Destination</td><td class="v">${job.destination}</td>
    </tr>
    <tr>
      <td class="k">Weight</td><td class="v">${job.weight || '—'}</td>
      <td class="k">Declared Value</td><td class="v">${job.invoiceValue || '—'}</td>
    </tr>
    <tr>
      <td class="k">B/L Number</td><td class="v mono">${job.bl || '—'}</td>
      <td class="k">TANSAD</td><td class="v mono">${job.tansad || '—'}</td>
    </tr>
    ${job.vessel || (job.containers && job.containers.length > 0) ? `<tr>
      <td class="k">Vessel</td><td class="v">${job.vessel || '—'}</td>
      <td class="k">Containers</td><td class="v">${job.containers && job.containers.length > 0 ? job.containers.join(', ') : '—'}</td>
    </tr>` : ''}
  </table>

  ${carbonSection}

  ${sortedTimeline.length > 0 ? `
  <div class="section-title">Stage Timeline</div>
  <table class="tl">
    <colgroup><col style="width:16%"><col style="width:22%"><col style="width:44%"><col style="width:18%"></colgroup>
    <tr><th>Date</th><th>Stage</th><th>Note</th><th class="num">Days Since Declaration</th></tr>
    ${timelineRows}
  </table>
  ${declaredAt ? `<div class="note-line">Days Since Declaration is calculated relative to the case initialization date (${dayFmt(declaredAt)}). Report generated at Day ${daysAsOf}.</div>` : ''}` : ''}

  ${job.documents.length > 0 ? `
  <div class="section-title">Documents</div>
  <table class="docs">
    <colgroup><col style="width:46%"><col style="width:27%"><col style="width:27%"></colgroup>
    <tr><th>Document</th><th>Type</th><th>Status</th></tr>
    ${docRows}
  </table>` : ''}

  ${HUDUMIKA_FOOTER_HTML}

</div>
</body></html>`;
}

/* ── Shipment report — printable summary window, mirrors Billing.tsx's openPrintWindow ── */
function openShipmentReportWindow(job: ClearanceJob) {
  const html = buildShipmentReportHtml(job).replace('</body>', '<script>window.onload=function(){window.print()}</script></body>');
  const win = window.open('', '_blank', 'width=860,height=1000');
  if (win) { win.document.write(html); win.document.close(); }
}

/** Gets or creates this shipment's public "check progress" link (the same
 *  one the daily WhatsApp automation sends) and copies it to the clipboard —
 *  see shipment-report.service.ts / ShipmentReportShared.tsx. */
async function shareShipmentReportLink(id: string) {
  try {
    const res = await apiFetch(`/v1/shipments/${id}/report-share`, { method: 'POST' });
    if (res?.url) {
      await navigator.clipboard.writeText(res.url);
      showAlert('Progress link copied — share it via WhatsApp or email.', { variant: 'success' });
    } else {
      showAlert('Link created, but the public app URL isn’t configured yet — ask an admin to set it before sharing.', { variant: 'warning' });
    }
  } catch (e: any) {
    showAlert(e.message || 'Could not create a share link.', { variant: 'error' });
  }
}

/**
 * A person's face. Drew initials and only initials, so somebody with a picture
 * still appeared as "SA" everywhere outside the header — which does use the
 * shared component.
 *
 * With a `userId` it delegates to PersonAvatar, which fetches the picture once
 * and shares it from a module cache across every app. Without one it keeps
 * drawing initials, which is the right answer for a name we cannot resolve to
 * an account rather than a gap to paper over.
 */
function Av({ name, size = 32, userId }: { name: string; size?: number; userId?: string | null }) {
  if (userId && isUUID(userId)) {
    return <PersonAvatar userId={userId} name={name} size={size} />;
  }
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

/**
 * Real customs-value risk signal for one declaration line — the platform's
 * own historical declared values for this HS code (+ origin), aggregated
 * across every tenant's finalized declarations. See customs.service.ts's
 * getValuationReference: anonymized stats only, gated behind a minimum
 * sample size, never a raw declaration or another tenant's identity.
 */
function ValuationSignalBadge({ hsCode, countryOfOrigin }: { hsCode: string; countryOfOrigin: string }) {
  const [ref, setRef] = useState<{ sampleCount: number; medianUnitValueTzs: number; minUnitValueTzs: number; maxUnitValueTzs: number } | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const hs = hsCode.trim();
    if (!hs) { setRef(null); setChecked(false); return; }
    const t = setTimeout(() => {
      const params = new URLSearchParams({ hs_code: hs });
      if (countryOfOrigin.trim()) params.set('country_of_origin', countryOfOrigin.trim());
      apiFetch(`/v1/customs/valuation-reference?${params.toString()}`)
        .then((res: any) => { setRef(res?.rows?.[0] ?? null); setChecked(true); })
        .catch(() => { setRef(null); setChecked(true); });
    }, 400);
    return () => clearTimeout(t);
  }, [hsCode, countryOfOrigin]);

  if (!hsCode.trim() || !checked || !ref) return null;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: -2, marginBottom: 8, marginLeft: 10, fontSize: 11.5, color: 'var(--ink3)' }}>
      <Icon name="trendingUp" size={11} color="var(--ink3)" />
      Typical declared value: TZS {Math.round(ref.medianUnitValueTzs).toLocaleString()} / unit
      <span style={{ color: 'var(--ink3)' }}>(range {Math.round(ref.minUnitValueTzs).toLocaleString()}–{Math.round(ref.maxUnitValueTzs).toLocaleString()}, {ref.sampleCount} past declarations)</span>
    </div>
  );
}

// ─── Stage Stepper ────────────────────────────────────────────────────────────

function StageStepper({ job }: { job: ClearanceJob }) {
  const steps = jobUiSteps(job);
  const currentIdx = jobCurrentIdx(job);
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 24px', overflowX: 'auto', gap: 0 }}>
      {steps.map((s, i) => {
        const done = i < currentIdx; const active = i === currentIdx;
        return (
          <React.Fragment key={s.id}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, minWidth: 64 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: active || done ? 'hsl(var(--primary))' : 'var(--border)', color: active || done ? 'hsl(var(--primary-foreground))' : 'var(--ink3)', fontSize: 11, fontWeight: 700, boxShadow: active ? '0 0 0 4px var(--teal-l)' : 'none', transition: 'all 0.2s' }}>
                {done ? <Icon name="check" size={13} /> : <span>{i + 1}</span>}
              </div>
              <div style={{ fontSize: 9, fontWeight: active ? 700 : 500, color: active ? 'var(--teal)' : done ? 'var(--ink2)' : 'var(--ink3)', marginTop: 4, textAlign: 'center', lineHeight: 1.2, maxWidth: 60, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.short}
              </div>
            </div>
            {i < steps.length - 1 && (
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
  // assignees[0] is the assigned user's id. Showing it rendered the customer's
  // clearing agent as "1e996956-431d-42c0-8bc9-164d9797d31a"; the name the
  // server sends is assigneeName.
  const agentName = job.assigneeName || job.assignees[0];
  if (agentName && isUUID(agentName)) return null;
  if (!agentName) return null;
  const agent = EMPLOYEES.find(e => e.name === agentName);

  return (
    <SectionCard title="Your Clearing Agent">
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
          <a href={`tel:${agent.phone}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderRadius: 7, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
            <Icon name="phone" size={13} color="#fff" /> Call
          </a>
          <a href={`mailto:${agent.email}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
            <Icon name="mail" size={13} /> Email
          </a>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Advance Stage Modal ──────────────────────────────────────────────────────

function AdvanceStageModal({ job, onClose, onAdvance, embedded = false }: {
  job: ClearanceJob; onClose: () => void;
  onAdvance: (stage: string, note: string, blocker: string, channels: Channel[]) => void;
  embedded?: boolean;
}) {
  const steps = jobUiSteps(job);
  const currentIdx = jobCurrentIdx(job);
  const current = currentIdx >= 0 ? steps[currentIdx] : undefined;
  // A custom workflow permits exactly the current step's declared next steps
  // (forward) plus any earlier step (backward, for re-validation) — matching
  // what the backend engine enforces. The legacy ladder keeps its old, looser
  // behaviour of offering every later stage.
  const nextStages = job.workflowKind === 'CUSTOM'
    ? [
        ...steps.filter(s => current?.nextStepIds?.includes(s.id)),
        ...steps.filter((_, i) => i < currentIdx),
      ]
    : steps.filter((_, i) => i > currentIdx);
  const [selected, setSelected] = useState(nextStages[0]?.id || '');
  const [note, setNote] = useState('');
  const [blocker, setBlocker] = useState('');
  const [chans, setChans] = useState<Channel[]>(['whatsapp', 'email']);
  function toggle(ch: Channel) { setChans(p => p.includes(ch) ? p.filter(c => c !== ch) : [...p, ch]); }
  // What must be true to enter the chosen step, evaluated for this shipment —
  // shown so a blocked transition is explained up front, not after it fails.
  const targetReqs = job.workflowKind === 'CUSTOM'
    ? job.workflowSteps?.find(s => s.id === selected)?.requirements
    : undefined;
  const hasUnmet = !!targetReqs?.some(r => !r.passed);
  // Inline panel, not a popup — pushed into normal document flow directly
  // under the header instead of a darkened full-screen overlay.
  return (
    <div style={embedded
      ? { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }
      : { background: 'var(--white)', borderBottom: '1px solid var(--border)', boxShadow: 'var(--elev-lg)' }}>
      <div style={embedded ? {} : { maxWidth: 560, margin: '0 auto' }}>
        <div style={{ padding: '16px 20px 0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Advance Stage</div>
          <button type="button" onClick={onClose} style={{ background: 'var(--bg)', border: 'none', borderRadius: 'var(--r)', cursor: 'pointer', color: 'var(--ink3)', padding: 6, display: 'flex' }} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Move to Stage</label>
            <Select value={selected} onValueChange={v => setSelected(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {nextStages.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {targetReqs && targetReqs.length > 0 && (
            <div style={{ marginBottom: 14, background: 'var(--bg)', border: `1px solid ${hasUnmet ? 'var(--red-l)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 7 }}>Requirements to enter this stage</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {targetReqs.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
                    <Icon name={r.passed ? 'checkCircle' : 'alertCircle'} size={14} color={r.passed ? 'var(--green)' : 'var(--red)'} />
                    <span style={{ color: r.passed ? 'var(--ink2)' : 'var(--ink)', fontWeight: r.passed ? 500 : 600 }}>{r.label}</span>
                  </div>
                ))}
              </div>
              {hasUnmet && (
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 8, lineHeight: 1.45 }}>
                  Resolve the unmet items — verify the documents in the <strong>Files</strong> tab — before this stage will accept the case.
                </div>
              )}
            </div>
          )}

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
            <button type="button" disabled={!selected} onClick={() => selected && onAdvance(selected, note, blocker, chans)} style={{ padding: 'var(--ds-btn-py) 20px', background: selected ? 'hsl(var(--primary))' : 'var(--border)', color: selected ? 'hsl(var(--primary-foreground))' : 'var(--ink3)', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: selected ? 'pointer' : 'default', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              Update Stage →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Advance Stage — three-column view (previews | docs + verify | data cards) ─

function DocPreview({ shipmentId, doc }: { shipmentId: string; doc: ShipDoc }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let obj: string | null = null; let cancelled = false;
    apiFetchBlob(`/v1/shipments/${shipmentId}/documents/${doc.id}/view`)
      .then(blob => { if (cancelled) return; obj = URL.createObjectURL(blob); setUrl(obj); setState('ready'); })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; if (obj) URL.revokeObjectURL(obj); };
  }, [shipmentId, doc.id]);
  const isImg = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(doc.name);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--white)', flexShrink: 0 }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="fileText" size={14} color="var(--ink3)" />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{doc.name}</span>
        {doc.status === 'VERIFIED' && <Icon name="checkCircle" size={13} color="var(--green)" />}
      </div>
      <div style={{ height: 380, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {state === 'loading' && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Loading preview…</span>}
        {state === 'error' && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Preview unavailable</span>}
        {state === 'ready' && url && (isImg
          ? <img src={url} alt={doc.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          : <iframe title={doc.name} src={url} style={{ width: '100%', height: '100%', border: 'none' }} />)}
      </div>
    </div>
  );
}

function DocVerifyList({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const { user } = useAuth();
  const canVerify = !!(user && user.role !== 'CUSTOMER');
  const [verifying, setVerifying] = useState<string | null>(null);
  const docs = job.documents.filter(d => !d.pending);
  async function verify(docId: string) {
    if (!isLive || verifying) return;
    setVerifying(docId);
    try {
      await apiFetch(`/v1/shipments/${shipmentId}/documents/${docId}/verify`, { method: 'PATCH', body: JSON.stringify({ status: 'VERIFIED' }) });
      onRefresh();
    } catch (err: any) { showAlert(err.message || 'Could not verify document'); }
    finally { setVerifying(null); }
  }
  return (
    <Card title="Documents & verification" padded={false}>
      {docs.length === 0 ? (
        <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>No documents uploaded yet.</div>
      ) : docs.map((d, i) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
          <Icon name="fileText" size={15} color="var(--ink3)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{DOC_TYPE_LABEL[d.type] ?? d.type}</div>
          </div>
          {d.status === 'VERIFIED' ? (
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--green-l)', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="checkCircle" size={11} color="var(--green)" /> Verified</span>
          ) : canVerify ? (
            <button type="button" onClick={() => verify(d.id)} disabled={verifying === d.id} style={{ fontSize: 11, fontWeight: 700, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 'var(--r)', border: '1px solid var(--green)', background: 'var(--white)', color: 'var(--green)', cursor: verifying === d.id ? 'default' : 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }}>
              {verifying === d.id ? '…' : 'Verify'}
            </button>
          ) : <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{d.status === 'RECEIVED' ? 'Received' : ''}</span>}
        </div>
      ))}
    </Card>
  );
}

function AdvanceStageView({ job, shipmentId, isLive, isMobile, onClose, onAdvance, onRefresh }: {
  job: ClearanceJob; shipmentId: string; isLive: boolean; isMobile: boolean;
  onClose: () => void; onAdvance: (stage: string, note: string, blocker: string, channels: Channel[]) => void; onRefresh: () => void;
}) {
  const docs = job.documents.filter(d => !d.pending);
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
      {/* Column 1 — document previews */}
      {!isMobile && (
        <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100vh - 210px)', overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Document previews</div>
          {docs.length === 0
            ? <div style={{ padding: '28px 16px', fontSize: 13, color: 'var(--ink3)', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 10 }}>No documents to preview.</div>
            : docs.map(d => <DocPreview key={d.id} shipmentId={shipmentId} doc={d} />)}
        </div>
      )}
      {/* Column 2 — documents + verification + the advance form */}
      <div style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DocVerifyList job={job} shipmentId={shipmentId} isLive={isLive} onRefresh={onRefresh} />
        <AdvanceStageModal job={job} onClose={onClose} onAdvance={onAdvance} embedded />
      </div>
      {/* Column 3 — the standard data cards */}
      {!isMobile && <ListenersSidebar job={job} shipmentId={shipmentId} isLive={isLive} onRefresh={onRefresh} />}
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
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
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
    <Card title="Workflow automation" padded={false} collapsible defaultOpen={false}>
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
  // Excise (Management and Tariff) Act, Cap.147 R.E. 2019, s.141(1)(a): the
  // excisable value of an imported article is CIF plus the import duty
  // payable — not CIF alone. VAT is then assessed on the duty-and-excise-
  // inclusive value, same as the Landed Cost Calculator (customs.service.ts).
  const excAmt  = (cifTzs + dutyAmt) * (Number(financial.excise_rate) / 100);
  const vatAmt  = (cifTzs + dutyAmt + excAmt) * (Number(financial.vat_rate) / 100);
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
              style={{ fontSize: 11, fontWeight: 700, color: 'hsl(var(--primary-foreground))', background: 'hsl(var(--primary))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 12px', cursor: 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
              Apply OCR data
            </button>
          </div>
        </div>
      )}

      {/* Sub-tab strip — the shared segmented ds-tabs, same as the shipment
          tabs (was a hand-rolled pill row on a --bg track, which flattened to
          white inside .page-layout). */}
      <Tabs value={sub} onValueChange={v => setSub(v as typeof sub)} variant="segmented">
        <TabsList style={{ marginBottom: 20, maxWidth: '100%' }}>
          {SUB_TABS.map(t => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

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
              {/* The Duty Rate field below is typed by hand — this cross-checks
                  it against the EAC CET database in one click, in a new tab so
                  the declaration form here isn't disturbed mid-edit. */}
              {line.hs.trim() && (
                <a href={`/clearos/duty-check?hs=${encodeURIComponent(line.hs.trim())}`} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: -2, marginBottom: 8, fontSize: 11.5, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
                  <Icon name="percent" size={11} color="var(--teal)" /> Check duty for {line.hs.trim()} <Icon name="externalLink" size={10} color="var(--teal)" />
                </a>
              )}
              <ValuationSignalBadge hsCode={line.hs} countryOfOrigin={line.origin} />
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

  async function handleSetStage(stage: string) {
    const curId = job.workflowKind === 'CUSTOM' ? (job.currentStepId ?? '') : job.stage;
    if (stage === curId) { setShowStageBar(false); return; }
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    const stageLabel = jobUiSteps(job).find(s => s.id === stage)?.label ?? stage;
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/stage`, {
          method: 'PATCH',
          body: JSON.stringify({ stage: jobBackendStage(job, stage), note: 'Stage updated from Updates tab' }),
        });
        onRefresh();
      } else {
        const event: TimelineEvent = { id: 'ev-' + Date.now(), stage: stage as Stage, label: stageLabel, userId: 'me', userName: 'You', ts: new Date(), note: 'Stage updated from Updates tab' };
        const msg: ThreadMsg = { id: 'msg-' + Date.now(), userId: 'me', userName: 'You', content: `Stage updated → ${stageLabel}`, ts: new Date(), channels: isInternal ? ['internal'] : (chans.length ? chans : ['internal']), isInternal: false };
        updateJob(job.id, j => ({ ...j, stage: stage as Stage, timeline: [...j.timeline, event], thread: [...j.thread, msg] }));
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
            {(() => { const uiSteps = jobUiSteps(job); const curIdx = jobCurrentIdx(job); return uiSteps.map((s, i) => {
              const cur = i === curIdx;
              const past = i < curIdx;
              return (
                <button key={s.id} type="button" onClick={() => handleSetStage(s.id)}
                  style={{ fontSize: 11, fontWeight: 700, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 'var(--r)', cursor: 'pointer', border: `1.5px solid ${cur ? 'var(--teal)' : past ? 'var(--green)' : 'var(--border)'}`, background: cur ? 'var(--teal)' : past ? 'var(--green-l)' : 'var(--white)', color: cur ? '#fff' : past ? 'var(--green)' : 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 5, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: .7 }}>{i + 1}</span> {s.short}
                </button>
              );
            }); })()}
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
        <SectionCard title="Your Shipment's Journey">
          <CustomerMilestoneTimeline job={job} />
        </SectionCard>

        <CustomerAttentionPanel job={job} />

        <SectionCard title="Shipment Details">
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
        </SectionCard>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <CustomerAgentCard job={job} />
        <SectionCard title="Shared Documents">
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 10 }}>{job.documents.length} document{job.documents.length === 1 ? '' : 's'} on this shipment</div>
          <Link to={`?tab=files`} style={{ display: 'block', textAlign: 'center', padding: '9px 0', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', textDecoration: 'none' }}>
            View Files
          </Link>
        </SectionCard>
      </div>
    </div>
  );
}

// ── Card shell — one consistent card style used across the redesigned Overview ──
// The shipment page's section card is the shared SectionCard — kept as a local
// `Card` alias so the ~30 call sites on this page read unchanged.
const Card = SectionCard;

function SpecRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink3)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', fontFamily: mono ? 'var(--mono)' : undefined, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

const DOC_TYPE_LABEL: Record<string, string> = { bl: 'Bill of Lading', awb: 'Air Waybill', invoice: 'Commercial Invoice', packing_list: 'Packing List', permit: 'Permit', certificate: 'Certificate', other: 'Document', customs_entry: 'Customs Entry', duty_receipt: 'Duty Receipt', release_order: 'Release Order', delivery_note: 'Delivery Note', pre_assessment: 'Pre-assessment', final_assessment: 'Final assessment', tiss: 'TISS', payment_note: 'Payment note', tiss_payment_invoice: 'TISS payment invoice', tbs_charges: 'TBS charges', coc: 'Certificate of Conformity', wharfage: 'Wharfage' };

function OverviewTab({ job, isMobile, isLive, onRefresh }: { job: ClearanceJob; isMobile: boolean; isLive: boolean; onRefresh: () => void }) {
  const company = useCompany();
  // Document view/download/verify now live in the unified <DocumentsPanel/>.
  const totalTasks   = job.tasks.length;
  const doneTasks    = job.tasks.filter(t => t.status === 'complete').length;
  const totalHours   = job.timeEntries.reduce((s, e) => s + e.hours, 0);
  const totalCharges = job.ledger.filter(e => e.type === 'charge').reduce((s, e) => s + e.amount, 0);
  const totalPaid    = job.ledger.filter(e => e.type === 'payment').reduce((s, e) => s + e.amount, 0);
  const daysLeft     = job.dueDate ? Math.ceil((job.dueDate.getTime() - Date.now()) / 86400000) : null;
  const isOverdueBal = job.dueDate ? new Date() > job.dueDate : false;
  const balanceDue   = Math.max(0, totalCharges - totalPaid);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 12 }}>
        {[
          { label: 'Tasks',        value: `${doneTasks}/${totalTasks}`, sub: `${totalTasks - doneTasks} open`,         color: 'var(--ink)', icon: 'checkCircle' as IconName },
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
      {/* minmax(0, …), not a bare 3fr/2fr: a grid item's default min-width is
          min-content, so long values (filenames, addresses) let each column
          refuse to shrink and the whole grid overflows its flex parent —
          sliding under the 248px listeners rail beside it. minmax(0,…) lets the
          columns shrink and the rail sits cleanly alongside at every width. */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 3fr) minmax(0, 2fr)', gap: 16 }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Shipment Details">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0 32px' }}>
              <div>
                <SpecRow label="B/L Number" value={job.bl || '—'} mono />
                <SpecRow label="TANSAD" value={job.tansad || '—'} mono />
                <SpecRow label="Vessel" value={<VesselLiveStatus vesselName={job.vessel} mode={job.mode} />} />
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

          {/* Dangerous goods — captured on the Cargo Details edit step
              (ShipmentEdit.tsx), alongside the Normal/Dangerous goods
              choice; this card is the read/issue/print surface for
              whatever was saved there. Only ever rendered when the
              shipment is actually tagged, so an ordinary shipment's
              Overview stays exactly as it was. */}
          {job.hasDangerousGoods && (
            <Card title="Dangerous Goods">
              <DangerousGoodsPanel shipmentId={job.id} />
            </Card>
          )}

          {/* Contact Details — Ship From (our company) / Ship To (customer) */}
          <Card title="Contact Details">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20 }}>
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

          {/* Documents live on the Files tab now, not here. */}

          <RelatedRecordsPanel
            entityType="shipment"
            entityId={job.id}
            title="Linked Apps"
            isMobile={isMobile}
            emptyText="No invoices, demurrage tracking, AWB/BL snapshots, or transport trips linked to this shipment yet."
          />
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* The "Assigned Officer" card that used to open this column was a
              plain, read-only duplicate of the sidebar's "Assigned To" card
              (ListenersSidebar, below) — same avatar and name, minus the
              Change/+Assign action that card already has. One is enough. */}

          {/* What the workflow did, next to what people did. */}
          <AutomationHistoryCard shipmentId={job.id} />

          {/* Activity feed — timeline style */}
          <Card title="Activity Feed" padded={false} collapsible defaultOpen={false}>
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
  // A task's status is changed by whoever owns it — the assignee — or by a team
  // lead: a senior/manager who oversees them.
  const TEAM_LEAD_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR'];
  const isLead = !!(user && TEAM_LEAD_ROLES.includes(user.role));
  const canEditStatus = (task: InternalTask) => isLead || (!!task.assignedToId && task.assignedToId === user?.id);
  const TO_BACKEND: Record<TaskStatus, string> = { not_started: 'open', in_progress: 'in_progress', testing: 'testing', awaiting_feedback: 'blocked', complete: 'complete' };
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  async function setTaskStatus(task: InternalTask, next: TaskStatus) {
    if (!canEditStatus(task) || savingStatus || next === task.status) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    setSavingStatus(task.id);
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: TO_BACKEND[next] }) });
        onRefresh();
      } else {
        updateJob(job.id, j => ({ ...j, tasks: j.tasks.map(t => t.id === task.id ? { ...t, status: next } : t) }));
      }
    } catch (err: any) { showAlert(err.message || 'Could not update task'); }
    finally { setSavingStatus(null); }
  }

  // Formal sign-off: close (or reopen) a task. Same permission as status —
  // assignee or team lead — enforced again on the server.
  async function closeTask(task: InternalTask, action: 'close' | 'reopen') {
    if (!canEditStatus(task) || savingStatus) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    setSavingStatus(task.id);
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/tasks/${task.id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
        onRefresh();
      }
    } catch (err: any) { showAlert(err.message || `Could not ${action} task`); }
    finally { setSavingStatus(null); }
  }
  const nameFor = (id?: string) => (id ? (staff.find(s => s.id === id)?.name || friendlyAssignee(id)) : '');

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
        if (newProductId && service) {
          await apiFetch(`/v1/shipments/${shipmentId}/ledger`, {
            method: 'POST',
            body: JSON.stringify({
              description: `[CLEARANCE] Task: ${newTitle} (${service.name})`,
              amount: service.sale_price,
              type: 'charge',
              category: 'CLEARANCE'
            }),
          });
        }
        onRefresh();
      } else {
        const task: InternalTask = {
          id: 'task-' + Date.now(), title: newTitle, status: 'not_started', priority: newPriority,
          assignees: newAssignee ? [assigneeName || newAssignee] : [], startDate: new Date(),
          dueDate: newDue ? new Date(newDue) : new Date(Date.now() + 7 * 86400000), tags: [],
          productId: service?.id, serviceName: service?.name, serviceRate: service?.sale_price,
          serviceCurrency: service?.currency, serviceUnit: service?.unit,
        };
        const ledgerEntries = [...job.ledger];
        if (service) {
          ledgerEntries.push({
            id: 'led-' + Date.now(),
            description: `[CLEARANCE] Task: ${newTitle} (${service.name})`,
            amount: service.sale_price,
            currency: service.currency || 'TZS',
            type: 'charge',
            date: new Date(),
            status: 'pending'
          });
        }
        updateJob(job.id, j => ({ ...j, tasks: [...j.tasks, task], ledger: ledgerEntries }));
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
        <button type="button" onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="plus" size={14} /> Add Task
        </button>
      </div>

      {/* Add-task form */}
      {showAdd && (
        <div style={{ marginBottom: 14 }}>
        <Card title="New Task">
        <form onSubmit={handleAdd}>
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
        </Card>
        </div>
      )}

      {/* Table */}
      <div className="rtbl-wrap">
      <Card padded={false}>
        <table className="rtbl" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['#','Task','Service','Status','Start','Due','Assignees','Priority','Tags','Actions'].map(h => (
              <th key={h} style={{ padding: '10px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No tasks match this filter.</td></tr>}
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
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {task.closedAt ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span title={`Closed ${fdate(task.closedAt)}${task.closedById ? ` by ${nameFor(task.closedById)}` : ''}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>
                          <Icon name="lock" size={12} /> Closed{task.closedById ? ` · ${nameFor(task.closedById)}` : ''}
                        </span>
                        {canEditStatus(task) && (
                          <button type="button" onClick={() => closeTask(task, 'reopen')} disabled={savingStatus === task.id} title="Reopen this task"
                            style={{ fontSize: 11, fontWeight: 600, padding: 'var(--ds-btn-py-xs) 9px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', cursor: savingStatus === task.id ? 'default' : 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }}>
                            Reopen
                          </button>
                        )}
                      </div>
                    ) : canEditStatus(task) ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 150 }}>
                          <Select value={task.status} onValueChange={v => setTaskStatus(task, v as TaskStatus)} disabled={savingStatus === task.id}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(['not_started', 'in_progress', 'testing', 'awaiting_feedback', 'complete'] as TaskStatus[]).map(s => (
                                <SelectItem key={s} value={s}>{TASK_STATUS_CFG[s].label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {task.status !== 'complete' && (
                          <button type="button" onClick={() => setTaskStatus(task, 'complete')} disabled={savingStatus === task.id} title="Mark complete"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: 'var(--ds-btn-py-xs) 9px', borderRadius: 'var(--r)', border: '1px solid var(--green)', background: 'var(--white)', color: 'var(--green)', cursor: savingStatus === task.id ? 'default' : 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }}>
                            <Icon name="check" size={12} />
                          </button>
                        )}
                        <button type="button" onClick={() => closeTask(task, 'close')} disabled={savingStatus === task.id} title="Close & sign off this task"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: 'var(--ds-btn-py-xs) 9px', borderRadius: 'var(--r)', border: '1px solid var(--teal)', background: 'var(--teal-l)', color: 'var(--teal-d)', cursor: savingStatus === task.id ? 'default' : 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }}>
                          <Icon name="lock" size={11} /> Close
                        </button>
                      </div>
                    ) : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
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
        <button type="button" onClick={() => setShowLog(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="clock" size={14} /> Log Time
        </button>
      </div>

      {/* Log time form */}
      {showLog && (
        <div style={{ marginBottom: 14 }}>
        <Card title="Log Time Entry">
        <form onSubmit={handleLog}>
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
        </Card>
        </div>
      )}

      {/* Table */}
      <div className="rtbl-wrap">
      <Card padded={false}>
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
      </Card>
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
  { value: 'PRE_ASSESSMENT', label: 'Pre-assessment' },
  { value: 'FINAL_ASSESSMENT', label: 'Final assessment' },
  { value: 'TISS', label: 'TISS' },
  { value: 'PAYMENT_NOTE', label: 'Payment note' },
  { value: 'TISS_PAYMENT_INVOICE', label: 'TISS payment invoice' },
  { value: 'TBS_CHARGES', label: 'TBS charges' },
  { value: 'COC', label: 'Certificate of Conformity (COC)' },
  { value: 'WHARFAGE', label: 'Wharfage' },
  { value: 'OTHER', label: 'Other' },
];

// The full document manifest for a shipment — the whole clearance checklist in
// ONE place, not two overlapping panels. `required` gates the move to payment;
// the rest are the shipping/clearance and optional docs, including the ones
// uploaded in later steps. Any uploaded document whose type isn't listed here
// still shows, under "Other documents".
const DOC_MANIFEST: { title: string; required?: boolean; optional?: boolean; docs: { type: string; label: string }[] }[] = [
  { title: 'Shipping & clearance', docs: [
    { type: 'BL', label: 'Bill of Lading' },
    { type: 'INVOICE', label: 'Commercial Invoice' },
    { type: 'PACKING_LIST', label: 'Packing List' },
    { type: 'CUSTOMS_ENTRY', label: 'Customs Entry' },
    { type: 'DUTY_RECEIPT', label: 'Duty Receipt' },
  ] },
  { title: 'Required before payment', required: true, docs: [
    { type: 'PRE_ASSESSMENT', label: 'Pre-assessment' },
    { type: 'FINAL_ASSESSMENT', label: 'Final assessment' },
    { type: 'TISS', label: 'TISS' },
    { type: 'PAYMENT_NOTE', label: 'Payment note' },
    { type: 'TISS_PAYMENT_INVOICE', label: 'TISS payment invoice' },
  ] },
  { title: 'Optional — depends on the flow', optional: true, docs: [
    { type: 'TBS_CHARGES', label: 'TBS charges' },
    { type: 'COC', label: 'Certificate of Conformity' },
    { type: 'WHARFAGE', label: 'Wharfage' },
  ] },
];

function DocumentsPanel({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const { user } = useAuth();
  const canUpload = !!(user && user.role !== 'CUSTOMER');
  const canVerify = !!(user && user.role !== 'CUSTOMER');
  const [uploading, setUploading] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const targetType = React.useRef('');

  const docFor = (type: string) => job.documents.find(d => (d.apiType || '').toUpperCase() === type && !d.pending);

  function pick(type: string) {
    if (!isLive) { showAlert('Uploading is only available for live shipments, not demo data.'); return; }
    targetType.current = type;
    fileRef.current?.click();
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const type = targetType.current;
    setUploading(type);
    try {
      const fd = new FormData(); fd.append('type', type); fd.append('file', file);
      await apiFetch(`/v1/shipments/${shipmentId}/documents/upload?type=${encodeURIComponent(type)}`, { method: 'POST', body: fd });
      onRefresh();
    } catch (err: any) { showAlert(err.message || 'Upload failed'); }
    finally { setUploading(null); }
  }

  async function viewDoc(doc: ShipDoc) {
    try { await apiViewBlob(`/v1/shipments/${shipmentId}/documents/${doc.id}/view`); }
    catch (err: any) { showAlert(err.message || 'Could not open document'); }
  }
  async function shareDoc(doc: ShipDoc) {
    try {
      const blob = await apiFetchBlob(`/v1/shipments/${shipmentId}/documents/${doc.id}/view`);
      const file = new File([blob], doc.name, { type: blob.type || 'application/octet-stream' });
      const nav = navigator as any;
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: doc.name });   // real OS share sheet with the actual file
      } else {
        // Most desktop browsers can't share files — hand the file over so it can
        // be attached to whatever the user shares it through. No fake link.
        await apiDownload(`/v1/shipments/${shipmentId}/documents/${doc.id}/download`, doc.name);
        showAlert('This browser can’t open a share sheet, so the file was downloaded — attach it to share.', { variant: 'info', title: 'Downloaded to share' });
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;   // user dismissed the share sheet
      showAlert(err?.message || 'Could not share document');
    }
  }
  async function downloadDoc(doc: ShipDoc) {
    try { await apiDownload(`/v1/shipments/${shipmentId}/documents/${doc.id}/download`, doc.name); }
    catch (err: any) { showAlert(err.message || 'Download failed'); }
  }
  async function verifyDoc(doc: ShipDoc) {
    if (!isLive || verifying) return;
    setVerifying(doc.id);
    try {
      await apiFetch(`/v1/shipments/${shipmentId}/documents/${doc.id}/verify`, { method: 'PATCH', body: JSON.stringify({ status: 'VERIFIED' }) });
      onRefresh();
    } catch (err: any) { showAlert(err.message || 'Could not verify document'); }
    finally { setVerifying(null); }
  }
  async function deleteDoc(doc: ShipDoc) {
    if (!isLive) { showAlert('Deleting is only available for live shipments, not demo data.'); return; }
    const ok = await showConfirm(`Delete "${DOC_TYPE_LABEL[doc.type] ?? doc.type}"? The file is removed and this can’t be undone.`, { title: 'Delete document', variant: 'danger', confirmLabel: 'Delete' });
    if (!ok) return;
    setDeleting(doc.id);
    try {
      await apiFetch(`/v1/shipments/${shipmentId}/documents/${doc.id}`, { method: 'DELETE' });
      onRefresh();
    } catch (err: any) { showAlert(err.message || 'Could not delete document'); }
    finally { setDeleting(null); }
  }

  // Workflow-driven required list: the document entry-conditions of THIS
  // shipment's workflow (each step's `document:<TYPE>` requirement). This is
  // what makes the checklist change with the workflow — a Sea-import flow asks
  // for different docs than Air or Transit. When the workflow declares none
  // (e.g. a legacy shipment), fall back to the default required set.
  const wfDocTypes: { type: string; label: string }[] = [];
  {
    const seen = new Set<string>();
    for (const step of job.workflowSteps ?? []) {
      for (const req of step.requirements ?? []) {
        const f = req.field;
        if (f && f.startsWith('document:')) {
          const t = f.slice('document:'.length).toUpperCase();
          if (!seen.has(t)) { seen.add(t); wfDocTypes.push({ type: t, label: DOC_TYPE_LABEL[t.toLowerCase()] ?? t }); }
        }
      }
    }
  }
  const shipping = DOC_MANIFEST.find(g => !g.required && !g.optional)!;
  const optionalGroup = DOC_MANIFEST.find(g => g.optional)!;
  const requiredGroup = wfDocTypes.length > 0
    ? { title: 'Required by this workflow', required: true, docs: wfDocTypes }
    : DOC_MANIFEST.find(g => g.required)!;

  type Grp = { title: string; required?: boolean; optional?: boolean; docs: { type: string; label: string }[] };
  const requiredTypes = new Set(requiredGroup.docs.map(d => d.type));
  const groups: Grp[] = [
    requiredGroup,
    { title: shipping.title, docs: shipping.docs.filter(d => !requiredTypes.has(d.type)) },
    { title: optionalGroup.title, optional: true, docs: optionalGroup.docs.filter(d => !requiredTypes.has(d.type)) },
  ].filter(g => g.docs.length > 0);

  const requiredDocs = requiredGroup.docs;
  const haveCount = requiredDocs.filter(d => docFor(d.type)).length;
  const ready = haveCount === requiredDocs.length;

  const listedTypes = new Set(groups.flatMap(g => g.docs.map(d => d.type)));
  const others = job.documents.filter(d => !d.pending && !listedTypes.has((d.apiType || '').toUpperCase()));
  const uploadedAny = job.documents.some(d => !d.pending);

  // One row — a manifest slot (with or without its file) or an extra upload.
  const row = (key: string, type: string, label: string, doc: ShipDoc | undefined, required: boolean, pendingLabel: string) => (
    <div key={key} style={{
      display: 'flex', alignItems: 'center', gap: 12, minWidth: 0,
      // A lighter wash of the app accent for an uploaded row — the canonical
      // --teal-l tint blended most of the way to white, so it still reads as
      // "this app's colour" (orange in ClearOS, pink in NexusHR…) but softly.
      border: `1px solid ${doc ? 'color-mix(in srgb, var(--teal-m), var(--white) 40%)' : 'var(--border)'}`,
      borderRadius: 'var(--r, 10px)', padding: '10px 12px',
      background: doc ? 'color-mix(in srgb, var(--teal-l), var(--white) 55%)' : 'var(--white)',
    }}>
      <span style={{
        width: 30, height: 30, borderRadius: 'var(--r-sm, 8px)', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: doc ? 'var(--teal)' : required ? 'var(--gold-l)' : 'var(--bg)',
      }}>
        <Icon name={doc ? 'check' : required ? 'alertCircle' : 'fileText'} size={15}
          color={doc ? '#fff' : required ? 'var(--gold)' : 'var(--ink3)'} strokeWidth={doc ? 3 : 1.75} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{label}</div>
        <div title={doc ? doc.name : undefined} style={{ fontSize: 11.5, color: doc ? 'var(--ink2)' : required ? 'var(--gold)' : 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
          {doc ? `${doc.name} · ${fdate(doc.uploadedAt)}` : pendingLabel}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {doc && (
          <>
            {doc.status === 'VERIFIED' ? (
              <Tip label="Verified"><span className="doc-act is-verified" aria-label="Verified"><Icon name="checkCircle" size={17} /></span></Tip>
            ) : canVerify ? (
              <Tip label="Mark as verified"><button type="button" className="doc-act" onClick={() => verifyDoc(doc)} disabled={verifying === doc.id} aria-label="Mark as verified"><Icon name="checkCircle" size={16} /></button></Tip>
            ) : null}
            <Tip label="View document"><button type="button" className="doc-act" onClick={() => viewDoc(doc)} aria-label="View document"><Icon name="eye" size={16} /></button></Tip>
            <Tip label="Share document"><button type="button" className="doc-act" onClick={() => shareDoc(doc)} aria-label="Share document"><Icon name="send" size={16} /></button></Tip>
            <Tip label="Download document"><button type="button" className="doc-act" onClick={() => downloadDoc(doc)} aria-label="Download document"><Icon name="download" size={16} /></button></Tip>
            <Tip label="Delete document"><button type="button" className="doc-act is-delete" onClick={() => deleteDoc(doc)} disabled={deleting === doc.id} aria-label="Delete document"><Icon name="trash2" size={16} /></button></Tip>
          </>
        )}
        {canUpload && (
          <Tip label={doc ? 'Replace document' : 'Upload document'}>
            <button type="button" className="doc-act" onClick={() => pick(type)} disabled={uploading === type} aria-label={doc ? 'Replace document' : 'Upload document'}>
              <Icon name="upload" size={16} />
            </button>
          </Tip>
        )}
      </div>
    </div>
  );

  return (
    <Card title="Documents" collapsible defaultOpen action={uploadedAny ? (
      <button type="button" onClick={() => job.documents.filter(d => !d.pending).forEach(downloadDoc)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
        <Icon name="download" size={12} color="var(--teal)" /> Download All
      </button>
    ) : undefined}>
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFile} />
      <div style={{ fontSize: 12, fontWeight: 600, color: ready ? 'var(--teal)' : 'var(--ink3)', marginBottom: 14 }}>
        {haveCount} of {requiredDocs.length} required uploaded{ready ? ' — ready to move to payment.' : ' — all required before the payment step.'}
      </div>
      {groups.map(group => (
        <div key={group.title} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{group.title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {group.docs.map(d => row(d.type, d.type, d.label, docFor(d.type), !!group.required, group.required ? 'Required' : group.optional ? 'Optional' : 'Not uploaded yet'))}
          </div>
        </div>
      ))}
      {others.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Other documents</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {others.map(d => row(d.id, (d.apiType || d.type || '').toUpperCase(), DOC_TYPE_LABEL[d.type] ?? d.type, d, false, ''))}
          </div>
        </div>
      )}
    </Card>
  );
}

interface StagedFile { id: string; file: File; type: string; }

function fmtFileSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function FilesTab({ job, isMobile, shipmentId, isLive, onRefresh }: { job: ClearanceJob; isMobile: boolean; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const { user } = useAuth();
  const canVerify = !!(user && user.role !== 'CUSTOMER');
  const [verifying, setVerifying] = useState<string | null>(null);
  async function verifyDoc(docId: string) {
    if (!isLive || verifying) return;
    setVerifying(docId);
    try {
      await apiFetch(`/v1/shipments/${shipmentId}/documents/${docId}/verify`, { method: 'PATCH', body: JSON.stringify({ status: 'VERIFIED' }) });
      onRefresh();
    } catch (err: any) { showAlert(err.message || 'Could not verify document'); }
    finally { setVerifying(null); }
  }
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
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: savingStaged ? 'wait' : 'pointer', opacity: savingStaged ? 0.75 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
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
              <div key={sf.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--r)', background: 'var(--bg)' }}>
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
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 13, fontWeight: 700, cursor: savingStaged ? 'wait' : 'pointer', opacity: savingStaged ? 0.75 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
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
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{DOC_TYPE_LABEL[doc.type] ?? doc.type}</div>
                  <div title={doc.name} style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name} · Uploaded by {doc.uploadedBy} · {fdate(doc.uploadedAt)}</div>
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
                  {doc.status === 'VERIFIED' ? (
                    <span title="Verified" style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'var(--green-l)', color: 'var(--green)', border: '1px solid var(--green)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="checkCircle" size={12} color="var(--green)" /> Verified</span>
                  ) : canVerify ? (
                    <button type="button" onClick={e => { e.stopPropagation(); verifyDoc(doc.id); }} disabled={verifying === doc.id} title="Mark this document as verified" style={{ fontSize: 12, padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--r)', border: '1px solid var(--green)', color: 'var(--green)', background: 'var(--white)', cursor: verifying === doc.id ? 'default' : 'pointer', fontWeight: 700, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>
                      {verifying === doc.id ? '…' : 'Verify'}
                    </button>
                  ) : null}
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
          <div style={{ marginBottom: 14 }}><Banner variant="error">{calcError}</Banner></div>
        )}

        <button type="button" onClick={handleCalculate} disabled={!canCalculate || calcSaving}
          style={{ padding: 'var(--ds-btn-py) 22px', background: canCalculate ? 'var(--green)' : 'var(--border)', color: canCalculate ? 'hsl(var(--green-foreground))' : 'var(--ink3)', border: 'none', borderRadius: 'var(--r)', fontSize: 14, fontWeight: 700, cursor: canCalculate && !calcSaving ? 'pointer' : 'default', opacity: calcSaving ? 0.7 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
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
  // 'refund' is a real value of LedgerEntry['type'] that neither table below
  // nor any total here used to account for — a refunded entry used to
  // vanish from this tab entirely: not in Charges, not in Payments, not in
  // Balance, with nothing to show it had ever been recorded.
  const refunds  = job.ledger.filter(e => e.type === 'refund');
  const totalCharges = charges.reduce((s, e) => s + e.amount, 0);
  const totalPaid    = payments.reduce((s, e) => s + e.amount, 0);
  const totalRefunds = refunds.reduce((s, e) => s + e.amount, 0);
  const balance      = totalPaid - totalCharges - totalRefunds;

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
        // Real logged-time value, using each entry's own snapshotted rate —
        // the same rule the Timesheets tab uses. There is no "ops budget"
        // anywhere in the data model, so this reports what was actually
        // logged rather than measuring it against an invented reservation.
        const billableByCurrency = job.timeEntries.reduce<Record<string, number>>((acc, e) => {
          const amt = entryAmount(e);
          if (amt != null && e.serviceCurrency) acc[e.serviceCurrency] = (acc[e.serviceCurrency] || 0) + amt;
          return acc;
        }, {});
        const billableSummary = Object.entries(billableByCurrency);
        return (
          <div style={{ marginBottom: 20 }}>
          <Card
            title="Shipment Economics"
            action={<span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: marginPct >= 20 ? 'var(--green-l)' : marginPct >= 0 ? 'var(--gold-l)' : 'var(--red-l)', color: marginPct >= 20 ? 'var(--green)' : marginPct >= 0 ? 'var(--gold)' : 'var(--red)' }}>
              {marginPct >= 0 ? '+' : ''}{marginPct}% margin
            </span>}
          >
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: billableSummary.length ? 16 : 0 }}>
              {([
                { label: 'Revenue',        value: fmtTZS(revenue),     color: 'var(--green)', icon: 'arrowUp' },
                { label: 'Expenses',       value: fmtTZS(expenses),    color: 'var(--red)', icon: 'arrowDown' },
                { label: 'Gross Margin',   value: fmtTZS(Math.abs(grossMargin)), color: grossMargin >= 0 ? 'var(--green)' : 'var(--red)', icon: grossMargin >= 0 ? 'checkCircle' : 'alertTriangle' },
                { label: 'Time Logged, Billable', value: billableSummary.length ? billableSummary.map(([cur, amt]) => fmtServiceRate(amt, cur)).join(' + ') : '—', color: 'var(--blue)', icon: 'clock' },
              ] as { label: string; value: string; color: string; icon: IconName }[]).map(c => (
                <div key={c.label} style={{ padding: '14px 16px', background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}><Icon name={c.icon} size={10} /> {c.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: c.color, fontFamily: 'var(--mono)' }}>{c.value}</div>
                </div>
              ))}
            </div>
            {billableSummary.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>From rated time entries on the Timesheets tab — not yet reflected in Revenue above until invoiced.</div>
            )}
          </Card>
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
          <button type="button" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
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
          <div style={{ flex: 1 }}>
          <Card title="New Ledger Entry">
          <form onSubmit={handleAdd}>
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
          </Card>
          </div>
        )}
      </div>

      {/* Ledger — charges, payments and refunds in one chronological table
          instead of two separate ones (charges, payments — refunds weren't
          shown anywhere at all), with a running balance so the shipment's
          financial story reads top to bottom like a real statement rather
          than requiring a mental merge of two disconnected lists. */}
      <Card
        title="Ledger"
        action={<span style={{ fontFamily: 'var(--mono)', color: balance >= 0 ? 'var(--green)' : 'var(--red)' }}>{balance >= 0 ? '+' : '−'}{fmtTZS(Math.abs(balance))}</span>}
        padded={false}
      >
        {job.ledger.length === 0 ? (
          <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--ink3)' }}>No entries recorded.</div>
        ) : (
          <div className="rtbl-wrap">
          <table className="rtbl" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Date', 'Type', 'Description', 'Reference', 'Status', 'Amount', 'Balance'].map((h, i) => (
                <th key={h} style={{ padding: '9px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: i >= 5 ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {(() => {
                // Oldest first, so the running balance accumulates the way a
                // real statement reads. Every other list on this page sorts
                // newest-first; this one deliberately doesn't.
                const sorted = [...job.ledger].sort((a, b) => a.date.getTime() - b.date.getTime());
                let running = 0;
                return sorted.map((e, i) => {
                  const signed = e.type === 'payment' ? e.amount : -e.amount;
                  running += signed;
                  const typeColor = e.type === 'payment' ? 'var(--green)' : e.type === 'refund' ? 'var(--gold)' : 'var(--red)';
                  const typeLabel = e.type === 'payment' ? 'Payment' : e.type === 'refund' ? 'Refund' : 'Charge';
                  return (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--white)' : 'var(--bg)' }}>
                      <td style={{ padding: '11px 20px', fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fdate(e.date)}</td>
                      <td style={{ padding: '11px 20px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: typeColor, background: typeColor + '18', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>{typeLabel}</span>
                      </td>
                      <td style={{ padding: '11px 20px', fontSize: 13, fontWeight: 500 }}>{e.description}</td>
                      <td style={{ padding: '11px 20px', fontSize: 12, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{e.reference || '—'}</td>
                      <td style={{ padding: '11px 20px' }}><span style={{ fontSize: 11, fontWeight: 700, color: sColor(e.status), background: sColor(e.status) + '18', padding: '2px 8px', borderRadius: 4 }}>{e.status.toUpperCase()}</span></td>
                      <td style={{ padding: '11px 20px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: signed >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                        {signed >= 0 ? '+' : '−'}{fmtTZS(Math.abs(signed))}
                      </td>
                      <td style={{ padding: '11px 20px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: running >= 0 ? 'var(--ink)' : 'var(--red)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                        {fmtTZS(running)}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table></div>
        )}
      </Card>
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
              <Spinner size={18} trackColor="var(--teal-l)" />
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
                <div style={{ width: 20, height: 20, borderRadius: 'var(--r-sm)', border: `2px solid ${on ? 'var(--teal)' : 'var(--border)'}`, background: on ? 'var(--teal)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
  const [savingReportToggle, setSavingReportToggle] = useState(false);

  // null (inherit the customer's own setting) displays as "on" — the
  // platform default — since there's no per-shipment override yet to show.
  async function handleDailyReportToggle(enabled: boolean) {
    setSavingReportToggle(true);
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}`, { method: 'PATCH', body: JSON.stringify({ daily_report_enabled: enabled }) });
        onRefresh();
      } else {
        updateJob(job.id, j => ({ ...j, dailyReportEnabled: enabled }));
      }
    } catch (err: any) {
      showAlert(err.message || 'Failed to update daily report setting');
    } finally {
      setSavingReportToggle(false);
    }
  }

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
      <Card title="Assigned To" padded={false} action={canManage ? (
        <button type="button" onClick={() => setShowAssignPicker(true)}
          style={{ fontSize: 11, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}>
          {job.assignees.length > 0 ? 'Change' : '+ Assign'}
        </button>
      ) : undefined}>
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
          ) : job.assignees.length === 1 ? (
            job.assignees.map(a => {
              const label = (a === job.assignees[0] && job.assigneeName) || friendlyAssignee(a);
              return (
                <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Av name={label} userId={a} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Assigned Officer</div>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
              {job.assignees.slice(0, 4).map((a, index) => {
                const label = (a === job.assignees[0] && job.assigneeName) || friendlyAssignee(a);
                return (
                  <button
                    key={a}
                    type="button"
                    style={{
                      border: '2px solid var(--white)',
                      background: 'none',
                      padding: 0,
                      cursor: 'default',
                      borderRadius: '50%',
                      outline: 'none',
                      display: 'flex',
                      marginRight: -8,
                      zIndex: 10 - index,
                    }}
                    title={label}
                  >
                    <Av name={label} userId={a} size={28} />
                  </button>
                );
              })}
              {job.assignees.length > 4 && (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--ink2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    marginRight: -6,
                    zIndex: 5,
                  }}
                  title={`${job.assignees.length - 4} more agents`}
                >
                  +{job.assignees.length - 4}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Listeners Card */}
      <Card title="Listeners" padded={false} action={(
        <span style={{ display: 'flex', gap: 5 }}>
          <span style={{ padding: '1px 7px', background: 'var(--bg)', borderRadius: 12, fontSize: 10, fontWeight: 700, color: 'var(--ink3)' }}>{job.listeners.length}</span>
          {customers.length > 0 && (
            <span style={{ padding: '1px 7px', background: waActive ? 'var(--green-l)' : 'var(--bg)', color: waActive ? 'var(--green)' : 'var(--ink3)', borderRadius: 12, fontSize: 10, fontWeight: 700 }}>WA {waActive ? '✓' : '✕'}</span>
          )}
        </span>
      )}>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          
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
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginRight: internal.length > 4 ? 4 : 0 }}>
                  {internal.slice(0, 4).map((l, index) => (
                    <HoverCard key={l.id} openDelay={100} closeDelay={300}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          style={{
                            border: '2px solid var(--white)',
                            background: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            borderRadius: '50%',
                            outline: 'none',
                            display: 'flex',
                            marginRight: -8,
                            zIndex: 10 - index,
                          }}
                        >
                          <Av name={l.name} userId={l.id} size={28} />
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent align="start" side="bottom" sideOffset={6} className="w-60 p-3">
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                          <Av name={l.name} userId={l.id} size={30} />
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
                </div>

                {internal.length > 4 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'var(--bg)',
                          border: '1.5px solid var(--border)',
                          color: 'var(--ink2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: 0,
                          outline: 'none',
                          marginRight: 6,
                          zIndex: 5,
                        }}
                      >
                        +{internal.length - 4}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-2 flex flex-col gap-1 max-h-60 overflow-y-auto">
                      <div style={{ padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.02em', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                        Additional Staff
                      </div>
                      {internal.slice(4).map(l => (
                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                            <Av name={l.name} userId={l.id} size={22} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.name}>
                              {l.name}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 3, flexShrink: 0, marginLeft: 6 }}>
                            {ALL_CHANNELS.map(ch => (
                              <ChannelToggle key={ch} ch={ch} active={l.channel.includes(ch)} onToggle={() => toggleListenerCh(l, ch)} readOnly={!canManage || channelToggling === l.listenerId} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}

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
                      marginLeft: internal.length > 4 ? 0 : 10,
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
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginRight: customers.length > 4 ? 4 : 0 }}>
                  {customers.slice(0, 4).map((l, index) => (
                    <HoverCard key={l.id} openDelay={100} closeDelay={300}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          style={{
                            border: '2px solid var(--white)',
                            background: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            borderRadius: '50%',
                            outline: 'none',
                            display: 'flex',
                            marginRight: -8,
                            zIndex: 10 - index,
                          }}
                        >
                          <Av name={l.name} userId={l.id} size={28} />
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent align="start" side="bottom" sideOffset={6} className="w-60 p-3">
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                          <Av name={l.name} userId={l.id} size={30} />
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
                </div>

                {customers.length > 4 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'var(--bg)',
                          border: '1.5px solid var(--border)',
                          color: 'var(--ink2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: 0,
                          outline: 'none',
                          marginRight: 6,
                          zIndex: 5,
                        }}
                      >
                        +{customers.length - 4}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-2 flex flex-col gap-1 max-h-60 overflow-y-auto">
                      <div style={{ padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.02em', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                        Additional Customers
                      </div>
                      {customers.slice(4).map(l => (
                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                            <Av name={l.name} userId={l.id} size={22} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.name}>
                              {l.name}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 3, flexShrink: 0, marginLeft: 6 }}>
                            {ALL_CHANNELS.map(ch => (
                              <ChannelToggle key={ch} ch={ch} active={l.channel.includes(ch)} onToggle={() => toggleListenerCh(l, ch)} readOnly={!canManage || channelToggling === l.listenerId} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}

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
                      marginLeft: customers.length > 4 ? 0 : 10,
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
      </Card>

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
      <Card title="Key Dates" padded={false}>
        {[
          { key: 'created' as const, label: 'Created',  date: job.createdAt, field: 'created_at', warn: false },
          { key: 'due' as const,     label: 'Due Date', date: job.dueDate,   field: 'due_date',    warn: !!(job.dueDate && new Date() > job.dueDate) },
        ].map((item, i, arr) => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', gap: 10 }}>
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
      </Card>

      {/* Daily shipment-report automation (migration 258) — email (PDF) +
          WhatsApp (link) around 21:00 EAT. A shipment-level override; the
          customer-level default lives on the customer record itself. */}
      <Card title="Automation" padded={false}>
        <div style={{ padding: '4px 16px' }}>
          <SwitchRow
            title="Daily progress report"
            description="Sends today's PDF report by email and a live-status link by WhatsApp, ~21:00 EAT."
            checked={job.dailyReportEnabled !== false}
            onCheckedChange={handleDailyReportToggle}
            disabled={!canManage || savingReportToggle}
          />
        </div>
      </Card>

      {/* Tags & Flags — pulled off this sidebar for now, tracked as
          LENS-xxxx (area: clearos) for a proper pass later rather than left
          silently unused: job.flags/FlagChip are untouched, so restoring
          this is a one-block re-add, not a rebuild. */}

      {/* Workflow — which track governs this case, and (while it is still in
          flight) the ability to move it onto another one. */}
      <WorkflowCard job={job} shipmentId={shipmentId} isLive={isLive} onRefresh={onRefresh} canManage={canManage} />
    </div>
  );
}

// ─── Workflow card (re-route a shipment onto another workflow) ────────────────

function WorkflowCard({ job, shipmentId, isLive, onRefresh, canManage }: {
  job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void; canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  // Result of the switch-and-verify: which of the NEW landing step's checks the
  // shipment already meets, and which it now needs. Shown on the card so the
  // operator sees the consequence of the switch without a failed Advance first.
  const [verifyMsg, setVerifyMsg] = useState<{ valid: boolean; failures: string[]; met: number; total: number; stepName: string } | null>(null);

  const steps = jobUiSteps(job);
  const curIdx = jobCurrentIdx(job);
  const curStep = curIdx >= 0 ? steps[curIdx] : undefined;
  const total = steps.length;
  // A finished clearance is not re-routed: blocked once resolved or on the
  // final step of its current workflow.
  const locked = !!job.isDone || !!curStep?.isTerminal;

  useEffect(() => {
    if (!open || workflows.length > 0) return;
    apiFetch('/v1/workflows').then(res => setWorkflows(((res as any).data || res || []).filter((w: any) => w.isActive !== false))).catch(() => {});
  }, [open, workflows.length]);

  // Steps of the target for the effect preview: the legacy ladder, or the
  // chosen workflow's own steps.
  const targetSteps: { id: string; name: string }[] = target === 'legacy'
    ? STAGES.map(s => ({ id: s.id, name: s.label }))
    : (workflows.find(w => w.id === target)?.steps || []).slice().sort((a: any, b: any) => a.order - b.order).map((s: any) => ({ id: s.id, name: s.name }));
  const landingIdx = targetSteps.length > 0 ? Math.min(curIdx < 0 ? 0 : curIdx, targetSteps.length - 1) : -1;
  const targetName = target === 'legacy' ? 'Standard stages' : (workflows.find(w => w.id === target)?.name || '');

  async function apply() {
    if (!target || saving) return;
    setSaving(true);
    try {
      if (isLive) {
        const res: any = await apiFetch(`/v1/shipments/${shipmentId}/workflow`, { method: 'POST', body: JSON.stringify({ workflow_id: target }) });
        const v = res?.verification;
        if (v && Array.isArray(v.outcomes)) {
          setVerifyMsg({
            valid: !!v.valid,
            failures: v.failures ?? [],
            met: v.outcomes.filter((o: any) => o.passed).length,
            total: v.outcomes.length,
            stepName: res.stepName ?? '',
          });
        } else {
          setVerifyMsg(null);
        }
        onRefresh();
      }
      setOpen(false); setTarget('');
    } catch (err: any) { showAlert(err.message || 'Could not change workflow'); }
    finally { setSaving(false); }
  }

  return (
    <Card title="Workflow" action={locked ? (
      <span title="A completed shipment cannot be re-routed" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: 'var(--ink3)' }}><Icon name="lock" size={11} /> Locked</span>
    ) : undefined}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{job.workflowName || (job.workflowKind === 'CUSTOM' ? 'Workflow' : 'Standard stages')}</div>
      {curStep && (
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
          {curStep.label}{total > 0 && curIdx >= 0 ? ` · step ${curIdx + 1} of ${total}` : ''}
        </div>
      )}

      {verifyMsg && (
        <div style={{ marginTop: 10, borderRadius: 8, padding: '9px 11px', fontSize: 11.5, lineHeight: 1.5,
          background: verifyMsg.valid ? 'var(--green-l)' : 'var(--gold-l)',
          border: `1px solid ${verifyMsg.valid ? 'var(--green)' : 'var(--gold)'}`, color: 'var(--ink2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
              <Icon name={verifyMsg.valid ? 'checkCircle' : 'alertCircle'} size={12} />{' '}
              {verifyMsg.total === 0 ? 'No checks on this step' : `${verifyMsg.met} of ${verifyMsg.total} checks met`}
            </span>
            <button type="button" onClick={() => setVerifyMsg(null)} style={{ border: 'none', background: 'transparent', color: 'var(--ink3)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }} aria-label="Dismiss">×</button>
          </div>
          {!verifyMsg.valid && verifyMsg.failures.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
              {verifyMsg.failures.map((f, i) => <li key={i} style={{ marginTop: 2 }}>{f}</li>)}
            </ul>
          )}
          {verifyMsg.valid && verifyMsg.total > 0 && (
            <div style={{ marginTop: 3, color: 'var(--ink3)' }}>This step's requirements are already satisfied — you can Advance from here.</div>
          )}
        </div>
      )}

      {!locked && canManage && !open && (
        <button type="button" onClick={() => setOpen(true)} style={{ marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 'var(--ds-btn-py-sm) 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>
          <Icon name="gitBranch" size={13} /> Change workflow
        </button>
      )}

      {!locked && canManage && open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Select value={target || '__none__'} onValueChange={v => setTarget(v === '__none__' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Choose a workflow…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Choose a workflow…</SelectItem>
              {workflows.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              <SelectItem value="legacy">Standard stages</SelectItem>
            </SelectContent>
          </Select>

          {target && landingIdx >= 0 && (
            <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px' }}>
              <div><strong style={{ color: 'var(--ink)' }}>Now:</strong> {curStep?.label ?? '—'}{curIdx >= 0 ? ` (step ${curIdx + 1} of ${total})` : ''}</div>
              <div style={{ marginTop: 3 }}><strong style={{ color: 'var(--ink)' }}>After:</strong> {targetSteps[landingIdx]?.name} (step {landingIdx + 1} of {targetSteps.length}) in {targetName}</div>
              <div style={{ marginTop: 5, color: 'var(--ink3)' }}>Progress is kept at the same position where the new workflow has one, otherwise its nearest step. You can refine the stage afterward from Advance Stage.</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => { setOpen(false); setTarget(''); }} style={{ flex: 1, padding: 'var(--ds-btn-py-sm) 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>Cancel</button>
            <button type="button" disabled={!target || saving} onClick={apply} style={{ flex: 1, padding: 'var(--ds-btn-py-sm) 12px', border: 'none', borderRadius: 'var(--r)', background: target && !saving ? 'hsl(var(--primary))' : 'var(--border)', color: target && !saving ? 'hsl(var(--primary-foreground))' : 'var(--ink3)', fontSize: 12, fontWeight: 700, cursor: target && !saving ? 'pointer' : 'default', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>{saving ? 'Applying…' : 'Apply'}</button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Linked operational documents ──────────────────────────────────────────
// Delivery Documents (release/delivery orders + delivery notes, merged —
// migration 263, lives in FinOps) soft-link to a shipment via a real
// shipment id — surfaced here so they resolve to this one shipment instead
// of living in a disconnected app tab with no visible relationship to it.
interface LinkedDoc { id: string; doc_type: string; doc_number: string | null; status: string; }
interface LinkedCoO { id: string; agreement_code: string; eligibility_status: string; certificate_number: string | null; status: string; }

const LINKED_DOC_TYPE_ICON: Record<string, IconName> = { RELEASE_ORDER: 'fileText', DELIVERY_ORDER: 'fileText', DELIVERY_NOTE: 'truck' };
const LINKED_DOC_TYPE_LABEL: Record<string, string> = { RELEASE_ORDER: 'Release Order', DELIVERY_ORDER: 'Delivery Order', DELIVERY_NOTE: 'Delivery Note' };

function LinkedOperationalDocs({ shipmentId }: { shipmentId: string }) {
  const [docs, setDocs] = useState<LinkedDoc[]>([]);
  const [coos, setCoos] = useState<LinkedCoO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch(`/v1/delivery-documents?shipment_id=${shipmentId}`).catch(() => []),
      apiFetch(`/v1/customs/certificates-of-origin?shipment_id=${shipmentId}`).catch(() => []),
    ]).then(([docRes, coRes]) => {
      setDocs(Array.isArray(docRes) ? docRes : []);
      setCoos(Array.isArray(coRes) ? coRes : []);
    }).finally(() => setLoading(false));
  }, [shipmentId]);

  const docVariant: Record<string, 'gray' | 'info' | 'success' | 'warning' | 'error'> = {
    draft: 'gray', issued: 'info', dispatched: 'info', delivered: 'success', used: 'success',
    returned: 'warning', expired: 'warning', cancelled: 'error',
  };
  const coVariant: Record<string, 'gray' | 'success' | 'error' | 'warning'> = {
    ELIGIBLE: 'success', NOT_ELIGIBLE: 'error', NEEDS_REVIEW: 'warning', INSUFFICIENT_DATA: 'gray',
  };

  if (loading) return null;
  if (docs.length === 0 && coos.length === 0) return null;

  return (
    <div style={{ marginTop: 20 }}>
    <Card title="Linked operational documents">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {docs.map(d => (
          <Link key={d.id} to={`/finance/delivery-documents?shipment=${shipmentId}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <Icon name={LINKED_DOC_TYPE_ICON[d.doc_type] ?? 'fileText'} size={14} color="var(--ink3)" />
            <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{LINKED_DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}{d.doc_number ? ` · ${d.doc_number}` : ''}</span>
            <Badge variant={docVariant[d.status] ?? 'gray'}>{d.status}</Badge>
          </Link>
        ))}
        {coos.map(co => (
          <Link key={co.id} to={`/clearos/compliance/origin?shipment=${shipmentId}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <Icon name="award" size={14} color="var(--ink3)" />
            <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>Certificate of Origin ({co.agreement_code}){co.certificate_number ? ` · ${co.certificate_number}` : ''}</span>
            <Badge variant={coVariant[co.eligibility_status] ?? 'gray'}>{co.status === 'issued' ? 'issued' : co.eligibility_status.replace('_', ' ').toLowerCase()}</Badge>
          </Link>
        ))}
      </div>
    </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'tasks' | 'timesheets' | 'declaration' | 'updates' | 'files' | 'ledger' | 'co2';

/**
 * What a customer is shown on their own shipment.
 *
 * The tab strip was not filtered by role, so a customer opening their job saw
 * Tasks, Timesheets and Ledger — the internal work breakdown, the hours booked
 * against them, and Shipment Economics, which states revenue, expenses and
 * gross margin. That is our commercial position on their job, and LedgerTab has
 * no role check of its own.
 *
 * Declaration is excluded too: it is a working document with editable fields,
 * not something to hand a customer mid-preparation.
 */
const CUSTOMER_TABS = new Set<Tab>(['overview', 'updates', 'files', 'co2']);

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

  /**
   * Always fetch the detail record. It used to be skipped whenever the store
   * already held this shipment — but the store is loaded from GET /v1/shipments,
   * the *list*, and the list payload is a strict subset: no `documents`, no
   * `listeners`, no `assigned_officer_name`, no `expenses`, no `stage_history`,
   * no `messages`.
   *
   * Worse than skipping, it actively discarded the fetch. The store loads
   * asynchronously, so on mount `mockJob` was undefined and the detail request
   * did fire; moments later the list arrived, `mockJob` became defined, this
   * effect re-ran on that dependency and took the `else` branch —
   * `setApiJob(null)` — throwing away the record that had just been fetched.
   *
   * The visible result was a detail page rendering list data: 4 documents shown
   * as "No documents yet", 2 listeners shown as "None added", "Super Admin"
   * shown as "Agent …34D7", and an empty ledger, updates tab and activity feed.
   * Only the flags looked right, because `active_risk_types` happens to be one
   * of the few rich fields the list does carry.
   *
   * `mockJob` is no longer a mock either — it is the list-derived record, and it
   * stays useful as the thing to show while the detail is in flight.
   */
  useEffect(() => {
    if (!id) { setApiJob(null); return; }
    // Only block the screen when there is nothing to show yet; when the list
    // already has this row, refresh underneath it rather than flashing a spinner.
    if (!mockJob) setApiLoading(true);
    let alive = true;
    apiFetch(`/v1/shipments/${id}`)
      .then(data => { if (alive) setApiJob(apiToJob(data)); })
      .catch(() => { if (alive) setApiJob(null); })
      .finally(() => { if (alive) setApiLoading(false); });
    loadTasks();
    loadTimeEntries();
    return () => { alive = false; };
    // Deliberately not keyed on mockJob: the list arriving must not re-trigger
    // — or undo — the detail fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  if (apiLoading) return <PageLoading label="Loading shipment…" size={32} />;

  if (!job) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
      <div style={{ fontSize: 16, color: 'var(--ink3)' }}>Shipment not found.</div>
      <Link to="/" style={{ padding: '8px 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, textDecoration: 'none' }}>← Back</Link>
    </div>
  );

  async function handleAdvance(stage: string, note: string, blocker: string, channels: Channel[]) {
    if (!job) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    if (isMock) {
      const label = STAGES.find(s => s.id === stage)?.label || stage;
      const event: TimelineEvent = { id: 'ev-' + Date.now(), stage: stage as Stage, label, userId: 'me', userName: 'You', ts: new Date(), note: note || undefined, blocker: blocker || undefined };
      const threadMsg: ThreadMsg | null = note ? { id: 'msg-' + Date.now(), userId: 'me', userName: 'You', content: `Stage advanced to ${label}. ${note}${blocker ? ` — Blocker: ${blocker}` : ''}`, ts: new Date(), channels, isInternal: !channels.some(c => c !== 'internal') } : null;
      updateJob(job.id, j => ({ ...j, stage: stage as Stage, timeline: [...j.timeline, event], thread: threadMsg ? [...j.thread, threadMsg] : j.thread }));
    } else {
      try {
        await apiFetch(`/v1/shipments/${id}/stage`, {
          method: 'PATCH',
          body: JSON.stringify({ stage: jobBackendStage(job, stage), note: note || undefined, blocker: blocker || undefined }),
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
        {/* The band's fill lives in .shipdetail-hero-band (index.css), not
            here: it has to change between light and dark, and an inline
            background beats every theme rule that would try to. */}
        <div className="shipdetail-cover-bleed shipdetail-hero-band" style={{
          padding: isMobile ? '12px 14px 20px' : '14px 20px 24px',
          position: 'relative', overflow: 'hidden', transition: 'padding 0.15s ease',
        }}>
          {/* Utility row — back button + status badges + primary actions; always visible */}
          {/* Top Single Row: Utility + Title + Actions */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 0, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              <Link to={isStaff ? '/clearos/ops' : '/'} title={isStaff ? 'Back to Ops Command' : 'Back to your shipments'} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
                <Icon name="chevronLeft" size={13} color="var(--ink2)" /> {isMobile ? '' : (isStaff ? 'Ops Command' : 'My shipments')}
              </Link>
              {job.sysRef && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.06em' }}>{job.sysRef}</span>
              )}
              {bookingRef && (
                <Link to="/cargotracker/bookings" title="View freight booking" style={{ fontSize: 10.5, padding: '2px 8px', background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--ink2)', borderRadius: 4, fontWeight: 700, textDecoration: 'none' }}>
                  Booked via {bookingRef.booking_number}
                </Link>
              )}
              {!isMock && <span style={{ fontSize: 10.5, padding: '2px 7px', background: 'var(--green-l)', color: 'var(--green)', borderRadius: 4, fontWeight: 700 }}>LIVE</span>}
              {isOverdue && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: 'var(--red)' }}><Icon name="alertTriangle" size={11} /> Overdue</span>}
              {job.hasDangerousGoods && (
                <button type="button" onClick={() => setTab('overview')} title="Carries a dangerous-goods declaration — see the Overview tab"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, padding: '2px 7px', background: 'var(--gold-l)', color: 'var(--gold)', borderRadius: 4, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                  <Icon name="alertTriangle" size={11} color="var(--gold)" /> DG
                </button>
              )}

              {!isMobile && <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />}

              {/* Title & Customer (Moved to same row) */}
              <h1 style={{ margin: 0, fontSize: isMobile ? 16 : 18, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2, letterSpacing: '-0.01em' }}>{job.title}</h1>
              {job.customerId ? (
                <Link to={`/crm/customers?id=${job.customerId}`} onClick={e => e.stopPropagation()} style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                  · {job.customer}
                </Link>
              ) : (
                <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: 'var(--ink3)' }}>· {job.customer}</span>
              )}
            </div>

            {/* Right side actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', width: isMobile ? '100%' : 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', justifyContent: isMobile ? 'flex-start' : 'flex-end', paddingBottom: isMobile ? 4 : 0 }}>
              {isStaff && !isMock && (
                <Link to={`/clearos/clearance/${id}/edit`} title="Edit shipment details" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'var(--ctl-h)', height: 'var(--ctl-h)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', color: 'var(--ink2)', textDecoration: 'none', flexShrink: 0 }}>
                  <Icon name="edit" size={15} />
                </Link>
              )}
              {isStaff && (
                // The one saturated-colour element in this row, deliberately —
                // it's the actual primary action, same as accent-colour links
                // and CTAs are the only colour in the Hostinger reference this
                // page's palette is being brought closer to.
                <button type="button" onClick={() => setShowAdv(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25, flexShrink: 0 }}>
                  <Icon name="arrowRight" size={13} color="#fff" /> Advance Stage
                </button>
              )}
              <button type="button" onClick={() => openShipmentReportWindow(job)} title="Print shipment report" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'var(--ctl-h)', height: 'var(--ctl-h)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', cursor: 'pointer', flexShrink: 0 }}>
                <Icon name="printer" size={15} />
              </button>
              {isStaff && (
                <button type="button" onClick={() => shareShipmentReportLink(job.id)} title="Copy progress link (for WhatsApp/email)" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'var(--ctl-h)', height: 'var(--ctl-h)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', cursor: 'pointer', flexShrink: 0 }}>
                  <Icon name="link" size={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stage stepper — floats up over the hero band */}
        <div style={{ margin: isMobile ? '-10px 10px 0' : '-12px 14px 0', position: 'relative', background: 'var(--white)', borderRadius: 12, padding: '10px 0 8px', border: '1px solid var(--border)' }}>
          {isStaff ? <StageStepper job={job} /> : (
            <div style={{ padding: '0 24px' }}><CustomerMilestoneTimeline job={job} compact /></div>
          )}
          {/* Examination is a step within this shipment's own clearance, not a
              separate process — rendered right here rather than as a global
              worklist elsewhere (see ExaminationsQueue.tsx). Renders nothing
              when this shipment has no examinations. */}
          {isStaff && <ExaminationsQueue shipmentId={job.id} />}
        </div>
        <div style={{ height: isMobile ? 8 : 10 }} />

        {/* Tabs — the shared segmented ds-tabs (same control as Ops Command /
            NexusHR), scrolling horizontally when the row overflows its width. */}
        <div style={{ padding: isMobile ? '6px 10px' : '8px 14px', borderTop: '1px solid var(--border)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} variant="segmented">
            <TabsList style={{ width: '100%', flexWrap: 'nowrap' }}>
              {TAB_CFG.filter(t => isStaff || CUSTOMER_TABS.has(t.id)).map(t => {
                const badge =
                  t.id === 'tasks'      ? job.tasks.length :
                  t.id === 'timesheets' ? job.timeEntries.length :
                  t.id === 'updates'    ? job.thread.length :
                  t.id === 'files'      ? job.documents.length :
                  t.id === 'ledger'     ? job.ledger.length : undefined;
                return (
                  <TabsTrigger key={t.id} value={t.id}>
                    <Icon name={t.icon} size={14} />
                    <span className="ds-tabs-trigger-label">{t.label}</span>
                    {badge !== undefined && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20, lineHeight: 1.5, background: tab === t.id ? 'var(--teal-l)' : 'var(--white)', color: tab === t.id ? 'var(--teal)' : 'var(--ink3)' }}>{badge}</span>}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '0 0 14px' : '0 0 24px', background: 'var(--white)' }}>
        <div style={{
          padding: isMobile ? '14px 10px' : '20px 14px',
        }}>
          {showAdv ? (
            // Advancing a stage takes over the body as a three-column workspace:
            // document previews · documents & verification + the move-to-stage
            // form · the standard data cards.
            <AdvanceStageView job={job} shipmentId={id || job.id} isLive={!isMock} isMobile={isMobile}
              onClose={() => setShowAdv(false)} onAdvance={handleAdvance} onRefresh={refreshJob} />
          ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {tab === 'overview'     && (isStaff ? <OverviewTab job={job} isMobile={isMobile} isLive={!isMock} onRefresh={refreshJob} /> : <CustomerOverviewTab job={job} isMobile={isMobile} />)}
              {/* Hiding the tab is not enough: `?tab=ledger` sets it directly. */}
              {tab === 'tasks'        && isStaff && <TasksTab       job={job} isMobile={isMobile} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
              {tab === 'timesheets'   && isStaff && <TimesheetsTab  job={job} isMobile={isMobile} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
              {tab === 'declaration'  && isStaff && <DeclarationTab job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
              {tab === 'updates'      && <UpdatesTab     job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
              {tab === 'files'        && <DocumentsPanel job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
              {tab === 'files'        && isStaff && <LinkedOperationalDocs shipmentId={id || job.id} />}
              {tab === 'ledger'       && isStaff && <LedgerTab      job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
              {tab === 'co2'          && <CO2Tab         job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
            </div>
            {/* Who we have tagged internally is not the customer's business. */}
            {!isMobile && isStaff && <ListenersSidebar job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
