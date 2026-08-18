import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { closeVatPeriod, tenantJurisdiction } from '../services/vat-period.service.js';
import { computeVatReturn } from '../services/vat-return.service.js';
import { reportingCurrency } from '../services/tax-registration.service.js';

const FIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'] as const;
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Shape-guard only — isDate() below does the real YYYY-MM-DD format check
// with a purpose-built error message, and the jurisdiction regex check
// further down does the same for that field.
const periodCreateSchema = z.object({
  period_start: z.string(),
  period_end: z.string(),
  jurisdiction: z.string().optional(),
});
const closeSchema = z.object({ acknowledge_unclassified: z.boolean().optional() });
const reopenSchema = z.object({ reason: z.string().optional() });

/**
 * Filing periods.
 *
 * Closing one is what turns the return from a live query into a filed figure:
 * the computed return is stored verbatim, the partial-exemption restriction is
 * posted as a real journal, and every document dated inside the period stops
 * being editable.
 */
export async function vatPeriodRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  // GET /v1/vat-periods
  fastify.get('/', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('vat_periods')
        .select(['id', 'jurisdiction', 'period_start', 'period_end', 'status',
                 'adjustment_amount', 'adjustment_entry_id', 'closed_at', 'closed_by',
                 'reopened_at', 'reopen_reason', 'created_at'])
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('period_start', 'desc')
        .execute());
  });

  // GET /v1/vat-periods/:id — the return exactly as filed, not recomputed.
  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('vat_periods').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Period not found' });

      // An open period has no snapshot yet, so it is computed live and flagged
      // provisional. A closed one returns what was stored — recomputing a filed
      // figure is exactly what must not be able to give a different answer.
      if (row.status === 'open') {
        const cur = await reportingCurrency(trx, user.tenant_id);
        const live = await computeVatReturn(
          trx, user.tenant_id,
          String(row.period_start).slice(0, 10), String(row.period_end).slice(0, 10),
          cur, row.jurisdiction);
        return { ...row, return_snapshot: live, provisional: true };
      }
      return { ...row, provisional: false };
    });
  });

  // POST /v1/vat-periods
  fastify.post('/', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const body = periodCreateSchema.parse(request.body);
    if (!isDate(body?.period_start) || !isDate(body?.period_end)) {
      return reply.status(400).send({ error: 'period_start and period_end are required, as YYYY-MM-DD' });
    }
    if (body.period_start > body.period_end) {
      return reply.status(400).send({ error: 'period_start must not be after period_end' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      const juris = String(body.jurisdiction || await tenantJurisdiction(trx, user.tenant_id)).toUpperCase();
      if (!/^[A-Z]{2}$/.test(juris)) {
        return reply.status(400).send({ error: 'jurisdiction must be an ISO 3166-1 alpha-2 country code' });
      }

      // Periods must not overlap within a jurisdiction, or a document would sit
      // in two returns at once and there would be no answer to which one froze it.
      const clash = await trx.selectFrom('vat_periods').select(['period_start', 'period_end'])
        .where('tenant_id', '=', user.tenant_id)
        .where('jurisdiction', '=', juris)
        .where('period_start', '<=', body.period_end)
        .where('period_end', '>=', body.period_start)
        .executeTakeFirst();
      if (clash) {
        return reply.status(409).send({
          error: `That range overlaps the existing ${juris} period ` +
                 `${String(clash.period_start).slice(0, 10)} to ${String(clash.period_end).slice(0, 10)}.`,
        });
      }

      const row = await trx.insertInto('vat_periods').values({
        tenant_id: user.tenant_id,
        jurisdiction: juris,
        period_start: body.period_start,
        period_end: body.period_end,
        status: 'open',
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  // POST /v1/vat-periods/:id/close
  fastify.post('/:id/close', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = closeSchema.parse(request.body ?? {});
    return withTenant(user.tenant_id, async (trx) => {
      const period = await trx.selectFrom('vat_periods').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!period) return reply.status(404).send({ error: 'Period not found' });
      if (period.status === 'closed') return reply.status(409).send({ error: 'That period is already closed' });

      const cur = await reportingCurrency(trx, user.tenant_id);

      // Closing on unclassified data files a return with holes in it and then
      // freezes them. That takes an explicit acknowledgement rather than a
      // silent pass — it is the difference between a gap someone accepted and a
      // gap nobody saw.
      const preview = await computeVatReturn(
        trx, user.tenant_id,
        String(period.period_start).slice(0, 10), String(period.period_end).slice(0, 10),
        cur, period.jurisdiction);
      const gaps = preview.unclassified.salesLines + preview.unclassified.purchaseLines
        + preview.fxSkipped.invoices + preview.fxSkipped.bills;
      if (gaps > 0 && !body.acknowledge_unclassified) {
        return reply.status(409).send({
          error: `${gaps} line(s) in this period have no tax treatment recorded, or a currency ` +
                 `that cannot be converted. Closing freezes them as they are. Classify them ` +
                 `first, or re-send with acknowledge_unclassified: true.`,
          unclassified: preview.unclassified,
          fx_skipped: preview.fxSkipped,
        });
      }

      const result = await closeVatPeriod(trx, user.tenant_id, id, user.sub, cur);
      if ('error' in result && result.error) return reply.status(409).send({ error: result.error });
      return result;
    });
  });

  // POST /v1/vat-periods/:id/reopen
  // Deliberately noisy: reopening unfreezes documents a return was filed on, so
  // it demands a reason and keeps the original snapshot rather than discarding it.
  fastify.post('/:id/reopen', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { reason } = reopenSchema.parse(request.body ?? {});
    if (!String(reason ?? '').trim()) {
      return reply.status(400).send({ error: 'A reason is required to reopen a filed period.' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      const period = await trx.selectFrom('vat_periods').select(['id', 'status'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!period) return reply.status(404).send({ error: 'Period not found' });
      if (period.status !== 'closed') return reply.status(409).send({ error: 'That period is not closed.' });

      // The snapshot and the adjustment stay. What was filed was filed; a
      // reopen is a new fact about the period, not an erasure of the old one.
      return trx.updateTable('vat_periods').set({
        status: 'open',
        reopened_at: new Date(),
        reopened_by: user.sub,
        reopen_reason: String(reason).trim(),
        updated_at: new Date(),
      }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirstOrThrow();
    });
  });
}
