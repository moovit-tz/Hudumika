import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';
import './LexCore.css';

interface Deadline { id: string; description: string; deadline_type: string; due_date: string; is_critical: boolean; completed_at: string | null; matter_id: string; }

export function LexCoreDeadlines() {
  const [rows, setRows] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);

  function reload() {
    apiFetch('/v1/legal/deadlines?upcoming=true').then(d => setRows(Array.isArray(d) ? d : [])).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);

  async function complete(id: string) {
    try {
      await apiFetch(`/v1/legal/deadlines/${id}/complete`, { method: 'PATCH' });
      reload();
    } catch (err: any) { showAlert(err.message); }
  }

  const overdue = (d: string) => new Date(d) < new Date();

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['LexCore', 'Deadlines']}
        titlePlain="Limitation"
        titleEm="deadlines"
        subtitle="Statutory deadlines, appeal windows and court-ordered dates with business-day calculation."
      />

      {loading ? <SectionLoading /> : (
        <SectionCard padded={false}>
          {rows.length === 0 ? <div className="lc-empty">No upcoming deadlines.</div> : (
            <table className="lc-table">
              <thead><tr><th>Description</th><th>Type</th><th>Due</th><th>Priority</th><th></th></tr></thead>
              <tbody>
                {rows.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.description}</td>
                    <td><Badge variant="gray">{d.deadline_type.replace(/_/g, ' ')}</Badge></td>
                    <td style={{ color: overdue(d.due_date) ? 'var(--red)' : 'var(--ink2)', fontWeight: overdue(d.due_date) ? 700 : 400 }}>{formatDate(d.due_date)}</td>
                    <td>{d.is_critical ? <Badge variant="error">Critical</Badge> : <Badge variant="gray">Normal</Badge>}</td>
                    <td><Button variant="outline" size="sm" onClick={() => complete(d.id)}>Done</Button></td>
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
