import { readFileSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const checks = [
  ['Page titles inherit the selected global font and retain brand colour', 'apps/web/src/index.css', /--page-title-font: var\(--font\);[\s\S]*\.page-header-title\s*\{[^}]*font-family: var\(--page-title-font\);[\s\S]*\.ph-em\s*\{[^}]*font-family: inherit;[^}]*font-style: normal;[^}]*color: var\(--teal\);[^}]*font-weight: inherit;/],
  ['Input follows the density and shape tokens', 'apps/web/src/components/ui/input.tsx', /min-h-\(--ctl-h\).*rounded-\(--radius\)/s],
  ['Select follows the density and shape tokens', 'apps/web/src/components/ui/select.tsx', /min-h-\(--ctl-h\).*rounded-\(--radius\)/s],
  ['DatePicker has no nested fake button', 'apps/web/src/components/ui/date-picker.tsx', (source) => !source.includes('role="button"') && source.includes('ClearDateButton')],
  ['Badge uses density tokens', 'apps/web/src/components/ui/badge.tsx', /minHeight: 'var\(--badge-min-h\)'.*paddingBlock: 'var\(--badge-py\)'/s],
  ['Table cells use the data-density token', 'apps/web/src/components/ui/table.tsx', /py-\[var\(--ds-cell-py\)\]/],
  ['Tabs cannot override the global platform variant', 'apps/web/src/components/ui/tabs.tsx', (source) => source.includes('variant: _legacyVariant') && !source.includes('data-variant={')],
  ['Tab styles load globally for legacy semantic tabs', 'apps/web/src/index.css', /@import "\.\/components\/ui\/ds-tabs\.css"/],
  ['Tab targets cannot shrink below 44px or force a pill radius', 'apps/web/src/components/ui/ds-tabs.css', source => source.includes('--tab-hit-height: max(44px, var(--tab-height, 44px))') && !source.includes('border-radius: 999px') && !source.includes('- 8px') && !source.includes('- 6px')],
  ['Legacy bridge excludes Radix roots and the customer exception', 'apps/web/src/components/ui/ds-tabs.css', source => source.includes(':not([data-ds-tabs-root])') && source.includes(':not([data-ds-tabs-exempt="crm-customers"])')],
  ['Customer navigation is the explicit format exception', 'apps/web/src/pages/customers/CustomerDetailPage.tsx', /className="cust-tab-nav" data-ds-tabs-exempt="crm-customers"/],
  ['Native buttons preserve context-specific sizing', 'apps/web/src/index.css', source => !source.includes('min-height: max(44px, var(--ctl-h, 44px)) !important;') && source.includes('border-radius: var(--r-sm, 6px) !important;')],
  ['Native controls, cards, menu rows and filters inherit shape tokens', 'apps/web/src/index.css', source => source.includes('[data-ui-native-button]') && source.includes('[data-ui-card]') && source.includes('[role="menuitemradio"]') && source.includes('.filter-bar-pill, .filter-bar-clear')],
  ['Cards use one independent outline token', 'apps/web/src/index.css', source => source.includes('--card-border: var(--card-border-width) solid var(--border);') && source.includes('border: var(--card-border) !important;')],
  ['Design-system contract is documented', 'docs/DESIGN_SYSTEM.md', () => true],
  ['Metric cards separate direction from sentiment', 'apps/web/src/components/MetricCard.tsx', (source) => source.includes('const directionUp = val >= 0') && source.includes("data-sentiment={favorable ? 'positive' : 'negative'}")],
  ['Metric cards expose honest async states', 'apps/web/src/components/MetricCard.tsx', (source) => source.includes('loading?: boolean') && source.includes('error?: string') && source.includes('empty?: boolean')],
  ['DataTable distinguishes dataset and filtered empty states', 'apps/web/src/components/ui/DataTable.tsx', (source) => source.includes('filteredEmpty?: boolean') && source.includes('emptyAction?:')],
  ['DataTable uses the shared Radix action menu', 'apps/web/src/components/ui/DataTable.tsx', (source) => source.includes('<DropdownMenu>') && source.includes('aria-label="Row actions"')],
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
