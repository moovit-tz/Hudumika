import pg from 'pg';
const client = new pg.Client({ connectionString: 'postgresql://postgres@localhost:5433/clearos' });
await client.connect();

const OLD_USER = 'b40295c7-9404-4bf8-949e-b4a7230029b5'; // superadmin@clearos.io
const OLD_TENANT = '04a3d70c-f641-4196-80c3-c58c70b98c44';
const NEW_USER = 'f7c30a8f-b30f-47a1-9fe7-3b0340eb34d7'; // viden@hudumika.tz
const NEW_TENANT = '15b7d313-5ab9-47d1-b9b3-eaa90cd90bdf';

// All uuid columns in the public schema — broad sweep, not just FK-declared ones.
const cols = await client.query(`
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND data_type = 'uuid'
  ORDER BY table_name, column_name
`);

console.log(`Scanning ${cols.rows.length} uuid columns for references to ${OLD_USER}...\n`);

const hits = [];
for (const { table_name, column_name } of cols.rows) {
  try {
    const res = await client.query(
      `SELECT COUNT(*) AS n FROM "${table_name}" WHERE "${column_name}" = $1`,
      [OLD_USER]
    );
    const n = parseInt(res.rows[0].n, 10);
    if (n > 0) hits.push({ table: table_name, column: column_name, count: n });
  } catch (e) {
    // column might not be queryable (view, etc.) — skip
  }
}

console.log('=== Columns referencing the old user id ===');
console.log(JSON.stringify(hits, null, 2));

// Also: how much data total sits in the OLD tenant (clearos.io)?
const tenantCols = await client.query(`
  SELECT table_name FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = 'tenant_id'
  ORDER BY table_name
`);
console.log(`\nScanning ${tenantCols.rows.length} tenant-scoped tables for rows under tenant ${OLD_TENANT}...\n`);
const tenantHits = [];
for (const { table_name } of tenantCols.rows) {
  try {
    const res = await client.query(`SELECT COUNT(*) AS n FROM "${table_name}" WHERE tenant_id = $1`, [OLD_TENANT]);
    const n = parseInt(res.rows[0].n, 10);
    if (n > 0) tenantHits.push({ table: table_name, count: n });
  } catch (e) {}
}
console.log('=== Rows under the clearos.io tenant (any owner) ===');
console.log(JSON.stringify(tenantHits, null, 2));

await client.end();
