import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Banner } from '../components/ui/alert.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Card } from '../components/ui/card.js';
import { complyBadgeVariant } from '../lib/complyPresentation.js';
import { Badge } from '../components/ui/badge.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { CheckboxRow } from '../components/ui/list-item-row.js';
import { Tip } from '../components/ui/tooltip.js';
import { Button } from '../components/ui/button.js';
import { ComplyWizardPage, WizardField } from './ComplyWizardPage.js';
import { useComplyRenewals, useComplyCertificates } from '../hooks/useComply.js';
import type { CompRenewal, CompRenewalStatus } from '@hudumika/types';
import { showAlert } from '../lib/alert.js';
import './ComplyOS.css';

/* ── Constants ─────────────────────────────────────────────────────────────── */

const STATUS_STEPS: { key: CompRenewalStatus; label: string }[] = [
  { key: 'pending_review', label: 'Pending Review' },
  { key: 'approved',       label: 'Approved'       },
  { key: 'submitted',      label: 'Submitted'      },
  { key: 'issued',         label: 'Issued'         },
];

const FILTER_TABS = [
  { key: 'active',         label: 'Active'            },
  { key: 'pending_review', label: 'Awaiting Approval' },
  { key: 'approved',       label: 'Approved'          },
  { key: 'submitted',      label: 'Submitted'         },
  { key: 'issued',         label: 'Completed'         },
  { key: 'failed',         label: 'Failed'            },
] as const;

const WORKFLOW_WIZARD_STEPS = [
  'Certificate & Agency',
  'Compliance Verification',
  'Review & Decision',
];

const NEW_WORKFLOW_STEPS = [
  'Select Certificate',
  'Readiness Checklist',
  'Confirm & Start',
];

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function stepIndex(status: CompRenewalStatus): number {
  return STATUS_STEPS.findIndex(s => s.key === status);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function TriggerBadge({ trigger }: { trigger: 'automatic' | 'manual' }) {
  return trigger === 'automatic'
    ? <Badge variant={complyBadgeVariant('comply-badge comply-badge--ai')}>Auto</Badge>
    : <Badge variant={complyBadgeVariant('comply-badge comply-badge--pending')}>Manual</Badge>;
}

function StatusBadge({ status }: { status: CompRenewalStatus }) {
  const cfg: Record<CompRenewalStatus, { cls: string; label: string }> = {
    pending_review: { cls: 'comply-badge--review',  label: 'Pending Review' },
    approved:       { cls: 'comply-badge--active',  label: 'Approved'       },
    submitted:      { cls: 'comply-badge--pending', label: 'Submitted'      },
    issued:         { cls: 'comply-badge--issued',  label: 'Issued'         },
    failed:         { cls: 'comply-badge--expired', label: 'Failed'         },
    cancelled:      { cls: 'comply-badge--draft',   label: 'Cancelled'      },
  };
  const { cls, label } = cfg[status] ?? { cls: 'comply-badge--draft', label: status };
  return <Badge variant={complyBadgeVariant(`comply-badge ${cls}`)}>{label}</Badge>;
}

/* ── Dot stepper ─────────────────────────────────────────────────────────────── */

function WorkflowStepper({ status }: { status: CompRenewalStatus }) {
  const current = stepIndex(status);
  const currentStepNumber = current >= 0 ? current + 1 : 0;
  return (
    <div className="wf-stepper-wrap">
      <div className="wf-stepper">
        {STATUS_STEPS.map((step, idx) => (
          <React.Fragment key={step.key}>
            {idx > 0 && (
              <div className={`wf-conn${idx <= current ? ' wf-conn--done' : ''}`} />
            )}
            <Tip label={step.label}>
              <div
                className={[
                  'wf-dot',
                  idx < current   ? ' wf-dot--done'   : '',
                  idx === current ? ' wf-dot--active' : '',
                ].join('')}
              />
            </Tip>
          </React.Fragment>
        ))}
      </div>
      <span className="wf-stepper-meta">
        {currentStepNumber > 0 ? `Step ${currentStepNumber} of ${STATUS_STEPS.length}` : 'Stopped'}
      </span>
    </div>
  );
}

/* ── List Page Component ────────────────────────────────────────────────────── */

export function ComplyWorkflows() {
  const navigate = useNavigate();
  const { renewals, loading, error, refresh } = useComplyRenewals();
  const [tab,    setTab]    = useState<string>('active');
  const [search, setSearch] = useState<string>('');

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      active: renewals.filter(r => ['pending_review', 'approved', 'submitted'].includes(r.status)).length,
      pending_review: renewals.filter(r => r.status === 'pending_review').length,
      approved: renewals.filter(r => r.status === 'approved').length,
      submitted: renewals.filter(r => r.status === 'submitted').length,
      issued: renewals.filter(r => r.status === 'issued').length,
      failed: renewals.filter(r => r.status === 'failed').length,
    };
    return counts;
  }, [renewals]);

  const rows = useMemo(() => {
    const byTab = tab === 'active'
      ? renewals.filter(r => ['pending_review', 'approved', 'submitted'].includes(r.status))
      : renewals.filter(r => r.status === tab);

    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(r =>
      (r.cert_name ?? '').toLowerCase().includes(q) ||
      (r.agency_code ?? '').toLowerCase().includes(q) ||
      (r.status ?? '').toLowerCase().includes(q)
    );
  }, [renewals, tab, search]);

  function openWorkflowWizard(r: CompRenewal, targetStep?: number) {
    const qs = typeof targetStep === 'number' ? `?step=${targetStep}` : '';
    navigate(`/complyos/workflows/${r.id}${qs}`);
  }

  const pendingCount = tabCounts.pending_review ?? 0;

  return (
    <div className="comply-page">

      {/* ── Header ── */}
      <PageHeader
        crumbs={['ComplyOS', 'Renewal Workflows']}
        titlePlain="Renewal"
        titleEm="workflows"
        subtitle="Certificate renewal automation — review, approve and track submissions."
        actions={
          <div className="comply-action-row">
            <Button type="button" variant="outline" size="sm" onClick={refresh}>
              <Icon name="refresh" size={14} />
              Refresh
            </Button>
            <Button type="button" size="sm" onClick={() => navigate('/complyos/workflows/new')}>
              <Icon name="plus" size={14} />
              Start Renewal
            </Button>
          </div>
        }
      />

      {/* ── KPIs ── */}
      <MetricsRow
        cards={[
          {
            title: 'Total Workflows',
            value: String(renewals.length),
            icon: 'fileText',
            barHighlight: 'var(--teal)',
            sub1Label: 'Tracked',
            sub1Value: `${tabCounts.active ?? 0} active in pipeline`,
          },
          {
            title: 'Awaiting Approval',
            value: String(pendingCount),
            icon: 'clock',
            barHighlight: pendingCount > 0 ? 'var(--gold)' : 'var(--teal)',
            sub1Label: 'Review Queue',
            sub1Value: pendingCount > 0 ? 'Needs sign-off' : 'All clear',
          },
          {
            title: 'Auto-Triggered',
            value: String(renewals.filter(r => r.trigger === 'automatic').length),
            icon: 'zap',
            barHighlight: 'var(--blue)',
            sub1Label: 'Automation',
            sub1Value: 'Expiry rules',
          },
          {
            title: 'Issued',
            value: String(tabCounts.issued ?? 0),
            icon: 'checkCircle',
            barHighlight: 'var(--green)',
            sub1Label: 'Completed',
            sub1Value: 'Certificates renewed',
          },
        ]}
      />

      {/* ── Main card ── */}
      <Card className="comply-card">

        {/* Toolbar: filter tabs on left, search input on right */}
        <div className="wf-toolbar">
          <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)}>
            <TabsList className="wf-tabs-list">
              {FILTER_TABS.map(t => {
                const isActive = tab === t.key;
                const count = tabCounts[t.key] ?? 0;
                return (
                  <TabsTrigger key={t.key} value={t.key}>
                    <span>{t.label}</span>
                    {count > 0 && (
                      <span
                        className="wf-tab-badge"
                        data-active={isActive ? 'true' : 'false'}
                      >
                        {count}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          <div className="wf-toolbar-search">
            <Icon name="search" size={14} className="wf-toolbar-search-icon" />
            <Input
              type="search"
              placeholder="Search certificate or agency…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="wf-toolbar-search-input"
            />
          </div>
        </div>

        {/* Column headers (5 columns matching .wf-row) */}
        {!loading && !error && rows.length > 0 && (
          <div className="wf-thead">
            <span>Agency</span>
            <span>Certificate</span>
            <span>Progress</span>
            <span>Status</span>
            <span className="wf-thead-actions">Actions</span>
          </div>
        )}

        {loading && (
          <div className="wf-card-padded">
            <SectionLoading label="Loading workflows…" />
          </div>
        )}

        {error && (
          <div className="wf-card-pad-sm">
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        {!loading && !error && (
          <div className="wf-rows">
            {rows.length === 0 ? (
              <div className="wf-empty-state">
                <FeaturedIcon variant="gray" size="lg" shape="circle">
                  <Icon name="inbox" size={20} />
                </FeaturedIcon>
                <div className="wf-empty-title">No workflows found</div>
                <div className="wf-empty-sub">
                  {search.trim()
                    ? 'No workflows match your search query.'
                    : tab === 'active'
                    ? 'No active renewal workflows. Renewals start automatically when certificates are near expiry.'
                    : 'No workflows match this filter.'}
                </div>
              </div>
            ) : rows.map(r => (
              <div
                key={r.id}
                className={`wf-row wf-row--${r.status}`}
                onClick={() => openWorkflowWizard(r)}
              >
                {/* Col 1: Agency + trigger */}
                <div className="wf-row-agency">
                  <Badge variant={complyBadgeVariant('comply-agency comply-agency--gov')}>
                    {r.agency_code}
                  </Badge>
                  <TriggerBadge trigger={r.trigger} />
                </div>

                {/* Col 2: Certificate Name + date */}
                <div className="wf-row-body">
                  <div className="wf-row-name" title={r.cert_name}>{r.cert_name}</div>
                  <div className="wf-row-date">Started {fmtDate(r.triggered_at)}</div>
                </div>

                {/* Col 3: Step dots + label */}
                <WorkflowStepper status={r.status as CompRenewalStatus} />

                {/* Col 4: Status badge */}
                <div className="wf-row-status">
                  <StatusBadge status={r.status as CompRenewalStatus} />
                </div>

                {/* Col 5: Actions */}
                <div className="wf-row-actions" onClick={e => e.stopPropagation()}>
                  {r.status === 'pending_review' && (
                    <Button
                      type="button"
                      size="xs"
                      title="Open approval wizard"
                      onClick={() => openWorkflowWizard(r)}
                      className="wf-approve-btn"
                    >
                      <Icon name="check" size={12} />
                      <span>Approve</span>
                    </Button>
                  )}
                  <Tip label="Open renewal workflow">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      aria-label="Open renewal workflow"
                      onClick={() => openWorkflowWizard(r)}
                      className="wf-view-btn"
                    >
                      <Icon name="eye" size={13} />
                    </Button>
                  </Tip>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── Full-Page Multi-Step Wizard for Reviewing & Approving a Renewal Workflow ─ */

export { RenewalWorkflowWizardPage as ComplyRenewalPage };

export function RenewalWorkflowWizardPage() {
  const { renewalId } = useParams<{ renewalId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { renewals, loading, approveRenewal } = useComplyRenewals();
  const { certs } = useComplyCertificates();

  const initialStep = Math.max(0, Math.min(2, Number(searchParams.get('step') ?? 0) || 0));
  const [step, setStep] = useState<number>(initialStep);
  const [approving, setApproving] = useState(false);

  // Step 2 interactive verification state
  const [checkStanding, setCheckStanding] = useState(true);
  const [checkDocs,     setCheckDocs]     = useState(true);
  const [checkFee,      setCheckFee]      = useState(true);
  const [filingChannel, setFilingChannel] = useState('portal');
  const [priority,      setPriority]      = useState('standard');
  const [reviewNotes,   setReviewNotes]   = useState('');

  const renewal = useMemo(
    () => renewals.find(r => r.id === renewalId) ?? null,
    [renewals, renewalId]
  );

  const linkedCert = useMemo(
    () => (renewal ? certs.find(c => c.id === renewal.cert_id) ?? null : null),
    [certs, renewal]
  );

  useEffect(() => {
    if (renewal?.notes) {
      setReviewNotes(renewal.notes);
    }
  }, [renewal?.id, renewal?.notes]);

  async function handleFinish() {
    if (!renewal) return;
    if (renewal.status === 'pending_review') {
      try {
        setApproving(true);
        await approveRenewal(renewal.id);
        navigate('/complyos/workflows');
      } catch (e: any) {
        showAlert(e.message);
      } finally {
        setApproving(false);
      }
    } else {
      navigate('/complyos/workflows');
    }
  }

  if (loading && !renewal) {
    return (
      <div className="comply-page">
        <PageHeader
          crumbs={['ComplyOS', 'Renewal Workflows']}
          titlePlain="Renewal"
          titleEm="workflow"
          backTo="/complyos/workflows"
          backLabel="Back to workflows"
        />
        <Card className="comply-card wf-card-padded">
          <SectionLoading label="Loading renewal workflow…" />
        </Card>
      </div>
    );
  }

  if (!loading && !renewal) {
    return (
      <div className="comply-page">
        <PageHeader
          crumbs={['ComplyOS', 'Renewal Workflows']}
          titlePlain="Renewal"
          titleEm="workflow"
          subtitle="Review and approve certificate renewal workflows."
          backTo="/complyos/workflows"
          backLabel="Back to workflows"
        />
        <Banner variant="error">
          Renewal workflow not found. Return to the workflows list to select a valid workflow.
        </Banner>
      </div>
    );
  }

  const isPendingReview = renewal?.status === 'pending_review';
  const allChecksPassed = checkStanding && checkDocs && checkFee;

  const nextLabel =
    step < WORKFLOW_WIZARD_STEPS.length - 1
      ? 'Continue'
      : isPendingReview
      ? 'Approve & Advance Workflow'
      : 'Done — Back to Workflows';

  return (
    <ComplyWizardPage
      title={renewal?.cert_name ?? 'Renewal Workflow'}
      subtitle={
        renewal
          ? `${renewal.agency_code} · ${renewal.trigger === 'automatic' ? 'Auto-Triggered' : 'Manual Trigger'} · Started ${fmtDate(renewal.triggered_at)}`
          : undefined
      }
      steps={WORKFLOW_WIZARD_STEPS}
      step={step}
      backTo="/complyos/workflows"
      onBack={() => setStep(s => Math.max(0, s - 1))}
      busy={approving}
      nextDisabled={step === 1 && isPendingReview && !allChecksPassed}
      nextLabel={nextLabel}
      onNext={() => {
        if (step < WORKFLOW_WIZARD_STEPS.length - 1) {
          setStep(s => s + 1);
        } else {
          handleFinish();
        }
      }}
    >
      {/* ── STEP 1: Certificate & Agency Overview ── */}
      {step === 0 && renewal && (
        <div className="wf-wizard-step">
          <div className="wf-wizard-header-strip">
            <div className="wf-review-badges">
              <Badge variant={complyBadgeVariant('comply-agency comply-agency--gov')}>
                {renewal.agency_code}
              </Badge>
              <TriggerBadge trigger={renewal.trigger} />
              <StatusBadge status={renewal.status as CompRenewalStatus} />
            </div>
            <span className="wf-meta-hint">
              Workflow ID: <code>{renewal.id.slice(0, 8)}</code>
            </span>
          </div>

          {/* Metadata summary grid */}
          <div>
            <div className="wf-meta-title">Certificate & Filing Summary</div>
            <div className="comply-meta-grid">
              <div>
                <div className="comply-meta-key">Certificate Name</div>
                <div className="comply-meta-val">{renewal.cert_name}</div>
              </div>
              <div>
                <div className="comply-meta-key">Regulatory Agency</div>
                <div className="comply-meta-val">{linkedCert?.agency_name || renewal.agency_code}</div>
              </div>
              <div>
                <div className="comply-meta-key">Certificate Number</div>
                <div className="comply-meta-val wf-mono">{linkedCert?.cert_number || '—'}</div>
              </div>
              <div>
                <div className="comply-meta-key">Current Expiry Date</div>
                <div className="comply-meta-val">{fmtDate(linkedCert?.expiry_date)}</div>
              </div>
              <div>
                <div className="comply-meta-key">Workflow Triggered</div>
                <div className="comply-meta-val">{fmtDate(renewal.triggered_at)}</div>
              </div>
              <div>
                <div className="comply-meta-key">Entity / Customer</div>
                <div className="comply-meta-val">{linkedCert?.customer_name || 'Primary Workspace Entity'}</div>
              </div>
            </div>
          </div>

          {linkedCert?.non_renewal_risk && (
            <Banner variant="warning">
              <strong>Non-Renewal Operational Risk:</strong> {linkedCert.non_renewal_risk}
            </Banner>
          )}

          {/* 4-Stage Workflow Progress Timeline */}
          <div>
            <div className="wf-meta-title">Renewal Pipeline Progress</div>
            <div className="wf-tl">
              {STATUS_STEPS.map((st, idx) => {
                const cur    = stepIndex(renewal.status as CompRenewalStatus);
                const done   = idx <= cur;
                const active = idx === cur;
                return (
                  <div
                    key={st.key}
                    className={`wf-tl-row${done ? ' wf-tl-row--done' : ''}${active ? ' wf-tl-row--active' : ''}`}
                  >
                    <div className="wf-tl-node">
                      {done
                        ? <Icon name="check" size={11} />
                        : <span className="wf-tl-num">{idx + 1}</span>
                      }
                    </div>
                    <div className="wf-tl-content">
                      <div className="wf-tl-label">{st.label}</div>
                      {active && <div className="wf-tl-sub">Current stage</div>}
                      {!done && !active && <div className="wf-tl-sub">Upcoming stage</div>}
                      {done && !active && <div className="wf-tl-sub">Completed</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Compliance Verification & Filing Parameters ── */}
      {step === 1 && renewal && (
        <div className="wf-wizard-step">
          <div>
            <div className="wf-meta-title">Pre-Submission Verification Checklist</div>
            <div className="wf-checklist-box">
              <CheckboxRow
                title="Entity & TIN standing verified"
                description={`Confirm company registration and tax identification records match ${renewal.agency_code} registry requirements.`}
                checked={checkStanding}
                onCheckedChange={setCheckStanding}
              />
              <CheckboxRow
                title="Prerequisite statutory documents complete"
                description="Verify prior certificate copy, inspection clearances, and supporting schedules are attached or in the Vault."
                checked={checkDocs}
                onCheckedChange={setCheckDocs}
              />
              <CheckboxRow
                title="Statutory renewal fee & budget confirmed"
                description="Confirm renewal fee assessment and payment allocation are ready for agency lodgement."
                checked={checkFee}
                onCheckedChange={setCheckFee}
              />
            </div>
            {isPendingReview && !allChecksPassed && (
              <p className="wf-check-warning">
                Complete all three verification checks above to proceed to approval sign-off.
              </p>
            )}
          </div>

          <div className="comply-grid-2">
            <WizardField label="Submission Channel">
              <Select value={filingChannel} onValueChange={setFilingChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portal">Online Agency Portal ({renewal.agency_code} e-Filing)</SelectItem>
                  <SelectItem value="api">Direct API Sync</SelectItem>
                  <SelectItem value="agent">Authorized Clearing / Legal Agent</SelectItem>
                </SelectContent>
              </Select>
            </WizardField>

            <WizardField label="Processing Priority">
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard Statutory Window</SelectItem>
                  <SelectItem value="expedited">Expedited — Expiring Within 14 Days</SelectItem>
                  <SelectItem value="critical">Urgent — High Operational Risk</SelectItem>
                </SelectContent>
              </Select>
            </WizardField>
          </div>

          <WizardField label="Reviewer & Filing Notes">
            <Textarea
              rows={4}
              placeholder="Add internal review notes, control number references, or instructions for agency submission…"
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
            />
          </WizardField>
        </div>
      )}

      {/* ── STEP 3: Final Review & Approval Sign-off ── */}
      {step === 2 && renewal && (
        <div className="wf-wizard-step">
          {isPendingReview ? (
            <Banner variant="brand" icon="shield">
              <strong>Ready for Approval:</strong> Approving this workflow authorizes the renewal submission for{' '}
              <strong>{renewal.cert_name}</strong> with <strong>{renewal.agency_code}</strong> and records your sign-off in the compliance audit log.
            </Banner>
          ) : (
            <Banner variant="info" icon="checkCircle">
              This workflow is currently in <strong>{renewal.status.replace('_', ' ')}</strong> status.
            </Banner>
          )}

          <div>
            <div className="wf-meta-title">Approval & Audit Record</div>
            <div className="wf-meta-grid">
              <div className="wf-meta-row">
                <span className="wf-meta-key">Certificate</span>
                <span className="wf-meta-val">{renewal.cert_name}</span>
              </div>
              <div className="wf-meta-row">
                <span className="wf-meta-key">Agency & Trigger</span>
                <span className="wf-meta-val wf-inline-avatar">
                  <Badge variant={complyBadgeVariant('comply-agency comply-agency--gov')}>{renewal.agency_code}</Badge>
                  <TriggerBadge trigger={renewal.trigger} />
                </span>
              </div>
              <div className="wf-meta-row">
                <span className="wf-meta-key">Verification Checklist</span>
                <span className="wf-meta-val">
                  <Badge variant={allChecksPassed ? 'success' : 'warning'}>
                    {allChecksPassed ? '3 of 3 Verified' : 'Incomplete'}
                  </Badge>
                </span>
              </div>
              <div className="wf-meta-row">
                <span className="wf-meta-key">Submission Channel</span>
                <span className="wf-meta-val">
                  {filingChannel === 'portal'
                    ? `${renewal.agency_code} Online Portal`
                    : filingChannel === 'api'
                    ? 'Direct API Sync'
                    : 'Authorized Agent'}
                </span>
              </div>
              <div className="wf-meta-row">
                <span className="wf-meta-key">Triggered Date</span>
                <span className="wf-meta-val">{fmtDate(renewal.triggered_at)}</span>
              </div>
              <div className="wf-meta-row">
                <span className="wf-meta-key">Approved By</span>
                <span className="wf-meta-val">
                  {renewal.approved_by ? (
                    <span className="wf-inline-avatar">
                      <PersonAvatar userId={renewal.approved_by} name={renewal.approved_by_name ?? ''} size={20} />
                      {renewal.approved_by_name ?? renewal.approved_by}
                    </span>
                  ) : (
                    'Pending your approval'
                  )}
                </span>
              </div>
              <div className="wf-meta-row">
                <span className="wf-meta-key">Approved At</span>
                <span className="wf-meta-val">{fmtDate(renewal.approved_at)}</span>
              </div>
              <div className="wf-meta-row">
                <span className="wf-meta-key">Submitted At</span>
                <span className="wf-meta-val">{fmtDate(renewal.submitted_at)}</span>
              </div>
              <div className="wf-meta-row">
                <span className="wf-meta-key">Completed At</span>
                <span className="wf-meta-val">{fmtDate(renewal.completed_at)}</span>
              </div>
            </div>

            {reviewNotes.trim() && (
              <div className="wf-notes">
                <div className="wf-notes-label">Reviewer Notes</div>
                {reviewNotes}
              </div>
            )}
          </div>
        </div>
      )}
    </ComplyWizardPage>
  );
}

/* ── Full-Page Multi-Step Wizard for Starting a New Renewal Workflow ──────── */

export function NewRenewalWorkflowWizardPage() {
  const navigate = useNavigate();
  const { certs, loading: certsLoading } = useComplyCertificates();
  const { startRenewal } = useComplyRenewals();

  const [step,       setStep]       = useState(0);
  const [certId,     setCertId]     = useState<string>('');
  const [verifyDocs, setVerifyDocs] = useState(true);
  const [verifyFees, setVerifyFees] = useState(true);
  const [notes,      setNotes]      = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedCert = useMemo(
    () => certs.find(c => c.id === certId) ?? null,
    [certs, certId]
  );

  async function handleStart() {
    if (!certId) return;
    try {
      setSubmitting(true);
      await startRenewal(certId);
      navigate('/complyos/workflows');
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ComplyWizardPage
      title="Start Certificate Renewal"
      subtitle="Initiate a tracked multi-stage renewal workflow for an existing Vault certificate."
      steps={NEW_WORKFLOW_STEPS}
      step={step}
      backTo="/complyos/workflows"
      onBack={() => setStep(s => Math.max(0, s - 1))}
      busy={submitting || certsLoading}
      nextDisabled={(step === 0 && !certId) || (step === 1 && (!verifyDocs || !verifyFees))}
      nextLabel={step === NEW_WORKFLOW_STEPS.length - 1 ? 'Start Renewal Workflow' : 'Continue'}
      onNext={() => {
        if (step < NEW_WORKFLOW_STEPS.length - 1) setStep(s => s + 1);
        else handleStart();
      }}
    >
      {step === 0 && (
        <div className="wf-wizard-step">
          <WizardField label="Certificate to Renew *">
            <Select value={certId || '__none__'} onValueChange={v => setCertId(v === '__none__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a certificate from the Vault…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select a certificate…</SelectItem>
                {certs.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.agency_code}) — Exp: {fmtDate(c.expiry_date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </WizardField>

          {selectedCert && (
            <div className="comply-meta-grid">
              <div>
                <div className="comply-meta-key">Certificate Name</div>
                <div className="comply-meta-val">{selectedCert.name}</div>
              </div>
              <div>
                <div className="comply-meta-key">Agency</div>
                <div className="comply-meta-val">{selectedCert.agency_code}</div>
              </div>
              <div>
                <div className="comply-meta-key">Certificate Number</div>
                <div className="comply-meta-val wf-mono">{selectedCert.cert_number || '—'}</div>
              </div>
              <div>
                <div className="comply-meta-key">Expiry Date</div>
                <div className="comply-meta-val">{fmtDate(selectedCert.expiry_date)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="wf-wizard-step">
          <div className="wf-checklist-box">
            <CheckboxRow
              title="Current certificate & supporting schedules verified"
              description="Confirm existing certificate record and required attachments are up to date."
              checked={verifyDocs}
              onCheckedChange={setVerifyDocs}
            />
            <CheckboxRow
              title="Renewal fee requirement acknowledged"
              description="Confirm the workflow should enter the Pending Review queue for sign-off."
              checked={verifyFees}
              onCheckedChange={setVerifyFees}
            />
          </div>

          <WizardField label="Renewal Instructions / Notes (optional)">
            <Textarea
              rows={3}
              placeholder="Add any context for the compliance approver…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </WizardField>
        </div>
      )}

      {step === 2 && selectedCert && (
        <div className="wf-wizard-step">
          <Banner variant="brand" icon="zap">
            Confirming below will create a new renewal workflow for <strong>{selectedCert.name}</strong> and place it in the <strong>Pending Review</strong> stage.
          </Banner>
          <div className="wf-meta-grid">
            <div className="wf-meta-row">
              <span className="wf-meta-key">Certificate</span>
              <span className="wf-meta-val">{selectedCert.name}</span>
            </div>
            <div className="wf-meta-row">
              <span className="wf-meta-key">Agency</span>
              <span className="wf-meta-val">{selectedCert.agency_code}</span>
            </div>
            <div className="wf-meta-row">
              <span className="wf-meta-key">Expiry Date</span>
              <span className="wf-meta-val">{fmtDate(selectedCert.expiry_date)}</span>
            </div>
            <div className="wf-meta-row">
              <span className="wf-meta-key">Trigger Mode</span>
              <span className="wf-meta-val"><TriggerBadge trigger="manual" /></span>
            </div>
          </div>
        </div>
      )}
    </ComplyWizardPage>
  );
}
