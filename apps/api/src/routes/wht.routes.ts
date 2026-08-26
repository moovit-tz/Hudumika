import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { GLService } from '../services/gl.service.js';
import { renderWhtCertificatePdf } from '../services/wht-certificate-pdf.service.js';

const rateSchema = z.object({
  jurisdiction: z.string().length(2).default('TZ'),
  category: z.string().max(40),
  payee_type: z.enum(['RESIDENT', 'NON_RESIDENT']).default('RESIDENT'),
  rate_pct: z.number().min(0).max(100),
  trigger: z.enum(['PAYMENT', 'ACCRUAL']).default('PAYMENT'),
  effective_from: z.string(),
  effective_to: z.string().optional(),
});

// FINANCE-tier only — rates, certificates and remittances are tax-authority-
// facing, a narrower set than the broader role list that may merely record a
// bill payment (bills.routes.ts's own POST /:id/payment also allows MANAGER
// and SALES).
const FINANCE_TIER = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'] as const;

/**
 * Withholding tax (M1 of the corporate-tax build-out): tenant-owned rate
 * table (seeded from wht_rate_reference, editable), the certificate a
 * tenant hands its supplier, and batching accumulated deductions into a
 * real remittance to TRA. Deduction itself happens in bills.routes.ts's
 * POST /:id/payment — this file is rate configuration + the two documents
 * (certificate, remittance) built on top of what that route already wrote
 * to wht_deductions.
 */
export async function whtRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  // ── Reference rates (global, read-only) ─────────────────────────────────

  fastify.get('/rate-reference', async (request) => {
    const { jurisdiction } = request.query as { jurisdiction?: string };
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('wht_rate_reference').selectAll();
      if (jurisdiction) q = q.where('jurisdiction', '=', jurisdiction.toUpperCase());
      return q.orderBy('category', 'asc').orderBy('payee_type', 'asc').execute();
    });
  });

  // ── Tenant's own rates ───────────────────────────────────────────────────

  fastify.get('/rates', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('wht_rates').selectAll().where('tenant_id', '=', user.tenant_id)
        .orderBy('category', 'asc').orderBy('effective_from', 'desc').execute()
    );
  });

  fastify.post('/rates', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const body = rateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      try {
        const row = await trx.insertInto('wht_rates').values({
          tenant_id: user.tenant_id,
          jurisdiction: body.jurisdiction.toUpperCase(),
          category: body.category,
          payee_type: body.payee_type,
          rate_pct: String(body.rate_pct),
          trigger: body.trigger,
          effective_from: body.effective_from,
          effective_to: body.effective_to || null,
        }).returningAll().executeTakeFirstOrThrow();
        return reply.status(201).send(row);
      } catch (e: any) {
        if (e?.code === '23505') return reply.status(409).send({ error: 'A rate for this category, payee type and effective date already exists.' });
        throw e;
      }
    });
  });

  fastify.patch('/rates/:id', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = rateSchema.partial().parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('wht_rates').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Rate not found' });
      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.category !== undefined) updates.category = body.category;
      if (body.payee_type !== undefined) updates.payee_type = body.payee_type;
      if (body.rate_pct !== undefined) updates.rate_pct = String(body.rate_pct);
      if (body.trigger !== undefined) updates.trigger = body.trigger;
      if (body.effective_from !== undefined) updates.effective_from = body.effective_from;
      if (body.effective_to !== undefined) updates.effective_to = body.effective_to || null;
      return trx.updateTable('wht_rates').set(updates).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/rates/:id', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('wht_rates').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Rate not found' });
      try {
        await trx.deleteFrom('wht_rates').where('id', '=', id).execute();
        return { success: true };
      } catch (e: any) {
        if (e?.code === '23503') return reply.status(409).send({ error: 'This rate is already used on one or more bill lines and cannot be deleted — set an effective_to date instead.' });
        throw e;
      }
    });
  });

  // ── Deductions & certificates ────────────────────────────────────────────

  fastify.get('/deductions', async (request) => {
    const user = request.user;
    const { remitted } = request.query as { remitted?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('wht_deductions')
        .innerJoin('supplier_bills', 'supplier_bills.id', 'wht_deductions.bill_id')
        .leftJoin('suppliers', 'suppliers.id', 'wht_deductions.supplier_id')
        .where('wht_deductions.tenant_id', '=', user.tenant_id)
        .select([
          'wht_deductions.id', 'wht_deductions.bill_id', 'wht_deductions.bill_payment_id',
          'wht_deductions.gross_amount', 'wht_deductions.wht_amount', 'wht_deductions.certificate_number',
          'wht_deductions.certificate_issued_at', 'wht_deductions.remittance_id', 'wht_deductions.created_at',
          'supplier_bills.bill_number', 'supplier_bills.currency',
          'suppliers.name as supplier_name_resolved', 'supplier_bills.supplier_name as supplier_name_freetext',
        ]);
      if (remitted === 'false') q = q.where('wht_deductions.remittance_id', 'is', null);
      if (remitted === 'true') q = q.where('wht_deductions.remittance_id', 'is not', null);
      const rows = await q.orderBy('wht_deductions.created_at', 'desc').execute();
      return rows.map(r => ({ ...r, supplier_name: r.supplier_name_resolved || r.supplier_name_freetext || 'Supplier' }));
    });
  });

  // POST /v1/wht/deductions/:id/certificate — issue (idempotent: re-issuing
  // just returns the same already-assigned number, matching
  // issueCertificateOfOrigin's own re-issue tolerance).
  fastify.post('/deductions/:id/certificate', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const deduction = await trx.selectFrom('wht_deductions').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!deduction) return reply.status(404).send({ error: 'Deduction not found' });
      if (deduction.certificate_number) return deduction;

      const certificateNumber = `WHT-TZ-${new Date().getFullYear()}-${deduction.id.slice(0, 8).toUpperCase()}`;
      return trx.updateTable('wht_deductions')
        .set({ certificate_number: certificateNumber, certificate_issued_at: new Date() })
        .where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.get('/deductions/:id/certificate/pdf', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    try {
      const pdf = await renderWhtCertificatePdf(user.tenant_id, id);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="wht-certificate-${id}.pdf"`);
      return reply.send(pdf);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // ── Remittances ───────────────────────────────────────────────────────────

  fastify.get('/remittances', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('wht_remittances').selectAll().where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc').execute()
    );
  });

  // POST /v1/wht/remittances — batches every not-yet-remitted deduction whose
  // underlying payment falls inside [period_start, period_end] into one
  // PENDING remittance. Deductions are tagged immediately so the same
  // deduction can't land in two open batches at once; the GL only posts once
  // the batch is actually paid (below).
  fastify.post('/remittances', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { period_start, period_end } = z.object({
      period_start: z.string(), period_end: z.string(),
    }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const eligible = await trx.selectFrom('wht_deductions')
        .innerJoin('bill_payments', 'bill_payments.id', 'wht_deductions.bill_payment_id')
        .where('wht_deductions.tenant_id', '=', user.tenant_id)
        .where('wht_deductions.remittance_id', 'is', null)
        .where(sql<boolean>`COALESCE(bill_payments.payment_date, bill_payments.created_at::date) BETWEEN ${period_start} AND ${period_end}`)
        .select(['wht_deductions.id', 'wht_deductions.wht_amount'])
        .execute();
      if (eligible.length === 0) return reply.status(400).send({ error: 'No unremitted withholding tax deductions fall inside that period.' });

      const totalAmount = eligible.reduce((s, d) => s + Number(d.wht_amount), 0);
      const remittance = await trx.insertInto('wht_remittances').values({
        tenant_id: user.tenant_id, jurisdiction: 'TZ', period_start, period_end,
        total_amount: String(totalAmount), status: 'PENDING', created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();

      await trx.updateTable('wht_deductions').set({ remittance_id: remittance.id })
        .where('id', 'in', eligible.map(d => d.id)).execute();

      return reply.status(201).send({ ...remittance, deduction_count: eligible.length });
    });
  });

  // POST /v1/wht/remittances/:id/pay — the actual transfer to TRA: debit
  // 2300 (clearing the liability), credit cash.
  fastify.post('/remittances/:id/pay', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { paid_at, reference, account_code } = z.object({
      paid_at: z.string().optional(), reference: z.string().max(200).optional(), account_code: z.string().max(20).optional(),
    }).parse(request.body ?? {});
    return withTenant(user.tenant_id, async (trx) => {
      const remittance = await trx.selectFrom('wht_remittances').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!remittance) return reply.status(404).send({ error: 'Remittance not found' });
      if (remittance.status === 'PAID') return reply.status(409).send({ error: 'This remittance has already been paid.' });

      const total = Number(remittance.total_amount);
      const journalEntryId = await GLService.post(user.tenant_id, {
        entryDate: paid_at ? new Date(paid_at).toISOString() : new Date().toISOString(),
        description: `Withholding tax remittance: ${dateRangeLabel(remittance.period_start, remittance.period_end)}`,
        reference: reference || `WHT-REMIT-${remittance.id.slice(0, 8).toUpperCase()}`,
        sourceModule: 'MANUAL',
        sourceId: remittance.id,
        createdBy: user.sub,
        lines: [
          { accountCode: '2300', debit: total, credit: 0, description: 'Withholding tax remitted' },
          { accountCode: account_code || '1010', debit: 0, credit: total, description: 'Cash paid to TRA' },
        ],
      });

      return trx.updateTable('wht_remittances').set({
        status: 'PAID', paid_at: paid_at ? new Date(paid_at) : new Date(),
        reference: reference || null, journal_entry_id: journalEntryId,
      }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    });
  });
}

function dateRangeLabel(from: unknown, to: unknown): string {
  return `${String(from).slice(0, 10)} to ${String(to).slice(0, 10)}`;
}
