// ─── OneIdTrust.tsx — Ondi Personal · Trust ───────────────────────
// Own nav item + page for what OneIdPersonal.tsx's "My Profile" only shows
// a snapshot of — same real endpoints (/v1/security/trust-score and
// /reliability-signals), just given room of its own to match the house-
// style mockup's "Trust" entry rather than being folded into the identity
// page. No new scoring logic here — trust-score.ts/reliability-signals.ts
// already compute both server-side.
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

interface TrustScore { score: number; tier: 'LOW' | 'MEDIUM' | 'HIGH' }
interface TrustScoreSnapshot { score: number; tier: 'LOW' | 'MEDIUM' | 'HIGH'; created_at: string }
interface ReliabilitySignals {
  score: number; tier: 'LOW' | 'MEDIUM' | 'HIGH';
  signals: {
    tenureMonths: number; employmentActive: boolean;
    pettyCashApprovalRate: number | null; pettyCashOutstandingCount: number;
    attendanceRate: number | null; leaveApprovalRate: number | null;
  };
}

const TIER_COLOR: Record<string, string> = { LOW: '#dc2626', MEDIUM: '#d97706', HIGH: '#059669' };

const ScoreGauge: React.FC<{ score: number; max: number; tier: 'LOW' | 'MEDIUM' | 'HIGH'; caption: string }> = ({ score, max, tier, caption }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 40, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{score}</span>
      <span style={{ fontSize: 13, color: 'var(--ink3)' }}>/ {max}</span>
      <span style={{
        marginLeft: 'auto', padding: '4px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: 700,
        background: `${TIER_COLOR[tier]}1a`, color: TIER_COLOR[tier],
      }}>{tier}</span>
    </div>
    <div style={{ height: 8, borderRadius: 4, background: 'var(--bg)', marginTop: 14, overflow: 'hidden' }}>
      <div style={{ height: '100%', borderRadius: 4, background: TIER_COLOR[tier], width: `${Math.max(0, Math.min(100, (score / max) * 100))}%`, transition: 'width 0.4s' }} />
    </div>
    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 10, lineHeight: 1.5 }}>{caption}</div>
  </div>
);

const SignalTile: React.FC<{ label: string; value: string; hint: string }> = ({ label, value, hint }) => (
  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>{value}</div>
    <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 2 }}>{hint}</div>
  </div>
);

// A real trend, not a decoration — plotted from ondi_trust_score_snapshots,
// written by GET /trust-score itself (throttled to ~hourly) rather than a
// second scoring model. Plain SVG, same DIY-chart convention already used
// elsewhere in this codebase rather than pulling in a charting dependency
// for one sparkline.
const Sparkline: React.FC<{ points: TrustScoreSnapshot[] }> = ({ points }) => {
  if (points.length < 2) return null;
  const w = 100, h = 32, min = 300, max = 850;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p.score - min) / (max - min)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="48" preserveAspectRatio="none" style={{ display: 'block' }}>
      <polyline points={coords.join(' ')} fill="none" stroke={TIER_COLOR[last.tier]} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

export const OneIdTrust: React.FC = () => {
  const [trust, setTrust] = useState<TrustScore | null>(null);
  const [reliability, setReliability] = useState<ReliabilitySignals | null>(null);
  const [history, setHistory] = useState<TrustScoreSnapshot[] | null>(null);

  useEffect(() => {
    apiFetch('/v1/security/trust-score').then(setTrust).catch(() => setTrust(null));
    apiFetch('/v1/security/reliability-signals').then(setReliability).catch(() => setReliability(null));
    apiFetch('/v1/security/trust-score/history').then(setHistory).catch(() => setHistory([]));
  }, []);

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Trust"
        titleEm="score"
        subtitle="How this account's identity signal is assessed — real data, computed server-side."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        <SectionCard title="Trust Score">
          {trust ? (
            <ScoreGauge score={trust.score} max={850} tier={trust.tier} caption="Based on identity verification (KYC tier), account age, and sign-in consistency." />
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>
          )}
          {history && history.length >= 2 && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>
                Trend — last {history.length} checks
              </div>
              <Sparkline points={history} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink4)', marginTop: 4 }}>
                <span>{new Date(history[0].created_at).toLocaleDateString()}</span>
                <span>{new Date(history[history.length - 1].created_at).toLocaleDateString()}</span>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Reliability Signals">
          {reliability ? (
            <ScoreGauge score={reliability.score} max={100} tier={reliability.tier} caption="An internal signal only — not a credit-bureau score." />
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>
          )}
        </SectionCard>
      </div>

      {reliability && (
        <div style={{ marginTop: 20 }}>
          <SectionCard title="What feeds the reliability signal">
            <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5, marginBottom: 14 }}>
              Composed from real data this workspace already has about you: tenure, petty-cash discipline, and attendance/leave history.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <SignalTile label="Tenure" value={`${reliability.signals.tenureMonths} mo`} hint={reliability.signals.employmentActive ? 'Active' : 'Not active'} />
              <SignalTile label="Petty cash approvals" value={reliability.signals.pettyCashApprovalRate === null ? 'No history' : `${reliability.signals.pettyCashApprovalRate}%`} hint={reliability.signals.pettyCashOutstandingCount > 0 ? `${reliability.signals.pettyCashOutstandingCount} un-retired` : 'None outstanding'} />
              <SignalTile label="Attendance" value={reliability.signals.attendanceRate === null ? 'No history' : `${reliability.signals.attendanceRate}%`} hint="Last 90 records" />
              <SignalTile label="Leave requests" value={reliability.signals.leaveApprovalRate === null ? 'No history' : `${reliability.signals.leaveApprovalRate}%`} hint="Approved rate" />
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
};

export default OneIdTrust;
