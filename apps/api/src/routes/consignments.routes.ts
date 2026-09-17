import { requireEntitlement } from '../middleware/entitlement.js';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { consignmentService } from '../services/consignment.service.js';

export async function consignmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  // Road consignments are surfaced in the HuduFreight (tracking) app —
  // gate matches where the feature now lives, not its ClearOS origins.
  app.addHook('preHandler', requireEntitlement('tracking'));
  // HUD-0024 continuation: GET / and GET /:id had no role check at all —
  // any CUSTOMER JWT could list/view every consignment in the tenant with
  // no ownership scoping despite `customer_id` existing as a filter param.
  app.addHook('preHandler', async (req: any, reply: any) => {
    if (req.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

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
    if (!detail) return reply.code(404).send({ error: 'Consignment not found' });
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
    if (!result) return reply.code(404).send({ error: 'Consignment not found' });
    return result;
  });

  // ── Trips ──

  app.post('/:id/trips', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    const body = req.body as any;
    const trip = await consignmentService.addTrip(user.tenant_id, id, body);
    if (!trip) return reply.code(404).send({ error: 'Consignment not found' });
    return reply.code(201).send(trip);
  });

  app.patch('/trips/:tripId/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { tripId } = req.params as any;
    const { status } = req.body as any;
    const trip = await consignmentService.updateTripStatus(user.tenant_id, tripId, status);
    if (!trip) return reply.code(404).send({ error: 'Trip not found' });
    return trip;
  });

  // ── Border Crossings ──

  app.post('/:id/borders', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    const body = req.body as any;
    const border = await consignmentService.addBorderCrossing(user.tenant_id, id, body);
    if (!border) return reply.code(404).send({ error: 'Consignment not found' });
    return reply.code(201).send(border);
  });

  app.patch('/borders/:borderId/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { borderId } = req.params as any;
    const { status, delay_reason } = req.body as any;
    const border = await consignmentService.updateBorderStatus(user.tenant_id, borderId, status, delay_reason);
    if (!border) return reply.code(404).send({ error: 'Border crossing not found' });
    return border;
  });
}
