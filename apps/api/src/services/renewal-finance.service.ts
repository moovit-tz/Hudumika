import { withTenant, type Database } from '../db/client.js';
import { sql, type Transaction } from 'kysely';
import type {
  RenewalCostLine, CreateCostLineInput, RenewalFinanceRecordOption,
  RenewalBudget, CreateBudgetInput, ApproveBudgetInput,
  RenewalAllocation, CreateAllocationInput,
  RenewalForecast, RenewalFinanceOverview, RenewalCycleCostSummary,
} from '@hudumika/types';

function toISO(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function mapCostLine(r: any): RenewalCostLine {
  return {
    id: r.id,
    cycle_id: r.cycle_id,
    cert_id: r.cert_id,
    entity_id: r.entity_id,
    site_id: r.site_id,
    category: r.category,
    description: r.description,
    payee_type: r.payee_type,
    payee_name: r.payee_name,
    currency: r.currency,
    quantity: Number(r.quantity),
    unit_price: Number(r.unit_price),
    tax_amount: Number(r.tax_amount),
    total_amount: Number(r.total_amount),
    due_date: r.due_date ? String(r.due_date) : null,
    source_type: r.source_type,
    source_ref: r.source_ref,
    assessment_date: r.assessment_date ? String(r.assessment_date) : null,
    assessment_version: r.assessment_version,
    notes: r.notes,
    created_by: r.created_by,
    created_at: toISO(r.created_at),
    updated_at: toISO(r.updated_at),
  };
}

function mapBudget(r: any): RenewalBudget {
  return {
    id: r.id,
    cycle_id: r.cycle_id,
    version: r.version,
    currency: r.currency,
    approved_amount: Number(r.approved_amount),
    allocated_lines: r.allocated_lines ?? [],
    reason: r.reason,
    status: r.status,
    requested_by: r.requested_by,
    requested_at: toISO(r.requested_at),
    approved_by: r.approved_by,
    approved_at: r.approved_at ? toISO(r.approved_at) : null,
    rejection_reason: r.rejection_reason,
    metadata: r.metadata ?? {},
    created_at: toISO(r.created_at),
  };
}

function mapAllocation(r: any): RenewalAllocation {
  return {
    id: r.id,
    cost_line_id: r.cost_line_id,
    cycle_id: r.cycle_id,
    allocation_type: r.allocation_type,
    finance_record_type: r.finance_record_type,
    finance_record_id: r.finance_record_id,
    currency: r.currency,
    amount: Number(r.amount),
    allocation_date: String(r.allocation_date),
    reconciled: r.reconciled,
    reconciled_by: r.reconciled_by,
    reconciled_at: r.reconciled_at ? toISO(r.reconciled_at) : null,
    notes: r.notes,
    created_by: r.created_by,
    created_at: toISO(r.created_at),
  };
}

function mapForecast(r: any): RenewalForecast {
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    snapshot_date: String(r.snapshot_date),
    currency: r.currency,
    forecast_30d: Number(r.forecast_30d),
    forecast_90d: Number(r.forecast_90d),
    forecast_365d: Number(r.forecast_365d),
    net_paid_ytd: Number(r.net_paid_ytd),
    open_commitments: Number(r.open_commitments),
    approved_budget: Number(r.approved_budget),
    unpriced_count: r.unpriced_count,
    coverage_pct: r.coverage_pct != null ? Number(r.coverage_pct) : null,
    created_at: toISO(r.created_at),
  };
}

function invalid(message: string, statusCode = 422): never {
  throw Object.assign(new Error(message), { statusCode });
}
const money = (n: number) => Math.round(n * 100) / 100;
async function requireCycle(trx: Transaction<Database>, tenantId: string, cycleId: string) {
  const cycle = await trx.selectFrom('comply_lifecycle_cycles').selectAll()
    .where('tenant_id', '=', tenantId).where('id', '=', cycleId).forUpdate().executeTakeFirst();
  if (!cycle) invalid('Renewal cycle not found', 404);
  return cycle;
}
async function reference(trx: Transaction<Database>, tenantId: string, table: 'comply_certificates' | 'tenant_entities' | 'tenant_sites', id: string | undefined) {
  if (id && !await trx.selectFrom(table).select('id').where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst()) {
    invalid('Referenced record not found in this workspace', 404);
  }
}
function amounts(input: Partial<CreateCostLineInput>) {
  for (const n of [input.unit_price, input.quantity, input.tax_amount]) {
    if (n !== undefined && (!Number.isFinite(n) || n < 0 || n > 1e12)) invalid('Amounts must be finite non-negative numbers');
  }
}

// Re-read the Finance source on every report: voided/deleted records must not
// remain evidence merely because an allocation was once reconciled.
async function book(trx: Transaction<Database>, tenantId: string, currency: string) {
  const lines = await trx.selectFrom('comply_renewal_cost_lines').selectAll().where('tenant_id', '=', tenantId).where('currency', '=', currency).execute();
  const allocations = await trx.selectFrom('comply_renewal_allocations').selectAll().where('tenant_id', '=', tenantId).where('currency', '=', currency).where('reconciled', '=', true).execute();
  const paymentRefs = allocations.filter(a => a.finance_record_type === 'bill_payment').map(a => a.finance_record_id);
  const payments = paymentRefs.length ? await trx.selectFrom('bill_payments').selectAll().where('tenant_id', '=', tenantId).where('currency', '=', currency).where('id', 'in', paymentRefs).execute() : [];
  const billRefs = [...new Set([...allocations.filter(a => a.finance_record_type === 'supplier_bill').map(a => a.finance_record_id), ...payments.map(p => p.bill_id)])];
  const bills = billRefs.length ? await trx.selectFrom('supplier_bills').selectAll().where('tenant_id', '=', tenantId).where('currency', '=', currency).where('status', 'in', ['POSTED', 'PARTIAL', 'PAID']).where('id', 'in', billRefs).execute() : [];
  const billIds = new Set(bills.map((b) => b.id));
  const paymentIds = new Set(payments.filter((p) => billIds.has(p.bill_id) && Number(p.amount) > 0).map((p) => p.id));
  const valid = allocations.filter((a) => (a.allocation_type === 'bill' && a.finance_record_type === 'supplier_bill' && billIds.has(a.finance_record_id)) || (a.allocation_type === 'payment' && a.finance_record_type === 'bill_payment' && paymentIds.has(a.finance_record_id)));
  const byLine = new Map<string, typeof valid>();
  for (const a of valid) {
    const entries = byLine.get(a.cost_line_id) ?? [];
    entries.push(a); byLine.set(a.cost_line_id, entries);
  }
  return lines.map((l) => {
    const aa = (byLine.get(l.id) ?? []).filter(a => a.cycle_id === l.cycle_id);
    const paid = aa.filter((a) => a.allocation_type === 'payment').reduce((s: number, a) => s + Number(a.amount), 0);
    const committed = aa.filter((a) => a.allocation_type === 'bill').reduce((s: number, a) => s + Number(a.amount), 0);
    return { ...l, estimated: Number(l.total_amount), paid, committed, remaining: Math.max(0, money(Number(l.total_amount) - paid)), open: Math.max(0, money(committed - paid)), allocations: aa };
  });
}

async function financeOverview(trx: Transaction<Database>, tenantId: string, currency?: string): Promise<RenewalFinanceOverview> {
      const cur = currency ?? 'TZS';
      const lines = await book(trx, tenantId, cur);
      const register = await cycleRegister(trx, tenantId, {currency:cur});
      const today = new Date().toISOString().slice(0, 10);
      const yearStart = today.slice(0, 4) + '-01-01';
      const forecast = (days: number) => {
        const end = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
        return money(lines.filter(l => l.due_date && toISO(l.due_date).slice(0, 10) <= end).reduce((s, l) => s + l.remaining, 0));
      };
      return {
        net_paid_ytd: money(lines.flatMap(l => l.allocations).filter(a => a.allocation_type === 'payment' && toISO(a.allocation_date).slice(0,10) >= yearStart && toISO(a.allocation_date).slice(0,10) <= today).reduce((s,a) => s + Number(a.amount), 0)),
        approved_budget: money(register.reduce((s,c) => s + c.approved_budget, 0)),
        open_commitments: money(lines.reduce((s,l) => s + l.open, 0)),
        due_payables: money(lines.filter(l => l.due_date && toISO(l.due_date).slice(0,10) <= today).reduce((s,l) => s + l.open, 0)),
        overdue_payables: money(lines.filter(l => l.due_date && toISO(l.due_date).slice(0,10) < today).reduce((s,l) => s + l.open, 0)),
        forecast_30d: forecast(30), forecast_90d: forecast(90), forecast_365d: forecast(365),
        budget_variance: money(register.reduce((s,c) => s + c.variance, 0)),
        unpriced_count: register.filter(c => !lines.some(l => l.cycle_id === c.cycle_id)).length,
        currency: cur,
      };
}

async function cycleRegister(trx: Transaction<Database>, tenantId: string, opts?: {
    currency?: string; entity_id?: string; site_id?: string;
    jurisdiction?: string; agency_code?: string; status?: string;
  }): Promise<RenewalCycleCostSummary[]> {
      const cur = opts?.currency ?? 'TZS';
      let q = trx.selectFrom('comply_lifecycle_cycles as cyc')
        .leftJoin('comply_certificates as cert', join => join.onRef('cert.id', '=', 'cyc.cert_id').on('cert.tenant_id', '=', tenantId))
        .leftJoin('tenant_entities as ent', join => join.onRef('ent.id', '=', 'cyc.entity_id').on('ent.tenant_id', '=', tenantId))
        .leftJoin('tenant_sites as site', join => join.onRef('site.id', '=', 'cyc.site_id').on('site.tenant_id', '=', tenantId))
        .select([
          'cyc.id as cycle_id',
          'cyc.cert_id',
          'cert.name as cert_name',
          'cert.cert_number',
          'cyc.agency_code',
          'cyc.entity_id',
          'cyc.site_id',
          'ent.legal_name as entity_name',
          'site.name as site_name',
          'cyc.jurisdiction',
          'cyc.status as cycle_status',
          'cert.expiry_date',
          'cyc.budget_estimate',
          'cyc.budget_currency',
        ])
        .where('cyc.tenant_id', '=', tenantId);

      if (opts?.entity_id) q = q.where('cyc.entity_id', '=', opts.entity_id);
      if (opts?.site_id) q = q.where('cyc.site_id', '=', opts.site_id);
      if (opts?.jurisdiction) q = q.where('cyc.jurisdiction', '=', opts.jurisdiction);
      if (opts?.agency_code) q = q.where('cyc.agency_code', '=', opts.agency_code);
      if (opts?.status) q = q.where('cyc.status', '=', opts.status);

      const cycles = await q.orderBy('cert.expiry_date', 'asc').execute();

      const ledger = await book(trx, tenantId, cur);
      const budgets = await trx.selectFrom('comply_renewal_budgets').selectAll().where('tenant_id', '=', tenantId).where('currency', '=', cur).where('status', '=', 'approved').execute();
      const results: RenewalCycleCostSummary[] = cycles.map(c => {
        const lines = ledger.filter(l => l.cycle_id === c.cycle_id);
        const estimated = money(lines.reduce((s,l) => s + l.estimated,0));
        const paid = money(lines.reduce((s,l) => s + l.paid,0));
        const budget = budgets.filter(b => b.cycle_id === c.cycle_id).sort((a,b) => b.version-a.version)[0];
        const approved = Number(budget?.approved_amount ?? 0);
        return { cycle_id: c.cycle_id, cert_id: c.cert_id, cert_name: c.cert_name, cert_number: c.cert_number,
          agency_code: c.agency_code, entity_name: c.entity_name, site_name: c.site_name,
          entity_id: c.entity_id, site_id: c.site_id, cost_line_count: lines.length,
          open_commitments: money(lines.reduce((s,l) => s + l.open,0)),
          jurisdiction: c.jurisdiction, cycle_status: c.cycle_status,
          expiry_date: c.expiry_date ? toISO(c.expiry_date).slice(0,10) : null, currency: cur,
          estimated_cost: estimated, approved_budget: approved,
          committed: money(lines.reduce((s,l) => s + l.committed,0)), net_paid: paid,
          remaining_forecast: money(lines.reduce((s,l) => s + l.remaining,0)), variance: money(approved-estimated),
          payee: lines.map(l => l.payee_name).filter(Boolean).join(', ') || null,
          has_evidence: lines.some(l => l.allocations.length > 0),
        };
      });

      return results;
}

export const RenewalFinanceService = {

  // ── Cost lines ──────────────────────────────────────────────────────────

  async createCostLine(tenantId: string, userId: string, input: CreateCostLineInput): Promise<RenewalCostLine> {
    return withTenant(tenantId, async trx => {
      await requireCycle(trx, tenantId, input.cycle_id);
      await reference(trx, tenantId, 'comply_certificates', input.cert_id);
      await reference(trx, tenantId, 'tenant_entities', input.entity_id);
      await reference(trx, tenantId, 'tenant_sites', input.site_id);
      amounts(input);
      const qty = input.quantity ?? 1;
      const tax = input.tax_amount ?? 0;
      const total = money(qty * input.unit_price + tax);

      const r = await trx.insertInto('comply_renewal_cost_lines').values({
        tenant_id: tenantId,
        cycle_id: input.cycle_id,
        cert_id: input.cert_id ?? null,
        entity_id: input.entity_id ?? null,
        site_id: input.site_id ?? null,
        category: input.category,
        description: input.description,
        payee_type: input.payee_type ?? null,
        payee_name: input.payee_name ?? null,
        currency: input.currency ?? 'TZS',
        quantity: String(qty),
        unit_price: String(input.unit_price),
        tax_amount: String(tax),
        total_amount: String(total),
        due_date: input.due_date ?? null,
        source_type: input.source_type ?? null,
        source_ref: input.source_ref ?? null,
        assessment_date: input.assessment_date ?? null,
        notes: input.notes ?? null,
        created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('comply_renewal_audit').values({
        tenant_id: tenantId,
        cycle_id: input.cycle_id,
        actor_id: userId,
        action: 'create_cost_line',
        target_type: 'cost_line',
        target_id: r.id,
        new_value: JSON.stringify({ category: input.category, total: total, currency: input.currency ?? 'TZS' }),
      }).execute();

      return mapCostLine(r);
    });
  },

  async listCostLines(tenantId: string, cycleId: string): Promise<RenewalCostLine[]> {
    return withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('comply_renewal_cost_lines').selectAll()
        .where('tenant_id', '=', tenantId)
        .where('cycle_id', '=', cycleId)
        .orderBy('created_at', 'asc')
        .execute();
      return rows.map(mapCostLine);
    });
  },

  async updateCostLine(tenantId: string, userId: string, costLineId: string, updates: Partial<CreateCostLineInput>): Promise<RenewalCostLine> {
    return withTenant(tenantId, async trx => {
      const existing = await trx.selectFrom('comply_renewal_cost_lines').selectAll()
        .where('id', '=', costLineId).where('tenant_id', '=', tenantId)
        .forUpdate().executeTakeFirstOrThrow();

      amounts(updates);
      const allocated = await trx.selectFrom('comply_renewal_allocations').select('id').where('tenant_id', '=', tenantId).where('cost_line_id', '=', costLineId).executeTakeFirst();
      if (allocated && [updates.currency, updates.quantity, updates.unit_price, updates.tax_amount].some(v => v !== undefined)) invalid('Allocated cost amounts and currency are immutable; add a separate adjustment line', 409);
      const vals: Record<string, unknown> = { updated_at: new Date() };
      if (updates.description !== undefined) vals.description = updates.description;
      if (updates.payee_type !== undefined) vals.payee_type = updates.payee_type;
      if (updates.payee_name !== undefined) vals.payee_name = updates.payee_name;
      if (updates.currency !== undefined) vals.currency = updates.currency;
      if (updates.due_date !== undefined) vals.due_date = updates.due_date;
      if (updates.source_type !== undefined) vals.source_type = updates.source_type;
      if (updates.source_ref !== undefined) vals.source_ref = updates.source_ref;
      if (updates.notes !== undefined) vals.notes = updates.notes;

      if (updates.unit_price !== undefined || updates.quantity !== undefined || updates.tax_amount !== undefined) {
        const qty = updates.quantity ?? Number(existing.quantity);
        const price = updates.unit_price ?? Number(existing.unit_price);
        const tax = updates.tax_amount ?? Number(existing.tax_amount);
        vals.quantity = String(qty);
        vals.unit_price = String(price);
        vals.tax_amount = String(tax);
        vals.total_amount = String(qty * price + tax);
      }

      const r = await trx.updateTable('comply_renewal_cost_lines')
        .set(vals)
        .where('id', '=', costLineId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('comply_renewal_audit').values({
        tenant_id: tenantId,
        cycle_id: existing.cycle_id,
        actor_id: userId,
        action: 'update_cost_line',
        target_type: 'cost_line',
        target_id: costLineId,
        previous_value: JSON.stringify({ total: Number(existing.total_amount) }),
        new_value: JSON.stringify({ total: Number(r.total_amount) }),
      }).execute();

      return mapCostLine(r);
    });
  },

  async deleteCostLine(tenantId: string, userId: string, costLineId: string): Promise<void> {
    return withTenant(tenantId, async trx => {
      const existing = await trx.selectFrom('comply_renewal_cost_lines').selectAll()
        .where('id', '=', costLineId).where('tenant_id', '=', tenantId)
        .forUpdate().executeTakeFirstOrThrow();

      const allocCount = await trx.selectFrom('comply_renewal_allocations')
        .select(sql<number>`count(*)`.as('cnt'))
        .where('cost_line_id', '=', costLineId)
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();
      if (allocCount && Number(allocCount.cnt) > 0) {
        throw new Error('Cannot delete a cost line with existing finance allocations');
      }

      await trx.deleteFrom('comply_renewal_cost_lines')
        .where('id', '=', costLineId).where('tenant_id', '=', tenantId)
        .execute();

      await trx.insertInto('comply_renewal_audit').values({
        tenant_id: tenantId,
        cycle_id: existing.cycle_id,
        actor_id: userId,
        action: 'delete_cost_line',
        target_type: 'cost_line',
        target_id: costLineId,
        previous_value: JSON.stringify({ category: existing.category, total: Number(existing.total_amount) }),
      }).execute();
    });
  },

  // ── Budgets ─────────────────────────────────────────────────────────────

  async createBudget(tenantId: string, userId: string, input: CreateBudgetInput): Promise<RenewalBudget> {
    return withTenant(tenantId, async trx => {
      await requireCycle(trx, tenantId, input.cycle_id);
      if (!Number.isFinite(input.approved_amount) || input.approved_amount < 0) invalid('Invalid budget amount');
      const maxVersion = await trx.selectFrom('comply_renewal_budgets')
        .select(sql<number>`coalesce(max(version), 0)`.as('mv'))
        .where('tenant_id', '=', tenantId)
        .where('cycle_id', '=', input.cycle_id)
        .executeTakeFirst();
      const nextVersion = (maxVersion ? Number(maxVersion.mv) : 0) + 1;

      if (nextVersion > 1) {
        await trx.updateTable('comply_renewal_budgets')
          .set({ status: 'superseded' })
          .where('tenant_id', '=', tenantId)
          .where('cycle_id', '=', input.cycle_id)
          .where('currency', '=', input.currency ?? 'TZS')
          .where('status', 'in', ['draft', 'pending_approval'])
          .execute();
      }

      const r = await trx.insertInto('comply_renewal_budgets').values({
        tenant_id: tenantId,
        cycle_id: input.cycle_id,
        version: nextVersion,
        currency: input.currency ?? 'TZS',
        approved_amount: String(input.approved_amount),
        allocated_lines: JSON.stringify(input.allocated_lines ?? []),
        reason: input.reason ?? null,
        status: 'pending_approval',
        requested_by: userId,
      }).returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('comply_renewal_audit').values({
        tenant_id: tenantId,
        cycle_id: input.cycle_id,
        actor_id: userId,
        action: 'create_budget',
        target_type: 'budget',
        target_id: r.id,
        new_value: JSON.stringify({ version: nextVersion, amount: input.approved_amount, currency: input.currency ?? 'TZS' }),
      }).execute();

      return mapBudget(r);
    });
  },

  async approveBudget(tenantId: string, budgetId: string, userId: string, input: ApproveBudgetInput): Promise<RenewalBudget> {
    return withTenant(tenantId, async trx => {
      const candidate = await trx.selectFrom('comply_renewal_budgets').select('cycle_id')
        .where('id', '=', budgetId).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
      await requireCycle(trx, tenantId, candidate.cycle_id);
      const existing = await trx.selectFrom('comply_renewal_budgets').selectAll()
        .where('id', '=', budgetId).where('tenant_id', '=', tenantId).forUpdate().executeTakeFirstOrThrow();

      if (existing.status !== 'pending_approval') {
        throw new Error(`Budget is ${existing.status}, not pending_approval`);
      }
      if (existing.requested_by === userId) {
        throw new Error('Budget requester cannot approve their own budget');
      }

      if (input.approved) {
        await trx.updateTable('comply_renewal_budgets').set({status: 'superseded'})
          .where('tenant_id', '=', tenantId).where('cycle_id', '=', existing.cycle_id)
          .where('currency', '=', existing.currency).where('status', '=', 'approved').execute();
      }
      const newStatus = input.approved ? 'approved' : 'rejected';
      const r = await trx.updateTable('comply_renewal_budgets')
        .set({
          status: newStatus,
          approved_by: userId,
          approved_at: new Date(),
          rejection_reason: input.approved ? null : (input.rejection_reason ?? null),
        })
        .where('id', '=', budgetId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('comply_renewal_audit').values({
        tenant_id: tenantId,
        cycle_id: existing.cycle_id,
        actor_id: userId,
        action: input.approved ? 'approve_budget' : 'reject_budget',
        target_type: 'budget',
        target_id: budgetId,
        previous_value: JSON.stringify({ status: 'pending_approval' }),
        new_value: JSON.stringify({ status: newStatus }),
      }).execute();

      return mapBudget(r);
    });
  },

  async listBudgets(tenantId: string, cycleId: string): Promise<RenewalBudget[]> {
    return withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('comply_renewal_budgets').selectAll()
        .where('tenant_id', '=', tenantId)
        .where('cycle_id', '=', cycleId)
        .orderBy('version', 'desc')
        .execute();
      return rows.map(mapBudget);
    });
  },

  // ── Allocations ─────────────────────────────────────────────────────────

  async createAllocation(tenantId: string, userId: string, input: CreateAllocationInput): Promise<RenewalAllocation> {
    return withTenant(tenantId, async trx => {
      await requireCycle(trx, tenantId, input.cycle_id);
      const costLine = await trx.selectFrom('comply_renewal_cost_lines').selectAll()
        .where('id', '=', input.cost_line_id).where('tenant_id', '=', tenantId).forUpdate().executeTakeFirst();
      if (!costLine || costLine.cycle_id !== input.cycle_id) invalid('Cost line does not belong to this renewal cycle', 404);
      if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1e12) invalid('Allocation amount must be positive');
      if (input.currency && input.currency !== costLine.currency) invalid('Allocation currency must match the cost line');
      // Customer receipts and manually declared refunds are not supplier settlements.
      if (!((input.allocation_type === 'bill' && input.finance_record_type === 'supplier_bill') ||
            (input.allocation_type === 'payment' && input.finance_record_type === 'bill_payment'))) {
        invalid('Only posted supplier bills and recorded supplier payments can be linked. Supplier refunds, credits and expense settlements require an authoritative Finance record.');
      }
      const table = input.finance_record_type === 'supplier_bill' ? 'supplier_bills' : 'bill_payments';
      type Source = {id:string; currency:string; amount?:number; total?:number; bill_id?:string; status?:string; bill_date?:Date|string|null; payment_date?:Date|string|null; created_at:Date|string};
      const record: Source | undefined = table === 'supplier_bills'
        ? await trx.selectFrom('supplier_bills').select(['id','currency','total','status','bill_date','created_at']).where('tenant_id','=',tenantId).where('id','=',input.finance_record_id).forUpdate().executeTakeFirst()
        : await trx.selectFrom('bill_payments').select(['id','currency','amount','bill_id','payment_date','created_at']).where('tenant_id','=',tenantId).where('id','=',input.finance_record_id).forUpdate().executeTakeFirst();
      if (!record) invalid('Finance record not found in this workspace', 404);
      if (record.currency !== costLine.currency) invalid('Finance record currency must match the cost line');
      const bill = table === 'supplier_bills' ? record : await trx.selectFrom('supplier_bills').select(['id','status','bill_date'])
        .where('tenant_id', '=', tenantId).where('id', '=', record.bill_id!).executeTakeFirst();
      if (!bill || !['POSTED', 'PARTIAL', 'PAID'].includes(bill.status!)) invalid('Finance bill must be posted and not voided', 409);
      const cap = Number(table === 'supplier_bills' ? record.total : record.amount);
      if (!(cap > 0)) invalid('Finance record has no positive allocatable amount');
      const used = await trx.selectFrom('comply_renewal_allocations').select(sql<number>`coalesce(sum(amount),0)`.as('total'))
        .where('tenant_id', '=', tenantId).where('finance_record_type', '=', input.finance_record_type)
        .where('finance_record_id', '=', input.finance_record_id).executeTakeFirst();
      if (money(Number(used?.total ?? 0) + input.amount) > cap) invalid('Over-allocation: Finance record amount exceeded', 409);
      const existing = await trx.selectFrom('comply_renewal_allocations').select(sql<number>`coalesce(sum(amount),0)`.as('total'))
        .where('tenant_id', '=', tenantId).where('cost_line_id', '=', input.cost_line_id)
        .where('allocation_type', '=', input.allocation_type).executeTakeFirst();
      if (money(Number(existing?.total ?? 0) + input.amount) > Number(costLine.total_amount)) invalid('Over-allocation: cost line amount exceeded', 409);
      const sourceDate = table === 'supplier_bills' ? bill.bill_date : record.payment_date;
      const allocationDate = sourceDate ? toISO(sourceDate).slice(0, 10) : toISO(record.created_at).slice(0, 10);
      const r = await trx.insertInto('comply_renewal_allocations').values({
        tenant_id: tenantId,
        cost_line_id: input.cost_line_id,
        cycle_id: input.cycle_id,
        allocation_type: input.allocation_type,
        finance_record_type: input.finance_record_type,
        finance_record_id: input.finance_record_id,
        currency: input.currency ?? costLine.currency,
        amount: String(input.amount),
        allocation_date: allocationDate,
        reconciled: true, reconciled_by: userId, reconciled_at: new Date(),
        notes: input.notes ?? null,
        created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('comply_renewal_audit').values({
        tenant_id: tenantId,
        cycle_id: input.cycle_id,
        actor_id: userId,
        action: 'create_allocation',
        target_type: 'allocation',
        target_id: r.id,
        new_value: JSON.stringify({
          type: input.allocation_type,
          amount: input.amount,
          finance_record: `${input.finance_record_type}:${input.finance_record_id}`,
        }),
      }).execute();

      return mapAllocation(r);
    });
  },

  async listFinanceRecords(tenantId: string, currency: string, search = ''): Promise<RenewalFinanceRecordOption[]> {
    return withTenant(tenantId, async trx => {
      const bills = await trx.selectFrom('supplier_bills').selectAll().where('tenant_id', '=', tenantId)
        .where('currency', '=', currency).where('status', 'in', ['POSTED','PARTIAL','PAID'])
        .where(eb => eb.or([eb('bill_number', 'ilike', `%${search}%`), eb('supplier_name', 'ilike', `%${search}%`)]))
        .orderBy('created_at', 'desc').limit(100).execute();
      if (!bills.length) return [];
      const payments = await trx.selectFrom('bill_payments').selectAll().where('tenant_id', '=', tenantId).where('currency', '=', currency)
        .where('bill_id', 'in', bills.map(b => b.id)).orderBy('created_at', 'desc').limit(200).execute();
      const used = await trx.selectFrom('comply_renewal_allocations').selectAll().where('tenant_id', '=', tenantId).where('currency', '=', currency).execute();
      const records: RenewalFinanceRecordOption[] = [
        ...bills.map(b => ({id:b.id, type:'supplier_bill' as const, label:`${b.bill_number} · ${b.supplier_name ?? 'Supplier'}`, currency:b.currency, amount:Number(b.total), available:0, bill_id:b.id})),
        ...payments.map(p => ({id:p.id, type:'bill_payment' as const, label:`Payment · ${bills.find(b => b.id === p.bill_id)?.bill_number} · ${p.reference ?? p.id.slice(0,8)}`, currency:p.currency, amount:Number(p.amount), available:0, bill_id:p.bill_id})),
      ];
      return records.map(r => ({...r, available:money(r.amount-used.filter(a => a.finance_record_id === r.id && a.finance_record_type === r.type).reduce((s,a)=>s+Number(a.amount),0))})).filter(r => r.available > 0);
    });
  },

  async listAllocations(tenantId: string, cycleId: string): Promise<RenewalAllocation[]> {
    return withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('comply_renewal_allocations').selectAll()
        .where('tenant_id', '=', tenantId)
        .where('cycle_id', '=', cycleId)
        .orderBy('created_at', 'asc')
        .execute();
      const currencies = [...new Set(rows.map(r => r.currency))];
      const books = await Promise.all(currencies.map(c => book(trx, tenantId, c)));
      const valid = new Set(books.flat().flatMap(l => l.allocations).map(a => a.id));
      const payments = await trx.selectFrom('bill_payments').select(['id','bill_id']).where('tenant_id','=',tenantId).execute();
      return rows.map(r => ({...mapAllocation(r), reconciled: valid.has(r.id),
        bill_id: r.finance_record_type === 'supplier_bill' ? r.finance_record_id : payments.find(p=>p.id===r.finance_record_id)?.bill_id}));
    });
  },

  // ── Aggregation: overview cards ─────────────────────────────────────────

  async getOverview(tenantId: string, currency?: string): Promise<RenewalFinanceOverview> {
    return withTenant(tenantId, trx => financeOverview(trx, tenantId, currency));
  },

  // ── Register: per-cycle cost summary ────────────────────────────────────

  async getCycleRegister(tenantId: string, opts?: {
    currency?: string; entity_id?: string; site_id?: string;
    jurisdiction?: string; agency_code?: string; status?: string;
  }): Promise<RenewalCycleCostSummary[]> {
    return withTenant(tenantId, trx => cycleRegister(trx, tenantId, opts));
  },

  // ── Forecast snapshot ───────────────────────────────────────────────────

  async saveForecastSnapshot(tenantId: string, currency?: string): Promise<RenewalForecast> {
    return withTenant(tenantId, async trx => {
      const cur = currency ?? 'TZS';
      const now = new Date();
      const overview = await financeOverview(trx, tenantId, cur);
      const {net_paid_ytd: netPaid, open_commitments: openCommitments, approved_budget: approvedBudget,
        forecast_30d: f30, forecast_90d: f90, forecast_365d: f365} = overview;
      const register = await cycleRegister(trx, tenantId, {currency: cur});
      const coveragePct = register.length ? Math.round((register.length-overview.unpriced_count)/register.length*10000)/100 : null;
      const r = await trx.insertInto('comply_renewal_forecasts').values({
        tenant_id: tenantId,
        snapshot_date: now.toISOString().slice(0, 10),
        currency: cur,
        forecast_30d: String(f30),
        forecast_90d: String(f90),
        forecast_365d: String(f365),
        net_paid_ytd: String(netPaid),
        open_commitments: String(openCommitments),
        approved_budget: String(approvedBudget),
        unpriced_count: overview.unpriced_count,
        coverage_pct: coveragePct != null ? String(coveragePct) : null,
      }).onConflict(oc => (oc as any).columns(['tenant_id', 'snapshot_date', 'currency']).doUpdateSet({
        forecast_30d: String(f30),
        forecast_90d: String(f90),
        forecast_365d: String(f365),
        net_paid_ytd: String(netPaid),
        open_commitments: String(openCommitments),
        approved_budget: String(approvedBudget),
        unpriced_count: overview.unpriced_count,
        coverage_pct: coveragePct != null ? String(coveragePct) : null,
      })).returningAll().executeTakeFirstOrThrow();

      return mapForecast(r);
    });
  },

  async listForecasts(tenantId: string, currency?: string): Promise<RenewalForecast[]> {
    return withTenant(tenantId, async trx => {
      let q = trx.selectFrom('comply_renewal_forecasts').selectAll()
        .where('tenant_id', '=', tenantId);
      if (currency) q = q.where('currency', '=', currency);
      const rows = await q.orderBy('snapshot_date', 'desc').limit(90).execute();
      return rows.map(mapForecast);
    });
  },

  // ── Audit trail ─────────────────────────────────────────────────────────

  async getAuditTrail(tenantId: string, cycleId: string): Promise<any[]> {
    return withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('comply_renewal_audit').selectAll()
        .where('tenant_id', '=', tenantId)
        .where('cycle_id', '=', cycleId)
        .orderBy('created_at', 'desc')
        .execute();
      return rows.map(r => ({
        ...r,
        previous_value: r.previous_value ?? null,
        new_value: r.new_value ?? null,
        created_at: toISO(r.created_at),
      }));
    });
  },
};
