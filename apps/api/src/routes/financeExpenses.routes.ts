import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { GLService } from '../services/gl.service.js';

type FinanceExpenseSource = 'finance' | 'fleet_vehicle' | 'fleet_fuel' | 'fleet_maintenance';

// Expense category → GL expense account (see gl.service.ts STANDARD_COA).
// Anything unmapped falls to 5900 "Other Operating Expenses".
const EXPENSE_ACCOUNT: Record<string, string> = {
  PORT_CHARGES: '5000', CUSTOMS_DUTY: '5000', HANDLING: '5000', INSPECTION_FEE: '5000', AGENT_FEE: '5000',
  FREIGHT: '5001', TRANSPORT: '5002',
};
const CASH_ACCOUNT = '1010';      // Bank Account (TZS)
const OTHER_REVENUE_ACCOUNT = '4500';

/**
 * Post a finance_expenses row to the general ledger so it reaches P&L / Trial
 * Balance / Balance Sheet. An expense debits its expense account and credits
 * cash; an income row (the "record as revenue" toggle) does the reverse against
 * Other Revenue. Keyed by source ('EXPENSE', id) so it can be reversed and
 * re-posted cleanly when the row is edited or deleted.
 */
async function postExpenseToGl(tenantId: string, row: any, userId: string | null): Promise<void> {
  const amount = Number(row.amount) || 0;
  if (amount <= 0) return;
  const entryDate = row.expense_date ? new Date(row.expense_date).toISOString() : new Date().toISOString();
  const expenseAccount = (row.category && EXPENSE_ACCOUNT[row.category]) || '5900';
  const lines = row.is_revenue
    ? [
        { accountCode: CASH_ACCOUNT, debit: amount, credit: 0, description: 'Cash received' },
        { accountCode: OTHER_REVENUE_ACCOUNT, debit: 0, credit: amount, description: row.name || 'Other revenue' },
      ]
    : [
        { accountCode: expenseAccount, debit: amount, credit: 0, description: row.name || 'Expense' },
        { accountCode: CASH_ACCOUNT, debit: 0, credit: amount, description: 'Cash paid' },
      ];
  await GLService.post(tenantId, {
    entryDate,
    description: `${row.is_revenue ? 'Revenue' : 'Expense'}: ${row.name || ''}`.trim(),
    reference: row.reference || null,
    sourceModule: 'EXPENSE',
    sourceId: row.id,
    createdBy: userId ?? undefined,
    lines,
  });
}

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
          .where('tenant_id', '=', user.tenant_id)
          .orderBy('expense_date', 'desc')
          .execute(),
        trx.selectFrom('vehicle_expenses')
          .leftJoin('vehicles', 'vehicles.id', 'vehicle_expenses.vehicle_id')
          .select(['vehicle_expenses.id', 'vehicle_expenses.vehicle_id', 'vehicle_expenses.category', 'vehicle_expenses.description', 'vehicle_expenses.amount', 'vehicle_expenses.expense_date',
            'vehicles.name as vehicle_name', 'vehicles.plate_number as vehicle_plate'])
          .where('vehicle_expenses.tenant_id', '=', user.tenant_id)
          .execute(),
        trx.selectFrom('fuel_logs')
          .leftJoin('vehicles', 'vehicles.id', 'fuel_logs.vehicle_id')
          .select(['fuel_logs.id', 'fuel_logs.vehicle_id', 'fuel_logs.cost', 'fuel_logs.station', 'fuel_logs.logged_at',
            'vehicles.name as vehicle_name', 'vehicles.plate_number as vehicle_plate'])
          .where('fuel_logs.tenant_id', '=', user.tenant_id)
          .execute(),
        trx.selectFrom('maintenance_records')
          .leftJoin('vehicles', 'vehicles.id', 'maintenance_records.vehicle_id')
          .select(['maintenance_records.id', 'maintenance_records.vehicle_id', 'maintenance_records.service_type', 'maintenance_records.cost', 'maintenance_records.service_date',
            'vehicles.name as vehicle_name', 'vehicles.plate_number as vehicle_plate'])
          .where('maintenance_records.tenant_id', '=', user.tenant_id)
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

    const row = await withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('finance_expenses').values({
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
    });
    // Reflect it in the ledger. Best-effort: a GL failure must not lose the
    // recorded expense, but it is logged, never silently swallowed.
    try { await postExpenseToGl(user.tenant_id, row, user.sub); }
    catch (e: any) { request.log.error({ err: e }, '[Finance] expense GL post failed'); }
    return reply.status(201).send(row);
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

    const row = await withTenant(user.tenant_id, async (trx) => {
      // Scoped. Without the tenant filter this reached any expense in the
      // database given its id, and RLS does not stop it: the connection owns
      // the table, and Postgres lets an owner bypass row-level policies.
      return trx.updateTable('finance_expenses').set(patch)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
    });
    if (!row) return reply.status(404).send({ error: 'Expense not found' });
    // Re-post: drop the prior ledger entry and post the corrected figures, so
    // a changed amount/category/direction never double-counts in P&L.
    try {
      await GLService.reverseBySource(user.tenant_id, 'EXPENSE', id);
      await postExpenseToGl(user.tenant_id, row, user.sub);
    } catch (e: any) { request.log.error({ err: e }, '[Finance] expense GL re-post failed'); }
    return row;
  });

  /**
   * DELETE /v1/finance/expenses/:id
   */
  fastify.delete('/expenses/:id', { preHandler: requireRole(...WRITE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    const deleted = await withTenant(user.tenant_id, async (trx) => {
      return trx.deleteFrom('finance_expenses')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
    });
    if (!deleted) return reply.status(404).send({ error: 'Expense not found' });
    // Remove its ledger entry so the expense leaves P&L along with the record.
    try { await GLService.reverseBySource(user.tenant_id, 'EXPENSE', id); }
    catch (e: any) { request.log.error({ err: e }, '[Finance] expense GL reversal failed'); }
    return reply.status(204).send();
  });
}
