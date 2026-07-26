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

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // YYYY-MM-DDTHH:MM, local wall-clock (not UTC)
  end: string;   // YYYY-MM-DDTHH:MM, local wall-clock
  description?: string;
  location?: string;
  category: 'work' | 'personal' | 'customs' | 'todo';
  guests?: string[];
}

export interface TaskList {
  id: string;
  name: string;
  color: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export type TaskStatus = 'none' | 'in_progress' | 'in_review' | 'waiting' | 'completed';

export interface Todo {
  id: string;
  title: string;
  listId: string;
  notes?: string;
  due?: string;          // YYYY-MM-DD
  starred?: boolean;
  someday?: boolean;
  status: TaskStatus;
  tags: string[];
  subtasks: Subtask[];
  completed: boolean;
  completedAt?: string;
  deletedAt?: string;
  order: number;
  createdAt: string;
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
    due: row.due || undefined, starred: !!row.starred, someday: !!row.someday,
    status: row.status, tags: row.tags || [],
    subtasks: (row.subtasks || []).map((s: any) => ({ id: s.id, title: s.title, completed: !!s.completed })),
    completed: !!row.completed, completedAt: row.completed_at || undefined, deletedAt: row.deleted_at || undefined,
    order: row.sort_order ?? 0, createdAt: row.created_at,
  };
}
function fromApiList(row: any): TaskList {
  return { id: row.id, name: row.name, color: row.color };
}
function fromApiEvent(row: any): CalendarEvent {
  return {
    id: row.id, title: row.title, start: utcISOToLocal(row.start_at), end: utcISOToLocal(row.end_at),
    description: row.description || undefined, location: row.location || undefined,
    category: row.category, guests: row.guests || [],
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

export function addEvent(event: Omit<CalendarEvent, 'id'>) {
  const newEvent: CalendarEvent = { ...event, id: newId() };
  events = [...events, newEvent];
  emit();
  apiFetch('/v1/tasks/events', {
    method: 'POST',
    body: JSON.stringify({
      id: newEvent.id, title: newEvent.title, start: localToUTCISO(newEvent.start), end: localToUTCISO(newEvent.end),
      description: newEvent.description, location: newEvent.location, category: newEvent.category, guests: newEvent.guests,
    }),
  }).catch(reportSyncFailure);
  return newEvent;
}

export function updateEvent(id: string, patch: Partial<CalendarEvent>) {
  events = events.map(e => e.id === id ? { ...e, ...patch } : e);
  emit();
  const body: Record<string, unknown> = { ...patch };
  if (patch.start) body.start = localToUTCISO(patch.start);
  if (patch.end) body.end = localToUTCISO(patch.end);
  apiFetch(`/v1/tasks/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).catch(reportSyncFailure);
}

export function deleteEvent(id: string) {
  events = events.filter(e => e.id !== id);
  emit();
  apiFetch(`/v1/tasks/events/${id}`, { method: 'DELETE' }).catch(reportSyncFailure);
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
    notes: input.notes, due: input.due, starred: input.starred ?? false, someday: input.someday ?? false,
    status: input.status ?? 'none', tags: input.tags ?? [], subtasks: input.subtasks ?? [],
    completed: input.completed ?? false, order: siblingCount, createdAt: new Date().toISOString().slice(0, 10),
  };
  todos = [...todos, newTodo];
  emit();
  apiFetch('/v1/tasks/items', {
    method: 'POST',
    body: JSON.stringify({
      id: newTodo.id, title: newTodo.title, listId: newTodo.listId, notes: newTodo.notes, due: newTodo.due,
      starred: newTodo.starred, someday: newTodo.someday, status: newTodo.status, tags: newTodo.tags,
    }),
  }).catch(reportSyncFailure);
  return newTodo;
}

export function updateTodo(id: string, patch: Partial<Todo>) {
  todos = todos.map(t => {
    if (t.id !== id) return t;
    const next = { ...t, ...patch };
    if (patch.completed !== undefined) next.completedAt = patch.completed ? new Date().toISOString() : undefined;
    return next;
  });
  emit();
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.due !== undefined) body.due = patch.due || null;
  if (patch.starred !== undefined) body.starred = patch.starred;
  if (patch.someday !== undefined) body.someday = patch.someday;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.tags !== undefined) body.tags = patch.tags;
  if (patch.completed !== undefined) body.completed = patch.completed;
  if (patch.listId !== undefined) body.listId = patch.listId;
  if (patch.order !== undefined) body.sortOrder = patch.order;
  apiFetch(`/v1/tasks/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).catch(reportSyncFailure);
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
export type TaskViewId = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'trash' | `list:${string}`;

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
