import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { SealStockAccountService, StockAccountPeriodExists } from '../services/seal-stock-account.service.js';

function mapPeriod(row: any) {
  return {
    id: row.id,
    compartmentId: row.compartment_id,
    compartmentName: row.compartment_name ?? undefined,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    openingLotCount: row.opening_lot_count,
    closingLotCount: row.closing_lot_count,
    totalDutyAtRisk: Number(row.total_duty_at_risk),
    totalTaxAtRisk: Number(row.total_tax_at_risk),
    generatedAt: row.generated_at,
    submissionReference: row.submission_reference,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
  };
}

export async function sealStockAccountRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('seal'));

  fastify.get('/stock-account/periods', async (request: any, reply) => {
    try {
      const { compartment_id } = request.query as { compartment_id?: string };
      const rows = await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('seal_stock_account_periods')
          .leftJoin('seal_compartments', 'seal_compartments.id', 'seal_stock_account_periods.compartment_id')
          .select([
            'seal_stock_account_periods.id', 'seal_stock_account_periods.compartment_id',
            'seal_compartments.name as compartment_name',
            'seal_stock_account_periods.period_start', 'seal_stock_account_periods.period_end',
            'seal_stock_account_periods.status', 'seal_stock_account_periods.opening_lot_count',
            'seal_stock_account_periods.closing_lot_count', 'seal_stock_account_periods.total_duty_at_risk',
            'seal_stock_account_periods.total_tax_at_risk', 'seal_stock_account_periods.generated_at',
            'seal_stock_account_periods.submission_reference', 'seal_stock_account_periods.submitted_at',
            'seal_stock_account_periods.created_at',
          ])
          .where('seal_stock_account_periods.tenant_id', '=', request.user.tenant_id)
          .orderBy('seal_stock_account_periods.period_start', 'desc');
        if (compartment_id) q = q.where('seal_stock_account_periods.compartment_id', '=', compartment_id);
        return q.execute();
      });
      return rows.map(mapPeriod);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/stock-account/periods/:id', async (request: any, reply) => {
    try {
      const period = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_stock_account_periods')
          .leftJoin('seal_compartments', 'seal_compartments.id', 'seal_stock_account_periods.compartment_id')
          .selectAll('seal_stock_account_periods').select('seal_compartments.name as compartment_name')
          .where('seal_stock_account_periods.tenant_id', '=', request.user.tenant_id)
          .where('seal_stock_account_periods.id', '=', request.params.id).executeTakeFirst()
      );
      if (!period) return reply.status(404).send({ error: 'Stock-account period not found' });
      const lines = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_stock_account_lines')
          .leftJoin('seal_lots', 'seal_lots.id', 'seal_stock_account_lines.lot_id')
          .select([
            'seal_stock_account_lines.id', 'seal_stock_account_lines.lot_id', 'seal_lots.description as lot_description',
            'seal_stock_account_lines.opening_qty', 'seal_stock_account_lines.received_qty',
            'seal_stock_account_lines.released_qty', 'seal_stock_account_lines.adjusted_qty',
            'seal_stock_account_lines.closing_qty', 'seal_stock_account_lines.closing_customs_status',
            'seal_stock_account_lines.duty_at_risk', 'seal_stock_account_lines.tax_at_risk',
          ])
          .where('seal_stock_account_lines.tenant_id', '=', request.user.tenant_id)
          .where('seal_stock_account_lines.period_id', '=', request.params.id)
          .execute()
      );
      return {
        ...mapPeriod(period),
        lines: lines.map(l => ({
          id: l.id, lotId: l.lot_id, lotDescription: l.lot_description ?? undefined,
          openingQty: Number(l.opening_qty), receivedQty: Number(l.received_qty), releasedQty: Number(l.released_qty),
          adjustedQty: Number(l.adjusted_qty), closingQty: Number(l.closing_qty), closingCustomsStatus: l.closing_customs_status,
          dutyAtRisk: Number(l.duty_at_risk), taxAtRisk: Number(l.tax_at_risk),
        })),
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/stock-account/periods', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.compartmentId || !b.periodStart || !b.periodEnd) {
        return reply.status(400).send({ error: 'compartmentId, periodStart and periodEnd are required' });
      }
      const period = await withTenant(request.user.tenant_id, trx =>
        SealStockAccountService.generatePeriod(trx, request.user.tenant_id, request.user.sub, {
          compartmentId: b.compartmentId, periodStart: b.periodStart, periodEnd: b.periodEnd,
        })
      );
      return mapPeriod(period);
    } catch (err: any) {
      if (err instanceof StockAccountPeriodExists) return reply.status(409).send({ error: err.message });
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/stock-account/periods/:id/submit', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.submissionReference) return reply.status(400).send({ error: 'submissionReference is required' });
      const period = await withTenant(request.user.tenant_id, trx =>
        SealStockAccountService.submit(trx, request.params.id, b.submissionReference)
      );
      return mapPeriod(period);
    } catch (err: any) {
      return reply.status(422).send({ error: err.message });
    }
  });
}
