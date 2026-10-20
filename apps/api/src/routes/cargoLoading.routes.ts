import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { assertDispatchable } from './fleetOps.routes.js';
import { z } from 'zod';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

const FLEET_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR'] as const;

async function lockDraft(trx: Transaction<Database>, tenantId: string, id: string) {
  const manifest = await trx.selectFrom('cargo_manifests').selectAll().where('id', '=', id).where('tenant_id', '=', tenantId).forUpdate().executeTakeFirst();
  if (!manifest) throw Object.assign(new Error('Manifest not found'), { statusCode: 404 });
  if (manifest.status !== 'DRAFT') throw Object.assign(new Error('Only draft plans can be changed'), { statusCode: 409 });
  return manifest;
}

// ── Extreme-point 3D bin-packing heuristic ─────────────────────────────
// No rotation (boxes keep their given L/W/H orientation). Candidate corner
// points start at the container origin; each placed box contributes up to
// three new candidate corners (its far X/Y/Z faces). Items are packed
// largest-volume-first (a standard first-fit-decreasing approach) and
// candidates are tried lowest-and-most-forward-first so the result stacks
// low and doesn't leave the top/back of the container full while the
// front/floor is empty.

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
  // HUD-0024/0031: mutations already require FLEET_ROLES; GET /manifests and
  // its children had no check at all beyond entitlement.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  // Validate foreign references before a write, even when RLS protects the target table.
  fastify.addHook('preHandler', async (request, reply) => {
    if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) return;
    await requireRole(...FLEET_ROLES)(request, reply);
    if (reply.sent) return;
    const path = request.routeOptions.url || '';
    const body = (request.body || {}) as Record<string, unknown>;
    const positive = z.number().finite().min(0.1).max(1000000);
    const dimensions = z.object({ container_length_cm: positive, container_width_cm: positive, container_height_cm: positive, max_weight_kg: positive });
    let schema: z.ZodTypeAny | undefined;
    if (path.endsWith('/manifests') && request.method === 'POST') schema = dimensions.extend({ name: z.string().trim().min(1).max(200) });
    if (path.endsWith('/manifests/:id/items') && request.method === 'POST') schema = z.object({ label: z.string().trim().min(1).max(200), length_cm: positive, width_cm: positive, height_cm: positive, weight_kg: positive, quantity: z.number().int().min(1).max(10000).optional() });
    if (path.endsWith('/manifests/:id') && request.method === 'PATCH') schema = dimensions.partial();
    if (schema && !schema.safeParse(body).success) return reply.status(400).send({ error: 'Enter valid names, positive measurements and whole quantities.' });
    const tenantId = request.user.tenant_id;
    return withTenant(tenantId, async trx => {
      for (const [field, table] of [['vehicle_id', 'vehicles'], ['shipment_id', 'shipment_cases']] as const) {
        if (body[field] == null || body[field] === '') continue;
        if (!z.string().uuid().safeParse(body[field]).success) return reply.status(400).send({ error: `Invalid ${field}` });
        const row = await trx.selectFrom(table).select('id').where('id', '=', body[field] as string).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!row) return reply.status(404).send({ error: `${field} not found` });
      }
      const { id } = request.params as { id?: string };
      if (!id) return;
      let manifestId = id;
      if (path.endsWith('/items/:id')) {
        const item = await trx.selectFrom('cargo_items').select('manifest_id').where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!item) return reply.status(404).send({ error: 'Cargo item not found' });
        manifestId = item.manifest_id;
      }
      const manifest = await trx.selectFrom('cargo_manifests').selectAll().where('id', '=', manifestId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!manifest) return reply.status(404).send({ error: 'Manifest not found' });
      if (path.endsWith('/dispatch')) {
        if (manifest.status !== 'APPROVED') return reply.status(409).send({ error: 'Approve the load plan before dispatch.' });
        if (!body.vehicle_id) return reply.status(400).send({ error: 'Select a vehicle.' });
      } else if (manifest.status !== 'DRAFT') return reply.status(409).send({ error: 'Only draft plans can be changed.' });
    });
  });

  // ── Manifests ────────────────────────────────────────────────

  fastify.get('/manifests', async (req) => {
    const user = req.user;
    const { vehicle_id } = req.query as { vehicle_id?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('cargo_manifests' as any)
        .leftJoin('vehicles', 'vehicles.id', 'cargo_manifests.vehicle_id')
        .leftJoin('shipment_cases', 'shipment_cases.id', 'cargo_manifests.shipment_id')
        .select([
          'cargo_manifests.id', 'cargo_manifests.name', 'cargo_manifests.container_length_cm',
          'cargo_manifests.container_width_cm', 'cargo_manifests.container_height_cm',
          'cargo_manifests.max_weight_kg', 'cargo_manifests.vehicle_id', 'cargo_manifests.shipment_id',
          'cargo_manifests.origin', 'cargo_manifests.destination', 'cargo_manifests.created_at',
          'cargo_manifests.status',
          'vehicles.name as vehicle_name', 'vehicles.plate_number as vehicle_plate',
          'shipment_cases.ref_number as shipment_ref'
        ])
        .where('cargo_manifests.tenant_id', '=', user.tenant_id);
      if (vehicle_id) q = q.where('cargo_manifests.vehicle_id', '=', vehicle_id);
      const rows = await q.orderBy('cargo_manifests.created_at', 'desc').execute();
      // Postgres NUMERIC columns come back as strings — coerce for the 3D
      // scene's arithmetic and the header's .toLocaleString() call.
      return rows.map(r => ({
        ...r,
        container_length_cm: Number(r.container_length_cm),
        container_width_cm: Number(r.container_width_cm),
        container_height_cm: Number(r.container_height_cm),
        max_weight_kg: Number(r.max_weight_kg),
      }));
    });
  });

  fastify.post('/manifests', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = req.body as {
      name: string; vehicle_id?: string; shipment_id?: string; origin?: string; destination?: string;
      container_length_cm: number; container_width_cm: number; container_height_cm: number;
      max_weight_kg: number;
    };
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('cargo_manifests' as any).values({
        tenant_id: user.tenant_id, name: body.name,
        vehicle_id: body.vehicle_id ?? null, shipment_id: body.shipment_id ?? null,
        origin: body.origin ?? null, destination: body.destination ?? null,
        container_length_cm: body.container_length_cm, container_width_cm: body.container_width_cm,
        container_height_cm: body.container_height_cm, max_weight_kg: body.max_weight_kg,
        created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  // HUD-0097: none of the four routes below checked the manifest existed
  // before updating/using it — a wrong/stale id fell straight through to
  // executeTakeFirstOrThrow()'s "no result" (or, for import-shipment, a bare
  // thrown Error), both of which the global error handler in index.ts
  // cannot turn into a clean 404 since neither is a real Postgres driver
  // error. Same pattern already found and fixed in consignments.routes.ts
  // (HUD-0089), seal-equipment.routes.ts (HUD-0092) and
  // seal-automation.routes.ts (HUD-0094) — reusing the exact same
  // "check first, 404 on a falsy result" fix here.
  fastify.patch('/manifests/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as any;

    return withTenant(user.tenant_id, async (trx) => {
      await lockDraft(trx, user.tenant_id, id);
      let q = trx.updateTable('cargo_manifests' as any).where('id', '=', id).where('tenant_id', '=', user.tenant_id);
      if (body.name !== undefined) q = q.set({ name: body.name });
      if (body.vehicle_id !== undefined) q = q.set({ vehicle_id: body.vehicle_id || null });
      if (body.shipment_id !== undefined) q = q.set({ shipment_id: body.shipment_id || null });
      if (body.origin !== undefined) q = q.set({ origin: body.origin || null });
      if (body.destination !== undefined) q = q.set({ destination: body.destination || null });
      if (body.container_length_cm !== undefined) q = q.set({ container_length_cm: body.container_length_cm });
      if (body.container_width_cm !== undefined) q = q.set({ container_width_cm: body.container_width_cm });
      if (body.container_height_cm !== undefined) q = q.set({ container_height_cm: body.container_height_cm });
      if (body.max_weight_kg !== undefined) q = q.set({ max_weight_kg: body.max_weight_kg });
      const updated = await q.returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Manifest not found' });
      if (['container_length_cm', 'container_width_cm', 'container_height_cm', 'max_weight_kg'].some(key => body[key] !== undefined)) {
        await trx.updateTable('cargo_items').set({ placements: JSON.stringify([]) as any }).where('manifest_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      }
      return updated;
    });
  });

  fastify.patch('/manifests/:id/status', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };
    if (status !== 'APPROVED') return reply.status(400).send({ error: 'Only approval is supported. Use dispatch to start a trip.' });
    return withTenant(user.tenant_id, async (trx) => {
      await lockDraft(trx, user.tenant_id, id);
      const items = await trx.selectFrom('cargo_items').selectAll().where('manifest_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      if (!items.length || items.some(item => !Array.isArray(item.placements) || item.placements.length !== item.quantity)) return reply.status(409).send({ error: 'Pack all cargo units before approving.' });
      const updated = await trx.updateTable('cargo_manifests' as any).set({ status })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Manifest not found' });
      return updated;
    });
  });

  fastify.post('/manifests/:id/dispatch', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { vehicle_id } = req.body as { vehicle_id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('cargo_manifests').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).forUpdate().executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Manifest not found' });
      if (existing.status !== 'APPROVED') return reply.status(409).send({ error: 'Plan must be approved and not previously dispatched.' });
      await trx.selectFrom('vehicles').select('id').where('id', '=', vehicle_id).where('tenant_id', '=', user.tenant_id).forUpdate().executeTakeFirst();
      const blocker = await assertDispatchable(trx, user.tenant_id, vehicle_id, null);
      if (blocker) return reply.status(409).send({ error: blocker });
      if (!existing.origin || !existing.destination) return reply.status(400).send({ error: 'Set the origin and destination before dispatch.' });
      const cargo = await trx.selectFrom('cargo_items').selectAll().where('manifest_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      const trip = await trx.insertInto('trips').values({ tenant_id: user.tenant_id, vehicle_id, origin: existing.origin, destination: existing.destination, shipment_id: existing.shipment_id, cargo_weight_kg: cargo.reduce((sum, item) => sum + Number(item.weight_kg) * item.quantity, 0), cargo_desc: existing.name, status: 'IN_PROGRESS', actual_start: new Date(), created_by: user.sub } as any).returning('id').executeTakeFirstOrThrow();
      const manifest = await trx.updateTable('cargo_manifests' as any)
        .set({ status: 'DISPATCHED', vehicle_id, trip_id: trip.id })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!manifest) return reply.status(404).send({ error: 'Manifest not found' });

      return { ...manifest, trip_id: trip.id };
    });
  });

  fastify.post('/manifests/:id/import-shipment', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { shipment_id } = req.body as { shipment_id: string };

    return withTenant(user.tenant_id, async (trx) => {
      await lockDraft(trx, user.tenant_id, id);

      // Fetch shipment containers
      const shipment = await trx.selectFrom('shipment_cases').selectAll()
        .where('id', '=', shipment_id).where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });
      
      const containers = (shipment.containers as any) || [];
      if (!Array.isArray(containers) || !containers.length || containers.some((c: any) => ['length_cm', 'width_cm', 'height_cm', 'weight_kg'].some(key => !Number.isFinite(Number(c[key])) || Number(c[key]) <= 0))) {
        return reply.status(422).send({ error: 'Shipment cargo needs measured length_cm, width_cm, height_cm and weight_kg. Add measured cargo manually when these are unavailable.' });
      }
      const newItems = [];
      const colors = ['#0891b2', '#f97316', '#8b5cf6', '#10b981', '#ef4444', '#eab308'];
      
      for (let i = 0; i < containers.length; i++) {
        const c = containers[i];
        const l = Number(c.length_cm), w = Number(c.width_cm), h = Number(c.height_cm);
        
        const item = await trx.insertInto('cargo_items').values({
          tenant_id: user.tenant_id,
          manifest_id: id,
          label: c.container_number || `Imported Item ${i+1}`,
          length_cm: l, width_cm: w, height_cm: h,
          weight_kg: Number(c.weight_kg),
          quantity: 1,
          color: colors[i % colors.length],
        }).returningAll().executeTakeFirstOrThrow();
        newItems.push(item);
      }
      
      await trx.updateTable('cargo_manifests').set({ shipment_id }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return { items: newItems };
    });
  });

  fastify.delete('/manifests/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) => {
      await lockDraft(trx, user.tenant_id, id);
      await trx.deleteFrom('cargo_manifests').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
    });
    return { ok: true };
  });

  // ── Items ────────────────────────────────────────────────────

  fastify.get('/manifests/:id/items', async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('cargo_items').selectAll()
        .where('manifest_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at').execute()
    );
  });

  fastify.post('/manifests/:id/items', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as {
      label: string; length_cm: number; width_cm: number; height_cm: number;
      weight_kg: number; quantity?: number; color?: string;
    };
    return withTenant(user.tenant_id, async (trx) => {
      await lockDraft(trx, user.tenant_id, id);
      return trx.insertInto('cargo_items').values({
        tenant_id: user.tenant_id, manifest_id: id, label: body.label,
        length_cm: body.length_cm, width_cm: body.width_cm, height_cm: body.height_cm,
        weight_kg: body.weight_kg, quantity: body.quantity ?? 1, color: body.color ?? '#0891b2',
      } as any).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/items/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) => {
      const item = await trx.selectFrom('cargo_items').select('manifest_id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirstOrThrow();
      await lockDraft(trx, user.tenant_id, item.manifest_id);
      await trx.deleteFrom('cargo_items').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
    });
    return { ok: true };
  });

  // ── Pack ─────────────────────────────────────────────────────

  fastify.post('/manifests/:id/pack', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const manifest = await lockDraft(trx, user.tenant_id, id);

      const items = await trx.selectFrom('cargo_items').selectAll()
        .where('manifest_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      if (items.reduce((sum, item) => sum + item.quantity, 0) > 2000) return reply.status(422).send({ error: 'A packing run supports at most 2,000 units. Split this load into smaller plans.' });

      const container: Dims = {
        l: Number(manifest.container_length_cm), w: Number(manifest.container_width_cm), h: Number(manifest.container_height_cm),
      };

      const units: Unit[] = [];
      items.forEach((it, itemIndex) => {
        for (let i = 0; i < it.quantity; i++) {
          units.push({
            itemIndex, label: it.label,
            dims: { l: Number(it.length_cm), w: Number(it.width_cm), h: Number(it.height_cm) },
            weight: Number(it.weight_kg),
          });
        }
      });

      const { placed, unplacedIndices, totalWeight } = packItems(container, Number(manifest.max_weight_kg), units);

      // Group placements back per cargo_items row (container-space cm, box center).
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

      const containerVolume = container.l * container.w * container.h;
      const placedVolume = placed.reduce((s, p) => s + p.dims.l * p.dims.w * p.dims.h, 0);
      const unplacedByItem = new Map<number, number>();
      for (const idx of unplacedIndices) unplacedByItem.set(idx, (unplacedByItem.get(idx) ?? 0) + 1);

      return {
        items: updatedItems,
        volume_utilization_pct: containerVolume > 0 ? Math.round((placedVolume / containerVolume) * 1000) / 10 : 0,
        weight_utilization_pct: Number(manifest.max_weight_kg) > 0 ? Math.round((totalWeight / Number(manifest.max_weight_kg)) * 1000) / 10 : 0,
        unplaced_items: [...unplacedByItem.entries()].map(([itemIndex, count]) => ({
          label: items[itemIndex].label, count,
        })),
      };
    });
  });
}
