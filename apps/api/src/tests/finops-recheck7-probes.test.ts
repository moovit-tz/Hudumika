/**
 * Regression tests for the five P1 blockers in the 2026-10-22 FinOps
 * production-readiness audit. Each test covers one blocker and proves
 * the fix holds under the conditions that originally exposed the bug.
 */
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';
import { withTenant, dbPlatform } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

let tenant: TestTenant;
let other: TestTenant;

const ENABLED_APPS: Record<string, boolean> = {
  finops: true, seal: true,
  'finance.core': true, 'finance.pos': true,
  'finance.accounting.advanced': true,
  'finance.fixed_assets': true,
  'finance.multi_currency': true,
};

async function seedTenant(t: TestTenant) {
  const settingsJson = JSON.stringify({ 'enabled-apps': ENABLED_APPS, company: { currency: 'TZS' } });
  await withTenant(t.tenantId, async (trx) => {
    await trx.insertInto('tenant_settings').values({
      tenant_id: t.tenantId,
      settings: settingsJson,
    }).onConflict(c => c.column('tenant_id').doUpdateSet({ settings: settingsJson as any })).execute();
    await GLService.seedChartOfAccounts(trx, t.tenantId);
    for (const key of ['finance.pos', 'finance.core', 'finance.accounting.advanced', 'finance.fixed_assets', 'finance.multi_currency']) {
      await trx.insertInto('tenant_finance_capabilities' as any).values({
        tenant_id: t.tenantId,
        capability_key: key,
        enabled: true,
      }).onConflict((c: any) => c.columns(['tenant_id', 'capability_key']).doUpdateSet({ enabled: true })).execute();
    }
  });
}

beforeAll(async () => {
  tenant = await createTestTenant('FINANCE');
  other = await createTestTenant('FINANCE');
  await seedTenant(tenant);
  await seedTenant(other);
}, 120_000);

afterAll(async () => {
  vi.restoreAllMocks();
  // credit_notes FK blocks cascading tenant delete; clean them first
  for (const t of [tenant, other]) {
    if (!t) continue;
    await dbPlatform.deleteFrom('credit_note_lines' as any)
      .where('credit_note_id', 'in',
        dbPlatform.selectFrom('credit_notes').select('id').where('tenant_id', '=', t.tenantId)
      ).execute().catch(() => {});
    await dbPlatform.deleteFrom('credit_notes').where('tenant_id', '=', t.tenantId).execute().catch(() => {});
    await withTenant(t.tenantId,async trx=>{await trx.deleteFrom('finance_tax_preparations').where('tenant_id','=',t.tenantId).execute();await trx.deleteFrom('pos_payments').where('tenant_id','=',t.tenantId).execute();await trx.deleteFrom('pos_sales').where('tenant_id','=',t.tenantId).execute();await trx.deleteFrom('pos_shifts').where('tenant_id','=',t.tenantId).execute();});
    await t.cleanup();
  }
}, 120_000);

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: object,
  t: TestTenant = tenant,
) {
  const app = await getApp();
  return app.inject({
    method,
    url: `/v1/${path}`,
    headers: authHeaders(t.token),
    ...(payload ? { payload } : {}),
  });
}


it('journal register returns correct bounded counts and disjoint pages',async()=>{
 for(let i=0;i<3;i++) await GLService.post(tenant.tenantId,{entryDate:'2026-10-10',description:`Page probe ${i}`,sourceModule:'MANUAL',createdBy:tenant.userId,lines:[{accountCode:'1010',debit:100,credit:0},{accountCode:'4000',debit:0,credit:100}]});
 const a=await call('GET','finance/journal-entries?page=1&page_size=2');expect(a.statusCode,a.body).toBe(200);expect(a.json().total).toBe(3);expect(a.json().items).toHaveLength(2);
 const b=await call('GET','finance/journal-entries?page=2&page_size=2');expect(b.statusCode,b.body).toBe(200);expect(b.json().items).toHaveLength(1);expect(a.json().items.some((x:any)=>x.id===b.json().items[0].id)).toBe(false);
},120000);
it('VAT close rejects a stale approved preparation',async()=>{
 const p=await call('POST','vat-periods',{period_start:'2026-09-01',period_end:'2026-09-30',jurisdiction:'TZ'});expect(p.statusCode,p.body).toBe(201);
 await withTenant(tenant.tenantId,async trx=>{await trx.insertInto('tax_registrations').values({tenant_id:tenant.tenantId,jurisdiction:'TZ',status:'registered',registration_number:'RECHECK',basis:'VOLUNTARY',registered_from:'2026-01-01',registered_to:null,notes:'Disposable fixture'}).execute();await trx.insertInto('finance_tax_preparations').values({tenant_id:tenant.tenantId,period_id:p.json().id,prepared_by:tenant.userId,checks:JSON.stringify({}),evidence_note:'Stale fixture',return_snapshot:JSON.stringify({}),source_hash:'deliberately-stale',status:'approved',reviewed_by:tenant.userId,review_note:'Fixture only',reviewed_at:new Date()}).execute();});
 const r=await call('POST',`vat-periods/${p.json().id}/close`,{acknowledge_unclassified:true});expect(r.statusCode,r.body).toBe(409);expect(r.json().error).toMatch(/source data has changed/i);
},120000);
it('two simultaneous POS retries create only one journal',async()=>{
 const sale=await withTenant(tenant.tenantId,async trx=>{const shift=await trx.insertInto('pos_shifts').values({tenant_id:tenant.tenantId,opened_by:tenant.userId,opening_float:0}).returning('id').executeTakeFirstOrThrow();const sale=await trx.insertInto('pos_sales').values({tenant_id:tenant.tenantId,shift_id:shift.id,sale_number:'RECHECK-POS',status:'POSTING_FAILED',currency:'TZS',subtotal:100,grand_total:100,amount_paid:100,sold_by:tenant.userId}).returning('id').executeTakeFirstOrThrow();await trx.insertInto('pos_payments').values({tenant_id:tenant.tenantId,sale_id:sale.id,method:'CASH',amount:100}).execute();return sale.id;});
 const original=GLService.post;let release:()=>void=()=>{};const gate=new Promise<void>(r=>{release=r;});let calls=0;
 const spy=vi.spyOn(GLService,'post').mockImplementation(async(...args)=>{calls++;if(calls===1)setTimeout(release,300);if(calls>=2)release();await gate;return original.apply(GLService,args);});
 try{const results=await Promise.all([call('POST',`finance/pos/sales/${sale}/retry-posting`),call('POST',`finance/pos/sales/${sale}/retry-posting`)]);expect(results.some(r=>r.statusCode===200),results.map(r=>r.body).join(' | ')).toBe(true);}finally{spy.mockRestore();}
 const entries=await withTenant(tenant.tenantId,trx=>trx.selectFrom('journal_entries').select('id').where('tenant_id','=',tenant.tenantId).where('source_module','=','AR').where('source_id','=',sale).where('status','=','POSTED').execute());expect(entries).toHaveLength(1);
},120000);
