import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog.js';
import { ListPagination, paginate } from '../../components/ui/list-pagination.js';
import type { ProjectPhase, ProjectWorkPackage, ProjectDeliverable } from '@hudumika/types';

interface ProjectWbsScheduleProps {
  projectId: string;
  phases?: ProjectPhase[];
  workPackages?: ProjectWorkPackage[];
  deliverables?: ProjectDeliverable[];
  onRefresh?: () => void;
  currency?: string;
}

export const ProjectWbsSchedule: React.FC<ProjectWbsScheduleProps> = ({
  projectId,
  phases: propsPhases,
  workPackages: propsWorkPackages,
  deliverables: propsDeliverables,
  onRefresh: propsOnRefresh,
  currency = 'KES',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'wbs' | 'phases' | 'deliverables'>('wbs');
  const [phases, setPhases] = useState<ProjectPhase[]>(propsPhases || []);
  const [workPackages, setWorkPackages] = useState<ProjectWorkPackage[]>(propsWorkPackages || []);
  const [deliverables, setDeliverables] = useState<ProjectDeliverable[]>(propsDeliverables || []);
  const [loading, setLoading] = useState(!propsPhases && !propsWorkPackages && !propsDeliverables);
  const [wbsPage, setWbsPage] = useState(1);
  const [wbsPageSize, setWbsPageSize] = useState(25);
  const [phPage, setPhPage] = useState(1);
  const [phPageSize, setPhPageSize] = useState(25);
  const [delPage, setDelPage] = useState(1);
  const [delPageSize, setDelPageSize] = useState(25);

  useEffect(() => { setWbsPage(1); setPhPage(1); setDelPage(1); }, [activeSubTab]);

  const [showAddWbsModal, setShowAddWbsModal] = useState(false);
  const [showAddPhaseModal, setShowAddPhaseModal] = useState(false);
  const [showAddDeliverableModal, setShowAddDeliverableModal] = useState(false);

  // WBS Form
  const [wbsCode, setWbsCode] = useState('');
  const [wbsName, setWbsName] = useState('');
  const [wbsPhaseId, setWbsPhaseId] = useState('');
  const [wbsPlannedCost, setWbsPlannedCost] = useState('');
  const [wbsPlannedStart, setWbsPlannedStart] = useState('');
  const [wbsPlannedEnd, setWbsPlannedEnd] = useState('');
  const [wbsDesc, setWbsDesc] = useState('');

  // Phase Form
  const [phaseName, setPhaseName] = useState('');
  const [phaseCode, setPhaseCode] = useState('');
  const [phaseGateDate, setPhaseGateDate] = useState('');
  const [phaseRole, setPhaseRole] = useState('Project Director');

  // Deliverable Form
  const [delivTitle, setDelivTitle] = useState('');
  const [delivCode, setDelivCode] = useState('');
  const [delivWpId, setDelivWpId] = useState('');
  const [delivDueDate, setDelivDueDate] = useState('');
  const [delivCriteria, setDelivCriteria] = useState('');

  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (propsPhases && propsWorkPackages && propsDeliverables) {
      setPhases(propsPhases);
      setWorkPackages(propsWorkPackages);
      setDeliverables(propsDeliverables);
      return;
    }
    setLoading(true);
    try {
      const [phRes, wpRes, delivRes] = await Promise.all([
        apiFetch(`/v1/project-os/projects/${projectId}/phases`),
        apiFetch(`/v1/project-os/projects/${projectId}/work-packages`),
        apiFetch(`/v1/project-os/projects/${projectId}/deliverables`),
      ]);
      setPhases(Array.isArray(phRes) ? phRes : phRes.data || []);
      setWorkPackages(Array.isArray(wpRes) ? wpRes : wpRes.data || []);
      setDeliverables(Array.isArray(delivRes) ? delivRes : delivRes.data || []);
    } catch {
      setPhases([]);
      setWorkPackages([]);
      setDeliverables([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, propsPhases, propsWorkPackages, propsDeliverables]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateWbs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wbsCode.trim() || !wbsName.trim()) {
      showAlert('WBS Code and Name are required', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/project-os/projects/${projectId}/work-packages`, {
        method: 'POST',
        body: JSON.stringify({
          wbs_code: wbsCode.trim(),
          name: wbsName.trim(),
          phase_id: wbsPhaseId || null,
          planned_cost: parseFloat(wbsPlannedCost) || 0,
          planned_start: wbsPlannedStart || null,
          planned_end: wbsPlannedEnd || null,
          description: wbsDesc.trim() || null,
        }),
      });
      showAlert('Work package added to WBS', { variant: 'success' });
      setShowAddWbsModal(false);
      setWbsCode('');
      setWbsName('');
      setWbsPhaseId('');
      setWbsPlannedCost('');
      setWbsPlannedStart('');
      setWbsPlannedEnd('');
      setWbsDesc('');
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add work package', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePhase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phaseName.trim()) {
      showAlert('Phase Name is required', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/project-os/projects/${projectId}/phases`, {
        method: 'POST',
        body: JSON.stringify({
          name: phaseName.trim(),
          code: phaseCode.trim() || null,
          gate_review_date: phaseGateDate || null,
          gate_approver_role: phaseRole || null,
        }),
      });
      showAlert('Phase created successfully', { variant: 'success' });
      setShowAddPhaseModal(false);
      setPhaseName('');
      setPhaseCode('');
      setPhaseGateDate('');
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create phase', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!delivTitle.trim()) {
      showAlert('Deliverable title is required', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/project-os/projects/${projectId}/deliverables`, {
        method: 'POST',
        body: JSON.stringify({
          title: delivTitle.trim(),
          code: delivCode.trim() || null,
          work_package_id: delivWpId || null,
          due_date: delivDueDate || null,
          acceptance_criteria: delivCriteria.trim() || null,
        }),
      });
      showAlert('Deliverable created successfully', { variant: 'success' });
      setShowAddDeliverableModal(false);
      setDelivTitle('');
      setDelivCode('');
      setDelivWpId('');
      setDelivDueDate('');
      setDelivCriteria('');
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create deliverable', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handlePhaseGateSignoff = async (phaseId: string, passed: boolean) => {
    try {
      await apiFetch(`/v1/project-os/phases/${phaseId}/gate`, {
        method: 'PATCH',
        body: JSON.stringify({ passed, status: passed ? 'completed' : 'under_review' }),
      });
      showAlert(passed ? 'Stage Gate Approved & Passed' : 'Stage Gate Returned for Review', { variant: 'success' });
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update gate', { variant: 'error' });
    }
  };

  const handleDeliverableReview = async (deliverableId: string, status: 'approved' | 'rejected') => {
    try {
      await apiFetch(`/v1/project-os/deliverables/${deliverableId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      showAlert(`Deliverable ${status}`, { variant: 'success' });
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to review deliverable', { variant: 'error' });
    }
  };

  const formatCurrency = (val: number) => `${currency} ${Number(val || 0).toLocaleString()}`;

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-3">
        <div className="flex items-center gap-2" data-ds-tabstrip="">
          <button
            onClick={() => setActiveSubTab('wbs')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeSubTab === 'wbs'
                ? 'bg-teal-600 text-white'
                : 'text-muted-foreground hover:bg-muted'
            }`}
           data-ds-selected={activeSubTab === 'wbs'} data-ui-native-button="" aria-pressed={activeSubTab === 'wbs'}>
            WBS Tree ({workPackages.length})
          </button>
          <button
            onClick={() => setActiveSubTab('phases')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeSubTab === 'phases'
                ? 'bg-teal-600 text-white'
                : 'text-muted-foreground hover:bg-muted'
            }`}
           data-ds-selected={activeSubTab === 'phases'} data-ui-native-button="" aria-pressed={activeSubTab === 'phases'}>
            Phases & Stage Gates ({phases.length})
          </button>
          <button
            onClick={() => setActiveSubTab('deliverables')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeSubTab === 'deliverables'
                ? 'bg-teal-600 text-white'
                : 'text-muted-foreground hover:bg-muted'
            }`}
           data-ds-selected={activeSubTab === 'deliverables'} data-ui-native-button="" aria-pressed={activeSubTab === 'deliverables'}>
            Deliverables & Signoffs ({deliverables.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeSubTab === 'wbs' && (
            <Button size="sm" onClick={() => setShowAddWbsModal(true)} className="bg-primary text-primary-foreground">
              <Icon name="plus" size={14} className="mr-1" /> Add Work Package
            </Button>
          )}
          {activeSubTab === 'phases' && (
            <Button size="sm" onClick={() => setShowAddPhaseModal(true)} className="bg-primary text-primary-foreground">
              <Icon name="plus" size={14} className="mr-1" /> Add Project Phase
            </Button>
          )}
          {activeSubTab === 'deliverables' && (
            <Button size="sm" onClick={() => setShowAddDeliverableModal(true)} className="bg-primary text-primary-foreground">
              <Icon name="plus" size={14} className="mr-1" /> Add Deliverable
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <SectionLoading />
      ) : activeSubTab === 'wbs' ? (
        /* WBS Tree Table */
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-border text-muted-foreground font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">WBS Code</th>
                  <th className="py-3 px-4">Work Package Name</th>
                  <th className="py-3 px-4">Phase</th>
                  <th className="py-3 px-4 text-right">Planned Cost</th>
                  <th className="py-3 px-4 text-center">Progress</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Planned Dates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {workPackages.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No Work Packages configured. Add items to establish the hierarchical Work Breakdown Structure.
                    </td>
                  </tr>
                ) : (
                  paginate(workPackages, wbsPage, wbsPageSize).visible.map((wp) => (
                    <tr key={wp.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30">
                      <td className="py-3 px-4 font-mono font-bold text-primary">
                        {wp.wbs_code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-foreground">{wp.name}</div>
                        {wp.description && (
                          <div className="text-[11px] text-muted-foreground line-clamp-1">{wp.description}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {wp.phase_name || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-foreground">
                        {formatCurrency(wp.planned_cost)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <div className="w-16 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-500 rounded-full"
                              style={{ width: `${wp.progress_pct}%` }}
                            />
                          </div>
                          <span className="font-bold text-[11px] text-slate-600 dark:text-slate-300">
                            {wp.progress_pct}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={wp.status === 'completed' ? 'success' : wp.status === 'in_progress' ? 'brand' : 'gray'}>
                          {wp.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-[11px]">
                        {wp.planned_start && wp.planned_end
                          ? `${wp.planned_start} → ${wp.planned_end}`
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <ListPagination total={workPackages.length} page={wbsPage} pageSize={wbsPageSize} onPageChange={setWbsPage} onPageSizeChange={setWbsPageSize} noun="packages" />
        </div>
      ) : activeSubTab === 'phases' ? (
        /* Phases & Stage Gates List */
        <div className="space-y-4">
          {phases.length === 0 ? (
            <div className="p-8 text-center bg-muted rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-muted-foreground text-xs">
              No project phases defined. Add phases to enforce stage-gate approval reviews.
            </div>
          ) : (<>
            {paginate(phases, phPage, phPageSize).visible.map((ph) => (
              <div
                key={ph.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-primary bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800">
                      Phase {ph.sequence_order || 1}
                    </span>
                    <Badge variant={ph.status === 'completed' ? 'success' : ph.status === 'in_progress' ? 'brand' : 'gray'}>
                      {ph.status.toUpperCase()}
                    </Badge>
                    {ph.gate_passed && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200">
                        <Icon name="check" size={12} /> Stage Gate Approved
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-base text-foreground">{ph.name}</h3>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-4 flex-wrap">
                    <span>Approver Role: <strong className="text-foreground">{ph.gate_approver_role || 'Project Director'}</strong></span>
                    {ph.gate_review_date && (
                      <span>Gate Review Due: <strong className="text-foreground">{ph.gate_review_date}</strong></span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  {!ph.gate_passed ? (
                    <Button
                      size="sm"
                      onClick={() => handlePhaseGateSignoff(ph.id, true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                    >
                      <Icon name="check" size={14} className="mr-1" /> Approve Stage Gate
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePhaseGateSignoff(ph.id, false)}
                      className="text-amber-600 border-amber-300 hover:bg-amber-50 text-xs"
                    >
                      Reopen Review
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <ListPagination total={phases.length} page={phPage} pageSize={phPageSize} onPageChange={setPhPage} onPageSizeChange={setPhPageSize} noun="phases" />
          </>)}
        </div>
      ) : (
        /* Deliverables List */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {deliverables.length === 0 ? (
            <div className="col-span-full p-8 text-center bg-muted rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-muted-foreground text-xs">
              No deliverables registered. Add contractual deliverables with acceptance criteria.
            </div>
          ) : (<>
            {paginate(deliverables, delPage, delPageSize).visible.map((deliv) => (
              <div
                key={deliv.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-bold text-muted-foreground font-mono">
                      {deliv.code || 'DEL-00'}
                    </span>
                    <Badge variant={deliv.status === 'approved' ? 'success' : deliv.status === 'rejected' ? 'error' : 'warning'}>
                      {deliv.status.toUpperCase()}
                    </Badge>
                  </div>
                  <h4 className="font-bold text-sm text-foreground line-clamp-1">
                    {deliv.title}
                  </h4>
                  {deliv.acceptance_criteria && (
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-2 bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 line-clamp-2">
                      <strong className="text-foreground">Acceptance Criteria: </strong>
                      {deliv.acceptance_criteria}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    Due: {deliv.due_date || 'N/A'}
                  </span>
                  {deliv.status !== 'approved' && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => handleDeliverableReview(deliv.id, 'approved')}
                        className="h-7 text-[11px] px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeliverableReview(deliv.id, 'rejected')}
                        className="h-7 text-[11px] px-2.5 text-rose-600 border-rose-200 hover:bg-rose-50"
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <ListPagination total={deliverables.length} page={delPage} pageSize={delPageSize} onPageChange={setDelPage} onPageSizeChange={setDelPageSize} noun="deliverables" />
          </>)}
        </div>
      )}

      {/* MODAL: ADD WBS WORK PACKAGE */}
      <Dialog open={showAddWbsModal} onOpenChange={setShowAddWbsModal}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Work Package to WBS</DialogTitle></DialogHeader>

            <form onSubmit={handleCreateWbs} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    WBS Code *
                  </label>
                  <Input
                    type="text"
                    required
                    value={wbsCode}
                    onChange={(e) => setWbsCode(e.target.value)}
                    placeholder="e.g., 1.1.2"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Phase
                  </label>
                  <Combobox
                    value={wbsPhaseId}
                    onChange={setWbsPhaseId}
                    options={[{ value: '', label: 'No phase' }, ...phases.map(phase => ({ value: phase.id, label: phase.name }))]}
                    placeholder="Select phase"
                    searchPlaceholder="Search phases"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Work Package Name *
                </label>
                <Input
                  type="text"
                  required
                  value={wbsName}
                  onChange={(e) => setWbsName(e.target.value)}
                  placeholder="e.g., Substructure Concrete Pouring"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Planned Cost ({currency})
                  </label>
                  <Input
                    type="number"
                    value={wbsPlannedCost}
                    onChange={(e) => setWbsPlannedCost(e.target.value)}
                    placeholder="450000"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Planned Start
                  </label>
                  <DatePicker date={parseDateOnly(wbsPlannedStart)} onChange={date => setWbsPlannedStart(toDateOnlyString(date))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Planned End
                  </label>
                  <DatePicker date={parseDateOnly(wbsPlannedEnd)} onChange={date => setWbsPlannedEnd(toDateOnlyString(date))} />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Scope Description
                </label>
                <Textarea
                  rows={2}
                  value={wbsDesc}
                  onChange={(e) => setWbsDesc(e.target.value)}
                  placeholder="Detailed work package specifications..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddWbsModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-primary text-primary-foreground">
                  {saving ? 'Adding...' : 'Add Work Package'}
                </Button>
              </div>
            </form>
          </DialogContent>
      </Dialog>

      {/* MODAL: ADD PHASE */}
      <Dialog open={showAddPhaseModal} onOpenChange={setShowAddPhaseModal}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Project Phase</DialogTitle></DialogHeader>

            <form onSubmit={handleCreatePhase} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Phase Name *
                </label>
                <Input
                  type="text"
                  required
                  value={phaseName}
                  onChange={(e) => setPhaseName(e.target.value)}
                  placeholder="e.g., Phase 1: Ground Engineering & Civil Foundation"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Stage Gate Review Date
                  </label>
                  <DatePicker date={parseDateOnly(phaseGateDate)} onChange={date => setPhaseGateDate(toDateOnlyString(date))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Approver Role
                  </label>
                  <Input
                    type="text"
                    value={phaseRole}
                    onChange={(e) => setPhaseRole(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddPhaseModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-primary text-primary-foreground">
                  {saving ? 'Creating...' : 'Create Phase'}
                </Button>
              </div>
            </form>
          </DialogContent>
      </Dialog>

      {/* MODAL: ADD DELIVERABLE */}
      <Dialog open={showAddDeliverableModal} onOpenChange={setShowAddDeliverableModal}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Contractual Deliverable</DialogTitle></DialogHeader>

            <form onSubmit={handleCreateDeliverable} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Deliverable Title *
                </label>
                <Input
                  type="text"
                  required
                  value={delivTitle}
                  onChange={(e) => setDelivTitle(e.target.value)}
                  placeholder="e.g., As-Built Structural Engineering Drawings"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Deliverable Code
                  </label>
                  <Input
                    type="text"
                    value={delivCode}
                    onChange={(e) => setDelivCode(e.target.value)}
                    placeholder="DEL-STR-01"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Due Date
                  </label>
                  <DatePicker date={parseDateOnly(delivDueDate)} onChange={date => setDelivDueDate(toDateOnlyString(date))} />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Acceptance Criteria
                </label>
                <Textarea
                  rows={2}
                  value={delivCriteria}
                  onChange={(e) => setDelivCriteria(e.target.value)}
                  placeholder="Specific technical verification requirements..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddDeliverableModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-primary text-primary-foreground">
                  {saving ? 'Creating...' : 'Create Deliverable'}
                </Button>
              </div>
            </form>
          </DialogContent>
      </Dialog>
    </div>
  );
};
