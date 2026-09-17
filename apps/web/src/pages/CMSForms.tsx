import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { showPrompt } from '../lib/prompt.js';
import type { CmsForm, CmsFormField, CmsFormFieldType, CmsFormSubmission } from '@hudumika/types';

function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const FIELD_TYPE_LABELS: Record<CmsFormFieldType, string> = { text: 'Text', email: 'Email', textarea: 'Long text', select: 'Select' };

/** The Forms list (§30-31 of the brief) — a tenant defines a form's own
 *  field shape once, places it on the public site via a real 'form' block
 *  (BlockEditor.tsx/BlockPreview.tsx), and every submission lands here. */
export function CMSFormsList() {
  const navigate = useNavigate();
  const [forms, setForms] = useState<CmsForm[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch('/v1/cms/forms').then(setForms).catch(() => setForms([]));
  }
  useEffect(load, []);

  async function handleCreate() {
    if (!name.trim()) return showAlert('Form name is required.');
    setSaving(true);
    try {
      const form: CmsForm = await apiFetch('/v1/cms/forms', { method: 'POST', body: JSON.stringify({ name }) });
      setCreating(false);
      setName('');
      navigate(`/cms/forms/${form.id}`);
    } catch (e: any) {
      showAlert(`Failed to create form: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Forms']}
        titlePlain="Forms &"
        titleEm="submissions"
        subtitle="A form a visitor can actually fill in — contact requests, sign-ups — placed on any page or entry via a real Form block, with every submission landing here."
        actions={<button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={13} /> New form</button>}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
        {creating && (
          <div className="card" style={{ padding: '20px 22px', marginBottom: 18, maxWidth: 420 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', marginBottom: 14 }}>New form</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FL label="Name">
                <input className="input-field" value={name} placeholder="e.g. Contact us" onChange={e => setName(e.target.value)} autoFocus />
              </FL>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleCreate}>{saving ? 'Creating…' : 'Create form'}</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {forms === null ? <SectionLoading /> : forms.length === 0 && !creating ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink3)', background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
            No forms yet. Build one once — a contact form, a sign-up — and place it on any page, post or entry with a Form block.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {forms.map(f => (
              <Link key={f.id} to={`/cms/forms/${f.id}`} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="clipboardList" size={16} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{f.key}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 'auto' }}>{f.fields.length} field{f.fields.length === 1 ? '' : 's'}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function emptyField(): CmsFormField { return { key: '', label: '', type: 'text' }; }

/** One form's own field builder + submissions viewer. Fields are edited as
 *  a plain array in local state and saved as a whole on "Save changes" —
 *  the same "edit locally, PATCH the whole array" shape §8's Component
 *  block editor already uses for its own `blocks` array. */
export function CMSFormDetail() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<CmsForm | null>(null);
  const [fields, setFields] = useState<CmsFormField[]>([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'fields' | 'submissions'>('fields');
  const [submissions, setSubmissions] = useState<CmsFormSubmission[] | null>(null);

  function load() {
    if (!formId) return;
    apiFetch(`/v1/cms/forms/${formId}`).then((f: CmsForm) => {
      setForm(f); setFields(f.fields); setSuccessMessage(f.success_message || ''); setNotifyEmail(f.notify_email || ''); setDirty(false);
    }).catch(() => setForm(null));
  }
  useEffect(load, [formId]);

  useEffect(() => {
    if (tab !== 'submissions' || !formId) return;
    apiFetch(`/v1/cms/forms/${formId}/submissions?limit=200`).then(r => setSubmissions(r.submissions)).catch(() => setSubmissions([]));
  }, [tab, formId]);

  function updateField(i: number, patch: Partial<CmsFormField>) {
    setFields(fs => fs.map((f, idx) => idx === i ? { ...f, ...patch } : f));
    setDirty(true);
  }
  function addField() {
    setFields(fs => [...fs, emptyField()]);
    setDirty(true);
  }
  function removeField(i: number) {
    setFields(fs => fs.filter((_, idx) => idx !== i));
    setDirty(true);
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    try {
      const updated: CmsForm = await apiFetch(`/v1/cms/forms/${form.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields, success_message: successMessage || null, notify_email: notifyEmail || null }),
      });
      setForm(updated); setFields(updated.fields); setDirty(false);
    } catch (e: any) {
      showAlert(`Failed to save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    if (!form) return;
    const name = await showPrompt('Form name', { defaultValue: form.name });
    if (!name) return;
    try {
      const updated = await apiFetch(`/v1/cms/forms/${form.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      setForm(updated);
    } catch (e: any) {
      showAlert(`Failed to rename: ${e.message}`);
    }
  }

  async function handleDelete() {
    if (!form) return;
    if (!(await showConfirm(`Delete "${form.name}"? Any Form block placed with this form's key will stop rendering, and every stored submission is deleted with it.`, { confirmLabel: 'Delete form' }))) return;
    try {
      await apiFetch(`/v1/cms/forms/${form.id}`, { method: 'DELETE' });
      navigate('/cms/forms');
    } catch (e: any) {
      showAlert(e.message || 'Failed to delete form.');
    }
  }

  function exportCsv() {
    if (!form || !submissions?.length) return;
    const headers = form.fields.map(f => f.label);
    const keys = form.fields.map(f => f.key);
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Submitted', ...headers].map(esc).join(','),
      ...submissions.map(s => [new Date(s.created_at).toISOString(), ...keys.map(k => s.data[k])].map(esc).join(',')),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${form.key}-submissions.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!form) return <SectionLoading />;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Forms', form.name]}
        titlePlain={form.name}
        titleEm="fields"
        subtitle={`Place this form anywhere with a Form block — key "${form.key}".`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={handleRename}>Rename</button>
            {tab === 'fields' && <button className="btn btn-primary btn-sm" disabled={saving || !dirty} onClick={handleSave}>{saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>}
          </div>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', maxWidth: 720 }}>
        <div style={{ marginBottom: 14 }}>
          <Tabs value={tab} onValueChange={v => setTab(v as any)} variant="segmented">
            <TabsList>
              <TabsTrigger value="fields">Fields</TabsTrigger>
              <TabsTrigger value="submissions">Submissions</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {tab === 'fields' ? (
          <>
            <div className="card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {fields.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingBottom: 12, borderBottom: i < fields.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ flex: 2 }}>
                    <input className="input-field" style={{ fontSize: 13 }} placeholder="Field label, e.g. Your name" value={f.label} onChange={e => updateField(i, { label: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Select value={f.type} onValueChange={v => updateField(i, { type: v as CmsFormFieldType, options: v === 'select' ? (f.options?.length ? f.options : ['']) : undefined })}>
                      <SelectTrigger className="input-field" style={{ fontSize: 13 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(FIELD_TYPE_LABELS) as CmsFormFieldType[]).map(t => <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexShrink: 0, paddingTop: 8 }}>
                    <input type="checkbox" checked={!!f.required} onChange={e => updateField(i, { required: e.target.checked })} /> Required
                  </label>
                  <button type="button" onClick={() => removeField(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', flexShrink: 0, paddingTop: 6 }}>
                    <Icon name="x" size={14} />
                  </button>
                  {f.type === 'select' && (
                    <div style={{ flexBasis: '100%', marginTop: 4 }}>
                      <input className="input-field" style={{ fontSize: 12 }} placeholder="Options, comma-separated"
                        value={(f.options || []).join(', ')}
                        onChange={e => updateField(i, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                    </div>
                  )}
                </div>
              ))}
              {fields.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 12.5, textAlign: 'center', padding: '12px 0' }}>No fields yet — add the first one below.</div>}
              <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={addField}><Icon name="plus" size={12} /> Add field</button>
            </div>

            <div className="card" style={{ padding: '20px 22px', marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FL label="Success message (optional)">
                <input className="input-field" style={{ fontSize: 13 }} placeholder="Thanks — we'll be in touch shortly." value={successMessage} onChange={e => { setSuccessMessage(e.target.value); setDirty(true); }} />
              </FL>
              <FL label="Notify email (optional)">
                <input className="input-field" style={{ fontSize: 13 }} placeholder="sales@yourcompany.com" value={notifyEmail} onChange={e => { setNotifyEmail(e.target.value); setDirty(true); }} />
              </FL>
            </div>

            <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
              <button onClick={handleDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--red)' }}>Delete this form</button>
            </div>
          </>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <button className="btn btn-secondary btn-sm" disabled={!submissions?.length} onClick={exportCsv}><Icon name="download" size={12} /> Export CSV</button>
            </div>
            {submissions === null ? <SectionLoading /> : submissions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>
                <Icon name="inbox" size={22} /><div style={{ marginTop: 8, fontSize: 12.5 }}>No submissions yet.</div>
              </div>
            ) : (
              <div className="rtbl-wrap">
                <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Submitted</th>
                      {form.fields.map(f => <th key={f.key} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{f.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{new Date(s.created_at).toLocaleString()}</td>
                        {form.fields.map(f => <td key={f.key} style={{ padding: '8px 12px' }}>{String(s.data[f.key] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
