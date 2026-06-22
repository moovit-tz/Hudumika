import type { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/rbac.js';
import { TenantService } from '../services/tenant.service.js';

export async function tenantRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // List companies
  fastify.get('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request, reply) => {
    const user = request.user;
    const filters = request.query as any;
    const list = await TenantService.list(user.tenant_id, filters);
    return { data: list };
  });

  // Get a single company
  fastify.get('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const company = await TenantService.get(user.tenant_id, id);
    return company;
  });

  // Create a new company
  fastify.post('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (request, reply) => {
    const user = request.user;
    const data = request.body as any;
    const company = await TenantService.create(user.tenant_id, data);
    return reply.status(201).send(company);
  });

  // Update a company
  fastify.patch('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const data = request.body as any;
    const company = await TenantService.update(user.tenant_id, id, data);
    return company;
  });

  // Delete a company
  fastify.delete('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    await TenantService.delete(user.tenant_id, id);
    return { success: true };
  });
}
