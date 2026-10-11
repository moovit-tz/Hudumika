import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { PageHeader } from '../../components/PageHeader.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { KanbanBoard, type KanbanColumn, type KanbanCardData } from '../../components/ui/kanban-board.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useTodos, hydrateTasksFromServer, type TaskStatus, type TaskPriority } from '../../data/calendarStore.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { ListPagination, paginate } from '../../components/ui/list-pagination.js';
import { useProjectRows } from './projectData.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';

const STATUS_META: Record<TaskStatus, { label: string; variant: 'gray' | 'brand' | 'warning' | 'info' | 'success' }> = {
  none: { label: 'Not Started', variant: 'gray' },
  in_progress: { label: 'In Progress', variant: 'brand' },
  in_review: { label: 'In Review', variant: 'warning' },
  waiting: { label: 'Waiting', variant: 'info' },
  completed: { label: 'Completed', variant: 'success' },
};

const COLUMNS: KanbanColumn<TaskStatus>[] = [
  { id: 'none', label: 'Not Started', color: 'var(--ink3)' },
  { id: 'in_progress', label: 'In Progress', color: 'var(--teal)' },
  { id: 'in_review', label: 'In Review', color: 'var(--gold)' },
  { id: 'waiting', label: 'Waiting', color: 'var(--blue)' },
  { id: 'completed', label: 'Completed', color: 'var(--green)' },
];

interface TaskCard extends KanbanCardData {
  title: string;
  projectId?: string | null;
  priority?: TaskPriority;
  due?: string;
  assigneeName?: string;
  assigneeId?: string;
  completed?: boolean;
}

export const ProjectMyTasks: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user } = useAuth();
  const allTodos = useTodos();
  const { rows: projects, error: projectError } = useProjectRows();
  const projectNames = useMemo(() => new Map(projects.map(project => [project.id, project.name])), [projects]);

  const [view, setView] = useState<'board' | 'list'>('board');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(25);

  const currentUserId = user?.id;

  const filteredTasks = useMemo(() => {
    let tasks = allTodos.filter(t => !t.deletedAt && t.projectId);
    if (scope === 'mine' && currentUserId) {
      tasks = tasks.filter(t => t.assigneeId === currentUserId);
    }
    if (projectFilter !== 'all') {
      tasks = tasks.filter(t => t.projectId === projectFilter);
    }
    if (priorityFilter !== 'all') {
      tasks = tasks.filter(t => (t.priority || 'medium') === priorityFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      tasks = tasks.filter(t => t.title.toLowerCase().includes(q) || (t.tags && t.tags.some(tag => tag.toLowerCase().includes(q))));
    }
    return tasks;
  }, [allTodos, scope, currentUserId, projectFilter, priorityFilter, search]);

  useEffect(() => { setListPage(1); }, [search, priorityFilter, projectFilter, scope]);

  const kanbanItems: TaskCard[] = useMemo(() =>
    filteredTasks.map(t => ({
      id: t.id,
      columnId: t.completed ? 'completed' : t.status,
      title: t.title,
      projectId: t.projectId,
      priority: t.priority,
      due: t.due,
      assigneeName: t.assigneeName,
      assigneeId: t.assigneeId,
      completed: t.completed,
    })),
  [filteredTasks]);

  const handleDrop = useCallback(async (itemId: string, _from: string, toColumn: string) => {
    const isComplete = toColumn === 'completed';
    try {
      await apiFetch(`/v1/tasks/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: toColumn, completed: isComplete }),
      });
      await hydrateTasksFromServer();
    } catch {
      showAlert('Failed to move task', { variant: 'error' });
    }
  }, []);

  const overdue = filteredTasks.filter(t => t.due && !t.completed && new Date(t.due) < new Date());
  const dueThisWeek = filteredTasks.filter(t => {
    if (!t.due || t.completed) return false;
    const d = new Date(t.due);
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    return d >= now && d <= end;
  });

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      {projectError && (
        <Alert variant="destructive" style={{ marginBottom: 16 }}>
          <AlertDescription>{projectError}</AlertDescription>
        </Alert>
      )}

      <PageHeader
        crumbs={['Projects', 'Planning']}
        titlePlain={scope === 'mine' ? 'My' : 'Project'}
        titleEm="tasks"
        subtitle="Operational execution board — drag and drop tasks across lifecycle stages."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant={scope === 'mine' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setScope('mine')}
            >
              <Icon name="user" size={13} style={{ marginRight: 6 }} /> My Tasks
            </Button>
            <Button
              variant={scope === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setScope('all')}
            >
              <Icon name="users" size={13} style={{ marginRight: 6 }} /> All Project Tasks
            </Button>
          </div>
        }
      />

      <div style={{ marginTop: 20 }}>
        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {([
            { label: 'Total Tasks', value: filteredTasks.length, icon: 'checkCircle' as const },
            { label: 'In Progress', value: filteredTasks.filter(t => t.status === 'in_progress').length, icon: 'trendingUp' as const },
            { label: 'Overdue', value: overdue.length, icon: 'alertTriangle' as const, highlight: overdue.length > 0 },
            { label: 'Due This Week', value: dueThisWeek.length, icon: 'calendar' as const },
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

        {/* Controls Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tabs value={view} onValueChange={v => setView(v as typeof view)}>
              <TabsList>
                <TabsTrigger value="board">
                  <Icon name="columns" size={13} style={{ marginRight: 6 }} /> Board
                </TabsTrigger>
                <TabsTrigger value="list">
                  <Icon name="list" size={13} style={{ marginRight: 6 }} /> List
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="h-8 text-xs" style={{ width: 150 }}>
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-8 text-xs" style={{ width: 130 }}>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <SearchToolbar search={search} onSearch={setSearch} placeholder="Filter tasks by name or tag…" />
        </div>

        {/* Kanban Board View */}
        {view === 'board' && (
          <KanbanBoard
            columns={COLUMNS}
            items={kanbanItems}
            onDrop={handleDrop}
            pageSizeOptions={[10, 25, 50]}
            defaultPageSize={10}
            renderCard={(t) => {
              const isOverdue = t.due && !t.completed && new Date(t.due) < new Date();
              return (
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && t.projectId) navigate(`/projects/${t.projectId}/board?task=${t.id}`);
                  }}
                  onClick={() => t.projectId && navigate(`/projects/${t.projectId}/board?task=${t.id}`)}
                >
                  <div className="kb-card-title">{t.title}</div>
                  {t.projectId && (
                    <div className="kb-card-subtitle" style={{ color: 'var(--teal)', fontWeight: 600 }}>
                      {projectNames.get(t.projectId) || 'Project'}
                    </div>
                  )}
                  <div className="kb-card-meta">
                    {t.due && (
                      <span className="kb-meta-item" style={{ color: isOverdue ? 'var(--red)' : undefined, fontWeight: isOverdue ? 700 : 500 }}>
                        <Icon name="calendar" size={11} /> {t.due}
                      </span>
                    )}
                    {t.priority && (
                      <Badge
                        variant={t.priority === 'urgent' ? 'error' : t.priority === 'high' ? 'warning' : 'gray'}
                        style={{ fontSize: 9.5 }}
                      >
                        {t.priority}
                      </Badge>
                    )}
                    {t.assigneeName && (
                      <PersonAvatar userId={t.assigneeId} name={t.assigneeName} size={18} />
                    )}
                  </div>
                </div>
              );
            }}
          />
        )}

        {/* List View */}
        {view === 'list' && (<>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', overflowX: 'auto', boxShadow: 'var(--card-shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
                  {['Task', 'Project', 'Status', 'Priority', 'Due Date', 'Assignee'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginate(filteredTasks, listPage, listPageSize).visible.map(t => {
                  const sm = STATUS_META[t.completed ? 'completed' : t.status] || STATUS_META.none;
                  const isOverdue = t.due && !t.completed && new Date(t.due) < new Date();
                  return (
                    <tr
                      key={t.id}
                      onClick={() => t.projectId && navigate(`/projects/${t.projectId}/board?task=${t.id}`)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ink)' }}>
                        {t.title}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink2)' }}>
                        {t.projectId ? projectNames.get(t.projectId) || '—' : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Badge variant={sm.variant}>{sm.label}</Badge>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Badge variant={t.priority === 'urgent' ? 'error' : t.priority === 'high' ? 'warning' : 'gray'}>
                          {t.priority || 'medium'}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: isOverdue ? 'var(--red)' : 'var(--ink3)', fontWeight: isOverdue ? 700 : 400 }}>
                        {t.due || '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {t.assigneeName ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <PersonAvatar userId={t.assigneeId} name={t.assigneeName} size={20} />
                            <span style={{ fontSize: 12, color: 'var(--ink)' }}>{t.assigneeName}</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--ink3)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredTasks.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 48, textAlign: 'center' }}>
                      <FeaturedIcon variant="brand" size="md" style={{ margin: '0 auto 10px' }}>
                        <Icon name="checkCircle" size={18} />
                      </FeaturedIcon>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>No tasks match the filters</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
                        Try switching the project or scope filter, or create new tasks inside a project.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ListPagination total={filteredTasks.length} page={listPage} pageSize={listPageSize} onPageChange={setListPage} onPageSizeChange={setListPageSize} noun="tasks" />
        </>)}
      </div>
    </div>
  );
};
