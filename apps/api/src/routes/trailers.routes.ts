import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { pick } from '../lib/pick.js';

const FLEET_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR'] as const;

/**
 * Trailers, trailer documents, and transporters (migration 396) — closes
 * the "do not assume the vehicle record is enough" gap this module's own
 * design brief calls out by name. Same shape as vehicles/vehicle_documents
 * (tracking.routes.ts / fleetCompliance.routes.ts) so a trailer gets the
 * same real lifecycle, document expiry, and dispatch-eligibility treatment
 * a vehicle already does — see assertDispatchable() in fleetOps.routes.ts,
 * which checks a trip's trailer_id the same way it checks vehicle_id.
 */

function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

const trailerFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  registration_number: z.string().max(50).optional(),
  vin: z.string().max(50).optional(),
  trailer_type: z.enum(['FLATBED', 'CONTAINER_CHASSIS', 'TANKER', 'REEFER', 'LOWBED', 'CURTAIN_SIDE', 'OTHER']).optional(),
  capacity_kg: z.number().min(0).optional(),
  axles: z.number().int().min(1).max(12).optional(),
  ownership: z.enum(['OWNED', 'LEASED', 'RENTED', 'SUBCONTRACTED']).optional(),
  transporter_id: z.string().uuid().nullable().optional(),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE', 'DECOMMISSIONED']).optional(),
  notes: z.string().max(2000).optional(),
});
const trailerPatchSchema = trailerFieldsSchema.partial();

const trailerDocSchema = z.object({
  doc_type: z.enum(['REGISTRATION', 'INSURANCE', 'INSPECTION', 'PERMIT', 'OTHER']).optional(),
  doc_number: z.string().max(150).optional(),
  issued_date: z.string().optional(),
  expiry_date: z.string().optional(),
  file_url: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
});
const trailerDocPatchSchema = trailerDocSchema.partial();

const transporterFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contact_name: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(320).optional(),
  contract_ref: z.string().max(150).optional(),
  rate_notes: z.string().max(2000).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  notes: z.string().max(2000).optional(),
});
const transporterPatchSchema = transporterFieldsSchema.partial();

export async function trailersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('tracking'));

  // ── Transporters ─────────────────────────────────────────────

  // HUD-0024 continuation: internal tenant-business data (finance ledgers,
  // fleet ops, HR, identity/access admin, or tenant configuration) with only
  // an entitlement gate — reachable end-to-end by a CUSTOMER JWT (confirmed
  // live before this fix). Not customer-portal data.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  fastify.get('/transporters', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('transporters').selectAll()
        .where('tenant_id', '=', user.tenant_id).orderBy('name').execute()
    );
  });

  fastify.post('/transporters', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = transporterFieldsSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('transporters').values({
        tenant_id: user.tenant_id,
        name: body.name,
        contact_name: body.contact_name ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        contract_ref: body.contract_ref ?? null,
        rate_notes: body.rate_notes ?? null,
        status: body.status ?? 'ACTIVE',
        notes: body.notes ?? null,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.patch('/transporters/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = transporterPatchSchema.parse(req.body);
    const patch = pick(body, ['name', 'contact_name', 'phone', 'email', 'contract_ref', 'rate_notes', 'status', 'notes']);
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('transporters').set({ ...patch, updated_at: new Date() } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.delete('/transporters/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const inUse = await trx.selectFrom('vehicles').select('id')
        .where('transporter_id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst()
        ?? await trx.selectFrom('trailers').select('id')
          .where('transporter_id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (inUse) return reply.status(400).send({ error: 'This transporter still has vehicles or trailers assigned to it.' });
      await trx.deleteFrom('transporters').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return { ok: true };
    });
  });

  // ── Trailers ─────────────────────────────────────────────────

  fastify.get('/trailers', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const trailers = await trx.selectFrom('trailers as tr')
        .leftJoin('transporters as tp', 'tp.id', 'tr.transporter_id')
        .select([
          'tr.id', 'tr.name', 'tr.registration_number', 'tr.vin', 'tr.trailer_type',
          'tr.capacity_kg', 'tr.axles', 'tr.ownership', 'tr.transporter_id', 'tr.status',
          'tr.notes', 'tr.created_at', 'tr.updated_at', 'tp.name as transporter_name',
        ])
        .where('tr.tenant_id', '=', user.tenant_id)
        .orderBy('tr.name')
        .execute();

      if (trailers.length === 0) return [];

      // A trailer's "current trip" the same way a vehicle's is derived
      // elsewhere — real IN_PROGRESS trip, not a stored/duplicated status.
      const activeTrips = await trx.selectFrom('trips')
        .select(['trailer_id', 'vehicle_id', 'destination'])
        .where('tenant_id', '=', user.tenant_id).where('status', '=', 'IN_PROGRESS')
        .where('trailer_id', 'is not', null)
        .execute();
      const tripByTrailer = new Map(activeTrips.map(t => [t.trailer_id, t]));

      return trailers.map(t => ({
        ...t,
        capacity_kg: numOrNull(t.capacity_kg),
        current_trip: tripByTrailer.get(t.id) ?? null,
      }));
    });
  });

  fastify.post('/trailers', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = trailerFieldsSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('trailers').values({
        tenant_id: user.tenant_id,
        name: body.name,
        registration_number: body.registration_number ?? null,
        vin: body.vin ?? null,
        trailer_type: body.trailer_type ?? 'FLATBED',
        capacity_kg: body.capacity_kg ?? null,
        axles: body.axles ?? null,
        ownership: body.ownership ?? 'OWNED',
        transporter_id: body.transporter_id ?? null,
        status: body.status ?? 'ACTIVE',
        notes: body.notes ?? null,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.get('/trailers/:id', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const trailer = await trx.selectFrom('trailers as tr')
        .leftJoin('transporters as tp', 'tp.id', 'tr.transporter_id')
        .selectAll('tr').select('tp.name as transporter_name')
        .where('tr.id', '=', id).where('tr.tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!trailer) return reply.status(404).send({ error: 'Trailer not found' });

      const documents = await trx.selectFrom('trailer_documents').selectAll()
        .where('trailer_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('expiry_date').execute();

      const trips = await trx.selectFrom('trips').selectAll()
        .where('trailer_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc').limit(20).execute();

      return {
        trailer: { ...trailer, capacity_kg: numOrNull(trailer.capacity_kg) },
        documents,
        trips: trips.map(t => ({ ...t, distance_km: numOrNull(t.distance_km), cargo_weight_kg: numOrNull(t.cargo_weight_kg) })),
      };
    });
  });

  fastify.patch('/trailers/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = trailerPatchSchema.parse(req.body);
    const patch = pick(body, ['name', 'registration_number', 'vin', 'trailer_type', 'capacity_kg', 'axles', 'ownership', 'transporter_id', 'status', 'notes']);
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('trailers').set({ ...patch, updated_at: new Date() } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.delete('/trailers/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('trailers').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });

  // ── Trailer documents ────────────────────────────────────────

  fastify.get('/trailers/:id/documents', async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('trailer_documents').selectAll()
        .where('trailer_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('expiry_date').execute()
    );
  });

  fastify.post('/trailers/:id/documents', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = trailerDocSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('trailer_documents').values({
        tenant_id: user.tenant_id,
        trailer_id: id,
        doc_type: body.doc_type ?? 'OTHER',
        doc_number: body.doc_number ?? null,
        issued_date: body.issued_date ? new Date(body.issued_date) : null,
        expiry_date: body.expiry_date ? new Date(body.expiry_date) : null,
        file_url: body.file_url ?? null,
        notes: body.notes ?? null,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.patch('/trailer-documents/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = trailerDocPatchSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('trailer_documents').set({
        ...body,
        issued_date: body.issued_date ? new Date(body.issued_date) : undefined,
        expiry_date: body.expiry_date ? new Date(body.expiry_date) : undefined,
        updated_at: new Date(),
      } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.delete('/trailer-documents/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('trailer_documents').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });
}
