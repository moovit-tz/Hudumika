import { requireEntitlement } from '../middleware/entitlement.js';
import { emitDomainEvent } from '../services/domain-events.service.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { SealService } from '../services/seal.service.js';

// Outbound fulfillment (Increment 11b) — pick list generation, partial-pick
// handling, packing confirmation, dispatch documentation. Physical pick
// quantity is deducted through the existing seal_movements ledger
// (SealService.recordMovement, movement_type='pick') — the single source of
// truth for a lot's qty_on_hand — never a second, parallel count. Customs
// status transitions are deliberately untouched here; they remain the
// existing manual action a user takes on a lot's own detail page, whenever
// they judge it appropriate relative to the physical dispatch.

function mapOrder(row: any) {
  return {
    id: row.id, compartmentId: row.compartment_id, customerId: row.customer_id, ownerName: row.owner_name ?? undefined,
    reference: row.reference, status: row.status, vehicleId: row.vehicle_id, carrierNote: row.carrier_note,
    notes: row.notes, createdAt: row.created_at, packedAt: row.packed_at, dispatchedAt: row.dispatched_at,
    compartmentName: row.compartment_name ?? undefined,
  };
}

function mapLine(row: any) {
  return {
    id: row.id, orderId: row.order_id, lotId: row.lot_id, lotDescription: row.lot_description ?? undefined,
    lotUom: row.uom ?? undefined,
    requestedQty: Number(row.requested_qty), pickedQty: Number(row.picked_qty), packed: row.packed,
  };
}

export async function sealFulfillmentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('seal'));

  // Read-only proxy onto Tracking/HuduFreight's own vehicle registry, same
  // reasoning as the geofences proxy in seal.routes.ts — a SEAL-only user
  // (no Tracking entitlement) can still pick which real truck a dispatch
  // left on.
  fastify.get('/vehicles', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('vehicles').select(['id', 'name', 'plate_number']).where('tenant_id', '=', request.user.tenant_id).where('status', '=', 'ACTIVE').orderBy('name').execute()
      );
      return rows;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/fulfillment-orders', async (request: any, reply) => {
    try {
      const { compartment_id, status } = request.query as { compartment_id?: string; status?: string };
      const rows = await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('seal_fulfillment_orders')
          .leftJoin('customers', 'customers.id', 'seal_fulfillment_orders.customer_id')
          .leftJoin('seal_compartments', 'seal_compartments.id', 'seal_fulfillment_orders.compartment_id')
          .select([
            'seal_fulfillment_orders.id', 'seal_fulfillment_orders.compartment_id', 'seal_fulfillment_orders.customer_id',
            'seal_fulfillment_orders.reference', 'seal_fulfillment_orders.status', 'seal_fulfillment_orders.vehicle_id',
            'seal_fulfillment_orders.carrier_note', 'seal_fulfillment_orders.notes', 'seal_fulfillment_orders.created_at',
            'seal_fulfillment_orders.packed_at', 'seal_fulfillment_orders.dispatched_at',
            'customers.name as owner_name', 'seal_compartments.name as compartment_name',
          ])
          .where('seal_fulfillment_orders.tenant_id', '=', request.user.tenant_id)
          .orderBy('seal_fulfillment_orders.created_at', 'desc');
        if (compartment_id) q = q.where('seal_fulfillment_orders.compartment_id', '=', compartment_id);
        if (status) q = q.where('seal_fulfillment_orders.status', '=', status);
        return q.execute();
      });
      return rows.map(mapOrder);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/fulfillment-orders/:id', async (request: any, reply) => {
    try {
      const result = await withTenant(request.user.tenant_id, async trx => {
        const order = await trx.selectFrom('seal_fulfillment_orders')
          .leftJoin('customers', 'customers.id', 'seal_fulfillment_orders.customer_id')
          .leftJoin('seal_compartments', 'seal_compartments.id', 'seal_fulfillment_orders.compartment_id')
          .select([
            'seal_fulfillment_orders.id', 'seal_fulfillment_orders.compartment_id', 'seal_fulfillment_orders.customer_id',
            'seal_fulfillment_orders.reference', 'seal_fulfillment_orders.status', 'seal_fulfillment_orders.vehicle_id',
            'seal_fulfillment_orders.carrier_note', 'seal_fulfillment_orders.notes', 'seal_fulfillment_orders.created_at',
            'seal_fulfillment_orders.packed_at', 'seal_fulfillment_orders.dispatched_at',
            'customers.name as owner_name', 'seal_compartments.name as compartment_name',
          ])
          .where('seal_fulfillment_orders.tenant_id', '=', request.user.tenant_id)
          .where('seal_fulfillment_orders.id', '=', request.params.id)
          .executeTakeFirst();
        if (!order) return null;
        const lines = await trx.selectFrom('seal_fulfillment_lines')
          .leftJoin('seal_lots', 'seal_lots.id', 'seal_fulfillment_lines.lot_id')
          .select([
            'seal_fulfillment_lines.id', 'seal_fulfillment_lines.order_id', 'seal_fulfillment_lines.lot_id',
            'seal_fulfillment_lines.requested_qty', 'seal_fulfillment_lines.picked_qty', 'seal_fulfillment_lines.packed',
            'seal_lots.description as lot_description', 'seal_lots.uom',
          ])
          .where('order_id', '=', request.params.id)
          .execute();
        return { order, lines };
      });
      if (!result) return reply.status(404).send({ error: 'Fulfillment order not found' });
      return { ...mapOrder(result.order), lines: result.lines.map(mapLine) };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/fulfillment-orders', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.compartmentId || !b.customerId || !Array.isArray(b.lines) || b.lines.length === 0) {
        return reply.status(400).send({ error: 'compartmentId, customerId and at least one line are required' });
      }
      const order = await withTenant(request.user.tenant_id, async trx => {
        // Every requested qty must be currently available on the named lot —
        // checked here (not just trusted from the client) since this is the
        // moment stock gets committed to an outbound promise.
        for (const line of b.lines) {
          const lot = await trx.selectFrom('seal_lots').select(['id', 'qty_on_hand']).where('id', '=', line.lotId).executeTakeFirst();
          if (!lot) throw new Error(`Lot not found: ${line.lotId}`);
          if (Number(line.qty) > Number(lot.qty_on_hand)) {
            throw new Error(`Requested qty (${line.qty}) exceeds qty on hand (${lot.qty_on_hand}) for this lot.`);
          }
        }
        const row = await trx.insertInto('seal_fulfillment_orders').values({
          tenant_id: request.user.tenant_id,
          compartment_id: b.compartmentId,
          customer_id: b.customerId,
          reference: `FUL-${Date.now().toString(36).toUpperCase()}`,
          notes: b.notes ?? null,
          created_by: request.user.sub,
        }).returningAll().executeTakeFirstOrThrow();

        await trx.insertInto('seal_fulfillment_lines').values(
          b.lines.map((l: any) => ({
            tenant_id: request.user.tenant_id, order_id: row.id, lot_id: l.lotId, requested_qty: String(l.qty),
          }))
        ).execute();

        return row;
      });
      return mapOrder(order);
    } catch (err: any) {
      return reply.status(422).send({ error: err.message });
    }
  });

  // Partial-pick: records how much of one line has been physically pulled.
  // Real ledger effect via SealService.recordMovement (movement_type='pick')
  // — this is the only place a fulfillment line's picked_qty and a lot's
  // qty_on_hand both change, together, in the same transaction.
  fastify.post('/fulfillment-orders/:id/pick', async (request: any, reply) => {
    try {
      const b = request.body as { lineId: string; qty: number };
      if (!b.lineId || typeof b.qty !== 'number' || b.qty <= 0) return reply.status(400).send({ error: 'lineId and a positive qty are required' });

      const result = await withTenant(request.user.tenant_id, async trx => {
        const order = await trx.selectFrom('seal_fulfillment_orders').selectAll().where('id', '=', request.params.id).executeTakeFirstOrThrow();
        if (order.status === 'dispatched' || order.status === 'cancelled') {
          throw new Error(`Cannot pick against a ${order.status} order.`);
        }
        const line = await trx.selectFrom('seal_fulfillment_lines').selectAll()
          .where('id', '=', b.lineId).where('order_id', '=', order.id).executeTakeFirstOrThrow();

        const remaining = Number(line.requested_qty) - Number(line.picked_qty);
        if (b.qty > remaining) throw new Error(`Cannot pick ${b.qty} — only ${remaining} remains requested on this line.`);

        const lot = await trx.selectFrom('seal_lots').select(['id', 'qty_on_hand']).where('id', '=', line.lot_id).executeTakeFirstOrThrow();
        if (b.qty > Number(lot.qty_on_hand)) throw new Error(`Cannot pick ${b.qty} — only ${lot.qty_on_hand} on hand for this lot.`);

        await SealService.recordMovement(trx, request.user.tenant_id, {
          actorId: request.user.sub, movementType: 'pick', lotId: line.lot_id,
          qtyDelta: -b.qty, reference: order.reference, reasonCode: 'fulfillment_pick',
        });

        const updatedLine = await trx.updateTable('seal_fulfillment_lines')
          .set({ picked_qty: String(Number(line.picked_qty) + b.qty) })
          .where('id', '=', line.id).returningAll().executeTakeFirstOrThrow();

        const allLines = await trx.selectFrom('seal_fulfillment_lines').selectAll().where('order_id', '=', order.id).execute();
        const fullyPicked = allLines.every(l => l.id === updatedLine.id
          ? Number(updatedLine.picked_qty) >= Number(updatedLine.requested_qty)
          : Number(l.picked_qty) >= Number(l.requested_qty));
        const newStatus = fullyPicked ? 'picked' : 'picking';
        if (newStatus !== order.status) {
          await trx.updateTable('seal_fulfillment_orders').set({ status: newStatus }).where('id', '=', order.id).execute();
        }

        return updatedLine;
      });
      return mapLine(result);
    } catch (err: any) {
      return reply.status(422).send({ error: err.message });
    }
  });

  // Packing confirmation — the whole order is boxed and ready; only
  // reachable once every line is fully picked.
  fastify.post('/fulfillment-orders/:id/pack', async (request: any, reply) => {
    try {
      const order = await withTenant(request.user.tenant_id, async trx => {
        const o = await trx.selectFrom('seal_fulfillment_orders').selectAll().where('id', '=', request.params.id).executeTakeFirstOrThrow();
        if (o.status !== 'picked') throw new Error(`Cannot confirm packing — order is ${o.status}, not fully picked yet.`);
        await trx.updateTable('seal_fulfillment_lines').set({ packed: true }).where('order_id', '=', o.id).execute();
        return trx.updateTable('seal_fulfillment_orders').set({ status: 'packed', packed_at: new Date() })
          .where('id', '=', o.id).returningAll().executeTakeFirstOrThrow();
      });
      return mapOrder(order);
    } catch (err: any) {
      return reply.status(422).send({ error: err.message });
    }
  });

  // Dispatch — the goods leave. Records a real 'release' ledger entry per
  // line (qty_delta=0; the physical qty was already deducted at pick time)
  // so the movement history/dispatch documentation has a real timestamped
  // "left the building" event distinct from "pulled off the rack".
  fastify.post('/fulfillment-orders/:id/dispatch', async (request: any, reply) => {
    try {
      const b = request.body as { vehicleId?: string | null; carrierNote?: string | null };
      const order = await withTenant(request.user.tenant_id, async trx => {
        const o = await trx.selectFrom('seal_fulfillment_orders').selectAll().where('id', '=', request.params.id).executeTakeFirstOrThrow();
        if (o.status !== 'packed') throw new Error(`Cannot dispatch — order is ${o.status}, not packed yet.`);
        const lines = await trx.selectFrom('seal_fulfillment_lines').selectAll().where('order_id', '=', o.id).execute();
        for (const line of lines) {
          await SealService.recordMovement(trx, request.user.tenant_id, {
            actorId: request.user.sub, movementType: 'release', lotId: line.lot_id,
            qtyDelta: 0, reference: o.reference, reasonCode: 'fulfillment_dispatch',
          });
        }
        const dispatched = await trx.updateTable('seal_fulfillment_orders').set({
          status: 'dispatched', dispatched_at: new Date(),
          vehicle_id: b.vehicleId ?? null, carrier_note: b.carrierNote ?? null,
        }).where('id', '=', o.id).returningAll().executeTakeFirstOrThrow();

        // Gate-out: goods have physically left the warehouse.
        emitDomainEvent(trx, request.user.tenant_id, {
          type: 'seal.order_dispatched', sourceApp: 'seal', entityType: 'seal_fulfillment_order', entityId: dispatched.id,
          payload: { reference: o.reference ?? null, vehicleId: b.vehicleId ?? null, carrierNote: b.carrierNote ?? null },
        }).catch(err => console.error('[SEAL] order_dispatched emit failed:', err.message));

        return dispatched;
      });
      return mapOrder(order);
    } catch (err: any) {
      return reply.status(422).send({ error: err.message });
    }
  });

  // Only a still-untouched draft can be cancelled outright — once any
  // qty has been picked (a real ledger deduction), cancelling silently
  // would leave stock unaccounted for; that correction has to be a
  // deliberate compensating movement, not something this button papers over.
  fastify.post('/fulfillment-orders/:id/cancel', async (request: any, reply) => {
    try {
      const order = await withTenant(request.user.tenant_id, async trx => {
        const o = await trx.selectFrom('seal_fulfillment_orders').selectAll().where('id', '=', request.params.id).executeTakeFirstOrThrow();
        if (o.status !== 'draft') throw new Error(`Cannot cancel — order is ${o.status}; stock has already been picked against it.`);
        return trx.updateTable('seal_fulfillment_orders').set({ status: 'cancelled' })
          .where('id', '=', o.id).returningAll().executeTakeFirstOrThrow();
      });
      return mapOrder(order);
    } catch (err: any) {
      return reply.status(422).send({ error: err.message });
    }
  });
}
