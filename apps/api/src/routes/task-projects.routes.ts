import type { FastifyInstance } from 'fastify';
import { sql, type Transaction } from 'kysely';
import { z } from 'zod';
import { withTenant, type Database } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { getNextDocNumber } from '../lib/doc-numbering.js';
import { NotificationService } from '../services/notification.service.js';
import { MailService } from '../services/mail.service.js';
import { createTicketRow } from './support.routes.js';

// Projects & Milestones (migration 308) — the core of the standalone
// Projects app, gated behind the 'projects' (HuduPlus+) entitlement
// (renamed from 'tasks.advanced' in migration 313 once Projects became its
// own app rather than a Tasks mode). Unlike task_lists (personal, one owner), a project
// is tenant-shared: project_members is a real multi-person roster, and
// resolveProjectAccess below is that roster's single source of truth, the
// same role tasks.routes.ts's resolveTaskAccess plays for personal tasks.

const uuidSchema = z.string().uuid();
const PROJECT_STATUSES = ['not_started', 'in_progress', 'on_hold', 'cancelled', 'finished'] as const;
const BILLING_TYPES = ['fixed', 'hourly'] as const;
const MEMBER_ROLES = ['owner', 'member', 'viewer'] as const;
const MILESTONE_STATUSES = ['upcoming', 'in_progress', 'completed'] as const;
const ADMIN_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN'];

const projectCreateSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  color: z.string().max(30).optional(),
  startDate: z.string().optional(),
  targetDate: z.string().optional(),
  customerId: uuidSchema.nullable().optional(),
  billingType: z.enum(BILLING_TYPES).optional(),
  totalRate: z.number().min(0).max(100000000).nullable().optional(),
  currency: z.string().max(5).optional(),
  templateId: uuidSchema.optional(),
});
const saveAsTemplateSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
});
const discussionCreateSchema = z.object({
  content: z.string().trim().min(1).max(5000),
  mentions: z.array(z.object({ user_id: uuidSchema, name: z.string() })).optional(),
});
const ticketLinkSchema = z.object({ ticketId: uuidSchema });
const ticketCreateForProjectSchema = z.object({
  subject: z.string().trim().min(1).max(300),
  description: z.string().max(10000).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'MEDIUM', 'HIGH', 'URGENT']).default('NORMAL'),
  category: z.string().trim().min(1).max(100).default('General'),
});
const projectPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  color: z.string().max(30).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  startDate: z.string().nullable().optional(),
  targetDate: z.string().nullable().optional(),
  customerId: uuidSchema.nullable().optional(),
  billingType: z.enum(BILLING_TYPES).optional(),
  totalRate: z.number().min(0).max(100000000).nullable().optional(),
  currency: z.string().max(5).optional(),
});
const memberAddSchema = z.object({ userId: uuidSchema, role: z.enum(MEMBER_ROLES).optional() });
const memberPatchSchema = z.object({ role: z.enum(MEMBER_ROLES) });
const milestoneCreateSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  dueDate: z.string().optional(),
  status: z.enum(MILESTONE_STATUSES).optional(),
});
const milestonePatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(MILESTONE_STATUSES).optional(),
  sortOrder: z.number().int().optional(),
});

type ProjectAccessLevel = 'owner' | 'member' | 'viewer' | 'admin';

/** owner/admin can manage the project itself (rename, archive, delete,
 *  membership); member can create/edit milestones and work tasks under it;
 *  viewer is read-only. A tenant admin role always gets at least 'admin'
 *  even with no project_members row, mirroring how a TENANT_ADMIN can reach
 *  into any other app's records for oversight. */
export async function resolveProjectAccess(
  trx: Transaction<Database>, tenantId: string, userId: string, userRole: string, projectId: string,
): Promise<{ project: { id: string; owner_id: string }; access: ProjectAccessLevel } | null> {
  const project = await trx.selectFrom('projects').select(['id', 'owner_id'])
    .where('id', '=', projectId).where('tenant_id', '=', tenantId).executeTakeFirst();
  if (!project) return null;
  const membership = await trx.selectFrom('project_members').select('role')
    .where('project_id', '=', projectId).where('user_id', '=', userId).where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (membership) return { project, access: membership.role as ProjectAccessLevel };
  if (ADMIN_ROLES.includes(userRole)) return { project, access: 'admin' };
  return null;
}
function canManageProject(access: ProjectAccessLevel): boolean {
  return access === 'owner' || access === 'admin';
}
export function canEditProject(access: ProjectAccessLevel): boolean {
  return access === 'owner' || access === 'admin' || access === 'member';
}

export async function taskProjectsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('projects'));

  // ── Projects ───────────────────────────────────────────────────────────

  fastify.get('/', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const isAdmin = ADMIN_ROLES.includes(user.role);
      const rows = await trx.selectFrom('projects')
        .leftJoin('users as owner_user', 'owner_user.id', 'projects.owner_id')
        .leftJoin('customers', 'customers.id', 'projects.customer_id')
        .where('projects.tenant_id', '=', user.tenant_id)
        .where(eb => {
          const conds = [eb('projects.owner_id', '=', user.sub)];
          if (isAdmin) conds.push(eb('projects.tenant_id', '=', user.tenant_id));
          return eb.or([
            ...conds,
            eb('projects.id', 'in', eb.selectFrom('project_members')
              .select('project_id').where('user_id', '=', user.sub).where('tenant_id', '=', user.tenant_id)),
          ]);
        })
        .select([
          'projects.id', 'projects.ref', 'projects.name', 'projects.description', 'projects.color', 'projects.status',
          'projects.owner_id', 'projects.start_date', 'projects.target_date',
          'projects.customer_id', 'projects.billing_type', 'projects.total_rate', 'projects.currency',
          'projects.created_at', 'projects.updated_at', 'owner_user.name as owner_name',
          'customers.name as customer_name',
        ])
        .orderBy('projects.created_at', 'desc').execute();

      const [memberCounts, taskCounts, pins] = await Promise.all([
        trx.selectFrom('project_members')
          .where('tenant_id', '=', user.tenant_id)
          .select(['project_id', ({ fn }) => fn.countAll<number>().as('count')])
          .groupBy('project_id').execute(),
        trx.selectFrom('tasks')
          .where('tenant_id', '=', user.tenant_id).where('project_id', 'is not', null).where('deleted_at', 'is', null)
          .select(['project_id', ({ fn }) => fn.countAll<number>().as('total'),
            ({ fn }) => fn.countAll<number>().filterWhere('completed', '=', true).as('done')])
          .groupBy('project_id').execute(),
        trx.selectFrom('project_pins').select('project_id')
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).execute(),
      ]);
      const memberCountByProject = new Map(memberCounts.map(r => [r.project_id, Number(r.count)]));
      const taskCountByProject = new Map(taskCounts.map(r => [r.project_id, { total: Number(r.total), done: Number(r.done || 0) }]));
      const pinnedSet = new Set(pins.map(p => p.project_id));

      return {
        data: rows.map(p => ({
          ...p, member_count: memberCountByProject.get(p.id) || 0,
          task_count: taskCountByProject.get(p.id)?.total || 0,
          task_done_count: taskCountByProject.get(p.id)?.done || 0,
          is_pinned: pinnedSet.has(p.id),
        })),
      };
    });
  });

  fastify.post<{ Params: { id: string } }>('/:id/pin', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      await trx.insertInto('project_pins').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, project_id: request.params.id, user_id: user.sub,
      }).onConflict(oc => oc.columns(['project_id', 'user_id']).doNothing()).execute();
      reply.status(204);
      return null;
    });
  });

  fastify.delete<{ Params: { id: string } }>('/:id/pin', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('project_pins')
        .where('project_id', '=', request.params.id).where('user_id', '=', user.sub).where('tenant_id', '=', user.tenant_id)
        .execute();
      reply.status(204);
      return null;
    });
  });

  fastify.post<{ Params: { id: string } }>('/:id/copy', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      const source = await trx.selectFrom('projects').selectAll().where('id', '=', request.params.id).executeTakeFirstOrThrow();
      const ref = await getNextDocNumber(trx, user.tenant_id, 'project');
      // Copies the project + its milestones — NOT tasks, matching the
      // reference's own "Copy Project" behavior (a duplicate is a fresh
      // shell to plan into, not a clone of someone else's in-flight work).
      const copy = await trx.insertInto('projects').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, name: `${source.name} (Copy)`, ref,
        description: source.description, color: source.color, owner_id: user.sub,
        start_date: null, target_date: null, customer_id: source.customer_id,
        billing_type: source.billing_type, total_rate: source.total_rate, currency: source.currency,
      }).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('project_members').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, project_id: copy.id, user_id: user.sub, role: 'owner',
      }).execute();
      const sourceMilestones = await trx.selectFrom('milestones').select(['name', 'description'])
        .where('project_id', '=', request.params.id).orderBy('sort_order', 'asc').execute();
      for (const [i, m] of sourceMilestones.entries()) {
        await trx.insertInto('milestones').values({
          id: crypto.randomUUID(), tenant_id: user.tenant_id, project_id: copy.id, name: m.name, description: m.description, sort_order: i,
        }).execute();
      }
      await trx.insertInto('project_activity_log').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, project_id: copy.id, actor_id: user.sub,
        action: 'created', detail: JSON.stringify({ copiedFrom: source.name }) as unknown as Record<string, unknown>,
      }).execute();
      reply.status(201);
      return { data: { ...copy, member_count: 1, task_count: 0, task_done_count: 0 } };
    });
  });

  fastify.post('/', async (request, reply) => {
    const user = request.user;
    const body = projectCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const ref = await getNextDocNumber(trx, user.tenant_id, 'project');
      const row = await trx.insertInto('projects').values({
        id: body.id, tenant_id: user.tenant_id, name: body.name.trim(), ref,
        description: body.description || null, color: body.color || '#0d7a6b',
        owner_id: user.sub, start_date: body.startDate || null, target_date: body.targetDate || null,
        customer_id: body.customerId || null, billing_type: body.billingType || 'fixed',
        total_rate: body.totalRate != null ? String(body.totalRate) : null, currency: body.currency || 'TZS',
      }).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('project_members').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, project_id: row.id, user_id: user.sub, role: 'owner',
      }).execute();
      await trx.insertInto('project_activity_log').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, project_id: row.id, actor_id: user.sub,
        action: 'created', detail: '{}' as unknown as Record<string, unknown>,
      }).execute();

      // New from template (M11, migration 322) — seed milestones + tasks
      // from a snapshot. Structure only: no dates copied (a template isn't
      // tied to real dates), so every seeded task/milestone starts blank on
      // dates exactly like one created by hand.
      if (body.templateId) {
        const template = await trx.selectFrom('project_templates').selectAll()
          .where('id', '=', body.templateId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (template) {
          const snapshot = template.snapshot as { milestones?: { name: string; description?: string | null }[]; tasks?: { title: string; milestoneIndex: number | null; priority?: string; tags?: string[]; isBillable?: boolean }[] };
          const milestoneIds: (string | null)[] = [];
          for (const [i, m] of (snapshot.milestones || []).entries()) {
            const msRow = await trx.insertInto('milestones').values({
              id: crypto.randomUUID(), tenant_id: user.tenant_id, project_id: row.id,
              name: m.name, description: m.description || null, sort_order: i,
            }).returningAll().executeTakeFirstOrThrow();
            milestoneIds.push(msRow.id);
          }
          if (snapshot.tasks?.length) {
            let list = await trx.selectFrom('task_lists').select('id')
              .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub)
              .orderBy('sort_order', 'asc').executeTakeFirst();
            if (!list) {
              list = await trx.insertInto('task_lists').values({
                id: crypto.randomUUID(), tenant_id: user.tenant_id, user_id: user.sub, name: 'Inbox', color: '#64748b', sort_order: 0,
              }).returningAll().executeTakeFirstOrThrow();
            }
            let sortOrder = 0;
            for (const t of snapshot.tasks) {
              await trx.insertInto('tasks').values({
                id: crypto.randomUUID(), tenant_id: user.tenant_id, user_id: user.sub, list_id: list.id,
                title: t.title, project_id: row.id,
                milestone_id: t.milestoneIndex != null ? milestoneIds[t.milestoneIndex] ?? null : null,
                priority: t.priority || 'medium', tags: JSON.stringify(t.tags ?? []) as unknown as string[],
                is_billable: t.isBillable ?? false, sort_order: sortOrder++,
              }).execute();
            }
          }
        }
      }

      const customerName = body.customerId
        ? (await trx.selectFrom('customers').select('name').where('id', '=', body.customerId).executeTakeFirst())?.name ?? null
        : null;
      reply.status(201);
      return { data: { ...row, member_count: 1, task_count: 0, task_done_count: 0, owner_name: user.name, customer_name: customerName } };
    });
  });

  // ── Templates (M11, migration 322) ────────────────────────────────────

  fastify.get('/templates', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('project_templates').selectAll()
        .where('tenant_id', '=', user.tenant_id).orderBy('created_at', 'desc').execute();
      return { data: rows };
    });
  });

  fastify.post<{ Params: { id: string } }>('/:id/save-as-template', async (request, reply) => {
    const user = request.user;
    const body = saveAsTemplateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      const project = await trx.selectFrom('projects').selectAll()
        .where('id', '=', request.params.id).executeTakeFirstOrThrow();
      const milestones = await trx.selectFrom('milestones').select(['id', 'name', 'description'])
        .where('project_id', '=', request.params.id).orderBy('sort_order', 'asc').execute();
      const milestoneIndexById = new Map(milestones.map((m, i) => [m.id, i]));
      const tasks = await trx.selectFrom('tasks').select(['title', 'milestone_id', 'priority', 'tags', 'is_billable'])
        .where('project_id', '=', request.params.id).where('deleted_at', 'is', null).execute();
      const snapshot = {
        milestones: milestones.map(m => ({ name: m.name, description: m.description })),
        tasks: tasks.map(t => ({
          title: t.title, milestoneIndex: t.milestone_id ? milestoneIndexById.get(t.milestone_id) ?? null : null,
          priority: t.priority, tags: t.tags, isBillable: t.is_billable,
        })),
      };
      const row = await trx.insertInto('project_templates').values({
        id: body.id, tenant_id: user.tenant_id, name: body.name.trim(), description: body.description || null,
        color: project.color, billing_type: project.billing_type,
        snapshot: JSON.stringify(snapshot) as unknown as Record<string, unknown>, created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string } }>('/templates/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('project_templates').select('id')
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Template not found' });
      await trx.deleteFrom('project_templates').where('id', '=', request.params.id).execute();
      reply.status(204);
      return null;
    });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      const project = await trx.selectFrom('projects')
        .leftJoin('users as owner_user', 'owner_user.id', 'projects.owner_id')
        .leftJoin('customers', 'customers.id', 'projects.customer_id')
        .where('projects.id', '=', request.params.id)
        .selectAll('projects').select(['owner_user.name as owner_name', 'customers.name as customer_name'])
        .executeTakeFirstOrThrow();

      // Days-left: a simple start->target span, clamped so a project already
      // past its deadline reads 0 rather than negative.
      let daysTotal: number | null = null;
      let daysLeft: number | null = null;
      if (project.start_date && project.target_date) {
        const start = new Date(project.start_date as unknown as string);
        const target = new Date(project.target_date as unknown as string);
        const today = new Date(new Date().toISOString().slice(0, 10));
        daysTotal = Math.max(0, Math.round((target.getTime() - start.getTime()) / 86400000));
        daysLeft = Math.max(0, Math.min(daysTotal, Math.round((target.getTime() - today.getTime()) / 86400000)));
      }

      // Real logged-hours-per-day for the last 7 days, from task_time_entries
      // on this project's tasks — no expense-tracking entity exists yet, so
      // the Expenses card below is genuinely zero, not a placeholder faking
      // a number (matches what the reference itself shows for a project
      // with no expense line items recorded).
      const loggedRows = await trx.selectFrom('task_time_entries')
        .innerJoin('tasks', 'tasks.id', 'task_time_entries.task_id')
        .where('tasks.project_id', '=', request.params.id)
        .where('task_time_entries.ended_at', 'is not', null)
        .where('task_time_entries.started_at', '>=', sql<Date>`now() - interval '7 days'`)
        .select([
          sql<string>`date_trunc('day', task_time_entries.started_at)`.as('day'),
          ({ fn }) => fn.sum<number>('task_time_entries.duration_minutes').as('minutes'),
        ])
        .groupBy(sql`date_trunc('day', task_time_entries.started_at)`)
        .execute();
      const loggedHoursByDay = loggedRows.map(r => ({ day: r.day, minutes: Number(r.minutes || 0) }));
      const totalLoggedMinutes = loggedHoursByDay.reduce((sum, r) => sum + r.minutes, 0);

      // Real Billed/Unbilled (M15, migration 326) — for an hourly project,
      // summed from actual billable time entries split on whether
      // invoice_id is set; for fixed-rate, the flat total_rate is either
      // fully billed or fully unbilled depending on invoiced_at. No
      // expense-line-item entity exists yet, so "total"/"billable" here
      // mean the same thing (every billable amount is potentially
      // invoiceable) — not a placeholder, just what's genuinely there.
      let expenses = { total: 0, billable: 0, billed: 0, unbilled: 0 };
      if (project.billing_type === 'hourly') {
        const billableRows = await trx.selectFrom('task_time_entries')
          .innerJoin('tasks', 'tasks.id', 'task_time_entries.task_id')
          .where('tasks.project_id', '=', request.params.id).where('tasks.is_billable', '=', true)
          .where('tasks.hourly_rate', 'is not', null).where('task_time_entries.ended_at', 'is not', null)
          .select(['task_time_entries.duration_minutes', 'task_time_entries.invoice_id', 'tasks.hourly_rate'])
          .execute();
        for (const r of billableRows) {
          const amount = ((r.duration_minutes || 0) / 60) * Number(r.hourly_rate);
          expenses.total += amount; expenses.billable += amount;
          if (r.invoice_id) expenses.billed += amount; else expenses.unbilled += amount;
        }
      } else if (project.total_rate) {
        const rate = Number(project.total_rate);
        expenses = { total: rate, billable: rate, billed: project.invoiced_at ? rate : 0, unbilled: project.invoiced_at ? 0 : rate };
      }
      expenses = { total: +expenses.total.toFixed(2), billable: +expenses.billable.toFixed(2), billed: +expenses.billed.toFixed(2), unbilled: +expenses.unbilled.toFixed(2) };

      return {
        data: {
          ...project, access: resolved.access,
          days_total: daysTotal, days_left: daysLeft,
          logged_hours_by_day: loggedHoursByDay, total_logged_minutes: totalLoggedMinutes,
          expenses,
        },
      };
    });
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user;
    const body = projectPatchSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      if (!canManageProject(resolved.access)) return reply.status(403).send({ error: 'Only a project owner or admin can edit this project' });
      const existing = await trx.selectFrom('projects').select(['status', 'name'])
        .where('id', '=', request.params.id).executeTakeFirstOrThrow();

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.description !== undefined) updates.description = body.description;
      if (body.color !== undefined) updates.color = body.color;
      if (body.status !== undefined) updates.status = body.status;
      if (body.startDate !== undefined) updates.start_date = body.startDate || null;
      if (body.targetDate !== undefined) updates.target_date = body.targetDate || null;
      if (body.customerId !== undefined) updates.customer_id = body.customerId;
      if (body.billingType !== undefined) updates.billing_type = body.billingType;
      if (body.totalRate !== undefined) updates.total_rate = body.totalRate != null ? String(body.totalRate) : null;
      if (body.currency !== undefined) updates.currency = body.currency;

      const row = await trx.updateTable('projects').set(updates)
        .where('id', '=', request.params.id).returningAll().executeTakeFirstOrThrow();

      // Real activity feed (migration 320) — only status changes, not every
      // field PATCH, same "worth a timeline row" bar tasks.routes.ts uses.
      if (body.status !== undefined && body.status !== existing.status) {
        await trx.insertInto('project_activity_log').values({
          id: crypto.randomUUID(), tenant_id: user.tenant_id, project_id: row.id, actor_id: user.sub,
          action: 'status_changed', detail: JSON.stringify({ from: existing.status, to: body.status }) as unknown as Record<string, unknown>,
        }).execute();
      }

      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      if (!canManageProject(resolved.access)) return reply.status(403).send({ error: 'Only a project owner or admin can delete this project' });
      // Tasks filed under this project just lose the link (ON DELETE SET
      // NULL, migration 308) — they stay in whatever list they were already
      // in, they aren't deleted. Milestones cascade-delete with the project.
      await trx.deleteFrom('projects').where('id', '=', request.params.id).execute();
      reply.status(204);
      return null;
    });
  });

  // ── Members ────────────────────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/:id/members', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      const rows = await trx.selectFrom('project_members')
        .innerJoin('users', 'users.id', 'project_members.user_id')
        .where('project_members.project_id', '=', request.params.id)
        .select(['project_members.id', 'project_members.user_id', 'project_members.role', 'project_members.added_at',
          'users.name', 'users.email', 'users.avatar_url'])
        .orderBy('project_members.added_at', 'asc').execute();
      return { data: rows };
    });
  });

  fastify.post<{ Params: { id: string } }>('/:id/members', async (request, reply) => {
    const user = request.user;
    const body = memberAddSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      if (!canManageProject(resolved.access)) return reply.status(403).send({ error: 'Only a project owner or admin can add members' });
      const target = await trx.selectFrom('users').select(['id', 'name'])
        .where('id', '=', body.userId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!target) return reply.status(404).send({ error: 'User not found' });
      const row = await trx.insertInto('project_members').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, project_id: request.params.id,
        user_id: body.userId, role: body.role || 'member',
      })
      .onConflict(oc => oc.columns(['project_id', 'user_id']).doUpdateSet({ role: body.role || 'member' }))
      .returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('project_activity_log').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, project_id: request.params.id, actor_id: user.sub,
        action: 'member_added', detail: JSON.stringify({ userId: body.userId, name: target.name }) as unknown as Record<string, unknown>,
      }).execute();
      reply.status(201);
      return { data: row };
    });
  });

  fastify.patch<{ Params: { id: string; userId: string } }>('/:id/members/:userId', async (request, reply) => {
    const user = request.user;
    const body = memberPatchSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      if (!canManageProject(resolved.access)) return reply.status(403).send({ error: 'Only a project owner or admin can change roles' });
      const row = await trx.updateTable('project_members').set({ role: body.role })
        .where('project_id', '=', request.params.id).where('user_id', '=', request.params.userId)
        .returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Member not found' });
      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string; userId: string } }>('/:id/members/:userId', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      // A member may remove themselves (leave the project); removing anyone
      // else needs owner/admin.
      if (request.params.userId !== user.sub && !canManageProject(resolved.access)) {
        return reply.status(403).send({ error: 'Only a project owner or admin can remove other members' });
      }
      const removed = await trx.deleteFrom('project_members')
        .where('project_id', '=', request.params.id).where('user_id', '=', request.params.userId)
        .returning('user_id').executeTakeFirst();
      if (removed) {
        const target = await trx.selectFrom('users').select('name').where('id', '=', request.params.userId).executeTakeFirst();
        await trx.insertInto('project_activity_log').values({
          id: crypto.randomUUID(), tenant_id: user.tenant_id, project_id: request.params.id, actor_id: user.sub,
          action: 'member_removed', detail: JSON.stringify({ userId: request.params.userId, name: target?.name }) as unknown as Record<string, unknown>,
        }).execute();
      }
      reply.status(204);
      return null;
    });
  });

  // ── Timesheets (M5) — a flat, filterable/exportable log of closed time
  // entries against this project's tasks, with billable-rate totals. Not a
  // per-period submit/approve workflow (that's hr_timesheet_approvals'
  // shape, for HR-tracked staff time) — a project can span many people on
  // many tasks, so forcing one shared approval queue here would be the
  // wrong scope; a flat log is what every reference tool actually shows on
  // a project's Timesheets tab.

  fastify.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>('/:id/timesheets', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });

      let query = trx.selectFrom('task_time_entries')
        .innerJoin('tasks', 'tasks.id', 'task_time_entries.task_id')
        .innerJoin('users', 'users.id', 'task_time_entries.user_id')
        .where('tasks.project_id', '=', request.params.id)
        .where('task_time_entries.ended_at', 'is not', null);
      if (request.query.from) query = query.where('task_time_entries.started_at', '>=', new Date(request.query.from));
      if (request.query.to) query = query.where('task_time_entries.started_at', '<=', new Date(request.query.to + 'T23:59:59'));

      const rows = await query
        .select([
          'task_time_entries.id', 'task_time_entries.task_id', 'task_time_entries.user_id',
          'task_time_entries.started_at', 'task_time_entries.ended_at', 'task_time_entries.duration_minutes',
          'tasks.title as task_title', 'tasks.is_billable', 'tasks.hourly_rate',
          'users.name as user_name',
        ])
        .orderBy('task_time_entries.started_at', 'desc')
        .execute();

      const data = rows.map(r => {
        const minutes = r.duration_minutes || 0;
        const amount = r.is_billable && r.hourly_rate ? +((minutes / 60) * Number(r.hourly_rate)).toFixed(2) : 0;
        return { ...r, amount };
      });
      const totals = data.reduce((acc, r) => {
        acc.totalMinutes += r.duration_minutes || 0;
        if (r.is_billable) { acc.billableMinutes += r.duration_minutes || 0; acc.billableAmount += r.amount; }
        return acc;
      }, { totalMinutes: 0, billableMinutes: 0, billableAmount: 0 });

      return { data, totals };
    });
  });

  // ── Invoicing (M15, migration 326) — mirrors fleetOps.routes.ts's own
  // POST /trips/:id/bill-expenses EXACTLY: a Draft sales_invoices row +
  // lines built from real billable child rows, and deliberately NO GL
  // posting here — that stays inside the existing POST /v1/invoices
  // finalize flow, exactly like the fleet precedent's own comment says.
  // Real double-billing guards: hourly stamps task_time_entries.invoice_id
  // and filters IS NULL on the next attempt; fixed-rate uses
  // projects.invoiced_at since there's no per-row source to stamp.

  fastify.post<{ Params: { id: string } }>('/:id/invoice', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      if (!canManageProject(resolved.access)) return reply.status(403).send({ error: 'Only a project owner or admin can invoice this project' });
      const project = await trx.selectFrom('projects').selectAll().where('id', '=', request.params.id).executeTakeFirstOrThrow();
      if (!project.customer_id) return reply.status(400).send({ error: 'This project has no customer to bill — set a customer on the project first.' });

      const invoiceNumber = await getNextDocNumber(trx, user.tenant_id, 'invoice');

      if (project.billing_type === 'hourly') {
        const billable = await trx.selectFrom('task_time_entries')
          .innerJoin('tasks', 'tasks.id', 'task_time_entries.task_id')
          .where('tasks.project_id', '=', request.params.id).where('tasks.is_billable', '=', true)
          .where('tasks.hourly_rate', 'is not', null)
          .where('task_time_entries.ended_at', 'is not', null).where('task_time_entries.invoice_id', 'is', null)
          .select(['task_time_entries.id as entry_id', 'task_time_entries.task_id', 'task_time_entries.duration_minutes', 'tasks.title', 'tasks.hourly_rate'])
          .execute();
        if (billable.length === 0) {
          return reply.status(400).send({ error: 'No unbilled billable time on this project — nothing to invoice.' });
        }

        const invoice = await trx.insertInto('sales_invoices').values({
          tenant_id: user.tenant_id, invoice_number: invoiceNumber, project_id: request.params.id,
          customer_id: project.customer_id, client_address: '[]', bill_date: new Date(),
          status: 'Draft', received: 0, version: 1, currency: project.currency,
          notes: `Project time — ${project.name}.`, created_by: user.sub,
        } as any).returningAll().executeTakeFirstOrThrow();

        // One line per task (not one per raw time entry) — a cleaner
        // invoice, and rate is per-task anyway (tasks.hourly_rate).
        const byTask = new Map<string, { title: string; rate: number; minutes: number }>();
        for (const e of billable) {
          const g = byTask.get(e.task_id) ?? { title: e.title, rate: Number(e.hourly_rate), minutes: 0 };
          g.minutes += e.duration_minutes || 0;
          byTask.set(e.task_id, g);
        }
        const lines = [...byTask.values()];
        await trx.insertInto('sales_invoice_lines').values(lines.map((l, i) => ({
          invoice_id: invoice.id, name: l.title, unit: 'HR', rate: l.rate, qty: +((l.minutes / 60).toFixed(2)),
          line_group: 'other', currency: project.currency, sort_order: i,
        }))).execute();

        await trx.updateTable('task_time_entries').set({ invoice_id: invoice.id })
          .where('id', 'in', billable.map(e => e.entry_id)).where('tenant_id', '=', user.tenant_id).execute();

        reply.status(201);
        return { data: invoice, billed_entries: billable.length };
      }

      // Fixed-rate
      if (project.invoiced_at) return reply.status(400).send({ error: 'This project has already been invoiced.' });
      if (!project.total_rate || Number(project.total_rate) <= 0) {
        return reply.status(400).send({ error: 'Set a Total Rate on this project before invoicing.' });
      }
      const invoice = await trx.insertInto('sales_invoices').values({
        tenant_id: user.tenant_id, invoice_number: invoiceNumber, project_id: request.params.id,
        customer_id: project.customer_id, client_address: '[]', bill_date: new Date(),
        status: 'Draft', received: 0, version: 1, currency: project.currency,
        notes: `Project — ${project.name}.`, created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('sales_invoice_lines').values([{
        invoice_id: invoice.id, name: project.name, unit: 'FLAT', rate: Number(project.total_rate), qty: 1,
        line_group: 'other', currency: project.currency, sort_order: 0,
      }]).execute();
      await trx.updateTable('projects').set({ invoiced_at: new Date().toISOString() }).where('id', '=', request.params.id).execute();

      reply.status(201);
      return { data: invoice };
    });
  });

  // ── Sales (M17) — real filtered view of invoices linked via M15's
  // sales_invoices.project_id. No new entity.

  fastify.get<{ Params: { id: string } }>('/:id/invoices', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      const rows = await trx.selectFrom('sales_invoices')
        .select(['id', 'invoice_number', 'status', 'currency', 'received', 'bill_date', 'due_date', 'created_at'])
        .where('project_id', '=', request.params.id).where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc').execute();
      const lineTotals = rows.length
        ? await trx.selectFrom('sales_invoice_lines')
            .where('invoice_id', 'in', rows.map(r => r.id))
            .select(['invoice_id', ({ fn }) => fn.sum<number>(sql`rate * qty`).as('total')])
            .groupBy('invoice_id').execute()
        : [];
      const totalByInvoice = new Map(lineTotals.map(l => [l.invoice_id, Number(l.total || 0)]));
      return { data: rows.map(r => ({ ...r, total: totalByInvoice.get(r.id) || 0 })) };
    });
  });

  // ── Retainer read (M16, migration 327) — a thin, read-only view of
  // whatever recurring_invoices row is scoped to this project (there's
  // normally at most one — "Set up retainer" is a one-time action). Actual
  // creation/editing happens through the real, already-gated
  // POST/PATCH /v1/invoices/recurring — not duplicated here.

  fastify.get<{ Params: { id: string } }>('/:id/retainer', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      const row = await trx.selectFrom('recurring_invoices').selectAll()
        .where('project_id', '=', request.params.id).where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc').executeTakeFirst();
      return { data: row ?? null };
    });
  });

  // ── Activity (M8, migration 320) — project-level events UNIONed at read
  // time (in application code, not SQL UNION) with every task_activity_log
  // row for this project's tasks, so status/milestone/priority changes on
  // individual tasks surface in the same project-wide timeline.

  fastify.get<{ Params: { id: string } }>('/:id/activity', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });

      const [projectRows, taskRows] = await Promise.all([
        trx.selectFrom('project_activity_log')
          .innerJoin('users', 'users.id', 'project_activity_log.actor_id')
          .where('project_activity_log.project_id', '=', request.params.id)
          .select(['project_activity_log.id', 'project_activity_log.action', 'project_activity_log.detail',
            'project_activity_log.created_at', 'users.name as actor_name'])
          .execute(),
        trx.selectFrom('task_activity_log')
          .innerJoin('tasks', 'tasks.id', 'task_activity_log.task_id')
          .innerJoin('users', 'users.id', 'task_activity_log.actor_id')
          .where('tasks.project_id', '=', request.params.id)
          .select(['task_activity_log.id', 'task_activity_log.action', 'task_activity_log.detail',
            'task_activity_log.created_at', 'users.name as actor_name', 'tasks.title as task_title'])
          .execute(),
      ]);
      const combined = [
        ...projectRows.map(r => ({ ...r, task_title: null as string | null })),
        ...taskRows,
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 200);

      return { data: combined };
    });
  });

  // ── Workload (M10) — real logged-minutes per project member, from
  // task_time_entries.user_id (who actually logged the time, not just who a
  // task is assigned to — those can differ). Open-task-count per member is
  // cheap to derive client-side from the already-loaded task feed, so it's
  // not duplicated here.

  fastify.get<{ Params: { id: string } }>('/:id/workload', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      const rows = await trx.selectFrom('task_time_entries')
        .innerJoin('tasks', 'tasks.id', 'task_time_entries.task_id')
        .innerJoin('users', 'users.id', 'task_time_entries.user_id')
        .where('tasks.project_id', '=', request.params.id)
        .where('task_time_entries.ended_at', 'is not', null)
        .select([
          'task_time_entries.user_id', 'users.name', 'users.avatar_url',
          ({ fn }) => fn.sum<number>('task_time_entries.duration_minutes').as('logged_minutes'),
        ])
        .groupBy(['task_time_entries.user_id', 'users.name', 'users.avatar_url'])
        .execute();
      return { data: rows.map(r => ({ ...r, logged_minutes: Number(r.logged_minutes || 0) })) };
    });
  });

  // ── Dependencies, bulk read for the Gantt (M9) — the per-task
  // GET/POST/DELETE endpoints for editing a single task's dependencies live
  // on tasks.routes.ts (migration 319); this is a read-only project-scoped
  // fan-out over the same task_dependencies table so the Gantt can draw
  // every connector line in one request instead of one per task.

  fastify.get<{ Params: { id: string } }>('/:id/dependencies', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      const rows = await trx.selectFrom('task_dependencies')
        .innerJoin('tasks', 'tasks.id', 'task_dependencies.task_id')
        .where('tasks.project_id', '=', request.params.id).where('task_dependencies.tenant_id', '=', user.tenant_id)
        .select(['task_dependencies.task_id', 'task_dependencies.depends_on_task_id'])
        .execute();
      return { data: rows };
    });
  });

  // ── Discussions (M12, migration 323) — exact shape of todo_comments,
  // keyed on project_id instead of task_id; notifies every other project
  // member plus anyone @mentioned, mirroring tasks.routes.ts's own
  // comment-notification pattern (there it's owner+assignee since a task
  // has one of each; here it's the whole roster since a project's a shared,
  // multi-person container).

  fastify.get<{ Params: { id: string } }>('/:id/discussions', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      const rows = await trx.selectFrom('project_discussions')
        .innerJoin('users', 'users.id', 'project_discussions.author_id')
        .select(['project_discussions.id', 'project_discussions.content', 'project_discussions.mentions',
          'project_discussions.created_at', 'project_discussions.author_id', 'users.name as author_name'])
        .where('project_discussions.project_id', '=', request.params.id)
        .orderBy('project_discussions.created_at', 'asc').execute();
      return { data: rows };
    });
  });

  fastify.post<{ Params: { id: string } }>('/:id/discussions', async (request, reply) => {
    const user = request.user;
    const body = discussionCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      if (!canEditProject(resolved.access)) return reply.status(403).send({ error: 'You only have view access to this project' });

      const row = await trx.insertInto('project_discussions').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, project_id: request.params.id,
        author_id: user.sub, content: body.content.trim(),
        mentions: JSON.stringify(body.mentions ?? []) as unknown as { user_id: string; name: string }[],
      }).returningAll().executeTakeFirstOrThrow();

      const projectName = (await trx.selectFrom('projects').select('name').where('id', '=', request.params.id).executeTakeFirst())?.name ?? 'this project';
      const roster = await trx.selectFrom('project_members').select('user_id').where('project_id', '=', request.params.id).execute();
      const notifyIds = new Set<string>((body.mentions ?? []).map(m => m.user_id));
      for (const r of roster) notifyIds.add(r.user_id);
      notifyIds.delete(user.sub);

      const actorName = (user as { name?: string }).name ?? 'Someone';
      for (const uid of notifyIds) {
        const recipient = await trx.selectFrom('users').select(['name', 'email']).where('id', '=', uid).executeTakeFirst();
        if (!recipient) continue;
        const title = `${actorName} posted in "${projectName}"`;
        await NotificationService.createNotification({
          tenantId: user.tenant_id, userId: uid, app: 'tasks', type: 'mention',
          title, message: body.content.trim(), link: '/projects', entityType: 'project', entityId: request.params.id,
        }).catch(err => console.error('[Projects] Failed to notify on discussion post:', err.message));
        await MailService.sendNow(user.tenant_id, {
          to: recipient.email, subject: title,
          bodyHtml: `<p>Hi ${recipient.name},</p><p>${actorName} posted in <strong>${projectName}</strong>:</p><p>${body.content.trim()}</p>`,
          sourceApp: 'tasks',
        }).catch(err => console.error('[Projects] Failed to email on discussion post:', err.message));
      }

      reply.status(201);
      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string; discussionId: string } }>('/:id/discussions/:discussionId', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('project_discussions').select('author_id')
        .where('id', '=', request.params.discussionId).where('project_id', '=', request.params.id).where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      if (!row) { reply.status(204); return null; }
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      if (row.author_id !== user.sub && !canManageProject(resolved.access)) {
        return reply.status(403).send({ error: 'Only the author or a project owner/admin can delete this' });
      }
      await trx.deleteFrom('project_discussions').where('id', '=', request.params.discussionId).execute();
      reply.status(204);
      return null;
    });
  });

  // ── Tickets (M13, migration 324) — nullable support_tickets.project_id
  // on the existing generic Tickets table, not a new entity. "Create new"
  // reuses the same createTicketRow() the real ticket-creation UI and the
  // IMAP ingest job both already go through, so a project ticket gets
  // exactly the same auto-assign/notification behavior as any other.

  fastify.get<{ Params: { id: string } }>('/:id/tickets', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      const rows = await trx.selectFrom('support_tickets')
        .select(['id', 'ref_number', 'subject', 'status', 'priority', 'category', 'created_at', 'resolved_at'])
        .where('project_id', '=', request.params.id).where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc').execute();
      return { data: rows };
    });
  });

  fastify.post<{ Params: { id: string } }>('/:id/tickets/link', async (request, reply) => {
    const user = request.user;
    const body = ticketLinkSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      const project = await trx.selectFrom('projects').select('customer_id').where('id', '=', request.params.id).executeTakeFirstOrThrow();
      const ticket = await trx.selectFrom('support_tickets').select(['id', 'customer_id'])
        .where('id', '=', body.ticketId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
      if (project.customer_id && ticket.customer_id !== project.customer_id) {
        return reply.status(400).send({ error: "That ticket belongs to a different customer than this project" });
      }
      await trx.updateTable('support_tickets').set({ project_id: request.params.id }).where('id', '=', body.ticketId).execute();
      reply.status(204);
      return null;
    });
  });

  fastify.post<{ Params: { id: string } }>('/:id/tickets', async (request, reply) => {
    const user = request.user;
    const body = ticketCreateForProjectSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      const project = await trx.selectFrom('projects').select('customer_id').where('id', '=', request.params.id).executeTakeFirstOrThrow();
      if (!project.customer_id) return reply.status(400).send({ error: 'This project has no customer — link an existing ticket instead, or set a customer on the project first' });
      const ticket = await createTicketRow(trx, user.tenant_id, {
        customerId: project.customer_id, subject: body.subject, description: body.description,
        channel: 'IN_APP', priority: body.priority, category: body.category,
      });
      await trx.updateTable('support_tickets').set({ project_id: request.params.id }).where('id', '=', ticket.id).execute();
      reply.status(201);
      return { data: { ...ticket, project_id: request.params.id } };
    });
  });

  // ── Milestones ─────────────────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/:id/milestones', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      const milestones = await trx.selectFrom('milestones').selectAll()
        .where('project_id', '=', request.params.id).orderBy('sort_order', 'asc').execute();
      const taskCounts = await trx.selectFrom('tasks')
        .where('project_id', '=', request.params.id).where('milestone_id', 'is not', null).where('deleted_at', 'is', null)
        .select(['milestone_id', ({ fn }) => fn.countAll<number>().as('total'),
          ({ fn }) => fn.countAll<number>().filterWhere('completed', '=', true).as('done')])
        .groupBy('milestone_id').execute();
      const countsByMilestone = new Map(taskCounts.map(r => [r.milestone_id, { total: Number(r.total), done: Number(r.done || 0) }]));
      return {
        data: milestones.map(m => ({
          ...m, task_count: countsByMilestone.get(m.id)?.total || 0, task_done_count: countsByMilestone.get(m.id)?.done || 0,
        })),
      };
    });
  });

  fastify.post<{ Params: { id: string } }>('/:id/milestones', async (request, reply) => {
    const user = request.user;
    const body = milestoneCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      if (!canEditProject(resolved.access)) return reply.status(403).send({ error: 'You only have view access to this project' });
      const siblingCount = await trx.selectFrom('milestones').select(({ fn }) => fn.countAll<number>().as('count'))
        .where('project_id', '=', request.params.id).executeTakeFirst();
      const row = await trx.insertInto('milestones').values({
        id: body.id, tenant_id: user.tenant_id, project_id: request.params.id, name: body.name.trim(),
        description: body.description || null, due_date: body.dueDate || null, status: body.status || 'upcoming',
        sort_order: Number(siblingCount?.count ?? 0),
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return { data: { ...row, task_count: 0, task_done_count: 0 } };
    });
  });

  fastify.patch<{ Params: { id: string; milestoneId: string } }>('/:id/milestones/:milestoneId', async (request, reply) => {
    const user = request.user;
    const body = milestonePatchSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      if (!canEditProject(resolved.access)) return reply.status(403).send({ error: 'You only have view access to this project' });

      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.description !== undefined) updates.description = body.description;
      if (body.dueDate !== undefined) updates.due_date = body.dueDate || null;
      if (body.status !== undefined) updates.status = body.status;
      if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;

      const row = await trx.updateTable('milestones').set(updates)
        .where('id', '=', request.params.milestoneId).where('project_id', '=', request.params.id)
        .returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Milestone not found' });
      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string; milestoneId: string } }>('/:id/milestones/:milestoneId', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const resolved = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, request.params.id);
      if (!resolved) return reply.status(404).send({ error: 'Project not found' });
      if (!canEditProject(resolved.access)) return reply.status(403).send({ error: 'You only have view access to this project' });
      // Tasks under this milestone just lose the link (ON DELETE SET NULL) —
      // they stay in the project, only the milestone grouping is removed.
      await trx.deleteFrom('milestones')
        .where('id', '=', request.params.milestoneId).where('project_id', '=', request.params.id).execute();
      reply.status(204);
      return null;
    });
  });
}
