import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import type { Database } from '../db/client.js';
import type { Transaction } from 'kysely';
import { requireRole } from '../middleware/rbac.js';
import { callAI } from './ai.routes.js';

const FLEET_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR'] as const;

interface OccupancyLocation {
  id: string; code: string; name: string;
  capacity_units: number | null; occupied_units: number; occupancy_pct: number | null;
}
interface OccupancyZone { zone: string; locations: OccupancyLocation[] }

/**
 * Real occupancy computed from parts_stock (the only stock-quantity data in
 * the schema tied to warehouse_locations, since migration 058's location_id
 * FK) grouped by warehouse_locations.zone (free-text). No fabricated numbers
 * — locations with no capacity_units set report occupancy_pct: null rather
 * than a divide-by-zero guess.
 */
async function computeOccupancy(trx: Transaction<Database>, tenantId: string): Promise<OccupancyZone[]> {
  const locations = await trx.selectFrom('warehouse_locations').selectAll()
    .where('tenant_id', '=', tenantId).where('active', '=', true).orderBy('code').execute();

  const stockRows = await trx.selectFrom('parts_stock')
    .select(({ fn }) => [fn.sum<number>('quantity').as('total_qty'), 'location_id'])
    .where('tenant_id', '=', tenantId).where('location_id', 'is not', null)
    .groupBy('location_id').execute();
  const qtyByLocation = new Map<string, number>(stockRows.map((r: any) => [r.location_id, Number(r.total_qty)]));

  const zonesMap = new Map<string, OccupancyLocation[]>();
  for (const loc of locations) {
    const zoneName = loc.zone || 'Unassigned';
    const occupied = qtyByLocation.get(loc.id) ?? 0;
    const capacity = loc.capacity_units;
    const occupancy_pct = capacity ? Math.min(100, Math.round((occupied / capacity) * 1000) / 10) : null;
    const arr = zonesMap.get(zoneName) ?? [];
    arr.push({ id: loc.id, code: loc.code, name: loc.name, capacity_units: capacity, occupied_units: occupied, occupancy_pct });
    zonesMap.set(zoneName, arr);
  }
  return [...zonesMap.entries()].map(([zone, locs]) => ({ zone, locations: locs }));
}

export async function warehouseRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('tracking'));
  fastify.addHook('preHandler', requireEntitlement('tracking.warehouse'));

  // ── Locations ────────────────────────────────────────────────

  fastify.get('/warehouse/locations', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('warehouse_locations').selectAll()
        .where('tenant_id', '=', user.tenant_id).orderBy('code').execute()
    );
  });

  fastify.post('/warehouse/locations', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = req.body as { code: string; name: string; zone?: string; capacity_units?: number };
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('warehouse_locations').values({
        tenant_id: user.tenant_id, code: body.code, name: body.name,
        zone: body.zone ?? null, capacity_units: body.capacity_units ?? null,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.patch('/warehouse/locations/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as Partial<{ code: string; name: string; zone: string; capacity_units: number; active: boolean }>;
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('warehouse_locations').set({ ...body, updated_at: new Date() } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.delete('/warehouse/locations/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('warehouse_locations').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });

  // ── Dock appointments ────────────────────────────────────────

  fastify.get('/warehouse/dock-appointments', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('warehouse_dock_appointments').selectAll()
        .where('tenant_id', '=', user.tenant_id).orderBy('scheduled_at').execute()
    );
  });

  fastify.post('/warehouse/dock-appointments', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = req.body as {
      dock_number: string; appointment_type: 'INBOUND' | 'OUTBOUND';
      vehicle_id?: string; reference?: string; scheduled_at: string; notes?: string;
    };
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('warehouse_dock_appointments').values({
        tenant_id: user.tenant_id, dock_number: body.dock_number,
        appointment_type: body.appointment_type, vehicle_id: body.vehicle_id ?? null,
        reference: body.reference ?? null, scheduled_at: new Date(body.scheduled_at),
        notes: body.notes ?? null, created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.patch('/warehouse/dock-appointments/:id/check-in', async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('warehouse_dock_appointments').set({ status: 'CHECKED_IN', updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.patch('/warehouse/dock-appointments/:id/complete', async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('warehouse_dock_appointments').set({ status: 'COMPLETED', updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.patch('/warehouse/dock-appointments/:id/cancel', async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('warehouse_dock_appointments').set({ status: 'CANCELLED', updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.delete('/warehouse/dock-appointments/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('warehouse_dock_appointments').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });

  // ── Occupancy heatmap ────────────────────────────────────────

  fastify.get('/warehouse/occupancy', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, (trx) => computeOccupancy(trx, user.tenant_id));
  });

  // ── AI rearrangement insight ─────────────────────────────────
  // Real computed signals (over-capacity / near-empty / uncapacitied
  // locations) narrated by the tenant's configured AI provider — same
  // pattern as GET /v1/ai/insights. On-demand only, since it costs an LLM
  // call; 400s if the tenant hasn't configured int-ai, same as /v1/ai/insights.

  fastify.get('/warehouse/insights', async (req, reply) => {
    const user = req.user;

    const { zones, aiCfg } = await withTenant(user.tenant_id, async (trx) => {
      const zones = await computeOccupancy(trx, user.tenant_id);
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
      return { zones, aiCfg: settings['int-ai'] ?? {} };
    });

    if (!aiCfg.on || !aiCfg.apiKey) {
      return reply.status(400).send({ error: 'AI is not configured. Enable it in Settings > Integrations > AI Integration.' });
    }

    const allLocations = zones.flatMap(z => z.locations.map(l => ({ zone: z.zone, ...l })));
    const signals = {
      over_capacity: allLocations.filter(l => (l.occupancy_pct ?? 0) > 85),
      near_empty: allLocations.filter(l => l.occupancy_pct != null && l.occupancy_pct < 20),
      missing_capacity: allLocations.filter(l => l.capacity_units == null).map(l => ({ zone: l.zone, code: l.code, name: l.name })),
    };

    if (signals.over_capacity.length === 0 && signals.near_empty.length === 0 && signals.missing_capacity.length === 0) {
      return { suggestion: 'No rearrangement needed — all warehouse locations with capacity set are within a healthy occupancy range.', signals };
    }

    try {
      const suggestion = await callAI(
        aiCfg.apiKey,
        aiCfg.model || 'claude-sonnet-4-6',
        aiCfg.provider || 'anthropic',
        [{
          role: 'user',
          content: `You are a warehouse operations analyst. Given this real, computed occupancy data (JSON below), write 1-2 short, specific rearrangement suggestions (plain text, "- " prefixes, no markdown headers). Reference real location codes/zones/percentages from the data — never invent numbers. If missing_capacity is non-empty, mention that those locations need a capacity set before they can be managed.\n\n${JSON.stringify(signals, null, 2)}`,
        }],
        300, 0.3
      );
      return { suggestion, signals };
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });
}
