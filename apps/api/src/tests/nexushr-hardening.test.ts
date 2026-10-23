import { env } from '../config/env.js';
import { describe,it,expect,vi } from 'vitest';
import { getApp,createTestTenant,authHeaders,type TestTenant } from './helpers.js';
import { dbPlatform } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import * as deviceService from '../services/attendance-device.service.js';
import { salaryForPeriod } from '../services/payroll-salary.service.js';

async function payrollFixture(run: (t:TestTenant, employee:{userId:string;token:string}, finance:{userId:string;token:string})=>Promise<void>) {
 const t=await createTestTenant(); try {
  const employee=await t.addUser('JUNIOR'),finance=await t.addUser('FINANCE');
  await dbPlatform.updateTable('users').set({basic_salary:'3100',pay_currency:'TZS'}).where('id','=',employee.userId).where('tenant_id','=',t.tenantId).execute();
  // Synthetic zero tax isolates workflow arithmetic; these are not statutory production rates.
  await dbPlatform.insertInto('payroll_tax_bands').values({tenant_id:t.tenantId,jurisdiction:'TZ',residency:'RESIDENT',seq:1,lower_bound:'0',upper_bound:null,rate_pct:'0',fixed_amount:'0',effective_from:new Date('2020-01-01')}).execute();
  await dbPlatform.insertInto('payroll_contribution_schemes').values({tenant_id:t.tenantId,jurisdiction:'TZ',code:'AUDIT',name:'Synthetic test-only scheme',employee_pct:'0',employer_pct:'0',calc_base:'BASIC',effective_from:new Date('2020-01-01'),effective_to:null}).execute();
  await GLService.seedChartOfAccounts(dbPlatform,t.tenantId); await run(t,employee,finance);
 }finally{await t.cleanup();}
}
async function createRun(t:TestTenant,month=1,year=2026){const app=await getApp();const res=await app.inject({method:'POST',url:'/v1/payroll/runs',headers:authHeaders(t.token),payload:{period_year:year,period_month:month}});expect(res.statusCode,res.body).toBe(200);return res.json();}
async function compensation(t:TestTenant,id:string,date:string,salary:number,extra={}) {const app=await getApp();return app.inject({method:'POST',url:`/v1/hr/employments/${id}/compensation`,headers:authHeaders(t.token),payload:{base_salary:salary,effective_date:date,currency:'TZS',...extra}});}

describe('NexusHR payroll hardening',()=>{
 it('uses historical and future effective salary rather than the current projection',()=>payrollFixture(async(t,e)=>{
  const app=await getApp(); expect((await compensation(t,e.userId,'2025-01-01',3100)).statusCode).toBe(200);
  expect((await compensation(t,e.userId,'2026-02-01',6200)).statusCode).toBe(200);
  expect((await compensation(t,e.userId,'2027-01-01',9300)).statusCode).toBe(200);
  for(const [year,month,expected] of [[2026,1,3100],[2027,1,9300]]) {
   const r=await createRun(t,month,year); const res=await app.inject({method:'POST',url:`/v1/payroll/runs/${r.id}/calculate`,headers:authHeaders(t.token),payload:{}});expect(res.statusCode,res.body).toBe(200);
   const slip=await dbPlatform.selectFrom('payroll_payslips').select('basic_pay').where('tenant_id','=',t.tenantId).where('run_id','=',r.id).where('user_id','=',e.userId).executeTakeFirstOrThrow();expect(Number(slip.basic_pay)).toBe(expected);
  }
 }));
 it('prorates a mid-month change, supports annual amounts and exposes configurable period-end policy',()=>payrollFixture(async(t,e)=>{
  const app=await getApp(); await compensation(t,e.userId,'2026-01-01',3100); await compensation(t,e.userId,'2026-01-16',74400,{pay_frequency:'ANNUAL'});
  const run=await createRun(t); const calc=()=>app.inject({method:'POST',url:`/v1/payroll/runs/${run.id}/calculate`,headers:authHeaders(t.token),payload:{}});
  expect((await calc()).statusCode).toBe(200);
  const read=()=>dbPlatform.selectFrom('payroll_payslips').select('basic_pay').where('tenant_id','=',t.tenantId).where('run_id','=',run.id).executeTakeFirstOrThrow(); expect(Number((await read()).basic_pay)).toBe(4700);
  const compared=await app.inject({method:'GET',url:'/v1/hr/payroll-vs-contract?month=1&year=2026',headers:authHeaders(t.token)});expect(compared.statusCode,compared.body).toBe(200);expect(compared.json().rows.find((r:any)=>r.userId===e.userId).variance).toBe(0);
  const policy=await app.inject({method:'PATCH',url:'/v1/payroll/policy',headers:authHeaders(t.token),payload:{salary_basis:'period_end'}});expect(policy.statusCode,policy.body).toBe(200);
  expect((await calc()).statusCode).toBe(200);expect(Number((await read()).basic_pay)).toBe(6200);
 }));
 it('requires a different creator/calculator and serialises payment to a single journal',()=>payrollFixture(async(t,e,f)=>{
  const app=await getApp(); const run=await createRun(t);
  const calculated=await app.inject({method:'POST',url:`/v1/payroll/runs/${run.id}/calculate`,headers:authHeaders(t.token),payload:{}});expect(calculated.statusCode,calculated.body).toBe(200);
  expect((await app.inject({method:'POST',url:`/v1/payroll/runs/${run.id}/approve`,headers:authHeaders(t.token),payload:{}})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url:`/v1/payroll/runs/${run.id}/approve`,headers:authHeaders(f.token),payload:{}})).statusCode).toBe(200);
  const paid=await Promise.all([1,2].map(()=>app.inject({method:'POST',url:`/v1/payroll/runs/${run.id}/mark-paid`,headers:authHeaders(f.token),payload:{}})));expect(paid.map(res=>res.statusCode).sort()).toEqual([200,409]);
  const journals=await dbPlatform.selectFrom('journal_entries').select('id').where('tenant_id','=',t.tenantId).where('source_id','=',run.id).execute();expect(journals).toHaveLength(1);
  expect((await app.inject({method:'POST',url:`/v1/payroll/runs/${run.id}/calculate`,headers:authHeaders(t.token),payload:{}})).statusCode).toBe(409);
 }));
 it('serialises concurrent calculation and compensation insertion',()=>payrollFixture(async(t,e)=>{
  const app=await getApp();const records=await Promise.all([1,2].map(()=>compensation(t,e.userId,'2026-01-01',3100)));expect(records.map(r=>r.statusCode).sort()).toEqual([200,400]);
  const run=await createRun(t); const results=await Promise.all([1,2].map(()=>app.inject({method:'POST',url:`/v1/payroll/runs/${run.id}/calculate`,headers:authHeaders(t.token),payload:{}})));expect(results.map(r=>r.statusCode)).toEqual([200,200]);
  const slips=await dbPlatform.selectFrom('payroll_payslips').select('id').where('tenant_id','=',t.tenantId).where('run_id','=',run.id).execute();expect(slips).toHaveLength(1);
 }));
 it('rejects malformed dates, oversized/negative pay, bad frequency and invalid currency without changing pay',()=>payrollFixture(async(t,e)=>{
  const app=await getApp();for(const input of [{effective_date:'2026-02-30'},{base_salary:-1},{base_salary:1e15},{currency:'USDX'},{pay_frequency:'WHENEVER'}]) {
   const res=await compensation(t,e.userId,'2026-01-01',100,input);expect(res.statusCode,res.body).toBe(400);
  }
  const user=await dbPlatform.selectFrom('users').select('basic_salary').where('tenant_id','=',t.tenantId).where('id','=',e.userId).executeTakeFirstOrThrow();expect(Number(user.basic_salary)).toBe(3100);
 }));
 it('backdates history without replacing the salary currently in force',()=>payrollFixture(async(t,e)=>{
  await compensation(t,e.userId,'2026-01-01',3100); await compensation(t,e.userId,'2026-03-01',6200); await compensation(t,e.userId,'2026-02-01',4000);
  const rows=await dbPlatform.selectFrom('hr_compensations').selectAll().where('tenant_id','=',t.tenantId).where('user_id','=',e.userId).orderBy('effective_date').execute();expect(rows).toHaveLength(3);expect(String(rows[1].end_date).slice(0,10)).toMatch(/2026-02-28|Sat Feb 28/);
  const person=await dbPlatform.selectFrom('users').select('basic_salary').where('tenant_id','=',t.tenantId).where('id','=',e.userId).executeTakeFirstOrThrow();expect(Number(person.basic_salary)).toBe(6200);
 }));
 it('does not silently zero non-resident tax or omit missing contribution settings',()=>payrollFixture(async(t,e)=>{
  const app=await getApp();const run=await createRun(t);
  await dbPlatform.updateTable('users').set({tax_residency:'NON_RESIDENT'}).where('tenant_id','=',t.tenantId).where('id','=',e.userId).execute();
  const calc=()=>app.inject({method:'POST',url:`/v1/payroll/runs/${run.id}/calculate`,headers:authHeaders(t.token),payload:{}});
  expect((await calc()).statusCode).toBe(409);
  await dbPlatform.updateTable('users').set({tax_residency:'RESIDENT'}).where('tenant_id','=',t.tenantId).where('id','=',e.userId).execute();
  await dbPlatform.deleteFrom('payroll_contribution_schemes').where('tenant_id','=',t.tenantId).execute();expect((await calc()).statusCode).toBe(409);
  expect(await dbPlatform.selectFrom('payroll_payslips').select('id').where('tenant_id','=',t.tenantId).execute()).toHaveLength(0);
 }));
 it('fails closed on gaps, overlaps, non-TZS and unsupported pay cycles',()=>{
  const rec={effective_date:'2026-01-01',end_date:null,base_salary:3100,currency:'TZS',pay_frequency:'MONTHLY'};
  const resolve=(records:any[])=>salaryForPeriod(records,{salary:'9999',currency:'TZS'},'2026-01-01','2026-01-31');
  expect(()=>resolve([{...rec,effective_date:'2026-01-15'}])).toThrow(/gap/);expect(()=>resolve([rec,rec])).toThrow(/overlap/);
  expect(()=>resolve([{...rec,currency:'USD'}])).toThrow(/TZS/);expect(()=>resolve([{...rec,pay_frequency:'HOURLY'}])).toThrow(/policy/);
 });
});

describe('NexusHR confidential resources and attendance delivery',()=>{
 it('bounds roster and case collections and preserves total counts',async()=>{
  const t=await createTestTenant();try {const app=await getApp();const employee=await t.addUser('JUNIOR');
   const read=(page:number)=>app.inject({method:'GET',url:`/v1/hr/roster?page=${page}&page_size=1`,headers:authHeaders(t.token)});
   const first=await read(1),second=await read(2);expect(first.statusCode,first.body).toBe(200);expect(first.json().roster).toHaveLength(1);expect(second.json().roster).toHaveLength(1);expect(first.json().total).toBe(2);expect(first.json().roster[0].userId).not.toBe(second.json().roster[0].userId);
   expect((await app.inject({method:'GET',url:'/v1/hr/roster?page_size=1000',headers:authHeaders(t.token)})).statusCode).toBe(400);
   for(const title of ['First','Second']) expect((await app.inject({method:'POST',url:'/v1/hr/cases',headers:authHeaders(t.token),payload:{employee_id:employee.userId,case_type:'grievance',title}})).statusCode).toBe(201);
   const cases=await app.inject({method:'GET',url:'/v1/hr/cases?page=1&page_size=1',headers:authHeaders(t.token)});expect(cases.statusCode,cases.body).toBe(200);expect(cases.json().data).toHaveLength(1);expect(cases.json().total).toBe(2);
   expect((await app.inject({method:'GET',url:'/v1/hr/cases?page_size=1000',headers:authHeaders(t.token)})).statusCode).toBe(400);
  }finally {await t.cleanup();}
 });

 it('denies generic managers cases/documents/pay reports but permits explicit HR delegation',async()=>{
  const t=await createTestTenant();try{const app=await getApp(),m=await t.addUser('MANAGER'),e=await t.addUser('JUNIOR');
   const created=await app.inject({method:'POST',url:'/v1/hr/cases',headers:authHeaders(t.token),payload:{employee_id:e.userId,case_type:'grievance',title:'Confidential test'}});expect(created.statusCode,created.body).toBe(201);
   for(const url of ['/v1/hr/cases',`/v1/hr/cases/${created.json().id}`,'/v1/hr/documents','/v1/hr/payroll-vs-contract',`/v1/hr/staff/${e.userId}/documents`]){const res=await app.inject({method:'GET',url,headers:authHeaders(m.token)});expect(res.statusCode,`${url}: ${res.body}`).toBe(403);}
   expect((await app.inject({method:'GET',url:`/v1/hr/staff/${e.userId}/documents`,headers:authHeaders(e.token)})).statusCode).toBe(200);
   expect((await app.inject({method:'GET',url:`/v1/hr/staff/${m.userId}/documents`,headers:authHeaders(e.token)})).statusCode).toBe(403);
   const role=await dbPlatform.insertInto('ondi_org_roles').values({tenant_id:t.tenantId,name:'HR specialist',description:null,permissions:JSON.stringify(['hr.cases.manage','hr.documents.manage']),created_by:t.userId}).returning('id').executeTakeFirstOrThrow();
   await dbPlatform.insertInto('ondi_org_role_members').values({tenant_id:t.tenantId,role_id:role.id,user_id:m.userId,granted_by:t.userId,expires_at:null,granted_via_group_id:null}).execute();
   for(const url of ['/v1/hr/cases','/v1/hr/documents',`/v1/hr/staff/${e.userId}/documents`]){const res=await app.inject({method:'GET',url,headers:authHeaders(m.token)});expect(res.statusCode,`${url}: ${res.body}`).toBe(200);}
  }finally{await t.cleanup();}
 });
 it('requires retry after a rolled-back punch batch, deduplicates concurrent retries and rotates secrets',async()=>{
  const t=await createTestTenant();try{const app=await getApp();const create=await app.inject({method:'POST',url:'/v1/hr/attendance-devices',headers:{...authHeaders(t.token),host:'attacker.invalid'},payload:{name:'Retry test'}});expect(create.statusCode,create.body).toBe(201);const d=create.json();expect(d.serverUrl).not.toContain('attacker.invalid');expect(new URL(d.serverUrl).pathname).toMatch(/iclock$/);
   const url=`/iclock/cdata?SN=${encodeURIComponent(d.serial_number)}&table=ATTLOG`;const payload='999\t2026-01-05 08:00:00\t0\n999\t2026-01-05 17:00:00\t1';
   const spy=vi.spyOn(deviceService,'recordDevicePunches').mockRejectedValueOnce(new Error('Injected device storage failure'));
   try{const res=await app.inject({method:'POST',url,headers:{'x-device-token':d.push_token,'content-type':'text/plain'},payload});expect(res.statusCode,res.body).toBe(503);}finally{spy.mockRestore();}
   const retries=await Promise.all([1,2].map(()=>app.inject({method:'POST',url,headers:{'x-device-token':d.push_token,'content-type':'text/plain'},payload})));expect(retries.map(r=>r.statusCode)).toEqual([200,200]);
   const events=await dbPlatform.selectFrom('attendance_device_events').select('id').where('tenant_id','=',t.tenantId).where('device_id','=',d.id).execute();expect(events).toHaveLength(2);
   const rotated=await app.inject({method:'POST',url:`/v1/hr/attendance-devices/${d.id}/rotate-token`,headers:authHeaders(t.token),payload:{}});expect(rotated.statusCode,rotated.body).toBe(200);
   const handshake=`/iclock/cdata?SN=${encodeURIComponent(d.serial_number)}`;expect((await app.inject({method:'GET',url:handshake,headers:{'x-device-token':d.push_token}})).statusCode).toBe(403);expect((await app.inject({method:'GET',url:handshake,headers:{'x-device-token':rotated.json().push_token}})).statusCode).toBe(200);
   const token=rotated.json().push_token;
   expect((await app.inject({method:'POST',url,headers:{'x-device-token':token,'content-type':'text/plain'},payload:Array(5001).fill('999\t2026-01-05 08:00:00\t0').join('\n')})).statusCode).toBe(413);
   const prior=env.APP_ENV;env.APP_ENV='production';
   try {
    expect((await app.inject({method:'GET',url:handshake,headers:{'x-device-token':token}})).statusCode).toBe(403);
    expect((await app.inject({method:'GET',url:handshake,headers:{'x-device-token':token,'x-forwarded-proto':'https'},remoteAddress:'203.0.113.10'})).statusCode).toBe(403);
    expect((await app.inject({method:'GET',url:handshake,headers:{'x-device-token':token,'x-forwarded-proto':'https'},remoteAddress:'127.0.0.1'})).statusCode).toBe(200);
   }finally {env.APP_ENV=prior;}

  }finally{await t.cleanup();}
 }); it('enforces seat grants/revocations and disabled-app precedence',async()=>{
  const t=await createTestTenant();try{const app=await getApp();const user=await t.addUser('JUNIOR');
   const settings={'restricted-apps':{nexushr:true}};
   await dbPlatform.insertInto('tenant_settings').values({tenant_id:t.tenantId,settings:JSON.stringify(settings)}).execute();
   const read=()=>app.inject({method:'GET',url:'/v1/hr/staff',headers:authHeaders(user.token)});expect((await read()).statusCode).toBe(403);
   await dbPlatform.insertInto('user_app_access').values({tenant_id:t.tenantId,user_id:user.userId,app_id:'nexushr',granted_by:t.userId}).execute();expect((await read()).statusCode).toBe(200);
   await dbPlatform.updateTable('tenant_settings').set({settings:JSON.stringify({...settings,'enabled-apps':{nexushr:false}})}).where('tenant_id','=',t.tenantId).execute();expect((await read()).statusCode).toBe(403);
   await dbPlatform.updateTable('tenant_settings').set({settings:JSON.stringify(settings)}).where('tenant_id','=',t.tenantId).execute();
   await dbPlatform.deleteFrom('user_app_access').where('tenant_id','=',t.tenantId).where('user_id','=',user.userId).execute();expect((await read()).statusCode).toBe(403);
  }finally{await t.cleanup();}
 });

});
