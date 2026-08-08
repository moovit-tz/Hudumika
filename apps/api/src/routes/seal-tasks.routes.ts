import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';

// Warehouse activity/task allocation — the real HR link (assigned_to →
// any tenant user, same as shipment_tasks/invoice_tasks already do) and the
// third arm of the platform's real personal-Tasks aggregation
// (tasks.routes.ts's /linked, extended alongside this file).

function mapTask(row: any) {
  return {
    id: row.id, compartmentId: row.compartment_id, lotId: row.lot_id,
    title: row.title, status: row.status, priority: row.priority,
    assignedTo: row.assigned_to, dueDate: row.due_date, note: row.note,
    createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
    lotDescription: row.lot_description ?? undefined,
    compartmentName: row.compartment_name ?? undefined,
    assigneeName: row.assignee_name ?? undefined,
  };
}

export async function sealTasksRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('seal'));

  fastify.get('/tasks', async (request: any, reply) => {
    try {
      const { compartment_id, status } = request.query as { compartment_id?: string; status?: string };
      const rows = await withTenant(request.user.tenant_id, async trx => {
        let q = trx.selectFrom('seal_tasks')
          .leftJoin('seal_lots', 'seal_lots.id', 'seal_tasks.lot_id')
          .leftJoin('seal_compartments', 'seal_compartments.id', 'seal_tasks.compartment_id')
          .select([
            'seal_tasks.id', 'seal_tasks.compartment_id', 'seal_tasks.lot_id', 'seal_tasks.title',
            'seal_tasks.status', 'seal_tasks.priority', 'seal_tasks.assigned_to', 'seal_tasks.due_date',
            'seal_tasks.note', 'seal_tasks.created_by', 'seal_tasks.created_at', 'seal_tasks.updated_at',
            'seal_lots.description as lot_description', 'seal_compartments.name as compartment_name',
          ])
          .where('seal_tasks.tenant_id', '=', request.user.tenant_id)
          .orderBy('seal_tasks.due_date', 'asc')
          .orderBy('seal_tasks.created_at', 'desc');
        if (compartment_id) q = q.where('seal_tasks.compartment_id', '=', compartment_id);
        if (status) q = q.where('seal_tasks.status', '=', status);
        const taskRows = await q.execute();

        // assigned_to is a plain VARCHAR (same as shipment_tasks/invoice_tasks),
        // not a hard FK to users — resolved here rather than in a SQL join to
        // avoid a uuid/varchar type-mismatch at the database layer.
        const assigneeIds = [...new Set(taskRows.map(t => t.assigned_to).filter((id): id is string => !!id))];
        const assignees = assigneeIds.length
          ? await trx.selectFrom('users').select(['id', 'name']).where('id', 'in', assigneeIds).execute()
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
    try {
      const b = request.body as any;
      if (!b.title?.trim()) return reply.status(400).send({ error: 'title is required' });
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('seal_tasks').values({
          tenant_id: request.user.tenant_id,
          compartment_id: b.compartmentId ?? null,
          lot_id: b.lotId ?? null,
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
    try {
      const b = request.body as any;
      const patch: any = { updated_at: new Date() };
      if (b.status !== undefined) patch.status = b.status;
      if (b.priority !== undefined) patch.priority = b.priority;
      if (b.assignedTo !== undefined) patch.assigned_to = b.assignedTo;
      if (b.dueDate !== undefined) patch.due_date = b.dueDate ? new Date(b.dueDate) : null;
      if (b.note !== undefined) patch.note = b.note;
      if (b.title !== undefined) patch.title = b.title.trim();
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_tasks').set(patch).where('id', '=', request.params.id)
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
        trx.deleteFrom('seal_tasks').where('id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id).execute()
      );
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
