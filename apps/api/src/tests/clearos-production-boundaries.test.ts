import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { authHeaders, createTestTenant, getApp, grantStandaloneProduct, type TestTenant } from './helpers.js';
let a: TestTenant, b: TestTenant, shipmentA: string, shipmentB: string;
const observations: Record<string, unknown> = {};
const payload = (shipment_id: string) => ({shipment_id,tancis_ref:`AUDIT-${randomUUID()}`,declaration_mode:'NORMAL',tansad_form_type:'G',clearing_office:'Synthetic',reference_date:'2026-11-02',consignment_country:'TZ',country_of_export:'CN',country_of_destination:'TZ',importer_tin:'TEST',importer_name:'Synthetic importer',declarant_tin:'TEST',declarant_name:'Synthetic declarant'});
beforeAll(async()=>{
 a=await createTestTenant(); b=await createTestTenant();
 for(const t of [a,b]) {
  await dbPlatform.updateTable('tenants').set({plan:'enterprise'}).where('id','=',t.tenantId).execute();
  // 'enterprise' alone no longer grants ClearOS (migration 685 unbundled it
  // into a standalone product, grandfathering only tenants that existed at
  // migration time) — a fresh test tenant needs the real subscription too.
  await grantStandaloneProduct(t.tenantId, 'clearos');
  const id=await withTenant(t.tenantId,async trx=>{
   const c=await trx.insertInto('customers').values({tenant_id:t.tenantId,name:'ClearOS synthetic audit'} as any).returning('id').executeTakeFirstOrThrow();
   return (await trx.insertInto('shipment_cases').values({tenant_id:t.tenantId,customer_id:c.id,ref_number:`AUDIT-${randomUUID()}`,type:'SEA_FCL',goods_desc:'Synthetic audit cargo',containers:'[]',vessel:'Test',origin_port:'Test',dest_port:'Test'}).returning('id').executeTakeFirstOrThrow()).id;
  });
  if(t===a)shipmentA=id;else shipmentB=id;
 }
 observations.databaseRole=await withTenant(a.tenantId,trx=>sql`select current_user, rolsuper, rolbypassrls from pg_roles where rolname=current_user`.execute(trx));
},120000);
afterAll(async()=>{
 writeFileSync(resolve(process.cwd(),'../../audit/evidence/declaration-probes.json'),JSON.stringify(observations,null,2));
 // Append-only declaration history cannot be deleted, including by fixture cascades.
 for(const t of [a,b].filter(Boolean)) {
  await dbPlatform.updateTable('tenants').set({active:false,name:'ClearOS audit fixture (immutable ledger)'}).where('id','=',t.tenantId).execute();
  await dbPlatform.updateTable('users').set({active:false}).where('tenant_id','=',t.tenantId).execute();
 }
},120000);
async function call(method:any,url:string,body?:any,t=a){const app=await getApp();return app.inject({method,url:`/v1/declarations${url}`,headers:authHeaders(t.token),...(body?{payload:body}:{})});}
it('rejects a foreign-tenant shipment reference without persisting a declaration',async()=>{
 const r=await call('POST','',payload(shipmentB)); observations.foreignShipment={status:r.statusCode,body:r.json()};expect(r.statusCode).toBe(400);
 const rows=await withTenant(a.tenantId,trx=>trx.selectFrom('declarations').select('id').where('tenant_id','=',a.tenantId).where('shipment_id','=',shipmentB).execute());expect(rows).toEqual([]);
});
it('rejects nonexistent shipment references',async()=>{const r=await call('POST','',payload(randomUUID()));observations.missingShipment={status:r.statusCode};expect(r.statusCode).toBe(400);});
it('does not let draft declarations skip directly to paid',async()=>{
 const r=await call('POST','',payload(shipmentA));expect(r.statusCode,r.body).toBe(201);
 const changed=await call('PATCH',`/${r.json().id}/status`,{status:'PAID'});observations.draftToPaid={status:changed.statusCode};expect(changed.statusCode).toBe(400);
});
it('isolates declaration reads and denies customer accounts',async()=>{
 const r=await call('POST','',payload(shipmentA));expect(r.statusCode,r.body).toBe(201);
 expect((await call('GET',`/${r.json().id}`,undefined,b)).statusCode).toBe(404);
 const customer=await a.addUser('CUSTOMER');const app=await getApp();expect((await app.inject({method:'GET',url:'/v1/declarations',headers:authHeaders(customer.token)})).statusCode).toBe(403);
});
it('requires payment before release and deduplicates concurrent status writes',async()=>{
 const r=await call('POST','',payload(shipmentA));expect(r.statusCode,r.body).toBe(201);const id=r.json().id;
 expect((await call('PATCH',`/${id}/status`,{status:'RELEASED'})).statusCode).toBe(400);
 await withTenant(a.tenantId,trx=>trx.updateTable('declarations').set({status:'ASSESSED'}).where('id','=',id).where('tenant_id','=',a.tenantId).execute());
 const replies=await Promise.all([1,2,3].map(()=>call('PATCH',`/${id}/status`,{status:'PAID'})));for(const reply of replies)expect(reply.statusCode,reply.body).toBe(200);
 const events=await withTenant(a.tenantId,trx=>trx.selectFrom('declaration_events').select('id').where('tenant_id','=',a.tenantId).where('declaration_id','=',id).where('event_type','=','PAID').execute());expect(events).toHaveLength(1);
 expect((await call('GET',`/${id}/verify-chain`)).json().valid).toBe(true);
});
it('dispatches release only after the declaration transaction is committed',async()=>{
 const {registerSubscriber}=await import('../services/domain-events.service.js');
 const r=await call('POST','',payload(shipmentA));expect(r.statusCode,r.body).toBe(201);const id=r.json().id;
 await withTenant(a.tenantId,trx=>trx.updateTable('declarations').set({status:'PAID'}).where('id','=',id).where('tenant_id','=',a.tenantId).execute());
 let observed:Promise<string|undefined>=Promise.resolve(undefined);
 registerSubscriber('declaration.released',async(tenantId,event)=>{if(event.entityId===id)observed=withTenant(tenantId,async trx=>(await trx.selectFrom('declarations').select('status').where('id','=',id).where('tenant_id','=',tenantId).executeTakeFirst())?.status);await observed;});
 const changed=await call('PATCH',`/${id}/status`,{status:'RELEASED'});expect(changed.statusCode,changed.body).toBe(200);expect(await observed).toBe('RELEASED');
 const events=await withTenant(a.tenantId,trx=>trx.selectFrom('domain_events').select('id').where('tenant_id','=',a.tenantId).where('entity_id','=',id).where('event_type','=','declaration.released').execute());expect(events).toHaveLength(1);
});
