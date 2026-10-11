import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { PageHeader } from '../../components/PageHeader.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { ListPagination, paginate } from '../../components/ui/list-pagination.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useAuth } from '../../hooks/useAuth.js';

interface ApprovalItem {
  id: string;
  project_id: string;
  project_name?: string;
  approval_type: string;
  entity_type?: string;
  entity_id?: string;
  entity_title?: string;
  status: string;
  current_step?: number;
  created_at: string;
  requested_by_name?: string;
  requested_by_id?: string;
  steps?: {
    id: string;
    step_order: number;
    role_label: string;
    approver_id?: string;
    approver_name?: string;
    decision?: string;
    decided_at?: string;
    comment?: string;
  }[];
}

const STATUS_BADGE: Record<string, { label: string; variant: 'gray' | 'brand' | 'success' | 'error' | 'warning' }> = {
  pending: { label: 'Pending', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'error' },
  draft: { label: 'Draft', variant: 'gray' },
};

export const ProjectApprovalsPage: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = (user as any)?.sub || user?.id;

  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deciding, setDeciding] = useState<{ approval: ApprovalItem; step: any; action: 'approve' | 'reject' } | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [appPage, setAppPage] = useState(1);
  const [appPageSize, setAppPageSize] = useState(25);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch('/v1/project-os/approvals');
      const rows = Array.isArray(res) ? res : (res?.data || []);
      setApprovals(
        rows.map((row: any) => ({
          ...row,
          approval_type: row.entity_type || row.approval_type || 'request',
          entity_title: row.title || row.entity_title,
          steps: (row.steps || []).map((step: any) => ({
            ...step,
            approver_id: step.assigned_user_id || step.approver_user_id,
            role_label: step.step_name || step.required_role || `Step ${step.step_order}`,
            decision: step.decision?.toLowerCase(),
            decided_at: step.action_at || step.decided_at,
          })),
        }))
      );
    } catch (err: any) {
      setLoadError(err.message || 'Unable to load project approvals');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = useMemo(() => approvals.filter(a => a.status === 'pending'), [approvals]);
  const myPending = useMemo(() => {
    if (!currentUserId) return [];
    return pending.filter(a =>
      a.steps?.some(s => s.approver_id === currentUserId && !s.decision && s.step_order === a.current_step)
    );
  }, [pending, currentUserId]);

  // Reset to first page when filters change
  useEffect(() => { setAppPage(1); }, [filter, search]);

  const filtered = useMemo(() => {
    let list = approvals;
    if (filter === 'pending') list = pending;
    else if (filter === 'my_queue') list = myPending;
    else if (filter === 'approved') list = list.filter(a => a.status === 'approved');
    else if (filter === 'rejected') list = list.filter(a => a.status === 'rejected');

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        (a.entity_title || '').toLowerCase().includes(q) ||
        (a.project_name || '').toLowerCase().includes(q) ||
        a.approval_type.toLowerCase().includes(q)
      );
    }
    return list;
  }, [approvals, filter, pending, myPending, search]);

  const handleDecision = useCallback(async () => {
    if (!deciding) return;
    setSubmitting(true);
    try {
      await apiFetch(`/v1/project-os/approvals/${deciding.approval.id}/steps/${deciding.step.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision: deciding.action === 'approve' ? 'approved' : 'rejected',
          comments: comment.trim() || undefined,
        }),
      });
      showAlert(`Approval ${deciding.action === 'approve' ? 'approved' : 'rejected'} successfully`, { variant: 'success' });
      setDeciding(null);
      setComment('');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to submit decision', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }, [deciding, comment, load]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      {loadError && (
        <Alert variant="destructive" style={{ marginBottom: 16 }}>
          <AlertDescription>
            {loadError} <Button variant="outline" size="sm" onClick={load} style={{ marginLeft: 8 }}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      <PageHeader
        crumbs={['Projects', 'Controls']}
        titlePlain="Approval"
        titleEm="queue"
        subtitle="Multi-step governance workflows — formal sign-offs, gate reviews, and budget change controls."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/risks')}>
              <Icon name="shield" size={13} style={{ marginRight: 6 }} /> Risk Register
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/reports')}>
              <Icon name="barChart2" size={13} style={{ marginRight: 6 }} /> Reports
            </Button>
          </div>
        }
      />

      <div style={{ marginTop: 20 }}>
        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total In Queue', value: approvals.length, icon: 'clipboardList' as const, variant: 'brand' as const },
            { label: 'Pending Review', value: pending.length, icon: 'clock' as const, variant: pending.length > 0 ? 'warning' as const : 'brand' as const },
            { label: 'Assigned to Me', value: myPending.length, icon: 'user' as const, variant: myPending.length > 0 ? 'error' as const : 'brand' as const, highlight: myPending.length > 0 },
            { label: 'Approved Gates', value: approvals.filter(a => a.status === 'approved').length, icon: 'checkCircle' as const, variant: 'success' as const },
          ].map(kpi => (
            <div
              key={kpi.label}
              style={{
                background: 'var(--white)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)',
                padding: 16,
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <FeaturedIcon variant={kpi.highlight ? 'error' : kpi.variant} size="sm">
                  <Icon name={kpi.icon} size={13} />
                </FeaturedIcon>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {kpi.label}
                </span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: kpi.highlight ? 'var(--red)' : 'var(--ink)' }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Tab filters */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList>
              <TabsTrigger value="all">All ({approvals.length})</TabsTrigger>
              <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
              <TabsTrigger value="my_queue">My Queue ({myPending.length})</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>

          <SearchToolbar search={search} onSearch={setSearch} placeholder="Search approvals by title or project…" />
        </div>

        {/* List of Approval Workflow Cards */}
        {loading ? (
          <SectionLoading />
        ) : filtered.length === 0 ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 48, textAlign: 'center' }}>
            <FeaturedIcon variant="brand" size="lg" style={{ margin: '0 auto 12px' }}>
              <Icon name="checkCircle" size={24} />
            </FeaturedIcon>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              No Approvals Found
            </h3>
            <p style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 400, margin: '0 auto 16px' }}>
              No approval requests match the current filter. Approvals are triggered automatically by gate reviews, procurement thresholds, or budget alterations.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {paginate(filtered, appPage, appPageSize).visible.map(appr => {
              const sb = STATUS_BADGE[appr.status] || STATUS_BADGE.pending;
              const activeStep = appr.steps?.find(s => s.step_order === appr.current_step);
              const canAct = activeStep && (activeStep.approver_id === currentUserId || !activeStep.approver_id);

              return (
                <div
                  key={appr.id}
                  style={{
                    background: 'var(--white)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-lg)',
                    padding: 18,
                    boxShadow: 'var(--card-shadow)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  {/* Header Row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {appr.approval_type.replaceAll('_', ' ')}
                        </span>
                        {appr.project_name && (
                          <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
                            · {appr.project_name}
                          </span>
                        )}
                      </div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginTop: 2, marginBottom: 0 }}>
                        {appr.entity_title || `Approval #${appr.id.slice(0, 8)}`}
                      </h4>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge variant={sb.variant}>{sb.label}</Badge>
                      {appr.created_at && (
                        <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
                          {new Date(appr.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Multi-step Timeline */}
                  {appr.steps && appr.steps.length > 0 && (
                    <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                        Approval Workflow Steps
                      </div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {appr.steps.map((st, idx) => {
                          const isCurrent = st.step_order === appr.current_step && !st.decision;
                          const isDone = st.decision === 'approved';
                          const isRejected = st.decision === 'rejected';

                          return (
                            <div
                              key={st.id || idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 10px',
                                background: isCurrent ? 'var(--white)' : 'transparent',
                                border: isCurrent ? '1.5px solid var(--teal)' : '1px solid var(--border)',
                                borderRadius: 'var(--r-sm)',
                                fontSize: 12,
                              }}
                            >
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  background: isDone ? 'var(--green)' : isRejected ? 'var(--red)' : isCurrent ? 'var(--teal)' : 'var(--ink4)',
                                }}
                              />
                              <span style={{ fontWeight: isCurrent ? 700 : 500, color: isCurrent ? 'var(--ink)' : 'var(--ink2)' }}>
                                {st.role_label}
                              </span>
                              {st.approver_name && (
                                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
                                  ({st.approver_name})
                                </span>
                              )}
                              {st.decision && (
                                <Badge variant={st.decision === 'approved' ? 'success' : 'error'} style={{ fontSize: 9.5 }}>
                                  {st.decision}
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Actions Bar */}
                  {appr.status === 'pending' && activeStep && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      <Button
                        variant="outline"
                        size="sm"
                        style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                        disabled={submitting}
                        onClick={() => setDeciding({ approval: appr, step: activeStep, action: 'reject' })}
                      >
                        <Icon name="x" size={13} style={{ marginRight: 4 }} /> Reject
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        disabled={submitting}
                        onClick={() => setDeciding({ approval: appr, step: activeStep, action: 'approve' })}
                      >
                        <Icon name="check" size={13} style={{ marginRight: 4 }} /> Approve
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <ListPagination total={filtered.length} page={appPage} pageSize={appPageSize} onPageChange={setAppPage} onPageSizeChange={setAppPageSize} noun="approvals" />
        )}
      </div>

      {/* Decision Dialog */}
      <Dialog open={!!deciding} onOpenChange={open => { if (!open) setDeciding(null); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {deciding?.action === 'approve' ? 'Approve' : 'Reject'} Request
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <p style={{ fontSize: 13, color: 'var(--ink2)', margin: 0 }}>
              You are about to {deciding?.action} the request for <strong>{deciding?.approval.entity_title}</strong>.
            </p>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">
                Comments (Optional)
              </label>
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Add audit rationale, conditions, or instructions…"
                rows={4}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button
              variant={deciding?.action === 'approve' ? 'default' : 'destructive'}
              disabled={submitting}
              onClick={handleDecision}
            >
              {submitting ? 'Submitting…' : deciding?.action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
