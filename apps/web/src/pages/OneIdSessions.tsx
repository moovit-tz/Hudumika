import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

interface Device {
  id: string; device_label: string | null; device_type: string | null;
  trusted: boolean; last_used_at: string; user_name: string;
}

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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 'var(--r-sm, 6px)',
    border: '1px solid var(--border)',
    fontFamily: 'var(--font)',
    fontSize: 13,
    background: 'var(--bg)',
    color: 'var(--ink)',
    boxSizing: 'border-box',
    maxWidth: 240
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader
        crumbs={['Ondi', 'Sessions']}
        titlePlain="Sessions &"
        titleEm="security"
        subtitle="Session policy and known devices for this tenant."
      />

      {/* Card 1: Session Policy Configuration */}
      <div style={{ marginBottom: 24 }}>
        <SectionCard title="Session Policy">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 6px' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>
                Session Timeout (Minutes)
              </label>
              <input type="number" min={5} value={timeout_} onChange={e => setTimeout_(Number(e.target.value))} style={inputStyle} />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer', marginTop: 4 }}>
              <input type="checkbox" checked={mfaRequired} onChange={e => setMfaRequired(e.target.checked)} style={{ cursor: 'pointer' }} />
              Enforce Multi-Factor Authentication (MFA) for all tenant logins
            </label>

            <div style={{ marginTop: 8 }}>
              <button type="button" onClick={save} disabled={saving}
                style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Policy'}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Card 2: Known Devices Directory (Responsive Cards) */}
      <SectionCard title="Known Devices">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 6px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {devices.map(d => (
              <div key={d.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--white)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', flexShrink: 0 }}>
                  <Icon name={d.device_type === 'mobile' ? 'smartphone' : 'monitor'} size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.device_label || 'Unknown Device'}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                    Last used: {new Date(d.last_used_at).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 2, fontWeight: 500 }}>
                    User: {d.user_name}
                  </div>
                </div>
                <button type="button" onClick={() => toggleTrusted(d)}
                  style={{
                    fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '4px 12px', border: 'none', cursor: 'pointer',
                    background: d.trusted ? '#ecfdf5' : '#f1f5f9',
                    color: d.trusted ? '#047857' : '#64748b',
                    minHeight: '26px'
                  }}
                >
                  {d.trusted ? 'Trusted' : 'Untrusted'}
                </button>
              </div>
            ))}
          </div>

          {devices.length === 0 && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No known devices recorded yet for this workspace.</div>
          )}
        </div>
      </SectionCard>
    </div>
  );
};

export default OneIdSessions;
