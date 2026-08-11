import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import type { Workflow } from '@hudumika/types';
import { showAlert } from '../../lib/alert.js';
import './Workflows.css';
import { showConfirm } from '../../lib/confirm.js';
import { PageHeader } from '../../components/PageHeader.js';
import { useAuth } from '../../hooks/useAuth.js';

export type { FieldCondition, AutoComm, WorkflowStep, WorkflowTrigger, Workflow } from '@hudumika/types';

// ── Assignment matrix config ─────────────────────────────────────────────────

const FREIGHT_MODES = ['Sea', 'Air', 'Road', 'Rail', 'Multimodal'];
const CONSIGNMENT_TYPES = ['Import', 'Export', 'Transit', 'Re-Export', 'Warehousing'];
const FREIGHT_MODE_ICON: Record<string, IconName> = {
  Sea: 'ship', Air: 'plane', Road: 'truck', Rail: 'train', Multimodal: 'globe',
};

// Radix SelectItem can't have an empty-string value — this sentinel stands
// in for "no assignment / use the default workflow" and is translated back
// to null at the onChange boundary.
const DEFAULT_SENTINEL = '__default__';

type AssignmentKey = string; // `${freightMode}_${consignmentType}`
type AssignmentMap = Record<AssignmentKey, string | null>; // null = default

function buildDefaultAssignment(wfs: Workflow[]): AssignmentMap {
  const map: AssignmentMap = {};
  FREIGHT_MODES.forEach(fm => {
    CONSIGNMENT_TYPES.forEach(ct => {
      const key = `${fm.toLowerCase()}_${ct.toLowerCase()}`;
      const matched = wfs.find(w =>
        w.triggers.freightModes.includes(fm.toLowerCase()) &&
        w.triggers.consignmentTypes.includes(ct.toLowerCase())
      );
      map[key] = matched?.id ?? null;
    });
  });
  return map;
}

// ── Main component ───────────────────────────────────────────────────────────

export function ClearanceWorkflowList() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<AssignmentMap>({});
  const [templates, setTemplates] = useState<any[]>([]);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [learning, setLearning] = useState<{ signals: any[]; proposals: any[] }>({ signals: [], proposals: [] });
  const [deciding, setDeciding] = useState<string | null>(null);
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const loadLearning = useCallback(() => {
    apiFetch('/v1/workflows/learning')
      .then(res => setLearning({ signals: (res as any).data?.signals ?? [], proposals: (res as any).data?.proposals ?? [] }))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/workflows')
      .then(res => {
        const list: Workflow[] = res.data ?? [];
        setWorkflows(list);
        setAssignment(buildDefaultAssignment(list));
      })
      .catch(err => setError(err.message || 'Failed to load workflows'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // The platform template library (superadmin-published, latest version each).
  useEffect(() => {
    apiFetch('/v1/workflows/templates')
      .then(res => setTemplates((res as any).data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadLearning(); }, [loadLearning]);

  // Superadmin approves/rejects a machine-proposed template version. Approval
  // publishes it as a real new version tenants can then adopt.
  const decideProposal = async (id: string, decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !(await showConfirm('Reject this proposed version? It will be archived.', { confirmLabel: 'Reject' }))) return;
    setDeciding(id);
    try {
      await apiFetch(`/v1/superadmin/workflow-templates/proposals/${id}/${decision}`, { method: 'POST', body: JSON.stringify({}) });
      loadLearning();
      if (decision === 'approve') { setTemplates([]); apiFetch('/v1/workflows/templates').then(res => setTemplates((res as any).data ?? [])).catch(() => {}); }
    } catch (err: any) {
      showAlert(err.message || 'Could not update this proposal.');
    } finally { setDeciding(null); }
  };

  const editLabel = (t: string) => ({
    STEP_ADDED: 'add step', STEP_REMOVED: 'remove step', CONDITION_ADDED: 'add check',
    CONDITION_REMOVED: 'remove check', SLA_CHANGED: 'change SLA',
  } as Record<string, string>)[t] ?? t;

  // "Use template" → clone it into a fully editable, tenant-owned workflow,
  // then open the copy so it can be tailored straight away.
  const handleAdopt = async (tpl: any) => {
    setAdopting(tpl.id);
    try {
      const res: any = await apiFetch(`/v1/workflows/templates/${tpl.id}/adopt`, { method: 'POST' });
      if (res?.workflowId) navigate(`/studio/clearance/${res.workflowId}`);
      else load();
    } catch (err: any) {
      showAlert(err.message || 'Could not use this template.');
    } finally { setAdopting(null); }
  };

  const handleDelete = async (id: string) => {
    if (!(await showConfirm('Delete this workflow? This cannot be undone.', { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/workflows/${id}`, { method: 'DELETE' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not delete this workflow.');
    }
  };

  const handleDuplicate = async (wf: Workflow) => {
    try {
      await apiFetch(`/v1/workflows/${wf.id}/duplicate`, { method: 'POST' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not duplicate this workflow.');
    }
  };

  const handleToggleActive = async (wf: Workflow) => {
    try {
      await apiFetch(`/v1/workflows/${wf.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !wf.isActive }) });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not update this workflow.');
    }
  };

  // Assignment matrix writes: add fm/ct to the newly-chosen workflow's
  // triggers, and remove them from whichever workflow previously owned this
  // cell — an inherent approximation, since triggers are arrays shared
  // across the whole matrix row/column, not per-cell records.
  const handleAssignChange = async (key: string, newWfId: string | null) => {
    const [fm, ct] = key.split('_');
    const prevWfId = assignment[key] ?? null;
    setAssignment(prev => ({ ...prev, [key]: newWfId }));

    try {
      if (prevWfId && prevWfId !== newWfId) {
        const prevWf = workflows.find(w => w.id === prevWfId);
        if (prevWf) {
          await apiFetch(`/v1/workflows/${prevWfId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              triggers: {
                ...prevWf.triggers,
                freightModes: prevWf.triggers.freightModes.filter(m => m !== fm),
                consignmentTypes: prevWf.triggers.consignmentTypes.filter(c => c !== ct),
              },
            }),
          });
        }
      }
      if (newWfId) {
        const newWf = workflows.find(w => w.id === newWfId);
        if (newWf) {
          await apiFetch(`/v1/workflows/${newWfId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              triggers: {
                ...newWf.triggers,
                freightModes: newWf.triggers.freightModes.includes(fm) ? newWf.triggers.freightModes : [...newWf.triggers.freightModes, fm],
                consignmentTypes: newWf.triggers.consignmentTypes.includes(ct) ? newWf.triggers.consignmentTypes : [...newWf.triggers.consignmentTypes, ct],
              },
            }),
          });
        }
      }
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not update workflow assignment.');
      load();
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      if (id) {
        await apiFetch(`/v1/workflows/${id}`, { method: 'PATCH', body: JSON.stringify({ isDefault: true }) });
      } else {
        const current = workflows.find(w => w.isDefault);
        if (current) await apiFetch(`/v1/workflows/${current.id}`, { method: 'PATCH', body: JSON.stringify({ isDefault: false }) });
      }
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not update the default workflow.');
    }
  };

  return (
    <div className="wf-page">
      {/* Header */}
      <div className="wf-page-header">
        <div>
          <PageHeader
            crumbs={['Studio', 'Clearance']}
            titlePlain="Shipment"
            titleEm="workflows"
            subtitle="Define step-by-step processes, entry conditions, and automated communications for each shipment type."
          />
        </div>
        <div className="wf-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/clearos/ops')}>
            Back to Ops
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/studio/clearance/new')}>
            <Icon name="plus" size={14} color="white" />
            New Workflow
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 16px', marginBottom: 16, background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 8, color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Template library — start from a platform template (superadmin-published) */}
      {templates.length > 0 && (
        <div style={{ marginBottom: 18, padding: '14px 16px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Icon name="layers" size={14} color="var(--teal)" />
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Start from a template</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>
            Platform-maintained workflows for each freight mode. Adopt one to get a fully editable copy of your own.
          </div>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {templates.map(tpl => (
              <div key={tpl.id} style={{ flex: '0 0 240px', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{tpl.name}</span>
                  <span className="wf-badge wf-badge-gray" style={{ whiteSpace: 'nowrap' }}>v{tpl.version}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.45, minHeight: 34 }}>{tpl.description}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <span className="wf-badge wf-badge-teal">{tpl.stepCount} steps</span>
                  {(tpl.freightModes || []).map((m: string) => <span key={m} className="wf-badge wf-badge-blue">{m}</span>)}
                  {(tpl.consignmentTypes || []).map((c: string) => <span key={c} className="wf-badge wf-badge-orange">{c}</span>)}
                </div>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 2 }} disabled={adopting === tpl.id} onClick={() => handleAdopt(tpl)}>
                  {adopting === tpl.id ? 'Adding…' : <><Icon name="plus" size={12} /> Use template</>}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Self-learning — what tenants are changing about these templates, and any
          consensus version the tool has proposed (superadmin approves). */}
      {(learning.proposals.length > 0 || learning.signals.length > 0) && (
        <div style={{ marginBottom: 18, padding: '14px 16px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Icon name="zap" size={14} color="var(--teal)" />
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Workflow self-learning</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>
            Learned from how workspaces across the platform edit these templates. {isSuperAdmin ? 'Approve a proposal to publish it as a new template version.' : 'A platform admin reviews and approves proposed versions.'}
          </div>

          {learning.proposals.map(p => (
            <div key={p.id} style={{ border: '1px solid var(--teal-m)', background: 'var(--teal-l)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{p.name}</span>
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ink3)' }}>proposed v{p.proposedVersion} · from v{p.baseVersion}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="wf-badge wf-badge-teal">{Math.round(p.confidence * 100)}% consensus</span>
                  <span className="wf-badge wf-badge-blue">{p.supportingTenants} workspaces</span>
                </div>
              </div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--ink2)' }}>
                {(p.rationale ?? []).slice(0, 5).map((r: any, i: number) => (
                  <li key={i} style={{ marginTop: 2 }}>
                    <strong>{editLabel(r.editType)}</strong>{' '}
                    {r.detail?.name || r.detail?.field || r.stepSignature}
                    {r.anchorAfter ? ` (after "${r.anchorAfter}")` : ''} — {Math.round(r.supportPct * 100)}% of workspaces
                  </li>
                ))}
              </ul>
              {isSuperAdmin && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-primary btn-sm" disabled={deciding === p.id} onClick={() => decideProposal(p.id, 'approve')}>
                    {deciding === p.id ? 'Working…' : <><Icon name="check" size={12} color="white" /> Approve &amp; publish v{p.proposedVersion}</>}
                  </button>
                  <button className="btn btn-secondary btn-sm" disabled={deciding === p.id} onClick={() => decideProposal(p.id, 'reject')}>Reject</button>
                </div>
              )}
            </div>
          ))}

          {learning.signals.length > 0 && (
            <details style={{ fontSize: 12, color: 'var(--ink3)' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--ink2)' }}>Evidence — {learning.signals.length} recurring edit{learning.signals.length === 1 ? '' : 's'}</summary>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {learning.signals.slice(0, 12).map((s: any, i: number) => (
                  <li key={i} style={{ marginTop: 2 }}>
                    {editLabel(s.editType)}: <strong>{s.detail?.name || s.detail?.field || s.stepSignature}</strong> — {Math.round(s.supportPct * 100)}% of workspaces that edited it ({s.supportTenants}/{s.editingTenants})
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Body: list + matrix */}
      <div className="wf-body">
        {/* Workflow list panel */}
        <div className="wf-list-panel">
          <div className="wf-list-inner">
            {loading ? (
              <div className="wf-empty">
                <div className="wf-empty-sub">Loading workflows…</div>
              </div>
            ) : workflows.length === 0 ? (
              <div className="wf-empty">
                <div className="wf-empty-icon"><Icon name="tasks" size={32} color="var(--ink3)" /></div>
                <div className="wf-empty-title">No Workflows Yet</div>
                <div className="wf-empty-sub">Create your first workflow to configure how shipments move through your operations.</div>
                <button className="btn btn-primary" onClick={() => navigate('/studio/clearance/new')}>
                  <Icon name="plus" size={13} color="white" /> New Workflow
                </button>
              </div>
            ) : (
              workflows.map(wf => (
                <div key={wf.id} className="wf-card">
                  <div className="wf-card-top">
                    <div>
                      <div className="wf-card-name" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {wf.isDefault && <Icon name="star" size={13} color="var(--gold)" duotone />}
                        {wf.name}
                      </div>
                    </div>
                    <div className="wf-card-actions">
                      <button className="wf-icon-btn" title="Edit" onClick={() => navigate(`/studio/clearance/${wf.id}`)}>
                        <Icon name="edit" size={13} />
                      </button>
                      <button className="wf-icon-btn" title="Duplicate" onClick={() => handleDuplicate(wf)}>
                        <Icon name="copy" size={13} />
                      </button>
                      <button className="wf-icon-btn danger" title="Delete" onClick={() => handleDelete(wf.id)}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="wf-card-desc">{wf.description}</div>
                  <div className="wf-card-meta">
                    <span className={`wf-badge ${wf.isActive ? 'wf-badge-green' : 'wf-badge-gray'}`}>
                      {wf.isActive ? '● Active' : '○ Inactive'}
                    </span>
                    <span className="wf-badge wf-badge-teal">{wf.steps.length} steps</span>
                    {wf.isSystem && <span className="wf-badge wf-badge-gray" title="Platform default — delete once you've built your own">Default</span>}
                    {wf.triggers.freightModes.map(m => (
                      <span key={m} className="wf-badge wf-badge-blue">{m}</span>
                    ))}
                    {wf.triggers.consignmentTypes.map(c => (
                      <span key={c} className="wf-badge wf-badge-orange">{c}</span>
                    ))}
                    <button
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: wf.isActive ? 'var(--red)' : 'var(--green)', fontWeight: 700, fontFamily: 'inherit', padding: 'var(--ds-btn-py-xs) 4px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
                      onClick={() => handleToggleActive(wf)}
                    >
                      {wf.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Assignment Matrix */}
        <div className="wf-matrix-panel">
          <div className="wf-matrix-title">
            <Icon name="layers" size={14} color="var(--teal)" />
            Workflow Assignment Matrix
          </div>
          <div className="wf-matrix-sub">
            Assign a workflow to each combination of freight mode and consignment type. Rows without an assignment use the default workflow.
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="wf-matrix-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 120 }}>Freight Mode</th>
                  {CONSIGNMENT_TYPES.map(ct => <th key={ct}>{ct}</th>)}
                </tr>
              </thead>
              <tbody>
                {FREIGHT_MODES.map(fm => (
                  <tr key={fm}>
                    <td style={{ fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Icon name={FREIGHT_MODE_ICON[fm]} size={14} color="var(--ink3)" /> {fm}
                      </span>
                    </td>
                    {CONSIGNMENT_TYPES.map(ct => {
                      const key = `${fm.toLowerCase()}_${ct.toLowerCase()}`;
                      const val = assignment[key];
                      return (
                        <td key={ct}>
                          <div className="wf-matrix-cell">
                            <Select
                              value={val ?? DEFAULT_SENTINEL}
                              onValueChange={v => handleAssignChange(key, v === DEFAULT_SENTINEL ? null : v)}
                            >
                              <SelectTrigger className="h-10 text-sm px-3">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={DEFAULT_SENTINEL}>— Default —</SelectItem>
                                {workflows.filter(w => w.isActive).map(w => (
                                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, color: 'var(--ink3)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Icon name="zap" size={14} color="var(--teal)" />
            <span>Changes to the assignment matrix take effect immediately for new shipments. Existing shipments in progress continue on their original workflow until completion.</span>
          </div>

          {/* Default workflow selector */}
          {workflows.length > 0 && (
            <div style={{ marginTop: 20, padding: '14px 18px', background: 'var(--white)', borderRadius: 8, border: '1.5px solid var(--border)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="star" size={14} color="var(--gold)" duotone /> Default Fallback Workflow
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 10 }}>
                Used when no specific assignment matches a shipment's mode and type.
              </div>
              <Select
                value={workflows.find(w => w.isDefault)?.id ?? DEFAULT_SENTINEL}
                onValueChange={v => handleSetDefault(v === DEFAULT_SENTINEL ? '' : v)}
              >
                <SelectTrigger className="w-full h-11 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_SENTINEL}>No default workflow</SelectItem>
                  {workflows.filter(w => w.isActive).map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
