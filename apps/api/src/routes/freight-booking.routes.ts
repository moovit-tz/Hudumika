import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { freightBookingService } from '../services/freightBooking.service.js';

const carrierCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mode: z.string().min(1).max(30),
  scac_or_iata: z.string().max(20).optional(),
  contact_name: z.string().max(200).optional(),
  contact_email: z.string().email().max(320).optional(),
  contact_phone: z.string().max(30).optional(),
});
const carrierPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  mode: z.string().min(1).max(30).optional(),
  scac_or_iata: z.string().max(20).nullable().optional(),
  contact_name: z.string().max(200).nullable().optional(),
  contact_email: z.string().email().max(320).nullable().optional(),
  contact_phone: z.string().max(30).nullable().optional(),
  active: z.boolean().optional(),
});
const rateCardCreateSchema = z.object({
  carrier_id: z.string().uuid(),
  mode: z.string().min(1).max(30),
  origin_port: z.string().min(1).max(100),
  destination_port: z.string().min(1).max(100),
  cost_rate: z.number().min(0),
  sell_rate: z.number().min(0),
  currency: z.string().max(10).optional(),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
  notes: z.string().max(2000).optional(),
});
const rateCardPatchSchema = z.object({
  cost_rate: z.number().min(0).optional(),
  sell_rate: z.number().min(0).optional(),
  currency: z.string().max(10).optional(),
  valid_from: z.string().nullable().optional(),
  valid_to: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active: z.boolean().optional(),
});
const rateContractCreateSchema = z.object({
  carrier_id: z.string().uuid(),
  contract_reference: z.string().max(100).optional(),
  mode: z.string().min(1).max(30),
  origin_port: z.string().min(1).max(100),
  destination_port: z.string().min(1).max(100),
  buy_rate: z.number().min(0),
  currency: z.string().max(10).optional(),
  transit_days: z.number().int().positive().optional(),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
  notes: z.string().max(2000).optional(),
});
const rateContractPatchSchema = z.object({
  contract_reference: z.string().max(100).nullable().optional(),
  buy_rate: z.number().min(0).optional(),
  currency: z.string().max(10).optional(),
  transit_days: z.number().int().positive().nullable().optional(),
  valid_from: z.string().nullable().optional(),
  valid_to: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active: z.boolean().optional(),
});
const bookingCreateSchema = z.object({
  customer_id: z.string().uuid(),
  mode: z.string().min(1).max(30),
  origin_port: z.string().min(1).max(100),
  destination_port: z.string().min(1).max(100),
  cargo_desc: z.string().max(2000).optional(),
  quantity: z.number().int().positive().optional(),
  requested_ship_date: z.string().optional(),
});
const bookingQuoteSchema = z.object({
  rate_card_id: z.string().uuid().optional(),
  carrier_id: z.string().uuid().optional(),
  quoted_cost: z.number().min(0),
  quoted_sell: z.number().min(0),
  currency: z.string().max(10).optional(),
});
const bookingConfirmSchema = z.object({
  vessel_name: z.string().trim().min(1).max(200),
  voyage_number: z.string().max(50).optional(),
  carrier_booking_ref: z.string().max(100).optional(),
  bl_number: z.string().max(100).optional(),
  awb_number: z.string().max(100).optional(),
  eta: z.string().optional(),
});

export async function freightBookingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // Freight Booking (carriers, rate cards, buy-side rate contracts, bookings)
  // now lives entirely in the CargoTracker app — moved out of ClearOS's own
  // nav, which used to host it under a per-route mix of gates (carriers dual-
  // gated requireAnyEntitlement(['clearos','cargotracker']), everything else
  // ClearOS-only). ClearOS and CargoTracker are sold as a bundle, so a single
  // 'cargotracker' gate is sufficient — ClearOS's own pages (e.g.
  // ShipmentDetail's booking-reference badge, GET .../bookings/by-shipment)
  // still call this API directly; the gate checks the tenant's entitlements,
  // not which app's frontend made the call.
  fastify.addHook('preHandler', requireEntitlement('cargotracker'));

  // ── Carriers ─────────────────────────────────────────────────────────────
  fastify.get('/carriers', async (request) => {
    const { active_only } = request.query as { active_only?: string };
    return freightBookingService.listCarriers(request.user.tenant_id, active_only === 'true');
  });

  fastify.post('/carriers', async (request, reply) => {
    const body = carrierCreateSchema.parse(request.body);
    const carrier = await freightBookingService.createCarrier(request.user.tenant_id, body);
    return reply.status(201).send(carrier);
  });

  fastify.patch('/carriers/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = carrierPatchSchema.parse(request.body);
    return freightBookingService.updateCarrier(request.user.tenant_id, id, body);
  });

  // ── Rate cards ───────────────────────────────────────────────────────────
  fastify.get('/rate-cards', async (request) => {
    const q = request.query as { carrier_id?: string; mode?: string; origin_port?: string; destination_port?: string };
    return freightBookingService.listRateCards(request.user.tenant_id, q);
  });

  fastify.post('/rate-cards', async (request, reply) => {
    const body = rateCardCreateSchema.parse(request.body);
    const card = await freightBookingService.createRateCard(request.user.tenant_id, body);
    return reply.status(201).send(card);
  });

  fastify.patch('/rate-cards/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = rateCardPatchSchema.parse(request.body);
    return freightBookingService.updateRateCard(request.user.tenant_id, id, body);
  });

  // ── Carrier rate contracts (buy-side, M7) ───────────────────────────────
  fastify.get('/rate-contracts', async (request) => {
    const q = request.query as { carrier_id?: string; mode?: string; origin_port?: string; destination_port?: string };
    return freightBookingService.listRateContracts(request.user.tenant_id, q);
  });

  fastify.post('/rate-contracts', async (request, reply) => {
    const body = rateContractCreateSchema.parse(request.body);
    const contract = await freightBookingService.createRateContract(request.user.tenant_id, request.user.sub, body);
    return reply.status(201).send(contract);
  });

  fastify.patch('/rate-contracts/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = rateContractPatchSchema.parse(request.body);
    return freightBookingService.updateRateContract(request.user.tenant_id, id, body);
  });

  // GET /v1/freight-booking/rate-shopping?mode=&origin_port=&destination_port=&as_of=
  // Every active carrier contract for a lane, cheapest first — the actual
  // "compare carriers" view (see freightBooking.service.ts's rateShopping).
  fastify.get('/rate-shopping', async (request, reply) => {
    const { mode, origin_port, destination_port, as_of } = request.query as {
      mode?: string; origin_port?: string; destination_port?: string; as_of?: string;
    };
    if (!mode || !origin_port || !destination_port) {
      return reply.status(400).send({ error: 'mode, origin_port and destination_port are required.' });
    }
    return freightBookingService.rateShopping(request.user.tenant_id, { mode, origin_port, destination_port, as_of });
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
    const body = bookingCreateSchema.parse(request.body);
    const booking = await freightBookingService.createBooking(request.user.tenant_id, request.user.sub, body);
    return reply.status(201).send(booking);
  });

  fastify.patch('/bookings/:id/quote', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = bookingQuoteSchema.parse(request.body);
    try {
      return await freightBookingService.quoteBooking(request.user.tenant_id, id, body);
    } catch (err: any) {
      return reply.status(400).send({ error: err?.message || 'Failed to quote booking' });
    }
  });

  fastify.patch('/bookings/:id/confirm', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = bookingConfirmSchema.parse(request.body);
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
