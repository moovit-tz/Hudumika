import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';

// Real values — InventoryWarehouses.tsx's LOCATION_TYPES, InventoryItems.tsx's ITEM_TYPES.
const INVENTORY_LOCATION_TYPES = ['bin', 'shelf', 'floor', 'staging'] as const;
const INVENTORY_ITEM_TYPES = ['raw_material', 'finished_good', 'retail', 'consumable'] as const;

const warehouseCreateSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  address: z.string().max(500).optional(),
});
const warehousePatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  address: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
});
const locationCreateSchema = z.object({
  warehouseId: z.string().min(1),
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  locationType: z.enum(INVENTORY_LOCATION_TYPES).optional(),
});
const itemCreateSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(300),
  productId: z.string().nullable().optional(),
  baseUom: z.string().max(20).optional(),
  itemType: z.enum(INVENTORY_ITEM_TYPES).optional(),
  isBatchTracked: z.boolean().optional(),
  reorderPoint: z.number().nullable().optional(),
  reorderQty: z.number().nullable().optional(),
});
const itemPatchSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  productId: z.string().nullable().optional(),
  itemType: z.enum(INVENTORY_ITEM_TYPES).optional(),
  isBatchTracked: z.boolean().optional(),
  reorderPoint: z.number().nullable().optional(),
  reorderQty: z.number().nullable().optional(),
  active: z.boolean().optional(),
});
const uomCreateSchema = z.object({
  uomCode: z.string().trim().min(1).max(20),
  conversionFactor: z.number().positive(),
});

// Inventory Control — Phase 1 (app scaffold): warehouses, locations, items,
// and per-item UOM conversions. A brand-new, standalone app deliberately
// simpler than SEAL's compartment/zone hierarchy (no customs status, no
// hash-chained ledger) — general multi-warehouse stock for raw materials,
// finished goods, and retail. Table names are `inventory_`-prefixed to
// avoid the naming collision already flagged against Fleet's
// `parts_stock`/`warehouse_locations` and SEAL's own tables.

function mapWarehouse(row: any) {
  return { id: row.id, code: row.code, name: row.name, address: row.address, active: row.active, createdAt: row.created_at };
}

function mapLocation(row: any) {
  return {
    id: row.id, warehouseId: row.warehouse_id, code: row.code, name: row.name,
    locationType: row.location_type, isPickable: row.is_pickable,
    warehouseName: row.warehouse_name ?? undefined,
  };
}

function mapItem(row: any) {
  return {
    id: row.id, sku: row.sku, name: row.name, productId: row.product_id,
    baseUom: row.base_uom, itemType: row.item_type, isBatchTracked: row.is_batch_tracked,
    reorderPoint: row.reorder_point != null ? Number(row.reorder_point) : null,
    reorderQty: row.reorder_qty != null ? Number(row.reorder_qty) : null,
    active: row.active, createdAt: row.created_at,
    avgCost: row.avg_cost != null ? Number(row.avg_cost) : 0,
    productName: row.product_name ?? undefined,
  };
}

function mapUom(row: any) {
  return { id: row.id, itemId: row.item_id, uomCode: row.uom_code, conversionFactor: Number(row.conversion_factor) };
}

export async function inventoryCatalogRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('inventory'));

  // ── Warehouses ─────────────────────────────────────────────────────
  fastify.get('/warehouses', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('inventory_warehouses').selectAll()
          .where('tenant_id', '=', request.user.tenant_id)
          .where('active', '=', true).orderBy('code').execute()
      );
      return rows.map(mapWarehouse);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/warehouses', async (request: any, reply) => {
    const b = warehouseCreateSchema.parse(request.body);
    try {
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('inventory_warehouses').values({
          tenant_id: request.user.tenant_id, code: b.code.trim(), name: b.name.trim(), address: b.address ?? null,
        }).returningAll().executeTakeFirstOrThrow()
      );
      return mapWarehouse(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/warehouses/:id', async (request: any, reply) => {
    const b = warehousePatchSchema.parse(request.body);
    try {
      const patch: any = { updated_at: new Date() };
      if (b.name !== undefined) patch.name = b.name;
      if (b.address !== undefined) patch.address = b.address;
      if (b.active !== undefined) patch.active = b.active;
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('inventory_warehouses').set(patch)
          .where('id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id)
          .returningAll().executeTakeFirstOrThrow()
      );
      return mapWarehouse(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Locations ──────────────────────────────────────────────────────
  fastify.get('/locations', async (request: any, reply) => {
    try {
      const { warehouse_id } = request.query as { warehouse_id?: string };
      const rows = await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('inventory_locations')
          .leftJoin('inventory_warehouses', 'inventory_warehouses.id', 'inventory_locations.warehouse_id')
          .select([
            'inventory_locations.id', 'inventory_locations.warehouse_id', 'inventory_locations.code',
            'inventory_locations.name', 'inventory_locations.location_type', 'inventory_locations.is_pickable',
            'inventory_warehouses.name as warehouse_name',
          ])
          .where('inventory_locations.tenant_id', '=', request.user.tenant_id)
          .orderBy('inventory_locations.code');
        if (warehouse_id) q = q.where('inventory_locations.warehouse_id', '=', warehouse_id);
        return q.execute();
      });
      return rows.map(mapLocation);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/locations', async (request: any, reply) => {
    const b = locationCreateSchema.parse(request.body);
    try {
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('inventory_locations').values({
          tenant_id: request.user.tenant_id, warehouse_id: b.warehouseId, code: b.code.trim(), name: b.name.trim(),
          location_type: b.locationType ?? 'bin',
        }).returningAll().executeTakeFirstOrThrow()
      );
      return mapLocation(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Items ──────────────────────────────────────────────────────────
  fastify.get('/items', async (request: any, reply) => {
    try {
      const { q } = request.query as { q?: string };
      const rows = await withTenant(request.user.tenant_id, trx => {
        let query = trx.selectFrom('inventory_items')
          .leftJoin('products', 'products.id', 'inventory_items.product_id')
          .select([
            'inventory_items.id', 'inventory_items.sku', 'inventory_items.name', 'inventory_items.product_id',
            'inventory_items.base_uom', 'inventory_items.item_type', 'inventory_items.is_batch_tracked',
            'inventory_items.reorder_point', 'inventory_items.reorder_qty', 'inventory_items.active',
            'inventory_items.avg_cost', 'inventory_items.created_at', 'products.name as product_name',
          ])
          .where('inventory_items.tenant_id', '=', request.user.tenant_id)
          .where('inventory_items.active', '=', true)
          .orderBy('inventory_items.name');
        if (q) query = query.where(eb => eb.or([
          eb('inventory_items.name', 'ilike', `%${q}%`), eb('inventory_items.sku', 'ilike', `%${q}%`),
        ]));
        return query.execute();
      });
      return rows.map(mapItem);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/items', async (request: any, reply) => {
    const b = itemCreateSchema.parse(request.body);
    try {
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('inventory_items').values({
          tenant_id: request.user.tenant_id, sku: b.sku.trim(), name: b.name.trim(),
          product_id: b.productId ?? null, base_uom: b.baseUom ?? 'each', item_type: b.itemType ?? 'finished_good',
          is_batch_tracked: !!b.isBatchTracked,
          reorder_point: b.reorderPoint != null ? String(b.reorderPoint) : null,
          reorder_qty: b.reorderQty != null ? String(b.reorderQty) : null,
        }).returningAll().executeTakeFirstOrThrow()
      );
      return mapItem(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/items/:id', async (request: any, reply) => {
    const b = itemPatchSchema.parse(request.body);
    try {
      const patch: any = { updated_at: new Date() };
      if (b.name !== undefined) patch.name = b.name;
      if (b.productId !== undefined) patch.product_id = b.productId;
      if (b.itemType !== undefined) patch.item_type = b.itemType;
      if (b.isBatchTracked !== undefined) patch.is_batch_tracked = b.isBatchTracked;
      if (b.reorderPoint !== undefined) patch.reorder_point = b.reorderPoint != null ? String(b.reorderPoint) : null;
      if (b.reorderQty !== undefined) patch.reorder_qty = b.reorderQty != null ? String(b.reorderQty) : null;
      if (b.active !== undefined) patch.active = b.active;
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('inventory_items').set(patch)
          .where('id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id)
          .returningAll().executeTakeFirstOrThrow()
      );
      return mapItem(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Item UOM conversions ───────────────────────────────────────────
  fastify.get('/items/:id/uoms', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('inventory_item_uoms').selectAll()
          .where('item_id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id)
          .execute()
      );
      return rows.map(mapUom);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/items/:id/uoms', async (request: any, reply) => {
    const b = uomCreateSchema.parse(request.body);
    try {
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('inventory_item_uoms').values({
          tenant_id: request.user.tenant_id, item_id: request.params.id,
          uom_code: b.uomCode.trim(), conversion_factor: String(b.conversionFactor),
        }).returningAll().executeTakeFirstOrThrow()
      );
      return mapUom(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
