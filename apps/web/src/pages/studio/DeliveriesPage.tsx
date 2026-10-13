import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import type { WorkflowStudioDelivery } from '@hudumika/types';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.js';
import { Badge } from '../../components/ui/badge.js';
import { Banner } from '../../components/ui/alert.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { SectionLoading, ButtonSpinner } from '../../components/ui/spinner.js';
import { SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import './studio.css';

const DELIVERY_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  dead: 'error',
  processing: 'info',
  pending: 'warning',
  delivered: 'success',
};

export function DeliveriesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState('dead');
  const [rows, setRows] = useState<WorkflowStudioDelivery[]>([]);
  const [detail, setDetail] = useState<WorkflowStudioDelivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const admin = user && ['TENANT_ADMIN', 'SUPER_ADMIN'].includes(user.role);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (id) setDetail((await apiFetch(`/v1/workflow-studio/deliveries/${id}`)).data);
      else setRows((await apiFetch(`/v1/workflow-studio/deliveries?limit=100${status === 'all' ? '' : `&status=${status}`}`)).data ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load deliveries'); }
    finally { setLoading(false); }
  }, [id, status]);

  useEffect(() => { setDetail(null); setReason(''); setConfirmed(false); setNotice(''); void load(); }, [load]);

  async function retry() {
    setBusy(true); setError('');
    try {
      await apiFetch(`/v1/workflow-studio/deliveries/${id}/retry`, { method: 'POST', body: JSON.stringify({ reason, confirmed }) });
      setNotice('Retry queued. Completed runs will be skipped.'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Retry failed'); }
    finally { setBusy(false); }
  }

  const blocked = detail?.runs?.some(r => r.status === 'RUNNING' || (!['SUCCESS', 'SIMULATED'].includes(r.status) && !r.reconciliation));

  return (
    <div className="studio-page">
      <PageHeader
        crumbs={['Studio', 'Monitor']}
        titlePlain="Event"
        titleEm="deliveries"
        subtitle="Inspect committed events, delivery attempts and recovery history."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {id && (
              <Button variant="outline" size="sm" onClick={() => navigate('/studio/deliveries')}>
                <Icon name="arrowLeft" size={13} /> All deliveries
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={loading || busy} onClick={() => void load()}>
              <Icon name="refresh" size={13} /> Refresh
            </Button>
          </div>
        }
      />

      {!id && (
        <div className="workflow-toolbar">
          <SingleSelectFilter
            label="Status"
            value={status}
            onChange={v => setStatus(v ?? 'all')}
            options={[
              { value: 'dead', label: 'Needs review (dead)' },
              { value: 'pending', label: 'Pending' },
              { value: 'processing', label: 'Processing' },
              { value: 'delivered', label: 'Delivered' },
              { value: 'all', label: 'All statuses' },
            ]}
          />
        </div>
      )}

      {error && <Banner variant="error" className="mb-3">{error}</Banner>}
      {notice && <Banner variant="success" className="mb-3">{notice}</Banner>}

      {loading ? (
        <SectionLoading label="Loading event deliveries…" />
      ) : id && detail ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Main Delivery Review Card */}
          <Card>
            <CardHeader style={{ paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <CardTitle style={{ fontSize: 16, fontWeight: 700 }}>Delivery review</CardTitle>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge variant={DELIVERY_VARIANT[detail.status] ?? 'gray'}>
                    {detail.status}
                  </Badge>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{detail.attempts} attempts</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '.4px' }}>Event ID</div>
                  <div className="studio-run-mono" style={{ fontSize: 12, color: 'var(--ink)', marginTop: 2 }}>{detail.event_id}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '.4px' }}>Created</div>
                  <div style={{ fontSize: 12, color: 'var(--ink)', marginTop: 2 }}>{new Date(detail.created_at).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '.4px' }}>Next Available</div>
                  <div style={{ fontSize: 12, color: 'var(--ink)', marginTop: 2 }}>{new Date(detail.available_at).toLocaleString()}</div>
                </div>
              </div>

              {detail.error_message && (
                <Banner variant="error">{detail.error_message}</Banner>
              )}

              <div>
                <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Related execution runs</h3>
                {!detail.runs?.length ? (
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: '10px 0' }}>No execution claims recorded for this delivery.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {detail.runs.map(r => (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '10px 14px',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--r)',
                          background: 'var(--card-bg, var(--white))',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <Badge variant={r.status === 'SUCCESS' ? 'success' : r.status === 'FAILED' ? 'error' : 'info'}>
                            {r.status}
                          </Badge>
                          <span className="studio-run-mono" style={{ fontSize: 12, color: 'var(--ink)' }}>
                            Run {r.id}
                          </span>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/studio/runs/${r.id}`)}>
                          Review run <Icon name="arrowRight" size={13} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {blocked && (
                <Banner variant="warning">
                  An unfinished or failed run needs reconciliation. Its actions cannot be replayed through delivery retry.
                </Banner>
              )}

              {detail.status === 'dead' && admin && !blocked && (
                <form
                  onSubmit={e => { e.preventDefault(); void retry(); }}
                  style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <label htmlFor="recovery-reason" className="studio-field-label">
                    Review explanation <span className="studio-req">*</span>
                  </label>
                  <Textarea
                    id="recovery-reason"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    minLength={10}
                    maxLength={1000}
                    required
                    disabled={busy}
                    placeholder="Explain what failed and what corrective action was taken before queuing a retry."
                    rows={3}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Checkbox
                      id="recovery-confirm"
                      checked={confirmed}
                      onCheckedChange={v => setConfirmed(v === true)}
                      disabled={busy}
                    />
                    <label htmlFor="recovery-confirm" style={{ fontSize: 12.5, color: 'var(--ink2)', cursor: 'pointer' }}>
                      I reviewed the delivery and associated runs, and confirm this event is safe to re-dispatch.
                    </label>
                  </div>
                  <Button
                    type="submit"
                    disabled={busy || !confirmed || reason.trim().length < 10}
                    style={{ alignSelf: 'flex-start', marginTop: 4 }}
                  >
                    {busy ? <><ButtonSpinner /> Queuing retry…</> : 'Queue retry'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Recovery History Card */}
          <Card>
            <CardHeader style={{ paddingBottom: 10 }}>
              <CardTitle style={{ fontSize: 15, fontWeight: 700 }}>Recovery history</CardTitle>
            </CardHeader>
            <CardContent>
              {!detail.recoveries?.length ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: '6px 0' }}>No retry requests recorded.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {detail.recoveries.map(r => (
                    <div
                      key={r.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '12px 14px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r)',
                        background: 'var(--bg)',
                      }}
                    >
                      <PersonAvatar userId={r.actor_id} name={r.actor_name ?? 'Workspace administrator'} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                            {r.actor_name ?? 'Workspace administrator'}
                          </span>
                          <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                            {new Date(r.created_at).toLocaleString()} · {r.previous_attempts} previous attempts
                          </span>
                        </div>
                        <p style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 4, lineHeight: 1.45, wordBreak: 'break-word' }}>
                          {r.reason}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : !id ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
            Showing latest {rows.length} matching event deliveries. Click any delivery to review attempts or recovery actions.
          </div>
          {!rows.length && (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)', border: '1px dashed var(--border)', borderRadius: 'var(--card-radius)', background: 'var(--card-bg, var(--white))' }}>
              <Icon name="layers" size={28} color="var(--ink3)" />
              <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                No deliveries match this status filter.
              </div>
            </div>
          )}
          {rows.map(r => (
            <div
              key={r.id}
              className="studio-card-interactive"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--card-radius)',
                background: 'var(--card-bg, var(--white))',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
                boxShadow: 'var(--elev-sm)',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Badge variant={DELIVERY_VARIANT[r.status] ?? 'gray'}>
                    {r.status}
                  </Badge>
                  <span className="studio-run-mono" style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    Event {r.event_id}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                    · {r.attempts} attempt{r.attempts === 1 ? '' : 's'}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', wordBreak: 'break-word' }}>
                  {r.event_type}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                  Created {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate(`/studio/deliveries/${r.id}`)}>
                Review delivery <Icon name="arrowRight" size={13} />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
