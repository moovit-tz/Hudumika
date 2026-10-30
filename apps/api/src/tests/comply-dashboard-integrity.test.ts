import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import {dbPlatform,withTenant} from '../db/client.js';
import {createTestTenant,getApp,authHeaders,type TestTenant} from './helpers.js';
let a:TestTenant,b:TestTenant;
let expiredId:string;
beforeAll(async()=>{
  a=await createTestTenant();b=await createTestTenant();
  await dbPlatform.updateTable('tenants').set({plan:'enterprise'}).where('id','in',[a.tenantId,b.tenantId]).execute();
  await withTenant(a.tenantId,async trx=>{
    for(const [name,offset,status] of [['Current',60,'active'],['Expiring',10,'active'],['Expired',-10,'active'],['Unknown',null,'active'],['Revoked',-20,'revoked']] as const){
      const row=await trx.insertInto('comply_certificates').values({tenant_id:a.tenantId,cert_number:randomUUID(),name,agency_code:'TEST',agency_name:'Test authority',status,
        expiry_date:offset===null?null:sql<string>`current_date + ${offset}::integer`}).returning('id').executeTakeFirstOrThrow();
      if(name==='Expired')expiredId=row.id;
    }
    for(const status of ['draft','submitted','pending','review','issued','rejected'])await trx.insertInto('comply_applications').values({tenant_id:a.tenantId,app_number:randomUUID(),cert_type:'Dashboard test',agency_code:'TEST',status,created_by:a.userId} as any).execute();
  });
},120000);
afterAll(async()=>{if(a)await a.cleanup();if(b)await b.cleanup();},120000);
async function overview(tenant=a){
 const app=await getApp();const response=await app.inject({method:'GET',url:'/v1/comply/dashboard',headers:authHeaders(tenant.token)});
 expect(response.statusCode).toBe(200);return response.json();
}
it('reports current, expiring, expired, unknown and pending records without treating expiry coverage as verification',async()=>{
 const data=await overview();
 expect(data).toMatchObject({tracked_certs:4,active_certs:1,expiring_soon:1,overdue:1,unknown_validity_certs:1,pending_apps:3,health_score:50});
 expect(data.upcoming_deadlines.map((d:any)=>d.cert_name)).toEqual(['Expired','Expiring','Current']);
},30000);
it('isolates another tenant and preserves an incomplete empty workspace',async()=>{
 expect(await overview(b)).toMatchObject({tracked_certs:0,unknown_validity_certs:0,health_score:-1,pending_apps:0,upcoming_deadlines:[]});
},30000);
it('refreshes dashboard counts after certificate changes and revocation through the actual API',async()=>{
 const app=await getApp();
 const expiry=await withTenant(a.tenantId,async trx=>(await sql<{date:string}>`select (current_date + 60)::text as date`.execute(trx)).rows[0].date);
 const updated=await app.inject({method:'PATCH',url:`/v1/comply/certificates/${expiredId}`,headers:authHeaders(a.token),payload:{expiry_date:expiry}});
 expect(updated.statusCode).toBe(200);expect(await overview()).toMatchObject({tracked_certs:4,active_certs:2,overdue:0,health_score:75});
 const revoked=await app.inject({method:'DELETE',url:`/v1/comply/certificates/${expiredId}`,headers:authHeaders(a.token)});
 expect(revoked.statusCode).toBe(200);expect(await overview()).toMatchObject({tracked_certs:3,active_certs:1,health_score:67});
},30000);
it('rejects junior dashboard access and foreign certificate mutations',async()=>{
 const app=await getApp();const junior=await a.addUser('JUNIOR');
 expect((await app.inject({method:'GET',url:'/v1/comply/dashboard',headers:authHeaders(junior.token)})).statusCode).toBe(403);
 const response=await app.inject({method:'PATCH',url:`/v1/comply/certificates/${expiredId}`,headers:authHeaders(b.token),payload:{name:'Foreign overwrite'}});
 expect(response.statusCode).toBe(404);
 expect((await app.inject({method:'DELETE',url:`/v1/comply/certificates/${expiredId}`,headers:authHeaders(b.token)})).statusCode).toBe(404);
 const record=await withTenant(a.tenantId,trx=>trx.selectFrom('comply_certificates').select('name').where('tenant_id','=',a.tenantId).where('id','=',expiredId).executeTakeFirstOrThrow());
 expect(record.name).toBe('Expired');
},30000);
it('keeps deadline previews bounded without loading certificate documents',async()=>{
 await withTenant(b.tenantId,async trx=>{
  for(let i=1;i<=12;i++)await trx.insertInto('comply_certificates').values({tenant_id:b.tenantId,cert_number:randomUUID(),name:`Preview ${i}`,agency_code:'TEST',agency_name:'Test',expiry_date:sql<Date>`current_date + ${i}::integer`} as any).execute();
 });
 const data=await overview(b);expect(data.tracked_certs).toBe(12);expect(data.upcoming_deadlines).toHaveLength(8);
 expect(data.health_score).toBe(100);expect(data).not.toHaveProperty('document_data');
},30000);
