import type { Transaction } from 'kysely';
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
    const unit = await trx.selectFrom('finance_property_units').select(['id', 'status'])
      .where('tenant_id', '=', tenantId).where('id', '=', input.unit_id).executeTakeFirst();
    if (!unit) throw new IndustryWorkError('Property unit not found.', 404);
    if (unit.status !== 'vacant' && unit.status !== 'reserved') throw new IndustryWorkError('Unit is not available for lease.');
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
    const policy = await trx.selectFrom('finance_insurance_policies').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', policyId).executeTakeFirst();
    if (!policy) throw new IndustryWorkError('Policy not found.', 404);
    if (policy.status !== 'active') throw new IndustryWorkError('Claims can only be filed against active policies.');
    if (input.claim_amount > Number(policy.sum_insured)) throw new IndustryWorkError('Claim exceeds sum insured.');
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
      return trx.updateTable('finance_insurance_claims').set({
        status: 'approved', approved_amount: approvedAmount,
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
    const room = await trx.selectFrom('finance_room_inventory').select(['id', 'status'])
      .where('tenant_id', '=', tenantId).where('id', '=', input.room_id).executeTakeFirst();
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
