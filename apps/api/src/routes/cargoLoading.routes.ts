import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

const FLEET_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR'] as const;

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

  fastify.patch('/manifests/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as any;
    
    return withTenant(user.tenant_id, async (trx) => {
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
      return q.returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/manifests/:id/status', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('cargo_manifests' as any).set({ status }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.post('/manifests/:id/dispatch', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { vehicle_id } = req.body as { vehicle_id: string };
    
    return withTenant(user.tenant_id, async (trx) => {
      const manifest = await trx.updateTable('cargo_manifests' as any)
        .set({ status: 'DISPATCHED', vehicle_id })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
      
      // Optionally create a trip or just rely on the vehicle_id link
      return manifest;
    });
  });

  fastify.post('/manifests/:id/import-shipment', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { shipment_id } = req.body as { shipment_id: string };
    
    return withTenant(user.tenant_id, async (trx) => {
      // Fetch shipment containers
      const shipment = await trx.selectFrom('shipment_cases').selectAll()
        .where('id', '=', shipment_id).where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      
      if (!shipment) throw new Error('Shipment not found');
      
      const containers = (shipment.containers as any) || [];
      const newItems = [];
      const colors = ['#0891b2', '#f97316', '#8b5cf6', '#10b981', '#ef4444', '#eab308'];
      
      for (let i = 0; i < containers.length; i++) {
        const c = containers[i];
        // We guess dimensions for typical TEU or LCL if not specified
        const l = c.size === '20FT' ? 590 : c.size === '40FT' || c.size === '40HC' ? 1200 : 100;
        const w = 235;
        const h = c.size === '40HC' ? 269 : 239;
        
        const item = await trx.insertInto('cargo_items').values({
          tenant_id: user.tenant_id,
          manifest_id: id,
          label: c.container_number || `Imported Item ${i+1}`,
          length_cm: l, width_cm: w, height_cm: h,
          weight_kg: 2000, // Dummy fallback if unspecified
          quantity: 1,
          color: colors[i % colors.length],
        }).returningAll().executeTakeFirstOrThrow();
        newItems.push(item);
      }
      
      return { items: newItems };
    });
  });

  fastify.delete('/manifests/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('cargo_manifests').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
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
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('cargo_items').values({
        tenant_id: user.tenant_id, manifest_id: id, label: body.label,
        length_cm: body.length_cm, width_cm: body.width_cm, height_cm: body.height_cm,
        weight_kg: body.weight_kg, quantity: body.quantity ?? 1, color: body.color ?? '#0891b2',
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.delete('/items/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('cargo_items').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });

  // ── Pack ─────────────────────────────────────────────────────

  fastify.post('/manifests/:id/pack', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const manifest = await trx.selectFrom('cargo_manifests').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!manifest) return reply.status(404).send({ error: 'Manifest not found' });

      const items = await trx.selectFrom('cargo_items').selectAll()
        .where('manifest_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

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
