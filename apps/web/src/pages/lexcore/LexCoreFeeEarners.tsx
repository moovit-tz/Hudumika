import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import './LexCore.css';

interface FeeEarner { id: string; name: string; role: string | null; grade: string | null; rate: number | null; active: boolean; }

export function LexCoreFeeEarners() {
  const [rows, setRows] = useState<FeeEarner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/lexcore/fee-earners').then(d => setRows(d.feeEarners ?? [])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['LexCore', 'Team']}
        titlePlain="Fee"
        titleEm="earners"
        subtitle="Lawyer billing profiles — charge rates, grades, practising certificates and TLS numbers."
      />

      {loading ? <SectionLoading /> : (
        <SectionCard padded={false}>
          {rows.length === 0 ? <div className="lc-empty">No fee earners configured.</div> : (
            <table className="lc-table">
              <thead><tr><th>Name</th><th>Role</th><th>Grade</th><th>Rate</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map(f => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 600 }}>{f.name}</td>
                    <td>{f.role || '—'}</td>
                    <td>{f.grade || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{f.rate != null ? f.rate.toLocaleString() : '—'}</td>
                    <td>{f.active ? <Badge variant="success">Active</Badge> : <Badge variant="gray">Inactive</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}
    </div>
  );
}
