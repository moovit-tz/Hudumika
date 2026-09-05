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

  const [activeSnapshotIndex, setActiveSnapshotIndex] = useState<number | null>(null);
  const [showLedger, setShowLedger] = useState(false);

  // Balanced Score Progression Chart calculation with intelligent Y-axis scaling & grid ticks
  const chartData = useMemo(() => {
    if (!history || history.length === 0) return null;
    const w = 680;
    const h = 180;
    const padLeft = 44;
    const padRight = 20;
    const padTop = 24;
    const padBottom = 28;

    const scores = history.map(p => p.score);
    const rawMin = Math.min(...scores);
    const rawMax = Math.max(...scores);
    const mid = (rawMin + rawMax) / 2;

    // Minimum visual range of 140 points centered around midpoint so small adjustments don't plunge like a cliff
    const minSpan = 140;
    const actualSpan = rawMax - rawMin;
    const span = Math.max(actualSpan + 40, minSpan);

    let yMin = Math.floor((mid - span / 2) / 25) * 25;
    let yMax = Math.ceil((mid + span / 2) / 25) * 25;
    if (yMin < 300) yMin = 300;
    if (yMax > 850) yMax = 850;
    if (yMax - yMin < minSpan) {
      if (yMin === 300) yMax = Math.min(850, 300 + minSpan);
      else if (yMax === 850) yMin = Math.max(300, 850 - minSpan);
    }
    const yRange = Math.max(yMax - yMin, 10);

    const gridTicks = [
      yMax,
      Math.round(yMin + yRange * 0.66),
      Math.round(yMin + yRange * 0.33),
      yMin,
    ];

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const pts = history.map((p, i) => {
      const x = history.length === 1 ? padLeft + plotW / 2 : padLeft + (i / (history.length - 1)) * plotW;
      const y = padTop + (1 - (p.score - yMin) / yRange) * plotH;
      const prev = i > 0 ? history[i - 1].score : p.score;
      const delta = p.score - prev;
      return {
        x,
        y,
        score: p.score,
        tier: p.tier,
        date: p.created_at,
        delta,
        index: i,
      };
    });

    const linePath = pts.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, '');
    const areaPath = pts.length > 1
      ? `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${padTop + plotH} L ${pts[0].x.toFixed(1)} ${padTop + plotH} Z`
      : '';

    return {
      w,
      h,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotW,
      plotH,
      yMin,
      yMax,
      gridTicks,
      pts,
      linePath,
      areaPath,
      rawMin,
      rawMax,
    };
  }, [history]);

  // Real change from the first to the most recent recorded snapshot
  const volatility = useMemo(() => {
    if (!history || history.length < 2) return null;
    const first = history[0].score;
    const last = history[history.length - 1].score;
    const delta = last - first;
    const pct = first > 0 ? (delta / first) * 100 : 0;
    const label = delta > 15 ? 'Improving' : delta < -15 ? 'Declining' : 'Stable';
    const color = delta > 15 ? 'var(--green)' : delta < -15 ? 'var(--red)' : 'var(--gold)';
    return { label, pct, delta, color };
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
              {history.length > 0 ? `${history.length} snapshots recorded` : 'Single baseline'}
            </span>
            {history.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLedger(prev => !prev)}
                style={{ fontSize: 12, height: 28, padding: '0 10px' }}
              >
                <Icon name={showLedger ? 'chevronUp' : 'chevronDown'} size={12} style={{ marginRight: 4 }} />
                {showLedger ? 'Hide Ledger' : 'View Ledger'}
              </Button>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="ot-trend-stats-row">
          <div className="ot-trend-stat">
            <span className="ot-trend-stat-lbl">Current Score</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="ot-trend-stat-val" style={{ color: tierMeta.main }}>{trust?.score || '—'}</span>
              <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>/ 850</span>
            </div>
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
            <span className="ot-trend-stat-lbl">Score Trajectory</span>
            <span className="ot-trend-stat-val" style={{ color: volatility ? volatility.color : 'var(--ink3)', fontSize: 15 }}>
              {volatility ? `${volatility.label} (${volatility.pct >= 0 ? '+' : ''}${volatility.pct.toFixed(1)}%)` : 'No history yet'}
            </span>
          </div>
        </div>

        {/* Dynamic Scale Chart */}
        {chartData && history.length > 0 ? (
          <div className="ot-chart-container">
            <div className="ot-chart-viewport">
              <svg
                className="ot-chart-svg"
                viewBox={`0 0 ${chartData.w} ${chartData.h}`}
                preserveAspectRatio="none"
              >
                {/* Horizontal Gridlines & Y-Axis Labels */}
                {chartData.gridTicks.map((tickVal, idx) => {
                  const y = chartData.padTop + (1 - (tickVal - chartData.yMin) / (chartData.yMax - chartData.yMin)) * chartData.plotH;
                  return (
                    <g key={idx}>
                      <line
                        x1={chartData.padLeft}
                        y1={y}
                        x2={chartData.w - chartData.padRight}
                        y2={y}
                        stroke="var(--border)"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                      />
                      <text
                        x={chartData.padLeft - 8}
                        y={y + 3.5}
                        textAnchor="end"
                        fontSize="10"
                        fontWeight="600"
                        fill="var(--ink3)"
                        fontFamily="var(--mono)"
                      >
                        {tickVal}
                      </text>
                    </g>
                  );
                })}

                {/* Shaded Area */}
                {chartData.areaPath && (
                  <path
                    d={chartData.areaPath}
                    fill={volatility && volatility.label === 'Declining' ? 'var(--red)' : 'var(--teal)'}
                    fillOpacity="0.05"
                  />
                )}

                {/* Score Polyline */}
                <path
                  d={chartData.linePath}
                  fill="none"
                  stroke={volatility && volatility.label === 'Declining' ? 'var(--red, #ef4444)' : 'var(--teal, #0d9488)'}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Interactive Milestone Nodes */}
                {chartData.pts.map((pt, i) => {
                  const isHovered = activeSnapshotIndex === i;
                  const isLast = i === chartData.pts.length - 1;
                  const nodeColor = pt.score >= 600 ? 'var(--green)' : pt.score >= 450 ? 'var(--gold)' : 'var(--red)';
                  return (
                    <g
                      key={i}
                      className="ot-chart-node-group"
                      onMouseEnter={() => setActiveSnapshotIndex(i)}
                      onMouseLeave={() => setActiveSnapshotIndex(null)}
                      onClick={() => setActiveSnapshotIndex(i === activeSnapshotIndex ? null : i)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Hover / Active Ring */}
                      {isHovered && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="9"
                          fill={nodeColor}
                          fillOpacity="0.18"
                        />
                      )}
                      {/* Node Point */}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isLast || isHovered ? 5 : 3.5}
                        fill="var(--card, #ffffff)"
                        stroke={nodeColor}
                        strokeWidth={isLast || isHovered ? 2.5 : 2}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Active Snapshot Tooltip Overlay */}
              {activeSnapshotIndex !== null && chartData.pts[activeSnapshotIndex] && (
                (() => {
                  const activePt = chartData.pts[activeSnapshotIndex];
                  const leftPct = (activePt.x / chartData.w) * 100;
                  const topPct = (activePt.y / chartData.h) * 100;
                  return (
                    <div
                      className="ot-chart-tooltip"
                      style={{
                        left: `clamp(90px, ${leftPct}%, calc(100% - 90px))`,
                        top: `clamp(10px, ${topPct - 35}%, calc(100% - 60px))`,
                      }}
                    >
                      <div className="ot-chart-tooltip-header">
                        <span className="ot-chart-tooltip-score">{activePt.score}</span>
                        <Badge variant={activePt.tier === 'HIGH' ? 'success' : activePt.tier === 'MEDIUM' ? 'warning' : 'gray'}>
                          {activePt.tier}
                        </Badge>
                      </div>
                      <div className="ot-chart-tooltip-meta">
                        <span>{new Date(activePt.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        {activePt.delta !== 0 && (
                          <span style={{ color: activePt.delta > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                            {activePt.delta > 0 ? `+${activePt.delta}` : activePt.delta} pts
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* Bottom Timeline Axis */}
            <div className="ot-chart-axis-bottom">
              <span>{new Date(history[0].created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
                {history.length} Assessment Snapshots
              </span>
              <span>{new Date(history[history.length - 1].created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>

            {/* Chronological Snapshot Ledger Table */}
            {showLedger && (
              <div className="ot-ledger-wrap">
                <div className="ot-ledger-title">
                  <Icon name="list" size={13} />
                  <span>Recorded Snapshot Ledger</span>
                </div>
                <div className="ot-ledger-table-box">
                  <table className="ot-ledger-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Timestamp</th>
                        <th>Trust Score</th>
                        <th>Change</th>
                        <th>Tier Band</th>
                        <th>Recorded State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice().reverse().map((h, revIdx) => {
                        const originalIdx = history.length - 1 - revIdx;
                        const prev = originalIdx > 0 ? history[originalIdx - 1].score : h.score;
                        const delta = h.score - prev;
                        const isSelected = activeSnapshotIndex === originalIdx;
                        return (
                          <tr
                            key={revIdx}
                            className={isSelected ? 'selected' : ''}
                            onMouseEnter={() => setActiveSnapshotIndex(originalIdx)}
                            onMouseLeave={() => setActiveSnapshotIndex(null)}
                          >
                            <td style={{ fontFamily: 'var(--mono)', color: 'var(--ink3)', fontSize: 11 }}>
                              #{history.length - revIdx}
                            </td>
                            <td>
                              {new Date(h.created_at).toLocaleString('en-GB', {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit', second: '2-digit'
                              })}
                            </td>
                            <td style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>
                              {h.score}
                            </td>
                            <td>
                              {delta === 0 ? (
                                <span style={{ color: 'var(--ink3)' }}>—</span>
                              ) : (
                                <span style={{ color: delta > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                                  {delta > 0 ? `+${delta}` : delta}
                                </span>
                              )}
                            </td>
                            <td>
                              <Badge variant={h.tier === 'HIGH' ? 'success' : h.tier === 'MEDIUM' ? 'warning' : 'gray'}>
                                {h.tier}
                              </Badge>
                            </td>
                            <td style={{ color: 'var(--ink3)', fontSize: 11.5 }}>
                              {originalIdx === 0 ? 'Baseline Audit' : 'Periodic Recalibration'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
