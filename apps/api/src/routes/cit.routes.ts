import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { GLService } from '../services/gl.service.js';
import { computeAndSaveDraftCitReturn, accrueCitReturn } from '../services/cit.service.js';
import { renderCitReturnPdf } from '../services/cit-return-pdf.service.js';

const FINANCE_TIER = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'] as const;

const rateSchema = z.object({
  jurisdiction: z.string().length(2).default('TZ'),
  category: z.string().max(40),
  rate_pct: z.number().min(0).max(100),
  effective_from: z.string(),
  effective_to: z.string().optional(),
});

/**
 * Corporate income tax (M2 of the corporate-tax build-out): rate
 * configuration, book-to-tax adjustments, the computed return (a real
 * accounting-profit-to-taxable-income bridge via cit.service.ts, stored
 * once computed rather than recomputed on every read), its GL accrual, and
 * quarterly provisional-payment tracking.
 */
export async function citRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  // ── Reference & tenant rates ─────────────────────────────────────────────

  fastify.get('/rate-reference', async (request) => {
    const { jurisdiction } = request.query as { jurisdiction?: string };
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('cit_rate_reference').selectAll();
      if (jurisdiction) q = q.where('jurisdiction', '=', jurisdiction.toUpperCase());
      return q.orderBy('category', 'asc').execute();
    });
  });

  fastify.get('/rates', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('cit_rates').selectAll().where('tenant_id', '=', user.tenant_id)
        .orderBy('effective_from', 'desc').execute()
    );
  });

  fastify.post('/rates', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const body = rateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      try {
        const row = await trx.insertInto('cit_rates').values({
          tenant_id: user.tenant_id, jurisdiction: body.jurisdiction.toUpperCase(), category: body.category,
          rate_pct: String(body.rate_pct), effective_from: body.effective_from, effective_to: body.effective_to || null,
        }).returningAll().executeTakeFirstOrThrow();
        return reply.status(201).send(row);
      } catch (e: any) {
        if (e?.code === '23505') return reply.status(409).send({ error: 'A rate for this category and effective date already exists.' });
        throw e;
      }
    });
  });

  fastify.patch('/rates/:id', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = rateSchema.partial().parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('cit_rates').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Rate not found' });
      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.category !== undefined) updates.category = body.category;
      if (body.rate_pct !== undefined) updates.rate_pct = String(body.rate_pct);
      if (body.effective_from !== undefined) updates.effective_from = body.effective_from;
      if (body.effective_to !== undefined) updates.effective_to = body.effective_to || null;
      return trx.updateTable('cit_rates').set(updates).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/rates/:id', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('cit_rates').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Rate not found' });
      await trx.deleteFrom('cit_rates').where('id', '=', id).execute();
      return { success: true };
    });
  });

  // ── Book-to-tax adjustments ──────────────────────────────────────────────

  fastify.get('/adjustments', async (request) => {
    const user = request.user;
    const { period_start, period_end } = request.query as { period_start?: string; period_end?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('cit_adjustments').selectAll().where('tenant_id', '=', user.tenant_id);
      if (period_start) q = q.where('period_start', '=', period_start);
      if (period_end) q = q.where('period_end', '=', period_end);
      return q.orderBy('created_at', 'desc').execute();
    });
  });

  fastify.post('/adjustments', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const body = z.object({
      period_start: z.string(), period_end: z.string(),
      category: z.enum(['DISALLOWED_EXPENSE', 'FINE_PENALTY', 'EXEMPT_INCOME', 'OTHER']),
      description: z.string().max(2000), amount: z.number(),
    }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existingReturn = await trx.selectFrom('cit_returns').select('status')
        .where('tenant_id', '=', user.tenant_id).where('period_start', '=', body.period_start).where('period_end', '=', body.period_end).executeTakeFirst();
      if (existingReturn?.status === 'ACCRUED') return reply.status(409).send({ error: 'This period has already been accrued and is locked.' });
      const row = await trx.insertInto('cit_adjustments').values({
        tenant_id: user.tenant_id, period_start: body.period_start, period_end: body.period_end,
        category: body.category, description: body.description, amount: String(body.amount), created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  fastify.delete('/adjustments/:id', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('cit_adjustments').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Adjustment not found' });
      const existingReturn = await trx.selectFrom('cit_returns').select('status')
        .where('tenant_id', '=', user.tenant_id).where('period_start', '=', existing.period_start).where('period_end', '=', existing.period_end).executeTakeFirst();
      if (existingReturn?.status === 'ACCRUED') return reply.status(409).send({ error: 'This period has already been accrued and is locked.' });
      await trx.deleteFrom('cit_adjustments').where('id', '=', id).execute();
      return { success: true };
    });
  });

  // ── Returns ───────────────────────────────────────────────────────────────

  fastify.get('/returns', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('cit_returns').selectAll().where('tenant_id', '=', user.tenant_id)
        .orderBy('period_start', 'desc').execute()
    );
  });

  fastify.get('/returns/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('cit_returns').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Return not found' });
      return row;
    });
  });

  // POST /v1/cit/returns/compute — runs the computation and stores it as
  // DRAFT (recomputable — a second call for the same period overwrites the
  // DRAFT with fresh figures). Rejects once the period is ACCRUED, since an
  // accrual has already posted to the GL off these numbers.
  fastify.post('/returns/compute', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { period_start, period_end } = z.object({ period_start: z.string(), period_end: z.string() }).parse(request.body);

    const existing = await withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('cit_returns').select('status')
        .where('tenant_id', '=', user.tenant_id).where('period_start', '=', period_start).where('period_end', '=', period_end)
        .executeTakeFirst()
    );
    if (existing?.status === 'ACCRUED') {
      return reply.status(409).send({ error: 'This period has already been accrued and is locked — its figures cannot be recomputed.' });
    }

    return computeAndSaveDraftCitReturn(user.tenant_id, period_start, period_end, user.sub);
  });

  // POST /v1/cit/returns/:id/accrue — posts Dr 5950 / Cr 2400 for the
  // return's tax_liability and locks it. A nil/zero liability (a loss
  // period) still locks the return but posts no GL entry — there is
  // nothing to accrue.
  fastify.post('/returns/:id/accrue', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const ret = await withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('cit_returns').select('status').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst()
    );
    if (!ret) return reply.status(404).send({ error: 'Return not found' });
    if (ret.status === 'ACCRUED') return reply.status(409).send({ error: 'This return has already been accrued.' });

    await accrueCitReturn(user.tenant_id, id, user.sub);
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('cit_returns').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    );
  });

  // GET /v1/cit/returns/:id/pdf (M4) — filing-support export.
  fastify.get('/returns/:id/pdf', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    try {
      const pdf = await renderCitReturnPdf(user.tenant_id, id);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="cit-return-${id}.pdf"`);
      return reply.send(pdf);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // ── Quarterly provisional instalments ────────────────────────────────────

  fastify.get('/installments', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('cit_installments').selectAll().where('tenant_id', '=', user.tenant_id)
        .orderBy('period_start', 'desc').execute()
    );
  });

  fastify.post('/installments', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const body = z.object({
      cit_return_id: z.string().uuid().optional(),
      period_start: z.string(), period_end: z.string(), due_date: z.string().optional(),
      amount: z.number().positive(),
    }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.insertInto('cit_installments').values({
        tenant_id: user.tenant_id, cit_return_id: body.cit_return_id || null,
        period_start: body.period_start, period_end: body.period_end, due_date: body.due_date || null,
        amount: String(body.amount), status: 'PENDING', created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  fastify.post('/installments/:id/pay', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { paid_at, reference, account_code } = z.object({
      paid_at: z.string().optional(), reference: z.string().max(200).optional(), account_code: z.string().max(20).optional(),
    }).parse(request.body ?? {});
    return withTenant(user.tenant_id, async (trx) => {
      const inst = await trx.selectFrom('cit_installments').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!inst) return reply.status(404).send({ error: 'Instalment not found' });
      if (inst.status === 'PAID') return reply.status(409).send({ error: 'This instalment has already been paid.' });

      const amount = Number(inst.amount);
      const journalEntryId = await GLService.post(user.tenant_id, {
        entryDate: paid_at ? new Date(paid_at).toISOString() : new Date().toISOString(),
        description: `Provisional income tax instalment: ${inst.period_start} to ${inst.period_end}`,
        reference: reference || `CIT-INST-${inst.id.slice(0, 8).toUpperCase()}`,
        sourceModule: 'MANUAL', sourceId: inst.id, createdBy: user.sub,
        lines: [
          { accountCode: '2400', debit: amount, credit: 0, description: 'Income tax paid (provisional)' },
          { accountCode: account_code || '1010', debit: 0, credit: amount, description: 'Cash paid' },
        ],
      });

      return trx.updateTable('cit_installments').set({
        status: 'PAID', paid_at: paid_at ? new Date(paid_at) : new Date(), reference: reference || null, journal_entry_id: journalEntryId,
      }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    });
  });
}
