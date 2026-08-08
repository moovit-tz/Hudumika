import { requireEntitlement } from '../middleware/entitlement.js';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { quotationService } from '../services/quotation.service.js';
import { isTaxCodeUserError } from '../services/tax-code.service.js';
import { withTenant } from '../db/client.js';

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
  app.addHook('preHandler', requireEntitlement('clearos'));

  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const query = req.query as any;
    const quotes = await quotationService.list(user.tenant_id, {
      status: query.status,
      customer_id: query.customer_id,
    });
    return quotes;
  });

  app.get('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    const quote = await quotationService.getById(user.tenant_id, id);
    return quote;
  });

  app.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!QUOTE_WRITE_ROLES.includes(user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
    const body = req.body as any;
    try {
      const quote = await quotationService.create(user.tenant_id, user.id, body);
      return reply.code(201).send(quote);
    } catch (e) {
      // An unknown (or another tenant's) tax code is a bad request, not a
      // server fault.
      if (isTaxCodeUserError(e)) return reply.code(400).send({ error: e.message });
      throw e;
    }
  });

  app.patch('/:id/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    const { status, reason } = req.body as any;
    const quote = await quotationService.updateStatus(user.tenant_id, id, status, user.id, reason);
    return quote;
  });

  app.post('/:id/convert', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!QUOTE_WRITE_ROLES.includes(user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
    const { id } = req.params as any;
    const result = await quotationService.convertToShipment(user.tenant_id, id, user.id);
    return result;
  });

  // PATCH /:id — full quotation update (recomputes totals from lines)
  app.patch('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!QUOTE_WRITE_ROLES.includes(user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
    const { id } = req.params as any;
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

      const quote = await trx
        .updateTable('quotations')
        .set(updateData)
        .where('id', '=', id)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();

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
    const { id } = req.params as any;
    const tenantId = user.tenant_id;

    return withTenant(tenantId, async (trx) => {
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
