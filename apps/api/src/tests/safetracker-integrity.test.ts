import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';
import { withTenant } from '../db/client.js';
let tenant: TestTenant, other: TestTenant, customer: string, foreign: string, shipment: string, sales: string;
beforeAll(async () => {
 tenant = await createTestTenant(); other = await createTestTenant(); sales = (await tenant.addUser('SALES')).token;
 for (const t of [tenant,other]) await withTenant(t.tenantId, async trx => {
  await trx.insertInto('tenant_settings').values({tenant_id:t.tenantId, settings:JSON.stringify({'enabled-apps':{cargotracker:true,demurrage:true}})}).execute();
  const c = await trx.insertInto('customers').values({tenant_id:t.tenantId,name:'Safetracker test'}).returning('id').executeTakeFirstOrThrow();
  if(t===tenant) {customer=c.id; const row=await trx.insertInto('shipment_cases').values({tenant_id:t.tenantId,customer_id:c.id,type:'SEA_FCL',ref_number:`AUDIT-${randomUUID()}`,goods_desc:'Test cargo',vessel:'Test vessel',origin_port:'TZDAR',dest_port:'KEMBA',containers:'[]',assigned_to:t.userId}).returning('id').executeTakeFirstOrThrow();shipment=row.id;} else foreign=c.id;
 });
},120000);
afterAll(async()=>{ for(const t of [tenant,other].filter(Boolean)) await t.cleanup(); },120000);
async function req(method:'GET'|'POST'|'PATCH'|'DELETE',url:string,payload?:object,token=tenant.token) { return (await getApp()).inject({method,url,headers:authHeaders(token),...(payload?{payload}:{})}); }
const num='MSCU1234566';
it('never fabricates unknown containers or live tracking and rejects malformed inputs',async()=>{
 expect((await req('GET','/v1/tracker/containers/XXXX0000000')).statusCode).toBe(404);
 expect((await req('POST','/v1/tracker/track',{number:'NO-SUCH-BOOKING'})).statusCode).toBe(503);
 expect((await req('POST','/v1/tracker/track',{number:123})).statusCode).toBe(400);
 expect((await req('POST','/v1/tracker/containers',{container_number:'BAD-NUMBER'})).statusCode).toBe(400);
 expect((await req('POST','/v1/tracker/containers',{container_number:num},sales)).statusCode).toBe(403);
 expect((await req('POST','/v1/tracker/containers',{container_number:num,customer_id:foreign})).statusCode).toBe(400);
});
it('round trips container fields without synthetic surveys, stages or voyages',async()=>{
 const created=await req('POST','/v1/tracker/containers',{container_number:num,carrier:'Maersk',tare_weight_kg:7777,max_gross_weight_kg:9999,cargo_breakdown:[{description:'Cargo',quantity:3}],customer_id:customer});
 expect(created.statusCode,created.body).toBe(201);
 const read=await req('GET',`/v1/tracker/containers/${num}`);expect(read.statusCode,read.body).toBe(200);const row=read.json();
 expect(row.carrier_name).toBe('Maersk');expect(row.tare_weight_kg).toBe(7777);expect(row.cargo_breakdown[0].quantity).toBe(3);expect(row.compliance).toEqual({});expect(row.voyage).toEqual({});expect(row.survey_report.grade).toBe('');expect(row.stage_history).toEqual([]);
 expect((await req('PATCH',`/v1/tracker/containers/${num}`,{notes:'cross tenant'},other.token)).statusCode).toBe(404);
 expect((await req('PATCH',`/v1/tracker/containers/${num}/stage`,{stage:'FAKE',notes:'evidence',location:'Depot'})).statusCode).toBe(400);
 expect((await req('PATCH',`/v1/tracker/containers/${num}/stage`,{stage:'VESSEL_LOADED',notes:'evidence',location:'Depot'})).statusCode).toBe(409);
 const stage={stage:'DEPOT_ALLOCATED',notes:'Allocation recorded by test officer',location:'Test depot'};
 for(let i=0;i<2;i++) expect((await req('PATCH',`/v1/tracker/containers/${num}/stage`,stage)).statusCode).toBe(200);
 expect((await req('GET',`/v1/tracker/containers/${num}`)).json().stage_history).toHaveLength(1);
});
it('persists surveys and repair completion, refusing foreign repairs',async()=>{
 const survey=await req('POST',`/v1/tracker/containers/${num}/surveys`,{grade:'B',survey_date:'2026-10-01',surveyor_name:'Test surveyor',surveyor_notes:'Test observation',photos:[]});expect(survey.statusCode,survey.body).toBe(201);
 const repair=await req('POST',`/v1/tracker/containers/${num}/repairs`,{description:'Door seal',repair_type:'seal'});expect(repair.statusCode,repair.body).toBe(201);
 expect((await req('PATCH',`/v1/tracker/containers/${num}/repairs/${repair.json().id}`,{resolved:true})).statusCode).toBe(200);
 const read=(await req('GET',`/v1/tracker/containers/${num}`)).json();expect(read.survey_report.grade).toBe('B');expect(read.survey_report.repairs[0].completed).toBe(true);
 expect((await req('PATCH',`/v1/tracker/containers/${num}/repairs/${repair.json().id}`,{resolved:false},other.token)).statusCode).toBe(404);
});
it('preserves provenance and supports minimized expiring/revocable shares',async()=>{
 expect((await req('POST','/v1/tracker/snapshots',{tracking_type:'BL',tracking_number:'FAKE',source:'mock'})).statusCode).toBe(400);
 expect((await req('POST','/v1/tracker/snapshots',{tracking_type:'BL',tracking_number:'FORGED',source:'live',provider:'shipsgo'})).statusCode).toBe(400);
 const saved=await req('POST','/v1/tracker/snapshots',{tracking_type:'BL',tracking_number:'MANUAL-1',source:'manual',events:[]});expect(saved.statusCode,saved.body).toBe(201);const snap=saved.json();
 const publicResult=await req('GET',`/v1/tracker/shared/${snap.share_token}`);expect(publicResult.statusCode,publicResult.body).toBe(200);expect(publicResult.json().source).toBe('manual');for(const key of ['tenant_id','created_by','shipment_id','id','share_token'])expect(publicResult.json()).not.toHaveProperty(key);
 expect(publicResult.headers['cache-control']).toContain('no-store');
 await withTenant(tenant.tenantId,trx=>trx.updateTable('tracking_snapshots').set({share_expires_at:new Date(Date.now()-1000)}).where('tenant_id','=',tenant.tenantId).where('id','=',snap.id).execute());
 expect((await req('GET',`/v1/tracker/shared/${snap.share_token}`)).statusCode).toBe(404);
 const rotate=await req('POST',`/v1/tracker/snapshots/${snap.id}/share`,{revoke:false});expect(rotate.statusCode,rotate.body).toBe(200);expect((await req('GET',`/v1/tracker/shared/${snap.share_token}`)).statusCode).toBe(404);
 await req('POST',`/v1/tracker/snapshots/${snap.id}/share`,{revoke:true});expect((await req('GET',`/v1/tracker/shared/${rotate.json().share_token}`)).statusCode).toBe(404);
});
it('allocates unique booking numbers under concurrent creates and confirms once',async()=>{
 const body={customer_id:customer,mode:'FCL_20',origin_port:'TZDAR',destination_port:'KEMBA'};
 expect((await req('POST','/v1/freight-booking/bookings',{...body,customer_id:foreign})).statusCode).toBe(400);
 const responses=await Promise.all(Array.from({length:6},()=>req('POST','/v1/freight-booking/bookings',body)));
 for(const r of responses)expect(r.statusCode,r.body).toBe(201);
 expect(new Set(responses.map(r=>r.json().booking_number)).size).toBe(6);
 const id=responses[0].json().id;
 const quote=await req('PATCH',`/v1/freight-booking/bookings/${id}/quote`,{quoted_cost:100,quoted_sell:120});expect(quote.statusCode,quote.body).toBe(200);
 const confirmed=await Promise.all(Array.from({length:3},()=>req('PATCH',`/v1/freight-booking/bookings/${id}/confirm`,{vessel_name:'Test vessel'})));
 for(const r of confirmed)expect(r.statusCode,r.body).toBe(200);
 expect(new Set(confirmed.map(r=>r.json().shipment.id)).size).toBe(1);
});
it('validates free days, tariff dates, tier coverage, currency and return chronology',async()=>{
 const tariff={carrier_name:'Test EUR',container_size:'20FT',free_days:0,rate_tiers:[{from_day:1,to_day:10000,daily_rate:10}],currency:'EUR',effective_from:'2020-01-01'};
 expect((await req('POST','/v1/demurrage/tariffs',{...tariff,rate_tiers:[{from_day:2,to_day:5,daily_rate:10}]})).statusCode).toBe(400);
 expect((await req('POST','/v1/demurrage/tariffs',tariff)).statusCode).toBe(201);
 expect((await req('POST','/v1/demurrage/tariffs',{...tariff,effective_from:'2099-01-01',rate_tiers:[{from_day:1,to_day:10000,daily_rate:999}]})).statusCode).toBe(201);
 const calc=await req('POST','/v1/demurrage/calculate',{...tariff,discharge_date:'2026-10-01',return_date:'2026-10-11'});expect(calc.statusCode,calc.body).toBe(200);expect(calc.json().demurrage_cost).toBe(100);expect(calc.json().currency).toBe('EUR');
 expect((await req('POST','/v1/demurrage/calculate',{...tariff,discharge_date:'2026-10-11',return_date:'2026-10-01'})).statusCode).toBe(400);
 const added=await req('POST','/v1/demurrage/containers',{shipment_id:shipment,container_number:num,container_size:'20FT',carrier_name:'Test EUR',discharge_date:'2026-10-01',free_days:0});expect(added.statusCode,added.body).toBe(201);expect(added.json().free_days).toBe(0);expect(added.json().demurrage_currency).toBe('EUR');
 expect((await req('PATCH',`/v1/demurrage/containers/${added.json().id}/return`,{return_date:'2026-09-01'})).statusCode).toBe(400);
});

it('pins charge rates against later tariff edits and refreshes unposted accruals',async()=>{
 const rules={carrier_name:'Pinned tariff',container_size:'20FT',free_days:0,rate_tiers:[{from_day:1,to_day:10000,daily_rate:10}],currency:'EUR',effective_from:'2020-01-01'};
 const tariff=await req('POST','/v1/demurrage/tariffs',rules);expect(tariff.statusCode,tariff.body).toBe(201);
 const added=await req('POST','/v1/demurrage/containers',{shipment_id:shipment,container_number:num,container_size:'20FT',carrier_name:rules.carrier_name,discharge_date:'2026-10-01',free_days:0});expect(added.statusCode,added.body).toBe(201);
 await req('PATCH',`/v1/demurrage/tariffs/${tariff.json().id}`,{rate_tiers:[{from_day:1,to_day:10000,daily_rate:999}],currency:'USD'});
 const list=await req('GET','/v1/demurrage/containers');expect(list.statusCode,list.body).toBe(200);expect(list.json().find((r:any)=>r.id===added.json().id).demurrage_currency).toBe('EUR');
 const returned=await req('PATCH',`/v1/demurrage/containers/${added.json().id}/return`,{return_date:'2026-10-11'});expect(returned.statusCode,returned.body).toBe(200);expect(Number(returned.json().demurrage_cost)).toBe(100);expect(returned.json().demurrage_currency).toBe('EUR');
});
it('posts finalized charges once in their ledger currency and blocks later mutations',async()=>{
 const {CostPostingService}=await import('../services/cost-posting.service.js'); const {GLService}=await import('../services/gl.service.js');
 const t=await createTestTenant();
 try {
  const id=await withTenant(t.tenantId,async trx=>{
   await GLService.seedChartOfAccounts(trx,t.tenantId);
   const c=await trx.insertInto('customers').values({tenant_id:t.tenantId,name:'Charge customer'}).returning('id').executeTakeFirstOrThrow();
   const sh=await trx.insertInto('shipment_cases').values({tenant_id:t.tenantId,customer_id:c.id,type:'SEA_FCL',ref_number:randomUUID(),goods_desc:'Cargo',vessel:'Test vessel',origin_port:'TZDAR',dest_port:'KEMBA',containers:'[]'}).returning('id').executeTakeFirstOrThrow();
   const charge=await trx.insertInto('container_tracking').values({tenant_id:t.tenantId,shipment_id:sh.id,container_number:num,container_size:'20FT',carrier_name:'Test',discharge_date:'2026-10-01' as any,return_date:'2026-10-11' as any,free_days:0,total_days:10,demurrage_days:10,demurrage_cost:100,demurrage_currency:'TZS',status:'COMPLETED'}).returning('id').executeTakeFirstOrThrow();return charge.id;
  });
  const results=await Promise.all([CostPostingService.postDemurrage(t.tenantId,t.userId),CostPostingService.postDemurrage(t.tenantId,t.userId)]);
  expect(results.reduce((n,r)=>n+r.posted.length,0)).toBe(1);
  const lines=await withTenant(t.tenantId,trx=>trx.selectFrom('journal_lines as l').innerJoin('journal_entries as e','e.id','l.journal_entry_id').select(['l.currency','l.debit','l.credit']).where('e.tenant_id','=',t.tenantId).where('e.source_id','=',id).execute());expect(lines).toHaveLength(2);expect(lines.every(l=>l.currency==='TZS')).toBe(true);expect(lines.reduce((n,l)=>n+Number(l.debit)-Number(l.credit),0)).toBe(0);
  const {demurrageService}=await import('../services/demurrage.service.js');await expect(demurrageService.updateContainer(t.tenantId,id,{free_days:5})).rejects.toThrow('already been posted');await expect(demurrageService.deleteContainer(t.tenantId,id)).rejects.toThrow('already posted');
 }finally{await t.cleanup();}
});
it('accepts signed provider results, rejects tampering and exposes outages without demo fallback',async()=>{
 const {vi}=await import('vitest');
 await withTenant(tenant.tenantId,trx=>trx.updateTable('tenant_settings').set({settings:JSON.stringify({'enabled-apps':{cargotracker:true,demurrage:true},'int-shipsgo':{ship24_api_key:'integration-test-only'}})}).where('tenant_id','=',tenant.tenantId).execute());
 const fetch=vi.spyOn(globalThis,'fetch');
 try{
  fetch.mockResolvedValue(new Response(JSON.stringify({data:{trackings:[{tracker:{courierCode:'test-carrier'},shipment:{originAddress:{addressLocality:'Origin',countryCode:'TZ'},destinationAddress:{addressLocality:'Destination',countryCode:'KE'}},events:[{occurrenceDatetime:'2026-10-01T12:00:00Z',location:{name:'Test location',countryCode:'TZ'},status:'In transit',statusCode:'IN_TRANSIT'}]}]}}),{status:200,headers:{'content-type':'application/json'}}));
  const tracked=await req('POST','/v1/tracker/track',{number:'TEST-PROVIDER',type:'BL'});expect(tracked.statusCode,tracked.body).toBe(200);const result=tracked.json();expect(result.source).toBe('live');expect(result.proof).toBeTypeOf('string');
  expect((await req('POST','/v1/tracker/snapshots',{...result,status:'Forged delivery'})).statusCode).toBe(400);
  expect((await req('POST','/v1/tracker/snapshots',{...result,proof:result.proof+'.extra'})).statusCode).toBe(400);
  const originalNow=Date.now();const clock=vi.spyOn(Date,'now').mockReturnValue(originalNow+16*60000);
  try{expect((await req('POST','/v1/tracker/snapshots',result)).statusCode).toBe(400);}finally{clock.mockRestore();}
  const saved=await req('POST','/v1/tracker/snapshots',result);expect(saved.statusCode,saved.body).toBe(201);expect(saved.json().provider).toBe('ship24');expect(saved.json().events[0].description).toBe('In transit');
  const legacy=await req('POST','/v1/tracker/snapshots',{tracking_number:'TEST-PROVIDER',tracking_type:'BL',source:'manual',eta:'2099-01-01T00:00:00Z'});expect(legacy.statusCode,legacy.body).toBe(201);
  const refreshed=await req('PATCH',`/v1/tracker/snapshots/${legacy.json().id}`,result);expect(refreshed.statusCode,refreshed.body).toBe(200);expect(refreshed.json().eta_initial).toBe(null);
  const summary=await req('GET','/v1/cargotracker/dashboard/summary');expect(summary.statusCode,summary.body).toBe(200);expect(summary.json().shipments).toBe(1);
  for(const path of ['carrier-analysis','lane-analysis','regional-analysis','demurrage-analysis']){const report=await req('GET',`/v1/cargotracker/dashboard/${path}`);expect(report.statusCode,report.body).toBe(200);}
  expect((await req('POST','/v1/tracker/snapshots',result,other.token)).statusCode).toBe(400);
  expect((await req('GET','/v1/tracker/snapshots',undefined,result.proof)).statusCode).toBe(401);
  fetch.mockResolvedValue(new Response('Rate limited',{status:429}));const failed=await req('POST','/v1/tracker/track',{number:'TEST-OUTAGE'});expect(failed.statusCode,failed.body).toBe(503);expect(failed.json()).not.toHaveProperty('source');
 }finally{fetch.mockRestore();await withTenant(tenant.tenantId,trx=>trx.updateTable('tenant_settings').set({settings:JSON.stringify({'enabled-apps':{cargotracker:true,demurrage:true}})}).where('tenant_id','=',tenant.tenantId).execute());}
});
it('pages tracking and freight collections without omissions and rejects foreign cursors',async()=>{
 const seen=new Set<string>();let cursor:string|undefined;
 do{
  const response=await req('GET',`/v1/freight-booking/bookings?paged=true&limit=2${cursor?'&cursor='+cursor:''}`);expect(response.statusCode,response.body).toBe(200);const page=response.json();for(const row of page.data){expect(seen.has(row.id)).toBe(false);seen.add(row.id);}cursor=page.has_more?page.cursor:undefined;
 }while(cursor);
 expect(seen.size).toBe(6);
 const otherBooking=await req('POST','/v1/freight-booking/bookings',{customer_id:foreign,mode:'FCL_20',origin_port:'TZDAR',destination_port:'KEMBA'},other.token);expect(otherBooking.statusCode,otherBooking.body).toBe(201);
 expect((await req('GET',`/v1/freight-booking/bookings?paged=true&cursor=${otherBooking.json().id}`)).statusCode).toBe(400);
 for(const endpoint of ['snapshots','containers']) {const r=await req('GET',`/v1/tracker/${endpoint}?paged=true&limit=1`);expect(r.statusCode,r.body).toBe(200);expect(r.json().data).toHaveLength(1);}
 for(const name of ['A carrier','A carrier','B carrier'])expect((await req('POST','/v1/freight-booking/carriers',{name,mode:'OCEAN'})).statusCode).toBe(201);
 const first=await req('GET','/v1/freight-booking/carriers?paged=true&limit=1');expect(first.statusCode,first.body).toBe(200);expect(first.json().has_more).toBe(true);
 const next=await req('GET',`/v1/freight-booking/carriers?paged=true&limit=1&cursor=${first.json().cursor}`);expect(next.statusCode,next.body).toBe(200);expect(next.json().data[0].id).not.toBe(first.json().data[0].id);
});

it('enforces the operations role boundary consistently for reads and writes',async()=>{
 for(const role of ['SALES','FINANCE','CUSTOMER'] as const){const token=(await tenant.addUser(role)).token;for(const path of ['/v1/tracker/containers','/v1/freight-booking/bookings','/v1/demurrage/containers'])expect((await req('GET',path,undefined,token)).statusCode).toBe(403);}
 const junior=(await tenant.addUser('JUNIOR')).token;expect((await req('GET','/v1/tracker/containers',undefined,junior)).statusCode).toBe(200);
});
it('keeps quoted rate-card currency and rejects mismatched carrier references',async()=>{
 const carrier=await req('POST','/v1/freight-booking/carriers',{name:'EUR lane carrier',mode:'OCEAN'});const another=await req('POST','/v1/freight-booking/carriers',{name:'Other lane carrier',mode:'OCEAN'});
 const rate=await req('POST','/v1/freight-booking/rate-cards',{carrier_id:carrier.json().id,mode:'FCL_20',origin_port:'TZDAR',destination_port:'KEMBA',cost_rate:10,sell_rate:20,currency:'EUR'});expect(rate.statusCode,rate.body).toBe(201);
 const booking=await req('POST','/v1/freight-booking/bookings',{customer_id:customer,mode:'FCL_20',origin_port:'TZDAR',destination_port:'KEMBA'});expect(booking.statusCode,booking.body).toBe(201);
 const url=`/v1/freight-booking/bookings/${booking.json().id}/quote`;
 expect((await req('PATCH',url,{rate_card_id:rate.json().id,carrier_id:another.json().id,quoted_cost:10,quoted_sell:20})).statusCode).toBe(400);
 const quote=await req('PATCH',url,{rate_card_id:rate.json().id,quoted_cost:10,quoted_sell:20});expect(quote.statusCode,quote.body).toBe(200);expect(quote.json().currency).toBe('EUR');expect(quote.json().carrier_id).toBe(carrier.json().id);
});
it('marks legacy active containers without an applicable tariff as unpriced and blocks posting',async()=>{
 const t=await createTestTenant();
 try{
  await withTenant(t.tenantId,async trx=>{
   const c=await trx.insertInto('customers').values({tenant_id:t.tenantId,name:'Unpriced test customer'}).returning('id').executeTakeFirstOrThrow();
   const sh=await trx.insertInto('shipment_cases').values({tenant_id:t.tenantId,customer_id:c.id,type:'SEA_FCL',ref_number:randomUUID(),goods_desc:'Cargo',vessel:'Test vessel',origin_port:'TZDAR',dest_port:'KEMBA',containers:'[]'}).returning('id').executeTakeFirstOrThrow();
   await trx.insertInto('container_tracking').values({tenant_id:t.tenantId,shipment_id:sh.id,container_number:num,container_size:'20FT',carrier_name:'No matching tariff',discharge_date:'2020-01-01' as any,free_days:0,total_days:0,demurrage_days:0,demurrage_cost:0,demurrage_currency:'USD',status:'ACTIVE'}).execute();
  });
  const {demurrageService}=await import('../services/demurrage.service.js');const summary=await demurrageService.getSummary(t.tenantId);expect(summary.unpriced_containers).toBe(1);
  const {CostPostingService}=await import('../services/cost-posting.service.js');await expect(CostPostingService.postDemurrage(t.tenantId,t.userId)).rejects.toThrow('Unpriced active charge');
 }finally{await t.cleanup();}
});
