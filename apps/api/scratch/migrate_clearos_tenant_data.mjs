import pg from 'pg';
const client = new pg.Client({ connectionString: 'postgresql://postgres@localhost:5433/clearos' });
await client.connect();

const OLD_TENANT = '04a3d70c-f641-4196-80c3-c58c70b98c44'; // clearos.io demo tenant
const NEW_TENANT = '15b7d313-5ab9-47d1-b9b3-eaa90cd90bdf'; // hudumika.tz (Viden's real tenant)

const MIGRATE_TABLES = [
  'chat_channels', 'cloud_drives', 'cloud_files', 'compliance_check_log',
  'comply_applications', 'comply_certificates', 'comply_legal_engagements', 'comply_obligations',
  'comply_profiles', 'comply_reminders', 'complyos_marketplace_requests', 'customs_penalties',
  'drivers', 'email_messages', 'hr_attendance', 'hr_clock_sessions', 'hr_time_entries', 'hr_tasks',
  'landed_cost_records', 'notes', 'products', 'task_lists', 'tax_registrations',
  'trade_wizard_runs', 'trade_wizard_searches', 'user_app_settings', 'vehicle_vendors', 'vehicles',
  'workflow_steps', 'workflow_studio_apps', 'workflows',
];

try {
  await client.query('BEGIN');
  const results = [];
  for (const t of MIGRATE_TABLES) {
    const res = await client.query(`UPDATE "${t}" SET tenant_id = $1 WHERE tenant_id = $2`, [NEW_TENANT, OLD_TENANT]);
    results.push({ table: t, moved: res.rowCount });
  }
  await client.query('COMMIT');
  console.log('COMMITTED. Rows moved per table:');
  console.log(JSON.stringify(results, null, 2));
  console.log('Total rows moved:', results.reduce((s, r) => s + r.moved, 0));
} catch (err) {
  await client.query('ROLLBACK');
  console.error('ROLLED BACK due to error:', err.message);
  process.exit(1);
}

await client.end();
