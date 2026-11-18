/**
 * Dev helper: apply ONE named migration (and record it in _migrations), so a
 * session can apply its own migration without also running another session's
 * pending files. Usage: npx tsx src/scripts/apply-one-migration.ts 917_mcp_sessions.sql
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';

const file = process.argv[2];
if (!file || !/^\d+_[a-z0-9_]+\.sql$/.test(file)) { console.error('usage: apply-one-migration.ts <NNN_name.sql>'); process.exit(2); }
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const client = await pool.connect();
try {
  const applied = new Set((await client.query('SELECT filename FROM _migrations')).rows.map(r => r.filename));
  const notApplied = fs.readdirSync(dir).filter(f => f.endsWith('.sql') && !applied.has(f)).sort();
  console.log('not yet applied:', notApplied.join(', ') || '(none)');
  if (applied.has(file)) { console.log(`${file} already applied`); }
  else {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`applied ${file}`);
  }
} catch (e: any) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('failed:', e.message); process.exitCode = 1;
} finally { client.release(); await pool.end(); }
