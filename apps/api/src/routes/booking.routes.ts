// Public scheduling pages — the unauthenticated half of booking_pages
// (287_calendar_v3.sql). Mirrors sign.routes.ts's own public/:token split:
// this file carries no fastify.authenticate hook at all, and every lookup
// resolves tenant_id from the page's globally-unique slug via dbPlatform
// first (CLAUDE.md's own carve-out for exactly this shape), then does
// everything else inside withTenant(). The authenticated CRUD half (create/
// edit/delete a page) lives in tasks.routes.ts under /v1/tasks/booking-pages.
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as BookingPages from '../services/booking-pages.service.js';
import { SlotUnavailableError } from '../services/booking-pages.service.js';

const bookingSchema = z.object({
  slotStart: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  notes: z.string().trim().max(2000).optional(),
});

export async function bookingPublicRoutes(fastify: FastifyInstance) {
  // Page info + working-hours shape a booker's calendar UI needs to render.
  fastify.get('/:slug', async (req: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
    const page = await BookingPages.getPublicBookingPage(req.params.slug);
    if (!page) return reply.status(404).send({ error: 'This booking page does not exist or is no longer active.' });
    const { tenantId, userId, ...pub } = page;
    return { data: pub };
  });

  // Available slots for one calendar day (host's timezone-local YYYY-MM-DD).
  fastify.get('/:slug/slots', async (req: FastifyRequest<{ Params: { slug: string }; Querystring: { date?: string } }>, reply: FastifyReply) => {
    const page = await BookingPages.getPublicBookingPage(req.params.slug);
    if (!page) return reply.status(404).send({ error: 'This booking page does not exist or is no longer active.' });
    const date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply.status(400).send({ error: 'date must be YYYY-MM-DD.' });

    const requested = new Date(`${date}T00:00:00Z`);
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const maxDate = new Date(today.getTime() + page.bookingWindowDays * 86_400_000);
    if (requested < today || requested > maxDate) return { data: [] };

    const slots = await BookingPages.getAvailableSlots(page.tenantId, page.userId, page, date);
    return { data: slots };
  });

  // Book a slot — creates a real event on the host's calendar.
  fastify.post('/:slug', async (req: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
    const page = await BookingPages.getPublicBookingPage(req.params.slug);
    if (!page) return reply.status(404).send({ error: 'This booking page does not exist or is no longer active.' });
    const parsed = bookingSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' });
    const { slotStart, name, email, notes } = parsed.data;

    try {
      const booking = await BookingPages.createBooking(
        { id: page.id, tenantId: page.tenantId, userId: page.userId, title: page.title, durationMinutes: page.durationMinutes, hostName: page.hostName ?? 'the host' },
        slotStart, name, email, notes,
      );
      return { data: booking };
    } catch (err) {
      if (err instanceof SlotUnavailableError) return reply.status(409).send({ error: err.message });
      throw err;
    }
  });
}
