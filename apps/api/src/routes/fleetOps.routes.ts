import { requireEntitlement } from '../middleware/entitlement.js';
import { emitDomainEvent } from '../services/domain-events.service.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { pick } from '../lib/pick.js';

const FLEET_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR'] as const;

const vendorCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  vendor_type: z.string().max(50).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(320).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});
const vendorPatchSchema = vendorCreateSchema.partial().extend({ active: z.boolean().optional() });

const partCreateSchema = z.object({
  part_name: z.string().trim().min(1).max(200),
  part_number: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  quantity: z.number().int().min(0).optional(),
  unit_cost: z.number().min(0).optional(),
  reorder_level: z.number().int().min(0).optional(),
  vendor_id: z.string().uuid().optional(),
});
const partPatchSchema = partCreateSchema.partial();

// Postgres NUMERIC columns come back from node-postgres as strings — coerce
// before returning to the frontend, or arithmetic like `.toFixed()`/
// `total += x` silently does string concatenation. Same convention as
// gl.service.ts/bills.routes.ts.
function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export async function fleetOpsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('tracking'));

  // ── Drivers ──────────────────────────────────────────────────

  fastify.get('/drivers', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      // Pull HR linked email (users) and assigned vehicle details
      const drivers = await trx.selectFrom('drivers as d')
        .leftJoin('users as u', 'u.id', 'd.employee_id')
        .leftJoin('vehicles as v', 'v.id', 'd.assigned_vehicle_id')
        .select([
          'd.id', 'd.name', 'd.phone', 'd.license_number', 'd.license_expiry',
          'd.employee_id', 'd.assigned_vehicle_id', 'd.status', 'd.avatar_url',
          'u.email as hr_email',
          'v.name as vehicle_name', 'v.plate_number as vehicle_plate',
          'v.type as vehicle_type', 'v.color as vehicle_color'
        ])
        .where('d.tenant_id', '=', user.tenant_id)
        .orderBy('d.name')
        .execute();

      // "On Route" is a live fact (an in-progress trip right now), not something
      // stored on the driver row — drivers.status is only ACTIVE/INACTIVE/SUSPENDED.
      const activeTripDriverIds = new Set(
        (await trx.selectFrom('trips').select('driver_id')
          .where('tenant_id', '=', user.tenant_id)
          .where('status', '=', 'IN_PROGRESS')
          .where('driver_id', 'is not', null)
          .execute()
        ).map(t => t.driver_id)
      );

      return drivers.map((d, i) => ({
        ...d,
        custom_id: `DRV${String(i + 1).padStart(3, '0')}`,
        email: d.hr_email || null,
        status: activeTripDriverIds.has(d.id) ? 'On Route' : d.status === 'ACTIVE' ? 'Available' : 'Off Duty',
      }));
    });
  });

  fastify.get('/drivers/:id/metrics', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const driver = await trx.selectFrom('drivers').select('assigned_vehicle_id')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!driver) return reply.status(404).send({ error: 'Driver not found' });

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

      const trips = await trx.selectFrom('trips').selectAll()
        .where('driver_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .execute();

      // Current/most recent trip drives the top "tracking" card.
      const current = trips.find(t => t.status === 'IN_PROGRESS')
        ?? trips.filter(t => t.status === 'PLANNED').sort((a, b) => (a.scheduled_start ? +new Date(a.scheduled_start) : 0) - (b.scheduled_start ? +new Date(b.scheduled_start) : 0))[0]
        ?? trips.filter(t => t.status === 'COMPLETED').sort((a, b) => (b.actual_end ? +new Date(b.actual_end) : 0) - (a.actual_end ? +new Date(a.actual_end) : 0))[0]
        ?? null;

      let transit_progress_pct = 0;
      if (current) {
        if (current.status === 'COMPLETED') transit_progress_pct = 100;
        else if (current.status === 'IN_PROGRESS' && current.actual_start && current.scheduled_end) {
          const total = +new Date(current.scheduled_end) - +new Date(current.actual_start);
          const elapsed = now.getTime() - +new Date(current.actual_start);
          transit_progress_pct = total > 0 ? Math.max(0, Math.min(100, Math.round((elapsed / total) * 100))) : 0;
        }
      }
      const STATUS_LABEL: Record<string, string> = { PLANNED: 'Scheduled', IN_PROGRESS: 'In Transit', COMPLETED: 'Delivered', CANCELLED: 'Cancelled' };

      const completed = trips.filter(t => t.status === 'COMPLETED');
      const deliveriesThisWeek = completed.filter(t => t.actual_end && new Date(t.actual_end) >= weekAgo);
      const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const byDay = new Map(DAY_LABELS.map(d => [d, 0]));
      deliveriesThisWeek.forEach(t => {
        const day = DAY_LABELS[new Date(t.actual_end!).getDay()];
        byDay.set(day, (byDay.get(day) ?? 0) + 1);
      });
      const deliveries_week = DAY_LABELS.map(day => ({ day, value: byDay.get(day) ?? 0 }));

      const withBothDates = completed.filter(t => t.scheduled_end && t.actual_end);
      const onTime = withBothDates.filter(t => new Date(t.actual_end!) <= new Date(t.scheduled_end!));
      const late = withBothDates.filter(t => new Date(t.actual_end!) > new Date(t.scheduled_end!));
      const on_time_rate = withBothDates.length > 0 ? Math.round((onTime.length / withBothDates.length) * 100) : 100;

      // No structured "delay reason" taxonomy exists in the schema — bucket
      // honestly by whether a serious vehicle issue was logged around the
      // delayed trip, rather than inventing categories the data can't support.
      let vehicleIssueDelays = 0;
      if (driver.assigned_vehicle_id && late.length > 0) {
        const issues = await trx.selectFrom('vehicle_issues').select(['created_at'])
          .where('vehicle_id', '=', driver.assigned_vehicle_id)
          .where('severity', 'in', ['HIGH', 'CRITICAL'])
          .execute();
        for (const t of late) {
          const start = t.actual_start ? +new Date(t.actual_start) : (t.scheduled_start ? +new Date(t.scheduled_start) : 0);
          const end = t.actual_end ? +new Date(t.actual_end) : now.getTime();
          if (issues.some(iss => { const ts = +new Date(iss.created_at); return ts >= start && ts <= end; })) vehicleIssueDelays++;
        }
      }
      const otherDelays = late.length - vehicleIssueDelays;

      return {
        tracking_id: current ? `TRIP-${current.id.slice(0, 8).toUpperCase()}` : null,
        transit_status: current ? (STATUS_LABEL[current.status] ?? current.status) : 'No active trip',
        transit_progress_pct,
        origin: current?.origin ?? null,
        destination: current?.destination ?? null,
        eta: current?.scheduled_end ? new Date(current.scheduled_end).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null,

        deliveries_week,
        total_completed: completed.length,

        on_time_rate,
        on_time_deliveries: onTime.length,

        total_delays: late.length,
        delays: late.length > 0 ? [
          { name: 'Vehicle Issue', value: vehicleIssueDelays, color: '#475569' },
          { name: 'Other Delay', value: otherDelays, color: '#cbd5e1' },
        ].filter(d => d.value > 0) : [],
      };
    });
  });

  fastify.post('/drivers', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = req.body as {
      name: string; phone?: string; license_number?: string; license_expiry?: string;
      employee_id?: string; assigned_vehicle_id?: string;
    };
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('drivers').values({
        tenant_id: user.tenant_id,
        name: body.name,
        phone: body.phone ?? null,
        license_number: body.license_number ?? null,
        license_expiry: body.license_expiry ? new Date(body.license_expiry) : null,
        employee_id: body.employee_id ?? null,
        assigned_vehicle_id: body.assigned_vehicle_id ?? null,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.patch('/drivers/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as Partial<{
      name: string; phone: string; license_number: string; license_expiry: string;
      employee_id: string; assigned_vehicle_id: string; status: string;
    }>;
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('drivers').set({
        ...body,
        license_expiry: body.license_expiry ? new Date(body.license_expiry) : undefined,
        updated_at: new Date(),
      } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.delete('/drivers/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('drivers').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });

  fastify.get('/drivers/:id/detail', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const driver = await trx.selectFrom('drivers as d')
        .leftJoin('users as u', 'u.id', 'd.employee_id')
        .select([
          'd.id', 'd.name', 'd.phone', 'd.license_number', 'd.license_expiry',
          'd.employee_id', 'd.assigned_vehicle_id', 'd.status', 'd.avatar_url',
          'u.email as hr_email', 'u.created_at as hr_joined_date', 'u.location_id as hr_location_id'
        ])
        .where('d.id', '=', id).where('d.tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!driver) return reply.status(404).send({ error: 'Driver not found' });

      // Fallbacks
      const custom_id = `EMP-${id.split('-')[0].toUpperCase()}`;
      const email = driver.hr_email || `${driver.name.toLowerCase().replace(' ', '.')}@example.com`;
      const joined_date = driver.hr_joined_date || new Date('2022-01-12').toISOString();
      const address = '64 Royal Ln. Mesa, New Jersey 4563'; // Mock address

      const vehicle = driver.assigned_vehicle_id
        ? await trx.selectFrom('vehicles').selectAll()
            .where('id', '=', driver.assigned_vehicle_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst()
        : null;

      const tripRows = await trx.selectFrom('trips').selectAll()
        .where('driver_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc').limit(20).execute();
        
      const trips = tripRows.map(r => ({
        ...r,
        distance_km: numOrNull(r.distance_km),
        // Mocking the complex analytical fields requested by the Cureer design
        delivery_id: `REG-${r.id.split('-')[0].toUpperCase()}`,
        deliverable_items: 324,
        total_issue: 4,
        working_hours: 44,
        overtime: 8,
        fuel_purchase: 12.927,
        fuel_per_litre: 442,
        fleet_conditions: 'Good',
        fleet_odometer: 36234,
        avg_daily_mileage: 237,
        service_day: 237,
        carrier_items: 387,
        issued_items: 44,
        refunded_items: 14,
        delivery_accuracy: 4.9,
      }));

      const fuelLogRows = await trx.selectFrom('fuel_logs').selectAll()
        .where('driver_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('logged_at', 'desc').limit(20).execute();
      const fuelLogs = fuelLogRows.map(r => ({ ...r, liters: Number(r.liters), cost: numOrNull(r.cost), odometer_km: numOrNull(r.odometer_km) }));

      return {
        driver: { ...driver, custom_id, email, joined_date, address },
        vehicle: vehicle ? { ...vehicle, custom_code: `FBL-${vehicle.id.split('-')[0].toUpperCase()}`, last_checking: '18 January 2024', capacity_kg: 782, condition: 'Good Condition' } : null,
        trips, fuel_logs: fuelLogs
      };
    });
  });

  // ── Vehicle Vendors ──────────────────────────────────────────

  fastify.get('/vendors', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('vehicle_vendors').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('name').execute()
    );
  });

  fastify.post('/vendors', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = vendorCreateSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('vehicle_vendors').values({
        tenant_id: user.tenant_id,
        name: body.name,
        vendor_type: body.vendor_type ?? 'WORKSHOP',
        phone: body.phone ?? null,
        email: body.email ?? null,
        address: body.address ?? null,
        notes: body.notes ?? null,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.patch('/vendors/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = vendorPatchSchema.parse(req.body);
    const patch = pick(body, ['name', 'vendor_type', 'phone', 'email', 'address', 'notes', 'active']);
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('vehicle_vendors').set({ ...patch, updated_at: new Date() } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.delete('/vendors/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('vehicle_vendors').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });

  // ── Trips ────────────────────────────────────────────────────

  fastify.get('/trips', async (req) => {
    const user = req.user;
    const { status } = req.query as { status?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('trips').selectAll().where('tenant_id', '=', user.tenant_id);
      if (status) q = q.where('status', '=', status);
      const rows = await q.orderBy('created_at', 'desc').limit(500).execute();

      // Best-effort ref_number lookup for linked shipments — shipment_cases
      // is a separate (ClearOS) app's table with no FK, so resolve manually
      // and tolerate the tenant not having ClearOS enabled at all.
      const shipmentIds = [...new Set(rows.map(r => r.shipment_id).filter((x): x is string => !!x))];
      const refByShipment = new Map<string, string>();
      if (shipmentIds.length > 0) {
        try {
          const shipments = await trx.selectFrom('shipment_cases').select(['id', 'ref_number'])
            .where('tenant_id', '=', user.tenant_id).where('id', 'in', shipmentIds).execute();
          for (const s of shipments) refByShipment.set(s.id, s.ref_number);
        } catch { /* clearos not provisioned for this tenant — leave refs blank */ }
      }

      return rows.map(r => ({
        ...r, distance_km: numOrNull(r.distance_km),
        cargo_weight_kg: numOrNull(r.cargo_weight_kg), cargo_temp_c: numOrNull(r.cargo_temp_c),
        load_capacity_pct: numOrNull(r.load_capacity_pct),
        shipment_ref: r.shipment_id ? (refByShipment.get(r.shipment_id) ?? null) : null,
      }));
    });
  });

  fastify.post('/trips', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = req.body as {
      vehicle_id: string; driver_id?: string; customer_id?: string;
      origin?: string; destination?: string; scheduled_start?: string; scheduled_end?: string;
      cargo_desc?: string; notes?: string;
      cargo_type?: string; cargo_weight_kg?: number; cargo_temp_c?: number; load_capacity_pct?: number;
      shipment_id?: string;
    };
    return withTenant(user.tenant_id, async (trx) => {
      const trip = await trx.insertInto('trips').values({
        tenant_id: user.tenant_id,
        vehicle_id: body.vehicle_id,
        driver_id: body.driver_id ?? null,
        customer_id: body.customer_id ?? null,
        origin: body.origin ?? null,
        destination: body.destination ?? null,
        scheduled_start: body.scheduled_start ? new Date(body.scheduled_start) : null,
        scheduled_end: body.scheduled_end ? new Date(body.scheduled_end) : null,
        cargo_desc: body.cargo_desc ?? null,
        cargo_type: body.cargo_type ?? null,
        cargo_weight_kg: body.cargo_weight_kg ?? null,
        cargo_temp_c: body.cargo_temp_c ?? null,
        load_capacity_pct: body.load_capacity_pct ?? null,
        notes: body.notes ?? null,
        shipment_id: body.shipment_id ?? null,
        job_type: body.shipment_id ? 'CLEARANCE_LINKED' : 'TRANSPORT_ONLY',
        created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow();

      // The haulage leg of a consignment's journey has been booked.
      emitDomainEvent(trx, user.tenant_id, {
        type: 'trip.created', sourceApp: 'tracking', entityType: 'trip', entityId: trip.id,
        payload: {
          shipmentId: body.shipment_id ?? null,
          origin: body.origin ?? null,
          destination: body.destination ?? null,
          jobType: body.shipment_id ? 'CLEARANCE_LINKED' : 'TRANSPORT_ONLY',
        },
      }).catch(err => console.error('[Fleet] trip.created emit failed:', err.message));

      return trip;
    });
  });

  fastify.patch('/trips/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as Partial<{
      driver_id: string; customer_id: string; origin: string; destination: string;
      scheduled_start: string; scheduled_end: string; actual_start: string; actual_end: string;
      status: string; cargo_desc: string; distance_km: number; notes: string;
      cargo_type: string; cargo_weight_kg: number; cargo_temp_c: number; load_capacity_pct: number;
    }>;
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('trips').set({
        ...body,
        scheduled_start: body.scheduled_start ? new Date(body.scheduled_start) : undefined,
        scheduled_end: body.scheduled_end ? new Date(body.scheduled_end) : undefined,
        actual_start: body.actual_start ? new Date(body.actual_start) : undefined,
        actual_end: body.actual_end ? new Date(body.actual_end) : undefined,
        updated_at: new Date(),
      } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.delete('/trips/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('trips').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });

  // ── Maintenance ──────────────────────────────────────────────

  fastify.get('/maintenance', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('maintenance_records').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('service_date', 'desc').limit(500).execute();
      return rows.map(r => ({
        ...r, cost: numOrNull(r.cost), odometer_km: numOrNull(r.odometer_km),
        next_due_odometer: numOrNull(r.next_due_odometer),
      }));
    });
  });

  fastify.post('/maintenance', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = req.body as {
      vehicle_id: string; vendor_id?: string; service_type: string; description?: string;
      cost?: number; odometer_km?: number; service_date?: string;
      next_due_date?: string; next_due_odometer?: number; status?: string;
    };
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('maintenance_records').values({
        tenant_id: user.tenant_id,
        vehicle_id: body.vehicle_id,
        vendor_id: body.vendor_id ?? null,
        service_type: body.service_type,
        description: body.description ?? null,
        cost: body.cost ?? null,
        odometer_km: body.odometer_km ?? null,
        service_date: body.service_date ? new Date(body.service_date) : new Date(),
        next_due_date: body.next_due_date ? new Date(body.next_due_date) : null,
        next_due_odometer: body.next_due_odometer ?? null,
        status: body.status ?? undefined,
        created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.patch('/maintenance/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as Partial<{
      vendor_id: string; service_type: string; description: string;
      cost: number; odometer_km: number; service_date: string;
      next_due_date: string; next_due_odometer: number; status: string;
    }>;
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('maintenance_records').set({
        ...body,
        service_date: body.service_date ? new Date(body.service_date) : undefined,
        next_due_date: body.next_due_date ? new Date(body.next_due_date) : undefined,
      } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.delete('/maintenance/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('maintenance_records').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });

  // ── Parts Stock ──────────────────────────────────────────────

  fastify.get('/parts', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('parts_stock').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('part_name').execute();
      return rows.map(r => ({ ...r, unit_cost: numOrNull(r.unit_cost) }));
    });
  });

  fastify.post('/parts', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = partCreateSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('parts_stock').values({
        tenant_id: user.tenant_id,
        part_name: body.part_name,
        part_number: body.part_number ?? null,
        category: body.category ?? null,
        quantity: body.quantity ?? 0,
        unit_cost: body.unit_cost ?? null,
        reorder_level: body.reorder_level ?? 5,
        vendor_id: body.vendor_id ?? null,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.patch('/parts/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = partPatchSchema.parse(req.body);
    const patch = pick(body, ['part_name', 'part_number', 'category', 'quantity', 'unit_cost', 'reorder_level', 'vendor_id']);
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('parts_stock').set({ ...patch, updated_at: new Date() } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.delete('/parts/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('parts_stock').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });

  // ── Fuel Logs ────────────────────────────────────────────────

  fastify.get('/fuel', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('fuel_logs')
        .leftJoin('vehicles', 'vehicles.id', 'fuel_logs.vehicle_id')
        .leftJoin('drivers', 'drivers.id', 'fuel_logs.driver_id')
        .selectAll('fuel_logs')
        .select(['vehicles.name as vehicle_name', 'vehicles.plate_number as vehicle_plate', 'drivers.name as driver_name'])
        .where('fuel_logs.tenant_id', '=', user.tenant_id)
        .orderBy('fuel_logs.logged_at', 'desc').limit(500).execute();
      return rows.map(r => ({ ...r, liters: Number(r.liters), cost: numOrNull(r.cost), odometer_km: numOrNull(r.odometer_km) }));
    });
  });

  fastify.post('/fuel', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = req.body as {
      vehicle_id: string; driver_id?: string; liters: number; cost?: number;
      odometer_km?: number; station?: string; vendor_id?: string; logged_at?: string;
    };
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('fuel_logs').values({
        tenant_id: user.tenant_id,
        vehicle_id: body.vehicle_id,
        driver_id: body.driver_id ?? null,
        liters: body.liters,
        cost: body.cost ?? null,
        odometer_km: body.odometer_km ?? null,
        station: body.station ?? null,
        vendor_id: body.vendor_id ?? null,
        logged_at: body.logged_at ? new Date(body.logged_at) : new Date(),
        created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.delete('/fuel/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('fuel_logs').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });
}
