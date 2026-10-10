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
it('accounting date reads only the owning workspace settings and retains UTC when unset',async()=>{
 const first=await createTestTenant('FINANCE'); const other=await createTestTenant('FINANCE');
 const instant=new Date('2026-10-08T21:30:00Z');
 try{
  await withTenant(first.tenantId,trx=>trx.insertInto('tenant_settings').values({tenant_id:first.tenantId,settings:JSON.stringify({localization:{tz:'Africa/Dar_es_Salaam'}})}).execute());
  expect(await withTenant(first.tenantId,trx=>tenantAccountingDate(trx,first.tenantId,instant))).toBe('2026-10-09');
  expect(await withTenant(other.tenantId,trx=>tenantAccountingDate(trx,other.tenantId,instant))).toBe('2026-10-08');
 }finally{await first.cleanup();await other.cleanup();}
},120000);
