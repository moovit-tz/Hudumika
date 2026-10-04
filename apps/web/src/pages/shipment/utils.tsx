import React, { useState, useEffect, useRef } from 'react';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { ExaminationsQueue } from '../../components/ExaminationsQueue.js';
import { DangerousGoodsPanel } from '../../components/DangerousGoodsPanel.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { Icon } from '../../components/Icon.js';
import { Spinner, PageLoading } from '../../components/ui/spinner.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Banner } from '../../components/ui/alert.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { RelatedRecordsPanel } from '../../components/RelatedRecordsPanel.js';
import { Tip } from '../../components/ui/tooltip.js';
import type { IconName } from '../../components/Icon.js';
import { apiFetch, apiDownload, apiViewBlob, apiFetchBlob } from '../../lib/api.js';
import { HUDUMIKA_FOOTER_HTML } from '../../lib/watermark.js';
import { useCompany, getCompany } from '../../data/companyStore.js';
import { useAuth } from '../../hooks/useAuth.js';
import { MGMT_ROLES } from '../../lib/permissions.js';
import { useClockIn } from '../../contexts/ClockInContext.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import {
  getJob, updateJob, subscribe,
  STAGES, FLAG_CFG, CH_CFG, stageIdx, STAGE_API_MAP, API_STAGE_MAP, apiToJob,
  jobUiSteps, jobCurrentIdx, jobStageLabel, jobBackendStage,
  type ClearanceJob, type Stage, type Channel, type Flag,
  type ThreadMsg, type TimelineEvent, type ShipDoc, type LedgerEntry, type DocType,
  type InternalTask, type TimeEntry, type ActivityEvent, type TaskStatus, type Listener,
  type JobChargeLine,
} from '../clearanceData.js';
import { ChBadge } from '../../components/ClearanceChips.js';
import { VesselLiveStatus } from '../../components/VesselLiveStatus.js';
import { EMPLOYEES, empInitials, empAvatarColor } from '../../data/staffData.js';
import type { Employee } from '../../data/staffData.js';
import { CUSTOMER_MILESTONES, MILESTONE_LABELS, STAGE_TO_MILESTONE } from '@hudumika/types';
import type { CustomerMilestone, ClearanceStage } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Badge } from '../../components/ui/badge.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover.js';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../../components/ui/hover-card.js';
import { SwitchRow } from '../../components/ui/list-item-row.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet.js';
// ─── Clock-in gate ───────────────────────────────────────────────────────────

export function clockGate(isStaff: boolean, isCheckedIn: boolean, triggerOpen: () => void): boolean {
  if (!isStaff) return true;
  if (!isCheckedIn) { triggerOpen(); return false; }
  return true;
}

// Shared by the Timesheets and Ledger tabs so both read the same number:
// hourly-unit services bill hours × rate; everything else (per-shipment,
// per-container, per-set, ...) bills the flat rate once per logged entry.
// Returns null when the entry was logged with no service attached — nothing
// to bill, not a rate of zero.
export function entryAmount(e: TimeEntry): number | null {
  if (e.serviceRate == null) return null;
  return e.serviceUnit === 'hour' || e.serviceUnit === 'hr' ? e.hours * e.serviceRate : e.serviceRate;
}

// ─── Store hook ───────────────────────────────────────────────────────────────

export function useJob(id: string) {
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
export function apiTaskToInternal(t: any): InternalTask {
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
export function apiTimeEntryToInternal(t: any): TimeEntry {
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

export function fdate(d: Date) { return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
export function ftime(d: Date) { return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
export function fdatetime(d: Date) { return `${fdate(d)}, ${ftime(d)}`; }
export function fmtTZS(n: number) { return 'TZS ' + n.toLocaleString('en'); }
export function fmtServiceRate(amount: number, currency: string) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString('en')}`; }
}
export function avatarBg(name: string) {
  const c = ['#e8461a', '#2563eb', 'var(--green)', '#7c3aed', 'var(--gold)', '#0891b2'];
  let h = 0; for (const ch of (name ?? '')) h = (h * 31 + ch.charCodeAt(0)) % c.length;
  return c[Math.abs(h)];
}
export function initials(name: string) { return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase(); }
export function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s); }
export function friendlyAssignee(a: string) {
  if (isUUID(a)) return `Agent …${a.slice(-4).toUpperCase()}`;
  return a;
}
export function docIcon(type: string): IconName {
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
export function openShipmentReportWindow(job: ClearanceJob) {
  const html = buildShipmentReportHtml(job).replace('</body>', '<script>window.onload=function(){window.print()}</script></body>');
  const win = window.open('', '_blank', 'width=860,height=1000');
  if (win) { win.document.write(html); win.document.close(); }
}

/** Gets or creates this shipment's public "check progress" link (the same
 *  one the daily WhatsApp automation sends) and copies it to the clipboard —
 *  see shipment-report.service.ts / ShipmentReportShared.tsx. */
export async function shareShipmentReportLink(id: string) {
  try {
    const res = await apiFetch(`/v1/shipments/${id}/report-share`, { method: 'POST' });
    if (res?.url) {
      await navigator.clipboard.writeText(res.url);
      showAlert('Progress link copied — share it via WhatsApp or email.', { variant: 'success' });
    } else {
      showAlert("Link created, but the public app URL isn't configured yet — ask an admin to set it before sharing.", { variant: 'warning' });
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
export function Av({ name, size = 32, userId }: { name: string; size?: number; userId?: string | null }) {
  // PersonAvatar already draws exactly this fallback — deterministic colored
  // initials — when userId is absent, so there is nothing left for this
  // wrapper to hand-roll; isUUID still guards against the legacy paths
  // (see memberId/taskId comment above) where "userId" is really just the
  // name string again, not a real account id to fetch a photo for.
  return <PersonAvatar userId={userId && isUUID(userId) ? userId : undefined} name={name} size={size} />;
}

// ─── TANCIS Form helpers ──────────────────────────────────────────────────────

export interface DeclGeneral {
  tansad_prefix: string; tansad_year: string; tansad_seq: string;
  ref_number: string; mode: string; tansad_date: string; clearing_office: string;
  cl_plan: string; form_type: string; items_count: string; packages_total: string;
  package_type: string; gross_weight: string; net_weight: string; ucr_no: string;
}
export interface DeclParty { tin: string; name: string; address: string; country: string; }
export interface DeclParties {
  consignment_country: string; trading_country: string;
  country_export: string; country_destination: string;
  exporter: DeclParty; importer: DeclParty; declarant: DeclParty;
}
export interface DeclFinancial {
  delivery_term: string; delivery_place: string; invoice_no: string; invoice_date: string;
  invoice_value_usd: string; customs_value_tzs: string; payment_method: string; payment_bank: string;
  freight_usd: string; insurance_usd: string; other_charges_usd: string; deductions_usd: string;
  self_assessment: boolean; exchange_rate: string;
  duty_rate: string; vat_rate: string; excise_rate: string;
  total_imp_duty_tzs: string; total_vat_tzs: string;
}
export interface DeclTransport {
  transport_mode: string; arrival_date: string; crn: string; bl_no: string; tansad_no: string; vessel_name: string;
  partial_bl: boolean; shipment_place: string; discharge_place: string; discharge_date: string;
  entry_office: string; location_goods: string; container_count: string; warehouse: string; period_days: string;
}
export interface HsLine { hs: string; desc: string; origin: string; qty: string; unit: string; gross_wt: string; net_wt: string; cif_usd: string; customs_value_tzs: string; imp_duty_tzs: string; vat_tzs: string; duty_rate: string; }

export const emptyParty = (): DeclParty => ({ tin: '', name: '', address: '', country: 'TZ' });
export const emptyGeneral = (job?: ClearanceJob): DeclGeneral => {
  const parts = job?.tansad ? job.tansad.split('-') : [];
  return {
    tansad_prefix: parts[0] || 'TZDL', tansad_year: parts[1] || String(new Date().getFullYear()).slice(-2),
    tansad_seq: parts[2] || '', ref_number: job?.bl || '', mode: 'IM4',
    tansad_date: '', clearing_office: 'TZDL', cl_plan: 'PAO', form_type: 'G',
    items_count: '1', packages_total: '', package_type: 'PK',
    gross_weight: job?.weight?.replace(/[^0-9.]/g, '') || '', net_weight: '', ucr_no: '',
  };
};
export const emptyFinancial = (job?: ClearanceJob): DeclFinancial => ({
  delivery_term: 'CIF', delivery_place: job?.destination || 'Dar es Salaam',
  invoice_no: '', invoice_date: '',
  invoice_value_usd: job?.invoiceValue?.replace(/[^0-9.]/g, '') || '', customs_value_tzs: '',
  payment_method: 'T', payment_bank: '', freight_usd: '', insurance_usd: '',
  other_charges_usd: '0', deductions_usd: '0', self_assessment: true,
  exchange_rate: '2560', duty_rate: '25', vat_rate: '18', excise_rate: '0',
  total_imp_duty_tzs: '', total_vat_tzs: '',
});
export const emptyTransport = (job?: ClearanceJob): DeclTransport => ({
  transport_mode: 'S', arrival_date: '', crn: '', bl_no: job?.bl || '', tansad_no: job?.tansad || '', vessel_name: job?.vessel || '',
  partial_bl: false, shipment_place: job?.origin || '', discharge_place: job?.destination || 'Dar es Salaam',
  discharge_date: '', entry_office: 'TZDL', location_goods: '', container_count: '0', warehouse: '', period_days: '',
});
export const emptyHsLine = (): HsLine => ({ hs: '', desc: '', origin: 'CN', qty: '', unit: 'KGS', gross_wt: '', net_wt: '', cif_usd: '', customs_value_tzs: '', imp_duty_tzs: '', vat_tzs: '', duty_rate: '25' });

// Maps this tab's local form state onto the real `declarations`/
// `declaration_items` table columns (migration 004_declarations.sql).
// Rate/percentage/total-tax fields (duty_rate, vat_rate, total_imp_duty_tzs,
// etc.) have no column on either table — official assessment totals are
// recorded via the separate Notices flow once TRA responds, not by this
// quick-entry tab — so they're intentionally left out of the payload rather
// than written somewhere they'd silently never be read back.

// ─── DOC_TYPE_LABEL ──────────────────────────────────────────────────────────
export const DOC_TYPE_LABEL: Record<string, string> = { bl: 'Bill of Lading', awb: 'Air Waybill', invoice: 'Commercial Invoice', packing_list: 'Packing List', permit: 'Permit', certificate: 'Certificate', other: 'Document', customs_entry: 'Customs Entry', duty_receipt: 'Duty Receipt', release_order: 'Release Order', delivery_note: 'Delivery Note', pre_assessment: 'Pre-assessment', final_assessment: 'Final assessment', tiss: 'TISS', payment_note: 'Payment note', tiss_payment_invoice: 'TISS payment invoice', tbs_charges: 'TBS charges', coc: 'Certificate of Conformity', wharfage: 'Wharfage' };

// ─── Card alias (SectionCard shorthand used across group files) ─────────────
export const Card = SectionCard;
