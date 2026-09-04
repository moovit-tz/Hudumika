// ─── OndiTrust.tsx — Ondi Personal · Trust & Risk Intelligence ────────
// Enterprise-grade identity trust score, transparent factor attribution,
// real historical snapshot logs, and organizational reliability signals.
import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import './OndiTrust.css';

interface TrustSignal { score: number; weight: number; points: number }

// Mirrors TrustScoreResult in apps/api/src/lib/trust-score.ts — this card's
// whole point is to show exactly what the score endpoint actually computed,
// not a separately-invented approximation of it.
interface TrustScore {
  score: number;
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
  signals: {
    kycTier: TrustSignal;
    phoneTenure: TrustSignal;
    authConsistency: TrustSignal;
    mfaEnabled: TrustSignal;
    passkeyRegistered: TrustSignal;
  };
  verificationLevel: string;
  accountTenureMonths: number;
}

interface TrustScoreSnapshot {
  score: number;
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
  created_at: string;
}

interface ReliabilitySignals {
  score: number;
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
  signals: {
    tenureMonths: number;
    employmentActive: boolean;
    pettyCashApprovalRate: number | null;
    pettyCashOutstandingCount: number;
    attendanceRate: number | null;
    leaveApprovalRate: number | null;
  };
}

const VERIFICATION_LABEL: Record<string, string> = {
  unverified: 'Not verified',
  phone_verified: 'Phone verified',
  id_verified: 'Government ID verified',
  enhanced: 'Enhanced verification',
};

const TIER_META: Record<string, { main: string; bg: string; border: string; label: string; desc: string }> = {
  LOW: {
    main: 'var(--red, #ef4444)',
    bg: 'var(--red-l, #fef2f2)',
    border: 'var(--red, #ef4444)',
    label: 'Low Trust Band',
    desc: 'Basic identity signal. Verification and MFA required to elevate trust tier.',
  },
  MEDIUM: {
    main: 'var(--gold, #d97706)',
    bg: 'var(--gold-l, #fffbeb)',
    border: 'var(--gold, #d97706)',
    label: 'Standard Trust Band',
    desc: 'Solid operational trust. Verified credentials and active session track record.',
  },
  HIGH: {
    main: 'var(--green, #059669)',
    bg: 'var(--green-l, #ecfdf5)',
    border: 'var(--green, #059669)',
    label: 'High Trust Band',
    desc: 'Exceptional enterprise trust signal with verified government identity and hardware security.',
  },
};

export const OndiTrust: React.FC = () => {
  const [trust, setTrust] = useState<TrustScore | null>(null);
  const [reliability, setReliability] = useState<ReliabilitySignals | null>(null);
  const [history, setHistory] = useState<TrustScoreSnapshot[]>([]);

  useEffect(() => {
    apiFetch('/v1/security/trust-score').then(setTrust).catch(() => setTrust(null));
    apiFetch('/v1/security/reliability-signals').then(setReliability).catch(() => setReliability(null));
    apiFetch('/v1/security/trust-score/history').then(res => setHistory(res || [])).catch(() => setHistory([]));
  }, []);

  const tier = trust?.tier || 'LOW';
  const tierMeta = TIER_META[tier] || TIER_META.LOW;
  const score = trust?.score || 300;

  // Semi-circle gauge calculation (r=62, circumference for semi-circle ~195)
  const arcLength = 195;
  const scorePct = Math.max(0, Math.min(100, ((score - 300) / (850 - 300)) * 100));
  const strokeDashoffset = arcLength - (arcLength * (scorePct / 100));

  // Area sparkline path calculation
  const sparklinePaths = useMemo(() => {
    if (!history || history.length < 2) return null;
    const w = 400;
    const h = 70;
    const padX = 10;
    const padY = 8;

    // Scaled to the actual range of recorded scores, not the full 300-850
    // theoretical scale — real history usually clusters tightly (e.g.
    // 411-439), and against a 550-point axis that's ~5% of the chart
    // height, rendering as a flat line even though the score genuinely
    // moved. A little headroom on each side keeps the line off the very
    // top/bottom edge; a floor of 10 on the range avoids a divide-by-zero
    // when every recorded score is identical (renders as a flat centered
    // line, which is correct there).
    const scores = history.map(p => p.score);
    const rawMin = Math.min(...scores);
    const rawMax = Math.max(...scores);
    const range = Math.max(rawMax - rawMin, 10);
    const headroom = range * 0.15;
    const min = rawMin - headroom;
    const max = rawMax + headroom;

    const pts = history.map((p, i) => {
      const x = padX + (i / (history.length - 1)) * (w - padX * 2);
      const y = padY + (1 - (p.score - min) / (max - min)) * (h - padY * 2);
      return [x, y] as [number, number];
    });

    const linePath = pts.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`, '');
    const areaPath = `${linePath} L ${pts[pts.length - 1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`;

    const lastPt = pts[pts.length - 1];
    return { linePath, areaPath, lastPt, w, h };
  }, [history]);

  // Real change from the first to the most recent recorded snapshot — was a
  // hardcoded "Stable (+0.0%)" regardless of what the history actually held.
  const volatility = useMemo(() => {
    if (!history || history.length < 2) return null;
    const first = history[0].score;
    const last = history[history.length - 1].score;
    const delta = last - first;
    const pct = first > 0 ? (delta / first) * 100 : 0;
    const label = delta > 15 ? 'Improving' : delta < -15 ? 'Declining' : 'Stable';
    const color = delta > 15 ? 'var(--green)' : delta < -15 ? 'var(--red)' : 'var(--gold)';
    return { label, pct, color };
  }, [history]);

  return (
    <div className="ot-page">
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Trust"
        titleEm="intelligence"
        subtitle="Transparent identity risk signals, algorithm factor attribution, and historical score evolution."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/ondi/personal">
              <Button variant="outline" size="sm">
                <Icon name="fingerprint" size={13} style={{ marginRight: 5 }} />
                My Identity
              </Button>
            </Link>
            <Link to="/ondi/personal/security">
              <Button variant="outline" size="sm">
                <Icon name="shield" size={13} style={{ marginRight: 5 }} />
                Security Hub
              </Button>
            </Link>
          </div>
        }
      />

      {/* ── Top Hero Grid: Trust Score & Factor Attribution ── */}
      <div className="ot-hero-grid">

        {/* 1. Score Dial Hero Card */}
        <div className="ot-card">
          <div>
            <div className="ot-card-hdr">
              <div className="ot-card-hdr-left">
                <FeaturedIcon variant="brand" size="sm" shape="square">
                  <Icon name="trendingUp" size={16} />
                </FeaturedIcon>
                <div>
                  <h2 className="ot-card-title">Identity Trust Score</h2>
                  <p className="ot-card-sub">Dynamic enterprise risk & authenticity index</p>
                </div>
              </div>
              <Badge variant={tier === 'HIGH' ? 'success' : tier === 'MEDIUM' ? 'warning' : 'gray'}>
                {tier} TIER
              </Badge>
            </div>

            {/* Dial Hero */}
            <div className="ot-score-hero-wrap">
              <div className="ot-dial-container">
                <svg className="ot-dial-svg" viewBox="0 0 160 92">
                  <path
                    d="M 16 80 A 62 62 0 0 1 144 80"
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="12"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 16 80 A 62 62 0 0 1 144 80"
                    fill="none"
                    stroke={tierMeta.main}
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={arcLength}
                    strokeDashoffset={strokeDashoffset}
                    style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}
                  />
                </svg>

                <div className="ot-dial-center-text">
                  <span className="ot-dial-num">{trust ? trust.score : '—'}</span>
                  <span className="ot-dial-max">out of 850</span>
                </div>
              </div>

              <div
                className="ot-tier-pill"
                style={{ background: tierMeta.bg, color: tierMeta.main, border: `1px solid ${tierMeta.border}` }}
              >
                <Icon name={tier === 'HIGH' ? 'checkCircle' : tier === 'MEDIUM' ? 'alertTriangle' : 'shield'} size={13} />
                <span>{tierMeta.label}</span>
              </div>

              <p className="ot-score-desc">
                {tierMeta.desc}
              </p>
            </div>
          </div>

          <div className="ot-score-footer">
            <span>Score Model: 5-Signal Composite</span>
            <span>Recalculated on every page load</span>
          </div>
        </div>

        {/* 2. Factor Attribution Card */}
        <div className="ot-card">
          <div>
            <div className="ot-card-hdr">
              <div className="ot-card-hdr-left">
                <FeaturedIcon variant="info" size="sm" shape="square">
                  <Icon name="sliders" size={16} />
                </FeaturedIcon>
                <div>
                  <h2 className="ot-card-title">Score Factor Attribution</h2>
                  <p className="ot-card-sub">Signals feeding the identity score calculation</p>
                </div>
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)' }}>
                5 Factors Checked
              </span>
            </div>

            {/* Factors List — the exact 5 signals computeTrustScore() (apps/api/src/
                lib/trust-score.ts) actually weighs, each row's points pulled straight
                from that response rather than a separately-invented number, so this
                card can never drift out of sync with what the score really is. */}
            <div className="ot-factors-list">
              {trust && [
                {
                  key: 'kycTier', name: 'Government ID Verification',
                  desc: VERIFICATION_LABEL[trust.verificationLevel] ?? 'Not verified',
                  icon: trust.verificationLevel === 'unverified' ? 'fileText' : 'check',
                  signal: trust.signals.kycTier,
                },
                {
                  key: 'mfaEnabled', name: 'Multi-Factor Authentication',
                  desc: trust.signals.mfaEnabled.score === 100 ? 'TOTP authenticator enabled' : 'No authenticator app enrolled',
                  icon: trust.signals.mfaEnabled.score === 100 ? 'key' : 'alertCircle',
                  signal: trust.signals.mfaEnabled,
                },
                {
                  key: 'passkeyRegistered', name: 'Passkey / Biometric Login',
                  desc: trust.signals.passkeyRegistered.score === 100 ? 'Hardware-backed credential registered' : 'No passkey registered yet',
                  icon: trust.signals.passkeyRegistered.score === 100 ? 'fingerprint' : 'alertCircle',
                  signal: trust.signals.passkeyRegistered,
                },
                {
                  key: 'phoneTenure', name: 'Account Tenure',
                  desc: `${trust.accountTenureMonths} month${trust.accountTenureMonths === 1 ? '' : 's'} since account creation`,
                  icon: 'calendar',
                  signal: trust.signals.phoneTenure,
                },
                {
                  key: 'authConsistency', name: 'Sign-in Consistency',
                  desc: 'Success rate across recent sign-in attempts',
                  icon: 'activity',
                  signal: trust.signals.authConsistency,
                },
              ].map(f => {
                const maxPoints = Math.round(f.signal.weight * 550);
                const variant = f.signal.score >= 70 ? 'success' : f.signal.score > 0 ? 'warning' : 'gray';
                return (
                  <div className="ot-factor-row" key={f.key}>
                    <div className="ot-factor-left">
                      <FeaturedIcon variant={variant} size="sm" shape="square">
                        <Icon name={f.icon as any} size={14} />
                      </FeaturedIcon>
                      <div className="ot-factor-info">
                        <div className="ot-factor-name">{f.name}</div>
                        <div className="ot-factor-desc">{f.desc}</div>
                      </div>
                    </div>
                    <div className="ot-factor-right">
                      <span className="ot-factor-points" style={{ color: f.signal.points > 0 ? 'var(--green)' : 'var(--ink3)' }}>
                        {f.signal.points > 0 ? `+${f.signal.points} pts` : `0/${maxPoints} pts`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <Link to="/ondi/personal/security" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
              Configure security safeguards →
            </Link>
          </div>
        </div>
      </div>

      {/* ── Historical Trend & Sparkline Section ── */}
      <div className="ot-trend-card">
        <div className="ot-card-hdr">
          <div className="ot-card-hdr-left">
            <FeaturedIcon variant="brand" size="sm" shape="square">
              <Icon name="activity" size={16} />
            </FeaturedIcon>
            <div>
              <h2 className="ot-card-title">Score Progression History</h2>
              <p className="ot-card-sub">Chronological ledger of trust assessments</p>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
            {history.length > 0 ? `${history.length} snapshots recorded` : 'Single baseline'}
          </div>
        </div>

        {/* Stats Row */}
        <div className="ot-trend-stats-row">
          <div className="ot-trend-stat">
            <span className="ot-trend-stat-lbl">Current Score</span>
            <span className="ot-trend-stat-val" style={{ color: tierMeta.main }}>{trust?.score || '—'}</span>
          </div>

          <div className="ot-trend-stat">
            <span className="ot-trend-stat-lbl">Historical Peak</span>
            <span className="ot-trend-stat-val">
              {history.length > 0 ? Math.max(...history.map(h => h.score)) : trust?.score || '—'}
            </span>
          </div>

          <div className="ot-trend-stat">
            <span className="ot-trend-stat-lbl">Historical Low</span>
            <span className="ot-trend-stat-val">
              {history.length > 0 ? Math.min(...history.map(h => h.score)) : trust?.score || '—'}
            </span>
          </div>

          <div className="ot-trend-stat">
            <span className="ot-trend-stat-lbl">Score Trend</span>
            <span className="ot-trend-stat-val" style={{ color: volatility ? volatility.color : 'var(--ink3)', fontSize: 15 }}>
              {volatility ? `${volatility.label} (${volatility.pct >= 0 ? '+' : ''}${volatility.pct.toFixed(1)}%)` : 'No history yet'}
            </span>
          </div>
        </div>

        {/* Interactive Sparkline */}
        {sparklinePaths ? (
          <div className="ot-chart-wrap">
            <svg className="ot-sparkline-svg" viewBox={`0 0 ${sparklinePaths.w} ${sparklinePaths.h}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="otGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tierMeta.main} stopOpacity="0.25" />
                  <stop offset="100%" stopColor={tierMeta.main} stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path d={sparklinePaths.areaPath} fill="url(#otGrad)" />
              <path d={sparklinePaths.linePath} fill="none" stroke={tierMeta.main} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={sparklinePaths.lastPt[0]} cy={sparklinePaths.lastPt[1]} r="4.5" fill="var(--white)" stroke={tierMeta.main} strokeWidth="2.5" />
            </svg>
            <div className="ot-trend-dates">
              <span>{new Date(history[0].created_at).toLocaleDateString()}</span>
              <span>{new Date(history[history.length - 1].created_at).toLocaleDateString()}</span>
            </div>
          </div>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>
            Historical progression will populate as ongoing security events are stamped.
          </div>
        )}
      </div>

      {/* ── Organizational Reliability Signals ── */}
      <div className="ot-reliability-wrap">
        <div className="ot-rel-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FeaturedIcon variant="brand" size="sm" shape="square">
              <Icon name="shield" size={16} />
            </FeaturedIcon>
            <div>
              <h2 className="ot-card-title">Organizational Reliability Signals</h2>
              <p className="ot-card-sub">Operational record & internal workplace discipline metrics</p>
            </div>
          </div>

          {reliability && (
            <div className="ot-rel-score-banner">
              <span className="ot-rel-score-num">{reliability.score}</span>
              <span className="ot-rel-score-max">/ 100</span>
              <Badge variant={reliability.tier === 'HIGH' ? 'success' : reliability.tier === 'MEDIUM' ? 'warning' : 'error'}>
                {reliability.tier} RELIABILITY
              </Badge>
            </div>
          )}
        </div>

        {reliability ? (
          <div className="ot-rel-grid">
            {/* 1. Tenure */}
            <div className="ot-rel-card">
              <div className="ot-rel-card-top">
                <span className="ot-rel-card-lbl">Workspace Tenure</span>
                <Icon name="calendar" size={15} color="var(--teal)" />
              </div>
              <div>
                <div className="ot-rel-card-val">{reliability.signals.tenureMonths} Months</div>
                <div className="ot-rel-card-hint">{reliability.signals.employmentActive ? 'Active Employment' : 'Not Active'}</div>
              </div>
              <div className="op-rel-progress-bar">
                <div className="op-rel-progress-fill" style={{ width: `${Math.min(100, (reliability.signals.tenureMonths / 24) * 100)}%` }} />
              </div>
            </div>

            {/* 2. Petty Cash */}
            <div className="ot-rel-card">
              <div className="ot-rel-card-top">
                <span className="ot-rel-card-lbl">Petty Cash Discipline</span>
                <Icon name="dollarSign" size={15} color="var(--green)" />
              </div>
              <div>
                <div className="ot-rel-card-val">
                  {reliability.signals.pettyCashApprovalRate === null ? '100%' : `${reliability.signals.pettyCashApprovalRate}%`}
                </div>
                <div className="ot-rel-card-hint">
                  {reliability.signals.pettyCashOutstandingCount > 0 ? `${reliability.signals.pettyCashOutstandingCount} unretired` : 'Zero outstanding'}
                </div>
              </div>
              <div className="op-rel-progress-bar">
                <div className="op-rel-progress-fill" style={{ width: `${reliability.signals.pettyCashApprovalRate || 100}%`, background: 'var(--green)' }} />
              </div>
            </div>

            {/* 3. Attendance */}
            <div className="ot-rel-card">
              <div className="ot-rel-card-top">
                <span className="ot-rel-card-lbl">Attendance Reliability</span>
                <Icon name="clock" size={15} color="var(--blue)" />
              </div>
              <div>
                <div className="ot-rel-card-val">
                  {reliability.signals.attendanceRate === null ? '100%' : `${reliability.signals.attendanceRate}%`}
                </div>
                <div className="ot-rel-card-hint">Last 90 attendance cycles</div>
              </div>
              <div className="op-rel-progress-bar">
                <div className="op-rel-progress-fill" style={{ width: `${reliability.signals.attendanceRate || 100}%`, background: 'var(--blue)' }} />
              </div>
            </div>

            {/* 4. Leave Compliance */}
            <div className="ot-rel-card">
              <div className="ot-rel-card-top">
                <span className="ot-rel-card-lbl">Leave Compliance</span>
                <Icon name="checkCircle" size={15} color="var(--gold)" />
              </div>
              <div>
                <div className="ot-rel-card-val">
                  {reliability.signals.leaveApprovalRate === null ? '100%' : `${reliability.signals.leaveApprovalRate}%`}
                </div>
                <div className="ot-rel-card-hint">Approved request ratio</div>
              </div>
              <div className="op-rel-progress-bar">
                <div className="op-rel-progress-fill" style={{ width: `${reliability.signals.leaveApprovalRate || 100}%`, background: 'var(--gold)' }} />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
            Loading organizational reliability signals…
          </div>
        )}
      </div>

      {/* ── Proactive Trust-Building Recommendations ── */}
      <div className="ot-recs-wrap">
        <div className="ot-card-hdr">
          <div className="ot-card-hdr-left">
            <FeaturedIcon variant="brand" size="sm" shape="square">
              <Icon name="sparkle" size={16} />
            </FeaturedIcon>
            <div>
              <h2 className="ot-card-title">Recommendations to Elevate Trust</h2>
              <p className="ot-card-sub">Actionable steps to reach the High Trust tier</p>
            </div>
          </div>
        </div>

        <div className="ot-recs-grid">
          {/* Each card's point value is the real remaining gain for that exact
              signal (max weight×550 minus what's already earned), and the
              card itself only shows while that signal is actually incomplete
              — a HIGH-trust account with everything already done used to see
              the same three "do this" cards as a brand-new one. */}
          {trust && trust.verificationLevel === 'unverified' && (
            <div className="ot-rec-card">
              <div>
                <div className="ot-rec-top">
                  <FeaturedIcon variant="brand" size="sm" shape="square">
                    <Icon name="fileText" size={15} />
                  </FeaturedIcon>
                  <div>
                    <h3 className="ot-rec-title">Verify National ID / Passport</h3>
                    <p className="ot-rec-desc">Upload official government identification to unlock high-tier clearance.</p>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="ot-rec-impact">
                  <Icon name="arrowUp" size={12} /> +{Math.round(trust.signals.kycTier.weight * 550) - trust.signals.kycTier.points} Points
                </span>
                <Link to="/ondi/personal/documents">
                  <Button size="sm" variant="outline">Verify ID</Button>
                </Link>
              </div>
            </div>
          )}

          {trust && trust.signals.mfaEnabled.score < 100 && (
            <div className="ot-rec-card">
              <div>
                <div className="ot-rec-top">
                  <FeaturedIcon variant="info" size="sm" shape="square">
                    <Icon name="alertCircle" size={15} />
                  </FeaturedIcon>
                  <div>
                    <h3 className="ot-rec-title">Enable Multi-Factor Authentication</h3>
                    <p className="ot-rec-desc">Add a TOTP authenticator app so sign-in needs more than a password.</p>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="ot-rec-impact">
                  <Icon name="arrowUp" size={12} /> +{Math.round(trust.signals.mfaEnabled.weight * 550) - trust.signals.mfaEnabled.points} Points
                </span>
                <Link to="/ondi/personal/security">
                  <Button size="sm" variant="outline">Enable MFA</Button>
                </Link>
              </div>
            </div>
          )}

          {trust && trust.signals.passkeyRegistered.score < 100 && (
            <div className="ot-rec-card">
              <div>
                <div className="ot-rec-top">
                  <FeaturedIcon variant="info" size="sm" shape="square">
                    <Icon name="key" size={15} />
                  </FeaturedIcon>
                  <div>
                    <h3 className="ot-rec-title">Register Biometric Passkey</h3>
                    <p className="ot-rec-desc">Enable passwordless hardware authentication via TouchID or Windows Hello.</p>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="ot-rec-impact">
                  <Icon name="arrowUp" size={12} /> +{Math.round(trust.signals.passkeyRegistered.weight * 550) - trust.signals.passkeyRegistered.points} Points
                </span>
                <Link to="/ondi/personal/security">
                  <Button size="sm" variant="outline">Add Passkey</Button>
                </Link>
              </div>
            </div>
          )}

          {/* Not a scored signal — sessions/devices don't feed the trust formula — so
              this stays a plain hygiene nudge rather than claiming fake points. */}
          <div className="ot-rec-card">
            <div>
              <div className="ot-rec-top">
                <FeaturedIcon variant="gray" size="sm" shape="square">
                  <Icon name="smartphone" size={15} />
                </FeaturedIcon>
                <div>
                  <h3 className="ot-rec-title">Review Active Devices</h3>
                  <p className="ot-rec-desc">Revoke outdated sessions to reduce your account's exposure.</p>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="ot-rec-impact">
                <Icon name="check" size={12} /> Not scored
              </span>
              <Link to="/ondi/personal/devices">
                <Button size="sm" variant="outline">Manage</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OndiTrust;
