import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './studio.css';
import { apiFetch } from '../../lib/api.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Button } from '../../components/ui/button.js';
import { SingleSelectFilter, SearchToolbar } from '../../components/ui/filter-dropdown.js';
import './WorkflowList.css';
import { PageHeader } from '../../components/PageHeader.js';
import { PageLoading } from '../../components/ui/spinner.js';

interface Stats {
  workflows: { total: number; active: number; draft: number; paused: number; unrunnable: number };
  runs: { total: number; last30d: number; byStatus: Record<string, number>; byStatusLast30d: Record<string, number> };
  byApp: { app: string; name: string; color: string; workflows: number }[];
  catalogue: { triggers: number; actions: number; templates: number };
}

interface RunRow {
  id: string;
  workflow_id: string;
  workflow_name: string | null;
  status: string;
  trigger_source: string;
  duration_ms: number;
  error_message: string | null;
  domain_event_id: string | null;
  created_at: string;
}

const VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  SUCCESS: 'success',
  SIMULATED: 'info',
  PARTIAL: 'warning',
  FAILED: 'error',
  RUNNING: 'gray',
};

/**
 * Studio's overview dashboard redesign.
 * Preserves exact backend API bindings (GET /v1/workflow-studio/stats and GET /v1/workflow-studio/runs).
 */
export function StudioDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [runFilter, setRunFilter] = useState<string>('all');

  const [appFilter, setAppFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [runPage, setRunPage] = useState(1);
  const [appPage, setAppPage] = useState(1);
  const [duration, setDuration] = useState('all');
  useEffect(() => { setRunPage(1); setAppPage(1); }, [runFilter, appFilter, search, duration]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, r] = await Promise.all([
          apiFetch('/v1/workflow-studio/stats'),
          apiFetch('/v1/workflow-studio/runs?limit=16'),
        ]);
        if (!alive) return;
        setStats(s.data);
        setRuns(r.data ?? []);
      } catch (e: any) {
        if (alive) setError(e?.message ?? 'Could not load Studio stats.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filteredRuns = useMemo(() => {
    return runs.filter(r => (runFilter === 'all' || r.status === runFilter)
      && (!search || `${r.workflow_name ?? ''} ${r.trigger_source}`.toLowerCase().includes(search.toLowerCase()))
      && (duration === 'all' || (duration === 'slow' ? r.duration_ms >= 1000 : r.duration_ms < 1000)));
  }, [runs, runFilter, search, duration]);
  const runPages = Math.max(1, Math.ceil(filteredRuns.length / 5));
  const currentRunPage = Math.min(runPage, runPages);
  const shownRuns = filteredRuns.slice((currentRunPage - 1) * 5, currentRunPage * 5);
  const filteredApps = (stats?.byApp ?? []).filter(a => appFilter === 'all' || a.app === appFilter);
  const appPages = Math.max(1, Math.ceil(filteredApps.length / 5));
  const currentAppPage = Math.min(appPage, appPages);
  const pager = (page: number, pages: number, change: (n: number) => void) => <div className="studio-pagination studio-panel-pagination">
    <Button variant="outline" disabled={page === 1} onClick={() => change(page - 1)}>Previous</Button>
    <span aria-live="polite">Page {page} of {pages}</span>
    <Button variant="outline" disabled={page === pages} onClick={() => change(page + 1)}>Next</Button>
  </div>;

  if (loading) {
    return <PageLoading label="Loading Workflow Studio dashboard…" />;
  }

  if (error) {
    return (
      <div style={{ padding: 30, color: 'var(--red)', background: 'var(--red-l)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Failed to load Studio</div>
        <div style={{ fontSize: 13 }}>{error}</div>
      </div>
    );
  }

  if (!stats) return null;

  const statuses = Object.entries(stats.runs.byStatusLast30d).sort((a, b) => b[1] - a[1]);

  return (
    <div className="studio-page studio-overview-page">

      {/* ── Studio Premium Hero Command Banner ────────────────────────── */}
      <PageHeader crumbs={['Studio', 'Overview']} titlePlain="Studio" titleEm="overview" subtitle="Monitor workflows and recent activity across your workspace." actions={<Button size="lg" onClick={() => navigate('/studio/new')}>New workflow</Button>} />
      <div className="workflow-toolbar">
        <SingleSelectFilter label="App" value={appFilter === 'all' ? null : appFilter} onChange={v => setAppFilter(v ?? 'all')} options={filteredApps.slice((currentAppPage - 1) * 5, currentAppPage * 5).map(a => ({value:a.app,label:a.name}))} />
        <SingleSelectFilter label="Run status" value={runFilter === 'all' ? null : runFilter} onChange={v => setRunFilter(v ?? 'all')} options={Object.keys(VARIANT).map(v => ({value:v,label:v.charAt(0) + v.slice(1).toLowerCase()}))} />
        <SingleSelectFilter label="Duration" value={duration === 'all' ? null : duration} onChange={v => setDuration(v ?? 'all')} options={[{value:'fast',label:'Under 1 second'},{value:'slow',label:'1 second or more'}]} />
        <div className="workflow-search"><SearchToolbar search={search} onSearch={setSearch} placeholder="Search recent runs…" /></div>
      </div>
      {/* ── 4 KPI Stat Metric Cards Row ───────────────────────────────── */}
      <div className="studio-overview-metrics">

        {/* Workflows Total Card */}
        <div className="studio-card-interactive" style={{
          background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)',
          padding: 'var(--card-padding)', boxShadow: 'var(--elev-sm)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Workflows</span>
            <FeaturedIcon variant="brand" size="sm"><Icon name="gitBranch" size={15} /></FeaturedIcon>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {stats.workflows.total}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, color: 'var(--teal)' }}>{stats.workflows.active} active</span>
            <span>•</span>
            <span>{stats.workflows.draft} draft</span>
          </div>

        </div>

        {/* Active Automations Card */}
        <div className="studio-card-interactive" style={{
          background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)',
          padding: 'var(--card-padding)', boxShadow: 'var(--elev-sm)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Engines</span>
            <FeaturedIcon variant="success" size="sm"><Icon name="play" size={15} /></FeaturedIcon>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--green)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {stats.workflows.active}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8 }}>
            {stats.workflows.active === 0 ? 'Nothing running yet' : 'Reacting to live system events'}
          </div>
        </div>

        {/* Total Runs Card */}
        <div className="studio-card-interactive" style={{
          background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)',
          padding: 'var(--card-padding)', boxShadow: 'var(--elev-sm)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Executions</span>
            <FeaturedIcon variant="info" size="sm"><Icon name="clock" size={15} /></FeaturedIcon>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {stats.runs.total}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--blue)' }}>{stats.runs.last30d}</span> in the last 30 days
          </div>
        </div>

        {/* Building Blocks / Unrunnable Status */}
        <div className="studio-card-interactive" style={{
          background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)',
          padding: 'var(--card-padding)', boxShadow: 'var(--elev-sm)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Catalog Blocks</span>
            <FeaturedIcon variant="gray" size="sm"><Icon name="layers" size={15} /></FeaturedIcon>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--purple)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {stats.catalogue.triggers + stats.catalogue.actions}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{stats.catalogue.triggers} Triggers</span>
            <span>•</span>
            <span>{stats.catalogue.actions} Actions</span>
          </div>
        </div>

      </div>

      {/* ── Active Draft Mode Warning Banner ──────────────────────────── */}
      {stats.workflows.active === 0 && stats.workflows.total > 0 && (
        <div style={{
          padding: '14px 18px', borderRadius: 'var(--r)', background: 'var(--blue-l)', border: '1px solid var(--blue)',
          fontSize: 13, color: 'var(--ink2)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: 'var(--elev-sm)'
        }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="info" size={16} color="var(--blue)" />
          </div>
          <div style={{ flex: 1, lineHeight: 1.45 }}>
            <strong>No workflow is active yet.</strong> Workflows that replace built-in behavior stay in <strong>Draft</strong> state on purpose — existing fallback logic keeps running until you toggle one to active.
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => navigate('/studio/workflows')}>
            Manage Workflows →
          </Button>
        </div>
      )}

      {/* ── Main Studio Grid ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 'var(--space-lg)', alignItems: 'start' }} className="studio-dash-grid">

        {/* ── LEFT COLUMN: Recent Execution Runs ─────────────────────── */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', background: 'var(--white)', overflow: 'hidden', boxShadow: 'var(--elev-sm)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="clock" size={17} color="var(--teal)" />
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Recent Execution Runs</span>
            </div>

            {/* Filter buttons */}
            <div style={{ display: 'flex', alignItems: 'center' }}>


              <button
                type="button"
                onClick={() => navigate('/studio/runs')}
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}
              >
                View all <Icon name="arrowRight" size={13} />
              </button>
            </div>
          </div>

          <p style={{padding:'0 20px',color:'var(--ink3)',fontSize:13}}>Latest 16 runs. App filter applies to the app list; status, duration and search apply to recent runs.</p>
          {/* Runs List */}
          <div>
            {filteredRuns.length === 0 ? (
              <div style={{ padding: 36, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                Nothing has run under this filter. Open a workflow and use <strong>Dry run</strong> to test one safely.
              </div>
            ) : (
              shownRuns.map((r, idx) => (
                <div
                  key={r.id}
                  className="studio-dashboard-row"
                  onClick={() => navigate(`/studio/w/${r.workflow_id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
                    borderBottom: idx < shownRuns.length - 1 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  <Badge variant={VARIANT[r.status] ?? 'gray'} style={{ minWidth: 76, textAlign: 'center' }}>
                    {r.status}
                  </Badge>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.workflow_name ?? 'Deleted workflow'}
                    </div>
                    <div style={{ fontSize: 11.5, fontFamily: 'var(--font)', color: 'var(--ink3)', marginTop: 2 }}>
                      Trigger: {r.trigger_source}
                    </div>
                    {r.error_message && (
                      <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 2, fontWeight: 600 }}>
                        {r.error_message}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11.5, fontFamily: 'var(--font)', fontWeight: 700, color: 'var(--ink)' }}>
                      {r.duration_ms}ms
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                      {new Date(r.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {filteredRuns.length > 0 && pager(currentRunPage, runPages, setRunPage)}
        </div>

        {/* ── RIGHT COLUMN: Outcomes, App Distribution & Clearance ───── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* 1. Run Outcomes Distribution */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', background: 'var(--white)', overflow: 'hidden', boxShadow: 'var(--elev-sm)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="barChart2" size={16} color="var(--purple)" />
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Outcomes • Last 30 Days</span>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {statuses.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', padding: '12px 0' }}>No execution runs recorded in this period.</div>
              ) : (
                statuses.map(([status, n]) => {
                  const pct = Math.round((n / stats.runs.last30d) * 100);
                  const barColor = status === 'FAILED' ? 'var(--red)' : status === 'SIMULATED' ? 'var(--blue)' : status === 'PARTIAL' ? 'var(--gold)' : 'var(--green)';
                  return (
                    <div key={status} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginBottom: 5 }}>
                        <Badge variant={VARIANT[status] ?? 'gray'}>{status}</Badge>
                        <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{n} runs <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>({pct}%)</span></span>
                      </div>
                      <div style={{ height: 7, borderRadius: 'var(--r-sm)', background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 'var(--r-sm)', background: barColor, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 2. Automations By App */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', background: 'var(--white)', overflow: 'hidden', boxShadow: 'var(--elev-sm)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="grid" size={16} color="var(--blue)" />
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Automations By Workspace App</span>
            </div>
            <div style={{ padding: '12px 14px' }}>
              {filteredApps.slice((currentAppPage - 1) * 5, currentAppPage * 5).map(a => (
                <div
                  key={a.app}
                  className="studio-dashboard-row"
                  onClick={() => navigate(a.app === '__unregistered__' ? '/studio/workflows' : `/studio/workflows?app=${a.app}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--r)',
                    fontSize: 13, cursor: 'pointer'
                  }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{a.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink3)' }}>{a.workflows}</span>
                  <Icon name="chevronRight" size={14} color="var(--ink3)" />
                </div>
              ))}
            </div>
          </div>

          {filteredApps.length > 0 && pager(currentAppPage, appPages, setAppPage)}

          {/* 3. Clearance Stage Workflows */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', background: 'var(--white)', overflow: 'hidden', boxShadow: 'var(--elev-sm)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="layers" size={16} color="var(--teal)" />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Clearance Stage Workflows</span>
              </div>
            </div>
            <div style={{ padding: '14px 18px', fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5 }}>
              Defines the shipment clearance stages and step release criteria. Live consignments advance through these flows.
            </div>
            <div style={{ padding: '0 12px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                onClick={() => navigate('/studio/clearance')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--r)',
                  fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', background: 'var(--bg)'
                }}
              >
                <Icon name="layers" size={15} color="var(--teal)" />
                <span>All Clearance Workflows</span>
                <Icon name="arrowRight" size={14} color="var(--ink3)" style={{ marginLeft: 'auto' }} />
              </div>

              <div
                onClick={() => navigate('/studio/clearance/new')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--r)',
                  fontSize: 13, fontWeight: 600, color: 'var(--teal)', cursor: 'pointer', background: 'var(--teal-l)'
                }}
              >
                <Icon name="plus" size={15} color="var(--teal)" />
                <span>Design New Clearance Flow</span>
                <Icon name="arrowRight" size={14} color="var(--teal)" style={{ marginLeft: 'auto' }} />
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
