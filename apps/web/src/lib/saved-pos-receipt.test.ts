import {afterEach,describe,expect,it,vi} from 'vitest';
import {receiptTemplateProfile,type PosSale} from '@hudumika/types';
vi.mock('./api.js',()=>({apiFetch:vi.fn()}));
import {apiFetch} from './api.js';
import {loadSavedPosReceipt} from './saved-pos-receipt.js';
import {buildPosReceiptHtml} from './pos-print.js';
afterEach(()=>{vi.unstubAllGlobals();vi.resetAllMocks();});
describe('saved receipt design adoption',()=>{
 it('re-fetches saved customization for historical and new receipts instead of caching a template',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({paper:'58mm',footer:'Old device footer'})});
  const saved={...receiptTemplateProfile('grocery'),heading:'MY SHOP RECEIPT',footerTitle:'COME AGAIN',footer:'Saved tenant policy',code:'qr' as const,visibility:{...receiptTemplateProfile('grocery').visibility,customer:false}};
  vi.mocked(apiFetch).mockResolvedValue({settings:{posReceipt:saved,company:{name:'Current tenant'}},tenant:{id:'tenant',name:'Tenant'}});
  const old:PosSale={id:'old-sale',shift_id:'shift',customer_id:null,amount_paid:12,notes:null,sale_number:'OLD-001',sold_at:'2025-01-01T10:00:00Z',currency:'TZS',status:'COMPLETED',grand_total:12,subtotal:12,tax_total:0,discount_total:0,change_due:0,customer_name:'Hidden name',lines:[]};
  const first=await loadSavedPosReceipt('tenant','user');const html=buildPosReceiptHtml(old,first.device,first.company,first.profile);
  expect(html).toContain('MY SHOP RECEIPT');expect(html).toContain('Saved tenant policy');expect(html).toContain('COME AGAIN');expect(html).toContain('<svg');expect(html).toContain('OLD-001');expect(html).not.toContain('Old device footer');expect(html).not.toContain('Hidden name');
  vi.mocked(apiFetch).mockResolvedValue({settings:{posReceipt:{...saved,footer:'Updated tenant policy'}},tenant:{id:'tenant',name:'Tenant'}});
  const second=await loadSavedPosReceipt('tenant','user');expect(buildPosReceiptHtml({...old,sale_number:'NEW-002'},second.device,second.company,second.profile)).toContain('Updated tenant policy');expect(apiFetch).toHaveBeenCalledTimes(2);
 });
 it('does not silently fall back to a generic design when saved settings cannot be fetched',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null});vi.mocked(apiFetch).mockRejectedValue(new Error('Offline'));
  await expect(loadSavedPosReceipt('tenant','user')).rejects.toThrow('Offline');
 });
});
