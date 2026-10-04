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
import { Checkbox } from '../components/ui/checkbox.js';
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
  type JobChargeLine,
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js';

// ── Group file imports ────────────────────────────────────────────────────────
export { buildShipmentReportHtml } from './shipment/utils.js';
import { useJob, openShipmentReportWindow, shareShipmentReportLink, clockGate, apiTaskToInternal, apiTimeEntryToInternal } from './shipment/utils.js';
import { DeclarationTab, StageStepper, CustomerMilestoneTimeline, CustomerAttentionPanel, CustomerAgentCard, AdvanceStageModal, AdvanceStageView, DocVerifyList, AutomationHistoryCard, EstimateVarianceCard } from './shipment/Declaration.js';
import { UpdatesTab, OverviewTab, CustomerOverviewTab } from './shipment/OverviewUpdates.js';
import { TasksTab, TimesheetsTab } from './shipment/TasksTimesheets.js';
import { FilesTab, DocumentsPanel, CO2Tab } from './shipment/DocsFiles.js';
import { JobChargesTab, LedgerTab } from './shipment/Finance.js';
import { StaffPickerModal, ListenersSidebar, WorkflowCard, LinkedOperationalDocs, type Tab, TAB_CFG, CUSTOMER_TABS } from './shipment/TeamWorkflow.js';
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
      <Link to="/" style={{ padding: '8px 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 13, textDecoration: 'none' }}>← Back</Link>
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
                <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.06em' }}>{job.sysRef}</span>
              )}
              {bookingRef && (
                <Link to="/cargotracker/bookings" title="View freight booking" style={{ fontSize: 10.5, padding: '2px 8px', background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--ink2)', borderRadius: 'var(--r-sm)', fontWeight: 700, textDecoration: 'none' }}>
                  Booked via {bookingRef.booking_number}
                </Link>
              )}
              {!isMock && <span style={{ fontSize: 10.5, padding: '2px 7px', background: 'var(--green-l)', color: 'var(--green)', borderRadius: 'var(--r-sm)', fontWeight: 700 }}>LIVE</span>}
              {isOverdue && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: 'var(--red)' }}><Icon name="alertTriangle" size={11} /> Overdue</span>}
              {job.hasDangerousGoods && (
                <button type="button" onClick={() => setTab('overview')} title="Carries a dangerous-goods declaration — see the Overview tab"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, padding: '2px 7px', background: 'var(--gold-l)', color: 'var(--gold)', borderRadius: 'var(--r-sm)', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
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
        <div style={{ margin: isMobile ? '-10px 10px 0' : '-12px 14px 0', position: 'relative', background: 'var(--white)', borderRadius: 'var(--r)', padding: '10px 0 8px', border: '1px solid var(--border)' }}>
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
                    {badge !== undefined && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--badge-radius)', lineHeight: 1.5, background: tab === t.id ? 'var(--teal-l)' : 'var(--white)', color: tab === t.id ? 'var(--teal)' : 'var(--ink3)' }}>{badge}</span>}
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
              {tab === 'charges'      && isStaff && <JobChargesTab  job={job} shipmentId={id || job.id} isLive={!isMock} onRefresh={refreshJob} />}
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
