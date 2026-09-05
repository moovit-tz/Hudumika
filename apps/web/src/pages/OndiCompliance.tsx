import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';

interface Compliance {
  kyc: { verified: number; total: number; pct: number };
  mfa: { enabled: number; total: number; pct: number };
  kyb: { status: string; submitted_at: string | null };
  staleGrants: { count: number; thresholdDays: number };
  accessReviews: { completedCount: number; lastCompletedAt: string | null };
}

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function pctColor(pct: number): string {
  return pct >= 80 ? '#047857' : pct >= 50 ? '#b45309' : '#b91c1c';
}

export const OndiCompliance: React.FC = () => {
  const [data, setData] = useState<Compliance | null>(null);

  useEffect(() => {
    apiFetch('/v1/ondi/org/compliance').then(setData).catch(() => setData(null));
  }, []);

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Access"
        titleEm="compliance"
        subtitle="Comprehensive identity posture rollup — KYC verification, 2FA adoption, business KYB status, and stale entitlement audits."
      />

      {!data ? (
        <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading compliance posture…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          
          {/* Metric 1: Identity Verification */}
          <SectionCard title="Identity Verification (KYC)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(4,120,87,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="fingerprint" size={20} color="#047857" />
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>{data.kyc.pct}%</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{data.kyc.verified} of {data.kyc.total} active members KYC-verified</div>
              </div>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', marginTop: 16, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${data.kyc.pct}%`, background: pctColor(data.kyc.pct), borderRadius: 3, transition: 'width 0.4s ease' }} />
            </div>
          </SectionCard>

          {/* Metric 2: 2FA Adoption */}
          <SectionCard title="Two-Factor Adoption">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(0,181,137,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="shield" size={20} color="var(--teal)" />
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>{data.mfa.pct}%</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{data.mfa.enabled} of {data.mfa.total} active members have 2FA or passkey</div>
              </div>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', marginTop: 16, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${data.mfa.pct}%`, background: pctColor(data.mfa.pct), borderRadius: 3, transition: 'width 0.4s ease' }} />
            </div>
          </SectionCard>

          {/* Metric 3: Business Verification */}
          <SectionCard title="Business Verification (KYB)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--teal-l, #ecfeff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="building" size={20} color="var(--teal)" />
              </div>
              <div>
                <span className={`ondi-status-pill ${data.kyb.status === 'verified' ? 'success' : data.kyb.status === 'pending' ? 'warning' : 'gray'}`}>
                  <span className="ondi-status-dot" />
                  {data.kyb.status === 'not_started' ? 'Not Started' : data.kyb.status}
                </span>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8 }}>
                  {data.kyb.submitted_at ? `Submitted ${fmtDate(data.kyb.submitted_at)}` : 'No submission yet'}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Metric 4: Stale Role Grants */}
          <SectionCard title="Stale Role Grants">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: data.staleGrants.count > 0 ? '#fffbeb' : '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="clock" size={20} color={data.staleGrants.count > 0 ? '#b45309' : '#047857'} />
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>{data.staleGrants.count}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                  Granted &gt; {data.staleGrants.thresholdDays} days ago without reattestation
                </div>
              </div>
            </div>
            {data.staleGrants.count > 0 && (
              <Link to="/ondi/access-reviews" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
                Start a review campaign <Icon name="arrowRight" size={14} />
              </Link>
            )}
          </SectionCard>

          {/* Metric 5: Access Review Cadence */}
          <SectionCard title="Access Review Cadence">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="userCheck" size={20} color="#1d4ed8" />
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>{data.accessReviews.completedCount}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                  {data.accessReviews.lastCompletedAt ? `Last completed ${fmtDate(data.accessReviews.lastCompletedAt)}` : 'Campaigns completed'}
                </div>
              </div>
            </div>
          </SectionCard>

        </div>
      )}
    </div>
  );
};

export default OndiCompliance;
