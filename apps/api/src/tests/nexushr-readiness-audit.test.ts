import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
import { GLService } from '../services/gl.service.js';
import { dbPlatform } from '../db/client.js';

describe('NexusHR readiness audit — security and integrity regressions', () => {
 let tenant: TestTenant; let manager: {userId:string;token:string}; let employee: {userId:string;token:string};
 beforeAll(async()=>{ tenant=await createTestTenant(); manager=await tenant.addUser('MANAGER'); employee=await tenant.addUser('JUNIOR');
  await dbPlatform.updateTable('users').set({basic_salary:'2500000',pay_currency:'TZS'}).where('tenant_id','=',tenant.tenantId).where('id','=',employee.userId).execute();
 });
 afterAll(async()=>{if(tenant) await tenant.cleanup();});
 it('does not expose salary to an unrelated MANAGER through roster',async()=>{
  const app=await getApp();
  const detail=await app.inject({method:'GET',url:`/v1/hr/staff/${employee.userId}`,headers:authHeaders(manager.token)});
  expect(detail.statusCode).toBe(200); expect(detail.json().basic_salary).toBeUndefined();
  const roster=await app.inject({method:'GET',url:'/v1/hr/roster',headers:authHeaders(manager.token)});
  expect(roster.statusCode).toBe(200);
  expect(roster.json().roster.find((r:any)=>r.userId===employee.userId).employment?.base_salary).toBeUndefined();
 });
 it('denies unrelated MANAGER compensation history',async()=>{
  const app=await getApp();
  const created=await app.inject({method:'POST',url:`/v1/hr/employments/${employee.userId}/compensation`,headers:authHeaders(tenant.token),payload:{base_salary:2600000,effective_date:'2026-01-01',currency:'TZS'}});
  expect(created.statusCode,created.body).toBe(200);
  const res=await app.inject({method:'GET',url:`/v1/hr/employments/${employee.userId}/compensation`,headers:authHeaders(manager.token)});
  expect(res.statusCode).toBe(403);
 });
 it('checks negative compensation rejection',async()=>{
  const app=await getApp(); const res=await app.inject({method:'POST',url:`/v1/hr/employments/${employee.userId}/compensation`,headers:authHeaders(tenant.token),payload:{base_salary:-100,effective_date:'2026-02-01',currency:'TZS'}});
  expect(res.statusCode,res.body).toBeGreaterThanOrEqual(400);
 });
 it('checks unregistered device push credential is revoked',async()=>{
  const app=await getApp();
  const created=await app.inject({method:'POST',url:'/v1/hr/attendance-devices',headers:authHeaders(tenant.token),payload:{name:'Audit disposable device'}});
  expect(created.statusCode,created.body).toBe(201); const device=created.json();
  const removed=await app.inject({method:'DELETE',url:`/v1/hr/attendance-devices/${device.id}`,headers:authHeaders(tenant.token)});
  expect(removed.statusCode,removed.body).toBeLessThan(300);
  const res=await app.inject({method:'GET',url:`/iclock/cdata?SN=${encodeURIComponent(device.serial_number)}&token=${encodeURIComponent(device.push_token)}`});
  expect(res.statusCode).toBe(403);
 });
 it('checks payroll GL journal rolls back if the payment operation fails after posting',async()=>{
  const app=await getApp(); await GLService.seedChartOfAccounts(dbPlatform,tenant.tenantId);
  const run=await dbPlatform.insertInto('payroll_runs').values({tenant_id:tenant.tenantId,name:'Audit rollback',period_year:2026,period_month:10,period_start:new Date('2026-10-01'),period_end:new Date('2026-10-31'),jurisdiction:'TZ',status:'APPROVED',approved_by:tenant.userId,approved_at:new Date(),created_by:tenant.userId}).returningAll().executeTakeFirstOrThrow();
  await dbPlatform.insertInto('payroll_payslips').values({tenant_id:tenant.tenantId,run_id:run.id,user_id:employee.userId,basic_pay:'100',gross_pay:'100',net_pay:'100'}).execute();
  const original=GLService.post.bind(GLService);
  const spy=vi.spyOn(GLService,'post').mockImplementation(async(...args)=>{await original(...args);throw new Error('AUDIT_FAULT_AFTER_POSTING');});
  let res; try {res=await app.inject({method:'POST',url:`/v1/payroll/runs/${run.id}/mark-paid`,headers:authHeaders(tenant.token),payload:{}});}finally{spy.mockRestore();}
  expect(res.statusCode).toBe(500);
  const unchanged=await dbPlatform.selectFrom('payroll_runs').select('status').where('tenant_id','=',tenant.tenantId).where('id','=',run.id).executeTakeFirstOrThrow();
  expect(unchanged.status).toBe('APPROVED');
  const entries=await dbPlatform.selectFrom('journal_entries').select('id').where('tenant_id','=',tenant.tenantId).where('source_id','=',run.id).execute();
  expect(entries).toHaveLength(0);
 });

 it('rejects unauthenticated and CUSTOMER access to staff records',async()=>{
  const app=await getApp(); const guest=await app.inject({method:'GET',url:'/v1/hr/staff'}); expect(guest.statusCode).toBe(401);
  const customer=await tenant.addUser('CUSTOMER'); const res=await app.inject({method:'GET',url:'/v1/hr/staff',headers:authHeaders(customer.token)}); expect(res.statusCode).toBe(403);
 });
 it('enforces disabled NexusHR app for a tenant administrator',async()=>{
  const t=await createTestTenant(); try{
   await dbPlatform.insertInto('tenant_settings').values({tenant_id:t.tenantId,settings:JSON.stringify({'enabled-apps':{nexushr:false}})}).onConflict(oc=>oc.column('tenant_id').doUpdateSet({settings:JSON.stringify({'enabled-apps':{nexushr:false}})})).execute();
   const app=await getApp(); const res=await app.inject({method:'GET',url:'/v1/hr/staff',headers:authHeaders(t.token)}); expect(res.statusCode).toBe(403);
  }finally{await t.cleanup();}
 });
 it('rejects already-issued credentials after tenant suspension',async()=>{
  const t=await createTestTenant(); try{await dbPlatform.updateTable('tenants').set({active:false}).where('id','=',t.tenantId).execute();
   const app=await getApp(); const res=await app.inject({method:'GET',url:'/v1/hr/staff',headers:authHeaders(t.token)}); expect(res.statusCode).toBe(403);
  }finally{await t.cleanup();}
 });

});
