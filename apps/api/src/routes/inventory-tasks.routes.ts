import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';

// Real values — inventory_tasks migration's inline comment (mirrors seal_tasks/shipment_tasks).
const INV_TASK_STATUSES = ['open', 'in_progress', 'complete', 'blocked'] as const;
const INV_TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const taskCreateSchema = z.object({
  itemId: z.string().nullable().optional(),
  warehouseId: z.string().nullable().optional(),
  title: z.string().trim().min(1).max(500),
  priority: z.enum(INV_TASK_PRIORITIES).optional(),
  assignedTo: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
});
const taskPatchSchema = z.object({
  status: z.enum(INV_TASK_STATUSES).optional(),
  priority: z.enum(INV_TASK_PRIORITIES).optional(),
  assignedTo: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
  title: z.string().trim().min(1).max(500).optional(),
});

// Inventory Control Phase 5 — real task allocation (e.g. "restock this
// item"), the real HR link (assigned_to → any tenant user, same as
// shipment_tasks/invoice_tasks/seal_tasks already do) and the fourth arm
// of the platform's real personal-Tasks aggregation (tasks.routes.ts's
// /linked, extended alongside this file).

function mapTask(row: any) {
  return {
    id: row.id, itemId: row.item_id, warehouseId: row.warehouse_id,
    title: row.title, status: row.status, priority: row.priority,
    assignedTo: row.assigned_to, dueDate: row.due_date, note: row.note,
    createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
    itemName: row.item_name ?? undefined, warehouseName: row.warehouse_name ?? undefined,
    assigneeName: row.assignee_name ?? undefined,
  };
}

export async function inventoryTasksRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('inventory'));

  fastify.get('/tasks', async (request: any, reply) => {
    try {
      const { status } = request.query as { status?: string };
      const rows = await withTenant(request.user.tenant_id, async trx => {
        let q = trx.selectFrom('inventory_tasks')
          .leftJoin('inventory_items', 'inventory_items.id', 'inventory_tasks.item_id')
          .leftJoin('inventory_warehouses', 'inventory_warehouses.id', 'inventory_tasks.warehouse_id')
          .select([
            'inventory_tasks.id', 'inventory_tasks.item_id', 'inventory_tasks.warehouse_id', 'inventory_tasks.title',
            'inventory_tasks.status', 'inventory_tasks.priority', 'inventory_tasks.assigned_to', 'inventory_tasks.due_date',
            'inventory_tasks.note', 'inventory_tasks.created_by', 'inventory_tasks.created_at', 'inventory_tasks.updated_at',
            'inventory_items.name as item_name', 'inventory_warehouses.name as warehouse_name',
          ])
          .where('inventory_tasks.tenant_id', '=', request.user.tenant_id)
          .orderBy('inventory_tasks.due_date', 'asc')
          .orderBy('inventory_tasks.created_at', 'desc');
        if (status) q = q.where('inventory_tasks.status', '=', status);
        const taskRows = await q.execute();

        // assigned_to is a plain VARCHAR (same as shipment_tasks/invoice_tasks/
        // seal_tasks), not a hard FK to users — resolved here rather than in a
        // SQL join to avoid a uuid/varchar type-mismatch at the database layer.
        const assigneeIds = [...new Set(taskRows.map(t => t.assigned_to).filter((id): id is string => !!id))];
        const assignees = assigneeIds.length
          ? await trx.selectFrom('users').select(['id', 'name']).where('tenant_id', '=', request.user.tenant_id).where('id', 'in', assigneeIds).execute()
          : [];
        const nameById = new Map(assignees.map(u => [u.id, u.name]));

        return taskRows.map(t => ({ ...t, assignee_name: t.assigned_to ? nameById.get(t.assigned_to) : undefined }));
      });
      return rows.map(mapTask);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/tasks', async (request: any, reply) => {
    const b = taskCreateSchema.parse(request.body);
    try {
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('inventory_tasks').values({
          tenant_id: request.user.tenant_id,
          item_id: b.itemId ?? null,
          warehouse_id: b.warehouseId ?? null,
          title: b.title.trim(),
          priority: b.priority ?? 'medium',
          assigned_to: b.assignedTo ?? null,
          due_date: b.dueDate ? new Date(b.dueDate) : null,
          note: b.note ?? null,
          created_by: request.user.sub,
        }).returningAll().executeTakeFirstOrThrow()
      );
      return mapTask(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/tasks/:id', async (request: any, reply) => {
    const b = taskPatchSchema.parse(request.body);
    try {
      const patch: any = { updated_at: new Date() };
      if (b.status !== undefined) patch.status = b.status;
      if (b.priority !== undefined) patch.priority = b.priority;
      if (b.assignedTo !== undefined) patch.assigned_to = b.assignedTo;
      if (b.dueDate !== undefined) patch.due_date = b.dueDate ? new Date(b.dueDate) : null;
      if (b.note !== undefined) patch.note = b.note;
      if (b.title !== undefined) patch.title = b.title.trim();
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('inventory_tasks').set(patch).where('id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id).returningAll().executeTakeFirstOrThrow()
      );
      return mapTask(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete('/tasks/:id', async (request: any, reply) => {
    try {
      await withTenant(request.user.tenant_id, trx =>
        trx.deleteFrom('inventory_tasks').where('id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id).execute()
      );
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
