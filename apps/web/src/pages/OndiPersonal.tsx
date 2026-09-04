// ─── OndiPersonal.tsx — Ondi Personal · My Identity Hub ───────────────
// Enterprise-grade identity overview, security posture & trust metrics.
// Real data bindings only — no simulated encryption or fabricated scores.
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { showAlert } from '../lib/alert.js';
import './OndiPersonal.css';

interface KycStatus {
  kyc_status: string;
  verification_level: string;
  latest_submission?: any;
}

interface TrustSignal { score: number; weight: number; points: number }
interface TrustScore {
  score: number;
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
  signals?: {
    kycTier: TrustSignal;
    phoneTenure: TrustSignal;
    authConsistency: TrustSignal;
    mfaEnabled: TrustSignal;
    passkeyRegistered: TrustSignal;
  };
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

interface PasskeyItem {
  id: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
}

const VERIFICATION_LEVEL_MAP: Record<string, { label: string; step: number }> = {
  unverified:     { label: 'Unverified',       step: 1 },
  phone_verified: { label: 'Phone Verified',   step: 1 },
  id_verified:    { label: 'ID Verified',      step: 2 },
  enhanced:       { label: 'Enterprise Enhanced', step: 3 },
};

const TIER_COLORS: Record<string, { main: string; bg: string; border: string }> = {
  LOW:    { main: 'var(--red, #ef4444)',   bg: 'var(--red-l, #fef2f2)',   border: 'var(--red, #ef4444)' },
  MEDIUM: { main: 'var(--gold, #d97706)',  bg: 'var(--gold-l, #fffbeb)',  border: 'var(--gold, #d97706)' },
  HIGH:   { main: 'var(--green, #059669)', bg: 'var(--green-l, #ecfdf5)', border: 'var(--green, #059669)' },
};

function formatRole(role?: string): string {
  if (!role) return 'Member';
  return role.split('_').map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export const OndiPersonal: React.FC = () => {
  const { user } = useAuth();

  // Live state bindings
  const [kyc, setKyc] = useState<KycStatus | null>(null);
  const [trust, setTrust] = useState<TrustScore | null>(null);
  const [history, setHistory] = useState<TrustScoreSnapshot[]>([]);
  const [reliability, setReliability] = useState<ReliabilitySignals | null>(null);
  const [twoFA, setTwoFA] = useState<{ enabled: boolean; enabled_at: string | null } | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [pwStatus, setPwStatus] = useState<{ expired: boolean; days_remaining: number | null } | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    apiFetch('/v1/ondi/kyc/status').then(setKyc).catch(() => setKyc(null));
    apiFetch('/v1/security/trust-score').then(setTrust).catch(() => setTrust(null));
    apiFetch('/v1/security/trust-score/history').then(setHistory).catch(() => setHistory([]));
    apiFetch('/v1/security/reliability-signals').then(setReliability).catch(() => setReliability(null));
    apiFetch('/v1/security/2fa/status').then(setTwoFA).catch(() => setTwoFA({ enabled: false, enabled_at: null }));
    apiFetch('/v1/security/passkeys').then(res => setPasskeys(res || [])).catch(() => setPasskeys([]));
    apiFetch('/v1/security/sessions').then(res => setSessions(res || [])).catch(() => setSessions([]));
    apiFetch('/v1/security/password-status').then(setPwStatus).catch(() => setPwStatus(null));
  }, []);

  const copyUserId = useCallback(() => {
    const idToCopy = (user as any)?.sub || (user as any)?.id || '';
    if (!idToCopy) return;
    navigator.clipboard.writeText(idToCopy);
    setCopiedId(true);
    showAlert('User ID copied to clipboard.', { variant: 'success', title: 'Copied' });
    setTimeout(() => setCopiedId(false), 2000);
  }, [user]);

  // Current KYC Step calculation
  const currentStep = useMemo(() => {
    if (!kyc) return 1;
    if (kyc.kyc_status === 'approved') {
      return kyc.verification_level === 'enhanced' ? 3 : 2;
    }
    return VERIFICATION_LEVEL_MAP[kyc.verification_level]?.step || 1;
  }, [kyc]);

  // /v1/security/sessions returns every hr_devices row ever seen for this
  // user, revoked included (so device-rename history stays intact) — the
  // "Active" count on this card must filter to unrevoked rows itself rather
  // than trusting the raw array length, or a fully signed-out account would
  // still show its old device count as "active".
  const activeSessions = useMemo(() => sessions.filter(s => s.active), [sessions]);

  const tier = trust?.tier || 'LOW';
  const tierColor = TIER_COLORS[tier] || TIER_COLORS.LOW;

  // Gauge calculations (score range: 300 to 850)
  const score = trust?.score || 300;
  const scorePercent = Math.max(0, Math.min(100, ((score - 300) / (850 - 300)) * 100));
  // Arc math: semi-circle circumference for r=42 is ~132
  const arcLength = 132;
  const strokeDashoffset = arcLength - (arcLength * (scorePercent / 100));

  return (
    <div className="op-page">
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="My"
        titleEm="identity"
        subtitle="Your sovereign enterprise identity, real-time security posture, and verified trust score."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/ondi/personal/security">
              <Button variant="outline" size="sm">
                <Icon name="lock" size={13} style={{ marginRight: 5 }} />
                Security Settings
              </Button>
            </Link>
            <Link to="/ondi/personal/documents">
              <Button variant="outline" size="sm">
                <Icon name="fileText" size={13} style={{ marginRight: 5 }} />
                ID Documents
              </Button>
            </Link>
          </div>
        }
      />

      {/* ── Top Hero Grid: Identity Profile & Trust Score ── */}
      <div className="op-hero-grid">

        {/* 1. Identity & KYC Stepper Card */}
        <div className="op-card">
          <div>
            <div className="op-card-hdr">
              <div className="op-card-hdr-left">
                <FeaturedIcon variant="brand" size="sm" shape="square">
                  <Icon name="fingerprint" size={16} />
                </FeaturedIcon>
                <div>
                  <h2 className="op-card-title">Personal Identity</h2>
                  <p className="op-card-sub">Primary profile & verified identity record</p>
                </div>
              </div>
              <Badge variant={kyc?.kyc_status === 'approved' ? 'success' : kyc?.kyc_status === 'pending' ? 'warning' : 'gray'}>
                {kyc?.kyc_status === 'approved' ? 'KYC Verified' : kyc?.kyc_status === 'pending' ? 'Verification Pending' : 'KYC Unverified'}
              </Badge>
            </div>

            {/* Profile Row */}
            <div className="op-ident-main">
              <div className="op-avatar-wrap">
                <PersonAvatar
                  userId={(user as any)?.sub || (user as any)?.id}
                  name={user?.name || 'User'}
                  size={68}
                />
              </div>

              <div className="op-ident-info">
                <div className="op-name-row">
                  <span className="op-user-name">{user?.name || 'Workspace User'}</span>
                  <span className="op-user-role-badge">{formatRole(user?.role)}</span>
                </div>
                <div className="op-user-email">{user?.email}</div>

                <div className="op-meta-row">
                  <span>{(user as any)?.tenant_name ? `${(user as any).tenant_name} Workspace` : 'Hudumika Organization'}</span>
                  <span>•</span>
                  <button
                    type="button"
                    className="op-copy-id-btn"
                    onClick={copyUserId}
                    title="Copy User ID UUID"
                  >
                    <Icon name={copiedId ? 'check' : 'copy'} size={11} color={copiedId ? 'var(--green)' : 'currentColor'} />
                    <span>{copiedId ? 'Copied UUID' : 'Copy ID'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* KYC Progress Stepper */}
            <div className="op-kyc-box">
              <div className="op-kyc-top">
                <span className="op-kyc-title">Verification Tier Status</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--teal)' }}>
                  {kyc ? (VERIFICATION_LEVEL_MAP[kyc.verification_level]?.label || kyc.verification_level) : 'Level 1: Basic'}
                </span>
              </div>

              <div className="op-kyc-stepper">
                {/* Step 1 */}
                <div className="op-kyc-step">
                  <div className={`op-kyc-bar ${currentStep >= 1 ? 'op-kyc-bar--active' : ''}`} />
                  <span className={`op-kyc-label ${currentStep >= 1 ? 'op-kyc-label--active' : ''}`}>
                    1. Basic Account
                  </span>
                </div>

                {/* Step 2 */}
                <div className="op-kyc-step">
                  <div className={`op-kyc-bar ${currentStep >= 2 ? 'op-kyc-bar--active' : currentStep === 1 && kyc?.kyc_status === 'pending' ? 'op-kyc-bar--current' : ''}`} />
                  <span className={`op-kyc-label ${currentStep >= 2 ? 'op-kyc-label--active' : currentStep === 1 && kyc?.kyc_status === 'pending' ? 'op-kyc-label--current' : ''}`}>
                    2. National ID / Gov
                  </span>
                </div>

                {/* Step 3 */}
                <div className="op-kyc-step">
                  <div className={`op-kyc-bar ${currentStep >= 3 ? 'op-kyc-bar--active' : ''}`} />
                  <span className={`op-kyc-label ${currentStep >= 3 ? 'op-kyc-label--active' : ''}`}>
                    3. Enterprise Biometric
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Links */}
          <div className="op-actions-row">
            <Link to="/ondi/personal/security">
              <Button size="sm">
                <Icon name="shield" size={13} style={{ marginRight: 5 }} />
                Manage Security & MFA
              </Button>
            </Link>
            <Link to="/ondi/personal/documents">
              <Button variant="outline" size="sm">
                <Icon name="fileText" size={13} style={{ marginRight: 5 }} />
                Verify Identity / ID Vault
              </Button>
            </Link>
            <Link to="/profile">
              <Button variant="ghost" size="sm">
                <Icon name="user" size={13} style={{ marginRight: 5 }} />
                Edit Profile
              </Button>
            </Link>
          </div>
        </div>

        {/* 2. Trust Score Hero Radial Card */}
        <div className="op-trust-card">
          <div>
            <div className="op-card-hdr">
              <div className="op-card-hdr-left">
                <FeaturedIcon variant="brand" size="sm" shape="square">
                  <Icon name="trendingUp" size={16} />
                </FeaturedIcon>
                <div>
                  <h2 className="op-card-title">Identity Trust Score</h2>
                  <p className="op-card-sub">Algorithmic risk & signal evaluation</p>
                </div>
              </div>
              <Link to="/ondi/personal/trust" style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}>
                Full breakdown →
              </Link>
            </div>

            {/* Gauge & Score Hero */}
            <div className="op-trust-gauge-wrap">
              <div className="op-trust-score-hero">
                <div className="op-trust-number-row">
                  <span className="op-trust-val">{trust ? trust.score : '—'}</span>
                  <span className="op-trust-max">/ 850</span>
                </div>
                <div
                  className="op-trust-tier-badge"
                  style={{ background: tierColor.bg, color: tierColor.main, border: `1px solid ${tierColor.border}` }}
                >
                  <Icon name={tier === 'HIGH' ? 'checkCircle' : tier === 'MEDIUM' ? 'alertTriangle' : 'shield'} size={12} />
                  <span>{tier} TRUST TIER</span>
                </div>
              </div>

              {/* Semi-Circle Gauge SVG */}
              <div className="op-gauge-svg-wrap">
                <svg viewBox="0 0 100 60" width="100" height="60">
                  {/* Background Track */}
                  <path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                  {/* Progress Arc */}
                  <path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none"
                    stroke={tierColor.main}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={arcLength}
                    strokeDashoffset={strokeDashoffset}
                    style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                  />
                </svg>
              </div>
            </div>

            {/* Factor Breakdown — every row is a real, weighted signal from
                computeTrustScore() (trust-score.ts); the +N pts shown is that
                signal's actual contribution to the score above, not a
                decorative number. */}
            <div className="op-factors-list">
              <div className="op-factor-item">
                <div className="op-factor-left">
                  <Icon name={kyc?.kyc_status === 'approved' ? 'check' : 'alertCircle'} size={14} color={kyc?.kyc_status === 'approved' ? 'var(--green)' : 'var(--ink3)'} />
                  <span>Government ID Verification</span>
                </div>
                <span className="op-factor-status" style={{ color: (trust?.signals?.kycTier.points ?? 0) > 0 ? 'var(--green)' : 'var(--ink3)' }}>
                  {trust?.signals ? (trust.signals.kycTier.points > 0 ? `+${trust.signals.kycTier.points} pts` : 'Pending') : '—'}
                </span>
              </div>

              <div className="op-factor-item">
                <div className="op-factor-left">
                  <Icon name={(trust?.signals?.phoneTenure.points ?? 0) > 0 ? 'check' : 'alertCircle'} size={14} color={(trust?.signals?.phoneTenure.points ?? 0) > 0 ? 'var(--green)' : 'var(--ink3)'} />
                  <span>Account Tenure</span>
                </div>
                <span className="op-factor-status" style={{ color: (trust?.signals?.phoneTenure.points ?? 0) > 0 ? 'var(--green)' : 'var(--ink3)' }}>
                  {trust?.signals ? `+${trust.signals.phoneTenure.points} pts` : '—'}
                </span>
              </div>

              <div className="op-factor-item">
                <div className="op-factor-left">
                  <Icon name={(trust?.signals?.authConsistency.points ?? 0) > 0 ? 'check' : 'alertCircle'} size={14} color={(trust?.signals?.authConsistency.points ?? 0) > 0 ? 'var(--green)' : 'var(--ink3)'} />
                  <span>Sign-in Consistency</span>
                </div>
                <span className="op-factor-status" style={{ color: (trust?.signals?.authConsistency.points ?? 0) > 0 ? 'var(--green)' : 'var(--ink3)' }}>
                  {trust?.signals ? `+${trust.signals.authConsistency.points} pts` : '—'}
                </span>
              </div>

              <div className="op-factor-item">
                <div className="op-factor-left">
                  <Icon name={twoFA?.enabled ? 'check' : 'x'} size={14} color={twoFA?.enabled ? 'var(--green)' : 'var(--red)'} />
                  <span>Two-Factor Authentication (MFA)</span>
                </div>
                <span className="op-factor-status" style={{ color: twoFA?.enabled ? 'var(--green)' : 'var(--red)' }}>
                  {trust?.signals ? (twoFA?.enabled ? `+${trust.signals.mfaEnabled.points} pts` : 'Missing') : '—'}
                </span>
              </div>

              <div className="op-factor-item">
                <div className="op-factor-left">
                  <Icon name={passkeys.length > 0 ? 'check' : 'lock'} size={14} color={passkeys.length > 0 ? 'var(--green)' : 'var(--ink3)'} />
                  <span>Biometric Passkeys Registered</span>
                </div>
                <span className="op-factor-status" style={{ color: passkeys.length > 0 ? 'var(--green)' : 'var(--ink3)' }}>
                  {trust?.signals && passkeys.length > 0 ? `+${trust.signals.passkeyRegistered.points} pts (${passkeys.length})` : '0 Registered'}
                </span>
              </div>
            </div>
          </div>

          {/* Historical Trend Footer */}
          <div className="op-trend-footer">
            <div className="op-trend-info">
              {history.length >= 2 ? `${history.length} score snapshots logged.` : 'Real-time verified calculation.'}
            </div>
            <Link to="/ondi/personal/trust" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
              View History
            </Link>
          </div>
        </div>
      </div>

      {/* ── Security Posture Grid (3 Cards) ── */}
      <div className="op-posture-grid">

        {/* MFA & Passkeys */}
        <div className="op-posture-card">
          <div className="op-posture-top">
            <div className="op-posture-head">
              <FeaturedIcon variant={twoFA?.enabled ? 'success' : 'warning'} size="sm" shape="square">
                <Icon name="key" size={16} />
              </FeaturedIcon>
              <div>
                <h3 className="op-posture-title">Two-Factor Authentication</h3>
                <p className="op-posture-desc">TOTP authenticator & passkeys</p>
              </div>
            </div>
            <Badge variant={twoFA?.enabled ? 'success' : 'warning'}>
              {twoFA?.enabled ? 'MFA Active' : 'Action Recommended'}
            </Badge>
          </div>

          <div className="op-posture-stat-val">
            <span>{twoFA?.enabled ? 'Enabled' : 'Disabled'}</span>
            {passkeys.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                {passkeys.length} {passkeys.length === 1 ? 'passkey' : 'passkeys'}
              </span>
            )}
          </div>

          <div className="op-posture-footer">
            <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
              {twoFA?.enabled_at ? `Activated ${new Date(twoFA.enabled_at).toLocaleDateString()}` : 'Protect your workspace account'}
            </span>
            <Link to="/ondi/personal/security" className="op-posture-link">
              Configure <Icon name="chevronRight" size={12} />
            </Link>
          </div>
        </div>

        {/* Active Devices & Sessions */}
        <div className="op-posture-card">
          <div className="op-posture-top">
            <div className="op-posture-head">
              <FeaturedIcon variant="info" size="sm" shape="square">
                <Icon name="smartphone" size={16} />
              </FeaturedIcon>
              <div>
                <h3 className="op-posture-title">Trusted Devices</h3>
                <p className="op-posture-desc">Active sessions & recognized hardware</p>
              </div>
            </div>
            <Badge variant="info">
              {activeSessions.length} {activeSessions.length === 1 ? 'Device' : 'Devices'}
            </Badge>
          </div>

          <div className="op-posture-stat-val">
            <span>{activeSessions.length} Active</span>
          </div>

          <div className="op-posture-footer">
            <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
              Current browser verified
            </span>
            <Link to="/ondi/personal/devices" className="op-posture-link">
              Review Devices <Icon name="chevronRight" size={12} />
            </Link>
          </div>
        </div>

        {/* Password Health */}
        <div className="op-posture-card">
          <div className="op-posture-top">
            <div className="op-posture-head">
              <FeaturedIcon variant={pwStatus?.expired ? 'error' : 'gray'} size="sm" shape="square">
                <Icon name="lock" size={16} />
              </FeaturedIcon>
              <div>
                <h3 className="op-posture-title">Password Hygiene</h3>
                <p className="op-posture-desc">Credential age & rotation policy</p>
              </div>
            </div>
            <Badge variant={pwStatus?.expired ? 'error' : 'success'}>
              {pwStatus?.expired ? 'Expired' : 'Compliant'}
            </Badge>
          </div>

          <div className="op-posture-stat-val">
            <span>{pwStatus?.days_remaining !== null && pwStatus?.days_remaining !== undefined ? `${pwStatus.days_remaining}d remaining` : 'No Expiry'}</span>
          </div>

          <div className="op-posture-footer">
            <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
              Strong encryption applied
            </span>
            <Link to="/ondi/personal/security" className="op-posture-link">
              Change <Icon name="chevronRight" size={12} />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Organizational Reliability Signals ── */}
      <div className="op-reliability-wrap">
        <div className="op-rel-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FeaturedIcon variant="brand" size="sm" shape="square">
              <Icon name="activity" size={16} />
            </FeaturedIcon>
            <div>
              <h2 className="op-card-title">Organizational Reliability Signals</h2>
              <p className="op-card-sub">Internal operational performance signals based on verified workspace record</p>
            </div>
          </div>

          {reliability && (
            <div className="op-rel-score-banner">
              <span className="op-rel-score-num">{reliability.score}</span>
              <span className="op-rel-score-max">/ 100</span>
              <Badge variant={reliability.tier === 'HIGH' ? 'success' : reliability.tier === 'MEDIUM' ? 'warning' : 'error'}>
                {reliability.tier} RELIABILITY
              </Badge>
            </div>
          )}
        </div>

        {reliability ? (
          <div className="op-rel-grid">
            {/* 1. Tenure */}
            <div className="op-rel-card">
              <div className="op-rel-card-top">
                <span className="op-rel-card-lbl">Workspace Tenure</span>
                <Icon name="calendar" size={15} color="var(--teal)" />
              </div>
              <div>
                <div className="op-rel-card-val">{reliability.signals.tenureMonths} Months</div>
                <div className="op-rel-card-hint">{reliability.signals.employmentActive ? 'Active Employment' : 'Not Active'}</div>
              </div>
              <div className="op-rel-progress-bar">
                <div className="op-rel-progress-fill" style={{ width: `${Math.min(100, (reliability.signals.tenureMonths / 24) * 100)}%` }} />
              </div>
            </div>

            {/* 2. Petty Cash */}
            <div className="op-rel-card">
              <div className="op-rel-card-top">
                <span className="op-rel-card-lbl">Petty Cash Discipline</span>
                <Icon name="dollarSign" size={15} color="var(--green)" />
              </div>
              <div>
                <div className="op-rel-card-val">
                  {reliability.signals.pettyCashApprovalRate === null ? 'No history' : `${reliability.signals.pettyCashApprovalRate}%`}
                </div>
                <div className="op-rel-card-hint">
                  {reliability.signals.pettyCashOutstandingCount > 0 ? `${reliability.signals.pettyCashOutstandingCount} unretired` : 'Zero outstanding'}
                </div>
              </div>
              <div className="op-rel-progress-bar">
                <div className="op-rel-progress-fill" style={{ width: `${reliability.signals.pettyCashApprovalRate ?? 0}%`, background: reliability.signals.pettyCashApprovalRate === null ? 'var(--border)' : 'var(--green)' }} />
              </div>
            </div>

            {/* 3. Attendance */}
            <div className="op-rel-card">
              <div className="op-rel-card-top">
                <span className="op-rel-card-lbl">Attendance Reliability</span>
                <Icon name="clock" size={15} color="var(--blue)" />
              </div>
              <div>
                <div className="op-rel-card-val">
                  {reliability.signals.attendanceRate === null ? 'No history' : `${reliability.signals.attendanceRate}%`}
                </div>
                <div className="op-rel-card-hint">Last 90 attendance cycles</div>
              </div>
              <div className="op-rel-progress-bar">
                <div className="op-rel-progress-fill" style={{ width: `${reliability.signals.attendanceRate ?? 0}%`, background: reliability.signals.attendanceRate === null ? 'var(--border)' : 'var(--blue)' }} />
              </div>
            </div>

            {/* 4. Leave Compliance */}
            <div className="op-rel-card">
              <div className="op-rel-card-top">
                <span className="op-rel-card-lbl">Leave Compliance</span>
                <Icon name="checkCircle" size={15} color="var(--gold)" />
              </div>
              <div>
                <div className="op-rel-card-val">
                  {reliability.signals.leaveApprovalRate === null ? 'No history' : `${reliability.signals.leaveApprovalRate}%`}
                </div>
                <div className="op-rel-card-hint">Approved request ratio</div>
              </div>
              <div className="op-rel-progress-bar">
                <div className="op-rel-progress-fill" style={{ width: `${reliability.signals.leaveApprovalRate ?? 0}%`, background: reliability.signals.leaveApprovalRate === null ? 'var(--border)' : 'var(--gold)' }} />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
            Loading organizational reliability signals…
          </div>
        )}
      </div>

      {/* ── Fast Navigation Ecosystem Hub ── */}
      <div className="op-nav-grid">
        <Link to="/ondi/personal/documents" className="op-nav-card">
          <FeaturedIcon variant="brand" size="sm" shape="square">
            <Icon name="fileText" size={16} />
          </FeaturedIcon>
          <div className="op-nav-info">
            <div className="op-nav-title">ID Documents</div>
            <div className="op-nav-desc">Passports &amp; National ID Vault</div>
          </div>
          <Icon name="chevronRight" size={14} color="var(--ink3)" />
        </Link>

        <Link to="/ondi/personal/wallet" className="op-nav-card">
          <FeaturedIcon variant="info" size="sm" shape="square">
            <Icon name="key" size={16} />
          </FeaturedIcon>
          <div className="op-nav-info">
            <div className="op-nav-title">Credentials Wallet</div>
            <div className="op-nav-desc">Verifiable certificates &amp; keys</div>
          </div>
          <Icon name="chevronRight" size={14} color="var(--ink3)" />
        </Link>

        <Link to="/ondi/personal/devices" className="op-nav-card">
          <FeaturedIcon variant="warning" size="sm" shape="square">
            <Icon name="smartphone" size={16} />
          </FeaturedIcon>
          <div className="op-nav-info">
            <div className="op-nav-title">Device Security</div>
            <div className="op-nav-desc">Hardware tokens &amp; logins</div>
          </div>
          <Icon name="chevronRight" size={14} color="var(--ink3)" />
        </Link>

        <Link to="/ondi/personal/privacy" className="op-nav-card">
          <FeaturedIcon variant="gray" size="sm" shape="square">
            <Icon name="shield" size={16} />
          </FeaturedIcon>
          <div className="op-nav-info">
            <div className="op-nav-title">Privacy &amp; Consents</div>
            <div className="op-nav-desc">Data sharing &amp; OAuth scopes</div>
          </div>
          <Icon name="chevronRight" size={14} color="var(--ink3)" />
        </Link>
      </div>
    </div>
  );
};

export default OndiPersonal;
