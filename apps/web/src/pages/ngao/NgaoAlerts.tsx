import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { apiFetch } from '../../lib/api.js';
import { formatDate } from '../../lib/tenantLocale.js';
import { Badge } from '../../components/ui/badge.js';
import { SectionLoading } from '../../components/ui/spinner.js';

const STATUS_VARIANT: Record<string, 'warning' | 'error' | 'success' | 'gray' | 'info'> = {
  PENDING: 'warning', OVERDUE: 'error', ACKNOWLEDGED: 'info', RESOLVED: 'success', DISMISSED: 'gray',
};
const SEVERITY_VARIANT: Record<string, 'error' | 'warning' | 'info' | 'gray'> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'gray',
};

export function NgaoAlerts() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/ngao/alerts').then(d => setRows(d.alerts ?? [])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Ngao', 'Compliance']}
        titlePlain="Compliance"
        titleEm="alerts"
        subtitle="PDPC renewal reminders, DPO review dates, consent expiry and breach notification deadlines."
      />

      {loading ? <SectionLoading /> : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Type</th><th>Title</th><th>Severity</th><th>Due Date</th><th>Status</th>
            </tr></thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id}>
                  <td><Badge variant="brand">{(r.alert_type ?? '').replace(/_/g, ' ')}</Badge></td>
                  <td>{r.title ?? r.message ?? '—'}</td>
                  <td>{r.severity ? <Badge variant={SEVERITY_VARIANT[r.severity] ?? 'gray'}>{r.severity}</Badge> : '—'}</td>
                  <td>{r.due_date ? formatDate(r.due_date) : '—'}</td>
                  <td><Badge variant={STATUS_VARIANT[r.status] ?? 'gray'}>{r.status ?? '—'}</Badge></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink2)' }}>No compliance alerts.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
