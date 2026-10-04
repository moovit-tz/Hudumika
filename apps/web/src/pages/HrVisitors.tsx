// ─── HrVisitors.tsx — NexusHR · Front desk ─────────────────────────
// Front-desk sign-in — real check-in/check-out, a real (if simple) badge
// code, no invented QR/kiosk hardware integration.
//
// Moved here from Ondi (was OneIdVisitors.tsx at /ondi/visitors) — a
// physical front-desk log isn't an authentication moment, so it never fit
// Ondi's own "appears at the moment of authentication, almost nowhere else"
// rule; this belongs with NexusHR's other people/records surfaces instead.
// Backend endpoint kept as-is (/v1/ondi/org/visitors) — only the page/nav
// moved, not the API.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { showAlert } from '../lib/alert.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { MetricsRow } from '../components/MetricCard.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { PersonAvatar } from '../components/PersonAvatar.js';

interface Visitor {
  id: string; name: string; company: string | null; purpose: string | null;
  badge_code: string; checked_in_at: string; checked_out_at: string | null;
  host_user_id: string | null; host_name: string | null;
}

function fmtTime(d: string): string {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const HrVisitors: React.FC = () => {
  const [visitors, setVisitors] = useState<Visitor[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [purpose, setPurpose] = useState('');
  const [host, setHost] = useState<PickerItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const staffCache = useRef<PickerItem[] | null>(null);

  const reload = useCallback(async () => {
    setLoadError(null);
    try { setVisitors(await apiFetch('/v1/ondi/org/visitors')); } catch (err: any) {
      setVisitors([]);
      setLoadError(err?.message || 'Could not load visitors.');
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // EntityPicker takes a search callback, not a built-in entity registry —
  // the staff list is small enough on this platform's typical tenant size
  // to fetch once and filter client-side, same pattern used elsewhere
  // rather than standing up a new /search endpoint.
  const searchStaff = useCallback(async (query: string): Promise<PickerItem[]> => {
    if (!staffCache.current) {
      const users = await apiFetch('/v1/ondi/users').catch(() => []);
      staffCache.current = users.map((u: any) => ({ id: u.id, label: u.name, sublabel: u.email }));
    }
    const q = query.trim().toLowerCase();
    const all = staffCache.current ?? [];
    return q ? all.filter(u => u.label.toLowerCase().includes(q) || u.sublabel?.toLowerCase().includes(q)) : all;
  }, []);

  function resetForm() { setName(''); setCompany(''); setPurpose(''); setHost(null); }

  async function checkIn() {
    if (!name.trim()) { showAlert('A name is required.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/ondi/org/visitors', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), company: company.trim() || undefined, purpose: purpose.trim() || undefined, host_user_id: host?.id }),
      });
      resetForm(); setShowNew(false);
      await reload();
    } catch (err: any) { showAlert(err.message); } finally { setSaving(false); }
  }

  async function checkOut(v: Visitor) {
    try { await apiFetch(`/v1/ondi/org/visitors/${v.id}/check-out`, { method: 'POST' }); await reload(); }
    catch (err: any) { showAlert(err.message); }
  }

  const present = visitors?.filter(v => !v.checked_out_at) ?? [];
  const past = visitors?.filter(v => v.checked_out_at) ?? [];
  const checkedOutToday = past.filter(visitor => new Date(visitor.checked_out_at!).toDateString() === new Date().toDateString()).length;
  const pastColumns: TableColumn<Visitor>[] = [
    { key: 'name', header: 'Visitor', accessor: 'name', sortable: true, render: visitor => <span><strong>{visitor.name}</strong>{visitor.company ? ` · ${visitor.company}` : ''}</span> },
    { key: 'host', header: 'Host', render: visitor => visitor.host_name || '—' },
    { key: 'purpose', header: 'Purpose', render: visitor => visitor.purpose || '—', hideAt: 'sm' },
    { key: 'status', header: 'Status', render: () => <Badge variant="gray">Checked out</Badge>, width: 120 },
    { key: 'visit', header: 'Visit', render: visitor => `${fmtTime(visitor.checked_in_at)} – ${fmtTime(visitor.checked_out_at!)}`, width: 260 },
  ];

  return (
    <div>
      <PageHeader
        crumbs={['NexusHR', 'Records']}
        titlePlain="Front desk"
        titleEm="visitors"
        subtitle="Who's on-site right now, and who's been in recently."
        actions={!showNew ? (
          <Button type="button" onClick={() => setShowNew(true)}>
            <Icon name="userPlus" size={15} /> Check in a visitor
          </Button>
        ) : undefined}
      />

      <MetricsRow cards={[
        { title: 'On-site now', value: String(present.length), icon: 'user', barHighlight: 'var(--green)', loading: visitors === null, error: loadError ?? undefined, onRetry: reload, emphasis: 'primary' },
        { title: 'Checked out today', value: String(checkedOutToday), icon: 'checkCircle', loading: visitors === null, error: loadError ?? undefined, onRetry: reload },
        { title: 'Recent visit records', value: String(past.length), icon: 'clock', loading: visitors === null, error: loadError ?? undefined, onRetry: reload },
      ]} />

      {showNew && (
        <div style={{ marginBottom: 20 }}>
          <SectionCard title="Check in">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Visitor's name" />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Company (optional)</label>
                <Input value={company} onChange={e => setCompany(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Visiting</label>
                <EntityPicker value={host} onChange={setHost} search={searchStaff} placeholder="Who are they here to see?" />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Purpose (optional)</label>
              <Input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Interview, delivery, meeting" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="button" disabled={saving} onClick={checkIn}>
                {saving ? 'Checking in…' : 'Check in'}
              </Button>
              <Button type="button" variant="outline" onClick={() => { setShowNew(false); resetForm(); }}>
                Cancel
              </Button>
            </div>
          </SectionCard>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <SectionCard padded={false} title={`On-site now (${present.length})`}>
          {visitors === null && <SectionLoading />}
          {visitors !== null && present.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>Nobody checked in right now.</div>}
          {present.map((v, i, arr) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <PersonAvatar name={v.name} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{v.name}{v.company ? ` · ${v.company}` : ''}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                  {v.purpose ? `${v.purpose} — ` : ''}{v.host_name ? `visiting ${v.host_name} — ` : ''}since {fmtTime(v.checked_in_at)}
                </div>
              </div>
              <span style={{ fontSize: 11, fontFamily: 'var(--font)', color: 'var(--ink3)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '3px 8px' }}>{v.badge_code}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => checkOut(v)}>
                Check out
              </Button>
            </div>
          ))}
        </SectionCard>
      </div>

      <SectionCard padded={false} title="Recent visits">
        <DataTable
          columns={pastColumns}
          rows={past.slice(0, 30)}
          loading={visitors === null}
          error={loadError ?? undefined}
          onRetry={reload}
          empty={visitors !== null && !loadError && past.length === 0}
          emptyIcon="clock"
          emptyTitle="No recent visits"
          emptyMessage="Completed visits will appear here after a visitor checks out."
          defaultSortKey="visit"
          defaultSortDir="desc"
          compact
        />
      </SectionCard>
    </div>
  );
};

export default HrVisitors;
