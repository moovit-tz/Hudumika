import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Icon } from '../../components/Icon.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { ListPagination, paginate } from '../../components/ui/list-pagination.js';
import { apiFetch } from '../../lib/api.js';
import { useTodos } from '../../data/calendarStore.js';
import { rowsOf } from './projectData.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';

interface TeamMemberRow {
  id: string;
  user_id: string;
  name: string;
  email?: string;
  role: string;
  project_id: string;
  project_name: string;
}

export function ProjectTeamPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const tasks = useTodos();
  const [rows, setRows] = useState<TeamMemberRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [teamPage, setTeamPage] = useState(1);
  const [teamPageSize, setTeamPageSize] = useState(25);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const projects = rowsOf(await apiFetch('/v1/tasks/projects'));
      const results = await Promise.allSettled(
        projects.map(async project =>
          rowsOf(await apiFetch(`/v1/tasks/projects/${project.id}/members`)).map(member => ({
            ...member,
            project_id: project.id,
            project_name: project.name,
          }))
        )
      );
      setRows(results.flatMap(result => (result.status === 'fulfilled' ? result.value : [])));
      if (results.some(result => result.status === 'rejected')) {
        setError('Some project teams could not load. Retry to refresh the complete directory.');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load project teams');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const uniqueProjects = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach(r => map.set(r.project_id, r.project_name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  // Aggregate by user
  const userAggregates = useMemo(() => {
    const map = new Map<string, { user_id: string; name: string; email?: string; roles: string[]; projects: { id: string; name: string }[] }>();
    rows.forEach(r => {
      const existing = map.get(r.user_id) || {
        user_id: r.user_id,
        name: r.name,
        email: r.email,
        roles: [],
        projects: [],
      };
      if (!existing.roles.includes(r.role)) existing.roles.push(r.role);
      if (!existing.projects.some(p => p.id === r.project_id)) {
        existing.projects.push({ id: r.project_id, name: r.project_name });
      }
      map.set(r.user_id, existing);
    });
    return Array.from(map.values());
  }, [rows]);

  const filteredMembers = useMemo(() => {
    setTeamPage(1);
    return userAggregates.filter(member => {
      if (projectFilter !== 'all' && !member.projects.some(p => p.id === projectFilter)) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = member.name.toLowerCase().includes(q);
        const matchesProject = member.projects.some(p => p.name.toLowerCase().includes(q));
        const matchesRole = member.roles.some(r => r.toLowerCase().includes(q));
        return matchesName || matchesProject || matchesRole;
      }
      return true;
    });
  }, [userAggregates, projectFilter, search]);

  const totalOpenTasks = useMemo(() => {
    return tasks.filter(t => !t.deletedAt && !t.completed && t.projectId).length;
  }, [tasks]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      {error && (
        <Alert variant="destructive" style={{ marginBottom: 16 }}>
          <AlertDescription>
            {error} <Button variant="outline" size="sm" onClick={load} style={{ marginLeft: 8 }}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      <PageHeader
        crumbs={['Projects', 'Resources']}
        titlePlain="Team &"
        titleEm="workload"
        subtitle="Workforce allocation directory — active assignments, cross-project deployments, and task capacity."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/tasks')}>
              <Icon name="checkCircle" size={13} style={{ marginRight: 6 }} /> My Tasks
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/equipment')}>
              <Icon name="tool" size={13} style={{ marginRight: 6 }} /> Equipment
            </Button>
          </div>
        }
      />

      <div style={{ marginTop: 20 }}>
        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Active Team Members', value: userAggregates.length, icon: 'users' as const, variant: 'brand' as const },
            { label: 'Project Memberships', value: rows.length, icon: 'briefcase' as const, variant: 'brand' as const },
            { label: 'Active Projects', value: uniqueProjects.length, icon: 'layers' as const, variant: 'brand' as const },
            { label: 'Open Assigned Tasks', value: totalOpenTasks, icon: 'checkCircle' as const, variant: 'success' as const },
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
            </div>
          ))}
        </div>

        {/* Filter and View Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="h-8 text-xs" style={{ width: 160 }}>
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {uniqueProjects.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={view === 'cards' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView('cards')}
              style={{ height: 32, fontSize: 12 }}
            >
              <Icon name="grid" size={12} style={{ marginRight: 6 }} /> Cards
            </Button>
            <Button
              variant={view === 'table' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView('table')}
              style={{ height: 32, fontSize: 12 }}
            >
              <Icon name="list" size={12} style={{ marginRight: 6 }} /> Table
            </Button>

            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
              {filteredMembers.length} {filteredMembers.length === 1 ? 'member' : 'members'}
            </span>
          </div>

          <SearchToolbar search={search} onSearch={setSearch} placeholder="Search members, roles, projects…" />
        </div>

        {/* Main Content */}
        {loading ? (
          <SectionLoading />
        ) : filteredMembers.length === 0 ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 48, textAlign: 'center' }}>
            <FeaturedIcon variant="brand" size="lg" style={{ margin: '0 auto 12px' }}>
              <Icon name="users" size={24} />
            </FeaturedIcon>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              No Team Members Found
            </h3>
            <p style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 400, margin: '0 auto 16px' }}>
              No members match the current search or project filter. Team members can be added within each project's workspace.
            </p>
          </div>
        ) : view === 'cards' ? (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {paginate(filteredMembers, teamPage, teamPageSize).visible.map(member => {
              const openTasks = tasks.filter(t => !t.deletedAt && !t.completed && t.assigneeId === member.user_id);
              const taskCount = openTasks.length;
              const loadVariant = taskCount > 7 ? 'error' : taskCount > 3 ? 'warning' : 'success';
              const loadLabel = taskCount > 7 ? 'Heavy Load' : taskCount > 3 ? 'Moderate' : 'Optimal Capacity';

              return (
                <div
                  key={member.user_id}
                  style={{
                    background: 'var(--white)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-lg)',
                    padding: 16,
                    boxShadow: 'var(--card-shadow)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  {/* Identity Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <PersonAvatar userId={member.user_id} name={member.name} size={38} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                          {member.name}
                        </div>
                        {member.roles.length > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                            {member.roles.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                    <Badge variant={loadVariant as any} style={{ fontSize: 10 }}>
                      {loadLabel}
                    </Badge>
                  </div>

                  {/* Task Load Metric */}
                  <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--r-sm)', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Assigned Open Tasks:</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                      {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>

                  {/* Deployed Projects List */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                      Active Projects ({member.projects.length})
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {member.projects.map(p => (
                        <span
                          key={p.id}
                          onClick={() => navigate(`/projects/${p.id}`)}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '3px 8px',
                            background: 'var(--white)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--r-sm)',
                            color: 'var(--ink)',
                            cursor: 'pointer',
                          }}
                        >
                          {p.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
                    {member.projects[0] && (
                      <Button
                        variant="outline"
                        size="sm"
                        style={{ height: 28, fontSize: 11 }}
                        onClick={() => navigate(`/projects/${member.projects[0].id}`)}
                      >
                        Manage Project Team
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <ListPagination total={filteredMembers.length} page={teamPage} pageSize={teamPageSize} onPageChange={setTeamPage} onPageSizeChange={setTeamPageSize} noun="members" />
          </>
        ) : (
          <>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflowX: 'auto', boxShadow: 'var(--card-shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
                  {['Member', 'Role', 'Projects', 'Assigned Open Tasks', 'Capacity Status', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginate(filteredMembers, teamPage, teamPageSize).visible.map(member => {
                  const openTasks = tasks.filter(t => !t.deletedAt && !t.completed && t.assigneeId === member.user_id);
                  const taskCount = openTasks.length;
                  const loadVariant = taskCount > 7 ? 'error' : taskCount > 3 ? 'warning' : 'success';
                  const loadLabel = taskCount > 7 ? 'Heavy' : taskCount > 3 ? 'Moderate' : 'Optimal';

                  return (
                    <tr
                      key={member.user_id}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <PersonAvatar userId={member.user_id} name={member.name} size={26} />
                          <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{member.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink2)' }}>
                        {member.roles.join(', ') || 'Team Member'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink)' }}>
                        {member.projects.map(p => p.name).join(', ')}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                        {taskCount}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Badge variant={loadVariant as any}>{loadLabel}</Badge>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {member.projects[0] && (
                          <Button
                            variant="ghost"
                            size="sm"
                            style={{ height: 28, fontSize: 11 }}
                            onClick={() => navigate(`/projects/${member.projects[0].id}`)}
                          >
                            Open Project
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ListPagination total={filteredMembers.length} page={teamPage} pageSize={teamPageSize} onPageChange={setTeamPage} onPageSizeChange={setTeamPageSize} noun="members" />
          </>
        )}
      </div>
    </div>
  );
}
