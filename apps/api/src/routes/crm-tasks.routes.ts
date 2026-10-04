import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { logCrmActivity } from './crm-activity.routes.js';

const SUBJECT_TYPES = ['deal', 'lead'] as const;
const idParamSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  subject_type: z.enum(SUBJECT_TYPES),
  subject_id: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  due_at: z.string().nullable().optional(),
  assigned_to: z.string().uuid().nullish(),
});
const patchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  due_at: z.string().nullable().optional(),
  done: z.boolean().optional(),
  assigned_to: z.string().uuid().nullish(),
});
const listSchema = z.object({
  subject_type: z.enum(SUBJECT_TYPES).optional(),
  subject_id: z.string().uuid().optional(),
  done: z.enum(['true', 'false', 'all']).optional(),
});

const CRM_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER'] as const;

export async function crmTasksRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireRole(...CRM_ROLES));
  fastify.addHook('preHandler', requireEntitlement('crm'));

  /* GET /v1/crm/tasks?subject_type=deal&subject_id=:id&done=false */
  fastify.get('/', async (request: any) => {
    const q = listSchema.parse(request.query);
    const tenantId = request.user.tenant_id;
    return withTenant(tenantId, async trx => {
      let query = trx.selectFrom('crm_tasks as t')
        .leftJoin('users as u', 'u.id', 't.assigned_to')
        .select([
          't.id', 't.subject_type', 't.subject_id', 't.title',
          't.due_at', 't.done', 't.done_at', 't.assigned_to',
          't.created_by', 't.created_at', 't.updated_at',
          'u.name as assignee_name',
        ])
        .where('t.tenant_id', '=', tenantId)
        .orderBy('t.due_at', 'asc')
        .orderBy('t.created_at', 'asc');
      if (q.subject_type) query = query.where('t.subject_type', '=', q.subject_type);
      if (q.subject_id) query = query.where('t.subject_id', '=', q.subject_id);
      if (q.done === 'true') query = query.where('t.done', '=', true);
      else if (q.done !== 'all') query = query.where('t.done', '=', false);
      return query.execute();
    });
  });

  /* POST /v1/crm/tasks */
  fastify.post('/', async (request: any, reply) => {
    const b = createSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    const task = await withTenant(tenantId, async trx => {
      const row = await trx.insertInto('crm_tasks').values({
        tenant_id: tenantId,
        subject_type: b.subject_type,
        subject_id: b.subject_id,
        title: b.title,
        due_at: b.due_at ? new Date(b.due_at) : null,
        assigned_to: b.assigned_to || null,
        created_by: request.user.sub,
      }).returningAll().executeTakeFirstOrThrow();
      await logCrmActivity(trx, {
        tenantId, subjectType: b.subject_type, subjectId: b.subject_id,
        type: 'task_added',
        body: `Task added: ${b.title}${b.due_at ? ` (due ${new Date(b.due_at).toLocaleDateString()})` : ''}`,
        meta: { task_id: (row as any).id, due_at: b.due_at },
        actorId: request.user.sub, actorName: request.user.name,
      });
      return row;
    });
    return reply.status(201).send(task);
  });

  /* PATCH /v1/crm/tasks/:id */
  fastify.patch('/:id', async (request: any, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const b = patchSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (b.title !== undefined) patch.title = b.title;
    if (b.due_at !== undefined) patch.due_at = b.due_at ? new Date(b.due_at) : null;
    if (b.assigned_to !== undefined) patch.assigned_to = b.assigned_to || null;
    if (b.done !== undefined) {
      patch.done = b.done;
      patch.done_at = b.done ? new Date() : null;
    }

    const task = await withTenant(tenantId, async trx => {
      const existing = await trx.selectFrom('crm_tasks')
        .select(['id', 'subject_type', 'subject_id', 'title', 'done'])
        .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!existing) return null;
      await trx.updateTable('crm_tasks').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', tenantId).execute();
      if (b.done === true && !existing.done) {
        await logCrmActivity(trx, {
          tenantId, subjectType: existing.subject_type, subjectId: existing.subject_id,
          type: 'task_done', body: `Task completed: ${existing.title}`,
          meta: { task_id: id },
          actorId: request.user.sub, actorName: request.user.name,
        });
      }
      return { ...existing, ...patch };
    });
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    return task;
  });

  /* DELETE /v1/crm/tasks/:id */
  fastify.delete('/:id', async (request: any, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const tenantId = request.user.tenant_id;
    await withTenant(tenantId, trx =>
      trx.deleteFrom('crm_tasks')
        .where('id', '=', id).where('tenant_id', '=', tenantId).execute()
    );
    return reply.status(204).send();
  });
}
