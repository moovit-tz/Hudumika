import type { FastifyInstance } from 'fastify';
import { sql, type Transaction, type Selectable } from 'kysely';
import { z } from 'zod';
import { withTenant, type Database, type TasksTable } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';
import { MailService } from '../services/mail.service.js';
import { emitDomainEvent } from '../services/domain-events.service.js';
import * as CalendarEvents from '../services/calendar-events.service.js';
import { EventNotFoundError, EventValidationError } from '../services/calendar-events.service.js';
import * as BookingPages from '../services/booking-pages.service.js';
import { SlugTakenError, BookingPageNotFoundError } from '../services/booking-pages.service.js';
import { resolveProjectAccess, canEditProject } from './task-projects.routes.js';
import { requireEntitlement, tenantHasEntitlement } from '../middleware/entitlement.js';

// Tasks + Calendar backend. Both are personal (per-user), not tenant-shared —
// every query is scoped by (tenant_id, user_id) so each staff member only
// ever sees their own lists/tasks/events, the same way Google Tasks/Calendar
// work. The frontend always generates the row id client-side and sends it on
// create, so optimistic local updates never need id reconciliation.

const DEFAULT_LIST_COLOR = '#0d7a6b';

// id/list_id/task_id are real UUID PRIMARY KEY / FK columns (migration 079)
// — a non-UUID string used to reach the DB uncaught and 500 with a raw
// Postgres "invalid input syntax for type uuid" error.
const uuidSchema = z.string().uuid();
// Real values — calendarStore.ts's own TaskStatus / category / calendarDefaultView types.
const TASK_STATUSES = ['none', 'in_progress', 'in_review', 'waiting', 'completed'] as const;
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const EVENT_CATEGORIES = ['work', 'personal', 'customs', 'todo'] as const;
const RECURRENCE_FREQS = ['daily', 'weekly', 'monthly'] as const;
const recurrenceRuleSchema = z.object({
  freq: z.enum(RECURRENCE_FREQS),
  interval: z.number().int().min(1).max(365),
});
const CALENDAR_VIEWS = ['month', 'week', 'day', 'agenda'] as const;

const listCreateSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1).max(200),
  color: z.string().max(30).optional(),
});
const listPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  color: z.string().max(30).optional(),
  sort_order: z.number().int().optional(),
});
const taskCreateSchema = z.object({
  id: uuidSchema,
  title: z.string().trim().min(1).max(500),
  listId: uuidSchema,
  notes: z.string().max(10000).optional(),
  due: z.string().optional(),
  dueTime: z.string().max(8).optional(),
  startDate: z.string().optional(),
  starred: z.boolean().optional(),
  someday: z.boolean().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  tags: z.array(z.string()).optional(),
  assigneeId: uuidSchema.optional(),
  reminderAt: z.string().nullable().optional(),
  // tasks.advanced (migration 308) — validated here regardless of tier
  // (cheap), actual enforcement is resolveProjectAccess-gated on write below.
  projectId: uuidSchema.nullable().optional(),
  milestoneId: uuidSchema.nullable().optional(),
  isPrivate: z.boolean().optional(),
  isBillable: z.boolean().optional(),
  hourlyRate: z.number().min(0).max(1000000).nullable().optional(),
  subjectType: z.string().max(50).nullable().optional(),
  subjectId: uuidSchema.nullable().optional(),
  recurrenceRule: recurrenceRuleSchema.nullable().optional(),
});
const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  notes: z.string().max(10000).nullable().optional(),
  due: z.string().nullable().optional(),
  dueTime: z.string().max(8).nullable().optional(),
  startDate: z.string().nullable().optional(),
  starred: z.boolean().optional(),
  someday: z.boolean().optional(),
  reminderAt: z.string().nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  tags: z.array(z.string()).optional(),
  completed: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  listId: uuidSchema.optional(),
  deletedAt: z.string().nullable().optional(),
  // Null explicitly unassigns; omitted (undefined) leaves it untouched —
  // zod keeps that distinction, which the owner-only permission check below
  // relies on.
  assigneeId: uuidSchema.nullable().optional(),
  projectId: uuidSchema.nullable().optional(),
  milestoneId: uuidSchema.nullable().optional(),
  isPrivate: z.boolean().optional(),
  isBillable: z.boolean().optional(),
  hourlyRate: z.number().min(0).max(1000000).nullable().optional(),
  subjectType: z.string().max(50).nullable().optional(),
  subjectId: uuidSchema.nullable().optional(),
  recurrenceRule: recurrenceRuleSchema.nullable().optional(),
});
const collaboratorAddSchema = z.object({
  userId: uuidSchema,
  kind: z.enum(['assignee', 'follower']),
});
const dependencyAddSchema = z.object({
  dependsOnTaskId: uuidSchema,
});
const commentCreateSchema = z.object({
  content: z.string().trim().min(1).max(5000),
  mentions: z.array(z.object({ user_id: uuidSchema, name: z.string() })).optional(),
});
const listShareSchema = z.object({
  userId: uuidSchema,
  role: z.enum(['viewer', 'editor']),
});
const subtaskCreateSchema = z.object({
  id: uuidSchema,
  title: z.string().trim().min(1).max(500),
});
const subtaskPatchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  completed: z.boolean().optional(),
});
const guestSchema = z.object({
  userId: uuidSchema.nullable().optional(),
  email: z.string().max(320),
  name: z.string().max(200).nullable().optional(),
  status: z.enum(['pending', 'accepted', 'declined']).optional(),
});
const recurrenceSchema = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(365),
  byWeekday: z.array(z.number().int().min(0).max(6)).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  count: z.number().int().min(1).max(1000).optional(),
});
const eventCreateSchema = z.object({
  id: uuidSchema,
  title: z.string().trim().min(1).max(500),
  start: z.string().min(1),
  end: z.string().min(1),
  description: z.string().max(10000).optional(),
  location: z.string().max(500).optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  guests: z.array(guestSchema).optional(),
  allDay: z.boolean().optional(),
  color: z.string().max(30).nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  reminderOffsets: z.array(z.number().int().min(0).max(43200)).max(5).optional(), // cap at 30 days lead time, at most 5 reminders
  timezone: z.string().max(100).nullable().optional(), // IANA name, e.g. 'Africa/Dar_es_Salaam' — display label only, see calendar-events.service.ts
});
const eventPatchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  start: z.string().min(1).optional(),
  end: z.string().min(1).optional(),
  description: z.string().max(10000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  guests: z.array(guestSchema).optional(),
  allDay: z.boolean().optional(),
  color: z.string().max(30).nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  reminderOffsets: z.array(z.number().int().min(0).max(43200)).max(5).optional(),
  timezone: z.string().max(100).nullable().optional(),
  // Which occurrence this edit applies to — omitted/'all' means the whole
  // series (or the only occurrence, for a non-recurring event).
  scope: z.enum(['all', 'this']).optional(),
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const appSettingsPatchSchema = z.object({
  calendarDefaultView: z.enum(CALENDAR_VIEWS).optional(),
  weekStartsMonday: z.boolean().optional(),
  tasksDefaultView: z.string().max(50).optional(),
});

/** Logs the assignment change and, for a real new assignee who isn't the
 *  person making the change (self-assignment needs no ping), notifies them
 *  in-app and by email — the same NotificationService + MailService pairing
 *  sign-stamps.routes.ts's stamp-request flow already uses. */
async function handleAssigneeChange(
  trx: Transaction<Database>,
  user: { sub: string; tenant_id: string; name?: string },
  task: { id: string; title: string },
  newAssigneeId: string | null,
): Promise<void> {
  await emitDomainEvent(trx, user.tenant_id, {
    type: newAssigneeId ? 'todo.assigned' : 'todo.unassigned',
    sourceApp: 'tasks', entityType: 'task', entityId: task.id,
    payload: { title: task.title }, actorId: user.sub,
  });
  if (!newAssigneeId || newAssigneeId === user.sub) return;

  const assignee = await trx.selectFrom('users').select(['name', 'email'])
    .where('id', '=', newAssigneeId).executeTakeFirst();
  if (!assignee) return;

  const actorName = user.name ?? 'Someone';
  const title = `${actorName} assigned you a task`;
  await NotificationService.createNotification({
    tenantId: user.tenant_id, userId: newAssigneeId, app: 'tasks', type: 'task',
    title, message: task.title, link: '/tasks?view=assigned', entityType: 'task', entityId: task.id,
  }).catch(err => console.error('[Tasks] Failed to notify assignee:', err.message));
  await MailService.sendNow(user.tenant_id, {
    to: assignee.email, subject: title,
    bodyHtml: `<p>Hi ${assignee.name},</p><p>${actorName} assigned you a task: <strong>${task.title}</strong></p>`,
    sourceApp: 'tasks',
  }).catch(err => console.error('[Tasks] Failed to email assignee:', err.message));
}

/** Same notify-the-other-person shape as handleAssigneeChange, for the
 *  plural task_collaborators roster (migration 309, tasks.advanced) — a
 *  co-assignee or follower added to a task they didn't add themselves to. */
async function notifyCollaboratorAdded(
  trx: Transaction<Database>,
  user: { sub: string; tenant_id: string; name?: string },
  task: { id: string; title: string },
  collaboratorUserId: string,
  kind: 'assignee' | 'follower',
): Promise<void> {
  if (collaboratorUserId === user.sub) return;
  const recipient = await trx.selectFrom('users').select(['name', 'email'])
    .where('id', '=', collaboratorUserId).executeTakeFirst();
  if (!recipient) return;
  const actorName = user.name ?? 'Someone';
  const verb = kind === 'assignee' ? 'assigned you to' : 'added you as a follower on';
  const title = `${actorName} ${verb} a task`;
  await NotificationService.createNotification({
    tenantId: user.tenant_id, userId: collaboratorUserId, app: 'tasks', type: 'task',
    title, message: task.title, link: '/tasks?view=assigned', entityType: 'task', entityId: task.id,
  }).catch(err => console.error('[Tasks] Failed to notify collaborator:', err.message));
  await MailService.sendNow(user.tenant_id, {
    to: recipient.email, subject: title,
    bodyHtml: `<p>Hi ${recipient.name},</p><p>${actorName} ${verb}: <strong>${task.title}</strong></p>`,
    sourceApp: 'tasks',
  }).catch(err => console.error('[Tasks] Failed to email collaborator:', err.message));
}

type TaskAccessLevel = 'owner' | 'assignee' | 'editor' | 'viewer';

/** Resolves what access (if any) a user has to one task — checked in this
 *  order: owner (full control) > assignee (migration 283, can do the work)
 *  > shared-list editor (migration 284, same as assignee) > shared-list
 *  viewer (read-only) > none. Centralizes the visibility rule every
 *  single-task route needs now that it spans two collaboration mechanisms
 *  instead of one, so they can't drift out of sync with each other. */
async function resolveTaskAccess(
  trx: Transaction<Database>, tenantId: string, userId: string, taskId: string,
): Promise<{ task: Selectable<TasksTable>; access: TaskAccessLevel } | null> {
  const task = await trx.selectFrom('tasks').selectAll()
    .where('id', '=', taskId).where('tenant_id', '=', tenantId).executeTakeFirst();
  if (!task) return null;
  if (task.user_id === userId) return { task, access: 'owner' };
  // Owning the LIST a task lives on grants full authority over that task
  // too, even one someone else created (an editor you shared the list
  // with) — a list owner not being able to see/manage their own list's
  // contents would be a real, confusing gap, the same way a Drive folder
  // owner can manage files others added to it.
  const list = await trx.selectFrom('task_lists').select('user_id')
    .where('id', '=', task.list_id).executeTakeFirst();
  if (list?.user_id === userId) return { task, access: 'owner' };
  if (task.assignee_id === userId) return { task, access: 'assignee' };
  const share = await trx.selectFrom('task_list_shares').select('role')
    .where('list_id', '=', task.list_id).where('user_id', '=', userId).where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (share) return { task, access: share.role === 'editor' ? 'editor' : 'viewer' };
  // Plural collaborator roster (migration 309, tasks.advanced) — being
  // named a co-assignee or follower must actually grant visibility, or
  // adding someone here would silently do nothing (they still couldn't see
  // the task at all). A co-assignee can work on it like the single
  // assignee_id; a follower gets read access, same as a shared-list viewer.
  const collab = await trx.selectFrom('task_collaborators').select('kind')
    .where('task_id', '=', taskId).where('user_id', '=', userId).where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (collab) return { task, access: collab.kind === 'assignee' ? 'assignee' : 'viewer' };
  // Project-member access (migration 308, tasks.advanced) — a task filed
  // under a shared project is visible/workable by that project's members
  // too, same shape as a shared list's editor/viewer split, UNLESS the task
  // is marked is_private (then only owner/assignee, already checked above,
  // can see it — the "Private Task" toggle even within a shared project).
  if (task.project_id && !task.is_private) {
    const membership = await trx.selectFrom('project_members').select('role')
      .where('project_id', '=', task.project_id).where('user_id', '=', userId).where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (membership) return { task, access: membership.role === 'viewer' ? 'viewer' : 'editor' };
  }
  return null;
}

/** Whether this access level can do the work (status/notes/due/tags/etc.) —
 *  everything short of reassigning, moving list, Someday, or deleting,
 *  which stay owner-only. 'viewer' can read but never write. */
function canWorkOn(access: TaskAccessLevel): boolean {
  return access === 'owner' || access === 'assignee' || access === 'editor';
}

export async function tasksRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // ── Lists ──────────────────────────────────────────────────────────────

  fastify.get('/lists', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      let ownRows = await trx.selectFrom('task_lists').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub)
        .orderBy('sort_order', 'asc').execute();
      if (ownRows.length === 0) {
        const inbox = await trx.insertInto('task_lists').values({
          id: crypto.randomUUID(), tenant_id: user.tenant_id, user_id: user.sub,
          name: 'Inbox', color: '#64748b', sort_order: 0,
        }).returningAll().executeTakeFirstOrThrow();
        ownRows = [inbox];
      }
      // Lists a colleague shared with me (migration 284) — not mine to
      // reorder/rename/delete, so returned with role + the real owner's
      // name rather than merged indistinguishably into my own list.
      const sharedRows = await trx.selectFrom('task_list_shares')
        .innerJoin('task_lists', 'task_lists.id', 'task_list_shares.list_id')
        .innerJoin('users as owner_user', 'owner_user.id', 'task_lists.user_id')
        .where('task_list_shares.tenant_id', '=', user.tenant_id).where('task_list_shares.user_id', '=', user.sub)
        .select([
          'task_lists.id', 'task_lists.tenant_id', 'task_lists.user_id', 'task_lists.name', 'task_lists.color',
          'task_lists.sort_order', 'task_lists.created_at',
          'task_list_shares.role', 'owner_user.name as owner_name',
        ])
        .execute();
      const data = [
        ...ownRows.map(r => ({ ...r, shared: false, role: 'owner' as const, owner_name: null })),
        ...sharedRows.map(r => ({ ...r, shared: true })),
      ];
      return { data };
    });
  });

  // ── List sharing ───────────────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/lists/:id/shares', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const list = await trx.selectFrom('task_lists').select('id')
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!list) return reply.status(404).send({ error: 'List not found' });
      const rows = await trx.selectFrom('task_list_shares')
        .innerJoin('users', 'users.id', 'task_list_shares.user_id')
        .select(['task_list_shares.id', 'task_list_shares.user_id', 'task_list_shares.role',
                 'task_list_shares.created_at', 'users.name', 'users.email'])
        .where('task_list_shares.list_id', '=', request.params.id)
        .orderBy('task_list_shares.created_at', 'asc').execute();
      return { data: rows };
    });
  });

  fastify.put<{ Params: { id: string } }>('/lists/:id/shares', async (request, reply) => {
    const user = request.user;
    const body = listShareSchema.parse(request.body);
    if (body.userId === user.sub) return reply.status(400).send({ error: 'You already own this list' });
    return withTenant(user.tenant_id, async (trx) => {
      const list = await trx.selectFrom('task_lists').selectAll()
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!list) return reply.status(404).send({ error: 'List not found' });

      const existing = await trx.selectFrom('task_list_shares').select('id')
        .where('list_id', '=', request.params.id).where('user_id', '=', body.userId).executeTakeFirst();
      const row = existing
        ? await trx.updateTable('task_list_shares').set({ role: body.role })
            .where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow()
        : await trx.insertInto('task_list_shares').values({
            id: crypto.randomUUID(), tenant_id: user.tenant_id, list_id: request.params.id,
            user_id: body.userId, role: body.role, shared_by: user.sub,
          }).returningAll().executeTakeFirstOrThrow();

      // Only notify on a genuinely new share, not a role change on an
      // existing one — repeatedly pinging someone every time their access
      // level is adjusted would train people to ignore the notification.
      if (!existing) {
        const recipient = await trx.selectFrom('users').select(['name', 'email']).where('id', '=', body.userId).executeTakeFirst();
        if (recipient) {
          const actorName = (user as { name?: string }).name ?? 'Someone';
          const title = `${actorName} shared a list with you: "${list.name}"`;
          await NotificationService.createNotification({
            tenantId: user.tenant_id, userId: body.userId, app: 'tasks', type: 'info',
            title, message: `You can now ${body.role === 'editor' ? 'view and work on' : 'view'} tasks on this list.`,
            link: '/tasks',
          }).catch(err => console.error('[Tasks] Failed to notify on list share:', err.message));
          await MailService.sendNow(user.tenant_id, {
            to: recipient.email, subject: title,
            bodyHtml: `<p>Hi ${recipient.name},</p><p>${actorName} shared their "${list.name}" task list with you (${body.role} access).</p>`,
            sourceApp: 'tasks',
          }).catch(err => console.error('[Tasks] Failed to email on list share:', err.message));
        }
      }
      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string; userId: string } }>('/lists/:id/shares/:userId', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const list = await trx.selectFrom('task_lists').select('id')
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!list) return reply.status(404).send({ error: 'List not found' });
      await trx.deleteFrom('task_list_shares')
        .where('list_id', '=', request.params.id).where('user_id', '=', request.params.userId).execute();
      reply.status(204);
      return null;
    });
  });

  fastify.post('/lists', async (request, reply) => {
    const user = request.user;
    const body = listCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.insertInto('task_lists').values({
        id: body.id, tenant_id: user.tenant_id, user_id: user.sub,
        name: body.name.trim(), color: body.color || DEFAULT_LIST_COLOR, sort_order: 0,
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return { data: row };
    });
  });

  fastify.patch<{ Params: { id: string } }>('/lists/:id', async (request, reply) => {
    const user = request.user;
    const body = listPatchSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.color !== undefined) updates.color = body.color;
      if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
      const row = await trx.updateTable('task_lists').set(updates)
        .where('id', '=', request.params.id).where('user_id', '=', user.sub)
        .returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'List not found' });
      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string } }>('/lists/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const lists = await trx.selectFrom('task_lists').select('id')
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub)
        .orderBy('sort_order', 'asc').execute();
      const inbox = lists[0];
      if (!inbox || inbox.id === request.params.id) {
        // Never delete the last remaining list.
        return reply.status(400).send({ error: 'Cannot delete your only list' });
      }
      await trx.updateTable('tasks').set({ list_id: inbox.id })
        .where('list_id', '=', request.params.id).where('user_id', '=', user.sub).execute();
      await trx.deleteFrom('task_lists').where('id', '=', request.params.id).where('user_id', '=', user.sub).execute();
      reply.status(204);
      return null;
    });
  });

  // ── Tasks ──────────────────────────────────────────────────────────────

  fastify.get('/items', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const sharedListRows = await trx.selectFrom('task_list_shares').select(['list_id', 'role'])
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).execute();
      const sharedRoleByListId = new Map(sharedListRows.map(r => [r.list_id, r.role]));
      const sharedListIds = [...sharedRoleByListId.keys()];
      // Projects (migration 308, tasks.advanced) a HuduPlus+ user belongs to
      // — grants visibility into that project's non-private tasks the same
      // way sharedListIds does for shared lists. Empty for every tenant that
      // hasn't touched Projects yet, so this is a no-op until M8's frontend
      // actually creates any.
      const memberProjectRows = await trx.selectFrom('project_members').select(['project_id', 'role'])
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).execute();
      const memberRoleByProjectId = new Map(memberProjectRows.map(r => [r.project_id, r.role]));
      const memberProjectIds = [...memberRoleByProjectId.keys()];
      // Plural collaborator roster (migration 309, tasks.advanced) — a task
      // this user was added to as a co-assignee/follower but doesn't own,
      // isn't the single assignee_id on, and has no list/project access to.
      const collabRows = await trx.selectFrom('task_collaborators').select(['task_id', 'kind'])
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).execute();
      const collabKindByTaskId = new Map(collabRows.map(r => [r.task_id, r.kind]));
      const collabTaskIds = [...collabKindByTaskId.keys()];

      // Visible to: the task's owner, its assignee (migration 283), anyone
      // who owns the LIST it's filed on (even a task someone else created —
      // a list owner has full authority over their own list's contents,
      // same as a Drive folder owner over files others added to it), or
      // anyone the list has been shared with (migration 284). task_lists/
      // users are LEFT JOINed (not just the task owner's own) so a viewer
      // who owns neither still gets a real list name/color and assignee
      // display name to render, not just ids.
      const [taskRows, subtaskRows, timeEntryRows] = await Promise.all([
        trx.selectFrom('tasks')
          .leftJoin('users as owner_user', 'owner_user.id', 'tasks.user_id')
          .leftJoin('users as assignee_user', 'assignee_user.id', 'tasks.assignee_id')
          .leftJoin('task_lists', 'task_lists.id', 'tasks.list_id')
          .where('tasks.tenant_id', '=', user.tenant_id)
          .where(eb => {
            const conds = [eb('tasks.user_id', '=', user.sub), eb('tasks.assignee_id', '=', user.sub), eb('task_lists.user_id', '=', user.sub)];
            if (sharedListIds.length) conds.push(eb('tasks.list_id', 'in', sharedListIds));
            if (memberProjectIds.length) conds.push(eb.and([eb('tasks.project_id', 'in', memberProjectIds), eb('tasks.is_private', '=', false)]));
            if (collabTaskIds.length) conds.push(eb('tasks.id', 'in', collabTaskIds));
            return eb.or(conds);
          })
          .select([
            'tasks.id', 'tasks.tenant_id', 'tasks.user_id', 'tasks.list_id', 'tasks.title', 'tasks.notes',
            'tasks.due', 'tasks.due_time', 'tasks.start_date', 'tasks.recurrence_rule', 'tasks.recurrence_next_due', 'tasks.starred', 'tasks.someday', 'tasks.status', 'tasks.priority', 'tasks.tags',
            'tasks.completed', 'tasks.completed_at', 'tasks.deleted_at', 'tasks.sort_order',
            'tasks.assignee_id', 'tasks.created_at', 'tasks.updated_at',
            'tasks.project_id', 'tasks.milestone_id', 'tasks.is_private', 'tasks.is_billable', 'tasks.hourly_rate',
            'tasks.subject_type', 'tasks.subject_id',
            'owner_user.name as owner_name',
            'assignee_user.name as assignee_name', 'assignee_user.avatar_url as assignee_avatar_url',
            'task_lists.name as list_name', 'task_lists.color as list_color', 'task_lists.user_id as list_owner_id',
          ])
          .orderBy('tasks.sort_order', 'asc').execute(),
        trx.selectFrom('task_subtasks')
          .innerJoin('tasks', 'tasks.id', 'task_subtasks.task_id')
          .leftJoin('task_lists', 'task_lists.id', 'tasks.list_id')
          .where('tasks.tenant_id', '=', user.tenant_id)
          .where(eb => {
            const conds = [eb('tasks.user_id', '=', user.sub), eb('tasks.assignee_id', '=', user.sub), eb('task_lists.user_id', '=', user.sub)];
            if (sharedListIds.length) conds.push(eb('tasks.list_id', 'in', sharedListIds));
            if (memberProjectIds.length) conds.push(eb.and([eb('tasks.project_id', 'in', memberProjectIds), eb('tasks.is_private', '=', false)]));
            if (collabTaskIds.length) conds.push(eb('tasks.id', 'in', collabTaskIds));
            return eb.or(conds);
          })
          .selectAll('task_subtasks')
          .orderBy('task_subtasks.sort_order', 'asc').execute(),
        trx.selectFrom('task_time_entries')
          .innerJoin('tasks', 'tasks.id', 'task_time_entries.task_id')
          .leftJoin('task_lists', 'task_lists.id', 'tasks.list_id')
          .where('tasks.tenant_id', '=', user.tenant_id)
          .where(eb => {
            const conds = [eb('tasks.user_id', '=', user.sub), eb('tasks.assignee_id', '=', user.sub), eb('task_lists.user_id', '=', user.sub)];
            if (sharedListIds.length) conds.push(eb('tasks.list_id', 'in', sharedListIds));
            if (memberProjectIds.length) conds.push(eb.and([eb('tasks.project_id', 'in', memberProjectIds), eb('tasks.is_private', '=', false)]));
            if (collabTaskIds.length) conds.push(eb('tasks.id', 'in', collabTaskIds));
            return eb.or(conds);
          })
          .select(['task_time_entries.task_id', 'task_time_entries.user_id', 'task_time_entries.started_at', 'task_time_entries.ended_at', 'task_time_entries.duration_minutes'])
          .execute(),
      ]);
      const subsByTask = new Map<string, typeof subtaskRows>();
      for (const s of subtaskRows) {
        if (!subsByTask.has(s.task_id)) subsByTask.set(s.task_id, []);
        subsByTask.get(s.task_id)!.push(s);
      }
      // Task dependencies (migration 319) are visualization-only for v1 — a
      // small "blocked by N open task(s)" count on the card/row, not an
      // enforcement. Only counts unfinished blockers so a task with every
      // dependency already completed shows clean.
      const blockedByOpenCount = new Map<string, number>();
      if (taskRows.length) {
        const depRows = await trx.selectFrom('task_dependencies')
          .innerJoin('tasks as blocker', 'blocker.id', 'task_dependencies.depends_on_task_id')
          .where('task_dependencies.tenant_id', '=', user.tenant_id)
          .where('task_dependencies.task_id', 'in', taskRows.map(t => t.id))
          .where('blocker.completed', '=', false)
          .select(['task_dependencies.task_id'])
          .execute();
        for (const d of depRows) blockedByOpenCount.set(d.task_id, (blockedByOpenCount.get(d.task_id) || 0) + 1);
      }
      // Total logged minutes = every closed entry, from anyone (a shared
      // task's time is a team total); the current user's own open entry (if
      // any) is surfaced separately so the frontend timer can resume across
      // a reload instead of losing its start time — see M2's fix for the
      // old client-only timerStartedAt, which never persisted at all.
      const loggedMinutesByTask = new Map<string, number>();
      const openTimerStartByTask = new Map<string, Date>();
      for (const e of timeEntryRows) {
        if (e.ended_at) {
          loggedMinutesByTask.set(e.task_id, (loggedMinutesByTask.get(e.task_id) || 0) + (e.duration_minutes || 0));
        } else if (e.user_id === user.sub) {
          openTimerStartByTask.set(e.task_id, e.started_at);
        }
      }
      const data = taskRows.map(t => {
        const isOwner = t.user_id === user.sub || t.list_owner_id === user.sub;
        const isAssignee = !isOwner && (t.assignee_id === user.sub || collabKindByTaskId.get(t.id) === 'assignee');
        const sharedRole = sharedRoleByListId.get(t.list_id);
        const projectRole = t.project_id ? memberRoleByProjectId.get(t.project_id) : undefined;
        const access: TaskAccessLevel = isOwner ? 'owner' : isAssignee ? 'assignee'
          : sharedRole === 'editor' || (projectRole && projectRole !== 'viewer') ? 'editor'
          : 'viewer';
        return {
          ...t, subtasks: subsByTask.get(t.id) || [], is_owner: isOwner, access,
          time_logged_minutes: loggedMinutesByTask.get(t.id) || 0,
          timer_started_at: openTimerStartByTask.get(t.id) || null,
          blocked_by_open_count: blockedByOpenCount.get(t.id) || 0,
        };
      });
      return { data };
    });
  });

  fastify.post('/items', async (request, reply) => {
    const user = request.user;
    const body = taskCreateSchema.parse(request.body);
    // Recurring tasks (M18) are a Projects/HuduPlus-tier capability layered
    // onto the shared `tasks` table, same as dependencies/collaborators/
    // activity above — those get a route-level requireEntitlement hook,
    // but recurrenceRule is a field on this general, ungated create route,
    // so the check has to be inline rather than on the whole route.
    if (body.recurrenceRule && !(await tenantHasEntitlement(user.tenant_id, 'projects'))) {
      return reply.status(403).send({ error: 'Your current plan does not include this feature.', code: 'PLAN_UPGRADE_REQUIRED' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      const list = await trx.selectFrom('task_lists').select(['id', 'user_id'])
        .where('id', '=', body.listId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!list) return reply.status(404).send({ error: 'List not found' });
      if (list.user_id !== user.sub) {
        // Adding a task to someone else's list only works if it's been
        // shared with editor access — the creator still owns the task
        // itself (list sharing gives you a workspace, not ownership of
        // what you add to it); a viewer can look but not add.
        const share = await trx.selectFrom('task_list_shares').select('role')
          .where('list_id', '=', body.listId).where('user_id', '=', user.sub).executeTakeFirst();
        if (!share || share.role !== 'editor') {
          return reply.status(403).send({ error: 'You do not have permission to add tasks to this list' });
        }
      }

      if (body.projectId) {
        const projectAccess = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, body.projectId);
        if (!projectAccess) return reply.status(404).send({ error: 'Project not found' });
        if (!canEditProject(projectAccess.access)) return reply.status(403).send({ error: 'You only have view access to this project' });
      }

      const siblingCount = await trx.selectFrom('tasks').select(({ fn }) => fn.countAll<number>().as('count'))
        .where('list_id', '=', body.listId).where('deleted_at', 'is', null).executeTakeFirst();
      const row = await trx.insertInto('tasks').values({
        id: body.id, tenant_id: user.tenant_id, user_id: user.sub, list_id: body.listId,
        title: body.title.trim(), notes: body.notes || null, due: body.due || null,
        due_time: body.dueTime || null, start_date: body.startDate || null,
        starred: body.starred ?? false, someday: body.someday ?? false, status: body.status || 'none',
        priority: body.priority || 'medium',
        tags: JSON.stringify(body.tags ?? []) as unknown as string[],
        assignee_id: body.assigneeId || null,
        reminder_at: body.reminderAt || null,
        project_id: body.projectId || null, milestone_id: body.milestoneId || null,
        is_private: body.isPrivate ?? false,
        is_billable: body.isBillable ?? false, hourly_rate: body.hourlyRate != null ? String(body.hourlyRate) : null,
        subject_type: body.subjectType || null, subject_id: body.subjectId || null,
        sort_order: Number(siblingCount?.count ?? 0),
        recurrence_rule: body.recurrenceRule ? JSON.stringify(body.recurrenceRule) as unknown as Record<string, unknown> : null,
        recurrence_next_due: body.recurrenceRule ? (body.due || new Date().toISOString().slice(0, 10)) : null,
      }).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('task_activity_log').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, task_id: row.id, actor_id: user.sub,
        action: 'created', detail: JSON.stringify({ title: row.title }) as unknown as Record<string, unknown>,
      }).execute();
      if (body.assigneeId) await handleAssigneeChange(trx, user, row, body.assigneeId);
      reply.status(201);
      return { data: { ...row, subtasks: [], is_owner: true, access: 'owner' as const } };
    });
  });

  fastify.patch<{ Params: { id: string } }>('/items/:id', async (request, reply) => {
    const user = request.user;
    const body = taskPatchSchema.parse(request.body);
    // Same inline gate as POST /items above — only enforced when actually
    // turning recurrence on; clearing it (recurrenceRule: null) needs no
    // entitlement, same as removing any other Projects-tier field.
    if (body.recurrenceRule && !(await tenantHasEntitlement(user.tenant_id, 'projects'))) {
      return reply.status(403).send({ error: 'Your current plan does not include this feature.', code: 'PLAN_UPGRADE_REQUIRED' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Task not found' });
      const { task: existing, access } = resolved;
      const isOwner = access === 'owner';
      if (!canWorkOn(access)) return reply.status(403).send({ error: 'You only have view access to this task' });

      // Reassigning, moving list, Someday, and delete/restore are
      // organizational calls about whose task this is and where it lives —
      // owner-only. An assignee or shared-list editor gets everything
      // needed to actually do the work: title, notes, due date/time,
      // status, tags, starring.
      if (!isOwner && (
        body.listId !== undefined || body.someday !== undefined ||
        body.deletedAt !== undefined || body.assigneeId !== undefined ||
        body.projectId !== undefined || body.milestoneId !== undefined || body.isPrivate !== undefined
      )) {
        return reply.status(403).send({ error: 'Only the task owner can reassign, move, or delete this task' });
      }
      if (body.projectId) {
        const projectAccess = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, body.projectId);
        if (!projectAccess) return reply.status(404).send({ error: 'Project not found' });
        if (!canEditProject(projectAccess.access)) return reply.status(403).send({ error: 'You only have view access to this project' });
      }

      // Dependency hard-block — a task cannot be marked complete while it
      // still depends on an incomplete one. Real enforcement (M4 originally
      // shipped this as visualization-only); checked here, in the one place
      // every completion path funnels through, not duplicated per-caller.
      const completingNow = (body.completed === true && !existing.completed)
        || (body.status === 'completed' && existing.status !== 'completed');
      if (completingNow) {
        const openBlockers = await trx.selectFrom('task_dependencies')
          .innerJoin('tasks as blocker', 'blocker.id', 'task_dependencies.depends_on_task_id')
          .where('task_dependencies.task_id', '=', request.params.id)
          .where('task_dependencies.tenant_id', '=', user.tenant_id)
          .where('blocker.completed', '=', false)
          .select(['blocker.title'])
          .execute();
        if (openBlockers.length > 0) {
          const names = openBlockers.map(b => `"${b.title}"`).join(', ');
          return reply.status(400).send({
            error: `Can't complete this task — it's still blocked by ${openBlockers.length} open dependenc${openBlockers.length === 1 ? 'y' : 'ies'}: ${names}`,
            code: 'BLOCKED_BY_DEPENDENCY',
          });
        }
      }

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.title !== undefined) updates.title = body.title.trim();
      if (body.notes !== undefined) updates.notes = body.notes;
      if (body.due !== undefined) updates.due = body.due || null;
      if (body.dueTime !== undefined) updates.due_time = body.dueTime || null;
      if (body.startDate !== undefined) updates.start_date = body.startDate || null;
      if (body.starred !== undefined) updates.starred = body.starred;
      if (body.someday !== undefined) updates.someday = body.someday;
      if (body.status !== undefined) updates.status = body.status;
      if (body.priority !== undefined) updates.priority = body.priority;
      if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags);
      if (body.listId !== undefined) updates.list_id = body.listId;
      if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;
      if (body.completed !== undefined) {
        updates.completed = body.completed;
        updates.completed_at = body.completed ? new Date() : null;
      }
      if (body.deletedAt !== undefined) updates.deleted_at = body.deletedAt || null;
      if (body.assigneeId !== undefined) updates.assignee_id = body.assigneeId;
      if (body.recurrenceRule !== undefined) {
        updates.recurrence_rule = body.recurrenceRule ? JSON.stringify(body.recurrenceRule) : null;
        // Turning recurrence on seeds next_due from the task's own due date
        // (falling back to today); turning it off clears next_due too, so a
        // toggled-off task can't be picked up by a stale value later.
        updates.recurrence_next_due = body.recurrenceRule
          ? (body.due ?? existing.due ?? new Date().toISOString().slice(0, 10))
          : null;
      }
      if (body.projectId !== undefined) updates.project_id = body.projectId;
      if (body.milestoneId !== undefined) updates.milestone_id = body.milestoneId;
      if (body.isPrivate !== undefined) updates.is_private = body.isPrivate;
      if (body.isBillable !== undefined) updates.is_billable = body.isBillable;
      if (body.hourlyRate !== undefined) updates.hourly_rate = body.hourlyRate != null ? String(body.hourlyRate) : null;
      if (body.subjectType !== undefined) updates.subject_type = body.subjectType;
      if (body.subjectId !== undefined) updates.subject_id = body.subjectId;
      if (body.reminderAt !== undefined) {
        updates.reminder_at = body.reminderAt || null;
        // Changing (or clearing) the reminder re-arms it — same reasoning as
        // notes.service.ts: otherwise pushing a fired reminder later would
        // never fire again, since it was already marked notified.
        updates.reminder_notified_at = null;
      }

      const row = await trx.updateTable('tasks').set(updates)
        .where('id', '=', request.params.id)
        .returningAll().executeTakeFirstOrThrow();

      if (body.assigneeId !== undefined && body.assigneeId !== existing.assignee_id) {
        await handleAssigneeChange(trx, user, row, body.assigneeId);
      }
      if (body.completed === true && !existing.completed) {
        await emitDomainEvent(trx, user.tenant_id, {
          type: 'todo.completed', sourceApp: 'tasks', entityType: 'task', entityId: row.id,
          payload: { title: row.title }, actorId: user.sub,
        });
      }

      // Real activity feed (migration 310, tasks.advanced) — only the
      // changes worth showing in a timeline, not every field PATCH (a due
      // date tweak or a notes edit doesn't need its own row the way a
      // status/priority/assignment/project move does).
      const activityEntries: { action: string; detail: Record<string, unknown> }[] = [];
      if (body.status !== undefined && body.status !== existing.status) {
        activityEntries.push({ action: 'status_changed', detail: { from: existing.status, to: body.status } });
      }
      if (body.priority !== undefined && body.priority !== existing.priority) {
        activityEntries.push({ action: 'priority_changed', detail: { from: existing.priority, to: body.priority } });
      }
      if (body.assigneeId !== undefined && body.assigneeId !== existing.assignee_id) {
        activityEntries.push({ action: 'assigned', detail: { assigneeId: body.assigneeId } });
      }
      if (body.completed === true && !existing.completed) {
        activityEntries.push({ action: 'completed', detail: {} });
      }
      if (body.projectId !== undefined && body.projectId !== existing.project_id) {
        activityEntries.push({ action: 'moved_project', detail: { projectId: body.projectId } });
      }
      if (activityEntries.length) {
        await trx.insertInto('task_activity_log').values(activityEntries.map(e => ({
          id: crypto.randomUUID(), tenant_id: user.tenant_id, task_id: row.id, actor_id: user.sub,
          action: e.action, detail: JSON.stringify(e.detail) as unknown as Record<string, unknown>,
        }))).execute();
      }

      return { data: { ...row, is_owner: isOwner, access } };
    });
  });

  fastify.delete<{ Params: { id: string } }>('/items/:id', async (request, reply) => {
    const user = request.user;
    const permanent = (request.query as any).permanent === 'true';
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved) { reply.status(204); return null; }
      if (resolved.access !== 'owner') {
        return reply.status(403).send({ error: 'Only the task owner or list owner can delete this task' });
      }
      if (permanent) {
        await trx.deleteFrom('tasks').where('id', '=', request.params.id).execute();
      } else {
        await trx.updateTable('tasks').set({ deleted_at: new Date().toISOString() })
          .where('id', '=', request.params.id).execute();
      }
      reply.status(204);
      return null;
    });
  });

  const cloneTaskSchema = z.object({ id: uuidSchema });

  fastify.post<{ Params: { id: string } }>('/items/:id/clone', async (request, reply) => {
    const user = request.user;
    const body = cloneTaskSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Task not found' });
      const src = resolved.task;
      // A clone is a fresh copy of the work itself — title/notes/schedule/
      // tags/priority/checklist carry over, but not who it's assigned to,
      // whether it's done, or its reminder (avoid double-pinging someone for
      // a task that didn't really just get created for them).
      const siblingCount = await trx.selectFrom('tasks').select(({ fn }) => fn.countAll<number>().as('count'))
        .where('list_id', '=', src.list_id).where('deleted_at', 'is', null).executeTakeFirst();
      const row = await trx.insertInto('tasks').values({
        id: body.id, tenant_id: user.tenant_id, user_id: user.sub, list_id: src.list_id,
        title: `${src.title} (copy)`, notes: src.notes, due: src.due, due_time: src.due_time,
        starred: false, someday: src.someday, status: 'none', priority: src.priority,
        // Must be JSON.stringify'd, not passed as a native array — pg
        // serializes an unstringified JS array param using Postgres ARRAY
        // literal syntax ('{}' for empty), which is valid JSON for an
        // *object*, not an array; the column would silently end up holding
        // {} instead of [] otherwise (caught live, not hypothetical).
        tags: JSON.stringify(src.tags ?? []) as unknown as string[],
        sort_order: Number(siblingCount?.count ?? 0),
      }).returningAll().executeTakeFirstOrThrow();

      const subtasks = await trx.selectFrom('task_subtasks').selectAll()
        .where('task_id', '=', src.id).orderBy('sort_order', 'asc').execute();
      let clonedSubtasks: typeof subtasks = [];
      if (subtasks.length) {
        clonedSubtasks = await trx.insertInto('task_subtasks')
          .values(subtasks.map(s => ({
            id: crypto.randomUUID(), tenant_id: user.tenant_id, task_id: row.id,
            title: s.title, completed: false, sort_order: s.sort_order,
          })))
          .returningAll().execute();
      }

      reply.status(201);
      return { data: { ...row, subtasks: clonedSubtasks, is_owner: true, access: 'owner' as const, time_logged_minutes: 0, timer_started_at: null } };
    });
  });

  // ── Time tracking ──────────────────────────────────────────────────────
  // Real start/stop persistence (migration 307) for the timer widget, which
  // previously ran on client-only state that reset every reload.

  fastify.post<{ Params: { id: string } }>('/items/:id/timer/start', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved || !canWorkOn(resolved.access)) return reply.status(404).send({ error: 'Task not found' });
      const existingOpen = await trx.selectFrom('task_time_entries').select('id')
        .where('task_id', '=', request.params.id).where('user_id', '=', user.sub).where('ended_at', 'is', null)
        .executeTakeFirst();
      if (existingOpen) return reply.status(409).send({ error: 'Timer already running for this task' });
      const row = await trx.insertInto('task_time_entries').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, task_id: request.params.id,
        user_id: user.sub, started_at: new Date().toISOString(),
      }).returningAll().executeTakeFirstOrThrow();
      return { data: row };
    });
  });

  fastify.post<{ Params: { id: string } }>('/items/:id/timer/stop', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved || !canWorkOn(resolved.access)) return reply.status(404).send({ error: 'Task not found' });
      const open = await trx.selectFrom('task_time_entries').selectAll()
        .where('task_id', '=', request.params.id).where('user_id', '=', user.sub).where('ended_at', 'is', null)
        .executeTakeFirst();
      if (!open) return reply.status(404).send({ error: 'No timer running for this task' });
      const endedAt = new Date();
      const durationMinutes = Math.max(1, Math.round((endedAt.getTime() - new Date(open.started_at).getTime()) / 60000));
      const row = await trx.updateTable('task_time_entries')
        .set({ ended_at: endedAt.toISOString(), duration_minutes: durationMinutes })
        .where('id', '=', open.id).returningAll().executeTakeFirstOrThrow();
      const totalRow = await trx.selectFrom('task_time_entries')
        .select(({ fn }) => fn.sum<number>('duration_minutes').as('total'))
        .where('task_id', '=', request.params.id).where('ended_at', 'is not', null)
        .executeTakeFirst();
      return { data: { ...row, task_total_minutes: Number(totalRow?.total ?? 0) } };
    });
  });

  // ── Subtasks ───────────────────────────────────────────────────────────

  fastify.post<{ Params: { id: string } }>('/items/:id/subtasks', async (request, reply) => {
    const user = request.user;
    const body = subtaskCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved || !canWorkOn(resolved.access)) return reply.status(404).send({ error: 'Task not found' });
      const row = await trx.insertInto('task_subtasks').values({
        id: body.id, tenant_id: user.tenant_id, task_id: request.params.id, title: body.title.trim(),
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return { data: row };
    });
  });

  fastify.patch<{ Params: { id: string; subId: string } }>('/items/:id/subtasks/:subId', async (request, reply) => {
    const user = request.user;
    const body = subtaskPatchSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved || !canWorkOn(resolved.access)) return reply.status(404).send({ error: 'Task not found' });
      const updates: Record<string, unknown> = {};
      if (body.title !== undefined) updates.title = body.title.trim();
      if (body.completed !== undefined) updates.completed = body.completed;
      const row = await trx.updateTable('task_subtasks').set(updates)
        .where('id', '=', request.params.subId).where('task_id', '=', request.params.id)
        .returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Subtask not found' });
      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string; subId: string } }>('/items/:id/subtasks/:subId', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      // Previously deleted with no ownership/tenant check at all beyond a
      // valid session — a real gap, closed here as part of the same
      // visibility rework rather than left for later since it's the exact
      // same lookup this route now needs anyway.
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved || !canWorkOn(resolved.access)) return reply.status(404).send({ error: 'Task not found' });
      await trx.deleteFrom('task_subtasks').where('id', '=', request.params.subId).where('task_id', '=', request.params.id).execute();
      return { success: true };
    });
  });

  // ── Comments ───────────────────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/items/:id/comments', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      // Reading is allowed at any access level including 'viewer' —
      // seeing a task you were given visibility into means seeing its
      // whole discussion, not just its fields.
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Task not found' });
      const rows = await trx.selectFrom('todo_comments')
        .innerJoin('users', 'users.id', 'todo_comments.author_id')
        .select([
          'todo_comments.id', 'todo_comments.content', 'todo_comments.mentions', 'todo_comments.created_at',
          'todo_comments.author_id', 'users.name as author_name',
        ])
        .where('todo_comments.task_id', '=', request.params.id)
        .orderBy('todo_comments.created_at', 'asc').execute();
      return { data: rows };
    });
  });

  fastify.post<{ Params: { id: string } }>('/items/:id/comments', async (request, reply) => {
    const user = request.user;
    const body = commentCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved || !canWorkOn(resolved.access)) return reply.status(404).send({ error: 'Task not found' });
      const task = resolved.task;

      const row = await trx.insertInto('todo_comments').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, task_id: request.params.id,
        author_id: user.sub, content: body.content.trim(),
        mentions: JSON.stringify(body.mentions ?? []) as unknown as { user_id: string; name: string }[],
      }).returningAll().executeTakeFirstOrThrow();

      await emitDomainEvent(trx, user.tenant_id, {
        type: 'todo.commented', sourceApp: 'tasks', entityType: 'task', entityId: task.id,
        payload: { preview: body.content.trim().slice(0, 140) }, actorId: user.sub,
      });
      await trx.insertInto('task_activity_log').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, task_id: task.id, actor_id: user.sub,
        action: 'commented', detail: JSON.stringify({ preview: body.content.trim().slice(0, 140) }) as unknown as Record<string, unknown>,
      }).execute();

      // The other party on this task (owner and/or assignee, whichever
      // isn't the commenter) plus anyone @mentioned — same "the person on
      // the other end should know" reasoning assignment already follows.
      const notifyIds = new Set<string>((body.mentions ?? []).map(m => m.user_id));
      if (task.user_id !== user.sub) notifyIds.add(task.user_id);
      if (task.assignee_id && task.assignee_id !== user.sub) notifyIds.add(task.assignee_id);
      notifyIds.delete(user.sub);

      const actorName = (user as { name?: string }).name ?? 'Someone';
      for (const uid of notifyIds) {
        const recipient = await trx.selectFrom('users').select(['name', 'email']).where('id', '=', uid).executeTakeFirst();
        if (!recipient) continue;
        const title = `${actorName} commented on "${task.title}"`;
        await NotificationService.createNotification({
          tenantId: user.tenant_id, userId: uid, app: 'tasks', type: 'mention',
          title, message: body.content.trim(), link: '/tasks?view=assigned', entityType: 'task', entityId: task.id,
        }).catch(err => console.error('[Tasks] Failed to notify on comment:', err.message));
        await MailService.sendNow(user.tenant_id, {
          to: recipient.email, subject: title,
          bodyHtml: `<p>Hi ${recipient.name},</p><p>${actorName} commented on <strong>${task.title}</strong>:</p><p>${body.content.trim()}</p>`,
          sourceApp: 'tasks',
        }).catch(err => console.error('[Tasks] Failed to email on comment:', err.message));
      }

      reply.status(201);
      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string; commentId: string } }>('/items/:id/comments/:commentId', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const comment = await trx.selectFrom('todo_comments').select(['id', 'author_id'])
        .where('id', '=', request.params.commentId).where('task_id', '=', request.params.id)
        .where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!comment) return reply.status(404).send({ error: 'Comment not found' });
      const task = await trx.selectFrom('tasks').select(['user_id']).where('id', '=', request.params.id).executeTakeFirst();
      if (comment.author_id !== user.sub && task?.user_id !== user.sub) {
        return reply.status(403).send({ error: 'Only the comment author or task owner can delete this comment' });
      }
      await trx.deleteFrom('todo_comments').where('id', '=', request.params.commentId).execute();
      reply.status(204);
      return null;
    });
  });

  // ── Collaborators ('projects' entitlement, formerly tasks.advanced) ────
  // Plural Assignees/Followers on top of the single tasks.assignee_id —
  // migration 309.

  fastify.get<{ Params: { id: string } }>('/items/:id/collaborators', { preHandler: requireEntitlement('projects') }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Task not found' });
      const rows = await trx.selectFrom('task_collaborators')
        .innerJoin('users', 'users.id', 'task_collaborators.user_id')
        .where('task_collaborators.task_id', '=', request.params.id)
        .select(['task_collaborators.id', 'task_collaborators.user_id', 'task_collaborators.kind', 'task_collaborators.added_at',
          'users.name', 'users.email', 'users.avatar_url'])
        .orderBy('task_collaborators.added_at', 'asc').execute();
      return { data: rows };
    });
  });

  fastify.post<{ Params: { id: string } }>('/items/:id/collaborators', { preHandler: requireEntitlement('projects') }, async (request, reply) => {
    const user = request.user;
    const body = collaboratorAddSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved || !canWorkOn(resolved.access)) return reply.status(404).send({ error: 'Task not found' });
      const target = await trx.selectFrom('users').select('id')
        .where('id', '=', body.userId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!target) return reply.status(404).send({ error: 'User not found' });
      const row = await trx.insertInto('task_collaborators').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, task_id: request.params.id,
        user_id: body.userId, kind: body.kind,
      })
      .onConflict(oc => oc.columns(['task_id', 'user_id', 'kind']).doNothing())
      .returningAll().executeTakeFirst();
      if (row) await notifyCollaboratorAdded(trx, user, resolved.task, body.userId, body.kind);
      reply.status(201);
      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string; collabId: string } }>('/items/:id/collaborators/:collabId', { preHandler: requireEntitlement('projects') }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Task not found' });
      const collab = await trx.selectFrom('task_collaborators').select('user_id')
        .where('id', '=', request.params.collabId).where('task_id', '=', request.params.id).executeTakeFirst();
      if (!collab) { reply.status(204); return null; }
      // Removing someone else needs work access; anyone can remove themselves
      // (unfollow / step back from a task they were added to).
      if (collab.user_id !== user.sub && !canWorkOn(resolved.access)) {
        return reply.status(403).send({ error: 'You do not have permission to remove this collaborator' });
      }
      await trx.deleteFrom('task_collaborators').where('id', '=', request.params.collabId).execute();
      reply.status(204);
      return null;
    });
  });

  // ── Dependencies (migration 319, 'projects' entitlement) — visualization
  // only for v1: a dependency does not block completing the blocking task.

  fastify.get<{ Params: { id: string } }>('/items/:id/dependencies', { preHandler: requireEntitlement('projects') }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Task not found' });
      const [blockedBy, blocks] = await Promise.all([
        trx.selectFrom('task_dependencies')
          .innerJoin('tasks', 'tasks.id', 'task_dependencies.depends_on_task_id')
          .where('task_dependencies.task_id', '=', request.params.id).where('task_dependencies.tenant_id', '=', user.tenant_id)
          .select(['task_dependencies.id', 'tasks.id as task_id', 'tasks.title', 'tasks.status', 'tasks.completed', 'tasks.due'])
          .execute(),
        trx.selectFrom('task_dependencies')
          .innerJoin('tasks', 'tasks.id', 'task_dependencies.task_id')
          .where('task_dependencies.depends_on_task_id', '=', request.params.id).where('task_dependencies.tenant_id', '=', user.tenant_id)
          .select(['task_dependencies.id', 'tasks.id as task_id', 'tasks.title', 'tasks.status', 'tasks.completed', 'tasks.due'])
          .execute(),
      ]);
      return { data: { blockedBy, blocks } };
    });
  });

  fastify.post<{ Params: { id: string } }>('/items/:id/dependencies', { preHandler: requireEntitlement('projects') }, async (request, reply) => {
    const user = request.user;
    const body = dependencyAddSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved || !canWorkOn(resolved.access)) return reply.status(404).send({ error: 'Task not found' });
      if (body.dependsOnTaskId === request.params.id) return reply.status(400).send({ error: 'A task cannot depend on itself' });
      const target = await trx.selectFrom('tasks').select('id')
        .where('id', '=', body.dependsOnTaskId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!target) return reply.status(404).send({ error: 'Task not found' });
      // Full N-node cycle detection (not just the direct 2-node reversal
      // this originally shipped with) — a recursive CTE walks every task
      // the proposed blocker (dependsOnTaskId) already transitively depends
      // on; if this task shows up anywhere in that chain, adding the new
      // edge would close a loop (A→B→C→A), which would hang the Gantt's
      // connector rendering and make "blocked by" meaningless.
      const cycleCheck = await sql<{ reached: string }>`
        WITH RECURSIVE chain AS (
          SELECT depends_on_task_id AS reached FROM task_dependencies
          WHERE task_id = ${body.dependsOnTaskId} AND tenant_id = ${user.tenant_id}
          UNION
          SELECT td.depends_on_task_id FROM task_dependencies td
          INNER JOIN chain c ON td.task_id = c.reached
          WHERE td.tenant_id = ${user.tenant_id}
        )
        SELECT reached FROM chain WHERE reached = ${request.params.id} LIMIT 1
      `.execute(trx);
      if (cycleCheck.rows.length > 0) {
        return reply.status(400).send({ error: 'That would create a dependency cycle' });
      }
      const row = await trx.insertInto('task_dependencies').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, task_id: request.params.id,
        depends_on_task_id: body.dependsOnTaskId,
      })
      .onConflict(oc => oc.columns(['task_id', 'depends_on_task_id']).doNothing())
      .returningAll().executeTakeFirst();
      reply.status(201);
      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string; depId: string } }>('/items/:id/dependencies/:depId', { preHandler: requireEntitlement('projects') }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved || !canWorkOn(resolved.access)) return reply.status(404).send({ error: 'Task not found' });
      await trx.deleteFrom('task_dependencies')
        .where('id', '=', request.params.depId).where('task_id', '=', request.params.id).where('tenant_id', '=', user.tenant_id)
        .execute();
      reply.status(204);
      return null;
    });
  });

  // ── Activity log ('projects' entitlement, formerly tasks.advanced) ─────

  fastify.get<{ Params: { id: string } }>('/items/:id/activity', { preHandler: requireEntitlement('projects') }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveTaskAccess(trx, user.tenant_id, user.sub, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Task not found' });
      const rows = await trx.selectFrom('task_activity_log')
        .innerJoin('users', 'users.id', 'task_activity_log.actor_id')
        .where('task_activity_log.task_id', '=', request.params.id)
        .select(['task_activity_log.id', 'task_activity_log.action', 'task_activity_log.detail',
          'task_activity_log.created_at', 'task_activity_log.actor_id', 'users.name as actor_name'])
        .orderBy('task_activity_log.created_at', 'desc').execute();
      return { data: rows };
    });
  });

  // ── Calendar events ────────────────────────────────────────────────────
  // Recurrence is expanded server-side (calendar-events.service.ts) — every
  // row GET /events returns is one rendered occurrence, not one master row,
  // so the frontend never needs its own copy of the recurrence math.

  /** Defaults to a 1-year-back/2-years-forward window when the caller
   *  doesn't specify one — generous enough for month/week/day/agenda
   *  navigation without unbounded expansion of a no-end-date series. */
  function parseEventRange(query: any): { from: Date; to: Date } {
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 365 * 86400000);
    const to = query.to ? new Date(query.to) : new Date(Date.now() + 2 * 365 * 86400000);
    return { from, to };
  }

  fastify.get('/events', async (request) => {
    const user = request.user;
    const q = request.query as any;
    const range = parseEventRange(q);
    const data = await CalendarEvents.listEvents(user.tenant_id, user.sub, range, q.search);
    return { data };
  });

  // "Meet with…" — busy/free blocks only for any colleague in the same
  // tenant, never event content. See getFreeBusy's own comment for why
  // that's safe to leave ungated beyond "same tenant".
  fastify.get('/events/freebusy', async (request, reply) => {
    const user = request.user;
    const q = request.query as { userIds?: string; from?: string; to?: string };
    const userIds = (q.userIds ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (userIds.length === 0) return reply.status(400).send({ error: 'userIds is required (comma-separated).' });
    if (userIds.length > 20) return reply.status(400).send({ error: 'Too many people at once (max 20).' });
    if (!userIds.every(id => uuidSchema.safeParse(id).success)) return reply.status(400).send({ error: 'userIds must be valid UUIDs.' });
    const range = parseEventRange(q);
    const data = await CalendarEvents.getFreeBusy(user.tenant_id, userIds, range);
    return { data };
  });

  fastify.post('/events', async (request, reply) => {
    const user = request.user;
    const body = eventCreateSchema.parse(request.body);
    try {
      const row = await CalendarEvents.createEvent(user.tenant_id, user.sub, user.name ?? 'Someone', body.id, {
        title: body.title, start: body.start, end: body.end, description: body.description, location: body.location,
        category: body.category, guests: body.guests as CalendarEvents.Guest[] | undefined, allDay: body.allDay,
        color: body.color, recurrence: body.recurrence, reminderOffsets: body.reminderOffsets, timezone: body.timezone,
      });
      reply.status(201);
      return { data: row };
    } catch (err: any) {
      if (err instanceof EventValidationError) return reply.status(400).send({ error: err.message });
      throw err;
    }
  });

  fastify.patch<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const user = request.user;
    const body = eventPatchSchema.parse(request.body);
    try {
      const result = await CalendarEvents.updateEvent(
        user.tenant_id, user.sub, user.name ?? 'Someone', request.params.id,
        {
          title: body.title, start: body.start, end: body.end, description: body.description, location: body.location,
          category: body.category, guests: body.guests as CalendarEvents.Guest[] | undefined, allDay: body.allDay,
          color: body.color, recurrence: body.recurrence, reminderOffsets: body.reminderOffsets, timezone: body.timezone,
        },
        body.scope ?? 'all', body.occurrenceDate,
      );
      return { data: result };
    } catch (err: any) {
      if (err instanceof EventNotFoundError) return reply.status(404).send({ error: 'Event not found' });
      if (err instanceof EventValidationError) return reply.status(400).send({ error: err.message });
      throw err;
    }
  });

  fastify.delete<{ Params: { id: string } }>('/events/:id', async (request) => {
    const user = request.user;
    const q = request.query as { scope?: 'all' | 'this'; occurrenceDate?: string };
    await CalendarEvents.deleteEvent(user.tenant_id, user.sub, request.params.id, q.scope ?? 'all', q.occurrenceDate);
    return { success: true };
  });

  // ── ICS export/import ──────────────────────────────────────────────────

  fastify.get('/events/export.ics', async (request, reply) => {
    const user = request.user;
    const q = request.query as any;
    const range = parseEventRange(q);
    const ics = await CalendarEvents.exportICS(user.tenant_id, user.sub, range);
    reply.header('Content-Type', 'text/calendar; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="calendar.ics"');
    return ics;
  });

  fastify.post('/events/import.ics', async (request, reply) => {
    const user = request.user;
    const body = z.object({ ics: z.string().min(1).max(2_000_000) }).parse(request.body);
    const result = await CalendarEvents.importICS(user.tenant_id, user.sub, body.ics);
    reply.status(201);
    return { data: result };
  });

  // ── Booking pages (Calendly-style scheduling links) ─────────────────────
  // Authenticated management only — the public /book/:slug flow lives in
  // booking.routes.ts (bookingPublicRoutes), unauthenticated by design.

  const bookingPageCreateSchema = z.object({
    id: uuidSchema,
    slug: z.string().trim().min(1).max(60).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    bufferMinutes: z.number().int().min(0).max(120).optional(),
    workingDays: z.array(z.number().int().min(0).max(6)).optional(),
    workingStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    workingEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    timezone: z.string().min(1).max(100).optional(),
    bookingWindowDays: z.number().int().min(1).max(365).optional(),
    active: z.boolean().optional(),
  });
  const bookingPageSchema = z.object({
    slug: z.string().trim().min(1).max(60).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    bufferMinutes: z.number().int().min(0).max(120).optional(),
    workingDays: z.array(z.number().int().min(0).max(6)).optional(),
    workingStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    workingEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    timezone: z.string().min(1).max(100).optional(),
    bookingWindowDays: z.number().int().min(1).max(365).optional(),
    active: z.boolean().optional(),
  });

  fastify.get('/booking-pages', async (request) => {
    const user = request.user;
    const data = await BookingPages.listBookingPages(user.tenant_id, user.sub);
    return { data };
  });

  fastify.post('/booking-pages', async (request, reply) => {
    const user = request.user;
    const body = bookingPageCreateSchema.parse(request.body);
    try {
      const row = await BookingPages.createBookingPage(user.tenant_id, user.sub, user.name ?? 'Someone', body.id, body);
      reply.status(201);
      return { data: row };
    } catch (err) {
      if (err instanceof SlugTakenError) return reply.status(409).send({ error: err.message });
      throw err;
    }
  });

  fastify.patch<{ Params: { id: string } }>('/booking-pages/:id', async (request, reply) => {
    const user = request.user;
    const body = bookingPageSchema.parse(request.body);
    try {
      const row = await BookingPages.updateBookingPage(user.tenant_id, user.sub, request.params.id, body);
      return { data: row };
    } catch (err) {
      if (err instanceof SlugTakenError) return reply.status(409).send({ error: err.message });
      if (err instanceof BookingPageNotFoundError) return reply.status(404).send({ error: 'Booking page not found' });
      throw err;
    }
  });

  fastify.delete<{ Params: { id: string } }>('/booking-pages/:id', async (request) => {
    const user = request.user;
    await BookingPages.deleteBookingPage(user.tenant_id, user.sub, request.params.id);
    return { success: true };
  });

  // ── Settings ───────────────────────────────────────────────────────────

  fastify.get('/settings', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('user_app_settings').selectAll().where('user_id', '=', user.sub).executeTakeFirst();
      if (row) return { data: row };
      const created = await trx.insertInto('user_app_settings').values({
        user_id: user.sub, tenant_id: user.tenant_id,
      }).returningAll().executeTakeFirstOrThrow();
      return { data: created };
    });
  });

  fastify.patch('/settings', async (request) => {
    const user = request.user;
    const body = appSettingsPatchSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.calendarDefaultView !== undefined) updates.calendar_default_view = body.calendarDefaultView;
      if (body.weekStartsMonday !== undefined) updates.week_starts_monday = body.weekStartsMonday;
      if (body.tasksDefaultView !== undefined) updates.tasks_default_view = body.tasksDefaultView;

      const existing = await trx.selectFrom('user_app_settings').select('user_id').where('user_id', '=', user.sub).executeTakeFirst();
      const row = existing
        ? await trx.updateTable('user_app_settings').set(updates).where('user_id', '=', user.sub).returningAll().executeTakeFirstOrThrow()
        : await trx.insertInto('user_app_settings').values({ user_id: user.sub, tenant_id: user.tenant_id, ...updates }).returningAll().executeTakeFirstOrThrow();
      return { data: row };
    });
  });

  // ── Linked tasks from other apps ───────────────────────────────────────
  // Read-only aggregation of task-like records assigned to this user across
  // the platform, so "Today"/"Upcoming" surfaces work created anywhere, not
  // just tasks added inside this app.

  fastify.get('/linked', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const [shipmentTasks, invoiceTasks, sealTasks, inventoryTasks] = await Promise.all([
        trx.selectFrom('shipment_tasks')
          .innerJoin('shipment_cases', 'shipment_cases.id', 'shipment_tasks.shipment_id')
          .select(['shipment_tasks.id', 'shipment_tasks.title', 'shipment_tasks.due_date', 'shipment_tasks.status', 'shipment_cases.ref_number', 'shipment_tasks.shipment_id'])
          .where('shipment_tasks.tenant_id', '=', user.tenant_id)
          .where('shipment_tasks.assigned_to', '=', user.sub)
          .where('shipment_tasks.status', '!=', 'complete')
          .execute(),
        trx.selectFrom('invoice_tasks')
          .innerJoin('sales_invoices', 'sales_invoices.id', 'invoice_tasks.invoice_id')
          .select(['invoice_tasks.id', 'invoice_tasks.description', 'invoice_tasks.due_date', 'invoice_tasks.done', 'sales_invoices.invoice_number', 'invoice_tasks.invoice_id'])
          .where('invoice_tasks.tenant_id', '=', user.tenant_id)
          .where('invoice_tasks.assignee', '=', user.sub)
          .where('invoice_tasks.done', '=', false)
          .execute(),
        trx.selectFrom('seal_tasks')
          .leftJoin('seal_compartments', 'seal_compartments.id', 'seal_tasks.compartment_id')
          .select(['seal_tasks.id', 'seal_tasks.title', 'seal_tasks.due_date', 'seal_tasks.status', 'seal_compartments.name as compartment_name', 'seal_tasks.compartment_id'])
          .where('seal_tasks.tenant_id', '=', user.tenant_id)
          .where('seal_tasks.assigned_to', '=', user.sub)
          .where('seal_tasks.status', '!=', 'complete')
          .execute(),
        trx.selectFrom('inventory_tasks')
          .leftJoin('inventory_items', 'inventory_items.id', 'inventory_tasks.item_id')
          .select(['inventory_tasks.id', 'inventory_tasks.title', 'inventory_tasks.due_date', 'inventory_tasks.status', 'inventory_items.name as item_name'])
          .where('inventory_tasks.tenant_id', '=', user.tenant_id)
          .where('inventory_tasks.assigned_to', '=', user.sub)
          .where('inventory_tasks.status', '!=', 'complete')
          .execute(),
      ]);

      const data = [
        ...shipmentTasks.map(t => ({
          id: `shipment:${t.id}`, title: t.title, due: t.due_date,
          sourceApp: 'ClearOS', sourceLabel: t.ref_number, path: `/clearos/clearance/${t.shipment_id}`,
        })),
        ...invoiceTasks.map(t => ({
          id: `invoice:${t.id}`, title: t.description, due: t.due_date,
          sourceApp: 'FinOps', sourceLabel: t.invoice_number, path: `/finops/invoices`,
        })),
        ...sealTasks.map(t => ({
          id: `seal:${t.id}`, title: t.title, due: t.due_date,
          sourceApp: 'SEAL', sourceLabel: t.compartment_name ?? undefined, path: `/seal/activities`,
        })),
        ...inventoryTasks.map(t => ({
          id: `inventory:${t.id}`, title: t.title, due: t.due_date,
          sourceApp: 'Inventory', sourceLabel: t.item_name ?? undefined, path: `/inventory/tasks`,
        })),
      ];
      return { data };
    });
  });
}
