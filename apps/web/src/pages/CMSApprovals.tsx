import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useAuth } from '../hooks/useAuth.js';
import type { CmsApproval } from '@hudumika/types';

export function CMSApprovals() {
  const { user } = useAuth();
  const [approvals, setApprovals] = useState<CmsApproval[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'pending' | 'my_reviews' | 'my_requests' | 'all'>('pending');

  const [decisionModal, setDecisionModal] = useState<{
    open: boolean;
    approval: CmsApproval | null;
    decision: 'approved' | 'rejected';
    note: string;
    submitting: boolean;
  }>({
    open: false,
    approval: null,
    decision: 'approved',
    note: '',
    submitting: false,
  });

  function load() {
    setLoading(true);
    apiFetch<CmsApproval[]>('/v1/cms/approvals')
      .then(res => setApprovals(res ?? []))
      .catch(() => setApprovals([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const filteredApprovals = (approvals ?? []).filter(a => {
    if (filterTab === 'pending') return a.status === 'pending';
    if (filterTab === 'my_reviews') return a.assigned_to === user?.id && a.status === 'pending';
    if (filterTab === 'my_requests') return a.assigned_by === user?.id;
    return true;
  });

  function openDecision(approval: CmsApproval, decision: 'approved' | 'rejected') {
    setDecisionModal({
      open: true,
      approval,
      decision,
      note: '',
      submitting: false,
    });
  }

  async function handleDecisionSubmit() {
    if (!decisionModal.approval) return;
    if (decisionModal.decision === 'rejected' && !decisionModal.note.trim()) {
      return showAlert('Please provide a reason or change request feedback when rejecting.');
    }

    setDecisionModal(d => ({ ...d, submitting: true }));
    try {
      await apiFetch(`/v1/cms/approvals/${decisionModal.approval.id}/decide`, {
        method: 'POST',
        body: JSON.stringify({
          decision: decisionModal.decision,
          note: decisionModal.note.trim() || undefined,
        }),
      });
      showAlert(`Content ${decisionModal.decision === 'approved' ? 'approved' : 'returned to draft'}.`);
      setDecisionModal(d => ({ ...d, open: false }));
      load();
    } catch (err: any) {
      showAlert(`Action failed: ${err.message}`);
      setDecisionModal(d => ({ ...d, submitting: false }));
    }
  }

  async function handleCancel(approval: CmsApproval) {
    try {
      await apiFetch(`/v1/cms/approvals/${approval.id}/cancel`, { method: 'POST' });
      showAlert('Approval request cancelled.');
      load();
    } catch (err: any) {
      showAlert(`Cancel failed: ${err.message}`);
    }
  }

  const pendingCount = (approvals ?? []).filter(a => a.status === 'pending').length;
  const myActionCount = (approvals ?? []).filter(a => a.assigned_to === user?.id && a.status === 'pending').length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={[{ label: 'CMS', to: '/cms' }, { label: 'Approvals' }]}
        title="Editorial Approvals & Review Queue"
        subtitle="Review, approve, and sign off on drafts submitted by writers and contributors (§16 Approvals)."
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>PENDING REVIEWS</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: pendingCount > 0 ? 'var(--teal)' : 'var(--text)' }}>
              {pendingCount}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>ASSIGNED TO ME</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: myActionCount > 0 ? '#f59e0b' : 'var(--text)' }}>
              {myActionCount}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>TOTAL REVIEW LOGS</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
              {approvals?.length ?? 0}
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 20 }}>
          {[
            { id: 'pending', label: 'Pending Queue', badge: pendingCount },
            { id: 'my_reviews', label: 'Assigned to Me', badge: myActionCount },
            { id: 'my_requests', label: 'My Submissions' },
            { id: 'all', label: 'All History' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id as any)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                background: filterTab === tab.id ? 'var(--teal)' : 'transparent',
                color: filterTab === tab.id ? '#fff' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  style={{
                    padding: '2px 6px',
                    borderRadius: 10,
                    fontSize: 11,
                    background: filterTab === tab.id ? 'rgba(255,255,255,0.3)' : 'var(--bg-muted)',
                    color: filterTab === tab.id ? '#fff' : 'var(--text)',
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <SectionLoading />
        ) : filteredApprovals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--surface)', borderRadius: 12, border: '1px dashed var(--border)' }}>
            <Icon name="checkCircle" size={40} style={{ color: 'var(--teal)', marginBottom: 12 }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px 0' }}>All Clear</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No items in this review view.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredApprovals.map(app => (
              <div
                key={app.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: app.status === 'approved' ? '#ecfdf5' : app.status === 'rejected' ? '#fff1f2' : app.status === 'cancelled' ? '#f1f5f9' : '#fef3c7',
                      color: app.status === 'approved' ? '#059669' : app.status === 'rejected' ? '#dc2626' : app.status === 'cancelled' ? '#64748b' : '#d97706',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon
                      name={app.status === 'approved' ? 'check' : app.status === 'rejected' ? 'x' : app.status === 'cancelled' ? 'x' : 'clock'}
                      size={20}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                        {app.resource_title || 'Content Item'}
                      </span>
                      <Badge variant="secondary">{app.resource_type.toUpperCase()}</Badge>
                      <Badge variant={app.status === 'approved' ? 'success' : app.status === 'rejected' ? 'destructive' : app.status === 'cancelled' ? 'gray' : 'warning'}>
                        {app.status}
                      </Badge>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
                      <span>Submitted by: <strong>{app.assigned_by_name || 'Author'}</strong></span>
                      <span>Reviewer: <strong>{app.assigned_to_name || 'Assigned Editor'}</strong></span>
                      <span>Date: {new Date(app.created_at).toLocaleDateString()}</span>
                      {app.due_date && <span>Due: {new Date(app.due_date).toLocaleDateString()}</span>}
                    </div>

                    {app.decision_note && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, fontStyle: 'italic', background: 'var(--bg-muted)', padding: '4px 8px', borderRadius: 6 }}>
                        Note: "{app.decision_note}"
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {app.status === 'pending' && (
                    <>
                      <button
                        onClick={() => openDecision(app, 'approved')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '7px 14px',
                          borderRadius: 8,
                          background: '#059669',
                          color: '#fff',
                          border: 'none',
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        <Icon name="check" size={14} />
                        Approve
                      </button>
                      <button
                        onClick={() => openDecision(app, 'rejected')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '7px 12px',
                          borderRadius: 8,
                          background: 'var(--surface)',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        <Icon name="close" size={14} />
                        Reject
                      </button>
                    </>
                  )}

                  {app.status === 'pending' && app.assigned_by === user?.id && (
                    <button
                      onClick={() => handleCancel(app)}
                      style={{
                        padding: '7px 12px',
                        borderRadius: 8,
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel Request
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Decision Modal */}
      {decisionModal.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text)' }}>
              {decisionModal.decision === 'approved' ? 'Approve Content' : 'Reject & Return to Draft'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
              {decisionModal.decision === 'approved'
                ? 'Approve this draft so it can be scheduled, included in a release, or published.'
                : 'Return this content to draft for the author to revise with your feedback note.'}
            </p>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              {decisionModal.decision === 'approved' ? 'Approval Note (Optional)' : 'Change Request / Reason *'}
            </label>
            <textarea
              value={decisionModal.note}
              onChange={e => setDecisionModal(d => ({ ...d, note: e.target.value }))}
              placeholder={decisionModal.decision === 'approved' ? 'e.g. Looks great, verified compliance!' : 'e.g. Please update the pricing table and add alt tags to images.'}
              rows={4}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 13,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setDecisionModal(d => ({ ...d, open: false }))}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDecisionSubmit}
                disabled={decisionModal.submitting}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: decisionModal.decision === 'approved' ? '#059669' : '#dc2626',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {decisionModal.submitting ? 'Submitting...' : decisionModal.decision === 'approved' ? 'Confirm Approval' : 'Return to Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
