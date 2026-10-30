import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbPlatform, withTenant } from '../db/client.js';
import { createTestTenant, type TestTenant } from './helpers.js';
import {
  createPropertyUnit,
  listPropertyUnits,
  createLease,
  generateLeaseCharges,
  listLeaseCharges,
  addBoqItem,
  listBoqItems,
  createProgressCertificate,
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
          'finance_student_enrollments',
          'finance_fee_structures',
          'finance_students',
          'finance_folio_charges',
          'finance_reservations',
          'finance_room_inventory',
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

      // Attempting to lease the same unit again should be rejected
      await expect(
        createLease(tenant.tenantId, tenant.userId, work.id, {
          unit_id: unit.id,
          tenant_name: 'Second Tenant',
          lease_start: '2026-11-01',
          rent_amount: 1200000,
        })
      ).rejects.toThrow('Unit is not available for lease');

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

      // Claim exceeding sum insured rejected
      await expect(
        fileClaim(tenant.tenantId, tenant.userId, policy.id, {
          claim_number: 'CLM-001',
          incident_date: '2026-11-15',
          description: 'Total vessel loss',
          claim_amount: 60000000,
        })
      ).rejects.toThrow('Claim exceeds sum insured');

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

      // 3. Adjudicate: approve claim
      const approved = await adjudicateClaim(
        tenant.tenantId,
        tenant.userId,
        claim.id,
        'approved',
        11500000
      );
      expect(approved.status).toBe('approved');
      expect(Number(approved.approved_amount)).toBe(11500000);
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
});
