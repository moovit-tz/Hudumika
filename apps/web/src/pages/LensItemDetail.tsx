import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { SectionCard } from '../components/SectionCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import type { LensItem, LensComment } from '@hudumika/types';

export function LensItemDetail() {
  const isMobile = useIsMobile();
  const { ref } = useParams<{ ref: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<(LensItem & { events?: any[]; comments?: LensComment[]; links?: any[]; snapshots?: any[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Comment draft
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Status & resolution modal
  const [statusModal, setStatusModal] = useState(false);
  const [targetStatus, setTargetStatus] = useState<string>('DONE');
  const [resolutionText, setResolutionText] = useState('');
  const [reopenReasonText, setReopenReasonText] = useState('');

  // Link / Push modal
  const [pushModal, setPushModal] = useState(false);
  const [pushProvider, setPushProvider] = useState('github');
  const [connections, setConnections] = useState<any[]>([]);

  const load = useCallback(() => {
    if (!ref) return;
    setLoading(true);
    apiFetch(`/v1/lens/items/${ref.toUpperCase()}`)
      .then((res: any) => {
        setItem(res);
        setError(null);
      })
      .catch((err: any) => {
        setError(err?.message || 'Item not found');
      })
      .finally(() => setLoading(false));
  }, [ref]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiFetch('/v1/lens/connections')
      .then((res: any) => setConnections(Array.isArray(res) ? res : []))
      .catch(() => setConnections([]));
  }, []);

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim() || !ref) return;
    setSubmittingComment(true);
    try {
      await apiFetch(`/v1/lens/items/${ref}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: commentText.trim() }),
      });
      setCommentText('');
      load();
    } catch (err: any) {
      alert(err?.message || 'Failed to post comment');
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleStatusChange() {
    if (!ref) return;
    if (['DONE', 'WONTFIX'].includes(targetStatus) && !resolutionText.trim()) {
      alert('A written resolution is required to close an item.');
      return;
    }

    try {
      await apiFetch(`/v1/lens/items/${ref}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: targetStatus,
          resolution: resolutionText.trim() || undefined,
          reopen_reason: targetStatus === 'OPEN' && reopenReasonText ? reopenReasonText.trim() : undefined,
        }),
      });
      setStatusModal(false);
      setResolutionText('');
      setReopenReasonText('');
      load();
    } catch (err: any) {
      alert(err?.message || 'Failed to update status');
    }
  }

  async function handleVerifyEvidence() {
    if (!ref) return;
    const note = prompt('Enter verification summary (e.g. "Tested on staging build 418 — VAT tax band precision verified"):');
    if (!note) return;

    try {
      await apiFetch(`/v1/lens/items/${ref}`, {
        method: 'PATCH',
        body: JSON.stringify({
          verification_status: 'VERIFIED',
          verification_evidence: note,
        }),
      });
      load();
    } catch (err: any) {
      alert(err?.message || 'Verification update failed');
    }
  }

  async function handlePush() {
    if (!ref) return;
    try {
      const conn = connections.find(c => c.provider === pushProvider);
      await apiFetch(`/v1/lens/items/${ref}/push`, {
        method: 'POST',
        body: JSON.stringify({
          provider: pushProvider,
          connection_id: conn?.id,
        }),
      });
      setPushModal(false);
      load();
    } catch (err: any) {
      alert(err?.message || 'Failed to push to external tracker');
    }
  }

  if (loading) {
    return (
      <div className="page-layout">
        <SectionLoading />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="page-layout">
        <PageHeader title="Lens Item Not Found" crumbs={[{ label: 'Lens', to: '/lens' }, { label: 'Not Found' }]} />
        <SectionCard>
          <div style={{ textAlign: 'center', padding: '30px' }}>
            <p style={{ color: 'var(--red)', fontSize: 14 }}>{error || 'The requested item does not exist.'}</p>
            <Button variant="outline" onClick={() => navigate('/lens')}>Back to Board</Button>
          </div>
        </SectionCard>
      </div>
    );
  }

  const isClosed = ['DONE', 'WONTFIX'].includes(item.status);

  return (
    <div className="lens-page">
      <PageHeader
        title={`${item.ref}: ${item.title}`}
        subtitle={`Reported in ${item.environment || 'production'} • Opened ${new Date(item.created_at).toLocaleDateString()}`}
        crumbs={[{ label: 'Lens', to: '/lens' }, { label: item.ref }]}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="outline" onClick={() => navigate('/lens')}>
              <Icon name="arrowLeft" size={14} />
              Board
            </Button>
            <Button variant="outline" onClick={() => setPushModal(true)}>
              <Icon name="share" size={14} />
              Push Tracker
            </Button>
            {isClosed ? (
              <Button
                variant="outline"
                onClick={() => { setTargetStatus('OPEN'); setStatusModal(true); }}
              >
                Reopen Item
              </Button>
            ) : (
              <Button
                variant="default"
                onClick={() => { setTargetStatus('DONE'); setStatusModal(true); }}
              >
                Close Item
              </Button>
            )}
          </div>
        }
      />

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: 24, width: '100%', minWidth: 0 }}>
        {/* Left: Content, Reproduction, Evidence, Discussion, Activity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Main Body */}
          <SectionCard title="Issue Details">
            <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink)', whiteSpace: 'pre-wrap', marginBottom: 16 }}>
              {item.body || 'No description provided.'}
            </div>

            {item.reproduction_steps && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-light)' }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 6 }}>
                  Reproduction Steps
                </h4>
                <div style={{ fontSize: 13, background: 'var(--surface-hover)', padding: '10px 14px', borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                  {item.reproduction_steps}
                </div>
              </div>
            )}

            {item.fix_summary && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-light)' }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 6 }}>
                  Fix Summary
                </h4>
                <div style={{ fontSize: 13, background: 'var(--teal-l)', color: 'var(--teal-d)', padding: '10px 14px', borderRadius: 6 }}>
                  {item.fix_summary}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Verification Evidence */}
          <SectionCard title="Verification Gate">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Badge variant={item.verification_status === 'VERIFIED' ? 'success' : 'warning'}>
                  {item.verification_status || 'UNVERIFIED'}
                </Badge>
                {item.verified_at && (
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    Verified on {new Date(item.verified_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              {item.verification_status !== 'VERIFIED' && (
                <Button size="sm" variant="default" onClick={handleVerifyEvidence}>
                  <Icon name="check" size={14} />
                  Record Verification Evidence
                </Button>
              )}
            </div>

            {item.verification_evidence ? (
              <div style={{ fontSize: 13, background: 'var(--surface-hover)', padding: '10px 14px', borderRadius: 6, color: 'var(--ink2)' }}>
                {item.verification_evidence}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                No verification evidence recorded. Items should be verified against test runs or live reproduction before production release.
              </div>
            )}
          </SectionCard>

          {/* Snapshots */}
          {item.snapshots && item.snapshots.length > 0 && (
            <SectionCard title="Attached Code & File Snapshots">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {item.snapshots.map((s: any) => (
                  <div
                    key={s.id}
                    style={{
                      padding: '10px 14px',
                      background: 'var(--surface-hover)',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <strong style={{ marginRight: 8 }}>{s.snapshot_type}</strong>
                      <code style={{ fontSize: 11, color: 'var(--ink3)' }}>SHA: {s.checksum_sha256?.slice(0, 12)}...</code>
                    </div>
                    <a href={`/v1/lens/snapshots/${s.id}/download`} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline">Download</Button>
                    </a>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Discussion & Comments */}
          <SectionCard title="Engineering Discussion">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
              {(!item.comments || item.comments.length === 0) ? (
                <div style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', padding: '16px 0' }}>
                  No comments yet. Post an observation, finding, or link below.
                </div>
              ) : (
                item.comments.map(c => (
                  <div
                    key={c.id}
                    style={{
                      borderBottom: '1px solid var(--border-light)',
                      paddingBottom: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{c.author_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {c.body}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddComment} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                rows={3}
                placeholder="Write a comment or engineering observation..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  boxSizing: 'border-box',
                  fontSize: 13,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" variant="default" size="sm" disabled={submittingComment || !commentText.trim()}>
                  {submittingComment ? 'Posting...' : 'Post Comment'}
                </Button>
              </div>
            </form>
          </SectionCard>

          {/* Activity / Event Trail */}
          <SectionCard title="Audit Activity Trail">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(item.events ?? []).map((ev: any) => (
                <div
                  key={ev.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    fontSize: 12,
                    padding: '6px 0',
                    borderBottom: '1px solid var(--border-light)',
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--ink)', width: 90 }}>{ev.kind}</span>
                  <span style={{ flex: 1, color: 'var(--ink2)' }}>{ev.detail}</span>
                  <span style={{ color: 'var(--ink3)', fontSize: 11 }}>
                    {ev.actor_name ? `${ev.actor_name} • ` : ''}
                    {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Right Sidebar: Attributes, External Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title="Attributes">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              <div>
                <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Status
                </span>
                <Badge variant={isClosed ? 'success' : 'brand'}>{item.status}</Badge>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Kind & Severity
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Badge variant="gray">{item.kind}</Badge>
                  <Badge variant={item.severity === 'CRITICAL' ? 'error' : item.severity === 'HIGH' ? 'warning' : 'gray'}>
                    {item.severity}
                  </Badge>
                </div>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Confidence
                </span>
                <Badge variant={item.confidence === 'CONFIRMED' ? 'success' : 'warning'}>
                  {item.confidence}
                </Badge>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Project
                </span>
                <span>{(item as any).project_name ? `${(item as any).project_name} (${(item as any).project_key})` : 'Unassigned'}</span>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Release
                </span>
                <span>{(item as any).release_version || 'None planned'}</span>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Assignee
                </span>
                <span>{item.assignee_name || 'Unassigned'}</span>
              </div>

              {item.reopen_count ? (
                <div>
                  <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>
                    Reopen Count
                  </span>
                  <span style={{ color: 'var(--red)', fontWeight: 600 }}>{item.reopen_count} times</span>
                </div>
              ) : null}

              {item.resolution && (
                <div style={{ marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
                  <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>
                    Resolution
                  </span>
                  <div style={{ color: 'var(--green-d)', fontSize: 12, lineHeight: 1.4 }}>
                    {item.resolution}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* External Tracker Links */}
          <SectionCard title="External Trackers">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(!item.links || item.links.length === 0) ? (
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No external issues or PRs linked.</div>
              ) : (
                item.links.map((l: any) => (
                  <div
                    key={l.id || l.external_id}
                    style={{
                      padding: '8px 10px',
                      background: 'var(--surface-hover)',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{l.provider.toUpperCase()} #{l.external_id}</strong>
                      {l.external_status && <Badge variant="gray">{l.external_status}</Badge>}
                    </div>
                    {l.url && (
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11, color: 'var(--teal-d)', textDecoration: 'none' }}
                      >
                        View External {l.kind} ↗
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Close / Reopen Dialog */}
      <Dialog open={statusModal} onOpenChange={setStatusModal}>
        <DialogContent>
          <DialogTitle>{['DONE', 'WONTFIX'].includes(targetStatus) ? 'Close Item with Written Resolution' : 'Reopen Item'}</DialogTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {['DONE', 'WONTFIX'].includes(targetStatus) ? (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                  Resolution Statement * (How was this settled?)
                </label>
                <textarea
                  value={resolutionText}
                  onChange={e => setResolutionText(e.target.value)}
                  rows={4}
                  required
                  placeholder="e.g. Fixed in commit abc1234 — added VAT registration validation guard. Verified on staging."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    boxSizing: 'border-box',
                    fontSize: 13,
                  }}
                />
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                  Reopen Reason (Why did this recur or fail?)
                </label>
                <textarea
                  value={reopenReasonText}
                  onChange={e => setReopenReasonText(e.target.value)}
                  rows={3}
                  placeholder="e.g. Edge case resurfaced with multi-currency invoices."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    boxSizing: 'border-box',
                    fontSize: 13,
                  }}
                />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button variant="ghost" onClick={() => setStatusModal(false)}>Cancel</Button>
              <Button variant="default" onClick={handleStatusChange}>Confirm Status Change</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Push Tracker Dialog */}
      <Dialog open={pushModal} onOpenChange={setPushModal}>
        <DialogContent>
          <DialogTitle>Push Issue to External Tracker</DialogTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                Target Tracker Provider
              </label>
              <select
                value={pushProvider}
                onChange={e => setPushProvider(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  boxSizing: 'border-box',
                }}
              >
                <option value="github">GitHub Issues</option>
                <option value="linear">Linear</option>
                <option value="jira">Jira Cloud</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button variant="ghost" onClick={() => setPushModal(false)}>Cancel</Button>
              <Button variant="default" onClick={handlePush}>Push Issue</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LensItemDetail;
