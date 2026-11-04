import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface Stats { vehicles: number; openJobs: number; pendingEstimates: number; activeClaims: number }
interface Estimate { id: string; estimate_number: string; status: string; grand_total: number; created_at: string }

const EST_BADGE: Record<string, 'gray' | 'info' | 'success' | 'error' | 'warning' | 'brand'> = {
  draft: 'gray', sent: 'info', approved: 'success', rejected: 'error', expired: 'warning', converted: 'brand',
};

export function GerejiOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/v1/gereji/vehicles'),
      apiFetch('/v1/gereji/job-cards'),
      apiFetch('/v1/gereji/estimates'),
      apiFetch('/v1/gereji/warranty'),
    ]).then(([v, j, e, w]) => {
      setStats({
        vehicles: v.vehicles?.length ?? 0,
        openJobs: (j.jobCards ?? []).filter((c: any) => !['delivered', 'ready'].includes(c.status)).length,
        pendingEstimates: (e.estimates ?? []).filter((r: any) => ['draft', 'sent'].includes(r.status)).length,
        activeClaims: (w.claims ?? []).filter((c: any) => !['settled', 'rejected'].includes(c.status)).length,
      });
      setEstimates((e.estimates ?? []).slice(0, 8));
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page-layout">
      <PageHeader crumbs={['Gereji']} titlePlain="Workshop" titleEm="management" subtitle="Vehicle records, job cards, estimates, labour tracking and parts inventory." />
      <SectionLoading />
    </div>
  );

  const cards = [
    { label: 'Vehicles', value: stats?.vehicles ?? 0, icon: 'truck' as const, color: 'var(--blue)' },
    { label: 'Open Job Cards', value: stats?.openJobs ?? 0, icon: 'clipboard' as const, color: 'var(--teal)' },
    { label: 'Pending Estimates', value: stats?.pendingEstimates ?? 0, icon: 'fileText' as const, color: 'var(--gold)' },
    { label: 'Active Claims', value: stats?.activeClaims ?? 0, icon: 'shield' as const, color: 'var(--red)' },
  ];

  return (
    <div className="page-layout">
      <PageHeader crumbs={['Gereji']} titlePlain="Workshop" titleEm="management" subtitle="Vehicle records, job cards, estimates, labour tracking and parts inventory." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {cards.map(c => (
          <SectionCard key={c.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px' }}>
              <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: `color-mix(in srgb, ${c.color} 12%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={c.icon} size={18} style={{ color: c.color }} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{c.value}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{c.label}</div>
              </div>
            </div>
          </SectionCard>
        ))}
      </div>

      <SectionCard>
        <div style={{ padding: '16px 20px 8px', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>Recent Estimates</div>
        {estimates.length === 0 ? (
          <div style={{ padding: '24px 20px', color: 'var(--ink3)', fontSize: 13 }}>No estimates yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Estimate #', 'Status', 'Total', 'Created'].map(h => (
                    <th key={h} style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--card-sunken, var(--bg))', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {estimates.map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 18px', fontWeight: 600, color: 'var(--ink)' }}>{e.estimate_number}</td>
                    <td style={{ padding: '12px 18px' }}><Badge variant={EST_BADGE[e.status] ?? 'gray'}>{e.status}</Badge></td>
                    <td style={{ padding: '12px 18px', color: 'var(--ink)' }}>{Number(e.grand_total).toLocaleString()}</td>
                    <td style={{ padding: '12px 18px', color: 'var(--ink3)' }}>{formatDate(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
