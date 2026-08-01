import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './studio.css';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';

interface Stats {
  workflows: { total: number; active: number; draft: number; paused: number; unrunnable: number };
  runs: { total: number; last30d: number; byStatus: Record<string, number>; byStatusLast30d: Record<string, number> };
  byApp: { app: string; name: string; color: string; workflows: number }[];
  catalogue: { triggers: number; actions: number; templates: number };
}
interface RunRow {
  id: string; workflow_id: string; workflow_name: string | null; status: string;
  trigger_source: string; duration_ms: number; error_message: string | null;
  domain_event_id: string | null; created_at: string;
}

const VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  SUCCESS: 'success', SIMULATED: 'info', PARTIAL: 'warning', FAILED: 'error', RUNNING: 'gray',
};

/**
 * Studio's overview.
 *
 * Every number is counted from this tenant's rows by GET /stats. There is no
 * success-rate percentage, no throughput sparkline and no "vs last week" delta,
 * because nothing in this platform computes them — and a plausible-looking
 * figure on an automation console is one somebody acts on.
 */
export function StudioDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, r] = await Promise.all([
          apiFetch('/v1/workflow-studio/stats'),
          apiFetch('/v1/workflow-studio/runs?limit=12'),
        ]);
        if (!alive) return;
        setStats(s.data); setRuns(r.data ?? []);
      } catch (e: any) { if (alive) setError(e?.message ?? 'Could not load Studio stats.'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <div style={{ padding: 30, color: 'var(--ink3)' }}>Loading…</div>;
  if (error) return <div style={{ padding: 30, color: 'var(--red)' }}>{error}</div>;
  if (!stats) return null;

  const tile = (label: string, value: number | string, tone: 'brand' | 'success' | 'gray' | 'error' | 'info', icon: string, hint?: string) => (
    <div className="studio-tile">
      <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
        <FeaturedIcon variant={tone} size="sm"><Icon name={icon as any} size={15} /></FeaturedIcon>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{label}</div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', marginTop: 9 }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{hint}</div>}
    </div>
  );

  const statuses = Object.entries(stats.runs.byStatusLast30d).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ padding: '20px 22px', maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)' }}>Studio</div>
        <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 3 }}>
          One place for every automation on the platform — what fires it, what it does, and what really happened.
        </div>
      </div>

      <div className="studio-tiles">
        {tile('Workflows', stats.workflows.total, 'brand', 'zap', `${stats.workflows.draft} draft`)}
        {tile('Active', stats.workflows.active, 'success', 'play', stats.workflows.active === 0 ? 'nothing running yet' : 'reacting to events')}
        {tile('Runs recorded', stats.runs.total, 'info', 'clock', `${stats.runs.last30d} in the last 30 days`)}
        {tile('Cannot run', stats.workflows.unrunnable, stats.workflows.unrunnable > 0 ? 'error' : 'gray', 'alertCircle', 'trigger not registered')}
      </div>

      {stats.workflows.active === 0 && stats.workflows.total > 0 && (
        <div style={{ padding: '11px 14px', borderRadius: 10, background: 'var(--blue-l)', border: '1px solid var(--blue-l)', fontSize: 12.5, color: 'var(--ink2)', marginBottom: 16, display: 'flex', gap: 9 }}>
          <Icon name="info" size={15} color="var(--blue)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            No workflow is active. The ones that replace built-in behaviour stay in <strong>Draft</strong> on purpose — the existing code keeps doing the work
            until you switch one on, and then exactly one of the two runs.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 14, alignItems: 'start' }} className="studio-dash-grid">
        {/* Recent runs */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card-bg, var(--white))', overflow: 'hidden' }}>
          <div className="studio-panel-head">
            <span className="studio-panel-title">Recent runs</span>
            <button type="button" className="studio-icon-btn" onClick={() => navigate('/studio/runs')}>View all <Icon name="arrowRight" size={12} /></button>
          </div>
          {runs.length === 0 ? (
            <div style={{ padding: 26, textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>
              Nothing has run yet. Open a workflow and use <strong>Dry run</strong> to try one safely.
            </div>
          ) : runs.map(r => (
            <div key={r.id} className="studio-step" style={{ gridTemplateColumns: '92px 1fr auto', cursor: 'pointer' }}
                 onClick={() => navigate(`/studio/w/${r.workflow_id}`)}>
              <Badge variant={VARIANT[r.status] ?? 'gray'}>{r.status}</Badge>
              <span>
                <span style={{ color: 'var(--ink)' }}>{r.workflow_name ?? 'Deleted workflow'}</span>
                <span className="studio-run-mono" style={{ display: 'block', marginTop: 2 }}>{r.trigger_source}</span>
                {r.error_message && <span style={{ display: 'block', color: 'var(--red)', fontSize: 11.5, marginTop: 2 }}>{r.error_message}</span>}
              </span>
              <span className="studio-run-mono">{r.duration_ms}ms · {new Date(r.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Run outcomes */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card-bg, var(--white))' }}>
            <div className="studio-panel-head"><span className="studio-panel-title">Outcomes · last 30 days</span></div>
            <div style={{ padding: 14 }}>
              {statuses.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No runs in this period.</div>
              ) : statuses.map(([status, n]) => {
                const pct = Math.round((n / stats.runs.last30d) * 100);
                return (
                  <div key={status} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <Badge variant={VARIANT[status] ?? 'gray'}>{status}</Badge>
                      <span style={{ color: 'var(--ink2)' }}>{n} · {pct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: 'var(--border)' }}>
                      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: status === 'FAILED' ? 'var(--red)' : status === 'SIMULATED' ? 'var(--blue)' : status === 'PARTIAL' ? 'var(--gold)' : 'var(--green)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per app */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card-bg, var(--white))' }}>
            <div className="studio-panel-head"><span className="studio-panel-title">By app</span></div>
            <div style={{ padding: 8 }}>
              {stats.byApp.map(a => (
                <div key={a.app} className="studio-run-row"
                     onClick={() => navigate(a.app === '__unregistered__' ? '/studio/workflows' : `/studio/workflows?app=${a.app}`)}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: a.color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--ink)' }}>{a.name}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--ink3)' }}>{a.workflows}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Catalogue */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card-bg, var(--white))' }}>
            <div className="studio-panel-head"><span className="studio-panel-title">Building blocks</span></div>
            <div style={{ padding: 8 }}>
              <div className="studio-run-row" onClick={() => navigate('/studio/catalog')}>
                <Icon name="zap" size={14} color="var(--green)" /><span>Triggers</span>
                <span style={{ marginLeft: 'auto', color: 'var(--ink3)' }}>{stats.catalogue.triggers}</span>
              </div>
              <div className="studio-run-row" onClick={() => navigate('/studio/catalog')}>
                <Icon name="play" size={14} color="var(--teal)" /><span>Actions</span>
                <span style={{ marginLeft: 'auto', color: 'var(--ink3)' }}>{stats.catalogue.actions}</span>
              </div>
              <div className="studio-run-row" onClick={() => navigate('/studio/templates')}>
                <Icon name="copy" size={14} color="var(--purple)" /><span>Templates</span>
                <span style={{ marginLeft: 'auto', color: 'var(--ink3)' }}>{stats.catalogue.templates}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
