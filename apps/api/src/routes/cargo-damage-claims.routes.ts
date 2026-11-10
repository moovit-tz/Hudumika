import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { GLService } from '../services/gl.service.js';
import { getNextDocNumber, getNextCustomerDocNumber } from '../lib/doc-numbering.js';

// Resolution of a damage claim is a financial decision (it either issues a
// real credit note or closes the matter with no payout), so it's gated
// tighter than the ops-facing FLEET_ROLES used elsewhere in cargo loading.
const RESOLVE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'] as const;

export async function cargoDamageClaimsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('tracking'));
  fastify.addHook('preHandler', requireEntitlement('tracking.cargo-loading'));

  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  fastify.get('/', async (request, reply) => {
    const user = request.user;
    const parsed = z.object({
      status: z.enum(['OPEN', 'APPROVED', 'REJECTED']).optional(),
      manifest_id: z.string().uuid().optional(),
    }).safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid filters.' });
    const { status, manifest_id } = parsed.data;

    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('cargo_damage_claims as cdc')
        .innerJoin('cargo_items as ci', 'ci.id', 'cdc.cargo_item_id')
        .innerJoin('cargo_manifests as cm', 'cm.id', 'cdc.manifest_id')
        .leftJoin('customers as c', 'c.id', 'cdc.customer_id')
        .where('cdc.tenant_id', '=', user.tenant_id)
        .select([
          'cdc.id', 'cdc.manifest_id', 'cdc.cargo_item_id', 'cdc.customer_id', 'cdc.damaged_quantity',
          'cdc.damage_description', 'cdc.status', 'cdc.claimed_amount', 'cdc.approved_amount', 'cdc.currency',
          'cdc.credit_note_id', 'cdc.resolution_notes', 'cdc.resolved_at', 'cdc.created_at',
          'ci.label as item_label', 'ci.quantity as item_quantity',
          'cm.name as manifest_name',
          'c.name as customer_name',
        ]);
      if (status) q = q.where('cdc.status', '=', status);
      if (manifest_id) q = q.where('cdc.manifest_id', '=', manifest_id);
      return q.orderBy('cdc.created_at', 'desc').execute();
    });
  });

  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const claim = await trx.selectFrom('cargo_damage_claims').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!claim) return reply.status(404).send({ error: 'Damage claim not found' });
      return claim;
    });
  });

  fastify.post('/:id/approve', { preHandler: requireRole(...RESOLVE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = z.object({
      approved_amount: z.number().positive(),
      resolution_notes: z.string().trim().max(2000).optional(),
    }).parse(request.body);

    const result = await withTenant(user.tenant_id, async (trx) => {
      const claim = await trx.selectFrom('cargo_damage_claims').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).forUpdate().executeTakeFirst();
      if (!claim) return reply.status(404).send({ error: 'Damage claim not found' });
      if (claim.status !== 'OPEN') return reply.status(409).send({ error: `This claim is already ${claim.status.toLowerCase()}.` });
      if (!claim.customer_id) {
        return reply.status(422).send({
          error: 'No customer could be resolved for this manifest, so a credit note cannot be issued. Reject this claim instead, or link the manifest to its shipment/booking/release first.',
        });
      }

      const creditNoteNumber = (await getNextCustomerDocNumber(trx, user.tenant_id, claim.customer_id, 'credit_note'))
        || await getNextDocNumber(trx, user.tenant_id, 'credit_note');
      const amount = Math.round(body.approved_amount * 100) / 100;

      const cn = await trx.insertInto('credit_notes').values({
        tenant_id: user.tenant_id,
        credit_note_number: creditNoteNumber,
        customer_id: claim.customer_id,
        currency: claim.currency,
        exchange_rate: 1,
        credit_date: new Date().toISOString().slice(0, 10),
        reason: 'Cargo damage claim',
        status: 'POSTED',
        notes: `Damage claim on manifest ${claim.manifest_id}${body.resolution_notes ? `: ${body.resolution_notes}` : ''}`,
        created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('credit_note_lines').values({
        credit_note_id: cn.id,
        name: 'Cargo damage settlement',
        description: claim.damage_description || `${claim.damaged_quantity} unit(s) damaged in transit`,
        unit: 'PER BIL',
        rate: amount,
        qty: 1,
        tax_pct: 0,
        line_group: 'other',
        currency: claim.currency,
        sort_order: 0,
      }).execute();

      await GLService.post(user.tenant_id, {
        entryDate: cn.credit_date ?? new Date().toISOString().slice(0, 10),
        description: `Cargo damage credit note: ${cn.credit_note_number}`,
        reference: cn.credit_note_number,
        sourceModule: 'AR',
        sourceId: cn.id,
        createdBy: user.sub,
        lines: [
          { accountCode: '4000', debit: amount, credit: 0, description: 'Revenue reversed — cargo damage settlement', currency: claim.currency, exchangeRate: 1 },
          { accountCode: '1100', debit: 0, credit: amount, description: 'Accounts receivable reduced — cargo damage settlement', currency: claim.currency, exchangeRate: 1 },
        ],
      }, trx);

      const updated = await trx.updateTable('cargo_damage_claims')
        .set({
          status: 'APPROVED',
          approved_amount: amount,
          credit_note_id: cn.id,
          resolution_notes: body.resolution_notes || null,
          resolved_by: user.sub,
          resolved_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();

      return { ...updated, credit_note: cn };
    });
    if (!reply.sent) return result;
  });

  fastify.post('/:id/reject', { preHandler: requireRole(...RESOLVE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { resolution_notes } = z.object({
      resolution_notes: z.string().trim().min(1, 'A reason is required to reject a damage claim.').max(2000),
    }).parse(request.body);

    const result = await withTenant(user.tenant_id, async (trx) => {
      const claim = await trx.selectFrom('cargo_damage_claims').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).forUpdate().executeTakeFirst();
      if (!claim) return reply.status(404).send({ error: 'Damage claim not found' });
      if (claim.status !== 'OPEN') return reply.status(409).send({ error: `This claim is already ${claim.status.toLowerCase()}.` });

      return trx.updateTable('cargo_damage_claims')
        .set({ status: 'REJECTED', resolution_notes, resolved_by: user.sub, resolved_at: new Date(), updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
    if (!reply.sent) return result;
  });
}
