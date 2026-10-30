import { z } from 'zod';
import { sql, type SelectQueryBuilder, type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type { PaginatedResponse } from '@hudumika/types';
const schema=z.object({cursor:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(100).default(100),paged:z.enum(['true','false']).optional()});
export type TrackerPage=ReturnType<typeof parseTrackerPage>;
export function parseTrackerPage(query:unknown){const value=schema.parse(query);return value.paged==='true'||value.cursor?value:undefined;}
export async function trackerPage<DB,TB extends keyof DB,O extends {id:string}>(trx:Transaction<Database>,tenantId:string,query:SelectQueryBuilder<DB,TB,O>,table:'tracking_snapshots'|'tracked_containers'|'carriers'|'freight_rate_cards'|'carrier_rate_contracts'|'freight_bookings',sort:'created_at'|'updated_at'|'name',direction:'asc'|'desc',page?:TrackerPage):Promise<O[]|PaginatedResponse<O>>{
 if(page?.cursor){
  // Compare against database timestamps so sub-millisecond precision is retained.
  const anchor=await sql<{id:string}>`select id from ${sql.table(table)} where tenant_id=${tenantId} and id=${page.cursor}`.execute(trx);
  if(!anchor.rows.length)throw Object.assign(new Error('Invalid page cursor for this workspace'),{statusCode:400});
  query=query.where(sql<boolean>`(${sql.ref(`${table}.${sort}`)},${sql.ref(`${table}.id`)}) ${sql.raw(direction==='desc'?'<':'>')} (select ${sql.ref(sort)},id from ${sql.table(table)} where tenant_id=${tenantId} and id=${page.cursor})`);
 }
 const limit=page?.limit??1000;
 const rows=await query.clearOrderBy().orderBy(`${table}.${sort}` as any,direction).orderBy(`${table}.id` as any,direction).limit(limit+1).execute();
 if(!page){if(rows.length>limit)throw Object.assign(new Error('Collection exceeds 1000 records; use paged=true and a cursor'),{statusCode:400});return rows;}
 const data=rows.slice(0,limit);return {data,has_more:rows.length>limit,...(rows.length>limit?{cursor:data.at(-1)!.id}:{})};
}
