import pg from 'pg';
const client = new pg.Client({ connectionString: 'postgresql://postgres@localhost:5433/clearos' });
await client.connect();

const OLD_TENANT = '04a3d70c-f641-4196-80c3-c58c70b98c44';
const NEW_TENANT = '15b7d313-5ab9-47d1-b9b3-eaa90cd90bdf';

const MIGRATE_TABLES = [
  'chat_channels', 'chat_channel_members', 'cloud_drives', 'cloud_files', 'cloud_storage_connections',
  'compliance_check_log', 'comply_applications', 'comply_certificates', 'comply_legal_engagements',
  'comply_obligations', 'comply_profiles', 'comply_reminders', 'complyos_marketplace_requests',
  'customs_penalties', 'drivers', 'email_messages', 'hr_attendance', 'hr_clock_sessions',
  'hr_time_entries', 'hr_tasks', 'landed_cost_records', 'notes', 'products', 'task_lists',
  'tax_registrations', 'trade_wizard_runs', 'trade_wizard_searches', 'user_app_settings',
  'vehicle_vendors', 'vehicles', 'workflow_steps', 'workflow_studio_apps', 'workflows',
];

const constraints = await client.query(`
  SELECT tc.table_name, string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS cols
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
    AND tc.table_name = ANY($1)
  GROUP BY tc.table_name
`, [MIGRATE_TABLES]);
console.log('Unique constraints on tables to migrate:');
console.log(JSON.stringify(constraints.rows, null, 2));

// For each unique-constrained table, check for a literal collision if we just swap tenant_id.
for (const { table_name, cols } of constraints.rows) {
  const colList = cols.split(', ').filter(c => c !== 'tenant_id');
  if (colList.length === 0) continue;
  const selectCols = colList.map(c => `"${c}"`).join(', ');
  const res = await client.query(
    `SELECT ${selectCols} FROM "${table_name}" WHERE tenant_id = $1
     INTERSECT
     SELECT ${selectCols} FROM "${table_name}" WHERE tenant_id = $2`,
    [OLD_TENANT, NEW_TENANT]
  );
  console.log(`${table_name} (${cols}): ${res.rows.length} colliding value-sets`, res.rows.length ? JSON.stringify(res.rows) : '');
}

// Also check FK dependencies: do any of the migrate-tables' rows reference OTHER tenant-scoped
// tables NOT in our migrate list (which would become dangling once tenant_id changes)?
const fkCheck = await client.query(`
  SELECT
    tc.table_name AS from_table, kcu.column_name AS from_col,
    ccu.table_name AS to_table, ccu.column_name AS to_col
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    AND tc.table_name = ANY($1)
`, [MIGRATE_TABLES]);
console.log('\nFK relationships from migrate-tables:');
console.log(JSON.stringify(fkCheck.rows, null, 2));

await client.end();
