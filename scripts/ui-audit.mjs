#!/usr/bin/env node
/**
 * Report-only UI consistency inventory. Counts migration signals rather than
 * treating them as automatic defects: inline styles can be legitimate for
 * runtime geometry, and raw colors can be valid chart-series data.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const pagesRoot = join(repoRoot, 'apps/web/src/pages');
const asJson = process.argv.includes('--json');

function walk(dir, output = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, output);
    else if (name.endsWith('.tsx')) output.push(path);
  }
  return output;
}

const patterns = {
  inlineStyles: /style=\{\{/g,
  hardcodedColors: /#[0-9a-fA-F]{3,8}\b/g,
  nativeSelects: /<select\b/g,
  directFetches: /\bfetch\(/g,
  nativeTooltips: /\btitle=/g,
  pageHeaders: /<PageHeader\b/g,
  metricRows: /<MetricsRow\b/g,
  dataTables: /<DataTable\b/g,
  uiImports: /components\/ui\//g,
  localMetricComponents: /function\s+(?:StatCard|KpiCard|MetricCard|KPI)\b/g,
};

const count = (source, pattern) => [...source.matchAll(pattern)].length;
const rows = walk(pagesRoot).map((path) => {
  const source = readFileSync(path, 'utf8');
  return {
    file: relative(repoRoot, path).replaceAll('\\', '/'),
    lines: source.split('\n').length,
    ...Object.fromEntries(Object.entries(patterns).map(([key, pattern]) => [key, count(source, pattern)])),
  };
});

const totals = Object.fromEntries(
  ['lines', ...Object.keys(patterns)].map((key) => [key, rows.reduce((sum, row) => sum + row[key], 0)]),
);
const report = { generatedAt: new Date().toISOString(), files: rows.length, totals, rows };

if (asJson) {
  const target = join(repoRoot, 'ui-audit-report.json');
  writeFileSync(target, JSON.stringify(report, null, 2));
  console.log(`Wrote ${relative(repoRoot, target)} (${rows.length} page files).`);
} else {
  console.log(`\nHudumika UI consistency inventory — ${rows.length} page files\n`);
  for (const [key, value] of Object.entries(totals)) console.log(`${key.padEnd(24)} ${value}`);
  console.log('\nHighest inline-style counts:');
  for (const row of [...rows].sort((a, b) => b.inlineStyles - a.inlineStyles).slice(0, 15)) {
    console.log(`${String(row.inlineStyles).padStart(5)}  ${row.file}`);
  }
  console.log('\nThis is a migration inventory, not a pass/fail gate. Use --json for the full per-file report.\n');
}
