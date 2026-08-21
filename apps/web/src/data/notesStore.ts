import { useSyncExternalStore } from 'react';
import { apiFetch } from '../lib/api.js';
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

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  color: KeepColor;
  labels: string[]; // label IDs
  checklist: ChecklistItem[];
  drawing?: string | null; // base64 / data URL
  images: string[];
  reminder?: string | null; // ISO datetime string
  /** Optional link to a record in another app (e.g. subjectType:'shipment') — see 265_notes_app.sql. */
  subjectType?: string | null;
  subjectId?: string | null;
  /** Null for notes copied in by 266_notes_migrate_existing.sql — no real
   *  author existed for those source fields, so it's left honest rather than guessed. */
  createdBy?: string | null;
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
    color: r.color,
    labels: r.labelIds ?? [],
    checklist: r.checklist ?? [],
    drawing: r.drawing ?? null,
    images: r.images ?? [],
    reminder: r.reminderAt ?? null,
    subjectType: r.subjectType ?? null,
    subjectId: r.subjectId ?? null,
    createdBy: r.createdBy ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toApiInput(patch: Partial<NoteItem>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.content !== undefined) out.content = patch.content;
  if (patch.color !== undefined) out.color = patch.color;
  if (patch.pinned !== undefined) out.isPinned = patch.pinned;
  if (patch.archived !== undefined) out.isArchived = patch.archived;
  if (patch.checklist !== undefined) out.checklist = patch.checklist;
  if (patch.images !== undefined) out.images = patch.images;
  if (patch.drawing !== undefined) out.drawing = patch.drawing;
  if (patch.reminder !== undefined) out.reminderAt = patch.reminder;
  if (patch.labels !== undefined) out.labelIds = patch.labels;
  if (patch.subjectType !== undefined) out.subjectType = patch.subjectType;
  if (patch.subjectId !== undefined) out.subjectId = patch.subjectId;
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

const listeners = new Set<() => void>();
function notify() { listeners.forEach(fn => fn()); }

export function subscribeNotes(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fetches notes + labels once per session; safe to call from every mount
 *  (NotesApp calls it on mount) since it no-ops once already loaded/loading. */
export function loadNotes(force = false) {
  if (loading || (loaded && !force)) return;
  loading = true;
  Promise.all([
    apiFetch('/v1/notes').catch(() => []),
    apiFetch('/v1/notes/labels').catch(() => []),
  ]).then(async ([notes, labels]: [any[], any[]]) => {
    notesStore = (Array.isArray(notes) ? notes : []).map(fromApiNote);
    labelsStore = Array.isArray(labels) ? labels : [];
    loaded = true;
    notify();

    // Real creator identities, for the "who wrote this" indicator on each
    // card — batched to one request rather than one per note. Migrated
    // legacy notes have a null createdBy and are simply skipped; there is
    // no author to fetch for those, and none is invented.
    const authorIds = Array.from(new Set(notesStore.map(n => n.createdBy).filter((id): id is string => !!id)));
    const missing = authorIds.filter(id => !peopleStore[id]);
    if (missing.length > 0) {
      const people = await fetchPeople({ ids: missing });
      const next = { ...peopleStore };
      for (const p of people) next[p.id] = p;
      peopleStore = next;
      notify();
    }
  }).catch(() => {
    showAlert('Could not load notes. Check your connection and try again.', { variant: 'error' });
  }).finally(() => {
    loading = false;
    notify();
  });
}

export function useNotesLoaded(): boolean {
  return useSyncExternalStore(subscribeNotes, () => loaded);
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

export function setNotesSearchQuery(query: string) {
  searchQuery = query;
  notify();
}

/** Errors surface via showAlert rather than being swallowed — a note that
 *  failed to save must not look saved. Every mutator re-syncs local state
 *  from the real server response, never assumes the optimistic shape stuck. */
async function reportFailure(action: string, err: any) {
  showAlert(`${action} failed${err?.message ? `: ${err.message}` : '.'} Try again.`, { variant: 'error' });
}

export async function addNote(input: Partial<NoteItem>): Promise<NoteItem | null> {
  try {
    const created = await apiFetch('/v1/notes', { method: 'POST', body: JSON.stringify(toApiInput(input)) });
    const note = fromApiNote(created);
    notesStore = [note, ...notesStore];
    notify();
    return note;
  } catch (err: any) {
    await reportFailure('Creating the note', err);
    return null;
  }
}

export async function updateNote(id: string, patch: Partial<NoteItem>) {
  const prev = notesStore;
  // Optimistic local update for a responsive editor, corrected against the
  // real response (or rolled back entirely) once the request settles.
  notesStore = notesStore.map(n => n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n);
  notify();
  try {
    const updated = await apiFetch(`/v1/notes/${id}`, { method: 'PATCH', body: JSON.stringify(toApiInput(patch)) });
    notesStore = notesStore.map(n => n.id === id ? fromApiNote(updated) : n);
    notify();
  } catch (err: any) {
    notesStore = prev;
    notify();
    await reportFailure('Saving the note', err);
  }
}

export async function togglePinNote(id: string) {
  const note = notesStore.find(n => n.id === id);
  if (note) await updateNote(id, { pinned: !note.pinned });
}

export async function toggleArchiveNote(id: string) {
  const note = notesStore.find(n => n.id === id);
  if (note) await updateNote(id, { archived: !note.archived, pinned: false });
}

export async function trashNote(id: string) {
  const prev = notesStore;
  notesStore = notesStore.map(n => n.id === id ? { ...n, trashed: true, pinned: false } : n);
  notify();
  try {
    await apiFetch(`/v1/notes/${id}/trash`, { method: 'PATCH' });
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
    await apiFetch(`/v1/notes/${id}/restore`, { method: 'PATCH' });
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
    await apiFetch(`/v1/notes/${id}`, { method: 'DELETE' });
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
    await apiFetch('/v1/notes/empty-trash', { method: 'POST' });
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
    const created = await apiFetch('/v1/notes/labels', { method: 'POST', body: JSON.stringify({ name: trimmed }) });
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
    await apiFetch(`/v1/notes/labels/${id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
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
    await apiFetch(`/v1/notes/labels/${id}`, { method: 'DELETE' });
  } catch (err: any) {
    labelsStore = prevLabels;
    notesStore = prevNotes;
    notify();
    await reportFailure('Deleting the label', err);
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
  const drives = await apiFetch('/v1/drives');
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
    const uploaded = await apiFetch(`/v1/files/upload?drive_id=${driveId}&entity_type=note`, {
      method: 'POST',
      body: form,
    });
    return `drive:${uploaded.id}`;
  } catch {
    return readFileAsDataUrl(file);
  }
}
