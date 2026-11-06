import { z } from 'zod';
import { requireTrackerAccess } from '../services/tracker-integrity.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { demurrageService } from '../services/demurrage.service.js';
import { estimateConsignment, estimateInput } from '../services/demurrage-estimate.service.js';
import { exportDemurrageEstimate } from '../services/demurrage-estimate-export.js';
import { withTenant } from '../db/client.js';
import { sql } from 'kysely';

export async function demurrageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireEntitlement('demurrage'));
  // HUD-0024 continuation: tariffs and container tracking had no role check
  // at all — internal ops data, not customer-portal data.
  app.addHook('preHandler', requireTrackerAccess);
  app.addHook('preHandler', async req => { for (const id of Object.values(req.params as Record<string,string>)) z.string().uuid().parse(id); if (req.method === 'POST' || req.method === 'PATCH') z.record(z.string(), z.unknown()).parse(req.body); });

  // ── Tariffs ──

  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const tariffs = await demurrageService.listTariffs(user.tenant_id);
    return tariffs;
  });

  app.post('/tariffs', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'].includes(user.role)) {
      return reply.code(403).send({ error: 'Only admins/managers can manage tariffs' });
    }
    const body = req.body as any;
    const tariff = await demurrageService.createTariff(user.tenant_id, body);
    return reply.code(201).send(tariff);
  });

  app.patch('/tariffs/:tariffId', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'].includes(user.role)) {
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
    if (!['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'ADMIN'].includes(user.role)) {
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

  app.post('/consignment-estimate', async (req, reply) => {
    const input = estimateInput.parse(req.body);
    const { format } = z.object({ format: z.enum(['pdf', 'csv', 'xlsx']).optional() }).parse(req.query);
    const lines = await estimateConsignment(req.user.tenant_id, input);
    reply.header('Cache-Control', 'no-store');
    if (!format) return { lines };
    const output = await exportDemurrageEstimate(format, input.bill, input.asOf, lines);
    const filename = input.bill.replace(/[^a-z0-9-]/gi, '-');
    return reply.type(output.type).header('Content-Disposition', `attachment; filename="demurrage-${filename}.${format}"`).send(output.body);
  });

  app.get('/recorded-dates', async (req, reply) => {
    const { bill } = z.object({ bill: estimateInput.shape.bill }).parse(req.query);
    const tenantId = req.user.tenant_id;
    const rows = await withTenant(tenantId, trx => trx.selectFrom('container_tracking as container')
      .innerJoin('shipment_cases as shipment', 'shipment.id', 'container.shipment_id')
      .where('container.tenant_id', '=', tenantId)
      .where('shipment.tenant_id', '=', tenantId)
      .where(sql<string>`upper(shipment.bl_number)`, '=', bill.toUpperCase())
      .select(['container.container_number as number', 'container.discharge_date as discharge', 'container.return_date as returned'])
      .execute());
    reply.header('Cache-Control', 'no-store');
    return { rows };
  });

  // ── Summary ──

  app.get('/summary', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const summary = await demurrageService.getSummary(user.tenant_id);
    return summary;
  });
}
