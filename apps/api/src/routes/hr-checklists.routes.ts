/**
 * Onboarding/offboarding checklists.
 *
 * One editable template per type per tenant (not a template library) — an
 * admin maintains "our onboarding checklist" and "our offboarding
 * checklist" here. Real per-person instances are generated automatically
 * by subscribers/hr-checklists.subscribers.ts, reacting to the same
 * user.joined / hr.staff_deactivated events Ondi's own joiner/leaver
 * automation already listens for — not a new trigger, a new reaction to
 * ones that already fire.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const MGMT = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;
const TYPES = ['onboarding', 'offboarding'] as const;

export async function hrChecklistsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('nexushr'));
  fastify.addHook('preHandler', requireRole(...MGMT));

  // ── Templates ────────────────────────────────────────────────
  // GET /templates/:type — the one template for this type, with its items
  fastify.get<{ Params: { type: string } }>('/templates/:type', async (request, reply) => {
    const user = request.user;
    const type = request.params.type;
    if (!TYPES.includes(type as any)) return reply.status(400).send({ error: 'Unknown checklist type.' });
    return withTenant(user.tenant_id, async (trx) => {
      const template = await trx.selectFrom('hr_checklist_templates')
        .selectAll().where('tenant_id', '=', user.tenant_id).where('type', '=', type as any).executeTakeFirst();
      if (!template) return { type, items: [] };
      const items = await trx.selectFrom('hr_checklist_template_items').selectAll()
        .where('template_id', '=', template.id).orderBy('sort_order').execute();
      return { ...template, items };
    });
  });

  // PUT /templates/:type — replace the whole item list (simplest honest
  // model for "edit our checklist": reorder/add/remove all happen as one
  // save, no separate drag-reorder endpoint to keep in sync).
  fastify.put<{ Params: { type: string }; Body: { items: string[] } }>('/templates/:type', async (request, reply) => {
    const user = request.user;
    const type = request.params.type;
    if (!TYPES.includes(type as any)) return reply.status(400).send({ error: 'Unknown checklist type.' });
    const { items } = z.object({ items: z.array(z.string().trim().min(1).max(300)).max(50) }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const template = await trx.insertInto('hr_checklist_templates')
        .values({ tenant_id: user.tenant_id, type: type as any })
        .onConflict(oc => oc.columns(['tenant_id', 'type']).doUpdateSet({ updated_at: new Date() }))
        .returningAll().executeTakeFirstOrThrow();

      await trx.deleteFrom('hr_checklist_template_items').where('template_id', '=', template.id).execute();
      if (items.length) {
        await trx.insertInto('hr_checklist_template_items').values(
          items.map((label, i) => ({ tenant_id: user.tenant_id, template_id: template.id, label, sort_order: i }))
        ).execute();
      }
      return { success: true };
    });
  });

  // ── Instances ────────────────────────────────────────────────
  fastify.get<{ Querystring: { employee_id?: string; type?: string; status?: string } }>('/', async (request) => {
    const user = request.user;
    const { employee_id, type, status } = request.query;
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('hr_checklists as c')
        .innerJoin('users as e', 'e.id', 'c.employee_id')
        .select(['c.id', 'c.employee_id', 'c.type', 'c.status', 'c.created_at', 'c.completed_at', 'e.name as employee_name'])
        .where('c.tenant_id', '=', user.tenant_id)
        .orderBy('c.created_at', 'desc');
      if (employee_id) q = q.where('c.employee_id', '=', employee_id);
      if (type) q = q.where('c.type', '=', type as 'onboarding' | 'offboarding');
      if (status) q = q.where('c.status', '=', status as 'in_progress' | 'completed');
      const rows = await q.execute();

      const ids = rows.map(r => r.id);
      const itemCounts = ids.length
        ? await trx.selectFrom('hr_checklist_items')
            .select([
              'checklist_id',
              ({ fn }) => fn.countAll<number>().as('total'),
              // Postgres has no sum(boolean) — filterWhere is the real fix,
              // not a ::int cast bolted onto sum().
              ({ fn }) => fn.countAll<number>().filterWhere('done', '=', true).as('done_count'),
            ])
            .where('checklist_id', 'in', ids).groupBy('checklist_id').execute()
        : [];
      return rows.map(r => {
        const c = itemCounts.find(i => i.checklist_id === r.id);
        return { ...r, total_items: Number(c?.total ?? 0), done_items: Number(c?.done_count ?? 0) };
      });
    });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params;
    return withTenant(user.tenant_id, async (trx) => {
      const checklist = await trx.selectFrom('hr_checklists as c')
        .innerJoin('users as e', 'e.id', 'c.employee_id')
        .select(['c.id', 'c.employee_id', 'c.type', 'c.status', 'c.created_at', 'c.completed_at', 'e.name as employee_name', 'e.email as employee_email'])
        .where('c.id', '=', id).where('c.tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!checklist) return reply.status(404).send({ error: 'Checklist not found' });

      const items = await trx.selectFrom('hr_checklist_items as i')
        .leftJoin('users as d', 'd.id', 'i.done_by')
        .select(['i.id', 'i.label', 'i.sort_order', 'i.done', 'i.done_at', 'd.name as done_by_name'])
        .where('i.checklist_id', '=', id).orderBy('i.sort_order').execute();

      return { ...checklist, items };
    });
  });

  fastify.patch<{ Params: { itemId: string }; Body: { done: boolean } }>('/items/:itemId', async (request, reply) => {
    const user = request.user;
    const { itemId } = request.params;
    const { done } = z.object({ done: z.boolean() }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const item = await trx.updateTable('hr_checklist_items')
        .set({ done, done_by: done ? user.sub : null, done_at: done ? new Date() : null })
        .where('id', '=', itemId).where('tenant_id', '=', user.tenant_id)
        .returning(['checklist_id']).executeTakeFirst();
      if (!item) return reply.status(404).send({ error: 'Item not found' });

      // Auto-complete the checklist once every item is checked; auto-reopen
      // if one gets unchecked after that.
      const remaining = await trx.selectFrom('hr_checklist_items').select('id')
        .where('checklist_id', '=', item.checklist_id).where('done', '=', false).executeTakeFirst();
      await trx.updateTable('hr_checklists')
        .set(remaining ? { status: 'in_progress', completed_at: null } : { status: 'completed', completed_at: new Date() })
        .where('id', '=', item.checklist_id).execute();

      return { success: true };
    });
  });
}
