import { useSyncExternalStore } from 'react';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';

// Every mutator below applies its change to local state immediately (optimistic
// update), then persists in the background. A failed persist used to be
// swallowed silently (`.catch(() => {})`) — the UI kept showing the change as
// if it had saved, with no way to tell the local cache and the server had
// just diverged. Surface it instead; this never undoes the optimistic
// update (that would need a per-mutator snapshot/rollback, a larger
// change), but at minimum the user now knows to retry rather than trusting
// a save that silently never happened.
function reportSyncFailure(err: any) {
  showAlert(err?.message || 'This change could not be saved — check your connection and try again.');
}

// Tasks + Calendar data layer — backed by /v1/tasks (apps/api/src/routes/tasks.routes.ts).
// Personal per-user data (each staff member has their own lists/tasks/events),
// hydrated once per session (see hydrateTasksFromServer, called from
// useAuth.tsx alongside company hydration) and cached in module state so
// every consumer (TasksApp, TasksShell, CalendarApp, CalendarShell) reads
// the same in-memory snapshot via useSyncExternalStore. Mutators apply
// optimistically (instant local update) and persist to the API in the
// background — the row id is always generated client-side (crypto.randomUUID())
// so there's never an id-reconciliation step after the server responds.

export interface CalendarGuest {
  userId: string | null;
  email: string;
  name: string | null;
  status: 'pending' | 'accepted' | 'declined';
}

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  byWeekday?: number[]; // 0=Sun..6=Sat, weekly only
  until?: string; // YYYY-MM-DD, inclusive
  count?: number;
}

export interface GuestPermissions {
  modifyEvent: boolean;
  inviteOthers: boolean;
  seeGuestList: boolean;
}

export interface MeetingSettings {
  hostManagement: boolean;
  shareScreen: boolean;
  sendReactions: boolean;
  continuousChat: boolean;
  letSendMessages: boolean;
  organizerName?: string;
}

export interface CalendarEvent {
  id: string;
  /** Which occurrence this is, as YYYY-MM-DD — for a non-recurring event
   *  this is just its own date; for a recurring one, every rendered
   *  occurrence shares `id` but has its own occurrenceDate. Pass both back
   *  to updateEvent/deleteEvent with scope 'this' to edit just this
   *  occurrence rather than the whole series. */
  occurrenceDate: string;
  isOverridden: boolean;
  isRecurring: boolean;
  title: string;
  start: string; // YYYY-MM-DDTHH:MM, local wall-clock (not UTC)
  end: string;   // YYYY-MM-DDTHH:MM, local wall-clock
  description?: string;
  location?: string;
  category: 'work' | 'personal' | 'customs' | 'todo' | 'holiday';
  guests: CalendarGuest[];
  allDay: boolean;
  color?: string | null;
  recurrence?: RecurrenceRule | null;
  reminderOffsets: number[];
  timezone?: string;
  meetingUrl?: string;
  meetingSettings?: MeetingSettings;
  guestPermissions?: GuestPermissions;
  visibility?: 'default' | 'public' | 'private';
  busyStatus?: 'busy' | 'free';
}

export interface TaskList {
  id: string;
  name: string;
  color: string;
  // A list a colleague shared with me (migration 284) — not mine to
  // rename/reorder/delete or manage sharing on; role governs whether I can
  // add/edit tasks on it ('editor') or only look ('viewer').
  shared?: boolean;
  role?: 'owner' | 'viewer' | 'editor';
  ownerName?: string;
}

export interface ListShare {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'viewer' | 'editor';
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export type TaskStatus = 'none' | 'in_progress' | 'in_review' | 'waiting' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Todo {
  id: string;
  title: string;
  listId: string;
  notes?: string;
  due?: string;          // YYYY-MM-DD
  start?: string;        // YYYY-MM-DD — real start date (migration 321), for a Gantt bar's span
  dueTime?: string;       // HH:MM:SS, optional companion to `due`
  reminder?: string | null; // ISO datetime — a real reminder_at, delivered by task-reminder.job.ts
  starred?: boolean;
  someday?: boolean;
  status: TaskStatus;
  priority?: TaskPriority;
  timeLoggedMinutes?: number;
  timerStartedAt?: string | null;
  tags: string[];
  subtasks: Subtask[];
  completed: boolean;
  completedAt?: string;
  deletedAt?: string;
  order: number;
  createdAt: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeAvatarUrl?: string;
  ownerName?: string;
  isOwner: boolean;
  listName?: string;
  listColor?: string;
  access?: 'owner' | 'assignee' | 'editor' | 'viewer';
  // Set when a task belongs to the standalone Projects app rather than a
  // personal to-do list — migrations 308/310/311.
  projectId?: string | null;
  milestoneId?: string | null;
  isPrivate?: boolean;
  isBillable?: boolean;
  hourlyRate?: number | null;
  subjectType?: string | null;
  subjectId?: string | null;
  blockedByOpenCount?: number;
  recurrenceRule?: { freq: 'daily' | 'weekly' | 'monthly'; interval: number } | null;
  recurrenceNextDue?: string | null;
}

export interface TodoComment {
  id: string;
  content: string;
  mentions: { user_id: string; name: string }[];
  createdAt: string;
  authorId: string;
  authorName: string;
}

/** Task-like record from another app (e.g. a ClearOS shipment task assigned to you) — read-only here, opens the source app to edit. */
export interface LinkedTask {
  id: string;
  title: string;
  due: string | null;
  sourceApp: string;
  sourceLabel: string;
  path: string;
}

export interface AppSettings {
  calendarDefaultView: 'month' | 'week' | 'day' | 'agenda';
  weekStartsMonday: boolean;
  tasksDefaultView: string;
}

export const TASK_LIST_COLORS = ['#0d7a6b', '#dc2626', '#2563eb', '#7c3aed', '#d97706', '#db2777', '#0891b2'];

// ── Local wall-clock <-> UTC ISO conversion for calendar events ──
// datetime-local inputs give "YYYY-MM-DDTHH:MM" with no timezone — that's
// implicitly the browser's local time. We convert to a real UTC instant
// before sending so events display correctly regardless of what timezone
// the API server runs in, and convert back to local wall-clock on read.
function localToUTCISO(local: string): string {
  return new Date(local).toISOString();
}
function utcISOToLocal(utc: string): string {
  const d = new Date(utc);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function newId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
}

let events: CalendarEvent[] = [];
let lists: TaskList[] = [];
let todos: Todo[] = [];
let linkedTasks: LinkedTask[] = [];
let settings: AppSettings = { calendarDefaultView: 'month', weekStartsMonday: false, tasksDefaultView: 'today' };
let hydrated = false;

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function emit() {
  for (const l of listeners) l();
}

function fromApiTodo(row: any): Todo {
  return {
    id: row.id, title: row.title, listId: row.list_id, notes: row.notes || undefined,
    due: row.due || undefined, start: row.start_date || undefined, dueTime: row.due_time || undefined, reminder: row.reminder_at || null, starred: !!row.starred, someday: !!row.someday,
    status: row.status, priority: row.priority || 'medium',
    timeLoggedMinutes: row.time_logged_minutes ?? 0, timerStartedAt: row.timer_started_at || null,
    tags: row.tags || [],
    subtasks: (row.subtasks || []).map((s: any) => ({ id: s.id, title: s.title, completed: !!s.completed })),
    completed: !!row.completed, completedAt: row.completed_at || undefined, deletedAt: row.deleted_at || undefined,
    order: row.sort_order ?? 0, createdAt: row.created_at,
    assigneeId: row.assignee_id || undefined, assigneeName: row.assignee_name || undefined,
    assigneeAvatarUrl: row.assignee_avatar_url || undefined, ownerName: row.owner_name || undefined,
    isOwner: row.is_owner !== false,
    listName: row.list_name || undefined, listColor: row.list_color || undefined,
    access: row.access || (row.is_owner !== false ? 'owner' : undefined),
    projectId: row.project_id || null, milestoneId: row.milestone_id || null, isPrivate: !!row.is_private,
    isBillable: !!row.is_billable, hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : null,
    subjectType: row.subject_type || null, subjectId: row.subject_id || null,
    blockedByOpenCount: row.blocked_by_open_count || 0,
    recurrenceRule: row.recurrence_rule || null, recurrenceNextDue: row.recurrence_next_due || null,
  };
}
function fromApiList(row: any): TaskList {
  return {
    id: row.id, name: row.name, color: row.color,
    shared: !!row.shared, role: row.role || 'owner', ownerName: row.owner_name || undefined,
  };
}
function fromApiShare(row: any): ListShare {
  return { id: row.id, userId: row.user_id, name: row.name, email: row.email, role: row.role };
}

// ── List sharing ──
export async function fetchListShares(listId: string): Promise<ListShare[]> {
  const res = await apiFetch(`/v1/tasks/lists/${listId}/shares`);
  return (res.data || []).map(fromApiShare);
}
export async function shareListWith(listId: string, userId: string, role: 'viewer' | 'editor'): Promise<ListShare> {
  const res = await apiFetch(`/v1/tasks/lists/${listId}/shares`, {
    method: 'PUT', body: JSON.stringify({ userId, role }),
  });
  return fromApiShare(res.data);
}
export async function unshareList(listId: string, userId: string): Promise<void> {
  await apiFetch(`/v1/tasks/lists/${listId}/shares/${userId}`, { method: 'DELETE' });
}
// Handles two response shapes: GET /events returns one occurrence-mapped
// object per rendered card (occurrenceDate/isOverridden/is_recurring all
// present); POST/PATCH /events/:id return the raw master row instead (no
// occurrence wrapper — there's exactly one row to return either way). The
// fallbacks below derive the same fields from start_at/recurrence so both
// shapes normalize to the same CalendarEvent either way.
function fromApiEvent(row: any): CalendarEvent {
  return {
    id: row.id,
    occurrenceDate: row.occurrenceDate || String(row.start_at || '').slice(0, 10),
    isOverridden: !!row.isOverridden,
    isRecurring: row.is_recurring !== undefined ? !!row.is_recurring : !!row.recurrence,
    title: row.title, start: utcISOToLocal(row.start_at), end: utcISOToLocal(row.end_at),
    description: row.description || undefined, location: row.location || undefined,
    category: row.category, guests: Array.isArray(row.guests) ? row.guests : [],
    allDay: !!row.all_day, color: row.color || null, recurrence: row.recurrence || null,
    reminderOffsets: Array.isArray(row.reminder_offsets) ? row.reminder_offsets : [],
    timezone: row.timezone || undefined,
  };
}

/** Loads this user's lists/tasks/events/settings/linked-tasks once per session. Call from AuthProvider. */
export async function hydrateTasksFromServer(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const [listsRes, itemsRes, eventsRes, settingsRes, linkedRes] = await Promise.all([
      apiFetch('/v1/tasks/lists'),
      apiFetch('/v1/tasks/items'),
      apiFetch('/v1/tasks/events'),
      apiFetch('/v1/tasks/settings'),
      apiFetch('/v1/tasks/linked').catch(() => ({ data: [] })),
    ]);
    lists = (listsRes.data || []).map(fromApiList);
    todos = (itemsRes.data || []).map(fromApiTodo);
    events = (eventsRes.data || []).map(fromApiEvent);
    linkedTasks = (linkedRes.data || []).map((t: any) => ({ id: t.id, title: t.title, due: t.due, sourceApp: t.sourceApp, sourceLabel: t.sourceLabel, path: t.path }));
    if (settingsRes.data) {
      settings = {
        calendarDefaultView: settingsRes.data.calendar_default_view || 'month',
        weekStartsMonday: !!settingsRes.data.week_starts_monday,
        tasksDefaultView: settingsRes.data.tasks_default_view || 'today',
      };
    }
    emit();
  } catch {
    hydrated = false; // offline / not authenticated yet — retry next call
  }
}

export function resetTasksCache(): void {
  hydrated = false;
  events = []; lists = []; todos = []; linkedTasks = [];
  settings = { calendarDefaultView: 'month', weekStartsMonday: false, tasksDefaultView: 'today' };
  emit();
}

// ── Store APIs — Events ──
export function useEvents() { return useSyncExternalStore(subscribe, () => events); }

/** Re-fetches the full event list from the server, replacing local state.
 *  Needed after any change to a recurring event's own pattern (its
 *  occurrence dates shift, so the locally-cached per-occurrence rows can't
 *  be patched in place) — see updateEvent's own comment for when this
 *  fires. A transient failure here just leaves the calendar showing
 *  whatever it already had, rather than blanking it. */
export async function reloadEvents(): Promise<void> {
  try {
    const res = await apiFetch('/v1/tasks/events');
    events = (res.data || []).map(fromApiEvent);
    emit();
  } catch { /* keep showing whatever's already cached */ }
}

type NewEventInput = Omit<CalendarEvent, 'id' | 'occurrenceDate' | 'isOverridden' | 'isRecurring' | 'guests' | 'allDay' | 'reminderOffsets'>
  & { guests?: CalendarGuest[]; allDay?: boolean; reminderOffsets?: number[] };

export function addEvent(event: NewEventInput) {
  const id = newId();
  const newEvent: CalendarEvent = {
    ...event, id, occurrenceDate: event.start.slice(0, 10), isOverridden: false, isRecurring: !!event.recurrence,
    guests: event.guests ?? [], allDay: event.allDay ?? false, reminderOffsets: event.reminderOffsets ?? [],
  };
  events = [...events, newEvent];
  emit();
  apiFetch('/v1/tasks/events', {
    method: 'POST',
    body: JSON.stringify({
      id, title: newEvent.title, start: localToUTCISO(newEvent.start), end: localToUTCISO(newEvent.end),
      description: newEvent.description, location: newEvent.location, category: newEvent.category, guests: newEvent.guests,
      allDay: newEvent.allDay, color: newEvent.color, recurrence: newEvent.recurrence, reminderOffsets: newEvent.reminderOffsets,
      timezone: newEvent.timezone,
    }),
  }).then(() => { if (newEvent.recurrence) reloadEvents(); }) // a recurring series needs its full occurrence set, not just the one optimistic row
    .catch(err => { events = events.filter(e => e.id !== id); emit(); reportSyncFailure(err); });
  return newEvent;
}

/** `opts.scope: 'this'` (with `opts.occurrenceDate`) edits just one
 *  occurrence of a recurring event via a server-side override, leaving the
 *  series and every other occurrence untouched — the master row is never
 *  patched. Default ('all') edits the whole series, same as a plain event.
 *
 *  A whole-series edit that touches the recurrence rule itself, or the
 *  start/end of an event that's already recurring, can change which
 *  occurrence dates exist at all — the locally-cached per-occurrence rows
 *  can't be trusted to still be correct after that, so those two cases
 *  reload from the server instead of patching in place. Every other edit
 *  (title/description/location/color/... on a non-recurring event, or a
 *  'this'-scoped override) is applied straight to local state — it's exact,
 *  no reload needed. */
export function updateEvent(id: string, patch: Partial<CalendarEvent>, opts?: { scope?: 'all' | 'this'; occurrenceDate?: string }) {
  const scope = opts?.scope ?? 'all';
  const occurrenceDate = opts?.occurrenceDate;
  const prev = events;
  const wasRecurring = prev.find(e => e.id === id)?.isRecurring ?? false;
  const needsReload = scope === 'all' && (wasRecurring || patch.recurrence !== undefined) && (patch.start !== undefined || patch.end !== undefined || patch.recurrence !== undefined);

  events = events.map(e => {
    if (e.id !== id) return e;
    if (scope === 'this' && e.occurrenceDate !== occurrenceDate) return e;
    return { ...e, ...patch, isOverridden: scope === 'this' ? true : e.isOverridden };
  });
  emit();

  const body: Record<string, unknown> = { scope };
  if (scope === 'this' && occurrenceDate) body.occurrenceDate = occurrenceDate;
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.start !== undefined) body.start = localToUTCISO(patch.start);
  if (patch.end !== undefined) body.end = localToUTCISO(patch.end);
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.location !== undefined) body.location = patch.location;
  if (patch.category !== undefined) body.category = patch.category;
  if (patch.guests !== undefined) body.guests = patch.guests;
  if (patch.allDay !== undefined) body.allDay = patch.allDay;
  if (patch.color !== undefined) body.color = patch.color;
  if (patch.recurrence !== undefined) body.recurrence = patch.recurrence;
  if (patch.reminderOffsets !== undefined) body.reminderOffsets = patch.reminderOffsets;
  if (patch.timezone !== undefined) body.timezone = patch.timezone;

  apiFetch(`/v1/tasks/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
    .then(() => { if (needsReload) reloadEvents(); })
    .catch(err => { events = prev; emit(); reportSyncFailure(err); });
}

/** `scope: 'this'` cancels one occurrence of a recurring event via a
 *  server-side override; `'all'` (default) deletes the whole series/event.
 *  Both are exact local operations — filtering out the matching row(s) is
 *  always correct, no reload needed. */
export function deleteEvent(id: string, opts?: { scope?: 'all' | 'this'; occurrenceDate?: string }) {
  const scope = opts?.scope ?? 'all';
  const occurrenceDate = opts?.occurrenceDate;
  const prev = events;
  events = (scope === 'this' && occurrenceDate)
    ? events.filter(e => !(e.id === id && e.occurrenceDate === occurrenceDate))
    : events.filter(e => e.id !== id);
  emit();
  const qs = (scope === 'this' && occurrenceDate) ? `?scope=this&occurrenceDate=${occurrenceDate}` : '';
  apiFetch(`/v1/tasks/events/${id}${qs}`, { method: 'DELETE' })
    .catch(err => { events = prev; emit(); reportSyncFailure(err); });
}

// ── ICS export/import ──────────────────────────────────────────────────
export async function exportCalendarICS(): Promise<void> {
  const { apiDownload } = await import('../lib/api.js');
  await apiDownload('/v1/tasks/events/export.ics', 'calendar.ics');
}

export async function importCalendarICS(file: File): Promise<{ imported: number; skipped: number }> {
  const text = await file.text();
  const res = await apiFetch('/v1/tasks/events/import.ics', { method: 'POST', body: JSON.stringify({ ics: text }) });
  await reloadEvents();
  return res.data;
}

// ── Store APIs — Lists ──
export function useLists() { return useSyncExternalStore(subscribe, () => lists); }

/** The permanent, undeletable first list — created server-side on first load. Compare against this instead of a fixed id, since it's a real per-user server-generated UUID. */
export function inboxListId(): string | undefined { return lists[0]?.id; }

export function addList(name: string, color?: string) {
  const newList: TaskList = { id: newId(), name, color: color || TASK_LIST_COLORS[lists.length % TASK_LIST_COLORS.length] };
  lists = [...lists, newList];
  emit();
  apiFetch('/v1/tasks/lists', { method: 'POST', body: JSON.stringify({ id: newList.id, name: newList.name, color: newList.color }) }).catch(reportSyncFailure);
  return newList;
}

export function updateList(id: string, patch: Partial<TaskList>) {
  lists = lists.map(l => l.id === id ? { ...l, ...patch } : l);
  emit();
  apiFetch(`/v1/tasks/lists/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(reportSyncFailure);
}

export function deleteList(id: string) {
  if (id === lists[0]?.id) return; // first list (Inbox) is permanent
  const inboxId = lists[0]?.id;
  lists = lists.filter(l => l.id !== id);
  if (inboxId) todos = todos.map(t => t.listId === id ? { ...t, listId: inboxId } : t);
  emit();
  apiFetch(`/v1/tasks/lists/${id}`, { method: 'DELETE' }).catch(reportSyncFailure);
}

// ── Store APIs — Todos ──
export function useTodos() { return useSyncExternalStore(subscribe, () => todos); }

export function addTodo(input: Partial<Omit<Todo, 'id' | 'createdAt'>> & { title: string }) {
  const listId = input.listId || lists[0]?.id || 'inbox';
  const siblingCount = todos.filter(t => t.listId === listId && !t.deletedAt).length;
  const newTodo: Todo = {
    id: newId(), title: input.title, listId,
    notes: input.notes, due: input.due, start: input.start, dueTime: input.dueTime, reminder: input.reminder ?? null, starred: input.starred ?? false, someday: input.someday ?? false,
    status: input.status ?? 'none', priority: input.priority ?? 'medium',
    timeLoggedMinutes: input.timeLoggedMinutes ?? 0, timerStartedAt: input.timerStartedAt ?? null,
    tags: input.tags ?? [], subtasks: input.subtasks ?? [],
    completed: input.completed ?? false, order: siblingCount, createdAt: new Date().toISOString().slice(0, 10),
    assigneeId: input.assigneeId, assigneeName: input.assigneeName, isOwner: true,
    projectId: input.projectId ?? null, milestoneId: input.milestoneId ?? null, isPrivate: input.isPrivate ?? false,
    isBillable: input.isBillable ?? false, hourlyRate: input.hourlyRate ?? null,
    subjectType: input.subjectType ?? null, subjectId: input.subjectId ?? null,
  };
  todos = [...todos, newTodo];
  emit();
  apiFetch('/v1/tasks/items', {
    method: 'POST',
    body: JSON.stringify({
      id: newTodo.id, title: newTodo.title, listId: newTodo.listId, notes: newTodo.notes, due: newTodo.due, startDate: newTodo.start,
      dueTime: newTodo.dueTime, reminderAt: newTodo.reminder, starred: newTodo.starred, someday: newTodo.someday, status: newTodo.status,
      priority: newTodo.priority, tags: newTodo.tags, assigneeId: newTodo.assigneeId,
      projectId: newTodo.projectId, milestoneId: newTodo.milestoneId, isPrivate: newTodo.isPrivate,
      isBillable: newTodo.isBillable, hourlyRate: newTodo.hourlyRate,
      subjectType: newTodo.subjectType, subjectId: newTodo.subjectId,
    }),
  }).catch(reportSyncFailure);
  return newTodo;
}

export function updateTodo(id: string, patch: Partial<Omit<Todo, 'assigneeId'>> & { assigneeId?: string | null }) {
  todos = todos.map(t => {
    if (t.id !== id) return t;
    const next: Todo = { ...t, ...patch, assigneeId: t.assigneeId };
    if (patch.assigneeId !== undefined) {
      next.assigneeId = patch.assigneeId ?? undefined;
      next.assigneeName = patch.assigneeId ? patch.assigneeName ?? t.assigneeName : undefined;
    }
    if (patch.completed !== undefined) next.completedAt = patch.completed ? new Date().toISOString() : undefined;
    return next;
  });
  emit();
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.due !== undefined) body.due = patch.due || null;
  if (patch.start !== undefined) body.startDate = patch.start || null;
  if (patch.recurrenceRule !== undefined) body.recurrenceRule = patch.recurrenceRule || null;
  if (patch.dueTime !== undefined) body.dueTime = patch.dueTime || null;
  if (patch.reminder !== undefined) body.reminderAt = patch.reminder || null;
  if (patch.starred !== undefined) body.starred = patch.starred;
  if (patch.someday !== undefined) body.someday = patch.someday;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.priority !== undefined) body.priority = patch.priority;
  if (patch.tags !== undefined) body.tags = patch.tags;
  if (patch.completed !== undefined) body.completed = patch.completed;
  if (patch.listId !== undefined) body.listId = patch.listId;
  if (patch.order !== undefined) body.sortOrder = patch.order;
  if (patch.assigneeId !== undefined) body.assigneeId = patch.assigneeId || null;
  if (patch.projectId !== undefined) body.projectId = patch.projectId || null;
  if (patch.milestoneId !== undefined) body.milestoneId = patch.milestoneId || null;
  if (patch.isPrivate !== undefined) body.isPrivate = patch.isPrivate;
  if (patch.isBillable !== undefined) body.isBillable = patch.isBillable;
  if (patch.hourlyRate !== undefined) body.hourlyRate = patch.hourlyRate;
  if (patch.subjectType !== undefined) body.subjectType = patch.subjectType || null;
  if (patch.subjectId !== undefined) body.subjectId = patch.subjectId || null;
  apiFetch(`/v1/tasks/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).catch(reportSyncFailure);
}

/** Starts a real, persisted timer (migration 307) — replaces the old
 *  client-only `timerStartedAt` state that reset on every reload. */
export async function startTaskTimer(id: string): Promise<void> {
  const startedAt = new Date().toISOString();
  todos = todos.map(t => t.id === id ? { ...t, timerStartedAt: startedAt } : t);
  emit();
  try {
    await apiFetch(`/v1/tasks/items/${id}/timer/start`, { method: 'POST' });
  } catch (err) {
    todos = todos.map(t => t.id === id ? { ...t, timerStartedAt: null } : t);
    emit();
    reportSyncFailure(err);
  }
}

/** Stops the running timer and folds the elapsed time into the task's
 *  persisted total — the server, not the client clock, computes duration. */
export async function stopTaskTimer(id: string): Promise<void> {
  try {
    const res = await apiFetch(`/v1/tasks/items/${id}/timer/stop`, { method: 'POST' });
    const totalMinutes = res.data?.task_total_minutes ?? undefined;
    todos = todos.map(t => t.id === id ? {
      ...t, timerStartedAt: null,
      timeLoggedMinutes: totalMinutes !== undefined ? totalMinutes : t.timeLoggedMinutes,
    } : t);
    emit();
  } catch (err) {
    reportSyncFailure(err);
  }
}

/** Duplicates a task (title/notes/schedule/tags/priority/checklist) as a
 *  new, unassigned, not-started task — server-side, so the copy has its own
 *  real id and checklist rows rather than a client-side JSON clone. */
export async function cloneTask(id: string): Promise<Todo | null> {
  const newTodoId = newId();
  try {
    const res = await apiFetch(`/v1/tasks/items/${id}/clone`, {
      method: 'POST', body: JSON.stringify({ id: newTodoId }),
    });
    const cloned = fromApiTodo(res.data);
    todos = [...todos, cloned];
    emit();
    return cloned;
  } catch (err) {
    reportSyncFailure(err);
    return null;
  }
}

// ── Comments — loaded on demand per task (not part of the reactive todos
// store), the same pattern PreviewPanel.tsx uses for a file's comments. ──
function fromApiComment(row: any): TodoComment {
  return {
    id: row.id, content: row.content, mentions: row.mentions || [],
    createdAt: row.created_at, authorId: row.author_id, authorName: row.author_name,
  };
}

export async function fetchTodoComments(taskId: string): Promise<TodoComment[]> {
  const res = await apiFetch(`/v1/tasks/items/${taskId}/comments`);
  return (res.data || []).map(fromApiComment);
}

export async function postTodoComment(taskId: string, content: string, mentions: { user_id: string; name: string }[]): Promise<TodoComment> {
  const res = await apiFetch(`/v1/tasks/items/${taskId}/comments`, {
    method: 'POST', body: JSON.stringify({ content, mentions }),
  });
  return fromApiComment(res.data);
}

export async function deleteTodoComment(taskId: string, commentId: string): Promise<void> {
  await apiFetch(`/v1/tasks/items/${taskId}/comments/${commentId}`, { method: 'DELETE' });
}

export function reorderTodo(id: string, targetOrder: number) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  const siblings = todos.filter(t => t.listId === todo.listId && t.id !== id && !t.deletedAt).sort((a, b) => a.order - b.order);
  siblings.splice(Math.max(0, Math.min(targetOrder, siblings.length)), 0, todo);
  const reOrdered = new Map(siblings.map((t, i) => [t.id, i]));
  todos = todos.map(t => reOrdered.has(t.id) ? { ...t, order: reOrdered.get(t.id)! } : t);
  emit();
  for (const [taskId, order] of reOrdered) {
    apiFetch(`/v1/tasks/items/${taskId}`, { method: 'PATCH', body: JSON.stringify({ sortOrder: order }) }).catch(reportSyncFailure);
  }
}

/** Soft-delete — moves the task to Trash rather than removing it immediately. */
export function deleteTodo(id: string) {
  const deletedAt = new Date().toISOString();
  todos = todos.map(t => t.id === id ? { ...t, deletedAt } : t);
  emit();
  apiFetch(`/v1/tasks/items/${id}`, { method: 'PATCH', body: JSON.stringify({ deletedAt }) }).catch(reportSyncFailure);
}

export function restoreTodo(id: string) {
  todos = todos.map(t => t.id === id ? { ...t, deletedAt: undefined } : t);
  emit();
  apiFetch(`/v1/tasks/items/${id}`, { method: 'PATCH', body: JSON.stringify({ deletedAt: null }) }).catch(reportSyncFailure);
}

/** Permanently removes a task — only reachable from within Trash. */
export function purgeTodo(id: string) {
  todos = todos.filter(t => t.id !== id);
  emit();
  apiFetch(`/v1/tasks/items/${id}?permanent=true`, { method: 'DELETE' }).catch(reportSyncFailure);
}

export function addSubtask(todoId: string, title: string) {
  const sub = { id: newId(), title, completed: false };
  todos = todos.map(t => t.id === todoId ? { ...t, subtasks: [...t.subtasks, sub] } : t);
  emit();
  apiFetch(`/v1/tasks/items/${todoId}/subtasks`, { method: 'POST', body: JSON.stringify({ id: sub.id, title }) }).catch(reportSyncFailure);
}

export function updateSubtask(todoId: string, subtaskId: string, patch: Partial<Subtask>) {
  todos = todos.map(t => t.id === todoId
    ? { ...t, subtasks: t.subtasks.map(s => s.id === subtaskId ? { ...s, ...patch } : s) }
    : t);
  emit();
  apiFetch(`/v1/tasks/items/${todoId}/subtasks/${subtaskId}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(reportSyncFailure);
}

export function deleteSubtask(todoId: string, subtaskId: string) {
  todos = todos.map(t => t.id === todoId
    ? { ...t, subtasks: t.subtasks.filter(s => s.id !== subtaskId) }
    : t);
  emit();
  apiFetch(`/v1/tasks/items/${todoId}/subtasks/${subtaskId}`, { method: 'DELETE' }).catch(reportSyncFailure);
}

// ── Linked tasks from other apps (read-only) ──
export function useLinkedTasks() { return useSyncExternalStore(subscribe, () => linkedTasks); }

// ── Settings ──
export function useAppSettings() { return useSyncExternalStore(subscribe, () => settings); }

export function updateAppSettings(patch: Partial<AppSettings>) {
  settings = { ...settings, ...patch };
  emit();
  const body: Record<string, unknown> = {};
  if (patch.calendarDefaultView !== undefined) body.calendarDefaultView = patch.calendarDefaultView;
  if (patch.weekStartsMonday !== undefined) body.weekStartsMonday = patch.weekStartsMonday;
  if (patch.tasksDefaultView !== undefined) body.tasksDefaultView = patch.tasksDefaultView;
  apiFetch('/v1/tasks/settings', { method: 'PATCH', body: JSON.stringify(body) }).catch(reportSyncFailure);
}

// ── Active Tasks view — shared between TasksShell's sidebar and TasksApp's
// main panel, which live in separate parts of the component tree. ──
// 'linked' shows every cross-app task; `linked:${sourceApp}` filters to one
// source app (e.g. 'linked:ClearOS') — the sidebar's "From other apps"
// section, independent of the smart-view-only restriction the inline panel
// still has (see linkedShown in TasksApp.tsx).
export type TaskViewId = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'assigned' | 'trash' | 'linked' | `list:${string}` | `linked:${string}`;

let activeTaskView: TaskViewId = 'today';
const viewListeners = new Set<() => void>();

export function useActiveTaskView(): TaskViewId {
  return useSyncExternalStore(
    fn => { viewListeners.add(fn); return () => viewListeners.delete(fn); },
    () => activeTaskView,
  );
}

export function setActiveTaskView(v: TaskViewId) {
  activeTaskView = v;
  viewListeners.forEach(fn => fn());
}

// ── Calendar's currently-displayed date — shared between CalendarShell's
// sidebar mini month-picker and CalendarApp's main grid, which live in
// separate parts of the component tree (same reasoning as activeTaskView
// above). Whichever one navigates, both re-render in step. ──
let currentCalendarDate: Date = new Date();
const calendarDateListeners = new Set<() => void>();

export function useCurrentCalendarDate(): Date {
  return useSyncExternalStore(
    fn => { calendarDateListeners.add(fn); return () => calendarDateListeners.delete(fn); },
    () => currentCalendarDate,
  );
}

export function setCurrentCalendarDate(d: Date) {
  currentCalendarDate = d;
  calendarDateListeners.forEach(fn => fn());
}

// ── Free/busy ("Meet with…") — a one-off fetch, not part of the reactive
// store (the set of people being checked changes per-panel-session, nothing
// else in the app needs to react to it). Returns wall-clock local times to
// match how CalendarEvent.start/end are already represented. ──
export interface BusyBlock { start: string; end: string; }

// The set of colleagues currently being checked for availability — shared
// between CalendarShell's sidebar search panel and CalendarApp's grid
// overlay (same cross-component-tree reasoning as currentCalendarDate).
export interface MeetWithPerson { userId: string; name: string; email?: string; avatarUrl?: string }
export const MEET_WITH_COLORS = ['#dc2626', '#2563eb', '#7c3aed', '#d97706', '#db2777', '#0891b2', '#65a30d', '#0d7a6b'];
let meetWithPeople: MeetWithPerson[] = [];
const meetWithListeners = new Set<() => void>();

export function useMeetWithPeople(): MeetWithPerson[] {
  return useSyncExternalStore(
    fn => { meetWithListeners.add(fn); return () => meetWithListeners.delete(fn); },
    () => meetWithPeople,
  );
}
export function addMeetWithPerson(p: MeetWithPerson) {
  if (meetWithPeople.some(x => x.userId === p.userId)) return;
  meetWithPeople = [...meetWithPeople, p];
  meetWithListeners.forEach(fn => fn());
}
export function removeMeetWithPerson(userId: string) {
  meetWithPeople = meetWithPeople.filter(p => p.userId !== userId);
  meetWithListeners.forEach(fn => fn());
}
export function clearMeetWithPeople() {
  meetWithPeople = [];
  meetWithListeners.forEach(fn => fn());
}

export async function fetchFreeBusy(userIds: string[], range: { from: Date; to: Date }): Promise<Record<string, BusyBlock[]>> {
  const qs = new URLSearchParams({ userIds: userIds.join(','), from: range.from.toISOString(), to: range.to.toISOString() });
  const res = await apiFetch(`/v1/tasks/events/freebusy?${qs.toString()}`);
  const out: Record<string, BusyBlock[]> = {};
  for (const [userId, blocks] of Object.entries<any[]>(res.data || {})) {
    out[userId] = blocks.map(b => ({ start: utcISOToLocal(b.start), end: utcISOToLocal(b.end) }));
  }
  return out;
}

// ── Booking pages (Calendly-style scheduling links) — managed from a
// dedicated settings panel, so plain fetch wrappers (matching
// fetchListShares/shareListWith above) rather than a reactive store. ──
export interface BookingPage {
  id: string; slug: string; title: string; description: string | null;
  durationMinutes: number; bufferMinutes: number; workingDays: number[];
  workingStartTime: string; workingEndTime: string; timezone: string;
  bookingWindowDays: number; active: boolean; createdAt: string;
}

function fromApiBookingPage(row: any): BookingPage {
  return {
    id: row.id, slug: row.slug, title: row.title, description: row.description ?? null,
    durationMinutes: row.durationMinutes, bufferMinutes: row.bufferMinutes, workingDays: row.workingDays,
    workingStartTime: row.workingStartTime, workingEndTime: row.workingEndTime, timezone: row.timezone,
    bookingWindowDays: row.bookingWindowDays, active: row.active, createdAt: row.createdAt,
  };
}

export type BookingPageInput = Partial<Omit<BookingPage, 'id' | 'createdAt'>>;

export async function fetchBookingPages(): Promise<BookingPage[]> {
  const res = await apiFetch('/v1/tasks/booking-pages');
  return (res.data || []).map(fromApiBookingPage);
}

export async function createBookingPage(input: BookingPageInput): Promise<BookingPage> {
  const res = await apiFetch('/v1/tasks/booking-pages', { method: 'POST', body: JSON.stringify({ id: newId(), ...input }) });
  return fromApiBookingPage(res.data);
}

export async function updateBookingPage(id: string, input: BookingPageInput): Promise<BookingPage> {
  const res = await apiFetch(`/v1/tasks/booking-pages/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  return fromApiBookingPage(res.data);
}

export async function deleteBookingPage(id: string): Promise<void> {
  await apiFetch(`/v1/tasks/booking-pages/${id}`, { method: 'DELETE' });
}

// ── Google/Outlook Calendar sync (calendar-sync.routes.ts) — plain fetch
// wrappers, same reasoning as booking pages above: managed from a settings
// panel, not something the reactive event store needs to react to. ──
export interface CalendarSyncConnection {
  provider: 'google' | 'outlook';
  status: 'disconnected' | 'authorized' | 'error';
  lastSyncedAt: string | null;
  lastError: string | null;
}

export async function fetchCalendarSyncConnections(): Promise<CalendarSyncConnection[]> {
  const res = await apiFetch('/v1/tasks/calendar-sync/connections');
  return res.data || [];
}

/** Returns the provider's consent URL — caller does `window.location.href = url`
 *  itself (this can't navigate the browser directly; see calendar-sync.routes.ts's
 *  own comment on why /authorize returns JSON instead of redirecting). */
export async function getCalendarSyncAuthorizeUrl(provider: 'google' | 'outlook'): Promise<string> {
  const res = await apiFetch(`/v1/tasks/calendar-sync/${provider}/authorize`);
  return res.url;
}

export async function disconnectCalendarSync(provider: 'google' | 'outlook'): Promise<void> {
  await apiFetch(`/v1/tasks/calendar-sync/${provider}/disconnect`, { method: 'POST' });
}

/** Tenant-admin-only: the OAuth app registration itself (Client ID/Secret),
 *  via the generic settings endpoint — settings.routes.ts's
 *  SECRET_FIELDS_BY_KEY already masks/encrypts googleClientSecret and
 *  outlookClientSecret under this same 'calendarSync' key, so this needs no
 *  dedicated route of its own. */
export async function saveCalendarSyncCredentials(patch: Record<string, string>): Promise<void> {
  await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ calendarSync: patch }) });
}

export async function fetchCalendarSyncCredentials(): Promise<Record<string, string>> {
  const res = await apiFetch('/v1/settings');
  return res.settings?.calendarSync ?? {};
}
