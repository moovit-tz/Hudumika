import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const trackedFiles = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
).split(/\r?\n/).filter(Boolean);

// These are characteristic UTF-8-as-Windows-1252 fragments, not individual
// accented letters; valid copy such as Portuguese "Alfândega" remains valid.
const mojibake = /\u00e2(?:\u20ac|\u2020|\u2013|\u2014|\u2018|\u2019|\u201c|\u201d|\u2022|\u2122)|\u00c2[\u00a0-\u00bf]|\u00f0\u0178|\u00ef\u00bf\u00bd|\u00c3\u2014/g;
const textExtensions = new Set([
  '.css', '.csv', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.sql',
  '.svg', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const failures = [];

for (const file of trackedFiles) {
  const dot = file.lastIndexOf('.');
  if (dot < 0 || !textExtensions.has(file.slice(dot).toLowerCase())) continue;
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const match of source.matchAll(mojibake)) {
    const line = source.slice(0, match.index).split('\n').length;
    failures.push(`${file}:${line}: ${JSON.stringify(match[0])}`);
  }
}

if (failures.length) {
  console.error('Mojibake detected (UTF-8 text decoded as Windows-1252):');
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Encoding check passed.');
