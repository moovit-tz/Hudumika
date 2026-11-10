import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbPlatform, withTenant } from '../db/client.js';
import { createTestTenant, type TestTenant } from './helpers.js';
import { GLService } from '../services/gl.service.js';
import {
  createPropertyUnit,
  listPropertyUnits,
  createLease,
  generateLeaseCharges,
  listLeaseCharges,
  addBoqItem,
  listBoqItems,
  createProgressCertificate,
  approveProgressCertificate,
  invoiceProgressCertificate,
  voidProgressCertificate,
  registerVehicle,
  listVehicles,
  createJobCard,
  progressJobCard,
  createPolicy,
  fileClaim,
  adjudicateClaim,
  createLoan,
  generateLoanSchedule,
  recordLoanRepayment,
  reverseLoanRepayment,
  refundLoanCredit,
  createRoom,
  listRooms,
  createReservation,
  checkInGuest,
  checkOutGuest,
  addFolioCharge,
  registerStudent,
  listStudents,
  createFeeStructure,
  enrollStudent,
  createPatient,
  listPatients,
  createAppointment,
  progressAppointment,
  createEncounter,
  signEncounter,
  amendEncounter,
  createOrder,
  recordResult,
  createPrescription,
  amendPrescription,
} from '../services/industry-domains.service.js';
import type { FinanceIndustryKey } from '@hudumika/types';

describe('Industry Domains Service Layer (Migrations 621 & 622)', () => {
  let tenant: TestTenant;
  let customerId: string;

  beforeAll(async () => {
    tenant = await createTestTenant();
    await withTenant(tenant.tenantId, async trx => {
      const cust = await trx.insertInto('customers')
        .values({ tenant_id: tenant.tenantId, name: 'Domain Test Client' })
        .returning('id')
        .executeTakeFirstOrThrow();
      customerId = cust.id;
    });
  });

  afterAll(async () => {
    if (tenant) {
      await withTenant(tenant.tenantId, async trx => {
        const domainTables = [
          'health_prescription_amendments',
          'health_prescriptions',
          'health_results',
          'health_orders',
          'health_encounter_amendments',
          'health_encounters',
          'health_appointments',
          'health_patients',
          'finance_student_enrollments',
          'finance_fee_structures',
          'finance_students',
          'finance_folio_charges',
          'finance_reservations',
          'finance_room_inventory',
          'finance_loan_credits',
          'finance_loan_repayments',
          'finance_loan_schedule',
          'finance_loans',
          'finance_insurance_claims',
          'finance_insurance_policies',
          'finance_job_cards',
          'finance_vehicle_records',
          'finance_progress_measurements',
          'finance_progress_certificates',
          'finance_boq_items',
          'finance_lease_charges',
          'finance_leases',
          'finance_property_units',
          'finance_industry_work',
        ] as const;
        for (const t of domainTables) {
          await (trx as any).deleteFrom(t).where('tenant_id', '=', tenant.tenantId).execute();
        }
      });
      await tenant.cleanup();
    }
  });

  async function createWork(industry: FinanceIndustryKey, name: string, status = 'active') {
    return withTenant(tenant.tenantId, async trx => {
      return trx.insertInto('finance_industry_work').values({
        tenant_id: tenant.tenantId,
        industry,
        name,
        customer_id: customerId,
        currency: 'TZS',
        budget: 1000000,
        status: status as any,
        reference: `TST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        specifications: JSON.stringify({}),
        created_by: tenant.userId,
      }).returningAll().executeTakeFirstOrThrow();
    });
  }

  // ═════════════════════════════════════════════════════════════
  // 1. PROPERTY & RENTALS
  // ═════════════════════════════════════════════════════════════
  describe('Property & Rentals Domain', () => {
    it('manages property units, leases, occupancy status, and charge generation', async () => {
      const work = await createWork('property', 'Commercial Plaza Leasing');

      // 1. Create unit
      const unit = await createPropertyUnit(tenant.tenantId, {
        name: 'Unit 401A',
        unit_type: 'commercial',
        area_sqm: 120,
        notes: 'Fourth floor corner office',
      });
      expect(unit.id).toBeDefined();
      expect(unit.status).toBe('vacant');

      const units = await listPropertyUnits(tenant.tenantId);
      expect(units.some(u => u.id === unit.id)).toBe(true);

      // 2. Create lease
      const lease = await createLease(tenant.tenantId, tenant.userId, work.id, {
        unit_id: unit.id,
        tenant_name: 'Acme Corp',
        lease_start: '2026-11-01',
        lease_end: '2027-10-31',
        rent_amount: 1500000,
        deposit_amount: 3000000,
        billing_cycle: 'monthly',
      });
      expect(lease.id).toBeDefined();
      expect(Number(lease.rent_amount)).toBe(1500000);

      // Verify unit transitioned to occupied
      const occupiedUnits = await listPropertyUnits(tenant.tenantId, 'occupied');
      expect(occupiedUnits.some(u => u.id === unit.id)).toBe(true);

      // Attempting to lease the same unit for an overlapping date range
      // should be rejected — the real check is the date range against
      // other live leases, not a coarse status flag (P0 verification:
      // "effective-dated occupancy").
      await expect(
        createLease(tenant.tenantId, tenant.userId, work.id, {
          unit_id: unit.id,
          tenant_name: 'Second Tenant',
          lease_start: '2026-11-01',
          rent_amount: 1200000,
        })
      ).rejects.toThrow('already has a lease covering that date range');

      // A lease starting after the first one's lease_end does NOT overlap
      // and must be allowed — a coarse 'occupied' status check alone would
      // wrongly block this.
      const secondWork = await createWork('property', 'Commercial Plaza Leasing — future tenant');
      const futureLease = await createLease(tenant.tenantId, tenant.userId, secondWork.id, {
        unit_id: unit.id,
        tenant_name: 'Future Tenant',
        lease_start: '2027-11-01',
        rent_amount: 1600000,
      });
      expect(futureLease.id).toBeDefined();

      // Concurrent leases on the same unit from two different work records
      // (the real-world shape: two prospective tenants, each with their
      // own work) must not both succeed — resource-level locking, not
      // work-record locking, is what has to serialize this.
      const raceWorkA = await createWork('property', 'Race A');
      const raceWorkB = await createWork('property', 'Race B');
      const raceUnit = await createPropertyUnit(tenant.tenantId, { name: 'Race Unit', unit_type: 'residential' });
      const [raceA, raceB] = await Promise.allSettled([
        createLease(tenant.tenantId, tenant.userId, raceWorkA.id, { unit_id: raceUnit.id, tenant_name: 'Racer A', lease_start: '2026-12-01', lease_end: '2027-11-30', rent_amount: 500000 }),
        createLease(tenant.tenantId, tenant.userId, raceWorkB.id, { unit_id: raceUnit.id, tenant_name: 'Racer B', lease_start: '2026-12-01', lease_end: '2027-11-30', rent_amount: 500000 }),
      ]);
      const raceResults = [raceA, raceB];
      expect(raceResults.filter(r => r.status === 'fulfilled').length).toBe(1);
      expect(raceResults.filter(r => r.status === 'rejected').length).toBe(1);

      // 3. Generate rent charges
      const charge = await generateLeaseCharges(
        tenant.tenantId,
        lease.id,
        '2026-11-01',
        '2026-11-30',
        '2026-11-05'
      );
      expect(charge.id).toBeDefined();
      expect(Number(charge.amount)).toBe(1500000);

      const charges = await listLeaseCharges(tenant.tenantId, lease.id);
      expect(charges.length).toBe(1);
      expect(charges[0].charge_type).toBe('rent');
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 2. CONSTRUCTION & ENGINEERING
  // ═════════════════════════════════════════════════════════════
  describe('Construction & Engineering Domain', () => {
    it('manages BOQ items and progress certificates with cumulative retention tracking', async () => {
      const work = await createWork('construction', 'Highway Bridge Expansion');

      // 1. Add BOQ items
      const boq1 = await addBoqItem(tenant.tenantId, work.id, {
        item_no: '1.01',
        description: 'Reinforced concrete foundation',
        unit: 'M3',
        quantity: 100,
        rate: 250000,
        retention_pct: 10,
        sort_order: 1,
      });
      expect(boq1.id).toBeDefined();
      expect(Number(boq1.certified_qty)).toBe(0);

      const boqList = await listBoqItems(tenant.tenantId, work.id);
      expect(boqList.length).toBeGreaterThanOrEqual(1);

      // 2. Issue progress certificate for 40 M3
      const cert1 = await createProgressCertificate(tenant.tenantId, tenant.userId, work.id, {
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        measurements: [{ boq_item_id: boq1.id, qty_this_period: 40 }],
      });
      expect(cert1.certificate_no).toBe(1);
      // gross = 40 * 250,000 = 10,000,000
      // retention 10% = 1,000,000
      // net = 9,000,000
      expect(Number(cert1.gross_amount)).toBe(10000000);
      expect(Number(cert1.retention)).toBe(1000000);
      expect(Number(cert1.net_amount)).toBe(9000000);

      // Verify boq certified_qty is updated
      const updatedBoq = (await listBoqItems(tenant.tenantId, work.id)).find(b => b.id === boq1.id)!;
      expect(Number(updatedBoq.certified_qty)).toBe(40);

      // 3. Issue certificate 2 for remaining 60 M3
      const cert2 = await createProgressCertificate(tenant.tenantId, tenant.userId, work.id, {
        period_start: '2026-11-01',
        period_end: '2026-11-30',
        measurements: [{ boq_item_id: boq1.id, qty_this_period: 60 }],
      });
      expect(cert2.certificate_no).toBe(2);
      expect(Number(cert2.gross_amount)).toBe(15000000);

      // 4. Exceeding BOQ quantity is rejected
      await expect(
        createProgressCertificate(tenant.tenantId, tenant.userId, work.id, {
          period_start: '2026-12-01',
          period_end: '2026-12-31',
          measurements: [{ boq_item_id: boq1.id, qty_this_period: 5 }],
        })
      ).rejects.toThrow('exceeds BOQ quantity');
    });

    it('takes a certificate through approve → invoice (real GL, real retention receivable) → void (reverses the GL and gives the BOQ quantity back)', async () => {
      await withTenant(tenant.tenantId, async trx => { await GLService.seedChartOfAccounts(trx, tenant.tenantId); });
      const work = await createWork('construction', 'Access Road Resurfacing');
      const boq = await addBoqItem(tenant.tenantId, work.id, {
        item_no: '2.01', description: 'Asphalt overlay', unit: 'M2',
        quantity: 1000, rate: 20000, retention_pct: 10, sort_order: 1,
      });

      // A fresh certificate cannot be invoiced before it's approved.
      const cert = await createProgressCertificate(tenant.tenantId, tenant.userId, work.id, {
        period_start: '2027-01-01', period_end: '2027-01-31',
        measurements: [{ boq_item_id: boq.id, qty_this_period: 200 }],
      });
      expect(cert.status).toBe('draft');
      await expect(invoiceProgressCertificate(tenant.tenantId, tenant.userId, cert.id)).rejects.toThrow('Only an approved certificate');

      const approved = await approveProgressCertificate(tenant.tenantId, tenant.userId, cert.id);
      expect(approved.status).toBe('approved');
      expect(approved.approved_by).toBe(tenant.userId);
      await expect(approveProgressCertificate(tenant.tenantId, tenant.userId, cert.id)).rejects.toThrow('Only a draft certificate');

      // gross = 200 * 20,000 = 4,000,000; retention 10% = 400,000; net = 3,600,000
      const invoiced = await invoiceProgressCertificate(tenant.tenantId, tenant.userId, cert.id);
      expect(invoiced.status).toBe('invoiced');
      expect(invoiced.invoice_id).toBeTruthy();

      const { invoice, journalLines } = await withTenant(tenant.tenantId, async trx => {
        const invoice = await trx.selectFrom('sales_invoices').selectAll().where('id', '=', invoiced.invoice_id!).executeTakeFirstOrThrow();
        const journalLines = await trx.selectFrom('journal_lines as jl')
          .innerJoin('journal_entries as je', 'je.id', 'jl.journal_entry_id')
          .innerJoin('chart_of_accounts as coa', 'coa.id', 'jl.account_id')
          .select(['coa.code', 'jl.debit', 'jl.credit'])
          .where('je.tenant_id', '=', tenant.tenantId).where('je.source_module', '=', 'AR').where('je.source_id', '=', invoiced.invoice_id!)
          .where('je.voided_at', 'is', null)
          .execute();
        return { invoice, journalLines };
      });
      expect(invoice.status).toBe('Unpaid');
      const ar = journalLines.find(l => l.code === '1100');
      const retentionReceivable = journalLines.find(l => l.code === '1130');
      const revenue = journalLines.find(l => l.code === '4000');
      expect(Number(ar?.debit)).toBe(3600000);
      expect(Number(retentionReceivable?.debit)).toBe(400000);
      expect(Number(revenue?.credit)).toBe(4000000);

      // Void reverses the GL (a second, mirror-image journal entry — never
      // edits the first) and gives the BOQ quantity back for reissue.
      const voided = await voidProgressCertificate(tenant.tenantId, tenant.userId, cert.id, 'Measurement dispute — remeasuring the section.');
      expect(voided.status).toBe('void');
      expect(voided.void_reason).toContain('remeasuring');

      const boqAfterVoid = (await listBoqItems(tenant.tenantId, work.id)).find(b => b.id === boq.id)!;
      expect(Number(boqAfterVoid.certified_qty)).toBe(0);

      const { invoiceAfterVoid, entries } = await withTenant(tenant.tenantId, async trx => {
        const invoiceAfterVoid = await trx.selectFrom('sales_invoices').select('status').where('id', '=', invoiced.invoice_id!).executeTakeFirstOrThrow();
        const entries = await trx.selectFrom('journal_entries')
          .select(['id', 'voided_at', 'reverses_entry_id'])
          .where('tenant_id', '=', tenant.tenantId).where('source_module', '=', 'AR').where('source_id', '=', invoiced.invoice_id!)
          .execute();
        return { invoiceAfterVoid, entries };
      });
      expect(invoiceAfterVoid.status).toBe('Void');
      // The original entry is marked voided, never deleted; a separate
      // mirror-image reversal entry exists alongside it — the net GL effect
      // is zero, but the audit trail of what happened is preserved.
      const original = entries.find(e => e.reverses_entry_id === null);
      const reversal = entries.find(e => e.reverses_entry_id !== null);
      expect(original?.voided_at).toBeTruthy();
      expect(reversal).toBeTruthy();

      // A fresh, corrected certificate can now be issued for the same BOQ item.
      const reissued = await createProgressCertificate(tenant.tenantId, tenant.userId, work.id, {
        period_start: '2027-01-01', period_end: '2027-01-31',
        measurements: [{ boq_item_id: boq.id, qty_this_period: 200 }],
      });
      expect(Number(reissued.gross_amount)).toBe(4000000);

      // An already-void certificate cannot be voided again.
      await expect(voidProgressCertificate(tenant.tenantId, tenant.userId, cert.id, 'again')).rejects.toThrow('already void');
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 3. AUTOMOTIVE & WORKSHOP
  // ═════════════════════════════════════════════════════════════
  describe('Automotive & Workshop Domain', () => {
    it('manages vehicles and executes complete 7-state job card lifecycle', async () => {
      const work = await createWork('automotive', 'Fleet Maintenance Batch');

      // 1. Register vehicle
      const vehicle = await registerVehicle(tenant.tenantId, {
        registration: 'T 123 ABC',
        make: 'Toyota',
        model: 'Land Cruiser',
        year: 2022,
        mileage: 65000,
        customer_id: customerId,
      });
      expect(vehicle.id).toBeDefined();
      expect(vehicle.registration).toBe('T 123 ABC');

      const vehicles = await listVehicles(tenant.tenantId);
      expect(vehicles.some(v => v.id === vehicle.id)).toBe(true);

      // 2. Open job card
      const jobCard = await createJobCard(tenant.tenantId, tenant.userId, work.id, {
        vehicle_id: vehicle.id,
        mileage_in: 65200,
        reported_fault: 'Brake pad squeal and routine 65k service',
        bay_number: 'Bay 3',
        estimated_hours: 3.5,
      });
      expect(jobCard.id).toBeDefined();
      expect(jobCard.status).toBe('received');

      // 3. Follow allowed transitions
      // received -> diagnosing
      const c1 = await progressJobCard(tenant.tenantId, jobCard.id, 'diagnosing');
      expect(c1.status).toBe('diagnosing');

      // diagnosing -> awaiting_parts
      const c2 = await progressJobCard(tenant.tenantId, jobCard.id, 'awaiting_parts');
      expect(c2.status).toBe('awaiting_parts');

      // awaiting_parts -> in_progress
      const c3 = await progressJobCard(tenant.tenantId, jobCard.id, 'in_progress');
      expect(c3.status).toBe('in_progress');

      // in_progress -> quality_check
      const c4 = await progressJobCard(tenant.tenantId, jobCard.id, 'quality_check');
      expect(c4.status).toBe('quality_check');

      // quality_check -> ready
      const c5 = await progressJobCard(tenant.tenantId, jobCard.id, 'ready');
      expect(c5.status).toBe('ready');
      expect(c5.completed_at).toBeDefined();

      // ready -> delivered
      const c6 = await progressJobCard(tenant.tenantId, jobCard.id, 'delivered');
      expect(c6.status).toBe('delivered');
      expect(c6.delivered_at).toBeDefined();

      // Delivered job card cannot revert to diagnosing
      await expect(
        progressJobCard(tenant.tenantId, jobCard.id, 'diagnosing')
      ).rejects.toThrow('Cannot move from delivered to diagnosing');
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 4. INSURANCE
  // ═════════════════════════════════════════════════════════════
  describe('Insurance Domain', () => {
    it('manages policies, enforces coverage dates, files claims and adjudicates', async () => {
      const work = await createWork('insurance', 'Commercial Marine Underwriting');

      // Invalid dates rejected
      await expect(
        createPolicy(tenant.tenantId, tenant.userId, work.id, {
          policy_number: 'POL-INVALID',
          policy_type: 'marine',
          holder_name: 'East African Logistics',
          coverage_start: '2027-01-01',
          coverage_end: '2026-01-01',
          sum_insured: 50000000,
          premium_amount: 1500000,
        })
      ).rejects.toThrow('Coverage end must be after start');

      // 1. Create valid policy
      const policy = await createPolicy(tenant.tenantId, tenant.userId, work.id, {
        policy_number: 'POL-MAR-2026-001',
        policy_type: 'marine',
        holder_name: 'East African Logistics',
        coverage_start: '2026-11-01',
        coverage_end: '2027-10-31',
        sum_insured: 50000000,
        premium_amount: 1500000,
        deductible: 500000,
      });
      expect(policy.id).toBeDefined();
      expect(Number(policy.sum_insured)).toBe(50000000);

      // Activate policy
      await withTenant(tenant.tenantId, trx =>
        trx.updateTable('finance_insurance_policies')
          .set({ status: 'active' })
          .where('tenant_id', '=', tenant.tenantId)
          .where('id', '=', policy.id)
          .execute()
      );

      // Claim exceeding sum insured rejected (P0: cumulative-exposure validation)
      await expect(
        fileClaim(tenant.tenantId, tenant.userId, policy.id, {
          claim_number: 'CLM-001',
          incident_date: '2026-11-15',
          description: 'Total vessel loss',
          claim_amount: 60000000,
        })
      ).rejects.toThrow('exceeding the sum insured');

      // P0: coverage-date validation — an incident outside the policy's
      // own coverage window must be refused regardless of amount.
      await expect(
        fileClaim(tenant.tenantId, tenant.userId, policy.id, {
          claim_number: 'CLM-OUT-OF-WINDOW',
          incident_date: '2026-10-15',
          description: 'Incident before coverage began',
          claim_amount: 1000000,
        })
      ).rejects.toThrow("falls outside this policy's coverage period");

      // 2. File valid claim
      const claim = await fileClaim(tenant.tenantId, tenant.userId, policy.id, {
        claim_number: 'CLM-001',
        incident_date: '2026-11-15',
        description: 'Cargo water damage during transit',
        claim_amount: 12000000,
      });
      expect(claim.id).toBeDefined();
      expect(claim.status).toBe('reported');
      expect(Number(claim.reserve_amount)).toBe(12000000);

      // P0: cumulative exposure across MULTIPLE claims on the same policy —
      // each individually under sum_insured (12M + 40M = 52M > 50M sum
      // insured) must still be refused jointly.
      await expect(
        fileClaim(tenant.tenantId, tenant.userId, policy.id, {
          claim_number: 'CLM-002-CUMULATIVE',
          incident_date: '2026-12-01',
          description: 'Second incident, same policy',
          claim_amount: 40000000,
        })
      ).rejects.toThrow('exceeding the sum insured');

      // 3. Adjudicate: approve claim — net_payable_amount must reflect the
      // policy's own deductible (500,000), not just the approved figure.
      const approved = await adjudicateClaim(
        tenant.tenantId,
        tenant.userId,
        claim.id,
        'approved',
        11500000
      );
      expect(approved.status).toBe('approved');
      expect(Number(approved.approved_amount)).toBe(11500000);
      expect(Number(approved.deductible_applied)).toBe(500000);
      expect(Number(approved.net_payable_amount)).toBe(11000000);
      expect(approved.adjuster_id).toBe(tenant.userId);

      // Cannot re-adjudicate already approved claim
      await expect(
        adjudicateClaim(tenant.tenantId, tenant.userId, claim.id, 'denied')
      ).rejects.toThrow('Claim already adjudicated');
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 5. LENDING & MICROFINANCE
  // ═════════════════════════════════════════════════════════════
  describe('Lending & Microfinance Domain', () => {
    it('generates amortisation schedule and handles payments with auto-closing', async () => {
      const work = await createWork('lending', 'Small Business Loan Portfolio');

      // 1. Create loan (Flat interest method: 12,000,000 over 6 months at 10% p.a.)
      const loan = await createLoan(tenant.tenantId, tenant.userId, work.id, {
        loan_number: 'LN-2026-0042',
        product_name: 'SME Working Capital',
        borrower_name: 'Kilimanjaro Traders',
        principal: 12000000,
        interest_rate: 10,
        interest_method: 'flat',
        term_months: 6,
      });
      expect(loan.id).toBeDefined();
      expect(loan.status).toBe('pending');

      // 2. Generate schedule
      const schedule = await generateLoanSchedule(tenant.tenantId, loan.id);
      expect(schedule.length).toBe(6);
      expect(schedule[0].instalment_no).toBe(1);
      // Principal per month: 12,000,000 / 6 = 2,000,000
      expect(schedule[0].principal_due).toBe(2000000);

      // Activate loan so repayments can be accepted
      await withTenant(tenant.tenantId, trx =>
        trx.updateTable('finance_loans')
          .set({ status: 'active', disbursed_at: new Date() })
          .where('tenant_id', '=', tenant.tenantId)
          .where('id', '=', loan.id)
          .execute()
      );

      // 3. Make repayment for instalment 1
      const totalFirstMonth = schedule[0].principal_due + schedule[0].interest_due;
      const payment1 = await recordLoanRepayment(tenant.tenantId, tenant.userId, loan.id, {
        amount: totalFirstMonth,
        payment_method: 'bank_transfer',
        reference: 'TXN-98765',
      });
      expect(payment1.id).toBeDefined();
      expect(Number(payment1.principal_part)).toBe(schedule[0].principal_due);
      expect(Number(payment1.interest_part)).toBe(schedule[0].interest_due);

      // P0: durable repayment idempotency — a retried submission with the
      // same reference and amount must replay the original repayment, not
      // create a second real payment against the schedule.
      const replay = await recordLoanRepayment(tenant.tenantId, tenant.userId, loan.id, {
        amount: totalFirstMonth, payment_method: 'bank_transfer', reference: 'TXN-98765',
      });
      expect(replay.id).toBe(payment1.id);
      const repaymentsAfterReplay = await withTenant(tenant.tenantId, trx =>
        trx.selectFrom('finance_loan_repayments').select('id').where('tenant_id', '=', tenant.tenantId).where('loan_id', '=', loan.id).execute()
      );
      expect(repaymentsAfterReplay.length).toBe(1);

      // Same reference, a DIFFERENT amount, must be refused outright — a
      // reference collision with mismatched details is a real conflict,
      // not a safe replay.
      await expect(
        recordLoanRepayment(tenant.tenantId, tenant.userId, loan.id, { amount: totalFirstMonth + 1, reference: 'TXN-98765' })
      ).rejects.toThrow('already used for a repayment with a different amount');

      // Verify instalment 1 is marked paid
      const inst1 = await withTenant(tenant.tenantId, trx =>
        trx.selectFrom('finance_loan_schedule')
          .selectAll()
          .where('tenant_id', '=', tenant.tenantId)
          .where('loan_id', '=', loan.id)
          .where('instalment_no', '=', 1)
          .executeTakeFirstOrThrow()
      );
      expect(inst1.status).toBe('paid');

      // 4. Pay off remaining balance and verify loan status auto-closes
      const remainingSchedule = await withTenant(tenant.tenantId, trx =>
        trx.selectFrom('finance_loan_schedule')
          .selectAll()
          .where('tenant_id', '=', tenant.tenantId)
          .where('loan_id', '=', loan.id)
          .where('status', '!=', 'paid')
          .execute()
      );
      const remainingTotal = remainingSchedule.reduce(
        (sum, inst) => sum + (Number(inst.principal_due) - Number(inst.principal_paid)) + (Number(inst.interest_due) - Number(inst.interest_paid)),
        0
      );

      await recordLoanRepayment(tenant.tenantId, tenant.userId, loan.id, {
        amount: remainingTotal,
        payment_method: 'bank_transfer',
        reference: 'TXN-FINAL-PAYOFF',
      });

      const updatedLoan = await withTenant(tenant.tenantId, trx =>
        trx.selectFrom('finance_loans')
          .select('status')
          .where('tenant_id', '=', tenant.tenantId)
          .where('id', '=', loan.id)
          .executeTakeFirstOrThrow()
      );
      expect(updatedLoan.status).toBe('closed');
    });

    it('allocates an overpayment surplus to an explicit credit and supports reversal', async () => {
      const work = await createWork('lending', 'Small Business Loan Portfolio — surplus/reversal');
      const loan = await createLoan(tenant.tenantId, tenant.userId, work.id, {
        loan_number: 'LN-2026-SURPLUS', product_name: 'SME Working Capital', borrower_name: 'Mwanza Hardware',
        principal: 6000000, interest_rate: 10, interest_method: 'flat', term_months: 3,
      });
      const schedule = await generateLoanSchedule(tenant.tenantId, loan.id);
      const totalOwed = schedule.reduce((s, i) => s + Number(i.principal_due) + Number(i.interest_due), 0);
      await withTenant(tenant.tenantId, trx =>
        trx.updateTable('finance_loans').set({ status: 'active', disbursed_at: new Date() }).where('tenant_id', '=', tenant.tenantId).where('id', '=', loan.id).execute()
      );

      // P0: surplus handling — a payment larger than everything owed must
      // not silently vanish into the gap between the repayment's own
      // stored amount and principal_part + interest_part.
      const overpayAmount = totalOwed + 150000;
      const repayment = await recordLoanRepayment(tenant.tenantId, tenant.userId, loan.id, { amount: overpayAmount, reference: 'TXN-OVERPAY' });
      expect(Number(repayment.amount)).toBe(overpayAmount);
      expect(Number(repayment.principal_part) + Number(repayment.interest_part)).toBeCloseTo(totalOwed, 2);

      const credits = await withTenant(tenant.tenantId, trx =>
        trx.selectFrom('finance_loan_credits').selectAll().where('tenant_id', '=', tenant.tenantId).where('loan_id', '=', loan.id).execute()
      );
      expect(credits.length).toBe(1);
      expect(Number(credits[0].amount)).toBeCloseTo(150000, 2);
      expect(credits[0].status).toBe('held');
      expect(credits[0].source_repayment_id).toBe(repayment.id);

      const loanAfterPayoff = await withTenant(tenant.tenantId, trx =>
        trx.selectFrom('finance_loans').select('status').where('tenant_id', '=', tenant.tenantId).where('id', '=', loan.id).executeTakeFirstOrThrow()
      );
      expect(loanAfterPayoff.status).toBe('closed');

      // The credit is a real, attributable action — refund, not a static record.
      const refunded = await refundLoanCredit(tenant.tenantId, tenant.userId, credits[0].id, 'MOBILE-REFUND-001');
      expect(refunded.status).toBe('refunded');
      await expect(refundLoanCredit(tenant.tenantId, tenant.userId, credits[0].id)).rejects.toThrow('already been refunded');

      // P0: reversal — a bounced payment or correction unwinds exactly
      // what this repayment applied and re-opens the loan it had closed.
      const reversed = await reverseLoanRepayment(tenant.tenantId, tenant.userId, repayment.id, 'Payment reversed — bank reported insufficient funds.');
      expect(reversed.reversed_at).not.toBeNull();
      await expect(reverseLoanRepayment(tenant.tenantId, tenant.userId, repayment.id, 'Second attempt')).rejects.toThrow('already been reversed');

      const loanAfterReversal = await withTenant(tenant.tenantId, trx =>
        trx.selectFrom('finance_loans').select('status').where('tenant_id', '=', tenant.tenantId).where('id', '=', loan.id).executeTakeFirstOrThrow()
      );
      expect(loanAfterReversal.status).toBe('active');

      const scheduleAfterReversal = await withTenant(tenant.tenantId, trx =>
        trx.selectFrom('finance_loan_schedule').selectAll().where('tenant_id', '=', tenant.tenantId).where('loan_id', '=', loan.id).execute()
      );
      expect(scheduleAfterReversal.every(i => Number(i.principal_paid) === 0 && Number(i.interest_paid) === 0 && i.status === 'pending')).toBe(true);
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 6. HOSPITALITY & ACCOMMODATION
  // ═════════════════════════════════════════════════════════════
  describe('Hospitality & Accommodation Domain', () => {
    it('manages room inventory, bookings with overlap detection, check-in/out and folios', async () => {
      const work = await createWork('hospitality', 'Safari Lodge Bookings');

      // 1. Create room
      const room = await createRoom(tenant.tenantId, {
        room_number: 'Challet-07',
        room_type: 'deluxe',
        rate_per_night: 350000,
        capacity: 2,
        amenities: ['wifi', 'ac', 'safari_view'],
      });
      expect(room.id).toBeDefined();
      expect(room.status).toBe('available');

      const rooms = await listRooms(tenant.tenantId);
      expect(rooms.some(r => r.id === room.id)).toBe(true);

      // 2. Create reservation
      const res1 = await createReservation(tenant.tenantId, tenant.userId, work.id, {
        room_id: room.id,
        guest_name: 'Dr. Jane Goodall',
        check_in: '2026-11-10',
        check_out: '2026-11-15',
        rate_per_night: 350000,
        deposit_amount: 700000,
      });
      expect(res1.id).toBeDefined();
      expect(res1.status).toBe('confirmed');

      // 3. Overlapping reservation rejected
      await expect(
        createReservation(tenant.tenantId, tenant.userId, work.id, {
          room_id: room.id,
          guest_name: 'Another Guest',
          check_in: '2026-11-12',
          check_out: '2026-11-18',
          rate_per_night: 350000,
        })
      ).rejects.toThrow('Room is already booked for those dates');

      // 3b. Concurrent bookings of the same room from two different work
      // records must not both succeed — resource-level locking on the
      // room, not just the work record, is required (P0 verification).
      const raceWork = await createWork('hospitality', 'Safari Lodge Bookings — race');
      const raceRoom = await createRoom(tenant.tenantId, { room_number: 'Race-Room', room_type: 'single', rate_per_night: 200000, capacity: 2, amenities: [] });
      const [raceA, raceB] = await Promise.allSettled([
        createReservation(tenant.tenantId, tenant.userId, work.id, { room_id: raceRoom.id, guest_name: 'Racer A', check_in: '2026-12-01', check_out: '2026-12-05', rate_per_night: 200000 }),
        createReservation(tenant.tenantId, tenant.userId, raceWork.id, { room_id: raceRoom.id, guest_name: 'Racer B', check_in: '2026-12-01', check_out: '2026-12-05', rate_per_night: 200000 }),
      ]);
      const raceResults = [raceA, raceB];
      expect(raceResults.filter(r => r.status === 'fulfilled').length).toBe(1);
      expect(raceResults.filter(r => r.status === 'rejected').length).toBe(1);

      // 4. Check in guest -> room becomes occupied
      const checkedIn = await checkInGuest(tenant.tenantId, res1.id);
      expect(checkedIn.status).toBe('checked_in');

      const roomAfterCheckIn = (await listRooms(tenant.tenantId)).find(r => r.id === room.id)!;
      expect(roomAfterCheckIn.status).toBe('occupied');

      // 5. Add folio charge
      const folio = await addFolioCharge(tenant.tenantId, res1.id, {
        charge_type: 'restaurant',
        description: 'Bush dinner & beverages',
        amount: 180000,
        charge_date: '2026-11-11',
      });
      expect(folio.id).toBeDefined();
      expect(Number(folio.amount)).toBe(180000);

      // 6. Check out guest -> room becomes cleaning
      const checkedOut = await checkOutGuest(tenant.tenantId, res1.id);
      expect(checkedOut.status).toBe('checked_out');

      const roomAfterCheckOut = (await listRooms(tenant.tenantId)).find(r => r.id === room.id)!;
      expect(roomAfterCheckOut.status).toBe('cleaning');
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 7. EDUCATION
  // ═════════════════════════════════════════════════════════════
  describe('Education Domain', () => {
    it('manages student registration, fee structures, and scholarship enrollments', async () => {
      const work = await createWork('education', 'Academic Year 2026/27 Intake');

      // 1. Register student
      const student = await registerStudent(tenant.tenantId, {
        student_number: 'STD-2026-089',
        first_name: 'Baraka',
        last_name: 'Mkwawa',
        gender: 'male',
        date_of_birth: '2010-05-14',
        guardian_name: 'Zuberi Mkwawa',
        guardian_phone: '+255712345678',
        customer_id: customerId,
      });
      expect(student.id).toBeDefined();
      expect(student.student_number).toBe('STD-2026-089');

      const students = await listStudents(tenant.tenantId);
      expect(students.some(s => s.id === student.id)).toBe(true);

      // 2. Create fee structure: tuition 1,500,000 + boarding 500,000 + transport 200,000 = total 2,200,000
      const fee = await createFeeStructure(tenant.tenantId, {
        name: 'Form 3 Term 1 2026',
        programme: 'Secondary - O Level',
        academic_year: '2026/2027',
        term: 'Term 1',
        tuition: 1500000,
        boarding: 500000,
        transport: 200000,
        due_date: '2027-01-15',
      });
      expect(fee.id).toBeDefined();
      expect(Number(fee.total)).toBe(2200000);

      // 3. Enroll student with 25% merit scholarship
      // 2,200,000 * (1 - 0.25) = 1,650,000
      const enrollment = await enrollStudent(tenant.tenantId, tenant.userId, work.id, {
        student_id: student.id,
        fee_structure_id: fee.id,
        scholarship_pct: 25,
      });
      expect(enrollment.id).toBeDefined();
      expect(Number(enrollment.scholarship_pct)).toBe(25);
      expect(Number(enrollment.amount_due)).toBe(1650000);
      expect(enrollment.status).toBe('enrolled');
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 7. HEALTHCARE
  // ═════════════════════════════════════════════════════════════
  describe('Healthcare Domain', () => {
    it('registers a patient, flags duplicates, books/signs/amends a visit and tracks orders/prescriptions', async () => {
      const work = await createWork('healthcare', 'Clinic Visits');

      // 1. Register a patient
      const { patient, possible_duplicates: noDupesYet } = await createPatient(tenant.tenantId, {
        first_name: 'Amani', last_name: 'Mwinyi', date_of_birth: '1990-05-14', phone: '+255700111222',
      });
      expect(patient.id).toBeDefined();
      expect(patient.mrn).toMatch(/^MRN-/);
      expect(noDupesYet.length).toBe(0);

      // Same name + DOB registered again must be flagged, not silently
      // merged or blocked — a registrar decides, not this function.
      const { possible_duplicates: dupes } = await createPatient(tenant.tenantId, {
        first_name: 'amani', last_name: 'MWINYI', date_of_birth: '1990-05-14', phone: '+255700333444',
      });
      expect(dupes.length).toBe(1);
      expect(dupes[0].id).toBe(patient.id);

      const found = await listPatients(tenant.tenantId, 'Mwinyi');
      expect(found.some(p => p.id === patient.id)).toBe(true);

      // 2. Book an appointment with a provider
      const appt = await createAppointment(tenant.tenantId, tenant.userId, work.id, {
        patient_id: patient.id, provider_id: tenant.userId, scheduled_at: '2026-12-01T09:00:00Z', duration_minutes: 30,
      });
      expect(appt.status).toBe('scheduled');

      // An overlapping booking for the SAME provider must be refused.
      await expect(createAppointment(tenant.tenantId, tenant.userId, work.id, {
        patient_id: patient.id, provider_id: tenant.userId, scheduled_at: '2026-12-01T09:15:00Z', duration_minutes: 30,
      })).rejects.toThrow('already has an appointment overlapping');

      // Concurrent bookings for the same provider at the same time must
      // not both succeed (P0-shape verification, same resource-lock
      // pattern as the property/hospitality fixes above).
      const raceWork = await createWork('healthcare', 'Clinic Visits — race');
      const [raceA, raceB] = await Promise.allSettled([
        createAppointment(tenant.tenantId, tenant.userId, work.id, { patient_id: patient.id, provider_id: tenant.userId, scheduled_at: '2026-12-02T10:00:00Z', duration_minutes: 20 }),
        createAppointment(tenant.tenantId, tenant.userId, raceWork.id, { patient_id: patient.id, provider_id: tenant.userId, scheduled_at: '2026-12-02T10:00:00Z', duration_minutes: 20 }),
      ]);
      const raceResults = [raceA, raceB];
      expect(raceResults.filter(r => r.status === 'fulfilled').length).toBe(1);
      expect(raceResults.filter(r => r.status === 'rejected').length).toBe(1);

      const checkedIn = await progressAppointment(tenant.tenantId, appt.id, 'checked_in');
      expect(checkedIn.status).toBe('checked_in');

      // 3. Open an encounter, sign it, then amend it — the amendment must
      // preserve what was there before, not overwrite it silently.
      const encounter = await createEncounter(tenant.tenantId, tenant.userId, work.id, {
        patient_id: patient.id, appointment_id: appt.id, provider_id: tenant.userId,
        chief_complaint: 'Persistent cough', notes: 'Advised rest and fluids.',
      });
      expect(encounter.status).toBe('open');

      const signed = await signEncounter(tenant.tenantId, tenant.userId, encounter.id);
      expect(signed.status).toBe('signed');
      expect(signed.signed_by).toBe(tenant.userId);

      const amended = await amendEncounter(tenant.tenantId, tenant.userId, encounter.id, {
        notes: 'Advised rest, fluids, and a follow-up in 5 days.', reason: 'Clarified follow-up timing after review.',
      });
      expect(amended.status).toBe('amended');
      const amendments = await withTenant(tenant.tenantId, trx =>
        trx.selectFrom('health_encounter_amendments').selectAll().where('tenant_id', '=', tenant.tenantId).where('encounter_id', '=', encounter.id).execute()
      );
      expect(amendments.length).toBe(1);
      expect(amendments[0].previous_notes).toBe('Advised rest and fluids.');

      // 4. Order a lab test and record its result.
      const order = await createOrder(tenant.tenantId, tenant.userId, encounter.id, {
        order_type: 'lab', description: 'Full blood count',
      });
      expect(order.status).toBe('ordered');
      const result = await recordResult(tenant.tenantId, tenant.userId, order.id, { result_text: 'WBC within normal range.' });
      expect(result.id).toBeDefined();
      const orderAfter = await withTenant(tenant.tenantId, trx =>
        trx.selectFrom('health_orders').select('status').where('tenant_id', '=', tenant.tenantId).where('id', '=', order.id).executeTakeFirstOrThrow()
      );
      expect(orderAfter.status).toBe('completed');

      // 5. Prescribe, then amend the dosage, keeping the prior dosage as
      // a real audit row.
      const rx = await createPrescription(tenant.tenantId, tenant.userId, encounter.id, {
        patient_id: patient.id, medication_name: 'Amoxicillin', dosage: '500mg', frequency: 'Twice daily', duration: '7 days',
      });
      expect(rx.status).toBe('active');
      const rxAmended = await amendPrescription(tenant.tenantId, tenant.userId, rx.id, {
        dosage: '250mg', reason: 'Reduced dose after reviewing patient weight.',
      });
      expect(rxAmended.dosage).toBe('250mg');
      const rxAmendments = await withTenant(tenant.tenantId, trx =>
        trx.selectFrom('health_prescription_amendments').selectAll().where('tenant_id', '=', tenant.tenantId).where('prescription_id', '=', rx.id).execute()
      );
      expect(rxAmendments.length).toBe(1);
      expect(rxAmendments[0].previous_dosage).toBe('500mg');
    });
  });
});
