import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { SectionLoading } from '../../components/ui/spinner.js';
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
  const [activeTab, setActiveTab] = useState<'risks' | 'issues' | 'changes' | 'approvals'>('risks');

  const [risks, setRisks] = useState<ProjectRisk[]>(propsRisks || []);
  const [issues, setIssues] = useState<ProjectIssue[]>(propsIssues || []);
  const [changeRequests, setChangeRequests] = useState<ProjectChangeRequest[]>(propsChangeRequests || []);
  const [approvals, setApprovals] = useState<(ProjectApproval & { steps?: any[] })[]>(propsApprovals || []);
  const [loading, setLoading] = useState(!propsRisks && !propsIssues && !propsChangeRequests);

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
  const [crNumber, setCrNumber] = useState(`CR-${Math.floor(1000 + Math.random() * 9000)}`);
  const [crTitle, setCrTitle] = useState('');
  const [crReason, setCrReason] = useState('');
  const [crCostImpact, setCrCostImpact] = useState('0');
  const [crScheduleImpact, setCrScheduleImpact] = useState('0');
  const [crClientReq, setCrClientReq] = useState(false);

  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (propsRisks && propsIssues && propsChangeRequests && propsApprovals) {
      setRisks(propsRisks);
      setIssues(propsIssues);
      setChangeRequests(propsChangeRequests);
      setApprovals(propsApprovals);
      return;
    }
    setLoading(true);
    try {
      const [rRes, iRes, crRes, apRes] = await Promise.all([
        apiFetch(`/v1/project-os/projects/${projectId}/risks`),
        apiFetch(`/v1/project-os/projects/${projectId}/issues`),
        apiFetch(`/v1/project-os/projects/${projectId}/change-requests`),
        apiFetch(`/v1/project-os/approvals?projectId=${projectId}`),
      ]);
      setRisks(Array.isArray(rRes) ? rRes : rRes.data || []);
      setIssues(Array.isArray(iRes) ? iRes : iRes.data || []);
      setChangeRequests(Array.isArray(crRes) ? crRes : crRes.data || []);
      setApprovals(Array.isArray(apRes) ? apRes : apRes.data || []);
    } catch {
      setRisks([]);
      setIssues([]);
      setChangeRequests([]);
      setApprovals([]);
    } finally {
      setLoading(false);
    }
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
      await apiFetch(`/v1/project-os/projects/${projectId}/change-requests`, {
        method: 'POST',
        body: JSON.stringify({
          cr_number: crNumber.trim(),
          title: crTitle.trim(),
          reason: crReason.trim(),
          cost_impact: parseFloat(crCostImpact) || 0,
          schedule_impact_days: parseInt(crScheduleImpact, 10) || 0,
          client_approval_required: crClientReq,
        }),
      });
      showAlert('Change Request submitted for approval review', { variant: 'success' });
      setShowAddCrModal(false);
      setCrTitle('');
      setCrReason('');
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

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('risks')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'risks'
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            5x5 Risk Register ({risks.length})
          </button>
          <button
            onClick={() => setActiveTab('issues')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'issues'
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Issues Log ({issues.length})
          </button>
          <button
            onClick={() => setActiveTab('changes')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'changes'
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Change Requests ({changeRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('approvals')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'approvals'
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Multi-Step Approvals ({approvals.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'risks' && (
            <Button size="sm" onClick={() => setShowAddRiskModal(true)} className="bg-teal-600 hover:bg-teal-700 text-white">
              <Icon name="plus" size={14} className="mr-1" /> Add Risk Item
            </Button>
          )}
          {activeTab === 'issues' && (
            <Button size="sm" onClick={() => setShowAddIssueModal(true)} className="bg-teal-600 hover:bg-teal-700 text-white">
              <Icon name="plus" size={14} className="mr-1" /> Log Project Issue
            </Button>
          )}
          {activeTab === 'changes' && (
            <Button size="sm" onClick={() => setShowAddCrModal(true)} className="bg-teal-600 hover:bg-teal-700 text-white">
              <Icon name="plus" size={14} className="mr-1" /> New Change Request
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <SectionLoading />
      ) : activeTab === 'risks' ? (
        /* Risks Table */
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Risk Item</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-center">Probability</th>
                  <th className="py-3 px-4 text-center">Impact</th>
                  <th className="py-3 px-4 text-center">Risk Score</th>
                  <th className="py-3 px-4 text-right">Financial Exposure</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {risks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No risks recorded in the 5x5 matrix. Add items to establish risk exposure control.
                    </td>
                  </tr>
                ) : (
                  risks.map((r) => {
                    const score = r.risk_score || 0;
                    const scoreBadge = score >= 15 ? 'bg-rose-100 text-rose-700' : score >= 8 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 dark:text-white">{r.title}</div>
                          {r.mitigation_plan && (
                            <div className="text-[11px] text-slate-400 line-clamp-1">Plan: {r.mitigation_plan}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 uppercase font-semibold text-[10px]">
                          {r.category}
                        </td>
                        <td className="py-3 px-4 text-center capitalize">{r.probability.replace('_', ' ')}</td>
                        <td className="py-3 px-4 text-center capitalize">{r.impact}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${scoreBadge}`}>
                            {score}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                          {formatCurrency(r.financial_exposure)}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={r.status === 'closed' ? 'success' : r.status === 'mitigated' ? 'brand' : 'warning'}>
                            {r.status.toUpperCase()}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'issues' ? (
        /* Issues List */
        <div className="space-y-4">
          {issues.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 text-xs">
              No open project issues logged.
            </div>
          ) : (
            issues.map((iss) => (
              <div
                key={iss.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
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
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">{iss.title}</h3>
                  {iss.root_cause && (
                    <div className="text-xs text-slate-500 mt-1">
                      <strong>Root Cause:</strong> {iss.root_cause}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-6 text-xs text-slate-500">
                  <div>Schedule Impact: <strong className="text-slate-900 dark:text-white">{iss.impact_schedule_days} Days</strong></div>
                  <div>Cost Impact: <strong className="text-slate-900 dark:text-white">{formatCurrency(iss.impact_cost)}</strong></div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : activeTab === 'changes' ? (
        /* Change Requests List */
        <div className="space-y-4">
          {changeRequests.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 text-xs">
              No Change Requests submitted.
            </div>
          ) : (
            changeRequests.map((cr) => (
              <div
                key={cr.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
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
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">{cr.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{cr.reason}</p>
                </div>

                <div className="flex items-center gap-6 text-xs text-slate-500">
                  <div>Cost Impact: <strong className="text-slate-900 dark:text-white">{formatCurrency(cr.cost_impact)}</strong></div>
                  <div>Schedule Impact: <strong className="text-slate-900 dark:text-white">{cr.schedule_impact_days} Days</strong></div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Multi-step Approvals List */
        <div className="space-y-4">
          {approvals.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 text-xs">
              No active approval workflows found.
            </div>
          ) : (
            approvals.map((ap) => (
              <div
                key={ap.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">{ap.title}</h4>
                    <span className="text-[11px] text-slate-400 font-mono">Target: {ap.target_entity_type}</span>
                  </div>
                  <Badge variant={ap.status === 'approved' ? 'success' : ap.status === 'rejected' ? 'error' : 'warning'}>
                    {ap.status.toUpperCase()}
                  </Badge>
                </div>

                {ap.steps && ap.steps.length > 0 && (
                  <div className="space-y-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                    {ap.steps.map((st: any) => (
                      <div key={st.id} className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-700 dark:text-slate-300">Step {st.step_order}: {st.role_required}</span>
                          <span className="text-[11px] text-slate-400">({st.decision})</span>
                        </div>
                        {st.decision === 'pending' && (
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
            ))
          )}
        </div>
      )}

      {/* MODAL: ADD RISK */}
      {showAddRiskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Add Risk to Register</h3>
              <button onClick={() => setShowAddRiskModal(false)} className="text-slate-400 hover:text-slate-600">
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateRisk} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Risk Statement *
                </label>
                <input
                  type="text"
                  required
                  value={riskTitle}
                  onChange={(e) => setRiskTitle(e.target.value)}
                  placeholder="e.g., Unanticipated geotechnical bedrock fault lines delaying excavation"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Probability
                  </label>
                  <select
                    value={riskProb}
                    onChange={(e: any) => setRiskProb(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  >
                    <option value="unlikely">Unlikely (10%)</option>
                    <option value="possible">Possible (30%)</option>
                    <option value="likely">Likely (60%)</option>
                    <option value="almost_certain">Almost Certain (90%)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Impact
                  </label>
                  <select
                    value={riskImpact}
                    onChange={(e: any) => setRiskImpact(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  >
                    <option value="negligible">Negligible</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Financial Exposure ({currency})
                  </label>
                  <input
                    type="number"
                    value={riskExposure}
                    onChange={(e) => setRiskExposure(e.target.value)}
                    placeholder="250000"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Response Strategy
                  </label>
                  <select
                    value={riskStrategy}
                    onChange={(e: any) => setRiskStrategy(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  >
                    <option value="mitigate">Mitigate</option>
                    <option value="avoid">Avoid</option>
                    <option value="transfer">Transfer (Insurance/Contract)</option>
                    <option value="accept">Accept</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Mitigation Plan
                </label>
                <textarea
                  rows={2}
                  value={riskPlan}
                  onChange={(e) => setRiskPlan(e.target.value)}
                  placeholder="Preventative actions and fallback contingencies..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddRiskModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {saving ? 'Adding...' : 'Add Risk'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD ISSUE */}
      {showAddIssueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Log Project Issue</h3>
              <button onClick={() => setShowAddIssueModal(false)} className="text-slate-400 hover:text-slate-600">
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateIssue} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Issue Summary *
                </label>
                <input
                  type="text"
                  required
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  placeholder="e.g., Concrete supply batch quality failure on Level 2"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Severity
                  </label>
                  <select
                    value={issueSeverity}
                    onChange={(e: any) => setIssueSeverity(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Schedule Delay (Days)
                  </label>
                  <input
                    type="number"
                    value={issueImpactDays}
                    onChange={(e) => setIssueImpactDays(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Cost Impact ({currency})
                  </label>
                  <input
                    type="number"
                    value={issueImpactCost}
                    onChange={(e) => setIssueImpactCost(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Root Cause Analysis
                </label>
                <textarea
                  rows={2}
                  value={issueRootCause}
                  onChange={(e) => setIssueRootCause(e.target.value)}
                  placeholder="Primary root cause and corrective action..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddIssueModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {saving ? 'Logging...' : 'Log Issue'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CHANGE REQUEST */}
      {showAddCrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Submit Change Request (CR)</h3>
              <button onClick={() => setShowAddCrModal(false)} className="text-slate-400 hover:text-slate-600">
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCr} className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    CR Number
                  </label>
                  <input
                    type="text"
                    required
                    value={crNumber}
                    onChange={(e) => setCrNumber(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Change Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={crTitle}
                    onChange={(e) => setCrTitle(e.target.value)}
                    placeholder="e.g., Expansion of substation transformer capacity"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Cost Impact ({currency})
                  </label>
                  <input
                    type="number"
                    value={crCostImpact}
                    onChange={(e) => setCrCostImpact(e.target.value)}
                    placeholder="120000"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Schedule Impact (Days)
                  </label>
                  <input
                    type="number"
                    value={crScheduleImpact}
                    onChange={(e) => setCrScheduleImpact(e.target.value)}
                    placeholder="14"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Reason for Change *
                </label>
                <textarea
                  rows={2}
                  required
                  value={crReason}
                  onChange={(e) => setCrReason(e.target.value)}
                  placeholder="Justification and scope modifications..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="crClient"
                  checked={crClientReq}
                  onChange={(e) => setCrClientReq(e.target.checked)}
                  className="rounded text-teal-600"
                />
                <label htmlFor="crClient" className="text-xs text-slate-700 dark:text-slate-300 font-semibold cursor-pointer">
                  Requires Formal Client / Funder Counter-Signoff
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddCrModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {saving ? 'Submitting...' : 'Submit Change Request'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
