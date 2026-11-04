import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { sql } from 'kysely';
import { requireEntitlement } from '../middleware/entitlement.js';
import { GLService } from '../services/gl.service.js';

const PARCEL_TRANSITIONS: Record<string, string[]> = {
  RECEIVED:   ['DISPATCHED', 'CANCELED'],
  DISPATCHED: ['OFFLOADED', 'CANCELED'],
  OFFLOADED:  ['DELIVERED', 'PICKED_UP', 'CANCELED'],
  DELIVERED:  [],
  PICKED_UP:  [],
  CANCELED:   [],
};

export async function tumaParcelsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireEntitlement('tuma'));

  // ── List parcels with filters ──
  fastify.get('/parcels', async (request) => {
    const { status, office_id, search, page = '1', limit = '50' } = request.query as Record<string, string>;
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    return withTenant(request.user.tenant_id, async (trx) => {
      let q = trx.selectFrom('tuma_parcels')
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc');
      if (status) q = q.where('status', '=', status as any);
      if (office_id) q = q.where('origin_office_id', '=', office_id);
      if (search) {
        q = q.where(sql<boolean>`(parcel_number ilike ${`%${search}%`} OR sender_name ilike ${`%${search}%`} OR recipient_name ilike ${`%${search}%`})`);
      }
      const rows = await q.selectAll().limit(l).offset((p - 1) * l).execute();
      const [{ count }] = await trx.selectFrom('tuma_parcels')
        .where('tenant_id', '=', request.user.tenant_id)
        .select(sql<number>`count(*)::int`.as('count'))
        .execute();
      return { rows, total: count, page: p, limit: l };
    });
  });

  // ── Get parcel detail with tracking ──
  fastify.get('/parcels/:id', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async (trx) => {
      const parcel = await trx.selectFrom('tuma_parcels')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .selectAll()
        .executeTakeFirst();
      if (!parcel) throw { statusCode: 404, message: 'Parcel not found' };

      const tracking = await trx.selectFrom('tuma_parcel_tracking')
        .where('parcel_id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('tracked_at', 'desc')
        .selectAll()
        .execute();

      return { ...parcel, tracking };
    });
  });

  // ── Receive a parcel (create) ──
  fastify.post('/parcels', async (request, reply) => {
    const schema = z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      weight: z.number().positive().optional(),
      value: z.number().optional(),
      price: z.number().optional(),
      units: z.number().int().positive().default(1),
      sender_name: z.string().trim().min(1),
      sender_phone: z.string().trim().min(1),
      recipient_name: z.string().trim().min(1),
      recipient_phone: z.string().trim().min(1),
      origin_office_id: z.string().uuid(),
      dest_office_id: z.string().uuid(),
      vehicle_id: z.string().uuid().optional(),
      parcel_type_id: z.string().uuid().optional(),
      travel_date: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async (trx) => {
      const [{ count }] = await trx.selectFrom('tuma_parcels')
        .where('tenant_id', '=', request.user.tenant_id)
        .select(sql<number>`count(*)::int`.as('count'))
        .execute();
      const parcelNumber = `PCL-${String(count + 1).padStart(6, '0')}`;

      const [parcel] = await trx.insertInto('tuma_parcels')
        .values({
          tenant_id: request.user.tenant_id,
          parcel_number: parcelNumber,
          name: body.name,
          description: body.description,
          weight: body.weight ?? null,
          value: body.value ?? null,
          price: body.price ?? null,
          units: body.units,
          sender_name: body.sender_name,
          sender_phone: body.sender_phone,
          recipient_name: body.recipient_name,
          recipient_phone: body.recipient_phone,
          origin_office_id: body.origin_office_id,
          dest_office_id: body.dest_office_id,
          vehicle_id: body.vehicle_id,
          parcel_type_id: body.parcel_type_id,
          travel_date: body.travel_date ? new Date(body.travel_date) : null,
          created_by: request.user.sub,
          status: 'RECEIVED',
        })
        .returningAll()
        .execute();

      await trx.insertInto('tuma_parcel_tracking')
        .values({
          tenant_id: request.user.tenant_id,
          parcel_id: parcel.id,
          status: 'RECEIVED',
          description: 'Parcel received at origin office',
          actor_id: request.user.sub,
        })
        .execute();

      reply.status(201);
      return parcel;
    });
  });

  // ── Dispatch parcel ──
  fastify.patch('/parcels/:id/dispatch', async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      vehicle_id: z.string().uuid(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async (trx) => {
      const parcel = await trx.selectFrom('tuma_parcels')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .select(['status'])
        .executeTakeFirst();
      if (!parcel) throw { statusCode: 404, message: 'Parcel not found' };
      if (!PARCEL_TRANSITIONS[parcel.status]?.includes('DISPATCHED')) {
        throw { statusCode: 422, message: `Cannot dispatch parcel in ${parcel.status} state` };
      }

      const [updated] = await trx.updateTable('tuma_parcels')
        .set({
          status: 'DISPATCHED',
          vehicle_id: body.vehicle_id,
          dispatcher_id: request.user.sub,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .execute();

      await trx.insertInto('tuma_parcel_tracking')
        .values({
          tenant_id: request.user.tenant_id,
          parcel_id: id,
          status: 'DISPATCHED',
          description: 'Parcel dispatched for delivery',
          actor_id: request.user.sub,
        })
        .execute();

      return updated;
    });
  });

  // ── Offload parcel ──
  fastify.patch('/parcels/:id/offload', async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      location: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async (trx) => {
      const parcel = await trx.selectFrom('tuma_parcels')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .select(['status'])
        .executeTakeFirst();
      if (!parcel) throw { statusCode: 404, message: 'Parcel not found' };
      if (!PARCEL_TRANSITIONS[parcel.status]?.includes('OFFLOADED')) {
        throw { statusCode: 422, message: `Cannot offload parcel in ${parcel.status} state` };
      }

      const [updated] = await trx.updateTable('tuma_parcels')
        .set({
          status: 'OFFLOADED',
          offloader_id: request.user.sub,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .execute();

      await trx.insertInto('tuma_parcel_tracking')
        .values({
          tenant_id: request.user.tenant_id,
          parcel_id: id,
          status: 'OFFLOADED',
          location: body.location,
          description: 'Parcel offloaded at destination',
          actor_id: request.user.sub,
        })
        .execute();

      return updated;
    });
  });

  // ── Deliver parcel ──
  fastify.patch('/parcels/:id/deliver', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async (trx) => {
      const parcel = await trx.selectFrom('tuma_parcels')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .select(['status'])
        .executeTakeFirst();
      if (!parcel) throw { statusCode: 404, message: 'Parcel not found' };
      if (!PARCEL_TRANSITIONS[parcel.status]?.includes('DELIVERED')) {
        throw { statusCode: 422, message: `Cannot deliver parcel in ${parcel.status} state` };
      }

      const [updated] = await trx.updateTable('tuma_parcels')
        .set({
          status: 'DELIVERED',
          deliverer_id: request.user.sub,
          delivered_date: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .execute();

      await trx.insertInto('tuma_parcel_tracking')
        .values({
          tenant_id: request.user.tenant_id,
          parcel_id: id,
          status: 'DELIVERED',
          description: 'Parcel delivered to recipient',
          actor_id: request.user.sub,
        })
        .execute();

      return updated;
    });
  });

  // ── Cancel parcel ──
  fastify.patch('/parcels/:id/cancel', async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      reason: z.string().trim().min(1),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async (trx) => {
      const parcel = await trx.selectFrom('tuma_parcels')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .select(['status'])
        .executeTakeFirst();
      if (!parcel) throw { statusCode: 404, message: 'Parcel not found' };
      if (!PARCEL_TRANSITIONS[parcel.status]?.includes('CANCELED')) {
        throw { statusCode: 422, message: `Cannot cancel parcel in ${parcel.status} state` };
      }

      const [updated] = await trx.updateTable('tuma_parcels')
        .set({
          status: 'CANCELED',
          canceler_id: request.user.sub,
          canceled_at: new Date(),
          cancellation_reason: body.reason,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .execute();

      await trx.insertInto('tuma_parcel_tracking')
        .values({
          tenant_id: request.user.tenant_id,
          parcel_id: id,
          status: 'CANCELED',
          description: `Canceled: ${body.reason}`,
          actor_id: request.user.sub,
        })
        .execute();

      return updated;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Float settlement — bridge Tuma agent float to FinOps GL
  // ═══════════════════════════════════════════════════════════════════

  fastify.post('/float/settle', async (request, reply) => {
    const schema = z.object({
      float_account_id: z.string().uuid(),
      amount: z.number().positive(),
      description: z.string().trim().min(1).default('Agent float settlement'),
      payment_reference: z.string().optional(),
    });
    const body = schema.parse(request.body);

    return withTenant(request.user.tenant_id, async (trx) => {
      const account = await trx.selectFrom('tuma_float_accounts')
        .where('id', '=', body.float_account_id)
        .where('tenant_id', '=', request.user.tenant_id)
        .selectAll().forUpdate()
        .executeTakeFirst();
      if (!account) throw { statusCode: 404, message: 'Float account not found' };
      if (Number(account.used_float) < body.amount) {
        throw { statusCode: 422, message: `Settlement amount exceeds used float: ${account.used_float} < ${body.amount}` };
      }

      await GLService.post(request.user.tenant_id, {
        entryDate: new Date().toISOString().slice(0, 10),
        description: body.description,
        sourceModule: 'MANUAL',
        sourceId: body.float_account_id,
        createdBy: request.user.sub,
        lines: [
          { accountCode: '2710', debit: body.amount, credit: 0, dimensions: { float_account_id: body.float_account_id } },
          { accountCode: '4600', debit: 0, credit: body.amount, dimensions: { float_account_id: body.float_account_id } },
        ],
      }, trx);

      const newUsed = Number(account.used_float) - body.amount;
      const newAvailable = Number(account.total_float) - newUsed;

      await trx.updateTable('tuma_float_accounts')
        .set({
          used_float: newUsed,
          available_float: newAvailable,
          updated_at: new Date(),
        })
        .where('id', '=', body.float_account_id)
        .where('tenant_id', '=', request.user.tenant_id)
        .execute();

      const [txn] = await trx.insertInto('tuma_float_transactions')
        .values({
          tenant_id: request.user.tenant_id,
          float_account_id: body.float_account_id,
          amount: -body.amount,
          type: 'DEDUCTION',
          description: body.description,
          payment_reference: body.payment_reference ?? null,
          payment_status: 'PAID',
          performed_by: request.user.sub,
          balance_after: newAvailable,
        })
        .returningAll()
        .execute();

      reply.status(201);
      return { settlement: txn, new_available_float: newAvailable };
    });
  });

  fastify.post('/float/replenish', async (request, reply) => {
    const schema = z.object({
      float_account_id: z.string().uuid(),
      amount: z.number().positive(),
      description: z.string().trim().min(1).default('Float replenishment'),
      payment_reference: z.string().optional(),
    });
    const body = schema.parse(request.body);

    return withTenant(request.user.tenant_id, async (trx) => {
      const account = await trx.selectFrom('tuma_float_accounts')
        .where('id', '=', body.float_account_id)
        .where('tenant_id', '=', request.user.tenant_id)
        .selectAll().forUpdate()
        .executeTakeFirst();
      if (!account) throw { statusCode: 404, message: 'Float account not found' };

      await GLService.post(request.user.tenant_id, {
        entryDate: new Date().toISOString().slice(0, 10),
        description: body.description,
        sourceModule: 'MANUAL',
        sourceId: body.float_account_id,
        createdBy: request.user.sub,
        lines: [
          { accountCode: '1010', debit: body.amount, credit: 0, dimensions: { float_account_id: body.float_account_id } },
          { accountCode: '2710', debit: 0, credit: body.amount, dimensions: { float_account_id: body.float_account_id } },
        ],
      }, trx);

      const newTotal = Number(account.total_float) + body.amount;
      const newAvailable = Number(account.available_float) + body.amount;

      await trx.updateTable('tuma_float_accounts')
        .set({
          total_float: newTotal,
          available_float: newAvailable,
          last_replenished: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', body.float_account_id)
        .where('tenant_id', '=', request.user.tenant_id)
        .execute();

      const [txn] = await trx.insertInto('tuma_float_transactions')
        .values({
          tenant_id: request.user.tenant_id,
          float_account_id: body.float_account_id,
          amount: body.amount,
          type: 'REPLENISHMENT',
          description: body.description,
          payment_reference: body.payment_reference ?? null,
          payment_status: 'PAID',
          performed_by: request.user.sub,
          balance_after: newAvailable,
        })
        .returningAll()
        .execute();

      reply.status(201);
      return { replenishment: txn, new_available_float: newAvailable };
    });
  });
}
