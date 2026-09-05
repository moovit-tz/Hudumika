import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { showConfirm } from '../lib/confirm.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

/**
 * Writing the notices that appear in every workspace's header pill.
 *
 * The one thing worth being careful about on this screen is scope: leaving the
 * workspace as "Everyone" publishes to the whole platform, which is the common
 * case and also the one you cannot quietly undo once people have read it. It is
 * stated on the row and in the form rather than being implied by an empty field.
 */

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  badge: string;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  tenant_id: string | null;
  tenant_name: string | null;
  dismissed_count: number;
}

const EMPTY = { title: '', body: '', link: '', badge: 'NEW', tenant_id: '', ends_at: '' };
/** Radix SelectItem cannot take an empty string value — see CLAUDE.md. */
const ALL_TENANTS = '__all__';

function liveState(a: Announcement): { label: string; variant: 'success' | 'gray' | 'warning' } {
  if (!a.active) return { label: 'Off', variant: 'gray' };
  const now = Date.now();
  if (new Date(a.starts_at).getTime() > now) return { label: 'Scheduled', variant: 'warning' };
  if (a.ends_at && new Date(a.ends_at).getTime() <= now) return { label: 'Expired', variant: 'gray' };
  return { label: 'Live', variant: 'success' };
}

export const SuperAdminAnnouncements: React.FC = () => {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    apiFetch('/v1/superadmin/announcements')
      .then(res => setRows(res.data ?? []))
      .catch(err => setError(err?.message ?? 'Could not load announcements'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    apiFetch('/v1/superadmin/tenants')
      .then(res => setTenants((res.data ?? res ?? []).map((t: any) => ({ id: t.id, name: t.name }))))
      // Not fatal: without the list the form simply cannot narrow to one
      // workspace, which still leaves the common platform-wide case working.
      .catch(() => setTenants([]));
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/v1/superadmin/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          body: form.body.trim() || null,
          link: form.link.trim() || null,
          badge: form.badge.trim() || 'NEW',
          tenant_id: form.tenant_id || null,
          ends_at: form.ends_at || null,
        }),
      });
      setForm({ ...EMPTY });
      load();
    } catch (err: any) {
      setError(err?.message ?? 'Could not publish');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(a: Announcement) {
    await apiFetch(`/v1/superadmin/announcements/${a.id}`, {
      method: 'PATCH', body: JSON.stringify({ active: !a.active }),
    }).catch(() => {});
    load();
  }

  async function remove(a: Announcement) {
    const who = a.tenant_name ?? 'every workspace';
    if (!(await showConfirm(`Delete "${a.title}"? It was published to ${who}.`, { variant: 'warning', confirmLabel: 'Delete' }))) return;
    await apiFetch(`/v1/superadmin/announcements/${a.id}`, { method: 'DELETE' }).catch(() => {});
    load();
  }

  return (
    <div>
      <PageHeader
        crumbs={['Admin', 'Announcements']}
        titlePlain="Header"
        titleEm="announcements"
        subtitle="Notices shown in the header pill, above every workspace's own notifications."
      />

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18, border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Title</span>
            <input className="input-field" value={form.title} required
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Scheduled maintenance Sunday" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Supporting line</span>
            <input className="input-field" value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="02:00–04:00 EAT, ClearOS read-only" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Badge</span>
            <input className="input-field" value={form.badge} maxLength={24}
              onChange={e => setForm(f => ({ ...f, badge: e.target.value }))}
              placeholder="NEW" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Links to</span>
            <input className="input-field" value={form.link}
              onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
              placeholder="/clearos/ops" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Workspace</span>
            <Select value={form.tenant_id || ALL_TENANTS}
              onValueChange={v => setForm(f => ({ ...f, tenant_id: v === ALL_TENANTS ? '' : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TENANTS}>Everyone on the platform</SelectItem>
                {tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Stops showing</span>
            <input className="input-field" type="datetime-local" value={form.ends_at}
              onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} />
          </label>
        </div>

        {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !form.title.trim()}>
            {saving ? 'Publishing…' : 'Publish'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
            {form.tenant_id
              ? `Only ${tenants.find(t => t.id === form.tenant_id)?.name ?? 'that workspace'} will see this.`
              : 'Everyone on the platform will see this. Leave "Stops showing" blank and it runs until switched off.'}
          </span>
        </div>
      </form>

      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              {['Announcement', 'Audience', 'State', 'Dismissed by', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} style={{ padding: 36, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 36, textAlign: 'center', color: 'var(--ink3)' }}>Nothing published yet.</td></tr>
            )}
            {rows.map(a => {
              const state = liveState(a);
              return (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge variant="brand">{a.badge}</Badge>
                      <strong style={{ color: 'var(--ink)' }}>{a.title}</strong>
                    </div>
                    {a.body && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3 }}>{a.body}</div>}
                  </td>
                  <td style={{ padding: '11px 14px', color: 'var(--ink2)' }}>
                    {a.tenant_name ?? <span style={{ fontWeight: 700 }}>Everyone</span>}
                  </td>
                  <td style={{ padding: '11px 14px' }}><Badge variant={state.variant}>{state.label}</Badge></td>
                  <td style={{ padding: '11px 14px', color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums' }}>{a.dismissed_count}</td>
                  <td style={{ padding: '11px 10px', whiteSpace: 'nowrap' }}>
                    <button type="button" title={a.active ? 'Switch off' : 'Switch on'} onClick={() => toggle(a)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)' }}>
                      <Icon name={a.active ? 'pause' : 'play'} size={14} />
                    </button>
                    <button type="button" title="Delete" onClick={() => remove(a)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)' }}>
                      <Icon name="trash2" size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
