// Fails when an icon-only button has no accessible name.
//
// A <button>/<Button> whose only content is <Icon …/> element(s) must carry
// aria-label, aria-labelledby or title, or sit directly inside a
// <Tip label="…"> (which names it — components/ui/tooltip.tsx). Otherwise a
// screen reader announces just "button" (product design principles §3 Icons).
//
// Regex-based, deliberately strict about what counts as icon-only so it has
// no false positives: text, expressions or other elements inside the button
// take it out of scope. The browser route audit covers the rest.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../apps/web/src', import.meta.url));
const OPEN = /<(button|Button)\b((?:[^>"'{}]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*)>/g;
const ICON_ONLY = /^(<Icon\b(?:[^>"'{}]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*\/>\s*)+$/;
const TIP_BEFORE = /<Tip\s[^>]*\blabel=[^>]*>\s*$/;
const findings = [];

(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (path.endsWith('.tsx')) scan(path);
  }
})(root);

function scan(file) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(OPEN)) {
    const [whole, tag, attrs] = match;
    if (attrs.trim().endsWith('/')) continue;
    const start = match.index + whole.length;
    const close = source.indexOf(`</${tag}>`, start);
    if (close < 0) continue;
    const inner = source.slice(start, close).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trim();
    if (!ICON_ONLY.test(inner)) continue;
    if (/aria-label(ledby)?\s*=|\btitle\s*=/.test(attrs)) continue;
    if (TIP_BEFORE.test(source.slice(Math.max(0, match.index - 300), match.index))) continue;
    findings.push(`${relative(root, file).split(sep).join('/')}:${source.slice(0, match.index).split('\n').length}`);
  }
}

if (findings.length) {
  console.error(`Icon-only buttons without an accessible name (${findings.length}). Add aria-label, or wrap in <Tip label="…">:\n` + findings.map(f => `- apps/web/src/${f}`).join('\n'));
  process.exit(1);
}
console.log('Icon-only button names check passed (every icon-only button is named).');
