import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './studio.css';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Banner } from '../../components/ui/alert.js';
import { Badge } from '../../components/ui/badge.js';
import { SearchToolbar, SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { StudioPagination } from './StudioPagination.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';

interface RunRow {
  id: string; workflow_id: string; workflow_name: string | null; status: string;
  trigger_source: string; duration_ms: number; error_message: string | null;
  domain_event_id: string | null; created_at: string;
}

const VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  SUCCESS: 'success', SIMULATED: 'info', PARTIAL: 'warning', FAILED: 'error', RUNNING: 'gray',
};

export function RunsPage() {
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
  const hasActiveFilters = status !== 'ALL' || duration !== null || q.trim().length > 0;
  const clearFilters = () => {
    setStatus('ALL');
    setDuration(null);
    setQ('');
    setPage(1);
  };

  return (
    <div className="studio-page">
      <PageHeader
        crumbs={['Studio', 'Runs']}
        titlePlain="Workflow"
        titleEm="runs"
        subtitle={<>Every execution across every workflow. <strong>Simulated</strong> means a dry run — no action was performed.</>}
      />

      <div className="workflow-toolbar">
        <SingleSelectFilter
          label="Status" value={status} onChange={v => setStatus(v ?? 'ALL')}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'RUNNING', label: 'Running / needs review' },
            { value: 'SUCCESS', label: 'Success' },
            { value: 'PARTIAL', label: 'Partial' },
            { value: 'FAILED', label: 'Failed' },
            { value: 'SIMULATED', label: 'Simulated' },
          ]}
        />
        <SingleSelectFilter
          label="Duration"
          value={duration}
          onChange={setDuration}
          options={[
            { value: 'fast', label: 'Under 1 second' },
            { value: 'slow', label: '1 second or more' },
          ]}
        />
        <div className="workflow-search">
          <SearchToolbar search={q} onSearch={setQ} placeholder="Search runs by workflow or trigger…" />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      {error && <Banner variant="error" className="mb-3">{error}</Banner>}
      {loading && <SectionLoading label="Loading runs…" />}

      {!loading && visible.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--card-radius)', color: 'var(--ink3)', background: 'var(--card-bg, var(--white))' }}>
          <Icon name="clock" size={28} color="var(--ink3)" />
          <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
            {hasActiveFilters ? 'No runs match your filters.' : 'No runs recorded yet.'}
          </div>
          <div style={{ fontSize: 12.5, marginTop: 6, maxWidth: 360, margin: '6px auto 14px' }}>
            {hasActiveFilters ? 'Try clearing your filters or searching with different terms.' : 'Open a workflow and use Dry run — it executes the graph without performing any external action.'}
          </div>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', overflow: 'hidden', background: 'var(--card-bg, var(--white))', boxShadow: 'var(--elev-sm)' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink3)' }}>
            <span>Showing {visible.length} matching execution{visible.length === 1 ? '' : 's'}</span>
            <span style={{ fontWeight: 600 }}>Click any run to review details</span>
          </div>
          {visible.slice((current - 1) * 6, current * 6).map((r, idx) => (
            <Link
              key={r.id}
              className="studio-dashboard-row"
              to={`/studio/runs/${r.id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(90px, auto) 1fr auto auto',
                alignItems: 'center',
                gap: 14,
                padding: '12px 18px',
                borderBottom: idx < Math.min(6, visible.length - (current - 1) * 6) - 1 ? '1px solid var(--border)' : 'none',
                textDecoration: 'none',
                color: 'var(--ink)',
              }}
            >
              <Badge variant={VARIANT[r.status] ?? 'gray'} style={{ justifySelf: 'start', minWidth: 74, textAlign: 'center' }}>
                {r.status}
              </Badge>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.workflow_name ?? 'Deleted workflow'}
                </div>
                <div className="studio-run-mono" style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                  {r.trigger_source}{r.domain_event_id ? ` · event ${r.domain_event_id}` : ''}
                </div>
                {r.error_message && (
                  <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 2, fontWeight: 600 }}>
                    {r.error_message}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11.5, fontFamily: 'var(--font)', fontWeight: 700, color: 'var(--ink)' }}>
                  {r.duration_ms}ms
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                  {new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
              <Icon name="chevronRight" size={15} color="var(--ink3)" />
            </Link>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
            <StudioPagination page={current} total={visible.length} size={6} onChange={setPage} />
          </div>
        </div>
      )}
    </div>
  );
}
