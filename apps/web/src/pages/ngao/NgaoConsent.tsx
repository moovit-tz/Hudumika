import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { apiFetch } from '../../lib/api.js';
import { formatDate } from '../../lib/tenantLocale.js';
import { Badge } from '../../components/ui/badge.js';
import { SectionLoading } from '../../components/ui/spinner.js';

export function NgaoConsent() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/ngao/consent').then(d => setRows(d.records ?? [])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Ngao', 'Consent']}
        titlePlain="Consent"
        titleEm="management"
        subtitle="Consent collection records, withdrawal tracking and lawful basis documentation."
      />

      {loading ? <SectionLoading /> : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Subject</th><th>Purpose</th><th>Granted</th><th>Expires</th><th>Withdrawn</th><th>Status</th>
            </tr></thead>
            <tbody>
              {rows.map((r: any) => {
                const withdrawn = !!r.withdrawn_at;
                const expired = r.expires_at && new Date(r.expires_at) < new Date();
                const status = withdrawn ? 'Withdrawn' : expired ? 'Expired' : 'Active';
                const variant = withdrawn ? 'error' : expired ? 'warning' : 'success';
                return (
                  <tr key={r.id}>
                    <td>{r.subject_name || r.subject_id || '—'}</td>
                    <td>{r.purpose ?? '—'}</td>
                    <td>{formatDate(r.granted_at)}</td>
                    <td>{r.expires_at ? formatDate(r.expires_at) : '—'}</td>
                    <td>{r.withdrawn_at ? formatDate(r.withdrawn_at) : '—'}</td>
                    <td><Badge variant={variant}>{status}</Badge></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink2)' }}>No consent records yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
