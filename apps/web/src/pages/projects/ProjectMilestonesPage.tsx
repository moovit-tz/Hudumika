import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { PageHeader } from '../../components/PageHeader.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { ListPagination, paginate, useListPagination } from '../../components/ui/list-pagination.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { apiFetch } from '../../lib/api.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';

interface Milestone {
  id: string;
  project_id: string;
  project_name: string;
  project_color: string;
  name: string;
  description?: string | null;
  target_date: string | null;
  actual_date?: string | null;
  status: string;
  owner_name?: string | null;
  owner_id?: string;
  weight?: number;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'gray' | 'brand' | 'warning' | 'success' | 'error' }> = {
  not_started: { label: 'Upcoming', variant: 'gray' },
  in_progress: { label: 'In Progress', variant: 'brand' },
  at_risk: { label: 'At Risk', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  missed: { label: 'Missed', variant: 'error' },
};

export const ProjectMilestonesPage: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [msPage, setMsPage] = useState(1);
  const [msPageSize, setMsPageSize] = useState(25);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch('/v1/tasks/projects');
      const projects = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
      const all: Milestone[] = [];
      await Promise.all(
        projects.map(async (p: any) => {
          try {
            const phases = await apiFetch(`/v1/tasks/projects/${p.id}/milestones`);
            const list = Array.isArray(phases) ? phases : (phases?.data || []);
            list.forEach((ph: any) => {
              if (ph.id) {
                all.push({
                  id: ph.id,
                  project_id: p.id,
                  project_name: p.name,
                  project_color: p.color || 'var(--teal)',
                  name: ph.name,
                  description: ph.description,
                  target_date: ph.due_date || ph.target_date,
                  actual_date: ph.actual_end_date,
                  status: ph.status === 'upcoming' ? 'not_started' : ph.status || 'not_started',
                  owner_name: ph.owner_name || p.owner_name,
                  owner_id: ph.owner_id || p.owner_id,
                  weight: ph.weight,
                });
              }
            });
          } catch {
            // Soft failure for individual project milestone queries
          }
        })
      );
      all.sort((a, b) => {
        const da = a.target_date ? new Date(a.target_date).getTime() : Infinity;
        const db = b.target_date ? new Date(b.target_date).getTime() : Infinity;
        return da - db;
      });
      setMilestones(all);
    } catch (err: any) {
      setLoadError(err.message || 'Unable to load project records');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = milestones;
    if (filter !== 'all') list = list.filter(m => m.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q) || m.project_name.toLowerCase().includes(q));
    }
    return list;
  }, [milestones, filter, search]);

  useEffect(() => { setMsPage(1); }, [filter, search]);

  const upcoming = milestones.filter(m => m.status !== 'completed' && m.target_date && new Date(m.target_date) > new Date());
  const overdue = milestones.filter(m => m.status !== 'completed' && m.target_date && new Date(m.target_date) < new Date());
  const completed = milestones.filter(m => m.status === 'completed');

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
        crumbs={['Projects', 'Planning']}
        titlePlain="Project"
        titleEm="milestones"
        subtitle="Critical delivery gates — schedule gates, target deadlines, and progress checkpoints across all projects."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/timeline')}>
              <Icon name="calendar" size={13} style={{ marginRight: 6 }} /> Timeline Gantt
            </Button>
          </div>
        }
      />

      <div style={{ marginTop: 20 }}>
        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {([
            { label: 'Total Milestones', value: milestones.length, icon: 'flag' as const },
            { label: 'Upcoming', value: upcoming.length, icon: 'clock' as const },
            { label: 'Overdue Gates', value: overdue.length, icon: 'alertTriangle' as const, highlight: overdue.length > 0 },
            { label: 'Completed', value: completed.length, icon: 'checkCircle' as const },
          ]).map(kpi => (
            <div
              key={kpi.label}
              style={{
                background: 'var(--white)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)',
                padding: 14,
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <FeaturedIcon variant={kpi.highlight ? 'error' : 'brand'} size="sm">
                  <Icon name={kpi.icon} size={13} />
                </FeaturedIcon>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {kpi.label}
                </span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: kpi.highlight ? 'var(--red)' : 'var(--ink)' }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList>
                <TabsTrigger value="all">All ({milestones.length})</TabsTrigger>
                <TabsTrigger value="not_started">Upcoming ({upcoming.length})</TabsTrigger>
                <TabsTrigger value="in_progress">In Progress</TabsTrigger>
                <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
              </TabsList>
            </Tabs>

            <Tabs value={view} onValueChange={v => setView(v as typeof view)}>
              <TabsList>
                <TabsTrigger value="cards">
                  <Icon name="grid" size={13} style={{ marginRight: 6 }} /> Cards
                </TabsTrigger>
                <TabsTrigger value="table">
                  <Icon name="list" size={13} style={{ marginRight: 6 }} /> Table
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <SearchToolbar search={search} onSearch={setSearch} placeholder="Search milestones or projects…" />
        </div>

        {loading ? (
          <SectionLoading />
        ) : filtered.length === 0 ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 48, textAlign: 'center' }}>
            <FeaturedIcon variant="brand" size="lg" style={{ margin: '0 auto 12px' }}>
              <Icon name="flag" size={24} />
            </FeaturedIcon>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>No Milestones Found</h3>
            <p style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 420, margin: '0 auto 16px' }}>
              No milestones match the current filter. Milestones are created within each project's phase and schedule breakdown.
            </p>
            <Button variant="outline" onClick={() => navigate('/projects/directory')}>
              View Projects Directory
            </Button>
          </div>
        ) : view === 'cards' ? (
          <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {paginate(filtered, msPage, msPageSize).visible.map(m => {
              const sb = STATUS_BADGE[m.status] || STATUS_BADGE.not_started;
              const isOverdue = m.target_date && m.status !== 'completed' && new Date(m.target_date) < new Date();
              return (
                <div
                  key={m.id}
                  onClick={() => navigate(`/projects/${m.project_id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 16px',
                    background: 'var(--white)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-lg)',
                    cursor: 'pointer',
                    boxShadow: 'var(--card-shadow)',
                    transition: 'box-shadow 0.15s, transform 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.boxShadow = 'var(--elev)';
                    e.currentTarget.style.borderColor = 'var(--teal)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = 'var(--card-shadow)';
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.transform = '';
                  }}
                >
                  <FeaturedIcon variant={isOverdue ? 'error' : m.status === 'completed' ? 'success' : 'brand'} size="md">
                    <Icon name="flag" size={16} />
                  </FeaturedIcon>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                      {m.name}
                    </div>
                    {m.description && (
                      <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.description}
                      </div>
                    )}
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.project_color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>{m.project_name}</span>
                      </span>
                      {m.target_date && <span>· Target: {m.target_date}</span>}
                      {m.weight !== undefined && m.weight > 0 && <span>· Weight: {m.weight}%</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <Badge variant={sb.variant}>{sb.label}</Badge>
                    {isOverdue && <Badge variant="error">Overdue</Badge>}
                    {m.owner_name && (
                      <div title={`Owner: ${m.owner_name}`}>
                        <PersonAvatar name={m.owner_name} userId={m.owner_id} size={24} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <ListPagination total={filtered.length} page={msPage} pageSize={msPageSize} onPageChange={setMsPage} onPageSizeChange={setMsPageSize} noun="milestones" />
          </>
        ) : (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
                  {['Milestone', 'Project', 'Target Date', 'Status', 'Weight', 'Owner'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => {
                  const sb = STATUS_BADGE[m.status] || STATUS_BADGE.not_started;
                  const isOverdue = m.target_date && m.status !== 'completed' && new Date(m.target_date) < new Date();
                  return (
                    <tr
                      key={m.id}
                      onClick={() => navigate(`/projects/${m.project_id}`)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--ink)' }}>
                        {m.name}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.project_color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'var(--ink)' }}>{m.project_name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: isOverdue ? 'var(--red)' : 'var(--ink3)', fontWeight: isOverdue ? 700 : 400 }}>
                        {m.target_date || '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Badge variant={sb.variant}>{sb.label}</Badge>
                        {isOverdue && <Badge variant="error" style={{ marginLeft: 6 }}>Overdue</Badge>}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink3)' }}>
                        {m.weight !== undefined ? `${m.weight}%` : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {m.owner_name ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <PersonAvatar name={m.owner_name} userId={m.owner_id} size={20} />
                            <span style={{ fontSize: 12, color: 'var(--ink)' }}>{m.owner_name}</span>
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
