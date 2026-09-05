import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DateTimePicker } from '../../components/ui/date-picker.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';

/** Format a Date to "YYYY-MM-DDTHH:mm" in local time — same shape a native
 *  <input type="datetime-local"> value had, so the existing string form
 *  state (parsed with `new Date(...)` on save) keeps working unchanged. */
const toLocalDateTimeString = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface Campaign {
  id: string; name: string; status: string; group_id: string | null; template_id: string | null;
  scheduled_at: string | null; sent_at: string | null; total_recipients: number; created_at: string;
  messageStats: Record<string, number>;
}
interface Group { id: string; name: string; memberCount: number; }
interface Template { id: string; name: string; body: string; }

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray' | 'info'> = {
  draft: 'gray', scheduled: 'info', sending: 'warning', sent: 'success', failed: 'error', cancelled: 'gray',
};

export function SmsCampaigns() {
  usePageSEO('SMS Campaigns', 'Scheduled and one-off bulk SMS campaigns sent to a saved group.');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', body: '', templateId: '', groupId: '', scheduledAt: '' });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/sms/campaigns').then(res => setCampaigns(res.data || [])),
      apiFetch('/v1/sms/groups').then(res => setGroups(res.data || [])),
      apiFetch('/v1/sms/templates').then(res => setTemplates(res.data || [])),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  function pickTemplate(id: string) {
    const t = templates.find(x => x.id === id);
    setForm(p => ({ ...p, templateId: id, body: t ? t.body : p.body }));
  }

  async function save() {
    if (!form.name.trim()) { setError('Campaign name is required.'); return; }
    if (!form.body.trim() && !form.templateId) { setError('Provide a message or pick a template.'); return; }
    if (!form.groupId) { setError('Choose a target group.'); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch('/v1/sms/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(), body: form.body.trim() || undefined,
          templateId: form.templateId || undefined, groupId: form.groupId,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        }),
      });
      setForm({ name: '', body: '', templateId: '', groupId: '', scheduledAt: '' });
      setShowForm(false);
      load();
    } catch (err: any) { setError(err.message || 'Failed to create campaign'); }
    finally { setSaving(false); }
  }

  async function sendNow(c: Campaign) {
    if (!await showConfirm(`Send "${c.name}" to its target group right now?`, { title: 'Send campaign?', confirmLabel: 'Send now' })) return;
    await apiFetch(`/v1/sms/campaigns/${c.id}/send`, { method: 'POST' }).catch(() => {});
    load();
  }

  async function remove(id: string, name: string) {
    if (!await showConfirm(`"${name}" will be permanently removed.`, { title: 'Delete campaign?', variant: 'danger', confirmLabel: 'Delete' })) return;
    setCampaigns(prev => prev.filter(c => c.id !== id));
    await apiFetch(`/v1/sms/campaigns/${id}`, { method: 'DELETE' }).catch(load);
  }

  function groupName(id: string | null) { return groups.find(g => g.id === id)?.name || '—'; }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Campaigns']}
        titlePlain="Bulk"
        titleEm="campaigns"
        subtitle="Send a message to a whole group now, or schedule it for later."
        actions={<Button onClick={() => setShowForm(s => !s)}><Icon name="plus" size={14} /> New campaign</Button>}
      />

      {showForm && (
        <SectionCard title="New campaign" collapsible={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Campaign name *</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. August promo" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Target group *</label>
              <Select value={form.groupId} onValueChange={v => setForm(p => ({ ...p, groupId: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose a group…" /></SelectTrigger>
                <SelectContent>
                  {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name} ({g.memberCount})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {templates.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Start from a template (optional)</label>
              <Select value={form.templateId} onValueChange={pickTemplate}>
                <SelectTrigger><SelectValue placeholder="No template…" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Message *</label>
            <Textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} placeholder="Message body…" rows={4} maxLength={1600} />
          </div>

          <div style={{ marginBottom: 14, maxWidth: 280 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Schedule for later (optional)</label>
            <DateTimePicker
              date={form.scheduledAt ? new Date(form.scheduledAt) : undefined}
              onChange={d => setForm(p => ({ ...p, scheduledAt: d ? toLocalDateTimeString(d) : '' }))}
              triggerClassName="w-full"
            />
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>Leave blank to save as a draft you send manually.</div>
          </div>

          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button disabled={saving} onClick={save}>{saving ? 'Saving…' : form.scheduledAt ? 'Schedule campaign' : 'Save as draft'}</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setError(null); }}>Cancel</Button>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Campaigns" padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : campaigns.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No campaigns yet.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Campaign', 'Group', 'Status', 'Recipients', 'Scheduled / Sent', ''].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    <Link to={`/sms/campaigns/${c.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{c.name}</Link>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{groupName(c.group_id)}</td>
                  <td style={{ padding: '12px 16px' }}><Badge variant={STATUS_VARIANT[c.status] || 'gray'}>{c.status}</Badge></td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink)' }}>{c.total_recipients}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>
                    {c.sent_at ? new Date(c.sent_at).toLocaleString() : c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {(c.status === 'draft' || c.status === 'scheduled') && (
                      <Button size="sm" variant="outline" onClick={() => sendNow(c)}><Icon name="send" size={13} /> Send now</Button>
                    )}
                    <Link to={`/sms/campaigns/${c.id}`}><Button size="sm" variant="outline">Open</Button></Link>
                    {c.status !== 'sending' && <Button size="sm" variant="ghost" onClick={() => remove(c.id, c.name)}><Icon name="trash" size={13} color="var(--red)" /></Button>}
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
