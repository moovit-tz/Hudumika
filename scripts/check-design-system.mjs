import { readFileSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const checks = [
  ['Input follows the density and shape tokens', 'apps/web/src/components/ui/input.tsx', /min-h-\(--ctl-h\).*rounded-\(--radius\)/s],
  ['Select follows the density and shape tokens', 'apps/web/src/components/ui/select.tsx', /min-h-\(--ctl-h\).*rounded-\(--radius\)/s],
  ['DatePicker has no nested fake button', 'apps/web/src/components/ui/date-picker.tsx', (source) => !source.includes('role="button"') && source.includes('ClearDateButton')],
  ['Badge uses density tokens', 'apps/web/src/components/ui/badge.tsx', /minHeight: 'var\(--badge-min-h\)'.*paddingBlock: 'var\(--badge-py\)'/s],
  ['Table cells use the data-density token', 'apps/web/src/components/ui/table.tsx', /py-\[var\(--ds-cell-py\)\]/],
  ['Design-system contract is documented', 'docs/DESIGN_SYSTEM.md', () => true],
];

const failures = [];
for (const [label, path, assertion] of checks) {
  const url = new URL(path, root);
  if (!existsSync(url)) {
    failures.push(`${label}: missing ${path}`);
    continue;
  }
  const source = read(path);
  const passed = typeof assertion === 'function' ? assertion(source) : assertion.test(source);
  if (!passed) failures.push(`${label}: ${path} no longer matches its token/accessibility contract`);
}

if (failures.length) {
  console.error('Design-system contract check failed:\n' + failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Design-system contract check passed (${checks.length} checks).`);
