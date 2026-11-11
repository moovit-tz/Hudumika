import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { sql } from 'kysely';
import { requireEntitlement } from '../middleware/entitlement.js';
import { InventoryService } from '../services/inventory.service.js';
import { prepareIndustryBilling, attachIndustryInvoice } from '../services/finance-industry-work.service.js';
import { getNextDocNumber, getNextCustomerDocNumber } from '../lib/doc-numbering.js';
import { GLService } from '../services/gl.service.js';

const ESTIMATE_STATUSES = ['draft', 'sent', 'approved', 'rejected', 'expired', 'converted'] as const;
const WARRANTY_STATUSES = ['submitted', 'under_review', 'approved', 'partially_approved', 'rejected', 'settled'] as const;
const JOB_CARD_STATUSES = ['received', 'diagnosing', 'awaiting_parts', 'in_progress', 'quality_check', 'ready', 'delivered'] as const;
const INSURANCE_CLAIM_STATUSES = ['reported', 'investigating', 'approved', 'denied', 'settled', 'closed'] as const;

const JOB_CARD_TRANSITIONS: Record<string, string[]> = {
  received:       ['diagnosing'],
  diagnosing:     ['awaiting_parts', 'in_progress'],
  awaiting_parts: ['in_progress'],
  in_progress:    ['quality_check'],
  quality_check:  ['ready', 'in_progress'],
  ready:          ['delivered'],
  delivered:      [],
};

const INSURANCE_CLAIM_TRANSITIONS: Record<string, string[]> = {
  reported:      ['investigating', 'denied'],
  investigating: ['approved', 'denied'],
  approved:      ['settled'],
  denied:        ['closed'],
  settled:       ['closed'],
  closed:        [],
};

/** Maps a Gereji estimate line onto the generic finance_industry_work_lines
 *  shape so an approved estimate's labour/parts can be billed through the
 *  same mechanism every other industry uses (prepareIndustryBilling). */
function lineKindAndUnit(lineType: string): { kind: 'time' | 'material' | 'service' | 'expense'; unit: string } {
  switch (lineType) {
    case 'labour': return { kind: 'time', unit: 'hr' };
    case 'part': return { kind: 'material', unit: 'pc' };
    case 'sublet': return { kind: 'service', unit: 'job' };
    default: return { kind: 'expense', unit: 'misc' };
  }
}

const ESTIMATE_TRANSITIONS: Record<string, string[]> = {
  draft:     ['sent'],
  sent:      ['approved', 'rejected', 'expired'],
  approved:  ['converted'],
  rejected:  ['draft'],
  expired:   ['draft'],
  converted: [],
};

const WARRANTY_TRANSITIONS: Record<string, string[]> = {
  submitted:          ['under_review'],
  under_review:       ['approved', 'partially_approved', 'rejected'],
  approved:           ['settled'],
  partially_approved: ['settled'],
  rejected:           [],
  settled:            [],
};

export async function gerejiCrudRoutes(fastify: FastifyInstance) {
  // Was missing entirely — see the matching fix/comment in gereji.routes.ts.
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('gereji'));

  // index.ts's global error handler only reads `.statusCode` off a real
  // `Error` instance, not a plain object literal — every `throw { statusCode,
  // message }` in this file (including the pre-existing estimate/warranty
  // transition guards) was silently returning HTTP 200 with an error-shaped
  // body instead of the real 404/422. Same gap already found and fixed in
  // ngao-crud.routes.ts/tuma-parcels.routes.ts/legal.routes.ts.
  fastify.setErrorHandler((error: any, _request, reply) => {
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as unknown as { issues: { path: (string | number)[]; message: string }[] };
      return reply.status(400).send({ error: 'Validation failed', details: zodError.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
    }
    const status = error && typeof error === 'object' && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply.status(status).send({ error: status < 500 ? (error.message ?? 'Request failed.') : 'Unable to process the request.' });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Estimates — Create, send, approve, convert to job card
  // ═══════════════════════════════════════════════════════════════════

  fastify.post('/estimates', async (request, reply) => {
    const lineSchema = z.object({
      line_type: z.enum(['labour', 'part', 'sublet', 'misc']),
      description: z.string().trim().min(1),
      quantity: z.number().positive().default(1),
      unit_price: z.number().nonnegative().default(0),
      part_number: z.string().optional(),
      sort_order: z.number().int().optional(),
    });
    const schema = z.object({
      vehicle_id: z.string().uuid(),
      customer_id: z.string().uuid().optional(),
      notes: z.string().optional(),
      valid_until: z.string().optional(),
      lines: z.array(lineSchema).min(1),
    });
    const body = schema.parse(request.body);

    return withTenant(request.user.tenant_id, async (trx) => {
      const [{ count }] = await trx.selectFrom('gereji_estimates')
        .where('tenant_id', '=', request.user.tenant_id)
        .select(sql<number>`count(*)::int`.as('count'))
        .execute();
      const estimateNumber = `EST-${String(count + 1).padStart(5, '0')}`;

      let labourTotal = 0;
      let partsTotal = 0;
      for (const line of body.lines) {
        const lineTotal = line.quantity * line.unit_price;
        if (line.line_type === 'labour') labourTotal += lineTotal;
        else partsTotal += lineTotal;
      }
      const taxTotal = (labourTotal + partsTotal) * 0.18;
      const grandTotal = labourTotal + partsTotal + taxTotal;

      const [estimate] = await trx.insertInto('gereji_estimates')
        .values({
          tenant_id: request.user.tenant_id,
          estimate_number: estimateNumber,
          vehicle_id: body.vehicle_id,
          customer_id: body.customer_id ?? null,
          status: 'draft' as any,
          labour_total: labourTotal,
          parts_total: partsTotal,
          tax_total: taxTotal,
          grand_total: grandTotal,
          valid_until: body.valid_until ?? null,
          notes: body.notes ?? null,
          created_by: request.user.sub,
        })
        .returningAll()
        .execute();

      if (body.lines.length > 0) {
        await trx.insertInto('gereji_estimate_lines')
          .values(
            body.lines.map((line, idx) => ({
              tenant_id: request.user.tenant_id,
              estimate_id: estimate.id,
              line_type: line.line_type as any,
              description: line.description,
              quantity: line.quantity,
              unit_price: line.unit_price,
              total: line.quantity * line.unit_price,
              part_number: line.part_number ?? null,
              sort_order: line.sort_order ?? idx,
            }))
          )
          .execute();
      }

      reply.status(201);
      return estimate;
    });
  });

  fastify.get('/estimates/:id', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async (trx) => {
      const estimate = await trx.selectFrom('gereji_estimates')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .selectAll()
        .executeTakeFirst();
      if (!estimate) throw { statusCode: 404, message: 'Estimate not found' };

      const lines = await trx.selectFrom('gereji_estimate_lines')
        .where('estimate_id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('sort_order', 'asc')
        .selectAll()
        .execute();

      return { ...estimate, lines };
    });
  });

  fastify.patch('/estimates/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      status: z.enum(ESTIMATE_STATUSES),
    });
    const body = schema.parse(request.body);

    return withTenant(request.user.tenant_id, async (trx) => {
      const current = await trx.selectFrom('gereji_estimates')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .select(['status'])
        .executeTakeFirst();
      if (!current) throw { statusCode: 404, message: 'Estimate not found' };
      if (!ESTIMATE_TRANSITIONS[current.status]?.includes(body.status)) {
        throw { statusCode: 422, message: `Cannot transition from ${current.status} to ${body.status}` };
      }

      const updates: Record<string, unknown> = {
        status: body.status,
        updated_at: new Date(),
      };
      if (body.status === 'approved') {
        updates.approved_by = request.user.sub;
        updates.approved_at = new Date();
      }

      const [updated] = await trx.updateTable('gereji_estimates')
        .set(updates as any)
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .execute();
      return updated;
    });
  });

  fastify.post('/estimates/:id/convert', async (request, reply) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async (trx) => {
      const estimate = await trx.selectFrom('gereji_estimates')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .selectAll()
        .executeTakeFirst();
      if (!estimate) throw { statusCode: 404, message: 'Estimate not found' };
      if (estimate.status !== 'approved') {
        throw { statusCode: 422, message: 'Only approved estimates can be converted to job cards' };
      }
      if (estimate.job_card_id) {
        throw { statusCode: 422, message: 'Estimate already converted' };
      }

      const [{ count }] = await trx.selectFrom('finance_industry_work')
        .where('tenant_id', '=', request.user.tenant_id)
        .where('industry', '=', 'automotive' as any)
        .select(sql<number>`count(*)::int`.as('count'))
        .execute();
      const ref = `WO-${String(count + 1).padStart(5, '0')}`;

      if (!estimate.customer_id) throw { statusCode: 422, message: 'Link the estimate to a customer before converting it to a job card.' };

      const [work] = await trx.insertInto('finance_industry_work')
        .values({
          tenant_id: request.user.tenant_id,
          industry: 'automotive' as any,
          reference: ref,
          name: `Job from estimate ${estimate.estimate_number}`,
          customer_id: estimate.customer_id,
          currency: estimate.currency,
          budget: estimate.grand_total,
          due_date: null,
          specifications: JSON.stringify({ source_estimate: estimate.estimate_number }) as any,
          // Starts active, not the generic draft default — an approved
          // estimate is already a real job; billing (prepareIndustryBilling)
          // only ever considers active/completed work.
          status: 'active' as any,
          created_by: request.user.sub,
        })
        .returningAll()
        .execute();

      const [jobCard] = await trx.insertInto('finance_job_cards')
        .values({
          tenant_id: request.user.tenant_id,
          work_id: work.id,
          vehicle_id: estimate.vehicle_id,
          reported_fault: `Converted from estimate ${estimate.estimate_number}`,
          estimated_hours: null,
        })
        .returningAll()
        .execute();

      const estimateLines = await trx.selectFrom('gereji_estimate_lines')
        .where('estimate_id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('sort_order', 'asc')
        .selectAll()
        .execute();

      // Carries the estimate's approved line items onto the generic
      // work-billing ledger (already approved and billable — the customer
      // already agreed to this estimate) so POST /job-cards/:id/bill can
      // invoice them the same way every other industry bills its work.
      if (estimateLines.length > 0) {
        await trx.insertInto('finance_industry_work_lines').values(
          estimateLines.map(line => {
            const { kind, unit } = lineKindAndUnit(line.line_type);
            return {
              tenant_id: request.user.tenant_id, work_id: work.id, kind, unit,
              description: line.description, quantity: line.quantity, rate: line.unit_price,
              cost_rate: 0, billable: true, approved: true,
              work_date: new Date().toISOString().slice(0, 10),
              created_by: request.user.sub, approved_by: request.user.sub, approved_at: new Date(),
            };
          }),
        ).execute();
      }

      await trx.updateTable('gereji_estimates')
        .set({
          status: 'converted' as any,
          job_card_id: jobCard.id,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .execute();

      reply.status(201);
      return { estimate_id: id, job_card: jobCard };
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Vehicles
  // ═══════════════════════════════════════════════════════════════════

  fastify.post('/vehicles', async (request, reply) => {
    const schema = z.object({
      registration: z.string().trim().min(1),
      customer_id: z.string().uuid().optional(),
      make: z.string().optional(),
      model: z.string().optional(),
      year: z.number().int().optional(),
      vin: z.string().optional(),
      mileage: z.number().int().nonnegative().optional(),
      color: z.string().optional(),
      notes: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const [vehicle] = await trx.insertInto('finance_vehicle_records')
        .values({
          tenant_id: request.user.tenant_id,
          customer_id: body.customer_id ?? null,
          registration: body.registration,
          make: body.make ?? null, model: body.model ?? null, year: body.year ?? null,
          vin: body.vin ?? null, mileage: body.mileage ?? null, color: body.color ?? null, notes: body.notes ?? null,
        })
        .returningAll()
        .execute();
      reply.status(201);
      return vehicle;
    });
  });

  fastify.patch('/vehicles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      registration: z.string().trim().min(1).optional(),
      customer_id: z.string().uuid().nullable().optional(),
      make: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      year: z.number().int().nullable().optional(),
      vin: z.string().nullable().optional(),
      mileage: z.number().int().nonnegative().nullable().optional(),
      color: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const [updated] = await trx.updateTable('finance_vehicle_records')
        .set({ ...body, updated_at: new Date() } as any)
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id)
        .returningAll().execute();
      if (!updated) throw { statusCode: 404, message: 'Vehicle not found' };
      return updated;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Job Cards — direct creation and lifecycle, independent of estimates
  // ═══════════════════════════════════════════════════════════════════

  fastify.post('/job-cards', async (request, reply) => {
    const schema = z.object({
      vehicle_id: z.string().uuid(),
      customer_id: z.string().uuid(),
      reported_fault: z.string().trim().min(1),
      mileage_in: z.number().int().nonnegative().optional(),
      bay_number: z.string().optional(),
      technician_id: z.string().uuid().optional(),
      estimated_hours: z.number().nonnegative().optional(),
      currency: z.string().length(3).default('TZS'),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const vehicle = await trx.selectFrom('finance_vehicle_records').select('id')
        .where('id', '=', body.vehicle_id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!vehicle) throw { statusCode: 404, message: 'Vehicle not found' };

      const [{ count }] = await trx.selectFrom('finance_industry_work')
        .where('tenant_id', '=', request.user.tenant_id).where('industry', '=', 'automotive' as any)
        .select(sql<number>`count(*)::int`.as('count')).execute();
      const ref = `WO-${String(count + 1).padStart(5, '0')}`;

      const [work] = await trx.insertInto('finance_industry_work')
        .values({
          tenant_id: request.user.tenant_id, industry: 'automotive' as any, reference: ref,
          name: `Job card for ${body.vehicle_id}`, customer_id: body.customer_id, currency: body.currency,
          budget: 0, due_date: null, specifications: JSON.stringify({}) as any,
          status: 'active' as any, created_by: request.user.sub,
        })
        .returningAll().execute();

      const [jobCard] = await trx.insertInto('finance_job_cards')
        .values({
          tenant_id: request.user.tenant_id, work_id: work.id, vehicle_id: body.vehicle_id,
          mileage_in: body.mileage_in ?? null, reported_fault: body.reported_fault,
          bay_number: body.bay_number ?? null, technician_id: body.technician_id ?? null,
          estimated_hours: body.estimated_hours ?? null,
        })
        .returningAll().execute();

      reply.status(201);
      return jobCard;
    });
  });

  fastify.patch('/job-cards/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({ status: z.enum(JOB_CARD_STATUSES) });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const current = await trx.selectFrom('finance_job_cards').select('status')
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!current) throw { statusCode: 404, message: 'Job card not found' };
      if (!JOB_CARD_TRANSITIONS[current.status]?.includes(body.status)) {
        throw { statusCode: 422, message: `Cannot transition from ${current.status} to ${body.status}` };
      }
      const updates: Record<string, unknown> = { status: body.status, updated_at: new Date() };
      if (body.status === 'ready') updates.completed_at = new Date();
      if (body.status === 'delivered') updates.delivered_at = new Date();

      const [updated] = await trx.updateTable('finance_job_cards')
        .set(updates as any)
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id)
        .returningAll().execute();
      return updated;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Billing — invoice a job card's approved work lines (labour + parts)
  // ═══════════════════════════════════════════════════════════════════

  fastify.post('/job-cards/:id/bill', async (request, reply) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async trx => {
      const jobCard = await trx.selectFrom('finance_job_cards')
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id)
        .select(['id', 'work_id']).executeTakeFirst();
      if (!jobCard) throw { statusCode: 404, message: 'Job card not found' };

      const billing = await prepareIndustryBilling(trx, request.user.tenant_id, jobCard.work_id);

      const invoiceNumber = (await getNextCustomerDocNumber(trx, request.user.tenant_id, billing.customer.id))
        || await getNextDocNumber(trx, request.user.tenant_id, 'invoice');
      const inv = await trx.insertInto('sales_invoices').values({
        tenant_id: request.user.tenant_id, invoice_number: invoiceNumber,
        customer_id: billing.customer.id, client_address: JSON.stringify([]),
        currency: billing.work.currency, exchange_rate: 1, status: 'Unpaid', received: 0, version: 1,
        notes: `Job card for ${billing.work.reference}.`, created_by: request.user.sub,
      }).returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('sales_invoice_lines').values(
        billing.items.map((item, idx) => ({
          invoice_id: inv.id, name: item.name.slice(0, 300), unit: item.unit, rate: item.rate,
          qty: item.qty, tax_pct: 0, line_group: item.line_group, currency: item.currency, sort_order: idx,
        })),
      ).execute();

      const grandTotal = billing.items.reduce((sum, item) => sum + item.qty * item.rate, 0);
      if (grandTotal > 0) {
        await GLService.post(request.user.tenant_id, {
          entryDate: new Date().toISOString(),
          description: `Job card invoice: ${billing.work.reference}`,
          reference: invoiceNumber, sourceModule: 'AR', sourceId: inv.id, createdBy: request.user.sub,
          lines: [
            { accountCode: '1100', debit: grandTotal, credit: 0, description: 'Accounts Receivable', currency: billing.work.currency, exchangeRate: 1 },
            { accountCode: '4000', debit: 0, credit: grandTotal, description: 'Workshop Revenue', currency: billing.work.currency, exchangeRate: 1 },
          ],
        }, trx);
      }

      await attachIndustryInvoice(trx, request.user.tenant_id, jobCard.work_id, billing.lines.map(line => line.id), inv.id);

      reply.status(201);
      return { invoice: inv, job_card_id: id };
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Insurance — policies and claims (reuses the generic finance_insurance_*
  //  tables with policy_type = 'motor', the same way estimates/warranty
  //  reuse finance_industry_work rather than a Gereji-only schema)
  // ═══════════════════════════════════════════════════════════════════

  fastify.post('/insurance/policies', async (request, reply) => {
    const schema = z.object({
      vehicle_id: z.string().uuid(),
      customer_id: z.string().uuid(),
      policy_number: z.string().trim().min(1),
      holder_name: z.string().trim().min(1),
      holder_contact: z.string().optional(),
      coverage_start: z.string(),
      coverage_end: z.string(),
      sum_insured: z.number().nonnegative(),
      premium_amount: z.number().nonnegative(),
      premium_frequency: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual', 'single']).default('annual'),
      currency: z.string().length(3).default('TZS'),
      deductible: z.number().nonnegative().optional(),
      underwriter_notes: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const vehicle = await trx.selectFrom('finance_vehicle_records').select('id')
        .where('id', '=', body.vehicle_id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!vehicle) throw { statusCode: 404, message: 'Vehicle not found' };

      // A policy needs a finance_industry_work parent the same way a job
      // card does; it doesn't correspond to an active repair job, so it
      // gets its own lightweight header rather than piggybacking a real job.
      const [{ count }] = await trx.selectFrom('finance_industry_work')
        .where('tenant_id', '=', request.user.tenant_id).where('industry', '=', 'automotive' as any)
        .select(sql<number>`count(*)::int`.as('count')).execute();
      const [work] = await trx.insertInto('finance_industry_work')
        .values({
          tenant_id: request.user.tenant_id, industry: 'automotive' as any,
          reference: `INS-${String(count + 1).padStart(5, '0')}`,
          name: `Insurance policy ${body.policy_number}`, customer_id: body.customer_id,
          currency: body.currency, budget: 0, due_date: null, specifications: JSON.stringify({ vehicle_id: body.vehicle_id }) as any,
          status: 'active' as any, created_by: request.user.sub,
        })
        .returningAll().execute();

      const [policy] = await trx.insertInto('finance_insurance_policies')
        .values({
          tenant_id: request.user.tenant_id, work_id: work.id,
          policy_number: body.policy_number, policy_type: 'motor',
          holder_name: body.holder_name, holder_contact: body.holder_contact ?? null,
          coverage_start: body.coverage_start, coverage_end: body.coverage_end,
          sum_insured: body.sum_insured, premium_amount: body.premium_amount,
          premium_frequency: body.premium_frequency as any, currency: body.currency,
          deductible: body.deductible ?? 0, status: 'active' as any,
          underwriter_notes: body.underwriter_notes ?? null,
        })
        .returningAll().execute();
      reply.status(201);
      return policy;
    });
  });

  fastify.post('/insurance/claims', async (request, reply) => {
    const schema = z.object({
      policy_id: z.string().uuid(),
      incident_date: z.string(),
      description: z.string().trim().min(1),
      claim_amount: z.number().positive(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const policy = await trx.selectFrom('finance_insurance_policies').select('id')
        .where('id', '=', body.policy_id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!policy) throw { statusCode: 404, message: 'Policy not found' };

      const [{ count }] = await trx.selectFrom('finance_insurance_claims')
        .where('tenant_id', '=', request.user.tenant_id)
        .select(sql<number>`count(*)::int`.as('count')).execute();
      const [claim] = await trx.insertInto('finance_insurance_claims')
        .values({
          tenant_id: request.user.tenant_id, policy_id: body.policy_id,
          claim_number: `CLM-${String(count + 1).padStart(5, '0')}`,
          incident_date: body.incident_date, description: body.description,
          claim_amount: body.claim_amount, status: 'reported' as any,
        })
        .returningAll().execute();
      reply.status(201);
      return claim;
    });
  });

  fastify.patch('/insurance/claims/:id/review', async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      status: z.enum(INSURANCE_CLAIM_STATUSES),
      approved_amount: z.number().nonnegative().optional(),
      denial_reason: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const current = await trx.selectFrom('finance_insurance_claims').select('status')
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!current) throw { statusCode: 404, message: 'Claim not found' };
      if (!INSURANCE_CLAIM_TRANSITIONS[current.status]?.includes(body.status)) {
        throw { statusCode: 422, message: `Cannot transition from ${current.status} to ${body.status}` };
      }
      const updates: Record<string, unknown> = { status: body.status };
      if (body.approved_amount !== undefined) {
        updates.approved_amount = body.approved_amount;
        updates.net_payable_amount = body.approved_amount;
      }
      if (body.denial_reason) updates.denial_reason = body.denial_reason;
      if (body.status === 'settled') updates.settlement_date = new Date().toISOString().slice(0, 10);

      const [updated] = await trx.updateTable('finance_insurance_claims')
        .set(updates as any)
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id)
        .returningAll().execute();
      return updated;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Warranty Claims
  // ═══════════════════════════════════════════════════════════════════

  fastify.post('/warranty', async (request, reply) => {
    const schema = z.object({
      vehicle_id: z.string().uuid(),
      job_card_id: z.string().uuid().optional(),
      claim_type: z.enum(['parts', 'labour', 'both']).default('both'),
      description: z.string().trim().min(1),
      claimed_amount: z.number().positive(),
      supplier_name: z.string().optional(),
      supplier_ref: z.string().optional(),
      warranty_start: z.string().optional(),
      warranty_end: z.string().optional(),
      notes: z.string().optional(),
    });
    const body = schema.parse(request.body);

    return withTenant(request.user.tenant_id, async (trx) => {
      const [{ count }] = await trx.selectFrom('gereji_warranty_claims')
        .where('tenant_id', '=', request.user.tenant_id)
        .select(sql<number>`count(*)::int`.as('count'))
        .execute();
      const claimNumber = `WC-${String(count + 1).padStart(5, '0')}`;

      const [claim] = await trx.insertInto('gereji_warranty_claims')
        .values({
          tenant_id: request.user.tenant_id,
          claim_number: claimNumber,
          vehicle_id: body.vehicle_id,
          job_card_id: body.job_card_id ?? null,
          claim_type: body.claim_type as any,
          status: 'submitted' as any,
          description: body.description,
          claimed_amount: body.claimed_amount,
          supplier_name: body.supplier_name ?? null,
          supplier_ref: body.supplier_ref ?? null,
          warranty_start: body.warranty_start ?? null,
          warranty_end: body.warranty_end ?? null,
          notes: body.notes ?? null,
          submitted_by: request.user.sub,
        })
        .returningAll()
        .execute();
      reply.status(201);
      return claim;
    });
  });

  fastify.get('/warranty/:id', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('gereji_warranty_claims')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .selectAll()
        .executeTakeFirst();
      if (!row) throw { statusCode: 404, message: 'Warranty claim not found' };
      return row;
    });
  });

  fastify.patch('/warranty/:id/review', async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      status: z.enum(WARRANTY_STATUSES),
      approved_amount: z.number().nonnegative().optional(),
      notes: z.string().optional(),
    });
    const body = schema.parse(request.body);

    return withTenant(request.user.tenant_id, async (trx) => {
      const current = await trx.selectFrom('gereji_warranty_claims')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .select(['status'])
        .executeTakeFirst();
      if (!current) throw { statusCode: 404, message: 'Warranty claim not found' };
      if (!WARRANTY_TRANSITIONS[current.status]?.includes(body.status)) {
        throw { statusCode: 422, message: `Cannot transition from ${current.status} to ${body.status}` };
      }

      const updates: Record<string, unknown> = {
        status: body.status,
        updated_at: new Date(),
      };
      if (body.approved_amount !== undefined) updates.approved_amount = body.approved_amount;
      if (body.notes) updates.notes = body.notes;

      if (['approved', 'partially_approved', 'rejected'].includes(body.status)) {
        updates.reviewed_by = request.user.sub;
        updates.reviewed_at = new Date();
      }
      if (body.status === 'settled') {
        updates.settled_at = new Date();
      }

      const [updated] = await trx.updateTable('gereji_warranty_claims')
        .set(updates as any)
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .execute();
      return updated;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Parts issue — bridge Gereji job cards to Inventory stock movements
  // ═══════════════════════════════════════════════════════════════════

  fastify.post('/job-cards/:jobCardId/issue-part', async (request, reply) => {
    const { jobCardId } = request.params as { jobCardId: string };
    const schema = z.object({
      item_id: z.string().uuid(),
      location_id: z.string().uuid(),
      quantity: z.number().positive(),
      uom: z.string().trim().min(1),
      batch_no: z.string().optional(),
      notes: z.string().optional(),
    });
    const body = schema.parse(request.body);

    return withTenant(request.user.tenant_id, async (trx) => {
      const jobCard = await trx.selectFrom('finance_job_cards')
        .innerJoin('finance_industry_work', 'finance_industry_work.id', 'finance_job_cards.work_id')
        .where('finance_job_cards.id', '=', jobCardId)
        .where('finance_job_cards.tenant_id', '=', request.user.tenant_id)
        .select([
          'finance_job_cards.id',
          'finance_job_cards.work_id',
          'finance_industry_work.reference',
          'finance_industry_work.status',
        ])
        .executeTakeFirst();
      if (!jobCard) throw { statusCode: 404, message: 'Job card not found' };
      if (!['active', 'in_progress', 'open'].includes(jobCard.status)) {
        throw { statusCode: 422, message: 'Parts can only be issued to active job cards' };
      }

      const movement = await InventoryService.recordMovement(trx, request.user.tenant_id, {
        actorId: request.user.sub,
        movementType: 'issue',
        itemId: body.item_id,
        fromLocationId: body.location_id,
        enteredQty: body.quantity,
        enteredUom: body.uom,
        batchNo: body.batch_no ?? null,
        reference: `Job card ${jobCard.reference}`,
        workId: jobCard.work_id,
      });

      reply.status(201);
      return { movement_id: movement.id, job_card_id: jobCardId, item_id: body.item_id, quantity: body.quantity };
    });
  });

  fastify.get('/job-cards/:jobCardId/parts', async (request) => {
    const { jobCardId } = request.params as { jobCardId: string };
    return withTenant(request.user.tenant_id, async (trx) => {
      const jobCard = await trx.selectFrom('finance_job_cards')
        .innerJoin('finance_industry_work', 'finance_industry_work.id', 'finance_job_cards.work_id')
        .where('finance_job_cards.id', '=', jobCardId)
        .where('finance_job_cards.tenant_id', '=', request.user.tenant_id)
        .select(['finance_job_cards.work_id', 'finance_industry_work.reference'])
        .executeTakeFirst();
      if (!jobCard) throw { statusCode: 404, message: 'Job card not found' };

      const movements = await trx.selectFrom('inventory_movements')
        .leftJoin('inventory_items', 'inventory_items.id', 'inventory_movements.item_id')
        .where('inventory_movements.tenant_id', '=', request.user.tenant_id)
        .where('inventory_movements.movement_type', '=', 'issue')
        .where('inventory_movements.reference', 'like', `%${jobCard.reference}%`)
        .select([
          'inventory_movements.id', 'inventory_movements.item_id',
          'inventory_items.name as item_name', 'inventory_items.sku',
          'inventory_movements.qty_delta', 'inventory_movements.entered_uom',
          'inventory_movements.total_cost', 'inventory_movements.created_at',
        ])
        .orderBy('inventory_movements.created_at', 'desc')
        .execute();

      return { parts: movements };
    });
  });
}
