import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { FinanceService } from '../services/finance.service.js';
import { requireRole } from '../middleware/rbac.js';
import type { RecordExpenseInput } from '@hudumika/types';
import { computeVatReturn } from '../services/vat-return.service.js';

export async function financeRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  /**
   * GET /v1/finance/vat-return?from=&to=
   *
   * Output tax, input tax, and what is actually recoverable after partial
   * exemption — computed from the documents, so every figure has a source.
   */
  fastify.get('/vat-return', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { from, to, currency } = request.query as { from?: string; to?: string; currency?: string };
    const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!isDate(from) || !isDate(to)) {
      return reply.status(400).send({ error: 'from and to are required, as YYYY-MM-DD' });
    }
    if (from! > to!) return reply.status(400).send({ error: '`from` must not be after `to`' });

    return withTenant(user.tenant_id, async (trx) => {
      const settings = await trx.selectFrom('tenant_settings').select('settings')
        .where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const configured = (settings?.settings as any)?.company?.currency;
      return computeVatReturn(trx, user.tenant_id, from!, to!, currency || configured || 'TZS');
    });
  });

  /**
   * GET /v1/shipments/:id/pnl
   * Get shipment profitability metrics
   */
  fastify.get('/:id/pnl', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    try {
      const pnl = await FinanceService.computePnL(user.tenant_id, id);
      return pnl;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Failed to compute shipment P&L' });
    }
  });

  /**
   * POST /v1/shipments/:id/expenses
   * Record a cost or revenue item for a shipment
   */
  fastify.post('/:id/expenses', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const input = request.body as RecordExpenseInput;

    try {
      const recorded = await FinanceService.recordExpense(user.tenant_id, id, {
        ...input,
        recorded_by: user.sub,
      });

      // 201 Created — was 211, which is not a registered HTTP status.
      return reply.status(201).send(recorded);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Failed to record fee line' });
    }
  });

  /**
   * GET /v1/shipments/:id/invoice
   * Get invoice items (all revenue items billed to the customer)
   */
  fastify.get('/:id/invoice', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      // Security check: Customer can only access their own invoice
      if (user.role === 'CUSTOMER') {
        const shipment = await trx
          .selectFrom('shipment_cases')
          .select('customer_id')
          .where('id', '=', id)
          .executeTakeFirst();
        if (!shipment || shipment.customer_id !== user.sub) {
          return reply.status(403).send({ error: 'Forbidden: Access denied' });
        }
      }

      // Fetch all billed lines (is_revenue = true)
      const billedLines = await trx
        .selectFrom('expenses')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('shipment_id', '=', id)
        .where('is_revenue', '=', true)
        .orderBy('created_at', 'asc')
        .execute();

      const totals = billedLines.reduce((acc, cur) => acc + Number(cur.amount_tzs), 0);

      // Return invoice summary object
      return {
        shipment_id: id,
        invoice_lines: billedLines,
        total_amount_tzs: totals,
        currency: 'TZS',
      };
    });
  });

  /**
   * POST /v1/shipments/:id/invoice/finalise
   * Transitions shipment to INVOICING status and finalizes costs
   */
  fastify.post('/:id/invoice/finalise', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE', 'MANAGER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const shipment = await trx
        .selectFrom('shipment_cases')
        .select(['ref_number', 'stage', 'customer_id', 'bl_number', 'awb_number', 'port_of_loading', 'port_of_discharge', 'type'])
        .where('id', '=', id)
        .executeTakeFirst();

      if (!shipment) {
        return reply.status(404).send({ error: 'Shipment case not found' });
      }

      // Transition to INVOICING stage
      await trx
        .updateTable('shipment_cases')
        .set({
          stage: 'INVOICING',
          updated_at: new Date(),
        })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .execute();

      // Log timeline event
      await trx
        .insertInto('stage_history')
        .values({
          tenant_id: user.tenant_id,
          shipment_id: id,
          stage: 'INVOICING',
          entered_at: new Date(),
          actor_id: user.sub,
          note: 'Final invoice compiled and published to Customer Portal.',
        })
        .execute();

      // Loop into FinOps: upsert a real sales_invoices row (keyed by
      // shipment_ref, same soft-link the codebase already uses to resolve
      // a shipment's live CO2 data on an invoice — see invoices.routes.ts
      // GET /:id) so this shipment's billed revenue shows up in the
      // Billing page as a first-class invoice, not just a stage flag.
      const revenueLines = await trx
        .selectFrom('expenses')
        .select(['label', 'amount_tzs'])
        .where('tenant_id', '=', user.tenant_id)
        .where('shipment_id', '=', id)
        .where('is_revenue', '=', true)
        .execute();

      const existingInvoice = await trx
        .selectFrom('sales_invoices')
        .select(['id'])
        .where('shipment_ref', '=', shipment.ref_number)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      const modeMap: Record<string, string> = { SEA_FCL: 'SEA', SEA_LCL: 'SEA', AIR: 'AIR', ROAD: 'ROAD', RAIL: 'SEA', BULK: 'SEA' };

      let invoiceId: string;
      if (!existingInvoice) {
        const customer = await trx.selectFrom('customers').select(['name']).where('tenant_id', '=', user.tenant_id).where('id', '=', shipment.customer_id).executeTakeFirst();
        const inv = await trx.insertInto('sales_invoices').values({
          tenant_id: user.tenant_id,
          invoice_number: `${shipment.ref_number} INV`,
          shipment_ref: shipment.ref_number,
          customer_id: shipment.customer_id,
          client_name: customer?.name ?? null,
          client_address: JSON.stringify([]),
          bl_number: shipment.bl_number || shipment.awb_number,
          origin: shipment.port_of_loading,
          destination: shipment.port_of_discharge,
          mode: modeMap[shipment.type] || 'SEA',
          bill_date: new Date(),
          status: 'Unpaid',
          received: 0,
          version: 1,
          created_by: user.sub,
        }).returningAll().executeTakeFirstOrThrow();
        invoiceId = inv.id;
      } else {
        invoiceId = existingInvoice.id;
        // Re-finalize: refresh lines only, never touch status/received —
        // an already Partial/Paid invoice must not be reset to Unpaid.
        await trx.deleteFrom('sales_invoice_lines').where('invoice_id', '=', invoiceId).execute();
      }

      if (revenueLines.length > 0) {
        await trx.insertInto('sales_invoice_lines').values(
          revenueLines.map((l, i) => ({
            invoice_id: invoiceId,
            name: l.label,
            unit: 'PER BIL',
            rate: l.amount_tzs,
            qty: 1,
            tax_pct: 0,
            line_group: 'clearing',
            currency: 'TZS',
            sort_order: i,
          }))
        ).execute();
      }

      // Alert clients via socket
      fastify.websocketServer?.clients.forEach((client: any) => {
        client.send(
          JSON.stringify({
            type: 'invoice.finalised',
            caseId: id,
            invoiceId,
          })
        );
      });

      return { success: true, message: 'Invoice finalised successfully', invoice_id: invoiceId };
    });
  });

  /**
   * PATCH /v1/shipments/:id/invoice/pay
   * Record payment of final invoice and transition shipment to CLOSED status
   */
  fastify.patch('/:id/invoice/pay', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const shipment = await trx
        .selectFrom('shipment_cases')
        .select(['ref_number', 'stage'])
        .where('id', '=', id)
        .executeTakeFirst();

      if (!shipment) {
        return reply.status(404).send({ error: 'Shipment case not found' });
      }

      // Transition to CLOSED
      await trx
        .updateTable('shipment_cases')
        .set({
          stage: 'CLOSED',
          updated_at: new Date(),
        })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .execute();

      // Log event
      await trx
        .insertInto('stage_history')
        .values({
          tenant_id: user.tenant_id,
          shipment_id: id,
          stage: 'CLOSED',
          entered_at: new Date(),
          actor_id: user.sub,
          note: 'Full payment recorded. Clearance case marked CLOSED.',
        })
        .execute();

      return { success: true, message: 'Payment recorded, case closed successfully' };
    });
  });
}
