import { requireEntitlement, requireAnyEntitlement } from '../middleware/entitlement.js';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { quotationService } from '../services/quotation.service.js';
import { isTaxCodeUserError } from '../services/tax-code.service.js';
import { withTenant } from '../db/client.js';
import { resolveCustomerId } from '../services/customer-identity.service.js';

// A malformed (non-UUID) :id used to reach the DB as-is and crash with a raw
// "invalid input syntax for type uuid" driver error (sanitized to an opaque
// 500 by the global handler, but still the wrong status code for a caller-
// input problem) instead of the clean 404 every one of these routes already
// gives a well-formed-but-nonexistent id — live-reproduced across all four
// :id routes in this file before this fix.
const idParamSchema = z.object({ id: z.string().uuid() });

// Matches the frontend's actual route grant for /quotations (FIN_ROLES +
// SENIOR, apps/web/src/lib/permissions.ts) — the inline checks below used
// to allow OFFICER (a role the frontend route guard never lets reach this
// page at all, so a dead grant) while blocking ADMIN/FINANCE/SALES/SENIOR,
// who the frontend explicitly permits: any of those four could see the
// Quotations page and every one of its buttons, then get 403'd the moment
// they tried to create, edit, or convert a quote.
const QUOTE_WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR'];
const QUOTE_DELETE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];

export async function quotationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  // Sales.tsx (the only frontend consumer) lives under /crm/sales, gated by
  // CRM_ROLES with no clearos check at all — a tenant entitled to 'crm' but
  // not 'clearos' could open the page from its own nav and have every call
  // here 403 the moment it loaded. requireAnyEntitlement — the same fix
  // seal-crm-link.routes.ts already uses for lots-for-customer — lets either
  // entitlement in; the one action that actually creates ClearOS data
  // (convert-to-shipment, below) still gates on 'clearos' specifically.
  app.addHook('preHandler', requireAnyEntitlement(['crm', 'clearos']));

  // HUD-0024 continuation: neither route below enforced `customer_id` at
  // all — any CUSTOMER JWT could list or open every quotation in the
  // tenant (including other customers' quoted prices) by omitting the
  // filter or guessing an id. Scoped the same way shipments.routes.ts
  // already does it: a CUSTOMER's own resolved id always wins over
  // whatever the query/param says.
  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const query = req.query as any;
    const customerId = user.role === 'CUSTOMER' ? (await resolveCustomerId(user)) ?? '00000000-0000-0000-0000-000000000000' : query.customer_id;
    const quotes = await quotationService.list(user.tenant_id, {
      status: query.status,
      customer_id: customerId,
    });
    return quotes;
  });

  app.get('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { id } = idParamSchema.parse(req.params);
    const quote = await quotationService.getById(user.tenant_id, id);
    if (!quote) return reply.status(404).send({ error: 'Quotation not found' });
    if (user.role === 'CUSTOMER' && (quote as any).customer_id !== await resolveCustomerId(user)) {
      return reply.status(404).send({ error: 'Quotation not found' });
    }
    return quote;
  });

  app.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!QUOTE_WRITE_ROLES.includes(user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
    const body = req.body as any;
    try {
      // HUD-0058: this file's `(req as any).user` cast hid a `user.id`
      // typo — JWTPayload only has `.sub` — at all three call sites in this
      // file that pass an actor id (here, /status, and /convert). Every
      // quotation's prepared_by/approved_by, and every quote-converted
      // shipment's assigned_to, was silently null regardless of who acted.
      const quote = await quotationService.create(user.tenant_id, user.sub, body);
      return reply.code(201).send(quote);
    } catch (e) {
      // An unknown (or another tenant's) tax code is a bad request, not a
      // server fault.
      if (isTaxCodeUserError(e)) return reply.code(400).send({ error: e.message });
      throw e;
    }
  });

  // HUD-0058: the only mutating route in this file with no role check at
  // all — POST/convert/DELETE below all gate on QUOTE_WRITE_ROLES, but this
  // one let ANY authenticated user approve or reject ANY quotation in the
  // tenant. GET /:id already deliberately 404s a CUSTOMER against another
  // customer's quote (line ~51), yet that same blocked customer could still
  // silently approve it here — confirmed live. Approving/rejecting is a
  // staff decision in every other approval workflow this platform has
  // (Petti, ComplyOS, NexusHR); a customer accepting or declining a quote
  // sent to them isn't a feature this codebase builds today, so the fix is
  // the same guard the sibling routes already use, not a narrower
  // ownership check.
  app.patch('/:id/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!QUOTE_WRITE_ROLES.includes(user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
    const { id } = idParamSchema.parse(req.params);
    const { status, reason } = req.body as any;
    const quote = await quotationService.updateStatus(user.tenant_id, id, status, user.sub, reason);
    if (!quote) return reply.status(404).send({ error: 'Quotation not found' });
    return quote;
  });

  app.post('/:id/convert', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!QUOTE_WRITE_ROLES.includes(user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
    // Unlike the rest of this file, converting a quote actually inserts a
    // real shipment_cases row — a genuine ClearOS write, so it stays behind
    // 'clearos' specifically even though the module as a whole now also
    // accepts a plain 'crm' entitlement.
    await requireEntitlement('clearos')(req, reply);
    if (reply.sent) return;
    const { id } = idParamSchema.parse(req.params);
    try {
      const result = await quotationService.convertToShipment(user.tenant_id, id, user.sub);
      if (!result) return reply.status(404).send({ error: 'Quotation not found' });
      return result;
    } catch (e: any) {
      // "Only approved quotations can be converted" is the one business-rule
      // throw convertToShipment makes — a bad request, not a server fault.
      if (e instanceof Error && e.message === 'Only approved quotations can be converted') {
        return reply.status(400).send({ error: e.message });
      }
      throw e;
    }
  });

  // PATCH /:id — full quotation update (recomputes totals from lines)
  app.patch('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!QUOTE_WRITE_ROLES.includes(user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
    const { id } = idParamSchema.parse(req.params);
    const tenantId = user.tenant_id;
    const body = req.body as any;

    return withTenant(tenantId, async (trx) => {
      // Recompute totals from lines if provided
      let subtotal = 0;
      let totalTax = 0;
      const lines: any[] = (body.lines || []).map((line: any, idx: number) => {
        const lineTotal = Number(line.quantity) * Number(line.unit_price);
        const taxRate = Number(line.tax_rate) || 0;
        const taxAmount = lineTotal * (taxRate / 100);
        subtotal += lineTotal;
        totalTax += taxAmount;
        return {
          ...line,
          line_number: idx + 1,
          line_total: lineTotal,
          tax_amount: taxAmount,
          tax_rate: taxRate,
        };
      });

      const updateData: any = { updated_at: new Date() };
      if (body.title !== undefined) updateData.title = body.title;
      if (body.goods_description !== undefined) updateData.goods_description = body.goods_description;
      if (body.origin_port !== undefined) updateData.origin_port = body.origin_port;
      if (body.origin_city !== undefined) updateData.origin_city = body.origin_city;
      if (body.destination_port !== undefined) updateData.destination_port = body.destination_port;
      if (body.destination_city !== undefined) updateData.destination_city = body.destination_city;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.valid_from !== undefined) updateData.valid_from = body.valid_from ? new Date(body.valid_from) : null;
      if (body.valid_until !== undefined) updateData.valid_until = body.valid_until ? new Date(body.valid_until) : null;
      if (body.currency !== undefined) updateData.currency = body.currency;
      if (body.shipment_type !== undefined) updateData.shipment_type = body.shipment_type;
      if (body.customer_id !== undefined) updateData.customer_id = body.customer_id;
      if (body.lines !== undefined) {
        updateData.subtotal = subtotal;
        updateData.tax_amount = totalTax;
        updateData.total_amount = subtotal + totalTax;
      }

      // HUD-0097 (addendum): never checked the quotation existed — a bad id
      // crashed instead of 404ing. Multi-line-chain miss from the original
      // sweep.
      const quote = await trx
        .updateTable('quotations')
        .set(updateData)
        .where('id', '=', id)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirst();
      if (!quote) return reply.code(404).send({ error: 'Quotation not found' });

      // Replace lines if provided
      if (body.lines !== undefined) {
        await trx
          .deleteFrom('quotation_lines')
          .where('quotation_id', '=', id)
          .execute();

        if (lines.length > 0) {
          await trx
            .insertInto('quotation_lines')
            .values(
              lines.map((l: any) => ({
                quotation_id: id,
                line_number: l.line_number,
                description: l.description,
                category: l.category,
                quantity: l.quantity,
                unit_price: l.unit_price,
                tax_rate: l.tax_rate,
                tax_amount: l.tax_amount,
                line_total: l.line_total,
                is_optional: l.is_optional || false,
                vendor: l.vendor || null,
                created_at: new Date(),
              }))
            )
            .execute();
        }
      }

      return quote;
    });
  });

  // DELETE /:id — hard delete
  app.delete('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!QUOTE_DELETE_ROLES.includes(user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
    const { id } = idParamSchema.parse(req.params);
    const tenantId = user.tenant_id;

    return withTenant(tenantId, async (trx) => {
      // quotation_lines has no tenant_id column of its own — deleting by
      // quotation_id alone (as this used to) would delete another tenant's
      // line items for any quotation UUID a caller knew, since nothing
      // confirmed the quotation itself belongs to this tenant first.
      const quotation = await trx.selectFrom('quotations').select('id')
        .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!quotation) return reply.code(404).send({ error: 'Quotation not found' });

      await trx
        .deleteFrom('quotation_lines')
        .where('quotation_id', '=', id)
        .execute();

      await trx
        .deleteFrom('quotations')
        .where('id', '=', id)
        .where('tenant_id', '=', tenantId)
        .execute();

      return reply.code(204).send();
    });
  });
}
