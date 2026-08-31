import pg from 'pg';
const client = new pg.Client({ connectionString: 'postgresql://postgres@localhost:5433/clearos' });
await client.connect();

const NEW_TENANT = '15b7d313-5ab9-47d1-b9b3-eaa90cd90bdf'; // hudumika.tz (destination)

const tables = [
  'chart_of_accounts', 'tax_codes', 'payroll_component_types', 'payroll_contribution_schemes',
  'payroll_tax_bands', 'hr_leave_types', 'hr_holidays', 'tenant_settings', 'tenant_usage_counters',
  'trade_wizard_usage_counters', 'api_usage_events',
];

for (const t of tables) {
  const res = await client.query(`SELECT COUNT(*) AS n FROM "${t}" WHERE tenant_id = $1`, [NEW_TENANT]);
  console.log(`${t}: ${res.rows[0].n} rows already in destination tenant`);
}

// Also check for tenant-scoped unique constraints on the tables we might actually migrate,
// so we know which ones could hard-fail on a collision.
const constraints = await client.query(`
  SELECT tc.table_name, string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS cols
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
    AND tc.table_name = ANY($1)
  GROUP BY tc.table_name
`, [tables]);
console.log('\nUnique constraints on these tables:');
console.log(JSON.stringify(constraints.rows, null, 2));

await client.end();
