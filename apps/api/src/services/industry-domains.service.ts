import { sql, type Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import { getIndustryWork, IndustryWorkError } from './finance-industry-work.service.js';

type Trx = Transaction<Database>;

// ═════════════════════════════════════════════════════════════
// PROPERTY / RENTALS
// ═════════════════════════════════════════════════════════════

export async function createPropertyUnit(tenantId: string, input: {
  name: string; unit_type: 'residential' | 'commercial' | 'industrial' | 'land' | 'parking' | 'storage';
  address?: string; area_sqm?: number; bedrooms?: number; notes?: string;
}) {
  return withTenant(tenantId, async trx => {
    return trx.insertInto('finance_property_units').values({
      tenant_id: tenantId, name: input.name, unit_type: input.unit_type,
      address: input.address ?? null, area_sqm: input.area_sqm ?? null,
      bedrooms: input.bedrooms ?? null, notes: input.notes ?? null,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function listPropertyUnits(tenantId: string, status?: string) {
  return withTenant(tenantId, async trx => {
    let q = trx.selectFrom('finance_property_units').selectAll().where('tenant_id', '=', tenantId);
    if (status) q = q.where('status', '=', status as any);
    return q.orderBy('name').execute();
  });
}

export async function createLease(tenantId: string, actorId: string, workId: string, input: {
  unit_id: string; tenant_name: string; lease_start: string; lease_end?: string;
  rent_amount: number; rent_currency?: string; billing_cycle?: string;
  deposit_amount?: number; escalation_pct?: number; escalation_freq?: string;
}) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'property') throw new IndustryWorkError('Leases require a property industry work.');
    // forUpdate() on the unit itself — the actual shared resource — not
    // just the work record above. Two concurrent createLease() calls
    // against the same unit come from two *different* work records (two
    // prospective tenants, each starting their own work), so locking only
    // the work row never serializes them against each other; it's the
    // unit row that has to be the serialization point.
    const unit = await trx.selectFrom('finance_property_units').select(['id', 'status'])
      .where('tenant_id', '=', tenantId).where('id', '=', input.unit_id).forUpdate().executeTakeFirst();
    if (!unit) throw new IndustryWorkError('Property unit not found.', 404);
    // Effective-dated occupancy, not a coarse status flag: a unit's
    // `status` only ever gets set to 'occupied' below and nothing in this
    // codebase ever reverts it, so a status check alone would permanently
    // block a perfectly legitimate future lease starting after an earlier
    // one's lease_end. The real availability question is whether this
    // lease's own date range overlaps any other still-live lease on the
    // same unit — checked fresh under the unit lock just taken above, so
    // it reflects every committed lease, including one a concurrent
    // request just inserted.
    const overlapping = await trx.selectFrom('finance_leases')
      .select('id')
      .where('tenant_id', '=', tenantId).where('unit_id', '=', input.unit_id)
      .where('status', 'in', ['draft', 'active'])
      .where('lease_start', '<=', input.lease_end ?? '9999-12-31')
      .where(eb => eb.or([eb('lease_end', 'is', null), eb('lease_end', '>=', input.lease_start)]))
      .executeTakeFirst();
    if (overlapping) throw new IndustryWorkError('This unit already has a lease covering that date range.', 409);
    const lease = await trx.insertInto('finance_leases').values({
      tenant_id: tenantId, work_id: workId, unit_id: input.unit_id,
      tenant_name: input.tenant_name, lease_start: input.lease_start,
      lease_end: input.lease_end ?? null, rent_amount: input.rent_amount,
      rent_currency: input.rent_currency ?? 'TZS',
      billing_cycle: (input.billing_cycle ?? 'monthly') as any,
      deposit_amount: input.deposit_amount ?? 0,
      escalation_pct: input.escalation_pct ?? 0,
      escalation_freq: (input.escalation_freq ?? null) as any,
    }).returningAll().executeTakeFirstOrThrow();
    await trx.updateTable('finance_property_units').set({ status: 'occupied', updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', input.unit_id).execute();
    return lease;
  });
}

export async function generateLeaseCharges(tenantId: string, leaseId: string, periodStart: string, periodEnd: string, dueDate: string) {
  return withTenant(tenantId, async trx => {
    const lease = await trx.selectFrom('finance_leases').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', leaseId).executeTakeFirst();
    if (!lease) throw new IndustryWorkError('Lease not found.', 404);
    if (lease.status !== 'active') throw new IndustryWorkError('Lease must be active to generate charges.');
    return trx.insertInto('finance_lease_charges').values({
      tenant_id: tenantId, lease_id: leaseId, charge_type: 'rent',
      description: `Rent: ${periodStart} to ${periodEnd}`,
      amount: Number(lease.rent_amount), period_start: periodStart,
      period_end: periodEnd, due_date: dueDate,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function listLeaseCharges(tenantId: string, leaseId: string) {
  return withTenant(tenantId, async trx => {
    return trx.selectFrom('finance_lease_charges').selectAll()
      .where('tenant_id', '=', tenantId).where('lease_id', '=', leaseId)
      .orderBy('due_date', 'desc').execute();
  });
}

// ═════════════════════════════════════════════════════════════
// CONSTRUCTION
// ═════════════════════════════════════════════════════════════

export async function addBoqItem(tenantId: string, workId: string, input: {
  item_no: string; description: string; unit?: string; quantity: number; rate: number;
  retention_pct?: number; sort_order?: number;
}) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'construction') throw new IndustryWorkError('BOQ items require a construction work.');
    return trx.insertInto('finance_boq_items').values({
      tenant_id: tenantId, work_id: workId, item_no: input.item_no,
      description: input.description, unit: input.unit ?? 'LS',
      quantity: input.quantity, rate: input.rate,
      retention_pct: input.retention_pct ?? 0,
      sort_order: input.sort_order ?? 0,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function listBoqItems(tenantId: string, workId: string) {
  return withTenant(tenantId, async trx => {
    return trx.selectFrom('finance_boq_items').selectAll()
      .where('tenant_id', '=', tenantId).where('work_id', '=', workId)
      .orderBy('sort_order').orderBy('item_no').execute();
  });
}

export async function createProgressCertificate(tenantId: string, actorId: string, workId: string, input: {
  period_start: string; period_end: string; measurements: { boq_item_id: string; qty_this_period: number }[];
}) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'construction') throw new IndustryWorkError('Progress certificates require construction work.');
    if (!['active', 'completed'].includes(work.status)) throw new IndustryWorkError('Activate the project first.');

    const lastCert = await trx.selectFrom('finance_progress_certificates').select('certificate_no')
      .where('tenant_id', '=', tenantId).where('work_id', '=', workId)
      .orderBy('certificate_no', 'desc').executeTakeFirst();
    const certNo = (lastCert?.certificate_no ?? 0) + 1;

    const boqItems = await trx.selectFrom('finance_boq_items').selectAll()
      .where('tenant_id', '=', tenantId).where('work_id', '=', workId).execute();
    const boqMap = new Map(boqItems.map(b => [b.id, b]));

    let grossAmount = 0;
    let retention = 0;
    const measRows: { boq_item_id: string; qty_this_period: number; qty_cumulative: number; amount: number }[] = [];

    for (const m of input.measurements) {
      const boq = boqMap.get(m.boq_item_id);
      if (!boq) throw new IndustryWorkError(`BOQ item ${m.boq_item_id} not found.`, 404);
      if (m.qty_this_period < 0) throw new IndustryWorkError('Measurement quantity cannot be negative.');
      const cumulative = Number(boq.certified_qty) + m.qty_this_period;
      if (cumulative > Number(boq.quantity)) throw new IndustryWorkError(`Cumulative for ${boq.item_no} exceeds BOQ quantity.`);
      const lineAmount = m.qty_this_period * Number(boq.rate);
      const lineRetention = lineAmount * Number(boq.retention_pct) / 100;
      grossAmount += lineAmount;
      retention += lineRetention;
      measRows.push({ boq_item_id: m.boq_item_id, qty_this_period: m.qty_this_period, qty_cumulative: cumulative, amount: lineAmount });
    }

    const previousCerts = await trx.selectFrom('finance_progress_certificates')
      .select(trx.fn.sum<number>('net_amount').as('total'))
      .where('tenant_id', '=', tenantId).where('work_id', '=', workId)
      .where('status', '!=', 'draft').executeTakeFirst();
    const prevTotal = Number(previousCerts?.total ?? 0);

    const cert = await trx.insertInto('finance_progress_certificates').values({
      tenant_id: tenantId, work_id: workId, certificate_no: certNo,
      period_start: input.period_start, period_end: input.period_end,
      gross_amount: grossAmount, retention,
      previous_certs: prevTotal, net_amount: grossAmount - retention,
    }).returningAll().executeTakeFirstOrThrow();

    if (measRows.length) {
      await trx.insertInto('finance_progress_measurements').values(
        measRows.map(r => ({ tenant_id: tenantId, certificate_id: cert.id, ...r }))
      ).execute();
    }

    for (const m of input.measurements) {
      const boq = boqMap.get(m.boq_item_id)!;
      await trx.updateTable('finance_boq_items').set({
        certified_qty: Number(boq.certified_qty) + m.qty_this_period,
      }).where('tenant_id', '=', tenantId).where('id', '=', m.boq_item_id).execute();
    }

    return cert;
  });
}

// ═════════════════════════════════════════════════════════════
// AUTOMOTIVE / WORKSHOP
// ═════════════════════════════════════════════════════════════

export async function registerVehicle(tenantId: string, input: {
  customer_id?: string; registration: string; make?: string; model?: string;
  year?: number; vin?: string; mileage?: number; color?: string; notes?: string;
}) {
  return withTenant(tenantId, async trx => {
    if (input.customer_id) {
      const customer = await trx.selectFrom('customers').select('id')
        .where('tenant_id', '=', tenantId).where('id', '=', input.customer_id).executeTakeFirst();
      if (!customer) throw new IndustryWorkError('Customer not found.', 404);
    }
    return trx.insertInto('finance_vehicle_records').values({
      tenant_id: tenantId, customer_id: input.customer_id ?? null,
      registration: input.registration.toUpperCase().trim(),
      make: input.make ?? null, model: input.model ?? null,
      year: input.year ?? null, vin: input.vin ?? null,
      mileage: input.mileage ?? null, color: input.color ?? null,
      notes: input.notes ?? null,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function listVehicles(tenantId: string, customerId?: string) {
  return withTenant(tenantId, async trx => {
    let q = trx.selectFrom('finance_vehicle_records').selectAll().where('tenant_id', '=', tenantId);
    if (customerId) q = q.where('customer_id', '=', customerId);
    return q.orderBy('registration').execute();
  });
}

export async function createJobCard(tenantId: string, actorId: string, workId: string, input: {
  vehicle_id: string; mileage_in?: number; reported_fault: string;
  bay_number?: string; technician_id?: string; estimated_hours?: number;
}) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'automotive') throw new IndustryWorkError('Job cards require an automotive work.');
    const vehicle = await trx.selectFrom('finance_vehicle_records').select('id')
      .where('tenant_id', '=', tenantId).where('id', '=', input.vehicle_id).executeTakeFirst();
    if (!vehicle) throw new IndustryWorkError('Vehicle not found.', 404);
    if (input.technician_id) {
      const tech = await trx.selectFrom('users').select('id')
        .where('tenant_id', '=', tenantId).where('id', '=', input.technician_id).executeTakeFirst();
      if (!tech) throw new IndustryWorkError('Technician not found.', 404);
    }
    return trx.insertInto('finance_job_cards').values({
      tenant_id: tenantId, work_id: workId, vehicle_id: input.vehicle_id,
      mileage_in: input.mileage_in ?? null, reported_fault: input.reported_fault,
      bay_number: input.bay_number ?? null, technician_id: input.technician_id ?? null,
      estimated_hours: input.estimated_hours ?? null,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function progressJobCard(tenantId: string, jobCardId: string, status: string) {
  const validTransitions: Record<string, string[]> = {
    received: ['diagnosing'],
    diagnosing: ['awaiting_parts', 'in_progress'],
    awaiting_parts: ['in_progress'],
    in_progress: ['quality_check', 'ready'],
    quality_check: ['in_progress', 'ready'],
    ready: ['delivered'],
  };
  return withTenant(tenantId, async trx => {
    const card = await trx.selectFrom('finance_job_cards').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', jobCardId).forUpdate().executeTakeFirst();
    if (!card) throw new IndustryWorkError('Job card not found.', 404);
    const allowed = validTransitions[card.status] ?? [];
    if (!allowed.includes(status)) throw new IndustryWorkError(`Cannot move from ${card.status} to ${status}.`);
    const updates: Record<string, any> = { status, updated_at: new Date() };
    if (status === 'ready') updates.completed_at = new Date();
    if (status === 'delivered') updates.delivered_at = new Date();
    return trx.updateTable('finance_job_cards').set(updates)
      .where('tenant_id', '=', tenantId).where('id', '=', jobCardId)
      .returningAll().executeTakeFirstOrThrow();
  });
}

// ═════════════════════════════════════════════════════════════
// INSURANCE
// ═════════════════════════════════════════════════════════════

export async function createPolicy(tenantId: string, actorId: string, workId: string, input: {
  policy_number: string; policy_type: string; holder_name: string; holder_contact?: string;
  coverage_start: string; coverage_end: string; sum_insured: number;
  premium_amount: number; premium_frequency?: string; currency?: string;
  deductible?: number; underwriter_notes?: string;
}) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'insurance') throw new IndustryWorkError('Policies require an insurance work.');
    if (new Date(input.coverage_end) <= new Date(input.coverage_start)) {
      throw new IndustryWorkError('Coverage end must be after start.');
    }
    return trx.insertInto('finance_insurance_policies').values({
      tenant_id: tenantId, work_id: workId,
      policy_number: input.policy_number, policy_type: input.policy_type as any,
      holder_name: input.holder_name, holder_contact: input.holder_contact ?? null,
      coverage_start: input.coverage_start, coverage_end: input.coverage_end,
      sum_insured: input.sum_insured, premium_amount: input.premium_amount,
      premium_frequency: (input.premium_frequency ?? 'annual') as any,
      currency: input.currency ?? 'TZS', deductible: input.deductible ?? 0,
      underwriter_notes: input.underwriter_notes ?? null,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function fileClaim(tenantId: string, actorId: string, policyId: string, input: {
  claim_number: string; incident_date: string; description: string; claim_amount: number;
}) {
  return withTenant(tenantId, async trx => {
    // forUpdate() — cumulative-exposure validation below reads every other
    // claim on this policy, so a second concurrent fileClaim() against the
    // same policy must block here, not both read the same pre-claim total
    // and both pass a check that's only individually, not jointly, true.
    const policy = await trx.selectFrom('finance_insurance_policies').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', policyId).forUpdate().executeTakeFirst();
    if (!policy) throw new IndustryWorkError('Policy not found.', 404);
    if (policy.status !== 'active') throw new IndustryWorkError('Claims can only be filed against active policies.');

    // Coverage-date validation: an incident outside the policy's own
    // coverage window is not a covered loss, regardless of amount.
    if (input.incident_date < policy.coverage_start || input.incident_date > policy.coverage_end) {
      throw new IndustryWorkError(`Incident date ${input.incident_date} falls outside this policy's coverage period (${policy.coverage_start} to ${policy.coverage_end}).`, 409);
    }

    // Cumulative-exposure validation: every non-denied claim already
    // filed against this policy counts toward the sum insured, not just
    // this one — two claims each individually under sum_insured can still
    // jointly exceed it.
    const existing = await trx.selectFrom('finance_insurance_claims')
      .select(sql<string>`coalesce(sum(claim_amount), 0)`.as('total'))
      .where('tenant_id', '=', tenantId).where('policy_id', '=', policyId).where('status', '!=', 'denied')
      .executeTakeFirst();
    const cumulativeExposure = Number(existing?.total ?? 0) + input.claim_amount;
    if (cumulativeExposure > Number(policy.sum_insured)) {
      throw new IndustryWorkError(
        `This claim would bring cumulative exposure on this policy to ${cumulativeExposure}, exceeding the sum insured of ${policy.sum_insured}.`, 409,
      );
    }

    return trx.insertInto('finance_insurance_claims').values({
      tenant_id: tenantId, policy_id: policyId,
      claim_number: input.claim_number, incident_date: input.incident_date,
      description: input.description, claim_amount: input.claim_amount,
      reserve_amount: input.claim_amount,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function adjudicateClaim(tenantId: string, actorId: string, claimId: string,
  decision: 'approved' | 'denied', approvedAmount?: number, reason?: string) {
  return withTenant(tenantId, async trx => {
    const claim = await trx.selectFrom('finance_insurance_claims').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', claimId).forUpdate().executeTakeFirst();
    if (!claim) throw new IndustryWorkError('Claim not found.', 404);
    if (!['reported', 'investigating'].includes(claim.status)) throw new IndustryWorkError('Claim already adjudicated.');
    if (decision === 'approved') {
      if (!approvedAmount || approvedAmount <= 0) throw new IndustryWorkError('Approved amount required.');
      if (approvedAmount > Number(claim.claim_amount)) throw new IndustryWorkError('Approved exceeds claimed.');
      // Deductible validation: approved_amount is what the adjuster found
      // the loss to be worth; net_payable_amount — what the policy
      // actually pays out — is that figure minus the policy's own
      // deductible, never negative.
      const policy = await trx.selectFrom('finance_insurance_policies').select('deductible')
        .where('tenant_id', '=', tenantId).where('id', '=', claim.policy_id).executeTakeFirstOrThrow();
      const deductibleApplied = Math.min(Number(policy.deductible), approvedAmount);
      const netPayable = Math.round((approvedAmount - deductibleApplied) * 100) / 100;
      return trx.updateTable('finance_insurance_claims').set({
        status: 'approved', approved_amount: approvedAmount,
        deductible_applied: deductibleApplied, net_payable_amount: netPayable,
        adjuster_id: actorId, updated_at: new Date(),
      }).where('tenant_id', '=', tenantId).where('id', '=', claimId)
        .returningAll().executeTakeFirstOrThrow();
    }
    return trx.updateTable('finance_insurance_claims').set({
      status: 'denied', denial_reason: reason ?? 'Claim denied.',
      adjuster_id: actorId, updated_at: new Date(),
    }).where('tenant_id', '=', tenantId).where('id', '=', claimId)
      .returningAll().executeTakeFirstOrThrow();
  });
}

// ═════════════════════════════════════════════════════════════
// LENDING / MICROFINANCE
// ═════════════════════════════════════════════════════════════

export async function createLoan(tenantId: string, actorId: string, workId: string, input: {
  loan_number: string; product_name: string; borrower_name: string;
  principal: number; interest_rate: number; interest_method?: string;
  term_months: number; currency?: string; collateral_desc?: string; guarantor_name?: string;
}) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'lending') throw new IndustryWorkError('Loans require a lending work.');
    if (input.principal <= 0) throw new IndustryWorkError('Principal must be positive.');
    if (input.term_months <= 0) throw new IndustryWorkError('Term must be positive.');
    return trx.insertInto('finance_loans').values({
      tenant_id: tenantId, work_id: workId,
      loan_number: input.loan_number, product_name: input.product_name,
      borrower_name: input.borrower_name, principal: input.principal,
      interest_rate: input.interest_rate,
      interest_method: (input.interest_method ?? 'flat') as any,
      term_months: input.term_months, currency: input.currency ?? 'TZS',
      collateral_desc: input.collateral_desc ?? null,
      guarantor_name: input.guarantor_name ?? null,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function generateLoanSchedule(tenantId: string, loanId: string) {
  return withTenant(tenantId, async trx => {
    const loan = await trx.selectFrom('finance_loans').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', loanId).executeTakeFirst();
    if (!loan) throw new IndustryWorkError('Loan not found.', 404);
    if (!['pending', 'approved'].includes(loan.status)) throw new IndustryWorkError('Schedule can only be generated for pending/approved loans.');

    const existing = await trx.selectFrom('finance_loan_schedule').select('id')
      .where('tenant_id', '=', tenantId).where('loan_id', '=', loanId).executeTakeFirst();
    if (existing) throw new IndustryWorkError('Schedule already exists. Delete to regenerate.');

    const principal = Number(loan.principal);
    const rate = Number(loan.interest_rate) / 100;
    const months = loan.term_months;
    const method = loan.interest_method;
    const rows: { instalment_no: number; due_date: string; principal_due: number; interest_due: number }[] = [];
    const startDate = loan.disbursed_at ? new Date(loan.disbursed_at) : new Date();

    if (method === 'flat') {
      const totalInterest = principal * rate * (months / 12);
      const monthlyPrincipal = Math.round(principal / months * 100) / 100;
      const monthlyInterest = Math.round(totalInterest / months * 100) / 100;
      for (let i = 1; i <= months; i++) {
        const due = new Date(startDate);
        due.setMonth(due.getMonth() + i);
        rows.push({
          instalment_no: i, due_date: due.toISOString().slice(0, 10),
          principal_due: i === months ? principal - monthlyPrincipal * (months - 1) : monthlyPrincipal,
          interest_due: monthlyInterest,
        });
      }
    } else {
      const monthlyRate = rate / 12;
      const emi = monthlyRate > 0
        ? principal * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1)
        : principal / months;
      let balance = principal;
      for (let i = 1; i <= months; i++) {
        const interestDue = Math.round(balance * monthlyRate * 100) / 100;
        const principalDue = Math.round((emi - interestDue) * 100) / 100;
        const due = new Date(startDate);
        due.setMonth(due.getMonth() + i);
        rows.push({ instalment_no: i, due_date: due.toISOString().slice(0, 10), principal_due: principalDue, interest_due: interestDue });
        balance -= principalDue;
      }
    }

    if (rows.length) {
      await trx.insertInto('finance_loan_schedule').values(
        rows.map(r => ({ tenant_id: tenantId, loan_id: loanId, ...r }))
      ).execute();
    }

    const maturity = rows[rows.length - 1]?.due_date;
    if (maturity) {
      await trx.updateTable('finance_loans').set({ maturity_date: maturity, updated_at: new Date() })
        .where('tenant_id', '=', tenantId).where('id', '=', loanId).execute();
    }

    return rows;
  });
}

export async function recordLoanRepayment(tenantId: string, actorId: string, loanId: string, input: {
  amount: number; payment_date?: string; payment_method?: string; reference?: string;
}) {
  return withTenant(tenantId, async trx => {
    const loan = await trx.selectFrom('finance_loans').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', loanId).forUpdate().executeTakeFirst();
    if (!loan) throw new IndustryWorkError('Loan not found.', 404);
    if (!['active', 'arrears', 'disbursed'].includes(loan.status)) throw new IndustryWorkError('Loan is not active.');
    if (input.amount <= 0) throw new IndustryWorkError('Payment must be positive.');

    // Idempotency: a retried submission carrying the same reference for
    // this loan replays the original repayment rather than recording a
    // second real payment — the loan row is already locked above, so
    // this read-then-decide is safe against a concurrent retry too.
    if (input.reference) {
      const prior = await trx.selectFrom('finance_loan_repayments').selectAll()
        .where('tenant_id', '=', tenantId).where('loan_id', '=', loanId).where('reference', '=', input.reference)
        .executeTakeFirst();
      if (prior) {
        if (Number(prior.amount) !== input.amount) {
          throw new IndustryWorkError('This reference was already used for a repayment with a different amount.', 409);
        }
        return prior;
      }
    }

    const schedule = await trx.selectFrom('finance_loan_schedule').selectAll()
      .where('tenant_id', '=', tenantId).where('loan_id', '=', loanId)
      .where('status', 'in', ['pending', 'partial', 'overdue'])
      .orderBy('instalment_no').execute();

    let remaining = input.amount;
    let totalPrincipal = 0;
    let totalInterest = 0;

    for (const inst of schedule) {
      if (remaining <= 0) break;
      const interestOwed = Number(inst.interest_due) - Number(inst.interest_paid);
      const principalOwed = Number(inst.principal_due) - Number(inst.principal_paid);
      const interestPay = Math.min(remaining, interestOwed);
      remaining -= interestPay;
      const principalPay = Math.min(remaining, principalOwed);
      remaining -= principalPay;
      totalInterest += interestPay;
      totalPrincipal += principalPay;

      const newInterestPaid = Number(inst.interest_paid) + interestPay;
      const newPrincipalPaid = Number(inst.principal_paid) + principalPay;
      const fullyPaid = newInterestPaid >= Number(inst.interest_due) && newPrincipalPaid >= Number(inst.principal_due);
      await trx.updateTable('finance_loan_schedule').set({
        interest_paid: newInterestPaid, principal_paid: newPrincipalPaid,
        status: fullyPaid ? 'paid' : 'partial',
        paid_at: fullyPaid ? new Date() : null,
      }).where('tenant_id', '=', tenantId).where('id', '=', inst.id).execute();
    }

    const repayment = await trx.insertInto('finance_loan_repayments').values({
      tenant_id: tenantId, loan_id: loanId, amount: input.amount,
      principal_part: totalPrincipal, interest_part: totalInterest,
      payment_date: input.payment_date ?? new Date().toISOString().slice(0, 10),
      payment_method: input.payment_method ?? null,
      reference: input.reference ?? null, received_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();

    // Surplus handling: the schedule is now fully paid off but `remaining`
    // of what was actually received is still unallocated — this is real
    // money that belongs to the borrower, not a rounding artifact to
    // silently drop. It becomes an explicit, held credit against this
    // loan rather than vanishing into the gap between the repayment's own
    // stored `amount` and `principal_part + interest_part`.
    const surplus = Math.round(remaining * 100) / 100;
    if (surplus > 0.01) {
      await trx.insertInto('finance_loan_credits').values({
        tenant_id: tenantId, loan_id: loanId, source_repayment_id: repayment.id, amount: surplus,
      }).execute();
    }

    const unpaid = await trx.selectFrom('finance_loan_schedule').select('id')
      .where('tenant_id', '=', tenantId).where('loan_id', '=', loanId)
      .where('status', 'in', ['pending', 'partial', 'overdue']).executeTakeFirst();
    if (!unpaid) {
      await trx.updateTable('finance_loans').set({ status: 'closed', updated_at: new Date() })
        .where('tenant_id', '=', tenantId).where('id', '=', loanId).execute();
    }

    return repayment;
  });
}

/**
 * Reverses a repayment — a bounced payment or a data-entry correction.
 * The repayment row is never deleted (same reasoning GLService.voidEntry()
 * already applies to journal entries): it's marked reversed, and every
 * instalment it paid down is rolled back by exactly the amounts this
 * specific repayment applied, re-opening the loan if it had auto-closed.
 */
export async function reverseLoanRepayment(tenantId: string, actorId: string, repaymentId: string, reason: string) {
  return withTenant(tenantId, async trx => {
    const repayment = await trx.selectFrom('finance_loan_repayments').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', repaymentId).forUpdate().executeTakeFirst();
    if (!repayment) throw new IndustryWorkError('Repayment not found.', 404);
    if (repayment.reversed_at) throw new IndustryWorkError('This repayment has already been reversed.', 409);

    const loan = await trx.selectFrom('finance_loans').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', repayment.loan_id).forUpdate().executeTakeFirstOrThrow();

    // Unwind oldest-instalment-first, mirroring the forward allocation
    // order recordLoanRepayment() itself used (interest before principal
    // on each instalment, instalments in order) — undoing exactly what
    // was applied, not guessing a different allocation.
    let principalToUnwind = Number(repayment.principal_part);
    let interestToUnwind = Number(repayment.interest_part);
    const touchedInstalments = await trx.selectFrom('finance_loan_schedule').selectAll()
      .where('tenant_id', '=', tenantId).where('loan_id', '=', repayment.loan_id)
      .where(eb => eb.or([eb('principal_paid', '>', 0), eb('interest_paid', '>', 0)]))
      .orderBy('instalment_no', 'desc').execute();
    for (const inst of touchedInstalments) {
      if (principalToUnwind <= 0 && interestToUnwind <= 0) break;
      const principalReversal = Math.min(Number(inst.principal_paid), principalToUnwind);
      const interestReversal = Math.min(Number(inst.interest_paid), interestToUnwind);
      if (principalReversal <= 0 && interestReversal <= 0) continue;
      principalToUnwind -= principalReversal;
      interestToUnwind -= interestReversal;
      const newPrincipalPaid = Number(inst.principal_paid) - principalReversal;
      const newInterestPaid = Number(inst.interest_paid) - interestReversal;
      await trx.updateTable('finance_loan_schedule').set({
        principal_paid: newPrincipalPaid, interest_paid: newInterestPaid,
        status: (newPrincipalPaid > 0 || newInterestPaid > 0) ? 'partial' : 'pending',
        paid_at: null,
      }).where('tenant_id', '=', tenantId).where('id', '=', inst.id).execute();
    }

    const updated = await trx.updateTable('finance_loan_repayments').set({
      reversed_at: new Date(), reversed_by: actorId, reversal_reason: reason,
    }).where('tenant_id', '=', tenantId).where('id', '=', repaymentId).returningAll().executeTakeFirstOrThrow();

    if (loan.status === 'closed') {
      await trx.updateTable('finance_loans').set({ status: 'active', updated_at: new Date() })
        .where('tenant_id', '=', tenantId).where('id', '=', loan.id).execute();
    }

    return updated;
  });
}

export async function refundLoanCredit(tenantId: string, actorId: string, creditId: string, refundReference?: string) {
  return withTenant(tenantId, async trx => {
    const credit = await trx.selectFrom('finance_loan_credits').select(['id', 'status']).where('tenant_id', '=', tenantId).where('id', '=', creditId).forUpdate().executeTakeFirst();
    if (!credit) throw new IndustryWorkError('Loan credit not found.', 404);
    if (credit.status !== 'held') throw new IndustryWorkError('This credit has already been refunded.', 409);
    return trx.updateTable('finance_loan_credits').set({
      status: 'refunded', refunded_by: actorId, refunded_at: new Date(), refund_reference: refundReference ?? null,
    }).where('tenant_id', '=', tenantId).where('id', '=', creditId).returningAll().executeTakeFirstOrThrow();
  });
}

// ═════════════════════════════════════════════════════════════
// HOSPITALITY / ACCOMMODATION
// ═════════════════════════════════════════════════════════════

export async function createRoom(tenantId: string, input: {
  room_number: string; room_type: 'single' | 'double' | 'twin' | 'suite' | 'deluxe' | 'family' | 'dormitory' | 'conference';
  floor?: string; capacity?: number; rate_per_night: number; currency?: string;
  amenities?: string[]; notes?: string;
}) {
  return withTenant(tenantId, async trx => {
    return trx.insertInto('finance_room_inventory').values({
      tenant_id: tenantId, room_number: input.room_number, room_type: input.room_type,
      floor: input.floor ?? null, capacity: input.capacity ?? 2,
      rate_per_night: input.rate_per_night, currency: input.currency ?? 'TZS',
      amenities: input.amenities ?? null, notes: input.notes ?? null,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function listRooms(tenantId: string, status?: string) {
  return withTenant(tenantId, async trx => {
    let q = trx.selectFrom('finance_room_inventory').selectAll().where('tenant_id', '=', tenantId);
    if (status) q = q.where('status', '=', status as any);
    return q.orderBy('room_number').execute();
  });
}

export async function createReservation(tenantId: string, actorId: string, workId: string, input: {
  room_id: string; guest_name: string; guest_contact?: string; guest_count?: number;
  check_in: string; check_out: string; rate_per_night: number; deposit_amount?: number;
}) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'hospitality') throw new IndustryWorkError('Reservations require a hospitality work.');
    // forUpdate() on the room itself — the shared resource — not just the
    // work record above. Two concurrent createReservation() calls for the
    // same room come from two different work records (two different
    // guests/bookings, each its own work), so the overlap query below
    // must run serialized against any other in-flight booking for this
    // room, not just read a snapshot both requests could see as empty at
    // the same time (P0 verification: "authoritative resource protection
    // is required").
    const room = await trx.selectFrom('finance_room_inventory').select(['id', 'status'])
      .where('tenant_id', '=', tenantId).where('id', '=', input.room_id).forUpdate().executeTakeFirst();
    if (!room) throw new IndustryWorkError('Room not found.', 404);
    if (room.status !== 'available') throw new IndustryWorkError('Room is not available.');
    if (new Date(input.check_out) <= new Date(input.check_in)) throw new IndustryWorkError('Check-out must be after check-in.');
    const overlap = await trx.selectFrom('finance_reservations').select('id')
      .where('tenant_id', '=', tenantId).where('room_id', '=', input.room_id)
      .where('status', 'in', ['confirmed', 'checked_in'])
      .where('check_in', '<', input.check_out).where('check_out', '>', input.check_in)
      .executeTakeFirst();
    if (overlap) throw new IndustryWorkError('Room is already booked for those dates.');
    const reservation = await trx.insertInto('finance_reservations').values({
      tenant_id: tenantId, work_id: workId, room_id: input.room_id,
      guest_name: input.guest_name, guest_contact: input.guest_contact ?? null,
      guest_count: input.guest_count ?? 1, check_in: input.check_in, check_out: input.check_out,
      rate_per_night: input.rate_per_night, deposit_amount: input.deposit_amount ?? 0,
    }).returningAll().executeTakeFirstOrThrow();
    return reservation;
  });
}

export async function checkInGuest(tenantId: string, reservationId: string) {
  return withTenant(tenantId, async trx => {
    const res = await trx.selectFrom('finance_reservations').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', reservationId).forUpdate().executeTakeFirst();
    if (!res) throw new IndustryWorkError('Reservation not found.', 404);
    if (res.status !== 'confirmed') throw new IndustryWorkError('Only confirmed reservations can check in.');
    await trx.updateTable('finance_room_inventory').set({ status: 'occupied', updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', res.room_id).execute();
    return trx.updateTable('finance_reservations').set({
      status: 'checked_in', checked_in_at: new Date(), updated_at: new Date(),
    }).where('tenant_id', '=', tenantId).where('id', '=', reservationId)
      .returningAll().executeTakeFirstOrThrow();
  });
}

export async function checkOutGuest(tenantId: string, reservationId: string) {
  return withTenant(tenantId, async trx => {
    const res = await trx.selectFrom('finance_reservations').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', reservationId).forUpdate().executeTakeFirst();
    if (!res) throw new IndustryWorkError('Reservation not found.', 404);
    if (res.status !== 'checked_in') throw new IndustryWorkError('Guest must be checked in first.');
    await trx.updateTable('finance_room_inventory').set({ status: 'cleaning', updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', res.room_id).execute();
    return trx.updateTable('finance_reservations').set({
      status: 'checked_out', checked_out_at: new Date(), updated_at: new Date(),
    }).where('tenant_id', '=', tenantId).where('id', '=', reservationId)
      .returningAll().executeTakeFirstOrThrow();
  });
}

export async function addFolioCharge(tenantId: string, reservationId: string, input: {
  charge_type: string; description: string; amount: number; charge_date: string;
}) {
  return withTenant(tenantId, async trx => {
    const res = await trx.selectFrom('finance_reservations').select(['id', 'status'])
      .where('tenant_id', '=', tenantId).where('id', '=', reservationId).executeTakeFirst();
    if (!res) throw new IndustryWorkError('Reservation not found.', 404);
    if (res.status !== 'checked_in') throw new IndustryWorkError('Charges only for checked-in guests.');
    if (input.amount <= 0) throw new IndustryWorkError('Charge amount must be positive.');
    return trx.insertInto('finance_folio_charges').values({
      tenant_id: tenantId, reservation_id: reservationId,
      charge_type: input.charge_type as any, description: input.description,
      amount: input.amount, charge_date: input.charge_date,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

// ═════════════════════════════════════════════════════════════
// EDUCATION
// ═════════════════════════════════════════════════════════════

export async function registerStudent(tenantId: string, input: {
  student_number: string; first_name: string; last_name: string;
  date_of_birth?: string; gender?: 'male' | 'female' | 'other';
  guardian_name?: string; guardian_phone?: string; guardian_email?: string;
  customer_id?: string; enrollment_date?: string; notes?: string;
}) {
  return withTenant(tenantId, async trx => {
    if (input.customer_id) {
      const customer = await trx.selectFrom('customers').select('id')
        .where('tenant_id', '=', tenantId).where('id', '=', input.customer_id).executeTakeFirst();
      if (!customer) throw new IndustryWorkError('Customer not found.', 404);
    }
    return trx.insertInto('finance_students').values({
      tenant_id: tenantId, student_number: input.student_number,
      first_name: input.first_name, last_name: input.last_name,
      date_of_birth: input.date_of_birth ?? null, gender: input.gender ?? null,
      guardian_name: input.guardian_name ?? null, guardian_phone: input.guardian_phone ?? null,
      guardian_email: input.guardian_email ?? null, customer_id: input.customer_id ?? null,
      enrollment_date: input.enrollment_date ?? null, notes: input.notes ?? null,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function listStudents(tenantId: string, status?: string) {
  return withTenant(tenantId, async trx => {
    let q = trx.selectFrom('finance_students').selectAll().where('tenant_id', '=', tenantId);
    if (status) q = q.where('status', '=', status as any);
    return q.orderBy('last_name').orderBy('first_name').execute();
  });
}

export async function createFeeStructure(tenantId: string, input: {
  name: string; programme: string; academic_year: string; term: string;
  tuition?: number; boarding?: number; transport?: number; other_fees?: number;
  currency?: string; due_date?: string;
}) {
  return withTenant(tenantId, async trx => {
    return trx.insertInto('finance_fee_structures').values({
      tenant_id: tenantId, name: input.name, programme: input.programme,
      academic_year: input.academic_year, term: input.term,
      tuition: input.tuition ?? 0, boarding: input.boarding ?? 0,
      transport: input.transport ?? 0, other_fees: input.other_fees ?? 0,
      currency: input.currency ?? 'TZS', due_date: input.due_date ?? null,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function enrollStudent(tenantId: string, actorId: string, workId: string, input: {
  student_id: string; fee_structure_id: string; scholarship_pct?: number;
}) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'education') throw new IndustryWorkError('Enrollment requires an education work.');
    const student = await trx.selectFrom('finance_students').select('id')
      .where('tenant_id', '=', tenantId).where('id', '=', input.student_id).executeTakeFirst();
    if (!student) throw new IndustryWorkError('Student not found.', 404);
    const fee = await trx.selectFrom('finance_fee_structures').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', input.fee_structure_id).executeTakeFirst();
    if (!fee) throw new IndustryWorkError('Fee structure not found.', 404);
    if (!fee.active) throw new IndustryWorkError('Fee structure is not active.');
    const scholarshipPct = input.scholarship_pct ?? 0;
    const amountDue = Number(fee.total) * (1 - scholarshipPct / 100);
    return trx.insertInto('finance_student_enrollments').values({
      tenant_id: tenantId, work_id: workId, student_id: input.student_id,
      fee_structure_id: input.fee_structure_id, scholarship_pct: scholarshipPct,
      amount_due: Math.round(amountDue * 100) / 100,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

// ═════════════════════════════════════════════════════════════
// HEALTHCARE — both administrative/billing and clinical scope,
// per the business's own decision. Billing rides the existing shared
// finance_industry_work engine unmodified (same customer_id link every
// other industry here already uses) — nothing new needed there. What's
// new is patient identity/deduplication/booking (the unconditional P1)
// and a deliberately unvalidated clinical record structure (encounters/
// orders/results/prescriptions) — "unvalidated" meaning no invented
// medical correctness rules, not meaning no audit trail: every signed
// encounter and every prescription keeps its own amendment history.
// ═════════════════════════════════════════════════════════════

export async function createPatient(tenantId: string, input: {
  first_name: string; last_name: string; date_of_birth?: string;
  gender?: 'male' | 'female' | 'other'; phone?: string; email?: string;
  address?: string; national_id?: string; customer_id?: string; notes?: string;
}) {
  return withTenant(tenantId, async trx => {
    // Deduplication is a prompt, not a block or a silent merge: names and
    // birthdates legitimately collide, and a registrar — not this
    // function — is the one who can actually tell two same-named patients
    // apart.
    const possibleDuplicates = input.date_of_birth
      ? await trx.selectFrom('health_patients').select(['id', 'first_name', 'last_name', 'date_of_birth', 'phone'])
          .where('tenant_id', '=', tenantId)
          .where(sql<boolean>`lower(first_name) = lower(${input.first_name})`)
          .where(sql<boolean>`lower(last_name) = lower(${input.last_name})`)
          .where('date_of_birth', '=', input.date_of_birth)
          .execute()
      : [];
    const mrn = `MRN-${Date.now().toString(36).toUpperCase()}`;
    const patient = await trx.insertInto('health_patients').values({
      tenant_id: tenantId, mrn,
      first_name: input.first_name, last_name: input.last_name,
      date_of_birth: input.date_of_birth ?? null, gender: input.gender ?? null,
      phone: input.phone ?? null, email: input.email ?? null, address: input.address ?? null,
      national_id: input.national_id ?? null, customer_id: input.customer_id ?? null, notes: input.notes ?? null,
    }).returningAll().executeTakeFirstOrThrow();
    return { patient, possible_duplicates: possibleDuplicates };
  });
}

export async function listPatients(tenantId: string, search = '') {
  return withTenant(tenantId, async trx => {
    let q = trx.selectFrom('health_patients').selectAll().where('tenant_id', '=', tenantId);
    if (search) {
      const esc = search.replace(/[\\%_]/g, '\\$&');
      q = q.where(eb => eb.or([eb('first_name', 'ilike', `%${esc}%`), eb('last_name', 'ilike', `%${esc}%`), eb('mrn', 'ilike', `%${esc}%`)]));
    }
    return q.orderBy('last_name').orderBy('first_name').execute();
  });
}

export async function createAppointment(tenantId: string, actorId: string, workId: string, input: {
  patient_id: string; provider_id: string; scheduled_at: string; duration_minutes?: number; reason?: string;
}) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'healthcare') throw new IndustryWorkError('Appointments require a healthcare industry work.');
    const patient = await trx.selectFrom('health_patients').select('id').where('tenant_id', '=', tenantId).where('id', '=', input.patient_id).executeTakeFirst();
    if (!patient) throw new IndustryWorkError('Patient not found.', 404);
    // forUpdate() on the provider — the actual contended resource, the
    // same shape as createLease()'s unit lock and createReservation()'s
    // room lock above: two concurrent bookings for the same provider must
    // serialize here, not both pass an overlap check read before either
    // commits.
    const provider = await trx.selectFrom('users').select('id').where('id', '=', input.provider_id).forUpdate().executeTakeFirst();
    if (!provider) throw new IndustryWorkError('Provider not found.', 404);
    const durationMinutes = input.duration_minutes ?? 30;
    const start = new Date(input.scheduled_at);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    const overlapping = await trx.selectFrom('health_appointments')
      .select('id')
      .where('tenant_id', '=', tenantId).where('provider_id', '=', input.provider_id)
      .where('status', 'in', ['scheduled', 'checked_in'])
      .where('scheduled_at', '<', end)
      .where(sql<Date>`scheduled_at + (duration_minutes || ' minutes')::interval`, '>', start)
      .executeTakeFirst();
    if (overlapping) throw new IndustryWorkError('This provider already has an appointment overlapping that time.', 409);
    return trx.insertInto('health_appointments').values({
      tenant_id: tenantId, work_id: workId, patient_id: input.patient_id, provider_id: input.provider_id,
      scheduled_at: start, duration_minutes: durationMinutes, reason: input.reason ?? null, created_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function progressAppointment(tenantId: string, appointmentId: string, status: 'checked_in' | 'completed' | 'cancelled' | 'no_show') {
  return withTenant(tenantId, async trx => {
    const appt = await trx.selectFrom('health_appointments').select(['id', 'status']).where('tenant_id', '=', tenantId).where('id', '=', appointmentId).forUpdate().executeTakeFirst();
    if (!appt) throw new IndustryWorkError('Appointment not found.', 404);
    if (['completed', 'cancelled', 'no_show'].includes(appt.status)) throw new IndustryWorkError(`Cannot change a ${appt.status} appointment.`);
    return trx.updateTable('health_appointments').set({ status, updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', appointmentId).returningAll().executeTakeFirstOrThrow();
  });
}

export async function createEncounter(tenantId: string, actorId: string, workId: string, input: {
  patient_id: string; appointment_id?: string; provider_id: string; chief_complaint?: string; notes?: string;
}) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'healthcare') throw new IndustryWorkError('Encounters require a healthcare industry work.');
    const patient = await trx.selectFrom('health_patients').select('id').where('tenant_id', '=', tenantId).where('id', '=', input.patient_id).executeTakeFirst();
    if (!patient) throw new IndustryWorkError('Patient not found.', 404);
    return trx.insertInto('health_encounters').values({
      tenant_id: tenantId, work_id: workId, patient_id: input.patient_id,
      appointment_id: input.appointment_id ?? null, provider_id: input.provider_id,
      chief_complaint: input.chief_complaint ?? null, notes: input.notes ?? null, created_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function signEncounter(tenantId: string, actorId: string, encounterId: string) {
  return withTenant(tenantId, async trx => {
    const enc = await trx.selectFrom('health_encounters').select(['id', 'status']).where('tenant_id', '=', tenantId).where('id', '=', encounterId).forUpdate().executeTakeFirst();
    if (!enc) throw new IndustryWorkError('Encounter not found.', 404);
    if (enc.status !== 'open') throw new IndustryWorkError('Only an open encounter can be signed.');
    return trx.updateTable('health_encounters').set({ status: 'signed', signed_by: actorId, signed_at: new Date(), updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', encounterId).returningAll().executeTakeFirstOrThrow();
  });
}

/** Amending an open encounter is a plain edit (nothing has been attested
 *  to yet); amending a signed one preserves what it said before the edit
 *  as a real audit row — the edit never just overwrites the record. */
export async function amendEncounter(tenantId: string, actorId: string, encounterId: string, input: { notes?: string; chief_complaint?: string; reason: string }) {
  return withTenant(tenantId, async trx => {
    const enc = await trx.selectFrom('health_encounters').selectAll().where('tenant_id', '=', tenantId).where('id', '=', encounterId).forUpdate().executeTakeFirst();
    if (!enc) throw new IndustryWorkError('Encounter not found.', 404);
    if (enc.status !== 'open') {
      await trx.insertInto('health_encounter_amendments').values({
        tenant_id: tenantId, encounter_id: encounterId, amended_by: actorId,
        previous_notes: enc.notes, previous_chief_complaint: enc.chief_complaint, reason: input.reason,
      }).execute();
    }
    return trx.updateTable('health_encounters').set({
      notes: input.notes ?? enc.notes, chief_complaint: input.chief_complaint ?? enc.chief_complaint,
      status: enc.status === 'open' ? 'open' : 'amended', updated_at: new Date(),
    }).where('tenant_id', '=', tenantId).where('id', '=', encounterId).returningAll().executeTakeFirstOrThrow();
  });
}

export async function createOrder(tenantId: string, actorId: string, encounterId: string, input: {
  order_type: 'lab' | 'imaging' | 'referral' | 'procedure' | 'other'; description: string;
}) {
  return withTenant(tenantId, async trx => {
    const enc = await trx.selectFrom('health_encounters').select('id').where('tenant_id', '=', tenantId).where('id', '=', encounterId).executeTakeFirst();
    if (!enc) throw new IndustryWorkError('Encounter not found.', 404);
    return trx.insertInto('health_orders').values({
      tenant_id: tenantId, encounter_id: encounterId, order_type: input.order_type,
      description: input.description, ordered_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function recordResult(tenantId: string, actorId: string, orderId: string, input: { result_text: string; status?: 'preliminary' | 'final' }) {
  return withTenant(tenantId, async trx => {
    const order = await trx.selectFrom('health_orders').select(['id', 'status']).where('tenant_id', '=', tenantId).where('id', '=', orderId).forUpdate().executeTakeFirst();
    if (!order) throw new IndustryWorkError('Order not found.', 404);
    const result = await trx.insertInto('health_results').values({
      tenant_id: tenantId, order_id: orderId, result_text: input.result_text,
      status: input.status ?? 'preliminary', recorded_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();
    if (order.status !== 'completed') {
      await trx.updateTable('health_orders').set({ status: 'completed' }).where('tenant_id', '=', tenantId).where('id', '=', orderId).execute();
    }
    return result;
  });
}

export async function createPrescription(tenantId: string, actorId: string, encounterId: string, input: {
  patient_id: string; medication_name: string; dosage: string; frequency: string; duration?: string;
}) {
  return withTenant(tenantId, async trx => {
    const enc = await trx.selectFrom('health_encounters').select('id').where('tenant_id', '=', tenantId).where('id', '=', encounterId).executeTakeFirst();
    if (!enc) throw new IndustryWorkError('Encounter not found.', 404);
    return trx.insertInto('health_prescriptions').values({
      tenant_id: tenantId, encounter_id: encounterId, patient_id: input.patient_id,
      medication_name: input.medication_name, dosage: input.dosage, frequency: input.frequency,
      duration: input.duration ?? null, prescribed_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function amendPrescription(tenantId: string, actorId: string, prescriptionId: string, input: { dosage?: string; frequency?: string; reason: string }) {
  return withTenant(tenantId, async trx => {
    const rx = await trx.selectFrom('health_prescriptions').selectAll().where('tenant_id', '=', tenantId).where('id', '=', prescriptionId).forUpdate().executeTakeFirst();
    if (!rx) throw new IndustryWorkError('Prescription not found.', 404);
    if (rx.status !== 'active') throw new IndustryWorkError('Only an active prescription can be amended.');
    await trx.insertInto('health_prescription_amendments').values({
      tenant_id: tenantId, prescription_id: prescriptionId, amended_by: actorId,
      previous_dosage: rx.dosage, previous_frequency: rx.frequency, reason: input.reason,
    }).execute();
    return trx.updateTable('health_prescriptions').set({
      dosage: input.dosage ?? rx.dosage, frequency: input.frequency ?? rx.frequency,
    }).where('tenant_id', '=', tenantId).where('id', '=', prescriptionId).returningAll().executeTakeFirstOrThrow();
  });
}
