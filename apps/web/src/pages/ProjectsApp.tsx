import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Icon } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useTodos, addTodo, updateTodo, deleteTodo, Todo, TaskStatus, TaskPriority } from '../data/calendarStore.js';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuth } from '../hooks/useAuth.js';
import { FileUploader } from '../components/ui/file-uploader.js';

// Standalone Projects app (HuduPlus+, entitlement key 'projects' — migration
// 313) — Projects/Milestones are real, tenant-shared entities (migration
// 308), distinct from the personal task_lists the separate Tasks app uses.
// Task creation/movement here reuses the same calendarStore.ts Todo store
// Tasks uses (just tagged with projectId) — there's one task table, two
// apps looking at different slices of it. This page originally shipped as
// a mode inside the Tasks app; moved here once Projects became its own
// standalone app (same functionality, new home).

interface ProjectSummary {
  id: string; ref: string | null; name: string; description: string | null; color: string; status: string;
  owner_id: string; owner_name: string | null; start_date: string | null; target_date: string | null;
  customer_id: string | null; customer_name: string | null; billing_type: string; total_rate: string | null; currency: string;
  created_at: string;
  member_count: number; task_count: number; task_done_count: number;
}
interface ProjectDetail extends ProjectSummary {
  days_total: number | null; days_left: number | null;
  logged_hours_by_day: { day: string; minutes: number }[]; total_logged_minutes: number;
  expenses: { total: number; billable: number; billed: number; unbilled: number };
}
interface ProjectMember { id: string; user_id: string; role: string; name: string; email: string; avatar_url: string | null }
interface MilestoneRow { id: string; name: string; description: string | null; due_date: string | null; status: string; sort_order: number; task_count: number; task_done_count: number }
interface TimesheetRow {
  id: string; task_id: string; user_id: string; started_at: string; ended_at: string;
  duration_minutes: number | null; task_title: string; is_billable: boolean; hourly_rate: string | null;
  user_name: string; amount: number;
}
interface TimesheetTotals { totalMinutes: number; billableMinutes: number; billableAmount: number }
interface ProjectFileRow {
  id: string; name: string; size: number | null; mime_type: string | null; created_at: string;
  shared: { name: string; role: string; principal_type: string | null; principal_id: string | null }[];
}
interface ProjectActivityEntry { id: string; action: string; detail: Record<string, any>; created_at: string; actor_name: string; task_title: string | null }

function describeProjectActivity(a: ProjectActivityEntry): string {
  if (a.task_title) {
    switch (a.action) {
      case 'status_changed': return `changed status of "${a.task_title}": ${a.detail.from} → ${a.detail.to}`;
      case 'priority_changed': return `changed priority of "${a.task_title}": ${a.detail.from} → ${a.detail.to}`;
      case 'assigned': return a.detail.assigneeId ? `assigned "${a.task_title}"` : `unassigned "${a.task_title}"`;
      case 'completed': return `marked "${a.task_title}" complete`;
      case 'commented': return `commented on "${a.task_title}": "${a.detail.preview}"`;
      case 'moved_project': return `moved "${a.task_title}" into this project`;
      default: return `${a.action} on "${a.task_title}"`;
    }
  }
  switch (a.action) {
    case 'created': return 'created this project';
    case 'status_changed': return `changed project status: ${a.detail.from} → ${a.detail.to}`;
    case 'member_added': return `added ${a.detail.name || 'a member'} to the project`;
    case 'member_removed': return `removed ${a.detail.name || 'a member'} from the project`;
    default: return a.action;
  }
}

const PROJECT_STATUS_META: Record<string, { label: string; variant: 'gray' | 'brand' | 'warning' | 'error' | 'success' }> = {
  not_started: { label: 'Not Started', variant: 'gray' },
  in_progress: { label: 'In Progress', variant: 'brand' },
  on_hold: { label: 'On Hold', variant: 'warning' },
  cancelled: { label: 'Cancelled', variant: 'error' },
  finished: { label: 'Finished', variant: 'success' },
};
const MILESTONE_STATUS_META: Record<string, { label: string; variant: 'gray' | 'brand' | 'success' }> = {
  upcoming: { label: 'Upcoming', variant: 'gray' },
  in_progress: { label: 'In progress', variant: 'brand' },
  completed: { label: 'Completed', variant: 'success' },
};
const KANBAN_COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: 'none', title: 'Not Started' },
  { status: 'in_progress', title: 'In Progress' },
  { status: 'in_review', title: 'Testing / Review' },
  { status: 'waiting', title: 'Awaiting Feedback' },
  { status: 'completed', title: 'Completed' },
];
const TASK_STATUS_META: Record<TaskStatus, { label: string; variant: 'gray' | 'brand' | 'warning' | 'info' | 'success' }> = {
  none: { label: 'Not Started', variant: 'gray' },
  in_progress: { label: 'In Progress', variant: 'brand' },
  in_review: { label: 'Testing / Review', variant: 'warning' },
  waiting: { label: 'Awaiting Feedback', variant: 'info' },
  completed: { label: 'Completed', variant: 'success' },
};
const TASK_PRIORITY_META: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  low: { label: 'Low', color: '#64748b', bg: '#f1f5f9' },
  medium: { label: 'Medium', color: '#d97706', bg: '#fef3c7' },
  high: { label: 'High', color: '#ea580c', bg: '#ffedd5' },
  urgent: { label: 'Urgent', color: '#dc2626', bg: '#fee2e2' },
};
// CSS var per status, for the Gantt bar fill — same variant→hue mapping
// Badge already uses (brand/success/warning/info/gray), just resolved to a
// paintable color here since an SVG/div fill can't read a Badge's own CSS.
const STATUS_BAR_COLOR: Record<TaskStatus, string> = {
  none: 'var(--ink4)', in_progress: 'var(--teal)', in_review: 'var(--gold)', waiting: 'var(--blue)', completed: 'var(--green)',
};
function dayDiff(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / 86400000); }

async function searchColleagues(q: string): Promise<PickerItem[]> {
  const rows = await apiFetch(`/v1/hr/staff?search=${encodeURIComponent(q)}`).catch(() => []);
  return (rows || []).map((u: any) => ({ id: u.id, label: u.name, sublabel: u.email }));
}

function ProgressBar({ done, total, color }: { done: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.2s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, flexShrink: 0 }}>{done}/{total}</span>
    </div>
  );
}

function OverviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{value}</div>
    </div>
  );
}

function ExpenseStat({ label, value, color, currency }: { label: string; value: number; color: string; currency: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color }}>{currency} {value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
    </div>
  );
}

function formatHM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const ProjectsApp: React.FC = () => {
  const isMobile = useIsMobile();
  const allTodos = useTodos();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [listStatusFilter, setListStatusFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'board' | 'gantt' | 'timesheets' | 'files' | 'activity' | 'milestones' | 'members'>('overview');
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [milestones, setMilestones] = useState<MilestoneRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#0d7a6b');
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const { user } = useAuth();
  const [boardView, setBoardView] = useState<'kanban' | 'table' | 'milestone'>('kanban');
  const [excludeCompletedMs, setExcludeCompletedMs] = useState(false);
  const [msColumnLimits, setMsColumnLimits] = useState<Record<string, number>>({});
  const [taskSearch, setTaskSearch] = useState('');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string>('all');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [taskSort, setTaskSort] = useState<{ key: 'title' | 'due' | 'priority' | 'status'; dir: 1 | -1 }>({ key: 'due', dir: 1 });
  const [timesheets, setTimesheets] = useState<TimesheetRow[] | null>(null);
  const [timesheetTotals, setTimesheetTotals] = useState<TimesheetTotals | null>(null);
  const [timesheetFrom, setTimesheetFrom] = useState('');
  const [timesheetTo, setTimesheetTo] = useState('');
  const [projectFiles, setProjectFiles] = useState<ProjectFileRow[] | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [projectActivity, setProjectActivity] = useState<ProjectActivityEntry[] | null>(null);
  const [ganttEdges, setGanttEdges] = useState<{ task_id: string; depends_on_task_id: string }[] | null>(null);
  const [ganttZoom, setGanttZoom] = useState<'weeks' | 'months'>('weeks');
  const [ganttMilestoneFilter, setGanttMilestoneFilter] = useState<string>('all');

  const loadProjects = useCallback(() => {
    apiFetch('/v1/tasks/projects').then(res => setProjects(res.data || [])).catch(() => setProjects([]));
  }, []);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  const selected = projects?.find(p => p.id === selectedId) || null;
  const listCounts = useMemo(() => {
    const c: Record<string, number> = { not_started: 0, in_progress: 0, on_hold: 0, cancelled: 0, finished: 0 };
    for (const p of projects || []) c[p.status] = (c[p.status] || 0) + 1;
    return c;
  }, [projects]);
  const filteredProjects = useMemo(() => {
    if (!projects) return null;
    return listStatusFilter === 'all' ? projects : projects.filter(p => p.status === listStatusFilter);
  }, [projects, listStatusFilter]);

  const loadDetail = useCallback((id: string) => {
    apiFetch(`/v1/tasks/projects/${id}`).then(res => setDetail(res.data || null)).catch(() => setDetail(null));
    apiFetch(`/v1/tasks/projects/${id}/members`).then(res => setMembers(res.data || [])).catch(() => setMembers([]));
    apiFetch(`/v1/tasks/projects/${id}/milestones`).then(res => setMilestones(res.data || [])).catch(() => setMilestones([]));
  }, []);
  useEffect(() => {
    if (selectedId) { setDetail(null); setMembers(null); setMilestones(null); setTab('overview'); setTimesheets(null); setTimesheetTotals(null); setProjectFiles(null); setProjectActivity(null); loadDetail(selectedId); }
  }, [selectedId, loadDetail]);

  const loadTimesheets = useCallback(() => {
    if (!selectedId) return;
    const params = new URLSearchParams();
    if (timesheetFrom) params.set('from', timesheetFrom);
    if (timesheetTo) params.set('to', timesheetTo);
    const qs = params.toString();
    apiFetch(`/v1/tasks/projects/${selectedId}/timesheets${qs ? `?${qs}` : ''}`)
      .then(res => { setTimesheets(res.data || []); setTimesheetTotals(res.totals || null); })
      .catch(() => { setTimesheets([]); setTimesheetTotals(null); });
  }, [selectedId, timesheetFrom, timesheetTo]);
  useEffect(() => { if (tab === 'timesheets') loadTimesheets(); }, [tab, loadTimesheets]);

  const loadFiles = useCallback(() => {
    if (!selectedId) return;
    apiFetch(`/v1/files?entity_type=project&entity_id=${selectedId}`).then(res => setProjectFiles(res.data || res || [])).catch(() => setProjectFiles([]));
  }, [selectedId]);
  useEffect(() => { if (tab === 'files') loadFiles(); }, [tab, loadFiles]);

  const loadActivity = useCallback(() => {
    if (!selectedId) return;
    apiFetch(`/v1/tasks/projects/${selectedId}/activity`).then(res => setProjectActivity(res.data || [])).catch(() => setProjectActivity([]));
  }, [selectedId]);
  useEffect(() => { if (tab === 'activity') loadActivity(); }, [tab, loadActivity]);

  useEffect(() => {
    if (tab === 'gantt' && selectedId) {
      apiFetch(`/v1/tasks/projects/${selectedId}/dependencies`).then(res => setGanttEdges(res.data || [])).catch(() => setGanttEdges([]));
    }
  }, [tab, selectedId]);

  async function uploadProjectFiles(fileList: File[]) {
    if (!selectedId || fileList.length === 0) return;
    setUploadingFiles(true);
    try {
      const drives = await apiFetch('/v1/drives');
      const driveList = Array.isArray(drives) ? drives : (drives.data ?? []);
      const driveId = driveList[0]?.id;
      if (!driveId) return;
      for (const file of fileList) {
        const form = new FormData();
        form.append('file', file);
        await apiFetch(`/v1/files/upload?drive_id=${driveId}&entity_type=project&entity_id=${selectedId}`, { method: 'POST', body: form });
      }
      loadFiles();
    } finally {
      setUploadingFiles(false);
    }
  }

  async function toggleFileVisibleToCustomer(file: ProjectFileRow, visible: boolean) {
    if (!selected?.customer_id) return;
    const shared = visible ? [{ name: selected.customer_name || 'Customer', role: 'Viewer' as const, principal_type: 'customer', principal_id: selected.customer_id }] : [];
    setProjectFiles(prev => (prev || []).map(f => f.id === file.id ? { ...f, shared } : f));
    await apiFetch(`/v1/files/${file.id}/share`, { method: 'PUT', body: JSON.stringify({ shared }) }).catch(() => loadFiles());
  }

  const projectTasks = useMemo(() => selectedId ? allTodos.filter(t => t.projectId === selectedId && !t.deletedAt) : [], [allTodos, selectedId]);
  const detailTask = detailTaskId ? projectTasks.find(t => t.id === detailTaskId) || null : null;

  const taskStatusCounts = useMemo(() => {
    const c: Record<string, { total: number; mine: number }> = {};
    for (const col of KANBAN_COLUMNS) c[col.status] = { total: 0, mine: 0 };
    for (const t of projectTasks) {
      const status = t.completed || t.status === 'completed' ? 'completed' : t.status;
      if (!c[status]) continue;
      c[status].total++;
      if (user && t.assigneeId === user.id) c[status].mine++;
    }
    return c;
  }, [projectTasks, user]);

  const visibleTasks = useMemo(() => {
    let rows = projectTasks;
    if (taskSearch.trim()) {
      const q = taskSearch.toLowerCase().trim();
      rows = rows.filter(t => t.title.toLowerCase().includes(q) || t.tags.some(tag => tag.toLowerCase().includes(q)));
    }
    if (taskPriorityFilter !== 'all') rows = rows.filter(t => (t.priority || 'medium') === taskPriorityFilter);
    return rows;
  }, [projectTasks, taskSearch, taskPriorityFilter]);

  const sortedTasks = useMemo(() => {
    const priorityRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const statusRank: Record<string, number> = { none: 0, in_progress: 1, in_review: 2, waiting: 3, completed: 4 };
    const rows = [...visibleTasks];
    const { key, dir } = taskSort;
    rows.sort((a, b) => {
      let cmp = 0;
      if (key === 'title') cmp = a.title.localeCompare(b.title);
      else if (key === 'due') cmp = (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99');
      else if (key === 'priority') cmp = priorityRank[a.priority || 'medium'] - priorityRank[b.priority || 'medium'];
      else if (key === 'status') cmp = statusRank[a.completed ? 'completed' : a.status] - statusRank[b.completed ? 'completed' : b.status];
      return cmp * dir;
    });
    return rows;
  }, [visibleTasks, taskSort]);

  function toggleTaskSort(key: 'title' | 'due' | 'priority' | 'status') {
    setTaskSort(prev => prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 });
  }
  function toggleTaskSelected(id: string) {
    setSelectedTaskIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function bulkMarkComplete() {
    for (const id of selectedTaskIds) updateTodo(id, { status: 'completed', completed: true });
    setSelectedTaskIds(new Set());
    loadProjects();
  }
  function exportTasksCSV() {
    const rows = [
      ['Name', 'Status', 'Due', 'Assigned To', 'Tags', 'Priority'].join(','),
      ...sortedTasks.map(t => [
        `"${t.title.replace(/"/g, '""')}"`, `"${TASK_STATUS_META[t.completed ? 'completed' : t.status]?.label || t.status}"`,
        `"${t.due || ''}"`, `"${t.assigneeName || ''}"`, `"${t.tags.join('; ')}"`, `"${t.priority || 'medium'}"`,
      ].join(',')),
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.setAttribute('download', `${selected?.name || 'project'}_tasks.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ── Gantt (M9) — hand-rolled day-grid layout; no Gantt library exists in
  // this codebase or is worth adding for one view. Milestone-grouped
  // swimlane BANDS (the real convention every reference Gantt tool uses —
  // Jira/monday/ClickUp group with a colored band + header row, not literal
  // lines from a header box to each bar, which no real tool does either;
  // connector lines are reserved below for actual task dependencies).
  const GANTT_ROW_H = 34;
  const ganttDayWidth = ganttZoom === 'weeks' ? 24 : 8;
  const ganttTasks = useMemo(() => {
    if (ganttMilestoneFilter === 'all') return projectTasks;
    if (ganttMilestoneFilter === '__none__') return projectTasks.filter(t => !t.milestoneId);
    return projectTasks.filter(t => t.milestoneId === ganttMilestoneFilter);
  }, [projectTasks, ganttMilestoneFilter]);
  const ganttRange = useMemo(() => {
    const dates: Date[] = [];
    for (const t of ganttTasks) {
      if (t.start) dates.push(parseDateOnly(t.start)!);
      if (t.due) dates.push(parseDateOnly(t.due)!);
    }
    if (selected?.start_date) dates.push(parseDateOnly(selected.start_date)!);
    if (selected?.target_date) dates.push(parseDateOnly(selected.target_date)!);
    if (dates.length === 0) {
      const today = new Date();
      return { start: today, end: new Date(today.getTime() + 30 * 86400000) };
    }
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    min.setDate(min.getDate() - 3);
    max.setDate(max.getDate() + 3);
    return { start: min, end: max };
  }, [ganttTasks, selected?.start_date, selected?.target_date]);
  const ganttTotalDays = dayDiff(ganttRange.start, ganttRange.end) + 1;
  function ganttBarGeometry(t: Todo) {
    const due = t.due ? parseDateOnly(t.due) : null;
    const start = t.start ? parseDateOnly(t.start) : due;
    if (!start && !due) return null;
    const s = start || due!;
    const e = due || start!;
    const left = dayDiff(ganttRange.start, s) * ganttDayWidth;
    const width = Math.max(ganttDayWidth * 0.6, (dayDiff(s, e) + 1) * ganttDayWidth);
    return { left, width, hasStart: !!t.start };
  }
  type GanttRow = { type: 'milestone'; ms: MilestoneRow | null } | { type: 'task'; task: Todo };
  const ganttRows = useMemo(() => {
    const rows: GanttRow[] = [];
    for (const ms of [...(milestones || []), null]) {
      const msId = ms?.id || null;
      const inGroup = ganttTasks.filter(t => (t.milestoneId || null) === msId);
      if (inGroup.length === 0) continue;
      rows.push({ type: 'milestone', ms });
      for (const t of inGroup) rows.push({ type: 'task', task: t });
    }
    return rows;
  }, [ganttTasks, milestones]);
  const ganttRowIndexByTaskId = useMemo(() => {
    const m = new Map<string, number>();
    ganttRows.forEach((r, i) => { if (r.type === 'task') m.set(r.task.id, i); });
    return m;
  }, [ganttRows]);
  const ganttMonthHeaders = useMemo(() => {
    const headers: { label: string; left: number; width: number }[] = [];
    let dayIdx = 0;
    let cursor = new Date(ganttRange.start);
    while (dayIdx < ganttTotalDays) {
      const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      const remaining = Math.min(daysInMonth - cursor.getDate() + 1, ganttTotalDays - dayIdx);
      headers.push({ label: cursor.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), left: dayIdx * ganttDayWidth, width: remaining * ganttDayWidth });
      dayIdx += remaining;
      cursor = new Date(cursor); cursor.setDate(cursor.getDate() + remaining);
    }
    return headers;
  }, [ganttRange, ganttTotalDays, ganttDayWidth]);
  const ganttWeekTicks = useMemo(() => {
    if (ganttZoom !== 'weeks') return [];
    const ticks: number[] = [];
    for (let i = 0; i < ganttTotalDays; i += 7) ticks.push(i * ganttDayWidth);
    return ticks;
  }, [ganttTotalDays, ganttDayWidth, ganttZoom]);
  const ganttTodayOffset = dayDiff(ganttRange.start, new Date(new Date().toISOString().slice(0, 10))) * ganttDayWidth;
  const ganttConnectors = useMemo(() => {
    if (!ganttEdges) return [];
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const e of ganttEdges) {
      const blockerRow = ganttRowIndexByTaskId.get(e.depends_on_task_id);
      const blockedRow = ganttRowIndexByTaskId.get(e.task_id);
      if (blockerRow === undefined || blockedRow === undefined) continue;
      const blockerTask = ganttTasks.find(t => t.id === e.depends_on_task_id);
      const blockedTask = ganttTasks.find(t => t.id === e.task_id);
      if (!blockerTask || !blockedTask) continue;
      const blockerGeo = ganttBarGeometry(blockerTask);
      const blockedGeo = ganttBarGeometry(blockedTask);
      if (!blockerGeo || !blockedGeo) continue;
      lines.push({
        x1: blockerGeo.left + blockerGeo.width, y1: blockerRow * GANTT_ROW_H + GANTT_ROW_H / 2,
        x2: blockedGeo.left, y2: blockedRow * GANTT_ROW_H + GANTT_ROW_H / 2,
      });
    }
    return lines;
  }, [ganttEdges, ganttRowIndexByTaskId, ganttTasks, ganttRange, ganttDayWidth]);

  async function createProject() {
    if (!newName.trim()) return;
    const id = crypto.randomUUID();
    try {
      await apiFetch('/v1/tasks/projects', { method: 'POST', body: JSON.stringify({ id, name: newName.trim(), color: newColor }) });
      setNewName(''); setCreating(false);
      loadProjects();
      setSelectedId(id);
    } catch { /* apiFetch already surfaces errors globally */ }
  }

  function quickAddTask() {
    if (!quickAddTitle.trim() || !selectedId) return;
    addTodo({ title: quickAddTitle.trim(), projectId: selectedId, status: 'none' });
    setQuickAddTitle('');
    // A newly-created project task's task_count needs to reflect locally without
    // a full reload — cheap enough to just refetch the summary list.
    loadProjects();
  }

  function moveTask(taskId: string, status: TaskStatus) {
    updateTodo(taskId, status === 'completed' ? { status, completed: true } : { status, completed: false });
    loadProjects();
  }

  function moveTaskMilestone(taskId: string, milestoneId: string | null) {
    updateTodo(taskId, { milestoneId });
  }

  async function addMilestone(name: string) {
    if (!selectedId || !name.trim()) return;
    const id = crypto.randomUUID();
    const res = await apiFetch(`/v1/tasks/projects/${selectedId}/milestones`, { method: 'POST', body: JSON.stringify({ id, name: name.trim() }) }).catch(() => null);
    if (res) setMilestones(prev => [...(prev || []), res.data]);
  }
  async function updateMilestone(id: string, patch: { status?: string; dueDate?: string | null }) {
    if (!selectedId) return;
    const res = await apiFetch(`/v1/tasks/projects/${selectedId}/milestones/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => null);
    if (res) setMilestones(prev => (prev || []).map(m => m.id === id ? { ...m, ...res.data } : m));
  }
  async function deleteMilestone(id: string) {
    if (!selectedId) return;
    setMilestones(prev => (prev || []).filter(m => m.id !== id));
    await apiFetch(`/v1/tasks/projects/${selectedId}/milestones/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  async function addMember(picked: PickerItem) {
    if (!selectedId) return;
    const res = await apiFetch(`/v1/tasks/projects/${selectedId}/members`, { method: 'POST', body: JSON.stringify({ userId: picked.id, role: 'member' }) }).catch(() => null);
    if (res) { setMembers(prev => [...(prev || []).filter(m => m.user_id !== picked.id), res.data]); loadDetail(selectedId); loadProjects(); }
  }
  async function removeMember(userId: string) {
    if (!selectedId) return;
    setMembers(prev => (prev || []).filter(m => m.user_id !== userId));
    await apiFetch(`/v1/tasks/projects/${selectedId}/members/${userId}`, { method: 'DELETE' }).catch(() => {});
    loadProjects();
  }

  // ── Projects list (no project selected) ──
  if (!selectedId || !selected) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
        <div style={{ padding: isMobile ? '16px 16px 0' : '24px 32px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>Projects</h1>
            <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '4px 0 0 0' }}>Shared, multi-person projects with milestones and a kanban board.</p>
          </div>
          <Button size="sm" onClick={() => setCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={15} /> New project
          </Button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: isMobile ? '14px 16px 0' : '18px 32px 0' }}>
          <button type="button" onClick={() => setListStatusFilter('all')}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${listStatusFilter === 'all' ? 'var(--teal)' : 'var(--border)'}`, background: 'var(--white)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: listStatusFilter === 'all' ? 'var(--teal)' : 'var(--ink2)' }}>
            All ({projects?.length ?? 0})
          </button>
          {Object.entries(PROJECT_STATUS_META).map(([k, m]) => (
            <button key={k} type="button" onClick={() => setListStatusFilter(prev => prev === k ? 'all' : k)}
              style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${listStatusFilter === k ? 'var(--teal)' : 'var(--border)'}`, background: 'var(--white)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: listStatusFilter === k ? 'var(--teal)' : 'var(--ink2)' }}>
              {listCounts[k] ?? 0} {m.label}
            </button>
          ))}
        </div>

        {creating && (
          <div style={{ margin: isMobile ? 16 : '20px 32px 0', padding: 16, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createProject(); if (e.key === 'Escape') setCreating(false); }}
              placeholder="Project name…"
              style={{ flex: 1, minWidth: 200, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, background: 'var(--white)', color: 'var(--ink)' }}
            />
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} title="Project color" style={{ width: 36, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'none' }} />
            <Button size="sm" onClick={createProject} disabled={!newName.trim()}>Create</Button>
            <Button size="sm" variant="outline" onClick={() => { setCreating(false); setNewName(''); }}>Cancel</Button>
          </div>
        )}

        <div style={{ padding: isMobile ? 16 : 32 }}>
          {filteredProjects === null ? (
            <div style={{ color: 'var(--ink3)', fontSize: 14 }}>Loading…</div>
          ) : filteredProjects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink3)', fontSize: 14 }}>
              {projects && projects.length > 0 ? 'No projects match this filter.' : 'No projects yet. Create one to start organizing work into a shared board with milestones.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {filteredProjects.map(p => {
                const statusMeta = PROJECT_STATUS_META[p.status] || PROJECT_STATUS_META.not_started;
                return (
                  <button
                    key={p.id} type="button" onClick={() => setSelectedId(p.id)}
                    style={{
                      textAlign: 'left', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12,
                      padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                    </div>
                    {(p.ref || p.customer_name) && (
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', gap: 6 }}>
                        {p.ref && <span style={{ fontWeight: 700 }}>{p.ref}</span>}
                        {p.customer_name && <span>{p.ref ? '· ' : ''}{p.customer_name}</span>}
                      </div>
                    )}
                    {p.description && (
                      <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.description}</p>
                    )}
                    <ProgressBar done={p.task_done_count} total={p.task_count} color={p.color} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink3)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="userCheck" size={12} /> {p.member_count} member{p.member_count === 1 ? '' : 's'}</span>
                      {p.target_date && <span>Due {p.target_date}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Selected project detail ──
  const statusMeta = PROJECT_STATUS_META[selected.status] || PROJECT_STATUS_META.not_started;
  function patchProject(patch: Record<string, unknown>) {
    apiFetch(`/v1/tasks/projects/${selected!.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      .then(() => { loadProjects(); loadDetail(selected!.id); });
  }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      <div style={{ padding: isMobile ? '16px 16px 0' : '24px 32px 0' }}>
        <button type="button" onClick={() => setSelectedId(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 12.5, fontWeight: 600, padding: 0, marginBottom: 10 }}>
          <Icon name="arrowLeft" size={13} /> All projects
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: selected.color, flexShrink: 0 }} />
          <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>{selected.name}</h1>
          {selected.customer_name && <span style={{ fontSize: 14, color: 'var(--ink3)' }}>— {selected.customer_name}</span>}
          <Select value={selected.status} onValueChange={v => patchProject({ status: v })}>
            <SelectTrigger className="h-7 text-xs" style={{ width: 130 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PROJECT_STATUS_META).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {selected.ref && <div style={{ fontSize: 11.5, color: 'var(--ink4)', marginTop: 2 }}>{selected.ref}</div>}
        {selected.description && <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '6px 0 0' }}>{selected.description}</p>}

        <div style={{ display: 'flex', gap: 4, marginTop: 18, borderBottom: '1px solid var(--border)' }}>
          {(['overview', 'board', 'gantt', 'timesheets', 'files', 'activity', 'milestones', 'members'] as const).map(t => (
            <button
              key={t} type="button" onClick={() => setTab(t)}
              style={{
                padding: '8px 14px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? 'var(--teal)' : 'transparent'}`,
                color: tab === t ? 'var(--teal)' : 'var(--ink3)', fontWeight: tab === t ? 700 : 500, fontSize: 13.5, cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {t === 'overview' ? 'Overview' : t === 'board' ? `Tasks${projectTasks.length ? ` (${projectTasks.length})` : ''}` : t === 'gantt' ? 'Gantt' : t === 'timesheets' ? 'Timesheets' : t === 'files' ? `Files${projectFiles ? ` (${projectFiles.length})` : ''}` : t === 'activity' ? 'Activity' : t === 'milestones' ? `Milestones${milestones ? ` (${milestones.length})` : ''}` : `Members${members ? ` (${members.length})` : ''}`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 16 : 32 }}>
        {tab === 'overview' && (
          detail === null ? (
            <div style={{ color: 'var(--ink3)', fontSize: 14 }}>Loading…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, alignItems: 'start' }}>
              <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Overview</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px', fontSize: 13 }}>
                  <OverviewField label="Project #" value={detail.ref || '—'} />
                  <OverviewField label="Customer" value={detail.customer_name || '—'} />
                  <OverviewField label="Billing Type" value={detail.billing_type === 'hourly' ? 'Hourly Rate' : 'Fixed Rate'} />
                  <OverviewField label="Total Rate" value={detail.total_rate ? `${detail.currency} ${Number(detail.total_rate).toLocaleString()}` : '—'} />
                  <OverviewField label="Status" value={statusMeta.label} />
                  <OverviewField label="Date Created" value={detail.created_at.slice(0, 10)} />
                  <OverviewField label="Start Date" value={detail.start_date || '—'} />
                  <OverviewField label="Deadline" value={detail.target_date || '—'} />
                  <OverviewField label="Total Logged Hours" value={formatHM(detail.total_logged_minutes)} />
                </div>
                {detail.description && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 20, marginBottom: 6 }}>Description</div>
                    <p style={{ fontSize: 13, color: 'var(--ink2)', margin: 0, lineHeight: 1.6 }}>{detail.description}</p>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{selected.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{detail.task_done_count} / {detail.task_count} Open Tasks</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', margin: '2px 0 8px' }}>{detail.task_count > 0 ? Math.round((detail.task_done_count / detail.task_count) * 100) : 0}%</div>
                    <ProgressBar done={detail.task_done_count} total={detail.task_count} color="var(--green)" />
                  </div>
                  <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{detail.days_left ?? '—'} / {detail.days_total ?? '—'} Days Left</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', margin: '2px 0 8px' }}>{detail.days_total ? Math.round(((detail.days_left || 0) / detail.days_total) * 100) : 0}%</div>
                    <ProgressBar done={detail.days_left ?? 0} total={detail.days_total ?? 0} color="var(--teal)" />
                  </div>
                </div>

                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <Icon name="fileText" size={13} /> Expenses
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    <ExpenseStat label="Total" value={detail.expenses.total} color="var(--ink)" currency={detail.currency} />
                    <ExpenseStat label="Billable" value={detail.expenses.billable} color="var(--blue)" currency={detail.currency} />
                    <ExpenseStat label="Billed" value={detail.expenses.billed} color="var(--green)" currency={detail.currency} />
                    <ExpenseStat label="Unbilled" value={detail.expenses.unbilled} color="var(--red)" currency={detail.currency} />
                  </div>
                </div>

                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Total Logged Hours — This Week</div>
                  <div style={{ height: 180 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={detail.logged_hours_by_day.map(r => ({ day: r.day.slice(5, 10), hours: +(r.minutes / 60).toFixed(2) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <RechartsTooltip />
                        <Bar dataKey="hours" fill="var(--teal)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {tab === 'board' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, maxWidth: 480 }}>
              <input
                value={quickAddTitle} onChange={e => setQuickAddTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') quickAddTask(); }}
                placeholder="Quick-add a task to this project…"
                style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5, background: 'var(--white)', color: 'var(--ink)' }}
              />
              <Button size="sm" onClick={quickAddTask} disabled={!quickAddTitle.trim()}>Add</Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
              {KANBAN_COLUMNS.map(col => {
                const c = taskStatusCounts[col.status] || { total: 0, mine: 0 };
                return (
                  <div key={col.status} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{col.title}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{c.total}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>My Tasks: {c.mine}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
                  {(['kanban', 'table', 'milestone'] as const).map(v => (
                    <button key={v} type="button" onClick={() => setBoardView(v)}
                      style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: boardView === v ? 'var(--white)' : 'transparent', color: boardView === v ? 'var(--teal)' : 'var(--ink3)', boxShadow: boardView === v ? 'var(--elev-sm)' : 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Icon name={v === 'kanban' ? 'columns' : v === 'table' ? 'list' : 'flag'} size={13} /> {v === 'kanban' ? 'Board' : v === 'table' ? 'Table' : 'Milestones'}
                    </button>
                  ))}
                </div>
                <Select value={taskPriorityFilter} onValueChange={setTaskPriorityFilter}>
                  <SelectTrigger className="h-8 text-xs" style={{ width: 130 }}><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All priorities</SelectItem>
                    {(Object.keys(TASK_PRIORITY_META) as TaskPriority[]).map(p => <SelectItem key={p} value={p}>{TASK_PRIORITY_META[p].label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <input
                  value={taskSearch} onChange={e => setTaskSearch(e.target.value)} placeholder="Filter tasks…"
                  style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5, width: 160, background: 'var(--white)', color: 'var(--ink)' }}
                />
                {boardView === 'milestone' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={excludeCompletedMs} onChange={e => setExcludeCompletedMs(e.target.checked)} />
                    Exclude Completed Tasks
                  </label>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {selectedTaskIds.size > 0 && (
                  <Button size="sm" variant="outline" onClick={bulkMarkComplete} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="check" size={13} /> Mark Complete ({selectedTaskIds.size})
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={exportTasksCSV} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="download" size={13} /> Export
                </Button>
              </div>
            </div>

            {boardView === 'kanban' ? (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
                {KANBAN_COLUMNS.map(col => {
                  const colTasks = sortedTasks.filter(t => col.status === 'completed' ? (t.completed || t.status === 'completed') : (t.status === col.status && !t.completed));
                  return (
                    <div
                      key={col.status}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/proj-task-id'); if (id) moveTask(id, col.status); }}
                      style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', minHeight: 200 }}
                    >
                      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>{col.title}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)' }}>{colTasks.length}</span>
                      </div>
                      <div style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {colTasks.map(t => {
                          const milestone = milestones?.find(m => m.id === t.milestoneId);
                          return (
                            <div
                              key={t.id} draggable
                              onDragStart={e => e.dataTransfer.setData('text/proj-task-id', t.id)}
                              onClick={() => setDetailTaskId(t.id)}
                              style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, cursor: 'pointer' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.35 }}>{t.title}</div>
                                {!!t.blockedByOpenCount && (
                                  <span title={`Blocked by ${t.blockedByOpenCount} open task${t.blockedByOpenCount === 1 ? '' : 's'}`} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2, fontSize: 9.5, fontWeight: 700, color: 'var(--gold)', marginTop: 1 }}>
                                    <Icon name="link" size={10} />{t.blockedByOpenCount}
                                  </span>
                                )}
                              </div>
                              {(milestone || t.due || t.priority) && (
                                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                  {milestone && <span style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 600 }}>{milestone.name}</span>}
                                  {t.due && <span style={{ fontSize: 10, color: 'var(--ink3)' }}>Due {t.due}</span>}
                                  {t.priority && t.priority !== 'medium' && (
                                    <span style={{ fontSize: 9.5, fontWeight: 700, color: TASK_PRIORITY_META[t.priority].color, background: TASK_PRIORITY_META[t.priority].bg, padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase' }}>{TASK_PRIORITY_META[t.priority].label}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {colTasks.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--ink4)', padding: '8px 4px' }}>No tasks</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : boardView === 'table' ? (
              <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px', width: 30 }}>
                        <input type="checkbox"
                          checked={sortedTasks.length > 0 && selectedTaskIds.size === sortedTasks.length}
                          onChange={e => setSelectedTaskIds(e.target.checked ? new Set(sortedTasks.map(t => t.id)) : new Set())}
                        />
                      </th>
                      {([['title', 'Name'], ['status', 'Status'], ['due', 'Due'], ['priority', 'Priority']] as const).map(([key, label]) => (
                        <th key={key} onClick={() => toggleTaskSort(key)} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}>
                          {label} {taskSort.key === key ? (taskSort.dir === 1 ? '▲' : '▼') : ''}
                        </th>
                      ))}
                      <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Assigned</th>
                      <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTasks.map(t => {
                      const statusMeta = TASK_STATUS_META[t.completed ? 'completed' : t.status] || TASK_STATUS_META.none;
                      const prioMeta = TASK_PRIORITY_META[t.priority || 'medium'];
                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selectedTaskIds.has(t.id)} onChange={() => toggleTaskSelected(t.id)} />
                          </td>
                          <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }} onClick={() => setDetailTaskId(t.id)}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {t.title}
                              {!!t.blockedByOpenCount && (
                                <span title={`Blocked by ${t.blockedByOpenCount} open task${t.blockedByOpenCount === 1 ? '' : 's'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9.5, fontWeight: 700, color: 'var(--gold)' }}>
                                  <Icon name="link" size={10} />{t.blockedByOpenCount}
                                </span>
                              )}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <Select value={t.status === 'none' ? 'none' : t.status} onValueChange={v => moveTask(t.id, v as TaskStatus)}>
                              <SelectTrigger className="h-7 text-xs" style={{ width: 150 }}><SelectValue>{statusMeta.label}</SelectValue></SelectTrigger>
                              <SelectContent>
                                {KANBAN_COLUMNS.map(c => <SelectItem key={c.status} value={c.status}>{c.title}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                          <td style={{ padding: '9px 12px', color: t.due && t.due < new Date().toISOString().slice(0, 10) && !t.completed ? 'var(--red)' : 'var(--ink2)' }}>{t.due || '—'}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: prioMeta.color, background: prioMeta.bg, padding: '2px 8px', borderRadius: 5, textTransform: 'uppercase' }}>{prioMeta.label}</span>
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--ink2)' }}>
                            {t.assigneeName ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {t.assigneeName.slice(0, 1).toUpperCase()}
                                </span>
                                {t.assigneeName}
                              </span>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--ink3)', fontSize: 12 }}>{t.tags.join(', ') || '—'}</td>
                        </tr>
                      );
                    })}
                    {sortedTasks.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--ink4)', fontSize: 13 }}>No tasks match.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
                {[...(milestones || []), null].map(ms => {
                  const colId = ms?.id || '__none__';
                  const colTasks = sortedTasks.filter(t => (t.milestoneId || '__none__') === colId && (!excludeCompletedMs || !(t.completed || t.status === 'completed')));
                  if (ms === null && colTasks.length === 0) return null;
                  const limit = msColumnLimits[colId] || 20;
                  const loggedMinutes = colTasks.reduce((sum, t) => sum + (t.timeLoggedMinutes || 0), 0);
                  return (
                    <div
                      key={colId}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/proj-task-id'); if (id) moveTaskMilestone(id, ms?.id || null); }}
                      style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', minHeight: 200, width: 260, flexShrink: 0 }}
                    >
                      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>{ms?.name || 'No Milestone'}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)' }}>{colTasks.length}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 10, color: 'var(--ink4)' }}>
                          {ms?.due_date && <span>Due {ms.due_date}</span>}
                          {loggedMinutes > 0 && <span>{formatHM(loggedMinutes)} logged</span>}
                        </div>
                      </div>
                      <div style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {colTasks.slice(0, limit).map(t => (
                          <div
                            key={t.id} draggable
                            onDragStart={e => e.dataTransfer.setData('text/proj-task-id', t.id)}
                            onClick={() => setDetailTaskId(t.id)}
                            style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, cursor: 'pointer' }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.35, textDecoration: t.completed ? 'line-through' : 'none' }}>{t.title}</div>
                            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              <Badge variant={TASK_STATUS_META[t.completed ? 'completed' : t.status]?.variant || 'gray'} style={{ fontSize: 9.5 }}>{TASK_STATUS_META[t.completed ? 'completed' : t.status]?.label}</Badge>
                              {t.due && <span style={{ fontSize: 10, color: 'var(--ink3)' }}>Due {t.due}</span>}
                            </div>
                          </div>
                        ))}
                        {colTasks.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--ink4)', padding: '8px 4px' }}>No tasks</div>}
                        {colTasks.length > limit && (
                          <button type="button" onClick={() => setMsColumnLimits(prev => ({ ...prev, [colId]: limit + 20 }))}
                            style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: '4px 0' }}>
                            Load more ({colTasks.length - limit} more)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'gantt' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Select value={ganttMilestoneFilter} onValueChange={setGanttMilestoneFilter}>
                  <SelectTrigger className="h-8 text-xs" style={{ width: 160 }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All milestones</SelectItem>
                    <SelectItem value="__none__">No milestone</SelectItem>
                    {(milestones || []).map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
                  {(['weeks', 'months'] as const).map(z => (
                    <button key={z} type="button" onClick={() => setGanttZoom(z)}
                      style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, textTransform: 'capitalize', background: ganttZoom === z ? 'var(--white)' : 'transparent', color: ganttZoom === z ? 'var(--teal)' : 'var(--ink3)', boxShadow: ganttZoom === z ? 'var(--elev-sm)' : 'none' }}>
                      {z}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--ink3)', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--gold)', display: 'inline-block' }} /> Dependency</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 2, height: 10, background: 'var(--red)', display: 'inline-block' }} /> Today</span>
              </div>
            </div>

            {ganttRows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink3)', fontSize: 14 }}>No dated tasks to chart yet — add a due date to see it here.</div>
            ) : (() => {
              const bodyHeight = ganttRows.length * GANTT_ROW_H;
              const totalWidth = ganttTotalDays * ganttDayWidth;
              const labelWidth = 220;
              return (
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto' }}>
                  <div style={{ display: 'flex' }}>
                    <div style={{ width: labelWidth, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2, background: 'var(--white)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }} />
                    <div style={{ position: 'relative', width: totalWidth, height: 28, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                      {ganttMonthHeaders.map(h => (
                        <div key={h.label + h.left} style={{ position: 'absolute', left: h.left, width: h.width, top: 0, height: 28, display: 'flex', alignItems: 'center', paddingLeft: 6, fontSize: 11, fontWeight: 700, color: 'var(--ink3)', borderLeft: '1px solid var(--border)', boxSizing: 'border-box' }}>
                          {h.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex' }}>
                    <div style={{ width: labelWidth, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2, background: 'var(--white)', borderRight: '1px solid var(--border)' }}>
                      {ganttRows.map((row, i) => row.type === 'milestone' ? (
                        <div key={`ms-${row.ms?.id || 'none'}-${i}`} style={{ height: GANTT_ROW_H, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                          <Icon name="flag" size={11} style={{ marginRight: 5, flexShrink: 0 }} /> {row.ms?.name || 'No Milestone'}
                        </div>
                      ) : (
                        <div key={row.task.id} onClick={() => setDetailTaskId(row.task.id)}
                          style={{ height: GANTT_ROW_H, display: 'flex', alignItems: 'center', padding: '0 10px 0 22px', fontSize: 12.5, color: 'var(--ink)', borderBottom: '1px solid var(--border)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.task.title}
                        </div>
                      ))}
                    </div>

                    <div style={{ position: 'relative', width: totalWidth, flexShrink: 0 }}>
                      {ganttWeekTicks.map(x => (
                        <div key={x} style={{ position: 'absolute', left: x, top: 0, height: bodyHeight, width: 1, background: 'var(--border)' }} />
                      ))}
                      {ganttTodayOffset >= 0 && ganttTodayOffset <= totalWidth && (
                        <div style={{ position: 'absolute', left: ganttTodayOffset, top: 0, height: bodyHeight, width: 2, background: 'var(--red)', zIndex: 1 }} />
                      )}
                      {ganttRows.map((row, i) => {
                        if (row.type === 'milestone') {
                          return <div key={`msrow-${i}`} style={{ height: GANTT_ROW_H, background: 'var(--bg)', borderBottom: '1px solid var(--border)' }} />;
                        }
                        const geo = ganttBarGeometry(row.task);
                        return (
                          <div key={row.task.id} style={{ height: GANTT_ROW_H, position: 'relative', borderBottom: '1px solid var(--border)' }}>
                            {geo && (
                              <div
                                onClick={() => setDetailTaskId(row.task.id)}
                                title={`${row.task.title}${row.task.start ? ` — ${row.task.start} → ` : ' — due '}${row.task.due || ''}`}
                                style={{
                                  position: 'absolute', left: geo.left, width: geo.width, top: 7, height: GANTT_ROW_H - 14, borderRadius: 4, cursor: 'pointer',
                                  background: STATUS_BAR_COLOR[row.task.completed ? 'completed' : row.task.status],
                                  opacity: geo.hasStart ? 1 : 0.55,
                                  border: geo.hasStart ? 'none' : '1px dashed var(--ink3)',
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                      <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={totalWidth} height={bodyHeight}>
                        {ganttConnectors.map((c, i) => {
                          const midX = (c.x1 + c.x2) / 2;
                          return <path key={i} d={`M ${c.x1} ${c.y1} C ${midX} ${c.y1}, ${midX} ${c.y2}, ${c.x2} ${c.y2}`} stroke="var(--gold)" strokeWidth={1.5} fill="none" />;
                        })}
                      </svg>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {tab === 'timesheets' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <DatePicker date={timesheetFrom ? parseDateOnly(timesheetFrom) : undefined} onChange={d => setTimesheetFrom(d ? toDateOnlyString(d) : '')} placeholder="From" />
                <DatePicker date={timesheetTo ? parseDateOnly(timesheetTo) : undefined} onChange={d => setTimesheetTo(d ? toDateOnlyString(d) : '')} placeholder="To" />
                {(timesheetFrom || timesheetTo) && (
                  <Button size="sm" variant="outline" onClick={() => { setTimesheetFrom(''); setTimesheetTo(''); }}>Clear</Button>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => {
                const rows = [
                  ['Date', 'Task', 'Person', 'Duration (h)', 'Billable', 'Amount'].join(','),
                  ...(timesheets || []).map(r => [
                    `"${r.started_at.slice(0, 10)}"`, `"${r.task_title.replace(/"/g, '""')}"`, `"${r.user_name}"`,
                    (+(((r.duration_minutes || 0) / 60).toFixed(2))), r.is_billable ? 'Yes' : 'No', r.amount,
                  ].join(',')),
                ].join('\n');
                const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url; link.setAttribute('download', `${selected.name}_timesheets.csv`);
                document.body.appendChild(link); link.click(); document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon name="download" size={13} /> Export
              </Button>
            </div>

            {timesheetTotals && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Total Logged</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{formatHM(timesheetTotals.totalMinutes)}</div>
                </div>
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Billable Hours</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--blue)', marginTop: 4 }}>{formatHM(timesheetTotals.billableMinutes)}</div>
                </div>
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Billable Amount</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)', marginTop: 4 }}>{selected.currency} {timesheetTotals.billableAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
              </div>
            )}

            {timesheets === null ? (
              <div style={{ color: 'var(--ink3)', fontSize: 14 }}>Loading…</div>
            ) : timesheets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink3)', fontSize: 14 }}>No logged time yet.</div>
            ) : (
              <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      {['Date', 'Task', 'Person', 'Duration', 'Billable', 'Amount'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {timesheets.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 12px', color: 'var(--ink2)' }}>{r.started_at.slice(0, 10)}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--ink)' }}>{r.task_title}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--ink2)' }}>{r.user_name}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums' }}>{formatHM(r.duration_minutes || 0)}</td>
                        <td style={{ padding: '9px 12px' }}>{r.is_billable ? <Badge variant="brand">Billable</Badge> : <Badge variant="gray">Non-billable</Badge>}</td>
                        <td style={{ padding: '9px 12px', color: r.amount ? 'var(--green)' : 'var(--ink3)', fontWeight: r.amount ? 700 : 400 }}>{r.amount ? `${selected.currency} ${r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'files' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FileUploader onUpload={uploadProjectFiles} multiple />
            {uploadingFiles && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Uploading…</div>}
            {projectFiles === null ? (
              <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
            ) : projectFiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink3)', fontSize: 14 }}>No files yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {projectFiles.map(f => {
                  const isVisible = !!selected.customer_id && f.shared.some(s => s.principal_type === 'customer' && s.principal_id === selected.customer_id);
                  return (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <Icon name="fileText" size={14} color="var(--ink3)" />
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink4)' }}>{f.size ? `${(f.size / 1024).toFixed(0)} KB` : ''}</span>
                      {selected.customer_id && (
                        <label title="Share this file with the project's customer via the real Drive sharing mechanism" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--ink3)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={isVisible} onChange={e => toggleFileVisibleToCustomer(f, e.target.checked)} />
                          Visible to customer
                        </label>
                      )}
                      <button type="button" onClick={() => apiDownload(`/v1/files/${f.id}/download`, f.name)} title="Download"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', display: 'flex', padding: 2 }}>
                        <Icon name="download" size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'activity' && (
          <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projectActivity === null ? (
              <div style={{ color: 'var(--ink3)', fontSize: 14 }}>Loading…</div>
            ) : projectActivity.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink3)', fontSize: 14 }}>No activity yet.</div>
            ) : (
              projectActivity.map(a => (
                <div key={a.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {a.actor_name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{a.actor_name}</span> {describeProjectActivity(a)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 1 }}>{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'milestones' && (
          <MilestonesTab
            milestones={milestones}
            onAdd={addMilestone}
            onUpdate={updateMilestone}
            onDelete={deleteMilestone}
          />
        )}

        {tab === 'members' && (
          <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <EntityPicker value={null} onChange={v => v && addMember(v)} search={searchColleagues} placeholder="Add a colleague to this project…" />
            {members === null ? (
              <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
            ) : members.length === 0 ? (
              <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No members yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {members.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink)' }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'capitalize' }}>{m.role}</span>
                    {m.role !== 'owner' && (
                      <button type="button" onClick={() => removeMember(m.user_id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', display: 'flex', padding: 2 }}>
                        <Icon name="x" size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {detailTask && (
        <TaskDetailDrawer
          task={detailTask}
          milestones={milestones || []}
          otherTasks={projectTasks.filter(t => t.id !== detailTask.id)}
          onClose={() => setDetailTaskId(null)}
          onDelete={() => { deleteTodo(detailTask.id); setDetailTaskId(null); loadProjects(); }}
        />
      )}
    </div>
  );
};

/* ── Milestones tab ── */
function MilestonesTab({ milestones, onAdd, onUpdate, onDelete }: {
  milestones: MilestoneRow[] | null;
  onAdd: (name: string) => void;
  onUpdate: (id: string, patch: { status?: string; dueDate?: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const [newName, setNewName] = useState('');
  return (
    <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { onAdd(newName.trim()); setNewName(''); } }}
          placeholder="New milestone name…"
          style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5, background: 'var(--white)', color: 'var(--ink)' }}
        />
        <Button size="sm" onClick={() => { if (newName.trim()) { onAdd(newName.trim()); setNewName(''); } }} disabled={!newName.trim()}>Add</Button>
      </div>
      {milestones === null ? (
        <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
      ) : milestones.length === 0 ? (
        <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No milestones yet.</div>
      ) : (
        milestones.map(m => {
          const meta = MILESTONE_STATUS_META[m.status] || MILESTONE_STATUS_META.upcoming;
          return (
            <div key={m.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{m.name}</span>
                <Select value={m.status} onValueChange={v => onUpdate(m.id, { status: v })}>
                  <SelectTrigger className="h-7 text-xs" style={{ width: 120 }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MILESTONE_STATUS_META).map(([k, mm]) => <SelectItem key={k} value={k}>{mm.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Badge variant={meta.variant}>{meta.label}</Badge>
                <button type="button" onClick={() => onDelete(m.id)} title="Delete milestone" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', display: 'flex' }}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
              <ProgressBar done={m.task_done_count} total={m.task_count} color="var(--teal)" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Due</span>
                <DatePicker
                  date={m.due_date ? parseDateOnly(m.due_date) : undefined}
                  onChange={d => onUpdate(m.id, { dueDate: d ? toDateOnlyString(d) : null })}
                  placeholder="No due date"
                  triggerClassName="h-7 text-xs"
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

interface Collaborator { id: string; user_id: string; kind: 'assignee' | 'follower'; name: string; email: string }
interface ActivityEntry { id: string; action: string; detail: Record<string, any>; created_at: string; actor_name: string }
interface DependencyRow { id: string; task_id: string; title: string; status: string; completed: boolean; due: string | null }

function describeActivity(a: ActivityEntry): string {
  switch (a.action) {
    case 'created': return 'created this task';
    case 'status_changed': return `changed status: ${a.detail.from} → ${a.detail.to}`;
    case 'priority_changed': return `changed priority: ${a.detail.from} → ${a.detail.to}`;
    case 'assigned': return a.detail.assigneeId ? 'assigned this task' : 'unassigned this task';
    case 'completed': return 'marked this task complete';
    case 'commented': return `commented: "${a.detail.preview}"`;
    case 'moved_project': return 'moved this task to a project';
    default: return a.action;
  }
}

/* ── Compact task detail drawer for Projects mode ── */
function TaskDetailDrawer({ task, milestones, otherTasks, onClose, onDelete }: {
  task: Todo; milestones: MilestoneRow[]; otherTasks: Todo[]; onClose: () => void; onDelete: () => void;
}) {
  const [collaborators, setCollaborators] = useState<Collaborator[] | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  const [deps, setDeps] = useState<{ blockedBy: DependencyRow[]; blocks: DependencyRow[] } | null>(null);
  const [addingDepId, setAddingDepId] = useState<string>('__none__');

  useEffect(() => {
    apiFetch(`/v1/tasks/items/${task.id}/collaborators`).then(res => setCollaborators(res.data || [])).catch(() => setCollaborators([]));
    apiFetch(`/v1/tasks/items/${task.id}/activity`).then(res => setActivity(res.data || [])).catch(() => setActivity([]));
    apiFetch(`/v1/tasks/items/${task.id}/dependencies`).then(res => setDeps(res.data || { blockedBy: [], blocks: [] })).catch(() => setDeps({ blockedBy: [], blocks: [] }));
  }, [task.id]);

  async function addCollaborator(picked: PickerItem, kind: 'assignee' | 'follower') {
    const res = await apiFetch(`/v1/tasks/items/${task.id}/collaborators`, { method: 'POST', body: JSON.stringify({ userId: picked.id, kind }) }).catch(() => null);
    if (res?.data) setCollaborators(prev => [...(prev || []), res.data]);
  }
  async function removeCollaborator(id: string) {
    setCollaborators(prev => (prev || []).filter(c => c.id !== id));
    await apiFetch(`/v1/tasks/items/${task.id}/collaborators/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  async function addDependency() {
    if (addingDepId === '__none__') return;
    const res = await apiFetch(`/v1/tasks/items/${task.id}/dependencies`, { method: 'POST', body: JSON.stringify({ dependsOnTaskId: addingDepId }) }).catch(() => null);
    if (res?.data) {
      const t = otherTasks.find(t => t.id === addingDepId);
      if (t) setDeps(prev => ({ blockedBy: [...(prev?.blockedBy || []), { id: res.data.id, task_id: t.id, title: t.title, status: t.status, completed: t.completed, due: t.due || null }], blocks: prev?.blocks || [] }));
      setAddingDepId('__none__');
    }
  }
  async function removeDependency(depId: string) {
    setDeps(prev => prev ? { ...prev, blockedBy: prev.blockedBy.filter(d => d.id !== depId) } : prev);
    await apiFetch(`/v1/tasks/items/${task.id}/dependencies/${depId}`, { method: 'DELETE' }).catch(() => {});
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} />
      <div style={{ position: 'relative', width: 380, maxWidth: '100%', height: '100%', background: 'var(--white)', boxShadow: '-4px 0 24px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', padding: 20, gap: 14, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Task</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex' }}><Icon name="x" size={16} /></button>
        </div>
        <textarea
          defaultValue={task.title}
          onBlur={e => { if (e.target.value.trim() && e.target.value !== task.title) updateTodo(task.id, { title: e.target.value.trim() }); }}
          rows={2}
          style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', border: 'none', resize: 'none', outline: 'none', fontFamily: 'var(--font)', padding: 0 }}
        />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Status</div>
          <Select value={task.status} onValueChange={v => updateTodo(task.id, { status: v as TaskStatus, completed: v === 'completed' })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KANBAN_COLUMNS.map(c => <SelectItem key={c.status} value={c.status}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Priority</div>
          <Select value={task.priority || 'medium'} onValueChange={v => updateTodo(task.id, { priority: v as TaskPriority })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)', cursor: 'pointer', marginBottom: task.isBillable ? 6 : 0 }}>
            <input type="checkbox" checked={!!task.isBillable} onChange={e => updateTodo(task.id, { isBillable: e.target.checked })} />
            Billable
          </label>
          {task.isBillable && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>$</span>
              <input
                type="number" min={0} step={0.5} defaultValue={task.hourlyRate ?? ''}
                onBlur={e => updateTodo(task.id, { hourlyRate: e.target.value ? Number(e.target.value) : null })}
                placeholder="0.00"
                style={{ width: 90, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--ink)' }}
              />
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>/ hour</span>
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Milestone</div>
          <Select value={task.milestoneId || '__none__'} onValueChange={v => updateTodo(task.id, { milestoneId: v === '__none__' ? null : v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No milestone</SelectItem>
              {milestones.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Start date</div>
            <DatePicker
              date={task.start ? parseDateOnly(task.start) : undefined}
              onChange={d => updateTodo(task.id, { start: d ? toDateOnlyString(d) : undefined })}
              placeholder="No start date"
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Due date</div>
            <DatePicker
              date={task.due ? parseDateOnly(task.due) : undefined}
              onChange={d => updateTodo(task.id, { due: d ? toDateOnlyString(d) : undefined })}
              placeholder="No due date"
            />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Notes</div>
          <textarea
            defaultValue={task.notes || ''}
            onBlur={e => updateTodo(task.id, { notes: e.target.value })}
            rows={4}
            placeholder="Add notes…"
            style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!task.isPrivate} onChange={e => updateTodo(task.id, { isPrivate: e.target.checked })} />
          Private task (hidden from other project members)
        </label>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 6 }}>Collaborators</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {(collaborators || []).map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{c.name}</span>
                <Badge variant={c.kind === 'assignee' ? 'brand' : 'gray'} style={{ fontSize: 10 }}>{c.kind}</Badge>
                <button type="button" onClick={() => removeCollaborator(c.id)} title="Remove"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', display: 'flex', padding: 2 }}>
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))}
            {collaborators !== null && collaborators.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink4)' }}>No collaborators yet.</div>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <EntityPicker value={null} onChange={v => v && addCollaborator(v, 'assignee')} search={searchColleagues} placeholder="+ Assignee…" />
            </div>
            <div style={{ flex: 1 }}>
              <EntityPicker value={null} onChange={v => v && addCollaborator(v, 'follower')} search={searchColleagues} placeholder="+ Follower…" />
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 6 }}>
            Blocked by <span style={{ fontWeight: 400, color: 'var(--ink4)' }}>— visualization only, does not block completion</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {(deps?.blockedBy || []).map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)', textDecoration: d.completed ? 'line-through' : 'none' }}>{d.title}</span>
                <Badge variant={TASK_STATUS_META[d.completed ? 'completed' : (d.status as TaskStatus)]?.variant || 'gray'} style={{ fontSize: 10 }}>
                  {TASK_STATUS_META[d.completed ? 'completed' : (d.status as TaskStatus)]?.label || d.status}
                </Badge>
                <button type="button" onClick={() => removeDependency(d.id)} title="Remove"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', display: 'flex', padding: 2 }}>
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))}
            {deps !== null && deps.blockedBy.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink4)' }}>Not blocked by anything.</div>}
          </div>
          {otherTasks.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              <Select value={addingDepId} onValueChange={setAddingDepId}>
                <SelectTrigger className="h-8 text-xs" style={{ flex: 1 }}><SelectValue placeholder="+ Depends on…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select a task…</SelectItem>
                  {otherTasks.filter(t => !(deps?.blockedBy || []).some(d => d.task_id === t.id)).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={addDependency} disabled={addingDepId === '__none__'}>Add</Button>
            </div>
          )}
          {(deps?.blocks || []).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10.5, color: 'var(--ink4)', marginBottom: 4 }}>Blocking these tasks:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {deps!.blocks.map(d => (
                  <div key={d.id} style={{ fontSize: 12, color: 'var(--ink3)' }}>{d.title}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 6 }}>Activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activity === null ? (
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Loading…</div>
            ) : activity.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--ink4)' }}>No activity yet.</div>
            ) : (
              activity.map(a => (
                <div key={a.id} style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700, color: 'var(--ink2)' }}>{a.actor_name}</span> {describeActivity(a)}
                  <span style={{ color: 'var(--ink4)' }}> · {new Date(a.created_at).toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={onDelete} style={{ marginTop: 'auto', color: 'var(--red)', borderColor: 'var(--red)' }}>
          <Icon name="trash" size={13} /> Delete task
        </Button>
      </div>
    </div>
  );
}
