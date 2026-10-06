import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './studio.css';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Banner } from '../../components/ui/alert.js';
import { Badge } from '../../components/ui/badge.js';
import { SearchToolbar, SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { StudioPagination } from './StudioPagination.js';
import { PageHeader } from '../../components/PageHeader.js';

interface RunRow {
  id: string; workflow_id: string; workflow_name: string | null; status: string;
  trigger_source: string; duration_ms: number; error_message: string | null;
  domain_event_id: string | null; created_at: string;
}

const VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  SUCCESS: 'success', SIMULATED: 'info', PARTIAL: 'warning', FAILED: 'error', RUNNING: 'gray',
};

export function RunsPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [status, setStatus] = useState('ALL');
  const [q, setQ] = useState('');
  const [duration, setDuration] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [status, q, duration]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    apiFetch('/v1/workflow-studio/runs?limit=200')
      .then(r => { if (alive) setRuns(r.data ?? []); })
      .catch(e => { if (alive) setError(e?.message ?? 'Could not load runs.'); })
      .finally(() => { if (alive) setLoading(false); });

  return () => { alive = false; };
  }, []);

  const visible = useMemo(() => runs.filter(r => (status === 'ALL' || r.status === status) && (!q || `${r.workflow_name ?? ''} ${r.trigger_source}`.toLowerCase().includes(q.toLowerCase())) && (!duration || (duration === 'slow' ? r.duration_ms >= 1000 : r.duration_ms < 1000))), [runs, status, q, duration]);

  const current = Math.min(page, Math.max(1, Math.ceil(visible.length / 6)));
  return (
    <div className="studio-page">
      <div>
        <PageHeader
          crumbs={['Studio', 'Runs']}
          titlePlain="Workflow"
          titleEm="runs"
          subtitle="Every execution across every workflow. <strong>Simulated</strong> means a dry run — no action was performed."
        />
      </div>

      <div className="workflow-toolbar">
        <SingleSelectFilter
          label="Status" value={status} onChange={v => setStatus(v ?? 'ALL')}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'SUCCESS', label: 'Success' },
            { value: 'PARTIAL', label: 'Partial' },
            { value: 'FAILED', label: 'Failed' },
            { value: 'SIMULATED', label: 'Simulated' },
          ]}
        />        <SingleSelectFilter label="Duration" value={duration} onChange={setDuration} options={[{value:'fast',label:'Under 1 second'},{value:'slow',label:'1 second or more'}]} />
        <div className="workflow-search"><SearchToolbar search={q} onSearch={setQ} placeholder="Search runs" /></div>

      </div>

      {!loading && <><p style={{color:"var(--ink3)"}}>Latest 200 runs</p><StudioPagination page={current} total={visible.length} onChange={setPage} /></>}
      {error && <Banner variant="error" className="mb-3">{error}</Banner>}
      {loading && <SectionLoading />}

      {!loading && visible.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--card-radius)', color: 'var(--ink3)', fontSize: 13 }}>
          <Icon name="clock" size={22} color="var(--ink3)" />
          <div style={{ marginTop: 8 }}>No runs recorded yet.</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Open a workflow and use <strong>Dry run</strong> — it executes the graph without performing any action.</div>
        </div>
      )}

      <div style={{ border: visible.length ? '1px solid var(--border)' : 'none', borderRadius: 'var(--card-radius)', overflow: 'hidden', background: 'var(--card-bg, var(--white))' }}>
        {visible.slice((current - 1) * 6, current * 6).map(r => (
          <div key={r.id} className="studio-step studio-paged-run" style={{ gridTemplateColumns: '96px 1fr auto', cursor: 'pointer' }}
               onClick={() => navigate(`/studio/w/${r.workflow_id}`)}>
            <Badge variant={VARIANT[r.status] ?? 'gray'}>{r.status}</Badge>
            <span>
              <span style={{ color: 'var(--ink)' }}>{r.workflow_name ?? 'Deleted workflow'}</span>
              <span className="studio-run-mono" style={{ display: 'block', marginTop: 2 }}>
                {r.trigger_source}{r.domain_event_id ? ` · event ${r.domain_event_id}` : ''}
              </span>
              {r.error_message && <span style={{ display: 'block', color: 'var(--red)', fontSize: 11.5, marginTop: 2 }}>{r.error_message}</span>}
            </span>
            <span className="studio-run-mono">{r.duration_ms}ms · {new Date(r.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
