import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './studio.css';
import { apiFetch } from '../../lib/api.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Button } from '../../components/ui/button.js';

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
  const [runFilter, setRunFilter] = useState<'all' | 'SUCCESS' | 'SIMULATED' | 'FAILED'>('all');

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
    if (runFilter === 'all') return runs;
    return runs.filter(r => r.status === runFilter);
  }, [runs, runFilter]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', fontSize: 14 }}>
        <div style={{ display: 'inline-block', marginBottom: 12 }}>
          <Icon name="sparkle" size={24} style={{ animation: 'ds-spin 2s linear infinite', color: 'var(--teal)' }} />
        </div>
        <div>Loading Workflow Studio Dashboard…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 30, color: 'var(--red)', background: 'rgba(239,68,68,0.08)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Failed to load Studio</div>
        <div style={{ fontSize: 13 }}>{error}</div>
      </div>
    );
  }

  if (!stats) return null;

  const statuses = Object.entries(stats.runs.byStatusLast30d).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', paddingBottom: 32 }}>

      {/* ── Studio Premium Hero Command Banner ────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0e1f3d 0%, #1e1b4b 45%, #0d7a6b 100%)',
        borderRadius: 16,
        padding: '28px 32px',
        color: '#ffffff',
        marginBottom: 24,
        boxShadow: '0 10px 30px rgba(14,31,61,0.2)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle decorative glass background circles */}
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 260, height: 260,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)', pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute', bottom: -50, left: '30%', width: 200, height: 200,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(13,122,107,0.2) 0%, transparent 70%)', pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20, position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: 680 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
              }}>
                <Icon name="sparkle" size={18} color="#ffffff" />
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                Workflow Studio Engine
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff' }}>
              Automation &amp; Event Command Center
            </h1>
            <p style={{ margin: '6px 0 0 0', fontSize: 13.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
              One central canvas for every automation across your workspace — configure triggers, multi-step actions, and live execution monitors.
            </p>
          </div>

          {/* Header Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate('/studio/catalog')}
              style={{
                background: 'rgba(255,255,255,0.12)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)',
                backdropFilter: 'blur(4px)', fontWeight: 600
              }}
            >
              <Icon name="layers" size={14} /> Browse Catalog
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate('/studio/templates')}
              style={{
                background: 'rgba(255,255,255,0.12)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)',
                backdropFilter: 'blur(4px)', fontWeight: 600
              }}
            >
              <Icon name="copy" size={14} /> Templates ({stats.catalogue.templates})
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => navigate('/studio/new')}
              style={{
                background: '#ffffff', color: 'var(--navy)', border: 'none',
                fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }}
            >
              <Icon name="plus" size={14} /> + Create Automation
            </Button>
          </div>
        </div>
      </div>

      {/* ── 4 KPI Stat Metric Cards Row ───────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        
        {/* Workflows Total Card */}
        <div className="studio-card-interactive" style={{
          background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14,
          padding: '20px 22px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
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
          background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14,
          padding: '20px 22px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
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
          background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14,
          padding: '20px 22px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
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
          background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14,
          padding: '20px 22px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
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
          padding: '14px 18px', borderRadius: 12, background: 'var(--blue-l)', border: '1px solid var(--blue-m)',
          fontSize: 13, color: 'var(--ink2)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 2px 6px rgba(37,99,235,0.05)'
        }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(37,99,235,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }} className="studio-dash-grid">
        
        {/* ── LEFT COLUMN: Recent Execution Runs ─────────────────────── */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--white)', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="clock" size={17} color="var(--teal)" />
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>Recent Execution Runs</span>
            </div>

            {/* Filter buttons */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Tabs value={runFilter} onValueChange={v => setRunFilter(v as typeof runFilter)} variant="segmented">
                <TabsList>
                  {(['all', 'SUCCESS', 'SIMULATED', 'FAILED'] as const).map(st => (
                    <TabsTrigger
                      key={st}
                      value={st}
                    >
                      {st === 'all' ? 'All' : st}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <button
                type="button"
                onClick={() => navigate('/studio/runs')}
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}
              >
                View all <Icon name="arrowRight" size={13} />
              </button>
            </div>
          </div>

          {/* Runs List */}
          <div>
            {filteredRuns.length === 0 ? (
              <div style={{ padding: 36, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                Nothing has run under this filter. Open a workflow and use <strong>Dry run</strong> to test one safely.
              </div>
            ) : (
              filteredRuns.map((r, idx) => (
                <div
                  key={r.id}
                  onClick={() => navigate(`/studio/w/${r.workflow_id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
                    borderBottom: idx < filteredRuns.length - 1 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer', transition: 'background 0.12s ease'
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <Badge variant={VARIANT[r.status] ?? 'gray'} style={{ minWidth: 76, textAlign: 'center' }}>
                    {r.status}
                  </Badge>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.workflow_name ?? 'Deleted workflow'}
                    </div>
                    <div style={{ fontSize: 11.5, fontFamily: 'var(--mono)', color: 'var(--ink3)', marginTop: 2 }}>
                      Trigger: {r.trigger_source}
                    </div>
                    {r.error_message && (
                      <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 2, fontWeight: 600 }}>
                        {r.error_message}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11.5, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>
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
        </div>

        {/* ── RIGHT COLUMN: Outcomes, App Distribution & Clearance ───── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* 1. Run Outcomes Distribution */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--white)', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="barChart2" size={16} color="var(--purple)" />
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>Outcomes • Last 30 Days</span>
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
                      <div style={{ height: 7, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: barColor, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 2. Automations By App */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--white)', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="grid" size={16} color="var(--blue)" />
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>Automations By Workspace App</span>
            </div>
            <div style={{ padding: '12px 14px' }}>
              {stats.byApp.map(a => (
                <div
                  key={a.app}
                  onClick={() => navigate(a.app === '__unregistered__' ? '/studio/workflows' : `/studio/workflows?app=${a.app}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                    fontSize: 13, cursor: 'pointer', transition: 'background 0.12s'
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{a.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink3)' }}>{a.workflows}</span>
                  <Icon name="chevronRight" size={14} color="var(--ink3)" />
                </div>
              ))}
            </div>
          </div>

          {/* 3. Clearance Stage Workflows */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--white)', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="layers" size={16} color="var(--teal)" />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>Clearance Stage Workflows</span>
              </div>
            </div>
            <div style={{ padding: '14px 18px', fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5 }}>
              Defines the shipment clearance stages and step release criteria. Live consignments advance through these flows.
            </div>
            <div style={{ padding: '0 12px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                onClick={() => navigate('/studio/clearance')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
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
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
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
