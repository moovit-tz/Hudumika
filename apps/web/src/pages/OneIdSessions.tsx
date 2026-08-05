import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';

interface Device {
  id: string; device_label: string | null; device_type: string | null;
  trusted: boolean; last_used_at: string; user_name: string;
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box', maxWidth: 200 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

export const OneIdSessions: React.FC = () => {
  const [timeout_, setTimeout_] = useState(60);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    apiFetch('/v1/settings').then(res => {
      const policy = res?.settings?.sessionPolicy;
      if (policy) {
        setTimeout_(policy.timeoutMinutes ?? 60);
        setMfaRequired(!!policy.mfaRequired);
      }
    }).catch(() => {});
    apiFetch('/v1/oneid/devices').then(setDevices).catch(() => setDevices([]));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiFetch('/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({ sessionPolicy: { timeoutMinutes: timeout_, mfaRequired } }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  async function toggleTrusted(d: Device) {
    const trusted = !d.trusted;
    setDevices(prev => prev.map(x => x.id === d.id ? { ...x, trusted } : x));
    apiFetch(`/v1/oneid/devices/${d.id}`, { method: 'PATCH', body: JSON.stringify({ trusted }) }).catch(() => {});
  }

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>Sessions &amp; Security</div>
      <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 20 }}>Session policy and known devices for this tenant</div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Session policy</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Session timeout (minutes)</label>
            <input type="number" min={5} value={timeout_} onChange={e => setTimeout_(Number(e.target.value))} style={inputStyle} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer', marginBottom: 16 }}>
          <input type="checkbox" checked={mfaRequired} onChange={e => setMfaRequired(e.target.checked)} />
          Require multi-factor authentication for all users
        </label>
        <button type="button" onClick={save} disabled={saving}
          style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save policy'}
        </button>
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Known devices</div>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['User', 'Device', 'Last used', 'Trusted'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.map(d => (
              <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', color: 'var(--ink)' }}>{d.user_name}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={d.device_type === 'mobile' ? 'smartphone' : 'monitor'} size={14} />
                  {d.device_label || 'Unknown device'}
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--ink3)' }}>{new Date(d.last_used_at).toLocaleString()}</td>
                <td style={{ padding: '10px 14px' }}>
                  <button type="button" onClick={() => toggleTrusted(d)}
                    style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: 'var(--ds-btn-py-xs) 12px', border: 'none', cursor: 'pointer', background: d.trusted ? '#ecfdf5' : '#f1f5f9', color: d.trusted ? '#065f46' : '#64748b', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box'}}>
                    {d.trusted ? 'Trusted' : 'Not trusted'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {devices.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No known devices yet.</div>
        )}
      </div>
    </div>
  );
};
