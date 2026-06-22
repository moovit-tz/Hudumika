import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  console.log('🔄 Connecting to database for migrations...');
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

  try {
    const client = await pool.connect();
    console.log('✅ Connected to database.');

    // Create tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📁 Found ${files.length} migration files in src/db/migrations/`);

    const { rows: applied } = await client.query<{ filename: string }>(
      'SELECT filename FROM _migrations ORDER BY filename'
    );
    const appliedSet = new Set(applied.map(r => r.filename));

    let ran = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`⏭  Skipping ${file} (already applied)`);
        continue;
      }
      console.log(`🚀 Running migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`✅ Migration ${file} completed successfully.`);
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Migration ${file} failed:`, err);
        throw err;
      }
    }

    client.release();
    if (ran === 0) {
      console.log('✅ Database is already up to date.');
    } else {
      console.log(`🎉 ${ran} migration(s) applied successfully.`);
    }
  } catch (error) {
    console.error('❌ Migration run failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
