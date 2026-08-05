#!/usr/bin/env node
/**
 * Durable store for the coding agent's memory.
 *
 * The memory the agent writes lives under the user's home directory
 * (~/.claude/projects/<slug>/memory/*.md). That is one machine's disk: not in
 * any repo, never pushed, and gone if .claude is wiped. Six files of
 * accumulated project context were sitting there with no copy anywhere.
 *
 * Two layers now back it up, deliberately in this order:
 *
 *   1. git   — .claude/memory/ in this repo is the backup of record. Text,
 *              versioned, diffable, pushed with everything else. Restoring is
 *              a checkout. This needs no database to be running.
 *   2. pg    — a mirror in the `claude_agent` schema for anyone who wants the
 *              content queryable alongside the rest of their data.
 *
 * The schema is `claude_agent`, NOT public, and this is a standalone script
 * rather than a migration in apps/api/src/db/migrations. Agent memory is
 * developer tooling, not tenant data — putting it in the product's migration
 * chain would ship a table about Claude's notes to every tenant deployment.
 * There is no tenant_id here for the same reason: this is not tenant data, so
 * giving it a tenant column would imply an isolation guarantee that does not
 * apply. Keep it out of anything that reads tenant-scoped tables.
 *
 * Usage:
 *   node scripts/memory-sync.mjs push     home dir -> repo -> postgres
 *   node scripts/memory-sync.mjs pull     postgres -> repo (recover)
 *   node scripts/memory-sync.mjs status   what is where, and what differs
 *
 * DATABASE_URL is read from the environment; the pg steps are skipped with a
 * notice when it is unset, so `push` still does its git half on a machine
 * with no database.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = path.resolve(import.meta.dirname, '..');
/**
 * The harness names the project directory after the *whole* absolute path, not
 * the basename: D:\Apps\Hudumika becomes "d--Apps-Hudumika" — drive letter
 * lowercased, separators as single dashes, the rest of the casing left alone.
 * Deriving it from path.basename() gave "d--hudumika", a directory that does
 * not exist, so every file read as missing and `push` would have mirrored
 * nothing while reporting success.
 */
function projectSlug(abs) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(abs);
  if (m) return `${m[1].toLowerCase()}--${m[2].replace(/[\\/]+/g, '-')}`;
  return abs.replace(/[\\/]+/g, '-').replace(/^-/, '');
}
const SLUG = projectSlug(REPO);
const HOME_DIR = path.join(os.homedir(), '.claude', 'projects', SLUG, 'memory');
const REPO_DIR = path.join(REPO, '.claude', 'memory');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

async function readDir(dir) {
  const out = new Map();
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    if (!n.endsWith('.md')) continue;
    out.set(n, await fs.readFile(path.join(dir, n), 'utf8'));
  }
  return out;
}

async function connect() {
  if (!process.env.DATABASE_URL) return null;
  let pg;
  try {
    pg = require('pg');
  } catch {
    console.log('  ! pg not resolvable from this directory — skipping the database mirror');
    return null;
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('CREATE SCHEMA IF NOT EXISTS claude_agent');
  await client.query(`
    CREATE TABLE IF NOT EXISTS claude_agent.memory (
      project     TEXT NOT NULL,
      name        TEXT NOT NULL,
      body        TEXT NOT NULL,
      body_sha    TEXT NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project, name)
    )`);
  return client;
}

async function push() {
  const home = await readDir(HOME_DIR);
  const repo = await readDir(REPO_DIR);
  console.log(`home: ${home.size} file(s)   repo: ${repo.size} file(s)`);

  await fs.mkdir(REPO_DIR, { recursive: true });
  let copied = 0;
  for (const [name, body] of home) {
    if (repo.get(name) !== body) {
      await fs.writeFile(path.join(REPO_DIR, name), body, 'utf8');
      copied++;
    }
  }
  console.log(`  git   : ${copied} file(s) written to .claude/memory (commit to make it durable)`);

  const client = await connect();
  if (!client) {
    console.log('  pg    : skipped (DATABASE_URL unset)');
    return;
  }
  const source = home.size ? home : repo;
  let n = 0;
  for (const [name, body] of source) {
    await client.query(
      `INSERT INTO claude_agent.memory (project, name, body, body_sha)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project, name) DO UPDATE
         SET body = EXCLUDED.body, body_sha = EXCLUDED.body_sha, updated_at = NOW()
       WHERE claude_agent.memory.body_sha <> EXCLUDED.body_sha`,
      [SLUG, name, body, sha(body)],
    );
    n++;
  }
  console.log(`  pg    : ${n} row(s) upserted into claude_agent.memory`);
  await client.end();
}

async function pull() {
  const client = await connect();
  if (!client) {
    console.log('DATABASE_URL unset — nothing to pull from. Restore from git instead:');
    console.log('  git checkout .claude/memory');
    return;
  }
  const { rows } = await client.query(
    'SELECT name, body FROM claude_agent.memory WHERE project = $1 ORDER BY name', [SLUG]);
  await fs.mkdir(REPO_DIR, { recursive: true });
  for (const r of rows) await fs.writeFile(path.join(REPO_DIR, r.name), r.body, 'utf8');
  console.log(`restored ${rows.length} file(s) into .claude/memory`);
  console.log('copy them into the live memory dir for the agent to read them:');
  console.log(`  ${HOME_DIR}`);
  await client.end();
}

async function status() {
  const home = await readDir(HOME_DIR);
  const repo = await readDir(REPO_DIR);
  const client = await connect();
  const db = new Map();
  if (client) {
    const { rows } = await client.query(
      'SELECT name, body FROM claude_agent.memory WHERE project = $1', [SLUG]);
    for (const r of rows) db.set(r.name, r.body);
    await client.end();
  }
  const names = [...new Set([...home.keys(), ...repo.keys(), ...db.keys()])].sort();
  console.log(`project: ${SLUG}`);
  console.log('file'.padEnd(38), 'home', 'repo', client ? 'pg' : 'pg(off)');
  for (const n of names) {
    const mark = (m) => (m.has(n) ? (m.get(n) === home.get(n) || !home.has(n) ? ' ok ' : 'DIFF') : ' -  ');
    console.log(n.padEnd(38), home.has(n) ? ' ok ' : ' -  ', mark(repo), client ? mark(db) : '  - ');
  }
  if (!client) console.log('\n(DATABASE_URL unset — database column not checked)');
}

const cmd = process.argv[2] ?? 'status';
const fn = { push, pull, status }[cmd];
if (!fn) {
  console.error(`unknown command "${cmd}" — expected push | pull | status`);
  process.exit(1);
}
await fn();
