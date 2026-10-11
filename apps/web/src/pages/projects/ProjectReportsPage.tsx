import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { PageHeader } from '../../components/PageHeader.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { healthOf } from './projectData.js';
import { apiFetch } from '../../lib/api.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { ListPagination, paginate } from '../../components/ui/list-pagination.js';

interface ProjectStat {
  id: string;
  name: string;
  color: string;
  status: string;
  health_status?: string;
  progress_pct?: number;
  task_count: number;
  task_done_count: number;
  baseline_budget?: number;
  actual_cost?: number;
  currency: string;
  start_date: string | null;
  target_date: string | null;
}

export const ProjectReportsPage: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [budgetPage, setBudgetPage] = useState(1);
  const [budgetPageSize, setBudgetPageSize] = useState(25);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    apiFetch('/v1/tasks/projects')
      .then(res => {
        setProjects(
          (Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : [])).map((row: any) => ({
            ...row,
            health_status: healthOf(row.health_status),
          }))
        );
      })
      .catch((err: any) => setLoadError(err.message || 'Unable to load projects'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = projects.filter(p => p.status === 'in_progress');
  const atRisk = projects.filter(p => p.health_status === 'at_risk' || p.health_status === 'critical');
  const completed = projects.filter(p => p.status === 'finished');
  const totalTasks = projects.reduce((s, p) => s + (p.task_count || 0), 0);
  const doneTasks = projects.reduce((s, p) => s + (p.task_done_count || 0), 0);

  const statusDist = useMemo(() => {
    const map: Record<string, number> = {};
    projects.forEach(p => { map[p.status] = (map[p.status] || 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({ status, count }));
  }, [projects]);

  const healthDist = useMemo(() => {
    const map: Record<string, number> = {};
    projects.forEach(p => {
      const h = p.health_status || 'on_track';
      map[h] = (map[h] || 0) + 1;
    });
    return Object.entries(map).map(([health, count]) => ({ health, count }));
  }, [projects]);

  const HEALTH_COLOR: Record<string, string> = {
    on_track: 'var(--green)',
    at_risk: 'var(--gold)',
    critical: 'var(--red)',
    completed: 'var(--teal)',
  };
  const HEALTH_LABEL: Record<string, string> = {
    on_track: 'On Track',
    at_risk: 'At Risk',
    critical: 'Critical',
    completed: 'Completed',
  };
  const STATUS_LABEL: Record<string, string> = {
    in_progress: 'Active Delivery',
    not_started: 'Planning',
    finished: 'Completed',
    on_hold: 'On Hold',
    cancelled: 'Cancelled',
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      {loadError && (
        <Alert variant="destructive" style={{ marginBottom: 16 }}>
          <AlertDescription>
            {loadError} <Button variant="outline" size="sm" onClick={load} style={{ marginLeft: 8 }}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      <PageHeader
        crumbs={['Projects', 'Controls']}
        titlePlain="Project"
        titleEm="reports"
        subtitle="Portfolio-level analytics — health breakdown, budget utilization, task throughput, and delivery schedules."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Icon name="printer" size={13} style={{ marginRight: 6 }} /> Print Report
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/budgets')}>
              <Icon name="dollarSign" size={13} style={{ marginRight: 6 }} /> Budgets
            </Button>
          </div>
        }
      />

      <div style={{ marginTop: 20 }}>
        {loading ? (
          <SectionLoading />
        ) : (
          <>
            {/* KPI Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { label: 'Total Projects', value: projects.length, icon: 'briefcase' as const },
                { label: 'Active Delivery', value: active.length, icon: 'trendingUp' as const },
                { label: 'At Risk / Critical', value: atRisk.length, icon: 'alertTriangle' as const, highlight: atRisk.length > 0 },
                { label: 'Completed', value: completed.length, icon: 'checkCircle' as const },
                { label: 'Tasks Done', value: `${doneTasks}/${totalTasks}`, icon: 'checkCircle' as const },
              ].map(k => (
                <div
                  key={k.label}
                  style={{
                    background: 'var(--white)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-lg)',
                    padding: 16,
                    boxShadow: 'var(--card-shadow)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <FeaturedIcon variant={k.highlight ? 'error' : 'brand'} size="sm">
                      <Icon name={k.icon} size={13} />
                    </FeaturedIcon>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {k.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: k.highlight ? 'var(--red)' : 'var(--ink)' }}>
                    {k.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Distribution Charts */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, marginBottom: 24 }}>
              {/* Health Distribution */}
              <SectionCard title="Health Distribution">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
                  {healthDist.map(h => {
                    const pct = projects.length > 0 ? Math.round((h.count / projects.length) * 100) : 0;
                    return (
                      <div key={h.health}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
                          <span style={{ color: 'var(--ink)' }}>{HEALTH_LABEL[h.health] || h.health}</span>
                          <span style={{ color: 'var(--ink3)' }}>{h.count} projects ({pct}%)</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              borderRadius: 4,
                              background: HEALTH_COLOR[h.health] || 'var(--teal)',
                              transition: 'width 0.3s',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              {/* Status Distribution */}
              <SectionCard title="Lifecycle Status Distribution">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
                  {statusDist.map(s => {
                    const pct = projects.length > 0 ? Math.round((s.count / projects.length) * 100) : 0;
                    return (
                      <div key={s.status}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
                          <span style={{ color: 'var(--ink)' }}>{STATUS_LABEL[s.status] || s.status}</span>
                          <span style={{ color: 'var(--ink3)' }}>{s.count} ({pct}%)</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              borderRadius: 4,
                              background: 'var(--teal)',
                              transition: 'width 0.3s',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            </div>

            {/* Budget vs Actual Spend Table */}
            <SectionCard
              title="Budget vs Actual Spend"
              action={
                <Link to="/projects/budgets" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>
                  View All Budgets →
                </Link>
              }
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      {['Project', 'Baseline Budget', 'Recorded Spend', 'Remaining Balance', 'Utilization'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginate(projects.filter(p => p.baseline_budget && p.baseline_budget > 0), budgetPage, budgetPageSize).visible.map(p => {
                      const spent = p.actual_cost || 0;
                      const remaining = (p.baseline_budget || 0) - spent;
                      const pct = Math.round((spent / (p.baseline_budget || 1)) * 100);
                      const over = pct > 90;
                      return (
                        <tr
                          key={p.id}
                          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                          onClick={() => navigate(`/projects/${p.id}`)}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}
                        >
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || 'var(--teal)', flexShrink: 0 }} />
                              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{p.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 12 }}>
                            {p.currency} {(p.baseline_budget || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600 }}>
                            {p.currency} {spent.toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: remaining < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                            {p.currency} {remaining.toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 70, height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${Math.min(100, pct)}%`,
                                    height: '100%',
                                    borderRadius: 3,
                                    background: over ? 'var(--red)' : 'var(--teal)',
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: over ? 'var(--red)' : 'var(--ink)' }}>
                                {pct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {projects.filter(p => p.baseline_budget && p.baseline_budget > 0).length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                          No projects with recorded budget baselines.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <ListPagination total={projects.filter(p => p.baseline_budget && p.baseline_budget > 0).length} page={budgetPage} pageSize={budgetPageSize} onPageChange={setBudgetPage} onPageSizeChange={setBudgetPageSize} noun="budgets" />
            </SectionCard>

            {/* Quick links footer */}
            <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
              <Button variant="outline" size="sm" onClick={() => navigate('/projects/risks')}>
                <Icon name="shield" size={13} style={{ marginRight: 6 }} /> Risk Register
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/projects/approvals')}>
                <Icon name="clipboardList" size={13} style={{ marginRight: 6 }} /> Approvals
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/projects/procurement')}>
                <Icon name="shoppingCart" size={13} style={{ marginRight: 6 }} /> Procurement
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/finance')}>
                <Icon name="dollarSign" size={13} style={{ marginRight: 6 }} /> Finance App
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
