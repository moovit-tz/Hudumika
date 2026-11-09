import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

// businessDayCutoffHour (S04 follow-up): the local hour (0-23) at which the
// accounting day rolls over, not necessarily midnight. A 24-hour shop, bar
// or restaurant that stays open past midnight books everything before its
// own close as "last night's" business date — a sale at 1am with a cutoff
// of 4 belongs to the PREVIOUS calendar day, not a brand-new one three
// hours into a shift that hasn't ended. Default 0 means no shift at all
// (today's date, exactly today's prior behavior) — every tenant that has
// never set this gets byte-identical dates to before this existed.
export function accountingDateForTimezone(timezone: string, instant = new Date(), cutoffHour = 0): string {
 const parts = new Intl.DateTimeFormat('en-US', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(instant);
 const value = (type: string) => parts.find(part => part.type === type)!.value;
 const localHour = Number(value('hour'));
 const businessInstant = (cutoffHour > 0 && localHour < cutoffHour)
   ? new Date(instant.getTime() - 24 * 60 * 60 * 1000)
   : instant;
 const dateParts = new Intl.DateTimeFormat('en-US', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(businessInstant);
 const dateValue = (type: string) => dateParts.find(part => part.type === type)!.value;
 return `${dateValue('year')}-${dateValue('month')}-${dateValue('day')}`;
}

/** Unconfigured workspaces retain UTC and a midnight cutoff; configured ones use the existing workspace settings. */
export async function tenantAccountingDate(trx: Transaction<Database>, tenantId: string, instant = new Date()): Promise<string> {
 const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id','=',tenantId).executeTakeFirst();
 const settings = typeof row?.settings === 'string' ? JSON.parse(row.settings) : row?.settings;
 const localization = (settings as {localization?: {tz?: string; businessDayCutoffHour?: number}} | undefined)?.localization;
 const timezone = localization?.tz || 'UTC';
 const cutoffHour = Number(localization?.businessDayCutoffHour ?? 0);
 return accountingDateForTimezone(timezone, instant, Number.isFinite(cutoffHour) && cutoffHour >= 0 && cutoffHour <= 23 ? cutoffHour : 0);
}
