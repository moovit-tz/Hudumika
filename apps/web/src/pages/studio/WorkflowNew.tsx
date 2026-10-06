import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './studio.css';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Banner } from '../../components/ui/alert.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import type { WorkflowStudioTriggerDef } from '@hudumika/types';
import { PageHeader } from '../../components/PageHeader.js';
import { Card } from '../../components/ui/card.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import './WorkflowNew.css';

const KIND_LABEL: Record<string, string> = {
  DOMAIN_EVENT: 'When something happens in an app',
  SCHEDULE: 'On a schedule',
  MANUAL: 'Only when someone presses Run',
};

/**
 * Creating a workflow is a page, not a dialog — it is a multi-step decision you
 * can link to, refresh and come back to, matching the OnboardingWizard and
 * TradeWizard precedent rather than a modal that loses its state.
 *
 * The trigger list comes from the registry, so it is impossible to create a
 * workflow bound to an event nothing emits.
 */
export function WorkflowNew() {
  const navigate = useNavigate();
  const [triggers, setTriggers] = useState<WorkflowStudioTriggerDef[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerId, setTriggerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    apiFetch('/v1/workflow-studio/triggers')
      .then(r => { if (alive) setTriggers(r.data ?? []); })
      .catch(e => { if (alive) setError(e?.message ?? 'Could not load triggers.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const chosen = triggers.find(t => t.id === triggerId);
  const canCreate = name.trim().length > 0 && !!chosen;

  async function create() {
    if (!chosen) return;
    setBusy(true); setError('');
    try {
      const res = await apiFetch('/v1/workflow-studio/apps', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          trigger_event: chosen.id,
          status: 'DRAFT',
          // Just the trigger. Steps are added on the canvas, where the picker
          // knows which actions exist and what inputs each one needs.
          nodes: [{ id: 'n1', type: 'trigger', title: chosen.label, eventOrAction: chosen.id, position: { x: 80, y: 40 }, config: {} }],
          edges: [],
        }),
      });
      navigate(`/studio/w/${res.data.id}`);
    } catch (e: any) { setError(e?.message ?? 'Could not create the workflow.'); setBusy(false); }
  }

  const grouped = ['DOMAIN_EVENT', 'SCHEDULE', 'MANUAL']
    .map(kind => ({ kind, rows: triggers.filter(t => t.kind === kind && `${t.label} ${t.appName} ${t.description}`.toLowerCase().includes(search.toLowerCase())) }))
    .filter(g => g.rows.length > 0);

  return (
    <div className="studio-page workflow-new-page">
      <PageHeader
        crumbs={['Studio', 'New workflow']}
        titlePlain="New"
        titleEm="workflow"
        variant="create"
        backTo="/studio/workflows"
        backLabel="Workflows"
        subtitle="Name your workflow and choose its trigger. Add actions on the canvas next."
      />
      <div className="workflow-new-progress"><span className="is-current">1 · Details & trigger</span><Icon name="chevronRight" size={16}/><span>2 · Connect actions</span><Icon name="chevronRight" size={16}/><span>3 · Review & activate</span></div>

      {error && <Banner variant="error" className="mb-3.5">{error}</Banner>}

      <Card className="workflow-new-details"><h2>Workflow details</h2>
      <div className="studio-field">
        <label htmlFor="workflow-name" className="studio-field-label">Name <span className="studio-req">*</span></label>
        <Input id="workflow-name" maxLength={200} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alert the officer when a case is overdue" />
      </div>

      <div className="studio-field">
        <label htmlFor="workflow-description" className="studio-field-label">Description <span className="workflow-new-optional">Optional</span></label>
        <Textarea id="workflow-description" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Explain what this workflow helps your team do." />
      </div>
      </Card>

      <Card className="workflow-new-triggers">
        <div className="workflow-new-trigger-heading"><div><h2>Choose a trigger <span className="studio-req">*</span></h2><p>Select the event that starts this workflow.</p></div><Input aria-label="Search triggers" placeholder="Search apps or events…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        {loading && <SectionLoading label="Loading triggers…" />}
        {!loading && !grouped.length && <p className="workflow-new-empty">{search ? 'No triggers match your search.' : 'No triggers are available.'}</p>}
        {grouped.map(g => (
          <div key={g.kind} style={{ marginBottom: 14 }}>
            <div className="studio-group-label" style={{ margin: '0 0 7px' }}>{KIND_LABEL[g.kind]}</div>
            <div className="workflow-new-trigger-grid">
              {g.rows.map(t => (
                <button key={t.id} className="workflow-new-trigger" aria-pressed={triggerId === t.id} type="button" onClick={() => setTriggerId(t.id)}
                  style={{
                    textAlign: 'left', padding: 'var(--ds-btn-py) 12px', borderRadius: 'var(--r)', cursor: 'pointer',
                    border: `1.5px solid ${triggerId === t.id ? 'var(--teal)' : 'var(--border)'}`,
                    background: triggerId === t.id ? 'var(--teal-l)' : 'var(--card-bg, var(--white))', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: t.color }} />
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: t.color }}>{t.appName}</span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{t.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2, lineHeight: 1.45 }}>{t.description}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Card>

      {chosen && Object.keys(chosen.samplePayload).length > 0 && (
        <div style={{ padding: '11px 14px', borderRadius: 'var(--r)', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', fontSize: 12, color: 'var(--ink2)', marginBottom: 18 }}>
          Steps in this workflow will be able to use{' '}
          {Object.keys(chosen.samplePayload).map(k => <code key={k} style={{ marginRight: 7 }}>{`{{payload.${k}}}`}</code>)}
          {chosen.entityType && <> — plus the full <strong>{chosen.entityType}</strong> record loaded by {chosen.appName}.</>}
        </div>
      )}

      <Card className="workflow-new-footer">
        <div><strong>{chosen ? chosen.label : 'Select a trigger to continue'}</strong><p>A draft is created first. Activate it after reviewing its actions.</p></div>
        <Button size="lg" type="button" disabled={!canCreate || busy} onClick={create}>
          {busy ? 'Creating…' : 'Create draft'}<Icon name="arrowRight" size={16}/>
        </Button>
      </Card>
    </div>
  );
}
