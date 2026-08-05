import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './studio.css';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import type { WorkflowStudioTriggerDef } from '@hudumika/types';
import { PageHeader } from '../../components/PageHeader.js';

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

  useEffect(() => {
    let alive = true;
    apiFetch('/v1/workflow-studio/triggers')
      .then(r => { if (alive) setTriggers(r.data ?? []); })
      .catch(e => { if (alive) setError(e?.message ?? 'Could not load triggers.'); });
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
    .map(kind => ({ kind, rows: triggers.filter(t => t.kind === kind) }))
    .filter(g => g.rows.length > 0);

  return (
    <div style={{ padding: '20px 22px', maxWidth: 820, margin: '0 auto' }}>
      <button type="button" className="studio-icon-btn" style={{ border: '1px solid var(--border)', marginBottom: 14 }} onClick={() => navigate('/studio/workflows')}>
        <Icon name="arrowLeft" size={13} /> Workflows
      </button>

      <PageHeader
        crumbs={['Studio', 'New workflow']}
        titlePlain="New"
        titleEm="workflow"
      />
      <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 3, marginBottom: 20 }}>
        Name it and choose what sets it off. You will add the steps next, on the canvas.
      </div>

      {error && <div style={{ padding: '9px 13px', background: 'var(--red-l)', color: 'var(--red)', borderRadius: 9, fontSize: 12.5, marginBottom: 14 }}>{error}</div>}

      <div className="studio-field">
        <label className="studio-field-label">Name <span className="studio-req">*</span></label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alert the officer when a case is overdue" />
      </div>

      <div className="studio-field">
        <label className="studio-field-label">What it is for</label>
        <Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="A sentence your colleagues will read six months from now." />
      </div>

      <div className="studio-section" style={{ marginTop: 18 }}>
        <div className="studio-section-title">What sets it off? <span className="studio-req">*</span></div>
        {grouped.map(g => (
          <div key={g.kind} style={{ marginBottom: 14 }}>
            <div className="studio-group-label" style={{ margin: '0 0 7px' }}>{KIND_LABEL[g.kind]}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
              {g.rows.map(t => (
                <button key={t.id} type="button" onClick={() => setTriggerId(t.id)}
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
      </div>

      {chosen && Object.keys(chosen.samplePayload).length > 0 && (
        <div style={{ padding: '11px 14px', borderRadius: 10, background: 'var(--teal-l)', border: '1px solid var(--teal-m, var(--teal-l))', fontSize: 12, color: 'var(--ink2)', marginBottom: 18 }}>
          Steps in this workflow will be able to use{' '}
          {Object.keys(chosen.samplePayload).map(k => <code key={k} style={{ marginRight: 7 }}>{`{{payload.${k}}}`}</code>)}
          {chosen.entityType && <> — plus the full <strong>{chosen.entityType}</strong> record loaded by {chosen.appName}.</>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button type="button" disabled={!canCreate || busy} onClick={create}>
          {busy ? 'Creating…' : 'Create draft'}
        </Button>
        <Badge variant="gray">Starts as a draft — nothing runs until you switch it on</Badge>
      </div>
    </div>
  );
}
