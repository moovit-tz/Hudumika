// Notes — real tenant-scoped storage backing the Notes app (see
// 265_notes_app.sql's header for the original design, 282_notes_enterprise.sql
// for the access-control/audit/retention layer added on top of it).
//
// Visibility model: 'team' (default — every note ever created before this
// migration, and still the default for a new one) stays visible/editable to
// the whole tenant, unchanged from day one. 'private' and 'shared' are new:
// a note can now actually be restricted to its creator, or to a named list
// of collaborators each with their own view/edit permission — the real
// per-note ACL this app never had (it used to just say "shared with your
// whole team" because there was no other option).
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export type NoteVisibility = 'team' | 'private' | 'shared';
export interface NoteShareEntry { userId: string; permission: 'view' | 'edit'; }

export interface NoteInput {
  title?: string;
  content?: string;
  color?: string;
  checklist?: ChecklistItem[];
  images?: string[];
  drawing?: string | null;
  reminderAt?: string | null;
  labelIds?: string[];
  subjectType?: string | null;
  subjectId?: string | null;
  // Real cross-app meeting linking (369_meeting_link_everywhere.sql) — same
  // shape calendar_events'/tasks' own meeting_url/meeting_settings use.
  meetingUrl?: string | null;
  meetingSettings?: Record<string, unknown>;
  blissMeetingId?: string | null;
  visibility?: NoteVisibility;
  /** Only meaningful (and only ever applied) when visibility is 'shared'. */
  shares?: NoteShareEntry[];
  legalHold?: boolean;
  /** Optimistic-lock guard, checked when present: the client's own last-seen
   *  notes.updated_at. Used by the version-history "Restore" flow (the
   *  moment where silently clobbering someone else's newer edit actually
   *  matters) rather than on every keystroke of the free-typing editor —
   *  see the service's own note on why this app does not attempt per-
   *  keystroke concurrency control. */
  expectedUpdatedAt?: string;
}

export class NoteForbiddenError extends Error {
  constructor(message = "You don't have access to this note.") { super(message); }
}
export class NoteConflictError extends Error {
  current: unknown;
  constructor(current: unknown) {
    super('This note was changed since you last loaded it.');
    this.current = current;
  }
}

// Same 1000 the old hardcoded .limit(1000) used — kept as the default page
// size (not lowered) so the sidebar's own counts (NotesShell.tsx tallies
// reminders/archive/trash/category counts from this same loaded set) don't
// regress in accuracy for the common case. What's actually new is that a
// tenant past this ceiling can now reach the rest via loadMoreNotes()
// (real offset pagination) instead of it being a hard, silent cutoff.
const NOTES_DEFAULT_PAGE_SIZE = 1000;
const NOTES_MAX_PAGE_SIZE = 1000;

function computeCanEdit(row: { visibility: string; created_by: string | null }, viewerId: string, myPermission?: string): boolean {
  if (row.created_by === viewerId) return true;
  if (row.visibility === 'team') return true;
  if (row.visibility === 'shared') return myPermission === 'edit';
  return false;
}

function mapNote(row: any, viewerId: string, shares: NoteShareEntry[] = []) {
  const myShare = shares.find(s => s.userId === viewerId);
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    color: row.color,
    isPinned: row.viewer_pinned ?? false,
    isArchived: row.viewer_archived ?? false,
    isTrashed: row.is_trashed,
    trashedAt: row.trashed_at ? new Date(row.trashed_at).toISOString() : null,
    legalHold: row.legal_hold ?? false,
    checklist: typeof row.checklist === 'string' ? JSON.parse(row.checklist) : row.checklist,
    images: row.images ?? [],
    drawing: row.drawing ?? null,
    reminderAt: row.reminder_at ? new Date(row.reminder_at).toISOString() : null,
    labelIds: row.label_ids ?? [],
    subjectType: row.subject_type ?? null,
    subjectId: row.subject_id ?? null,
    meetingUrl: row.meeting_url ?? null,
    meetingSettings: typeof row.meeting_settings === 'string' ? JSON.parse(row.meeting_settings) : (row.meeting_settings ?? {}),
    blissMeetingId: row.bliss_meeting_id ?? null,
    visibility: row.visibility,
    shares,
    isOwner: row.created_by === viewerId,
    canEdit: computeCanEdit(row, viewerId, myShare?.permission),
    createdBy: row.created_by,
    updatedBy: row.updated_by ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function listShareEntries(trx: any, tenantId: string, noteId: string): Promise<NoteShareEntry[]> {
  const rows = await trx.selectFrom('note_shares').select(['user_id', 'permission'])
    .where('tenant_id', '=', tenantId).where('note_id', '=', noteId).execute();
  return rows.map((r: any) => ({ userId: r.user_id, permission: r.permission }));
}

async function viewerState(trx: any, tenantId: string, noteId: string, userId: string) {
  return trx.selectFrom('note_user_state').select(['is_pinned', 'is_archived'])
    .where('tenant_id', '=', tenantId).where('note_id', '=', noteId).where('user_id', '=', userId)
    .executeTakeFirst();
}

/** Loads the note plus everything mapNote() needs from the viewer's
 *  perspective — the shape every mutator returns after changing a row. */
async function loadForViewer(trx: any, tenantId: string, noteId: string, userId: string) {
  const row = await trx.selectFrom('notes').selectAll()
    .where('id', '=', noteId).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
  const shares = row.visibility === 'shared' ? await listShareEntries(trx, tenantId, noteId) : [];
  const state = await viewerState(trx, tenantId, noteId, userId);
  return mapNote({ ...row, viewer_pinned: state?.is_pinned ?? false, viewer_archived: state?.is_archived ?? false }, userId, shares);
}

async function fetchAccessRow(trx: any, tenantId: string, noteId: string) {
  return trx.selectFrom('notes').select(['created_by', 'visibility', 'legal_hold'])
    .where('id', '=', noteId).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
}

async function assertCanView(trx: any, tenantId: string, noteId: string, userId: string) {
  const row = await fetchAccessRow(trx, tenantId, noteId);
  if (row.created_by === userId || row.visibility === 'team') return;
  if (row.visibility === 'shared') {
    const share = await trx.selectFrom('note_shares').select('id')
      .where('note_id', '=', noteId).where('user_id', '=', userId).executeTakeFirst();
    if (share) return;
  }
  throw new NoteForbiddenError();
}

async function assertCanEdit(trx: any, tenantId: string, noteId: string, userId: string) {
  const row = await fetchAccessRow(trx, tenantId, noteId);
  let myPermission: string | undefined;
  if (row.visibility === 'shared' && row.created_by !== userId) {
    const share = await trx.selectFrom('note_shares').select('permission')
      .where('note_id', '=', noteId).where('user_id', '=', userId).executeTakeFirst();
    myPermission = share?.permission;
  }
  if (!computeCanEdit(row, userId, myPermission)) throw new NoteForbiddenError();
}

export interface NotesListFilter {
  subjectType?: string;
  subjectId?: string;
  /** Matched against title OR content, case-insensitive, at the database —
   *  not a client-side substring filter over whatever page happened to
   *  load, so a match past the current page is still found. */
  search?: string;
  limit?: number;
  offset?: number;
}

export interface NotesListResult {
  notes: ReturnType<typeof mapNote>[];
  /** True if there's at least one more note past this page — computed by
   *  fetching one extra row rather than a separate COUNT query. */
  hasMore: boolean;
}

export async function listNotes(tenantId: string, userId: string, filter?: NotesListFilter): Promise<NotesListResult> {
  return withTenant(tenantId, async (trx) => {
    const sharedWithMe = (await trx.selectFrom('note_shares').select('note_id')
      .where('tenant_id', '=', tenantId).where('user_id', '=', userId).execute())
      .map((r: any) => r.note_id);

    const limit = Math.min(Math.max(filter?.limit ?? NOTES_DEFAULT_PAGE_SIZE, 1), NOTES_MAX_PAGE_SIZE);
    const offset = Math.max(filter?.offset ?? 0, 0);

    let q = trx.selectFrom('notes')
      .leftJoin('note_user_state', (join: any) => join
        .onRef('note_user_state.note_id', '=', 'notes.id')
        .on('note_user_state.user_id', '=', userId))
      .selectAll('notes')
      .select(['note_user_state.is_pinned as viewer_pinned', 'note_user_state.is_archived as viewer_archived'])
      .where('notes.tenant_id', '=', tenantId)
      .where((eb: any) => eb.or([
        eb('notes.visibility', '=', 'team'),
        eb('notes.created_by', '=', userId),
        ...(sharedWithMe.length ? [eb('notes.id', 'in', sharedWithMe)] : []),
      ]));
    if (filter?.subjectType) q = q.where('notes.subject_type', '=', filter.subjectType);
    if (filter?.subjectId) q = q.where('notes.subject_id', '=', filter.subjectId);
    const search = filter?.search?.trim();
    if (search) {
      const term = `%${search}%`;
      // Also matches inside checklist item text (cast to text — checklist
      // is jsonb) — the old client-side filter this replaced searched
      // checklist text too, and silently losing that would be a real
      // regression, not just a simplification.
      q = q.where((eb: any) => eb.or([
        eb('notes.title', 'ilike', term),
        eb('notes.content', 'ilike', term),
        sql`notes.checklist::text ILIKE ${term}`,
      ]));
    }

    // Fetch one extra row past the page size to know if there's a next
    // page, without a separate COUNT query.
    const rows = await q.orderBy('notes.updated_at', 'desc').limit(limit + 1).offset(offset).execute();
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    const sharedNoteIds = rows.filter((r: any) => r.visibility === 'shared').map((r: any) => r.id);
    const sharesByNote = new Map<string, NoteShareEntry[]>();
    if (sharedNoteIds.length) {
      const shareRows = await trx.selectFrom('note_shares').select(['note_id', 'user_id', 'permission'])
        .where('tenant_id', '=', tenantId).where('note_id', 'in', sharedNoteIds).execute();
      for (const s of shareRows) {
        const list = sharesByNote.get(s.note_id) ?? [];
        list.push({ userId: s.user_id, permission: s.permission as 'view' | 'edit' });
        sharesByNote.set(s.note_id, list);
      }
    }
    return { notes: rows.map((r: any) => mapNote(r, userId, sharesByNote.get(r.id) ?? [])), hasMore };
  });
}

export async function createNote(tenantId: string, userId: string, input: NoteInput) {
  return withTenant(tenantId, async (trx) => {
    const visibility: NoteVisibility = input.visibility ?? 'team';
    const row = await trx.insertInto('notes').values({
      tenant_id: tenantId,
      created_by: userId,
      updated_by: userId,
      title: input.title?.trim() || '',
      content: input.content?.trim() || '',
      color: input.color || 'default',
      checklist: JSON.stringify(input.checklist ?? []),
      images: input.images ?? [],
      drawing: input.drawing ?? null,
      reminder_at: input.reminderAt ? new Date(input.reminderAt) : null,
      label_ids: input.labelIds ?? [],
      subject_type: input.subjectType ?? null,
      subject_id: input.subjectId ?? null,
      meeting_url: input.meetingUrl ?? null,
      meeting_settings: JSON.stringify(input.meetingSettings ?? {}),
      bliss_meeting_id: input.blissMeetingId ?? null,
      visibility,
      legal_hold: input.legalHold ?? false,
    }).returningAll().executeTakeFirstOrThrow();

    if (visibility === 'shared' && input.shares?.length) {
      await trx.insertInto('note_shares').values(input.shares.map(s => ({
        note_id: row.id, tenant_id: tenantId, user_id: s.userId, permission: s.permission,
      }))).execute();
    }
    const shares = visibility === 'shared' ? (input.shares ?? []) : [];
    return mapNote({ ...row, viewer_pinned: false, viewer_archived: false }, userId, shares);
  });
}

export async function updateNote(tenantId: string, userId: string, id: string, input: NoteInput) {
  return withTenant(tenantId, async (trx) => {
    const existing = await trx.selectFrom('notes').selectAll()
      .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
    const isCreator = existing.created_by === userId;

    // Changing who a shared note is shared with (or its visibility at all)
    // is an ownership decision, not a content edit — same as Keep, where
    // only the note's owner manages collaborators, even though an editor
    // can freely change the content itself.
    if ((input.visibility !== undefined || input.shares !== undefined) && !isCreator) {
      throw new NoteForbiddenError("Only this note's creator can change who it's shared with.");
    }

    let myPermission: string | undefined;
    if (existing.visibility === 'shared' && !isCreator) {
      const share = await trx.selectFrom('note_shares').select('permission')
        .where('note_id', '=', id).where('user_id', '=', userId).executeTakeFirst();
      myPermission = share?.permission;
    }
    if (!computeCanEdit(existing, userId, myPermission)) throw new NoteForbiddenError();

    if (input.expectedUpdatedAt && new Date(input.expectedUpdatedAt).getTime() !== new Date(existing.updated_at).getTime()) {
      const shares = existing.visibility === 'shared' ? await listShareEntries(trx, tenantId, id) : [];
      const state = await viewerState(trx, tenantId, id, userId);
      throw new NoteConflictError(mapNote({ ...existing, viewer_pinned: state?.is_pinned ?? false, viewer_archived: state?.is_archived ?? false }, userId, shares));
    }

    // A snapshot of the version being replaced — tagged with who actually
    // wrote it and when it was last saved, not with "now" or with whoever
    // is making this new change. Only taken when content actually moved;
    // a reminder/label/color-only patch isn't a new "version" of the text.
    const contentChanged = input.title !== undefined || input.content !== undefined || input.checklist !== undefined;
    if (contentChanged) {
      await trx.insertInto('note_revisions').values({
        note_id: id,
        tenant_id: tenantId,
        changed_by: existing.updated_by ?? existing.created_by,
        title: existing.title,
        content: existing.content,
        checklist: existing.checklist,
        changed_at: existing.updated_at,
      }).execute();
    }

    const patch: Record<string, unknown> = { updated_at: new Date(), updated_by: userId };
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.content !== undefined) patch.content = input.content.trim();
    if (input.color !== undefined) patch.color = input.color;
    if (input.checklist !== undefined) patch.checklist = JSON.stringify(input.checklist);
    if (input.images !== undefined) patch.images = input.images;
    if (input.drawing !== undefined) patch.drawing = input.drawing;
    if (input.reminderAt !== undefined) {
      patch.reminder_at = input.reminderAt ? new Date(input.reminderAt) : null;
      // Changing (or clearing) the reminder re-arms it — otherwise pushing
      // a fired reminder an hour later would never fire again, since it was
      // already marked notified at the old time.
      patch.reminder_notified_at = null;
    }
    if (input.labelIds !== undefined) patch.label_ids = input.labelIds;
    if (input.subjectType !== undefined) patch.subject_type = input.subjectType;
    if (input.subjectId !== undefined) patch.subject_id = input.subjectId;
    if (input.meetingUrl !== undefined) patch.meeting_url = input.meetingUrl;
    if (input.meetingSettings !== undefined) patch.meeting_settings = JSON.stringify(input.meetingSettings);
    if (input.blissMeetingId !== undefined) patch.bliss_meeting_id = input.blissMeetingId;
    if (input.legalHold !== undefined) patch.legal_hold = input.legalHold;
    if (input.visibility !== undefined) patch.visibility = input.visibility;

    const row = await trx.updateTable('notes').set(patch)
      .where('id', '=', id).where('tenant_id', '=', tenantId)
      .returningAll().executeTakeFirstOrThrow();

    if (input.shares !== undefined) {
      await trx.deleteFrom('note_shares').where('note_id', '=', id).where('tenant_id', '=', tenantId).execute();
      if (row.visibility === 'shared' && input.shares.length) {
        await trx.insertInto('note_shares').values(input.shares.map(s => ({
          note_id: id, tenant_id: tenantId, user_id: s.userId, permission: s.permission,
        }))).execute();
      }
    }

    return loadForViewer(trx, tenantId, id, userId);
  });
}

export async function setPinned(tenantId: string, userId: string, id: string, pinned: boolean) {
  return withTenant(tenantId, async (trx) => {
    await assertCanView(trx, tenantId, id, userId);
    await trx.insertInto('note_user_state')
      .values({ note_id: id, tenant_id: tenantId, user_id: userId, is_pinned: pinned, is_archived: false, updated_at: new Date() })
      .onConflict((oc: any) => oc.columns(['note_id', 'user_id']).doUpdateSet({ is_pinned: pinned, updated_at: new Date() }))
      .execute();
    return loadForViewer(trx, tenantId, id, userId);
  });
}

export async function setArchived(tenantId: string, userId: string, id: string, archived: boolean) {
  return withTenant(tenantId, async (trx) => {
    await assertCanView(trx, tenantId, id, userId);
    await trx.insertInto('note_user_state')
      .values({ note_id: id, tenant_id: tenantId, user_id: userId, is_pinned: false, is_archived: archived, updated_at: new Date() })
      .onConflict((oc: any) => oc.columns(['note_id', 'user_id']).doUpdateSet({ is_archived: archived, updated_at: new Date() }))
      .execute();
    return loadForViewer(trx, tenantId, id, userId);
  });
}

export async function trashNote(tenantId: string, userId: string, id: string) {
  return withTenant(tenantId, async (trx) => {
    await assertCanEdit(trx, tenantId, id, userId);
    await trx.updateTable('notes')
      .set({ is_trashed: true, trashed_at: new Date(), updated_at: new Date(), updated_by: userId })
      .where('id', '=', id).where('tenant_id', '=', tenantId).execute();
    return loadForViewer(trx, tenantId, id, userId);
  });
}

export async function restoreNote(tenantId: string, userId: string, id: string) {
  return withTenant(tenantId, async (trx) => {
    await assertCanEdit(trx, tenantId, id, userId);
    await trx.updateTable('notes')
      .set({ is_trashed: false, trashed_at: null, updated_at: new Date(), updated_by: userId })
      .where('id', '=', id).where('tenant_id', '=', tenantId).execute();
    return loadForViewer(trx, tenantId, id, userId);
  });
}

export async function deleteNotePermanently(tenantId: string, userId: string, id: string) {
  return withTenant(tenantId, async (trx) => {
    await assertCanEdit(trx, tenantId, id, userId);
    const row = await fetchAccessRow(trx, tenantId, id);
    if (row.legal_hold) throw new NoteForbiddenError('This note is on legal hold and cannot be permanently deleted.');
    await trx.deleteFrom('notes').where('id', '=', id).where('tenant_id', '=', tenantId).execute();
  });
}

/** Only empties what this user can actually see in Trash — team notes plus
 *  their own private/shared-with-edit ones — never someone else's private
 *  trashed note, and never anything on legal hold. */
export async function emptyTrash(tenantId: string, userId: string) {
  return withTenant(tenantId, async (trx) => {
    const editableSharedIds = (await trx.selectFrom('note_shares').select('note_id')
      .where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('permission', '=', 'edit').execute())
      .map((r: any) => r.note_id);

    await trx.deleteFrom('notes')
      .where('tenant_id', '=', tenantId)
      .where('is_trashed', '=', true)
      .where('legal_hold', '=', false)
      .where((eb: any) => eb.or([
        eb('visibility', '=', 'team'),
        eb('created_by', '=', userId),
        ...(editableSharedIds.length ? [eb('id', 'in', editableSharedIds)] : []),
      ]))
      .execute();
  });
}

export async function listRevisions(tenantId: string, userId: string, noteId: string) {
  return withTenant(tenantId, async (trx) => {
    await assertCanView(trx, tenantId, noteId, userId);
    const rows = await trx.selectFrom('note_revisions').selectAll()
      .where('tenant_id', '=', tenantId).where('note_id', '=', noteId)
      .orderBy('changed_at', 'desc').execute();
    return rows.map((r: any) => ({
      id: r.id,
      changedBy: r.changed_by,
      title: r.title,
      content: r.content,
      checklist: typeof r.checklist === 'string' ? JSON.parse(r.checklist) : r.checklist,
      changedAt: new Date(r.changed_at).toISOString(),
    }));
  });
}

export async function restoreRevision(tenantId: string, userId: string, noteId: string, revisionId: string, expectedUpdatedAt?: string) {
  return withTenant(tenantId, async (trx) => {
    await assertCanEdit(trx, tenantId, noteId, userId);
    const rev = await trx.selectFrom('note_revisions').selectAll()
      .where('id', '=', revisionId).where('note_id', '=', noteId).where('tenant_id', '=', tenantId)
      .executeTakeFirstOrThrow();
    const existing = await trx.selectFrom('notes').selectAll()
      .where('id', '=', noteId).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();

    // Restoring an old version is the one place in this app where silently
    // clobbering someone else's newer edit actually matters — the version
    // list the user is restoring from could already be stale.
    if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== new Date(existing.updated_at).getTime()) {
      throw new NoteConflictError(await loadForViewer(trx, tenantId, noteId, userId));
    }

    // The version being overwritten by this restore is itself worth keeping
    // — restoring an old revision must not silently erase whatever was
    // live a moment ago.
    await trx.insertInto('note_revisions').values({
      note_id: noteId,
      tenant_id: tenantId,
      changed_by: existing.updated_by ?? existing.created_by,
      title: existing.title,
      content: existing.content,
      checklist: existing.checklist,
      changed_at: existing.updated_at,
    }).execute();

    await trx.updateTable('notes')
      .set({ title: rev.title, content: rev.content, checklist: rev.checklist, updated_at: new Date(), updated_by: userId })
      .where('id', '=', noteId).where('tenant_id', '=', tenantId).execute();

    return loadForViewer(trx, tenantId, noteId, userId);
  });
}

function mapLabel(row: any) {
  return { id: row.id, name: row.name, createdBy: row.created_by, createdAt: new Date(row.created_at).toISOString() };
}

export async function listLabels(tenantId: string) {
  return withTenant(tenantId, async (trx) => {
    const rows = await trx.selectFrom('note_labels').selectAll().where('tenant_id', '=', tenantId).orderBy('name', 'asc').execute();
    return rows.map(mapLabel);
  });
}

export async function createLabel(tenantId: string, userId: string, name: string) {
  return withTenant(tenantId, async (trx) => {
    const trimmed = name.trim();
    const existing = await trx.selectFrom('note_labels').selectAll()
      .where('tenant_id', '=', tenantId).where('name', '=', trimmed).executeTakeFirst();
    if (existing) return mapLabel(existing);
    const row = await trx.insertInto('note_labels').values({
      tenant_id: tenantId, created_by: userId, name: trimmed,
    }).returningAll().executeTakeFirstOrThrow();
    return mapLabel(row);
  });
}

export async function updateLabel(tenantId: string, id: string, name: string) {
  return withTenant(tenantId, async (trx) => {
    const row = await trx.updateTable('note_labels').set({ name: name.trim() })
      .where('id', '=', id).where('tenant_id', '=', tenantId)
      .returningAll().executeTakeFirstOrThrow();
    return mapLabel(row);
  });
}

export async function deleteLabel(tenantId: string, id: string) {
  return withTenant(tenantId, async (trx) => {
    // Strip the deleted label out of every note that carried it — a label_id
    // pointing nowhere would otherwise linger silently on old notes. Filtered
    // in JS against the tenant's own note set (same cost as the old
    // localStorage version's own full-array scan) rather than a Postgres
    // array-contains query, to stay driver-agnostic for a uuid[] column.
    const all = await trx.selectFrom('notes').select(['id', 'label_ids']).where('tenant_id', '=', tenantId).execute();
    for (const n of all) {
      if (n.label_ids?.includes(id)) {
        await trx.updateTable('notes').set({ label_ids: n.label_ids.filter(l => l !== id) })
          .where('id', '=', n.id).where('tenant_id', '=', tenantId).execute();
      }
    }
    await trx.deleteFrom('note_labels').where('id', '=', id).where('tenant_id', '=', tenantId).execute();
  });
}
