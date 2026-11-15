// Fails when a form field is labelled only by a neighbouring <label>.
//
// `<label>Due date</label><Input …/>` looks labelled but is not: without
// htmlFor (or the label wrapping the field) a screen reader announces an
// unnamed text box. The fix is aria-label on the field (or htmlFor + id, or
// wrap the field in the label). Covers Input, Textarea, Combobox, DatePicker,
// DateRangePicker and Select's trigger.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../apps/web/src', import.meta.url));
const ATTRS = `((?:[^>"'{}]|"[^"]*"|'[^']*'|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*?)`;
const LABEL = `<label\\b(?![^>]*htmlFor)[^>]*>\\s*([A-Za-z][A-Za-z0-9 &/()'’.,\\-–]{1,60}?)\\s*(?:<span[^>]*>\\s*\\*\\s*<\\/span>\\s*)?<\\/label>\\s*(?:\\{\\/\\*[\\s\\S]*?\\*\\/\\}\\s*)?`;
const PATTERNS = [
  new RegExp(`${LABEL}<(?:Input|Textarea|Combobox|DatePicker|DateRangePicker)\\b${ATTRS}\\/?>`, 'g'),
  new RegExp(`${LABEL}<Select\\b[^>]*>\\s*<SelectTrigger\\b${ATTRS}>`, 'g'),
];
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
  for (const pattern of PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const attrs = match[2] ?? '';
      if (/aria-label(ledby)?\s*=|\bid\s*=/.test(attrs)) continue;
      findings.push(`${relative(root, file).split(sep).join('/')}:${source.slice(0, match.index).split('\n').length} "${match[1].trim()}"`);
    }
  }
}

if (findings.length) {
  console.error(`Fields labelled only by a neighbouring <label> (${findings.length}). Add aria-label, or htmlFor + id:\n` + findings.map(f => `- apps/web/src/${f}`).join('\n'));
  process.exit(1);
}
console.log('Field labels check passed (no field relies on an unassociated <label>).');
