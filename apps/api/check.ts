import { db } from './src/db/client.js';

async function check() {
  const tenants = await db.selectFrom('tenants').selectAll().execute();
  console.log("TENANTS:", tenants.map(t => ({ id: t.id, slug: t.slug })));
  
  const vehicles = await db.selectFrom('vehicles').selectAll().execute();
  console.log("VEHICLES:", vehicles.length);
  if (vehicles.length > 0) {
     console.log("Sample vehicle tenant_id:", vehicles[0].tenant_id);
  }
  
  const positions = await db.selectFrom('vehicle_positions').selectAll().execute();
  console.log("POSITIONS:", positions.length);

  process.exit(0);
}
check().catch(console.error);
