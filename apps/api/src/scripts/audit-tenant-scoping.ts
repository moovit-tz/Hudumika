/**
 * Find writes that are not scoped to a tenant.
 *
 * CLAUDE.md is explicit: RLS exists on these tables but does not protect data on
 * its own, because the connection uses a role that owns them and Postgres lets
 * a table owner bypass row-level policies. Every query needs its own
 * `.where('tenant_id', '=', user.tenant_id)`.
 *
 * An UPDATE or DELETE keyed only on `id` therefore reaches across tenants. A
 * uuid is hard to guess, so this is not trivially exploitable — but it is one
 * leaked or logged id away from one customer deleting another's records, and it
 * fails silently in the direction of doing too much.
 *
 * Reads are checked too but reported separately: a SELECT that leaks is a
 * disclosure, a DELETE that leaks is destruction.
 *
 *   npx tsx src/scripts/audit-tenant-scoping.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');

/**
 * Read from the live schema rather than guessed at. A table with no tenant_id
 * column cannot be scoped to a tenant, so flagging it is pure noise — and
 * guessing which those are by name is how an audit loses its credibility.
 */
const TENANT_TABLES: Set<string> = new Set(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', '.tenant-tables.json'), 'utf8')),
);

/** Kept for tables that carry tenant_id but are deliberately platform-wide. */
const PLATFORM_TABLES = new Set([
  'lens_items', 'lens_areas', 'lens_events', 'lens_cycles', 'lens_links',
  'lens_integrations', 'lens_columns',
  'tenants', 'migrations', '_migrations', 'platform_settings', 'marketplace_apps',
  'countries', 'currencies', 'hs_codes', 'exchange_rates', 'jurisdictions',
]);

interface Hit { file: string; line: number; kind: string; table: string; snippet: string }

/** A chained query expression starting at `start`, to its terminating call. */
function chainFrom(src: string, start: number): string {
  let i = start, depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ';' && depth <= 0) break;
  }
  return src.slice(start, Math.min(i + 1, src.length));
}

const lineOf = (src: string, idx: number) => src.slice(0, idx).split('\n').length;

function audit(file: string): { writes: Hit[]; reads: Hit[] } {
  const src = fs.readFileSync(file, 'utf8');
  const writes: Hit[] = [], reads: Hit[] = [];

  const re = /\.(updateTable|deleteFrom|selectFrom)\s*\(\s*['"`]([a-z_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const kind = m[1], table = m[2];
    // Only a table that HAS a tenant_id can be missing a filter on it.
    if (!TENANT_TABLES.has(table)) continue;
    if (PLATFORM_TABLES.has(table)) continue;

    const chain = chainFrom(src, m.index);
    // Scoped if it filters on tenant_id anywhere in the chain, or joins a table
    // that is itself scoped in the same statement.
    const scoped = /tenant_id/.test(chain);
    if (scoped) continue;

    // The dominant safe pattern is "verify then act": fetch the row with a
    // tenant filter, 404 if absent, then write keyed on its id. That id is
    // already proven to belong to the caller, so the write needs no filter of
    // its own. Detect it by looking back for a tenant_id check inside the same
    // handler — without this the audit is 120 hits of mostly-correct code, and
    // an audit nobody trusts gets ignored.
    const handlerStart = Math.max(
      src.lastIndexOf('fastify.', m.index),
      src.lastIndexOf('static async', m.index),
    );
    // `withTenant(user.tenant_id, ...)` contains the string tenant_id, so a
    // naive search finds it in every handler and concludes they are all
    // verified — which hid the one confirmed defect on the first run. The
    // opening call is stripped before looking.
    const preceding = src.slice(handlerStart < 0 ? 0 : handlerStart, m.index)
      .replace(/withTenant\s*\(\s*[A-Za-z0-9_.]*tenant_id\s*,/g, 'withTenant(')
      .replace(/\btenantId\b/g, '');
    const verifiedEarlier = /tenant_id/.test(preceding);
    // Scoped to one person is stronger than scoped to their tenant.
    const userScoped = /\buser_id\b|\bactor\.sub\b|\buser\.sub\b/.test(chain);

    const hit: Hit = {
      file, table, kind,
      line: lineOf(src, m.index),
      snippet: chain.replace(/\s+/g, ' ').slice(0, 96),
    };
    if (verifiedEarlier || userScoped) continue;
    if (kind === 'selectFrom') reads.push(hit); else writes.push(hit);
  }
  return { writes, reads };
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.isFile() && p.endsWith('.ts') && !p.includes('scripts') ? [p] : [];
  });
}

const files = walk(ROOT);
const allWrites: Hit[] = [], allReads: Hit[] = [];
for (const f of files) {
  const { writes, reads } = audit(f);
  allWrites.push(...writes); allReads.push(...reads);
}

const rel = (f: string) => path.relative(process.cwd(), f).replace(/\\/g, '/');
const group = (hits: Hit[]) => {
  const m = new Map<string, Hit[]>();
  for (const h of hits) m.set(rel(h.file), [...(m.get(rel(h.file)) ?? []), h]);
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
};

console.log(`\nScanned ${files.length} files.\n`);
console.log(`UNSCOPED WRITES — ${allWrites.length}`);
console.log('An UPDATE or DELETE without a tenant filter can reach another tenant\'s rows.\n');
for (const [file, hits] of group(allWrites)) {
  console.log(`${file}  (${hits.length})`);
  for (const h of hits) console.log(`   ${String(h.line).padStart(5)}  ${h.kind}('${h.table}')  ${h.snippet}`);
}

console.log(`\n\nUNSCOPED READS — ${allReads.length}  (disclosure rather than destruction)`);
const readGroups = group(allReads);
for (const [file, hits] of readGroups.slice(0, 12)) {
  console.log(`${file}  (${hits.length})`);
  for (const h of hits.slice(0, 4)) console.log(`   ${String(h.line).padStart(5)}  ${h.table}`);
}
if (readGroups.length > 12) console.log(`… and ${readGroups.length - 12} more file(s)`);

console.log('\nNot every hit is a defect: a query may already be constrained by a');
console.log('join, or by an id fetched from a tenant-scoped query moments earlier.');
console.log('The writes are the ones worth reading first.');
