import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { assertDispatchable } from './fleetOps.routes.js';
import { z } from 'zod';
import type { Transaction } from 'kysely';
import type { Database, CargoManifestStage, CargoManifestStatus } from '../db/client.js';

const FLEET_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR'] as const;

async function lockManifest(trx: Transaction<Database>, tenantId: string, id: string, allowedStatuses: CargoManifestStatus[] = ['DRAFT', 'PLANNED']) {
  const manifest = await trx.selectFrom('cargo_manifests').selectAll().where('id', '=', id).where('tenant_id', '=', tenantId).forUpdate().executeTakeFirst();
  if (!manifest) throw Object.assign(new Error('Manifest not found'), { statusCode: 404 });
  if (!allowedStatuses.includes(manifest.status as CargoManifestStatus)) {
    throw Object.assign(new Error(`Manifest is in status ${manifest.status}. Only ${allowedStatuses.join(' / ')} manifests can be modified.`), { statusCode: 409 });
  }
  return manifest;
}

// ── Extreme-point 3D bin-packing heuristic ─────────────────────────────
interface Point { x: number; y: number; z: number }
interface Dims { l: number; w: number; h: number }
interface Unit { itemIndex: number; label: string; dims: Dims; weight: number }
interface Placed { itemIndex: number; pos: Point; dims: Dims }

function fitsContainer(pos: Point, dims: Dims, container: Dims): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.z >= 0
    && pos.x + dims.l <= container.l + 1e-6
    && pos.y + dims.w <= container.w + 1e-6
    && pos.z + dims.h <= container.h + 1e-6;
}

function overlaps(pos: Point, dims: Dims, other: Placed): boolean {
  const noOverlapX = pos.x + dims.l <= other.pos.x + 1e-6 || other.pos.x + other.dims.l <= pos.x + 1e-6;
  const noOverlapY = pos.y + dims.w <= other.pos.y + 1e-6 || other.pos.y + other.dims.w <= pos.y + 1e-6;
  const noOverlapZ = pos.z + dims.h <= other.pos.z + 1e-6 || other.pos.z + other.dims.h <= pos.z + 1e-6;
  return !(noOverlapX || noOverlapY || noOverlapZ);
}

function packItems(container: Dims, maxWeightKg: number, units: Unit[]) {
  const sorted = [...units].sort((a, b) => (b.dims.l * b.dims.w * b.dims.h) - (a.dims.l * a.dims.w * a.dims.h));
  const placed: Placed[] = [];
  const unplacedIndices: number[] = [];
  let candidates: Point[] = [{ x: 0, y: 0, z: 0 }];
  let totalWeight = 0;

  for (const unit of sorted) {
    if (totalWeight + unit.weight > maxWeightKg + 1e-6) {
      unplacedIndices.push(unit.itemIndex);
      continue;
    }
    candidates.sort((a, b) => (a.z - b.z) || (a.y - b.y) || (a.x - b.x));
    let placedHere: Point | null = null;
    for (const c of candidates) {
      if (!fitsContainer(c, unit.dims, container)) continue;
      if (placed.some(p => overlaps(c, unit.dims, p))) continue;
      placedHere = c;
      break;
    }
    if (!placedHere) {
      unplacedIndices.push(unit.itemIndex);
      continue;
    }
    placed.push({ itemIndex: unit.itemIndex, pos: placedHere, dims: unit.dims });
    totalWeight += unit.weight;
    candidates.push(
      { x: placedHere.x + unit.dims.l, y: placedHere.y, z: placedHere.z },
      { x: placedHere.x, y: placedHere.y + unit.dims.w, z: placedHere.z },
      { x: placedHere.x, y: placedHere.y, z: placedHere.z + unit.dims.h },
    );
  }

  return { placed, unplacedIndices, totalWeight };
}

export async function cargoLoadingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('tracking'));
  fastify.addHook('preHandler', requireEntitlement('tracking.cargo-loading'));
  
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  // Pre-handler validation for mutating operations
  fastify.addHook('preHandler', async (request, reply) => {
    if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) return;
    await requireRole(...FLEET_ROLES)(request, reply);
    if (reply.sent) return;

    const path = request.routeOptions.url || '';
    const body = (request.body || {}) as Record<string, unknown>;
    const positive = z.number().finite().min(0.1).max(1000000);
    const dimensions = z.object({
      container_length_cm: positive,
      container_width_cm: positive,
      container_height_cm: positive,
      max_weight_kg: positive,
    }).passthrough();

    let schema: z.ZodTypeAny | undefined;
    if (path.endsWith('/manifests') && request.method === 'POST') {
      schema = dimensions.extend({ name: z.string().trim().min(1).max(200) }).passthrough();
    }
    if (path.endsWith('/manifests/:id/items') && request.method === 'POST') {
      schema = z.object({
        label: z.string().trim().min(1).max(200),
        length_cm: positive,
        width_cm: positive,
        height_cm: positive,
        weight_kg: positive,
        quantity: z.number().int().min(1).max(10000).optional(),
      }).passthrough();
    }
    if (path.endsWith('/manifests/:id') && request.method === 'PATCH') {
      schema = dimensions.partial().passthrough();
    }
    if (schema && !schema.safeParse(body).success) {
      return reply.status(400).send({ error: 'Enter valid names, positive measurements and whole quantities.' });
    }

    const tenantId = request.user.tenant_id;
    return withTenant(tenantId, async (trx) => {
      const fkChecks = [
        ['vehicle_id', 'vehicles'],
        ['shipment_id', 'shipment_cases'],
        ['trailer_id', 'trailers'],
        ['location_id', 'warehouse_locations'],
        ['booking_id', 'freight_bookings'],
        ['release_doc_id', 'delivery_documents'],
      ] as const;

      for (const [field, table] of fkChecks) {
        if (body[field] == null || body[field] === '') continue;
        if (!z.string().uuid().safeParse(body[field]).success) return reply.status(400).send({ error: `Invalid ${field}` });
        const row = await trx.selectFrom(table as any).select('id').where('id', '=', body[field] as string).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!row) return reply.status(404).send({ error: `${field} not found` });
      }

      const { id } = request.params as { id?: string };
      if (!id) return;
      let manifestId = id;
      if (path.endsWith('/items/:id') || path.endsWith('/items/:id/placement')) {
        const item = await trx.selectFrom('cargo_items').select('manifest_id').where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!item) return reply.status(404).send({ error: 'Cargo item not found' });
        manifestId = item.manifest_id;
      }
      const manifest = await trx.selectFrom('cargo_manifests').selectAll().where('id', '=', manifestId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!manifest) return reply.status(404).send({ error: 'Manifest not found' });

      if (path.endsWith('/dispatch')) {
        if (!['LOADED', 'APPROVED'].includes(manifest.status)) {
          return reply.status(409).send({ error: 'Manifest must be approved and physically loaded before dispatch.' });
        }
        if (!body.vehicle_id && !manifest.vehicle_id) return reply.status(400).send({ error: 'Select a vehicle.' });
      } else if (path.endsWith('/approve')) {
        if (!['DRAFT', 'PLANNED'].includes(manifest.status)) {
          return reply.status(409).send({ error: 'Only draft or planned manifests can be approved.' });
        }
      } else if (path.endsWith('/start-loading')) {
        if (!['APPROVED', 'PLANNED'].includes(manifest.status)) {
          return reply.status(409).send({ error: 'Approve the plan before loading cargo.' });
        }
      } else if (path.endsWith('/verify-load')) {
        if (!['APPROVED', 'LOADING', 'LOADED'].includes(manifest.status)) {
          return reply.status(409).send({ error: 'Manifest must be approved or in loading status to verify.' });
        }
      } else if (path.endsWith('/import-job') || path.endsWith('/import-shipment')) {
        if (!['DRAFT', 'PLANNED'].includes(manifest.status)) {
          return reply.status(409).send({ error: 'Cargo can only be imported into draft plans.' });
        }
      } else if (!['DRAFT', 'PLANNED'].includes(manifest.status) && request.method !== 'GET') {
        return reply.status(409).send({ error: 'Manifest is locked and cannot be modified. Reset to draft if changes are needed.' });
      }
    });
  });

  // ── Stage 1: Job Sources ─────────────────────────────────────

  fastify.get('/manifests/jobs', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const shipments = await trx.selectFrom('shipment_cases')
        .select(['id', 'ref_number', 'goods_desc', 'gross_weight_kg', 'origin_port', 'dest_port', 'containers', 'stage', 'created_at'])
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc')
        .limit(30)
        .execute();

      const bookings = await trx.selectFrom('freight_bookings')
        .select(['id', 'booking_number', 'cargo_desc', 'quantity', 'origin_port', 'destination_port', 'mode', 'status', 'created_at'])
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc')
        .limit(30)
        .execute();

      const releases = await trx.selectFrom('delivery_documents')
        .select(['id', 'doc_number', 'doc_type', 'customer_name', 'carrier_name', 'delivery_address', 'containers', 'status', 'valid_until', 'created_at'])
        .where('tenant_id', '=', user.tenant_id)
        .where('doc_type', 'in', ['RELEASE_ORDER', 'DELIVERY_ORDER'])
        .orderBy('created_at', 'desc')
        .limit(30)
        .execute();

      return { shipments, bookings, releases };
    });
  });

  // ── Stage 2: Equipment & Crew ────────────────────────────────

  fastify.get('/manifests/equipment', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const vehicles = await trx.selectFrom('vehicles')
        .select(['id', 'name', 'plate_number', 'type', 'make', 'model', 'dimensions', 'status', 'photo_url'])
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('name', 'asc')
        .execute();

      const trailers = await trx.selectFrom('trailers')
        .select(['id', 'name', 'registration_number', 'trailer_type', 'capacity_kg', 'axles', 'status'])
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('name', 'asc')
        .execute();

      const drivers = await trx.selectFrom('drivers')
        .select(['id', 'name', 'phone', 'license_number', 'license_expiry', 'status', 'assigned_vehicle_id', 'photo_url'])
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('name', 'asc')
        .execute();

      const locations = await trx.selectFrom('warehouse_locations')
        .select(['id', 'code', 'name', 'zone', 'capacity_units', 'active'])
        .where('tenant_id', '=', user.tenant_id)
        .where('active', '=', true)
        .orderBy('name', 'asc')
        .execute();

      return { vehicles, trailers, drivers, locations };
    });
  });

  // ── Manifests Management ─────────────────────────────────────

  fastify.get('/manifests', async (req) => {
    const user = req.user;
    const { vehicle_id } = req.query as { vehicle_id?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('cargo_manifests')
        .leftJoin('vehicles', 'vehicles.id', 'cargo_manifests.vehicle_id')
        .leftJoin('trailers', 'trailers.id', 'cargo_manifests.trailer_id')
        .leftJoin('warehouse_locations', 'warehouse_locations.id', 'cargo_manifests.location_id')
        .leftJoin('shipment_cases', 'shipment_cases.id', 'cargo_manifests.shipment_id')
        .leftJoin('freight_bookings', 'freight_bookings.id', 'cargo_manifests.booking_id')
        .leftJoin('delivery_documents', 'delivery_documents.id', 'cargo_manifests.release_doc_id')
        .leftJoin('trips', 'trips.id', 'cargo_manifests.trip_id')
        .leftJoin('drivers', 'drivers.id', 'trips.driver_id')
        .select([
          'cargo_manifests.id', 'cargo_manifests.name', 'cargo_manifests.container_length_cm',
          'cargo_manifests.container_width_cm', 'cargo_manifests.container_height_cm',
          'cargo_manifests.max_weight_kg', 'cargo_manifests.vehicle_id', 'cargo_manifests.trailer_id',
          'cargo_manifests.location_id', 'cargo_manifests.loading_bay', 'cargo_manifests.dock_number',
          'cargo_manifests.seal_number', 'cargo_manifests.secondary_seal_number',
          'cargo_manifests.stage', 'cargo_manifests.job_type', 'cargo_manifests.shipment_id',
          'cargo_manifests.booking_id', 'cargo_manifests.release_doc_id',
          'cargo_manifests.planner_name', 'cargo_manifests.loader_name', 'cargo_manifests.checker_name',
          'cargo_manifests.dispatcher_name', 'cargo_manifests.approved_by', 'cargo_manifests.approved_at',
          'cargo_manifests.loading_started_at', 'cargo_manifests.loading_completed_at',
          'cargo_manifests.dispatched_at', 'cargo_manifests.exceptions_acknowledged',
          'cargo_manifests.discrepancy_notes', 'cargo_manifests.damage_notes',
          'cargo_manifests.verification_checklist', 'cargo_manifests.origin',
          'cargo_manifests.destination', 'cargo_manifests.created_at',
          'cargo_manifests.status', 'cargo_manifests.trip_id',
          'vehicles.name as vehicle_name', 'vehicles.plate_number as vehicle_plate',
          'vehicles.make as vehicle_make', 'vehicles.model as vehicle_model', 'vehicles.photo_url as vehicle_photo_url',
          'trailers.name as trailer_name', 'trailers.registration_number as trailer_plate', 'trailers.trailer_type',
          'warehouse_locations.name as location_name', 'warehouse_locations.code as location_code',
          'shipment_cases.ref_number as shipment_ref',
          'freight_bookings.booking_number as booking_ref',
          'delivery_documents.doc_number as release_ref',
          'drivers.id as driver_id', 'drivers.name as driver_name', 'drivers.phone as driver_phone', 'drivers.license_number as driver_license'
        ])
        .where('cargo_manifests.tenant_id', '=', user.tenant_id);

      if (vehicle_id) q = q.where('cargo_manifests.vehicle_id', '=', vehicle_id);
      const rows = await q.orderBy('cargo_manifests.created_at', 'desc').execute();
      return rows.map(r => ({
        ...r,
        container_length_cm: Number(r.container_length_cm),
        container_width_cm: Number(r.container_width_cm),
        container_height_cm: Number(r.container_height_cm),
        max_weight_kg: Number(r.max_weight_kg),
      }));
    });
  });

  fastify.get('/manifests/:id', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const manifest = await trx.selectFrom('cargo_manifests')
        .leftJoin('vehicles', 'vehicles.id', 'cargo_manifests.vehicle_id')
        .leftJoin('trailers', 'trailers.id', 'cargo_manifests.trailer_id')
        .leftJoin('warehouse_locations', 'warehouse_locations.id', 'cargo_manifests.location_id')
        .leftJoin('shipment_cases', 'shipment_cases.id', 'cargo_manifests.shipment_id')
        .leftJoin('freight_bookings', 'freight_bookings.id', 'cargo_manifests.booking_id')
        .leftJoin('delivery_documents', 'delivery_documents.id', 'cargo_manifests.release_doc_id')
        .leftJoin('trips', 'trips.id', 'cargo_manifests.trip_id')
        .leftJoin('drivers', 'drivers.id', 'trips.driver_id')
        .select([
          'cargo_manifests.id', 'cargo_manifests.name', 'cargo_manifests.container_length_cm',
          'cargo_manifests.container_width_cm', 'cargo_manifests.container_height_cm',
          'cargo_manifests.max_weight_kg', 'cargo_manifests.vehicle_id', 'cargo_manifests.trailer_id',
          'cargo_manifests.location_id', 'cargo_manifests.loading_bay', 'cargo_manifests.dock_number',
          'cargo_manifests.seal_number', 'cargo_manifests.secondary_seal_number',
          'cargo_manifests.stage', 'cargo_manifests.job_type', 'cargo_manifests.shipment_id',
          'cargo_manifests.booking_id', 'cargo_manifests.release_doc_id',
          'cargo_manifests.planner_name', 'cargo_manifests.loader_name', 'cargo_manifests.checker_name',
          'cargo_manifests.dispatcher_name', 'cargo_manifests.approved_by', 'cargo_manifests.approved_at',
          'cargo_manifests.loading_started_at', 'cargo_manifests.loading_completed_at',
          'cargo_manifests.dispatched_at', 'cargo_manifests.exceptions_acknowledged',
          'cargo_manifests.discrepancy_notes', 'cargo_manifests.damage_notes',
          'cargo_manifests.verification_checklist', 'cargo_manifests.origin',
          'cargo_manifests.destination', 'cargo_manifests.created_at',
          'cargo_manifests.status', 'cargo_manifests.trip_id',
          'vehicles.name as vehicle_name', 'vehicles.plate_number as vehicle_plate',
          'vehicles.make as vehicle_make', 'vehicles.model as vehicle_model', 'vehicles.photo_url as vehicle_photo_url',
          'trailers.name as trailer_name', 'trailers.registration_number as trailer_plate', 'trailers.trailer_type',
          'warehouse_locations.name as location_name', 'warehouse_locations.code as location_code',
          'shipment_cases.ref_number as shipment_ref',
          'freight_bookings.booking_number as booking_ref',
          'delivery_documents.doc_number as release_ref',
          'drivers.id as driver_id', 'drivers.name as driver_name', 'drivers.phone as driver_phone', 'drivers.license_number as driver_license'
        ])
        .where('cargo_manifests.id', '=', id)
        .where('cargo_manifests.tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      if (!manifest) return reply.status(404).send({ error: 'Manifest not found' });

      const items = await trx.selectFrom('cargo_items')
        .selectAll()
        .where('manifest_id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'asc')
        .execute();

      return {
        ...manifest,
        container_length_cm: Number(manifest.container_length_cm),
        container_width_cm: Number(manifest.container_width_cm),
        container_height_cm: Number(manifest.container_height_cm),
        max_weight_kg: Number(manifest.max_weight_kg),
        items: items.map(it => ({
          ...it,
          length_cm: Number(it.length_cm),
          width_cm: Number(it.width_cm),
          height_cm: Number(it.height_cm),
          weight_kg: Number(it.weight_kg),
          quantity: Number(it.quantity),
          loaded_quantity: Number(it.loaded_quantity),
          damaged_quantity: Number(it.damaged_quantity),
        })),
      };
    });
  });

  fastify.post('/manifests', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = req.body as {
      name: string;
      stage?: CargoManifestStage;
      job_type?: string;
      shipment_id?: string;
      booking_id?: string;
      release_doc_id?: string;
      vehicle_id?: string;
      trailer_id?: string;
      location_id?: string;
      loading_bay?: string;
      dock_number?: string;
      seal_number?: string;
      secondary_seal_number?: string;
      planner_name?: string;
      origin?: string;
      destination?: string;
      container_length_cm: number;
      container_width_cm: number;
      container_height_cm: number;
      max_weight_kg: number;
    };

    return withTenant(user.tenant_id, async (trx) => {
      const inserted = await trx.insertInto('cargo_manifests').values({
        tenant_id: user.tenant_id,
        name: body.name,
        stage: body.stage || 'JOB_SELECTION',
        status: 'DRAFT',
        job_type: body.job_type || 'SHIPMENT',
        shipment_id: body.shipment_id || null,
        booking_id: body.booking_id || null,
        release_doc_id: body.release_doc_id || null,
        vehicle_id: body.vehicle_id || null,
        trailer_id: body.trailer_id || null,
        location_id: body.location_id || null,
        loading_bay: body.loading_bay || null,
        dock_number: body.dock_number || null,
        seal_number: body.seal_number || null,
        secondary_seal_number: body.secondary_seal_number || null,
        planner_name: body.planner_name || user.email || 'Load Planner',
        origin: body.origin || null,
        destination: body.destination || null,
        container_length_cm: body.container_length_cm,
        container_width_cm: body.container_width_cm,
        container_height_cm: body.container_height_cm,
        max_weight_kg: body.max_weight_kg,
        created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow();

      return inserted;
    });
  });

  fastify.patch('/manifests/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as any;

    return withTenant(user.tenant_id, async (trx) => {
      const existing = await lockManifest(trx, user.tenant_id, id, ['DRAFT', 'PLANNED']);
      let q = trx.updateTable('cargo_manifests').where('id', '=', id).where('tenant_id', '=', user.tenant_id);

      if (body.name !== undefined) q = q.set({ name: body.name });
      if (body.stage !== undefined) q = q.set({ stage: body.stage });
      if (body.job_type !== undefined) q = q.set({ job_type: body.job_type });
      if (body.shipment_id !== undefined) q = q.set({ shipment_id: body.shipment_id || null });
      if (body.booking_id !== undefined) q = q.set({ booking_id: body.booking_id || null });
      if (body.release_doc_id !== undefined) q = q.set({ release_doc_id: body.release_doc_id || null });
      if (body.vehicle_id !== undefined) q = q.set({ vehicle_id: body.vehicle_id || null });
      if (body.trailer_id !== undefined) q = q.set({ trailer_id: body.trailer_id || null });
      if (body.location_id !== undefined) q = q.set({ location_id: body.location_id || null });
      if (body.loading_bay !== undefined) q = q.set({ loading_bay: body.loading_bay || null });
      if (body.dock_number !== undefined) q = q.set({ dock_number: body.dock_number || null });
      if (body.seal_number !== undefined) q = q.set({ seal_number: body.seal_number || null });
      if (body.secondary_seal_number !== undefined) q = q.set({ secondary_seal_number: body.secondary_seal_number || null });
      if (body.planner_name !== undefined) q = q.set({ planner_name: body.planner_name || null });
      if (body.origin !== undefined) q = q.set({ origin: body.origin || null });
      if (body.destination !== undefined) q = q.set({ destination: body.destination || null });
      if (body.container_length_cm !== undefined) q = q.set({ container_length_cm: body.container_length_cm });
      if (body.container_width_cm !== undefined) q = q.set({ container_width_cm: body.container_width_cm });
      if (body.container_height_cm !== undefined) q = q.set({ container_height_cm: body.container_height_cm });
      if (body.max_weight_kg !== undefined) q = q.set({ max_weight_kg: body.max_weight_kg });

      // If dimensions or vehicle change on a planned manifest, reset status to DRAFT and clear placements
      const dimensionsChanged = ['container_length_cm', 'container_width_cm', 'container_height_cm', 'max_weight_kg', 'vehicle_id']
        .some(key => body[key] !== undefined);

      if (dimensionsChanged) {
        if (existing.status === 'PLANNED') {
          q = q.set({ status: 'DRAFT' });
        }
        await trx.updateTable('cargo_items')
          .set({ placements: JSON.stringify([]) as any })
          .where('manifest_id', '=', id)
          .where('tenant_id', '=', user.tenant_id)
          .execute();
      }

      const updated = await q.returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Manifest not found' });
      return updated;
    });
  });

  // ── Stage 4: Load Approval ───────────────────────────────────

  fastify.post('/manifests/:id/approve', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const manifest = await lockManifest(trx, user.tenant_id, id, ['DRAFT', 'PLANNED']);
      const items = await trx.selectFrom('cargo_items').selectAll().where('manifest_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

      if (!items.length) {
        return reply.status(409).send({ error: 'Add cargo handling units before approving the load plan.' });
      }

      const totalWeight = items.reduce((sum, item) => sum + Number(item.weight_kg) * item.quantity, 0);
      if (totalWeight > Number(manifest.max_weight_kg)) {
        return reply.status(422).send({
          error: `Cargo weight (${totalWeight.toLocaleString()} kg) exceeds vehicle payload limit (${Number(manifest.max_weight_kg).toLocaleString()} kg). Reduce load before approving.`,
        });
      }

      const updated = await trx.updateTable('cargo_manifests')
        .set({
          status: 'APPROVED',
          stage: 'LOAD_VERIFICATION',
          approved_by: user.email || user.sub,
          approved_at: new Date(),
        })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirst();

      return updated;
    });
  });

  // Backward-compatibility status endpoint
  fastify.patch('/manifests/:id/status', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };

    if (status !== 'APPROVED') return reply.status(400).send({ error: 'Use dedicated workflow endpoints to advance stages.' });
    return withTenant(user.tenant_id, async (trx) => {
      const manifest = await lockManifest(trx, user.tenant_id, id, ['DRAFT', 'PLANNED']);
      const items = await trx.selectFrom('cargo_items').selectAll().where('manifest_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      if (!items.length) return reply.status(409).send({ error: 'Add cargo handling units before approving.' });

      const updated = await trx.updateTable('cargo_manifests')
        .set({
          status: 'APPROVED',
          stage: 'LOAD_VERIFICATION',
          approved_by: user.email || user.sub,
          approved_at: new Date(),
        })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirst();
      return updated;
    });
  });

  // ── Stage 5: Load & Verify ───────────────────────────────────

  fastify.post('/manifests/:id/start-loading', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { loader_name } = (req.body || {}) as { loader_name?: string };

    return withTenant(user.tenant_id, async (trx) => {
      const manifest = await trx.selectFrom('cargo_manifests')
        .selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).forUpdate().executeTakeFirst();
      if (!manifest) return reply.status(404).send({ error: 'Manifest not found' });
      if (!['APPROVED', 'PLANNED'].includes(manifest.status)) {
        return reply.status(409).send({ error: 'Plan must be approved before physical loading can commence.' });
      }

      const updated = await trx.updateTable('cargo_manifests')
        .set({
          status: 'LOADING',
          stage: 'LOAD_VERIFICATION',
          loading_started_at: manifest.loading_started_at || new Date(),
          loader_name: loader_name || manifest.loader_name || user.email || 'Loading Crew',
        })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirst();

      return updated;
    });
  });

  fastify.post('/manifests/:id/verify-load', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as {
      items?: Array<{
        id: string;
        loaded_quantity: number;
        damaged_quantity?: number;
        damage_description?: string;
      }>;
      seal_number?: string;
      secondary_seal_number?: string;
      loader_name?: string;
      checker_name?: string;
      exceptions_acknowledged?: boolean;
      damage_notes?: string;
      discrepancy_notes?: string;
      verification_checklist?: Record<string, boolean>;
    };

    return withTenant(user.tenant_id, async (trx) => {
      const manifest = await trx.selectFrom('cargo_manifests')
        .selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).forUpdate().executeTakeFirst();
      if (!manifest) return reply.status(404).send({ error: 'Manifest not found' });

      if (!['APPROVED', 'LOADING', 'LOADED'].includes(manifest.status)) {
        return reply.status(409).send({ error: 'Manifest must be approved or in loading before verification.' });
      }

      const sealNumber = body.seal_number || manifest.seal_number;
      if (!sealNumber || !sealNumber.trim()) {
        return reply.status(422).send({ error: 'High-security seal number is required before finalizing load verification.' });
      }

      const currentItems = await trx.selectFrom('cargo_items')
        .selectAll().where('manifest_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

      let hasDiscrepancy = false;
      if (Array.isArray(body.items)) {
        for (const update of body.items) {
          const item = currentItems.find(it => it.id === update.id);
          if (!item) continue;
          const loadedQty = Math.max(0, Number(update.loaded_quantity) || 0);
          const damagedQty = Math.max(0, Number(update.damaged_quantity) || 0);

          if (loadedQty < item.quantity || damagedQty > 0) {
            hasDiscrepancy = true;
          }

          await trx.updateTable('cargo_items')
            .set({
              loaded_quantity: loadedQty,
              damaged_quantity: damagedQty,
              damage_description: update.damage_description || null,
            })
            .where('id', '=', update.id)
            .where('tenant_id', '=', user.tenant_id)
            .execute();
        }
      }

      if (hasDiscrepancy && !body.exceptions_acknowledged) {
        return reply.status(422).send({
          error: 'Shortages or damages recorded on handling units. Explicit exception acknowledgment is required before finalizing physical verification.',
        });
      }

      const updated = await trx.updateTable('cargo_manifests')
        .set({
          status: 'LOADED',
          stage: 'DISPATCH',
          loading_completed_at: new Date(),
          seal_number: sealNumber.trim(),
          secondary_seal_number: body.secondary_seal_number ? body.secondary_seal_number.trim() : manifest.secondary_seal_number,
          loader_name: body.loader_name || manifest.loader_name || 'Loading Bay Crew',
          checker_name: body.checker_name || manifest.checker_name || user.email || 'Dock Supervisor',
          exceptions_acknowledged: Boolean(body.exceptions_acknowledged),
          damage_notes: body.damage_notes ?? manifest.damage_notes,
          discrepancy_notes: body.discrepancy_notes ?? manifest.discrepancy_notes,
          verification_checklist: (body.verification_checklist ?? manifest.verification_checklist) as any,
        })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirst();

      return updated;
    });
  });

  // ── Stage 6: Traceable Dispatch ──────────────────────────────

  fastify.post('/manifests/:id/dispatch', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { vehicle_id: bodyVehicleId, driver_id, dock_number, seal_number, dispatcher_name, notes } = req.body as {
      vehicle_id?: string;
      driver_id?: string;
      dock_number?: string;
      seal_number?: string;
      dispatcher_name?: string;
      notes?: string;
    };

    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('cargo_manifests')
        .selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).forUpdate().executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Manifest not found' });

      if (existing.status === 'DISPATCHED') {
        return reply.status(409).send({ error: 'This manifest has already been dispatched.' });
      }

      if (!['LOADED', 'APPROVED'].includes(existing.status)) {
        return reply.status(409).send({ error: 'Complete physical load verification before dispatch.' });
      }

      const effectiveVehicleId = bodyVehicleId || existing.vehicle_id;
      if (!effectiveVehicleId) return reply.status(400).send({ error: 'Assign an operational vehicle before dispatch.' });

      await trx.selectFrom('vehicles').select('id').where('id', '=', effectiveVehicleId).where('tenant_id', '=', user.tenant_id).forUpdate().executeTakeFirst();
      const blocker = await assertDispatchable(trx, user.tenant_id, effectiveVehicleId, null);
      if (blocker) return reply.status(409).send({ error: blocker });

      if (!existing.origin || !existing.destination) {
        return reply.status(400).send({ error: 'Set the origin and destination before dispatch.' });
      }

      const cargo = await trx.selectFrom('cargo_items')
        .selectAll().where('manifest_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

      const tripNoteParts = [];
      if (notes) tripNoteParts.push(notes);
      if (dock_number || existing.dock_number) tripNoteParts.push(`Dock: ${dock_number || existing.dock_number}`);
      const effectiveSeal = seal_number || existing.seal_number;
      if (effectiveSeal) tripNoteParts.push(`Seal: ${effectiveSeal}`);
      const tripNotes = tripNoteParts.length ? tripNoteParts.join(' · ') : null;

      // Duplicate-safe trip handling: reuse existing trip if already linked
      let tripId = existing.trip_id;
      if (tripId) {
        await trx.updateTable('trips')
          .set({
            vehicle_id: effectiveVehicleId,
            driver_id: driver_id || null,
            cargo_weight_kg: cargo.reduce((sum, item) => sum + Number(item.weight_kg) * (item.loaded_quantity || item.quantity), 0),
            cargo_desc: existing.name,
            notes: tripNotes,
            status: 'IN_PROGRESS',
            actual_start: new Date(),
          } as any)
          .where('id', '=', tripId)
          .where('tenant_id', '=', user.tenant_id)
          .execute();
      } else {
        const newTrip = await trx.insertInto('trips').values({
          tenant_id: user.tenant_id,
          vehicle_id: effectiveVehicleId,
          driver_id: driver_id || null,
          origin: existing.origin,
          destination: existing.destination,
          shipment_id: existing.shipment_id,
          cargo_weight_kg: cargo.reduce((sum, item) => sum + Number(item.weight_kg) * (item.loaded_quantity || item.quantity), 0),
          cargo_desc: existing.name,
          status: 'IN_PROGRESS',
          actual_start: new Date(),
          notes: tripNotes,
          created_by: user.sub,
        } as any).returning('id').executeTakeFirstOrThrow();
        tripId = newTrip.id;
      }

      if (driver_id) {
        await trx.updateTable('drivers')
          .set({ assigned_vehicle_id: effectiveVehicleId } as any)
          .where('id', '=', driver_id)
          .where('tenant_id', '=', user.tenant_id)
          .execute();
      }

      // Update vehicle status to ON_ROUTE
      try {
        await trx.updateTable('vehicles')
          .set({ status: 'ON_ROUTE' } as any)
          .where('id', '=', effectiveVehicleId)
          .where('tenant_id', '=', user.tenant_id)
          .execute();
      } catch {
        // Status column may have restricted enum in some schemas
      }

      const manifest = await trx.updateTable('cargo_manifests')
        .set({
          status: 'DISPATCHED',
          stage: 'DISPATCH',
          vehicle_id: effectiveVehicleId,
          trip_id: tripId,
          dispatched_at: new Date(),
          dispatcher_name: dispatcher_name || user.email || 'Fleet Dispatcher',
          seal_number: effectiveSeal || existing.seal_number,
          dock_number: dock_number || existing.dock_number,
        })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirst();

      if (!manifest) return reply.status(404).send({ error: 'Manifest not found' });
      return { ...manifest, trip_id: tripId, driver_id, dock_number, seal_number: effectiveSeal };
    });
  });

  // ── Import Handling Units from Selected Job ──────────────────

  fastify.post('/manifests/:id/import-job', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { job_type, job_id } = req.body as { job_type: 'SHIPMENT' | 'BOOKING' | 'RELEASE'; job_id: string };

    return withTenant(user.tenant_id, async (trx) => {
      await lockManifest(trx, user.tenant_id, id, ['DRAFT', 'PLANNED']);
      const colors = ['#0891b2', '#f97316', '#8b5cf6', '#10b981', '#ef4444', '#eab308'];
      const newItems = [];

      if (job_type === 'SHIPMENT') {
        const shipment = await trx.selectFrom('shipment_cases').selectAll()
          .where('id', '=', job_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

        const containers = (shipment.containers as any) || [];
        if (Array.isArray(containers) && containers.length > 0) {
          for (let i = 0; i < containers.length; i++) {
            const c = containers[i];
            const item = await trx.insertInto('cargo_items').values({
              tenant_id: user.tenant_id,
              manifest_id: id,
              label: c.container_number || `${shipment.ref_number} Container ${i + 1}`,
              unit_type: 'PALLET',
              length_cm: Number(c.length_cm) || 120,
              width_cm: Number(c.width_cm) || 80,
              height_cm: Number(c.height_cm) || 100,
              weight_kg: Number(c.weight_kg) || 500,
              quantity: 1,
              loaded_quantity: 0,
              source_ref: shipment.ref_number,
              color: colors[i % colors.length],
            }).returningAll().executeTakeFirstOrThrow();
            newItems.push(item);
          }
        } else {
          // Fallback handling unit from shipment summary
          const item = await trx.insertInto('cargo_items').values({
            tenant_id: user.tenant_id,
            manifest_id: id,
            label: `${shipment.ref_number} · ${shipment.goods_desc?.slice(0, 40) || 'General Cargo'}`,
            unit_type: 'PALLET',
            length_cm: 120,
            width_cm: 80,
            height_cm: 120,
            weight_kg: Number(shipment.gross_weight_kg) || 850,
            quantity: 1,
            loaded_quantity: 0,
            source_ref: shipment.ref_number,
            color: colors[0],
          }).returningAll().executeTakeFirstOrThrow();
          newItems.push(item);
        }

        await trx.updateTable('cargo_manifests')
          .set({
            shipment_id: job_id,
            job_type: 'SHIPMENT',
            origin: shipment.origin_port || undefined,
            destination: shipment.dest_port || undefined,
          })
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      } else if (job_type === 'BOOKING') {
        const booking = await trx.selectFrom('freight_bookings').selectAll()
          .where('id', '=', job_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!booking) return reply.status(404).send({ error: 'Freight booking not found' });

        const qty = Math.max(1, Number(booking.quantity) || 1);
        const item = await trx.insertInto('cargo_items').values({
          tenant_id: user.tenant_id,
          manifest_id: id,
          label: `${booking.booking_number} · ${booking.cargo_desc?.slice(0, 40) || 'Freight Consignment'}`,
          unit_type: 'CRATE',
          length_cm: 120,
          width_cm: 100,
          height_cm: 110,
          weight_kg: 650,
          quantity: qty,
          loaded_quantity: 0,
          source_ref: booking.booking_number,
          color: colors[1],
        }).returningAll().executeTakeFirstOrThrow();
        newItems.push(item);

        await trx.updateTable('cargo_manifests')
          .set({
            booking_id: job_id,
            job_type: 'BOOKING',
            origin: booking.origin_port || undefined,
            destination: booking.destination_port || undefined,
          })
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      } else if (job_type === 'RELEASE') {
        const release = await trx.selectFrom('delivery_documents').selectAll()
          .where('id', '=', job_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!release) return reply.status(404).send({ error: 'Release document not found' });

        const containers = (release.containers as any) || [];
        if (Array.isArray(containers) && containers.length > 0) {
          for (let i = 0; i < containers.length; i++) {
            const c = containers[i];
            const item = await trx.insertInto('cargo_items').values({
              tenant_id: user.tenant_id,
              manifest_id: id,
              label: c.container_number || `${release.doc_number} Lot ${i + 1}`,
              unit_type: 'PALLET',
              length_cm: Number(c.length_cm) || 120,
              width_cm: Number(c.width_cm) || 80,
              height_cm: Number(c.height_cm) || 100,
              weight_kg: Number(c.weight_kg) || 450,
              quantity: 1,
              loaded_quantity: 0,
              source_ref: release.doc_number || undefined,
              color: colors[i % colors.length],
            }).returningAll().executeTakeFirstOrThrow();
            newItems.push(item);
          }
        } else {
          const item = await trx.insertInto('cargo_items').values({
            tenant_id: user.tenant_id,
            manifest_id: id,
            label: `${release.doc_number || 'REL'} · Warehouse Release Lot`,
            unit_type: 'PALLET',
            length_cm: 120,
            width_cm: 80,
            height_cm: 110,
            weight_kg: 500,
            quantity: 1,
            loaded_quantity: 0,
            source_ref: release.doc_number || undefined,
            color: colors[2],
          }).returningAll().executeTakeFirstOrThrow();
          newItems.push(item);
        }

        await trx.updateTable('cargo_manifests')
          .set({
            release_doc_id: job_id,
            job_type: 'RELEASE',
            destination: release.delivery_address || undefined,
          })
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      }

      return { items: newItems };
    });
  });

  fastify.post('/manifests/:id/import-shipment', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { shipment_id } = req.body as { shipment_id: string };

    return withTenant(user.tenant_id, async (trx) => {
      await lockManifest(trx, user.tenant_id, id, ['DRAFT', 'PLANNED']);
      const shipment = await trx.selectFrom('shipment_cases').selectAll()
        .where('id', '=', shipment_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      const containers = (shipment.containers as any) || [];
      const newItems = [];
      const colors = ['#0891b2', '#f97316', '#8b5cf6', '#10b981', '#ef4444', '#eab308'];

      if (Array.isArray(containers) && containers.length > 0) {
        for (let i = 0; i < containers.length; i++) {
          const c = containers[i];
          const item = await trx.insertInto('cargo_items').values({
            tenant_id: user.tenant_id,
            manifest_id: id,
            label: c.container_number || `Cargo Lot ${i + 1}`,
            length_cm: Number(c.length_cm) || 120,
            width_cm: Number(c.width_cm) || 80,
            height_cm: Number(c.height_cm) || 100,
            weight_kg: Number(c.weight_kg) || 450,
            quantity: 1,
            loaded_quantity: 0,
            color: colors[i % colors.length],
          }).returningAll().executeTakeFirstOrThrow();
          newItems.push(item);
        }
      }

      await trx.updateTable('cargo_manifests').set({ shipment_id }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return { items: newItems };
    });
  });

  fastify.delete('/manifests/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) => {
      await lockManifest(trx, user.tenant_id, id, ['DRAFT', 'PLANNED']);
      await trx.deleteFrom('cargo_manifests').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
    });
    return { ok: true };
  });

  // ── Handling Unit Items ──────────────────────────────────────

  fastify.get('/manifests/:id/items', async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('cargo_items').selectAll()
        .where('manifest_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at').execute();
      return rows.map(r => ({
        ...r,
        length_cm: Number(r.length_cm),
        width_cm: Number(r.width_cm),
        height_cm: Number(r.height_cm),
        weight_kg: Number(r.weight_kg),
        quantity: Number(r.quantity),
        loaded_quantity: Number(r.loaded_quantity),
        damaged_quantity: Number(r.damaged_quantity),
      }));
    });
  });

  fastify.post('/manifests/:id/items', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as {
      label: string;
      unit_type?: string;
      length_cm: number;
      width_cm: number;
      height_cm: number;
      weight_kg: number;
      quantity?: number;
      stacking_max?: number;
      is_fragile?: boolean;
      handling_instructions?: string;
      source_ref?: string;
      color?: string;
    };

    return withTenant(user.tenant_id, async (trx) => {
      await lockManifest(trx, user.tenant_id, id, ['DRAFT', 'PLANNED']);
      return trx.insertInto('cargo_items').values({
        tenant_id: user.tenant_id,
        manifest_id: id,
        label: body.label,
        unit_type: body.unit_type || 'PALLET',
        length_cm: body.length_cm,
        width_cm: body.width_cm,
        height_cm: body.height_cm,
        weight_kg: body.weight_kg,
        quantity: body.quantity ?? 1,
        loaded_quantity: 0,
        damaged_quantity: 0,
        stacking_max: body.stacking_max ?? 2,
        is_fragile: Boolean(body.is_fragile),
        handling_instructions: body.handling_instructions || null,
        source_ref: body.source_ref || null,
        color: body.color ?? '#0891b2',
      } as any).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/manifests/:id/items/:itemId', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id, itemId } = req.params as { id: string; itemId: string };
    const body = req.body as any;

    return withTenant(user.tenant_id, async (trx) => {
      await lockManifest(trx, user.tenant_id, id, ['DRAFT', 'PLANNED', 'APPROVED', 'LOADING', 'LOADED']);
      let q = trx.updateTable('cargo_items').where('id', '=', itemId).where('manifest_id', '=', id).where('tenant_id', '=', user.tenant_id);

      if (body.label !== undefined) q = q.set({ label: body.label });
      if (body.unit_type !== undefined) q = q.set({ unit_type: body.unit_type });
      if (body.length_cm !== undefined) q = q.set({ length_cm: body.length_cm });
      if (body.width_cm !== undefined) q = q.set({ width_cm: body.width_cm });
      if (body.height_cm !== undefined) q = q.set({ height_cm: body.height_cm });
      if (body.weight_kg !== undefined) q = q.set({ weight_kg: body.weight_kg });
      if (body.quantity !== undefined) q = q.set({ quantity: body.quantity });
      if (body.loaded_quantity !== undefined) q = q.set({ loaded_quantity: body.loaded_quantity });
      if (body.damaged_quantity !== undefined) q = q.set({ damaged_quantity: body.damaged_quantity });
      if (body.damage_description !== undefined) q = q.set({ damage_description: body.damage_description });
      if (body.stacking_max !== undefined) q = q.set({ stacking_max: body.stacking_max });
      if (body.is_fragile !== undefined) q = q.set({ is_fragile: body.is_fragile });
      if (body.handling_instructions !== undefined) q = q.set({ handling_instructions: body.handling_instructions });
      if (body.color !== undefined) q = q.set({ color: body.color });

      const updated = await q.returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Cargo item not found' });
      return updated;
    });
  });

  fastify.delete('/items/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) => {
      const item = await trx.selectFrom('cargo_items').select('manifest_id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirstOrThrow();
      await lockManifest(trx, user.tenant_id, item.manifest_id, ['DRAFT', 'PLANNED']);
      await trx.deleteFrom('cargo_items').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
    });
    return { ok: true };
  });

  fastify.patch('/items/:id/placement', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { placements } = req.body as { placements: any[] };
    return withTenant(user.tenant_id, async (trx) => {
      const item = await trx.selectFrom('cargo_items').select('manifest_id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!item) return reply.status(404).send({ error: 'Item not found' });
      await lockManifest(trx, user.tenant_id, item.manifest_id, ['DRAFT', 'PLANNED']);
      const updated = await trx.updateTable('cargo_items').set({ placements: JSON.stringify(placements) as any }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirst();
      return updated;
    });
  });

  // ── Extreme-Point 3D Packing Heuristic ───────────────────────

  fastify.post('/manifests/:id/pack', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const manifest = await lockManifest(trx, user.tenant_id, id, ['DRAFT', 'PLANNED']);

      const items = await trx.selectFrom('cargo_items').selectAll()
        .where('manifest_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      if (items.reduce((sum, item) => sum + item.quantity, 0) > 2000) {
        return reply.status(422).send({ error: 'A packing run supports at most 2,000 units. Split this load into smaller plans.' });
      }

      const container: Dims = {
        l: Number(manifest.container_length_cm),
        w: Number(manifest.container_width_cm),
        h: Number(manifest.container_height_cm),
      };

      const units: Unit[] = [];
      items.forEach((it, itemIndex) => {
        for (let i = 0; i < it.quantity; i++) {
          units.push({
            itemIndex,
            label: it.label,
            dims: { l: Number(it.length_cm), w: Number(it.width_cm), h: Number(it.height_cm) },
            weight: Number(it.weight_kg),
          });
        }
      });

      const { placed, unplacedIndices, totalWeight } = packItems(container, Number(manifest.max_weight_kg), units);

      // Group placements back per cargo_items row (container-space cm, box center)
      const placementsByItem = new Map<number, { x: number; y: number; z: number }[]>();
      for (const p of placed) {
        const centered = {
          x: p.pos.x + p.dims.l / 2,
          y: p.pos.y + p.dims.w / 2,
          z: p.pos.z + p.dims.h / 2,
        };
        const arr = placementsByItem.get(p.itemIndex) ?? [];
        arr.push(centered);
        placementsByItem.set(p.itemIndex, arr);
      }

      const updatedItems = [];
      for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        const it = items[itemIndex];
        const placements = placementsByItem.get(itemIndex) ?? [];
        const updated = await trx.updateTable('cargo_items')
          .set({ placements: JSON.stringify(placements) } as any)
          .where('id', '=', it.id).where('tenant_id', '=', user.tenant_id)
          .returningAll().executeTakeFirstOrThrow();
        updatedItems.push(updated);
      }

      // Automatically update manifest stage to LOAD_PLANNING and status to PLANNED if all packed
      const allPacked = unplacedIndices.length === 0;
      await trx.updateTable('cargo_manifests')
        .set({
          stage: 'LOAD_PLANNING',
          status: allPacked ? 'PLANNED' : 'DRAFT',
        })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .execute();

      const containerVolume = container.l * container.w * container.h;
      const placedVolume = placed.reduce((s, p) => s + p.dims.l * p.dims.w * p.dims.h, 0);
      const unplacedByItem = new Map<number, number>();
      for (const idx of unplacedIndices) unplacedByItem.set(idx, (unplacedByItem.get(idx) ?? 0) + 1);

      return {
        items: updatedItems,
        volume_utilization_pct: containerVolume > 0 ? Math.round((placedVolume / containerVolume) * 1000) / 10 : 0,
        weight_utilization_pct: Number(manifest.max_weight_kg) > 0 ? Math.round((totalWeight / Number(manifest.max_weight_kg)) * 1000) / 10 : 0,
        unplaced_items: [...unplacedByItem.entries()].map(([itemIndex, count]) => ({
          label: items[itemIndex].label,
          count,
        })),
      };
    });
  });
}
