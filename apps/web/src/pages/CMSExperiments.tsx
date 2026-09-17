import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { BlockEditor } from '../components/BlockEditor.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { showPrompt } from '../lib/prompt.js';
import type { CmsExperiment, CmsBlock } from '@hudumika/types';

function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

/** The Experiments list (§35 of the brief) — two content-author-defined
 *  variants, placed on the public site via a real 'experiment' block, a
 *  visitor sticky-assigned to one, and a real view count per variant. */
export function CMSExperimentsList() {
  const navigate = useNavigate();
  const [experiments, setExperiments] = useState<CmsExperiment[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch('/v1/cms/experiments').then(setExperiments).catch(() => setExperiments([]));
  }
  useEffect(load, []);

  async function handleCreate() {
    if (!name.trim()) return showAlert('Experiment name is required.');
    setSaving(true);
    try {
      const experiment: CmsExperiment = await apiFetch('/v1/cms/experiments', { method: 'POST', body: JSON.stringify({ name }) });
      setCreating(false);
      setName('');
      navigate(`/cms/experiments/${experiment.id}`);
    } catch (e: any) {
      showAlert(`Failed to create experiment: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Experiments']}
        titlePlain="A/B"
        titleEm="experiments"
        subtitle="Two block-array variants, a visitor sticky-assigned to one, a real view count per variant — placed on any page or entry with an A/B Test block."
        actions={<button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={13} /> New experiment</button>}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
        {creating && (
          <div className="card" style={{ padding: '20px 22px', marginBottom: 18, maxWidth: 420 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', marginBottom: 14 }}>New experiment</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FL label="Name">
                <input className="input-field" value={name} placeholder="e.g. Homepage hero" onChange={e => setName(e.target.value)} autoFocus />
              </FL>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleCreate}>{saving ? 'Creating…' : 'Create experiment'}</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {experiments === null ? <SectionLoading /> : experiments.length === 0 && !creating ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink3)', background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
            No experiments yet. Build two variants of a hero or block once, and see which one visitors actually reach.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {experiments.map(x => {
              const total = x.variant_a_views + x.variant_b_views;
              return (
                <Link key={x.id} to={`/cms/experiments/${x.id}`} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="barChart" size={16} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{x.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{x.key}</div>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: x.status === 'running' ? 'var(--teal)' : 'var(--ink3)' }}>{x.status}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 'auto' }}>
                    {total.toLocaleString()} view{total === 1 ? '' : 's'} — A {x.variant_a_views.toLocaleString()} / B {x.variant_b_views.toLocaleString()}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** One experiment's own two-variant block editor + a live view-count
 *  comparison. Each variant is a real, independent BlockEditor instance —
 *  the same one Content-entry/Component editing already uses, so
 *  authoring two variants is exactly as capable as authoring one entry's
 *  own content, not a stripped-down "simple variant" concept. */
export function CMSExperimentDetail() {
  const { experimentId } = useParams<{ experimentId: string }>();
  const navigate = useNavigate();
  const [experiment, setExperiment] = useState<CmsExperiment | null>(null);
  const [variantA, setVariantA] = useState<CmsBlock[]>([]);
  const [variantB, setVariantB] = useState<CmsBlock[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  function load() {
    if (!experimentId) return;
    apiFetch(`/v1/cms/experiments/${experimentId}`).then((x: CmsExperiment) => {
      setExperiment(x); setVariantA(x.variant_a_blocks); setVariantB(x.variant_b_blocks); setDirty(false);
    }).catch(() => setExperiment(null));
  }
  useEffect(load, [experimentId]);

  async function handleSave() {
    if (!experiment) return;
    setSaving(true);
    try {
      const updated: CmsExperiment = await apiFetch(`/v1/cms/experiments/${experiment.id}`, {
        method: 'PATCH', body: JSON.stringify({ variant_a_blocks: variantA, variant_b_blocks: variantB }),
      });
      setExperiment(updated); setVariantA(updated.variant_a_blocks); setVariantB(updated.variant_b_blocks); setDirty(false);
    } catch (e: any) {
      showAlert(`Failed to save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    if (!experiment) return;
    const name = await showPrompt('Experiment name', { defaultValue: experiment.name });
    if (!name) return;
    try {
      const updated = await apiFetch(`/v1/cms/experiments/${experiment.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      setExperiment(updated);
    } catch (e: any) {
      showAlert(`Failed to rename: ${e.message}`);
    }
  }

  async function handleToggleStatus() {
    if (!experiment) return;
    const status = experiment.status === 'running' ? 'stopped' : 'running';
    try {
      const updated = await apiFetch(`/v1/cms/experiments/${experiment.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setExperiment(updated);
    } catch (e: any) {
      showAlert(`Failed to update status: ${e.message}`);
    }
  }

  async function handleDelete() {
    if (!experiment) return;
    if (!(await showConfirm(`Delete "${experiment.name}"? Any A/B Test block placed with this experiment's key will stop rendering.`, { confirmLabel: 'Delete experiment' }))) return;
    try {
      await apiFetch(`/v1/cms/experiments/${experiment.id}`, { method: 'DELETE' });
      navigate('/cms/experiments');
    } catch (e: any) {
      showAlert(e.message || 'Failed to delete experiment.');
    }
  }

  if (!experiment) return <SectionLoading />;
  const total = experiment.variant_a_views + experiment.variant_b_views;
  const aPct = total ? Math.round((experiment.variant_a_views / total) * 100) : 0;
  const bPct = total ? 100 - aPct : 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Experiments', experiment.name]}
        titlePlain={experiment.name}
        titleEm="variants"
        subtitle={`Placed anywhere with an A/B Test block — key "${experiment.key}".`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={handleRename}>Rename</button>
            <button className="btn btn-secondary btn-sm" onClick={handleToggleStatus}>{experiment.status === 'running' ? 'Stop' : 'Resume'}</button>
            <button className="btn btn-primary btn-sm" disabled={saving || !dirty} onClick={handleSave}>{saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
          </div>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', maxWidth: 1000 }}>
        <div className="card" style={{ padding: '18px 22px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink2)', marginBottom: 8 }}>
            <span><b>Variant A</b> — {experiment.variant_a_views.toLocaleString()} view{experiment.variant_a_views === 1 ? '' : 's'} ({aPct}%)</span>
            <span><b>Variant B</b> — {experiment.variant_b_views.toLocaleString()} view{experiment.variant_b_views === 1 ? '' : 's'} ({bPct}%)</span>
          </div>
          <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', background: 'var(--border)' }}>
            <div style={{ width: `${aPct}%`, background: 'var(--teal)' }} />
            <div style={{ width: `${bPct}%`, background: 'var(--gold, #c8920a)' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 8 }}>
            View counts only — a real, disclosed limitation: this shows how evenly visitors reach each variant, not which one converts better. Add conversion tracking as a future pass if you need that signal.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card" style={{ padding: '16px 18px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', marginBottom: 10 }}>Variant A</div>
            <BlockEditor value={variantA} allowComponents={false} onChange={next => { setVariantA(next); setDirty(true); }} />
          </div>
          <div className="card" style={{ padding: '16px 18px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', marginBottom: 10 }}>Variant B</div>
            <BlockEditor value={variantB} allowComponents={false} onChange={next => { setVariantB(next); setDirty(true); }} />
          </div>
        </div>

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
          <button onClick={handleDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--red)' }}>Delete this experiment</button>
        </div>
      </div>
    </div>
  );
}
