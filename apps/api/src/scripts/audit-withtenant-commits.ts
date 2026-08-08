/**
 * Find every place a rejected request still commits its writes.
 *
 * `withTenant` runs its callback inside a transaction. Returning
 * `reply.status(4xx).send(...)` from inside that callback *returns normally* —
 * it does not throw — so the transaction commits. Anything written before the
 * refusal is kept, and the caller is told the request failed.
 *
 * That is invisible in testing unless somebody checks the table afterwards, and
 * it corrupts data in exactly the cases the validation existed to prevent. It
 * has already been found twice by hand (a rejected tax code left an orphan
 * invoice header; a rejected leave request would have left the row).
 *
 * This looks for the shape statically: within one withTenant callback, a write
 * followed later by a 4xx reply. Reported as SUSPECT rather than proven — the
 * write may be on a branch that cannot reach the refusal — but every hit is
 * worth a human reading.
 *
 *   npx tsx src/scripts/audit-withtenant-commits.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');

const WRITE = /\b(insertInto|updateTable|deleteFrom)\s*\(/g;
const RAW_WRITE = /sql`\s*(INSERT|UPDATE|DELETE)\b/gi;
const REJECT = /\breply\s*\.\s*(?:status|code)\s*\(\s*(4\d{2}|5\d{2})\s*\)/g;

interface Finding {
  file: string;
  line: number;
  status: string;
  writesBefore: { line: number; what: string }[];
}

/** The body of the callback passed to withTenant, by brace balance. */
function withTenantBlocks(src: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const re = /withTenant\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // Walk from the opening paren to its match, tracking strings crudely.
    let i = m.index + m[0].length - 1;
    let depth = 0;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) break; }
    }
    if (i < src.length) out.push({ start: m.index, end: i });
  }
  return out;
}

const lineOf = (src: string, idx: number) => src.slice(0, idx).split('\n').length;

function auditFile(file: string): Finding[] {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('withTenant')) return [];
  const findings: Finding[] = [];

  for (const block of withTenantBlocks(src)) {
    const body = src.slice(block.start, block.end);
    const writes: { at: number; what: string }[] = [];
    for (const re of [WRITE, RAW_WRITE]) {
      re.lastIndex = 0;
      let w: RegExpExecArray | null;
      while ((w = re.exec(body))) writes.push({ at: w.index, what: w[1] ?? w[0] });
    }
    if (writes.length === 0) continue;

    REJECT.lastIndex = 0;
    let r: RegExpExecArray | null;
    while ((r = REJECT.exec(body))) {
      const before = writes.filter(w => w.at < r!.index);
      if (before.length === 0) continue;
      findings.push({
        file, status: r[1],
        line: lineOf(src, block.start + r.index),
        writesBefore: before.map(w => ({ line: lineOf(src, block.start + w.at), what: w.what })),
      });
    }
  }
  return findings;
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.isFile() && p.endsWith('.ts') ? [p] : [];
  });
}

const files = walk(ROOT);
const all = files.flatMap(auditFile);

const byFile = new Map<string, Finding[]>();
for (const f of all) {
  const k = path.relative(process.cwd(), f.file).replace(/\\/g, '/');
  byFile.set(k, [...(byFile.get(k) ?? []), f]);
}

console.log(`\nScanned ${files.length} files under src/.`);
console.log(`${all.length} place(s) where a refusal follows a write inside the same withTenant block.\n`);

const ordered = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [file, hits] of ordered) {
  console.log(`${file}  (${hits.length})`);
  for (const h of hits) {
    const w = h.writesBefore[h.writesBefore.length - 1];
    console.log(`   line ${String(h.line).padStart(5)}  ${h.status}  <- ${w.what} at line ${w.line}`);
  }
}

if (all.length === 0) {
  console.log('Nothing found. Either every refusal precedes its writes, or the shape has changed.');
} else {
  console.log(`\n${ordered.length} file(s) to read. Each is a candidate, not a proven defect:`);
  console.log('the write may sit on a branch that cannot reach the refusal.');
}
