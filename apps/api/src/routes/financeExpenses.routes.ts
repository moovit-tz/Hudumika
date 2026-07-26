import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

type FinanceExpenseSource = 'finance' | 'fleet_vehicle' | 'fleet_fuel' | 'fleet_maintenance';

interface FinanceExpenseListItem {
  id: string;
  source: FinanceExpenseSource;
  name: string;
  amount: number;
  date: string;
  category: string;
  is_revenue: boolean;
  shipment_id: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  vehicle_id: string | null;
  vehicle_label: string | null;
  editable: boolean;
}

export async function financeExpensesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  const WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'] as const;

  /**
   * GET /v1/finance/expenses
   * Merged read-only view: real finance_expenses rows + live fleet costs
   * (vehicle_expenses, fuel_logs, maintenance_records), each tagged by source.
   */
  fastify.get('/expenses', async (request, reply) => {
    const user = request.user;

    return withTenant(user.tenant_id, async (trx) => {
      const [financeRows, vehicleExpenseRows, fuelRows, maintenanceRows] = await Promise.all([
        trx.selectFrom('finance_expenses')
          .select(['id', 'name', 'amount', 'expense_date', 'category', 'is_revenue', 'shipment_id', 'customer_id', 'supplier_id'])
          .orderBy('expense_date', 'desc')
          .execute(),
        trx.selectFrom('vehicle_expenses')
          .leftJoin('vehicles', 'vehicles.id', 'vehicle_expenses.vehicle_id')
          .select(['vehicle_expenses.id', 'vehicle_expenses.vehicle_id', 'vehicle_expenses.category', 'vehicle_expenses.description', 'vehicle_expenses.amount', 'vehicle_expenses.expense_date',
            'vehicles.name as vehicle_name', 'vehicles.plate_number as vehicle_plate'])
          .execute(),
        trx.selectFrom('fuel_logs')
          .leftJoin('vehicles', 'vehicles.id', 'fuel_logs.vehicle_id')
          .select(['fuel_logs.id', 'fuel_logs.vehicle_id', 'fuel_logs.cost', 'fuel_logs.station', 'fuel_logs.logged_at',
            'vehicles.name as vehicle_name', 'vehicles.plate_number as vehicle_plate'])
          .execute(),
        trx.selectFrom('maintenance_records')
          .leftJoin('vehicles', 'vehicles.id', 'maintenance_records.vehicle_id')
          .select(['maintenance_records.id', 'maintenance_records.vehicle_id', 'maintenance_records.service_type', 'maintenance_records.cost', 'maintenance_records.service_date',
            'vehicles.name as vehicle_name', 'vehicles.plate_number as vehicle_plate'])
          .execute(),
      ]);

      const vehicleLabel = (name: string | null, plate: string | null) =>
        name || plate ? [plate, name].filter(Boolean).join(' — ') : null;

      const items: FinanceExpenseListItem[] = [
        ...financeRows.map((r): FinanceExpenseListItem => ({
          id: r.id, source: 'finance', name: r.name, amount: Number(r.amount),
          date: new Date(r.expense_date).toISOString(), category: r.category, is_revenue: r.is_revenue,
          shipment_id: r.shipment_id, customer_id: r.customer_id, supplier_id: r.supplier_id,
          vehicle_id: null, vehicle_label: null, editable: true,
        })),
        ...vehicleExpenseRows.map((r): FinanceExpenseListItem => ({
          id: r.id, source: 'fleet_vehicle', name: r.description || r.category, amount: Number(r.amount),
          date: new Date(r.expense_date).toISOString(), category: r.category, is_revenue: false,
          shipment_id: null, customer_id: null, supplier_id: null,
          vehicle_id: r.vehicle_id, vehicle_label: vehicleLabel(r.vehicle_name, r.vehicle_plate), editable: false,
        })),
        ...fuelRows.map((r): FinanceExpenseListItem => ({
          id: r.id, source: 'fleet_fuel', name: `Fuel — ${r.station || 'Unknown station'}`, amount: Number(r.cost ?? 0),
          date: new Date(r.logged_at).toISOString(), category: 'FUEL', is_revenue: false,
          shipment_id: null, customer_id: null, supplier_id: null,
          vehicle_id: r.vehicle_id, vehicle_label: vehicleLabel(r.vehicle_name, r.vehicle_plate), editable: false,
        })),
        ...maintenanceRows.map((r): FinanceExpenseListItem => ({
          id: r.id, source: 'fleet_maintenance', name: r.service_type, amount: Number(r.cost ?? 0),
          date: new Date(r.service_date).toISOString(), category: 'MAINTENANCE', is_revenue: false,
          shipment_id: null, customer_id: null, supplier_id: null,
          vehicle_id: r.vehicle_id, vehicle_label: vehicleLabel(r.vehicle_name, r.vehicle_plate), editable: false,
        })),
      ].sort((a, b) => b.date.localeCompare(a.date));

      return { data: items };
    });
  });

  /**
   * GET /v1/finance/expenses/:id
   * Full detail of a single finance_expenses row (includes attachment_data,
   * excluded from the merged list above to keep that payload light).
   */
  fastify.get('/expenses/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('finance_expenses').selectAll().where('id', '=', id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Expense not found' });
      return row;
    });
  });

  /**
   * POST /v1/finance/expenses
   */
  fastify.post('/expenses', { preHandler: requireRole(...WRITE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const body = request.body as any;

    if (!body.name || body.amount == null) {
      return reply.status(400).send({ error: 'name and amount are required' });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.insertInto('finance_expenses').values({
        tenant_id: user.tenant_id,
        name: body.name,
        amount: Number(body.amount),
        expense_date: body.expense_date ? new Date(body.expense_date) : new Date(),
        category: body.category || 'MISCELLANEOUS',
        shipment_id: body.shipment_id || null,
        customer_id: body.customer_id || null,
        supplier_id: body.supplier_id || null,
        payment_mode: body.payment_mode || null,
        reference: body.reference || null,
        note: body.note || null,
        is_revenue: !!body.is_revenue,
        attachment_data: body.attachment_data || null,
        created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  /**
   * PATCH /v1/finance/expenses/:id
   */
  fastify.patch('/expenses/:id', { preHandler: requireRole(...WRITE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as any;

    const patch: Record<string, any> = {};
    for (const key of ['name', 'category', 'payment_mode', 'reference', 'note', 'attachment_data', 'efd_verified', 'efd_error'] as const) {
      if (key in body) patch[key] = body[key];
    }
    if ('amount' in body) patch.amount = Number(body.amount);
    if ('expense_date' in body) patch.expense_date = new Date(body.expense_date);
    if ('is_revenue' in body) patch.is_revenue = !!body.is_revenue;
    if ('shipment_id' in body) patch.shipment_id = body.shipment_id || null;
    if ('customer_id' in body) patch.customer_id = body.customer_id || null;
    if ('supplier_id' in body) patch.supplier_id = body.supplier_id || null;
    if ('efd_verified' in body) patch.efd_verified_at = new Date();

    if (Object.keys(patch).length === 0) return reply.status(400).send({ error: 'No fields to update' });

    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.updateTable('finance_expenses').set(patch).where('id', '=', id).returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Expense not found' });
      return row;
    });
  });

  /**
   * DELETE /v1/finance/expenses/:id
   */
  fastify.delete('/expenses/:id', { preHandler: requireRole(...WRITE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const deleted = await trx.deleteFrom('finance_expenses').where('id', '=', id).returningAll().executeTakeFirst();
      if (!deleted) return reply.status(404).send({ error: 'Expense not found' });
      return reply.status(204).send();
    });
  });
}
