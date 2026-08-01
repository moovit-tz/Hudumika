import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './studio.css';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { SingleSelectFilter } from '../../components/ui/filter-dropdown.js';

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

  const visible = useMemo(() => runs.filter(r => status === 'ALL' || r.status === status), [runs, status]);

  return (
    <div style={{ padding: '20px 22px', maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)' }}>Runs</div>
        <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 3 }}>
          Every execution across every workflow. <strong>Simulated</strong> means a dry run — no action was performed.
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <SingleSelectFilter
          label="Status" value={status} onChange={v => setStatus(v ?? 'ALL')}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'SUCCESS', label: 'Success' },
            { value: 'PARTIAL', label: 'Partial' },
            { value: 'FAILED', label: 'Failed' },
            { value: 'SIMULATED', label: 'Simulated' },
          ]}
        />
      </div>

      {error && <div style={{ padding: '9px 13px', background: 'var(--red-l)', color: 'var(--red)', borderRadius: 9, fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
      {loading && <div style={{ color: 'var(--ink3)', fontSize: 13, padding: 20 }}>Loading…</div>}

      {!loading && visible.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--ink3)', fontSize: 13 }}>
          <Icon name="clock" size={22} color="var(--ink3)" />
          <div style={{ marginTop: 8 }}>No runs recorded yet.</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Open a workflow and use <strong>Dry run</strong> — it executes the graph without performing any action.</div>
        </div>
      )}

      <div style={{ border: visible.length ? '1px solid var(--border)' : 'none', borderRadius: 12, overflow: 'hidden', background: 'var(--card-bg, var(--white))' }}>
        {visible.map(r => (
          <div key={r.id} className="studio-step" style={{ gridTemplateColumns: '96px 1fr auto', cursor: 'pointer' }}
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
