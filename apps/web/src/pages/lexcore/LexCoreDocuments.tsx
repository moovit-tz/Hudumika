import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { formatDate } from '../../lib/tenantLocale.js';
import './LexCore.css';

interface Doc { id: string; title: string; document_type: string | null; matter_id: string | null; created_at: string; }

export function LexCoreDocuments() {
  const [rows, setRows] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/lexcore/documents').then(d => setRows(d.documents ?? [])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['LexCore', 'Documents']}
        titlePlain="Matter"
        titleEm="documents"
        subtitle="Pleadings, affidavits, judgments and correspondence — privilege-marked and version-controlled."
      />

      {loading ? <SectionLoading /> : (
        <SectionCard padded={false}>
          {rows.length === 0 ? <div className="lc-empty">No documents uploaded.</div> : (
            <table className="lc-table">
              <thead><tr><th>Title</th><th>Type</th><th>Uploaded</th></tr></thead>
              <tbody>
                {rows.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.title}</td>
                    <td style={{ color: 'var(--ink2)' }}>{d.document_type || '—'}</td>
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
