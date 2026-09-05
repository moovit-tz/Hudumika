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

  const trustedDevicesCount = devices.filter(d => d.trusted).length;

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['Ondi', 'Sessions']}
        titlePlain="Sessions &"
        titleEm="security"
        subtitle="Manage recognized workspace devices and audit log hash-chain integrity verification."
        actions={
          <Link to="/ondi/policies" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--ink)', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', textDecoration: 'none' }}>
            <Icon name="settings" size={15} /> Session &amp; MFA Policy
          </Link>
        }
      />

      {/* KPI Bar */}
      <div className="ondi-kpi-grid">
        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Audit Chain Integrity</span>
            <div className="ondi-kpi-icon-box" style={{ background: chainStatus?.valid ? '#ecfdf5' : '#fef2f2', color: chainStatus?.valid ? '#047857' : '#b91c1c' }}>
              <Icon name={chainStatus?.valid ? 'checkCircle' : 'shield'} size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ fontSize: 20, color: chainStatus?.valid ? '#047857' : '#b91c1c' }}>
              {chainStatus?.valid ? 'Intact' : chainStatus ? 'Tampered' : 'Checking'}
            </span>
            <span className="ondi-kpi-sub">{chainStatus ? `${chainStatus.checked} logs verified` : 'Cryptographic check'}</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Known Devices</span>
            <div className="ondi-kpi-icon-box"><Icon name="smartphone" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{devices.length}</span>
            <span className="ondi-kpi-sub">{trustedDevicesCount} trusted devices</span>
          </div>
        </div>
      </div>

      {/* Card 1: Audit Log Integrity Verification */}
      <SectionCard title="Cryptographic Hash-Chain Integrity">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 0' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: chainStatus?.valid ? '#ecfdf5' : chainStatus ? '#fef2f2' : 'var(--bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${chainStatus?.valid ? 'rgba(4,120,87,0.2)' : 'var(--border)'}`
          }}>
            <Icon name={chainStatus?.valid ? 'checkCircle' : chainStatus ? 'alertTriangle' : 'shield'} size={22}
              color={chainStatus?.valid ? '#047857' : chainStatus ? '#b91c1c' : 'var(--ink3)'} />
          </div>
          <div style={{ flex: 1 }}>
            {checkingChain ? (
              <div style={{ fontSize: 13.5, color: 'var(--ink3)', fontWeight: 600 }}>Verifying cryptographic hash chain…</div>
            ) : chainStatus ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 800, color: chainStatus.valid ? '#047857' : '#b91c1c' }}>
                  {chainStatus.valid ? 'Audit Log Chain Verified Intact' : 'Tampering Detected in Hash Chain'}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 3 }}>
                  {chainStatus.valid
                    ? `${chainStatus.checked.toLocaleString()} event hashes cryptographically linked and unbroken.`
                    : `Hash chain broken at event ${chainStatus.broken_at} — ${chainStatus.checked.toLocaleString()} events checked.`}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Could not run verification check.</div>
            )}
          </div>
          <button type="button" onClick={checkChain} disabled={checkingChain}
            style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', cursor: checkingChain ? 'default' : 'pointer', opacity: checkingChain ? 0.6 : 1 }}>
            Re-verify Chain
          </button>
        </div>
      </SectionCard>

      {/* Card 2: Known Devices Directory */}
      <div style={{ marginTop: 24 }}>
        <SectionCard title="Recognized Workspace Devices">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="ondi-card-grid">
              {devices.map(d => (
                <div key={d.id} className="ondi-entity-card" style={{ padding: 18, flexDirection: 'row', alignItems: 'center' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--teal-l, #ecfeff)', border: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', flexShrink: 0 }}>
                    <Icon name={d.device_type === 'mobile' ? 'smartphone' : 'monitor'} size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.device_label || 'Unknown Device'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                      User: <strong>{d.user_name}</strong>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink4)', marginTop: 1 }}>
                      {new Date(d.last_used_at).toLocaleString()}
                    </div>
                  </div>
                  <button type="button" onClick={() => toggleTrusted(d)}
                    className={`ondi-status-pill ${d.trusted ? 'success' : 'gray'}`} style={{ border: 'none', cursor: 'pointer' }}>
                    <span className="ondi-status-dot" />
                    {d.trusted ? 'Trusted' : 'Untrusted'}
                  </button>
                </div>
              ))}
            </div>

            {devices.length === 0 && (
              <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No recognized devices recorded yet for this workspace.</div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};

export default OndiSessions;
