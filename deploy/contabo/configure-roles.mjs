import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const roles = [['hudumika_app', 'DB_APP_PASSWORD', 'NOSUPERUSER NOBYPASSRLS'], ['hudumika_platform', 'DB_PLATFORM_PASSWORD', 'NOSUPERUSER BYPASSRLS'], ['hudumika_readonly', 'DB_READONLY_PASSWORD', 'NOSUPERUSER NOBYPASSRLS']];
  for (const [role, key, privileges] of roles) {
    const password = process.env[key];
    if (!password || !/^[a-fA-F0-9]{64}$/.test(password)) throw new Error(`Missing generated role secret: ${key}`);
    // PostgreSQL utility statements do not accept bind placeholders here;
    // identifiers are fixed and passwords have been restricted to hex.
    await pool.query(`ALTER ROLE ${role} WITH LOGIN ${privileges} NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}'`);
  }
  console.log('Database role credentials configured; restricted application role retained.');
} finally { await pool.end(); }
