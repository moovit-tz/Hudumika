import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { computeQuoteLine, computeQuoteTotals } from '../lib/anga-quote-costing.js';

/**
 * Gereji port, Milestone 3 — ANGA RFQ intake + quote engine. Ported from the
 * standalone Gereji app's anga_rfq/anga_quote routes, with real validated
 * status transitions (the source app's PATCH endpoint accepted any field
 * including status with no state-machine guard at all — elevated to match
 * every other ANGA/Gereji workflow in this codebase, not a literal port).
 */

const RFQ_TRANSITIONS: Record<string, string[]> = {
  new: ['quoted', 'lost', 'expired'], quoted: ['won', 'lost', 'expired'], won: [], lost: [], expired: [],
};
const QUOTE_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent'], sent: ['accepted', 'rejected', 'expired'], accepted: ['converted'],
  rejected: [], expired: [], superseded: [], converted: [],
};

async function nextNumber(trx: Transaction<Database>, tenantId: string, table: 'gereji_anga_rfqs' | 'gereji_anga_quotes', prefix: string) {
  const [{ count }] = await trx.selectFrom(table).where('tenant_id', '=', tenantId).select(sql<number>`count(*)::int`.as('count')).execute();
  return `${prefix}-${String(count + 1).padStart(5, '0')}`;
}

export async function gerejiAngaQuotesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('gereji.anga'));

  fastify.setErrorHandler((error: any, _request, reply) => {
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as unknown as { issues: { path: (string | number)[]; message: string }[] };
      return reply.status(400).send({ error: 'Validation failed', details: zodError.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
    }
    const status = error && typeof error === 'object' && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply.status(status).send({ error: status < 500 ? (error.message ?? 'Request failed.') : 'Unable to process the request.' });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  RFQ intake
  // ═══════════════════════════════════════════════════════════════════

  const rfqItemSchema = z.object({
    part_id: z.string().uuid().optional(),
    pn_free_text: z.string().optional(),
    quantity: z.number().int().positive().default(1),
    condition_acceptable: z.string().optional(),
  }).refine(it => it.part_id || it.pn_free_text, { message: 'Each RFQ item needs a part_id or free-text PN.' });

  fastify.get('/rfqs', async (request) => {
    return withTenant(request.user.tenant_id, async trx => {
      const rfqs = await trx.selectFrom('gereji_anga_rfqs').selectAll()
        .where('tenant_id', '=', request.user.tenant_id).orderBy('created_at', 'desc').limit(200).execute();
      return { rfqs };
    });
  });

  fastify.post('/rfqs', async (request, reply) => {
    const body = z.object({
      customer_id: z.string().uuid().optional(), source: z.enum(['phone', 'email', 'portal', 'walk_in', 'other']).default('phone'),
      aircraft_reg: z.string().optional(), required_by: z.string().optional(), aog_flag: z.boolean().default(false),
      notes: z.string().optional(), items: z.array(rfqItemSchema).default([]),
    }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      if (body.customer_id) {
        const customer = await trx.selectFrom('gereji_anga_customers').select('id').where('id', '=', body.customer_id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
        if (!customer) throw { statusCode: 404, message: 'Customer not found' };
      }
      const number = await nextNumber(trx, request.user.tenant_id, 'gereji_anga_rfqs', 'RFQ');
      const [rfq] = await trx.insertInto('gereji_anga_rfqs').values({
        tenant_id: request.user.tenant_id, number, customer_id: body.customer_id ?? null, source: body.source,
        aircraft_reg: body.aircraft_reg ?? null, required_by: body.required_by ? new Date(body.required_by) : null,
        aog_flag: body.aog_flag, notes: body.notes ?? null, created_by: request.user.sub,
      } as any).returningAll().execute();

      if (body.items.length > 0) {
        await trx.insertInto('gereji_anga_rfq_items').values(
          body.items.map(it => ({
            tenant_id: request.user.tenant_id, rfq_id: rfq.id, part_id: it.part_id ?? null,
            pn_free_text: it.pn_free_text ?? null, quantity: it.quantity, condition_acceptable: it.condition_acceptable ?? null,
          })),
        ).execute();
      }
      reply.status(201);
      return rfq;
    });
  });

  fastify.get('/rfqs/:id', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async trx => {
      const rfq = await trx.selectFrom('gereji_anga_rfqs').selectAll()
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!rfq) throw { statusCode: 404, message: 'RFQ not found' };
      const items = await trx.selectFrom('gereji_anga_rfq_items').selectAll()
        .where('rfq_id', '=', id).where('tenant_id', '=', request.user.tenant_id).execute();
      return { ...rfq, items };
    });
  });

  fastify.patch('/rfqs/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const { status } = z.object({ status: z.enum(['new', 'quoted', 'won', 'lost', 'expired']) }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const current = await trx.selectFrom('gereji_anga_rfqs').select('status').where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!current) throw { statusCode: 404, message: 'RFQ not found' };
      if (!RFQ_TRANSITIONS[current.status]?.includes(status)) throw { statusCode: 422, message: `Cannot transition from ${current.status} to ${status}` };
      const [updated] = await trx.updateTable('gereji_anga_rfqs').set({ status, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).returningAll().execute();
      return updated;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Quotes — cost build-up, versioning, status lifecycle
  // ═══════════════════════════════════════════════════════════════════

  const quoteItemSchema = z.object({
    part_id: z.string().uuid().optional(),
    pn_free_text: z.string().optional(),
    description: z.string().optional(),
    quantity: z.number().int().positive().default(1),
    part_cost_minor: z.number().int().nonnegative().default(0),
    freight_minor: z.number().int().nonnegative().default(0),
    duty_vat_minor: z.number().int().nonnegative().default(0),
    clearance_fee_minor: z.number().int().nonnegative().default(0),
    handling_minor: z.number().int().nonnegative().default(0),
    margin_percent: z.number().min(0).max(1000).default(0),
  }).refine(it => it.part_id || it.pn_free_text, { message: 'Each quote item needs a part_id or free-text PN.' });

  function buildLines(items: z.infer<typeof quoteItemSchema>[]) {
    return items.map(it => ({ ...it, ...computeQuoteLine(it) }));
  }

  fastify.get('/quotes', async (request) => {
    return withTenant(request.user.tenant_id, async trx => {
      const quotes = await trx.selectFrom('gereji_anga_quotes').selectAll()
        .where('tenant_id', '=', request.user.tenant_id).orderBy('created_at', 'desc').limit(200).execute();
      return { quotes };
    });
  });

  fastify.post('/quotes', async (request, reply) => {
    const body = z.object({
      rfq_id: z.string().uuid().optional(), customer_id: z.string().uuid().optional(),
      currency: z.string().length(3).default('USD'), fx_rate: z.number().positive().optional(),
      fx_buffer_percent: z.number().min(0).max(100).default(0), valid_until: z.string().optional(),
      notes: z.string().optional(), items: z.array(quoteItemSchema).default([]),
    }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const lines = buildLines(body.items);
      const totals = computeQuoteTotals(lines);
      const number = await nextNumber(trx, request.user.tenant_id, 'gereji_anga_quotes', 'AQT');

      const [quote] = await trx.insertInto('gereji_anga_quotes').values({
        tenant_id: request.user.tenant_id, number, rfq_id: body.rfq_id ?? null, customer_id: body.customer_id ?? null,
        currency: body.currency, fx_rate: body.fx_rate ?? null, fx_buffer_percent: body.fx_buffer_percent,
        valid_until: body.valid_until ? new Date(body.valid_until) : null,
        subtotal_minor: totals.subtotal_minor, margin_total_minor: totals.margin_total_minor, total_minor: totals.total_minor,
        notes: body.notes ?? null, created_by: request.user.sub,
      } as any).returningAll().execute();

      if (lines.length > 0) {
        await trx.insertInto('gereji_anga_quote_items').values(
          lines.map(l => ({
            tenant_id: request.user.tenant_id, quote_id: quote.id, part_id: l.part_id ?? null, pn_free_text: l.pn_free_text ?? null,
            description: l.description ?? null, quantity: l.quantity, part_cost_minor: l.part_cost_minor, freight_minor: l.freight_minor,
            duty_vat_minor: l.duty_vat_minor, clearance_fee_minor: l.clearance_fee_minor, handling_minor: l.handling_minor,
            margin_percent: l.margin_percent, line_cost_minor: l.line_cost_minor, margin_minor: l.margin_minor, sell_price_minor: l.sell_price_minor,
          })),
        ).execute();
      }
      reply.status(201);
      return quote;
    });
  });

  fastify.get('/quotes/:id', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async trx => {
      const quote = await trx.selectFrom('gereji_anga_quotes').selectAll()
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!quote) throw { statusCode: 404, message: 'Quote not found' };
      const items = await trx.selectFrom('gereji_anga_quote_items').selectAll()
        .where('quote_id', '=', id).where('tenant_id', '=', request.user.tenant_id).execute();
      return { ...quote, items };
    });
  });

  fastify.patch('/quotes/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const { status } = z.object({ status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted']) }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const current = await trx.selectFrom('gereji_anga_quotes').select(['status', 'rfq_id']).where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!current) throw { statusCode: 404, message: 'Quote not found' };
      if (!QUOTE_TRANSITIONS[current.status]?.includes(status)) throw { statusCode: 422, message: `Cannot transition from ${current.status} to ${status}` };
      const [updated] = await trx.updateTable('gereji_anga_quotes').set({ status, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).returningAll().execute();

      // A quote that's actually been sent means its RFQ has been quoted;
      // acceptance closes the loop as won. Best-effort — the RFQ may have
      // already moved on (e.g. a later version), so a blocked transition
      // here is silently skipped rather than failing the quote update.
      if (current.rfq_id) {
        const rfq = await trx.selectFrom('gereji_anga_rfqs').select('status').where('id', '=', current.rfq_id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
        if (rfq) {
          if (status === 'sent' && RFQ_TRANSITIONS[rfq.status]?.includes('quoted')) {
            await trx.updateTable('gereji_anga_rfqs').set({ status: 'quoted', updated_at: new Date() }).where('id', '=', current.rfq_id).where('tenant_id', '=', request.user.tenant_id).execute();
          }
          if (status === 'accepted' && RFQ_TRANSITIONS[rfq.status]?.includes('won')) {
            await trx.updateTable('gereji_anga_rfqs').set({ status: 'won', updated_at: new Date() }).where('id', '=', current.rfq_id).where('tenant_id', '=', request.user.tenant_id).execute();
          }
        }
      }
      return updated;
    });
  });

  /** Quote versioning: clone the quote + items into a new draft, supersede the original. */
  fastify.post('/quotes/:id/version', async (request, reply) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async trx => {
      const original = await trx.selectFrom('gereji_anga_quotes').selectAll()
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!original) throw { statusCode: 404, message: 'Quote not found' };

      const originalItems = await trx.selectFrom('gereji_anga_quote_items').selectAll()
        .where('quote_id', '=', id).where('tenant_id', '=', request.user.tenant_id).execute();

      await trx.updateTable('gereji_anga_quotes').set({ status: 'superseded', updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).execute();

      const number = await nextNumber(trx, request.user.tenant_id, 'gereji_anga_quotes', 'AQT');
      const [row] = await trx.insertInto('gereji_anga_quotes').values({
        tenant_id: request.user.tenant_id, number, rfq_id: original.rfq_id, customer_id: original.customer_id,
        version: original.version + 1, previous_version_id: original.id, status: 'draft' as any,
        currency: original.currency, fx_rate: original.fx_rate, fx_buffer_percent: original.fx_buffer_percent,
        valid_until: original.valid_until, subtotal_minor: original.subtotal_minor, margin_total_minor: original.margin_total_minor,
        total_minor: original.total_minor, notes: original.notes, created_by: request.user.sub,
      } as any).returningAll().execute();

      if (originalItems.length > 0) {
        await trx.insertInto('gereji_anga_quote_items').values(
          originalItems.map(it => ({
            tenant_id: request.user.tenant_id, quote_id: row.id, part_id: it.part_id, pn_free_text: it.pn_free_text,
            description: it.description, quantity: it.quantity, part_cost_minor: it.part_cost_minor, freight_minor: it.freight_minor,
            duty_vat_minor: it.duty_vat_minor, clearance_fee_minor: it.clearance_fee_minor, handling_minor: it.handling_minor,
            margin_percent: it.margin_percent, line_cost_minor: it.line_cost_minor, margin_minor: it.margin_minor, sell_price_minor: it.sell_price_minor,
          })),
        ).execute();
      }
      reply.status(201);
      return row;
    });
  });
}
