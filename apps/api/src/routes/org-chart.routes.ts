import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

const SEED_NODES = (tenantId: string) => [
  { label: 'Chief Executive Officer', job_title: 'CEO', department: 'Executive', position_x: 400, position_y: 20,  color: '#7c3aed', avatar_color: '#7c3aed', node_type: 'person' },
  { label: 'Chief Operations Officer', job_title: 'COO', department: 'Executive', position_x: 150, position_y: 170, color: '#0891b2', avatar_color: '#0891b2', node_type: 'person' },
  { label: 'Chief Financial Officer',  job_title: 'CFO', department: 'Finance',   position_x: 650, position_y: 170, color: '#059669', avatar_color: '#059669', node_type: 'person' },
  { label: 'Head of Logistics',        job_title: 'Manager', department: 'Operations', position_x: 0,   position_y: 340, color: '#0891b2', avatar_color: '#0891b2', node_type: 'person' },
  { label: 'Head of Clearance',        job_title: 'Manager', department: 'Clearance',  position_x: 300, position_y: 340, color: '#0891b2', avatar_color: '#0891b2', node_type: 'person' },
  { label: 'Finance Manager',          job_title: 'Manager', department: 'Finance',    position_x: 600, position_y: 340, color: '#059669', avatar_color: '#059669', node_type: 'person' },
  { label: 'HR Manager',               job_title: 'Manager', department: 'HR',         position_x: 900, position_y: 340, color: '#f59e0b', avatar_color: '#f59e0b', node_type: 'person' },
];

export async function orgChartRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /org-chart — returns all nodes for the tenant
  fastify.get('/', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      let nodes = await trx.selectFrom('org_chart_nodes')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at')
        .execute();

      // Seed default chart if empty
      if (nodes.length === 0) {
        const seeds = SEED_NODES(user.tenant_id);
        const inserted: any[] = [];
        // CEO first
        const ceo = await trx.insertInto('org_chart_nodes').values({
          tenant_id: user.tenant_id, ...seeds[0], user_id: null, email: null, phone: null, parent_id: null,
        }).returningAll().executeTakeFirstOrThrow();
        inserted.push(ceo);

        // Direct reports to CEO
        const [coo, cfo] = await Promise.all([
          trx.insertInto('org_chart_nodes').values({ tenant_id: user.tenant_id, ...seeds[1], user_id: null, email: null, phone: null, parent_id: ceo.id }).returningAll().executeTakeFirstOrThrow(),
          trx.insertInto('org_chart_nodes').values({ tenant_id: user.tenant_id, ...seeds[2], user_id: null, email: null, phone: null, parent_id: ceo.id }).returningAll().executeTakeFirstOrThrow(),
        ]);
        inserted.push(coo, cfo);

        // Level 3
        await Promise.all([
          trx.insertInto('org_chart_nodes').values({ tenant_id: user.tenant_id, ...seeds[3], user_id: null, email: null, phone: null, parent_id: coo.id }).returningAll().executeTakeFirstOrThrow(),
          trx.insertInto('org_chart_nodes').values({ tenant_id: user.tenant_id, ...seeds[4], user_id: null, email: null, phone: null, parent_id: coo.id }).returningAll().executeTakeFirstOrThrow(),
          trx.insertInto('org_chart_nodes').values({ tenant_id: user.tenant_id, ...seeds[5], user_id: null, email: null, phone: null, parent_id: cfo.id }).returningAll().executeTakeFirstOrThrow(),
          trx.insertInto('org_chart_nodes').values({ tenant_id: user.tenant_id, ...seeds[6], user_id: null, email: null, phone: null, parent_id: cfo.id }).returningAll().executeTakeFirstOrThrow(),
        ]);

        nodes = await trx.selectFrom('org_chart_nodes').selectAll()
          .where('tenant_id', '=', user.tenant_id).orderBy('created_at').execute();
      }

      return nodes;
    });
  });

  // POST /org-chart — create a node
  fastify.post('/', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (req) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('org_chart_nodes').values({
        tenant_id:    user.tenant_id,
        user_id:      body.user_id      ?? null,
        label:        body.label        ?? 'New Role',
        job_title:    body.job_title    ?? null,
        department:   body.department   ?? null,
        email:        body.email        ?? null,
        phone:        body.phone        ?? null,
        avatar_color: body.avatar_color ?? '#0891b2',
        parent_id:    body.parent_id    ?? null,
        position_x:   body.position_x   ?? 200,
        position_y:   body.position_y   ?? 200,
        node_type:    body.node_type    ?? 'person',
        color:        body.color        ?? '#0891b2',
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  // PATCH /org-chart/:id — update node (position, label, etc.)
  fastify.patch('/:id', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const update: Record<string, any> = { updated_at: new Date() };
      const fields = ['label','job_title','department','email','phone','avatar_color','parent_id','position_x','position_y','node_type','color','user_id'];
      for (const f of fields) if (body[f] !== undefined) update[f] = body[f] ?? null;
      return trx.updateTable('org_chart_nodes')
        .set(update)
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  });

  // POST /org-chart/bulk-positions — save multiple node positions at once
  fastify.post('/bulk-positions', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (req) => {
    const user = req.user;
    const body = req.body as any; // { nodes: [{id, position_x, position_y}] }
    return withTenant(user.tenant_id, async (trx) => {
      await Promise.all(
        (body.nodes ?? []).map((n: { id: string; position_x: number; position_y: number }) =>
          trx.updateTable('org_chart_nodes')
            .set({ position_x: n.position_x, position_y: n.position_y, updated_at: new Date() })
            .where('id', '=', n.id)
            .where('tenant_id', '=', user.tenant_id)
            .execute()
        )
      );
      return { saved: (body.nodes ?? []).length };
    });
  });

  // DELETE /org-chart/:id
  fastify.delete('/:id', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      // Re-parent children to this node's parent before deleting
      const node = await trx.selectFrom('org_chart_nodes').select(['parent_id'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (node) {
        await trx.updateTable('org_chart_nodes')
          .set({ parent_id: node.parent_id, updated_at: new Date() })
          .where('parent_id', '=', id)
          .where('tenant_id', '=', user.tenant_id)
          .execute();
      }
      await trx.deleteFrom('org_chart_nodes')
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .execute();
      return { ok: true };
    });
  });
}
