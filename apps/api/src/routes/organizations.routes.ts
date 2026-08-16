import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

// Staff-only search/create for linking a tenant's own customer record to a
// platform-level Organization (migration 230). Deliberately no self-service
// claiming from the ORG-login side — an organization asserting "I am this
// customer" without a staff member confirming it would be a real cross-
// tenant data exposure, so linking only ever happens from here.
const LINK_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR', 'OFFICER', 'SALES'] as const;

export async function organizationsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole(...LINK_ROLES));

  // GET /v1/organizations?q= — search-as-you-type for EntityPicker on the
  // Customers profile page. Platform-level table, no tenant filter (an
  // organization isn't owned by the searching staff member's tenant).
  fastify.get('/', async (req) => {
    const { q } = req.query as { q?: string };
    let query = db.selectFrom('organizations').select(['id', 'name', 'email', 'tax_id']);
    if (q?.trim()) query = query.where('name', 'ilike', `%${q.trim()}%`);
    return query.orderBy('name').limit(20).execute();
  });

  // POST /v1/organizations — create, for EntityPicker's "create new" path.
  fastify.post('/', async (req, reply) => {
    const body = req.body as { name?: string; email?: string; tax_id?: string };
    if (!body.name?.trim()) return reply.status(400).send({ error: 'Organization name is required' });
    const row = await db.insertInto('organizations').values({
      name: body.name.trim(),
      email: body.email?.trim() || null,
      tax_id: body.tax_id?.trim() || null,
    }).returningAll().executeTakeFirstOrThrow();
    reply.status(201);
    return row;
  });
}
