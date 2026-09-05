import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import './Seal.css';
import { PageHeader } from '../components/PageHeader.js';

interface Examination {
  id: string; customsEntryId: string; lotDescription?: string; selectivityChannel: string;
  examinationType: string; status: string; outcome: string | null; createdAt: string;
}

const STATUS_ALL = '__all__';

export function SealExaminations() {
  const [rows, setRows] = useState<Examination[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('REQUESTED');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== STATUS_ALL) params.set('status', status);
    apiFetch(`/v1/seal/examinations?${params.toString()}`).then(setRows).finally(() => setLoading(false));
  }, [status]);

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Examinations']}
        titlePlain="Customs"
        titleEm="examinations"
        subtitle="Selectivity worklist — YELLOW and RED channel declarations block release until an officer completes an examination here."
      />
      <div className="seal-page-hdr">
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="input-field" style={{ width: 220 }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_ALL}>All statuses</SelectItem>
            <SelectItem value="REQUESTED">Requested</SelectItem>
            <SelectItem value="SCHEDULED">Scheduled</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="WAIVED">Waived (Green)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? (
            <SectionLoading />
          ) : rows.length === 0 ? (
            <div className="seal-empty">No examinations match this filter.</div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr><th>Lot</th><th>Channel</th><th>Type</th><th>Status</th><th>Outcome</th><th>Requested</th></tr>
              </thead>
              <tbody>
                {rows.map(ex => (
                  <tr key={ex.id}>
                    <td>
                      <Link to={`/seal/declarations/${ex.customsEntryId}`} style={{ fontWeight: 700, color: 'var(--ink)', textDecoration: 'none' }}>
                        {ex.lotDescription ?? 'Declaration'}
                      </Link>
                    </td>
                    <td>
                      <Badge variant={ex.selectivityChannel === 'GREEN' ? 'success' : ex.selectivityChannel === 'YELLOW' ? 'warning' : 'error'}>
                        {ex.selectivityChannel}
                      </Badge>
                    </td>
                    <td style={{ textTransform: 'lowercase' }}>{ex.examinationType}</td>
                    <td><Badge variant={ex.status === 'COMPLETED' || ex.status === 'WAIVED' ? 'gray' : 'brand'}>{ex.status}</Badge></td>
                    <td>{ex.outcome ? ex.outcome.replace(/_/g, ' ') : '—'}</td>
                    <td>{new Date(ex.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
