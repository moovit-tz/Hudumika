import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Banner } from '../components/ui/alert.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useTodos, addTodo, updateTodo, deleteTodo, Todo, TaskStatus, TaskPriority } from '../data/calendarStore.js';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuth } from '../hooks/useAuth.js';
import { FileUploader } from '../components/ui/file-uploader.js';
import { MentionInput, type MentionUser } from '../components/MentionInput.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuCheckboxItem } from '../components/ui/dropdown-menu.js';
import { SectionCard } from '../components/SectionCard.js';
import { Sheet, SheetContent, SheetTitle } from '../components/ui/sheet.js';

// Project OS Enterprise Modules
import { ProjectCommandCenter } from './projects/ProjectCommandCenter.js';
import { ProjectPortfolios } from './projects/ProjectPortfolios.js';
import { ProjectWbsSchedule } from './projects/ProjectWbsSchedule.js';
import { ProjectFinancialsEvm } from './projects/ProjectFinancialsEvm.js';
import { ProjectGovernance } from './projects/ProjectGovernance.js';
import { ProjectProcurement } from './projects/ProjectProcurement.js';
import { ProjectResources } from './projects/ProjectResources.js';
import { ProjectIndustryPack } from './projects/ProjectIndustryPack.js';
import { ProjectCreateModal } from './projects/ProjectCreateModal.js';
import type { ProjectIndustry, ProjectType } from '@hudumika/types';

interface ProjectSummary {
  id: string; ref: string | null; name: string; description: string | null; color: string; status: string;
  owner_id: string; owner_name: string | null; start_date: string | null; target_date: string | null;
  customer_id: string | null; customer_name: string | null; billing_type: string; total_rate: string | null; currency: string;
  created_at: string;
  member_count: number; task_count: number; task_done_count: number;
  is_pinned: boolean;
  industry?: ProjectIndustry;
  project_type?: ProjectType;
  health_status?: 'on_track' | 'at_risk' | 'critical' | 'completed';
  progress_pct?: number;
  contract_value?: number;
  baseline_budget?: number;
  current_budget?: number;
  actual_cost?: number;
  earned_value?: number;
  planned_value?: number;
  location_address?: string;
  portfolio_name?: string;
  program_name?: string;
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
interface DiscussionRow { id: string; content: string; mentions: { user_id: string; name: string }[]; created_at: string; author_id: string; author_name: string }
interface ProjectTicketRow { id: string; ref_number: string; subject: string; status: string; priority: string; category: string; created_at: string; resolved_at: string | null }
interface ProjectInvoiceRow { id: string; invoice_number: string; status: string; currency: string; received: string; bill_date: string | null; due_date: string | null; created_at: string; total: number }

const INVOICE_STATUS_META: Record<string, { label: string; variant: 'gray' | 'brand' | 'warning' | 'success' | 'error' }> = {
  Draft: { label: 'Draft', variant: 'gray' }, Unpaid: { label: 'Unpaid', variant: 'brand' },
  Paid: { label: 'Paid', variant: 'success' }, Overdue: { label: 'Overdue', variant: 'error' },
  Partial: { label: 'Partial', variant: 'warning' }, Credited: { label: 'Credited', variant: 'gray' },
};
const TICKET_STATUS_META: Record<string, { label: string; variant: 'gray' | 'brand' | 'warning' | 'success' | 'error' }> = {
  OPEN: { label: 'Open', variant: 'brand' }, IN_PROGRESS: { label: 'In Progress', variant: 'warning' },
  RESOLVED: { label: 'Resolved', variant: 'success' }, CLOSED: { label: 'Closed', variant: 'gray' },
};

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

const HEALTH_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  on_track: { label: 'ON TRACK', color: 'var(--green)', bg: 'var(--green-l)' },
  at_risk: { label: 'AT RISK', color: 'var(--gold)', bg: 'var(--gold-l)' },
  critical: { label: 'CRITICAL', color: 'var(--red)', bg: 'var(--red-l)' },
  completed: { label: 'COMPLETED', color: 'var(--teal)', bg: 'var(--teal-l)' },
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
  low: { label: 'Low', color: 'var(--ink3)', bg: 'var(--bg-subtle)' },
  medium: { label: 'Medium', color: 'var(--gold)', bg: 'var(--gold-l)' },
  high: { label: 'High', color: 'var(--gold)', bg: 'var(--gold-l)' },
  urgent: { label: 'Urgent', color: 'var(--red)', bg: 'var(--red-l)' },
};
const STATUS_BAR_COLOR: Record<TaskStatus, string> = {
  none: 'var(--ink3)', in_progress: 'var(--teal)', in_review: 'var(--gold)', waiting: 'var(--blue)', completed: 'var(--green)',
};
function dayDiff(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / 86400000); }

const CUSTOMER_VISIBLE_TABS = new Set(['overview', 'wbs_schedule', 'financials_evm', 'industry_pack', 'board', 'gantt', 'files', 'milestones']);

async function searchColleagues(q: string): Promise<PickerItem[]> {
  const rows = await apiFetch(`/v1/hr/staff?search=${encodeURIComponent(q)}`).catch(() => []);
  return (rows || []).map((u: any) => ({ id: u.id, label: u.name, sublabel: u.email }));
}
async function fetchColleaguesForMentions(): Promise<MentionUser[]> {
  const rows = await apiFetch('/v1/hr/staff').catch(() => []);
  return (rows || []).map((u: any) => ({ id: u.id, name: u.name, role: u.role }));
}
function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function ProgressBar({ done, total, color }: { done: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 'var(--r-sm)', background: 'var(--bg)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 'var(--r-sm)', transition: 'width 0.2s' }} />
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

export interface ProjectsAppProps {
  initialMode?: 'command_center' | 'portfolios' | 'projects_list' | 'resources';
}

export const ProjectsApp: React.FC<ProjectsAppProps> = ({ initialMode = 'command_center' }) => {
  const isMobile = useIsMobile();
  const allTodos = useTodos();
  const [appViewMode, setAppViewMode] = useState<'command_center' | 'portfolios' | 'projects_list' | 'resources'>(initialMode);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [listStatusFilter, setListStatusFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Tab State inside a selected project
  const [tab, setTab] = useState<
    | 'overview'
    | 'wbs_schedule'
    | 'financials_evm'
    | 'governance'
    | 'procurement'
    | 'resources'
    | 'industry_pack'
    | 'board'
    | 'gantt'
    | 'timesheets'
    | 'files'
    | 'discussions'
    | 'tickets'
    | 'sales'
    | 'activity'
    | 'milestones'
    | 'members'
  >('overview');

  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [milestones, setMilestones] = useState<MilestoneRow[] | null>(null);
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string | null }[] | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const { user } = useAuth();
  const [boardView, setBoardView] = useState<'kanban' | 'table' | 'milestone'>('kanban');
  const [excludeCompletedMs, setExcludeCompletedMs] = useState(false);
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
  const [workload, setWorkload] = useState<{ user_id: string; name: string; avatar_url: string | null; logged_minutes: number }[] | null>(null);
  const [discussions, setDiscussions] = useState<DiscussionRow[] | null>(null);
  const [discussionColleagues, setDiscussionColleagues] = useState<MentionUser[]>([]);
  const [discussionDraft, setDiscussionDraft] = useState('');
  const [discussionMentions, setDiscussionMentions] = useState<{ user_id: string; name: string }[]>([]);
  const [postingDiscussion, setPostingDiscussion] = useState(false);
  const [projectTickets, setProjectTickets] = useState<ProjectTicketRow[] | null>(null);
  const [linkableTickets, setLinkableTickets] = useState<{ id: string; ref: string; subject: string; project_id: string | null }[]>([]);
  const [linkTicketId, setLinkTicketId] = useState('__none__');
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [projectInvoices, setProjectInvoices] = useState<ProjectInvoiceRow[] | null>(null);
  const [viewAsCustomer, setViewAsCustomer] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [retainer, setRetainer] = useState<{ id: string; amount: number; currency: string; frequency: string; state: string; next_due: string | null } | null | undefined>(undefined);
  const [settingUpRetainer, setSettingUpRetainer] = useState(false);
  const [retainerAmount, setRetainerAmount] = useState('');
  const [retainerFrequency, setRetainerFrequency] = useState('MONTHLY');

  useEffect(() => {
    setAppViewMode(initialMode);
  }, [initialMode]);

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
    const rows = listStatusFilter === 'all' ? projects : projects.filter(p => p.status === listStatusFilter);
    return [...rows].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
  }, [projects, listStatusFilter]);

  async function togglePin(p: ProjectSummary, e: React.MouseEvent) {
    e.stopPropagation();
    setProjects(prev => (prev || []).map(x => x.id === p.id ? { ...x, is_pinned: !p.is_pinned } : x));
    await apiFetch(`/v1/tasks/projects/${p.id}/pin`, { method: p.is_pinned ? 'DELETE' : 'POST' }).catch(() => loadProjects());
  }

  const loadDetail = useCallback((id: string) => {
    apiFetch(`/v1/tasks/projects/${id}`).then(res => setDetail(res.data || null)).catch(() => setDetail(null));
    apiFetch(`/v1/tasks/projects/${id}/members`).then(res => setMembers(res.data || [])).catch(() => setMembers([]));
    apiFetch(`/v1/tasks/projects/${id}/milestones`).then(res => setMilestones(res.data || [])).catch(() => setMilestones([]));
  }, []);
  useEffect(() => {
    if (selectedId) {
      setDetail(null); setMembers(null); setMilestones(null); setTab('overview'); setTimesheets(null); setTimesheetTotals(null);
      setProjectFiles(null); setProjectActivity(null); setWorkload(null); setDiscussions(null); setProjectTickets(null); setProjectInvoices(null); setRetainer(undefined);
      loadDetail(selectedId);
      apiFetch(`/v1/tasks/projects/${selectedId}/retainer`).then(res => setRetainer(res.data || null)).catch(() => setRetainer(null));
    }
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
    if (viewAsCustomer && !CUSTOMER_VISIBLE_TABS.has(tab)) setTab('overview');
  }, [viewAsCustomer, tab]);

  useEffect(() => {
    if (tab === 'gantt' && selectedId) {
      apiFetch(`/v1/tasks/projects/${selectedId}/dependencies`).then(res => setGanttEdges(res.data || [])).catch(() => setGanttEdges([]));
    }
  }, [tab, selectedId]);

  useEffect(() => {
    if (tab === 'members' && selectedId) {
      apiFetch(`/v1/tasks/projects/${selectedId}/workload`).then(res => setWorkload(res.data || [])).catch(() => setWorkload([]));
    }
  }, [tab, selectedId]);

  useEffect(() => {
    if (tab === 'discussions' && selectedId) {
      apiFetch(`/v1/tasks/projects/${selectedId}/discussions`).then(res => setDiscussions(res.data || [])).catch(() => setDiscussions([]));
      if (discussionColleagues.length === 0) fetchColleaguesForMentions().then(setDiscussionColleagues).catch(() => {});
    }
  }, [tab, selectedId]);

  async function postDiscussion() {
    if (!selectedId || !discussionDraft.trim() || postingDiscussion) return;
    setPostingDiscussion(true);
    try {
      const res = await apiFetch(`/v1/tasks/projects/${selectedId}/discussions`, {
        method: 'POST', body: JSON.stringify({ content: discussionDraft.trim(), mentions: discussionMentions }),
      });
      setDiscussions(prev => [...(prev || []), res.data]);
      setDiscussionDraft(''); setDiscussionMentions([]);
    } catch { /* apiFetch already surfaces errors globally */ }
    finally { setPostingDiscussion(false); }
  }
  async function removeDiscussion(id: string) {
    setDiscussions(prev => (prev || []).filter(d => d.id !== id));
    await apiFetch(`/v1/tasks/projects/${selectedId}/discussions/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  const loadTickets = useCallback(() => {
    if (!selectedId) return;
    apiFetch(`/v1/tasks/projects/${selectedId}/tickets`).then(res => setProjectTickets(res.data || [])).catch(() => setProjectTickets([]));
  }, [selectedId]);
  useEffect(() => {
    if (tab === 'tickets' && selectedId) {
      loadTickets();
      if (selected?.customer_id) {
        apiFetch(`/v1/support/tickets?customer_id=${selected.customer_id}`).then(res => setLinkableTickets(Array.isArray(res) ? res : (res.data || []))).catch(() => setLinkableTickets([]));
      }
    }
  }, [tab, selectedId, selected?.customer_id, loadTickets]);

  async function linkTicket() {
    if (!selectedId || linkTicketId === '__none__') return;
    await apiFetch(`/v1/tasks/projects/${selectedId}/tickets/link`, { method: 'POST', body: JSON.stringify({ ticketId: linkTicketId }) }).catch(() => {});
    setLinkTicketId('__none__');
    loadTickets();
  }
  async function createProjectTicket() {
    if (!selectedId || !ticketSubject.trim()) return;
    try {
      await apiFetch(`/v1/tasks/projects/${selectedId}/tickets`, { method: 'POST', body: JSON.stringify({ subject: ticketSubject.trim(), category: 'General' }) });
      setTicketSubject(''); setCreatingTicket(false);
      loadTickets();
    } catch { /* apiFetch already surfaces errors globally */ }
  }

  useEffect(() => {
    if (tab === 'sales' && selectedId) {
      apiFetch(`/v1/tasks/projects/${selectedId}/invoices`).then(res => setProjectInvoices(res.data || [])).catch(() => setProjectInvoices([]));
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

  function bulkMarkComplete() {
    let blocked = 0;
    for (const id of selectedTaskIds) {
      const t = projectTasks.find(x => x.id === id);
      if (t && (t.blockedByOpenCount || 0) > 0) { blocked++; continue; }
      updateTodo(id, { status: 'completed', completed: true });
    }
    if (blocked > 0) {
      showAlert(`${blocked} task${blocked === 1 ? ' was' : 's were'} skipped — still blocked by an open dependency.`, { variant: 'error' });
    }
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
  const exportProjectData = exportTasksCSV;

  // Gantt calculations
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

  async function invoiceProject() {
    if (!selectedId || invoicing) return;
    setInvoicing(true);
    try {
      await apiFetch(`/v1/tasks/projects/${selectedId}/invoice`, { method: 'POST' });
      loadDetail(selectedId);
    } catch { /* handled */ }
    finally { setInvoicing(false); }
  }

  async function setUpRetainer() {
    if (!selectedId || !selected?.customer_id || !retainerAmount.trim()) return;
    const res = await apiFetch('/v1/invoices/recurring', {
      method: 'POST', body: JSON.stringify({
        name: `${selected.name} — Retainer`, customer_id: selected.customer_id, project_id: selectedId,
        frequency: retainerFrequency, amount: Number(retainerAmount), currency: selected.currency,
      }),
    }).catch(() => null);
    if (res) { setRetainer(res); setSettingUpRetainer(false); setRetainerAmount(''); }
  }

  async function copyProject() {
    if (!selectedId) return;
    const res = await apiFetch(`/v1/tasks/projects/${selectedId}/copy`, { method: 'POST' }).catch(() => null);
    if (res?.data) { loadProjects(); setSelectedId(res.data.id); }
  }

  async function deleteProjectAction() {
    if (!selectedId || !selected) return;
    if (!window.confirm(`Delete "${selected.name}"? This cannot be undone.`)) return;
    await apiFetch(`/v1/tasks/projects/${selectedId}`, { method: 'DELETE' }).catch(() => {});
    setSelectedId(null);
    loadProjects();
  }

  async function saveAsTemplate() {
    if (!selectedId || !templateName.trim()) return;
    try {
      await apiFetch(`/v1/tasks/projects/${selectedId}/save-as-template`, {
        method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), name: templateName.trim() }),
      });
      setSavingTemplate(false);
      setTemplates(null);
    } catch { /* handled */ }
  }

  function quickAddTask() {
    if (!quickAddTitle.trim() || !selectedId) return;
    addTodo({ title: quickAddTitle.trim(), projectId: selectedId, status: 'none' });
    setQuickAddTitle('');
    loadProjects();
  }

  function moveTask(taskId: string, status: TaskStatus) {
    if (status === 'completed') {
      const t = projectTasks.find(x => x.id === taskId);
      if (t && (t.blockedByOpenCount || 0) > 0) {
        showAlert(`Can't complete this task — blocked by ${t.blockedByOpenCount} open dependencies.`, { variant: 'error' });
        return;
      }
    }
    updateTodo(taskId, status === 'completed' ? { status, completed: true } : { status, completed: false });
    loadProjects();
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

  // ═════════════════════════════════════════════════════════════════════
  // NO PROJECT SELECTED: High-Level Operating System Views
  // ═════════════════════════════════════════════════════════════════════
  if (!selectedId || !selected) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
        {/* Top OS App Navigation Bar */}
        <div style={{ padding: isMobile ? '16px 16px 0' : '24px 32px 0', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--teal)', background: 'var(--teal-l)', padding: '2px 8px', borderRadius: 'var(--r-sm)', letterSpacing: '0.06em' }}>
                  Hudumika Project OS
                </span>
                <span style={{ fontSize: 13, color: 'var(--ink3)', fontWeight: 600 }}>Enterprise Edition</span>
              </div>
              <h1 style={{ margin: '4px 0 0', fontSize: isMobile ? 22 : 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                {appViewMode === 'command_center' && 'Executive Project Command Center'}
                {appViewMode === 'portfolios' && 'Strategic Portfolios & Programs'}
                {appViewMode === 'resources' && 'Heavy Machinery & Resource Fleet'}
                {appViewMode === 'projects_list' && 'Enterprise Projects Directory'}
              </h1>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                size="sm"
                onClick={() => setShowCreateModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
              >
                <Icon name="plus" size={15} /> New Enterprise Project
              </Button>
            </div>
          </div>

          {/* View Mode Switcher Buttons */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12 }}>
            <button
              type="button"
              onClick={() => setAppViewMode('command_center')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--r)',
                border: 'none',
                background: appViewMode === 'command_center' ? 'hsl(var(--primary))' : 'transparent',
                color: appViewMode === 'command_center' ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="activity" size={15} /> Command Center
            </button>
            <button
              type="button"
              onClick={() => setAppViewMode('portfolios')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--r)',
                border: 'none',
                background: appViewMode === 'portfolios' ? 'hsl(var(--primary))' : 'transparent',
                color: appViewMode === 'portfolios' ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="layers" size={15} /> Portfolios & Programs
            </button>
            <button
              type="button"
              onClick={() => setAppViewMode('projects_list')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--r)',
                border: 'none',
                background: appViewMode === 'projects_list' ? 'hsl(var(--primary))' : 'transparent',
                color: appViewMode === 'projects_list' ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="briefcase" size={15} /> Projects Directory ({projects?.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setAppViewMode('resources')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--r)',
                border: 'none',
                background: appViewMode === 'resources' ? 'hsl(var(--primary))' : 'transparent',
                color: appViewMode === 'resources' ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="truck" size={15} /> Heavy Machinery Fleet
            </button>
          </div>
        </div>

        {/* View Mode Content */}
        {appViewMode === 'command_center' && (
          <div style={{ padding: isMobile ? 16 : 32 }}>
            <ProjectCommandCenter onSelectProject={(id) => setSelectedId(id)} />
          </div>
        )}

        {appViewMode === 'portfolios' && (
          <div style={{ padding: isMobile ? 16 : 32 }}>
            <ProjectPortfolios onSelectProject={(id) => setSelectedId(id)} />
          </div>
        )}

        {appViewMode === 'resources' && (
          <div style={{ padding: isMobile ? 16 : 32 }}>
            <ProjectResources />
          </div>
        )}

        {appViewMode === 'projects_list' && (
          <div style={{ padding: isMobile ? 16 : 32 }}>
            {/* Status Filter Bar */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              <button
                type="button"
                onClick={() => setListStatusFilter('all')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--r)',
                  border: `1px solid ${listStatusFilter === 'all' ? 'var(--teal)' : 'var(--border)'}`,
                  background: 'var(--white)',
                  cursor: 'pointer',
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: listStatusFilter === 'all' ? 'var(--teal)' : 'var(--ink2)',
                }}
              >
                All Projects ({projects?.length ?? 0})
              </button>
              {Object.entries(PROJECT_STATUS_META).map(([k, m]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setListStatusFilter((prev) => (prev === k ? 'all' : k))}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--r)',
                    border: `1px solid ${listStatusFilter === k ? 'var(--teal)' : 'var(--border)'}`,
                    background: 'var(--white)',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: listStatusFilter === k ? 'var(--teal)' : 'var(--ink2)',
                  }}
                >
                  {listCounts[k] ?? 0} {m.label}
                </button>
              ))}
            </div>

            {/* Projects Grid */}
            {filteredProjects === null ? (
              <SectionLoading />
            ) : filteredProjects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--ink3)', fontSize: 14 }}>
                {projects && projects.length > 0
                  ? 'No projects match this status filter.'
                  : 'No projects registered in the OS yet. Click "New Enterprise Project" to create your first portfolio project.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
                {filteredProjects.map((p) => {
                  const statusMeta = PROJECT_STATUS_META[p.status] || PROJECT_STATUS_META.not_started;
                  const healthMeta = HEALTH_STATUS_META[p.health_status || 'on_track'] || HEALTH_STATUS_META.on_track;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      style={{
                        textAlign: 'left',
                        background: 'var(--white)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-lg)',
                        padding: 20,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </span>
                        <span
                          onClick={(e) => togglePin(p, e)}
                          title={p.is_pinned ? 'Unpin' : 'Pin'}
                          style={{ display: 'flex', cursor: 'pointer', color: p.is_pinned ? 'var(--gold)' : 'var(--ink3)' }}
                        >
                          <Icon name="bookmark" size={15} duotone={p.is_pinned} />
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: 'var(--r-sm)',
                            color: healthMeta.color,
                            background: healthMeta.bg,
                            letterSpacing: '0.04em',
                          }}
                        >
                          {healthMeta.label}
                        </span>
                        {p.industry && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 'var(--r-sm)',
                              color: 'var(--ink3)',
                              background: 'var(--bg-subtle)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {p.industry.replace('_', ' ')}
                          </span>
                        )}
                      </div>

                      {(p.ref || p.customer_name) && (
                        <div style={{ fontSize: 12, color: 'var(--ink3)', display: 'flex', gap: 6 }}>
                          {p.ref && <strong style={{ color: 'var(--ink)' }}>{p.ref}</strong>}
                          {p.customer_name && <span>· {p.customer_name}</span>}
                        </div>
                      )}

                      {p.description && (
                        <p
                          style={{
                            fontSize: 12.5,
                            color: 'var(--ink3)',
                            margin: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            lineHeight: 1.4,
                          }}
                        >
                          {p.description}
                        </p>
                      )}

                      {p.contract_value && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, background: 'var(--bg-subtle)', padding: '6px 10px', borderRadius: 'var(--r-sm)' }}>
                          <span style={{ color: 'var(--ink3)' }}>Contract Value:</span>
                          <strong style={{ color: 'var(--teal)' }}>
                            {p.currency} {Number(p.contract_value).toLocaleString()}
                          </strong>
                        </div>
                      )}

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>
                          <span>PROGRESS</span>
                          <span>{p.progress_pct || (p.task_count > 0 ? Math.round((p.task_done_count / p.task_count) * 100) : 0)}%</span>
                        </div>
                        <ProgressBar done={p.task_done_count} total={p.task_count} color={p.color} />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink3)', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Icon name="userCheck" size={13} /> {p.member_count} member{p.member_count === 1 ? '' : 's'}
                        </span>
                        {p.target_date && <span>Target {p.target_date}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Create Project Modal */}
        <ProjectCreateModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(newId) => {
            setShowCreateModal(false);
            loadProjects();
            setSelectedId(newId);
          }}
        />
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  // SELECTED PROJECT WORKSPACE (Deep OS Experience)
  // ═════════════════════════════════════════════════════════════════════
  const statusMeta = PROJECT_STATUS_META[selected.status] || PROJECT_STATUS_META.not_started;
  const healthMeta = HEALTH_STATUS_META[selected.health_status || 'on_track'] || HEALTH_STATUS_META.on_track;

  function patchProject(patch: Record<string, unknown>) {
    apiFetch(`/v1/tasks/projects/${selected!.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      .then(() => { loadProjects(); loadDetail(selected!.id); });
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      {/* Project Workspace Top Bar */}
      <div style={{ padding: isMobile ? '16px 16px 0' : '20px 32px 0', background: 'var(--white)', borderBottom: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--ink3)',
            fontSize: 12.5,
            fontWeight: 700,
            padding: 0,
            marginBottom: 10,
          }}
        >
          <Icon name="arrowLeft" size={13} /> Return to Projects & Command Center
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: selected.color, flexShrink: 0 }} />
            <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', margin: 0 }}>
              {selected.name}
            </h1>
            {selected.ref && (
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg-subtle)', padding: '2px 8px', borderRadius: 'var(--r-sm)' }}>
                {selected.ref}
              </span>
            )}
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: 'var(--r-sm)',
                color: healthMeta.color,
                background: healthMeta.bg,
                letterSpacing: '0.04em',
              }}
            >
              {healthMeta.label}
            </span>
            <Select value={selected.status} onValueChange={(v) => patchProject({ status: v })}>
              <SelectTrigger className="h-7 text-xs" style={{ width: 120 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PROJECT_STATUS_META).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="moreHorizontal" size={14} /> Options
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => togglePin(selected, e as unknown as React.MouseEvent)}>
                  <Icon name="bookmark" size={13} /> {selected.is_pinned ? 'Unpin project' : 'Pin project'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={copyProject}>
                  <Icon name="copy" size={13} /> Duplicate project
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setTemplateName(selected.name); setSavingTemplate(true); }}>
                  <Icon name="save" size={13} /> Save as template
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportProjectData}>
                  <Icon name="download" size={13} /> Export project data
                </DropdownMenuItem>
                <DropdownMenuCheckboxItem checked={viewAsCustomer} onCheckedChange={setViewAsCustomer}>
                  View as Client Portal
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={deleteProjectAction} style={{ color: 'var(--red)' }}>
                  <Icon name="trash" size={13} /> Delete project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {viewAsCustomer && (
          <div style={{ marginTop: 10, maxWidth: 640 }}>
            <Banner variant="warning">
              Previewing as Client / Donor view — Internal EVM formulas, contractor cost margins, and personnel workload logs are hidden.
            </Banner>
          </div>
        )}

        {/* Enterprise Navigation Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} variant="segmented" style={{ marginTop: 16 }}>
          <TabsList style={{ overflowX: 'auto' }}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="wbs_schedule">WBS & Gates</TabsTrigger>
            <TabsTrigger value="financials_evm">Financials & EVM</TabsTrigger>
            <TabsTrigger value="governance">Governance & Risk</TabsTrigger>
            <TabsTrigger value="procurement">Procurement</TabsTrigger>
            <TabsTrigger value="resources">Fleet & Resources</TabsTrigger>
            <TabsTrigger value="industry_pack">Industry Pack</TabsTrigger>
            <TabsTrigger value="board">Tasks & Board ({projectTasks.length})</TabsTrigger>
            <TabsTrigger value="gantt">Gantt</TabsTrigger>
            <TabsTrigger value="timesheets">Timesheets</TabsTrigger>
            <TabsTrigger value="files">Files ({projectFiles ? projectFiles.length : '0'})</TabsTrigger>
            <TabsTrigger value="discussions">Discussions ({discussions ? discussions.length : '0'})</TabsTrigger>
            <TabsTrigger value="tickets">Tickets ({projectTickets ? projectTickets.length : '0'})</TabsTrigger>
            <TabsTrigger value="sales">Billing & Contracts</TabsTrigger>
            <TabsTrigger value="activity">Audit Activity</TabsTrigger>
            <TabsTrigger value="members">Team ({members ? members.length : '0'})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main Workspace Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 16 : 28 }}>
        {/* TAB 1: OVERVIEW */}
        {tab === 'overview' && (
          detail === null ? (
            <SectionLoading />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: 20, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <SectionCard title="Project Charter & Metadata">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px', fontSize: 13 }}>
                    <OverviewField label="Project Code / Ref" value={detail.ref || '—'} />
                    <OverviewField label="Client / Stakeholder" value={detail.customer_name || '—'} />
                    <OverviewField label="Industry Pack" value={(detail.industry || 'general').toUpperCase().replace('_', ' ')} />
                    <OverviewField label="Classification" value={(detail.project_type || 'capital_expenditure').toUpperCase().replace('_', ' ')} />
                    <OverviewField label="Contract Value" value={`${detail.currency} ${(detail.contract_value || 0).toLocaleString()}`} />
                    <OverviewField label="Baseline Budget (BAC)" value={`${detail.currency} ${(detail.baseline_budget || detail.current_budget || 0).toLocaleString()}`} />
                    <OverviewField label="Start Date" value={detail.start_date || '—'} />
                    <OverviewField label="Target Delivery Date" value={detail.target_date || '—'} />
                    <OverviewField label="Site Location" value={detail.location_address || '—'} />
                    <OverviewField label="Total Logged Hours" value={formatHM(detail.total_logged_minutes)} />
                  </div>
                  {detail.description && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 18, marginBottom: 6 }}>
                        Charter Scope & Objectives
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--ink2)', margin: 0, lineHeight: 1.6 }}>{detail.description}</p>
                    </>
                  )}
                </SectionCard>

                {/* Logged Hours Chart */}
                <SectionCard title="Man-Hours Logged This Week">
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
                </SectionCard>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Executive Progress & Schedule Health */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Work Package Completion</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', margin: '2px 0 8px' }}>
                      {detail.task_done_count} / {detail.task_count} Work Packages
                    </div>
                    <ProgressBar done={detail.task_done_count} total={detail.task_count} color="var(--green)" />
                  </div>
                  <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Schedule Elapsed</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', margin: '2px 0 8px' }}>
                      {detail.days_left ?? '—'} Days Left / {detail.days_total ?? '—'} Total
                    </div>
                    <ProgressBar done={detail.days_left ?? 0} total={detail.days_total ?? 0} color="var(--teal)" />
                  </div>
                </div>

                {/* Expenses & Retainers */}
                {!viewAsCustomer && (
                  <SectionCard
                    title="Financial Exposure & Invoicing"
                    action={detail.expenses.unbilled ? (
                      <Button size="sm" onClick={invoiceProject} disabled={invoicing} style={{ height: 26, fontSize: 11.5 }}>
                        {invoicing ? 'Invoicing…' : 'Invoice Project'}
                      </Button>
                    ) : undefined}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                      <ExpenseStat label="Total" value={detail.expenses.total} color="var(--ink)" currency={detail.currency} />
                      <ExpenseStat label="Billable" value={detail.expenses.billable} color="var(--blue)" currency={detail.currency} />
                      <ExpenseStat label="Billed" value={detail.expenses.billed} color="var(--green)" currency={detail.currency} />
                      <ExpenseStat label="Unbilled" value={detail.expenses.unbilled} color="var(--red)" currency={detail.currency} />
                    </div>
                  </SectionCard>
                )}

                {!viewAsCustomer && selected.customer_id && retainer !== undefined && (
                  <SectionCard title="Client Retainer Agreement">
                    {retainer ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                            {retainer.currency} {Number(retainer.amount).toLocaleString()}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2, textTransform: 'capitalize' }}>
                            {retainer.frequency.toLowerCase()} · {retainer.state.toLowerCase()}{retainer.next_due ? ` · next ${retainer.next_due}` : ''}
                          </div>
                        </div>
                        <Badge variant={retainer.state === 'ACTIVE' ? 'success' : 'gray'}>{retainer.state}</Badge>
                      </div>
                    ) : settingUpRetainer ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          autoFocus type="number" min={0} step={1} value={retainerAmount} onChange={e => setRetainerAmount(e.target.value)}
                          placeholder="Amount…" style={{ width: 110, padding: 'var(--ds-input-py, 7px) 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 12.5 }}
                        />
                        <Select value={retainerFrequency} onValueChange={setRetainerFrequency}>
                          <SelectTrigger className="h-8 text-xs" style={{ width: 110 }}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="WEEKLY">Weekly</SelectItem>
                            <SelectItem value="MONTHLY">Monthly</SelectItem>
                            <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                            <SelectItem value="ANNUAL">Annual</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" onClick={setUpRetainer} disabled={!retainerAmount.trim()}>Save</Button>
                        <Button size="sm" variant="outline" onClick={() => setSettingUpRetainer(false)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setSettingUpRetainer(true)}>Set up retainer</Button>
                    )}
                  </SectionCard>
                )}
              </div>
            </div>
          )
        )}

        {/* TAB 2: WBS & SCHEDULE */}
        {tab === 'wbs_schedule' && (
          <ProjectWbsSchedule projectId={selected.id} currency={selected.currency} />
        )}

        {/* TAB 3: FINANCIALS & EVM */}
        {tab === 'financials_evm' && (
          <ProjectFinancialsEvm projectId={selected.id} currency={selected.currency} />
        )}

        {/* TAB 4: GOVERNANCE & RISKS */}
        {tab === 'governance' && (
          <ProjectGovernance projectId={selected.id} currency={selected.currency} />
        )}

        {/* TAB 5: PROCUREMENT */}
        {tab === 'procurement' && (
          <ProjectProcurement projectId={selected.id} currency={selected.currency} />
        )}

        {/* TAB 6: FLEET & RESOURCES */}
        {tab === 'resources' && (
          <ProjectResources projectId={selected.id} currency={selected.currency} />
        )}

        {/* TAB 7: MODULAR INDUSTRY PACK */}
        {tab === 'industry_pack' && (
          <ProjectIndustryPack
            projectId={selected.id}
            industry={selected.industry || 'general'}
            currency={selected.currency}
          />
        )}

        {/* TAB 8: TASKS & KANBAN BOARD */}
        {tab === 'board' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, maxWidth: 480 }}>
              <input
                value={quickAddTitle} onChange={e => setQuickAddTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') quickAddTask(); }}
                placeholder="Quick-add a task or work package…"
                style={{ flex: 1, padding: 'var(--ds-input-py, 7px) 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13.5, background: 'var(--white)', color: 'var(--ink)' }}
              />
              <Button size="sm" onClick={quickAddTask} disabled={!quickAddTitle.trim()}>Add</Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
              {KANBAN_COLUMNS.map(col => {
                const c = taskStatusCounts[col.status] || { total: 0, mine: 0 };
                return (
                  <div key={col.status} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{col.title}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{c.total}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>My Tasks: {c.mine}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 2 }}>
                  {(['kanban', 'table', 'milestone'] as const).map(v => (
                    <button key={v} type="button" onClick={() => setBoardView(v)}
                      style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: boardView === v ? 'var(--white)' : 'transparent', color: boardView === v ? 'var(--teal)' : 'var(--ink3)', boxShadow: boardView === v ? 'var(--elev-sm)' : 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
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
                  style={{ padding: 'var(--ds-input-py, 7px) 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 12.5, width: 160, background: 'var(--white)', color: 'var(--ink)' }}
                />
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

            {/* Kanban Columns */}
            {boardView === 'kanban' && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)', gap: 12, alignItems: 'start' }}>
                {KANBAN_COLUMNS.map(col => {
                  const tasksInCol = sortedTasks.filter(t => (t.completed || t.status === 'completed' ? 'completed' : t.status) === col.status);
                  return (
                    <div key={col.status} style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--r-lg)', padding: 12, minHeight: 300 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink2)' }}>{col.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--white)', padding: '2px 6px', borderRadius: 'var(--r-sm)', color: 'var(--ink3)' }}>{tasksInCol.length}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {tasksInCol.map(t => (
                          <div
                            key={t.id}
                            onClick={() => setDetailTaskId(t.id)}
                            style={{
                              background: 'var(--white)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--r)',
                              padding: 12,
                              cursor: 'pointer',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{t.title}</div>
                            {t.due && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>Due: {t.due}</div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                              <Badge variant={TASK_STATUS_META[t.completed ? 'completed' : t.status]?.variant || 'gray'}>
                                {t.priority || 'medium'}
                              </Badge>
                              {t.assigneeName && <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{t.assigneeName}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* TAB 9: GANTT CHART */}
        {tab === 'gantt' && (
          <SectionCard title="Interactive Project Schedule & Milestone Gantt" collapsible={false}>
            <div style={{ overflowX: 'auto', padding: '12px 0' }}>
              <div style={{ minWidth: ganttTotalDays * ganttDayWidth, position: 'relative' }}>
                {/* Header months */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', height: 28, position: 'relative' }}>
                  {ganttMonthHeaders.map((m, idx) => (
                    <div key={idx} style={{ position: 'absolute', left: m.left, width: m.width, fontSize: 11, fontWeight: 700, color: 'var(--ink3)', paddingLeft: 4 }}>
                      {m.label}
                    </div>
                  ))}
                </div>

                {/* Rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  {ganttRows.map((r, idx) => {
                    if (r.type === 'milestone') {
                      return (
                        <div key={`ms-${idx}`} style={{ height: 24, fontSize: 11.5, fontWeight: 800, color: 'var(--teal)', background: 'var(--teal-l)', padding: '2px 8px', borderRadius: 'var(--r-sm)' }}>
                          {r.ms ? `Milestone: ${r.ms.name}` : 'Unassigned Tasks'}
                        </div>
                      );
                    }
                    const geo = ganttBarGeometry(r.task);
                    return (
                      <div key={r.task.id} style={{ height: GANTT_ROW_H, position: 'relative', borderBottom: '1px dashed var(--border)' }}>
                        {geo && (
                          <div
                            style={{
                              position: 'absolute',
                              left: geo.left,
                              width: geo.width,
                              height: 22,
                              top: 6,
                              borderRadius: 'var(--r-sm)',
                              background: STATUS_BAR_COLOR[r.task.completed ? 'completed' : r.task.status],
                              color: 'hsl(var(--primary-foreground))',
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 6px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {r.task.title}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {/* TAB 10: TIMESHEETS */}
        {tab === 'timesheets' && (
          <SectionCard title="Billable & Non-Billable Man-Hours Log" collapsible={false}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Team Member</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Task / Work Item</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px' }}>Duration (Hrs)</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px' }}>Billable Rate</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px' }}>Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(timesheets || []).map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px' }}>{t.started_at.slice(0, 10)}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{t.user_name}</td>
                      <td style={{ padding: '10px 14px' }}>{t.task_title}</td>
                      <td style={{ textAlign: 'right', padding: '10px 14px' }}>{((t.duration_minutes || 0) / 60).toFixed(2)}</td>
                      <td style={{ textAlign: 'right', padding: '10px 14px' }}>{t.hourly_rate ? `$${t.hourly_rate}` : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700 }}>${Number(t.amount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {/* TAB 11: FILES */}
        {tab === 'files' && (
          <SectionCard title="Project Documents & Engineering Files" collapsible={false}>
            <div style={{ marginBottom: 16 }}>
              <FileUploader onUpload={uploadProjectFiles} uploadingFiles={uploadingFiles ? [{ id: '1', name: 'Uploading files...', size: 0, progress: 50, status: 'uploading' }] : []} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
              {(projectFiles || []).map((f) => (
                <div key={f.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="fileText" size={20} style={{ color: 'var(--teal)' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.name}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
                    Uploaded: {new Date(f.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* TAB 12: DISCUSSIONS */}
        {tab === 'discussions' && (
          <SectionCard title="Collaborative Team & Stakeholder Stream" collapsible={false}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <input
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="Post an update or mention @colleague..."
                value={discussionDraft}
                onChange={(e) => setDiscussionDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') postDiscussion(); }}
              />
              <Button onClick={postDiscussion} disabled={postingDiscussion || !discussionDraft.trim()}>Post</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(discussions || []).map((d) => (
                <div key={d.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ fontSize: 13 }}>{d.author_name}</strong>
                    <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{new Date(d.created_at).toLocaleString()}</span>
                  </div>
                  <p style={{ fontSize: 13.5, color: 'var(--ink)', margin: 0 }}>{d.content}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* TAB 13: TICKETS */}
        {tab === 'tickets' && (
          <SectionCard title="Linked Support & Field Tickets" collapsible={false}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <input
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="Create new field support ticket..."
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
              />
              <Button onClick={createProjectTicket} disabled={!ticketSubject.trim()}>Create Ticket</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(projectTickets || []).map((t) => (
                <div key={t.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--teal)', marginRight: 8 }}>{t.ref_number}</span>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{t.subject}</span>
                  </div>
                  <Badge variant={TICKET_STATUS_META[t.status]?.variant || 'gray'}>{t.status}</Badge>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* TAB 14: SALES & INVOICES */}
        {tab === 'sales' && (
          <SectionCard title="Customer Invoices & Billing Milestones" collapsible={false}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Invoice #</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Due Date</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px' }}>Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(projectInvoices || []).map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>{inv.invoice_number}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <Badge variant={INVOICE_STATUS_META[inv.status]?.variant || 'gray'}>{inv.status}</Badge>
                      </td>
                      <td style={{ padding: '10px 14px' }}>{inv.due_date || '—'}</td>
                      <td style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700 }}>
                        {inv.currency} {Number(inv.total || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {/* TAB 15: AUDIT ACTIVITY */}
        {tab === 'activity' && (
          <SectionCard title="Project Audit Trail & State Transitions" collapsible={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(projectActivity || []).map((a) => (
                <div key={a.id} style={{ fontSize: 13, color: 'var(--ink2)', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <strong style={{ color: 'var(--ink)' }}>{a.actor_name}</strong> {describeProjectActivity(a)}
                  <span style={{ fontSize: 11, color: 'var(--ink3)', marginLeft: 8 }}>{new Date(a.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* TAB 16: TEAM MEMBERS */}
        {tab === 'members' && (
          <SectionCard title="Project Team & Resource Allocation" collapsible={false}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, maxWidth: 360 }}>
              <EntityPicker value={null} onChange={v => v && addMember(v)} search={searchColleagues} placeholder="+ Add team member..." />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {(members || []).map((m) => (
                <div key={m.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <PersonAvatar name={m.name} size={36} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{m.email}</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => removeMember(m.user_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>
                    <Icon name="x" size={15} />
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </div>

      {/* Task Drawer */}
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

// Task Detail Drawer
interface Collaborator { id: string; user_id: string; name: string; email: string; kind: string }
interface ActivityEntry { id: string; action: string; detail: Record<string, any>; created_at: string; actor_name: string }
interface DependencyRow { id: string; task_id: string; title: string; status: string; completed: boolean; due: string | null }

function TaskDetailDrawer({
  task, milestones, otherTasks, onClose, onDelete,
}: {
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
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent className="w-95 sm:max-w-95 flex flex-col p-0 gap-0">
        <div style={{ display: 'flex', flexDirection: 'column', padding: 20, gap: 14, overflowY: 'auto', height: '100%' }}>
          <SheetTitle style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Work Package / Task</SheetTitle>
          <textarea
            defaultValue={task.title}
            onBlur={e => { if (e.target.value.trim() && e.target.value !== task.title) updateTodo(task.id, { title: e.target.value.trim() }); }}
            rows={2}
            style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', border: 'none', resize: 'none', outline: 'none', fontFamily: 'var(--font)', padding: 0 }}
          />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Status</div>
            <Select value={task.status} onValueChange={v => {
              if (v === 'completed' && (task.blockedByOpenCount || 0) > 0) {
                showAlert(`Can't complete this task — it's still blocked by ${task.blockedByOpenCount} open dependencies.`, { variant: 'error' });
                return;
              }
              updateTodo(task.id, { status: v as TaskStatus, completed: v === 'completed' });
            }}>
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
              style={{ width: '100%', padding: 'var(--ds-input-py, 7px) 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          <Button variant="outline" size="sm" onClick={onDelete} style={{ marginTop: 'auto', color: 'var(--red)', borderColor: 'var(--red)' }}>
            <Icon name="trash" size={13} /> Delete task
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
