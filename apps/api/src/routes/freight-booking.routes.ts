import type { FastifyInstance } from 'fastify';
import { requireEntitlement, requireAnyEntitlement } from '../middleware/entitlement.js';
import { freightBookingService } from '../services/freightBooking.service.js';

export async function freightBookingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // Carriers are shared with the standalone CargoTracker app's Carrier
  // directory (same table/service, different entitlement gate) — a tenant
  // with either 'clearos' or 'cargotracker' can reach them. Rate cards and
  // bookings stay ClearOS-only, gated per-route below.
  const carrierGate = requireAnyEntitlement(['clearos', 'cargotracker']);
  const clearosGate = requireEntitlement('clearos');

  // ── Carriers ─────────────────────────────────────────────────────────────
  fastify.get('/carriers', { preHandler: carrierGate }, async (request) => {
    const { active_only } = request.query as { active_only?: string };
    return freightBookingService.listCarriers(request.user.tenant_id, active_only === 'true');
  });

  fastify.post('/carriers', { preHandler: carrierGate }, async (request, reply) => {
    const body = request.body as { name: string; mode: string; scac_or_iata?: string; contact_name?: string; contact_email?: string; contact_phone?: string };
    if (!body.name || !body.mode) return reply.status(400).send({ error: 'name and mode are required' });
    const carrier = await freightBookingService.createCarrier(request.user.tenant_id, body);
    return reply.status(201).send(carrier);
  });

  fastify.patch('/carriers/:id', { preHandler: carrierGate }, async (request) => {
    const { id } = request.params as { id: string };
    return freightBookingService.updateCarrier(request.user.tenant_id, id, request.body as any);
  });

  // ── Rate cards ───────────────────────────────────────────────────────────
  fastify.addHook('preHandler', clearosGate);

  fastify.get('/rate-cards', async (request) => {
    const q = request.query as { carrier_id?: string; mode?: string; origin_port?: string; destination_port?: string };
    return freightBookingService.listRateCards(request.user.tenant_id, q);
  });

  fastify.post('/rate-cards', async (request, reply) => {
    const body = request.body as { carrier_id: string; mode: string; origin_port: string; destination_port: string; cost_rate: number; sell_rate: number; currency?: string; valid_from?: string; valid_to?: string; notes?: string };
    if (!body.carrier_id || !body.mode || !body.origin_port || !body.destination_port || body.cost_rate == null || body.sell_rate == null) {
      return reply.status(400).send({ error: 'carrier_id, mode, origin_port, destination_port, cost_rate and sell_rate are required' });
    }
    const card = await freightBookingService.createRateCard(request.user.tenant_id, body);
    return reply.status(201).send(card);
  });

  fastify.patch('/rate-cards/:id', async (request) => {
    const { id } = request.params as { id: string };
    return freightBookingService.updateRateCard(request.user.tenant_id, id, request.body as any);
  });

  // ── Bookings ─────────────────────────────────────────────────────────────
  fastify.get('/bookings', async (request) => {
    const q = request.query as { status?: string; customer_id?: string };
    return freightBookingService.listBookings(request.user.tenant_id, q);
  });

  fastify.get('/bookings/:id', async (request) => {
    const { id } = request.params as { id: string };
    return freightBookingService.getBooking(request.user.tenant_id, id);
  });

  fastify.get('/bookings/by-shipment/:shipmentId', async (request) => {
    const { shipmentId } = request.params as { shipmentId: string };
    const booking = await freightBookingService.getBookingByShipment(request.user.tenant_id, shipmentId);
    return booking || null;
  });

  fastify.post('/bookings', async (request, reply) => {
    const body = request.body as { customer_id: string; mode: string; origin_port: string; destination_port: string; cargo_desc?: string; quantity?: number; requested_ship_date?: string };
    if (!body.customer_id || !body.mode || !body.origin_port || !body.destination_port) {
      return reply.status(400).send({ error: 'customer_id, mode, origin_port and destination_port are required' });
    }
    const booking = await freightBookingService.createBooking(request.user.tenant_id, request.user.sub, body);
    return reply.status(201).send(booking);
  });

  fastify.patch('/bookings/:id/quote', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { rate_card_id?: string; carrier_id?: string; quoted_cost: number; quoted_sell: number; currency?: string };
    if (body.quoted_cost == null || body.quoted_sell == null) {
      return reply.status(400).send({ error: 'quoted_cost and quoted_sell are required' });
    }
    try {
      return await freightBookingService.quoteBooking(request.user.tenant_id, id, body);
    } catch (err: any) {
      return reply.status(400).send({ error: err?.message || 'Failed to quote booking' });
    }
  });

  fastify.patch('/bookings/:id/confirm', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { vessel_name: string; voyage_number?: string; carrier_booking_ref?: string; bl_number?: string; awb_number?: string; eta?: string };
    if (!body.vessel_name) return reply.status(400).send({ error: 'vessel_name is required' });
    try {
      const result = await freightBookingService.confirmBooking(request.user.tenant_id, id, request.user.sub, body);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err?.message || 'Failed to confirm booking' });
    }
  });

  fastify.patch('/bookings/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await freightBookingService.cancelBooking(request.user.tenant_id, id);
    } catch (err: any) {
      return reply.status(400).send({ error: err?.message || 'Failed to cancel booking' });
    }
  });
}
