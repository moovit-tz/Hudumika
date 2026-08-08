/**
 * Payroll: statutory settings, runs, payslips.
 *
 * Two rules shape most of what follows.
 *
 * Payroll is the most sensitive data in the platform — it is everyone's salary.
 * Reading a run or anyone else's payslip is restricted to the roles that
 * genuinely need it; a person can always read their own. "Their own" is taken
 * from the token, never from a query parameter, so it cannot be asked for on
 * someone else's behalf.
 *
 * And a calculated run is a record of what was paid. Once approved it is frozen:
 * recalculating it would silently rewrite history at whatever rates happen to be
 * current, which is precisely what the effective-dated bands exist to prevent.
 */
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import {
  computePayslip, summariseRun,
  type TaxBand, type ContributionScheme, type PayslipResult, type Residency,
} from '../services/payroll.service.js';

/** Roles that may see the whole payroll rather than only their own payslip. */
const PAYROLL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'FINANCE'] as const;
const canSeeAll = (role: string) => (PAYROLL_ROLES as readonly string[]).includes(role);

const num = (v: unknown): number => Number(v ?? 0);

function isoDate(v: unknown): string {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v ?? '').slice(0, 10);
}

/** The bands in force for a jurisdiction and residency on a given date. */
async function loadBands(trx: any, tenantId: string, jurisdiction: string, residency: Residency, onDate: string): Promise<TaxBand[]> {
  const rows = await trx.selectFrom('payroll_tax_bands').selectAll()
    .where('tenant_id', '=', tenantId)
    .where('jurisdiction', '=', jurisdiction)
    .where('residency', '=', residency)
    .where('effective_from', '<=', onDate)
    .where((eb: any) => eb.or([eb('effective_to', 'is', null), eb('effective_to', '>=', onDate)]))
    .orderBy('effective_from', 'desc').orderBy('seq', 'asc').execute();

  // Several vintages can match the date filter; only the newest one applies.
  const newest = rows.length ? isoDate(rows[0].effective_from) : null;
  return rows.filter((b: any) => isoDate(b.effective_from) === newest).map((b: any) => ({
    seq: b.seq,
    lowerBound: num(b.lower_bound),
    upperBound: b.upper_bound === null ? null : num(b.upper_bound),
    ratePct: num(b.rate_pct),
    fixedAmount: num(b.fixed_amount),
  }));
}

async function loadSchemes(trx: any, tenantId: string, jurisdiction: string, onDate: string): Promise<ContributionScheme[]> {
  const rows = await trx.selectFrom('payroll_contribution_schemes').selectAll()
    .where('tenant_id', '=', tenantId)
    .where('jurisdiction', '=', jurisdiction)
    .where('active', '=', true)
    .where('effective_from', '<=', onDate)
    .where((eb: any) => eb.or([eb('effective_to', 'is', null), eb('effective_to', '>=', onDate)]))
    .orderBy('code').execute();
  return rows.map((s: any) => ({
    code: s.code, name: s.name,
    employeePct: num(s.employee_pct), employerPct: num(s.employer_pct),
    calcBase: s.calc_base, reducesTaxBase: s.reduces_tax_base,
    minEmployees: s.min_employees, onPayslip: s.on_payslip,
  }));
}

export async function payrollRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('nexushr'));

  // ── Statutory settings ──────────────────────────────────────────────────

  fastify.get('/settings', { preHandler: requireRole(...PAYROLL_ROLES) }, async (req) => {
    const user = req.user;
    const q = req.query as any;
    const jurisdiction = String(q.jurisdiction ?? 'TZ');
    const onDate = isoDate(q.on_date ?? new Date());

    return withTenant(user.tenant_id, async (trx) => {
      const [resident, nonResident, schemes, componentTypes] = await Promise.all([
        loadBands(trx, user.tenant_id, jurisdiction, 'RESIDENT', onDate),
        loadBands(trx, user.tenant_id, jurisdiction, 'NON_RESIDENT', onDate),
        loadSchemes(trx, user.tenant_id, jurisdiction, onDate),
        trx.selectFrom('payroll_component_types').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('active', '=', true)
          .orderBy('direction').orderBy('name').execute(),
      ]);
      return {
        jurisdiction, on_date: onDate,
        bands: { RESIDENT: resident, NON_RESIDENT: nonResident },
        schemes, component_types: componentTypes,
        // Says plainly when a tenant has no rates rather than returning empty
        // arrays that read as "nothing is owed".
        configured: resident.length > 0 && schemes.length > 0,
      };
    });
  });

  fastify.patch('/settings/schemes/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const b = req.body as any;

    // Everything validated before any write. Returning a 4xx from inside
    // withTenant returns *normally*, so the transaction commits — a rejected
    // request that had already written would leave the change behind.
    const patch: Record<string, unknown> = {};
    for (const [key, col] of [['employee_pct', 'employee_pct'], ['employer_pct', 'employer_pct']] as const) {
      if (b[key] === undefined) continue;
      const v = Number(b[key]);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        return reply.status(400).send({ error: `${key} must be a percentage between 0 and 100` });
      }
      patch[col] = v;
    }
    if (b.calc_base !== undefined) {
      if (!['BASIC', 'GROSS', 'TAXABLE'].includes(b.calc_base)) {
        return reply.status(400).send({ error: 'calc_base must be BASIC, GROSS or TAXABLE' });
      }
      patch.calc_base = b.calc_base;
    }
    if (b.min_employees !== undefined) {
      const v = Number(b.min_employees);
      if (!Number.isInteger(v) || v < 0) return reply.status(400).send({ error: 'min_employees must be a whole number of employees' });
      patch.min_employees = v;
    }
    if (b.reduces_tax_base !== undefined) patch.reduces_tax_base = !!b.reduces_tax_base;
    if (b.active !== undefined) patch.active = !!b.active;
    if (Object.keys(patch).length === 0) return reply.status(400).send({ error: 'Nothing to update' });
    patch.updated_at = new Date();

    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('payroll_contribution_schemes').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Scheme not found' });
      return updated;
    });
  });

  // ── What a specific person earns and owes ───────────────────────────────

  fastify.get('/employees/:userId/components', async (req, reply) => {
    const user = req.user;
    const { userId } = req.params as { userId: string };
    // Your own pay is yours to see; anyone else's needs the payroll roles.
    if (userId !== user.sub && !canSeeAll(user.role)) {
      return reply.status(403).send({ error: 'Forbidden: you may only view your own pay components' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('payroll_employee_components as c')
        .innerJoin('payroll_component_types as t', 't.id', 'c.component_type_id')
        .select(['c.id', 'c.amount', 'c.effective_from', 'c.effective_to',
                 't.code', 't.name', 't.direction', 't.taxable'])
        .where('c.tenant_id', '=', user.tenant_id)
        .where('c.user_id', '=', userId)
        .orderBy('t.direction').orderBy('t.name').execute();
    });
  });

  fastify.post('/employees/:userId/components', { preHandler: requireRole(...PAYROLL_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { userId } = req.params as { userId: string };
    const b = req.body as any;

    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount < 0) return reply.status(400).send({ error: 'amount must be zero or more' });
    if (!b.component_type_id) return reply.status(400).send({ error: 'component_type_id is required' });
    const effectiveFrom = isoDate(b.effective_from ?? new Date());

    return withTenant(user.tenant_id, async (trx) => {
      // Both targets confirmed to belong to this tenant before anything is
      // written, so a bad id cannot attach a component across a tenant boundary.
      const [person, type] = await Promise.all([
        trx.selectFrom('users').select('id').where('id', '=', userId).where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('payroll_component_types').select(['id', 'name']).where('id', '=', b.component_type_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
      ]);
      if (!person) return reply.status(404).send({ error: 'Employee not found' });
      if (!type) return reply.status(404).send({ error: 'Pay component type not found' });

      return trx.insertInto('payroll_employee_components').values({
        tenant_id: user.tenant_id, user_id: userId,
        component_type_id: b.component_type_id, amount: String(amount),
        effective_from: effectiveFrom, effective_to: b.effective_to ? isoDate(b.effective_to) : null,
      } as any).returningAll().executeTakeFirstOrThrow();
    });
  });

  // ── Runs ────────────────────────────────────────────────────────────────

  fastify.get('/runs', { preHandler: requireRole(...PAYROLL_ROLES) }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('payroll_runs').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('period_year', 'desc').orderBy('period_month', 'desc').execute();
    });
  });

  fastify.post('/runs', { preHandler: requireRole(...PAYROLL_ROLES) }, async (req, reply) => {
    const user = req.user;
    const b = req.body as any;
    const year = Number(b.period_year), month = Number(b.period_month);

    if (!Number.isInteger(year) || year < 2000 || year > 2200) return reply.status(400).send({ error: 'period_year is not a plausible year' });
    if (!Number.isInteger(month) || month < 1 || month > 12) return reply.status(400).send({ error: 'period_month must be 1–12' });

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    const name = String(b.name ?? `${start.toLocaleString('en', { month: 'long', timeZone: 'UTC' })} ${year} Payroll`);

    return withTenant(user.tenant_id, async (trx) => {
      const clash = await trx.selectFrom('payroll_runs').select(['id', 'status'])
        .where('tenant_id', '=', user.tenant_id)
        .where('period_year', '=', year).where('period_month', '=', month).executeTakeFirst();
      if (clash) {
        return reply.status(409).send({
          error: `A payroll run for ${month}/${year} already exists (${clash.status})`,
          run_id: clash.id,
        });
      }
      return trx.insertInto('payroll_runs').values({
        tenant_id: user.tenant_id, name, period_year: year, period_month: month,
        period_start: isoDate(start), period_end: isoDate(end),
        jurisdiction: String(b.jurisdiction ?? 'TZ'), status: 'DRAFT', created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow();
    });
  });

  /**
   * Calculate (or recalculate) a run.
   *
   * Everyone active with a basic salary is included. Someone with no basic
   * salary is *skipped and named*, never paid zero — an unknown salary is not a
   * salary of nothing, and a silent zero is a missed payment nobody notices
   * until the person says so.
   */
  fastify.post('/runs/:id/calculate', { preHandler: requireRole(...PAYROLL_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const run = await trx.selectFrom('payroll_runs').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!run) return reply.status(404).send({ error: 'Payroll run not found' });
      if (run.status === 'APPROVED' || run.status === 'PAID') {
        return reply.status(409).send({
          error: `This run was ${run.status.toLowerCase()} and cannot be recalculated. Payslips record what was paid; recalculating would rewrite them at today's rates.`,
        });
      }
      if (run.status === 'CANCELLED') return reply.status(409).send({ error: 'This run was cancelled' });

      const onDate = isoDate(run.period_end);
      const [bandsResident, bandsNonResident, schemes] = await Promise.all([
        loadBands(trx, user.tenant_id, run.jurisdiction, 'RESIDENT', onDate),
        loadBands(trx, user.tenant_id, run.jurisdiction, 'NON_RESIDENT', onDate),
        loadSchemes(trx, user.tenant_id, run.jurisdiction, onDate),
      ]);
      // Refuse rather than produce a run with no tax in it, which would look
      // like a successful payroll and be entirely wrong.
      if (bandsResident.length === 0) {
        return reply.status(409).send({
          error: `No income tax bands are configured for ${run.jurisdiction} as at ${onDate}. Seed the statutory rates before running payroll.`,
        });
      }

      const staff = await trx.selectFrom('users')
        .select(['id', 'name', 'email', 'basic_salary', 'tax_residency'])
        .where('tenant_id', '=', user.tenant_id).where('active', '=', true)
        .orderBy('name').execute();

      const payable = staff.filter(s => s.basic_salary !== null && num(s.basic_salary) > 0);
      const skipped = staff.filter(s => s.basic_salary === null || num(s.basic_salary) <= 0)
        .map(s => ({ user_id: s.id, name: s.name, reason: 'No basic salary recorded' }));

      if (payable.length === 0) {
        return reply.status(409).send({
          error: 'Nobody on this tenant has a basic salary recorded, so there is nothing to calculate.',
          skipped,
        });
      }

      const components = await trx.selectFrom('payroll_employee_components as c')
        .innerJoin('payroll_component_types as t', 't.id', 'c.component_type_id')
        .select(['c.user_id', 'c.amount', 't.code', 't.name', 't.direction', 't.taxable'])
        .where('c.tenant_id', '=', user.tenant_id)
        .where('c.user_id', 'in', payable.map(p => p.id))
        .where('c.effective_from', '<=', onDate as any)
        .where((eb: any) => eb.or([eb('c.effective_to', 'is', null), eb('c.effective_to', '>=', onDate)]))
        .execute();

      // Recalculation replaces the previous attempt outright — leaving stale
      // payslips beside new ones would double the run's totals.
      await trx.deleteFrom('payroll_payslips').where('run_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

      const results: PayslipResult[] = [];
      for (const person of payable) {
        const mine = components.filter(c => c.user_id === person.id);
        const residency = (person.tax_residency ?? 'RESIDENT') as Residency;
        const slip = computePayslip({
          basicPay: num(person.basic_salary),
          earnings: mine.filter(c => c.direction === 'EARNING')
            .map(c => ({ code: c.code, name: c.name, amount: num(c.amount), taxable: c.taxable })),
          deductions: mine.filter(c => c.direction === 'DEDUCTION')
            .map(c => ({ code: c.code, name: c.name, amount: num(c.amount) })),
          residency,
          bands: residency === 'NON_RESIDENT' ? bandsNonResident : bandsResident,
          schemes,
          // Headcount is the people actually on this payroll, which is what the
          // levy thresholds are measured against.
          employeeCount: payable.length,
        });
        results.push(slip);

        await trx.insertInto('payroll_payslips').values({
          tenant_id: user.tenant_id, run_id: id, user_id: person.id, residency,
          basic_pay: String(slip.basicPay), gross_pay: String(slip.grossPay),
          taxable_pay: String(slip.taxablePay), income_tax: String(slip.incomeTax),
          employee_contributions: String(slip.employeeContributions),
          other_deductions: String(slip.otherDeductions),
          total_deductions: String(slip.totalDeductions),
          employer_contributions: String(slip.employerContributions),
          net_pay: String(slip.netPay), lines: JSON.stringify(slip.lines),
        } as any).execute();
      }

      const totals = summariseRun(results);
      const updated = await trx.updateTable('payroll_runs').set({
        status: 'CALCULATED', employee_count: totals.employeeCount,
        total_gross: String(totals.totalGross), total_net: String(totals.totalNet),
        total_employee_deductions: String(totals.totalEmployeeDeductions),
        total_employer_cost: String(totals.totalEmployerCost),
        total_remitted: String(totals.totalRemitted),
        calculated_at: new Date(), updated_at: new Date(),
      } as any).where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();

      return {
        run: updated,
        totals,
        // Named, not just counted — "3 people were skipped" is not actionable.
        skipped,
      };
    });
  });

  fastify.get('/runs/:id', { preHandler: requireRole(...PAYROLL_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const run = await trx.selectFrom('payroll_runs').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!run) return reply.status(404).send({ error: 'Payroll run not found' });

      const payslips = await trx.selectFrom('payroll_payslips as p')
        .innerJoin('users as u', 'u.id', 'p.user_id')
        .select(['p.id', 'p.user_id', 'p.residency', 'p.basic_pay', 'p.gross_pay', 'p.taxable_pay',
                 'p.income_tax', 'p.employee_contributions', 'p.other_deductions',
                 'p.total_deductions', 'p.employer_contributions', 'p.net_pay', 'p.lines',
                 'u.name', 'u.email'])
        .where('p.tenant_id', '=', user.tenant_id).where('p.run_id', '=', id)
        .orderBy('u.name').execute();

      return {
        run,
        payslips,
        // Spelled out because a single "employer contributions" figure that
        // includes income tax overstates the cost of employing people by the
        // whole tax bill. These three are different questions.
        totals: {
          employer_cost: num(run.total_employer_cost),
          remitted_to_authorities: num(run.total_remitted),
          net_to_employees: num(run.total_net),
          total_cash_out: num(run.total_net) + num(run.total_remitted),
        },
      };
    });
  });

  fastify.post('/runs/:id/approve', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const run = await trx.selectFrom('payroll_runs').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!run) return reply.status(404).send({ error: 'Payroll run not found' });
      if (run.status === 'APPROVED' || run.status === 'PAID') {
        return reply.status(409).send({ error: 'This run is already approved' });
      }
      // Approving something never calculated would approve nothing at all.
      if (run.status !== 'CALCULATED' && run.status !== 'PENDING_APPROVAL') {
        return reply.status(409).send({ error: `A ${run.status.toLowerCase()} run has no figures to approve — calculate it first` });
      }
      const count = await trx.selectFrom('payroll_payslips').select(trx.fn.countAll().as('n'))
        .where('run_id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (Number(count?.n ?? 0) === 0) {
        return reply.status(409).send({ error: 'This run has no payslips — recalculate before approving' });
      }

      return trx.updateTable('payroll_runs').set({
        status: 'APPROVED', approved_by: user.sub, approved_at: new Date(), updated_at: new Date(),
      } as any).where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  // ── Payslips ────────────────────────────────────────────────────────────

  /** Your own payslips. The identity comes from the token, not the request. */
  fastify.get('/me/payslips', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('payroll_payslips as p')
        .innerJoin('payroll_runs as r', 'r.id', 'p.run_id')
        .select(['p.id', 'p.gross_pay', 'p.taxable_pay', 'p.income_tax', 'p.employee_contributions',
                 'p.other_deductions', 'p.total_deductions', 'p.net_pay', 'p.lines',
                 'r.name as run_name', 'r.period_year', 'r.period_month', 'r.status as run_status'])
        .where('p.tenant_id', '=', user.tenant_id)
        .where('p.user_id', '=', user.sub)
        // Only what has actually been approved — a draft calculation is not a
        // statement of pay and should not reach the person it is about.
        .where('r.status', 'in', ['APPROVED', 'PAID'])
        .orderBy('r.period_year', 'desc').orderBy('r.period_month', 'desc').execute();
    });
  });

  /**
   * One person's payslips, for their profile page.
   *
   * Same rule as everywhere else: your own, or one of the payroll roles. The
   * difference from /me/payslips is that a payroll role sees unapproved runs
   * too — they are the people who need to look at a draft before approving it.
   */
  fastify.get('/employees/:userId/payslips', async (req, reply) => {
    const user = req.user;
    const { userId } = req.params as { userId: string };
    const isOwn = userId === user.sub;
    if (!isOwn && !canSeeAll(user.role)) {
      return reply.status(403).send({ error: 'Forbidden: you may only view your own payslips' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('payroll_payslips as p')
        .innerJoin('payroll_runs as r', 'r.id', 'p.run_id')
        .select(['p.id', 'p.basic_pay', 'p.gross_pay', 'p.taxable_pay', 'p.income_tax',
                 'p.employee_contributions', 'p.other_deductions', 'p.total_deductions',
                 'p.employer_contributions', 'p.net_pay', 'p.lines',
                 'r.name as run_name', 'r.period_year', 'r.period_month', 'r.status as run_status'])
        .where('p.tenant_id', '=', user.tenant_id)
        .where('p.user_id', '=', userId);
      // Someone reading their own record still only sees settled pay.
      if (!canSeeAll(user.role)) q = q.where('r.status', 'in', ['APPROVED', 'PAID']);
      return q.orderBy('r.period_year', 'desc').orderBy('r.period_month', 'desc').execute();
    });
  });

  fastify.get('/payslips/:id', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const slip = await trx.selectFrom('payroll_payslips as p')
        .innerJoin('users as u', 'u.id', 'p.user_id')
        .innerJoin('payroll_runs as r', 'r.id', 'p.run_id')
        .selectAll('p').select(['u.name', 'u.email', 'r.name as run_name',
                                'r.period_year', 'r.period_month', 'r.status as run_status'])
        .where('p.id', '=', id).where('p.tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!slip) return reply.status(404).send({ error: 'Payslip not found' });

      const isOwn = slip.user_id === user.sub;
      if (!isOwn && !canSeeAll(user.role)) {
        return reply.status(403).send({ error: 'Forbidden: you may only view your own payslip' });
      }
      if (isOwn && !canSeeAll(user.role) && !['APPROVED', 'PAID'].includes(String(slip.run_status))) {
        return reply.status(403).send({ error: 'This payroll run has not been approved yet' });
      }
      return slip;
    });
  });
}
