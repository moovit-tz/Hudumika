import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

const FLEET_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR'] as const;

// Postgres NUMERIC columns come back from node-postgres as strings — coerce
// before returning to the frontend. Same convention as gl.service.ts and
// tracking.routes.ts/fleetOps.routes.ts's numOrNull().
function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export async function vehicleDetailRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('tracking'));

  // ── Aggregate detail (Overview tab) ─────────────────────────

  fastify.get('/vehicles/:id/detail', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const vehicle = await trx.selectFrom('vehicles').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!vehicle) return reply.status(404).send({ error: 'Vehicle not found' });

      const driver = await trx.selectFrom('drivers').select(['id', 'name', 'phone'])
        .where('assigned_vehicle_id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();

      const lastPosition = await trx.selectFrom('vehicle_positions').selectAll()
        .where('vehicle_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('recorded_at', 'desc').executeTakeFirst();

      const fuelLogs = await trx.selectFrom('fuel_logs').selectAll()
        .where('vehicle_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('logged_at', 'desc').limit(200).execute();

      const maintenanceRecords = await trx.selectFrom('maintenance_records').selectAll()
        .where('vehicle_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('service_date', 'desc').limit(200).execute();

      const expenseRows = await trx.selectFrom('vehicle_expenses').selectAll()
        .where('vehicle_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('expense_date', 'desc').limit(200).execute();
      const expenses = expenseRows.map(r => ({ ...r, amount: Number(r.amount) }));

      const documents = await trx.selectFrom('vehicle_documents').selectAll()
        .where('vehicle_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('expiry_date').execute();

      const reminders = await trx.selectFrom('fleet_reminders').selectAll()
        .where('vehicle_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .execute();

      const issues = await trx.selectFrom('vehicle_issues').selectAll()
        .where('vehicle_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc').execute();

      const meterReadings = await trx.selectFrom('vehicle_meter_readings').selectAll()
        .where('vehicle_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('recorded_at', 'desc').limit(50).execute();
      const meterReadingsNum = meterReadings.map(r => ({ ...r, reading_km: Number(r.reading_km) }));

      // The active trip (if any) carries what's currently being hauled —
      // cargo type/weight/temp/load% are per-trip attributes, not static
      // vehicle fields, so this is the live "Cargo & Capacity" source.
      const activeTrip = await trx.selectFrom('trips').selectAll()
        .where('vehicle_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .where('status', '=', 'IN_PROGRESS')
        .orderBy('actual_start', 'desc').executeTakeFirst();

      // Cost of ownership by month (fuel + maintenance + expenses), last 12 months.
      const since12mo = new Date(Date.now() - 365 * 86_400_000);
      const costByMonth = new Map<string, { fuel: number; service: number; other: number }>();
      const monthKey = (d: Date | string) => {
        const dt = new Date(d);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      };
      for (const f of fuelLogs) {
        if (new Date(f.logged_at) < since12mo) continue;
        const key = monthKey(f.logged_at);
        const cur = costByMonth.get(key) ?? { fuel: 0, service: 0, other: 0 };
        cur.fuel += Number(f.cost ?? 0);
        costByMonth.set(key, cur);
      }
      for (const m of maintenanceRecords) {
        if (new Date(m.service_date) < since12mo) continue;
        const key = monthKey(m.service_date);
        const cur = costByMonth.get(key) ?? { fuel: 0, service: 0, other: 0 };
        cur.service += Number(m.cost ?? 0);
        costByMonth.set(key, cur);
      }
      for (const e of expenses) {
        if (new Date(e.expense_date) < since12mo) continue;
        const key = monthKey(e.expense_date);
        const cur = costByMonth.get(key) ?? { fuel: 0, service: 0, other: 0 };
        cur.other += e.amount;
        costByMonth.set(key, cur);
      }
      const costOfOwnership = [...costByMonth.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, ...v, total: v.fuel + v.service + v.other }));
      const totalCost = costOfOwnership.reduce((s, c) => s + c.total, 0);

      const now = new Date();
      const horizon30 = new Date(now.getTime() + 30 * 86_400_000);
      const serviceReminders = {
        overdue: [
          ...maintenanceRecords.filter(m => m.next_due_date && new Date(m.next_due_date) < now),
          ...reminders.filter(r => r.status === 'PENDING' && new Date(r.due_date) < now),
        ].length,
        due_soon: [
          ...maintenanceRecords.filter(m => m.next_due_date && new Date(m.next_due_date) >= now && new Date(m.next_due_date) <= horizon30),
          ...reminders.filter(r => r.status === 'PENDING' && new Date(r.due_date) >= now && new Date(r.due_date) <= horizon30),
        ].length,
        dismissed: reminders.filter(r => r.status === 'DISMISSED').length,
      };

      return {
        vehicle: { ...vehicle, mileage_km: numOrNull(vehicle.mileage_km) },
        driver: driver ?? null,
        last_position: lastPosition ? {
          ...lastPosition, latitude: Number(lastPosition.latitude), longitude: Number(lastPosition.longitude),
          speed: numOrNull(lastPosition.speed), heading: numOrNull(lastPosition.heading),
          battery_pct: numOrNull(lastPosition.battery_pct),
        } : null,
        active_trip: activeTrip ? {
          ...activeTrip, distance_km: numOrNull(activeTrip.distance_km),
          cargo_weight_kg: numOrNull(activeTrip.cargo_weight_kg), cargo_temp_c: numOrNull(activeTrip.cargo_temp_c),
          load_capacity_pct: numOrNull(activeTrip.load_capacity_pct),
        } : null,
        cost_of_ownership: costOfOwnership,
        total_cost: totalCost,
        cost_per_km: vehicle.mileage_km && Number(vehicle.mileage_km) > 0
          ? Math.round((totalCost / Number(vehicle.mileage_km)) * 100) / 100 : null,
        service_reminders: serviceReminders,
        reminders,
        documents,
        open_issues: issues.filter(i => i.status !== 'RESOLVED'),
        issues,
        meter_readings: meterReadingsNum,
      };
    });
  });

  // ── Issues ───────────────────────────────────────────────────

  // Shared join/shape for a single issue row -> the fields the Issue Detail
  // page needs (vehicle, reporter, assignee names) without N+1 lookups.
  function issueSelect(trx: any) {
    return trx.selectFrom('vehicle_issues as vi')
      .innerJoin('vehicles as v', 'v.id', 'vi.vehicle_id')
      .leftJoin('users as reporter', 'reporter.id', 'vi.reported_by')
      .leftJoin('users as assignee', 'assignee.id', 'vi.assigned_to')
      .select([
        'vi.id', 'vi.tenant_id', 'vi.vehicle_id', 'vi.title', 'vi.description',
        'vi.severity', 'vi.priority', 'vi.status', 'vi.reported_by', 'vi.assigned_to',
        'vi.due_date', 'vi.due_odometer_km', 'vi.odometer_km', 'vi.resolved_odometer_km',
        'vi.source', 'vi.created_at', 'vi.resolved_at',
        'v.name as vehicle_name', 'v.plate_number as vehicle_plate', 'v.photo_url as vehicle_photo_url',
        'reporter.name as reported_by_name',
        'assignee.name as assigned_to_name', 'assignee.email as assigned_to_email',
      ]);
  }

  function numIssue(r: any) {
    return {
      ...r, due_odometer_km: numOrNull(r.due_odometer_km), odometer_km: numOrNull(r.odometer_km),
      resolved_odometer_km: numOrNull(r.resolved_odometer_km),
    };
  }

  // Tenant-wide list — the standalone Issues module page.
  fastify.get('/issues', async (req) => {
    const user = req.user;
    const { status, severity } = req.query as { status?: string; severity?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = issueSelect(trx).where('vi.tenant_id', '=', user.tenant_id);
      if (status) q = q.where('vi.status', '=', status);
      if (severity) q = q.where('vi.severity', '=', severity);
      const rows = await q.orderBy('vi.created_at', 'desc').limit(500).execute();
      return rows.map(numIssue);
    });
  });

  fastify.get('/issues/:id', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await issueSelect(trx).where('vi.id', '=', id).where('vi.tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Issue not found' });
      return numIssue(row);
    });
  });

  fastify.get('/vehicles/:id/issues', async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await issueSelect(trx)
        .where('vi.vehicle_id', '=', id).where('vi.tenant_id', '=', user.tenant_id)
        .orderBy('vi.created_at', 'desc').execute();
      return rows.map(numIssue);
    });
  });

  fastify.post('/vehicles/:id/issues', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as {
      title: string; description?: string; severity?: string; priority?: string;
      assigned_to?: string; due_date?: string; due_odometer_km?: number;
      odometer_km?: number; source?: string;
    };
    return withTenant(user.tenant_id, async (trx) => {
      let odometer = body.odometer_km;
      if (odometer == null) {
        const vehicle = await trx.selectFrom('vehicles').select('mileage_km')
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        odometer = vehicle?.mileage_km != null ? Number(vehicle.mileage_km) : undefined;
      }
      const inserted = await trx.insertInto('vehicle_issues').values({
        tenant_id: user.tenant_id, vehicle_id: id, title: body.title,
        description: body.description ?? null, severity: body.severity ?? 'MEDIUM',
        priority: body.priority ?? 'Medium',
        reported_by: user.sub, assigned_to: body.assigned_to ?? null,
        due_date: body.due_date ? new Date(body.due_date) : null,
        due_odometer_km: body.due_odometer_km ?? null, odometer_km: odometer ?? null,
        source: body.source ?? 'Manual',
      } as any).returningAll().executeTakeFirstOrThrow();
      
      await trx.insertInto('vehicle_issue_events').values({
        tenant_id: user.tenant_id, issue_id: inserted.id,
        event_type: 'OPENED', description: 'Issue Opened', created_by: user.sub,
      } as any).execute();

      const full = await issueSelect(trx).where('vi.id', '=', inserted.id).executeTakeFirstOrThrow();
      return numIssue(full);
    });
  });

  fastify.patch('/issues/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as Partial<{
      title: string; description: string; severity: string; priority: string; status: string;
      assigned_to: string; due_date: string; due_odometer_km: number; source: string;
    }>;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('vehicle_issues').select(['status']).where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirstOrThrow();
      
      const payload: any = { ...body };
      if (body.due_date) payload.due_date = new Date(body.due_date);
      
      const updated = await trx.updateTable('vehicle_issues').set(payload)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
        
      if (body.status && body.status !== existing.status) {
        await trx.insertInto('vehicle_issue_events').values({
          tenant_id: user.tenant_id, issue_id: id,
          event_type: 'STATUS_CHANGED', description: `Status changed to ${body.status}`, created_by: user.sub,
        } as any).execute();
      }
      
      const full = await issueSelect(trx).where('vi.id', '=', id).executeTakeFirstOrThrow();
      return numIssue(full);
    });
  });

  fastify.patch('/issues/:id/resolve', async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as { resolved_odometer_km?: number };
    return withTenant(user.tenant_id, async (trx) => {
      const issue = await trx.selectFrom('vehicle_issues').select('vehicle_id')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirstOrThrow();
      let resolvedOdo = body.resolved_odometer_km;
      if (resolvedOdo == null) {
        const vehicle = await trx.selectFrom('vehicles').select('mileage_km')
          .where('id', '=', issue.vehicle_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        resolvedOdo = vehicle?.mileage_km != null ? Number(vehicle.mileage_km) : undefined;
      }
      await trx.updateTable('vehicle_issues')
        .set({ status: 'RESOLVED', resolved_at: new Date(), resolved_odometer_km: resolvedOdo ?? null })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirstOrThrow();
        
      await trx.insertInto('vehicle_issue_events').values({
        tenant_id: user.tenant_id, issue_id: id,
        event_type: 'RESOLVED', description: 'Issue Resolved', created_by: user.sub,
      } as any).execute();

      return { success: true };
    });
  });

  fastify.get('/issues/:id/events', async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('vehicle_issue_events as vie')
        .leftJoin('users as u', 'u.id', 'vie.created_by')
        .select(['vie.id', 'vie.issue_id', 'vie.event_type', 'vie.description', 'vie.created_at', 'u.name as created_by_name', 'u.avatar_url as created_by_avatar'])
        .where('vie.issue_id', '=', id).where('vie.tenant_id', '=', user.tenant_id)
        .orderBy('vie.created_at', 'asc')
        .execute();
    });
  });

  fastify.post('/issues/:id/events', async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as { event_type?: string; description: string; };
    return withTenant(user.tenant_id, async (trx) => {
      const inserted = await trx.insertInto('vehicle_issue_events').values({
        tenant_id: user.tenant_id, issue_id: id,
        event_type: body.event_type ?? 'COMMENTED', description: body.description, created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow();
      
      const row = await trx.selectFrom('vehicle_issue_events as vie')
        .leftJoin('users as u', 'u.id', 'vie.created_by')
        .select(['vie.id', 'vie.issue_id', 'vie.event_type', 'vie.description', 'vie.created_at', 'u.name as created_by_name', 'u.avatar_url as created_by_avatar'])
        .where('vie.id', '=', inserted.id).executeTakeFirstOrThrow();
      return row;
    });
  });



  // ── Expenses ─────────────────────────────────────────────────

  fastify.get('/vehicles/:id/expenses', async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('vehicle_expenses').selectAll()
        .where('vehicle_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('expense_date', 'desc').execute();
      return rows.map(r => ({ ...r, amount: Number(r.amount) }));
    });
  });

  fastify.post('/vehicles/:id/expenses', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as { category?: string; description?: string; amount: number; expense_date?: string; vendor_id?: string };
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('vehicle_expenses').values({
        tenant_id: user.tenant_id, vehicle_id: id, category: body.category ?? 'OTHER',
        description: body.description ?? null, amount: body.amount,
        expense_date: body.expense_date ? new Date(body.expense_date) : new Date(),
        vendor_id: body.vendor_id ?? null, created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.delete('/expenses/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('vehicle_expenses').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });

  // ── Meter readings ───────────────────────────────────────────

  fastify.get('/vehicles/:id/meter-readings', async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('vehicle_meter_readings').selectAll()
        .where('vehicle_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('recorded_at', 'desc').limit(50).execute();
      return rows.map(r => ({ ...r, reading_km: Number(r.reading_km) }));
    });
  });

  fastify.post('/vehicles/:id/meter-readings', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as { reading_km: number; recorded_at?: string };
    return withTenant(user.tenant_id, async (trx) => {
      const reading = await trx.insertInto('vehicle_meter_readings').values({
        tenant_id: user.tenant_id, vehicle_id: id, reading_km: body.reading_km, source: 'MANUAL',
        recorded_at: body.recorded_at ? new Date(body.recorded_at) : new Date(), created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow();
      // Keep the vehicle's headline mileage in sync with the latest reading.
      await trx.updateTable('vehicles').set({ mileage_km: body.reading_km, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return reading;
    });
  });

  // ── Vehicle assignment (reassign the driver on this vehicle) ───

  fastify.patch('/vehicles/:id/assignment', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { driver_id } = req.body as { driver_id: string | null };
    return withTenant(user.tenant_id, async (trx) => {
      // Clear any existing driver assigned to this vehicle first (one driver per vehicle).
      await trx.updateTable('drivers').set({ assigned_vehicle_id: null, updated_at: new Date() })
        .where('assigned_vehicle_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      if (driver_id) {
        await trx.updateTable('drivers').set({ assigned_vehicle_id: id, updated_at: new Date() })
          .where('id', '=', driver_id).where('tenant_id', '=', user.tenant_id).execute();
      }
      return { ok: true };
    });
  });
}
