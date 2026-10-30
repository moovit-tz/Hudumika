import {db,dbPlatform} from '../apps/api/src/db/client.js';
import {validateContainerNumber} from '../packages/types/src/seal.js';
import {sql} from 'kysely';
import {writeFile} from 'node:fs/promises';
try{
 const containers=await dbPlatform.selectFrom('tracked_containers').select(['container_number']).execute();
 const snapshots=await dbPlatform.selectFrom('tracking_snapshots').select(['source','share_expires_at','share_revoked']).execute();
 const links=await sql<{count:string}>`select count(*)::text as count from tracked_containers t join customers c on c.id=t.customer_id where t.tenant_id<>c.tenant_id`.execute(dbPlatform);
 const bookings=await sql<{count:string}>`select count(*)::text as count from freight_bookings b join customers c on c.id=b.customer_id where b.tenant_id<>c.tenant_id`.execute(dbPlatform);
 const report={review_date:'2026-10-26',scope:'Aggregate platform counts only; no tenant identities or business identifiers exported',containers:containers.length,invalid_container_numbers:containers.filter(r=>!validateContainerNumber(r.container_number).valid).length,snapshots:snapshots.length,unverified_snapshots:snapshots.filter(r=>r.source==='unknown'||r.source==='mock').length,legacy_shares_requiring_recreation:snapshots.filter(r=>!r.share_expires_at||r.share_revoked).length,foreign_customer_links_in_containers:Number(links.rows[0].count),foreign_customer_links_in_bookings:Number(bookings.rows[0].count),data_mutated:false};
 await writeFile('D:/Apps/Hudumika/docs/cargotracker/SAFETRACKER_LEGACY_DATA_AUDIT_2026-10-26.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await Promise.all([db.destroy(),dbPlatform.destroy()]);}
