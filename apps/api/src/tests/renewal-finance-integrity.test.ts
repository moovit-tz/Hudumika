/**
 * Renewal Finance module — 10 required acceptance tests from the build brief.
 * Each test reproduces a real financial integrity scenario.
 */
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { randomUUID } from 'crypto';
import { withTenant, dbPlatform } from '../db/client.js';
import { RenewalFinanceService } from '../services/renewal-finance.service.js';
import { PermitEngineService } from '../services/permit-engine.service.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';

let tenantA: TestTenant;
let tenantB: TestTenant;

beforeAll(async () => {
  tenantA = await createTestTenant('TENANT_ADMIN');
  tenantB = await createTestTenant('TENANT_ADMIN');
}, 120000);

afterAll(async () => {
  if (tenantA) await tenantA.cleanup();
  if (tenantB) await tenantB.cleanup();
}, 120000);

async function seedCert(tenantId: string) {
  return withTenant(tenantId, async trx => {
    return trx.insertInto('comply_certificates').values({
      tenant_id: tenantId,
      cert_number: `CERT-${randomUUID().slice(0, 8)}`,
      name: 'Test Permit',
      agency_code: 'TEST',
      agency_name: 'Test Agency',
      expiry_date: new Date('2027-12-31'),
    }).returningAll().executeTakeFirstOrThrow();
  });
}

async function seedCycle(tenantId: string, certId: string, userId: string) {
  return PermitEngineService.createCycle(tenantId, userId, {
    cert_id: certId,
    cycle_type: 'renewal',
    budget_estimate: 500000,
    budget_currency: 'TZS',
  });
}

// ── AT1: Estimate/manual does not count as payment ────────────────────────

async function seedBill(tenant = tenantA, amount = 1000000, currency = 'TZS') {
  return withTenant(tenant.tenantId, trx => trx.insertInto('supplier_bills').values({
    tenant_id:tenant.tenantId, bill_number:`RENEW-${randomUUID()}`, status:'POSTED', total:amount,
    currency, created_by:tenant.userId,
  } as any).returningAll().executeTakeFirstOrThrow());
}
async function seedPayment(amount: number, tenant = tenantA, currency = 'TZS') {
  const bill = await seedBill(tenant, amount, currency);
  return withTenant(tenant.tenantId, async trx => {
    const payment = await trx.insertInto('bill_payments').values({tenant_id:tenant.tenantId, bill_id:bill.id, amount, currency, created_by:tenant.userId} as any).returning('id').executeTakeFirstOrThrow();
    return payment.id;
  });
}

describe('AT1: estimates are not payments', () => {
  it('a stored estimate or manually declared actual_cost does not increase verified paid totals', async () => {
    const cert = await seedCert(tenantA.tenantId);
    const cycle = await seedCycle(tenantA.tenantId, cert.id, tenantA.userId);

    await RenewalFinanceService.createCostLine(tenantA.tenantId, tenantA.userId, {
      cycle_id: cycle.id,
      category: 'authority_renewal',
      description: 'Authority renewal fee (estimate)',
      unit_price: 100000,
      source_type: 'manual_estimate',
    });

    const overview = await RenewalFinanceService.getOverview(tenantA.tenantId, 'TZS');
    expect(overview.net_paid_ytd).toBe(0);

    await PermitEngineService.updateCycle(tenantA.tenantId, cycle.id, {
      actual_cost: 40000,
    });
    const overview2 = await RenewalFinanceService.getOverview(tenantA.tenantId, 'TZS');
    expect(overview2.net_paid_ytd).toBe(0);
  }, 30000);
});

// ── AT2: No double-counting of estimate + commitment + invoice + payment ──

describe('AT2: no double-counting', () => {
  it('estimate, commitment, invoice and payment for the same charge are not added as four costs', async () => {
    const cert = await seedCert(tenantA.tenantId);
    const cycle = await seedCycle(tenantA.tenantId, cert.id, tenantA.userId);

    const costLine = await RenewalFinanceService.createCostLine(tenantA.tenantId, tenantA.userId, {
      cycle_id: cycle.id,
      category: 'agent_fee',
      description: 'Agent processing fee',
      unit_price: 200000,
      source_type: 'agent_quotation',
    });

    const billId = (await seedBill()).id;
    const paymentId = await seedPayment(200000);

    await RenewalFinanceService.createAllocation(tenantA.tenantId, tenantA.userId, {
      cost_line_id: costLine.id,
      cycle_id: cycle.id,
      allocation_type: 'bill',
      finance_record_type: 'supplier_bill',
      finance_record_id: billId,
      amount: 200000,
    });

    await RenewalFinanceService.createAllocation(tenantA.tenantId, tenantA.userId, {
      cost_line_id: costLine.id,
      cycle_id: cycle.id,
      allocation_type: 'payment',
      finance_record_type: 'bill_payment',
      finance_record_id: paymentId,
      amount: 200000,
    });

    const register = await RenewalFinanceService.getCycleRegister(tenantA.tenantId, { currency: 'TZS' });
    const entry = register.find(r => r.cycle_id === cycle.id);
    expect(entry).toBeDefined();
    expect(entry!.estimated_cost).toBe(200000);
    expect(entry!.committed).toBe(200000);
    expect(entry!.net_paid).toBe(200000);
    expect(entry!.remaining_forecast).toBeLessThanOrEqual(0);
  }, 30000);
});

// ── AT3: Partial payment, refund, credit reconcile correctly ──────────────

describe('AT3: partial payment and refund reconciliation', () => {
  it('partial payment reduces cash required; unsupported refunds cannot alter verified spending', async () => {
    const cert = await seedCert(tenantA.tenantId);
    const cycle = await seedCycle(tenantA.tenantId, cert.id, tenantA.userId);

    const costLine = await RenewalFinanceService.createCostLine(tenantA.tenantId, tenantA.userId, {
      cycle_id: cycle.id,
      category: 'authority_renewal',
      description: 'Authority fee',
      unit_price: 300000,
    });

    await RenewalFinanceService.createAllocation(tenantA.tenantId, tenantA.userId, {
      cost_line_id: costLine.id, cycle_id: cycle.id,
      allocation_type: 'payment', finance_record_type: 'bill_payment',
      finance_record_id: await seedPayment(200000), amount: 200000,
    });

    await expect(RenewalFinanceService.createAllocation(tenantA.tenantId, tenantA.userId, {
      cost_line_id:costLine.id, cycle_id:cycle.id, allocation_type:'refund', finance_record_type:'bill_payment',
      finance_record_id:randomUUID(), amount:50000,
    })).rejects.toThrow(/authoritative Finance record/);
    const entry = (await RenewalFinanceService.getCycleRegister(tenantA.tenantId)).find(r => r.cycle_id === cycle.id)!;
    expect(entry.net_paid).toBe(200000);
    expect(entry.remaining_forecast).toBe(100000);
  }, 30000);
});

// ── AT4: Multiple currencies keep original evidence ───────────────────────

describe('AT4: multi-currency integrity', () => {
  it('cost lines in different currencies remain distinct and are not summed together', async () => {
    const cert = await seedCert(tenantA.tenantId);
    const cycle = await seedCycle(tenantA.tenantId, cert.id, tenantA.userId);

    await RenewalFinanceService.createCostLine(tenantA.tenantId, tenantA.userId, {
      cycle_id: cycle.id, category: 'authority_renewal',
      description: 'TZS fee', unit_price: 100000, currency: 'TZS',
    });
    await RenewalFinanceService.createCostLine(tenantA.tenantId, tenantA.userId, {
      cycle_id: cycle.id, category: 'agent_fee',
      description: 'USD fee', unit_price: 500, currency: 'USD',
    });

    const tzsRegister = await RenewalFinanceService.getCycleRegister(tenantA.tenantId, { currency: 'TZS' });
    const usdRegister = await RenewalFinanceService.getCycleRegister(tenantA.tenantId, { currency: 'USD' });
    const tzsEntry = tzsRegister.find(r => r.cycle_id === cycle.id);
    const usdEntry = usdRegister.find(r => r.cycle_id === cycle.id);
    expect(tzsEntry!.estimated_cost).toBe(100000);
    expect(usdEntry!.estimated_cost).toBe(500);
    expect(tzsEntry!.estimated_cost).not.toBe(tzsEntry!.estimated_cost + usdEntry!.estimated_cost);
  }, 30000);
});

// ── AT5: Unpriced fees remain unknown, not zero ───────────────────────────

describe('AT5: unpriced renewals are unknown', () => {
  it('cycles without budget_estimate are counted as unpriced, not zero-cost', async () => {
    const cert = await seedCert(tenantA.tenantId);
    await PermitEngineService.createCycle(tenantA.tenantId, tenantA.userId, {
      cert_id: cert.id,
      cycle_type: 'renewal',
    });

    const overview = await RenewalFinanceService.getOverview(tenantA.tenantId, 'TZS');
    expect(overview.unpriced_count).toBeGreaterThan(0);
  }, 30000);
});

// ── AT6: Every aggregate drills to same allocations ───────────────────────

describe('AT6: register matches allocations', () => {
  it('register net_paid matches sum of allocations for the same cycle', async () => {
    const cert = await seedCert(tenantA.tenantId);
    const cycle = await seedCycle(tenantA.tenantId, cert.id, tenantA.userId);

    const costLine = await RenewalFinanceService.createCostLine(tenantA.tenantId, tenantA.userId, {
      cycle_id: cycle.id, category: 'inspection',
      description: 'Inspection fee', unit_price: 75000,
    });

    await RenewalFinanceService.createAllocation(tenantA.tenantId, tenantA.userId, {
      cost_line_id: costLine.id, cycle_id: cycle.id,
      allocation_type: 'payment', finance_record_type: 'bill_payment',
      finance_record_id: await seedPayment(75000), amount: 75000,
    });

    const register = await RenewalFinanceService.getCycleRegister(tenantA.tenantId, { currency: 'TZS' });
    const entry = register.find(r => r.cycle_id === cycle.id);
    const allocs = await RenewalFinanceService.listAllocations(tenantA.tenantId, cycle.id);
    const allocTotal = allocs.filter(a => a.allocation_type === 'payment').reduce((s, a) => s + a.amount, 0);
    expect(entry!.net_paid).toBe(allocTotal);
  }, 30000);
});

// ── AT7: Cross-tenant and over-allocation protection ──────────────────────

describe('AT7: cross-tenant and over-allocation rejected', () => {
  it('allocation on a foreign-tenant cost line fails', async () => {
    const certA = await seedCert(tenantA.tenantId);
    const cycleA = await seedCycle(tenantA.tenantId, certA.id, tenantA.userId);
    const costLineA = await RenewalFinanceService.createCostLine(tenantA.tenantId, tenantA.userId, {
      cycle_id: cycleA.id, category: 'agent_fee',
      description: 'Agent fee', unit_price: 50000,
    });

    await expect(
      RenewalFinanceService.createAllocation(tenantB.tenantId, tenantB.userId, {
        cost_line_id: costLineA.id, cycle_id: cycleA.id,
        allocation_type: 'payment', finance_record_type: 'bill_payment',
        finance_record_id: await seedPayment(5000), amount: 50000,
      }),
    ).rejects.toThrow();
  }, 30000);

  it('over-allocation beyond cost line total is rejected', async () => {
    const cert = await seedCert(tenantA.tenantId);
    const cycle = await seedCycle(tenantA.tenantId, cert.id, tenantA.userId);
    const costLine = await RenewalFinanceService.createCostLine(tenantA.tenantId, tenantA.userId, {
      cycle_id: cycle.id, category: 'authority_renewal',
      description: 'Small fee', unit_price: 10000,
    });

    await RenewalFinanceService.createAllocation(tenantA.tenantId, tenantA.userId, {
      cost_line_id: costLine.id, cycle_id: cycle.id,
      allocation_type: 'payment', finance_record_type: 'bill_payment',
      finance_record_id: await seedPayment(10000), amount: 10000,
    });

    await expect(
      RenewalFinanceService.createAllocation(tenantA.tenantId, tenantA.userId, {
        cost_line_id: costLine.id, cycle_id: cycle.id,
        allocation_type: 'payment', finance_record_type: 'bill_payment',
        finance_record_id: await seedPayment(5000), amount: 5000,
      }),
    ).rejects.toThrow(/Over-allocation/);
  }, 30000);
});

// ── AT8: Budget approval controls ─────────────────────────────────────────

describe('AT8: budget approval and version control', () => {
  it('self-approval is rejected and new versions supersede old ones', async () => {
    const cert = await seedCert(tenantA.tenantId);
    const cycle = await seedCycle(tenantA.tenantId, cert.id, tenantA.userId);

    const budget = await RenewalFinanceService.createBudget(tenantA.tenantId, tenantA.userId, {
      cycle_id: cycle.id,
      approved_amount: 500000,
      reason: 'Initial budget',
    });
    expect(budget.version).toBe(1);
    expect(budget.status).toBe('pending_approval');

    await expect(
      RenewalFinanceService.approveBudget(tenantA.tenantId, budget.id, tenantA.userId, { approved: true }),
    ).rejects.toThrow(/cannot approve their own/);

    const approver = await tenantA.addUser('ADMIN');
    const approved = await RenewalFinanceService.approveBudget(tenantA.tenantId, budget.id, approver.userId, { approved: true });
    expect(approved.status).toBe('approved');

    const budget2 = await RenewalFinanceService.createBudget(tenantA.tenantId, tenantA.userId, {
      cycle_id: cycle.id,
      approved_amount: 600000,
      reason: 'Revised after assessment',
    });
    expect(budget2.version).toBe(2);

    const all = await RenewalFinanceService.listBudgets(tenantA.tenantId, cycle.id);
    const v1 = all.find(b => b.version === 1);
    expect(v1!.status).toBe('approved');
    await RenewalFinanceService.approveBudget(tenantA.tenantId, budget2.id, approver.userId, {approved:true});
    expect((await RenewalFinanceService.listBudgets(tenantA.tenantId,cycle.id)).find(b=>b.id===budget.id)!.status).toBe('superseded');
  }, 30000);
});

// ── AT9: Cannot delete cost line with allocations ─────────────────────────

describe('AT9: cost line deletion protection', () => {
  it('cannot delete a cost line that has finance allocations', async () => {
    const cert = await seedCert(tenantA.tenantId);
    const cycle = await seedCycle(tenantA.tenantId, cert.id, tenantA.userId);
    const costLine = await RenewalFinanceService.createCostLine(tenantA.tenantId, tenantA.userId, {
      cycle_id: cycle.id, category: 'agent_fee',
      description: 'Fee with payment', unit_price: 25000,
    });

    await RenewalFinanceService.createAllocation(tenantA.tenantId, tenantA.userId, {
      cost_line_id: costLine.id, cycle_id: cycle.id,
      allocation_type: 'payment', finance_record_type: 'bill_payment',
      finance_record_id: await seedPayment(25000), amount: 25000,
    });

    await expect(
      RenewalFinanceService.deleteCostLine(tenantA.tenantId, tenantA.userId, costLine.id),
    ).rejects.toThrow(/existing finance allocations/);
  }, 30000);
});

// ── AT10: Audit trail completeness ────────────────────────────────────────

describe('AT10: audit trail', () => {
  it('every cost/budget/allocation change is logged in the audit trail', async () => {
    const cert = await seedCert(tenantA.tenantId);
    const cycle = await seedCycle(tenantA.tenantId, cert.id, tenantA.userId);

    await RenewalFinanceService.createCostLine(tenantA.tenantId, tenantA.userId, {
      cycle_id: cycle.id, category: 'authority_renewal',
      description: 'Audit test fee', unit_price: 50000,
    });
    await RenewalFinanceService.createBudget(tenantA.tenantId, tenantA.userId, {
      cycle_id: cycle.id, approved_amount: 100000,
    });

    const trail = await RenewalFinanceService.getAuditTrail(tenantA.tenantId, cycle.id);
    expect(trail.length).toBeGreaterThanOrEqual(2);
    const actions = trail.map((e: any) => e.action);
    expect(actions).toContain('create_cost_line');
    expect(actions).toContain('create_budget');
  }, 30000);
});


describe('Regression: verified financial sources and correct cash requirements', () => {
  async function fixture() {
    const cycle = await seedCycle(tenantA.tenantId,(await seedCert(tenantA.tenantId)).id,tenantA.userId);
    const line = await RenewalFinanceService.createCostLine(tenantA.tenantId,tenantA.userId,{cycle_id:cycle.id,category:'authority_renewal',description:'Regression fee',unit_price:100000,due_date:'2020-01-01'});
    return {cycle,line};
  }
  it('rejects nonexistent, foreign, draft and currency-mismatched Finance records and foreign cycles', async () => {
    const {cycle,line} = await fixture();
    const input = {cycle_id:cycle.id,cost_line_id:line.id,allocation_type:'payment' as const,finance_record_type:'bill_payment' as const,amount:100};
    await expect(RenewalFinanceService.createAllocation(tenantA.tenantId,tenantA.userId,{...input,finance_record_id:randomUUID()})).rejects.toThrow(/not found/);
    await expect(RenewalFinanceService.createAllocation(tenantA.tenantId,tenantA.userId,{...input,finance_record_id:await seedPayment(100,tenantB)})).rejects.toThrow(/not found/);
    await expect(RenewalFinanceService.createAllocation(tenantA.tenantId,tenantA.userId,{...input,finance_record_id:await seedPayment(100,tenantA,'USD')})).rejects.toThrow(/currency/);
    const foreign = await PermitEngineService.createCycle(tenantB.tenantId,tenantB.userId,{cycle_type:'renewal'});
    await expect(RenewalFinanceService.createAllocation(tenantA.tenantId,tenantA.userId,{...input,cycle_id:foreign.id,finance_record_id:randomUUID()})).rejects.toThrow(/not found/);
    const draft = await seedBill();
    await withTenant(tenantA.tenantId,trx=>trx.updateTable('supplier_bills').set({status:'DRAFT'}).where('tenant_id','=',tenantA.tenantId).where('id','=',draft.id).execute());
    await expect(RenewalFinanceService.createAllocation(tenantA.tenantId,tenantA.userId,{...input,allocation_type:'bill',finance_record_type:'supplier_bill',finance_record_id:draft.id})).rejects.toThrow(/posted/);
  },30000);
  it('keeps unpaid commitments in forecast and reduces outstanding balances after verified payment', async () => {
    const {cycle,line}=await fixture();
    const bill=await seedBill(tenantA,100000);
    await RenewalFinanceService.createAllocation(tenantA.tenantId,tenantA.userId,{cycle_id:cycle.id,cost_line_id:line.id,allocation_type:'bill',finance_record_type:'supplier_bill',finance_record_id:bill.id,amount:100000});
    let entry=(await RenewalFinanceService.getCycleRegister(tenantA.tenantId)).find(r=>r.cycle_id===cycle.id)!;
    expect(entry.remaining_forecast).toBe(100000);
    const before=await RenewalFinanceService.getOverview(tenantA.tenantId);
    await RenewalFinanceService.createAllocation(tenantA.tenantId,tenantA.userId,{cycle_id:cycle.id,cost_line_id:line.id,allocation_type:'payment',finance_record_type:'bill_payment',finance_record_id:await seedPayment(40000),amount:40000});
    const after=await RenewalFinanceService.getOverview(tenantA.tenantId);
    expect(before.open_commitments-after.open_commitments).toBe(40000);
    expect(before.due_payables-after.due_payables).toBe(40000);
    expect(before.overdue_payables-after.overdue_payables).toBe(40000);
    expect(before.forecast_30d-after.forecast_30d).toBe(40000);
    entry=(await RenewalFinanceService.getCycleRegister(tenantA.tenantId)).find(r=>r.cycle_id===cycle.id)!;
    expect(entry.remaining_forecast).toBe(60000);
    const snap=await RenewalFinanceService.saveForecastSnapshot(tenantA.tenantId);
    expect(snap.forecast_30d).toBe(after.forecast_30d);
  },30000);
  it('serializes competing allocations across cost lines against the same Finance record', async () => {
    const a=await fixture(), b=await fixture();
    const payment=await seedPayment(100000);
    const results=await Promise.allSettled([a,b].map(({cycle,line})=>RenewalFinanceService.createAllocation(tenantA.tenantId,tenantA.userId,{cycle_id:cycle.id,cost_line_id:line.id,allocation_type:'payment',finance_record_type:'bill_payment',finance_record_id:payment,amount:70000})));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  },30000);
  it('admits entitled tenant owners, rejects malformed input and gates junior users',async()=>{
    await dbPlatform.updateTable('tenants').set({plan:'enterprise'}).where('id','=',tenantA.tenantId).execute();
    const app=await getApp();
    expect((await app.inject({method:'GET',url:'/v1/renewal-finance/overview',headers:authHeaders(tenantA.token)})).statusCode).toBe(200);
    const junior=await tenantA.addUser('JUNIOR');
    expect((await app.inject({method:'GET',url:'/v1/renewal-finance/overview',headers:authHeaders(junior.token)})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/v1/renewal-finance/allocations',headers:authHeaders(tenantA.token),payload:{amount:-1}})).statusCode).toBe(400);
  },30000);
  it('withdraws voided evidence and handles concurrent reports without exhausting the pool', async () => {
    const {cycle,line}=await fixture();
    const payment=await seedPayment(10000);
    await RenewalFinanceService.createAllocation(tenantA.tenantId,tenantA.userId,{cycle_id:cycle.id,cost_line_id:line.id,allocation_type:'payment',finance_record_type:'bill_payment',finance_record_id:payment,amount:10000});
    expect((await RenewalFinanceService.getCycleRegister(tenantA.tenantId)).find(r=>r.cycle_id===cycle.id)!.net_paid).toBe(10000);
    await withTenant(tenantA.tenantId,async trx=>{
      const p=await trx.selectFrom('bill_payments').select('bill_id').where('tenant_id','=',tenantA.tenantId).where('id','=',payment).executeTakeFirstOrThrow();
      await trx.updateTable('supplier_bills').set({status:'VOID'}).where('tenant_id','=',tenantA.tenantId).where('id','=',p.bill_id).execute();
    });
    const after=(await RenewalFinanceService.getCycleRegister(tenantA.tenantId)).find(r=>r.cycle_id===cycle.id)!;
    expect(after.net_paid).toBe(0);expect(after.has_evidence).toBe(false);
    expect((await RenewalFinanceService.listAllocations(tenantA.tenantId,cycle.id))[0].reconciled).toBe(false);
    expect(await Promise.all(Array.from({length:12},()=>RenewalFinanceService.getOverview(tenantA.tenantId)))).toHaveLength(12);
  },30000);
});


describe('Dashboard portfolio dimensions', () => {
  it('returns stable entity/site IDs and distinguishes unpriced currency scopes', async () => {
    const cert = await seedCert(tenantA.tenantId);
    const cycle = await seedCycle(tenantA.tenantId, cert.id, tenantA.userId);
    const links = await withTenant(tenantA.tenantId, async trx => {
      const entity = await trx.insertInto('tenant_entities').values({tenant_id:tenantA.tenantId,legal_name:'Portfolio entity'} as any).returningAll().executeTakeFirstOrThrow();
      const site = await trx.insertInto('tenant_sites').values({tenant_id:tenantA.tenantId,entity_id:entity.id,name:'Portfolio site'} as any).returningAll().executeTakeFirstOrThrow();
      await trx.updateTable('comply_lifecycle_cycles').set({entity_id:entity.id,site_id:site.id,jurisdiction:'TZ'}).where('tenant_id','=',tenantA.tenantId).where('id','=',cycle.id).execute();
      return {entity,site};
    });
    await RenewalFinanceService.createCostLine(tenantA.tenantId,tenantA.userId,{cycle_id:cycle.id,category:'authority_renewal',description:'Portfolio fee',unit_price:125000,currency:'TZS',source_type:'manual_estimate'});
    const [row] = await RenewalFinanceService.getCycleRegister(tenantA.tenantId,{entity_id:links.entity.id,site_id:links.site.id,jurisdiction:'TZ',currency:'TZS'});
    expect(row.entity_id).toBe(links.entity.id);
    expect(row.site_id).toBe(links.site.id);
    expect(row.cost_line_count).toBe(1);
    expect(row.open_commitments).toBe(0);
    expect(row.remaining_forecast).toBe(125000);
    const [foreignCurrency] = await RenewalFinanceService.getCycleRegister(tenantA.tenantId,{entity_id:links.entity.id,currency:'USD'});
    expect(foreignCurrency.cost_line_count).toBe(0);
    expect(foreignCurrency.estimated_cost).toBe(0);
    expect(await RenewalFinanceService.getCycleRegister(tenantB.tenantId,{entity_id:links.entity.id})).toEqual([]);
  },30000);
});
