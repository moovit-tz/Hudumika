// ─── OneIdPersonal.tsx — Ondi Personal · My Profile ───────────────
// Real identity snapshot only — no simulated encryption, no fabricated
// credit-scoring events (this platform has no credit-scoring engine
// anywhere). See lib/landingStyle.ts-adjacent Ondi memory for why: this
// page used to hardcode a trust score, a fake "Encrypted Vault" with
// setTimeout-simulated crypto and a fake downloaded blob, and fictional
// "credit events" (loan repayments, BRELA checks) — none backed by
// anything real. Editing/verification/vault are now their own real pages
// (Security Settings, Document Vault), linked from the Personal sidebar.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';

interface KycStatus { kyc_status: string; verification_level: string; latest_submission: any }
interface TrustScore { score: number; tier: 'LOW' | 'MEDIUM' | 'HIGH' }
interface ReliabilitySignals {
  score: number; tier: 'LOW' | 'MEDIUM' | 'HIGH';
  signals: {
    tenureMonths: number; employmentActive: boolean;
    pettyCashApprovalRate: number | null; pettyCashOutstandingCount: number;
    attendanceRate: number | null; leaveApprovalRate: number | null;
  };
}

const VERIFICATION_LABEL: Record<string, string> = {
  unverified: 'Unverified', phone_verified: 'Phone Verified', id_verified: 'ID Verified', enhanced: 'Enhanced',
};
const TRUST_TIER_COLOR: Record<string, string> = { LOW: '#dc2626', MEDIUM: '#d97706', HIGH: '#059669' };

function roleLabel(role?: string): string {
  if (!role) return '';
  return role.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
}

export const OneIdPersonal: React.FC = () => {
  const { user } = useAuth();
  const [kyc, setKyc] = useState<KycStatus | null>(null);
  const [trust, setTrust] = useState<TrustScore | null>(null);
  const [reliability, setReliability] = useState<ReliabilitySignals | null>(null);

  useEffect(() => {
    apiFetch('/v1/oneid/kyc/status').then(setKyc).catch(() => setKyc(null));
    apiFetch('/v1/security/trust-score').then(setTrust).catch(() => setTrust(null));
    apiFetch('/v1/security/reliability-signals').then(setReliability).catch(() => setReliability(null));
  }, []);

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="My"
        titleEm="identity"
        subtitle="Your own identity verification, trust score, and security — real data, not a demo."
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 20, alignItems: 'start' }}>
        <SectionCard title="Identity">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="fingerprint" size={22} color="var(--teal)" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{user?.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{user?.email} · {roleLabel(user?.role)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
              <span style={{ color: 'var(--ink2)', fontWeight: 600 }}>Verification Level</span>
              {kyc ? <Badge variant={kyc.kyc_status === 'approved' ? 'success' : kyc.kyc_status === 'pending' ? 'warning' : 'gray'}>{VERIFICATION_LABEL[kyc.verification_level] || kyc.verification_level}</Badge> : <span style={{ color: 'var(--ink4)' }}>Loading…</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <span style={{ color: 'var(--ink2)', fontWeight: 600 }}>KYC Status</span>
              {kyc ? <Badge variant={kyc.kyc_status === 'approved' ? 'success' : kyc.kyc_status === 'pending' ? 'warning' : kyc.kyc_status === 'rejected' ? 'error' : 'gray'}>{kyc.kyc_status.replace('_', ' ')}</Badge> : <span style={{ color: 'var(--ink4)' }}>Loading…</span>}
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/ondi/personal/security" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: 13, textDecoration: 'none', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
              <Icon name="lock" size={14} /> Manage security &amp; verification
            </Link>
            <Link to="/ondi/personal/documents" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontWeight: 600, fontSize: 13, textDecoration: 'none', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
              <Icon name="fileText" size={14} /> Documents
            </Link>
            <Link to="/profile" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontWeight: 600, fontSize: 13, textDecoration: 'none', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
              <Icon name="user" size={14} /> Edit profile details
            </Link>
          </div>
        </SectionCard>

        <SectionCard title="Trust Score">
          {trust ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--ink)' }}>{trust.score}</span>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>/ 850</span>
                <span style={{
                  marginLeft: 'auto', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: `${TRUST_TIER_COLOR[trust.tier]}1a`, color: TRUST_TIER_COLOR[trust.tier],
                }}>{trust.tier}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', marginTop: 12, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3, background: TRUST_TIER_COLOR[trust.tier],
                  width: `${Math.max(0, Math.min(100, ((trust.score - 300) / (850 - 300)) * 100))}%`,
                }} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 10, lineHeight: 1.5 }}>
                Based on identity verification, account age, and sign-in history.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>
          )}
        </SectionCard>
      </div>

      <div style={{ marginTop: 20 }}>
        <SectionCard title="Reliability Signals">
          {reliability ? (
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.5, marginBottom: 14 }}>
                An internal signal only — not a credit-bureau score. Composed from real data this workspace already has about you: tenure, petty-cash discipline, and attendance/leave history.
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>{reliability.score}</span>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>/ 100</span>
                <span style={{
                  marginLeft: 'auto', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: `${TRUST_TIER_COLOR[reliability.tier]}1a`, color: TRUST_TIER_COLOR[reliability.tier],
                }}>{reliability.tier}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <SignalTile label="Tenure" value={`${reliability.signals.tenureMonths} mo`} hint={reliability.signals.employmentActive ? 'Active' : 'Not active'} />
                <SignalTile label="Petty cash approvals" value={reliability.signals.pettyCashApprovalRate === null ? 'No history' : `${reliability.signals.pettyCashApprovalRate}%`} hint={reliability.signals.pettyCashOutstandingCount > 0 ? `${reliability.signals.pettyCashOutstandingCount} un-retired` : 'None outstanding'} />
                <SignalTile label="Attendance" value={reliability.signals.attendanceRate === null ? 'No history' : `${reliability.signals.attendanceRate}%`} hint="Last 90 records" />
                <SignalTile label="Leave requests" value={reliability.signals.leaveApprovalRate === null ? 'No history' : `${reliability.signals.leaveApprovalRate}%`} hint="Approved rate" />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};

const SignalTile: React.FC<{ label: string; value: string; hint: string }> = ({ label, value, hint }) => (
  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>{value}</div>
    <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 2 }}>{hint}</div>
  </div>
);

export default OneIdPersonal;
