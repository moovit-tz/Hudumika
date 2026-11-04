import { validateContainerNumber } from '@hudumika/types';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { dbPlatform, withTenant } from '../db/client.js';
import { SealService } from '../services/seal.service.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';
let a: TestTenant, b: TestTenant;
let warehouse: string, destination: string, owner: string;
beforeAll(async () => {
  a = await createTestTenant(); b = await createTestTenant();
  await dbPlatform.updateTable('tenants').set({plan:'enterprise'}).where('id','in',[a.tenantId,b.tenantId]).execute();
  await withTenant(a.tenantId, async trx => {
    owner = (await trx.insertInto('customers').values({tenant_id:a.tenantId,name:'Warehouse test owner',category:'sme',active:true,avatar_initials:'WT',avatar_color:'#0b7264'}).returning('id').executeTakeFirstOrThrow()).id;
    for (const [index,code] of ['SOURCE','DESTINATION'].entries()) {
      const row = await trx.insertInto('seal_compartments').values({tenant_id:a.tenantId,code,name:code,warehouse_type:'standard_warehouse',storage_fee_per_day:'10',storage_fee_currency:'TZS'} as any).returning('id').executeTakeFirstOrThrow();
      if(index===0) warehouse=row.id; else destination=row.id;
    }
  });
},120000);
afterAll(async()=>{
  // The immutable movement ledger deliberately prevents cascading deletion.
  // Retain its isolated fixture tenant, disabled, without weakening audit triggers.
  if(a) await dbPlatform.updateTable('tenants').set({active:false,name:'SEAL integration fixture (immutable audit)'}).where('id','=',a.tenantId).execute();
  if(a) await dbPlatform.updateTable('users').set({active:false}).where('tenant_id','=',a.tenantId).execute();
  if(b) await b.cleanup();
},120000);
async function call(method: any, url: string, payload?: any, tenant=a) {
  const app=await getApp();return app.inject({method,url:`/v1/seal${url}`,headers:authHeaders(tenant.token),...(payload?{payload}:{})});
}
async function receive(qty=10) {
  const r=await call('POST','/lots',{compartmentId:warehouse,ownerId:owner,description:`Test lot ${randomUUID()}`,customsStatus:'DOMESTIC',qty,uom:'PCS',warehousedOn:'2026-01-01'});
  expect(r.statusCode,r.body).toBe(200);return r.json();
}
it('receives real stock, scopes its overview and isolates tenants',async()=>{
  const lot=await receive();
  const view=await call('GET',`/stock-overview?compartment_id=${warehouse}`);expect(view.statusCode,view.body).toBe(200);
  const row=view.json().find((r:any)=>r.id===lot.id);expect(row.onHand).toBe(10);expect(row.available).toBe(10);expect(row.daysStored).toBeGreaterThan(0);expect(row.accrual.amount).toBeGreaterThan(0);
  expect((await call('GET','/stock-overview',undefined,b)).json()).toEqual([]);
  expect((await call('POST','/lots',{compartmentId:warehouse,ownerId:owner,description:'Foreign',customsStatus:'DOMESTIC',qty:1,uom:'PCS'},b)).statusCode).not.toBe(200);
},60000);
it('records every count line, posts variances once, and rejects stale counts',async()=>{
  const lot=await receive();const started=await call('POST','/cycle-counts',{compartmentId:warehouse});expect(started.statusCode,started.body).toBe(200);const id=started.json().id;
  const detail=(await call('GET',`/cycle-counts/${id}`)).json();expect(detail.lines.length).toBeGreaterThan(0);
  for(const line of detail.lines){const r=await call('PATCH',`/cycle-counts/${id}/lines/${line.id}`,{countedQty:line.lotId===lot.id?8:line.systemQty});expect(r.statusCode,r.body).toBe(200);}
  const post=await call('POST',`/cycle-counts/${id}/reconcile`,{});expect(post.statusCode,post.body).toBe(200);
  expect((await call('GET',`/lots/${lot.id}`)).json().qtyOnHand).toBe(8);
  expect((await call('POST',`/cycle-counts/${id}/reconcile`,{})).statusCode).toBe(200);
  expect((await call('GET',`/lots/${lot.id}/verify-chain`)).json().valid).toBe(true);
  expect((await call('GET',`/cycle-counts/${id}`,undefined,b)).statusCode).toBe(404);
  const stale=(await call('POST','/cycle-counts',{compartmentId:warehouse})).json();const lines=(await call('GET',`/cycle-counts/${stale.id}`)).json().lines;
  for(const line of lines)await call('PATCH',`/cycle-counts/${stale.id}/lines/${line.id}`,{countedQty:line.systemQty});
  await withTenant(a.tenantId,trx=>SealService.recordMovement(trx,a.tenantId,{actorId:a.userId,lotId:lot.id,movementType:'adjust',qtyDelta:1}));
  expect((await call('POST',`/cycle-counts/${stale.id}/reconcile`,{})).statusCode).toBe(409);
},60000);
it('executes a whole-lot transfer and writes a durable movement',async()=>{
  const lot=await receive();const created=await call('POST','/stock-transfers',{fromCompartmentId:warehouse,toCompartmentId:destination,lines:[{lotId:lot.id,qtyRequested:10}]});expect(created.statusCode,created.body).toBe(200);
  const id=created.json().id;expect((await call('PATCH',`/stock-transfers/${id}`,{action:'approve'})).statusCode).toBe(200);
  const moved=await call('PATCH',`/stock-transfers/${id}`,{action:'execute'});expect(moved.statusCode,moved.body).toBe(200);
  expect((await call('GET',`/lots/${lot.id}`)).json().compartmentId).toBe(destination);
  expect((await call('GET',`/lots/${lot.id}/verify-chain`)).json().valid).toBe(true);
},60000);
it('generates a real invoice once and lists its currency totals',async()=>{
  const lot=await receive();const first=await call('POST',`/lots/${lot.id}/generate-storage-invoice`,{});expect(first.statusCode,first.body).toBe(200);
  expect((await call('POST',`/lots/${lot.id}/generate-storage-invoice`,{})).statusCode).toBe(422);
  const list=await call('GET','/storage-invoices');expect(list.statusCode,list.body).toBe(200);expect(list.json().some((i:any)=>i.id===first.json().invoice.id)).toBe(true);
  expect((await call('GET','/storage-invoices',undefined,b)).json()).toEqual([]);
},60000);

it('fulfills a received lot through picking, packing and dispatch', async()=>{
  const lot=await receive(12);
  const created=await call('POST','/fulfillment-orders',{compartmentId:warehouse,customerId:owner,lines:[{lotId:lot.id,qty:4}]});
  expect(created.statusCode,created.body).toBe(200);
  const id=created.json().id;
  const order=(await call('GET',`/fulfillment-orders/${id}`)).json();
  const picked=await call('POST',`/fulfillment-orders/${id}/pick`,{lineId:order.lines[0].id,qty:4});expect(picked.statusCode,picked.body).toBe(200);
  const packed=await call('POST',`/fulfillment-orders/${id}/pack`,{});expect(packed.statusCode,packed.body).toBe(200);
  const dispatched=await call('POST',`/fulfillment-orders/${id}/dispatch`,{});expect(dispatched.statusCode,dispatched.body).toBe(200);expect(dispatched.json().status).toBe('dispatched');
  expect((await call('GET',`/lots/${lot.id}`)).json().qtyOnHand).toBe(8);
  expect((await call('GET',`/lots/${lot.id}/verify-chain`)).json().valid).toBe(true);
},60000);

it('reserves stock for an order, rejects overbooking and releases a cancelled reservation', async()=>{
  const lot=await receive(12);
  const created=await call('POST','/fulfillment-orders',{compartmentId:warehouse,customerId:owner,lines:[{lotId:lot.id,qty:9}]});expect(created.statusCode,created.body).toBe(200);
  const reserved=(await call('GET',`/stock-overview?compartment_id=${warehouse}`)).json().find((r:any)=>r.id===lot.id);expect(reserved.available).toBe(3);expect(reserved.allocated).toBe(9);
  const excess=await call('POST','/fulfillment-orders',{compartmentId:warehouse,customerId:owner,lines:[{lotId:lot.id,qty:4}]});expect(excess.statusCode).toBe(422);
  expect((await call('POST',`/fulfillment-orders/${created.json().id}/cancel`,{})).statusCode).toBe(200);
  expect((await call('GET',`/lots/${lot.id}`)).json().qtyAllocated).toBe(0);
},60000);

it('edits lot details with an actor, reason and before/after history, leaving movements unchanged',async()=>{
  const lot=await receive();const before=(await call('GET',`/lots/${lot.id}`)).json();expect(before.updatedAt).toBeTruthy();
  const result=await call('PATCH',`/lots/${lot.id}`,{expectedUpdatedAt:before.updatedAt,reason:'Corrected packing list',description:'Corrected cargo',batch:'BATCH-EDIT',volumeCbm:2.5,grossWeightKg:120,expiryDate:'2027-01-01',requiresReefer:true,reeferSetpointC:4});
  expect(result.statusCode,result.body).toBe(200);
  const after=(await call('GET',`/lots/${lot.id}`)).json();expect(after.description).toBe('Corrected cargo');expect(after.batch).toBe('BATCH-EDIT');expect(after.volumeCbm).toBe(2.5);expect(after.qtyOnHand).toBe(before.qtyOnHand);expect(after.customsStatus).toBe(before.customsStatus);
  const history=await call('GET',`/lots/${lot.id}/revisions`);expect(history.statusCode,history.body).toBe(200);expect(history.json()[0].actorId).toBe(a.userId);expect(history.json()[0].reason).toBe('Corrected packing list');expect(history.json()[0].changes.description.after).toBe('Corrected cargo');
  expect((await call('GET',`/lots/${lot.id}/verify-chain`)).json().valid).toBe(true);
  expect((await call('GET',`/lots/${lot.id}/movements`)).json()).toHaveLength(1);
  expect((await call('GET',`/lots/${lot.id}/revisions`,undefined,b)).statusCode).toBe(404);
},60000);
it('rejects stale edits, protected fields, invalid dates and foreign lot updates',async()=>{
  const lot=await receive();const before=(await call('GET',`/lots/${lot.id}`)).json();
  const payload={expectedUpdatedAt:before.updatedAt,reason:'Verified correction',description:'One correction'};
  const outcomes=await Promise.all([call('PATCH',`/lots/${lot.id}`,payload),call('PATCH',`/lots/${lot.id}`,{...payload,description:'Other correction'})]);
  expect(outcomes.map(r=>r.statusCode).sort()).toEqual([200,409]);
  const current=(await call('GET',`/lots/${lot.id}`)).json();const next={expectedUpdatedAt:current.updatedAt,reason:'Invalid correction'};
  expect((await call('PATCH',`/lots/${lot.id}`,{...next,qtyOnHand:999})).statusCode).toBe(400);
  expect((await call('PATCH',`/lots/${lot.id}`,{...next,expiryDate:'2026-02-31'})).statusCode).toBe(400);
  expect((await call('PATCH',`/lots/${lot.id}`,{...next,productId:randomUUID()})).statusCode).toBe(404);
  expect((await call('PATCH',`/lots/${lot.id}`,next,b)).statusCode).toBe(404);
  expect((await call('GET',`/lots/${lot.id}`)).json().qtyOnHand).toBe(10);
},60000);
it('processes referenced customer returns and rejects unsupported quantity changes',async()=>{
  const lot=await receive();expect((await call('POST',`/lots/${lot.id}/movements`,{movementType:'pick',qtyDelta:-3,reference:'PICK-TEST'})).statusCode).toBe(200);
  const returned=await call('POST',`/lots/${lot.id}/movements`,{movementType:'return',qtyDelta:2,reference:'RMA-TEST'});expect(returned.statusCode,returned.body).toBe(200);
  expect((await call('GET',`/lots/${lot.id}`)).json().qtyOnHand).toBe(9);
  expect((await call('POST',`/lots/${lot.id}/movements`,{movementType:'return',qtyDelta:2,reference:'RMA-EXCESS'})).statusCode).toBe(422);
  expect((await call('POST',`/lots/${lot.id}/movements`,{movementType:'transfer',qtyDelta:7})).statusCode).toBe(422);
},60000);
it('persists appointment details, filters dates and warehouses, and enforces the visit lifecycle',async()=>{
  const response=await call('POST','/appointments',{compartmentId:warehouse,appointmentType:'INBOUND',scheduledAt:'2026-11-02T09:00:00Z',vehiclePlate:'T123 TEST',driverName:'Test driver',notes:'Gate 2'});expect(response.statusCode,response.body).toBe(200);const id=response.json().id;
  const list=await call('GET',`/appointments?compartment_id=${warehouse}&from=2026-11-02T00:00:00Z&to=2026-11-03T00:00:00Z`);expect(list.statusCode,list.body).toBe(200);expect(list.json()[0].driver_name).toBe('Test driver');expect(list.json()[0].notes).toBe('Gate 2');
  expect((await call('GET',`/appointments?compartment_id=${destination}`)).json()).toEqual([]);
  expect((await call('GET','/appointments?from=2027-01-01T00:00:00Z')).json()).toEqual([]);
  expect((await call('PATCH',`/appointments/${id}`,{scheduledAt:'2026-11-02T10:00:00Z',notes:'Gate 3'})).statusCode).toBe(200);
  for(const status of ['CHECKED_IN','AT_DOCK','COMPLETED']){const update=await call('PATCH',`/appointments/${id}`,{status});expect(update.statusCode,update.body).toBe(200);}
  expect((await call('PATCH',`/appointments/${id}`,{status:'SCHEDULED'})).statusCode).toBe(409);
  expect((await call('PATCH',`/appointments/${id}`,{notes:'Foreign'},b)).statusCode).toBe(404);
},60000);
it('receives a container, gates it in, and records an atomic tally without duplicate stock',async()=>{
  const cons=await call('POST','/consignments',{compartmentId:warehouse,ownerId:owner,transportDocType:'BL',transportDocNumber:null,expectedArrival:null,goodsDescription:null});expect(cons.statusCode,cons.body).toBe(200);
  const check=validateContainerNumber('MSCU1234560');const number=`MSCU123456${check.expectedCheckDigit??0}`;
  const container=await call('POST',`/consignments/${cons.json().id}/containers`,{containerNumber:number,containerSize:'40GP'});expect(container.statusCode,container.body).toBe(200);const id=container.json().id;
  const gate=await call('POST',`/containers/${id}/gate-in`,{sealNumber:null,grossWeightKg:100,tareWeightKg:20});expect(gate.statusCode,gate.body).toBe(200);expect(Number(gate.json().net_weight_kg)).toBe(80);
  const invalid=await call('POST',`/containers/${id}/devan-tally`,{lines:[{description:'Atomic tally good line',qty:5,uom:'PCS'},{description:'Bad line',qty:-1,uom:'PCS'}]});expect(invalid.statusCode).toBe(422);
  expect((await call('GET',`/lots?q=Atomic%20tally%20good%20line`)).json()).toEqual([]);
  const tally=await call('POST',`/containers/${id}/devan-tally`,{lines:[{description:'Atomic tally good line',hsCode:null,qty:5,uom:'PCS',dutyAtRisk:null,taxAtRisk:null,discrepancy:false,discrepancyType:null}]});expect(tally.statusCode,tally.body).toBe(200);expect(tally.json().results[0].row.customs_status).toBe('DOMESTIC');
  expect((await call('POST',`/containers/${id}/devan-tally`,{lines:[{description:'Duplicate',qty:5,uom:'PCS'}]})).statusCode).toBe(409);
},60000);
it('creates warehouse tasks, yard slots, equipment maintenance and real automation runs',async()=>{
  const task=await call('POST','/tasks',{compartmentId:warehouse,title:'Check receiving bay',assignedTo:a.userId});expect(task.statusCode,task.body).toBe(200);
  expect((await call('PATCH',`/tasks/${task.json().id}`,{title:'Check receiving bay and seal',status:'complete'})).statusCode).toBe(200);
  expect((await call('POST','/tasks',{compartmentId:warehouse,title:'Foreign assignment',assignedTo:b.userId})).statusCode).toBe(404);
  const yard=await call('POST','/yard-slots',{compartmentId:warehouse,code:'TEST-YARD',capacityTeu:2});expect(yard.statusCode,yard.body).toBe(200);
  const equipment=await call('POST','/equipment',{compartmentId:warehouse,equipmentType:'forklift',assetTag:'TEST-FORKLIFT',name:'Test forklift'});expect(equipment.statusCode,equipment.body).toBe(200);
  const maintenance=await call('POST',`/equipment/${equipment.json().id}/maintenance`,{maintenanceType:'inspection',performedByUserId:a.userId,description:'Checked',cost:10,resultingStatus:'operational'});expect(maintenance.statusCode,maintenance.body).toBe(200);
  const rule=await call('POST','/automation-rules',{compartmentId:warehouse,name:'Test low stock',triggerType:'low_stock',thresholdValue:100,actionType:'create_task',actionAssignee:a.userId});expect(rule.statusCode,rule.body).toBe(200);
  const run=await call('POST','/automation-rules/evaluate',{});expect(run.statusCode,run.body).toBe(200);expect(run.json().firedCount).toBeGreaterThan(0);
},60000);

it('works the bonded customs, examination, guarantee and stock-account actions',async()=>{
  const facility=await call('POST','/compartments',{code:'BONDED',name:'Bonded test facility',warehouseType:'public_bonded'});expect(facility.statusCode,facility.body).toBe(200);const bonded=facility.json().id;
  const guarantee=await call('POST','/guarantees',{reference:'TEST-GUARANTEE',instrumentType:'bank_guarantee',issuer:null,faceValue:1000000,currency:'TZS',effectiveFrom:'2026-01-01',expiresOn:'2027-12-31'});expect(guarantee.statusCode,guarantee.body).toBe(200);
  const tariff=await dbPlatform.selectFrom('hs_codes').select('code').orderBy('level','desc').executeTakeFirstOrThrow();
  const received=await call('POST','/lots',{compartmentId:bonded,ownerId:owner,description:'Bonded customs test',customsStatus:'FOREIGN_DUTY_SUSPENDED',qty:10,uom:'PCS'});expect(received.statusCode,received.body).toBe(200);const lot=received.json();
  const created=await call('POST','/customs-entries',{lotId:lot.id,procedureCode:'EX_WAREHOUSE_HOME_USE',declarationDate:new Date().toISOString().slice(0,10),hsCode:tariff.code,countryOfOrigin:null,invoiceValue:100,currency:'USD',fxRate:2500,freight:0,insurance:0});expect(created.statusCode,created.body).toBe(200);const entry=created.json();
  const submit=await call('POST',`/customs-entries/${entry.id}/submit`,{submissionReference:'TEST-MANUAL-ENTRY',selectivityChannel:'RED'});expect(submit.statusCode,submit.body).toBe(200);
  expect((await call('POST',`/customs-entries/${entry.id}/advance`,{to:'ASSESSED',reference:null})).statusCode).toBe(422);
  const exams=await call('GET','/examinations');expect(exams.statusCode,exams.body).toBe(200);const exam=exams.json().find((e:any)=>e.customsEntryId===entry.id);expect(exam).toBeTruthy();
  const complete=await call('PATCH',`/examinations/${exam.id}`,{status:'COMPLETED',outcome:'CLEARED',officerName:'Test officer',findings:'Fixture inspection complete'});expect(complete.statusCode,complete.body).toBe(200);
  for(const to of ['ASSESSED','PAID']){const result=await call('POST',`/customs-entries/${entry.id}/advance`,{to,reference:'TEST-REFERENCE'});expect(result.statusCode,result.body).toBe(200);}
  const released=await call('POST',`/customs-entries/${entry.id}/release`,{});expect(released.statusCode,released.body).toBe(200);expect((await call('GET',`/lots/${lot.id}`)).json().customsStatus).toBe('FOREIGN_DUTY_PAID');
  const today=new Date().toISOString().slice(0,10);const period=await call('POST','/stock-account/periods',{compartmentId:bonded,periodStart:today.slice(0,4)+'-01-01',periodEnd:today});expect(period.statusCode,period.body).toBe(200);
  const filed=await call('POST',`/stock-account/periods/${period.json().id}/submit`,{submissionReference:'TEST-MANUAL-STOCK-ACCOUNT'});expect(filed.statusCode,filed.body).toBe(200);expect(filed.json().status).toBe('SUBMITTED');
},60000);

it('corrects missing lot volume so CBM storage can be billed',async()=>{
  const updated=await call('PATCH',`/compartments/${warehouse}`,{billingMethod:'per_cbm',storageFeePerCbmPerDay:10});expect(updated.statusCode,updated.body).toBe(200);
  const lot=await receive();expect((await call('GET',`/lots/${lot.id}/storage-accrual`)).statusCode).toBe(422);
  const before=(await call('GET',`/lots/${lot.id}`)).json();
  const correction=await call('PATCH',`/lots/${lot.id}`,{expectedUpdatedAt:before.updatedAt,reason:'Measured cargo volume',volumeCbm:2.5});expect(correction.statusCode,correction.body).toBe(200);
  const accrual=await call('GET',`/lots/${lot.id}/storage-accrual`);expect(accrual.statusCode,accrual.body).toBe(200);expect(accrual.json().storageFeePerDay).toBe(25);
},60000);

it('uploads, downloads, verifies and removes a lot document while protecting its parent record',async()=>{
  const lot=await receive();const boundary='seal-test-boundary';
  const content='Verified lot document';
  const payload=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="entityType"\r\n\r\nlot\r\n--${boundary}\r\nContent-Disposition: form-data; name="entityId"\r\n\r\n${lot.id}\r\n--${boundary}\r\nContent-Disposition: form-data; name="docType"\r\n\r\nother\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test-lot.txt"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--\r\n`);
  const app=await getApp();const uploaded=await app.inject({method:'POST',url:'/v1/seal/documents/upload',headers:{...authHeaders(a.token),'content-type':`multipart/form-data; boundary=${boundary}`},payload});expect(uploaded.statusCode,uploaded.body).toBe(200);const id=uploaded.json().id;
  const downloaded=await call('GET',`/documents/${id}/download`);expect(downloaded.statusCode,downloaded.body).toBe(200);expect(downloaded.body).toBe(content);
  expect((await call('PATCH',`/documents/${id}`,{status:'VERIFIED'})).statusCode).toBe(200);
  expect((await call('GET',`/documents?entity_type=lot&entity_id=${lot.id}`,undefined,b)).statusCode).toBe(404);
  const removed=await call('DELETE',`/documents/${id}`);expect([200,204]).toContain(removed.statusCode);
},60000);
