// ─── OneIdPersonalDevices.tsx — Ondi Personal · Devices ───────────
// Real hr_devices rows via the same self-service /v1/security/sessions*
// endpoints AccountSecurityPanel's "Active Sessions" card already uses —
// this is a dedicated page for it (matching the house-style mockup's own
// "Devices" nav entry) rather than a second copy of the data. Adds one
// thing AccountSecurityPanel's card didn't have: renaming a device, even
// though PATCH /sessions/:id already supported it.
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useAuth } from '../hooks/useAuth.js';

interface DeviceRow {
  id: string; device_label: string | null; device_type: string | null; user_agent: string | null;
  trusted: boolean; last_used_at: string; created_at: string; revoked_at: string | null;
  is_current: boolean; active: boolean;
}

function relTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (sec < 60) return `${Math.max(sec, 0)} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hrs ago`;
  return `${Math.floor(hr / 24)} days ago`;
}

export const OneIdPersonalDevices: React.FC = () => {
  const { logout } = useAuth();
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const reload = useCallback(async () => {
    try { setDevices(await apiFetch('/v1/security/sessions')); } catch { setDevices([]); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function signOut(id: string) {
    if (!(await showConfirm('Sign out this device? It will need to sign in again.', { variant: 'warning', confirmLabel: 'Sign Out' }))) return;
    try {
      const res = await apiFetch(`/v1/security/sessions/${id}`, { method: 'DELETE' });
      if (res.was_current) { logout(); return; }
      await reload();
    } catch (err: any) { showAlert(err.message); }
  }

  async function signOutOthers() {
    if (!(await showConfirm('Sign out of every other device? Those sessions will need to log in again.', { variant: 'warning', confirmLabel: 'Sign Out Others' }))) return;
    try { await apiFetch('/v1/security/sessions/revoke-others', { method: 'POST' }); await reload(); }
    catch (err: any) { showAlert(err.message); }
  }

  async function saveRename(id: string) {
    const label = renameValue.trim();
    if (!label) { setRenamingId(null); return; }
    try {
      await apiFetch(`/v1/security/sessions/${id}`, { method: 'PATCH', body: JSON.stringify({ label }) });
      setRenamingId(null);
      await reload();
    } catch (err: any) { showAlert(err.message); }
  }

  const active = (devices ?? []).filter(d => d.active);

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Your"
        titleEm="devices"
        subtitle="Every device currently signed in to your account."
        actions={active.length > 1 ? (
          <button type="button" onClick={signOutOthers}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--white)', color: 'var(--red)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
            Sign out other devices
          </button>
        ) : undefined}
      />

      <SectionCard padded={false}>
        {devices === null && <div style={{ padding: '20px', fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}
        {devices !== null && active.length === 0 && <div style={{ padding: '20px', fontSize: 13, color: 'var(--ink3)' }}>No active devices found.</div>}
        {active.map((d, i, arr) => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={d.device_type === 'mobile' ? 'smartphone' : 'monitor'} size={19} color="var(--ink3)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {renamingId === d.id ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveRename(d.id); if (e.key === 'Escape') setRenamingId(null); }}
                    style={{ fontSize: 13, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 7, fontFamily: 'var(--font)' }} />
                  <button type="button" onClick={() => saveRename(d.id)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}>Save</button>
                  <button type="button" onClick={() => setRenamingId(null)} style={{ fontSize: 12, color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {d.device_label || d.user_agent || 'Unknown device'}
                  {d.is_current && <span style={{ padding: '1px 8px', borderRadius: 9, background: 'var(--green-l)', color: '#059669', fontSize: 10, fontWeight: 700 }}>This device</span>}
                  {d.trusted && <span style={{ padding: '1px 8px', borderRadius: 9, background: 'var(--teal-l)', color: 'var(--teal)', fontSize: 10, fontWeight: 700 }}>Trusted</span>}
                </div>
              )}
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 3 }}>Last active {relTime(d.last_used_at)}</div>
            </div>
            {renamingId !== d.id && (
              <>
                <button type="button" title="Rename" onClick={() => { setRenamingId(d.id); setRenameValue(d.device_label || ''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 6 }}>
                  <Icon name="edit" size={15} />
                </button>
                <button type="button" onClick={() => signOut(d.id)}
                  style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--red)', background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                  Sign Out
                </button>
              </>
            )}
          </div>
        ))}
      </SectionCard>
    </div>
  );
};

export default OneIdPersonalDevices;
