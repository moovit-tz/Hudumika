import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

export function accountingDateForTimezone(timezone: string, instant = new Date()): string {
 const parts = new Intl.DateTimeFormat('en-US', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
 const value = (type: string) => parts.find(part => part.type === type)!.value;
 return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Unconfigured workspaces retain UTC; configured ones use the existing workspace setting. */
export async function tenantAccountingDate(trx: Transaction<Database>, tenantId: string, instant = new Date()): Promise<string> {
 const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id','=',tenantId).executeTakeFirst();
 const settings = typeof row?.settings === 'string' ? JSON.parse(row.settings) : row?.settings;
 const timezone = (settings as {localization?: {tz?: string}} | undefined)?.localization?.tz || 'UTC';
 return accountingDateForTimezone(timezone, instant);
}
