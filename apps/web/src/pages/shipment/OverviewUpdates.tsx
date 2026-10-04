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
import { fdate, ftime, fdatetime, fmtTZS, Av, DOC_TYPE_LABEL, clockGate } from './utils.js';
import { CustomerMilestoneTimeline, CustomerAttentionPanel, CustomerAgentCard, AutomationHistoryCard, EstimateVarianceCard } from './Declaration.js';
export function UpdatesTab({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
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
                {msg.isInternal && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '2px 7px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', color: 'var(--ink3)', border: '1px solid var(--border)', fontWeight: 600 }}><Icon name="lock" size={9} /> Internal Only</span>}
                {msg.channels.filter(c => c !== 'internal').map(c => <ChBadge key={c} ch={c} />)}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, padding: '12px 16px', background: msg.isInternal ? 'var(--bg)' : 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm) var(--r) var(--r) var(--r)' }}>
                {msg.content}
                {msg.attachments?.map(a => (
                  <div key={a} style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--teal)', cursor: 'pointer' }}>
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
        <div style={{ background: 'var(--white)', border: '1px solid var(--teal)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 12 }}>
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
                  <span style={{ fontFamily: 'var(--font)', fontSize: 10, opacity: .7 }}>{i + 1}</span> {s.short}
                </button>
              );
            }); })()}
          </div>
        </div>
      )}

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>Post to:</span>
          <button type="button" onClick={() => setIsInternal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 'var(--ds-btn-py-xs) 12px', borderRadius: 'var(--badge-radius)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${isInternal ? 'var(--ink3)' : 'var(--border)'}`, background: isInternal ? 'var(--bg)' : 'var(--white)', color: isInternal ? 'var(--ink)' : 'var(--ink3)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}><Icon name="lock" size={11} /> Internal Note</button>
          <button type="button" onClick={() => { setIsInternal(false); if (!chans.length) setChans(['whatsapp']); }} style={{ padding: 'var(--ds-btn-py-xs) 12px', borderRadius: 'var(--badge-radius)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${!isInternal ? CH_CFG.whatsapp.color : 'var(--border)'}`, background: !isInternal ? CH_CFG.whatsapp.bg : 'var(--white)', color: !isInternal ? CH_CFG.whatsapp.color : 'var(--ink3)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>↗ Share Update</button>
          {!isInternal && (['whatsapp', 'email', 'teams', 'sms'] as Channel[]).map(ch => {
            const cfg = CH_CFG[ch]; const on = chans.includes(ch);
            return <button key={ch} type="button" onClick={() => toggleCh(ch)} style={{ padding: 'var(--ds-btn-py-xs) 12px', borderRadius: 'var(--badge-radius)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? cfg.color : 'var(--border)'}`, background: on ? cfg.bg : 'var(--white)', color: on ? cfg.color : 'var(--ink3)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>{cfg.label}</button>;
          })}
        </div>
        <div style={{ padding: '12px 16px' }}>
          <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend(); }} rows={3}
            placeholder={isInternal ? 'Write an internal note — not visible to customer…' : 'Write a customer update — will be sent via selected channels…'}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, resize: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box' as const, lineHeight: 1.5, outline: 'none' }} />
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

export function CustomerOverviewTab({ job, isMobile }: { job: ClearanceJob; isMobile: boolean }) {
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
              <div key={k} style={{ padding: '8px 10px', background: i % 2 === 0 ? 'var(--bg)' : 'var(--white)', borderRadius: 'var(--r-sm)'}}>
                <div style={{ fontSize: 10, color: 'var(--ink3)', marginBottom: 1 }}>{k}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', fontFamily: mono ? 'var(--font)' : undefined, wordBreak: 'break-all' }}>{v}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <CustomerAgentCard job={job} />
        <SectionCard title="Shared Documents">
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 10 }}>{job.documents.length} document{job.documents.length === 1 ? '' : 's'} on this shipment</div>
          <Link to={`?tab=files`} style={{ display: 'block', textAlign: 'center', padding: '9px 0', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', textDecoration: 'none' }}>
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
export const Card = SectionCard;

export function SpecRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink3)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', fontFamily: mono ? 'var(--font)' : undefined, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}


export function OverviewTab({ job, isMobile, isLive, onRefresh }: { job: ClearanceJob; isMobile: boolean; isLive: boolean; onRefresh: () => void }) {
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
          <div key={c.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px' }}>
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
          <div style={{ display: 'flex', height: 10, borderRadius: 'var(--r-sm)', overflow: 'hidden', background: 'var(--bg)' }}>
            {totalCharges > 0 && (
              <>
                <div style={{ width: `${Math.min(100, (totalPaid / totalCharges) * 100)}%`, background: 'var(--green)' }} />
                {balanceDue > 0 && <div style={{ width: `${Math.min(100, (balanceDue / totalCharges) * 100)}%`, background: isOverdueBal ? 'var(--red)' : 'var(--gold)' }} />}
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap', fontSize: 11.5 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink2)' }}><span style={{ width: 8, height: 8, borderRadius: 'var(--r-sm)', background: 'var(--green)', display: 'inline-block' }} />Paid {fmtTZS(totalPaid)}</span>
            {balanceDue > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 'var(--r-sm)', background: isOverdueBal ? 'var(--red)' : 'var(--gold)', display: 'inline-block' }} />
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

export const TASK_STATUS_CFG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  not_started:       { label: 'Not Started',       color: 'var(--ink3)', bg: 'var(--bg)' },
  in_progress:       { label: 'In Progress',       color: 'var(--blue)', bg: 'var(--blue-l)' },
  testing:           { label: 'Testing',           color: 'var(--purple)', bg: 'var(--purple-l)' },
  awaiting_feedback: { label: 'Awaiting Feedback', color: 'var(--gold)', bg: 'var(--gold-l)' },
  complete:          { label: 'Complete',           color: 'var(--green)', bg: 'var(--green-l)' },
};
export const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'var(--green)' },
  medium: { label: 'Medium', color: 'var(--gold)' },
  high:   { label: 'High',   color: 'var(--gold)' },
  urgent: { label: 'Urgent', color: 'var(--red)' },
};
