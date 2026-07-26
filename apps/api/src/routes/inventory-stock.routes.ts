import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { InventoryService, UnknownUom, InvalidMovement } from '../services/inventory.service.js';

// Inventory Control Phase 2 — the core stock ledger. Every quantity change
// goes through InventoryService.recordMovement(); this file is just the
// HTTP surface over it, plus read endpoints for the live stock-level
// projection and movement history.

function mapStockLevel(row: any) {
  return {
    itemId: row.item_id, locationId: row.location_id, batchNo: row.batch_no || null,
    expiryDate: row.expiry_date, qtyOnHand: Number(row.qty_on_hand),
    itemName: row.item_name ?? undefined, itemSku: row.item_sku ?? undefined, baseUom: row.base_uom ?? undefined,
    locationCode: row.location_code ?? undefined, warehouseName: row.warehouse_name ?? undefined,
  };
}

function mapMovement(row: any) {
  return {
    id: row.id, occurredAt: row.occurred_at, movementType: row.movement_type, itemId: row.item_id,
    fromLocationId: row.from_location_id, toLocationId: row.to_location_id,
    qtyDelta: Number(row.qty_delta), enteredQty: Number(row.entered_qty), enteredUom: row.entered_uom,
    batchNo: row.batch_no || null, expiryDate: row.expiry_date,
    reasonCode: row.reason_code, reference: row.reference,
    itemName: row.item_name ?? undefined,
    fromLocationCode: row.from_location_code ?? undefined, toLocationCode: row.to_location_code ?? undefined,
  };
}

export async function inventoryStockRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('inventory'));

  // Reorder alerts — always computed live from the real projection, never
  // a stored flag that could drift stale as stock moves.
  fastify.get('/reorder-alerts', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('inventory_items')
          .leftJoin('inventory_stock_levels', 'inventory_stock_levels.item_id', 'inventory_items.id')
          .select(({ fn }) => [
            'inventory_items.id', 'inventory_items.sku', 'inventory_items.name', 'inventory_items.base_uom',
            'inventory_items.reorder_point', 'inventory_items.reorder_qty',
            fn.coalesce(fn.sum<string>('inventory_stock_levels.qty_on_hand'), sql.lit('0')).as('total_qty_on_hand'),
          ])
          .where('inventory_items.active', '=', true)
          .where('inventory_items.reorder_point', 'is not', null)
          .groupBy(['inventory_items.id', 'inventory_items.sku', 'inventory_items.name', 'inventory_items.base_uom', 'inventory_items.reorder_point', 'inventory_items.reorder_qty'])
          .execute()
      );
      const alerts = rows
        .map(r => ({
          itemId: r.id, sku: r.sku, name: r.name, baseUom: r.base_uom,
          reorderPoint: Number(r.reorder_point), reorderQty: r.reorder_qty != null ? Number(r.reorder_qty) : null,
          totalQtyOnHand: Number(r.total_qty_on_hand),
        }))
        .filter(a => a.totalQtyOnHand <= a.reorderPoint)
        .sort((a, b) => (a.totalQtyOnHand - a.reorderPoint) - (b.totalQtyOnHand - b.reorderPoint));
      return alerts;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/stock-levels', async (request: any, reply) => {
    try {
      const { item_id, location_id, warehouse_id } = request.query as { item_id?: string; location_id?: string; warehouse_id?: string };
      const rows = await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('inventory_stock_levels')
          .innerJoin('inventory_items', 'inventory_items.id', 'inventory_stock_levels.item_id')
          .innerJoin('inventory_locations', 'inventory_locations.id', 'inventory_stock_levels.location_id')
          .innerJoin('inventory_warehouses', 'inventory_warehouses.id', 'inventory_locations.warehouse_id')
          .select([
            'inventory_stock_levels.item_id', 'inventory_stock_levels.location_id', 'inventory_stock_levels.batch_no',
            'inventory_stock_levels.expiry_date', 'inventory_stock_levels.qty_on_hand',
            'inventory_items.name as item_name', 'inventory_items.sku as item_sku', 'inventory_items.base_uom',
            'inventory_locations.code as location_code', 'inventory_warehouses.name as warehouse_name',
          ])
          .where('inventory_stock_levels.qty_on_hand', '!=', '0')
          .orderBy('inventory_items.name');
        if (item_id) q = q.where('inventory_stock_levels.item_id', '=', item_id);
        if (location_id) q = q.where('inventory_stock_levels.location_id', '=', location_id);
        if (warehouse_id) q = q.where('inventory_locations.warehouse_id', '=', warehouse_id);
        return q.execute();
      });
      return rows.map(mapStockLevel);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/movements', async (request: any, reply) => {
    try {
      const { item_id } = request.query as { item_id?: string };
      const rows = await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('inventory_movements')
          .innerJoin('inventory_items', 'inventory_items.id', 'inventory_movements.item_id')
          .leftJoin('inventory_locations as from_loc', 'from_loc.id', 'inventory_movements.from_location_id')
          .leftJoin('inventory_locations as to_loc', 'to_loc.id', 'inventory_movements.to_location_id')
          .select([
            'inventory_movements.id', 'inventory_movements.occurred_at', 'inventory_movements.movement_type',
            'inventory_movements.item_id', 'inventory_movements.from_location_id', 'inventory_movements.to_location_id',
            'inventory_movements.qty_delta', 'inventory_movements.entered_qty', 'inventory_movements.entered_uom',
            'inventory_movements.batch_no', 'inventory_movements.expiry_date', 'inventory_movements.reason_code',
            'inventory_movements.reference', 'inventory_items.name as item_name',
            'from_loc.code as from_location_code', 'to_loc.code as to_location_code',
          ])
          .orderBy('inventory_movements.id', 'desc')
          .limit(200);
        if (item_id) q = q.where('inventory_movements.item_id', '=', item_id);
        return q.execute();
      });
      return rows.map(mapMovement);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/movements', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.movementType || !b.itemId || !b.enteredQty || !b.enteredUom) {
        return reply.status(400).send({ error: 'movementType, itemId, enteredQty and enteredUom are required' });
      }
      const movement = await withTenant(request.user.tenant_id, trx =>
        InventoryService.recordMovement(trx, request.user.tenant_id, {
          actorId: request.user.id,
          movementType: b.movementType,
          itemId: b.itemId,
          fromLocationId: b.fromLocationId ?? null,
          toLocationId: b.toLocationId ?? null,
          enteredQty: Number(b.enteredQty),
          enteredUom: b.enteredUom,
          batchNo: b.batchNo ?? null,
          expiryDate: b.expiryDate ?? null,
          reasonCode: b.reasonCode ?? null,
          reference: b.reference ?? null,
        })
      );
      return mapMovement(movement);
    } catch (err: any) {
      if (err instanceof UnknownUom || err instanceof InvalidMovement) {
        return reply.status(422).send({ error: err.message });
      }
      return reply.status(500).send({ error: err.message });
    }
  });
}
