import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, type Database } from '../db/client.js';
import { sql, type Transaction } from 'kysely';
import { requireEntitlement } from '../middleware/entitlement.js';
import { GLService } from '../services/gl.service.js';
import { NotificationService } from '../services/notification.service.js';

/** The clerk who booked a parcel in hears when it reaches the other end. */
async function notifyParcelCreator(trx: any, tenantId: string, actorId: string, parcel: any, title: string, type: string): Promise<void> {
  if (!parcel?.created_by || parcel.created_by === actorId) return;
  await NotificationService.createNotificationInTrx(trx, {
    tenantId, userId: parcel.created_by, app: 'tuma', type, title,
    message: `${parcel.parcel_number}${parcel.recipient_name ? ` — for ${parcel.recipient_name}` : ''}`,
    link: '/tuma/parcels', entityType: 'parcel', entityId: parcel.id, entityLabel: parcel.parcel_number,
  });
}

const PARCEL_TRANSITIONS: Record<string, string[]> = {
  RECEIVED:   ['DISPATCHED', 'CANCELED'],
  DISPATCHED: ['OFFLOADED', 'CANCELED'],
  OFFLOADED:  ['DELIVERED', 'PICKED_UP', 'CANCELED'],
  DELIVERED:  [],
  PICKED_UP:  [],
  CANCELED:   [],
};

export async function tumaParcelsRoutes(fastify: FastifyInstance) {
  // Same gap as tuma.routes.ts's sibling fix: requireEntitlement() 401s on
  // `!request.user` before ever checking the actual entitlement, and
  // nothing here ever populated request.user — every route in this file
  // (parcels CRUD, dispatch/offload/deliver/cancel, float settle/replenish)
  // was unreachable by any real authenticated caller.
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('tuma'));

  // Every `throw { statusCode, message }` below (parcel/float lookups)
  // relied on being caught as a real HTTP status, but this file never had
  // its own setErrorHandler and index.ts's global one only reads
  // `.statusCode` off an actual Error instance, not a plain object literal
  // — same bug class as ngao-crud.routes.ts's own fix. Every one of these
  // checks was silently returning HTTP 200 with an error-shaped JSON body
  // instead of the real 404/422. Found live while verifying the missing
  // fastify.authenticate hook fix above.
  fastify.setErrorHandler((error: any, _request, reply) => {
    // A local setErrorHandler replaces index.ts's global one for every route
    // in this plugin, not just supplements it — its own ZodError formatting
    // (real validation failures from every z.object(...).parse() call above)
    // has to be replicated here too, or it silently degrades to a bare 500.
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as unknown as { issues: { path: (string | number)[]; message: string }[] };
      return reply.status(400).send({ error: 'Validation failed', details: zodError.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
    }
    const status = error && typeof error === 'object' && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply.status(status).send({ error: status < 500 ? (error.message ?? 'Request failed.') : 'Unable to process the request.' });
  });

  // Resolves the display fields for a parcel's linked ClearOS shipment, if
  // any — a plain, app-level lookup (no DB FK; see migration 737's comment
  // on why shipment_cases, being partitioned, can't carry one).
  async function attachLinkedShipment<T extends { shipment_case_id: string | null }>(
    trx: Transaction<Database>,
    tenantId: string,
    rows: T[],
  ): Promise<(T & { linked_shipment: { id: string; ref_number: string; stage: string } | null })[]> {
    const ids = [...new Set(rows.map(r => r.shipment_case_id).filter((v): v is string => !!v))];
    if (ids.length === 0) return rows.map(r => ({ ...r, linked_shipment: null }));
    const shipments = await trx.selectFrom('shipment_cases')
      .where('id', 'in', ids)
      .where('tenant_id', '=', tenantId)
      .select(['id', 'ref_number', 'stage'])
      .execute();
    const byId = new Map(shipments.map(s => [s.id, { id: s.id, ref_number: s.ref_number, stage: s.stage }]));
    return rows.map(r => ({ ...r, linked_shipment: r.shipment_case_id ? byId.get(r.shipment_case_id) ?? null : null }));
  }

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
      const rawRows = await q.selectAll().limit(l).offset((p - 1) * l).execute();
      const rows = await attachLinkedShipment(trx, request.user.tenant_id, rawRows);
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

      const [withLink] = await attachLinkedShipment(trx, request.user.tenant_id, [parcel]);
      return { ...withLink, tracking };
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
      // Optional: this parcel is the last-mile leg of an already-cleared
      // ClearOS shipment. Validated against the tenant below, not just
      // shape-checked, since there's no DB FK to enforce it (see mig 737).
      shipment_case_id: z.string().uuid().optional(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async (trx) => {
      if (body.shipment_case_id) {
        const shipment = await trx.selectFrom('shipment_cases')
          .where('id', '=', body.shipment_case_id)
          .where('tenant_id', '=', request.user.tenant_id)
          .select('id')
          .executeTakeFirst();
        if (!shipment) throw { statusCode: 422, message: 'Linked shipment not found for this tenant.' };
      }

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
          shipment_case_id: body.shipment_case_id ?? null,
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

      await notifyParcelCreator(trx, request.user.tenant_id, request.user.sub, updated, 'Parcel arrived at destination', 'info');

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

      await notifyParcelCreator(trx, request.user.tenant_id, request.user.sub, updated, 'Parcel delivered', 'success');

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
