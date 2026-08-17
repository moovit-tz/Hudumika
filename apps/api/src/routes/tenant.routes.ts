import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/rbac.js';
import { TenantService } from '../services/tenant.service.js';

const companyCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(100),
  plan: z.string().min(1).max(50),
  billing_address: z.string().max(500).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().max(320).nullable().optional(),
  logo_url: z.string().max(1000).nullable().optional(),
  primary_color: z.string().max(20).nullable().optional(),
});
const companyPatchSchema = companyCreateSchema.partial();

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
    const data = companyCreateSchema.parse(request.body);
    const company = await TenantService.create(user.tenant_id, data);
    return reply.status(201).send(company);
  });

  // Update a company
  fastify.patch('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const data = companyPatchSchema.parse(request.body);
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
