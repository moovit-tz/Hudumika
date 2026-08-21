import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { AgencyTenantService, AgencyTenantError } from '../services/agency-tenant.service.js';

/**
 * AgencyHost M1 — an agency tenant creating and listing the client tenants
 * it manages. A separate file from onsite.routes.ts (already 1,300+ lines)
 * rather than added there.
 */

const createClientSchema = z.object({
  company_name: z.string().trim().min(1).max(200),
  subdomain: z.string().trim().min(1).max(63),
  admin_email: z.string().trim().email().max(320),
});

export async function onsiteAgencyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('onsite'));
  // Creating/listing managed clients is an account-level action, not
  // something every onsite-entitled role should reach — matches the role
  // set hr.routes.ts's own /invitations already restricts to.
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'));

  fastify.get('/clients', async (request) => {
    const user = request.user;
    const rows = await AgencyTenantService.listManagedClients(user.tenant_id);
    return { data: rows };
  });

  fastify.post('/clients', async (request, reply) => {
    const user = request.user;
    const body = createClientSchema.parse(request.body);
    try {
      const result = await AgencyTenantService.createManagedClientTenant(
        user.tenant_id, user.sub, body,
      );
      return reply.status(201).send(result);
    } catch (err: any) {
      if (err instanceof AgencyTenantError) {
        return reply.status(err.status).send({ error: err.message });
      }
      throw err;
    }
  });
}
