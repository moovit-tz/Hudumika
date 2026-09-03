// ─── OndiCompliance.tsx — Ondi Enterprise · Compliance ───────────
// An identity/access posture rollup (GET /v1/ondi/org/compliance) — not
// ComplyOS's regulatory/licensing compliance, a different product for a
// different domain (filing deadlines, legal obligations). This only ever
// reads tables Ondi itself already owns: KYC status, 2FA/passkey adoption,
// KYB, role-grant age, and access-review cadence.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';

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
  return pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)';
}

const MetricCard: React.FC<{ title: string; value: string; sub: string; pct?: number; icon: string; color: string }> = ({ title, value, sub, pct, icon, color }) => (
  <SectionCard title={title}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon as any} size={19} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{value}</div>
        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{sub}</div>
      </div>
    </div>
    {pct !== undefined && (
      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', marginTop: 14, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
    )}
  </SectionCard>
);

export const OndiCompliance: React.FC = () => {
  const [data, setData] = useState<Compliance | null>(null);

  useEffect(() => {
    apiFetch('/v1/ondi/org/compliance').then(setData).catch(() => setData(null));
  }, []);

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Access"
        titleEm="compliance"
        subtitle="How complete this tenant's identity posture is — KYC, 2FA, business verification, and stale access."
      />

      {!data ? (
        <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <MetricCard title="Identity Verification" icon="fingerprint" color={pctColor(data.kyc.pct)}
            value={`${data.kyc.pct}%`} sub={`${data.kyc.verified} of ${data.kyc.total} active members KYC-verified`} pct={data.kyc.pct} />

          <MetricCard title="Two-Factor Adoption" icon="shield" color={pctColor(data.mfa.pct)}
            value={`${data.mfa.pct}%`} sub={`${data.mfa.enabled} of ${data.mfa.total} active members have 2FA or a passkey`} pct={data.mfa.pct} />

          <SectionCard title="Business Verification">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="building" size={19} color="var(--teal)" />
              </div>
              <div>
                <Badge variant={data.kyb.status === 'verified' ? 'success' : data.kyb.status === 'pending' ? 'warning' : data.kyb.status === 'rejected' ? 'error' : 'gray'}>
                  {data.kyb.status === 'not_started' ? 'Not started' : data.kyb.status}
                </Badge>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 6 }}>
                  {data.kyb.submitted_at ? `Submitted ${fmtDate(data.kyb.submitted_at)}` : 'No submission yet'}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Stale Role Grants">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: data.staleGrants.count > 0 ? 'var(--gold-l)' : 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="clock" size={19} color={data.staleGrants.count > 0 ? 'var(--gold)' : 'var(--green)'} />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{data.staleGrants.count}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                  Granted more than {data.staleGrants.thresholdDays} days ago
                </div>
              </div>
            </div>
            {data.staleGrants.count > 0 && (
              <Link to="/ondi/access-reviews" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 12, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}>
                Start a review campaign <Icon name="arrowRight" size={13} />
              </Link>
            )}
          </SectionCard>

          <SectionCard title="Access Review Cadence">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="userCheck" size={19} color="var(--blue)" />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{data.accessReviews.completedCount}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
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
