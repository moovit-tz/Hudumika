import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { apiFetch } from '../../lib/api.js';
import { formatDate } from '../../lib/tenantLocale.js';
import { Badge } from '../../components/ui/badge.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Icon } from '../../components/Icon.js';

interface Stats {
  assessments: number;
  activeIncidents: number;
  pendingRights: number;
  vendors: number;
}

export function NgaoOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/v1/ngao/assessments'),
      apiFetch('/v1/ngao/incidents'),
      apiFetch('/v1/ngao/rights-requests'),
      apiFetch('/v1/ngao/vendors'),
    ]).then(([a, i, r, v]) => {
      setStats({
        assessments: a.assessments?.length ?? 0,
        activeIncidents: (i.incidents ?? []).filter((x: any) => x.status !== 'closed').length,
        pendingRights: (r.requests ?? []).filter((x: any) => x.status === 'PENDING' || x.status === 'IN_PROGRESS').length,
        vendors: v.vendors?.length ?? 0,
      });
      setIncidents((i.incidents ?? []).slice(0, 5));
    }).finally(() => setLoading(false));
  }, []);

  const SEVERITY_VARIANT: Record<string, 'error' | 'warning' | 'info' | 'gray'> = {
    critical: 'error', high: 'warning', medium: 'info', low: 'gray',
  };
  const STATUS_VARIANT: Record<string, 'error' | 'warning' | 'info' | 'success' | 'gray'> = {
    detected: 'error', investigating: 'warning', contained: 'info',
    notified: 'info', remediated: 'success', closed: 'gray',
  };

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Ngao']}
        titlePlain="Privacy"
        titleEm="compliance"
        subtitle="Data protection assessments, processing registers and incident response."
      />

      {loading ? <SectionLoading /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Assessments', value: stats?.assessments ?? 0, icon: 'clipboard' as const, color: 'var(--blue)' },
              { label: 'Active Incidents', value: stats?.activeIncidents ?? 0, icon: 'alertTriangle' as const, color: 'var(--red)' },
              { label: 'Pending Requests', value: stats?.pendingRights ?? 0, icon: 'userCheck' as const, color: 'var(--gold)' },
              { label: 'Vendors', value: stats?.vendors ?? 0, icon: 'building' as const, color: 'var(--teal)' },
            ].map(s => (
              <SectionCard key={s.label} title={s.label} collapsible={false}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Icon name={s.icon} size={22} style={{ color: s.color }} />
                  <span style={{ fontSize: 28, fontWeight: 700 }}>{s.value}</span>
                </div>
              </SectionCard>
            ))}
          </div>

          <SectionCard title="Recent Incidents">
            {incidents.length === 0 ? (
              <p style={{ color: 'var(--ink2)', padding: 16 }}>No incidents recorded yet.</p>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr>
                    <th>Number</th><th>Title</th><th>Severity</th><th>Status</th><th>Detected</th>
                  </tr></thead>
                  <tbody>
                    {incidents.map((r: any) => (
                      <tr key={r.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.incident_number}</td>
                        <td>{r.title}</td>
                        <td><Badge variant={SEVERITY_VARIANT[r.severity] ?? 'gray'}>{r.severity}</Badge></td>
                        <td><Badge variant={STATUS_VARIANT[r.status] ?? 'gray'}>{r.status?.replace('_', ' ')}</Badge></td>
                        <td>{formatDate(r.detected_at ?? r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
