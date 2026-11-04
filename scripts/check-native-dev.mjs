// Preflight check for native local development (no Docker/Compose required).
// Run before `npm run dev`: verifies the native services, per-app config,
// and per-app port each `dev:*` script depends on, and reports failures
// grouped by app rather than failing opaquely mid-startup.
import { createConnection } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function portInUse(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise((done) => {
    const socket = createConnection({ port, host });
    const finish = (inUse) => { socket.destroy(); done(inUse); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function pgReachable(connectionString) {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2000, max: 1 });
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await pool.end();
  }
}

function readEnv(path) {
  if (!existsSync(path)) return null;
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const results = [];
function report(app, checks) { results.push({ app, checks }); }

// ── Hudumika (api :3001, web :5173) — native Postgres 13 (5433), native Redis (6379) ──
{
  const checks = [];
  const pg13 = await pgReachable('postgresql://postgres@localhost:5433/clearos');
  checks.push({ name: 'Postgres 13 (clearos @ :5433)', ok: pg13.ok, detail: pg13.ok ? undefined : pg13.error });
  const redisUp = await portInUse(6379);
  checks.push({ name: 'Redis (:6379)', ok: redisUp, detail: redisUp ? undefined : 'nothing listening — install/start native Redis (Memurai) before `npm run dev`' });
  const apiPortFree = !(await portInUse(3001));
  checks.push({ name: 'Port 3001 free for api', ok: apiPortFree, detail: apiPortFree ? undefined : 'already in use — a previous dev server may still be running' });
  const webPortFree = !(await portInUse(5173));
  checks.push({ name: 'Port 5173 free for web', ok: webPortFree, detail: webPortFree ? undefined : 'already in use' });
  const env = readEnv(resolve(ROOT, '.env'));
  checks.push({ name: 'apps/api/.env (root .env) present', ok: !!env, detail: env ? undefined : 'missing D:\\Apps\\Hudumika\\.env' });
  report('Hudumika (api+web)', checks);
}

// ── Tuma (:3100) — shares Hudumika's native Postgres 13 (5433), own `tuma` database ──
{
  const checks = [];
  const envPath = resolve(ROOT, 'tuma/tuma-web/.env');
  const env = readEnv(envPath);
  checks.push({ name: '.env present', ok: !!env, detail: env ? undefined : `missing ${envPath}` });
  if (env?.DATABASE_URL) {
    const r = await pgReachable(env.DATABASE_URL);
    checks.push({ name: 'Postgres (tuma db @ :5433)', ok: r.ok, detail: r.ok ? undefined : r.error });
  }
  checks.push({ name: 'ONDI_MODE=real', ok: env?.ONDI_MODE === 'real', detail: env?.ONDI_MODE === 'real' ? undefined : `currently '${env?.ONDI_MODE}' — must be 'real' for Ondi-only enforcement` });
  const portFree = !(await portInUse(3100));
  checks.push({ name: 'Port 3100 free', ok: portFree, detail: portFree ? undefined : 'already in use' });
  report('Tuma', checks);
}

// ── LexCore (api :3002, web :5175) — native Postgres 15 (5432), own `ngao_dev` database ──
{
  const checks = [];
  const envPath = resolve(ROOT, '../LexCore/apps/api/.env');
  const env = readEnv(envPath);
  checks.push({ name: '.env present', ok: !!env, detail: env ? undefined : `missing ${envPath}` });
  if (env?.DATABASE_URL) {
    const r = await pgReachable(env.DATABASE_URL);
    checks.push({ name: 'Postgres (ngao_dev @ :5432)', ok: r.ok, detail: r.ok ? undefined : r.error });
  }
  if (env?.REDIS_URL) {
    const u = new URL(env.REDIS_URL);
    const up = await portInUse(Number(u.port) || 6379, u.hostname);
    checks.push({ name: `Redis (${u.hostname}:${u.port || 6379})`, ok: up, detail: up ? undefined : 'nothing listening' });
  }
  const apiPortFree = !(await portInUse(3002));
  checks.push({ name: 'Port 3002 free for api', ok: apiPortFree, detail: apiPortFree ? undefined : 'already in use' });
  const webPortFree = !(await portInUse(5175));
  checks.push({ name: 'Port 5175 free for web', ok: webPortFree, detail: webPortFree ? undefined : 'already in use' });
  report('LexCore (api+web)', checks);
}

// ── Gereji (:3000) — SQLite, no server dependency ──
{
  const checks = [];
  const envPath = resolve(ROOT, '../Gereji/gereji-app/.env.local');
  const env = readEnv(envPath);
  checks.push({ name: '.env.local present', ok: !!env, detail: env ? undefined : `missing ${envPath}` });
  checks.push({ name: 'SQLite (no server required)', ok: true });
  const portFree = !(await portInUse(3000));
  checks.push({ name: 'Port 3000 free', ok: portFree, detail: portFree ? undefined : 'already in use' });
  report('Gereji', checks);
}

// ── Stride (api :4000, web :3101) — native Postgres 15 (5432), own `movara` database ──
{
  const checks = [];
  const envPath = resolve(ROOT, '../Stride/movara-backend/.env');
  const env = readEnv(envPath);
  checks.push({ name: '.env present', ok: !!env, detail: env ? undefined : `missing ${envPath}` });
  if (env?.PGHOST) {
    const connStr = `postgresql://${env.PGUSER}:${env.PGPASSWORD}@${env.PGHOST}:${env.PGPORT}/${env.PGDATABASE}`;
    const r = await pgReachable(connStr);
    checks.push({ name: `Postgres (${env.PGDATABASE} @ :${env.PGPORT})`, ok: r.ok, detail: r.ok ? undefined : r.error });
  }
  const apiPortFree = !(await portInUse(4000));
  checks.push({ name: 'Port 4000 free for api', ok: apiPortFree, detail: apiPortFree ? undefined : 'already in use' });
  const webPortFree = !(await portInUse(3101));
  checks.push({ name: 'Port 3101 free for web', ok: webPortFree, detail: webPortFree ? undefined : 'already in use' });
  report('Stride (api+web)', checks);
}

// ── Report ──
let anyFail = false;
for (const { app, checks } of results) {
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${failed.length ? '✗' : '✓'} ${app}`);
  for (const c of checks) {
    console.log(`   ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  if (failed.length) anyFail = true;
}
console.log(anyFail ? '\nOne or more apps are not ready for native startup — see ✗ lines above.' : '\nAll apps ready for native startup.');
process.exit(anyFail ? 1 : 0);
