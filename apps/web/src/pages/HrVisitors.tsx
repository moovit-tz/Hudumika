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
  const staffCache = useRef<PickerItem[] | null>(null);

  const reload = useCallback(async () => {
    try { setVisitors(await apiFetch('/v1/ondi/org/visitors')); } catch (err: any) { setVisitors([]); showAlert(err?.message || 'Could not load visitors.'); }
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
              <div style={{ width: 34, height: 34, borderRadius: 'var(--r)', background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="user" size={16} color="var(--green)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{v.name}{v.company ? ` · ${v.company}` : ''}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                  {v.purpose ? `${v.purpose} — ` : ''}{v.host_name ? `visiting ${v.host_name} — ` : ''}since {fmtTime(v.checked_in_at)}
                </div>
              </div>
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink3)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '3px 8px' }}>{v.badge_code}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => checkOut(v)}>
                Check out
              </Button>
            </div>
          ))}
        </SectionCard>
      </div>

      {past.length > 0 && (
        <SectionCard padded={false} title="Recent visits">
          {past.slice(0, 30).map((v, i, arr) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 20px', borderBottom: i < Math.min(arr.length, 30) - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: 'var(--ink)' }}><strong style={{ fontWeight: 600 }}>{v.name}</strong>{v.company ? ` · ${v.company}` : ''}</div>
              </div>
              <Badge variant="gray">Checked out</Badge>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', minWidth: 200, textAlign: 'right' }}>
                {fmtTime(v.checked_in_at)} – {fmtTime(v.checked_out_at!)}
              </div>
            </div>
          ))}
        </SectionCard>
      )}
    </div>
  );
};

export default HrVisitors;
