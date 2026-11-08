import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Icon, type IconName } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { KanbanBoard, type KanbanColumn, type KanbanCardData } from '../components/ui/kanban-board.js';
import {
  useTodos, useLists, addTodo, updateTodo, deleteTodo, restoreTodo, purgeTodo, reorderTodo,
  addSubtask, updateSubtask, deleteSubtask, startTaskTimer, stopTaskTimer, cloneTask,
  useActiveTaskView, setActiveTaskView, useEvents, useLinkedTasks, inboxListId,
  fetchTodoComments, postTodoComment, deleteTodoComment,
  Todo, TaskStatus, TaskPriority, TodoComment,
} from '../data/calendarStore.js';
import { Link, useSearchParams } from 'react-router-dom';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { ReminderPicker } from '../components/ReminderPicker.js';
import { Badge } from '../components/ui/badge.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '../components/ui/dropdown-menu.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { MeetingLinkPanel } from '../components/MeetingLinkPanel.js';
import { MentionInput, type MentionUser } from '../components/MentionInput.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useEntitlements } from '../hooks/useEntitlements.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import { Button } from '../components/ui/button.js';
import { Tip } from '../components/ui/tooltip.js';
import './TasksApp.css';

/* ── STATUS & PRIORITY META (Perfex CRM Standard + Modern Tints) ───── */

const STATUS_META: Record<TaskStatus, { label: string; variant: 'gray' | 'brand' | 'warning' | 'info' | 'success'; color: string; bg: string; dotColor: string }> = {
  none:        { label: 'Not Started', variant: 'gray',    color: 'var(--ink2)', bg: 'rgba(100,116,139,0.08)', dotColor: '#94a3b8' },
  in_progress: { label: 'In Progress', variant: 'brand',   color: 'var(--blue)', bg: 'var(--blue-l)',           dotColor: '#2563eb' },
  in_review:   { label: 'Testing / Review', variant: 'warning', color: 'var(--gold)', bg: 'rgba(217,119,6,0.1)',  dotColor: '#d97706' },
  waiting:     { label: 'Awaiting Feedback', variant: 'info',  color: 'var(--purple)', bg: 'var(--purple-l)',   dotColor: '#7c3aed' },
  completed:   { label: 'Complete',    variant: 'success', color: 'var(--green)', bg: 'rgba(5,150,105,0.1)',   dotColor: '#059669' },
};

const PRIORITY_META: Record<TaskPriority, { label: string; color: string; bg: string; icon: IconName }> = {
  low:    { label: 'Low',    color: 'var(--ink2)', bg: 'var(--bg-subtle, #f1f5f9)', icon: 'arrowDown' },
  medium: { label: 'Medium', color: 'var(--gold)', bg: 'var(--gold-l)',            icon: 'minus' },
  high:   { label: 'High',   color: '#ea580c',     bg: 'rgba(234,88,12,0.1)',       icon: 'arrowUp' },
  urgent: { label: 'Urgent', color: 'var(--red)',  bg: 'var(--red-l)',             icon: 'alertCircle' },
};

function todayStr() { return new Date().toISOString().slice(0, 10); }
function isOverdue(due?: string) { return !!due && due < todayStr(); }
function isDueToday(due?: string) { return !!due && due === todayStr(); }

function dateGroupLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(todayStr() + 'T00:00:00');
  const diffDays = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 0) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' (Overdue)';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

const VIEW_TITLES: Record<string, { label: string; icon: IconName; description: string }> = {
  inbox:    { label: 'Inbox',    icon: 'list',       description: 'Capture ideas, to-dos and action items before organizing.' },
  today:    { label: 'Today',    icon: 'star',       description: 'Tasks scheduled or overdue for completion today.' },
  upcoming: { label: 'Upcoming', icon: 'calendar',   description: 'Scheduled tasks grouped by future arrival and due dates.' },
  anytime:  { label: 'Anytime',  icon: 'folder',     description: 'Backlog of active tasks without a specific deadline.' },
  someday:  { label: 'Someday',  icon: 'clock',      description: 'Ideas and aspirations reserved for future review.' },
  assigned: { label: 'Assigned to me', icon: 'userCheck', description: 'Tasks delegated to you across teams and projects.' },
  trash:    { label: 'Trash',    icon: 'trash',      description: 'Deleted tasks — restore or purge permanently.' },
};

async function searchColleagues(q: string): Promise<PickerItem[]> {
  const rows = await apiFetch(`/v1/hr/staff?search=${encodeURIComponent(q)}`).catch(() => []);
  return (rows || []).map((u: any) => ({ id: u.id, label: u.name, sublabel: u.email, avatarUserId: u.id, avatarKind: 'people' as const }));
}
async function fetchColleaguesForMentions(): Promise<MentionUser[]> {
  const rows = await apiFetch('/v1/hr/staff').catch(() => []);
  return (rows || []).map((u: any) => ({ id: u.id, name: u.name, role: u.role }));
}

function formatMinutes(mins?: number): string {
  if (!mins || mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/* ── MAIN TASKS APPLICATION COMPONENT ─────────────────────────────── */

export const TasksApp: React.FC = () => {
  const [searchParams] = useSearchParams();
  const allTodos = useTodos();
  const lists = useLists();
  const linked = useLinkedTasks();
  const view = useActiveTaskView();
  const isMobile = useIsMobile();

  const [displayMode, setDisplayMode] = useState<'list' | 'kanban'>('list');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const openedDeepLinkRef = useRef<string | null>(null);

  // Quick Inline Add state
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDue, setQuickDue] = useState<string>('');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>('medium');

  // Deep-link auto-expand and scroll
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId) return;
    const task = allTodos.find(t => t.id === taskId);
    if (!task || openedDeepLinkRef.current === taskId) return;

    openedDeepLinkRef.current = taskId;
    setFilterStatus('all');
    setSearchQuery('');
    setDisplayMode('list');
    setShowCompleted(task.completed);
    setExpandedId(task.id);
    setActiveTaskView(task.deletedAt ? 'trash' : `list:${task.listId}`);
    window.setTimeout(() => {
      document.getElementById(`task-${task.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }, [searchParams, allTodos]);

  const listMap = useMemo(() => Object.fromEntries(lists.map(l => [l.id, l])), [lists]);
  const active = useMemo(() => allTodos.filter(t => !t.deletedAt), [allTodos]);

  const currentListId = view.startsWith('list:') ? view.slice(5) : null;
  const currentCustomList = currentListId ? listMap[currentListId] : null;

  const viewInfo = useMemo(() => {
    if (currentCustomList) {
      return {
        label: currentCustomList.name,
        icon: 'folder' as IconName,
        description: `Tasks in the "${currentCustomList.name}" list.`,
        color: currentCustomList.color,
      };
    }
    const def = VIEW_TITLES[view] || { label: 'Tasks', icon: 'list' as IconName, description: 'Manage and prioritize your work.' };
    return { ...def, color: undefined };
  }, [currentCustomList, view]);

  /* Base View Filtering */
  const baseRows: Todo[] = useMemo(() => {
    if (view === 'trash') return allTodos.filter(t => t.deletedAt);
    if (view === 'inbox') return active.filter(t => t.listId === inboxListId());
    if (view === 'today') return active.filter(t => t.due === todayStr() || (isOverdue(t.due) && !t.completed));
    if (view === 'upcoming') return active.filter(t => !!t.due);
    if (view === 'anytime') return active.filter(t => !t.due && !t.someday);
    if (view === 'someday') return active.filter(t => !!t.someday);
    if (view === 'assigned') return active.filter(t => !t.isOwner);
    if (currentListId) return active.filter(t => t.listId === currentListId);
    return active;
  }, [view, allTodos, active, currentListId]);

  /* Filter Toolbar Applying Status (from the KPI cards) & Search */
  const filteredRows = useMemo(() => {
    return baseRows.filter(t => {
      if (filterStatus !== 'all') {
        if (filterStatus === 'completed') {
          if (!t.completed && t.status !== 'completed') return false;
        } else if (t.status !== filterStatus) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchNotes = t.notes?.toLowerCase().includes(q);
        const matchTag = t.tags.some(tag => tag.toLowerCase().includes(q));
        const matchAssignee = t.assigneeName?.toLowerCase().includes(q);
        if (!matchTitle && !matchNotes && !matchTag && !matchAssignee) return false;
      }
      return true;
    });
  }, [baseRows, filterStatus, searchQuery]);

  const incomplete = useMemo(() => {
    return [...filteredRows.filter(t => !t.completed)].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.order - b.order);
  }, [filteredRows]);

  const completed = useMemo(() => filteredRows.filter(t => t.completed), [filteredRows]);
  const overdueCount = useMemo(() => active.filter(t => !t.completed && isOverdue(t.due)).length, [active]);

  // Sidebar "From other apps" section (TasksShell.tsx)
  const isLinkedView = view === 'linked' || view.startsWith('linked:');
  const linkedViewSourceApp = view.startsWith('linked:') ? view.slice(7) : null;
  const linkedFullList = linkedViewSourceApp ? linked.filter(l => l.sourceApp === linkedViewSourceApp) : linked;

  /* Metric Counts */
  const counts = useMemo(() => {
    const total = active.length || 1;
    const notStarted = active.filter(t => t.status === 'none' && !t.completed).length;
    const inProgress = active.filter(t => t.status === 'in_progress' && !t.completed).length;
    const inReview = active.filter(t => t.status === 'in_review' && !t.completed).length;
    const waiting = active.filter(t => t.status === 'waiting' && !t.completed).length;
    const complete = active.filter(t => t.completed || t.status === 'completed').length;
    return {
      total: active.length,
      notStarted,
      inProgress,
      inReview,
      waiting,
      complete,
      pctNotStarted: Math.round((notStarted / total) * 100),
      pctInProgress: Math.round((inProgress / total) * 100),
      pctInReview: Math.round((inReview / total) * 100),
      pctWaiting: Math.round((waiting / total) * 100),
      pctComplete: Math.round((complete / total) * 100),
    };
  }, [active]);

  function toggleExpand(id: string) { setExpandedId(prev => prev === id ? null : id); setNewSubtaskTitle(''); }

  function handleRowDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData('text/todo-id', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  }

  function handleRowDrop(e: React.DragEvent, target: Todo) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/todo-id');
    setDraggingId(null);
    if (!draggedId || draggedId === target.id) return;
    const dragged = allTodos.find(t => t.id === draggedId);
    if (!dragged || dragged.listId !== target.listId) return;
    const siblings = allTodos
      .filter(t => t.listId === target.listId && !t.deletedAt && t.id !== draggedId)
      .sort((a, b) => a.order - b.order);
    const targetIdx = siblings.findIndex(t => t.id === target.id);
    reorderTodo(draggedId, targetIdx === -1 ? siblings.length : targetIdx);
  }

  function handleQuickAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    addTodo({
      title: quickTitle.trim(),
      listId: currentListId || inboxListId() || 'inbox',
      due: quickDue || (view === 'today' ? todayStr() : undefined),
      priority: quickPriority,
      status: 'none',
    });
    setQuickTitle('');
    setQuickDue('');
    setQuickPriority('medium');
  }

  function exportCSV() {
    const csvContent = [
      ['ID', 'Title', 'List', 'Status', 'Priority', 'Due Date', 'Completed', 'Time Logged (m)'].join(','),
      ...filteredRows.map(t => [
        `"${t.id}"`, `"${t.title.replace(/"/g, '""')}"`, `"${listMap[t.listId]?.name || ''}"`,
        `"${t.status}"`, `"${t.priority || 'medium'}"`, `"${t.due || ''}"`, `"${t.completed ? 'Yes' : 'No'}"`,
        t.timeLoggedMinutes || 0
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.setAttribute('download', `tasks_export_${todayStr()}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  }

  const canAdd = view !== 'trash';

  /* Linked tasks from other apps */
  if (isLinkedView) {
    return (
      <div className="tasks-page-root">
        <div className="tasks-main-container">
          <div className="tasks-hero-bar">
            <div className="tasks-hero-left">
              <div className="tasks-hero-icon-wrap">
                <Icon name="externalLink" size={22} />
              </div>
              <div className="tasks-hero-titles">
                <h1 className="tasks-hero-title">
                  {linkedViewSourceApp ? `${linkedViewSourceApp} tasks` : 'From other apps'}
                </h1>
                <p className="tasks-hero-subtext">
                  {linkedFullList.length} open task{linkedFullList.length === 1 ? '' : 's'} assigned to you across connected apps.
                </p>
              </div>
            </div>
          </div>

          <div className="tasks-content-area">
            {linkedFullList.length === 0 ? (
              <div className="tasks-empty-container">
                <div className="tasks-empty-circle">
                  <Icon name="checkCircle" size={32} />
                </div>
                <h3 className="tasks-empty-title">All caught up!</h3>
                <p className="tasks-empty-desc">No outstanding cross-app tasks assigned to your profile right now.</p>
              </div>
            ) : (
              <div className="tasks-list-stack" style={{ maxWidth: 760 }}>
                {linkedFullList.map(l => <LinkedTaskRow key={l.id} task={l} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tasks-page-root">
      <div className="tasks-main-container">

        {/* ── Top Hero Bar ─────────────────────────────────────────────── */}
        <div className="tasks-hero-bar">
          <div className="tasks-hero-left">
            <div className="tasks-hero-icon-wrap">
              {viewInfo.color ? (
                <span className="tasks-hero-list-pip" style={{ background: viewInfo.color, width: 16, height: 16 }} />
              ) : (
                <Icon name={viewInfo.icon} size={22} />
              )}
            </div>
            <div className="tasks-hero-titles">
              <div className="tasks-hero-title-row">
                <h1 className="tasks-hero-title">{viewInfo.label}</h1>
                {view !== 'trash' && (
                  <Badge variant="brand" className="font-bold">
                    {incomplete.length} active
                  </Badge>
                )}
                {overdueCount > 0 && view !== 'trash' && (
                  <Badge variant="error" className="font-bold">
                    {overdueCount} overdue
                  </Badge>
                )}
              </div>
              <p className="tasks-hero-subtext">
                {view === 'trash'
                  ? 'Deleted tasks — restore or remove permanently.'
                  : `${viewInfo.description} · ${completed.length} completed`}
              </p>
            </div>
          </div>

          <div className="tasks-hero-actions">
            {/* View Mode Switcher */}
            <Tabs value={displayMode} onValueChange={v => setDisplayMode(v as any)} variant="segmented">
              <TabsList>
                <TabsTrigger value="list" title="List View">
                  <Icon name="list" size={14} /> List
                </TabsTrigger>
                <TabsTrigger value="kanban" title="Kanban Board View">
                  <Icon name="layers" size={14} /> Kanban
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Quick Search with Clear */}
            <div className="tasks-search-wrap">
              <Icon name="search" size={14} className="tasks-search-icon" />
              <input data-ui-field="input" data-field-appearance="bare"
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tasks, tags, notes…"
                className="tasks-search-input"
              />
              {searchQuery && (
                <button data-ui-native-button=""
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="tasks-search-clear"
                  title="Clear search"
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>

            <Button size="sm" variant="outline" onClick={exportCSV} className="flex items-center gap-1.5 font-medium">
              <Icon name="download" size={14} />
              <span className="hidden sm:inline">Export</span>
            </Button>

            {canAdd && (
              <Button size="sm" onClick={() => setCreateModalOpen(true)} className="flex items-center gap-1.5 font-bold shadow-xs">
                <Icon name="plus" size={15} />
                <span>New Task</span>
              </Button>
            )}
          </div>
        </div>

        {/* ── 5-State Interactive Status KPI Bar ────────────────────────── */}
        {view !== 'trash' && (
          <div className="tasks-kpi-bar">
            <div className="tasks-kpi-grid">
              
              {/* 1. Not Started */}
              <button
                type="button"
                onClick={() => setFilterStatus(prev => prev === 'none' ? 'all' : 'none')}
                className={`tasks-kpi-card ${filterStatus === 'none' ? 'tasks-kpi-card--active' : ''}`}
                data-ui-native-button=""
              >
                <div className="tasks-kpi-card-header">
                  <span className="tasks-kpi-label" style={{ color: 'var(--ink2)' }}>Not Started</span>
                  <span className="tasks-kpi-indicator-dot" style={{ background: STATUS_META.none.dotColor }} />
                </div>
                <div className="tasks-kpi-count-row">
                  <span className="tasks-kpi-count">{counts.notStarted}</span>
                  <span className="tasks-kpi-percent">{counts.pctNotStarted}%</span>
                </div>
                <div className="tasks-kpi-progress-track">
                  <div className="tasks-kpi-progress-bar" style={{ width: `${counts.pctNotStarted}%`, background: STATUS_META.none.dotColor }} />
                </div>
              </button>

              {/* 2. In Progress */}
              <button
                type="button"
                onClick={() => setFilterStatus(prev => prev === 'in_progress' ? 'all' : 'in_progress')}
                className={`tasks-kpi-card ${filterStatus === 'in_progress' ? 'tasks-kpi-card--active' : ''}`}
                data-ui-native-button=""
              >
                <div className="tasks-kpi-card-header">
                  <span className="tasks-kpi-label" style={{ color: 'var(--blue)' }}>In Progress</span>
                  <span className="tasks-kpi-indicator-dot" style={{ background: STATUS_META.in_progress.dotColor }} />
                </div>
                <div className="tasks-kpi-count-row">
                  <span className="tasks-kpi-count" style={{ color: 'var(--blue)' }}>{counts.inProgress}</span>
                  <span className="tasks-kpi-percent">{counts.pctInProgress}%</span>
                </div>
                <div className="tasks-kpi-progress-track">
                  <div className="tasks-kpi-progress-bar" style={{ width: `${counts.pctInProgress}%`, background: STATUS_META.in_progress.dotColor }} />
                </div>
              </button>

              {/* 3. Testing / Review */}
              <button
                type="button"
                onClick={() => setFilterStatus(prev => prev === 'in_review' ? 'all' : 'in_review')}
                className={`tasks-kpi-card ${filterStatus === 'in_review' ? 'tasks-kpi-card--active' : ''}`}
                data-ui-native-button=""
              >
                <div className="tasks-kpi-card-header">
                  <span className="tasks-kpi-label" style={{ color: 'var(--gold)' }}>Review / QA</span>
                  <span className="tasks-kpi-indicator-dot" style={{ background: STATUS_META.in_review.dotColor }} />
                </div>
                <div className="tasks-kpi-count-row">
                  <span className="tasks-kpi-count" style={{ color: 'var(--gold)' }}>{counts.inReview}</span>
                  <span className="tasks-kpi-percent">{counts.pctInReview}%</span>
                </div>
                <div className="tasks-kpi-progress-track">
                  <div className="tasks-kpi-progress-bar" style={{ width: `${counts.pctInReview}%`, background: STATUS_META.in_review.dotColor }} />
                </div>
              </button>

              {/* 4. Awaiting Feedback */}
              <button
                type="button"
                onClick={() => setFilterStatus(prev => prev === 'waiting' ? 'all' : 'waiting')}
                className={`tasks-kpi-card ${filterStatus === 'waiting' ? 'tasks-kpi-card--active' : ''}`}
                data-ui-native-button=""
              >
                <div className="tasks-kpi-card-header">
                  <span className="tasks-kpi-label" style={{ color: 'var(--purple)' }}>Waiting</span>
                  <span className="tasks-kpi-indicator-dot" style={{ background: STATUS_META.waiting.dotColor }} />
                </div>
                <div className="tasks-kpi-count-row">
                  <span className="tasks-kpi-count" style={{ color: 'var(--purple)' }}>{counts.waiting}</span>
                  <span className="tasks-kpi-percent">{counts.pctWaiting}%</span>
                </div>
                <div className="tasks-kpi-progress-track">
                  <div className="tasks-kpi-progress-bar" style={{ width: `${counts.pctWaiting}%`, background: STATUS_META.waiting.dotColor }} />
                </div>
              </button>

              {/* 5. Completed */}
              <button
                type="button"
                onClick={() => setFilterStatus(prev => prev === 'completed' ? 'all' : 'completed')}
                className={`tasks-kpi-card ${filterStatus === 'completed' ? 'tasks-kpi-card--active' : ''}`}
                data-ui-native-button=""
              >
                <div className="tasks-kpi-card-header">
                  <span className="tasks-kpi-label" style={{ color: 'var(--green)' }}>Completed</span>
                  <span className="tasks-kpi-indicator-dot" style={{ background: STATUS_META.completed.dotColor }} />
                </div>
                <div className="tasks-kpi-count-row">
                  <span className="tasks-kpi-count" style={{ color: 'var(--green)' }}>{counts.complete}</span>
                  <span className="tasks-kpi-percent">{counts.pctComplete}%</span>
                </div>
                <div className="tasks-kpi-progress-track">
                  <div className="tasks-kpi-progress-bar" style={{ width: `${counts.pctComplete}%`, background: STATUS_META.completed.dotColor }} />
                </div>
              </button>

            </div>
          </div>
        )}

        {/* ── Lightning-Fast Inline Quick Task Bar ──────────────────────── */}
        {canAdd && displayMode === 'list' && (
          <div className="tasks-quick-add-wrap">
            <form onSubmit={handleQuickAddSubmit} className="tasks-quick-add-bar">
              <Icon name="plus" size={16} className="text-teal-600 dark:text-teal-400 shrink-0" />
              <input data-ui-field="input"
                type="text"
                value={quickTitle}
                onChange={e => setQuickTitle(e.target.value)}
                placeholder={`+ Add a task to ${viewInfo.label}… press Enter to save`}
                className="tasks-quick-add-input"
              />
              <div className="tasks-quick-add-controls">
                <DatePicker
                  date={parseDateOnly(quickDue)}
                  onChange={d => setQuickDue(toDateOnlyString(d))}
                  placeholder="Due date"
                  triggerClassName="h-7 text-xs px-2.5 rounded-full border-border bg-transparent shadow-none hover:bg-black/5 dark:hover:bg-white/5"
                />

                <Select value={quickPriority} onValueChange={v => setQuickPriority(v as TaskPriority)}>
                  <SelectTrigger className="h-7 text-xs px-2.5 rounded-full border-border bg-transparent shadow-none hover:bg-black/5 dark:hover:bg-white/5 w-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low Priority</SelectItem>
                    <SelectItem value="medium">Medium Priority</SelectItem>
                    <SelectItem value="high">High Priority</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  type="submit"
                  size="sm"
                  disabled={!quickTitle.trim()}
                  className="h-7 px-3 text-xs font-semibold rounded-full shadow-xs"
                >
                  Add
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* ── Main View Content Area ───────────────────────────────────── */}
        <div className="tasks-content-area">

          {/* KANBAN BOARD VIEW */}
          {displayMode === 'kanban' ? (
            <TasksKanbanBoard todos={filteredRows} listMap={listMap} onTaskClick={id => toggleExpand(id)} />
          ) : (
            /* LIST VIEW */
            filteredRows.length === 0 ? (
              <div className="tasks-empty-container">
                <div className="tasks-empty-circle">
                  <Icon name={filterStatus !== 'all' || searchQuery ? 'search' : 'checkCircle'} size={32} />
                </div>
                <h3 className="tasks-empty-title">
                  {searchQuery || filterStatus !== 'all'
                    ? 'No matching tasks'
                    : view === 'trash'
                    ? 'Trash is empty'
                    : 'All caught up!'}
                </h3>
                <p className="tasks-empty-desc">
                  {searchQuery || filterStatus !== 'all'
                    ? 'No tasks match your current search or status filter. Try resetting your criteria.'
                    : view === 'trash'
                    ? 'Tasks deleted from any view will appear here for recovery or permanent cleanup.'
                    : `No outstanding tasks in ${viewInfo.label}. Add one above or plan ahead!`}
                </p>
                {(searchQuery || filterStatus !== 'all') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSearchQuery(''); setFilterStatus('all'); }}
                  >
                    Reset Filters
                  </Button>
                )}
              </div>
            ) : view === 'upcoming' ? (
              <UpcomingGrouped
                todos={incomplete}
                listMap={listMap}
                expandedId={expandedId}
                onToggleExpand={toggleExpand}
                newSubtaskTitle={newSubtaskTitle}
                setNewSubtaskTitle={setNewSubtaskTitle}
              />
            ) : (
              <div className="tasks-list-stack">
                {incomplete.map(t => (
                  <div
                    key={t.id}
                    draggable={!isMobile && view !== 'trash'}
                    onDragStart={e => handleRowDragStart(e, t.id)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleRowDrop(e, t)}
                    className={draggingId === t.id ? 'task-item-card--dragging' : ''}
                  >
                    <TaskRow
                      todo={t}
                      list={listMap[t.listId]}
                      expanded={expandedId === t.id}
                      onToggleExpand={() => toggleExpand(t.id)}
                      newSubtaskTitle={newSubtaskTitle}
                      setNewSubtaskTitle={setNewSubtaskTitle}
                      trashed={view === 'trash'}
                    />
                  </div>
                ))}
              </div>
            )
          )}

          {/* Completed Accordion Section */}
          {completed.length > 0 && view !== 'trash' && displayMode === 'list' && (
            <div className="mt-8 pt-4 border-t border-border/70">
              <button
                type="button"
                onClick={() => setShowCompleted(v => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors py-2"
                data-ui-native-button=""
              >
                <Icon name={showCompleted ? 'chevronDown' : 'chevronRight'} size={14} />
                <span>Completed Tasks</span>
                <Badge variant="gray" className="text-xs">
                  {completed.length}
                </Badge>
              </button>

              {showCompleted && (
                <div className="tasks-list-stack mt-3">
                  {completed.map(t => (
                    <TaskRow
                      key={t.id}
                      todo={t}
                      list={listMap[t.listId]}
                      expanded={expandedId === t.id}
                      onToggleExpand={() => toggleExpand(t.id)}
                      newSubtaskTitle={newSubtaskTitle}
                      setNewSubtaskTitle={setNewSubtaskTitle}
                      trashed={false}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── New Task Full Dialog Modal ───────────────────────────────── */}
      {createModalOpen && (
        <CreateTaskModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          defaultListId={currentListId || inboxListId() || 'inbox'}
          lists={lists}
        />
      )}
    </div>
  );
};

/* ── KANBAN BOARD COMPONENT ────────────────────────────────────────── */

const KANBAN_COLUMNS: KanbanColumn<TaskStatus>[] = [
  { id: 'none',        label: 'Not Started',       color: 'var(--ink2)' },
  { id: 'in_progress', label: 'In Progress',       color: 'var(--blue)' },
  { id: 'in_review',   label: 'Testing / Review',  color: 'var(--gold)' },
  { id: 'waiting',     label: 'Awaiting Feedback', color: 'var(--purple)' },
  { id: 'completed',   label: 'Completed',         color: 'var(--green)' },
];

interface TaskKanbanCard extends KanbanCardData { todo: Todo; }

function TasksKanbanBoard({ todos, listMap, onTaskClick }: {
  todos: Todo[]; listMap: Record<string, { id: string; name: string; color: string }>;
  onTaskClick: (id: string) => void;
}) {
  const items: TaskKanbanCard[] = useMemo(() =>
    todos.map(t => ({
      id: t.id,
      columnId: (t.completed || t.status === 'completed') ? 'completed' : t.status,
      todo: t,
    })),
    [todos],
  );

  return (
    <KanbanBoard<TaskKanbanCard, TaskStatus>
      columns={KANBAN_COLUMNS}
      items={items}
      emptyMessage="No tasks in this lane"
      onDrop={(itemId, _from, toCol) => {
        updateTodo(itemId, toCol === 'completed' ? { status: toCol, completed: true } : { status: toCol as TaskStatus, completed: false });
      }}
      renderCard={(item) => {
        const t = item.todo;
        const list = listMap[t.listId];
        return (
          <div onClick={() => onTaskClick(t.id)} className="cursor-pointer">
            <div className="kb-card-topline flex items-center gap-1.5 mb-2">
              {t.priority && (
                <Badge variant={t.priority === 'urgent' ? 'error' : t.priority === 'high' ? 'warning' : t.priority === 'medium' ? 'info' : 'gray'}>
                  {t.priority}
                </Badge>
              )}
              {list && (
                <span className="ml-auto text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: list.color }} />
                  {list.name}
                </span>
              )}
            </div>

            <div className="kb-card-title font-semibold text-sm leading-snug mb-2">{t.title}</div>

            {t.subtasks.length > 0 && (
              <div className="mb-2.5">
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                  <span>Subtasks</span>
                  <span>{t.subtasks.filter(s => s.completed).length}/{t.subtasks.length}</span>
                </div>
                <div className="h-1 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full bg-teal-600 dark:bg-teal-400 rounded-full"
                    style={{ width: `${Math.round((t.subtasks.filter(s => s.completed).length / t.subtasks.length) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="kb-card-meta flex items-center justify-between pt-2 border-t border-border/60 text-xs">
              <span className={`inline-flex items-center gap-1 ${isOverdue(t.due) ? 'text-red-600 dark:text-red-400 font-bold' : 'text-muted-foreground'}`}>
                <Icon name="calendar" size={12} />
                {t.due || 'No date'}
              </span>
              <TaskTimerWidget todo={t} />
            </div>
          </div>
        );
      }}
    />
  );
}

/* ── LIVE TIMER STOPWATCH WIDGET ───────────────────────────────────── */

function TaskTimerWidget({ todo }: { todo: Todo }) {
  const isTimerActive = !!todo.timerStartedAt;
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!isTimerActive || !todo.timerStartedAt) return;
    const start = new Date(todo.timerStartedAt).getTime();
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerActive, todo.timerStartedAt]);

  function toggleTimer(e: React.MouseEvent) {
    e.stopPropagation();
    if (isTimerActive) {
      stopTaskTimer(todo.id);
    } else {
      startTaskTimer(todo.id);
    }
  }

  function fmtStopwatch(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return (
    <button
      type="button"
      onClick={toggleTimer}
      title={isTimerActive ? 'Stop live timer' : 'Start stopwatch'}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold transition-all ${
        isTimerActive
          ? 'bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/30 animate-pulse'
          : 'bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground'
      }`}
      data-ui-native-button=""
    >
      <Icon name={isTimerActive ? 'clock' : 'play'} size={10} />
      <span>{isTimerActive ? fmtStopwatch(elapsedSec) : formatMinutes(todo.timeLoggedMinutes)}</span>
    </button>
  );
}

/* ── CREATE TASK MODAL ──────────────────────────────────────────────── */

function CreateTaskModal({ open, onClose, defaultListId, lists }: {
  open: boolean; onClose: () => void; defaultListId: string; lists: any[];
}) {
  const [title, setTitle] = useState('');
  const [listId, setListId] = useState(defaultListId);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [status, setStatus] = useState<TaskStatus>('none');
  const [due, setDue] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [assignee, setAssignee] = useState<PickerItem | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addTodo({
      title: title.trim(),
      listId,
      priority,
      status,
      due: due || undefined,
      notes: notes.trim() || undefined,
      assigneeId: assignee?.id,
      assigneeName: assignee?.label
    });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Create New Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="flex flex-col gap-4 mt-2">
          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1.5">Subject / Task Name *</label>
            <input data-ui-field="input"
              type="text"
              required
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Prepare customs documentation for shipment #1042"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1.5">Task List</label>
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger className="w-full text-xs h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {lists.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1.5">Priority</label>
              <Select value={priority} onValueChange={v => setPriority(v as TaskPriority)}>
                <SelectTrigger className="w-full text-xs h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1.5">Initial Status</label>
              <Select value={status} onValueChange={v => setStatus(v as TaskStatus)}>
                <SelectTrigger className="w-full text-xs h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="in_review">Testing / Review</SelectItem>
                  <SelectItem value="waiting">Awaiting Feedback</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1.5">Due Date</label>
              <DatePicker
                date={parseDateOnly(due)}
                onChange={d => setDue(toDateOnlyString(d))}
                placeholder="Select date"
                triggerClassName="w-full h-9 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1.5">Assignee</label>
            <EntityPicker
              value={assignee}
              onChange={setAssignee}
              search={searchColleagues}
              placeholder="Assign to colleague…"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1.5">Description / Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add detailed task instructions, checklist details, or links…"
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background resize-y focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal"
            />
          </div>

          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-border/60">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="font-semibold">Create Task</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── LINKED TASK ROW (From other apps) ──────────────────────────────── */

function LinkedTaskRow({ task }: { task: import('../data/calendarStore.js').LinkedTask }) {
  return (
    <Link
      to={task.path}
      className="flex items-center gap-3 p-3.5 bg-card hover:bg-card/80 border border-border rounded-xl transition-all shadow-xs group"
    >
      <div className="w-8 h-8 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0">
        <Icon name="externalLink" size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground group-hover:text-teal truncate transition-colors">
          {task.title}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
          <Badge variant="gray" className="text-[10px] py-0 px-1.5">{task.sourceApp}</Badge>
          <span>{task.sourceLabel}</span>
          {task.due && <span className="text-muted-foreground/80">· Due {task.due}</span>}
        </div>
      </div>
      <Icon name="chevronRight" size={14} className="text-muted-foreground/50 group-hover:text-foreground shrink-0 transition-colors" />
    </Link>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

/* ── UPCOMING GROUPED VIEW ──────────────────────────────────────────── */

function UpcomingGrouped({ todos, listMap, expandedId, onToggleExpand, newSubtaskTitle, setNewSubtaskTitle }: {
  todos: Todo[]; listMap: Record<string, { id: string; name: string; color: string }>;
  expandedId: string | null; onToggleExpand: (id: string) => void;
  newSubtaskTitle: string; setNewSubtaskTitle: (v: string) => void;
}) {
  const groups = new Map<string, Todo[]>();
  for (const t of todos) {
    const key = t.due!;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  const sortedKeys = [...groups.keys()].sort();

  return (
    <div className="flex flex-col gap-6">
      {sortedKeys.map(key => {
        const isPast = isOverdue(key);
        const isCurrentDay = isDueToday(key);
        return (
          <div key={key}>
            <div className="flex items-center gap-2.5 mb-2.5">
              <span className={`text-sm font-bold flex items-center gap-2 ${
                isPast ? 'text-red-600 dark:text-red-400' : isCurrentDay ? 'text-teal-600 dark:text-teal-400 font-extrabold' : 'text-foreground'
              }`}>
                <Icon name="calendar" size={14} />
                {dateGroupLabel(key)}
              </span>
              <Badge variant={isPast ? 'error' : isCurrentDay ? 'brand' : 'gray'} className="text-[10px]">
                {groups.get(key)!.length}
              </Badge>
            </div>
            <div className="tasks-list-stack">
              {groups.get(key)!.map(t => (
                <TaskRow
                  key={t.id}
                  todo={t}
                  list={listMap[t.listId]}
                  expanded={expandedId === t.id}
                  onToggleExpand={() => onToggleExpand(t.id)}
                  newSubtaskTitle={newSubtaskTitle}
                  setNewSubtaskTitle={setNewSubtaskTitle}
                  trashed={false}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── INDIVIDUAL TASK ROW ────────────────────────────────────────────── */

function TaskRow({ todo, list, expanded, onToggleExpand, newSubtaskTitle, setNewSubtaskTitle, trashed }: {
  todo: Todo; list?: { id: string; name: string; color: string };
  expanded: boolean; onToggleExpand: () => void;
  newSubtaskTitle: string; setNewSubtaskTitle: (v: string) => void;
  trashed: boolean;
}) {
  const { user } = useAuth();
  const entitlements = useEntitlements();
  const statusMeta = STATUS_META[todo.status];
  const priorityMeta = PRIORITY_META[todo.priority || 'medium'];
  const doneSubtasks = todo.subtasks.filter(s => s.completed).length;
  const [newTag, setNewTag] = useState('');
  const [reminderOpen, setReminderOpen] = useState(false);
  const readOnly = todo.access === 'viewer';
  const isAssignedToMe = !todo.isOwner && !!user?.id && todo.assigneeId === user.id;

  function addTag() {
    const tag = newTag.trim().replace(/^#/, '');
    if (tag && !todo.tags.includes(tag)) updateTodo(todo.id, { tags: [...todo.tags, tag] });
    setNewTag('');
  }

  function removeTag(tag: string) {
    updateTodo(todo.id, { tags: todo.tags.filter(t => t !== tag) });
  }

  return (
    <div
      id={`task-${todo.id}`}
      className={`task-item-card ${expanded ? 'task-item-card--expanded' : ''} ${todo.completed ? 'task-item-card--completed' : ''}`}
    >
      <div className="task-item-primary-row" onClick={onToggleExpand}>
        
        {/* Drag handle */}
        {!trashed && (
          <span className="task-drag-handle" title="Drag to reorder" onClick={e => e.stopPropagation()}>
            <Icon name="moreVertical" size={14} />
          </span>
        )}

        {/* Checkbox */}
        {trashed ? (
          <Icon name="trash" size={16} className="text-muted-foreground shrink-0" />
        ) : (
          <button
            type="button"
            disabled={readOnly}
            onClick={e => {
              e.stopPropagation();
              if (!readOnly) updateTodo(todo.id, { completed: !todo.completed });
            }}
            title={readOnly ? 'View-only access' : todo.completed ? 'Mark incomplete' : 'Mark complete'}
            className={`task-checkbox-btn ${todo.completed ? 'task-checkbox-btn--checked' : ''}`}
            data-ui-native-button=""
          >
            {todo.completed && <Icon name="check" size={12} color="#ffffff" />}
          </button>
        )}

        {/* Star Button */}
        {!trashed && (
          <button
            type="button"
            disabled={readOnly}
            onClick={e => {
              e.stopPropagation();
              if (!readOnly) updateTodo(todo.id, { starred: !todo.starred });
            }}
            title={todo.starred ? 'Unstar task' : 'Star task'}
            className={`task-star-btn ${todo.starred ? 'task-star-btn--active' : ''}`}
            data-ui-native-button=""
          >
            <Icon name="star" size={14} />
          </button>
        )}

        {/* Main Content Column */}
        <div className="task-main-col">
          <div className="task-title-line">
            <span className={`task-title-text ${todo.completed ? 'task-title-text--completed' : ''}`}>
              {todo.title}
            </span>

            {/* Priority Badge */}
            {todo.priority && (
              <span
                style={{ background: priorityMeta.bg, color: priorityMeta.color }}
                className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider"
              >
                <Icon name={priorityMeta.icon} size={10} />
                {priorityMeta.label}
              </span>
            )}

            {/* List pill */}
            {list && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground ml-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: list.color }} />
                {list.name}
              </span>
            )}
          </div>

          <div className="task-meta-line">
            {/* Due Date Indicator */}
            {todo.due && (
              <span className={`task-meta-badge ${
                isOverdue(todo.due) && !todo.completed
                  ? 'task-meta-badge--overdue'
                  : isDueToday(todo.due) && !todo.completed
                  ? 'task-meta-badge--today'
                  : ''
              }`}>
                <Icon name="calendar" size={11} />
                {isOverdue(todo.due) && !todo.completed ? `Overdue (${todo.due})` : isDueToday(todo.due) ? 'Due Today' : `Due ${todo.due}`}
              </span>
            )}

            {/* Subtasks Fraction */}
            {todo.subtasks.length > 0 && (
              <span className="task-meta-badge">
                <Icon name="checkCircle" size={11} />
                {doneSubtasks}/{todo.subtasks.length} subtasks
              </span>
            )}

            {/* Notes preview icon */}
            {todo.notes && (
              <span className="task-meta-badge" title="Has notes">
                <Icon name="fileText" size={11} />
              </span>
            )}

            {/* Reminder */}
            {todo.reminder && (
              <span className="task-meta-badge text-teal-600 dark:text-teal-400" title="Reminder set">
                <Icon name="clock" size={11} />
              </span>
            )}

            {/* Assignee Avatar & Name */}
            {todo.assigneeName && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-300 bg-teal/10 px-2 py-0.5 rounded-full">
                <PersonAvatar userId={todo.assigneeId} name={todo.assigneeName} size={14} />
                <span>{todo.assigneeName}</span>
              </span>
            )}

            {/* Tags */}
            {todo.tags.map(tag => (
              <span key={tag} className="task-tag-chip">
                #{tag}
              </span>
            ))}
          </div>
        </div>

        {/* Right Action Widgets */}
        <div className="task-right-actions" onClick={e => e.stopPropagation()}>
          {/* Stopwatch Live Timer */}
          {!trashed && <TaskTimerWidget todo={todo} />}

          {/* Status Dropdown Badge */}
          {!trashed && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={readOnly}
                  className="cursor-pointer transition-transform hover:scale-105"
                  data-ui-native-button=""
                >
                  <Badge variant={statusMeta.variant} className="font-semibold text-xs py-0.5 px-2.5">
                    {statusMeta.label}
                  </Badge>
                </button>
              </DropdownMenuTrigger>
              <StatusMenuItems todoId={todo.id} />
            </DropdownMenu>
          )}

          {/* Trashed Actions */}
          {trashed ? (
            todo.isOwner ? (
              <div className="flex gap-1">
                <Tip label="Restore task">
                  <button
                    type="button"
                    onClick={() => restoreTodo(todo.id)}
                    className="task-icon-action-btn hover:text-teal"
                    data-ui-native-button=""
                  >
                    <Icon name="refresh" size={15} />
                  </button>
                </Tip>
                <Tip label="Delete forever">
                  <button
                    type="button"
                    onClick={() => purgeTodo(todo.id)}
                    className="task-icon-action-btn hover:text-red-600"
                    data-ui-native-button=""
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </Tip>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Deleted by owner</span>
            )
          ) : readOnly ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="task-icon-action-btn"
                  title="More actions"
                  data-ui-native-button=""
                >
                  <Icon name="moreVertical" size={15} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => updateTodo(todo.id, { starred: !todo.starred })}>
                  <Icon name="star" size={13} className="text-muted-foreground" />
                  <span>{todo.starred ? 'Unstar' : 'Star'}</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => updateTodo(todo.id, { priority: 'urgent' })}>
                  <span className="w-2 h-2 rounded-full bg-red-500 mr-2" /> Urgent Priority
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => updateTodo(todo.id, { priority: 'high' })}>
                  <span className="w-2 h-2 rounded-full bg-orange-500 mr-2" /> High Priority
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => updateTodo(todo.id, { priority: 'medium' })}>
                  <span className="w-2 h-2 rounded-full bg-amber-500 mr-2" /> Medium Priority
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => updateTodo(todo.id, { priority: 'low' })}>
                  <span className="w-2 h-2 rounded-full bg-slate-400 mr-2" /> Low Priority
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                {todo.isOwner && (
                  <DropdownMenuItem onClick={() => updateTodo(todo.id, { someday: !todo.someday, due: todo.someday ? todo.due : undefined })}>
                    <Icon name="clock" size={13} className="text-muted-foreground" />
                    <span>{todo.someday ? 'Remove from Someday' : 'Move to Someday'}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => cloneTask(todo.id)}>
                  <Icon name="copy" size={13} className="text-muted-foreground" />
                  <span>Clone Task</span>
                </DropdownMenuItem>
                {todo.isOwner && (
                  <DropdownMenuItem onClick={() => deleteTodo(todo.id)} className="text-destructive">
                    <Icon name="trash" size={13} />
                    <span>Delete Task</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Chevron expand */}
          <button data-ui-native-button=""
            type="button"
            onClick={onToggleExpand}
            className="task-icon-action-btn"
            title={expanded ? 'Collapse details' : 'Expand details'}
          >
            <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={15} />
          </button>
        </div>
      </div>

      {/* ── Expanded Task Detail Deck ─────────────────────────────────── */}
      {expanded && (
        <div className="task-detail-deck">
          {/* Controls Bar */}
          <div className="task-detail-meta-grid">
            <DatePicker
              date={parseDateOnly(todo.due)}
              onChange={d => updateTodo(todo.id, { due: toDateOnlyString(d) || undefined, someday: d ? false : todo.someday })}
              placeholder="Set due date"
              triggerClassName="w-auto h-8 text-xs font-semibold rounded-lg bg-card"
              disabled={trashed || readOnly}
            />

            <Select
              value={todo.priority || 'medium'}
              disabled={trashed || readOnly}
              onValueChange={v => updateTodo(todo.id, { priority: v as TaskPriority })}
            >
              <SelectTrigger className="w-auto min-h-8 text-xs font-semibold rounded-lg bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low Priority</SelectItem>
                <SelectItem value="medium">Medium Priority</SelectItem>
                <SelectItem value="high">High Priority</SelectItem>
                <SelectItem value="urgent">Urgent Priority</SelectItem>
              </SelectContent>
            </Select>

            <ReminderPicker
              value={todo.reminder ?? null}
              onChange={v => updateTodo(todo.id, { reminder: v })}
              open={reminderOpen}
              onOpenChange={setReminderOpen}
              triggerStyle={{
                background: 'var(--card-bg, #ffffff)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                color: 'var(--ink2)',
                padding: '4px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                height: 32,
                boxSizing: 'border-box'
              }}
            />

            {entitlements?.features.projects && (
              <>
                <Select
                  value={todo.recurrenceRule?.freq || 'none'}
                  disabled={trashed || readOnly}
                  onValueChange={v => updateTodo(todo.id, { recurrenceRule: v === 'none' ? null : { freq: v as 'daily' | 'weekly' | 'monthly', interval: todo.recurrenceRule?.interval || 1 } })}
                >
                  <SelectTrigger className="w-auto min-h-8 text-xs font-semibold rounded-lg bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Doesn't repeat</SelectItem>
                    <SelectItem value="daily">Repeats daily</SelectItem>
                    <SelectItem value="weekly">Repeats weekly</SelectItem>
                    <SelectItem value="monthly">Repeats monthly</SelectItem>
                  </SelectContent>
                </Select>
                {todo.recurrenceRule && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                    every
                    <input data-ui-field="input"
                      type="number"
                      min={1}
                      max={365}
                      value={todo.recurrenceRule.interval}
                      disabled={trashed || readOnly}
                      onChange={e => updateTodo(todo.id, { recurrenceRule: { ...todo.recurrenceRule!, interval: Math.max(1, Number(e.target.value) || 1) } })}
                      className="w-12 px-1.5 py-1 border border-border rounded text-xs bg-card text-center"
                    />
                  </span>
                )}
              </>
            )}

            {/* Assignee */}
            {!trashed && (
              todo.isOwner ? (
                <div className="w-56">
                  <EntityPicker
                    value={todo.assigneeId ? { id: todo.assigneeId, label: todo.assigneeName || 'Assigned' } : null}
                    onChange={item => updateTodo(todo.id, { assigneeId: item?.id ?? null, assigneeName: item?.label })}
                    search={searchColleagues}
                    placeholder="Assign to colleague…"
                  />
                </div>
              ) : isAssignedToMe ? (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-card px-2.5 py-1.5 rounded-lg border border-border">
                  <PersonAvatar name={todo.ownerName ?? 'a colleague'} size={16} />
                  <span>Assigned by {todo.ownerName ?? 'colleague'}</span>
                </div>
              ) : todo.assigneeName ? (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-card px-2.5 py-1.5 rounded-lg border border-border">
                  <PersonAvatar userId={todo.assigneeId} name={todo.assigneeName} size={16} />
                  <span>Assigned to {todo.assigneeName}</span>
                </div>
              ) : null
            )}
          </div>

          {/* Description & Notes */}
          <div>
            <textarea data-ui-field="textarea"
              value={todo.notes || ''}
              onChange={e => updateTodo(todo.id, { notes: e.target.value })}
              placeholder="Add detailed task description, checklist steps or notes…"
              rows={3}
              disabled={trashed || readOnly}
              className="task-detail-notes-input"
            />
          </div>

          {/* Meeting Link Panel */}
          {!trashed && !readOnly && (
            <MeetingLinkPanel
              title={todo.title}
              value={{ meetingUrl: todo.meetingUrl ?? null, blissMeetingId: todo.blissMeetingId ?? null }}
              onChange={next => updateTodo(todo.id, { meetingUrl: next.meetingUrl, blissMeetingId: next.blissMeetingId })}
            />
          )}

          {/* Tags */}
          {!trashed && (
            <div className="flex flex-wrap gap-1.5 items-center">
              {todo.tags.map(tag => (
                <span key={tag} className="task-tag-chip">
                  #{tag}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-red-500 cursor-pointer p-0.5 ml-0.5"
                      data-ui-native-button=""
                    >
                      <Icon name="x" size={10} />
                    </button>
                  )}
                </span>
              ))}
              {!readOnly && (
                <input data-ui-field="input"
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addTag(); }}
                  onBlur={() => newTag.trim() && addTag()}
                  placeholder="+ add tag"
                  className="w-20 px-2 py-0.5 text-xs border border-dashed border-border rounded-md bg-transparent focus:outline-none focus:border-teal"
                />
              )}
            </div>
          )}

          {/* Subtasks Checklist */}
          <div className="task-subtasks-card">
            <div className="task-subtasks-header">
              <span className="task-subtasks-title">Subtasks & Checklist</span>
              {todo.subtasks.length > 0 && (
                <span className="text-xs font-bold text-teal">
                  {Math.round((doneSubtasks / todo.subtasks.length) * 100)}% Complete
                </span>
              )}
            </div>

            {todo.subtasks.length > 0 && (
              <div className="w-full h-1.5 rounded-full bg-border overflow-hidden mb-1">
                <div
                  className="h-full bg-teal rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((doneSubtasks / todo.subtasks.length) * 100)}%` }}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {todo.subtasks.map(s => (
                <div key={s.id} className="task-subtask-row">
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => !readOnly && updateSubtask(todo.id, s.id, { completed: !s.completed })}
                    className={`task-subtask-check ${s.completed ? 'task-subtask-check--checked' : ''}`}
                    data-ui-native-button=""
                  >
                    {s.completed && <Icon name="check" size={10} color="#ffffff" />}
                  </button>
                  <span className={`flex-1 text-sm ${s.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {s.title}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => deleteSubtask(todo.id, s.id)}
                      className="text-muted-foreground hover:text-red-500 p-1"
                      title="Delete subtask"
                      data-ui-native-button=""
                    >
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {!trashed && !readOnly && (
              <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                <Icon name="plus" size={13} className="text-muted-foreground" />
                <input data-ui-field="input"
                  value={newSubtaskTitle}
                  onChange={e => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                      addSubtask(todo.id, newSubtaskTitle.trim());
                      setNewSubtaskTitle('');
                    }
                  }}
                  placeholder="Add a new checklist item… press Enter"
                  className="flex-1 text-xs bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
                />
              </div>
            )}
          </div>

          {/* Comments & Activity Stream */}
          {!trashed && <CommentsSection taskId={todo.id} readOnly={readOnly} />}
        </div>
      )}
    </div>
  );
}

/* ── COMMENTS & ACTIVITY SECTION ────────────────────────────────────── */

function CommentsSection({ taskId, readOnly }: { taskId: string; readOnly: boolean }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<TodoComment[] | null>(null);
  const [colleagues, setColleagues] = useState<MentionUser[]>([]);
  const [draft, setDraft] = useState('');
  const [draftMentions, setDraftMentions] = useState<{ user_id: string; name: string }[]>([]);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTodoComments(taskId).then(rows => { if (!cancelled) setComments(rows); }).catch(() => { if (!cancelled) setComments([]); });
    fetchColleaguesForMentions().then(rows => { if (!cancelled) setColleagues(rows); }).catch(() => {});
    return () => { cancelled = true; };
  }, [taskId]);

  async function submit() {
    if (!draft.trim() || posting) return;
    setPosting(true);
    try {
      const comment = await postTodoComment(taskId, draft.trim(), draftMentions);
      setComments(prev => [...(prev ?? []), comment]);
      setDraft('');
      setDraftMentions([]);
    } catch {
    } finally {
      setPosting(false);
    }
  }

  async function remove(commentId: string) {
    setComments(prev => (prev ?? []).filter(c => c.id !== commentId));
    await deleteTodoComment(taskId, commentId).catch(() => {});
  }

  return (
    <div className="task-comments-deck">
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
        Comments & Discussion {comments?.length ? `(${comments.length})` : ''}
      </div>

      {comments === null ? (
        <div className="text-xs text-muted-foreground py-2">Loading discussion…</div>
      ) : comments.length === 0 ? (
        <div className="text-xs text-muted-foreground/70 italic py-1">No comments yet. Type below to start a discussion.</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {comments.map(c => (
            <div key={c.id} className="flex gap-2.5 items-start bg-card p-2.5 rounded-lg border border-border/60">
              <div className="w-6 h-6 rounded-full bg-teal-500/10 text-teal flex items-center justify-center text-[10px] font-bold shrink-0">
                {initials(c.authorName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-foreground">{c.authorName}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{c.content}</div>
              </div>
              {c.authorId === user?.id && (
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  title="Delete comment"
                  className="text-muted-foreground hover:text-red-500 p-1 shrink-0"
                  data-ui-native-button=""
                >
                  <Icon name="x" size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="mt-1">
          <MentionInput
            value={draft}
            onChange={(v, m) => { setDraft(v); setDraftMentions(m); }}
            users={colleagues}
            placeholder="Write a comment… type @ to mention a team member"
            disabled={posting}
            onSubmit={submit}
          />
        </div>
      )}
    </div>
  );
}

/* ── STATUS MENU ITEMS HELPER ───────────────────────────────────────── */

function StatusMenuItems({ todoId }: { todoId: string }) {
  return (
    <DropdownMenuContent align="end">
      {(Object.keys(STATUS_META) as TaskStatus[]).map(s => (
        <DropdownMenuItem
          key={s}
          onClick={() => updateTodo(todoId, s === 'completed' ? { status: s, completed: true } : { status: s, completed: false })}
          className="flex items-center gap-2 cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full" style={{ background: STATUS_META[s].dotColor }} />
          <span>{STATUS_META[s].label}</span>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );
}
