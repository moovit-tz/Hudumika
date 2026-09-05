import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar } from '../components/PersonAvatar.js';

interface OrgTrustMember { user_id: string; name: string; email: string; role: string; score: number; tier: 'LOW' | 'MEDIUM' | 'HIGH' }
interface OrgTrust { average: number; tier: 'LOW' | 'MEDIUM' | 'HIGH'; distribution: { LOW: number; MEDIUM: number; HIGH: number }; members: OrgTrustMember[] }

const TIER_COLOR: Record<string, string> = { LOW: '#dc2626', MEDIUM: '#d97706', HIGH: '#059669' };
const TIER_PILL: Record<string, 'error' | 'warning' | 'success'> = { LOW: 'error', MEDIUM: 'warning', HIGH: 'success' };

export const OndiOrgTrust: React.FC = () => {
  const [data, setData] = useState<OrgTrust | null>(null);

  useEffect(() => {
    apiFetch('/v1/ondi/org/trust').then(setData).catch(() => setData(null));
  }, []);

  const total = data ? data.distribution.LOW + data.distribution.MEDIUM + data.distribution.HIGH : 0;

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Org"
        titleEm="trust"
        subtitle="Aggregate organizational security score based on 2FA adoption, credential strength, and device health."
      />

      {!data ? (
        <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading trust metrics…</div>
      ) : (
        <>
          {/* KPI Cards Bar */}
          <div className="ondi-kpi-grid">
            <div className="ondi-kpi-card">
              <div className="ondi-kpi-header">
                <span className="ondi-kpi-title">Average Score</span>
                <span className={`ondi-status-pill ${TIER_PILL[data.tier]}`}>{data.tier} TIER</span>
              </div>
              <div className="ondi-kpi-body">
                <span className="ondi-kpi-num" style={{ color: TIER_COLOR[data.tier], fontFamily: 'var(--font)' }}>{data.average}</span>
                <span className="ondi-kpi-sub">/ 850 max score</span>
              </div>
            </div>

            <div className="ondi-kpi-card">
              <div className="ondi-kpi-header">
                <span className="ondi-kpi-title">Members Evaluated</span>
              </div>
              <div className="ondi-kpi-body">
                <span className="ondi-kpi-num">{total}</span>
                <span className="ondi-kpi-sub">active accounts</span>
              </div>
            </div>

            <div className="ondi-kpi-card">
              <div className="ondi-kpi-header">
                <span className="ondi-kpi-title">High Trust Ratio</span>
              </div>
              <div className="ondi-kpi-body">
                <span className="ondi-kpi-num" style={{ color: '#047857' }}>
                  {total > 0 ? Math.round((data.distribution.HIGH / total) * 100) : 0}%
                </span>
                <span className="ondi-kpi-sub">high tier users</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 20 }}>
            <SectionCard title="Score Distribution Breakdown">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(['HIGH', 'MEDIUM', 'LOW'] as const).map(tier => {
                  const count = data.distribution[tier];
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={tier}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, color: TIER_COLOR[tier] }}>{tier} TIER</span>
                        <span style={{ color: 'var(--ink2)', fontWeight: 600 }}>{count} members ({pct}%)</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: TIER_COLOR[tier], borderRadius: 4, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>

          <SectionCard padded={false} title="Trust Score Leaderboard">
            <table className="ondi-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Trust Score</th>
                  <th style={{ textAlign: 'right' }}>Risk Tier</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map(m => (
                  <tr key={m.user_id}>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <PersonAvatar userId={m.user_id} name={m.name} size={32} />
                        <div>
                          <div>{m.name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 400 }}>{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 11.5, fontWeight: 700, background: 'var(--bg)', border: '1px solid var(--border-soft)', padding: '3px 8px', borderRadius: 6 }}>
                        {m.role}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--font)' }}>
                        {m.score}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`ondi-status-pill ${TIER_PILL[m.tier]}`}>
                        <span className="ondi-status-dot" />
                        {m.tier}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.members.length === 0 && <div style={{ padding: '36px 20px', fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>No active members evaluated yet.</div>}
          </SectionCard>
        </>
      )}
    </div>
  );
};

export default OndiOrgTrust;
