import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';
import { useComplyRenewals } from '../hooks/useComply.js';
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
  { key: 'active',         label: 'Active'           },
  { key: 'pending_review', label: 'Awaiting Approval'},
  { key: 'approved',       label: 'Approved'         },
  { key: 'submitted',      label: 'Submitted'        },
  { key: 'issued',         label: 'Completed'        },
  { key: 'failed',         label: 'Failed'           },
] as const;

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function stepIndex(status: CompRenewalStatus): number {
  return STATUS_STEPS.findIndex(s => s.key === status);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function TriggerBadge({ trigger }: { trigger: 'automatic' | 'manual' }) {
  return trigger === 'automatic'
    ? <span className="comply-badge comply-badge--ai">Auto</span>
    : <span className="comply-badge comply-badge--pending">Manual</span>;
}

function StatusBadge({ status }: { status: CompRenewalStatus }) {
  const cfg: Record<CompRenewalStatus, { cls: string; label: string }> = {
    pending_review: { cls: 'comply-badge--review',   label: 'Pending Review' },
    approved:       { cls: 'comply-badge--active',   label: 'Approved'       },
    submitted:      { cls: 'comply-badge--pending',  label: 'Submitted'      },
    issued:         { cls: 'comply-badge--issued',   label: 'Issued'         },
    failed:         { cls: 'comply-badge--expired',  label: 'Failed'         },
    cancelled:      { cls: 'comply-badge--draft',    label: 'Cancelled'      },
  };
  const { cls, label } = cfg[status];
  return <span className={`comply-badge ${cls}`}>{label}</span>;
}

/* ── Dot stepper ─────────────────────────────────────────────────────────────── */

function WorkflowStepper({ status }: { status: CompRenewalStatus }) {
  const current = stepIndex(status);
  return (
    <div className="wf-stepper">
      {STATUS_STEPS.map((step, idx) => (
        <React.Fragment key={step.key}>
          {idx > 0 && (
            <div className={`wf-conn${idx <= current ? ' wf-conn--done' : ''}`} />
          )}
          <div
            title={step.label}
            className={[
              'wf-dot',
              idx < current  ? ' wf-dot--done'   : '',
              idx === current ? ' wf-dot--active' : '',
            ].join('')}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── Component ───────────────────────────────────────────────────────────────── */

export function ComplyWorkflows() {
  const { renewals, loading, error, refresh, approveRenewal } = useComplyRenewals();
  const [tab,        setTab]        = useState<string>('active');
  const [selected,   setSelected]   = useState<CompRenewal | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [approving,  setApproving]  = useState(false);

  function filtered(): CompRenewal[] {
    if (tab === 'active') return renewals.filter(r => ['pending_review','approved','submitted'].includes(r.status));
    return renewals.filter(r => r.status === tab);
  }

  function openDetail(r: CompRenewal) { setSelected(r); setDrawerOpen(true); }
  function closeDrawer() { setDrawerOpen(false); setSelected(null); }

  async function handleApprove(id: string) {
    try {
      setApproving(true);
      await approveRenewal(id);
      closeDrawer();
    } catch (e: any) { showAlert(e.message); }
    finally { setApproving(false); }
  }

  const pendingCount = renewals.filter(r => r.status === 'pending_review').length;
  const rows = filtered();

  return (
    <div className="comply-page">

      {/* ── Header ── */}
      <div className="comply-page-hdr">
        <div>
          <h1 className="comply-page-hdr-title">Renewal Workflows</h1>
          <p className="comply-page-hdr-sub">
            Certificate renewal automation — review, approve and track submissions.
          </p>
        </div>
        <div className="comply-action-row">
          <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={refresh} title="Refresh">
            <Icon name="refresh" size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="comply-kpis">
        <div className="comply-kpi">
          <div className="wf-kpi-icon wf-kpi-icon--neutral"><Icon name="list" size={14} /></div>
          <div className="comply-kpi-val">{renewals.length}</div>
          <div className="comply-kpi-label">Total Workflows</div>
        </div>
        <div className="comply-kpi">
          <div className="wf-kpi-icon wf-kpi-icon--warn"><Icon name="clock" size={14} /></div>
          <div className={`comply-kpi-val${pendingCount > 0 ? ' comply-kpi-delta--warn' : ''}`}>{pendingCount}</div>
          <div className="comply-kpi-label">Awaiting Approval</div>
        </div>
        <div className="comply-kpi">
          <div className="wf-kpi-icon wf-kpi-icon--ai"><Icon name="zap" size={14} /></div>
          <div className="comply-kpi-val">{renewals.filter(r => r.trigger === 'automatic').length}</div>
          <div className="comply-kpi-label">Auto-Triggered</div>
        </div>
        <div className="comply-kpi">
          <div className="wf-kpi-icon wf-kpi-icon--success"><Icon name="checkCircle" size={14} /></div>
          <div className="comply-kpi-val comply-kpi-delta--up">{renewals.filter(r => r.status === 'issued').length}</div>
          <div className="comply-kpi-label">Issued</div>
        </div>
      </div>

      {/* ── Main card ── */}
      <div className="comply-card">

        {/* Filter tabs */}
        <div className="wf-filter-bar">
          {FILTER_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              className={`wf-tab${tab === t.key ? ' wf-tab--active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key === 'active' && pendingCount > 0 && (
                <span className="wf-tab-count">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Column headers */}
        {!loading && !error && rows.length > 0 && (
          <div className="wf-thead">
            <span />
            <span>Agency</span>
            <span>Certificate</span>
            <span>Progress</span>
            <span>Status</span>
            <span />
          </div>
        )}

        {loading && (
          <div className="wf-loading">
            <div className="wf-spinner" />
            Loading workflows…
          </div>
        )}
        {error && <div className="comply-note comply-note--error">{error}</div>}

        {!loading && !error && (
          <div className="wf-rows">
            {rows.length === 0 ? (
              <div className="wf-empty-state">
                <div className="wf-empty-icon"><Icon name="inbox" size={22} /></div>
                <div className="wf-empty-title">No workflows here</div>
                <div className="wf-empty-sub">
                  {tab === 'active'
                    ? 'No active renewal workflows. Renewals start automatically when certificates are near expiry.'
                    : 'No workflows match this filter.'}
                </div>
              </div>
            ) : rows.map(r => (
              <div
                key={r.id}
                className={`wf-row wf-row--${r.status}`}
                onClick={() => openDetail(r)}
              >
                {/* Agency + trigger */}
                <div className="wf-row-agency">
                  <span className="comply-agency comply-agency--gov">{r.agency_code}</span>
                  <TriggerBadge trigger={r.trigger} />
                </div>

                {/* Name + date */}
                <div className="wf-row-body">
                  <div className="wf-row-name" title={r.cert_name}>{r.cert_name}</div>
                  <div className="wf-row-date">Started {fmtDate(r.triggered_at)}</div>
                </div>

                {/* Step dots */}
                <WorkflowStepper status={r.status as CompRenewalStatus} />

                {/* Status badge */}
                <div className="wf-row-status">
                  <StatusBadge status={r.status as CompRenewalStatus} />
                </div>

                {/* Actions */}
                <div className="wf-row-actions" onClick={e => e.stopPropagation()}>
                  {r.status === 'pending_review' && (
                    <button
                      type="button"
                      className="comply-btn-primary comply-btn-sm"
                      title="Approve renewal"
                      disabled={approving}
                      onClick={() => handleApprove(r.id)}
                    >
                      Approve
                    </button>
                  )}
                  <button
                    type="button"
                    className="comply-btn-secondary comply-btn-sm"
                    title="View details"
                    onClick={() => openDetail(r)}
                  >
                    <Icon name="eye" size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Detail drawer ── */}
      {drawerOpen && selected && (
        <>
          <div className="comply-overlay comply-overlay--end" onClick={closeDrawer} aria-hidden="true" />
          <div className="comply-drawer">

            {/* Drawer header */}
            <div className="wf-drawer-hdr">
              <div className="wf-drawer-hdr-top">
                <div className={`wf-drawer-stripe wf-drawer-stripe--${selected.status}`} />
                <div className="wf-drawer-hdr-body">
                  <div className="wf-drawer-title">{selected.cert_name}</div>
                  <div className="wf-drawer-sub">
                    <span className="comply-agency comply-agency--gov">{selected.agency_code}</span>
                    <TriggerBadge trigger={selected.trigger} />
                    <StatusBadge status={selected.status as CompRenewalStatus} />
                  </div>
                </div>
                <button type="button" className="comply-close-btn" title="Close" onClick={closeDrawer}>
                  <Icon name="x" size={16} />
                </button>
              </div>
            </div>

            {/* Drawer body */}
            <div className="comply-panel-body">

              {/* Meta */}
              <div className="wf-meta-section">
                <div className="wf-meta-title">Details</div>
                <div className="wf-meta-grid">
                  <div className="wf-meta-row">
                    <span className="wf-meta-key">Triggered</span>
                    <span className="wf-meta-val">{fmtDate(selected.triggered_at)}</span>
                  </div>
                  <div className="wf-meta-row">
                    <span className="wf-meta-key">Approved by</span>
                    <span className="wf-meta-val">{selected.approved_by ?? '—'}</span>
                  </div>
                  <div className="wf-meta-row">
                    <span className="wf-meta-key">Approved at</span>
                    <span className="wf-meta-val">{fmtDate(selected.approved_at)}</span>
                  </div>
                  <div className="wf-meta-row">
                    <span className="wf-meta-key">Submitted at</span>
                    <span className="wf-meta-val">{fmtDate(selected.submitted_at)}</span>
                  </div>
                  <div className="wf-meta-row">
                    <span className="wf-meta-key">Completed</span>
                    <span className="wf-meta-val">{fmtDate(selected.completed_at)}</span>
                  </div>
                </div>
                {selected.notes && (
                  <div className="wf-notes">{selected.notes}</div>
                )}
              </div>

              {/* Timeline */}
              <div>
                <div className="wf-meta-title">Workflow Progress</div>
                <div className="wf-tl">
                  {STATUS_STEPS.map((step, idx) => {
                    const cur   = stepIndex(selected.status as CompRenewalStatus);
                    const done  = idx <= cur;
                    const active = idx === cur;
                    return (
                      <div key={step.key} className={`wf-tl-row${done ? ' wf-tl-row--done' : ''}${active ? ' wf-tl-row--active' : ''}`}>
                        <div className="wf-tl-node">
                          {done
                            ? <Icon name="check" size={11} color="#fff" />
                            : <span className="wf-tl-num">{idx + 1}</span>
                          }
                        </div>
                        <div className="wf-tl-content">
                          <div className="wf-tl-label">{step.label}</div>
                          {active && <div className="wf-tl-sub">Current step</div>}
                          {!done && !active && <div className="wf-tl-sub">Pending</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Footer */}
            {selected.status === 'pending_review' && (
              <div className="comply-panel-foot">
                <button type="button" className="comply-btn-secondary" onClick={closeDrawer}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="comply-btn-primary"
                  disabled={approving}
                  onClick={() => handleApprove(selected.id)}
                >
                  {approving ? 'Approving…' : 'Approve Renewal'}
                </button>
              </div>
            )}

          </div>
        </>
      )}

    </div>
  );
}
