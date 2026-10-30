import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { env } from '../apps/api/dist/config/env.js';

const name = `nexushr_bootstrap_${randomBytes(8).toString('hex')}`;
const admin = new pg.Pool({ connectionString: env.DATABASE_URL });
let created = false;
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  const url = new URL(env.DATABASE_URL); url.pathname = `/${name}`;
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--conditions=production', 'apps/api/dist/db/migrate.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, DATABASE_URL: url.href, NODE_ENV: 'test' }, stdio: 'inherit',
    });
    child.once('error', reject); child.once('close', resolve);
  });
  if (code !== 0) throw new Error(`Fresh migration run failed with exit code ${code}.`);
  console.log('Fresh-database migration bootstrap passed.');
} finally {
  // Never use the configured database name for cleanup: only this generated,
  // strictly prefixed disposable database may be dropped.
  if (created && /^nexushr_bootstrap_[a-f0-9]{16}$/.test(name)) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
}
