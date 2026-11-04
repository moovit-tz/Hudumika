import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { formatDate } from '../../lib/tenantLocale.js';
import './LexCore.css';

const EVENT_V: Record<string, 'brand' | 'info' | 'warning' | 'error' | 'gray'> = {
  MENTION: 'gray', HEARING: 'brand', PTC: 'info', JUDGMENT: 'error', RULING: 'warning', EXECUTION: 'error', FILING: 'info',
};

interface CourtEvent { id: string; event_type: string; court_case_id: string; matter_id: string; scheduled_at: string; outcome: string | null; notes: string | null; }

export function LexCoreCourtDiary() {
  const [rows, setRows] = useState<CourtEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/lexcore/court-events').then(d => setRows(d.courtEvents ?? [])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['LexCore', 'Court']}
        titlePlain="Court"
        titleEm="diary"
        subtitle="Upcoming hearings, mentions, rulings and court events across all matters."
      />

      {loading ? <SectionLoading /> : (
        <SectionCard padded={false}>
          {rows.length === 0 ? <div className="lc-empty">No court events recorded.</div> : (
            <table className="lc-table">
              <thead><tr><th>Type</th><th>Date</th><th>Outcome</th><th>Notes</th></tr></thead>
              <tbody>
                {rows.map(e => (
                  <tr key={e.id}>
                    <td><Badge variant={EVENT_V[e.event_type] ?? 'gray'}>{e.event_type}</Badge></td>
                    <td>{formatDate(e.scheduled_at)}</td>
                    <td>{e.outcome || '—'}</td>
                    <td style={{ color: 'var(--ink2)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes || '—'}</td>
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
