import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { assertCanTransitionCondition, type Condition } from '../lib/anga-stock-condition.js';
import { assertCanTransitionAvailability, type Availability } from '../lib/anga-stock-availability.js';
import { resolveDisposition, type InspectionOutcome } from '../lib/anga-goods-receipt-disposition.js';
import { assertCertifiedForShipment } from '../lib/anga-certificate-gate.js';
import { computeRentalCost } from '../lib/anga-rate-card-pricing.js';
import { intervalsOverlap } from '../lib/anga-reservation-overlap.js';

/**
 * Gereji port, Milestone 5 — ANGA inventory core (stock units on four
 * independent status axes), certificates/traceability, and the rental
 * engine. Ported from the standalone Gereji app's goods-receipt/stock-unit/
 * certificate/rate-card/hire-reservation routes, reusing the same pure,
 * well-tested state-machine libraries this session already ported for
 * Milestone 5's lib files.
 */

export async function gerejiAngaInventoryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('gereji.anga'));

  fastify.setErrorHandler((error: any, _request, reply) => {
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as unknown as { issues: { path: (string | number)[]; message: string }[] };
      return reply.status(400).send({ error: 'Validation failed', details: zodError.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
    }
    if (error instanceof Error && ['InvalidConditionTransitionError', 'InvalidAvailabilityTransitionError', 'MissingCertificateError'].includes(error.name)) {
      return reply.status(409).send({ error: error.message });
    }
    const status = error && typeof error === 'object' && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply.status(status).send({ error: status < 500 ? (error.message ?? 'Request failed.') : 'Unable to process the request.' });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Goods receipts — intake creates stock units in NE/QUARANTINE,
  //  inspection resolves them onto a real condition/availability via the
  //  same disposition function used in the source app.
  // ═══════════════════════════════════════════════════════════════════

  fastify.get('/goods-receipts', async (request) => {
    return withTenant(request.user.tenant_id, async trx => {
      const receipts = await trx.selectFrom('gereji_anga_goods_receipts').selectAll()
        .where('tenant_id', '=', request.user.tenant_id).orderBy('received_at', 'desc').limit(200).execute();
      return { receipts };
    });
  });

  fastify.post('/goods-receipts', async (request, reply) => {
    const body = z.object({
      supplier_id: z.string().uuid().optional(), po_reference: z.string().optional(), notes: z.string().optional(),
      lines: z.array(z.object({
        part_id: z.string().uuid(), serial: z.string().optional(), lot_number: z.string().optional(),
        quantity: z.number().int().positive().default(1),
      })).min(1),
    }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      if (body.supplier_id) {
        const supplier = await trx.selectFrom('gereji_anga_suppliers').select('id').where('id', '=', body.supplier_id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
        if (!supplier) throw { statusCode: 404, message: 'Supplier not found' };
      }
      const [receipt] = await trx.insertInto('gereji_anga_goods_receipts').values({
        tenant_id: request.user.tenant_id, supplier_id: body.supplier_id ?? null, po_reference: body.po_reference ?? null,
        received_by: request.user.sub, notes: body.notes ?? null,
      }).returningAll().execute();

      for (const line of body.lines) {
        const part = await trx.selectFrom('gereji_anga_parts').select('id').where('id', '=', line.part_id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
        if (!part) throw { statusCode: 404, message: `Part ${line.part_id} not found` };

        const [stockUnit] = await trx.insertInto('gereji_anga_stock_units').values({
          tenant_id: request.user.tenant_id, part_id: line.part_id, serial: line.serial ?? null,
          lot_number: line.lot_number ?? null, quantity: line.quantity,
        }).returningAll().execute();

        await trx.insertInto('gereji_anga_goods_receipt_lines').values({
          tenant_id: request.user.tenant_id, receipt_id: receipt.id, stock_unit_id: stockUnit.id,
        }).execute();
      }
      reply.status(201);
      return receipt;
    });
  });

  fastify.get('/goods-receipts/:id', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async trx => {
      const receipt = await trx.selectFrom('gereji_anga_goods_receipts').selectAll()
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!receipt) throw { statusCode: 404, message: 'Receipt not found' };
      const lines = await trx.selectFrom('gereji_anga_goods_receipt_lines as l')
        .innerJoin('gereji_anga_stock_units as su', 'su.id', 'l.stock_unit_id')
        .innerJoin('gereji_anga_parts as p', 'p.id', 'su.part_id')
        .where('l.tenant_id', '=', request.user.tenant_id).where('l.receipt_id', '=', id)
        .select(['l.id', 'l.stock_unit_id', 'l.inspection_outcome', 'l.inspected_at', 'su.serial', 'su.condition', 'su.availability', 'p.pn'])
        .execute();
      return { ...receipt, lines };
    });
  });

  fastify.post('/goods-receipts/:id/lines/:lineId/inspect', async (request) => {
    const { id, lineId } = request.params as { id: string; lineId: string };
    const { outcome, notes } = z.object({ outcome: z.enum(['accepted', 'quarantined', 'rejected']), notes: z.string().optional() }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const line = await trx.selectFrom('gereji_anga_goods_receipt_lines').selectAll()
        .where('id', '=', lineId).where('receipt_id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!line) throw { statusCode: 404, message: 'Receipt line not found' };

      const stockUnit = await trx.selectFrom('gereji_anga_stock_units').select(['id', 'condition'])
        .where('id', '=', line.stock_unit_id).where('tenant_id', '=', request.user.tenant_id).forUpdate().executeTakeFirst();
      if (!stockUnit) throw { statusCode: 404, message: 'Stock unit not found' };

      const disposition = resolveDisposition(outcome as InspectionOutcome, stockUnit.condition as Condition);

      await trx.updateTable('gereji_anga_stock_units').set({
        condition: disposition.condition, availability: disposition.availability, updated_at: new Date(),
      }).where('id', '=', stockUnit.id).where('tenant_id', '=', request.user.tenant_id).execute();

      const [updatedLine] = await trx.updateTable('gereji_anga_goods_receipt_lines').set({
        inspection_outcome: outcome, inspected_by: request.user.sub, inspected_at: new Date(),
        inspection_notes: notes ?? null, updated_at: new Date(),
      }).where('id', '=', lineId).where('tenant_id', '=', request.user.tenant_id).returningAll().execute();

      return { ...updatedLine, resolved_condition: disposition.condition, resolved_availability: disposition.availability };
    });
  });

  fastify.post('/goods-receipts/:id/lines/:lineId/putaway', async (request) => {
    const { lineId } = request.params as { id: string; lineId: string };
    const { location_id } = z.object({ location_id: z.string().uuid() }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const location = await trx.selectFrom('gereji_anga_locations').select('id').where('id', '=', location_id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!location) throw { statusCode: 404, message: 'Location not found' };
      const line = await trx.selectFrom('gereji_anga_goods_receipt_lines').select(['id', 'stock_unit_id'])
        .where('id', '=', lineId).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!line) throw { statusCode: 404, message: 'Receipt line not found' };

      await trx.updateTable('gereji_anga_stock_units').set({ location_id, updated_at: new Date() })
        .where('id', '=', line.stock_unit_id).where('tenant_id', '=', request.user.tenant_id).execute();
      const [updated] = await trx.updateTable('gereji_anga_goods_receipt_lines').set({ putaway_location_id: location_id, putaway_at: new Date(), updated_at: new Date() })
        .where('id', '=', lineId).where('tenant_id', '=', request.user.tenant_id).returningAll().execute();
      return updated;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Stock units — four-axis status, certificates, traceability
  // ═══════════════════════════════════════════════════════════════════

  fastify.get('/stock-units', async (request) => {
    const { availability, condition } = z.object({ availability: z.string().optional(), condition: z.string().optional() }).parse(request.query);
    return withTenant(request.user.tenant_id, async trx => {
      let query = trx.selectFrom('gereji_anga_stock_units as su')
        .innerJoin('gereji_anga_parts as p', 'p.id', 'su.part_id')
        .where('su.tenant_id', '=', request.user.tenant_id)
        .select(['su.id', 'su.part_id', 'su.serial', 'su.lot_number', 'su.quantity', 'su.condition', 'su.ownership', 'su.customs_status', 'su.availability', 'su.location_id', 'su.created_at', 'p.pn', 'p.description']);
      if (availability) query = query.where('su.availability', '=', availability as any);
      if (condition) query = query.where('su.condition', '=', condition as any);
      const units = await query.orderBy('su.created_at', 'desc').limit(200).execute();
      return { stockUnits: units };
    });
  });

  fastify.get('/stock-units/:id', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async trx => {
      const unit = await trx.selectFrom('gereji_anga_stock_units').selectAll()
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!unit) throw { statusCode: 404, message: 'Stock unit not found' };
      const certificates = await trx.selectFrom('gereji_anga_certificates').selectAll()
        .where('stock_unit_id', '=', id).where('tenant_id', '=', request.user.tenant_id).execute();
      const traceChain = await trx.selectFrom('gereji_anga_trace_chain_links').selectAll()
        .where('stock_unit_id', '=', id).where('tenant_id', '=', request.user.tenant_id).orderBy('sequence', 'asc').execute();
      return { ...unit, certificates, trace_chain: traceChain };
    });
  });

  fastify.patch('/stock-units/:id/availability', async (request) => {
    const { id } = request.params as { id: string };
    const { availability } = z.object({ availability: z.string() }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const unit = await trx.selectFrom('gereji_anga_stock_units').selectAll()
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).forUpdate().executeTakeFirst();
      if (!unit) throw { statusCode: 404, message: 'Stock unit not found' };

      assertCanTransitionAvailability(unit.availability as Availability, availability as Availability);

      // Certificate gate (PRD M3.3): the ALLOCATED -> SOLD transition requires a
      // valid certificate whenever the part demands one.
      if (unit.availability === 'ALLOCATED' && availability === 'SOLD') {
        const part = await trx.selectFrom('gereji_anga_parts').select('certificate_required').where('id', '=', unit.part_id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirstOrThrow();
        const certs = await trx.selectFrom('gereji_anga_certificates').select(['type', 'expiry_date']).where('stock_unit_id', '=', id).where('tenant_id', '=', request.user.tenant_id).execute();
        assertCertifiedForShipment({ certificateRequired: part.certificate_required, certificates: certs.map(c => ({ type: c.type, expiryDate: c.expiry_date })) });
      }

      const [updated] = await trx.updateTable('gereji_anga_stock_units').set({ availability: availability as any, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).returningAll().execute();
      return updated;
    });
  });

  fastify.post('/stock-units/:id/certificates', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      type: z.enum(['FAA_8130_3', 'EASA_FORM_1', 'UK_CAA_FORM_1', 'TCCA_FORM_ONE', 'CASA_FORM_1', 'ANAC_F100', 'COFC', 'ATA_106', 'TEARDOWN_REPORT', 'NON_INCIDENT_STATEMENT']),
      issuing_authority: z.string().optional(), form_number: z.string().optional(),
      issue_date: z.string().optional(), expiry_date: z.string().optional(), document_url: z.string().optional(),
    }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const unit = await trx.selectFrom('gereji_anga_stock_units').select('id').where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!unit) throw { statusCode: 404, message: 'Stock unit not found' };
      const [cert] = await trx.insertInto('gereji_anga_certificates').values({
        tenant_id: request.user.tenant_id, stock_unit_id: id, type: body.type,
        issuing_authority: body.issuing_authority ?? null, form_number: body.form_number ?? null,
        issue_date: body.issue_date ? new Date(body.issue_date) : null, expiry_date: body.expiry_date ? new Date(body.expiry_date) : null,
        document_url: body.document_url ?? null,
      }).returningAll().execute();
      reply.status(201);
      return cert;
    });
  });

  fastify.post('/stock-units/:id/trace-links', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      from_party: z.string().optional(), to_party: z.string().optional(), hop_type: z.string().optional(),
      occurred_at: z.string().optional(), notes: z.string().optional(),
    }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const unit = await trx.selectFrom('gereji_anga_stock_units').select('id').where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!unit) throw { statusCode: 404, message: 'Stock unit not found' };
      const [{ count }] = await trx.selectFrom('gereji_anga_trace_chain_links').where('stock_unit_id', '=', id).where('tenant_id', '=', request.user.tenant_id)
        .select(trx => trx.fn.count<number>('id').as('count')).execute();
      const [link] = await trx.insertInto('gereji_anga_trace_chain_links').values({
        tenant_id: request.user.tenant_id, stock_unit_id: id, sequence: Number(count),
        from_party: body.from_party ?? null, to_party: body.to_party ?? null, hop_type: body.hop_type ?? null,
        occurred_at: body.occurred_at ? new Date(body.occurred_at) : null, notes: body.notes ?? null,
      }).returningAll().execute();
      reply.status(201);
      return link;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Rental: rate cards + hire reservations
  // ═══════════════════════════════════════════════════════════════════

  fastify.get('/rate-cards', async (request) => {
    return withTenant(request.user.tenant_id, async trx => {
      const cards = await trx.selectFrom('gereji_anga_rate_cards').selectAll()
        .where('tenant_id', '=', request.user.tenant_id).where('is_active', '=', true).execute();
      return { rateCards: cards };
    });
  });

  fastify.post('/rate-cards', async (request, reply) => {
    const body = z.object({
      name: z.string().trim().min(1), part_id: z.string().uuid().optional(), part_class: z.string().optional(),
      currency: z.string().length(3).default('USD'), daily_rate_minor: z.number().int().nonnegative(),
      min_rental_days: z.number().int().positive().default(1), min_charge_minor: z.number().int().nonnegative().default(0),
      tier_7_discount_percent: z.number().min(0).max(100).default(0), tier_30_discount_percent: z.number().min(0).max(100).default(0),
      tier_90_discount_percent: z.number().min(0).max(100).default(0),
    }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const [card] = await trx.insertInto('gereji_anga_rate_cards').values({ ...body, tenant_id: request.user.tenant_id } as any).returningAll().execute();
      reply.status(201);
      return card;
    });
  });

  /** Preview pricing without creating a reservation — lets the UI show the cost before booking. */
  fastify.get('/rate-cards/:id/price', async (request) => {
    const { id } = request.params as { id: string };
    const { days } = z.object({ days: z.coerce.number().int().positive() }).parse(request.query);
    return withTenant(request.user.tenant_id, async trx => {
      const card = await trx.selectFrom('gereji_anga_rate_cards').selectAll().where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!card) throw { statusCode: 404, message: 'Rate card not found' };
      return computeRentalCost({
        dailyRateMinor: card.daily_rate_minor, minRentalDays: card.min_rental_days, minChargeMinor: card.min_charge_minor,
        tier7DiscountPercent: Number(card.tier_7_discount_percent), tier30DiscountPercent: Number(card.tier_30_discount_percent), tier90DiscountPercent: Number(card.tier_90_discount_percent),
      }, days);
    });
  });

  fastify.get('/hire-reservations', async (request) => {
    return withTenant(request.user.tenant_id, async trx => {
      const reservations = await trx.selectFrom('gereji_anga_hire_reservations').selectAll()
        .where('tenant_id', '=', request.user.tenant_id).orderBy('start_date', 'desc').limit(200).execute();
      return { reservations };
    });
  });

  fastify.post('/hire-reservations', async (request, reply) => {
    const body = z.object({
      stock_unit_id: z.string().uuid(), customer_id: z.string().uuid().optional(),
      start_date: z.string(), end_date: z.string(), notes: z.string().optional(),
    }).parse(request.body);
    const startDate = new Date(body.start_date);
    const endDate = new Date(body.end_date);
    if (endDate <= startDate) throw { statusCode: 422, message: 'end_date must be after start_date' };

    return withTenant(request.user.tenant_id, async trx => {
      // Locks the stock unit row for the duration of this transaction — the real
      // guard against a concurrent double-booking race under Postgres's MVCC
      // (see anga-reservation-overlap.ts's own doc comment for why this
      // stands in for a Postgres exclusion constraint rather than adding one).
      const unit = await trx.selectFrom('gereji_anga_stock_units').select('id')
        .where('id', '=', body.stock_unit_id).where('tenant_id', '=', request.user.tenant_id).forUpdate().executeTakeFirst();
      if (!unit) throw { statusCode: 404, message: 'Stock unit not found' };

      const activeReservations = await trx.selectFrom('gereji_anga_hire_reservations').select(['start_date', 'end_date'])
        .where('stock_unit_id', '=', body.stock_unit_id).where('tenant_id', '=', request.user.tenant_id)
        .where('status', 'in', ['held', 'confirmed', 'out']).execute();

      const conflict = activeReservations.some(r => intervalsOverlap({ startDate, endDate }, { startDate: r.start_date, endDate: r.end_date }));
      if (conflict) throw { statusCode: 409, message: 'This stock unit is already reserved for an overlapping date range' };

      const [reservation] = await trx.insertInto('gereji_anga_hire_reservations').values({
        tenant_id: request.user.tenant_id, stock_unit_id: body.stock_unit_id, customer_id: body.customer_id ?? null,
        start_date: startDate, end_date: endDate, notes: body.notes ?? null,
      }).returningAll().execute();
      reply.status(201);
      return reservation;
    });
  });

  const RESERVATION_TRANSITIONS: Record<string, string[]> = {
    held: ['confirmed', 'cancelled'], confirmed: ['out', 'cancelled'], out: ['returned'], returned: [], cancelled: [],
  };

  fastify.patch('/hire-reservations/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const { status } = z.object({ status: z.enum(['held', 'confirmed', 'out', 'returned', 'cancelled']) }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const current = await trx.selectFrom('gereji_anga_hire_reservations').select(['status', 'stock_unit_id'])
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!current) throw { statusCode: 404, message: 'Reservation not found' };
      if (!RESERVATION_TRANSITIONS[current.status]?.includes(status)) throw { statusCode: 422, message: `Cannot transition from ${current.status} to ${status}` };

      const [updated] = await trx.updateTable('gereji_anga_hire_reservations').set({ status, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).returningAll().execute();

      // Mirror the reservation lifecycle onto the stock unit's own availability axis.
      if (status === 'out') await trx.updateTable('gereji_anga_stock_units').set({ availability: 'ON_LOAN', updated_at: new Date() }).where('id', '=', current.stock_unit_id).where('tenant_id', '=', request.user.tenant_id).execute();
      if (status === 'returned') await trx.updateTable('gereji_anga_stock_units').set({ availability: 'AVAILABLE', updated_at: new Date() }).where('id', '=', current.stock_unit_id).where('tenant_id', '=', request.user.tenant_id).execute();

      return updated;
    });
  });
}
