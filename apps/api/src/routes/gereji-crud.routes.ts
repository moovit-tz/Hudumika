import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { sql } from 'kysely';
import { requireEntitlement } from '../middleware/entitlement.js';
import { InventoryService } from '../services/inventory.service.js';

const ESTIMATE_STATUSES = ['draft', 'sent', 'approved', 'rejected', 'expired', 'converted'] as const;
const WARRANTY_STATUSES = ['submitted', 'under_review', 'approved', 'partially_approved', 'rejected', 'settled'] as const;

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
  fastify.addHook('preHandler', requireEntitlement('gereji'));

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

      const [work] = await trx.insertInto('finance_industry_work')
        .values({
          tenant_id: request.user.tenant_id,
          industry: 'automotive' as any,
          reference: ref,
          name: `Job from estimate ${estimate.estimate_number}`,
          customer_id: estimate.customer_id ?? request.user.sub,
          currency: estimate.currency,
          budget: estimate.grand_total,
          due_date: null,
          specifications: JSON.stringify({ source_estimate: estimate.estimate_number }) as any,
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
