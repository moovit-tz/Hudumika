// ─── OneIdOrgTrust.tsx — Ondi Enterprise · Trust ──────────────────
// An aggregate over the same per-user Trust Score every personal profile
// already shows (trust-score.ts's computeTrustScore) — not a second
// scoring model, see computeOrgTrust()'s own header comment. Backed by
// GET /v1/oneid/org/trust, gated by the new org_trust.view permission.
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Badge } from '../components/ui/badge.js';

interface OrgTrustMember { user_id: string; name: string; email: string; role: string; score: number; tier: 'LOW' | 'MEDIUM' | 'HIGH' }
interface OrgTrust { average: number; tier: 'LOW' | 'MEDIUM' | 'HIGH'; distribution: { LOW: number; MEDIUM: number; HIGH: number }; members: OrgTrustMember[] }

const TIER_COLOR: Record<string, string> = { LOW: '#dc2626', MEDIUM: '#d97706', HIGH: '#059669' };
const TIER_BADGE: Record<string, 'error' | 'warning' | 'success'> = { LOW: 'error', MEDIUM: 'warning', HIGH: 'success' };

export const OneIdOrgTrust: React.FC = () => {
  const [data, setData] = useState<OrgTrust | null>(null);

  useEffect(() => {
    apiFetch('/v1/oneid/org/trust').then(setData).catch(() => setData(null));
  }, []);

  const total = data ? data.distribution.LOW + data.distribution.MEDIUM + data.distribution.HIGH : 0;

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Org"
        titleEm="trust"
        subtitle="How this tenant's members score, in aggregate — the same formula as each person's own Trust page."
      />

      {!data ? (
        <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 20 }}>
            <SectionCard title="Average Score">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 40, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{data.average}</span>
                <span style={{ fontSize: 13, color: 'var(--ink3)' }}>/ 850</span>
                <span style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, background: `${TIER_COLOR[data.tier]}1a`, color: TIER_COLOR[data.tier] }}>{data.tier}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 10 }}>Across {total} active member{total === 1 ? '' : 's'}.</div>
            </SectionCard>

            <SectionCard title="Distribution">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(['HIGH', 'MEDIUM', 'LOW'] as const).map(tier => {
                  const count = data.distribution[tier];
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={tier}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: TIER_COLOR[tier] }}>{tier}</span>
                        <span style={{ color: 'var(--ink3)' }}>{count} ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: TIER_COLOR[tier], borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>

          <SectionCard padded={false} title="By member">
            {data.members.map((m, i, arr) => (
              <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <PersonAvatar userId={m.user_id} name={m.name} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{m.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{m.email} · {m.role}</div>
                </div>
                <div style={{ width: 100, textAlign: 'right' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{m.score}</span>
                </div>
                <Badge variant={TIER_BADGE[m.tier]}>{m.tier}</Badge>
              </div>
            ))}
            {data.members.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>No active members yet.</div>}
          </SectionCard>
        </>
      )}
    </div>
  );
};

export default OneIdOrgTrust;
