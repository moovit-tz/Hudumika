import { db } from './src/db/client.js';

async function check() {
  const msomi = await db.selectFrom('tenants').where('slug', '=', 'msomi-freight').select('id').executeTakeFirst();
  console.log("Msomi ID:", msomi?.id);
  const vehicles = await db.selectFrom('vehicles').where('tenant_id', '=', msomi?.id as any).selectAll().execute();
  console.log("Vehicles for Msomi:", vehicles.length);
  process.exit(0);
}
check().catch(console.error);
