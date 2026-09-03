import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

interface Device {
  id: string; device_label: string | null; device_type: string | null;
  trusted: boolean; last_used_at: string; user_name: string;
}

interface ChainStatus { valid: boolean; broken_at?: string; checked: number }

export const OndiSessions: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [chainStatus, setChainStatus] = useState<ChainStatus | null>(null);
  const [checkingChain, setCheckingChain] = useState(false);

  useEffect(() => {
    apiFetch('/v1/ondi/devices').then(setDevices).catch(() => setDevices([]));
  }, []);

  // Enterprise Security consolidation (Ondi M6) — the audit-chain integrity
  // check already existed (/v1/security/audit/verify-chain, Ondi M3) but had
  // no UI anywhere; this is that UI, folded into the existing Sessions &
  // Security page rather than given its own nav item.
  async function checkChain() {
    setCheckingChain(true);
    try { setChainStatus(await apiFetch('/v1/security/audit/verify-chain')); }
    catch { setChainStatus(null); }
    finally { setCheckingChain(false); }
  }
  useEffect(() => { checkChain(); }, []);

  async function toggleTrusted(d: Device) {
    const trusted = !d.trusted;
    setDevices(prev => prev.map(x => x.id === d.id ? { ...x, trusted } : x));
    apiFetch(`/v1/ondi/devices/${d.id}`, { method: 'PATCH', body: JSON.stringify({ trusted }) }).catch(() => {});
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader
        crumbs={['Ondi', 'Sessions']}
        titlePlain="Sessions &"
        titleEm="security"
        subtitle="Known devices and audit log integrity for this tenant."
        actions={
          <Link to="/ondi/policies" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '8px 14px', textDecoration: 'none' }}>
            <Icon name="settings" size={14} /> Session &amp; MFA policy
          </Link>
        }
      />

      {/* Card 0: Audit Log Integrity */}
      <div style={{ marginBottom: 24 }}>
        <SectionCard title="Audit Log Integrity">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 6px' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: chainStatus?.valid ? 'var(--green-l)' : chainStatus ? 'var(--red-l)' : 'var(--bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name={chainStatus?.valid ? 'checkCircle' : chainStatus ? 'alertTriangle' : 'shield'} size={19}
                color={chainStatus?.valid ? 'var(--green)' : chainStatus ? 'var(--red)' : 'var(--ink3)'} />
            </div>
            <div style={{ flex: 1 }}>
              {checkingChain ? (
                <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Checking…</div>
              ) : chainStatus ? (
                <>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: chainStatus.valid ? 'var(--green)' : 'var(--red)' }}>
                    {chainStatus.valid ? 'Audit log intact' : 'Tampering detected'}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                    {chainStatus.valid
                      ? `${chainStatus.checked.toLocaleString()} events verified, hash chain unbroken.`
                      : `Chain breaks at event ${chainStatus.broken_at} — ${chainStatus.checked.toLocaleString()} events checked.`}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Could not run the check.</div>
              )}
            </div>
            <button type="button" onClick={checkChain} disabled={checkingChain}
              style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', cursor: checkingChain ? 'default' : 'pointer', opacity: checkingChain ? 0.6 : 1 }}>
              Re-check
            </button>
          </div>
        </SectionCard>
      </div>

      {/* Known Devices Directory (Responsive Cards) */}
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

export default OndiSessions;
