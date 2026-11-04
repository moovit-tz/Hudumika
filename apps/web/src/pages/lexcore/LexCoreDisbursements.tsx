import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { formatDate } from '../../lib/tenantLocale.js';
import './LexCore.css';

const CAT_V: Record<string, 'brand' | 'info' | 'warning' | 'error' | 'gray'> = {
  COURT_FEE: 'brand', STAMP_DUTY: 'info', BRELA: 'info', TRAVEL: 'warning', EXPERT: 'error', COUNSEL_FEE: 'brand', OTHER: 'gray',
};

interface Disbursement { id: string; category: string; description: string; amount: number; matter_id: string; created_at: string; }

export function LexCoreDisbursements() {
  const [rows, setRows] = useState<Disbursement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/lexcore/disbursements').then(d => setRows(d.disbursements ?? [])).finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['LexCore', 'Finance']}
        titlePlain="Matter"
        titleEm="disbursements"
        subtitle="Out-of-pocket expenses — court fees, stamp duty, expert fees — tracked per matter."
      />

      {loading ? <SectionLoading /> : (
        <SectionCard padded={false}>
          {rows.length === 0 ? <div className="lc-empty">No disbursements recorded.</div> : (
            <table className="lc-table">
              <thead><tr><th>Category</th><th>Description</th><th>Amount</th><th>Date</th></tr></thead>
              <tbody>
                {rows.map(d => (
                  <tr key={d.id}>
                    <td><Badge variant={CAT_V[d.category] ?? 'gray'}>{d.category.replace(/_/g, ' ')}</Badge></td>
                    <td style={{ fontWeight: 600 }}>{d.description}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(d.amount)}</td>
                    <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{formatDate(d.created_at)}</td>
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
