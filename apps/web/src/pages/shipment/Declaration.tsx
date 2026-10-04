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
import { clockGate, fdate, ftime, fdatetime, fmtTZS, avatarBg, initials, isUUID, friendlyAssignee, Av, DOC_TYPE_LABEL, Card, type DeclParty, type DeclGeneral, type DeclParties, type DeclFinancial, type DeclTransport, type HsLine, emptyParty, emptyGeneral, emptyFinancial, emptyTransport, emptyHsLine } from './utils.js';
import { ListenersSidebar } from './TeamWorkflow.js';
export function buildDeclarationPayload(general: DeclGeneral, parties: DeclParties, financial: DeclFinancial, transport: DeclTransport, items: HsLine[]) {
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
export function applyDeclarationResponse(decl: any, job: ClearanceJob): { general: DeclGeneral; parties: DeclParties; financial: DeclFinancial; transport: DeclTransport; items: HsLine[] } {
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

export function DField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="decl-kv">
      <span className="decl-k">{label}</span>
      {children}
    </div>
  );
}
export function DInput({ value, onChange, placeholder, mono, readOnly }: { value: string; onChange?: (v: string) => void; placeholder?: string; mono?: boolean; readOnly?: boolean }) {
  return (
    <input className="input-field" title={placeholder} placeholder={placeholder} value={value} readOnly={readOnly}
      onChange={e => onChange?.(e.target.value)}
      style={{ fontSize: 13, padding: '9px 10px', fontFamily: mono ? 'var(--font)' : undefined }} />
  );
}
export function DSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
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
export function ValuationSignalBadge({ hsCode, countryOfOrigin }: { hsCode: string; countryOfOrigin: string }) {
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

export function StageStepper({ job }: { job: ClearanceJob }) {
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

export function customerMilestone(stage: Stage): CustomerMilestone {
  const apiStage = STAGE_API_MAP[stage] as ClearanceStage;
  return STAGE_TO_MILESTONE[apiStage] ?? 'docs_received';
}

export function CustomerMilestoneTimeline({ job, compact }: { job: ClearanceJob; compact?: boolean }) {
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

export function CustomerAttentionPanel({ job }: { job: ClearanceJob }) {
  const currentEvent = [...job.timeline].reverse().find(e => e.stage === job.stage) ?? job.timeline[job.timeline.length - 1];
  const blocker = currentEvent?.blocker;

  if (!blocker) {
    return (
      <div style={{ background: 'var(--green-l)', border: '1px solid var(--green)', borderRadius: 'var(--r)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="checkCircle" size={18} color="var(--green)" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>You're all caught up</div>
          <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 1 }}>Nothing is blocking your shipment right now.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--r)', padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon name="alertCircle" size={16} color="var(--gold)" />
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>Needs your attention</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--gold)', lineHeight: 1.5 }}>{blocker}</div>
    </div>
  );
}

// ─── Customer clearing-agent contact card ──────────────────────────────────────

export function CustomerAgentCard({ job }: { job: ClearanceJob }) {
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
          <a href={`tel:${agent.phone}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderRadius: 'var(--r)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
            <Icon name="phone" size={13} color="#fff" /> Call
          </a>
          <a href={`mailto:${agent.email}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
            <Icon name="mail" size={13} /> Email
          </a>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Advance Stage Modal ──────────────────────────────────────────────────────

export function AdvanceStageModal({ job, onClose, onAdvance, embedded = false }: {
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
      ? { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }
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
            <div style={{ marginBottom: 14, background: 'var(--bg)', border: `1px solid ${hasUnmet ? 'var(--red-l)' : 'var(--border)'}`, borderRadius: 'var(--r)', padding: '10px 12px' }}>
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
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="What was completed? Any key info to share…" style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, resize: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Blocker / Pending <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>(optional)</span></label>
            <textarea value={blocker} onChange={e => setBlocker(e.target.value)} rows={2} placeholder="Any blockers or outstanding actions?" style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, resize: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 8 }}>Notify via</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['internal', 'whatsapp', 'email', 'teams', 'sms'] as Channel[]).map(ch => {
                const cfg = CH_CFG[ch]; const on = chans.includes(ch);
                return (
                  <button key={ch} type="button" onClick={() => toggle(ch)} style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--badge-radius)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? cfg.color : 'var(--border)'}`, background: on ? cfg.bg : 'var(--white)', color: on ? cfg.color : 'var(--ink3)', transition: 'all 0.15s', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
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

export function DocPreview({ shipmentId, doc }: { shipmentId: string; doc: ShipDoc }) {
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
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', background: 'var(--white)', flexShrink: 0 }}>
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

export function DocVerifyList({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
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
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--badge-radius)', background: 'var(--green-l)', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="checkCircle" size={11} color="var(--green)" /> Verified</span>
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

export function AdvanceStageView({ job, shipmentId, isLive, isMobile, onClose, onAdvance, onRefresh }: {
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
            ? <div style={{ padding: '28px 16px', fontSize: 13, color: 'var(--ink3)', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--r)'}}>No documents to preview.</div>
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

export const ENTRY_POINT_STEPS: Record<string, { label: string; steps: string[]; charges: { label: string; est: string }[] }> = {
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

export function EntryPointSteps({ entryOffice }: { entryOffice: string }) {
  const cfg = ENTRY_POINT_STEPS[entryOffice];
  if (!cfg) return null;
  return (
    <div style={{ marginTop: 14, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 18px' }}>
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
                <span style={{ fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--font)', fontSize: 11 }}>{c.est}</span>
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
export const HEAD_LABEL: Record<string, string> = {
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
export function AutomationHistoryCard({ shipmentId }: { shipmentId: string }) {
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

export function EstimateVarianceCard({ shipmentId }: { shipmentId: string }) {
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

export function DeclarationTab({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
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
        <div style={{ padding: '12px 14px', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 'var(--r)', marginBottom: 14 }}>
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
                  <Checkbox checked={applyHs} onCheckedChange={c => setApplyHs(c === true)} style={{ marginTop: 2 }} />
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 'var(--r)', marginBottom: 14 }}>
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
            <button type="button" onClick={() => { localStorage.removeItem(`ocrDecl_${job.id}`); setOcrBanner(null); }}
              style={{ fontSize: 11, color: 'var(--ink3)', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 10px', cursor: 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
              Dismiss
            </button>
            <button type="button" onClick={applyOcrData}
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
                  <Checkbox checked={financial.self_assessment} onCheckedChange={c => setFinancial(f => ({ ...f, self_assessment: c === true }))} /> Yes
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
              <div style={{ marginTop: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px 16px' }}>
                {[
                  ['CIF Value (TZS)', cifTzs],
                  [`Customs Duty ${financial.duty_rate}%`, dutyAmt],
                  [`VAT ${financial.vat_rate}%`, vatAmt],
                  ...(Number(financial.excise_rate) > 0 ? [[`Excise ${financial.excise_rate}%`, excAmt] as [string, number]] : []),
                ].map(([l, v]) => (
                  <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink2)', marginBottom: 5 }}>
                    <span>{l as string}</span><span style={{ fontFamily: 'var(--font)', fontWeight: 500 }}>{(v as number).toLocaleString('en', { maximumFractionDigits: 0 })} TZS</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--teal)', fontSize: 14, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                  <span>Total Tax Payable</span>
                  <span style={{ fontFamily: 'var(--font)' }}>{totalTax.toLocaleString('en', { maximumFractionDigits: 0 })} TZS</span>
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
                <Checkbox checked={transport.partial_bl} onCheckedChange={c => setTransport(t => ({ ...t, partial_bl: c === true }))} /> Yes
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
