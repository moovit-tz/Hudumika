import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const uuidSchema = z.string().uuid();

const tripSchema = z.object({
  title: z.string().trim().min(1).max(200),
  destination: z.string().trim().min(1).max(200),
  country_code: z.string().max(5).optional(),
  cover_image: z.string().max(500).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  status: z.enum(['planning', 'upcoming', 'active', 'completed', 'cancelled']).optional(),
  budget_amount: z.number().min(0).max(999999999).optional(),
  budget_currency: z.string().max(10).optional(),
  notes: z.string().max(10000).optional(),
});

const itinerarySchema = z.object({
  trip_id: z.string().uuid(),
  day_number: z.number().int().min(1).max(365).optional(),
  sort_order: z.number().int().min(0).optional(),
  item_type: z.enum(['flight', 'hotel', 'transport', 'activity', 'restaurant', 'meeting', 'other']).optional(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).optional(),
  location: z.string().max(300).optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  confirmation: z.string().max(100).optional(),
  cost: z.number().min(0).max(999999999).optional(),
  currency: z.string().max(10).optional(),
  status: z.enum(['planned', 'confirmed', 'cancelled']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const bookingSchema = z.object({
  trip_id: z.string().uuid().optional(),
  booking_type: z.enum(['flight', 'hotel', 'car', 'train', 'bus', 'ferry', 'tour', 'insurance', 'other']).optional(),
  provider: z.string().max(200).optional(),
  reference: z.string().max(100).optional(),
  title: z.string().trim().min(1).max(300),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  cost: z.number().min(0).max(999999999).optional(),
  currency: z.string().max(10).optional(),
  passengers: z.array(z.record(z.unknown())).optional(),
  details: z.record(z.unknown()).optional(),
});

const expenseSchema = z.object({
  trip_id: z.string().uuid().optional(),
  category: z.enum(['flights', 'accommodation', 'transport', 'food', 'activities', 'insurance', 'shopping', 'other']).optional(),
  description: z.string().trim().min(1).max(500),
  amount: z.number().min(0).max(999999999),
  currency: z.string().max(10).optional(),
  expense_date: z.string().optional(),
  receipt_file_id: z.string().uuid().optional(),
  reimbursable: z.boolean().optional(),
});

export async function travelRoutes(server: FastifyInstance) {
  server.addHook('preHandler', server.authenticate);
  server.addHook('preHandler', requireEntitlement('travel'));

  // ── Trips ──

  server.get('/trips', async req => withTenant(req.user.tenant_id, trx =>
    trx.selectFrom('travel_trips')
      .selectAll()
      .where('tenant_id', '=', req.user.tenant_id)
      .where('created_by', '=', req.user.sub)
      .orderBy('start_date', 'asc')
      .execute()
  ));

  server.get<{ Params: { id: string } }>('/trips/:id', async (req, reply) => {
    if (!uuidSchema.safeParse(req.params.id).success) return reply.status(404).send({ error: 'Trip not found' });
    return withTenant(req.user.tenant_id, async trx => {
      const row = await trx.selectFrom('travel_trips').selectAll()
        .where('id', '=', req.params.id)
        .where('tenant_id', '=', req.user.tenant_id)
        .executeTakeFirst();
      return row ?? reply.status(404).send({ error: 'Trip not found' });
    });
  });

  server.post('/trips', async (req, reply) => {
    const parsed = tripSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
    return withTenant(req.user.tenant_id, async trx => {
      const d = parsed.data;
      const vals: Record<string, unknown> = {
        tenant_id: req.user.tenant_id,
        created_by: req.user.sub,
        title: d.title,
        destination: d.destination,
        country_code: d.country_code ?? null,
        cover_image: d.cover_image ?? null,
        start_date: d.start_date ?? null,
        end_date: d.end_date ?? null,
        notes: d.notes ?? null,
      };
      if (d.status != null) vals.status = d.status;
      if (d.budget_amount != null) vals.budget_amount = d.budget_amount;
      if (d.budget_currency != null) vals.budget_currency = d.budget_currency;
      const row = await trx.insertInto('travel_trips')
        .values(vals as any).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  server.put<{ Params: { id: string } }>('/trips/:id', async (req, reply) => {
    const parsed = tripSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
    if (!uuidSchema.safeParse(req.params.id).success) return reply.status(404).send({ error: 'Trip not found' });
    return withTenant(req.user.tenant_id, async trx => {
      const row = await trx.updateTable('travel_trips')
        .set({ ...parsed.data, updated_at: new Date() })
        .where('id', '=', req.params.id)
        .where('tenant_id', '=', req.user.tenant_id)
        .where('created_by', '=', req.user.sub)
        .returningAll()
        .executeTakeFirst();
      return row ?? reply.status(404).send({ error: 'Trip not found' });
    });
  });

  server.delete<{ Params: { id: string } }>('/trips/:id', async (req, reply) => {
    if (!uuidSchema.safeParse(req.params.id).success) return reply.status(404).send({ error: 'Trip not found' });
    return withTenant(req.user.tenant_id, async trx => {
      const result = await trx.deleteFrom('travel_trips')
        .where('id', '=', req.params.id)
        .where('tenant_id', '=', req.user.tenant_id)
        .where('created_by', '=', req.user.sub)
        .executeTakeFirst();
      if (!result.numDeletedRows) return reply.status(404).send({ error: 'Trip not found' });
      return { ok: true };
    });
  });

  // ── Itinerary Items ──

  server.get<{ Params: { tripId: string } }>('/trips/:tripId/itinerary', async (req, reply) => {
    if (!uuidSchema.safeParse(req.params.tripId).success) return reply.status(404).send({ error: 'Trip not found' });
    return withTenant(req.user.tenant_id, trx =>
      trx.selectFrom('travel_itinerary_items')
        .selectAll()
        .where('trip_id', '=', req.params.tripId)
        .where('tenant_id', '=', req.user.tenant_id)
        .orderBy('day_number', 'asc')
        .orderBy('sort_order', 'asc')
        .execute()
    );
  });

  server.post('/itinerary', async (req, reply) => {
    const parsed = itinerarySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
    return withTenant(req.user.tenant_id, async trx => {
      const trip = await trx.selectFrom('travel_trips').select('tenant_id')
        .where('id', '=', parsed.data.trip_id).where('tenant_id', '=', req.user.tenant_id).executeTakeFirst();
      if (!trip) return reply.status(404).send({ error: 'Trip not found' });
      const d = parsed.data;
      const vals: Record<string, unknown> = {
        tenant_id: req.user.tenant_id,
        trip_id: d.trip_id,
        title: d.title,
        description: d.description ?? null,
        location: d.location ?? null,
        start_time: d.start_time ? new Date(d.start_time) : null,
        end_time: d.end_time ? new Date(d.end_time) : null,
        confirmation: d.confirmation ?? null,
        cost: d.cost ?? null,
        currency: d.currency ?? null,
      };
      if (d.day_number != null) vals.day_number = d.day_number;
      if (d.sort_order != null) vals.sort_order = d.sort_order;
      if (d.item_type != null) vals.item_type = d.item_type;
      if (d.status != null) vals.status = d.status;
      if (d.metadata != null) vals.metadata = JSON.stringify(d.metadata);
      const row = await trx.insertInto('travel_itinerary_items')
        .values(vals as any).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  server.delete<{ Params: { id: string } }>('/itinerary/:id', async (req, reply) => {
    if (!uuidSchema.safeParse(req.params.id).success) return reply.status(404).send({ error: 'Item not found' });
    return withTenant(req.user.tenant_id, async trx => {
      const result = await trx.deleteFrom('travel_itinerary_items')
        .where('id', '=', req.params.id)
        .where('tenant_id', '=', req.user.tenant_id)
        .executeTakeFirst();
      if (!result.numDeletedRows) return reply.status(404).send({ error: 'Item not found' });
      return { ok: true };
    });
  });

  // ── Bookings ──

  server.get('/bookings', async req => withTenant(req.user.tenant_id, trx =>
    trx.selectFrom('travel_bookings')
      .selectAll()
      .where('tenant_id', '=', req.user.tenant_id)
      .where('created_by', '=', req.user.sub)
      .orderBy('start_date', 'desc')
      .execute()
  ));

  server.post('/bookings', async (req, reply) => {
    const parsed = bookingSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
    return withTenant(req.user.tenant_id, async trx => {
      const d = parsed.data;
      const vals: Record<string, unknown> = {
        tenant_id: req.user.tenant_id,
        created_by: req.user.sub,
        title: d.title,
        trip_id: d.trip_id ?? null,
        provider: d.provider ?? null,
        reference: d.reference ?? null,
        start_date: d.start_date ? new Date(d.start_date) : null,
        end_date: d.end_date ? new Date(d.end_date) : null,
        cost: d.cost ?? null,
        currency: d.currency ?? null,
      };
      if (d.booking_type != null) vals.booking_type = d.booking_type;
      if (d.status != null) vals.status = d.status;
      if (d.passengers != null) vals.passengers = JSON.stringify(d.passengers);
      if (d.details != null) vals.details = JSON.stringify(d.details);
      const row = await trx.insertInto('travel_bookings')
        .values(vals as any).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  server.delete<{ Params: { id: string } }>('/bookings/:id', async (req, reply) => {
    if (!uuidSchema.safeParse(req.params.id).success) return reply.status(404).send({ error: 'Booking not found' });
    return withTenant(req.user.tenant_id, async trx => {
      const result = await trx.deleteFrom('travel_bookings')
        .where('id', '=', req.params.id)
        .where('tenant_id', '=', req.user.tenant_id)
        .where('created_by', '=', req.user.sub)
        .executeTakeFirst();
      if (!result.numDeletedRows) return reply.status(404).send({ error: 'Booking not found' });
      return { ok: true };
    });
  });

  // ── Expenses ──

  server.get('/expenses', async req => {
    const tripId = (req.query as any).trip_id;
    return withTenant(req.user.tenant_id, trx => {
      let q = trx.selectFrom('travel_expenses')
        .selectAll()
        .where('tenant_id', '=', req.user.tenant_id)
        .where('created_by', '=', req.user.sub);
      if (tripId && uuidSchema.safeParse(tripId).success) q = q.where('trip_id', '=', tripId);
      return q.orderBy('expense_date', 'desc').execute();
    });
  });

  server.post('/expenses', async (req, reply) => {
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
    return withTenant(req.user.tenant_id, async trx => {
      const d = parsed.data;
      const vals: Record<string, unknown> = {
        tenant_id: req.user.tenant_id,
        created_by: req.user.sub,
        description: d.description,
        amount: d.amount,
        trip_id: d.trip_id ?? null,
        receipt_file_id: d.receipt_file_id ?? null,
      };
      if (d.category != null) vals.category = d.category;
      if (d.currency != null) vals.currency = d.currency;
      if (d.expense_date != null) vals.expense_date = d.expense_date;
      if (d.reimbursable != null) vals.reimbursable = d.reimbursable;
      const row = await trx.insertInto('travel_expenses')
        .values(vals as any).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  server.delete<{ Params: { id: string } }>('/expenses/:id', async (req, reply) => {
    if (!uuidSchema.safeParse(req.params.id).success) return reply.status(404).send({ error: 'Expense not found' });
    return withTenant(req.user.tenant_id, async trx => {
      const result = await trx.deleteFrom('travel_expenses')
        .where('id', '=', req.params.id)
        .where('tenant_id', '=', req.user.tenant_id)
        .where('created_by', '=', req.user.sub)
        .executeTakeFirst();
      if (!result.numDeletedRows) return reply.status(404).send({ error: 'Expense not found' });
      return { ok: true };
    });
  });

  // ── Dashboard summary ──

  server.get('/dashboard', async req => withTenant(req.user.tenant_id, async trx => {
    const trips = await trx.selectFrom('travel_trips').selectAll()
      .where('tenant_id', '=', req.user.tenant_id)
      .where('created_by', '=', req.user.sub)
      .orderBy('start_date', 'asc')
      .execute();
    const bookings = await trx.selectFrom('travel_bookings').selectAll()
      .where('tenant_id', '=', req.user.tenant_id)
      .where('created_by', '=', req.user.sub)
      .orderBy('start_date', 'asc')
      .limit(10)
      .execute();
    const expenses = await trx.selectFrom('travel_expenses').selectAll()
      .where('tenant_id', '=', req.user.tenant_id)
      .where('created_by', '=', req.user.sub)
      .orderBy('expense_date', 'desc')
      .limit(20)
      .execute();
    return { trips, bookings, expenses };
  }));
}
