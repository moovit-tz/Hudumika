import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';

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
const EVENT_CATEGORIES = ['work', 'personal', 'customs', 'todo'] as const;
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
  starred: z.boolean().optional(),
  someday: z.boolean().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  tags: z.array(z.string()).optional(),
});
const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  notes: z.string().max(10000).nullable().optional(),
  due: z.string().nullable().optional(),
  starred: z.boolean().optional(),
  someday: z.boolean().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  tags: z.array(z.string()).optional(),
  completed: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  listId: uuidSchema.optional(),
  deletedAt: z.string().nullable().optional(),
});
const subtaskCreateSchema = z.object({
  id: uuidSchema,
  title: z.string().trim().min(1).max(500),
});
const subtaskPatchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  completed: z.boolean().optional(),
});
const eventCreateSchema = z.object({
  id: uuidSchema,
  title: z.string().trim().min(1).max(500),
  start: z.string().min(1),
  end: z.string().min(1),
  description: z.string().max(10000).optional(),
  location: z.string().max(500).optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  guests: z.array(z.string()).optional(),
});
const eventPatchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  start: z.string().min(1).optional(),
  end: z.string().min(1).optional(),
  description: z.string().max(10000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  guests: z.array(z.string()).optional(),
});
const appSettingsPatchSchema = z.object({
  calendarDefaultView: z.enum(CALENDAR_VIEWS).optional(),
  weekStartsMonday: z.boolean().optional(),
  tasksDefaultView: z.string().max(50).optional(),
});

export async function tasksRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // ── Lists ──────────────────────────────────────────────────────────────

  fastify.get('/lists', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      let rows = await trx.selectFrom('task_lists').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub)
        .orderBy('sort_order', 'asc').execute();
      if (rows.length === 0) {
        const inbox = await trx.insertInto('task_lists').values({
          id: crypto.randomUUID(), tenant_id: user.tenant_id, user_id: user.sub,
          name: 'Inbox', color: '#64748b', sort_order: 0,
        }).returningAll().executeTakeFirstOrThrow();
        rows = [inbox];
      }
      return { data: rows };
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
      const [taskRows, subtaskRows] = await Promise.all([
        trx.selectFrom('tasks').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub)
          .orderBy('sort_order', 'asc').execute(),
        trx.selectFrom('task_subtasks')
          .innerJoin('tasks', 'tasks.id', 'task_subtasks.task_id')
          .where('tasks.tenant_id', '=', user.tenant_id).where('tasks.user_id', '=', user.sub)
          .selectAll('task_subtasks')
          .orderBy('task_subtasks.sort_order', 'asc').execute(),
      ]);
      const subsByTask = new Map<string, typeof subtaskRows>();
      for (const s of subtaskRows) {
        if (!subsByTask.has(s.task_id)) subsByTask.set(s.task_id, []);
        subsByTask.get(s.task_id)!.push(s);
      }
      const data = taskRows.map(t => ({ ...t, subtasks: subsByTask.get(t.id) || [] }));
      return { data };
    });
  });

  fastify.post('/items', async (request, reply) => {
    const user = request.user;
    const body = taskCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const siblingCount = await trx.selectFrom('tasks').select(({ fn }) => fn.countAll<number>().as('count'))
        .where('list_id', '=', body.listId).where('user_id', '=', user.sub).where('deleted_at', 'is', null).executeTakeFirst();
      const row = await trx.insertInto('tasks').values({
        id: body.id, tenant_id: user.tenant_id, user_id: user.sub, list_id: body.listId,
        title: body.title.trim(), notes: body.notes || null, due: body.due || null,
        starred: body.starred ?? false, someday: body.someday ?? false, status: body.status || 'none',
        tags: JSON.stringify(body.tags ?? []) as unknown as string[],
        sort_order: Number(siblingCount?.count ?? 0),
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return { data: { ...row, subtasks: [] } };
    });
  });

  fastify.patch<{ Params: { id: string } }>('/items/:id', async (request, reply) => {
    const user = request.user;
    const body = taskPatchSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.title !== undefined) updates.title = body.title.trim();
      if (body.notes !== undefined) updates.notes = body.notes;
      if (body.due !== undefined) updates.due = body.due || null;
      if (body.starred !== undefined) updates.starred = body.starred;
      if (body.someday !== undefined) updates.someday = body.someday;
      if (body.status !== undefined) updates.status = body.status;
      if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags);
      if (body.listId !== undefined) updates.list_id = body.listId;
      if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;
      if (body.completed !== undefined) {
        updates.completed = body.completed;
        updates.completed_at = body.completed ? new Date() : null;
      }
      if (body.deletedAt !== undefined) updates.deleted_at = body.deletedAt || null;

      const row = await trx.updateTable('tasks').set(updates)
        .where('id', '=', request.params.id).where('user_id', '=', user.sub)
        .returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Task not found' });
      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string } }>('/items/:id', async (request, reply) => {
    const user = request.user;
    const permanent = (request.query as any).permanent === 'true';
    return withTenant(user.tenant_id, async (trx) => {
      if (permanent) {
        await trx.deleteFrom('tasks').where('id', '=', request.params.id).where('user_id', '=', user.sub).execute();
      } else {
        await trx.updateTable('tasks').set({ deleted_at: new Date().toISOString() })
          .where('id', '=', request.params.id).where('user_id', '=', user.sub).execute();
      }
      reply.status(204);
      return null;
    });
  });

  // ── Subtasks ───────────────────────────────────────────────────────────

  fastify.post<{ Params: { id: string } }>('/items/:id/subtasks', async (request, reply) => {
    const user = request.user;
    const body = subtaskCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const parent = await trx.selectFrom('tasks').select('id').where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!parent) return reply.status(404).send({ error: 'Task not found' });
      const row = await trx.insertInto('task_subtasks').values({
        id: body.id, task_id: request.params.id, title: body.title.trim(),
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return { data: row };
    });
  });

  fastify.patch<{ Params: { id: string; subId: string } }>('/items/:id/subtasks/:subId', async (request, reply) => {
    const user = request.user;
    const body = subtaskPatchSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
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

  fastify.delete<{ Params: { id: string; subId: string } }>('/items/:id/subtasks/:subId', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      await trx.deleteFrom('task_subtasks').where('id', '=', request.params.subId).where('task_id', '=', request.params.id).execute();
      return { success: true };
    });
  });

  // ── Calendar events ────────────────────────────────────────────────────

  fastify.get('/events', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('calendar_events').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub)
        .orderBy('start_at', 'asc').execute();

      const hrHolidays = await trx.selectFrom('hr_holidays')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .execute();

      const holidayEvents = hrHolidays.map(h => {
        const dateStr = (h.date as any) instanceof Date ? (h.date as any).toISOString().slice(0, 10) : String(h.date).slice(0, 10);
        return {
          id: h.id,
          tenant_id: h.tenant_id,
          user_id: user.sub,
          title: `🌴 ${h.name}`,
          start_at: `${dateStr}T00:00:00.000Z`,
          end_at: `${dateStr}T23:59:59.999Z`,
          description: `${h.type} Holiday`,
          location: null,
          category: 'holiday',
          guests: '[]',
          created_at: h.created_at,
          updated_at: h.created_at,
        };
      });

      const allEvents = [...rows, ...holidayEvents].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
      
      return { data: allEvents };
    });
  });

  fastify.post('/events', async (request, reply) => {
    const user = request.user;
    const body = eventCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.insertInto('calendar_events').values({
        id: body.id, tenant_id: user.tenant_id, user_id: user.sub, title: body.title.trim(),
        start_at: body.start, end_at: body.end,
        description: body.description || null, location: body.location || null,
        category: body.category || 'work', guests: JSON.stringify(body.guests ?? []) as unknown as string[],
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return { data: row };
    });
  });

  fastify.patch<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const user = request.user;
    const body = eventPatchSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const updates: Record<string, unknown> = {};
      if (body.title !== undefined) updates.title = body.title.trim();
      if (body.start !== undefined) updates.start_at = body.start;
      if (body.end !== undefined) updates.end_at = body.end;
      if (body.description !== undefined) updates.description = body.description;
      if (body.location !== undefined) updates.location = body.location;
      if (body.category !== undefined) updates.category = body.category;
      if (body.guests !== undefined) updates.guests = JSON.stringify(body.guests);
      const row = await trx.updateTable('calendar_events').set(updates)
        .where('id', '=', request.params.id).where('user_id', '=', user.sub)
        .returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Event not found' });
      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string } }>('/events/:id', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      await trx.deleteFrom('calendar_events').where('id', '=', request.params.id).where('user_id', '=', request.user.sub).execute();
      return { success: true };
    });
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
