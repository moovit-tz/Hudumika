/// <reference lib="dom" />
// The page.evaluate() callbacks below run in the browser, not in Node.
import { chromium } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { authHeaders, createTestTenant, getApp, grantStandaloneProduct, type TestTenant } from './helpers.js';
import { dbPlatform, withTenant } from '../db/client.js';
let tenant: TestTenant;
let shipmentId: string;
let customerId: string;
beforeAll(async()=>{
 tenant=await createTestTenant();
 await dbPlatform.updateTable('tenants').set({plan:'enterprise'}).where('id','=',tenant.tenantId).execute();
 await grantStandaloneProduct(tenant.tenantId,'clearos');
 shipmentId=await withTenant(tenant.tenantId,async trx=>{
  const customer=await trx.insertInto('customers').values({tenant_id:tenant.tenantId,name:'ClearOS browser audit'}).returning('id').executeTakeFirstOrThrow();
  customerId=customer.id;
  const shipment=await trx.insertInto('shipment_cases').values({tenant_id:tenant.tenantId,customer_id:customer.id,ref_number:`CLEAROS-AUDIT-${Date.now()}`,type:'SEA_FCL',goods_desc:'Synthetic route audit cargo',containers:'[]',vessel:'Audit vessel',origin_port:'Dar es Salaam',dest_port:'Dodoma',assigned_to:tenant.userId}).returning('id').executeTakeFirstOrThrow();
  return shipment.id;
 });
},240000);
afterAll(async()=>tenant?.cleanup(),120000);
it('keeps lazy per-user drives and transit defaults safe under concurrent reads',async()=>{
 const app=await getApp();
 const [driveReads,routeReads]=await Promise.all([
  Promise.all(Array.from({length:4},()=>app.inject({method:'GET',url:'/v1/drives',headers:authHeaders(tenant.token)}))),
  Promise.all(Array.from({length:4},()=>app.inject({method:'GET',url:'/v1/customs/transit-routes',headers:authHeaders(tenant.token)}))),
 ]);
 const workItems = await app.inject({method:'GET',url:'/v1/hr/time/work-items',headers:authHeaders(tenant.token)});
 const staff = await app.inject({method:'GET',url:'/v1/hr/staff',headers:authHeaders(tenant.token)});
 expect(driveReads.map(response=>response.statusCode)).toEqual([200,200,200,200]);
 expect(routeReads.map(response=>response.statusCode)).toEqual([200,200,200,200]);
 expect(workItems.statusCode).toBe(200);
 expect(staff.statusCode).toBe(200);
 expect(JSON.parse(staff.body).some((row: { id: string }) => row.id === tenant.userId)).toBe(true);
 expect(JSON.parse(workItems.body).apps).not.toContain('gereji');
 expect(new Set(driveReads.map(response=>response.body)).size).toBe(1);
 expect(new Set(routeReads.map(response=>response.body).map(body=>JSON.parse(body).data.length)).size).toBe(1);
},60000);

it('returns picker data and creates a shipment through the authenticated tenant API',async()=>{
 const app=await getApp();
 const [customers,workflows]=await Promise.all([
  app.inject({method:'GET',url:'/v1/customers',headers:authHeaders(tenant.token)}),
  app.inject({method:'GET',url:'/v1/workflows',headers:authHeaders(tenant.token)}),
 ]);
 expect(customers.statusCode).toBe(200);
 expect(Array.isArray(JSON.parse(customers.body).data)).toBe(true);
 expect(workflows.statusCode).toBe(200);
 expect(Array.isArray(JSON.parse(workflows.body).data)).toBe(true);
 const response=await app.inject({
  method:'POST',url:'/v1/shipments',headers:authHeaders(tenant.token),
  payload:{customer_id:customerId,type:'SEA_FCL',goods_desc:'ClearOS API workflow audit cargo',vessel:'Audit vessel',origin_port:'Dar es Salaam',dest_port:'Dodoma'},
 });
 expect(response.statusCode).toBe(201);
 expect(JSON.parse(response.body).customer_id).toBe(customerId);
},60000);

it('renders ClearOS pages through real authenticated API handlers on desktop and mobile',async()=>{
 const app=await getApp(),browser=await chromium.launch({headless:true});const page=await browser.newPage();const results:any[]=[];const errors:string[]=[];const apiFailures:any[]=[];page.on('pageerror',error=>errors.push(error.message));
 try {
  await page.addInitScript(({token,user})=>{(globalThis as any).localStorage.setItem('hudumika_token',token);(globalThis as any).localStorage.setItem('hudumika_user',JSON.stringify(user));},{token:tenant.token,user:{id:tenant.userId,tenant_id:tenant.tenantId,role:'TENANT_ADMIN',name:'ClearOS audit',email:'audit@example.invalid'}});
  const getResponses=new Map<string,Promise<any>>();
  await page.route('**/v1/**',async route=>{
   const req=route.request(),url=new URL(req.url());
   const input={method:req.method() as any,url:url.pathname+url.search,headers:{...authHeaders(tenant.token),...(req.postData()?{'content-type':'application/json'}:{})},...(req.postData()?{payload:req.postData()!}:{})};
   const cacheKey=`${req.method()} ${url.pathname}${url.search}`;
   let responsePromise=getResponses.get(cacheKey);
   if(!responsePromise){responsePromise=app.inject(input);if(req.method()==='GET')getResponses.set(cacheKey,responsePromise);}
   const response=await responsePromise;
   if(response.statusCode >= 500 || (url.pathname === '/v1/hr/staff' && response.statusCode >= 400))apiFailures.push({method:req.method(),path:url.pathname+url.search,status:response.statusCode,body:response.body});
   await route.fulfill({status:response.statusCode,headers:{'content-type':String(response.headers['content-type']||'application/json')},body:response.rawPayload});
  });
  // Do not contact third-party providers; only local Vite assets and injected API handlers.
  await page.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/]).*/,route=>route.abort());
  const paths = [
   '/clearos', '/clearos/ops', '/clearos/ops/new', '/clearos/duty-check',
   `/clearos/clearance/${shipmentId}`, `/clearos/clearance/${shipmentId}/edit`,
   '/clearos/customs-tools', '/clearos/customs-tools/lcl', '/clearos/customs-tools/air',
   '/clearos/customs-tools/transit', '/clearos/customs-tools/history',
   '/clearos/compliance', '/clearos/compliance/quick', '/clearos/compliance/advanced',
   '/clearos/compliance/screening', '/clearos/compliance/origin', '/clearos/penalty',
   '/clearos/carbon', '/clearos/reference', '/clearos/rate-card', '/clearos/products',
   '/clearos/report-issue',
  ];
  const mobilePaths = new Set(['/clearos','/clearos/ops',`/clearos/clearance/${shipmentId}`,'/clearos/customs-tools','/clearos/compliance','/clearos/products']);
  let initialDocumentLoaded = false;
  for(const width of [1440,390])for(const path of paths.filter(path => width === 1440 || mobilePaths.has(path))) {
   await page.setViewportSize({width,height:1000});
   if (!initialDocumentLoaded) {
    await page.goto('http://localhost:5173'+path,{waitUntil:'domcontentloaded'});
    initialDocumentLoaded = true;
   } else if (new URL(page.url()).pathname !== path) {
    // BrowserRouter responds to popstate; a bare pushState changes the URL
    // without actually asking React Router to render the selected route.
    await page.evaluate((nextPath) => {
     history.pushState(null, '', nextPath);
     window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    }, path);
    // Let BrowserRouter commit the route before reading the previous screen's
    // still-mounted content. ClearOS routes are eagerly imported in App.tsx.
    await page.waitForTimeout(500);
   }
   await page.waitForFunction(() => document.body.innerText.trim().length > 20, undefined, { timeout: 20000 });
   const heading=await page.locator('h1').first().textContent().catch(()=>null);
   const visibleContent=await page.locator('body').innerText();
   const currentPath=new URL(page.url()).pathname;
   const overflow=await page.evaluate(()=>{const w=globalThis as any;return w.document.documentElement.scrollWidth>w.innerWidth+1;});
   results.push({path,currentPath,width,heading,documentOverflow:overflow});
   expect(currentPath,`${path} URL`).toBe(path);
   if(path === '/clearos') {
    const pipelineCards = page.locator('.clearos-pipeline-card');
    expect(await pipelineCards.count()).toBe(4);
    expect(await pipelineCards.first().isEnabled()).toBe(true);
   }
   expect(visibleContent.trim().length,`${path} rendered content`).toBeGreaterThan(20);
  }
  expect(errors).toEqual([]);
  expect(apiFailures, 'ClearOS screen API responses').toEqual([]);
 } finally {writeFileSync(resolve(process.cwd(),'../../audit/evidence/browser-results.json'),JSON.stringify({results,errors,apiFailures,limitations:'Real API handlers via Fastify inject; synthetic tenant fixtures; no external government or third-party providers.'},null,2));await browser.close();}
},240000);

