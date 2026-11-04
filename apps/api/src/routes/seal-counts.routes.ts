import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { SealService } from '../services/seal.service.js';

// Registered inside sealRoutes so authentication, tenant and entitlement hooks apply.
export async function registerSealCounts(app: FastifyInstance) {
  app.get('/cycle-counts', async (request: any) => withTenant(request.user.tenant_id, async trx => {
    let query = trx.selectFrom('seal_cycle_counts').selectAll().where('tenant_id', '=', request.user.tenant_id);
    if (request.query.compartment_id) query = query.where('compartment_id', '=', request.query.compartment_id);
    const counts = await query.orderBy('initiated_at', 'desc').execute();
    const lines = await trx.selectFrom('seal_count_lines').innerJoin('seal_cycle_counts', 'seal_cycle_counts.id', 'seal_count_lines.count_id')
      .select(['seal_count_lines.count_id', 'seal_count_lines.variance_qty']).where('seal_cycle_counts.tenant_id', '=', request.user.tenant_id).execute();
    return counts.map(c => ({ ...c, line_count: lines.filter(l => l.count_id === c.id).length,
      variance_count: lines.filter(l => l.count_id === c.id && l.variance_qty != null && Number(l.variance_qty) !== 0).length }));
  }));

  app.post('/cycle-counts', async (request: any, reply) => {
    const body = z.object({ compartmentId: z.string().uuid().optional(), notes: z.string().max(2000).optional() }).parse(request.body);
    try {
      return await withTenant(request.user.tenant_id, async trx => {
        const tid = request.user.tenant_id;
        if (body.compartmentId && !await trx.selectFrom('seal_compartments').select('id').where('tenant_id', '=', tid).where('id', '=', body.compartmentId).executeTakeFirst()) {
          throw new Error('Warehouse not found.');
        }
        let query = trx.selectFrom('seal_lots').select(['id', 'qty_on_hand']).where('tenant_id', '=', tid).orderBy('id');
        if (body.compartmentId) query = query.where('compartment_id', '=', body.compartmentId);
        const lots = await query.where('qty_on_hand', '>', '0').forUpdate().execute();
        if (!lots.length) throw new Error('No stocked lots to count in this scope.');
        const count = await trx.insertInto('seal_cycle_counts').values({ tenant_id: tid, count_ref: `CC-${randomUUID().slice(0, 12)}`,
          compartment_id: body.compartmentId ?? null, initiated_by: request.user.sub, closed_by: null, closed_at: null, notes: body.notes ?? null }).returningAll().executeTakeFirstOrThrow();
        await trx.insertInto('seal_count_lines').values(lots.map(l => ({ count_id: count.id, lot_id: l.id, system_qty: l.qty_on_hand, counted_qty: null, counted_by: null, counted_at: null, notes: null }))).execute();
        return count;
      });
    } catch (e: any) { return reply.code(400).send({ error: e.message }); }
  });

  app.get('/cycle-counts/:id', async (request: any, reply) => {
    try {
      return await withTenant(request.user.tenant_id, async trx => {
        const count = await trx.selectFrom('seal_cycle_counts').selectAll().where('tenant_id', '=', request.user.tenant_id).where('id', '=', request.params.id).executeTakeFirstOrThrow();
        const rows = await trx.selectFrom('seal_count_lines').innerJoin('seal_lots', 'seal_lots.id', 'seal_count_lines.lot_id')
          .select(['seal_count_lines.id', 'seal_count_lines.lot_id', 'seal_count_lines.system_qty', 'seal_count_lines.counted_qty', 'seal_count_lines.variance_qty', 'seal_count_lines.notes', 'seal_lots.description', 'seal_lots.uom'])
          .where('seal_lots.tenant_id', '=', request.user.tenant_id).where('count_id', '=', count.id).execute();
        return { ...count, lines: rows.map(l => ({ id: l.id, lotId: l.lot_id, description: l.description, uom: l.uom,
          systemQty: Number(l.system_qty), countedQty: l.counted_qty == null ? null : Number(l.counted_qty),
          varianceQty: l.variance_qty == null ? null : Number(l.variance_qty), notes: l.notes })) };
      });
    } catch { return reply.code(404).send({ error: 'Cycle count not found.' }); }
  });

  app.patch('/cycle-counts/:id/lines/:lineId', async (request: any, reply) => {
    const body = z.object({ countedQty: z.number().finite().nonnegative(), notes: z.string().max(2000).optional() }).parse(request.body);
    try {
      return await withTenant(request.user.tenant_id, async trx => {
        const count = await trx.selectFrom('seal_cycle_counts').selectAll().where('tenant_id', '=', request.user.tenant_id).where('id', '=', request.params.id).forUpdate().executeTakeFirstOrThrow();
        if (['CLOSED', 'CANCELLED'].includes(count.status)) throw new Error('This count is closed.');
        const line = await trx.updateTable('seal_count_lines').set({ counted_qty: String(body.countedQty), notes: body.notes ?? null, counted_by: request.user.sub, counted_at: new Date() })
          .where('count_id', '=', count.id).where('id', '=', request.params.lineId).returningAll().executeTakeFirstOrThrow();
        await trx.updateTable('seal_cycle_counts').set({ status: 'IN_PROGRESS' }).where('tenant_id', '=', request.user.tenant_id).where('id', '=', count.id).execute();
        return line;
      });
    } catch (e: any) { return reply.code(400).send({ error: e.message }); }
  });

  app.post('/cycle-counts/:id/reconcile', async (request: any, reply) => {
    try {
      return await withTenant(request.user.tenant_id, async trx => {
        const tid = request.user.tenant_id;
        const count = await trx.selectFrom('seal_cycle_counts').selectAll().where('tenant_id', '=', tid).where('id', '=', request.params.id).forUpdate().executeTakeFirstOrThrow();
        if (count.status === 'CLOSED') return { ok: true, alreadyClosed: true };
        if (count.status === 'CANCELLED') throw new Error('This count was cancelled.');
        const lines = await trx.selectFrom('seal_count_lines').innerJoin('seal_lots', 'seal_lots.id', 'seal_count_lines.lot_id')
          .select(['seal_count_lines.lot_id', 'seal_count_lines.system_qty', 'seal_count_lines.counted_qty', 'seal_lots.qty_on_hand', 'seal_lots.qty_allocated'])
          .where('seal_lots.tenant_id', '=', tid).where('count_id', '=', count.id).orderBy('seal_lots.id').forUpdate('seal_lots').execute();
        if (!lines.length || lines.some(l => l.counted_qty == null)) throw new Error('Record every line before reconciling.');
        const movementSinceSnapshot = await trx.selectFrom('seal_movements').select('id').where('tenant_id', '=', tid)
          .where('lot_id', 'in', lines.map(l => l.lot_id)).where('occurred_at', '>', count.initiated_at).executeTakeFirst();
        if (movementSinceSnapshot) throw new Error('Stock moved after this count started. Cancel and start a fresh count.');
        for (const line of lines) {
          if (Number(line.qty_on_hand) !== Number(line.system_qty)) throw new Error('Stock moved after this count started. Cancel and start a fresh count.');
          if (Number(line.counted_qty) < Number(line.qty_allocated)) throw new Error('Counted quantity cannot be below allocated stock.');
          const delta = Number(line.counted_qty) - Number(line.system_qty);
          if (delta !== 0) await SealService.recordMovement(trx, tid, { actorId: request.user.sub, movementType: 'adjust', lotId: line.lot_id,
            qtyDelta: delta, reasonCode: 'CYCLE_COUNT', reference: count.count_ref });
        }
        await trx.updateTable('seal_cycle_counts').set({ status: 'CLOSED', closed_by: request.user.sub, closed_at: new Date() }).where('tenant_id', '=', tid).where('id', '=', count.id).execute();
        return { ok: true };
      });
    } catch (e: any) { return reply.code(409).send({ error: e.message }); }
  });

  app.post('/cycle-counts/:id/cancel', async (request: any, reply) => {
    try {
      return await withTenant(request.user.tenant_id, async trx => {
        const count = await trx.selectFrom('seal_cycle_counts').selectAll().where('tenant_id', '=', request.user.tenant_id).where('id', '=', request.params.id).forUpdate().executeTakeFirstOrThrow();
        if (count.status === 'CLOSED') throw new Error('A reconciled count cannot be cancelled.');
        await trx.updateTable('seal_cycle_counts').set({ status: 'CANCELLED', closed_by: request.user.sub, closed_at: new Date() }).where('tenant_id', '=', request.user.tenant_id).where('id', '=', count.id).execute();
        return { ok: true };
      });
    } catch (e: any) { return reply.code(409).send({ error: e.message }); }
  });
}
