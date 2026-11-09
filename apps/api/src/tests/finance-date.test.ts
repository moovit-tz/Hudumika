import { it, expect } from 'vitest';
import { accountingDateForTimezone, tenantAccountingDate } from '../services/finance-date.service.js';
import { createTestTenant } from './helpers.js';
import { withTenant } from '../db/client.js';

it('accounting dates follow workspace midnight and DST rather than host or UTC date', () => {
 const instant=new Date('2026-10-08T21:30:00Z');
 expect(accountingDateForTimezone('Africa/Dar_es_Salaam',instant)).toBe('2026-10-09');
 expect(accountingDateForTimezone('UTC',instant)).toBe('2026-10-08');
 expect(accountingDateForTimezone('America/New_York',new Date('2026-03-08T04:30:00Z'))).toBe('2026-03-07');
 expect(()=>accountingDateForTimezone('Invalid/Zone',instant)).toThrow();
});
it('business-day cutoff shifts a late-night instant back to the PREVIOUS calendar day; default (0) changes nothing', () => {
 // 01:30 local in Dar es Salaam (EAT, UTC+3) on Oct 9 — before a 4am cutoff,
 // so it belongs to Oct 8's business day, not Oct 9's.
 const instant = new Date('2026-10-08T22:30:00Z');
 expect(accountingDateForTimezone('Africa/Dar_es_Salaam', instant)).toBe('2026-10-09'); // no cutoff: today's date, unchanged
 expect(accountingDateForTimezone('Africa/Dar_es_Salaam', instant, 4)).toBe('2026-10-08'); // 4am cutoff: still "last night"
 // 05:30 local — now past the 4am cutoff, so it rolls over to the new day.
 const laterInstant = new Date('2026-10-09T02:30:00Z');
 expect(accountingDateForTimezone('Africa/Dar_es_Salaam', laterInstant, 4)).toBe('2026-10-09');
});
it('tenantAccountingDate honors a configured business-day cutoff hour',async()=>{
 const t=await createTestTenant('FINANCE');
 const instant=new Date('2026-10-08T22:30:00Z'); // 01:30 EAT on Oct 9
 try{
  await withTenant(t.tenantId,trx=>trx.insertInto('tenant_settings').values({tenant_id:t.tenantId,settings:JSON.stringify({localization:{tz:'Africa/Dar_es_Salaam',businessDayCutoffHour:4}})}).execute());
  expect(await withTenant(t.tenantId,trx=>tenantAccountingDate(trx,t.tenantId,instant))).toBe('2026-10-08');
 }finally{await t.cleanup();}
},120000);
it('accounting date reads only the owning workspace settings and retains UTC when unset',async()=>{
 const first=await createTestTenant('FINANCE'); const other=await createTestTenant('FINANCE');
 const instant=new Date('2026-10-08T21:30:00Z');
 try{
  await withTenant(first.tenantId,trx=>trx.insertInto('tenant_settings').values({tenant_id:first.tenantId,settings:JSON.stringify({localization:{tz:'Africa/Dar_es_Salaam'}})}).execute());
  expect(await withTenant(first.tenantId,trx=>tenantAccountingDate(trx,first.tenantId,instant))).toBe('2026-10-09');
  expect(await withTenant(other.tenantId,trx=>tenantAccountingDate(trx,other.tenantId,instant))).toBe('2026-10-08');
 }finally{await first.cleanup();await other.cleanup();}
},120000);
