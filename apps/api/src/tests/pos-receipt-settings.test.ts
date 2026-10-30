import {it,expect} from 'vitest';
import {DEFAULT_POS_RECEIPT,receiptTemplateProfile} from '@hudumika/types';
import {getApp,createTestTenant,authHeaders} from './helpers.js';
it('persists valid tenant receipt profiles, rejects malformed settings and prevents cross-tenant or manager changes',async()=>{
 const owner=await createTestTenant();const other=await createTestTenant();
 try{const app=await getApp();const headers=authHeaders(owner.token);const profile={...receiptTemplateProfile('wholesale'),header:'Trade desk',heading:'TRADE SALE RECEIPT',footerTitle:'THANK YOU FOR SHOPPING',code:'qr' as const,typography:'mono' as const,footer:'Please retain your receipt.'};
  const saved=await app.inject({method:'PATCH',url:'/v1/settings',headers,payload:{posReceipt:profile}});expect(saved.statusCode,saved.body).toBe(200);
  const read=await app.inject({method:'GET',url:'/v1/settings',headers});expect(read.statusCode).toBe(200);expect(read.json().settings.posReceipt).toEqual(profile);
  const isolated=await app.inject({method:'GET',url:'/v1/settings',headers:authHeaders(other.token)});expect(isolated.json().settings.posReceipt).toBeUndefined();
  for(const bad of [{...profile,heading:'x'.repeat(81)},{...profile,code:'fake-barcode'},{...profile,typography:'script'},{...profile,template:'unknown'},{...profile,header:'x'.repeat(501)},{...profile,visibility:{...profile.visibility,tax:'false'}},{...profile,visibility:{...profile.visibility,hiddenScript:true}}])expect((await app.inject({method:'PATCH',url:'/v1/settings',headers,payload:{posReceipt:bad}})).statusCode).toBe(400);
  const manager=await owner.addUser('MANAGER');expect((await app.inject({method:'PATCH',url:'/v1/settings',headers:authHeaders(manager.token),payload:{posReceipt:DEFAULT_POS_RECEIPT}})).statusCode).toBe(403);
  expect((await app.inject({method:'GET',url:'/v1/settings',headers})).json().settings.posReceipt).toEqual(profile);
 }finally{await owner.cleanup();await other.cleanup();}
},120000);
