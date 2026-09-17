import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { BlockEditor } from '../components/BlockEditor.js';
import { BlockPreview } from '../components/BlockPreview.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { showPrompt } from '../lib/prompt.js';
import type { CmsComponent, CmsBlock } from '@hudumika/types';

function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

/** The Component list (§8 of the brief) — reusable named block arrays (a
 *  "CTA banner", a "Team grid") a tenant defines once and references from
 *  any 'blocks' field. Editing one here updates every place that
 *  references it, since a reference is a live id lookup, not a copy. */
export function CMSComponentsList() {
  const navigate = useNavigate();
  const [components, setComponents] = useState<CmsComponent[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ key: '', name: '' });
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch('/v1/cms/components').then(setComponents).catch(() => setComponents([]));
  }
  useEffect(load, []);

  function autoKey(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.key.trim()) return showAlert('Name and key are required.');
    setSaving(true);
    try {
      const component: CmsComponent = await apiFetch('/v1/cms/components', { method: 'POST', body: JSON.stringify(form) });
      setCreating(false);
      setForm({ key: '', name: '' });
      navigate(`/cms/components/${component.id}`);
    } catch (e: any) {
      showAlert(`Failed to create component: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Components']}
        titlePlain="Reusable"
        titleEm="components"
        subtitle="A block group you define once — CTA banner, team grid, feature strip — and place inside any Content Model entry. Edit it here, every place it's used updates."
        actions={<button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={13} /> New component</button>}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
        {creating && (
          <div className="card" style={{ padding: '20px 22px', marginBottom: 18, maxWidth: 460 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', marginBottom: 14 }}>New component</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FL label="Name">
                <input className="input-field" value={form.name} placeholder="e.g. CTA banner"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value, key: f.key || autoKey(e.target.value) }))} />
              </FL>
              <FL label="Key (used internally, can't change later)">
                <input className="input-field" style={{ fontFamily: 'var(--mono)' }} value={form.key} placeholder="cta-banner" onChange={e => setForm(f => ({ ...f, key: autoKey(e.target.value) }))} />
              </FL>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleCreate}>{saving ? 'Creating…' : 'Create component'}</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {components === null ? <SectionLoading /> : components.length === 0 && !creating ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink3)', background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
            No components yet. Build a block group once — a hero, a CTA, a feature strip — and reuse it across every entry that needs it.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {components.map(c => (
              <Link key={c.id} to={`/cms/components/${c.id}`} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontWeight: 700 }}>◈</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{c.key}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 'auto' }}>{c.blocks.length} block{c.blocks.length === 1 ? '' : 's'}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One component's own block editor. `allowComponents={false}` on
 *  BlockEditor is the UI half of the no-nesting rule — the server-side half
 *  (cms-content.service.ts's sanitizeBlock with context: 'component') is
 *  what actually enforces it. */
export function CMSComponentDetail() {
  const { componentId } = useParams<{ componentId: string }>();
  const navigate = useNavigate();
  const [component, setComponent] = useState<CmsComponent | null>(null);
  const [blocks, setBlocks] = useState<CmsBlock[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [forms, setForms] = useState<{ key: string; name: string }[]>([]);
  const [experiments, setExperiments] = useState<{ key: string; name: string }[]>([]);

  function load() {
    if (!componentId) return;
    apiFetch(`/v1/cms/components/${componentId}`).then((c: CmsComponent) => { setComponent(c); setBlocks(c.blocks); setDirty(false); }).catch(() => setComponent(null));
  }
  useEffect(load, [componentId]);
  useEffect(() => { apiFetch('/v1/cms/forms').then((fs: { key: string; name: string }[]) => setForms(fs)).catch(() => {}); }, []);
  useEffect(() => { apiFetch('/v1/cms/experiments').then((xs: { key: string; name: string }[]) => setExperiments(xs)).catch(() => {}); }, []);

  async function handleSave() {
    if (!component) return;
    setSaving(true);
    try {
      const updated: CmsComponent = await apiFetch(`/v1/cms/components/${component.id}`, { method: 'PATCH', body: JSON.stringify({ blocks }) });
      setComponent(updated);
      setBlocks(updated.blocks);
      setDirty(false);
    } catch (e: any) {
      showAlert(`Failed to save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    if (!component) return;
    const name = await showPrompt('Component name', { defaultValue: component.name });
    if (!name) return;
    try {
      const updated = await apiFetch(`/v1/cms/components/${component.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      setComponent(updated);
    } catch (e: any) {
      showAlert(`Failed to rename: ${e.message}`);
    }
  }

  async function handleDelete() {
    if (!component) return;
    if (!(await showConfirm(`Delete "${component.name}"? Only possible while it isn't placed in any entry.`, { confirmLabel: 'Delete component' }))) return;
    try {
      await apiFetch(`/v1/cms/components/${component.id}`, { method: 'DELETE' });
      navigate('/cms/components');
    } catch (e: any) {
      showAlert(e.message || 'Failed to delete component.');
    }
  }

  if (!component) return <SectionLoading />;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Components', component.name]}
        titlePlain={component.name}
        titleEm="blocks"
        subtitle="Whatever you build here appears everywhere this component is placed."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={handleRename}>Rename</button>
            <button className="btn btn-primary btn-sm" disabled={saving || !dirty} onClick={handleSave}>{saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
          </div>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', maxWidth: 700 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <Tabs value={preview ? 'preview' : 'edit'} onValueChange={v => setPreview(v === 'preview')} variant="segmented">
            <TabsList>
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="card" style={{ padding: '20px 22px' }}>
          {preview ? (
            blocks.length ? <BlockPreview blocks={blocks} /> : <div className="block-preview-empty">Nothing to preview yet — add a block first.</div>
          ) : (
            <BlockEditor value={blocks} allowComponents={false} forms={forms} experiments={experiments} onChange={next => { setBlocks(next); setDirty(true); }} />
          )}
        </div>

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
          <button onClick={handleDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--red)' }}>Delete this component</button>
        </div>
      </div>
    </div>
  );
}
