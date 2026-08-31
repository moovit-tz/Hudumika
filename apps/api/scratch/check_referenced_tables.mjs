import pg from 'pg';
const client = new pg.Client({ connectionString: 'postgresql://postgres@localhost:5433/clearos' });
await client.connect();

const OLD_TENANT = '04a3d70c-f641-4196-80c3-c58c70b98c44';

const refTables = ['customers', 'comply_license_catalog', 'comply_legal_firms', 'hr_shifts', 'trade_procedures', 'tax_codes'];
for (const t of refTables) {
  const hasTenantCol = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='tenant_id'`, [t]
  );
  console.log(`${t}: tenant-scoped = ${hasTenantCol.rows.length > 0}`);
}

console.log('\n--- Checking actual referenced ids from clearos.io rows ---');

const checks = [
  { table: 'comply_applications', col: 'customer_id' },
  { table: 'comply_applications', col: 'license_catalog_id' },
  { table: 'comply_certificates', col: 'customer_id' },
  { table: 'comply_obligations', col: 'customer_id' },
  { table: 'comply_legal_engagements', col: 'customer_id' },
  { table: 'comply_legal_engagements', col: 'firm_id' },
  { table: 'products', col: 'tax_code_id' },
  { table: 'hr_attendance', col: 'shift_id' },
];

for (const { table, col } of checks) {
  const res = await client.query(`SELECT id, "${col}" FROM "${table}" WHERE tenant_id = $1 AND "${col}" IS NOT NULL`, [OLD_TENANT]);
  console.log(`${table}.${col}:`, JSON.stringify(res.rows));
}

await client.end();
