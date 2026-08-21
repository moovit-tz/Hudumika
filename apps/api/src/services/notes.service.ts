// Notes — real tenant-scoped storage backing the Notes app (see
// 265_notes_app.sql's header for the design). Every note is visible to the
// whole tenant (not per-user), matching a shared team notebook rather than
// a private-per-login scratchpad — consistent with how Tasks/Calendar work
// elsewhere in this platform.
import { withTenant } from '../db/client.js';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface NoteInput {
  title?: string;
  content?: string;
  color?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  checklist?: ChecklistItem[];
  images?: string[];
  drawing?: string | null;
  reminderAt?: string | null;
  labelIds?: string[];
  subjectType?: string | null;
  subjectId?: string | null;
}

function mapNote(row: any) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    color: row.color,
    isPinned: row.is_pinned,
    isArchived: row.is_archived,
    isTrashed: row.is_trashed,
    checklist: typeof row.checklist === 'string' ? JSON.parse(row.checklist) : row.checklist,
    images: row.images ?? [],
    drawing: row.drawing ?? null,
    reminderAt: row.reminder_at ? new Date(row.reminder_at).toISOString() : null,
    labelIds: row.label_ids ?? [],
    subjectType: row.subject_type ?? null,
    subjectId: row.subject_id ?? null,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listNotes(tenantId: string, filter?: { subjectType?: string; subjectId?: string }) {
  return withTenant(tenantId, async (trx) => {
    let q = trx.selectFrom('notes').selectAll().where('tenant_id', '=', tenantId);
    if (filter?.subjectType) q = q.where('subject_type', '=', filter.subjectType);
    if (filter?.subjectId) q = q.where('subject_id', '=', filter.subjectId);
    const rows = await q.orderBy('is_pinned', 'desc').orderBy('updated_at', 'desc').limit(1000).execute();
    return rows.map(mapNote);
  });
}

export async function createNote(tenantId: string, userId: string, input: NoteInput) {
  return withTenant(tenantId, async (trx) => {
    const row = await trx.insertInto('notes').values({
      tenant_id: tenantId,
      created_by: userId,
      title: input.title?.trim() || '',
      content: input.content?.trim() || '',
      color: input.color || 'default',
      is_pinned: input.isPinned ?? false,
      is_archived: input.isArchived ?? false,
      checklist: JSON.stringify(input.checklist ?? []),
      images: input.images ?? [],
      drawing: input.drawing ?? null,
      reminder_at: input.reminderAt ? new Date(input.reminderAt) : null,
      label_ids: input.labelIds ?? [],
      subject_type: input.subjectType ?? null,
      subject_id: input.subjectId ?? null,
    }).returningAll().executeTakeFirstOrThrow();
    return mapNote(row);
  });
}

export async function updateNote(tenantId: string, id: string, input: NoteInput) {
  return withTenant(tenantId, async (trx) => {
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.content !== undefined) patch.content = input.content.trim();
    if (input.color !== undefined) patch.color = input.color;
    if (input.isPinned !== undefined) patch.is_pinned = input.isPinned;
    if (input.isArchived !== undefined) patch.is_archived = input.isArchived;
    if (input.checklist !== undefined) patch.checklist = JSON.stringify(input.checklist);
    if (input.images !== undefined) patch.images = input.images;
    if (input.drawing !== undefined) patch.drawing = input.drawing;
    if (input.reminderAt !== undefined) patch.reminder_at = input.reminderAt ? new Date(input.reminderAt) : null;
    if (input.labelIds !== undefined) patch.label_ids = input.labelIds;
    if (input.subjectType !== undefined) patch.subject_type = input.subjectType;
    if (input.subjectId !== undefined) patch.subject_id = input.subjectId;

    const row = await trx.updateTable('notes').set(patch)
      .where('id', '=', id).where('tenant_id', '=', tenantId)
      .returningAll().executeTakeFirstOrThrow();
    return mapNote(row);
  });
}

export async function trashNote(tenantId: string, id: string) {
  return withTenant(tenantId, async (trx) => {
    const row = await trx.updateTable('notes')
      .set({ is_trashed: true, is_pinned: false, updated_at: new Date() })
      .where('id', '=', id).where('tenant_id', '=', tenantId)
      .returningAll().executeTakeFirstOrThrow();
    return mapNote(row);
  });
}

export async function restoreNote(tenantId: string, id: string) {
  return withTenant(tenantId, async (trx) => {
    const row = await trx.updateTable('notes')
      .set({ is_trashed: false, updated_at: new Date() })
      .where('id', '=', id).where('tenant_id', '=', tenantId)
      .returningAll().executeTakeFirstOrThrow();
    return mapNote(row);
  });
}

export async function deleteNotePermanently(tenantId: string, id: string) {
  return withTenant(tenantId, (trx) =>
    trx.deleteFrom('notes').where('id', '=', id).where('tenant_id', '=', tenantId).execute()
  );
}

export async function emptyTrash(tenantId: string) {
  return withTenant(tenantId, (trx) =>
    trx.deleteFrom('notes').where('tenant_id', '=', tenantId).where('is_trashed', '=', true).execute()
  );
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
