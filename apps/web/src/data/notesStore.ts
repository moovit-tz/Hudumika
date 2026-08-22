import { useSyncExternalStore } from 'react';
import { apiFetch, withRetry } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { fetchPeople, type Person } from '../lib/identity.js';
import type { IconName } from '../components/Icon.js';

export type KeepColor =
  | 'default'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'darkblue'
  | 'purple'
  | 'pink'
  | 'brown'
  | 'gray';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export type NoteVisibility = 'team' | 'private' | 'shared';
export interface NoteShareEntry { userId: string; permission: 'view' | 'edit'; }

export interface NoteRevision {
  id: string;
  changedBy: string | null;
  title: string;
  content: string;
  checklist: ChecklistItem[];
  changedAt: string;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  trashedAt?: string | null;
  legalHold: boolean;
  color: KeepColor;
  labels: string[]; // label IDs
  checklist: ChecklistItem[];
  drawing?: string | null; // base64 / data URL
  images: string[];
  reminder?: string | null; // ISO datetime string
  /** Optional link to a record in another app (e.g. subjectType:'shipment') — see 265_notes_app.sql. */
  subjectType?: string | null;
  subjectId?: string | null;
  /** 'team' (default — visible/editable tenant-wide, the only behaviour
   *  before 282_notes_enterprise.sql) | 'private' (creator only) | 'shared'
   *  (creator + `shares`, each with their own view/edit permission). */
  visibility: NoteVisibility;
  shares: NoteShareEntry[];
  /** Whether the *current* user can edit this note — false for a
   *  view-only collaborator on a shared note. The UI disables editing
   *  rather than letting a write fail server-side. */
  canEdit: boolean;
  isOwner: boolean;
  /** Null for notes copied in by 266_notes_migrate_existing.sql — no real
   *  author existed for those source fields, so it's left honest rather than guessed. */
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteLabel {
  id: string;
  name: string;
}

export type NotesFilterId = 'all' | 'reminders' | 'archive' | 'trash' | `label:${string}` | `category:${string}`;

/**
 * "Which app is this note about" — the same subject_type values
 * 266_notes_migrate_existing.sql already tags real migrated notes with,
 * plus calendar/task/drive so a note can be manually related to those apps
 * too (see NOTE_CATEGORIES' header comment further down for why those three
 * have no subjectId picker). Drives the sidebar's Categories section and the
 * composer/editor's "Related to" picker — one list, both places.
 */
export const NOTE_CATEGORIES: { id: string; label: string; icon: IconName }[] = [
  { id: 'customer', label: 'Customers', icon: 'briefcase' },
  { id: 'lead', label: 'Leads', icon: 'target' },
  { id: 'contact', label: 'Contacts', icon: 'contact' },
  { id: 'invoice', label: 'Invoices', icon: 'invoice' },
  { id: 'quotation', label: 'Quotations', icon: 'fileText' },
  { id: 'shipment', label: 'Shipments', icon: 'ship' },
  { id: 'supplier_bill', label: 'Bills', icon: 'receipt' },
  { id: 'purchase_order', label: 'Purchase Orders', icon: 'clipboardList' },
  { id: 'supplier', label: 'Suppliers', icon: 'truck' },
  { id: 'comply_application', label: 'Compliance', icon: 'shield' },
  { id: 'delivery_document', label: 'Delivery Documents', icon: 'package' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'task', label: 'Tasks', icon: 'tasks' },
  { id: 'drive', label: 'Drive', icon: 'folder' },
];

export function categoryMeta(id: string | null | undefined): { label: string; icon: IconName } {
  const found = NOTE_CATEGORIES.find(c => c.id === id);
  if (found) return found;
  return { label: id ? id.replace(/_/g, ' ') : 'Other', icon: 'tag' };
}

// Real tenant-scoped storage (265_notes_app.sql / notes.routes.ts) — this
// used to be a localStorage-only, per-browser store seeded with fabricated
// demo content ("Welcome to Hudumika Notes", a fake TANCIS checklist). Every
// tenant now starts with zero notes, same as any other real record type in
// this platform, and every mutation is a real API call other users on the
// same tenant can see.

function fromApiNote(r: any): NoteItem {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    pinned: r.isPinned,
    archived: r.isArchived,
    trashed: r.isTrashed,
    trashedAt: r.trashedAt ?? null,
    legalHold: r.legalHold ?? false,
    color: r.color,
    labels: r.labelIds ?? [],
    checklist: r.checklist ?? [],
    drawing: r.drawing ?? null,
    images: r.images ?? [],
    reminder: r.reminderAt ?? null,
    subjectType: r.subjectType ?? null,
    subjectId: r.subjectId ?? null,
    visibility: r.visibility ?? 'team',
    shares: r.shares ?? [],
    canEdit: r.canEdit ?? true,
    isOwner: r.isOwner ?? false,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Content-only fields — everything the generic PATCH /v1/notes/:id
 *  accepts. Pin/archive deliberately excluded: they're personal state with
 *  their own endpoints (setPinned/setArchived below), not a content edit. */
function toApiInput(patch: Partial<NoteItem> & { expectedUpdatedAt?: string }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.content !== undefined) out.content = patch.content;
  if (patch.color !== undefined) out.color = patch.color;
  if (patch.checklist !== undefined) out.checklist = patch.checklist;
  if (patch.images !== undefined) out.images = patch.images;
  if (patch.drawing !== undefined) out.drawing = patch.drawing;
  if (patch.reminder !== undefined) out.reminderAt = patch.reminder;
  if (patch.labels !== undefined) out.labelIds = patch.labels;
  if (patch.subjectType !== undefined) out.subjectType = patch.subjectType;
  if (patch.subjectId !== undefined) out.subjectId = patch.subjectId;
  if (patch.visibility !== undefined) out.visibility = patch.visibility;
  if (patch.shares !== undefined) out.shares = patch.shares;
  if (patch.legalHold !== undefined) out.legalHold = patch.legalHold;
  if (patch.expectedUpdatedAt !== undefined) out.expectedUpdatedAt = patch.expectedUpdatedAt;
  return out;
}

// In-memory module state, hydrated from the API rather than localStorage.
let notesStore: NoteItem[] = [];
let labelsStore: NoteLabel[] = [];
let peopleStore: Record<string, Person> = {};
let activeFilter: NotesFilterId = 'all';
let viewMode: 'grid' | 'list' = 'grid';
let searchQuery = '';
let loaded = false;
let loading = false;
// True once the server reports at least one more note past the current
// page — drives the "Load more" control. Replaces what used to be a single
// 1000-note fetch with no way to reach anything past it.
let hasMoreNotes = false;
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();
function notify() { listeners.forEach(fn => fn()); }

export function subscribeNotes(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One real page fetch — GET /v1/notes now does the search/visibility
 *  filtering and pagination at the database, not a client-side substring
 *  scan over whatever the first fetch happened to load. `append` drives
 *  "Load more" (keeps what's already shown); a fresh search or reload
 *  always replaces the list from offset 0. */
async function fetchNotesPage(opts: { search: string; offset: number; append: boolean }): Promise<void> {
  loading = true;
  notify();
  try {
    const params = new URLSearchParams();
    if (opts.search) params.set('search', opts.search);
    if (opts.offset) params.set('offset', String(opts.offset));
    const data = await withRetry(() => apiFetch(`/v1/notes?${params.toString()}`));
    const page: NoteItem[] = Array.isArray(data?.notes) ? data.notes.map(fromApiNote) : [];
    notesStore = opts.append ? [...notesStore, ...page] : page;
    hasMoreNotes = !!data?.hasMore;
    loaded = true;
    notify();

    // Real creator identities, for the "who wrote this" indicator on each
    // card — batched to one request rather than one per note, and only for
    // the page just fetched (already-resolved people from earlier pages
    // stay cached). Migrated legacy notes have a null createdBy and are
    // simply skipped; there is no author to fetch for those, and none is
    // invented.
    const authorIds = Array.from(new Set(page.map(n => n.createdBy).filter((id): id is string => !!id)));
    const missing = authorIds.filter(id => !peopleStore[id]);
    if (missing.length > 0) {
      const people = await fetchPeople({ ids: missing });
      const next = { ...peopleStore };
      for (const p of people) next[p.id] = p;
      peopleStore = next;
      notify();
    }
  } catch {
    showAlert('Could not load notes. Check your connection and try again.', { variant: 'error' });
  } finally {
    loading = false;
    notify();
  }
}

/** Fetches the first page + labels once per session; safe to call from
 *  every mount (NotesApp/NotesShell both call it) since it no-ops once
 *  already loaded/loading. */
export function loadNotes(force = false) {
  if (loading || (loaded && !force)) return;
  fetchNotesPage({ search: searchQuery, offset: 0, append: false });
  if (labelsStore.length === 0) {
    apiFetch('/v1/notes/labels').then((labels: any) => {
      labelsStore = Array.isArray(labels) ? labels : [];
      notify();
    }).catch(() => {});
  }
}

/** Fetches the next page (same search term as whatever's currently
 *  loaded) and appends it — the "Load more" button's action. */
export async function loadMoreNotes(): Promise<void> {
  if (loading || !hasMoreNotes) return;
  await fetchNotesPage({ search: searchQuery, offset: notesStore.length, append: true });
}

export function useNotesLoaded(): boolean {
  return useSyncExternalStore(subscribeNotes, () => loaded);
}

export function useNotesLoading(): boolean {
  return useSyncExternalStore(subscribeNotes, () => loading);
}

export function useHasMoreNotes(): boolean {
  return useSyncExternalStore(subscribeNotes, () => hasMoreNotes);
}

// React Hooks
export function useNotes(): NoteItem[] {
  return useSyncExternalStore(subscribeNotes, () => notesStore);
}

export function useNoteLabels(): NoteLabel[] {
  return useSyncExternalStore(subscribeNotes, () => labelsStore);
}

export function usePeopleById(): Record<string, Person> {
  return useSyncExternalStore(subscribeNotes, () => peopleStore);
}

export function useActiveNotesFilter(): NotesFilterId {
  return useSyncExternalStore(subscribeNotes, () => activeFilter);
}

export function useNotesViewMode(): 'grid' | 'list' {
  return useSyncExternalStore(subscribeNotes, () => viewMode);
}

export function useNotesSearchQuery(): string {
  return useSyncExternalStore(subscribeNotes, () => searchQuery);
}

// Actions & Mutators
export function setActiveNotesFilter(filter: NotesFilterId) {
  activeFilter = filter;
  notify();
}

export function setNotesViewMode(mode: 'grid' | 'list') {
  viewMode = mode;
  notify();
}

/** Debounced (300ms), server-side search — replaces what used to be a pure
 *  client-side substring filter over whatever the first fetch happened to
 *  load, which silently missed anything past that page. Every keystroke
 *  still updates the input instantly (notify() below); only the actual
 *  refetch is debounced. */
export function setNotesSearchQuery(query: string) {
  searchQuery = query;
  notify();
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    fetchNotesPage({ search: query, offset: 0, append: false });
  }, 300);
}

/** Errors surface via showAlert rather than being swallowed — a note that
 *  failed to save must not look saved. Every mutator re-syncs local state
 *  from the real server response, never assumes the optimistic shape stuck. */
async function reportFailure(action: string, err: any) {
  showAlert(`${action} failed${err?.message ? `: ${err.message}` : '.'} Try again.`, { variant: 'error' });
}

export async function addNote(input: Partial<NoteItem>): Promise<NoteItem | null> {
  try {
    const created = await withRetry(() => apiFetch('/v1/notes', { method: 'POST', body: JSON.stringify(toApiInput(input)) }));
    const note = fromApiNote(created);
    notesStore = [note, ...notesStore];
    notify();
    return note;
  } catch (err: any) {
    await reportFailure('Creating the note', err);
    return null;
  }
}

/** Returns whether the save actually succeeded — callers that show their
 *  own inline "Saving…/Saved" status (the note editor's debounced
 *  autosave) key off this instead of guessing from side effects; the alert
 *  on failure still fires here too, since not every caller renders its own
 *  status (e.g. a checkbox toggle from the note list). */
export async function updateNote(id: string, patch: Partial<NoteItem>): Promise<boolean> {
  const prev = notesStore;
  // Optimistic local update for a responsive editor, corrected against the
  // real response (or rolled back entirely) once the request settles.
  notesStore = notesStore.map(n => n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n);
  notify();
  try {
    const updated = await withRetry(() => apiFetch(`/v1/notes/${id}`, { method: 'PATCH', body: JSON.stringify(toApiInput(patch)) }));
    notesStore = notesStore.map(n => n.id === id ? fromApiNote(updated) : n);
    notify();
    return true;
  } catch (err: any) {
    notesStore = prev;
    notify();
    await reportFailure('Saving the note', err);
    return false;
  }
}

// Pin/archive are personal view state (note_user_state), not a note edit —
// their own endpoints, separate from updateNote's generic content PATCH.
// One person pinning a note used to pin it for the entire tenant; this is
// what fixed that (282_notes_enterprise.sql).
export async function togglePinNote(id: string) {
  const note = notesStore.find(n => n.id === id);
  if (!note) return;
  const pinned = !note.pinned;
  const prev = notesStore;
  notesStore = notesStore.map(n => n.id === id ? { ...n, pinned } : n);
  notify();
  try {
    const updated = await withRetry(() => apiFetch(`/v1/notes/${id}/pin`, { method: 'PATCH', body: JSON.stringify({ pinned }) }));
    notesStore = notesStore.map(n => n.id === id ? fromApiNote(updated) : n);
    notify();
  } catch (err: any) {
    notesStore = prev;
    notify();
    await reportFailure('Pinning the note', err);
  }
}

export async function toggleArchiveNote(id: string) {
  const note = notesStore.find(n => n.id === id);
  if (!note) return;
  const archived = !note.archived;
  const prev = notesStore;
  notesStore = notesStore.map(n => n.id === id ? { ...n, archived } : n);
  notify();
  try {
    const updated = await withRetry(() => apiFetch(`/v1/notes/${id}/archive`, { method: 'PATCH', body: JSON.stringify({ archived }) }));
    notesStore = notesStore.map(n => n.id === id ? fromApiNote(updated) : n);
    notify();
  } catch (err: any) {
    notesStore = prev;
    notify();
    await reportFailure('Archiving the note', err);
  }
}

export async function trashNote(id: string) {
  const prev = notesStore;
  notesStore = notesStore.map(n => n.id === id ? { ...n, trashed: true, pinned: false } : n);
  notify();
  try {
    await withRetry(() => apiFetch(`/v1/notes/${id}/trash`, { method: 'PATCH' }));
  } catch (err: any) {
    notesStore = prev;
    notify();
    await reportFailure('Moving the note to trash', err);
  }
}

export async function restoreNote(id: string) {
  const prev = notesStore;
  notesStore = notesStore.map(n => n.id === id ? { ...n, trashed: false } : n);
  notify();
  try {
    await withRetry(() => apiFetch(`/v1/notes/${id}/restore`, { method: 'PATCH' }));
  } catch (err: any) {
    notesStore = prev;
    notify();
    await reportFailure('Restoring the note', err);
  }
}

export async function permanentlyDeleteNote(id: string) {
  const prev = notesStore;
  notesStore = notesStore.filter(n => n.id !== id);
  notify();
  try {
    await withRetry(() => apiFetch(`/v1/notes/${id}`, { method: 'DELETE' }));
  } catch (err: any) {
    notesStore = prev;
    notify();
    await reportFailure('Deleting the note', err);
  }
}

export async function emptyTrash() {
  const prev = notesStore;
  notesStore = notesStore.filter(n => !n.trashed);
  notify();
  try {
    await withRetry(() => apiFetch('/v1/notes/empty-trash', { method: 'POST' }));
  } catch (err: any) {
    notesStore = prev;
    notify();
    await reportFailure('Emptying the trash', err);
  }
}

export async function addLabel(name: string): Promise<NoteLabel | null> {
  const trimmed = name.trim();
  const existing = labelsStore.find(l => l.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  try {
    const created = await withRetry(() => apiFetch('/v1/notes/labels', { method: 'POST', body: JSON.stringify({ name: trimmed }) }));
    labelsStore = [...labelsStore, created];
    notify();
    return created;
  } catch (err: any) {
    await reportFailure('Creating the label', err);
    return null;
  }
}

export async function updateLabel(id: string, name: string) {
  const prev = labelsStore;
  labelsStore = labelsStore.map(l => l.id === id ? { ...l, name: name.trim() } : l);
  notify();
  try {
    await withRetry(() => apiFetch(`/v1/notes/labels/${id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) }));
  } catch (err: any) {
    labelsStore = prev;
    notify();
    await reportFailure('Renaming the label', err);
  }
}

export async function deleteLabel(id: string) {
  const prevLabels = labelsStore;
  const prevNotes = notesStore;
  labelsStore = labelsStore.filter(l => l.id !== id);
  notesStore = notesStore.map(n => ({ ...n, labels: n.labels.filter(lblId => lblId !== id) }));
  notify();
  try {
    await withRetry(() => apiFetch(`/v1/notes/labels/${id}`, { method: 'DELETE' }));
  } catch (err: any) {
    labelsStore = prevLabels;
    notesStore = prevNotes;
    notify();
    await reportFailure('Deleting the label', err);
  }
}

// ── Version history ──
// Every content edit snapshots the version it replaces (notes.service.ts's
// updateNote) — this app never had any audit trail before
// 282_notes_enterprise.sql; now "who changed what, when" is answerable, and
// an old version can be restored rather than lost for good.
export async function fetchNoteRevisions(id: string): Promise<NoteRevision[]> {
  try {
    return await withRetry(() => apiFetch(`/v1/notes/${id}/revisions`));
  } catch (err: any) {
    await reportFailure('Loading version history', err);
    return [];
  }
}

/** Restoring an old version is concurrency-guarded (expectedUpdatedAt) —
 *  the one place in this app where silently clobbering someone else's
 *  newer edit actually matters. A 409 means someone changed the note after
 *  this revision list was loaded; the caller should reload and try again
 *  rather than force it through. Returns the resulting note either way
 *  (server's real current state on conflict) so a caller can refresh
 *  whatever local copy it's holding without a second round trip. */
export async function restoreNoteRevision(id: string, revisionId: string, expectedUpdatedAt: string): Promise<{ ok: boolean; conflict: boolean; note: NoteItem | null }> {
  try {
    const updated = await withRetry(() => apiFetch(`/v1/notes/${id}/revisions/${revisionId}/restore`, {
      method: 'POST',
      body: JSON.stringify({ expectedUpdatedAt }),
    }));
    const note = fromApiNote(updated);
    notesStore = notesStore.map(n => n.id === id ? note : n);
    notify();
    return { ok: true, conflict: false, note };
  } catch (err: any) {
    const isConflict = err?.status === 409;
    if (isConflict && err?.body?.current) {
      const note = fromApiNote(err.body.current);
      notesStore = notesStore.map(n => n.id === id ? note : n);
      notify();
      showAlert('This note changed since you opened its history. Showing the latest version — try restoring again.', { variant: 'error' });
      return { ok: false, conflict: true, note };
    }
    await reportFailure('Restoring that version', err);
    return { ok: false, conflict: false, note: null };
  }
}

// ── Image attachments, routed through the real Cloud/Drive file store ──
//
// A note's `images` array now holds either a legacy inline data URI (every
// image attached before this shipped) or a `drive:<fileId>` reference
// pointing at a real cloud_files row uploaded via POST /v1/files/upload —
// NoteImage in NotesApp.tsx resolves either shape to something an <img> can
// show. New attachments always try Drive first, since a real file beats a
// base64 blob duplicated into every notes API response forever.
//
// files.routes.ts / drives.routes.ts both require the `cloud` entitlement,
// which Notes deliberately does not (it's a free app, every tenant has it) —
// so a tenant without Cloud enabled would 403 on the Drive call. Rather than
// let that break attaching an image, any failure here — missing
// entitlement, no drive, network error — falls back to the original inline
// storage. Nothing is silently lost; it just isn't routed through Drive.
let cachedDriveId: string | null = null;

async function resolveNotesDriveId(): Promise<string> {
  if (cachedDriveId) return cachedDriveId;
  const drives = await withRetry(() => apiFetch('/v1/drives'));
  if (!Array.isArray(drives) || drives.length === 0) throw new Error('No drive available');
  const driveId: string = drives[0].id;
  cachedDriveId = driveId;
  return driveId;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function uploadNoteImage(file: File): Promise<string> {
  try {
    const driveId = await resolveNotesDriveId();
    const form = new FormData();
    form.append('file', file);
    const uploaded = await withRetry(() => apiFetch(`/v1/files/upload?drive_id=${driveId}&entity_type=note`, {
      method: 'POST',
      body: form,
    }));
    return `drive:${uploaded.id}`;
  } catch {
    return readFileAsDataUrl(file);
  }
}
