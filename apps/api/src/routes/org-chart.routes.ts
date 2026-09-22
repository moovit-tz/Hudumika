import { requireEntitlement } from '../middleware/entitlement.js';
import { requireUuidParams } from '../middleware/uuid-params.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRoleOrOrgPermission, ORG_PERMISSIONS } from '../lib/org-rbac.js';

export async function orgChartRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('nexushr'));
  requireUuidParams(fastify);

  // GET /org-chart — returns all nodes for the tenant. Used to silently
  // seed a fictional CEO/COO/CFO demo hierarchy the first time a tenant had
  // zero real nodes, so a brand-new tenant's first look at Org Chart was a
  // fabricated company with user_id: null throughout. A genuinely empty
  // chart is a real state now — OrgChart.tsx's own empty view (Sync Staff /
  // Add first role) is the honest starting point, not a fake org someone
  // has to notice and delete.
  // HUD-0024 continuation: internal tenant-business data (finance ledgers,
  // fleet ops, HR, identity/access admin, or tenant configuration) with only
  // an entitlement gate — reachable end-to-end by a CUSTOMER JWT (confirmed
  // live before this fix). Not customer-portal data.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  // Every other route in this file (create/update/delete/sync/reset) is
  // gated on org_chart.manage — there is no separate "view" permission
  // (org-rbac.ts) — and the frontend route itself wraps OrgChart.tsx in
  // <RequireRoles roles={MGMT_ROLES} permissions={['org_chart.manage']}>.
  // This GET had no preHandler at all, so any authenticated non-CUSTOMER
  // role (JUNIOR, SALES, SENIOR, FINANCE…) could read every staff member's
  // name, title, department, email and phone straight from the API — a
  // frontend-only gate, not a real boundary. Matched to the rest of the file.
  fastify.get('/', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ORG_CHART_MANAGE, 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('org_chart_nodes')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at')
        .execute()
    );
  });

  // POST /org-chart — create a node
  fastify.post('/', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ORG_CHART_MANAGE, 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      // user_id (-> users) and parent_id (-> org_chart_nodes) are both plain
      // global FKs (migration 011, no tenant column in the constraint), so a
      // caller-supplied id from another tenant would otherwise attach fine —
      // same cross-tenant id-smuggling shape as ondi.routes.ts's visitor
      // host_user_id fix.
      if (body.user_id) {
        const owner = await trx.selectFrom('users').select('id')
          .where('id', '=', body.user_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!owner) { reply.status(404); return { error: 'That person is not in this workspace.' }; }
      }
      if (body.parent_id) {
        const parent = await trx.selectFrom('org_chart_nodes').select('id')
          .where('id', '=', body.parent_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!parent) { reply.status(404); return { error: 'Parent node not found in this workspace.' }; }
      }
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
  fastify.patch('/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ORG_CHART_MANAGE, 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      if (body.user_id) {
        const owner = await trx.selectFrom('users').select('id')
          .where('id', '=', body.user_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!owner) { reply.status(404); return { error: 'That person is not in this workspace.' }; }
      }
      if (body.parent_id) {
        const parent = await trx.selectFrom('org_chart_nodes').select('id')
          .where('id', '=', body.parent_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!parent) { reply.status(404); return { error: 'Parent node not found in this workspace.' }; }
      }
      const update: Record<string, any> = { updated_at: new Date() };
      const fields = ['label','job_title','department','email','phone','avatar_color','parent_id','position_x','position_y','node_type','color','user_id'];
      for (const f of fields) if (body[f] !== undefined) update[f] = body[f] ?? null;
      // HUD-0097 (addendum): the node itself was never checked to exist —
      // only body.user_id/body.parent_id were — so a bad node id crashed
      // instead of 404ing. Same multi-line-chain miss as seal-warehouse-ops.
      const updated = await trx.updateTable('org_chart_nodes')
        .set(update)
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirst();
      if (!updated) { reply.status(404); return { error: 'Node not found' }; }
      return updated;
    });
  });

  // POST /org-chart/bulk-positions — save multiple node positions at once
  fastify.post('/bulk-positions', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ORG_CHART_MANAGE, 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (req) => {
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
  fastify.delete('/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ORG_CHART_MANAGE, 'ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (req) => {
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

  // POST /org-chart/sync-staff — import/sync company staff into the org chart
  fastify.post('/sync-staff', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ORG_CHART_MANAGE, 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      // HUD-0072: this previously pulled every user row with no role filter,
      // live-confirmed to add the tenant's own CUSTOMER-portal accounts into
      // the internal staff hierarchy (job_title: "CUSTOMER") — a customer
      // isn't part of the company's org structure. Same CUSTOMER-exclusion
      // convention this codebase already applies everywhere else, applied
      // here to data correctness rather than access control.
      const staffUsers = await trx.selectFrom('users')
        .select(['id', 'name', 'email', 'role'])
        .where('tenant_id', '=', user.tenant_id)
        .where('role', '!=', 'CUSTOMER')
        .execute();

      const existingNodes = await trx.selectFrom('org_chart_nodes')
        .select(['id', 'user_id'])
        .where('tenant_id', '=', user.tenant_id)
        .execute();

      const existingUserIds = new Set(existingNodes.map(n => n.user_id).filter(Boolean));
      const topNode = existingNodes.length > 0 ? existingNodes[0].id : null;

      let addedCount = 0;
      for (const s of staffUsers) {
        if (!existingUserIds.has(s.id)) {
          const color = '#0891b2';
          await trx.insertInto('org_chart_nodes').values({
            tenant_id: user.tenant_id,
            user_id: s.id,
            label: s.name || s.email,
            job_title: s.role || 'Officer',
            department: 'Operations',
            email: s.email,
            phone: null,
            avatar_color: color,
            parent_id: topNode,
            position_x: 200 + (addedCount % 4) * 240,
            position_y: 350 + Math.floor(addedCount / 4) * 150,
            node_type: 'person',
            color: color,
          }).execute();
          addedCount++;
        }
      }

      return trx.selectFrom('org_chart_nodes')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at')
        .execute();
    });
  });

}
