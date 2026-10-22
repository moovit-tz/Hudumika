import { db } from '../db/client.js';

async function main() {
  const id = '677b2744-ed99-46a4-b409-f08ffe8ceede';
  const res = await (db as any).selectFrom('vehicles').selectAll().where('id', '=', id).execute();
  console.log('Target vehicle found:', res);
  if (!res.length) {
    const list = await (db as any).selectFrom('vehicles').select(['id', 'name', 'plate_number', 'tenant_id']).limit(5).execute();
    console.log('Sample vehicles:', list);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
