import { requireEntitlement } from '../middleware/entitlement.js';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { demurrageService } from '../services/demurrage.service.js';

export async function demurrageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireEntitlement('demurrage'));

  // ── Tariffs ──

  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const tariffs = await demurrageService.listTariffs(user.tenant_id);
    return tariffs;
  });

  app.post('/tariffs', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!['SUPER_ADMIN', 'TENANT_ADMIN', 'MANAGER'].includes(user.role)) {
      return reply.code(403).send({ error: 'Only admins/managers can manage tariffs' });
    }
    const body = req.body as any;
    const tariff = await demurrageService.createTariff(user.tenant_id, body);
    return reply.code(201).send(tariff);
  });

  app.patch('/tariffs/:tariffId', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!['SUPER_ADMIN', 'TENANT_ADMIN', 'MANAGER'].includes(user.role)) {
      return reply.code(403).send({ error: 'Only admins/managers can manage tariffs' });
    }
    const { tariffId } = req.params as any;
    const body = req.body as any;
    const tariff = await demurrageService.updateTariff(user.tenant_id, tariffId, body);
    return tariff;
  });

  // ── Container Tracking ──

  app.get('/containers', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const query = req.query as any;
    const containers = await demurrageService.listContainers(user.tenant_id, {
      shipment_id: query.shipment_id,
      status: query.status,
      container_numbers: query.container_numbers ? String(query.container_numbers).split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
    });
    return containers;
  });

  app.post('/containers', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const body = req.body as any;
    const container = await demurrageService.addContainer(user.tenant_id, body);
    return reply.code(201).send(container);
  });

  app.patch('/containers/:containerId/return', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { containerId } = req.params as any;
    const { return_date } = req.body as any;
    const container = await demurrageService.markReturned(user.tenant_id, containerId, return_date);
    return container;
  });

  app.patch('/containers/:containerId', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { containerId } = req.params as any;
    const container = await demurrageService.updateContainer(user.tenant_id, containerId, req.body as any);
    return container;
  });

  app.delete('/containers/:containerId', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { containerId } = req.params as any;
    await demurrageService.deleteContainer(user.tenant_id, containerId);
    reply.code(204);
    return null;
  });

  app.delete('/tariffs/:tariffId', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!['SUPER_ADMIN', 'TENANT_ADMIN', 'MANAGER', 'ADMIN'].includes(user.role)) {
      return reply.code(403).send({ error: 'Only admins/managers can manage tariffs' });
    }
    const { tariffId } = req.params as any;
    await demurrageService.deleteTariff(user.tenant_id, tariffId);
    reply.code(204);
    return null;
  });

  // ── Quick Calculator ──

  app.post('/calculate', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const body = req.body as any;
    const result = await demurrageService.quickCalculate(user.tenant_id, body);
    return result;
  });

  // ── Summary ──

  app.get('/summary', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const summary = await demurrageService.getSummary(user.tenant_id);
    return summary;
  });
}
