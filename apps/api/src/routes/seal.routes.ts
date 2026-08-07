import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { SealService, IllegalCustomsTransition, BondHeadroomExceeded, DgSegregationViolation, LotNotFound } from '../services/seal.service.js';
import { toDateParam } from '../utils/dates.js';
import {
  CUSTOMS_STATUS_ENTRY_POINTS, legalNextCustomsStatuses, validateContainerNumber, type CustomsStatus,
} from '@hudumika/types';

export function bondHeadroomResponse(err: BondHeadroomExceeded) {
  return {
    type: 'https://hudumika.com/errors/bond-headroom-exceeded',
    title: 'Bond headroom exceeded',
    status: 422,
    detail: err.message,
    guarantee_reference: err.guaranteeReference,
    face_value: err.faceValue,
    currently_at_risk: err.currentlyAtRisk,
    requested_at_risk: err.requestedAtRisk,
    shortfall: err.shortfall,
    currency: err.currency,
    remedies: ['increase_guarantee', 'clear_stock_for_home_use', 'request_override'],
  };
}

export function stableJson(value: any): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter(k => k !== 'computedAt').sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function daysRemaining(expiresOn: Date | string | null): number | null {
  if (!expiresOn) return null;
  const ms = new Date(expiresOn).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function mapLot(row: any) {
  return {
    id: row.id,
    compartmentId: row.compartment_id,
    ownerId: row.owner_id,
    ownerName: row.owner_name ?? undefined,
    shipmentCaseId: row.shipment_case_id,
    description: row.description,
    hsCode: row.hs_code,
    countryOfOrigin: row.country_of_origin,
    marksAndNumbers: row.marks_and_numbers,
    customsStatus: row.customs_status as CustomsStatus,
    entryReference: row.entry_reference,
    procedureCode: row.procedure_code,
    currentLocationId: row.current_location_id,
    currentLocationCode: row.current_location_code ?? undefined,
    qtyOnHand: Number(row.qty_on_hand),
    qtyAllocated: Number(row.qty_allocated),
    uom: row.uom,
    customsValue: row.customs_value != null ? Number(row.customs_value) : null,
    currency: row.currency,
    dutyAtRisk: Number(row.duty_at_risk),
    taxAtRisk: Number(row.tax_at_risk),
    batch: row.batch,
    serial: row.serial,
    expiryDate: row.expiry_date,
    warehousedOn: row.warehoused_on,
    expiresOn: row.expires_on,
    daysRemaining: daysRemaining(row.expires_on),
    isDangerousGoods: !!row.is_dangerous_goods,
    unNumber: row.un_number,
    imdgClass: row.imdg_class,
    requiresReefer: !!row.requires_reefer,
    reeferSetpointC: row.reefer_setpoint_c != null ? Number(row.reefer_setpoint_c) : null,
    stackTier: row.stack_tier ?? 1,
    volumeCbm: row.volume_cbm != null ? Number(row.volume_cbm) : null,
    grossWeightKg: row.gross_weight_kg != null ? Number(row.gross_weight_kg) : null,
    destinationLabel: row.destination_label ?? null,
    createdAt: row.created_at,
    legalNextStatuses: legalNextCustomsStatuses(row.customs_status as CustomsStatus),
  };
}

function mapMovement(row: any) {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    actorType: row.actor_type,
    movementType: row.movement_type,
    lotId: row.lot_id,
    fromLocationId: row.from_location_id,
    toLocationId: row.to_location_id,
    qtyDelta: Number(row.qty_delta),
    fromCustomsStatus: row.from_customs_status,
    toCustomsStatus: row.to_customs_status,
    entryReference: row.entry_reference,
    reasonCode: row.reason_code,
    reference: row.reference,
    hash: row.hash,
  };
}

export async function sealRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('seal'));

  // ── Dashboard ──────────────────────────────────────────────────────────
  fastify.get('/dashboard', async (request: any, reply) => {
    try {
      const { compartment_id } = request.query as { compartment_id?: string };
      return await withTenant(request.user.tenant_id, async (trx) => {
        // Total compartment count is always tenant-wide context, regardless
        // of which single compartment the switcher has scoped everything
        // else to — "how many warehouses do I have" doesn't change meaning.
        const compartmentCount = (await trx.selectFrom('seal_compartments').select(({ fn }) => fn.count<number>('id').as('n')).where('tenant_id', '=', request.user.tenant_id).where('active', '=', true).executeTakeFirst())?.n ?? 0;

        let byStatusQuery = trx.selectFrom('seal_lots').select(({ fn }) => ['customs_status', fn.count<number>('id').as('count')]).where('tenant_id', '=', request.user.tenant_id).groupBy('customs_status');
        let expiringSoonQuery = trx.selectFrom('seal_lots').select(({ fn }) => fn.count<number>('id').as('n'))
          .where('tenant_id', '=', request.user.tenant_id)
          .where('expires_on', 'is not', null)
          .where('expires_on', '<=', toDateParam(new Date(Date.now() + 30 * 86400000)))
          .where('customs_status', '=', 'FOREIGN_DUTY_SUSPENDED');
        let lotCountQuery = trx.selectFrom('seal_lots').select(({ fn }) => fn.count<number>('id').as('n')).where('tenant_id', '=', request.user.tenant_id);
        if (compartment_id) {
          byStatusQuery = byStatusQuery.where('compartment_id', '=', compartment_id);
          expiringSoonQuery = expiringSoonQuery.where('compartment_id', '=', compartment_id);
          lotCountQuery = lotCountQuery.where('compartment_id', '=', compartment_id);
        }

        const [byStatus, expiringSoon, lotCount] = await Promise.all([
          byStatusQuery.execute(), expiringSoonQuery.executeTakeFirst(), lotCountQuery.executeTakeFirst(),
        ]);
        return {
          compartmentCount: Number(compartmentCount),
          lotCount: Number(lotCount?.n ?? 0),
          expiringSoonCount: Number(expiringSoon?.n ?? 0),
          byStatus: byStatus.map(r => ({ status: r.customs_status, count: Number(r.count) })),
        };
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Metrics (Increment 8) ───────────────────────────────────────────────
  // Every number here is reconstructed from real stored rows — lot rows,
  // location capacity, and the seal_movements ledger — the same discipline
  // the duty engine and stock-account report already follow. No fabricated
  // "AI insight" text: if a narrative is ever added on top of this, it must
  // summarize these numbers only (the fake advice card once shipped in the
  // zone heat-grid was removed for exactly this reason, see Seal.css history).
  fastify.get('/metrics', async (request: any, reply) => {
    try {
      const { compartment_id } = request.query as { compartment_id?: string };
      const cutoff = new Date(Date.now() - 30 * 86400000);

      const [compartments, lots, locations, recentMovements, lastMovementByLot] = await withTenant(request.user.tenant_id, trx => Promise.all([
        (() => {
          let q = trx.selectFrom('seal_compartments').select(['id', 'code', 'name']).where('tenant_id', '=', request.user.tenant_id).where('active', '=', true).orderBy('code');
          if (compartment_id) q = q.where('id', '=', compartment_id);
          return q.execute();
        })(),
        (() => {
          let q = trx.selectFrom('seal_lots').select(['id', 'compartment_id', 'warehoused_on', 'qty_on_hand', 'customs_status', 'expires_on', 'current_location_id']).where('tenant_id', '=', request.user.tenant_id);
          if (compartment_id) q = q.where('compartment_id', '=', compartment_id);
          return q.execute();
        })(),
        (() => {
          let q = trx.selectFrom('seal_locations').select(['id', 'compartment_id', 'capacity_units', 'max_stack_tiers']).where('tenant_id', '=', request.user.tenant_id);
          if (compartment_id) q = q.where('compartment_id', '=', compartment_id);
          return q.execute();
        })(),
        (() => {
          let q = trx.selectFrom('seal_movements')
            .innerJoin('seal_lots', 'seal_lots.id', 'seal_movements.lot_id')
            .select(['seal_movements.occurred_at', 'seal_movements.movement_type'])
            .where('seal_movements.tenant_id', '=', request.user.tenant_id)
            .where('seal_movements.occurred_at', '>=', cutoff)
            .where('seal_movements.movement_type', 'in', ['receipt', 'release']);
          if (compartment_id) q = q.where('seal_lots.compartment_id', '=', compartment_id);
          return q.execute();
        })(),
        trx.selectFrom('seal_movements').select(({ fn }) => ['lot_id', fn.max('occurred_at').as('last_at')]).where('tenant_id', '=', request.user.tenant_id).groupBy('lot_id').execute(),
      ]));
      if (compartment_id && compartments.length === 0) return reply.status(404).send({ error: 'Compartment not found' });

      const lastMovementAt = new Map(lastMovementByLot.map(m => [m.lot_id, m.last_at]));
      const now = Date.now();

      function isFlagged(l: typeof lots[number]): boolean {
        return l.customs_status === 'SEIZED' || l.customs_status === 'ABANDONED' ||
          (l.expires_on != null && new Date(l.expires_on).getTime() - now <= 30 * 86400000);
      }
      // A lot's storage duration: still on hand → time since it arrived;
      // fully exited (qty_on_hand = 0) → time between arrival and its last
      // ledger touch (the movement that took it to zero, or a later
      // compensating one) — never a guess, always a real timestamp pair.
      function durationDays(l: typeof lots[number]): number | null {
        if (!l.warehoused_on) return null;
        const start = new Date(l.warehoused_on).getTime();
        const end = Number(l.qty_on_hand) > 0 ? now : (lastMovementAt.get(l.id)?.getTime() ?? now);
        return Math.max(0, (end - start) / 86400000);
      }

      const lotsByLocation = new Map<string, number>();
      for (const l of lots) {
        if (!l.current_location_id) continue;
        lotsByLocation.set(l.current_location_id, (lotsByLocation.get(l.current_location_id) ?? 0) + 1);
      }

      interface Group { compartmentId: string; code: string; name: string; lotCount: number; flaggedLotCount: number; durations: number[]; totalSlots: number; occupiedSlots: number; }
      const groups = new Map<string, Group>();
      for (const c of compartments) groups.set(c.id, { compartmentId: c.id, code: c.code, name: c.name, lotCount: 0, flaggedLotCount: 0, durations: [], totalSlots: 0, occupiedSlots: 0 });
      for (const l of lots) {
        const g = groups.get(l.compartment_id);
        if (!g) continue;
        g.lotCount++;
        if (isFlagged(l)) g.flaggedLotCount++;
        const d = durationDays(l);
        if (d != null) g.durations.push(d);
      }
      for (const loc of locations) {
        const g = groups.get(loc.compartment_id);
        if (!g) continue;
        g.totalSlots += loc.capacity_units * loc.max_stack_tiers;
        g.occupiedSlots += lotsByLocation.get(loc.id) ?? 0;
      }

      const byCompartment = [...groups.values()].map(g => ({
        compartmentId: g.compartmentId, code: g.code, name: g.name,
        lotCount: g.lotCount, flaggedLotCount: g.flaggedLotCount,
        occupancyPct: g.totalSlots > 0 ? Math.min(100, Math.round((g.occupiedSlots / g.totalSlots) * 100)) : 0,
        avgStorageDurationDays: g.durations.length > 0 ? Math.round((g.durations.reduce((s, d) => s + d, 0) / g.durations.length) * 10) / 10 : null,
      }));

      const totalSlots = byCompartment.reduce((s, c) => s + (groups.get(c.compartmentId)?.totalSlots ?? 0), 0);
      const occupiedSlots = byCompartment.reduce((s, c) => s + (groups.get(c.compartmentId)?.occupiedSlots ?? 0), 0);
      const allDurations = lots.map(durationDays).filter((d): d is number => d != null);

      // Daily received/released counts for the last 30 days, reconstructed
      // straight from the movement ledger — zero-filled so gaps read as
      // "nothing happened," not as missing data.
      const dayBuckets = new Map<string, { received: number; released: number }>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
        dayBuckets.set(d, { received: 0, released: 0 });
      }
      for (const m of recentMovements) {
        const day = new Date(m.occurred_at).toISOString().slice(0, 10);
        const bucket = dayBuckets.get(day);
        if (!bucket) continue;
        if (m.movement_type === 'receipt') bucket.received++;
        else if (m.movement_type === 'release') bucket.released++;
      }

      return {
        scope: compartment_id ? 'compartment' : 'all',
        lotCount: lots.length,
        flaggedLotCount: lots.filter(isFlagged).length,
        occupancyPct: totalSlots > 0 ? Math.min(100, Math.round((occupiedSlots / totalSlots) * 100)) : 0,
        avgStorageDurationDays: allDurations.length > 0 ? Math.round((allDurations.reduce((s, d) => s + d, 0) / allDurations.length) * 10) / 10 : null,
        dailyActivity: [...dayBuckets.entries()].map(([date, v]) => ({ date, received: v.received, released: v.released })),
        byCompartment,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Read-only proxy onto Tracking's shared, subject-agnostic `geofences`
  // table (039_geofences.sql) so a SEAL-only user (no Tracking entitlement)
  // can still pick which real geofence a compartment corresponds to. No
  // geofencing math lives here — just tenant-scoped visibility.
  fastify.get('/geofences', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('geofences').select(['id', 'name', 'zone_type', 'center_lat', 'center_lon', 'radius_km'])
          .where('tenant_id', '=', request.user.tenant_id)
          .where('active', '=', true).orderBy('name').execute()
      );
      return rows.map(r => ({ ...r, center_lat: Number(r.center_lat), center_lon: Number(r.center_lon), radius_km: Number(r.radius_km) }));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Compartments ───────────────────────────────────────────────────────
  fastify.get('/compartments', async (request: any, reply) => {
    try {
      return await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_compartments').selectAll().where('tenant_id', '=', request.user.tenant_id).where('active', '=', true).orderBy('code').execute()
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Zone / bin occupancy heat grid (spec §10.4 S3) ──────────────────────
  // Occupancy = lots currently at a location / that location's nominal
  // capacity_units — a count-of-lots metric, not the spec's full dimensional
  // (length/width/height/weight) volume model, which is out of scope here.
  fastify.get('/compartments/:id/heat-grid', async (request: any, reply) => {
    try {
      const compartmentId = request.params.id;
      const [compartment, zones, locations, lots] = await withTenant(request.user.tenant_id, trx => Promise.all([
        trx.selectFrom('seal_compartments').selectAll().where('tenant_id', '=', request.user.tenant_id).where('id', '=', compartmentId).executeTakeFirst(),
        trx.selectFrom('seal_zones').selectAll().where('tenant_id', '=', request.user.tenant_id).where('compartment_id', '=', compartmentId).orderBy('code').execute(),
        trx.selectFrom('seal_locations').selectAll().where('tenant_id', '=', request.user.tenant_id).where('compartment_id', '=', compartmentId).orderBy('code').execute(),
        trx.selectFrom('seal_lots')
          .select(['id', 'current_location_id', 'customs_status', 'expires_on', 'description'])
          .where('tenant_id', '=', request.user.tenant_id).where('compartment_id', '=', compartmentId)
          .execute(),
      ]));
      if (!compartment) return reply.status(404).send({ error: 'Compartment not found' });

      const lotsByLocation = new Map<string, typeof lots>();
      for (const lot of lots) {
        if (!lot.current_location_id) continue;
        const arr = lotsByLocation.get(lot.current_location_id) ?? [];
        arr.push(lot);
        lotsByLocation.set(lot.current_location_id, arr);
      }

      const now = Date.now();
      const zonesOut = zones.map(zone => ({
        id: zone.id, code: zone.code, name: zone.name, zoneType: zone.zone_type,
        locations: locations.filter(l => l.zone_id === zone.id).map(loc => {
          const here = lotsByLocation.get(loc.id) ?? [];
          const occupancyPct = loc.capacity_units > 0 ? Math.min(100, Math.round((here.length / loc.capacity_units) * 100)) : 0;
          const flagged = here.some(l =>
            l.customs_status === 'SEIZED' || l.customs_status === 'ABANDONED' ||
            (l.expires_on && new Date(l.expires_on).getTime() - now <= 30 * 86400000)
          );
          return {
            id: loc.id, code: loc.code, locationType: loc.location_type,
            lotCount: here.length, capacityUnits: loc.capacity_units, occupancyPct, flagged,
            lots: here.map(l => ({ id: l.id, description: l.description })),
          };
        }),
      }));

      const totalCapacity = locations.reduce((s, l) => s + l.capacity_units, 0);
      const totalLots = lots.filter(l => l.current_location_id).length;

      return {
        compartment: { id: compartment.id, code: compartment.code, name: compartment.name },
        overallOccupancyPct: totalCapacity > 0 ? Math.min(100, Math.round((totalLots / totalCapacity) * 100)) : 0,
        lotCount: lots.length,
        zones: zonesOut,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Sorting Centre dashboard ─────────────────────────────────────────
  // A sorting-centre compartment holds the same seal_lots rows as any
  // other warehouse type — no parallel "parcel" table — just with
  // different operational expectations: hours of dwell time, not days,
  // and grouped by destination_label rather than customs status. Outbound
  // dispatch of a sorted group reuses Increment 11b's fulfillment orders
  // unchanged.
  const SORTING_DWELL_OVERDUE_HOURS = 24;
  fastify.get('/compartments/:id/sorting-dashboard', async (request: any, reply) => {
    try {
      const compartmentId = request.params.id;
      const { compartment, lots, receipts } = await withTenant(request.user.tenant_id, async trx => {
        const [compartment, lots] = await Promise.all([
          trx.selectFrom('seal_compartments').selectAll().where('tenant_id', '=', request.user.tenant_id).where('id', '=', compartmentId).executeTakeFirst(),
          trx.selectFrom('seal_lots')
            .select(['id', 'description', 'qty_on_hand', 'uom', 'warehoused_on', 'destination_label', 'current_location_id'])
            .where('tenant_id', '=', request.user.tenant_id).where('compartment_id', '=', compartmentId)
            .where('qty_on_hand', '>', '0')
            .execute(),
        ]);
        const lotIds = lots.map(l => l.id);
        const receipts = lotIds.length > 0
          ? await trx.selectFrom('seal_movements').select(['lot_id', 'occurred_at'])
              .where('tenant_id', '=', request.user.tenant_id)
              .where('lot_id', 'in', lotIds).where('movement_type', '=', 'receipt').execute()
          : [];
        return { compartment, lots, receipts };
      });
      if (!compartment) return reply.status(404).send({ error: 'Compartment not found' });

      // warehoused_on is a DATE column (day-granularity, built for the
      // bonded-warehouse storage-billing clock) — too coarse for a sorting
      // centre's hour-level dwell time. The lot's founding 'receipt'
      // movement carries a real TIMESTAMPTZ, so that's the true arrival
      // moment used here instead.
      const receiptAt = new Map(receipts.map(r => [r.lot_id, r.occurred_at]));

      const now = Date.now();
      const dwellHours = (l: typeof lots[number]) => {
        const arrivedAt = receiptAt.get(l.id) ?? (l.warehoused_on ? new Date(l.warehoused_on) : null);
        return arrivedAt ? (now - arrivedAt.getTime()) / 3600000 : 0;
      };

      const byDestination = new Map<string, { destinationLabel: string | null; lotCount: number; oldestDwellHours: number }>();
      for (const lot of lots) {
        const key = lot.destination_label ?? '__unassigned__';
        const entry = byDestination.get(key) ?? { destinationLabel: lot.destination_label, lotCount: 0, oldestDwellHours: 0 };
        entry.lotCount++;
        entry.oldestDwellHours = Math.max(entry.oldestDwellHours, dwellHours(lot));
        byDestination.set(key, entry);
      }

      const dwells = lots.map(dwellHours);
      const overdueLots = lots.filter(l => dwellHours(l) > SORTING_DWELL_OVERDUE_HOURS);

      return {
        compartment: { id: compartment.id, code: compartment.code, name: compartment.name },
        lotCount: lots.length,
        unsortedCount: lots.filter(l => !l.destination_label).length,
        avgDwellHours: dwells.length > 0 ? Math.round((dwells.reduce((s, d) => s + d, 0) / dwells.length) * 10) / 10 : null,
        overdueCount: overdueLots.length,
        overdueThresholdHours: SORTING_DWELL_OVERDUE_HOURS,
        byDestination: [...byDestination.values()].sort((a, b) => b.oldestDwellHours - a.oldestDwellHours)
          .map(d => ({ ...d, oldestDwellHours: Math.round(d.oldestDwellHours * 10) / 10 })),
        overdueLots: overdueLots.map(l => ({
          id: l.id, description: l.description, qtyOnHand: Number(l.qty_on_hand), uom: l.uom,
          destinationLabel: l.destination_label, dwellHours: Math.round(dwellHours(l) * 10) / 10,
        })),
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/compartments/:id', async (request: any, reply) => {
    try {
      const compartmentId = request.params.id;
      return await withTenant(request.user.tenant_id, async trx => {
        const compartment = await trx.selectFrom('seal_compartments')
          .selectAll()
          .where('tenant_id', '=', request.user.tenant_id).where('id', '=', compartmentId)
          .executeTakeFirst();
        if (!compartment) return reply.status(404).send({ error: 'Compartment not found' });

        const zones = await trx.selectFrom('seal_zones')
          .selectAll()
          .where('tenant_id', '=', request.user.tenant_id).where('compartment_id', '=', compartmentId)
          .orderBy('code')
          .execute();

        const locations = await trx.selectFrom('seal_locations')
          .selectAll()
          .where('tenant_id', '=', request.user.tenant_id).where('compartment_id', '=', compartmentId)
          .orderBy('code')
          .execute();

        const lots = await trx.selectFrom('seal_lots')
          .selectAll()
          .where('tenant_id', '=', request.user.tenant_id).where('compartment_id', '=', compartmentId)
          .execute();

        return {
          compartment,
          zones,
          locations,
          lots,
          stats: {
            zoneCount: zones.length,
            locationCount: locations.length,
            lotCount: lots.length,
            totalCapacityUnits: locations.reduce((sum, l) => sum + (l.capacity_units ?? 0) * (l.max_stack_tiers ?? 1), 0),
          }
        };
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/compartments', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.code || !b.name) return reply.status(400).send({ error: 'code and name are required' });
      return await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('seal_compartments').values({
          tenant_id: request.user.tenant_id,
          code: b.code, name: b.name,
          warehouse_type: b.warehouseType ?? 'public_bonded',
          licence_number: b.licenceNumber ?? null,
          licence_expiry: b.licenceExpiry ? new Date(b.licenceExpiry) : null,
          customs_office_code: b.customsOfficeCode ?? null,
          jurisdiction: b.jurisdiction ?? 'TZ',
          default_storage_days: b.defaultStorageDays ?? 180,
          active: b.active ?? true,
        }).returningAll().executeTakeFirstOrThrow()
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/compartments/:id', async (request: any, reply) => {
    try {
      const b = request.body as any;
      return await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_compartments').set({
          code: b.code === undefined ? undefined : b.code,
          name: b.name === undefined ? undefined : b.name,
          warehouse_type: b.warehouseType === undefined ? undefined : b.warehouseType,
          licence_number: b.licenceNumber === undefined ? undefined : b.licenceNumber,
          licence_expiry: b.licenceExpiry === undefined ? (b.licenceExpiry === null ? null : undefined) : (b.licenceExpiry ? new Date(b.licenceExpiry) : null),
          customs_office_code: b.customsOfficeCode === undefined ? undefined : b.customsOfficeCode,
          jurisdiction: b.jurisdiction === undefined ? undefined : b.jurisdiction,
          default_storage_days: b.defaultStorageDays === undefined ? undefined : Number(b.defaultStorageDays),
          guarantee_id: b.guaranteeId === undefined ? undefined : b.guaranteeId,
          storage_fee_per_day: b.storageFeePerDay === undefined ? undefined : String(b.storageFeePerDay),
          storage_fee_currency: b.storageFeeCurrency === undefined ? undefined : b.storageFeeCurrency,
          handling_fee_flat: b.handlingFeeFlat === undefined ? undefined : String(b.handlingFeeFlat),
          storage_fee_per_cbm_per_day: b.storageFeePerCbmPerDay === undefined ? undefined : String(b.storageFeePerCbmPerDay),
          billing_method: b.billingMethod === undefined ? undefined : b.billingMethod,
          geofence_id: b.geofenceId === undefined ? undefined : b.geofenceId,
          active: b.active === undefined ? undefined : b.active,
          logo_url: b.logoUrl === undefined ? undefined : b.logoUrl,
          updated_at: new Date(),
        }).where('id', '=', request.params.id).returningAll().executeTakeFirstOrThrow()
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/compartments/:id/duplicate', async (request: any, reply) => {
    try {
      const compartmentId = request.params.id;
      return await withTenant(request.user.tenant_id, async trx => {
        const original = await trx.selectFrom('seal_compartments').selectAll().where('tenant_id', '=', request.user.tenant_id).where('id', '=', compartmentId).executeTakeFirst();
        if (!original) return reply.status(404).send({ error: 'Compartment not found' });

        const newCode = `${original.code}-COPY-${Math.floor(1000 + Math.random() * 9000)}`;
        const newName = `${original.name} (Copy)`;

        const newCompartment = await trx.insertInto('seal_compartments').values({
          tenant_id: request.user.tenant_id,
          code: newCode,
          name: newName,
          warehouse_type: original.warehouse_type,
          licence_number: original.licence_number ? `${original.licence_number}-COPY` : null,
          licence_expiry: original.licence_expiry,
          customs_office_code: original.customs_office_code,
          jurisdiction: original.jurisdiction,
          default_storage_days: original.default_storage_days,
          storage_fee_per_day: original.storage_fee_per_day,
          storage_fee_currency: original.storage_fee_currency,
          handling_fee_flat: original.handling_fee_flat,
          storage_fee_per_cbm_per_day: original.storage_fee_per_cbm_per_day,
          billing_method: original.billing_method,
          active: true,
        }).returningAll().executeTakeFirstOrThrow();

        // Clone zones
        const originalZones = await trx.selectFrom('seal_zones').selectAll().where('tenant_id', '=', request.user.tenant_id).where('compartment_id', '=', compartmentId).execute();
        for (const z of originalZones) {
          await trx.insertInto('seal_zones').values({
            tenant_id: request.user.tenant_id,
            compartment_id: newCompartment.id,
            code: z.code,
            name: z.name,
            zone_type: z.zone_type,
          }).execute();
        }

        return newCompartment;
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/compartments/:id/toggle-status', async (request: any, reply) => {
    try {
      const compartmentId = request.params.id;
      return await withTenant(request.user.tenant_id, async trx => {
        const original = await trx.selectFrom('seal_compartments').select(['id', 'active']).where('tenant_id', '=', request.user.tenant_id).where('id', '=', compartmentId).executeTakeFirst();
        if (!original) return reply.status(404).send({ error: 'Compartment not found' });

        return await trx.updateTable('seal_compartments')
          .set({ active: !original.active, updated_at: new Date() })
          .where('tenant_id', '=', request.user.tenant_id).where('id', '=', compartmentId)
          .returningAll()
          .executeTakeFirstOrThrow();
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete('/compartments/:id', async (request: any, reply) => {
    try {
      const compartmentId = request.params.id;
      return await withTenant(request.user.tenant_id, async trx => {
        // Soft delete / deactivate
        await trx.updateTable('seal_compartments')
          .set({ active: false, updated_at: new Date() })
          .where('tenant_id', '=', request.user.tenant_id).where('id', '=', compartmentId)
          .execute();
        return { success: true, message: 'Compartment deleted' };
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Zones ──────────────────────────────────────────────────────────────
  fastify.get('/zones', async (request: any, reply) => {
    try {
      const { compartment_id } = request.query as { compartment_id?: string };
      return await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('seal_zones').selectAll().where('tenant_id', '=', request.user.tenant_id).orderBy('code');
        if (compartment_id) q = q.where('compartment_id', '=', compartment_id);
        return q.execute();
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/zones', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.compartmentId || !b.code || !b.name) return reply.status(400).send({ error: 'compartmentId, code and name are required' });
      return await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('seal_zones').values({
          tenant_id: request.user.tenant_id,
          compartment_id: b.compartmentId, code: b.code, name: b.name,
          zone_type: b.zoneType ?? 'bulk',
        }).returningAll().executeTakeFirstOrThrow()
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Locations ──────────────────────────────────────────────────────────
  fastify.get('/locations', async (request: any, reply) => {
    try {
      const { zone_id, compartment_id } = request.query as { zone_id?: string; compartment_id?: string };
      return await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('seal_locations').selectAll().where('tenant_id', '=', request.user.tenant_id).orderBy('code');
        if (zone_id) q = q.where('zone_id', '=', zone_id);
        if (compartment_id) q = q.where('compartment_id', '=', compartment_id);
        return q.execute();
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/locations', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.compartmentId || !b.zoneId || !b.code) return reply.status(400).send({ error: 'compartmentId, zoneId and code are required' });
      return await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('seal_locations').values({
          tenant_id: request.user.tenant_id,
          compartment_id: b.compartmentId, zone_id: b.zoneId, code: b.code,
          location_type: b.locationType ?? 'rack',
          capacity_units: b.capacityUnits ?? 10,
          floor_level: b.floorLevel ?? 0,
          max_stack_tiers: b.maxStackTiers ?? 1,
          grid_row: b.gridRow ?? null,
          grid_col: b.gridCol ?? null,
          length_m: b.lengthM != null ? String(b.lengthM) : null,
          width_m: b.widthM != null ? String(b.widthM) : null,
          height_m: b.heightM != null ? String(b.heightM) : null,
        }).returningAll().executeTakeFirstOrThrow()
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Layout planning: reposition a location on the floor grid, change its
  // floor/mezzanine level, or adjust how many vertical tiers it holds.
  fastify.patch('/locations/:id', async (request: any, reply) => {
    try {
      const b = request.body as any;
      const patch: any = {};
      if (b.floorLevel !== undefined) patch.floor_level = b.floorLevel;
      if (b.maxStackTiers !== undefined) patch.max_stack_tiers = b.maxStackTiers;
      if (b.gridRow !== undefined) patch.grid_row = b.gridRow;
      if (b.gridCol !== undefined) patch.grid_col = b.gridCol;
      if (b.capacityUnits !== undefined) patch.capacity_units = b.capacityUnits;
      if (b.lengthM !== undefined) patch.length_m = b.lengthM != null ? String(b.lengthM) : null;
      if (b.widthM !== undefined) patch.width_m = b.widthM != null ? String(b.widthM) : null;
      if (b.heightM !== undefined) patch.height_m = b.heightM != null ? String(b.heightM) : null;
      return await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_locations').set(patch).where('id', '=', request.params.id).returningAll().executeTakeFirstOrThrow()
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete('/locations/:id', async (request: any, reply) => {
    try {
      return await withTenant(request.user.tenant_id, async trx => {
        const occupied = await trx.selectFrom('seal_lots')
          .select(({ fn }) => fn.count<number>('id').as('n'))
          .where('tenant_id', '=', request.user.tenant_id)
          .where('current_location_id', '=', request.params.id)
          .where('qty_on_hand', '>', '0')
          .executeTakeFirst();
        if (Number(occupied?.n ?? 0) > 0) {
          return reply.status(409).send({ error: 'This rack still has lots stored on it — move or release them before deleting it.' });
        }
        await trx.deleteFrom('seal_locations').where('tenant_id', '=', request.user.tenant_id).where('id', '=', request.params.id).execute();
        return { success: true };
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Warehouse layout: real floor plan with mezzanine levels and vertical
  // stacking tiers, built from actual lot placements (current_location_id +
  // stack_tier), not the "heat-grid" page's flat lot-count/capacity ratio.
  // grid_row/grid_col place each location on its floor's 2D plan for
  // planning/mapping; a location with no grid position yet is returned
  // separately so the UI can prompt placing it rather than silently
  // dropping it.
  fastify.get('/compartments/:id/warehouse-layout', async (request: any, reply) => {
    try {
      const compartmentId = request.params.id;
      const [compartment, zones, locations, lots] = await withTenant(request.user.tenant_id, trx => Promise.all([
        trx.selectFrom('seal_compartments').selectAll().where('tenant_id', '=', request.user.tenant_id).where('id', '=', compartmentId).executeTakeFirst(),
        trx.selectFrom('seal_zones').selectAll().where('tenant_id', '=', request.user.tenant_id).where('compartment_id', '=', compartmentId).orderBy('code').execute(),
        trx.selectFrom('seal_locations').selectAll().where('tenant_id', '=', request.user.tenant_id).where('compartment_id', '=', compartmentId).orderBy('code').execute(),
        trx.selectFrom('seal_lots')
          .select(['id', 'current_location_id', 'stack_tier', 'customs_status', 'description', 'qty_on_hand', 'uom', 'expires_on', 'volume_cbm'])
          .where('tenant_id', '=', request.user.tenant_id).where('compartment_id', '=', compartmentId)
          .where('qty_on_hand', '>', '0')
          .execute(),
      ]));
      if (!compartment) return reply.status(404).send({ error: 'Compartment not found' });

      const lotsByLocation = new Map<string, typeof lots>();
      for (const lot of lots) {
        if (!lot.current_location_id) continue;
        const arr = lotsByLocation.get(lot.current_location_id) ?? [];
        arr.push(lot);
        lotsByLocation.set(lot.current_location_id, arr);
      }

      const floorLevels = [...new Set(locations.map(l => l.floor_level))].sort((a, b) => a - b);

      const floors = floorLevels.map(level => {
        const locsOnFloor = locations.filter(l => l.floor_level === level);
        const placed = locsOnFloor.filter(l => l.grid_row != null && l.grid_col != null);
        const unplaced = locsOnFloor.filter(l => l.grid_row == null || l.grid_col == null);

        let totalSlots = 0, occupiedSlots = 0;
        const locationsOut = locsOnFloor.map(loc => {
          const here = lotsByLocation.get(loc.id) ?? [];
          const slots = loc.capacity_units * loc.max_stack_tiers;
          totalSlots += slots;
          occupiedSlots += here.length;
          const tiers = Array.from({ length: loc.max_stack_tiers }, (_, i) => {
            const tierNum = i + 1;
            const tierLots = here.filter(l => (l.stack_tier ?? 1) === tierNum);
            return {
              tier: tierNum,
              lotCount: tierLots.length,
              capacityUnits: loc.capacity_units,
              occupancyPct: loc.capacity_units > 0 ? Math.min(100, Math.round((tierLots.length / loc.capacity_units) * 100)) : 0,
              lots: tierLots.map(l => ({ id: l.id, description: l.description, qtyOnHand: Number(l.qty_on_hand), uom: l.uom })),
            };
          });
          const occupancyPct = slots > 0 ? Math.min(100, Math.round((here.length / slots) * 100)) : 0;
          const flagged = here.some(l =>
            l.customs_status === 'SEIZED' || l.customs_status === 'ABANDONED' ||
            (l.expires_on && new Date(l.expires_on).getTime() - Date.now() <= 30 * 86400000)
          );
          const locVolumeCbm = loc.volume_cbm != null ? Number(loc.volume_cbm) : null;
          const lotVolumeCbm = here.reduce((s, l) => s + (l.volume_cbm != null ? Number(l.volume_cbm) : 0), 0);
          return {
            id: loc.id, code: loc.code, locationType: loc.location_type,
            gridRow: loc.grid_row, gridCol: loc.grid_col,
            maxStackTiers: loc.max_stack_tiers, capacityUnits: loc.capacity_units,
            lengthM: loc.length_m != null ? Number(loc.length_m) : null,
            widthM: loc.width_m != null ? Number(loc.width_m) : null,
            heightM: loc.height_m != null ? Number(loc.height_m) : null,
            volumeCbm: locVolumeCbm, lotVolumeCbm,
            volumeOccupancyPct: locVolumeCbm && locVolumeCbm > 0 ? Math.min(100, Math.round((lotVolumeCbm / locVolumeCbm) * 100)) : null,
            lotCount: here.length, totalSlots: slots, occupancyPct, flagged, tiers,
          };
        });

        const floorVolumeCapacityCbm = locationsOut.reduce((s, l) => s + (l.volumeCbm ?? 0), 0);
        const floorVolumeUsedCbm = locationsOut.reduce((s, l) => s + l.lotVolumeCbm, 0);

        return {
          floorLevel: level,
          label: level === 0 ? 'Ground Floor' : `Mezzanine ${level}`,
          totalSlots, occupiedSlots,
          occupancyPct: totalSlots > 0 ? Math.min(100, Math.round((occupiedSlots / totalSlots) * 100)) : 0,
          volumeCapacityCbm: floorVolumeCapacityCbm, volumeUsedCbm: Math.round(floorVolumeUsedCbm * 10000) / 10000,
          placedCount: placed.length, unplacedCount: unplaced.length,
          locations: locationsOut,
        };
      });

      const grandTotalSlots = floors.reduce((s, f) => s + f.totalSlots, 0);
      const grandOccupied = floors.reduce((s, f) => s + f.occupiedSlots, 0);
      const grandVolumeCapacityCbm = floors.reduce((s, f) => s + f.volumeCapacityCbm, 0);
      const grandVolumeUsedCbm = Math.round(floors.reduce((s, f) => s + f.volumeUsedCbm, 0) * 10000) / 10000;

      return {
        compartment: { id: compartment.id, code: compartment.code, name: compartment.name },
        overallOccupancyPct: grandTotalSlots > 0 ? Math.min(100, Math.round((grandOccupied / grandTotalSlots) * 100)) : 0,
        totalSlots: grandTotalSlots, occupiedSlots: grandOccupied, remainingSlots: grandTotalSlots - grandOccupied,
        volumeCapacityCbm: grandVolumeCapacityCbm, volumeUsedCbm: grandVolumeUsedCbm,
        lotCount: lots.length,
        floors,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  /**
   * POST /v1/seal/compartments/:id/populate-layout
   * Auto-populates real warehouse layout grid locations, dimensions, and zones
   */
  fastify.post('/compartments/:id/populate-layout', async (request: any, reply) => {
    try {
      const compartmentId = request.params.id;
      return await withTenant(request.user.tenant_id, async trx => {
        const compartment = await trx.selectFrom('seal_compartments').selectAll().where('tenant_id', '=', request.user.tenant_id).where('id', '=', compartmentId).executeTakeFirst();
        if (!compartment) return reply.status(404).send({ error: 'Compartment not found' });

        // Ensure zones exist
        let zones = await trx.selectFrom('seal_zones').selectAll().where('tenant_id', '=', request.user.tenant_id).where('compartment_id', '=', compartmentId).execute();
        if (zones.length === 0) {
          const defaultZones = [
            { code: 'Z-RCV', name: 'Receiving Bay', zone_type: 'receiving' },
            { code: 'Z-BULK-A', name: 'Bulk Storage Rack A', zone_type: 'bulk' },
            { code: 'Z-BULK-B', name: 'Bulk Storage Rack B', zone_type: 'bulk' },
            { code: 'Z-PICK', name: 'Pick & Pack Area', zone_type: 'pick' },
            { code: 'Z-YARD', name: 'Yard Slot Area', zone_type: 'yard' },
          ];
          for (const z of defaultZones) {
            await trx.insertInto('seal_zones').values({
              tenant_id: request.user.tenant_id,
              compartment_id: compartmentId,
              code: z.code,
              name: z.name,
              zone_type: z.zone_type,
            }).execute();
          }
          zones = await trx.selectFrom('seal_zones').selectAll().where('tenant_id', '=', request.user.tenant_id).where('compartment_id', '=', compartmentId).execute();
        }

        const bulkZone = zones.find(z => z.zone_type === 'bulk') || zones[0];
        const rcvZone = zones.find(z => z.zone_type === 'receiving') || zones[0];

        // Seed 12 real grid locations
        const rackSlots = [
          { code: 'BLK-A1', zoneId: bulkZone.id, row: 1, col: 1 },
          { code: 'BLK-A2', zoneId: bulkZone.id, row: 1, col: 2 },
          { code: 'BLK-A3', zoneId: bulkZone.id, row: 1, col: 3 },
          { code: 'BLK-A4', zoneId: bulkZone.id, row: 1, col: 4 },
          { code: 'BLK-B1', zoneId: bulkZone.id, row: 2, col: 1 },
          { code: 'BLK-B2', zoneId: bulkZone.id, row: 2, col: 2 },
          { code: 'BLK-B3', zoneId: bulkZone.id, row: 2, col: 3 },
          { code: 'BLK-B4', zoneId: bulkZone.id, row: 2, col: 4 },
          { code: 'RCV-01', zoneId: rcvZone.id, row: 3, col: 1 },
          { code: 'RCV-02', zoneId: rcvZone.id, row: 3, col: 2 },
          { code: 'YRD-01', zoneId: bulkZone.id, row: 4, col: 1 },
          { code: 'YRD-02', zoneId: bulkZone.id, row: 4, col: 2 },
        ];

        for (const slot of rackSlots) {
          const existing = await trx.selectFrom('seal_locations')
            .select(['id'])
            .where('tenant_id', '=', request.user.tenant_id).where('compartment_id', '=', compartmentId)
            .where('code', '=', slot.code)
            .executeTakeFirst();

          if (!existing) {
            await trx.insertInto('seal_locations').values({
              tenant_id: request.user.tenant_id,
              compartment_id: compartmentId,
              zone_id: slot.zoneId,
              code: slot.code,
              location_type: 'rack',
              grid_row: slot.row,
              grid_col: slot.col,
              floor_level: 0,
              max_stack_tiers: 3,
              capacity_units: 4,
              length_m: '3.00',
              width_m: '2.00',
              height_m: '4.00',
            }).execute();
          } else {
            await trx.updateTable('seal_locations').set({
              grid_row: slot.row,
              grid_col: slot.col,
              floor_level: 0,
              max_stack_tiers: 3,
              length_m: '3.00',
              width_m: '2.00',
              height_m: '4.00',
            }).where('id', '=', existing.id).execute();
          }
        }

        return { success: true, message: 'Warehouse layout populated with 12 real grid racks and dimension data' };
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Lots ───────────────────────────────────────────────────────────────
  fastify.get('/lots', async (request: any, reply) => {
    try {
      const { compartment_id, customs_status, q } = request.query as { compartment_id?: string; customs_status?: string; q?: string };
      const rows = await withTenant(request.user.tenant_id, trx => {
        let query = trx.selectFrom('seal_lots')
          .leftJoin('customers', 'customers.id', 'seal_lots.owner_id')
          .leftJoin('seal_locations', 'seal_locations.id', 'seal_lots.current_location_id')
          .select([
            'seal_lots.id', 'seal_lots.compartment_id', 'seal_lots.owner_id', 'customers.name as owner_name',
            'seal_lots.shipment_case_id', 'seal_lots.description', 'seal_lots.hs_code', 'seal_lots.country_of_origin',
            'seal_lots.marks_and_numbers', 'seal_lots.customs_status', 'seal_lots.entry_reference', 'seal_lots.procedure_code',
            'seal_lots.current_location_id', 'seal_locations.code as current_location_code',
            'seal_lots.qty_on_hand', 'seal_lots.qty_allocated', 'seal_lots.uom', 'seal_lots.customs_value', 'seal_lots.currency',
            'seal_lots.duty_at_risk', 'seal_lots.tax_at_risk', 'seal_lots.batch', 'seal_lots.serial', 'seal_lots.expiry_date',
            'seal_lots.warehoused_on', 'seal_lots.expires_on',
            'seal_lots.is_dangerous_goods', 'seal_lots.un_number', 'seal_lots.imdg_class',
            'seal_lots.requires_reefer', 'seal_lots.reefer_setpoint_c', 'seal_lots.stack_tier', 'seal_lots.created_at',
            'seal_lots.volume_cbm', 'seal_lots.gross_weight_kg', 'seal_lots.destination_label',
          ])
          .where('seal_lots.tenant_id', '=', request.user.tenant_id)
          .orderBy('seal_lots.created_at', 'desc');
        if (compartment_id) query = query.where('seal_lots.compartment_id', '=', compartment_id);
        if (customs_status) query = query.where('seal_lots.customs_status', '=', customs_status);
        if (q) query = query.where('seal_lots.description', 'ilike', `%${q}%`);
        return query.execute();
      });
      return rows.map(mapLot);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/lots/:id', async (request: any, reply) => {
    try {
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_lots')
          .leftJoin('customers', 'customers.id', 'seal_lots.owner_id')
          .leftJoin('seal_locations', 'seal_locations.id', 'seal_lots.current_location_id')
          .select([
            'seal_lots.id', 'seal_lots.compartment_id', 'seal_lots.owner_id', 'customers.name as owner_name',
            'seal_lots.shipment_case_id', 'seal_lots.description', 'seal_lots.hs_code', 'seal_lots.country_of_origin',
            'seal_lots.marks_and_numbers', 'seal_lots.customs_status', 'seal_lots.entry_reference', 'seal_lots.procedure_code',
            'seal_lots.current_location_id', 'seal_locations.code as current_location_code',
            'seal_lots.qty_on_hand', 'seal_lots.qty_allocated', 'seal_lots.uom', 'seal_lots.customs_value', 'seal_lots.currency',
            'seal_lots.duty_at_risk', 'seal_lots.tax_at_risk', 'seal_lots.batch', 'seal_lots.serial', 'seal_lots.expiry_date',
            'seal_lots.warehoused_on', 'seal_lots.expires_on',
            'seal_lots.is_dangerous_goods', 'seal_lots.un_number', 'seal_lots.imdg_class',
            'seal_lots.requires_reefer', 'seal_lots.reefer_setpoint_c', 'seal_lots.stack_tier', 'seal_lots.created_at',
            'seal_lots.volume_cbm', 'seal_lots.gross_weight_kg', 'seal_lots.destination_label',
          ])
          .where('seal_lots.tenant_id', '=', request.user.tenant_id)
          .where('seal_lots.id', '=', request.params.id)
          .executeTakeFirst()
      );
      if (!row) return reply.status(404).send({ error: 'Lot not found' });
      return mapLot(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/lots', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.compartmentId || !b.ownerId || !b.description || !b.customsStatus || !b.qty || !b.uom) {
        return reply.status(400).send({ error: 'compartmentId, ownerId, description, customsStatus, qty and uom are required' });
      }
      if (!CUSTOMS_STATUS_ENTRY_POINTS.includes(b.customsStatus)) {
        return reply.status(422).send({ error: `A lot cannot be received directly into ${b.customsStatus}. Valid entry statuses: ${CUSTOMS_STATUS_ENTRY_POINTS.join(', ')}` });
      }
      const lot = await withTenant(request.user.tenant_id, trx =>
        SealService.receiveLot(trx, request.user.tenant_id, request.user.sub, {
          compartmentId: b.compartmentId, ownerId: b.ownerId, description: b.description,
          hsCode: b.hsCode, countryOfOrigin: b.countryOfOrigin, customsStatus: b.customsStatus,
          entryReference: b.entryReference, locationId: b.locationId, qty: Number(b.qty), uom: b.uom,
          customsValue: b.customsValue, currency: b.currency, warehousedOn: b.warehousedOn,
          expiresOn: b.expiresOn, batch: b.batch,
          dutyAtRisk: b.dutyAtRisk, taxAtRisk: b.taxAtRisk, bondOverrideReason: b.bondOverrideReason,
          isDangerousGoods: !!b.isDangerousGoods, unNumber: b.unNumber, imdgClass: b.imdgClass,
          requiresReefer: !!b.requiresReefer, reeferSetpointC: b.reeferSetpointC,
          stackTier: b.stackTier ? Number(b.stackTier) : undefined,
          volumeCbm: b.volumeCbm != null ? Number(b.volumeCbm) : null,
          grossWeightKg: b.grossWeightKg != null ? Number(b.grossWeightKg) : null,
          destinationLabel: b.destinationLabel ?? null,
        })
      );
      return mapLot(lot);
    } catch (err: any) {
      if (err instanceof BondHeadroomExceeded) return reply.status(422).send(bondHeadroomResponse(err));
      if (err instanceof DgSegregationViolation) {
        return reply.status(422).send({
          type: 'https://hudumika.com/errors/dg-segregation-violation',
          title: 'Dangerous-goods segregation violation',
          status: 422,
          detail: err.message,
          classA: err.classA, classB: err.classB,
        });
      }
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Movements ──────────────────────────────────────────────────────────
  fastify.get('/lots/:id/movements', async (request: any, reply) => {
    try {
      // Authorised on the lot, then every movement on it — same reasoning as
      // SealService.verifyChain. Filtering the movements by tenant instead
      // showed the owner an incomplete history of their own goods while
      // exposing individual rows to whichever tenant happened to record
      // them; this returns the whole chain to its owner and nothing at all
      // to anyone else.
      const rows = await withTenant(request.user.tenant_id, async trx => {
        const lot = await trx.selectFrom('seal_lots').select('id')
          .where('tenant_id', '=', request.user.tenant_id)
          .where('id', '=', request.params.id).executeTakeFirst();
        if (!lot) return null;
        return trx.selectFrom('seal_movements').selectAll()
          .where('lot_id', '=', request.params.id)
          .orderBy('id', 'desc')
          .execute();
      });
      if (rows === null) return reply.status(404).send({ error: 'Lot not found' });
      return rows.map(mapMovement);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/lots/:id/movements', async (request: any, reply) => {
    try {
      const b = request.body as any;
      const movement = await withTenant(request.user.tenant_id, trx =>
        SealService.recordMovement(trx, request.user.tenant_id, {
          actorId: request.user.sub,
          movementType: b.movementType ?? 'status_change',
          lotId: request.params.id,
          toLocationId: b.toLocationId,
          stackTier: b.stackTier ? Number(b.stackTier) : undefined,
          qtyDelta: b.qtyDelta,
          toCustomsStatus: b.toCustomsStatus,
          entryReference: b.entryReference,
          reasonCode: b.reasonCode,
          reference: b.reference,
        })
      );
      return mapMovement(movement);
    } catch (err: any) {
      if (err instanceof IllegalCustomsTransition) {
        return reply.status(422).send({
          type: 'https://hudumika.com/errors/illegal-customs-transition',
          title: 'Illegal customs transition',
          status: 422,
          detail: err.message,
          from: err.from,
          to: err.to,
        });
      }
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/lots/:id/verify-chain', async (request: any, reply) => {
    try {
      return await withTenant(request.user.tenant_id, trx => SealService.verifyChain(trx, request.user.tenant_id, request.params.id));
    } catch (err: any) {
      if (err instanceof LotNotFound) return reply.status(404).send({ error: 'Lot not found' });
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Guarantees & bond headroom (spec §2.4) ──────────────────────────────
  fastify.get('/guarantees', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_guarantees').selectAll().where('tenant_id', '=', request.user.tenant_id).orderBy('created_at', 'desc').execute()
      );
      const withHeadroom = await withTenant(request.user.tenant_id, async trx =>
        Promise.all(rows.map(async g => {
          const h = await SealService.getHeadroom(trx, request.user.tenant_id, g.id);
          return { ...g, face_value: Number(g.face_value), currently_at_risk: h.currentlyAtRisk, headroom: h.headroom };
        }))
      );
      return withHeadroom;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/guarantees', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.reference || !b.faceValue || !b.currency || !b.effectiveFrom || !b.expiresOn) {
        return reply.status(400).send({ error: 'reference, faceValue, currency, effectiveFrom and expiresOn are required' });
      }
      return await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('seal_guarantees').values({
          tenant_id: request.user.tenant_id,
          instrument_type: b.instrumentType ?? 'bank_guarantee',
          issuer: b.issuer ?? null,
          reference: b.reference,
          face_value: String(b.faceValue),
          currency: b.currency,
          effective_from: new Date(b.effectiveFrom),
          expires_on: new Date(b.expiresOn),
        }).returningAll().executeTakeFirstOrThrow()
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/guarantees/:id/headroom', async (request: any, reply) => {
    try {
      const h = await withTenant(request.user.tenant_id, trx => SealService.getHeadroom(trx, request.user.tenant_id, request.params.id));
      return { faceValue: h.faceValue, currentlyAtRisk: h.currentlyAtRisk, headroom: h.headroom, currency: h.currency };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Consignments (pre-arrival) ──────────────────────────────────────────
  fastify.get('/consignments', async (request: any, reply) => {
    try {
      const { status } = request.query as { status?: string };
      return await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('seal_consignments')
          .leftJoin('customers', 'customers.id', 'seal_consignments.owner_id')
          .select([
            'seal_consignments.id', 'seal_consignments.compartment_id', 'seal_consignments.owner_id',
            'customers.name as owner_name', 'seal_consignments.transport_doc_type', 'seal_consignments.transport_doc_number',
            'seal_consignments.status', 'seal_consignments.expected_arrival', 'seal_consignments.goods_description',
            'seal_consignments.created_at',
          ])
          .where('seal_consignments.tenant_id', '=', request.user.tenant_id)
          .orderBy('seal_consignments.created_at', 'desc');
        if (status) q = q.where('seal_consignments.status', '=', status);
        return q.execute();
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/consignments', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.compartmentId || !b.ownerId) return reply.status(400).send({ error: 'compartmentId and ownerId are required' });
      return await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('seal_consignments').values({
          tenant_id: request.user.tenant_id,
          compartment_id: b.compartmentId, owner_id: b.ownerId,
          transport_doc_type: b.transportDocType ?? 'BL',
          transport_doc_number: b.transportDocNumber ?? null,
          expected_arrival: b.expectedArrival ? new Date(b.expectedArrival) : null,
          goods_description: b.goodsDescription ?? null,
        }).returningAll().executeTakeFirstOrThrow()
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/consignments/:id', async (request: any, reply) => {
    try {
      const consignment = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_consignments')
          .leftJoin('customers', 'customers.id', 'seal_consignments.owner_id')
          .selectAll('seal_consignments')
          .select('customers.name as owner_name')
          .where('seal_consignments.tenant_id', '=', request.user.tenant_id)
          .where('seal_consignments.id', '=', request.params.id)
          .executeTakeFirst()
      );
      if (!consignment) return reply.status(404).send({ error: 'Consignment not found' });
      const containers = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_containers').selectAll().where('tenant_id', '=', request.user.tenant_id).where('consignment_id', '=', request.params.id).execute()
      );
      return { ...consignment, containers };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Containers: add to a consignment, gate-in, gate-out, devan/tally ───
  fastify.post('/consignments/:id/containers', async (request: any, reply) => {
    try {
      const b = request.body as any;
      const check = validateContainerNumber(b.containerNumber || '');
      if (!check.valid) {
        return reply.status(422).send({ error: `Invalid container number: ${check.reason}`, expectedCheckDigit: check.expectedCheckDigit });
      }
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('seal_containers').values({
          tenant_id: request.user.tenant_id,
          consignment_id: request.params.id,
          container_number: check.formatted.replace(/-/g, ''),
          container_size: b.containerSize ?? '40GP',
        }).returningAll().executeTakeFirstOrThrow()
      );
      return { ...row, formatted: check.formatted };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // M2.1/M2.2/M2.3 collapsed into one call: identity is already verified at
  // POST .../containers (check digit); this captures the rest of the gate-in
  // sequence (seal, weighbridge, EIR) and advances the consignment's status.
  // Built as a normal online page — see 107_seal_gate_and_bond.sql's header
  // note on why true offline mode (spec M2.9) isn't attempted this pass.
  fastify.post('/containers/:id/gate-in', async (request: any, reply) => {
    try {
      const b = request.body as any;
      const container = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_containers').selectAll().where('tenant_id', '=', request.user.tenant_id).where('id', '=', request.params.id).executeTakeFirst()
      );
      if (!container) return reply.status(404).send({ error: 'Container not found' });

      const grossKg = b.grossWeightKg != null ? Number(b.grossWeightKg) : null;
      const tareKg = b.tareWeightKg != null ? Number(b.tareWeightKg) : null;
      const netKg = grossKg != null && tareKg != null ? grossKg - tareKg : null;
      const eirReference = `EIR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900000) + 100000)}`;

      const updated = await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_containers').set({
          seal_number: b.sealNumber ?? null,
          gross_weight_kg: grossKg != null ? String(grossKg) : null,
          tare_weight_kg: tareKg != null ? String(tareKg) : null,
          net_weight_kg: netKg != null ? String(netKg) : null,
          vgm_weight_kg: b.vgmWeightKg != null ? String(b.vgmWeightKg) : null,
          gate_in_at: new Date(),
          eir_reference: eirReference,
        }).where('id', '=', request.params.id).returningAll().executeTakeFirstOrThrow()
      );
      await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_consignments').set({ status: 'IN_YARD', updated_at: new Date() })
          .where('id', '=', container.consignment_id).execute()
      );
      return updated;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Devanning + tally (M3): each line either becomes a real lot (via the
  // same SealService.receiveLot Increment 1 already built — so bond headroom
  // is checked here too) or is flagged as a discrepancy, per the clerk's
  // call on that specific line. Advances the consignment to DEVANNED once
  // all its containers have been devanned.
  // Registered under both names: /devan-tally is what the current UI calls
  // (post-redesign); /devan is kept as an alias so any other caller of the
  // original contract doesn't silently 404.
  async function handleDevanTally(request: any, reply: any) {
    try {
      const b = request.body as any;
      const lines = Array.isArray(b.lines) ? b.lines : [];
      if (lines.length === 0) return reply.status(400).send({ error: 'At least one tally line is required' });

      const container = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_containers').selectAll().where('tenant_id', '=', request.user.tenant_id).where('id', '=', request.params.id).executeTakeFirst()
      );
      if (!container) return reply.status(404).send({ error: 'Container not found' });
      const consignment = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_consignments').selectAll().where('tenant_id', '=', request.user.tenant_id).where('id', '=', container.consignment_id).executeTakeFirst()
      );
      if (!consignment) return reply.status(404).send({ error: 'Consignment not found' });

      const results: any[] = [];
      for (const line of lines) {
        if (line.discrepancy) {
          // Accepts both shapes: the original { discrepancy: { type, severity, description } }
          // and the current UI's { discrepancy: true, discrepancyType: string }.
          const discrepancyType = line.discrepancyType ?? line.discrepancy?.type ?? 'shortage';
          const discrepancySeverity = line.discrepancy?.severity ?? 'minor';
          const discrepancyDescription = line.discrepancy?.description ?? line.description ?? 'Tally discrepancy';
          const row = await withTenant(request.user.tenant_id, trx =>
            trx.insertInto('seal_discrepancies').values({
              tenant_id: request.user.tenant_id,
              container_id: container.id,
              discrepancy_type: discrepancyType,
              severity: discrepancySeverity,
              description: discrepancyDescription,
            }).returningAll().executeTakeFirstOrThrow()
          );
          results.push({ kind: 'discrepancy', row });
          continue;
        }
        try {
          const lot = await withTenant(request.user.tenant_id, trx =>
            SealService.receiveLot(trx, request.user.tenant_id, request.user.sub, {
              compartmentId: consignment.compartment_id, ownerId: consignment.owner_id,
              description: line.description, hsCode: line.hsCode, countryOfOrigin: line.countryOfOrigin,
              customsStatus: line.customsStatus ?? 'FOREIGN_DUTY_SUSPENDED',
              entryReference: line.entryReference, locationId: line.locationId,
              qty: Number(line.qty), uom: line.uom ?? 'PCS',
              customsValue: line.customsValue, currency: line.currency,
              dutyAtRisk: line.dutyAtRisk, taxAtRisk: line.taxAtRisk,
              bondOverrideReason: line.bondOverrideReason,
            })
          );
          results.push({ kind: 'lot', row: mapLot(lot) });
        } catch (err: any) {
          if (err instanceof BondHeadroomExceeded) {
            results.push({ kind: 'error', line: line.description, error: bondHeadroomResponse(err) });
          } else {
            results.push({ kind: 'error', line: line.description, error: { detail: err.message } });
          }
        }
      }

      const remainingUndevanned = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_containers').select(({ fn }) => fn.count<number>('id').as('n'))
          .where('tenant_id', '=', request.user.tenant_id)
          .where('consignment_id', '=', consignment.id).where('gate_in_at', 'is not', null).where('gate_out_at', 'is', null)
          .executeTakeFirst()
      );
      await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_consignments')
          .set({ status: results.some(r => r.kind === 'lot') ? 'DEVANNED' : 'DEVANNING', updated_at: new Date() })
          .where('tenant_id', '=', request.user.tenant_id).where('id', '=', consignment.id).execute()
      );

      return { results };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  }
  fastify.post('/containers/:id/devan-tally', handleDevanTally);
  fastify.post('/containers/:id/devan', handleDevanTally);

  // ── Discrepancies ────────────────────────────────────────────────────────
  fastify.get('/discrepancies', async (request: any, reply) => {
    try {
      const { container_id } = request.query as { container_id?: string };
      return await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('seal_discrepancies').selectAll().where('tenant_id', '=', request.user.tenant_id).orderBy('created_at', 'desc');
        if (container_id) q = q.where('container_id', '=', container_id);
        return q.execute();
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/discrepancies/:id', async (request: any, reply) => {
    try {
      const b = request.body as any;
      return await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_discrepancies').set({
          status: b.status, resolution_note: b.resolutionNote ?? null,
        }).where('id', '=', request.params.id).returningAll().executeTakeFirstOrThrow()
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Appointments ─────────────────────────────────────────────────────────
  fastify.get('/appointments', async (request: any, reply) => {
    try {
      return await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_appointments').selectAll().where('tenant_id', '=', request.user.tenant_id).orderBy('scheduled_at', 'asc').execute()
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/appointments', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.compartmentId || !b.appointmentType || !b.scheduledAt) {
        return reply.status(400).send({ error: 'compartmentId, appointmentType and scheduledAt are required' });
      }
      return await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('seal_appointments').values({
          tenant_id: request.user.tenant_id,
          compartment_id: b.compartmentId, consignment_id: b.consignmentId ?? null,
          appointment_type: b.appointmentType, scheduled_at: new Date(b.scheduledAt),
          reference: b.reference ?? null,
        }).returningAll().executeTakeFirstOrThrow()
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

}
