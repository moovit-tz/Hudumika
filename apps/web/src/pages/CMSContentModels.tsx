import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { showPrompt } from '../lib/prompt.js';
import type { CmsContentModel, CmsContentField, CmsFieldType } from '@hudumika/types';

function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const ICONS = ['package', 'fileText', 'users', 'calendar', 'briefcase', 'mapPin', 'star', 'tag', 'shoppingCart', 'building'] as const;

/** The Content Models list — every tenant-defined type (Product, Employee,
 *  Event, ...) alongside the built-in Pages/Posts, with a count of how many
 *  entries each has and a way to create a new one. */
export function CMSContentModelsList() {
  const navigate = useNavigate();
  const [models, setModels] = useState<CmsContentModel[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ key: '', name: '', name_plural: '', description: '', icon: 'package' });
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch('/v1/cms/content-models').then(setModels).catch(() => setModels([]));
  }
  useEffect(load, []);

  function autoKey(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.key.trim()) return showAlert('Name and key are required.');
    setSaving(true);
    try {
      const model: CmsContentModel = await apiFetch('/v1/cms/content-models', {
        method: 'POST',
        body: JSON.stringify({ ...form, name_plural: form.name_plural || `${form.name}s` }),
      });
      setCreating(false);
      setForm({ key: '', name: '', name_plural: '', description: '', icon: 'package' });
      navigate(`/cms/models/${model.id}`);
    } catch (e: any) {
      showAlert(`Failed to create model: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Content Models']}
        titlePlain="Content"
        titleEm="models"
        subtitle="Define your own content types — Product, Employee, Event, Property — beyond Pages and Posts."
        actions={<button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={13} /> New model</button>}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
        {creating && (
          <div className="card" style={{ padding: '20px 22px', marginBottom: 18, maxWidth: 520 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', marginBottom: 14 }}>New content model</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FL label="Name (singular)">
                <input className="input-field" value={form.name} placeholder="e.g. Product"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value, key: f.key || autoKey(e.target.value) }))} />
              </FL>
              <FL label="Name (plural)"><input className="input-field" value={form.name_plural} placeholder="e.g. Products" onChange={e => setForm(f => ({ ...f, name_plural: e.target.value }))} /></FL>
              <FL label="Key (used in URLs, can't change later)">
                <input className="input-field" style={{ fontFamily: 'var(--mono)' }} value={form.key} placeholder="product" onChange={e => setForm(f => ({ ...f, key: autoKey(e.target.value) }))} />
              </FL>
              <FL label="Description"><input className="input-field" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></FL>
              <FL label="Icon">
                <Select value={form.icon} onValueChange={v => setForm(f => ({ ...f, icon: v }))}>
                  <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                  <SelectContent>{ICONS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                </Select>
              </FL>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleCreate}>{saving ? 'Creating…' : 'Create model'}</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {models === null ? <SectionLoading /> : models.length === 0 && !creating ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink3)', background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
            No content models yet. Pages and Posts still work as before — models are for everything else: products, staff, events, listings.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {models.map(m => (
              <Link key={m.id} to={`/cms/models/${m.id}`} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={m.icon as any} size={16} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{m.name_plural}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{m.key}</div>
                  </div>
                </div>
                {m.description && <div style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{m.description}</div>}
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 'auto' }}>{m.entry_count ?? 0} entr{(m.entry_count ?? 0) === 1 ? 'y' : 'ies'}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One model's Field Builder — define the fields (Product's Price, Employee's
 *  Department, ...) that its entries will have, plus a link into its Content
 *  Manager (CMSContentEntries.tsx). */
export function CMSContentModelDetail() {
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();
  const [model, setModel] = useState<CmsContentModel | null>(null);
  const [fieldTypes, setFieldTypes] = useState<{ type: CmsFieldType; label: string }[]>([]);
  const [allModels, setAllModels] = useState<CmsContentModel[]>([]);
  const [addingField, setAddingField] = useState(false);
  const [fieldForm, setFieldForm] = useState({ label: '', field_type: 'text' as CmsFieldType, required: false, help_text: '', options: '', targetModelId: '', itemType: 'text' as 'text' | 'number' | 'url' | 'email', formula: '' });
  const [saving, setSaving] = useState(false);

  function load() {
    if (!modelId) return;
    apiFetch(`/v1/cms/content-models/${modelId}`).then(setModel).catch(() => setModel(null));
  }
  useEffect(load, [modelId]);
  useEffect(() => { apiFetch('/v1/cms/field-types').then(setFieldTypes).catch(() => {}); }, []);
  useEffect(() => { apiFetch('/v1/cms/content-models').then(setAllModels).catch(() => setAllModels([])); }, []);

  async function handleAddField() {
    if (!fieldForm.label.trim()) return showAlert('Field label is required.');
    if (fieldForm.field_type === 'relation' && !fieldForm.targetModelId) return showAlert('Choose which model this field relates to.');
    if (fieldForm.field_type === 'computed' && !fieldForm.formula.trim()) return showAlert('Enter a formula for this computed field.');
    setSaving(true);
    try {
      const config = fieldForm.field_type === 'select'
        ? { options: fieldForm.options.split(',').map(s => s.trim()).filter(Boolean) }
        : fieldForm.field_type === 'relation'
        ? { targetModelId: fieldForm.targetModelId }
        : fieldForm.field_type === 'repeatable'
        ? { itemType: fieldForm.itemType }
        : fieldForm.field_type === 'computed'
        ? { formula: fieldForm.formula.trim() }
        : {};
      await apiFetch(`/v1/cms/content-models/${modelId}/fields`, {
        method: 'POST',
        // A computed field's own value is never client-set, so it makes no
        // sense to also mark it "required" — the checkbox stays but this
        // pins required=false regardless, matching the backend's own view
        // that a computed value is always filled in on save.
        body: JSON.stringify({ label: fieldForm.label, field_type: fieldForm.field_type, required: fieldForm.field_type === 'computed' ? false : fieldForm.required, help_text: fieldForm.help_text || undefined, config }),
      });
      setAddingField(false);
      setFieldForm({ label: '', field_type: 'text', required: false, help_text: '', options: '', targetModelId: '', itemType: 'text', formula: '' });
      load();
    } catch (e: any) {
      showAlert(`Failed to add field: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteField(fieldId: string, label: string) {
    if (!(await showConfirm(`Remove the "${label}" field? Existing entries keep their stored value, but it won't be editable through this field anymore.`, { confirmLabel: 'Remove field' }))) return;
    try {
      await apiFetch(`/v1/cms/content-fields/${fieldId}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      showAlert(`Failed to remove field: ${e.message}`);
    }
  }

  async function handleRename() {
    if (!model) return;
    const name = await showPrompt('Model name', { defaultValue: model.name });
    if (!name) return;
    try {
      await apiFetch(`/v1/cms/content-models/${model.id}`, { method: 'PATCH', body: JSON.stringify({ name, name_plural: name + 's' }) });
      load();
    } catch (e: any) {
      showAlert(`Failed to rename: ${e.message}`);
    }
  }

  async function handleDeleteModel() {
    if (!model) return;
    if (!(await showConfirm(`Delete the "${model.name}" model? Only possible while it has no entries.`, { confirmLabel: 'Delete model' }))) return;
    try {
      await apiFetch(`/v1/cms/content-models/${model.id}`, { method: 'DELETE' });
      navigate('/cms/models');
    } catch (e: any) {
      showAlert(e.message || 'Failed to delete model.');
    }
  }

  if (!model) return <SectionLoading />;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Content Models', model.name_plural]}
        titlePlain={model.name}
        titleEm="fields"
        subtitle={model.description || `Define the fields every ${model.name} entry will have.`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={handleRename}>Rename</button>
            <Link to={`/cms/models/${model.id}/entries`} className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="list" size={13} /> View {model.name_plural.toLowerCase()}
            </Link>
          </div>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', maxWidth: 640 }}>
        <div className="card" style={{ padding: 0 }}>
          <div className="rtbl-wrap">
            <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                  {['Label', 'Key', 'Type', 'Required', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(model.fields ?? []).map(f => (
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600 }}>{f.label}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink3)' }}>{f.key}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)' }}>
                      {fieldTypes.find(t => t.type === f.field_type)?.label ?? f.field_type}
                      {f.field_type === 'relation' && (() => {
                        const target = allModels.find(m => m.id === (f.config as any)?.targetModelId);
                        return target ? <span style={{ color: 'var(--ink3)' }}> → {target.name_plural}</span> : null;
                      })()}
                      {f.field_type === 'repeatable' && (f.config as any)?.itemType && (
                        <span style={{ color: 'var(--ink3)' }}> of {(f.config as any).itemType}</span>
                      )}
                      {f.field_type === 'computed' && (f.config as any)?.formula && (
                        <span style={{ color: 'var(--ink3)', fontFamily: 'var(--mono)', fontSize: 11.5 }}> = {(f.config as any).formula}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px' }}>{f.required ? <Icon name="check" size={13} color="var(--teal)" /> : '—'}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <button onClick={() => handleDeleteField(f.id, f.label)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--red)' }}>Remove</button>
                    </td>
                  </tr>
                ))}
                {(model.fields ?? []).length === 0 && !addingField && (
                  <tr><td colSpan={5} style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)' }}>No fields yet — add the first one below.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {addingField ? (
          <div className="card" style={{ padding: '18px 20px', marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FL label="Label"><input className="input-field" value={fieldForm.label} placeholder="e.g. Price" onChange={e => setFieldForm(f => ({ ...f, label: e.target.value }))} /></FL>
            <FL label="Type">
              <Select value={fieldForm.field_type} onValueChange={v => setFieldForm(f => ({ ...f, field_type: v as CmsFieldType }))}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>{fieldTypes.map(t => <SelectItem key={t.type} value={t.type}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </FL>
            {fieldForm.field_type === 'select' && (
              <FL label="Options (comma-separated)"><input className="input-field" value={fieldForm.options} placeholder="Draft, In Stock, Sold Out" onChange={e => setFieldForm(f => ({ ...f, options: e.target.value }))} /></FL>
            )}
            {fieldForm.field_type === 'relation' && (
              <FL label="Relates to">
                <Select value={fieldForm.targetModelId} onValueChange={v => setFieldForm(f => ({ ...f, targetModelId: v }))}>
                  <SelectTrigger className="input-field"><SelectValue placeholder="Choose a model…" /></SelectTrigger>
                  <SelectContent>{allModels.map(m => <SelectItem key={m.id} value={m.id}>{m.name_plural}</SelectItem>)}</SelectContent>
                </Select>
              </FL>
            )}
            {fieldForm.field_type === 'repeatable' && (
              <FL label="Repeats a">
                <Select value={fieldForm.itemType} onValueChange={v => setFieldForm(f => ({ ...f, itemType: v as typeof f.itemType }))}>
                  <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="url">URL</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </FL>
            )}
            {fieldForm.field_type === 'computed' && (
              <FL label="Formula">
                <input
                  className="input-field"
                  style={{ fontFamily: 'var(--mono)' }}
                  value={fieldForm.formula}
                  placeholder="{price} * {quantity}"
                  onChange={e => setFieldForm(f => ({ ...f, formula: e.target.value }))}
                />
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                  Arithmetic only: <code>+ - * /</code> and parentheses, with <code>{'{fieldKey}'}</code> referencing another field already defined on this model (not another computed field). Calculated automatically on save.
                </div>
              </FL>
            )}
            <FL label="Help text (optional)"><input className="input-field" value={fieldForm.help_text} onChange={e => setFieldForm(f => ({ ...f, help_text: e.target.value }))} /></FL>
            {fieldForm.field_type !== 'computed' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <input type="checkbox" checked={fieldForm.required} onChange={e => setFieldForm(f => ({ ...f, required: e.target.checked }))} /> Required
              </label>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleAddField}>{saving ? 'Adding…' : 'Add field'}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setAddingField(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 14 }} onClick={() => setAddingField(true)}>
            <Icon name="plus" size={13} /> Add field
          </button>
        )}

        <div style={{ marginTop: 32, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
          <button onClick={handleDeleteModel} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--red)' }}>Delete this model</button>
        </div>
      </div>
    </div>
  );
}
