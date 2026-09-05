import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';

interface Template { id: string; name: string; body: string; created_at: string; }

export function SmsTemplates() {
  usePageSEO('SMS Templates', 'Reusable message templates for quick sends and campaigns.');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', body: '' });

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/sms/templates').then(res => setTemplates(res.data || [])).catch(() => setTemplates([])).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  function startCreate() { setEditing(null); setForm({ name: '', body: '' }); setShowForm(true); }
  function startEdit(t: Template) { setEditing(t); setForm({ name: t.name, body: t.body }); setShowForm(true); }

  async function save() {
    if (!form.name.trim() || !form.body.trim()) { setError('Name and message body are both required.'); return; }
    setSaving(true); setError(null);
    try {
      if (editing) await apiFetch(`/v1/sms/templates/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      else await apiFetch('/v1/sms/templates', { method: 'POST', body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch (err: any) { setError(err.message || 'Failed to save template'); }
    finally { setSaving(false); }
  }

  async function remove(id: string, name: string) {
    if (!await showConfirm(`"${name}" will be permanently removed.`, { title: 'Delete template?', variant: 'danger', confirmLabel: 'Delete' })) return;
    setTemplates(prev => prev.filter(t => t.id !== id));
    await apiFetch(`/v1/sms/templates/${id}`, { method: 'DELETE' }).catch(load);
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Templates']}
        titlePlain="Message"
        titleEm="templates"
        subtitle="Reusable {{variable}}-style message bodies for quick sends and campaigns."
        actions={<Button onClick={startCreate}><Icon name="plus" size={14} /> New template</Button>}
      />

      {showForm && (
        <SectionCard title={editing ? 'Edit template' : 'New template'} collapsible={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Name *</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Payment reminder" style={{ maxWidth: 340 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Message *</label>
              <Textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} placeholder="Hi {{name}}, your invoice is due…" rows={4} maxLength={1600} />
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>{form.body.length} characters</div>
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button disabled={saving} onClick={save}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create template'}</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setError(null); }}>Cancel</Button>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Templates" padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : templates.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No templates yet.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Name', 'Message', ''].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{t.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)', maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="outline" onClick={() => startEdit(t)}><Icon name="edit" size={13} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(t.id, t.name)}><Icon name="trash" size={13} color="var(--red)" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </SectionCard>
    </div>
  );
}
