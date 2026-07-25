import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { SealService, IllegalCustomsTransition, BondHeadroomExceeded, DgSegregationViolation } from '../services/seal.service.js';
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
      return await withTenant(request.user.tenant_id, async (trx) => {
        const compartments = await trx.selectFrom('seal_compartments')
          .select(({ fn }) => ['id', fn.count<number>('id').as('count')])
          .where('active', '=', true)
          .groupBy('id')
          .execute();
        const compartmentCount = (await trx.selectFrom('seal_compartments').select(({ fn }) => fn.count<number>('id').as('n')).where('active', '=', true).executeTakeFirst())?.n ?? 0;
        const byStatus = await trx.selectFrom('seal_lots')
          .select(({ fn }) => ['customs_status', fn.count<number>('id').as('count')])
          .groupBy('customs_status')
          .execute();
        const expiringSoon = await trx.selectFrom('seal_lots')
          .select(({ fn }) => fn.count<number>('id').as('n'))
          .where('expires_on', 'is not', null)
          .where('expires_on', '<=', new Date(Date.now() + 30 * 86400000))
          .where('customs_status', '=', 'FOREIGN_DUTY_SUSPENDED')
          .executeTakeFirst();
        const lotCount = await trx.selectFrom('seal_lots').select(({ fn }) => fn.count<number>('id').as('n')).executeTakeFirst();
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

  // ── Compartments ───────────────────────────────────────────────────────
  fastify.get('/compartments', async (request: any, reply) => {
    try {
      return await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_compartments').selectAll().where('active', '=', true).orderBy('code').execute()
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
        trx.selectFrom('seal_compartments').selectAll().where('id', '=', compartmentId).executeTakeFirst(),
        trx.selectFrom('seal_zones').selectAll().where('compartment_id', '=', compartmentId).orderBy('code').execute(),
        trx.selectFrom('seal_locations').selectAll().where('compartment_id', '=', compartmentId).orderBy('code').execute(),
        trx.selectFrom('seal_lots')
          .select(['id', 'current_location_id', 'customs_status', 'expires_on', 'description'])
          .where('compartment_id', '=', compartmentId)
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
          guarantee_id: b.guaranteeId === undefined ? undefined : b.guaranteeId,
          updated_at: new Date(),
        }).where('id', '=', request.params.id).returningAll().executeTakeFirstOrThrow()
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Zones ──────────────────────────────────────────────────────────────
  fastify.get('/zones', async (request: any, reply) => {
    try {
      const { compartment_id } = request.query as { compartment_id?: string };
      return await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('seal_zones').selectAll().orderBy('code');
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
        let q = trx.selectFrom('seal_locations').selectAll().orderBy('code');
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
      return await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_locations').set(patch).where('id', '=', request.params.id).returningAll().executeTakeFirstOrThrow()
      );
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
        trx.selectFrom('seal_compartments').selectAll().where('id', '=', compartmentId).executeTakeFirst(),
        trx.selectFrom('seal_zones').selectAll().where('compartment_id', '=', compartmentId).orderBy('code').execute(),
        trx.selectFrom('seal_locations').selectAll().where('compartment_id', '=', compartmentId).orderBy('code').execute(),
        trx.selectFrom('seal_lots')
          .select(['id', 'current_location_id', 'stack_tier', 'customs_status', 'description', 'qty_on_hand', 'uom', 'expires_on'])
          .where('compartment_id', '=', compartmentId)
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
          return {
            id: loc.id, code: loc.code, locationType: loc.location_type,
            gridRow: loc.grid_row, gridCol: loc.grid_col,
            maxStackTiers: loc.max_stack_tiers, capacityUnits: loc.capacity_units,
            lotCount: here.length, totalSlots: slots, occupancyPct, flagged, tiers,
          };
        });

        return {
          floorLevel: level,
          label: level === 0 ? 'Ground Floor' : `Mezzanine ${level}`,
          totalSlots, occupiedSlots,
          occupancyPct: totalSlots > 0 ? Math.min(100, Math.round((occupiedSlots / totalSlots) * 100)) : 0,
          placedCount: placed.length, unplacedCount: unplaced.length,
          locations: locationsOut,
        };
      });

      const grandTotalSlots = floors.reduce((s, f) => s + f.totalSlots, 0);
      const grandOccupied = floors.reduce((s, f) => s + f.occupiedSlots, 0);

      return {
        compartment: { id: compartment.id, code: compartment.code, name: compartment.name },
        overallOccupancyPct: grandTotalSlots > 0 ? Math.min(100, Math.round((grandOccupied / grandTotalSlots) * 100)) : 0,
        totalSlots: grandTotalSlots, occupiedSlots: grandOccupied, remainingSlots: grandTotalSlots - grandOccupied,
        lotCount: lots.length,
        floors,
      };
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
          ])
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
          ])
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
        SealService.receiveLot(trx, request.user.tenant_id, request.user.id, {
          compartmentId: b.compartmentId, ownerId: b.ownerId, description: b.description,
          hsCode: b.hsCode, countryOfOrigin: b.countryOfOrigin, customsStatus: b.customsStatus,
          entryReference: b.entryReference, locationId: b.locationId, qty: Number(b.qty), uom: b.uom,
          customsValue: b.customsValue, currency: b.currency, warehousedOn: b.warehousedOn,
          expiresOn: b.expiresOn, batch: b.batch,
          dutyAtRisk: b.dutyAtRisk, taxAtRisk: b.taxAtRisk, bondOverrideReason: b.bondOverrideReason,
          isDangerousGoods: !!b.isDangerousGoods, unNumber: b.unNumber, imdgClass: b.imdgClass,
          requiresReefer: !!b.requiresReefer, reeferSetpointC: b.reeferSetpointC,
          stackTier: b.stackTier ? Number(b.stackTier) : undefined,
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
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_movements').selectAll()
          .where('lot_id', '=', request.params.id)
          .orderBy('id', 'desc')
          .execute()
      );
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
          actorId: request.user.id,
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
      return await withTenant(request.user.tenant_id, trx => SealService.verifyChain(trx, request.params.id));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Guarantees & bond headroom (spec §2.4) ──────────────────────────────
  fastify.get('/guarantees', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_guarantees').selectAll().orderBy('created_at', 'desc').execute()
      );
      const withHeadroom = await withTenant(request.user.tenant_id, async trx =>
        Promise.all(rows.map(async g => {
          const h = await SealService.getHeadroom(trx, g.id);
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
      const h = await withTenant(request.user.tenant_id, trx => SealService.getHeadroom(trx, request.params.id));
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
          .where('seal_consignments.id', '=', request.params.id)
          .executeTakeFirst()
      );
      if (!consignment) return reply.status(404).send({ error: 'Consignment not found' });
      const containers = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_containers').selectAll().where('consignment_id', '=', request.params.id).execute()
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
        trx.selectFrom('seal_containers').selectAll().where('id', '=', request.params.id).executeTakeFirst()
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
        trx.selectFrom('seal_containers').selectAll().where('id', '=', request.params.id).executeTakeFirst()
      );
      if (!container) return reply.status(404).send({ error: 'Container not found' });
      const consignment = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_consignments').selectAll().where('id', '=', container.consignment_id).executeTakeFirst()
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
            SealService.receiveLot(trx, request.user.tenant_id, request.user.id, {
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
          .where('consignment_id', '=', consignment.id).where('gate_in_at', 'is not', null).where('gate_out_at', 'is', null)
          .executeTakeFirst()
      );
      await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_consignments')
          .set({ status: results.some(r => r.kind === 'lot') ? 'DEVANNED' : 'DEVANNING', updated_at: new Date() })
          .where('id', '=', consignment.id).execute()
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
        let q = trx.selectFrom('seal_discrepancies').selectAll().orderBy('created_at', 'desc');
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
        trx.selectFrom('seal_appointments').selectAll().orderBy('scheduled_at', 'asc').execute()
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
