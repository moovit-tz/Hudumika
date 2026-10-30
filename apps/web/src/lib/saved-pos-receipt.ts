import { normalizePosReceiptProfile, type PosReceiptProfile } from '@hudumika/types';
import { apiFetch } from './api.js';
import { legacyReceiptProfile, loadPosPrintSettings, posPrintKey, receiptCompanyFromSettings } from './pos-print.js';

/** Read on every receipt opening/print so another till's saved edit is not hidden by a cache. */
export async function loadSavedPosReceipt(tenantId:string, userId:string, signal?:AbortSignal) {
  const device = loadPosPrintSettings(posPrintKey(tenantId,userId));
  const response = await apiFetch<{settings:{posReceipt?:PosReceiptProfile;company?:unknown};tenant?:{id:string;name:string}}>('/v1/settings',{signal});
  if(response.tenant?.id!==tenantId)throw new Error('Workspace changed. Reopen the receipt before printing.');
  return {
    device,
    company:receiptCompanyFromSettings(response.settings.company,response.tenant?.name||'Business'),
    profile:normalizePosReceiptProfile(response.settings.posReceipt||legacyReceiptProfile(device)),
  };
}
export type SavedPosReceipt = Awaited<ReturnType<typeof loadSavedPosReceipt>>;
