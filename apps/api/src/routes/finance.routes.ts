import { requireAppEnabled } from '../middleware/appGate.js';
import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { FinanceService } from '../services/finance.service.js';
import { requireRole } from '../middleware/rbac.js';
import type { RecordExpenseInput } from '@hudumika/types';

export async function financeRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAppEnabled('finops'));

  /**
   * GET /v1/shipments/:id/pnl
   * Get shipment profitability metrics
   */
  fastify.get('/:id/pnl', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
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

      return reply.status(211).send(recorded);
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
        .select(['ref_number', 'stage'])
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
        .where('id', '=', id)
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

      // Alert clients via socket
      fastify.websocketServer?.clients.forEach((client: any) => {
        client.send(
          JSON.stringify({
            type: 'invoice.finalised',
            caseId: id,
            invoiceId: `inv_${id.substring(0, 8)}`,
          })
        );
      });

      return { success: true, message: 'Invoice finalised successfully' };
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
        .where('id', '=', id)
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
