import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Icon } from '../../components/Icon.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { ListPagination, paginate } from '../../components/ui/list-pagination.js';
import { money, useProjectRows } from './projectData.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';

interface Props {
  onNewProject?: () => void;
  onSelectProject?: (id: string) => void;
  currency?: string;
  projectId?: string;
}

export const ProjectBudgetTracking: React.FC<Props> = ({
  onNewProject,
  onSelectProject,
  projectId,
}) => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { rows, loading, error, load } = useProjectRows();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [budgetPage, setBudgetPage] = useState(1);
  const [budgetPageSize, setBudgetPageSize] = useState(25);

  // Reset to first page when filters change
  React.useEffect(() => { setBudgetPage(1); }, [search, statusFilter]);

  const projects = useMemo(() => {
    return rows.filter(row => {
      if (projectId && row.id !== projectId) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return row.name.toLowerCase().includes(q) || (row.ref && row.ref.toLowerCase().includes(q));
      }
      return true;
    });
  }, [rows, projectId, statusFilter, search]);

  // Aggregate totals grouped by currency (or primary currency)
  const primaryCurrency = projects[0]?.currency || 'TZS';
  const totalBudget = projects.reduce((s, p) => s + (Number(p.current_budget || p.baseline_budget) || 0), 0);
  const totalActual = projects.reduce((s, p) => s + (Number(p.actual_cost) || 0), 0);
  const remaining = totalBudget - totalActual;
  const burnRate = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0;
  const overBudgetCount = projects.filter(p => Number(p.actual_cost || 0) > Number(p.current_budget || p.baseline_budget || 0)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error} <Button variant="outline" size="sm" onClick={load} style={{ marginLeft: 8 }}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Financial Overview KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Authorized Budget', value: money(totalBudget, primaryCurrency), icon: 'dollarSign' as const, variant: 'brand' as const },
          { label: 'Recorded Actuals', value: money(totalActual, primaryCurrency), icon: 'creditCard' as const, variant: 'brand' as const },
          { label: 'Available Capital', value: money(remaining, primaryCurrency), icon: 'trendingUp' as const, variant: remaining < 0 ? 'error' as const : 'success' as const },
          { label: 'Portfolio Burn Rate', value: `${burnRate}%`, subtext: `${overBudgetCount} over-budget`, icon: 'activity' as const, variant: burnRate > 90 ? 'warning' as const : 'brand' as const },
        ].map(kpi => (
          <div
            key={kpi.label}
            style={{
              background: 'var(--white)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)',
              padding: 16,
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <FeaturedIcon variant={kpi.variant} size="sm">
                <Icon name={kpi.icon} size={13} />
              </FeaturedIcon>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {kpi.label}
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>
              {kpi.value}
            </div>
            {kpi.subtext && (
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
                {kpi.subtext}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Filter and Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs" style={{ width: 140 }}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="in_progress">Active</SelectItem>
              <SelectItem value="not_started">Planning</SelectItem>
              <SelectItem value="finished">Finished</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
            </SelectContent>
          </Select>
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
            {projects.length} project {projects.length === 1 ? 'budget' : 'budgets'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SearchToolbar search={search} onSearch={setSearch} placeholder="Search project budgets…" />
          <Button onClick={onNewProject ?? (() => navigate('/projects/new'))} size="sm">
            <Icon name="plus" size={13} style={{ marginRight: 6 }} /> New Project
          </Button>
        </div>
      </div>

      {/* Main Budget Data Table */}
      {loading ? (
        <SectionLoading />
      ) : projects.length === 0 ? (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 48, textAlign: 'center' }}>
          <FeaturedIcon variant="brand" size="lg" style={{ margin: '0 auto 12px' }}>
            <Icon name="dollarSign" size={24} />
          </FeaturedIcon>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>No Project Budgets Found</h3>
          <p style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 400, margin: '0 auto 16px' }}>
            No project budgets match your current filter. Create a new project to establish budget allocations.
          </p>
          <Button onClick={onNewProject ?? (() => navigate('/projects/new'))}>Create Project</Button>
        </div>
      ) : (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', overflowX: 'auto', boxShadow: 'var(--card-shadow)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
                {['Project', 'Baseline', 'Authorized Budget', 'Actual Spend', 'Remaining Balance', 'Utilization', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginate(projects, budgetPage, budgetPageSize).visible.map(project => {
                const curBudget = Number(project.current_budget || project.baseline_budget || 0);
                const actual = Number(project.actual_cost || 0);
                const rem = curBudget - actual;
                const utilPct = curBudget > 0 ? Math.round((actual / curBudget) * 100) : 0;
                const isOver = actual > curBudget && curBudget > 0;
                const curr = project.currency || 'TZS';

                return (
                  <tr
                    key={project.id}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {/* Project Identity */}
                    <td style={{ padding: '12px 14px' }}>
                      <div
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                        onClick={() => onSelectProject ? onSelectProject(project.id) : navigate(`/projects/${project.id}`)}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: project.color || 'var(--teal)', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{project.name}</div>
                          {project.ref && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{project.ref}</div>}
                        </div>
                      </div>
                    </td>

                    {/* Baseline */}
                    <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink2)' }}>
                      {money(project.baseline_budget, curr)}
                    </td>

                    {/* Current Authorized Budget */}
                    <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                      {money(curBudget, curr)}
                    </td>

                    {/* Actual Cost */}
                    <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, color: isOver ? 'var(--red)' : 'var(--ink)' }}>
                      {money(actual, curr)}
                    </td>

                    {/* Remaining */}
                    <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: rem < 0 ? 'var(--red)' : 'var(--green)' }}>
                      {money(rem, curr)}
                    </td>

                    {/* Utilization Progress Bar */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 70, height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, utilPct)}%`,
                              height: '100%',
                              borderRadius: 3,
                              background: isOver ? 'var(--red)' : utilPct > 80 ? 'var(--gold)' : 'var(--teal)',
                              transition: 'width 0.3s',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isOver ? 'var(--red)' : 'var(--ink)' }}>
                          {utilPct}%
                        </span>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td style={{ padding: '12px 14px' }}>
                      <Badge variant={isOver ? 'error' : project.status === 'finished' ? 'success' : 'gray'}>
                        {isOver ? 'Over Budget' : (project.status || 'Active').replaceAll('_', ' ')}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 14px' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ height: 28, fontSize: 11, padding: '0 8px' }}
                        onClick={() => navigate(`/projects/${project.id}/financials_evm`)}
                      >
                        <Icon name="trendingUp" size={12} style={{ marginRight: 4 }} /> EVM Detail
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!loading && projects.length > 0 && (
        <ListPagination total={projects.length} page={budgetPage} pageSize={budgetPageSize} onPageChange={setBudgetPage} onPageSizeChange={setBudgetPageSize} noun="budgets" />
      )}
    </div>
  );
};
