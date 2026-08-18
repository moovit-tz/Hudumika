import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { InventoryService } from '../services/inventory.service.js';

const sessionCreateSchema = z.object({
  warehouseId: z.string().min(1),
  notes: z.string().max(2000).nullable().optional(),
});
const lineCountSchema = z.object({ countedQty: z.number() });

// Inventory Control Phase 4 — stock counts / cycle counts. expected_qty is
// snapshotted from inventory_stock_levels at session start and never
// recomputed afterward; posting the session reconciles variances through
// InventoryService.recordMovement() (movement_type='count_correction'),
// never a silent direct overwrite of the stock-level projection.

function mapSession(row: any) {
  return {
    id: row.id, warehouseId: row.warehouse_id, status: row.status,
    startedAt: row.started_at, postedAt: row.posted_at, notes: row.notes,
    warehouseName: row.warehouse_name ?? undefined,
  };
}

function mapLine(row: any) {
  return {
    id: row.id, sessionId: row.session_id, itemId: row.item_id, locationId: row.location_id, batchNo: row.batch_no || null,
    expectedQty: Number(row.expected_qty), countedQty: row.counted_qty != null ? Number(row.counted_qty) : null,
    countedAt: row.counted_at,
    itemName: row.item_name ?? undefined, itemSku: row.item_sku ?? undefined, baseUom: row.base_uom ?? undefined,
    locationCode: row.location_code ?? undefined,
  };
}

export async function inventoryCountsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('inventory'));

  fastify.get('/count-sessions', async (request: any, reply) => {
    try {
      const { warehouse_id } = request.query as { warehouse_id?: string };
      const rows = await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('inventory_count_sessions')
          .leftJoin('inventory_warehouses', 'inventory_warehouses.id', 'inventory_count_sessions.warehouse_id')
          .select([
            'inventory_count_sessions.id', 'inventory_count_sessions.warehouse_id', 'inventory_count_sessions.status',
            'inventory_count_sessions.started_at', 'inventory_count_sessions.posted_at', 'inventory_count_sessions.notes',
            'inventory_warehouses.name as warehouse_name',
          ])
          .where('inventory_count_sessions.tenant_id', '=', request.user.tenant_id)
          .orderBy('inventory_count_sessions.started_at', 'desc');
        if (warehouse_id) q = q.where('inventory_count_sessions.warehouse_id', '=', warehouse_id);
        return q.execute();
      });
      return rows.map(mapSession);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/count-sessions/:id', async (request: any, reply) => {
    try {
      const result = await withTenant(request.user.tenant_id, async trx => {
        const session = await trx.selectFrom('inventory_count_sessions')
          .leftJoin('inventory_warehouses', 'inventory_warehouses.id', 'inventory_count_sessions.warehouse_id')
          .select([
            'inventory_count_sessions.id', 'inventory_count_sessions.warehouse_id', 'inventory_count_sessions.status',
            'inventory_count_sessions.started_at', 'inventory_count_sessions.posted_at', 'inventory_count_sessions.notes',
            'inventory_warehouses.name as warehouse_name',
          ])
          .where('inventory_count_sessions.tenant_id', '=', request.user.tenant_id)
          .where('inventory_count_sessions.id', '=', request.params.id).executeTakeFirst();
        if (!session) return null;
        const lines = await trx.selectFrom('inventory_count_lines')
          .innerJoin('inventory_items', 'inventory_items.id', 'inventory_count_lines.item_id')
          .innerJoin('inventory_locations', 'inventory_locations.id', 'inventory_count_lines.location_id')
          .select([
            'inventory_count_lines.id', 'inventory_count_lines.session_id', 'inventory_count_lines.item_id',
            'inventory_count_lines.location_id', 'inventory_count_lines.batch_no', 'inventory_count_lines.expected_qty',
            'inventory_count_lines.counted_qty', 'inventory_count_lines.counted_at',
            'inventory_items.name as item_name', 'inventory_items.sku as item_sku', 'inventory_items.base_uom',
            'inventory_locations.code as location_code',
          ])
          .where('inventory_count_lines.tenant_id', '=', request.user.tenant_id)
          .where('session_id', '=', request.params.id)
          .execute();
        return { session, lines };
      });
      if (!result) return reply.status(404).send({ error: 'Count session not found' });
      return { ...mapSession(result.session), lines: result.lines.map(mapLine) };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Starting a session snapshots every current (item, location, batch)
  // stock row in the warehouse as a line to verify — expected_qty is
  // frozen at this moment and never recomputed, even if other movements
  // happen elsewhere while this count is in progress.
  fastify.post('/count-sessions', async (request: any, reply) => {
    const b = sessionCreateSchema.parse(request.body);
    try {
      const session = await withTenant(request.user.tenant_id, async trx => {
        // warehouseId arrives from the client, so it is checked against this
        // tenant before anything is snapshotted from it — otherwise a count
        // session could be opened over another workspace's warehouse and copy
        // its stock levels into this one's count lines.
        const warehouse = await trx.selectFrom('inventory_warehouses')
          .select('id')
          .where('tenant_id', '=', request.user.tenant_id)
          .where('id', '=', b.warehouseId)
          .executeTakeFirst();
        if (!warehouse) return null;

        const row = await trx.insertInto('inventory_count_sessions').values({
          tenant_id: request.user.tenant_id, warehouse_id: b.warehouseId,
          notes: b.notes ?? null, created_by: request.user.sub,
        }).returningAll().executeTakeFirstOrThrow();

        const stockRows = await trx.selectFrom('inventory_stock_levels')
          .innerJoin('inventory_locations', 'inventory_locations.id', 'inventory_stock_levels.location_id')
          .select(['inventory_stock_levels.item_id', 'inventory_stock_levels.location_id', 'inventory_stock_levels.batch_no', 'inventory_stock_levels.qty_on_hand'])
          .where('inventory_stock_levels.tenant_id', '=', request.user.tenant_id)
          .where('inventory_locations.warehouse_id', '=', b.warehouseId)
          .execute();

        if (stockRows.length > 0) {
          await trx.insertInto('inventory_count_lines').values(
            stockRows.map(s => ({
              tenant_id: request.user.tenant_id, session_id: row.id, item_id: s.item_id, location_id: s.location_id,
              batch_no: s.batch_no, expected_qty: s.qty_on_hand,
            }))
          ).execute();
        }
        return row;
      });
      if (!session) return reply.status(404).send({ error: 'Warehouse not found' });
      return mapSession(session);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/count-sessions/:id/lines/:lineId', async (request: any, reply) => {
    const b = lineCountSchema.parse(request.body);
    try {
      const row = await withTenant(request.user.tenant_id, async trx => {
        const session = await trx.selectFrom('inventory_count_sessions').select('status')
          .where('tenant_id', '=', request.user.tenant_id)
          .where('id', '=', request.params.id).executeTakeFirstOrThrow();
        if (session.status !== 'open') throw new Error(`Cannot record a count — session is ${session.status}.`);
        return trx.updateTable('inventory_count_lines').set({
          counted_qty: String(b.countedQty), counted_at: new Date(), counted_by: request.user.sub,
        }).where('tenant_id', '=', request.user.tenant_id)
          .where('id', '=', request.params.lineId).where('session_id', '=', request.params.id)
          .returningAll().executeTakeFirstOrThrow();
      });
      return mapLine(row);
    } catch (err: any) {
      return reply.status(422).send({ error: err.message });
    }
  });

  // Posting reconciles every counted line whose counted_qty differs from
  // its expected_qty by inserting a real count_correction movement through
  // InventoryService — the ledger and the stock-level projection are the
  // only things that ever actually change; the count session itself is
  // just the record of the reconciliation having happened.
  fastify.post('/count-sessions/:id/post', async (request: any, reply) => {
    try {
      const result = await withTenant(request.user.tenant_id, async trx => {
        // Tenant-scoped before anything is read from it: posting turns this
        // session's lines into real count_correction movements, so an
        // unscoped lookup here would let one workspace apply another's counts
        // to its own stock ledger.
        const session = await trx.selectFrom('inventory_count_sessions').selectAll()
          .where('tenant_id', '=', request.user.tenant_id)
          .where('id', '=', request.params.id).executeTakeFirstOrThrow();
        if (session.status !== 'open') throw new Error(`Cannot post — session is ${session.status}.`);

        const lines = await trx.selectFrom('inventory_count_lines')
          .innerJoin('inventory_items', 'inventory_items.id', 'inventory_count_lines.item_id')
          .select(['inventory_count_lines.id', 'inventory_count_lines.item_id', 'inventory_count_lines.location_id',
            'inventory_count_lines.batch_no', 'inventory_count_lines.expected_qty', 'inventory_count_lines.counted_qty',
            'inventory_items.base_uom'])
          .where('inventory_count_lines.tenant_id', '=', request.user.tenant_id)
          .where('session_id', '=', session.id)
          .execute();

        let corrections = 0;
        for (const line of lines) {
          if (line.counted_qty == null) continue;
          const variance = Number(line.counted_qty) - Number(line.expected_qty);
          if (variance === 0) continue;
          await InventoryService.recordMovement(trx, request.user.tenant_id, {
            actorId: request.user.sub, movementType: 'count_correction', itemId: line.item_id,
            toLocationId: line.location_id, enteredQty: variance, enteredUom: line.base_uom,
            batchNo: line.batch_no || null, reasonCode: 'stock_count', reference: `count-session:${session.id}`,
          });
          corrections++;
        }

        const posted = await trx.updateTable('inventory_count_sessions').set({ status: 'posted', posted_at: new Date() })
          .where('tenant_id', '=', request.user.tenant_id)
          .where('id', '=', session.id).returningAll().executeTakeFirstOrThrow();
        return { posted, corrections };
      });
      return { ...mapSession(result.posted), correctionsApplied: result.corrections };
    } catch (err: any) {
      return reply.status(422).send({ error: err.message });
    }
  });

  fastify.post('/count-sessions/:id/cancel', async (request: any, reply) => {
    try {
      const row = await withTenant(request.user.tenant_id, async trx => {
        const session = await trx.selectFrom('inventory_count_sessions').select('status')
          .where('tenant_id', '=', request.user.tenant_id)
          .where('id', '=', request.params.id).executeTakeFirstOrThrow();
        if (session.status !== 'open') throw new Error(`Cannot cancel — session is ${session.status}.`);
        return trx.updateTable('inventory_count_sessions').set({ status: 'cancelled' })
          .where('tenant_id', '=', request.user.tenant_id)
          .where('id', '=', request.params.id).returningAll().executeTakeFirstOrThrow();
      });
      return mapSession(row);
    } catch (err: any) {
      return reply.status(422).send({ error: err.message });
    }
  });
}
