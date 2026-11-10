import { chromium } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { authHeaders, createTestTenant, getApp, grantStandaloneProduct, type TestTenant } from './helpers.js';
import { dbPlatform } from '../db/client.js';
let tenant: TestTenant;
beforeAll(async()=>{tenant=await createTestTenant();await dbPlatform.updateTable('tenants').set({plan:'enterprise'}).where('id','=',tenant.tenantId).execute();await grantStandaloneProduct(tenant.tenantId,'clearos');},240000);
afterAll(async()=>tenant?.cleanup(),120000);
it('renders ClearOS pages through real authenticated API handlers on desktop and mobile',async()=>{
 const app=await getApp(),browser=await chromium.launch({headless:true});const page=await browser.newPage();const results:any[]=[];const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 try {
  await page.addInitScript(({token,user})=>{localStorage.setItem('hudumika_token',token);localStorage.setItem('hudumika_user',JSON.stringify(user));},{token:tenant.token,user:{id:tenant.userId,tenant_id:tenant.tenantId,role:'TENANT_ADMIN',name:'ClearOS audit',email:'audit@example.invalid'}});
  await page.route('**/v1/**',async route=>{
   const req=route.request(),url=new URL(req.url());const response=await app.inject({method:req.method() as any,url:url.pathname+url.search,headers:{...authHeaders(tenant.token),...(req.postData()?{'content-type':'application/json'}:{})},...(req.postData()?{payload:req.postData()!}:{})});
   await route.fulfill({status:response.statusCode,headers:{'content-type':String(response.headers['content-type']||'application/json')},body:response.rawPayload});
  });
  // Do not contact third-party providers; only local Vite assets and injected API handlers.
  await page.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/]).*/,route=>route.abort());
  let loaded=false;
  for(const width of [1440,390])for(const path of ['/clearos/ops','/clearos/duty-check','/clearos/customs-tools/history','/clearos/compliance/screening','/clearos/rate-card']) {
   await page.setViewportSize({width,height:1000});if(!loaded){await page.goto('http://localhost:5173'+path);loaded=true;}else{await page.evaluate(path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));},path);}await page.waitForTimeout(900);
   await page.locator('h1').first().waitFor({state:'visible',timeout:60000});
   const heading=await page.locator('h1').first().textContent();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   results.push({path,width,heading,documentOverflow:overflow});
   await page.screenshot({path:resolve(process.cwd(),`../../audit/evidence/browser-${path.split('/').pop()}-${width}.png`)});
   expect(heading,`${path} heading`).toBeTruthy();
  }
  expect(errors).toEqual([]);
 } finally {writeFileSync(resolve(process.cwd(),'../../audit/evidence/browser-results.json'),JSON.stringify({results,errors,limitations:'Real API handlers via Fastify inject; synthetic empty tenant, no external providers, no persisted browser CRUD verification.'},null,2));await browser.close();}
},240000);


