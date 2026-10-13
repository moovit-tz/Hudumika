import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import type { WorkflowStudioRunReview } from '@hudumika/types';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.js';
import { Banner } from '../../components/ui/alert.js';
import { Badge } from '../../components/ui/badge.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { SectionLoading, ButtonSpinner } from '../../components/ui/spinner.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import './studio.css';

const RUN_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  SUCCESS: 'success',
  PARTIAL: 'warning',
  FAILED: 'error',
  RUNNING: 'gray',
  SIMULATED: 'info',
};

export function RunReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [run, setRun] = useState<WorkflowStudioRunReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [evidence, setEvidence] = useState('');
  const [outcome, setOutcome] = useState('effects_verified');
  const [confirmed, setConfirmed] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelConfirmed, setCancelConfirmed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRun((await apiFetch(`/v1/workflow-studio/runs/${id}`)).data); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load run'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    setRun(null); setEvidence(''); setConfirmed(false);
    setCancelReason(''); setCancelConfirmed(false); void load();
  }, [load]);

  async function reconcile() {
    setBusy(true); setError('');
    try {
      await apiFetch(`/v1/workflow-studio/runs/${id}/reconcile`, {
        method: 'POST', body: JSON.stringify({ outcome, evidence, confirmed }),
      });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Review failed'); }
    finally { setBusy(false); }
  }

  async function cancel() {
    setBusy(true); setError('');
    try {
      await apiFetch(`/v1/workflow-studio/runs/${id}/cancel`, {
        method: 'POST', body: JSON.stringify({ reason: cancelReason, confirmed: cancelConfirmed }),
      });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Cancellation request failed'); }
    finally { setBusy(false); }
  }

  const eligible = run && ['RUNNING', 'FAILED', 'PARTIAL'].includes(run.status) && !run.reconciliation &&
    (run.status !== 'RUNNING' || Date.now() - new Date(run.created_at).getTime() >= 30 * 60_000);

  return (
    <div className="studio-page">
      <PageHeader
        crumbs={['Studio', 'Runs']}
        titlePlain="Run"
        titleEm="review"
        subtitle="Inspect execution evidence, step checkpoints and record a verified outcome."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/studio/runs')}>
              <Icon name="arrowLeft" size={13} /> All runs
            </Button>
            {run?.workflow_id && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/studio/w/${run.workflow_id}`)}>
                <Icon name="gitBranch" size={13} /> Open workflow
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={loading || busy} onClick={() => void load()}>
              <Icon name="refresh" size={13} /> Refresh
            </Button>
          </div>
        }
      />

      {error && <Banner variant="error" className="mb-3">{error}</Banner>}

      {loading ? (
        <SectionLoading label="Loading run review record…" />
      ) : run ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Main Execution Record Card */}
          <Card>
            <CardHeader style={{ paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Badge variant={RUN_VARIANT[run.status] ?? 'gray'} style={{ fontSize: 12, minWidth: 70, textAlign: 'center' }}>
                    {run.status}
                  </Badge>
                  <CardTitle style={{ fontSize: 16, fontWeight: 700 }}>Execution record</CardTitle>
                </div>
                <span className="studio-run-mono" style={{ fontSize: 12, color: 'var(--ink3)' }}>
                  ID: {run.id}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, padding: '12px 16px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '.4px' }}>Trigger Source</div>
                  <div className="studio-run-mono" style={{ fontSize: 12.5, color: 'var(--ink)', marginTop: 2 }}>{run.trigger_source}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '.4px' }}>Created At</div>
                  <div style={{ fontSize: 12, color: 'var(--ink)', marginTop: 2 }}>{new Date(run.created_at).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '.4px' }}>Event ID</div>
                  <div className="studio-run-mono" style={{ fontSize: 12, color: 'var(--ink)', marginTop: 2 }}>{run.domain_event_id ?? 'None (manual/test)'}</div>
                </div>
              </div>

              {run.error_message && (
                <Banner variant="error" icon="alertCircle">{run.error_message}</Banner>
              )}

              {run.status === 'RUNNING' && (
                <Banner variant="warning" icon="clock">
                  This execution has no final outcome yet. Review becomes available after 30 minutes and does not stop its worker or unblock delivery retry.
                </Banner>
              )}

              {run.status === 'RUNNING' && run.worker_expires_at && (
                <Banner variant={new Date(run.worker_expires_at).getTime() <= Date.now() ? 'warning' : 'info'}>
                  {new Date(run.worker_expires_at).getTime() <= Date.now()
                    ? 'Worker claim expired. Further steps are fenced; verify the current action’s outcome before review.'
                    : 'Worker claim is active. Completed steps are saved as execution proceeds.'}
                </Banner>
              )}

              {run.active_step && (
                <Banner variant="warning">
                  Action started: <strong>{run.active_step.title}</strong>
                  {run.active_step.iteration ? ` · Item ${run.active_step.iteration}` : ''}.
                  Started at {new Date(run.active_step.started_at).toLocaleTimeString()}.
                  Its outcome has not been checkpointed.
                </Banner>
              )}

              {/* Step Results Timeline */}
              <div style={{ marginTop: 14 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Step execution results</h3>
                {!run.step_results.length ? (
                  <div style={{ padding: '16px', background: 'var(--bg)', borderRadius: 'var(--r)', color: 'var(--ink3)', fontSize: 12.5, textAlign: 'center' }}>
                    No final step results were recorded. Verify effects in the affected apps before reviewing.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {run.step_results.map((s, index) => (
                      <div
                        key={`${s.node_id}-${index}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '11px 15px',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--r)',
                          background: 'var(--card-bg, var(--white))',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <Badge variant={s.status === 'FAILED' ? 'error' : s.status === 'SUCCESS' ? 'success' : 'info'} style={{ minWidth: 64, textAlign: 'center' }}>
                            {s.status}
                          </Badge>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                            {s.iteration ? <span className="studio-run-mono">#{s.iteration} </span> : null}
                            {s.title}
                          </span>
                        </div>
                        <span className="studio-run-mono" style={{ fontSize: 11.5, color: 'var(--ink3)', flexShrink: 0 }}>
                          {s.duration_ms}ms
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Cancellation Request Card / Form */}
          {run.cancellation ? (
            <Card>
              <CardHeader style={{ paddingBottom: 10 }}>
                <CardTitle style={{ fontSize: 15, fontWeight: 700 }}>Cancellation request</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <PersonAvatar userId={run.cancellation.actor_id} name={run.cancellation.actor_name} size={30} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{run.cancellation.actor_name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                      Requested {new Date(run.cancellation.requested_at).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div style={{ padding: '10px 14px', background: 'var(--bg)', borderRadius: 'var(--r)', fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {run.cancellation.reason}
                </div>
                <Banner variant={run.cancellation_acknowledged_at ? 'info' : 'warning'}>
                  {run.cancellation_acknowledged_at
                    ? `Worker stopped at a step boundary on ${new Date(run.cancellation_acknowledged_at).toLocaleString()}. Completed effects remain recorded.`
                    : run.status === 'RUNNING'
                    ? 'Awaiting worker acknowledgement. The current action may still be executing; refresh to check progress.'
                    : 'The run finished before observing the request. Inspect its recorded effects.'}
                </Banner>
              </CardContent>
            </Card>
          ) : run.status === 'RUNNING' && user && ['TENANT_ADMIN', 'SUPER_ADMIN'].includes(user.role) && (
            <Card>
              <CardHeader style={{ paddingBottom: 10 }}>
                <CardTitle style={{ fontSize: 15, fontWeight: 700 }}>Request cancellation</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={e => { e.preventDefault(); void cancel(); }}>
                  <Banner variant="warning">
                    The worker stops before its next action. An action already in progress must settle; completed effects are preserved.
                  </Banner>
                  <label htmlFor="cancel-reason" className="studio-field-label">
                    Cancellation reason <span className="studio-req">*</span>
                  </label>
                  <Textarea
                    id="cancel-reason"
                    required
                    minLength={10}
                    maxLength={1000}
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    disabled={busy}
                    placeholder="Explain why this running execution should be halted."
                    rows={3}
                  />
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="cancel-confirm"
                      checked={cancelConfirmed}
                      onCheckedChange={v => setCancelConfirmed(v === true)}
                      disabled={busy}
                    />
                    <label htmlFor="cancel-confirm" style={{ fontSize: 12.5, color: 'var(--ink2)', cursor: 'pointer' }}>
                      I understand cancellation halts further steps and does not undo completed actions.
                    </label>
                  </div>
                  <Button
                    type="submit"
                    disabled={busy || !cancelConfirmed || cancelReason.trim().length < 10}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {busy ? <><ButtonSpinner /> Requesting…</> : 'Request cancellation'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Verified Review / Reconciliation */}
          {run.reconciliation ? (
            <Card>
              <CardHeader style={{ paddingBottom: 10 }}>
                <CardTitle style={{ fontSize: 15, fontWeight: 700 }}>Verified review outcome</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <PersonAvatar userId={run.reconciliation.actor_id} name={run.reconciliation.actor_name} size={30} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{run.reconciliation.actor_name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                      Reviewed {new Date(run.reconciliation.reviewed_at).toLocaleString()} · Status at review: {run.reconciliation.status_at_review}
                    </div>
                  </div>
                  <Badge variant="brand" style={{ marginLeft: 'auto' }}>
                    {run.reconciliation.outcome === 'effects_verified' ? 'Effects verified' : 'Closed without replay'}
                  </Badge>
                </div>
                <div style={{ padding: '10px 14px', background: 'var(--bg)', borderRadius: 'var(--r)', fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {run.reconciliation.evidence}
                </div>
                <Banner variant="info">
                  The original status and event claim are preserved. This verified review does not repeat external actions.
                </Banner>
              </CardContent>
            </Card>
          ) : eligible && user && ['TENANT_ADMIN', 'SUPER_ADMIN'].includes(user.role) && (
            <Card>
              <CardHeader style={{ paddingBottom: 10 }}>
                <CardTitle style={{ fontSize: 15, fontWeight: 700 }}>Record verified review</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={e => { e.preventDefault(); void reconcile(); }}>
                  <label htmlFor="review-outcome" className="studio-field-label">Verified outcome</label>
                  <Select value={outcome} onValueChange={setOutcome} disabled={busy}>
                    <SelectTrigger id="review-outcome" className="h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="effects_verified">Effects verified</SelectItem>
                      <SelectItem value="closed_without_replay">Closed without replay</SelectItem>
                    </SelectContent>
                  </Select>

                  <label htmlFor="review-evidence" className="studio-field-label">
                    Evidence and rationale <span className="studio-req">*</span>
                  </label>
                  <Textarea
                    id="review-evidence"
                    required
                    minLength={20}
                    maxLength={3000}
                    value={evidence}
                    onChange={e => setEvidence(e.target.value)}
                    disabled={busy}
                    placeholder="Record affected system records, external provider references, validation checks and rationale."
                    rows={4}
                  />

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="review-confirm"
                      checked={confirmed}
                      onCheckedChange={v => setConfirmed(v === true)}
                      disabled={busy}
                    />
                    <label htmlFor="review-confirm" style={{ fontSize: 12.5, color: 'var(--ink2)', cursor: 'pointer' }}>
                      I verified the effects and understand this recorded review is permanent.
                    </label>
                  </div>

                  <Button
                    type="submit"
                    disabled={busy || !confirmed || evidence.trim().length < 20}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {busy ? <><ButtonSpinner /> Recording review…</> : 'Record review'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
