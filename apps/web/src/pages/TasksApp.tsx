import React, { useState, useMemo, useEffect } from 'react';
import { Icon, type IconName } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import {
  useTodos, useLists, addTodo, updateTodo, deleteTodo, restoreTodo, purgeTodo, reorderTodo,
  addSubtask, updateSubtask, deleteSubtask,
  useActiveTaskView, setActiveTaskView, useEvents, useLinkedTasks, inboxListId,
  fetchTodoComments, postTodoComment, deleteTodoComment,
  Todo, TaskStatus, TaskPriority, TodoComment,
} from '../data/calendarStore.js';
import { Link } from 'react-router-dom';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { ReminderPicker } from '../components/ReminderPicker.js';
import { Badge } from '../components/ui/badge.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '../components/ui/dropdown-menu.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { MentionInput, type MentionUser } from '../components/MentionInput.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import { Button } from '../components/ui/button.js';

/* ── STATUS & PRIORITY META (Perfex CRM Standard) ──────────────────── */

const STATUS_META: Record<TaskStatus, { label: string; variant: 'gray' | 'brand' | 'warning' | 'info' | 'success'; color: string; bg: string }> = {
  none:        { label: 'Not Started', variant: 'gray',    color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
  in_progress: { label: 'In Progress', variant: 'brand',   color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
  in_review:   { label: 'Testing / Review', variant: 'warning', color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
  waiting:     { label: 'Awaiting Feedback', variant: 'info',  color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  completed:   { label: 'Complete',    variant: 'success', color: '#059669', bg: 'rgba(5,150,105,0.1)' },
};

const PRIORITY_META: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#64748b', bg: '#f1f5f9' },
  medium: { label: 'Medium', color: '#d97706', bg: '#fef3c7' },
  high:   { label: 'High',   color: '#ea580c', bg: '#ffedd5' },
  urgent: { label: 'Urgent', color: '#dc2626', bg: '#fee2e2' },
};

function todayStr() { return new Date().toISOString().slice(0, 10); }
function isOverdue(due?: string) { return !!due && due < todayStr(); }

function dateGroupLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(todayStr() + 'T00:00:00');
  const diffDays = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 0) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' (overdue)';
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

const VIEW_TITLES: Record<string, string> = {
  inbox: 'Inbox', today: 'Today', upcoming: 'Upcoming', anytime: 'Anytime', someday: 'Someday',
  assigned: 'Assigned to me', trash: 'Trash',
};

async function searchColleagues(q: string): Promise<PickerItem[]> {
  const rows = await apiFetch(`/v1/hr/staff?search=${encodeURIComponent(q)}`).catch(() => []);
  return (rows || []).map((u: any) => ({ id: u.id, label: u.name, sublabel: u.email }));
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
  const allTodos = useTodos();
  const lists = useLists();
  const linked = useLinkedTasks();
  const view = useActiveTaskView();
  const isMobile = useIsMobile();

  const [displayMode, setDisplayMode] = useState<'list' | 'kanban'>('list');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const listMap = useMemo(() => Object.fromEntries(lists.map(l => [l.id, l])), [lists]);
  const active = useMemo(() => allTodos.filter(t => !t.deletedAt), [allTodos]);

  const currentListId = view.startsWith('list:') ? view.slice(5) : null;
  const viewTitle = currentListId ? (listMap[currentListId]?.name || 'List') : (VIEW_TITLES[view] || 'Tasks');

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

  /* Advanced Filter Toolbar Applying Status, Priority & Search */
  const filteredRows = useMemo(() => {
    return baseRows.filter(t => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterPriority !== 'all' && (t.priority || 'medium') !== filterPriority) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchNotes = t.notes?.toLowerCase().includes(q);
        const matchTag = t.tags.some(tag => tag.toLowerCase().includes(q));
        if (!matchTitle && !matchNotes && !matchTag) return false;
      }
      return true;
    });
  }, [baseRows, filterStatus, filterPriority, searchQuery]);

  const incomplete = useMemo(() => {
    return [...filteredRows.filter(t => !t.completed)].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.order - b.order);
  }, [filteredRows]);

  const completed = useMemo(() => filteredRows.filter(t => t.completed), [filteredRows]);

  const linkedShown = view === 'inbox' ? linked
    : view === 'today' ? linked.filter(l => l.due === todayStr() || (l.due && l.due < todayStr()))
    : view === 'upcoming' ? linked.filter(l => !!l.due)
    : [];

  /* Perfex Stat Metrics Counts */
  const counts = useMemo(() => {
    const total = active.length;
    const notStarted = active.filter(t => t.status === 'none' && !t.completed).length;
    const inProgress = active.filter(t => t.status === 'in_progress' && !t.completed).length;
    const inReview = active.filter(t => t.status === 'in_review' && !t.completed).length;
    const waiting = active.filter(t => t.status === 'waiting' && !t.completed).length;
    const complete = active.filter(t => t.completed || t.status === 'completed').length;
    return { total, notStarted, inProgress, inReview, waiting, complete };
  }, [active]);

  function handleAddQuick() {
    if (!newTitle.trim()) return;
    const patch: Partial<Todo> & { title: string } = { title: newTitle.trim(), listId: currentListId || inboxListId() };
    if (view === 'today') patch.due = todayStr();
    if (view === 'someday') patch.someday = true;
    addTodo(patch);
    setNewTitle('');
  }

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

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        
        {/* ── Top Header Title & Actions ── */}
        <div style={{ padding: isMobile ? '16px 16px 0' : '24px 32px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>
              {viewTitle}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '4px 0 0 0' }}>
              {view === 'trash' ? 'Deleted tasks — restore or remove permanently.' : `${incomplete.length} active tasks • ${completed.length} completed`}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Display Mode Switcher */}
            <div style={{ display: 'flex', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
              <button
                type="button"
                onClick={() => setDisplayMode('list')}
                title="List View"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 6, border: 'none',
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  background: displayMode === 'list' ? 'var(--teal)' : 'transparent',
                  color: displayMode === 'list' ? '#fff' : 'var(--ink2)'
                }}
              >
                <Icon name="list" size={14} /> List
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('kanban')}
                title="Kanban Board View"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 6, border: 'none',
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  background: displayMode === 'kanban' ? 'var(--teal)' : 'transparent',
                  color: displayMode === 'kanban' ? '#fff' : 'var(--ink2)'
                }}
              >
                <Icon name="layers" size={14} /> Kanban
              </button>
            </div>

            <Button size="sm" variant="outline" onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="download" size={14} /> Export CSV
            </Button>

            {canAdd && (
              <Button size="sm" onClick={() => setCreateModalOpen(true)} style={{ background: 'var(--teal)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="plus" size={15} /> + New Task
              </Button>
            )}
          </div>
        </div>

        {/* ── Perfex CRM Stat Summary Bar (5 KPI Cards) ── */}
        <div style={{ padding: isMobile ? '12px 16px' : '16px 32px 8px 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 12 }}>
            
            <button type="button" onClick={() => setFilterStatus('none')} style={{
              background: 'var(--white)', border: `1px solid ${filterStatus === 'none' ? 'var(--teal)' : 'var(--border)'}`,
              borderRadius: 10, padding: '10px 14px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s'
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Not Started</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>{counts.notStarted}</div>
            </button>

            <button type="button" onClick={() => setFilterStatus('in_progress')} style={{
              background: 'var(--white)', border: `1px solid ${filterStatus === 'in_progress' ? 'var(--teal)' : 'var(--border)'}`,
              borderRadius: 10, padding: '10px 14px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s'
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>In Progress</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#2563eb', marginTop: 2 }}>{counts.inProgress}</div>
            </button>

            <button type="button" onClick={() => setFilterStatus('in_review')} style={{
              background: 'var(--white)', border: `1px solid ${filterStatus === 'in_review' ? 'var(--teal)' : 'var(--border)'}`,
              borderRadius: 10, padding: '10px 14px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s'
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', textTransform: 'uppercase' }}>Testing / Review</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#d97706', marginTop: 2 }}>{counts.inReview}</div>
            </button>

            <button type="button" onClick={() => setFilterStatus('waiting')} style={{
              background: 'var(--white)', border: `1px solid ${filterStatus === 'waiting' ? 'var(--teal)' : 'var(--border)'}`,
              borderRadius: 10, padding: '10px 14px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s'
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>Awaiting Feedback</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#7c3aed', marginTop: 2 }}>{counts.waiting}</div>
            </button>

            <button type="button" onClick={() => setFilterStatus('completed')} style={{
              background: 'var(--white)', border: `1px solid ${filterStatus === 'completed' ? 'var(--teal)' : 'var(--border)'}`,
              borderRadius: 10, padding: '10px 14px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s'
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>Completed</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#059669', marginTop: 2 }}>{counts.complete}</div>
            </button>

          </div>
        </div>

        {/* ── Advanced Filter & Search Toolbar ── */}
        <div style={{ padding: isMobile ? '8px 16px' : '8px 32px 16px 32px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Icon name="search" size={15} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search task title, notes, tags…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 12px 7px 32px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--white)', color: 'var(--ink)' }}
            />
          </div>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5, background: 'var(--white)', color: 'var(--ink)', fontWeight: 600 }}
          >
            <option value="all">All Statuses</option>
            <option value="none">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">Testing / Review</option>
            <option value="waiting">Awaiting Feedback</option>
            <option value="completed">Completed</option>
          </select>

          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5, background: 'var(--white)', color: 'var(--ink)', fontWeight: 600 }}
          >
            <option value="all">All Priorities</option>
            <option value="low">Low Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="high">High Priority</option>
            <option value="urgent">Urgent Priority</option>
          </select>

          {(filterStatus !== 'all' || filterPriority !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => { setFilterStatus('all'); setFilterPriority('all'); setSearchQuery(''); }}
              style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* ── Main View Content Area ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '0 16px 24px' : '0 32px 32px' }}>

          {/* QUICK ADD ROW (when in List Mode) */}
          {canAdd && displayMode === 'list' && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, background: 'var(--white)', padding: 10, borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <button type="button" onClick={handleAddQuick} title="Add task"
                style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--teal-l)', color: 'var(--teal)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="plus" size={16} />
              </button>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddQuick()}
                placeholder={currentListId ? `Add task to ${listMap[currentListId]?.name || 'list'}…` : 'Add quick task… (press Enter)'}
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent', color: 'var(--ink)' }}
              />
            </div>
          )}

          {linkedShown.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>From other apps</div>
              {linkedShown.map(l => <LinkedTaskRow key={l.id} task={l} />)}
            </div>
          )}

          {/* KANBAN BOARD VIEW */}
          {displayMode === 'kanban' ? (
            <TasksKanbanBoard todos={filteredRows} listMap={listMap} onTaskClick={id => toggleExpand(id)} />
          ) : (
            /* LIST VIEW */
            filteredRows.length === 0 && linkedShown.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink3)', fontSize: 14 }}>
                {view === 'trash' ? 'Trash is empty.' : 'No tasks match current filter options.'}
              </div>
            ) : view === 'upcoming' ? (
              <UpcomingGrouped todos={incomplete} listMap={listMap} expandedId={expandedId} onToggleExpand={toggleExpand}
                newSubtaskTitle={newSubtaskTitle} setNewSubtaskTitle={setNewSubtaskTitle} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {incomplete.map(t => (
                  <div key={t.id}
                    draggable={!isMobile && view !== 'trash'}
                    onDragStart={e => handleRowDragStart(e, t.id)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleRowDrop(e, t)}
                    style={{ opacity: draggingId === t.id ? 0.4 : 1, cursor: view !== 'trash' && !isMobile ? 'grab' : undefined }}
                  >
                    <TaskRow todo={t} list={listMap[t.listId]} expanded={expandedId === t.id} onToggleExpand={() => toggleExpand(t.id)}
                      newSubtaskTitle={newSubtaskTitle} setNewSubtaskTitle={setNewSubtaskTitle} trashed={view === 'trash'} />
                  </div>
                ))}
              </div>
            )
          )}

          {completed.length > 0 && view !== 'trash' && displayMode === 'list' && (
            <div style={{ marginTop: 24 }}>
              <button type="button" onClick={() => setShowCompleted(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 13, fontWeight: 600, padding: '6px 0' }}>
                <Icon name={showCompleted ? 'chevronDown' : 'chevronRight'} size={13} />
                Completed ({completed.length})
              </button>
              {showCompleted && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {completed.map(t => (
                    <TaskRow key={t.id} todo={t} list={listMap[t.listId]} expanded={expandedId === t.id} onToggleExpand={() => toggleExpand(t.id)}
                      newSubtaskTitle={newSubtaskTitle} setNewSubtaskTitle={setNewSubtaskTitle} trashed={false} />
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── New Task Full Dialog Modal (Perfex CRM Standard) ── */}
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

function TasksKanbanBoard({ todos, listMap, onTaskClick }: {
  todos: Todo[]; listMap: Record<string, { id: string; name: string; color: string }>;
  onTaskClick: (id: string) => void;
}) {
  const columns: { status: TaskStatus; title: string; color: string; bg: string }[] = [
    { status: 'none',        title: 'Not Started',       color: '#64748b', bg: '#f8fafc' },
    { status: 'in_progress', title: 'In Progress',       color: '#2563eb', bg: '#eff6ff' },
    { status: 'in_review',   title: 'Testing / Review',  color: '#d97706', bg: '#fffbeb' },
    { status: 'waiting',     title: 'Awaiting Feedback', color: '#7c3aed', bg: '#f5f3ff' },
    { status: 'completed',   title: 'Completed',         color: '#059669', bg: '#ecfdf5' },
  ];

  function handleKanbanDrop(e: React.DragEvent, newStatus: TaskStatus) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/kanban-task-id');
    if (taskId) {
      updateTodo(taskId, newStatus === 'completed' ? { status: newStatus, completed: true } : { status: newStatus, completed: false });
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, overflowX: 'auto', minHeight: 500, paddingBottom: 16 }}>
      {columns.map(col => {
        const colTodos = todos.filter(t => col.status === 'completed' ? (t.completed || t.status === 'completed') : (t.status === col.status && !t.completed));
        return (
          <div
            key={col.status}
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleKanbanDrop(e, col.status)}
            style={{
              background: 'var(--white)', borderRadius: 12, border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
            }}
          >
            {/* Column Header */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: col.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: col.color }}>{col.title}</span>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 10, background: 'var(--white)', color: col.color, border: '1px solid var(--border)' }}>
                {colTodos.length}
              </span>
            </div>

            {/* Column Cards Container */}
            <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
              {colTodos.map(t => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={e => e.dataTransfer.setData('text/kanban-task-id', t.id)}
                  onClick={() => onTaskClick(t.id)}
                  style={{
                    background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)',
                    padding: 12, cursor: 'grab', boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = col.color}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    {t.priority && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                        background: PRIORITY_META[t.priority]?.bg, color: PRIORITY_META[t.priority]?.color, textTransform: 'uppercase'
                      }}>
                        {t.priority}
                      </span>
                    )}
                    {listMap[t.listId] && (
                      <span style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: listMap[t.listId].color }} />
                        {listMap[t.listId].name}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 8, lineHeight: 1.35 }}>
                    {t.title}
                  </div>

                  {t.subtasks.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink3)', marginBottom: 3 }}>
                        <span>Subtasks</span>
                        <span>{t.subtasks.filter(s => s.completed).length}/{t.subtasks.length}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round((t.subtasks.filter(s => s.completed).length / t.subtasks.length) * 100)}%`, background: col.color }} />
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: isOverdue(t.due) ? 'var(--red)' : 'var(--ink3)', fontWeight: isOverdue(t.due) ? 700 : 400 }}>
                      {t.due ? `Due ${t.due}` : 'No due date'}
                    </div>

                    <TaskTimerWidget todo={t} />
                  </div>
                </div>
              ))}
              {colTodos.length === 0 && (
                <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink3)', border: '1px dashed var(--border)', borderRadius: 8 }}>
                  Drop tasks here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
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
      // Stop timer & compute logged minutes
      const now = new Date();
      const start = new Date(todo.timerStartedAt!).getTime();
      const diffMins = Math.max(1, Math.round((now.getTime() - start) / 60000));
      updateTodo(todo.id, {
        timerStartedAt: null,
        timeLoggedMinutes: (todo.timeLoggedMinutes || 0) + diffMins
      });
    } else {
      // Start timer
      updateTodo(todo.id, { timerStartedAt: new Date().toISOString() });
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
      title={isTimerActive ? 'Stop live timer' : 'Start live timer'}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 12,
        border: 'none', background: isTimerActive ? 'rgba(239,68,68,0.12)' : 'var(--bg)',
        color: isTimerActive ? 'var(--red)' : 'var(--ink2)', fontSize: 11, fontWeight: 700, cursor: 'pointer'
      }}
    >
      <Icon name={isTimerActive ? 'clock' : 'play'} size={10} />
      <span>{isTimerActive ? fmtStopwatch(elapsedSec) : formatMinutes(todo.timeLoggedMinutes)}</span>
    </button>
  );
}

/* ── CREATE TASK MODAL (Perfex CRM Standard) ────────────────────────── */

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
          <DialogTitle style={{ fontSize: 18, fontWeight: 800 }}>Create New Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Subject / Task Name *</label>
            <input
              type="text" required autoFocus
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Prepare customs documentation for shipment #1042"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Task List</label>
              <select
                value={listId} onChange={e => setListId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              >
                {lists.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Priority</label>
              <select
                value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Initial Status</label>
              <select
                value={status} onChange={e => setStatus(e.target.value as TaskStatus)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              >
                <option value="none">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="in_review">Testing / Review</option>
                <option value="waiting">Awaiting Feedback</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Due Date</label>
              <input
                type="date"
                value={due} onChange={e => setDue(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Assignee</label>
            <EntityPicker
              value={assignee}
              onChange={setAssignee}
              search={searchColleagues}
              placeholder="Assign to staff member…"
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Description / Notes</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Add detailed task instructions or checklist requirements…"
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" style={{ background: 'var(--teal)', color: '#fff' }}>Create Task</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── HELPER COMPONENTS (LinkedTaskRow, AvatarStack, MeetingsPanel, TaskRow, CommentsSection) ── */

function LinkedTaskRow({ task }: { task: import('../data/calendarStore.js').LinkedTask }) {
  return (
    <Link to={task.path} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textDecoration: 'none',
      background: 'var(--white)', borderRadius: 10, border: '1px dashed var(--border)',
    }}>
      <Icon name="externalLink" size={14} color="var(--ink3)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
          {task.sourceApp} · {task.sourceLabel}{task.due ? ` · Due ${task.due}` : ''}
        </div>
      </div>
    </Link>
  );
}

const EVENT_CATEGORY_COLOR: Record<string, string> = {
  work: '#1a73e8', personal: '#0f9d58', customs: '#ea580c', todo: 'var(--purple)',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function AvatarStack({ names }: { names: string[] }) {
  const shown = names.slice(0, 4);
  const extra = names.length - shown.length;
  return (
    <div style={{ display: 'flex' }}>
      {shown.map((n, i) => (
        <div key={i} title={n} style={{
          width: 26, height: 26, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700,
          border: '2px solid var(--white)', marginLeft: i === 0 ? 0 : -8,
        }}>
          {initials(n)}
        </div>
      ))}
      {extra > 0 && (
        <div style={{
          width: 26, height: 26, borderRadius: '50%', background: 'var(--bg)', color: 'var(--ink3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700,
          border: '2px solid var(--white)', marginLeft: -8,
        }}>
          +{extra}
        </div>
      )}
    </div>
  );
}



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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {sortedKeys.map(key => (
        <div key={key}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{new Date(key + 'T00:00:00').getDate()}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{dateGroupLabel(key)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups.get(key)!.map(t => (
              <TaskRow key={t.id} todo={t} list={listMap[t.listId]} expanded={expandedId === t.id} onToggleExpand={() => onToggleExpand(t.id)}
                newSubtaskTitle={newSubtaskTitle} setNewSubtaskTitle={setNewSubtaskTitle} trashed={false} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskRow({ todo, list, expanded, onToggleExpand, newSubtaskTitle, setNewSubtaskTitle, trashed }: {
  todo: Todo; list?: { id: string; name: string; color: string };
  expanded: boolean; onToggleExpand: () => void;
  newSubtaskTitle: string; setNewSubtaskTitle: (v: string) => void;
  trashed: boolean;
}) {
  const { user } = useAuth();
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
    <div className="list-row-accent" data-variant={!trashed && todo.status !== 'none' ? statusMeta.variant : undefined}
      style={{
        background: 'var(--white)', borderRadius: 10, overflow: 'hidden',
        borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', opacity: todo.completed ? 0.6 : 1 }}>
        {trashed ? (
          <Icon name="trash" size={16} color="var(--ink3)" />
        ) : (
          <button
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && updateTodo(todo.id, { completed: !todo.completed })}
            title={readOnly ? 'You have view-only access to this list' : undefined}
            style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              border: todo.completed ? 'none' : '2px solid var(--border2)',
              background: todo.completed ? 'var(--teal)' : 'transparent',
              cursor: readOnly ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: readOnly ? 0.5 : 1,
            }}
          >
            {todo.completed && <Icon name="check" size={12} color="#fff" />}
          </button>
        )}

        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onToggleExpand}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 14, fontWeight: 600, color: todo.completed ? 'var(--ink3)' : 'var(--ink)',
              textDecoration: todo.completed ? 'line-through' : 'none',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {todo.title}
            </span>
            {todo.starred && <Icon name="star" size={13} color="var(--gold)" />}
            {todo.reminder && <Icon name="clock" size={13} color="var(--teal)" />}
            {todo.priority && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: priorityMeta.bg, color: priorityMeta.color, textTransform: 'uppercase' }}>
                {priorityMeta.label}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            {list && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: list.color }} />
                {list.name}
              </span>
            )}
            {todo.due && <span style={{ fontSize: 11, color: isOverdue(todo.due) && !todo.completed ? 'var(--red)' : 'var(--ink3)', fontWeight: isOverdue(todo.due) ? 700 : 400 }}>Due {todo.due}</span>}
            {todo.subtasks.length > 0 && <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{doneSubtasks}/{todo.subtasks.length} subtasks</span>}
            {todo.notes && <Icon name="fileText" size={11} color="var(--ink3)" />}
            {todo.assigneeName && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--teal)', fontWeight: 600 }}>
                <Icon name="userCheck" size={11} /> {todo.assigneeName}
              </span>
            )}
            {todo.tags.map(tag => (
              <span key={tag} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--teal)', background: 'var(--teal-l)', padding: '1px 7px', borderRadius: 10 }}>#{tag}</span>
            ))}
          </div>
        </div>

        {/* Stopwatch Live Timer */}
        {!trashed && <TaskTimerWidget todo={todo} />}

        {!trashed && todo.status !== 'none' && (
          readOnly ? (
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                </button>
              </DropdownMenuTrigger>
              <StatusMenuItems todoId={todo.id} />
            </DropdownMenu>
          )
        )}
        {!trashed && !readOnly && todo.status === 'none' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" title="Set status" style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 20, cursor: 'pointer', padding: '3px 9px', fontSize: 11, color: 'var(--ink3)' }}>+ Status</button>
            </DropdownMenuTrigger>
            <StatusMenuItems todoId={todo.id} />
          </DropdownMenu>
        )}

        {trashed ? (
          todo.isOwner ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" title="Restore" onClick={() => restoreTodo(todo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 6 }}><Icon name="refresh" size={15} /></button>
              <button type="button" title="Delete forever" onClick={() => purgeTodo(todo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 6 }}><Icon name="trash" size={15} /></button>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Deleted by owner</span>
          )
        ) : readOnly ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" title="More" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 6 }}><Icon name="moreVertical" size={16} /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => updateTodo(todo.id, { starred: !todo.starred })}>
                <Icon name="star" size={13} className="text-muted-foreground" /> {todo.starred ? 'Unstar' : 'Star'}
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => updateTodo(todo.id, { priority: 'urgent' })}>Set Urgent Priority</DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateTodo(todo.id, { priority: 'high' })}>Set High Priority</DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateTodo(todo.id, { priority: 'medium' })}>Set Medium Priority</DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateTodo(todo.id, { priority: 'low' })}>Set Low Priority</DropdownMenuItem>
              <DropdownMenuSeparator />

              {todo.isOwner && (
                <DropdownMenuItem onClick={() => updateTodo(todo.id, { someday: !todo.someday, due: todo.someday ? todo.due : undefined })}>
                  <Icon name="clock" size={13} className="text-muted-foreground" /> {todo.someday ? 'Remove from Someday' : 'Move to Someday'}
                </DropdownMenuItem>
              )}
              {todo.isOwner && (
                <DropdownMenuItem onClick={() => deleteTodo(todo.id)} className="text-destructive">
                  <Icon name="trash" size={13} /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={14} color="var(--ink3)" onClick={onToggleExpand} style={{ cursor: 'pointer' }} />
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <DatePicker
              date={parseDateOnly(todo.due)}
              onChange={d => updateTodo(todo.id, { due: toDateOnlyString(d) || undefined, someday: d ? false : todo.someday })}
              placeholder="Set due date"
              triggerClassName="w-auto h-8 text-xs"
              disabled={trashed || readOnly}
            />

            <select
              value={todo.priority || 'medium'}
              disabled={trashed || readOnly}
              onChange={e => updateTodo(todo.id, { priority: e.target.value as TaskPriority })}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'var(--white)' }}
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
              <option value="urgent">Urgent Priority</option>
            </select>

            <ReminderPicker
              value={todo.reminder ?? null}
              onChange={v => updateTodo(todo.id, { reminder: v })}
              open={reminderOpen}
              onOpenChange={setReminderOpen}
              triggerStyle={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--ink3)', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, height: 32, boxSizing: 'border-box' }}
            />
          </div>

          {!trashed && (
            todo.isOwner ? (
              <div style={{ maxWidth: 260 }}>
                <EntityPicker
                  value={todo.assigneeId ? { id: todo.assigneeId, label: todo.assigneeName || 'Assigned' } : null}
                  onChange={item => updateTodo(todo.id, { assigneeId: item?.id ?? null, assigneeName: item?.label })}
                  search={searchColleagues}
                  placeholder="Assign to a colleague…"
                />
              </div>
            ) : isAssignedToMe ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="userCheck" size={13} /> Assigned to you by {todo.ownerName ?? 'a colleague'}
              </div>
            ) : todo.assigneeName ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="userCheck" size={13} /> Assigned to {todo.assigneeName}
              </div>
            ) : null
          )}

          <textarea
            value={todo.notes || ''}
            onChange={e => updateTodo(todo.id, { notes: e.target.value })}
            placeholder="Detailed description & instructions…"
            rows={3}
            disabled={trashed || readOnly}
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, resize: 'vertical', background: 'var(--white)', color: 'var(--ink)', fontFamily: 'var(--font)' }}
          />

          {!trashed && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {todo.tags.map(tag => (
                <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--teal)', background: 'var(--teal-l)', padding: '3px 8px', borderRadius: 10 }}>
                  #{tag}
                  {!readOnly && (
                    <button type="button" onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', display: 'flex', padding: 0 }}><Icon name="x" size={10} /></button>
                  )}
                </span>
              ))}
              {!readOnly && (
                <input
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addTag(); }}
                  onBlur={() => newTag.trim() && addTag()}
                  placeholder="+ tag"
                  style={{ width: 70, border: '1px dashed var(--border)', borderRadius: 10, padding: '3px 8px', fontSize: 11, background: 'transparent', color: 'var(--ink)', outline: 'none' }}
                />
              )}
            </div>
          )}

          {/* Subtasks Checklist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--white)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Checklist / Subtasks</span>
              {todo.subtasks.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)' }}>
                  {Math.round((doneSubtasks / todo.subtasks.length) * 100)}% Complete
                </span>
              )}
            </div>
            {todo.subtasks.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" disabled={readOnly} onClick={() => !readOnly && updateSubtask(todo.id, s.id, { completed: !s.completed })}
                  style={{ width: 16, height: 16, borderRadius: '50%', border: s.completed ? 'none' : '2px solid var(--border2)', background: s.completed ? 'var(--teal)' : 'transparent', cursor: readOnly ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: readOnly ? 0.6 : 1 }}>
                  {s.completed && <Icon name="check" size={10} color="#fff" />}
                </button>
                <span style={{ flex: 1, fontSize: 13, color: s.completed ? 'var(--ink3)' : 'var(--ink)', textDecoration: s.completed ? 'line-through' : 'none' }}>{s.title}</span>
                {!readOnly && (
                  <button type="button" onClick={() => deleteSubtask(todo.id, s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="x" size={12} /></button>
                )}
              </div>
            ))}
            {!trashed && !readOnly && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <Icon name="plus" size={12} color="var(--ink3)" />
                <input
                  value={newSubtaskTitle}
                  onChange={e => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                      addSubtask(todo.id, newSubtaskTitle.trim());
                      setNewSubtaskTitle('');
                    }
                  }}
                  placeholder="Add subtask item…"
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12.5, background: 'transparent', color: 'var(--ink)' }}
                />
              </div>
            )}
          </div>

          {!trashed && <CommentsSection taskId={todo.id} readOnly={readOnly} />}
        </div>
      )}
    </div>
  );
}

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Comments & Activity{comments?.length ? ` (${comments.length})` : ''}
      </div>
      {comments === null ? (
        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Loading comments…</div>
      ) : (
        comments.map(c => (
          <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700, flexShrink: 0,
            }}>
              {initials(c.authorName)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{c.authorName}</span>
                <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{c.content}</div>
            </div>
            {c.authorId === user?.id && (
              <button type="button" onClick={() => remove(c.id)} title="Delete comment"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', padding: 2, flexShrink: 0 }}>
                <Icon name="x" size={11} />
              </button>
            )}
          </div>
        ))
      )}
      {!readOnly && (
        <MentionInput
          value={draft}
          onChange={(v, m) => { setDraft(v); setDraftMentions(m); }}
          users={colleagues}
          placeholder="Write a comment… type @ to mention someone"
          disabled={posting}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

function StatusMenuItems({ todoId }: { todoId: string }) {
  return (
    <DropdownMenuContent align="end">
      {(Object.keys(STATUS_META) as TaskStatus[]).map(s => (
        <DropdownMenuItem key={s} onClick={() => updateTodo(todoId, s === 'completed' ? { status: s, completed: true } : { status: s })}>
          <Badge variant={STATUS_META[s].variant}>{STATUS_META[s].label}</Badge>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );
}
