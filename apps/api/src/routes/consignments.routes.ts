import { requireAppEnabled } from '../middleware/appGate.js';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { consignmentService } from '../services/consignment.service.js';

export async function consignmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireAppEnabled('clearos'));

  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const query = req.query as any;
    const list = await consignmentService.list(user.tenant_id, {
      status: query.status,
      customer_id: query.customer_id,
    });
    return list;
  });

  app.get('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    const detail = await consignmentService.getById(user.tenant_id, id);
    return detail;
  });

  app.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!['SUPER_ADMIN', 'TENANT_ADMIN', 'OFFICER', 'MANAGER'].includes(user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
    const body = req.body as any;
    const consignment = await consignmentService.create(user.tenant_id, body);
    return reply.code(201).send(consignment);
  });

  app.patch('/:id/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    const { status } = req.body as any;
    const result = await consignmentService.updateStatus(user.tenant_id, id, status);
    return result;
  });

  // ── Trips ──

  app.post('/:id/trips', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    const body = req.body as any;
    const trip = await consignmentService.addTrip(user.tenant_id, id, body);
    return reply.code(201).send(trip);
  });

  app.patch('/trips/:tripId/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { tripId } = req.params as any;
    const { status } = req.body as any;
    const trip = await consignmentService.updateTripStatus(user.tenant_id, tripId, status);
    return trip;
  });

  // ── Border Crossings ──

  app.post('/:id/borders', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    const body = req.body as any;
    const border = await consignmentService.addBorderCrossing(user.tenant_id, id, body);
    return reply.code(201).send(border);
  });

  app.patch('/borders/:borderId/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { borderId } = req.params as any;
    const { status, delay_reason } = req.body as any;
    const border = await consignmentService.updateBorderStatus(user.tenant_id, borderId, status, delay_reason);
    return border;
  });
}
