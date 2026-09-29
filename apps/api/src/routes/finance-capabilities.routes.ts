import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FINANCE_CAPABILITY_KEYS, FINANCE_INDUSTRY_KEYS } from '@hudumika/types';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { createFinanceBusinessLine, getFinanceCapabilities, getFinanceConfiguration, setFinanceCapability, setFinanceIndustries, updateFinanceBusinessLine } from '../services/finance-capability.service.js';

const updateSchema = z.object({ enabled: z.boolean() });
const industriesSchema = z.object({ industries: z.array(z.enum(FINANCE_INDUSTRY_KEYS)).max(FINANCE_INDUSTRY_KEYS.length) });
const businessLineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/).transform(value => value.toUpperCase()),
  description: z.string().trim().max(500).nullable().optional(),
});
const businessLinePatchSchema = businessLineSchema.partial().extend({ active: z.boolean().optional() });

export async function financeCapabilitiesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  fastify.get('/', async request => getFinanceCapabilities(request.user.tenant_id, request.user.role === 'SUPER_ADMIN'));
  fastify.get('/configuration', async request => getFinanceConfiguration(request.user.tenant_id));

  fastify.put('/configuration/industries', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async request => {
    const body = industriesSchema.parse(request.body);
    return setFinanceIndustries(request.user.tenant_id, request.user.sub, body.industries);
  });

  fastify.post('/configuration/business-lines', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (request, reply) => {
    const body = businessLineSchema.parse(request.body);
    try { return reply.status(201).send(await createFinanceBusinessLine(request.user.tenant_id, { name: body.name!, code: body.code!, description: body.description })); }
    catch (error: any) {
      if (error.code === '23505') return reply.status(409).send({ error: 'A business line with this code already exists.' });
      throw error;
    }
  });

  fastify.patch<{ Params: { id: string } }>('/configuration/business-lines/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (request, reply) => {
    try { return await updateFinanceBusinessLine(request.user.tenant_id, request.params.id, businessLinePatchSchema.parse(request.body)); }
    catch (error: any) {
      if (error.code === '23505') return reply.status(409).send({ error: 'A business line with this code already exists.' });
      return reply.status(error.statusCode ?? 500).send({ error: error.message });
    }
  });

  fastify.patch<{ Params: { key: string } }>('/:key', {
    preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'),
  }, async (request, reply) => {
    const key = request.params.key;
    if (!FINANCE_CAPABILITY_KEYS.includes(key as any)) return reply.status(404).send({ error: 'Finance capability not found.' });
    const { enabled } = updateSchema.parse(request.body);
    try {
      return await setFinanceCapability(request.user.tenant_id, request.user.sub, key as any, enabled, request.user.role === 'SUPER_ADMIN');
    } catch (error: any) {
      return reply.status(error.statusCode ?? 500).send({ error: error.message, code: error.code, dependencies: error.dependencies });
    }
  });
}
