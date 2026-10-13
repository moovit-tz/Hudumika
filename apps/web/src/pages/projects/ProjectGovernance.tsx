import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { useAuth } from '../../hooks/useAuth.js';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../components/ui/card.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Input } from '../../components/ui/input.js';
import { Combobox } from '../../components/ui/combobox.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { ProjectRisksDashboard } from './ProjectRisksDashboard.js';
import { ListPagination, paginate } from '../../components/ui/list-pagination.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import type {
  ProjectRisk,
  ProjectIssue,
  ProjectChangeRequest,
  ProjectApproval,
} from '@hudumika/types';

interface ProjectGovernanceProps {
  projectId: string;
  risks?: ProjectRisk[];
  issues?: ProjectIssue[];
  changeRequests?: ProjectChangeRequest[];
  approvals?: (ProjectApproval & { steps?: any[] })[];
  onRefresh?: () => void;
  currency?: string;
}

export const ProjectGovernance: React.FC<ProjectGovernanceProps> = ({
  projectId,
  risks: propsRisks,
  issues: propsIssues,
  changeRequests: propsChangeRequests,
  approvals: propsApprovals,
  onRefresh: propsOnRefresh,
  currency = 'KES',
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'risks' | 'issues' | 'changes' | 'approvals'>('risks');
  const [resolvingIssue, setResolvingIssue] = useState<ProjectIssue | null>(null);
  const [resolution, setResolution] = useState('');

  const [risks, setRisks] = useState<ProjectRisk[]>(propsRisks || []);
  const [issues, setIssues] = useState<ProjectIssue[]>(propsIssues || []);
  const [changeRequests, setChangeRequests] = useState<ProjectChangeRequest[]>(propsChangeRequests || []);
  const [approvals, setApprovals] = useState<(ProjectApproval & { steps?: any[] })[]>(propsApprovals || []);
  const [loading, setLoading] = useState(!propsRisks && !propsIssues && !propsChangeRequests);
  const isMobile = useIsMobile();
  const [issPage, setIssPage] = useState(1);
  const [issPageSize, setIssPageSize] = useState(25);
  const [crPage, setCrPage] = useState(1);
  const [crPageSize, setCrPageSize] = useState(25);
  const [apPage, setApPage] = useState(1);
  const [apPageSize, setApPageSize] = useState(25);

  useEffect(() => { setIssPage(1); setCrPage(1); setApPage(1); }, [activeTab]);

  // Modals
  const [showAddRiskModal, setShowAddRiskModal] = useState(false);
  const [showAddIssueModal, setShowAddIssueModal] = useState(false);
  const [showAddCrModal, setShowAddCrModal] = useState(false);

  // Risk Form
  const [riskTitle, setRiskTitle] = useState('');
  const [riskCategory, setRiskCategory] = useState('operational');
  const [riskProb, setRiskProb] = useState<'unlikely' | 'possible' | 'likely' | 'almost_certain'>('possible');
  const [riskImpact, setRiskImpact] = useState<'negligible' | 'low' | 'medium' | 'high' | 'critical'>('medium');
  const [riskExposure, setRiskExposure] = useState('');
  const [riskStrategy, setRiskStrategy] = useState<'mitigate' | 'avoid' | 'transfer' | 'accept'>('mitigate');
  const [riskPlan, setRiskPlan] = useState('');

  // Issue Form
  const [issueTitle, setIssueTitle] = useState('');
  const [issueSeverity, setIssueSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [issueImpactDays, setIssueImpactDays] = useState('0');
  const [issueImpactCost, setIssueImpactCost] = useState('0');
  const [issueRootCause, setIssueRootCause] = useState('');

  // CR Form
  const [crNumber, setCrNumber] = useState('');
  const [crTitle, setCrTitle] = useState('');
  const [crReason, setCrReason] = useState('');
  const [crOriginalScope, setCrOriginalScope] = useState('');
  const [crRequestedChange, setCrRequestedChange] = useState('');
  const [crCostImpact, setCrCostImpact] = useState('0');
  const [crScheduleImpact, setCrScheduleImpact] = useState('0');
  const [crClientReq, setCrClientReq] = useState(false);
  const [editingCr, setEditingCr] = useState<string | null>(null);
  const [submissionCr, setSubmissionCr] = useState<string | null>(null);
  const [approverOptions, setApproverOptions] = useState<{ id: string; name: string }[]>([]);
  const [reviewSteps, setReviewSteps] = useState([{ step_name: 'Project review', assigned_user_id: '' }]);

  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (propsRisks && propsIssues && propsChangeRequests && propsApprovals) {
      setRisks(propsRisks);
      setIssues(propsIssues);
      setChangeRequests(propsChangeRequests);
      setApprovals(propsApprovals);
      setLoadErrors([]);
      return;
    }
    setLoading(true);
    const results = await Promise.allSettled([
      apiFetch(`/v1/project-os/projects/${projectId}/risks`),
      apiFetch(`/v1/project-os/projects/${projectId}/issues`),
      apiFetch(`/v1/project-os/projects/${projectId}/change-requests`),
      apiFetch(`/v1/project-os/approvals?projectId=${projectId}`),
    ]);
    const labels = ['Risks', 'Issues', 'Change requests', 'Approvals'];
    const rows = (result: PromiseSettledResult<any>) => result.status === 'fulfilled'
      ? (Array.isArray(result.value) ? result.value : result.value.data || []) : [];
    setRisks(rows(results[0]));
    setIssues(rows(results[1]));
    setChangeRequests(rows(results[2]));
    setApprovals(rows(results[3]));
    setLoadErrors(results.flatMap((result, index) => result.status === 'rejected' ? [labels[index]] : []));
    setLoading(false);
  }, [projectId, propsRisks, propsIssues, propsChangeRequests, propsApprovals]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!riskTitle.trim()) {
      showAlert('Risk title is required', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/project-os/projects/${projectId}/risks`, {
        method: 'POST',
        body: JSON.stringify({
          title: riskTitle.trim(),
          category: riskCategory,
          probability: riskProb,
          impact: riskImpact,
          financial_exposure: parseFloat(riskExposure) || 0,
          strategy: riskStrategy,
          mitigation_plan: riskPlan.trim() || null,
        }),
      });
      showAlert('Risk item added to register', { variant: 'success' });
      setShowAddRiskModal(false);
      setRiskTitle('');
      setRiskExposure('');
      setRiskPlan('');
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create risk', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueTitle.trim()) {
      showAlert('Issue title is required', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/project-os/projects/${projectId}/issues`, {
        method: 'POST',
        body: JSON.stringify({
          title: issueTitle.trim(),
          severity: issueSeverity,
          impact_schedule_days: parseInt(issueImpactDays, 10) || 0,
          impact_cost: parseFloat(issueImpactCost) || 0,
          root_cause: issueRootCause.trim() || null,
        }),
      });
      showAlert('Issue logged in tracker', { variant: 'success' });
      setShowAddIssueModal(false);
      setIssueTitle('');
      setIssueImpactDays('0');
      setIssueImpactCost('0');
      setIssueRootCause('');
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to log issue', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crTitle.trim() || !crReason.trim()) {
      showAlert('Change Request title and reason are required', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/project-os/projects/${projectId}/change-requests${editingCr ? `/${editingCr}` : ''}`, {
        method: editingCr ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...(crNumber.trim() ? { cr_number: crNumber.trim() } : {}),
          title: crTitle.trim(),
          reason: crReason.trim(),
          original_scope: crOriginalScope.trim(),
          requested_change: crRequestedChange.trim(),
          cost_impact: parseFloat(crCostImpact) || 0,
          schedule_impact_days: parseInt(crScheduleImpact, 10) || 0,
          client_approval_required: crClientReq,
        }),
      });
      showAlert('Change request saved as a draft', { variant: 'success' });
      setShowAddCrModal(false);
      setEditingCr(null);
      setCrTitle('');
      setCrReason('');
      setCrOriginalScope('');
      setCrRequestedChange('');
      setCrCostImpact('0');
      setCrScheduleImpact('0');
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create CR', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleApprovalDecision = async (approvalId: string, stepId: string, decision: 'approved' | 'rejected') => {
    try {
      await apiFetch(`/v1/project-os/approvals/${approvalId}/steps/${stepId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      showAlert(`Approval step ${decision}`, { variant: 'success' });
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to record decision', { variant: 'error' });
    }
  };

  const formatCurrency = (val: number) => `${currency} ${Number(val || 0).toLocaleString()}`;
  async function resolveIssue(event: React.FormEvent) {
    event.preventDefault(); if (!resolvingIssue || !resolution.trim()) return; setSaving(true);
    try { await apiFetch(`/v1/project-os/issues/${resolvingIssue.id}/resolve`, { method: 'PATCH', body: JSON.stringify({ resolution: resolution.trim() }) }); setResolvingIssue(null); setResolution(''); await loadData(); }
    catch (err: any) { showAlert(err.message || 'Unable to resolve issue', { variant: 'error' }); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      {loadErrors.length > 0 && <Alert variant="warning">
        <AlertTitle>Some governance sections are unavailable</AlertTitle>
        <AlertDescription>Could not load: {loadErrors.join(', ')}. Other sections are still available.</AlertDescription>
        <Button variant="outline" size="sm" onClick={loadData} className="mt-3" disabled={loading}>Retry loading</Button>
      </Alert>}
      {/* Sub-tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-3">
        <div className="flex items-center gap-2" data-ds-tabstrip="">
          <button
            onClick={() => setActiveTab('risks')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'risks'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
           data-ds-selected={activeTab === 'risks'} data-ui-native-button="" aria-pressed={activeTab === 'risks'}>
            5x5 Risk Register ({risks.length})
          </button>
          <button
            onClick={() => setActiveTab('issues')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'issues'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
           data-ds-selected={activeTab === 'issues'} data-ui-native-button="" aria-pressed={activeTab === 'issues'}>
            Issues Log ({issues.length})
          </button>
          <button
            onClick={() => setActiveTab('changes')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'changes'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
           data-ds-selected={activeTab === 'changes'} data-ui-native-button="" aria-pressed={activeTab === 'changes'}>
            Change Requests ({loadErrors.includes('Change requests') ? '—' : changeRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('approvals')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'approvals'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
           data-ds-selected={activeTab === 'approvals'} data-ui-native-button="" aria-pressed={activeTab === 'approvals'}>
            Multi-Step Approvals ({loadErrors.includes('Approvals') ? '—' : approvals.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'risks' && (
            <Button size="sm" onClick={() => setShowAddRiskModal(true)} className="bg-primary text-primary-foreground">
              <Icon name="plus" size={14} className="mr-1" /> Add Risk Item
            </Button>
          )}
          {activeTab === 'issues' && (
            <Button size="sm" onClick={() => setShowAddIssueModal(true)} className="bg-primary text-primary-foreground">
              <Icon name="plus" size={14} className="mr-1" /> Log Project Issue
            </Button>
          )}
          {activeTab === 'changes' && (
            <Button size="sm" onClick={() => { setEditingCr(null); setCrNumber(''); setCrTitle(''); setCrReason(''); setCrOriginalScope(''); setCrRequestedChange(''); setCrCostImpact('0'); setCrScheduleImpact('0'); setCrClientReq(false); setShowAddCrModal(true); }} className="bg-primary text-primary-foreground">
              <Icon name="plus" size={14} className="mr-1" /> New Change Request
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <SectionLoading />
      ) : activeTab === 'risks' ? (
        <ProjectRisksDashboard
          projectId={projectId}
          onRefresh={loadData}
          currency={currency}
        />
      ) : activeTab === 'issues' ? (
        /* Issues List */
        <div className="space-y-4">
          {issues.length === 0 ? (
            <div className="p-8 text-center bg-muted rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-muted-foreground text-xs">
              No open project issues logged.
            </div>
          ) : (<>
            {paginate(issues, issPage, issPageSize).visible.map((iss) => (
              <div
                key={iss.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={iss.severity === 'critical' ? 'error' : iss.severity === 'high' ? 'warning' : 'gray'}>
                      {iss.severity.toUpperCase()} SEVERITY
                    </Badge>
                    <Badge variant={iss.status === 'resolved' ? 'success' : 'brand'}>
                      {iss.status.toUpperCase()}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-base text-foreground">{iss.title}</h3>
                  {iss.root_cause && (
                    <div className="text-xs text-muted-foreground mt-1">
                      <strong>Root Cause:</strong> {iss.root_cause}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <div>Schedule Impact: <strong className="text-foreground">{iss.impact_schedule_days} Days</strong></div>
                  <div>Cost Impact: <strong className="text-foreground">{formatCurrency(iss.impact_cost)}</strong></div>
                  {iss.status !== 'resolved' && <Button size="sm" variant="outline" onClick={() => { setResolvingIssue(iss); setResolution(''); }}>Resolve issue</Button>}
                </div>

              </div>
            ))}
            <ListPagination total={issues.length} page={issPage} pageSize={issPageSize} onPageChange={setIssPage} onPageSizeChange={setIssPageSize} noun="issues" />
          </>)}
        </div>
      ) : activeTab === 'changes' ? (
        /* Change Requests List */
        <div className="space-y-4">
          {changeRequests.length === 0 ? (
            <div className="p-8 text-center bg-muted rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-muted-foreground text-xs">
              No Change Requests submitted.
            </div>
          ) : (<>
            {paginate(changeRequests, crPage, crPageSize).visible.map((cr) => (
              <div
                key={cr.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-mono">
                      {cr.cr_number}
                    </span>
                    <Badge variant={cr.status === 'approved' ? 'success' : cr.status === 'rejected' ? 'error' : 'warning'}>
                      {cr.status.toUpperCase()}
                    </Badge>
                    {cr.client_approval_required && (
                      <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded">
                        Client Signoff Required
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-base text-foreground">{cr.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{cr.reason}</p>
                </div>

                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <div>Cost Impact: <strong className="text-foreground">{formatCurrency(cr.cost_impact)}</strong></div>
                  <div>Schedule Impact: <strong className="text-foreground">{cr.schedule_impact_days} Days</strong></div>
                </div>
                {cr.status === 'draft' && <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={() => {
                    setEditingCr(cr.id); setCrNumber(cr.cr_number); setCrTitle(cr.title); setCrReason(cr.reason);
                    setCrOriginalScope(cr.original_scope); setCrRequestedChange(cr.requested_change);
                    setCrCostImpact(String(cr.cost_impact)); setCrScheduleImpact(String(cr.schedule_impact_days));
                    setCrClientReq(cr.client_approval_required); setShowAddCrModal(true);
                  }}>Edit Draft</Button>
                  <Button size="sm" onClick={async () => {
                    try {
                      const people = await apiFetch(`/v1/project-os/projects/${projectId}/approval-approvers`);
                      setApproverOptions(people); setReviewSteps([{ step_name: 'Project review', assigned_user_id: '' }]); setSubmissionCr(cr.id);
                    } catch (error: any) { showAlert(error.message, { variant: 'error' }); }
                  }}>Configure Approval</Button>
                </div>}
              </div>
            ))}
            <ListPagination total={changeRequests.length} page={crPage} pageSize={crPageSize} onPageChange={setCrPage} onPageSizeChange={setCrPageSize} noun="requests" />
          </>)}
        </div>
      ) : (
        /* Multi-step Approvals List */
        <div className="space-y-4">
          {approvals.length === 0 ? (
            <div className="p-8 text-center bg-muted rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-muted-foreground text-xs">
              No active approval workflows found.
            </div>
          ) : (<>
            {paginate(approvals, apPage, apPageSize).visible.map((ap) => (
              <div
                key={ap.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <h4 className="font-bold text-sm text-foreground">{ap.title}</h4>
                    <span className="text-[11px] text-muted-foreground font-mono">Target: {ap.entity_type}</span>
                  </div>
                  <Badge variant={ap.status === 'approved' ? 'success' : ap.status === 'rejected' ? 'error' : 'warning'}>
                    {ap.status.toUpperCase()}
                  </Badge>
                </div>

                {ap.steps && ap.steps.length > 0 && (
                  <div className="space-y-2 mt-3 pt-3 border-t border-border">
                    {ap.steps.map((st: any) => (
                      <div key={st.id} className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">Step {st.step_order}: {st.step_name}</span>
                          <span className="text-[11px] text-muted-foreground">({st.status})</span>
                        </div>
                        {ap.status === 'pending' && st.status === 'pending' && st.step_order === ap.current_step && st.assigned_user_id === user?.id && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApprovalDecision(ap.id, st.id, 'approved')}
                              className="h-7 text-[11px] px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApprovalDecision(ap.id, st.id, 'rejected')}
                              className="h-7 text-[11px] px-2.5 text-rose-600 border-rose-200 hover:bg-rose-50"
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <ListPagination total={approvals.length} page={apPage} pageSize={apPageSize} onPageChange={setApPage} onPageSizeChange={setApPageSize} noun="approvals" />
          </>)}
        </div>
      )}

      {/* MODAL: ADD RISK */}
      {submissionCr && <Card>
          <CardHeader><CardTitle>Configure approval review</CardTitle></CardHeader>
          <form className="flex flex-col min-h-0 flex-1" onSubmit={async e => {
            e.preventDefault(); setSaving(true);
            try {
              await apiFetch(`/v1/project-os/projects/${projectId}/change-requests/${submissionCr}/submit`, { method: 'POST', body: JSON.stringify({ steps: reviewSteps }) });
              setSubmissionCr(null); await loadData(); propsOnRefresh?.();
              showAlert('Change request submitted for review', { variant: 'success' });
            } catch (error: any) { showAlert(error.message, { variant: 'error' }); }
            finally { setSaving(false); }
          }}>
            <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Reviews run in order. Select a different named approver for each step. Only the project owner or an administrator can submit.</p>
            {reviewSteps.map((step, index) => <div key={index} className="space-y-2 rounded-lg border p-3">
              <label className="block text-sm">Step {index + 1} name
                <Input required value={step.step_name} onChange={e => setReviewSteps(rows => rows.map((row, i) => i === index ? { ...row, step_name: e.target.value } : row))} />
              </label>
              <Combobox options={approverOptions.map(person => ({ value: person.id, label: person.name }))} value={step.assigned_user_id}
                placeholder={`Choose approver for step ${index + 1}`} onChange={value => setReviewSteps(rows => rows.map((row, i) => i === index ? { ...row, assigned_user_id: value } : row))} />
              {step.assigned_user_id && <PersonAvatar userId={step.assigned_user_id} name={approverOptions.find(person => person.id === step.assigned_user_id)?.name ?? 'Approver'} size={28} />}
              {reviewSteps.length > 1 && <Button type="button" variant="outline" size="sm" onClick={() => setReviewSteps(rows => rows.filter((_, i) => i !== index))}>Remove step</Button>}
            </div>)}
            <Button type="button" variant="outline" disabled={reviewSteps.length >= 10} onClick={() => setReviewSteps(rows => [...rows, { step_name: 'Review', assigned_user_id: '' }])}>Add review step</Button>
            </CardContent>
            <CardFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setSubmissionCr(null)}>Cancel</Button>
            <Button type="submit" disabled={saving || reviewSteps.some(step => !step.assigned_user_id)}>Submit for Review</Button>
            </CardFooter>
          </form>
      </Card>}
      {resolvingIssue && <form onSubmit={resolveIssue}><Card><CardHeader><CardTitle>Resolve: {resolvingIssue.title}</CardTitle></CardHeader><CardContent><label htmlFor="issue-resolution">Resolution evidence</label><Textarea id="issue-resolution" required value={resolution} onChange={event => setResolution(event.target.value)} rows={4}/></CardContent><CardFooter className="justify-end gap-2"><Button variant="outline" type="button" onClick={() => setResolvingIssue(null)}>Cancel</Button><Button type="submit" disabled={saving || !resolution.trim()}>Save resolution</Button></CardFooter></Card></form>}
      {showAddRiskModal && <Card>
          <CardContent>
            <CardHeader><CardTitle>Add Risk to Register</CardTitle></CardHeader>

            <form onSubmit={handleCreateRisk} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Risk Statement *
                </label>
                <Input
                  type="text"
                  required
                  value={riskTitle}
                  onChange={(e) => setRiskTitle(e.target.value)}
                  placeholder="e.g., Unanticipated geotechnical bedrock fault lines delaying excavation"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Probability
                  </label>
                  <Select
                    value={riskProb}
                    onValueChange={value => setRiskProb(value as typeof riskProb)}
                  >
                    <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unlikely">Unlikely (10%)</SelectItem>
                      <SelectItem value="possible">Possible (30%)</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="likely">Likely (60%)</SelectItem>
                      <SelectItem value="almost_certain">Almost Certain (90%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Impact
                  </label>
                  <Select
                    value={riskImpact}
                    onValueChange={value => setRiskImpact(value as typeof riskImpact)}
                  >
                    <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="negligible">Negligible</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Financial Exposure ({currency})
                  </label>
                  <Input
                    type="number"
                    value={riskExposure}
                    onChange={(e) => setRiskExposure(e.target.value)}
                    placeholder="250000"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Response Strategy
                  </label>
                  <Select
                    value={riskStrategy}
                    onValueChange={value => setRiskStrategy(value as typeof riskStrategy)}
                  >
                    <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mitigate">Mitigate</SelectItem>
                      <SelectItem value="avoid">Avoid</SelectItem>
                      <SelectItem value="transfer">Transfer (Insurance/Contract)</SelectItem>
                      <SelectItem value="accept">Accept</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Mitigation Plan
                </label>
                <Textarea
                  rows={2}
                  value={riskPlan}
                  onChange={(e) => setRiskPlan(e.target.value)}
                  placeholder="Preventative actions and fallback contingencies..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddRiskModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-primary text-primary-foreground">
                  {saving ? 'Adding...' : 'Add Risk'}
                </Button>
              </div>
            </form>
          </CardContent>
      </Card>}

      {/* MODAL: ADD ISSUE */}
      {showAddIssueModal && <Card>
          <CardContent>
            <CardHeader><CardTitle>Log Project Issue</CardTitle></CardHeader>

            <form onSubmit={handleCreateIssue} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Issue Summary *
                </label>
                <Input
                  type="text"
                  required
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  placeholder="e.g., Concrete supply batch quality failure on Level 2"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Severity
                  </label>
                  <Select
                    value={issueSeverity}
                    onValueChange={value => setIssueSeverity(value as typeof issueSeverity)}
                  >
                    <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Schedule Delay (Days)
                  </label>
                  <Input
                    type="number"
                    value={issueImpactDays}
                    onChange={(e) => setIssueImpactDays(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Cost Impact ({currency})
                  </label>
                  <Input
                    type="number"
                    value={issueImpactCost}
                    onChange={(e) => setIssueImpactCost(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Root Cause Analysis
                </label>
                <Textarea
                  rows={2}
                  value={issueRootCause}
                  onChange={(e) => setIssueRootCause(e.target.value)}
                  placeholder="Primary root cause and corrective action..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddIssueModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-primary text-primary-foreground">
                  {saving ? 'Logging...' : 'Log Issue'}
                </Button>
              </div>
            </form>
          </CardContent>
      </Card>}

      {/* MODAL: ADD CHANGE REQUEST */}
      {showAddCrModal && <Card>
          <CardContent>
            <CardHeader><CardTitle>Draft Change Request (CR)</CardTitle></CardHeader>

            <form onSubmit={handleCreateCr} className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">Save the proposed change as a draft. Approval submission requires configured approvers.</p>
              <label className="block text-sm">Original scope *
                <Textarea required value={crOriginalScope} onChange={e => setCrOriginalScope(e.target.value)} />
              </label>
              <label className="block text-sm">Requested change *
                <Textarea required value={crRequestedChange} onChange={e => setCrRequestedChange(e.target.value)} />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    CR Number
                  </label>
                  <Input
                    type="text"
                    required
                    value={crNumber}
                    disabled={Boolean(editingCr)}
                    onChange={(e) => setCrNumber(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Change Title *
                  </label>
                  <Input
                    type="text"
                    required
                    value={crTitle}
                    onChange={(e) => setCrTitle(e.target.value)}
                    placeholder="e.g., Expansion of substation transformer capacity"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Cost Impact ({currency})
                  </label>
                  <Input
                    type="number"
                    value={crCostImpact}
                    onChange={(e) => setCrCostImpact(e.target.value)}
                    placeholder="120000"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Schedule Impact (Days)
                  </label>
                  <Input
                    type="number"
                    value={crScheduleImpact}
                    onChange={(e) => setCrScheduleImpact(e.target.value)}
                    placeholder="14"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Reason for Change *
                </label>
                <Textarea
                  rows={2}
                  required
                  value={crReason}
                  onChange={(e) => setCrReason(e.target.value)}
                  placeholder="Justification and scope modifications..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="crClient"
                  checked={crClientReq}
                  onCheckedChange={checked => setCrClientReq(Boolean(checked))}
                />
                <label htmlFor="crClient" className="text-xs text-foreground font-semibold cursor-pointer">
                  Requires Formal Client / Funder Counter-Signoff
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddCrModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-primary text-primary-foreground">
                  {saving ? 'Saving...' : 'Save Draft'}
                </Button>
              </div>
            </form>
          </CardContent>
      </Card>}
    </div>
  );
};
