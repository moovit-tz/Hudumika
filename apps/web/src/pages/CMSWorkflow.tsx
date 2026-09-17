import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import type { CmsWorkflowState, CmsWorkflowTransition, CreateCmsWorkflowStateInput, CreateCmsWorkflowTransitionInput } from '@hudumika/types';

export function CMSWorkflow() {
  const [states, setStates] = useState<CmsWorkflowState[] | null>(null);
  const [transitions, setTransitions] = useState<CmsWorkflowTransition[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [stateModalOpen, setStateModalOpen] = useState(false);
  const [transitionModalOpen, setTransitionModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [stateForm, setStateForm] = useState<{
    name: string;
    slug: string;
    color: string;
    is_initial: boolean;
    is_published: boolean;
    sort_order: number;
  }>({
    name: '',
    slug: '',
    color: '#0d9488',
    is_initial: false,
    is_published: false,
    sort_order: 50,
  });

  const [transitionForm, setTransitionForm] = useState<{
    from_state_id: string;
    to_state_id: string;
    name: string;
    required_role: string;
    require_approval: boolean;
  }>({
    from_state_id: '',
    to_state_id: '',
    name: '',
    required_role: '',
    require_approval: false,
  });

  function load() {
    setLoading(true);
    Promise.all([
      apiFetch<CmsWorkflowState[]>('/v1/cms/workflows/states'),
      apiFetch<CmsWorkflowTransition[]>('/v1/cms/workflows/transitions'),
    ])
      .then(([s, t]) => {
        setStates(s ?? []);
        setTransitions(t ?? []);
      })
      .catch(() => {
        setStates([]);
        setTransitions([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreateState() {
    if (!stateForm.name.trim()) return showAlert('State name is required.');
    if (!stateForm.slug.trim()) return showAlert('State slug is required.');

    setSaving(true);
    try {
      const payload: CreateCmsWorkflowStateInput = {
        name: stateForm.name.trim(),
        slug: stateForm.slug.trim().toLowerCase(),
        color: stateForm.color,
        is_initial: stateForm.is_initial,
        is_published: stateForm.is_published,
        sort_order: stateForm.sort_order,
      };
      await apiFetch('/v1/cms/workflows/states', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showAlert('Workflow state created.');
      setStateModalOpen(false);
      load();
    } catch (err: any) {
      showAlert(`Failed to create state: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteState(state: CmsWorkflowState) {
    if (['draft', 'published', 'trash'].includes(state.slug)) {
      return showAlert(`Cannot delete core state "${state.slug}".`);
    }
    const confirmed = await showConfirm(`Delete state "${state.name}"? Associated transitions will also be removed.`);
    if (!confirmed) return;

    try {
      await apiFetch(`/v1/cms/workflows/states/${state.id}`, { method: 'DELETE' });
      showAlert('State deleted.');
      load();
    } catch (err: any) {
      showAlert(`Failed to delete: ${err.message}`);
    }
  }

  async function handleCreateTransition() {
    if (!transitionForm.from_state_id || !transitionForm.to_state_id) {
      return showAlert('Please select both Origin and Destination states.');
    }

    setSaving(true);
    try {
      const payload: CreateCmsWorkflowTransitionInput = {
        from_state_id: transitionForm.from_state_id,
        to_state_id: transitionForm.to_state_id,
        name: transitionForm.name.trim() || undefined,
        required_role: transitionForm.required_role.trim() || null,
        require_approval: transitionForm.require_approval,
      };
      await apiFetch('/v1/cms/workflows/transitions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showAlert('Workflow transition added.');
      setTransitionModalOpen(false);
      load();
    } catch (err: any) {
      showAlert(`Failed to add transition: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTransition(transitionId: string) {
    try {
      await apiFetch(`/v1/cms/workflows/transitions/${transitionId}`, { method: 'DELETE' });
      showAlert('Transition removed.');
      load();
    } catch (err: any) {
      showAlert(`Failed to delete transition: ${err.message}`);
    }
  }

  async function handleResetWorkflow() {
    const confirmed = await showConfirm('Reset workflow to standard editorial states (Draft -> In Review -> Approved -> Scheduled -> Published)?', {
      confirmLabel: 'Reset to Standard',
    });
    if (!confirmed) return;

    try {
      await apiFetch('/v1/cms/workflows/states/seed', { method: 'POST', body: '{}' });
      showAlert('Workflow reset to standard editorial flow.');
      load();
    } catch (err: any) {
      showAlert(`Reset failed: ${err.message}`);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={[{ label: 'CMS', to: '/cms' }, { label: 'Workflows' }]}
        title="Configurable Workflows"
        subtitle="Define editorial stages, review gates, and role-based state transitions (§15 Workflow Engine)."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleResetWorkflow}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontWeight: 500,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <Icon name="refresh" size={14} />
              Reset to Standard
            </button>
            <button
              onClick={() => {
                setStateForm({ name: '', slug: '', color: '#0ea5e9', is_initial: false, is_published: false, sort_order: (states?.length ?? 0) * 10 });
                setStateModalOpen(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <Icon name="plus" size={14} />
              Add State
            </button>
            <button
              onClick={() => {
                setTransitionForm({ from_state_id: states?.[0]?.id || '', to_state_id: states?.[1]?.id || '', name: '', required_role: '', require_approval: false });
                setTransitionModalOpen(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 8,
                background: 'var(--teal)',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <Icon name="gitBranch" size={16} />
              Add Transition
            </button>
          </div>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {loading ? (
          <SectionLoading />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {/* States Section */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Workflow States</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Content status stages representing the lifecycle of articles, pages, and products.
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {states?.map(st => (
                  <div
                    key={st.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      background: 'var(--bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderLeft: `4px solid ${st.color || 'var(--teal)'}`,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{st.name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        {st.is_initial && <Badge variant="secondary">Initial</Badge>}
                        {st.is_published && <Badge variant="success">Live</Badge>}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>order: {st.sort_order}</span>
                      </div>
                    </div>
                    {!['draft', 'published', 'trash'].includes(st.slug) && (
                      <button
                        onClick={() => handleDeleteState(st)}
                        style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 4 }}
                        title="Delete state"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Transitions Matrix Section */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Permitted State Transitions</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Allowed actions moving content from one state to another, gated by user role and review approvals.
                  </p>
                </div>
              </div>

              {transitions?.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                  No transitions configured. Click "Reset to Standard" above to load defaults.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {transitions?.map(tr => (
                    <div
                      key={tr.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 280 }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              background: tr.from_state?.color ? `${tr.from_state.color}20` : 'var(--bg-muted)',
                              color: tr.from_state?.color || 'var(--text)',
                            }}
                          >
                            {tr.from_state?.name || 'Any'}
                          </span>
                          <Icon name="arrowRight" size={14} style={{ color: 'var(--text-muted)' }} />
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              background: tr.to_state?.color ? `${tr.to_state.color}20` : 'var(--bg-muted)',
                              color: tr.to_state?.color || 'var(--text)',
                            }}
                          >
                            {tr.to_state?.name || 'Target'}
                          </span>
                        </div>

                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                          {tr.name || 'Transition'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {tr.requires_approval && (
                          <Badge variant="warning">
                            <Icon name="checkCircle" size={12} style={{ marginRight: 4 }} />
                            Requires Review
                          </Badge>
                        )}
                        {tr.allowed_roles?.length > 0 ? (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            Roles: <strong>{tr.allowed_roles.join(', ')}</strong>
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>All Writers & Editors</span>
                        )}

                        <button
                          onClick={() => handleDeleteTransition(tr.id)}
                          style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 4 }}
                          title="Remove transition"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add State Modal */}
      {stateModalOpen && (
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
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px 0', color: 'var(--text)' }}>Add Workflow State</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>State Name *</label>
                <input
                  type="text"
                  value={stateForm.name}
                  onChange={e => {
                    const name = e.target.value;
                    setStateForm(f => ({ ...f, name, slug: !f.slug ? name.toLowerCase().replace(/[^a-z0-9_]+/g, '_') : f.slug }));
                  }}
                  placeholder="e.g. Legal Compliance"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Identifier (Slug) *</label>
                <input
                  type="text"
                  value={stateForm.slug}
                  onChange={e => setStateForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_') }))}
                  placeholder="e.g. legal_compliance"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Badge Color</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={stateForm.color}
                    onChange={e => setStateForm(f => ({ ...f, color: e.target.value }))}
                    style={{ width: 36, height: 36, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{stateForm.color}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="pub_toggle"
                  checked={stateForm.is_published}
                  onChange={e => setStateForm(f => ({ ...f, is_published: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: 'var(--teal)' }}
                />
                <label htmlFor="pub_toggle" style={{ fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                  This state represents live public content
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setStateModalOpen(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateState}
                disabled={saving}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                {saving ? 'Creating...' : 'Create State'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Transition Modal */}
      {transitionModalOpen && (
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
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 460, border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px 0', color: 'var(--text)' }}>Add Workflow Transition</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>From State *</label>
                  <select
                    value={transitionForm.from_state_id}
                    onChange={e => setTransitionForm(f => ({ ...f, from_state_id: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                  >
                    {states?.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>To State *</label>
                  <select
                    value={transitionForm.to_state_id}
                    onChange={e => setTransitionForm(f => ({ ...f, to_state_id: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                  >
                    {states?.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Transition Name / Action Label</label>
                <input
                  type="text"
                  value={transitionForm.name}
                  onChange={e => setTransitionForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Submit for Compliance Review"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Restricted to Role (Optional)</label>
                <select
                  value={transitionForm.required_role}
                  onChange={e => setTransitionForm(f => ({ ...f, required_role: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                >
                  <option value="">Any Role (Writers, Editors, Admins)</option>
                  <option value="ADMIN">ADMIN / Tenant Admin only</option>
                  <option value="MANAGER">MANAGER & higher</option>
                  <option value="OPERATOR">OPERATOR & higher</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="req_app_toggle"
                  checked={transitionForm.require_approval}
                  onChange={e => setTransitionForm(f => ({ ...f, require_approval: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: 'var(--teal)' }}
                />
                <label htmlFor="req_app_toggle" style={{ fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                  Requires formal reviewer assignment and signoff
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setTransitionModalOpen(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTransition}
                disabled={saving}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                {saving ? 'Adding...' : 'Add Transition'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
