import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

interface Group { id: string; name: string; description: string | null; memberCount: number; created_at: string; }

export function SmsGroups() {
  usePageSEO('SMS Groups', 'Manage recipient groups for SMS campaigns and bulk sends.');
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/sms/groups').then(res => setGroups(res.data || [])).catch(() => setGroups([])).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function save() {
    if (!form.name.trim()) { setError('Group name is required.'); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch('/v1/sms/groups', { method: 'POST', body: JSON.stringify({ name: form.name.trim(), description: form.description.trim() || undefined }) });
      setForm({ name: '', description: '' });
      setShowForm(false);
      load();
    } catch (err: any) { setError(err.message || 'Failed to create group'); }
    finally { setSaving(false); }
  }

  async function remove(id: string, name: string) {
    if (!await showConfirm(`"${name}" and its member list will be permanently removed. Campaigns already sent are unaffected.`, { title: 'Delete group?', variant: 'danger', confirmLabel: 'Delete' })) return;
    setGroups(prev => prev.filter(g => g.id !== id));
    await apiFetch(`/v1/sms/groups/${id}`, { method: 'DELETE' }).catch(load);
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Groups']}
        titlePlain="Recipient"
        titleEm="groups"
        subtitle="Reusable lists of phone numbers for campaigns and bulk sends — add members manually or from Contacts, CRM leads, customers and staff."
        actions={<Button onClick={() => setShowForm(s => !s)}><Icon name="plus" size={14} /> New group</Button>}
      />

      {showForm && (
        <SectionCard title="New group" collapsible={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Name *</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. VIP Customers" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Description</label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="What this group is used for" rows={1} />
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button disabled={saving} onClick={save}>{saving ? 'Creating…' : 'Create group'}</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setError(null); }}>Cancel</Button>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Groups" padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : groups.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No groups yet. Create one to start building recipient lists.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Group', 'Description', 'Members', 'Created', ''].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {groups.map(g => (
                <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    <Link to={`/sms/groups/${g.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{g.name}</Link>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{g.description || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{g.memberCount}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{new Date(g.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Link to={`/sms/groups/${g.id}`}><Button size="sm" variant="outline">Open <Icon name="arrowRight" size={13} /></Button></Link>
                    <Button size="sm" variant="ghost" onClick={() => remove(g.id, g.name)}><Icon name="trash" size={13} color="var(--red)" /></Button>
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
