import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useClockIn } from '../contexts/ClockInContext.jsx';
import {
  getJob, updateJob, subscribe,
  STAGES, FLAG_CFG, CH_CFG, stageIdx, STAGE_API_MAP, API_STAGE_MAP,
  type ClearanceJob, type Stage, type Channel, type Flag,
  type ThreadMsg, type TimelineEvent, type ShipDoc, type LedgerEntry, type DocType,
  type InternalTask, type TimeEntry, type ActivityEvent, type CloudLink, type TaskStatus,
} from './clearanceData.js';
import { FlagChip, ChBadge } from './ShipmentBoard.js';
import { EMPLOYEES, empInitials, empAvatarColor } from '../data/staffData.js';
import type { Employee } from '../data/staffData.js';

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

// ─── API → ClearanceJob adapter ──────────────────────────────────────────────

function toStage(s: string): Stage {
  if (!s) return 'docs_received';
  // Try exact API key match first (e.g. 'PERMITS' → 'permit_applications')
  if (API_STAGE_MAP[s]) return API_STAGE_MAP[s];
  // Fallback: lowercase match for local IDs
  const n = s.toLowerCase().replace(/[\s-]+/g, '_') as Stage;
  return STAGES.find(x => x.id === n) ? n : 'docs_received';
}

function apiToJob(data: any): ClearanceJob {
  return {
    id: String(data.id),
    title: data.goods_desc || data.ref_number || 'Shipment',
    sysRef: data.ref_number,
    customer: data.customer_name || 'Unknown',
    customerId: String(data.customer_id || ''),
    mode: 'SEA FCL',
    origin: data.port_of_loading || '—',
    destination: data.port_of_discharge || 'Dar es Salaam',
    bl: data.bl_number,
    tansad: data.tansad_number,
    vessel: data.vessel_name,
    containers: data.container_numbers || [],
    weight: data.gross_weight_kg ? `${Number(data.gross_weight_kg).toLocaleString()} KG` : undefined,
    invoiceValue: data.cif_value_usd ? `USD ${Number(data.cif_value_usd).toLocaleString()}` : undefined,
    stage: toStage(data.stage || ''),
    flags: ((data.active_risk_types || []) as string[]).map(r => r.toLowerCase()) as Flag[],
    assignees: data.assigned_to ? [data.assigned_to] : [],
    listeners: [],
    createdAt: new Date(data.created_at || Date.now()),
    dueDate: data.due_date ? new Date(data.due_date) : undefined,
    thread: (data.messages || []).map((m: any, i: number) => ({
      id: m.id || `msg-${i}`, userId: String(m.author_id || 'system'), userName: m.author_name || 'System',
      content: m.content, ts: new Date(m.created_at || Date.now()),
      channels: [(m.channel?.toLowerCase() || 'internal') as Channel],
      isInternal: !m.channel || m.channel === 'INTERNAL',
    })),
    timeline: (data.stage_history || []).map((h: any, i: number) => ({
      id: h.id || `ev-${i}`, stage: toStage(h.stage || ''),
      label: STAGES.find(s => s.id === toStage(h.stage || ''))?.label || h.stage,
      userId: h.user_id || 'system', userName: h.user_name || 'System',
      ts: new Date(h.entered_at || Date.now()), note: h.note, blocker: h.blocker,
    })),
    ledger: [
      ...(data.expenses || []).filter((e: any) => !e.is_revenue).map((e: any) => ({
        id: e.id || `exp-${e.label}`, description: e.label, amount: Number(e.amount_tzs),
        currency: 'TZS', type: 'charge' as const, date: new Date(e.created_at || Date.now()), status: 'pending' as const,
      })),
      ...(data.expenses || []).filter((e: any) => e.is_revenue).map((e: any) => ({
        id: `pay-${e.id}`, description: e.label, amount: Number(e.amount_tzs),
        currency: 'TZS', type: 'payment' as const, date: new Date(e.created_at || Date.now()), status: 'paid' as const,
      })),
    ],
    documents: (data.documents || []).map((d: any) => ({
      id: String(d.id), name: d.filename || d.type, type: (d.type?.toLowerCase() || 'other') as DocType,
      size: '—', uploadedBy: d.uploaded_by || 'System',
      uploadedAt: new Date(d.created_at || Date.now()), extracted: { status: 'pending' as const },
    })),
    tasks: [], timeEntries: [], activity: [], cloudLinks: [],
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fdate(d: Date) { return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function ftime(d: Date) { return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
function fdatetime(d: Date) { return `${fdate(d)}, ${ftime(d)}`; }
function fmtTZS(n: number) { return 'TZS ' + n.toLocaleString('en'); }
function avatarBg(name: string) {
  const c = ['#e8461a', '#2563eb', '#16a34a', '#7c3aed', '#ca8a04', '#0891b2'];
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % c.length;
  return c[Math.abs(h)];
}
function initials(name: string) { return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase(); }
function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s); }
function friendlyId(job: ClearanceJob) {
  if (isUUID(job.id)) return job.bl ? `BL: ${job.bl}` : `#${job.id.slice(-8).toUpperCase()}`;
  return job.id;
}
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
      style={{ fontSize: 12, padding: '5px 8px', fontFamily: mono ? 'var(--mono)' : undefined }} />
  );
}
function DSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select className="input-field" title="Select" value={value} onChange={e => onChange(e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
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
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, width: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Advance Stage</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Move to Stage</label>
            <select value={selected} onChange={e => setSelected(e.target.value as Stage)} style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13 }}>
              {nextStages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
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
                  <button key={ch} type="button" onClick={() => toggle(ch)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? cfg.color : 'var(--border)'}`, background: on ? cfg.bg : 'var(--white)', color: on ? cfg.color : 'var(--ink3)', transition: 'all 0.15s' }}>
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 20px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--white)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button type="button" disabled={!selected} onClick={() => selected && onAdvance(selected as Stage, note, blocker, chans)} style={{ padding: '9px 20px', background: selected ? 'var(--teal)' : 'var(--border)', color: selected ? '#fff' : 'var(--ink3)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: selected ? 'pointer' : 'default' }}>
              Update Stage →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Timeline Tab ─────────────────────────────────────────────────────────────

function TimelineTab({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const currentIdx = stageIdx(job.stage);
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editBlocker, setEditBlocker] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const { user } = useAuth();

  function startEdit(stageId: string, event?: TimelineEvent) {
    setEditingStage(stageId);
    setEditNote(event?.note || '');
    setEditBlocker(event?.blocker || '');
  }

  async function saveEdit(stageId: string) {
    setSavingEdit(true);
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/stage`, {
          method: 'PATCH',
          body: JSON.stringify({ stage: STAGE_API_MAP[stageId as Stage] ?? stageId.toUpperCase(), note: editNote || undefined, blocker: editBlocker || undefined }),
        });
        onRefresh();
      } else {
        const stageLabel = STAGES.find(s => s.id === stageId)?.label || stageId;
        const actNote = editNote ? `Note updated on "${stageLabel}": ${editNote}` : `Note cleared on "${stageLabel}"`;
        updateJob(job.id, j => ({
          ...j,
          timeline: j.timeline.map(e => e.stage === stageId ? { ...e, note: editNote || undefined, blocker: editBlocker || undefined } : e),
          activity: [...j.activity, { id: `act-${Date.now()}`, action: 'commented' as const, userId: 'me', userName: user?.name || 'You', ts: new Date(), subject: actNote }],
        }));
      }
    } catch (err: any) { alert(err.message || 'Save failed'); }
    setSavingEdit(false);
    setEditingStage(null);
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="info" size={13} /> Click any completed stage to add or edit a note. Changes are logged to the activity feed.
      </div>
      <div style={{ position: 'relative', paddingLeft: 32 }}>
        <div style={{ position: 'absolute', left: 11, top: 16, bottom: 16, width: 2, background: 'var(--border)' }} />
        {STAGES.map((s, i) => {
          const event = job.timeline.find(e => e.stage === s.id);
          const isDone = i <= currentIdx; const isCurrent = s.id === job.stage;
          const isEditing = editingStage === s.id;
          return (
            <div key={s.id} style={{ position: 'relative', marginBottom: 24, display: 'flex', gap: 16 }}>
              <div style={{ position: 'absolute', left: -32 + 5, top: 2, width: 14, height: 14, borderRadius: '50%', zIndex: 1, background: isCurrent ? 'var(--teal)' : isDone ? 'var(--teal)' : 'var(--border)', border: `2px solid ${isCurrent || isDone ? 'var(--teal)' : 'var(--border)'}`, boxShadow: isCurrent ? '0 0 0 4px var(--teal-l)' : 'none' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: event ? 4 : 0 }}>
                  <span style={{ fontSize: 14, fontWeight: isCurrent ? 700 : isDone ? 600 : 400, color: isDone ? 'var(--ink)' : 'var(--ink3)' }}>{s.label}</span>
                  {isCurrent && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 9, background: 'var(--teal)', color: '#fff', fontWeight: 700 }}>CURRENT</span>}
                  {event && <span style={{ fontSize: 11, color: 'var(--ink3)', marginLeft: 'auto' }}>{fdatetime(event.ts)}</span>}
                  {isDone && !isEditing && (
                    <button type="button" onClick={() => startEdit(s.id, event)}
                      style={{ fontSize: 11, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '0 4px' }}>
                      {event?.note ? 'Edit note' : '+ Add note'}
                    </button>
                  )}
                </div>
                {event?.userName && <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 4 }}>by {event.userName}</div>}

                {isEditing ? (
                  <div style={{ background: 'var(--white)', border: '1px solid var(--teal)', borderRadius: 9, padding: '14px 16px', marginTop: 6 }}>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Note</label>
                      <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={3}
                        placeholder="Add a note about this stage…"
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, resize: 'vertical', fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--bg)', boxSizing: 'border-box' as const }} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Blocker (optional)</label>
                      <input value={editBlocker} onChange={e => setEditBlocker(e.target.value)}
                        placeholder="Describe any blocker at this stage…"
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--bg)', boxSizing: 'border-box' as const }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => saveEdit(s.id)} disabled={savingEdit} className="btn btn-primary btn-sm">
                        {savingEdit ? 'Saving…' : 'Save Note'}
                      </button>
                      <button type="button" onClick={() => setEditingStage(null)} className="btn btn-secondary btn-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {event?.note && (
                      <div style={{ fontSize: 13, color: 'var(--ink2)', padding: '8px 12px', background: 'var(--bg)', borderRadius: 6, borderLeft: '3px solid var(--teal)', lineHeight: 1.5 }}>
                        {event.note}
                      </div>
                    )}
                    {event?.blocker && (
                      <div style={{ fontSize: 13, color: '#92400e', padding: '8px 12px', background: '#fef3c7', borderRadius: 6, borderLeft: '3px solid #f59e0b', marginTop: 6, lineHeight: 1.5 }}>
                        ⚠ Blocker: {event.blocker}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
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
    <div style={{ marginTop: 14, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 18px' }}>
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

function DeclarationTab({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  type DeclSubTab = 'general' | 'parties' | 'financial' | 'transport' | 'items';
  const [sub, setSub] = useState<DeclSubTab>('general');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen } = useClockIn();
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
        await apiFetch(`/v1/shipments/${shipmentId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            tansad_number: tansad || undefined,
            bl_number: transport.bl_no || undefined,
            vessel: transport.vessel_name || undefined,
            gross_weight_kg: general.gross_weight ? Number(general.gross_weight) : undefined,
            cif_value_usd: financial.invoice_value_usd ? Number(financial.invoice_value_usd) : undefined,
            port_of_loading: transport.shipment_place || undefined,
            port_of_discharge: transport.discharge_place || undefined,
          }),
        });
        onRefresh();
      } else {
        updateJob(job.id, j => ({ ...j, tansad, bl: transport.bl_no || j.bl, vessel: transport.vessel_name || j.vessel }));
      }
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (err: any) { alert(err.message || 'Save failed'); } finally { setSaving(false); }
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
      {ocrBanner && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 9, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🔍</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>OCR data ready to apply</div>
              <div style={{ fontSize: 11, color: 'var(--ink2)' }}>
                Extracted from scanned document — parties, financials, HS codes &amp; transport details.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button type="button" title="Dismiss OCR suggestion" onClick={() => { localStorage.removeItem(`ocrDecl_${job.id}`); setOcrBanner(null); }}
              style={{ fontSize: 11, color: 'var(--ink3)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              Dismiss
            </button>
            <button type="button" title="Apply OCR extracted data to all declaration fields" onClick={applyOcrData}
              style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--teal)', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>
              Apply OCR data
            </button>
          </div>
        </div>
      )}

      {/* Sub-tab strip */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: 'var(--bg)', borderRadius: 9, padding: 4, border: '1px solid var(--border)' }}>
        {SUB_TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setSub(t.key)} style={{ flex: 1, padding: '6px 4px', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font)', background: sub === t.key ? 'var(--white)' : 'transparent', color: sub === t.key ? 'var(--teal)' : 'var(--ink3)', boxShadow: sub === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.12s' }}>
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
            <div className="decl-grid">
              <DField label="Duty Rate (%)"><DInput value={financial.duty_rate} onChange={v => setFinancial(f => ({ ...f, duty_rate: v }))} placeholder="25" mono /></DField>
              <DField label="VAT Rate (%)"><DInput value={financial.vat_rate} onChange={v => setFinancial(f => ({ ...f, vat_rate: v }))} placeholder="18" mono /></DField>
              <DField label="Excise Rate (%)"><DInput value={financial.excise_rate} onChange={v => setFinancial(f => ({ ...f, excise_rate: v }))} placeholder="0" mono /></DField>
            </div>
            {cifUsd > 0 && (
              <div style={{ marginTop: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 16px' }}>
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
      <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', fontSize: 13 }}>
          <Icon name="save" size={14} />
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Declaration'}
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
  const { isCheckedIn, triggerOpen } = useClockIn();
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
    } catch (err: any) { alert(err.message || 'Send failed'); } finally { setSending(false); }
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
    } catch (err: any) { alert(err.message || 'Stage update failed'); }
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
                {msg.isInternal && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: '#f1f5f9', color: 'var(--ink3)', border: '1px solid var(--border)', fontWeight: 600 }}>🔒 Internal Only</span>}
                {msg.channels.filter(c => c !== 'internal').map(c => <ChBadge key={c} ch={c} />)}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, padding: '12px 16px', background: msg.isInternal ? '#f8fafc' : 'var(--white)', border: '1px solid var(--border)', borderRadius: '0 10px 10px 10px', borderTopLeftRadius: 2 }}>
                {msg.content}
                {msg.attachments?.map(a => (
                  <div key={a} style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, color: 'var(--teal)', cursor: 'pointer' }}>
                    <Icon name="paperclip" size={13} /> {a}
                  </div>
                ))}
              </div>
              {msg.reactions?.map(r => (
                <button key={r.emoji} type="button" style={{ marginTop: 6, padding: '3px 8px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, cursor: 'pointer' }}>
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
        <div style={{ background: 'var(--white)', border: '1px solid var(--teal)', borderRadius: 9, overflow: 'hidden', marginBottom: 12 }}>
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
                  style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 7, cursor: 'pointer', border: `1.5px solid ${cur ? 'var(--teal)' : past ? '#bbf7d0' : 'var(--border)'}`, background: cur ? 'var(--teal)' : past ? '#f0fdf4' : 'var(--white)', color: cur ? '#fff' : past ? '#16a34a' : 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: .7 }}>{i + 1}</span> {s.short}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>Post to:</span>
          <button type="button" onClick={() => setIsInternal(true)} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${isInternal ? 'var(--ink3)' : 'var(--border)'}`, background: isInternal ? '#f1f5f9' : 'var(--white)', color: isInternal ? 'var(--ink)' : 'var(--ink3)' }}>🔒 Internal Note</button>
          <button type="button" onClick={() => { setIsInternal(false); if (!chans.length) setChans(['whatsapp']); }} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${!isInternal ? CH_CFG.whatsapp.color : 'var(--border)'}`, background: !isInternal ? CH_CFG.whatsapp.bg : 'var(--white)', color: !isInternal ? CH_CFG.whatsapp.color : 'var(--ink3)' }}>↗ Share Update</button>
          {!isInternal && (['whatsapp', 'email', 'teams', 'sms'] as Channel[]).map(ch => {
            const cfg = CH_CFG[ch]; const on = chans.includes(ch);
            return <button key={ch} type="button" onClick={() => toggleCh(ch)} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? cfg.color : 'var(--border)'}`, background: on ? cfg.bg : 'var(--white)', color: on ? cfg.color : 'var(--ink3)' }}>{cfg.label}</button>;
          })}
        </div>
        <div style={{ padding: '12px 16px' }}>
          <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend(); }} rows={3}
            placeholder={isInternal ? 'Write an internal note — not visible to customer…' : 'Write a customer update — will be sent via selected channels…'}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, resize: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box' as const, lineHeight: 1.5 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Ctrl+Enter to send</span>
              <button type="button" onClick={() => setShowStageBar(s => !s)}
                title="Set shipment stage"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: showStageBar ? 'var(--teal-l)' : 'var(--bg)', color: showStageBar ? 'var(--teal)' : 'var(--ink3)', border: `1px solid ${showStageBar ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .12s' }}>
                <Icon name="flag" size={13} color={showStageBar ? 'var(--teal)' : 'var(--ink3)'} /> Set Stage
              </button>
            </div>
            <button type="button" onClick={handleSend} disabled={sending || !text.trim()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: text.trim() && !sending ? 'var(--teal)' : 'var(--border)', color: text.trim() && !sending ? '#fff' : 'var(--ink3)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: text.trim() && !sending ? 'pointer' : 'default', transition: 'all 0.15s' }}>
              <Icon name="send" size={14} /> {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ job, isMobile }: { job: ClearanceJob; isMobile: boolean }) {
  const currentIdx = stageIdx(job.stage);
  const totalStages = STAGES.length;
  const progressPct = Math.round(((currentIdx + 1) / totalStages) * 100);
  const totalTasks   = job.tasks.length;
  const doneTasks    = job.tasks.filter(t => t.status === 'complete').length;
  const totalHours   = job.timeEntries.reduce((s, e) => s + e.hours, 0);
  const totalCharges = job.ledger.filter(e => e.type === 'charge').reduce((s, e) => s + e.amount, 0);
  const daysLeft     = job.dueDate ? Math.ceil((job.dueDate.getTime() - Date.now()) / 86400000) : null;

  return (
    <div>
      {/* Progress */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Clearance Progress</span>
          <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--teal)' }}>{progressPct}%</span>
        </div>
        <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--teal)', borderRadius: 4, transition: 'width 0.4s' }} />
        </div>
        <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--ink3)' }}>
          Stage {currentIdx + 1} of {totalStages} — {STAGES.find(s => s.id === job.stage)?.label}
        </div>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Tasks',        value: `${doneTasks}/${totalTasks}`, sub: `${totalTasks - doneTasks} open`,         color: 'var(--teal)'  },
          { label: 'Days Left',    value: daysLeft !== null ? (daysLeft >= 0 ? String(daysLeft) : 'Overdue') : '—', sub: job.dueDate ? fdate(job.dueDate) : 'No due date', color: daysLeft !== null && daysLeft < 0 ? 'var(--red)' : 'var(--ink)' },
          { label: 'Hours Logged', value: totalHours.toFixed(1),        sub: `${job.timeEntries.length} entries`,     color: '#2563eb'      },
          { label: 'Documents',    value: String(job.documents.length),  sub: `${job.documents.filter(d => d.extracted?.status === 'done').length} AI extracted`, color: '#7c3aed' },
          { label: 'Total Charges',value: totalCharges > 0 ? `TZS ${(totalCharges/1_000_000).toFixed(1)}M` : '—', sub: `${job.ledger.filter(e => e.type==='charge').length} entries`, color: '#dc2626' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color, marginBottom: 2 }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* 2-col body */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 14 }}>

        {/* Left: shipment details + stage workflow */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Shipment Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 2 }}>
              {([
                ['B/L Number',  job.bl || '—',                                   true ],
                ['TANSAD',      job.tansad || '—',                               true ],
                ['Vessel',      job.vessel || '—',                               false],
                ['Transport',   job.mode,                                        false],
                ['Origin',      job.origin || '—',                               false],
                ['Destination', job.destination || '—',                          false],
                ['Gross Weight',job.weight || '—',                               false],
                ['CIF Value',   job.invoiceValue || '—',                         false],
                ['Containers',  (job.containers?.length ?? 0) > 0 ? (job.containers ?? []).join(', ') : '—', true],
                ['Customer',    job.customer,                                    false],
              ] as [string,string,boolean][]).map(([k, v, mono], i) => (
                <div key={k} style={{ padding: '8px 10px', background: i % 2 === 0 ? 'var(--bg)' : 'var(--white)', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', marginBottom: 1 }}>{k}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', fontFamily: mono ? 'var(--mono)' : undefined, wordBreak: 'break-all' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '16px 0 12px', overflowX: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, paddingLeft: 20 }}>Clearance Workflow</div>
            <StageStepper stage={job.stage} />
          </div>
        </div>

        {/* Right: activity feed */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
            Activity Feed
          </div>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 480 }}>
            {job.activity.length === 0 && <div style={{ padding: '24px 16px', fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>No activity yet.</div>}
            {[...job.activity].reverse().map((ev, i) => (
              <div key={ev.id} style={{ display: 'flex', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarBg(ev.userName), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, fontWeight: 700 }}>
                  {initials(ev.userName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 700 }}>{ev.userName}</span>{' '}{ev.subject}
                    {ev.detail && <span style={{ color: 'var(--ink3)' }}> — {ev.detail}</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2 }}>{fdatetime(ev.ts)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tasks Tab ────────────────────────────────────────────────────────────────

const TASK_STATUS_CFG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  not_started:       { label: 'Not Started',       color: '#64748b', bg: '#f1f5f9' },
  in_progress:       { label: 'In Progress',       color: '#2563eb', bg: '#dbeafe' },
  testing:           { label: 'Testing',           color: '#7c3aed', bg: '#ede9fe' },
  awaiting_feedback: { label: 'Awaiting Feedback', color: '#ca8a04', bg: '#fef9c3' },
  complete:          { label: 'Complete',           color: '#16a34a', bg: '#dcfce7' },
};
const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  low:    { label: 'Low',    color: '#16a34a' },
  medium: { label: 'Medium', color: '#ca8a04' },
  high:   { label: 'High',   color: '#ea580c' },
  urgent: { label: 'Urgent', color: '#dc2626' },
};

function TasksTab({ job, isMobile, shipmentId, isLive, onRefresh }: { job: ClearanceJob; isMobile: boolean; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [search,       setSearch]       = useState('');
  const [showAdd,      setShowAdd]      = useState(false);
  const [newTitle,     setNewTitle]     = useState('');
  const [newAssignee,  setNewAssignee]  = useState(job.assignees[0] || '');
  const [newDue,       setNewDue]       = useState('');
  const [newPriority,  setNewPriority]  = useState<'medium' | 'low' | 'high' | 'urgent'>('medium');
  const [addSaving,    setAddSaving]    = useState(false);
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen } = useClockIn();
  const isStaff = !!(user && user.role !== 'CUSTOMER');

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
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/tasks`, {
          method: 'POST',
          body: JSON.stringify({ title: newTitle, priority: newPriority, assigned_to: newAssignee || undefined, due_date: newDue || undefined }),
        });
        onRefresh();
      } else {
        const task: InternalTask = {
          id: 'task-' + Date.now(), title: newTitle, status: 'not_started', priority: newPriority,
          assignees: newAssignee ? [newAssignee] : [], startDate: new Date(),
          dueDate: newDue ? new Date(newDue) : new Date(Date.now() + 7 * 86400000), tags: [],
        };
        updateJob(job.id, j => ({ ...j, tasks: [...j.tasks, task] }));
      }
      setNewTitle(''); setNewDue(''); setShowAdd(false);
    } catch (err: any) { alert(err.message || 'Failed to create task'); } finally { setAddSaving(false); }
  }

  return (
    <div>
      {/* Status filter strip */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setFilterStatus('all')} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${filterStatus === 'all' ? 'var(--teal)' : 'var(--border)'}`, background: filterStatus === 'all' ? 'var(--teal-l)' : 'var(--white)', color: filterStatus === 'all' ? 'var(--teal)' : 'var(--ink3)' }}>All <span style={{ fontWeight: 700 }}>{counts.all}</span></button>
        {statuses.map(s => { const cfg = TASK_STATUS_CFG[s]; const on = filterStatus === s; return (
          <button key={s} type="button" onClick={() => setFilterStatus(s)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? cfg.color : 'var(--border)'}`, background: on ? cfg.bg : 'var(--white)', color: on ? cfg.color : 'var(--ink3)' }}>
            {cfg.label} <span style={{ fontWeight: 700 }}>{counts[s]}</span>
          </button>
        ); })}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…" className="input-field" style={{ flex: 1, fontSize: 13 }} />
        <button type="button" onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Icon name="plus" size={14} /> Add Task
        </button>
      </div>

      {/* Add-task form */}
      {showAdd && (
        <form onSubmit={handleAdd} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>New Task</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Task Title</label>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="input-field" placeholder="Describe the task…" required style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Assignee</label>
              <input value={newAssignee} onChange={e => setNewAssignee(e.target.value)} className="input-field" placeholder="Name" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Due Date</label>
              <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} className="input-field" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Priority</label>
              <select value={newPriority} onChange={e => setNewPriority(e.target.value as 'medium')} className="input-field" style={{ width: '100%' }}>
                {(['low','medium','high','urgent'] as const).map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={addSaving}>{addSaving ? 'Saving…' : 'Add Task'}</button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn btn-secondary btn-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="rtbl-wrap">
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <table className="rtbl" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['#','Task','Status','Start','Due','Assignees','Priority','Tags'].map(h => (
              <th key={h} style={{ padding: '10px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No tasks match this filter.</td></tr>}
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
  const [logSaving, setLogSaving] = useState(false);
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen } = useClockIn();
  const isStaff = !!(user && user.role !== 'CUSTOMER');

  const totalHours = job.timeEntries.reduce((s, e) => s + e.hours, 0);

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    if (!logHours) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    const h = parseFloat(logHours);
    setLogSaving(true);
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/time-entries`, {
          method: 'POST',
          body: JSON.stringify({ member: logMember, task_ref: job.tasks.find(t => t.id === logTask)?.title || undefined, hours: h, note: logNote || undefined, log_date: logDate }),
        });
        onRefresh();
      } else {
        const task = job.tasks.find(t => t.id === logTask);
        const entry: TimeEntry = {
          id: 'te-' + Date.now(), memberId: logMember, memberName: logMember,
          taskId: logTask, taskTitle: task?.title || 'General',
          duration: `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}:00`,
          hours: h, date: new Date(logDate), billable: true, note: logNote || undefined,
        };
        updateJob(job.id, j => ({ ...j, timeEntries: [...j.timeEntries, entry] }));
      }
      setLogHours(''); setLogNote(''); setShowLog(false);
    } catch (err: any) { alert(err.message || 'Log failed'); } finally { setLogSaving(false); }
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
          Total: <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{totalHours.toFixed(1)} hrs</span> across {job.timeEntries.length} entries
        </div>
        <button type="button" onClick={() => setShowLog(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Icon name="clock" size={14} /> Log Time
        </button>
      </div>

      {/* Log time form */}
      {showLog && (
        <form onSubmit={handleLog} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Log Time Entry</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Member</label>
              <input value={logMember} onChange={e => setLogMember(e.target.value)} className="input-field" placeholder="Name" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Task</label>
              <select value={logTask} onChange={e => setLogTask(e.target.value)} className="input-field" style={{ width: '100%' }}>
                <option value="">General</option>
                {job.tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Hours</label>
              <input type="number" step="0.25" min="0.25" value={logHours} onChange={e => setLogHours(e.target.value)} className="input-field" placeholder="1.5" required style={{ width: '100%', fontFamily: 'var(--mono)' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Date</label>
              <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="input-field" style={{ width: '100%' }} />
            </div>
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
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <table className="rtbl" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Member','Task','Date','Duration','Hours','Note'].map(h => (
              <th key={h} style={{ padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {job.timeEntries.length === 0 && <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No time logged yet. Click "Log Time" to start tracking.</td></tr>}
            {[...job.timeEntries].reverse().map((entry, i) => (
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
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fdate(entry.date)}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{entry.duration}</td>
                <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 700, color: '#2563eb' }}>{entry.hours.toFixed(2)}</td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--ink3)', maxWidth: 180 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{entry.note || '—'}</span>
                </td>
              </tr>
            ))}
          </tbody>
          {job.timeEntries.length > 0 && (
            <tfoot>
              <tr style={{ background: 'var(--bg)', borderTop: '2px solid var(--border)' }}>
                <td colSpan={4} style={{ padding: '10px 16px', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>TOTAL</td>
                <td style={{ padding: '10px 16px', fontSize: 15, fontWeight: 800, color: '#2563eb' }}>{totalHours.toFixed(2)}</td>
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
      {ex.summary && <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 14, padding: '10px 14px', background: '#f0fdf4', borderRadius: 6, borderLeft: '3px solid #16a34a', lineHeight: 1.5 }}>{ex.summary}</div>}
      {ex.sections?.map(sec => (
        <div key={sec.title} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{sec.title}</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
            {sec.fields.map((f, i) => (
              <div key={f.label} style={{ display: 'flex', padding: '8px 14px', background: i % 2 === 0 ? 'var(--white)' : 'var(--bg)', borderBottom: i < sec.fields.length - 1 ? '1px solid var(--border)' : 'none', gap: 16 }}>
                <span style={{ fontSize: 12, color: 'var(--ink3)', width: 200, flexShrink: 0 }}>{f.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: f.flag === 'err' ? 'var(--red)' : f.flag === 'warn' ? '#ca8a04' : 'var(--ink)' }}>{f.value}</span>
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

const CLOUD_CFG: Record<string, { label: string; color: string; bg: string }> = {
  gdrive:     { label: 'Google Drive',  color: '#1a73e8', bg: '#e8f0fe' },
  onedrive:   { label: 'OneDrive',      color: '#0078d4', bg: '#deecf9' },
  box:        { label: 'Box',           color: '#0061d5', bg: '#dde8f8' },
  dropbox:    { label: 'Dropbox',       color: '#0061ff', bg: '#ddeaff' },
  gsheets:    { label: 'Google Sheets', color: '#34a853', bg: '#e6f4ea' },
  sharepoint: { label: 'SharePoint',    color: '#038387', bg: '#d0efef' },
};

const CLOUD_OAUTH_URLS: Record<string, string> = {
  gdrive:     'https://accounts.google.com/o/oauth2/auth?scope=https://www.googleapis.com/auth/drive.file&response_type=code',
  onedrive:   'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?scope=files.readwrite',
  dropbox:    'https://www.dropbox.com/oauth2/authorize?response_type=code',
  box:        'https://account.box.com/api/oauth2/authorize?response_type=code',
  gsheets:    'https://accounts.google.com/o/oauth2/auth?scope=https://www.googleapis.com/auth/spreadsheets&response_type=code',
  sharepoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?scope=sites.readwrite.all',
};

function FilesTab({ job, isMobile }: { job: ClearanceJob; isMobile: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function handleCloudLink(provider: string) {
    const url = CLOUD_OAUTH_URLS[provider];
    if (url) {
      const popup = window.open(url + `&state=${provider}_${job.id}`, '_blank', 'width=600,height=700,scrollbars=yes');
      if (!popup) alert('Please allow popups to connect cloud storage.');
    }
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploadingId('new');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('shipment_id', job.id);
    fetch(`/v1/shipments/${job.id}/documents`, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    })
      .then(() => { setUploadingId(null); })
      .catch(() => {
        // fallback: add to local state
        const doc: ShipDoc = {
          id: `doc-${Date.now()}`, name: file.name,
          type: file.name.endsWith('.pdf') ? 'other' : 'other',
          size: `${(file.size / 1024).toFixed(0)} KB`,
          uploadedBy: 'You', uploadedAt: new Date(),
          extracted: { status: 'pending' as const },
        };
        updateJob(job.id, j => ({ ...j, documents: [...j.documents, doc] }));
        setUploadingId(null);
      });
    e.target.value = '';
  }

  function handleExtract(docId: string) {
    updateJob(job.id, j => ({ ...j, documents: j.documents.map(d => d.id === docId ? { ...d, extracted: { ...(d.extracted || {}), status: 'processing' as const } } : d) }));
    setTimeout(() => {
      updateJob(job.id, j => ({
        ...j,
        documents: j.documents.map(d =>
          d.id === docId && d.extracted?.status === 'processing'
            ? { ...d, extracted: { status: 'done' as const, docType: 'Extracted Document', confidence: 86, sections: [{ title: 'Extracted Fields', fields: [{ label: 'Extraction Status', value: 'Complete — verify the fields below', flag: 'ok' as const }] }], summary: 'Document successfully parsed by AI. Review and verify the extracted fields.' } }
            : d
        ),
      }));
    }, 2500);
  }

  const extracted = job.documents.filter(d => d.extracted?.status === 'done');

  return (
    <div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* ── Cloud Storage Providers ── */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cloud Storage</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Click to sync — opens OAuth in a popup</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
          {Object.entries(CLOUD_CFG).map(([key, cfg]) => {
            const linked = job.cloudLinks.filter(l => l.provider === key as CloudLink['provider']);
            return (
              <div key={key} style={{ border: `1px solid ${linked.length > 0 ? cfg.color + '60' : 'var(--border)'}`, borderRadius: 9, padding: '12px 14px', background: linked.length > 0 ? cfg.bg : 'var(--white)', transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: linked.length > 0 ? 7 : 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: linked.length > 0 ? cfg.color : 'var(--ink)' }}>{cfg.label}</span>
                  <button type="button" onClick={() => handleCloudLink(key)}
                    style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: `1px solid ${cfg.color}`, background: linked.length > 0 ? cfg.color : 'transparent', color: linked.length > 0 ? '#fff' : cfg.color, cursor: 'pointer', fontWeight: 700, transition: 'all 0.15s' }}>
                    {linked.length > 0 ? '↗ Browse' : '+ Link'}
                  </button>
                </div>
                {linked.map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                    <Icon name="externalLink" size={10} />
                    <a href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: cfg.color, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{l.name}</a>
                  </div>
                ))}
                {linked.length === 0 && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>Not connected</div>}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="info" size={12} />
          Files sync to File Manager under <strong style={{ fontFamily: 'var(--mono)', marginLeft: 3 }}>/{job.bl || job.id}/</strong> and are linked to the customer &amp; invoice.
        </div>
      </div>

      {extracted.length > 0 && (
        <div style={{ display: 'flex', gap: 16, padding: '14px 20px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9, marginBottom: 20 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{extracted.length}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>Documents Extracted by AI</div>
            <div style={{ fontSize: 12, color: '#15803d' }}>Data captured from {extracted.map(d => d.name).join(', ')}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button type="button" onClick={handleUploadClick} disabled={uploadingId === 'new'}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: uploadingId === 'new' ? 'wait' : 'pointer', opacity: uploadingId === 'new' ? 0.75 : 1 }}>
          <Icon name="upload" size={14} /> {uploadingId === 'new' ? 'Uploading…' : 'Upload Document'}
        </button>
      </div>

      {job.documents.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink3)', fontSize: 14 }}>
          No documents uploaded yet. Upload B/L, Invoice, Assessment docs to begin.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {job.documents.map(doc => {
          const isExp = expanded === doc.id; const ex = doc.extracted;
          return (
            <div key={doc.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }} onClick={() => setExpanded(isExp ? null : doc.id)}>
                <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', flexShrink: 0 }}>
                  <Icon name={docIcon(doc.type)} size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1 }}>{doc.size} · Uploaded by {doc.uploadedBy} · {fdate(doc.uploadedAt)}</div>
                  {ex?.status === 'done' && ex.summary && <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.summary}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  {ex?.status === 'done'       && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: '#dcfce7', color: '#16a34a', fontWeight: 700, border: '1px solid #bbf7d0' }}>✓ AI Extracted · {ex.confidence}%</span>}
                  {ex?.status === 'processing' && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: '#fef9c3', color: '#ca8a04', fontWeight: 700 }}>Processing…</span>}
                  {(!ex || ex.status === 'pending') && (
                    <button type="button" onClick={e => { e.stopPropagation(); handleExtract(doc.id); }} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--teal)', color: 'var(--teal)', background: 'var(--white)', cursor: 'pointer', fontWeight: 700 }}>
                      Extract with AI
                    </button>
                  )}
                  <button type="button" onClick={e => e.stopPropagation()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="download" size={16} /></button>
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

// ─── Ledger Tab ───────────────────────────────────────────────────────────────

function LedgerTab({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const [showForm,  setShowForm]  = useState(false);
  const [entryType, setEntryType] = useState<'charge' | 'payment'>('charge');
  const [category,  setCategory]  = useState('CLEARANCE');
  const [desc,      setDesc]      = useState('');
  const [amount,    setAmount]    = useState('');
  const [ref,       setRef]       = useState('');
  const [ledgSaving, setLedgSaving] = useState(false);
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen } = useClockIn();
  const isStaff = !!(user && user.role !== 'CUSTOMER');

  const charges  = job.ledger.filter(e => e.type === 'charge');
  const payments = job.ledger.filter(e => e.type === 'payment');
  const totalCharges = charges.reduce((s, e) => s + e.amount, 0);
  const totalPaid    = payments.reduce((s, e) => s + e.amount, 0);
  const balance      = totalPaid - totalCharges;

  function sColor(s: string) { return s === 'paid' ? '#16a34a' : s === 'overdue' ? '#dc2626' : '#ca8a04'; }

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
    } catch (err: any) { alert(err.message || 'Failed to add entry'); } finally { setLedgSaving(false); }
  }

  return (
    <div>
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
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '20px 22px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Shipment Economics</div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: marginPct >= 20 ? '#dcfce7' : marginPct >= 0 ? '#fef3c7' : '#fee2e2', color: marginPct >= 20 ? '#16a34a' : marginPct >= 0 ? '#ca8a04' : '#dc2626' }}>
                {marginPct >= 0 ? '+' : ''}{marginPct}% margin
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Revenue',        value: fmtTZS(revenue),     color: '#16a34a', icon: '↑' },
                { label: 'Expenses',       value: fmtTZS(expenses),    color: '#dc2626', icon: '↓' },
                { label: 'Gross Margin',   value: fmtTZS(Math.abs(grossMargin)), color: grossMargin >= 0 ? '#16a34a' : '#dc2626', icon: grossMargin >= 0 ? '✓' : '⚠' },
                { label: 'Ops Budget (20%)', value: fmtTZS(opsBudget), color: '#2563eb', icon: '⚙' },
              ].map(c => (
                <div key={c.label} style={{ padding: '14px 16px', background: 'var(--bg)', borderRadius: 9, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{c.icon} {c.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: c.color, fontFamily: 'var(--mono)' }}>{c.value}</div>
                </div>
              ))}
            </div>
            {/* Ops budget utilisation bar */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink3)', marginBottom: 5 }}>
                <span>Operations budget utilisation</span>
                <span style={{ fontWeight: 700, color: opsUtil > 90 ? '#dc2626' : 'var(--ink)' }}>{opsUtil}% of {fmtTZS(opsBudget)}</span>
              </div>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${opsUtil}%`, background: opsUtil > 90 ? '#dc2626' : opsUtil > 60 ? '#ca8a04' : '#16a34a', borderRadius: 4, transition: 'width 0.4s' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>20% of billed charges reserved for operations spend</div>
            </div>
          </div>
        );
      })()}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Charges',  value: fmtTZS(totalCharges), color: '#dc2626',  sub: `${charges.filter(e => e.status === 'pending').length} pending` },
          { label: 'Total Received', value: fmtTZS(totalPaid),    color: '#16a34a',  sub: `${payments.length} payments` },
          { label: balance >= 0 ? 'Net Surplus' : 'Balance Due', value: fmtTZS(Math.abs(balance)), color: balance >= 0 ? '#16a34a' : '#ca8a04', sub: balance >= 0 ? 'Client ahead' : 'Outstanding' },
        ].map(card => (
          <div key={card.label} style={{ padding: '16px 20px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--white)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: card.color, marginBottom: 3 }}>{card.value}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Add entry */}
      <div style={{ marginBottom: 20 }}>
        {!showForm ? (
          <button type="button" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Icon name="plus" size={14} /> Record Entry
          </button>
        ) : (
          <form onSubmit={handleAdd} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '18px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>New Ledger Entry</div>
            {/* Type toggle */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['charge', 'payment'] as const).map(t => (
                <button key={t} type="button" onClick={() => setEntryType(t)} style={{ flex: 1, padding: '7px', border: `1px solid ${entryType === t ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 6, background: entryType === t ? 'var(--teal-l)' : 'var(--white)', color: entryType === t ? 'var(--teal)' : 'var(--ink3)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {t === 'charge' ? '⬆ Charge' : '⬇ Payment Received'}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="input-field" style={{ width: '100%' }}>
                  {['DUTY','PORT','INSPECTION','TRANSPORT','STORAGE','AGENCY','CLEARANCE','OTHER'].map(c => <option key={c}>{c}</option>)}
                </select>
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
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
          <span>Charges</span><span style={{ fontFamily: 'var(--mono)', color: '#dc2626' }}>{fmtTZS(totalCharges)}</span>
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
                <td style={{ padding: '11px 20px', fontSize: 15, fontWeight: 700, color: '#dc2626', textAlign: 'right' }}>{fmtTZS(totalCharges)}</td>
              </tr>
            </tfoot>
          </table></div>
        )}
      </div>

      {/* Payments */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
          <span>Payments Received</span><span style={{ fontFamily: 'var(--mono)', color: '#16a34a' }}>{fmtTZS(totalPaid)}</span>
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
            <div style={{ fontSize: 15, fontWeight: 700, color: '#16a34a' }}>+{fmtTZS(e.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Staff Picker Modal ───────────────────────────────────────────────────────

function StaffPickerModal({ jobId, existing, onClose, mode = 'tag', onAssign }: {
  jobId: string;
  existing: string[];
  onClose: () => void;
  mode?: 'tag' | 'assign';
  onAssign?: (ids: string[], names: string[]) => void;
}) {
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<Employee[]>([]);
  const [channels, setChannels]     = useState<Channel[]>(['email', 'whatsapp']);
  const [saved, setSaved]           = useState(false);
  const [staff, setStaff]           = useState<Employee[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState(false);

  useEffect(() => {
    setStaffLoading(true);
    setStaffError(false);
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
  }, []);

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

  const STATUS_COLOR: Record<string, string> = { ACTIVE: '#16a34a', ON_LEAVE: '#ca8a04' };

  function handleConfirm() {
    if (staffLoading || staffError || selected.length === 0) return;
    if (mode === 'assign') {
      onAssign?.(selected.map(e => e.id), selected.map(e => e.name));
      setSaved(true);
      setTimeout(() => { onClose(); }, 900);
      return;
    }
    const newListeners: import('./clearanceData.js').Listener[] = selected.map(e => ({
      id: e.id, name: e.name, role: e.designation, type: 'internal' as const, channel: channels,
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
    setSaved(true);
    setTimeout(() => { onClose(); }, 900);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 480, maxHeight: '85vh', background: 'var(--white)', borderRadius: 9, boxShadow: '0 24px 64px rgba(0,0,0,.22)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Tag Staff</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Select team members to notify and assign to this shipment</div>
          </div>
          <button type="button" title="Close" onClick={onClose} style={{ background: 'var(--bg)', border: 'none', borderRadius: 9, cursor: 'pointer', padding: 6, display: 'flex' }}>
            <Icon name="x" size={16} color="var(--ink2)" />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={13} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, department, or role…"
              style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--border)', borderRadius: 9, fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' as const }} />
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
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 20px', border: 'none', background: on ? 'var(--teal-l)' : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', transition: 'background .1s' }}>
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
            {(['email', 'whatsapp', 'sms', 'teams'] as Channel[]).map(ch => {
              const on = channels.includes(ch);
              const COLORS: Record<string, string> = { email: 'var(--teal)', whatsapp: '#16a34a', sms: '#d97706', teams: '#7c3aed' };
              return (
                <button key={ch} type="button" onClick={() => toggleCh(ch)}
                  style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 9, cursor: 'pointer', border: `1.5px solid ${on ? COLORS[ch] : 'var(--border)'}`, background: on ? `${COLORS[ch]}18` : 'var(--white)', color: on ? COLORS[ch] : 'var(--ink3)', transition: 'all .12s', textTransform: 'capitalize' }}>
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
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--white)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button type="button" disabled={staffLoading || staffError || selected.length === 0 || saved} onClick={handleConfirm}
              style={{ padding: '8px 18px', background: saved ? 'var(--green)' : selected.length > 0 ? 'var(--teal)' : 'var(--border)', color: selected.length > 0 || saved ? '#fff' : 'var(--ink3)', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: selected.length > 0 ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 7, transition: 'background .15s' }}>
              {saved ? <><Icon name="check" size={13} color="#fff" /> Done!</> : <><Icon name="userPlus" size={13} color={selected.length > 0 ? '#fff' : 'var(--ink3)'} /> {mode === 'assign' ? 'Assign' : 'Tag & Notify'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Listeners Sidebar ────────────────────────────────────────────────────────

const ALL_CHANNELS: Channel[] = ['whatsapp', 'email', 'teams', 'sms'];

function ChannelToggle({ ch, active, onToggle }: { ch: Channel; active: boolean; onToggle: () => void }) {
  const cfg = CH_CFG[ch];
  return (
    <button type="button" onClick={onToggle} title={`${active ? 'Disable' : 'Enable'} ${cfg.label}`}
      style={{ fontSize: 10, padding: '2px 7px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${active ? cfg.color : 'var(--border)'}`, background: active ? cfg.bg : 'var(--white)', color: active ? cfg.color : 'var(--ink3)', fontWeight: 600, transition: 'all 0.12s' }}>
      {cfg.label}
    </button>
  );
}

function ListenersSidebar({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const [listenerChannels, setListenerChannels] = useState<Record<string, Channel[]>>(() => {
    const init: Record<string, Channel[]> = {};
    job.listeners.forEach(l => { init[l.id] = [...l.channel]; });
    return init;
  });
  const [showStaffPicker, setShowStaffPicker] = useState(false);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [waActive, setWaActive] = useState(true);
  const [waToggling, setWaToggling] = useState(false);

  async function handleAssign(employeeIds: string[], names: string[]) {
    if (isLive) {
      try {
        await apiFetch(`/v1/shipments/${shipmentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ assigned_to: employeeIds[0] }),
        });
        onRefresh();
      } catch (err: any) { alert(err.message || 'Assign failed'); }
    } else {
      updateJob(job.id, j => ({
        ...j,
        assignees: [...new Set([...j.assignees, ...employeeIds])],
        activity: [...j.activity, { id: `act-${Date.now()}`, action: 'assigned' as const, userId: 'me', userName: 'You', ts: new Date(), subject: `Assigned ${names.join(', ')}` }],
      }));
    }
  }

  async function toggleWhatsApp() {
    setWaToggling(true);
    await new Promise(r => setTimeout(r, 600));
    setWaActive(p => !p);
    setWaToggling(false);
  }

  function toggleListenerCh(listenerId: string, ch: Channel) {
    setListenerChannels(prev => {
      const cur = prev[listenerId] || [];
      return { ...prev, [listenerId]: cur.includes(ch) ? cur.filter(c => c !== ch) : [...cur, ch] };
    });
  }

  const internal  = job.listeners.filter(l => l.type === 'internal');
  const customers = job.listeners.filter(l => l.type === 'customer');

  return (
    <div style={{ width: 248, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Assigned To */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Assigned To</span>
          <button type="button" onClick={() => setShowAssignPicker(true)}
            style={{ fontSize: 11, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: '1px 0' }}>
            {job.assignees.length > 0 ? 'Change' : '+ Assign'}
          </button>
        </div>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {job.assignees.length === 0 && (
            <button type="button" onClick={() => setShowAssignPicker(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink3)', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 7, padding: '9px 12px', cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: 'var(--font)' }}>
              <Icon name="userPlus" size={14} color="var(--ink3)" /> Assign an agent…
            </button>
          )}
          {job.assignees.map(a => {
            const label = friendlyAssignee(a);
            return (
              <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Av name={label} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Assigned Officer</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showAssignPicker && (
        <StaffPickerModal
          jobId={job.id}
          existing={job.assignees}
          onClose={() => setShowAssignPicker(false)}
          mode="assign"
          onAssign={handleAssign}
        />
      )}

      {/* Internal Listeners */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Internal</span>
          <span style={{ padding: '1px 7px', background: 'var(--bg)', borderRadius: 9, fontSize: 10, fontWeight: 700, color: 'var(--ink3)' }}>{internal.length}</span>
        </div>
        {internal.length === 0 && <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>None added</div>}
        {internal.map(l => (
          <div key={l.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 7 }}>
              <Av name={l.name} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{l.role}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {ALL_CHANNELS.map(ch => (
                <ChannelToggle key={ch} ch={ch} active={(listenerChannels[l.id] || []).includes(ch)} onToggle={() => toggleListenerCh(l.id, ch)} />
              ))}
            </div>
          </div>
        ))}
        <div style={{ padding: '10px 16px' }}>
          <button type="button" onClick={() => setShowStaffPicker(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            <Icon name="plus" size={13} /> Add Internal
          </button>
        </div>
      </div>

      {showStaffPicker && (
        <StaffPickerModal
          jobId={job.id}
          existing={job.listeners.filter(l => l.type === 'internal').map(l => l.id)}
          onClose={() => setShowStaffPicker(false)}
        />
      )}

      {/* Customer Listeners */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Customers</span>
          <span style={{ padding: '1px 7px', background: '#dcfce7', color: '#16a34a', borderRadius: 9, fontSize: 10, fontWeight: 700 }}>{customers.length} · WA ✓</span>
        </div>
        {customers.length === 0 && <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>None added</div>}
        {customers.map(l => (
          <div key={l.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 7 }}>
              <Av name={l.name} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{l.role}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {ALL_CHANNELS.map(ch => (
                <ChannelToggle key={ch} ch={ch} active={(listenerChannels[l.id] || []).includes(ch)} onToggle={() => toggleListenerCh(l.id, ch)} />
              ))}
            </div>
          </div>
        ))}
        <div style={{ padding: '10px 16px' }}>
          <button type="button" onClick={() => setShowStaffPicker(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            <Icon name="plus" size={13} /> Add Customer
          </button>
        </div>
      </div>

      {/* WhatsApp Bot Toggle */}
      <div style={{ background: waActive ? '#dcfce7' : 'var(--white)', border: `1px solid ${waActive ? '#bbf7d0' : 'var(--border)'}`, borderRadius: 9, padding: '13px 16px', transition: 'background 0.2s, border-color 0.2s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: waActive ? '#16a34a' : 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            WhatsApp Bot {waActive ? 'Active' : 'Inactive'}
          </div>
          <button type="button" onClick={toggleWhatsApp} disabled={waToggling}
            style={{ position: 'relative', width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', background: waActive ? '#16a34a' : '#d1d5db', transition: 'background 0.2s', padding: 0, flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 3, left: waActive ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: waActive ? '#15803d' : 'var(--ink3)', lineHeight: 1.5 }}>
          {waActive ? 'ClearOS is connected to the customer\'s WhatsApp group. Updates push in real-time.' : 'WhatsApp notifications are paused. Toggle to reconnect.'}
        </div>
      </div>

      {/* Key Dates */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Key Dates</div>
        {[
          { label: 'Created',  value: fdate(job.createdAt), warn: false },
          { label: 'Due Date', value: job.dueDate ? fdate(job.dueDate) : '—', warn: !!(job.dueDate && new Date() > job.dueDate) },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{item.label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: item.warn ? '#dc2626' : 'var(--ink)' }}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* Flags */}
      {job.flags.length > 0 && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '13px 16px' }}>
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

type Tab = 'overview' | 'tasks' | 'timesheets' | 'timeline' | 'declaration' | 'updates' | 'files' | 'ledger';

const TAB_CFG: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'overview',     label: 'Overview',     icon: 'barChart'    },
  { id: 'tasks',        label: 'Tasks',        icon: 'tasks'       },
  { id: 'timesheets',   label: 'Timesheets',   icon: 'clock'       },
  { id: 'timeline',     label: 'Timeline',     icon: 'activity'    },
  { id: 'declaration',  label: 'Declaration',  icon: 'clipboard'   },
  { id: 'updates',      label: 'Updates',      icon: 'send'        },
  { id: 'files',        label: 'Files',        icon: 'folder'      },
  { id: 'ledger',       label: 'Ledger',       icon: 'receipt'     },
];

export function ShipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const mockJob = useJob(id || '');
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen } = useClockIn();
  const [apiJob,     setApiJob]     = useState<ClearanceJob | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [tab,        setTab]        = useState<Tab>('overview');
  const [showAdv,    setShowAdv]    = useState(false);

  const isStaff = !!(user && user.role !== 'CUSTOMER');

  // If not in mock store, try fetching from real API
  useEffect(() => {
    if (!mockJob && id) {
      setApiLoading(true);
      apiFetch(`/v1/shipments/${id}`)
        .then(data => setApiJob(apiToJob(data)))
        .catch(() => setApiJob(null))
        .finally(() => setApiLoading(false));
    } else {
      setApiJob(null);
    }
  }, [id, mockJob]);

  function refreshJob() {
    if (!id) return;
    apiFetch(`/v1/shipments/${id}`)
      .then(data => setApiJob(apiToJob(data)))
      .catch(() => {});
  }

  const job = mockJob || apiJob;
  const isMock = !!mockJob;

  if (apiLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--teal)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontSize: 14, color: 'var(--ink3)' }}>Loading shipment…</div>
    </div>
  );

  if (!job) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
      <div style={{ fontSize: 16, color: 'var(--ink3)' }}>Shipment not found.</div>
      <button type="button" onClick={() => navigate('/')} style={{ padding: '8px 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>← Back to Ops Command</button>
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
      } catch (err: any) { alert(err.message || 'Stage update failed'); }
    }
    setShowAdv(false);
  }

  const stageLabel = STAGES.find(s => s.id === job.stage)?.label || '';
  const isOverdue  = job.dueDate && new Date() > job.dueDate;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderBottom: '1px solid var(--border)' }}>
          <button type="button" onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 13, padding: '4px 0', fontFamily: 'var(--font)' }}>
            <Icon name="chevronLeft" size={15} /> Ops Command
          </button>
          <span style={{ color: 'var(--border)' }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{friendlyId(job)}</span>
          {!isMock && <span style={{ fontSize: 11, padding: '2px 7px', background: '#dbeafe', color: '#2563eb', borderRadius: 4, fontWeight: 600 }}>LIVE</span>}
          <div style={{ flex: 1 }} />
          {isOverdue && <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>⚠ Overdue</span>}
          <button type="button" onClick={() => setShowAdv(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Icon name="arrowRight" size={14} /> Advance Stage
          </button>
        </div>

        {/* Job identity */}
        <div style={{ padding: '16px 24px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 300 }}>
              {job.sysRef && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.05em', marginBottom: 4 }}>{job.sysRef}</div>
              )}
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2 }}>{job.title}</h1>
              <div style={{ fontSize: 14, color: 'var(--ink3)', marginTop: 4 }}>{job.customer} · {job.mode}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 2 }}>
              {job.flags.map(f => <FlagChip key={f} flag={f} />)}
              {job.tansad && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: '#dbeafe', color: '#2563eb', border: '1px solid #93c5fd', fontFamily: 'var(--mono)' }}>
                  TANSAD: {job.tansad}
                </span>
              )}
            </div>
          </div>

          {/* Info strip */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>
            {job.bl         && <span><span style={{ color: 'var(--ink2)' }}>B/L:</span> <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--ink)' }}>{job.bl}</span></span>}
            {job.vessel     && <span><span style={{ color: 'var(--ink2)' }}>Vessel:</span> <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{job.vessel}</span></span>}
            {job.origin && job.origin !== '—' && <span>{job.origin} → {job.destination}</span>}
            {job.weight     && <span><span style={{ color: 'var(--ink2)' }}>Weight:</span> {job.weight}</span>}
            {job.invoiceValue && <span><span style={{ color: 'var(--ink2)' }}>Value:</span> <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{job.invoiceValue}</span></span>}
            {job.containers && job.containers.length > 0 && <span><span style={{ color: 'var(--ink2)' }}>Containers:</span> {job.containers.join(', ')}</span>}
          </div>
        </div>

        {/* Stage stepper */}
        <div style={{ padding: '12px 0 14px', borderTop: '1px solid var(--border)' }}>
          <StageStepper stage={job.stage} />
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--teal)', fontWeight: 700, marginTop: 4 }}>
            {stageLabel}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', padding: '0 24px', borderTop: '1px solid var(--border)' }}>
          {TAB_CFG.map(t => {
            const badge =
              t.id === 'tasks'      ? job.tasks.length :
              t.id === 'timesheets' ? job.timeEntries.length :
              t.id === 'updates'    ? job.thread.length :
              t.id === 'files'      ? job.documents.length :
              t.id === 'ledger'     ? job.ledger.length : undefined;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} style={{ padding: '12px 16px', border: 'none', borderBottom: `2px solid ${tab === t.id ? 'var(--teal)' : 'transparent'}`, background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? 'var(--teal)' : 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.15s' }}>
                <Icon name={t.icon} size={14} />
                {t.label}
                {badge !== undefined && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 9, background: tab === t.id ? 'var(--teal)' : 'var(--border)', color: tab === t.id ? '#fff' : 'var(--ink3)' }}>{badge}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 16px' : '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {tab === 'overview'     && <OverviewTab    job={job} isMobile={isMobile} />}
            {tab === 'tasks'        && <TasksTab       job={job} isMobile={isMobile} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
            {tab === 'timesheets'   && <TimesheetsTab  job={job} isMobile={isMobile} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
            {tab === 'timeline'     && <TimelineTab    job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
            {tab === 'declaration'  && <DeclarationTab job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
            {tab === 'updates'      && <UpdatesTab     job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
            {tab === 'files'        && <FilesTab       job={job} isMobile={isMobile} />}
            {tab === 'ledger'       && <LedgerTab      job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
          </div>
          {tab !== 'overview' && !isMobile && <ListenersSidebar job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
        </div>
      </div>

      {showAdv && (
        <AdvanceStageModal job={job} onClose={() => setShowAdv(false)} onAdvance={handleAdvance} />
      )}
    </div>
  );
}
