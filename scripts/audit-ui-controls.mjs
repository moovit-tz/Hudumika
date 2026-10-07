import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const rows = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (path.endsWith('.tsx')) {
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const row = { file: relative(root, path).replaceAll('\\', '/'), sharedTabs: 0, semanticStrips: 0, legacyStrips: [], nativeButtons: 0, tokenLinkedNativeButtons: 0, explicitStrips: 0, sharedButtons: 0, inlineRadii: 0, tabActions: [] };
      function visit(node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(source);
          const attrs = node.attributes.properties;
          const attr = name => attrs.find(a => ts.isJsxAttribute(a) && a.name.getText(source) === name)?.initializer?.getText(source) ?? '';
          if (tag === 'TabsList') row.sharedTabs++;
          if (attr('role') === '"tablist"') row.semanticStrips++;
          if (attr('data-ds-tabstrip')) row.explicitStrips++;
          if (tag === 'button') {
            row.nativeButtons++;
            if (attr('data-ui-native-button')) row.tokenLinkedNativeButtons++;
            if (/set\w*Tab|handleTabChange/.test(attr('onClick'))) {
              let parent = node.parent.parent;
              while (parent && !ts.isJsxElement(parent)) parent = parent.parent;
              row.tabActions.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, container: parent?.openingElement.getText(source) ?? '' });
            }
          }
          if (tag === 'Button') row.sharedButtons++;
          if (/borderRadius\s*:/.test(attr('style'))) row.inlineRadii++;
          if (/tabs|tabstrip|tab-nav|tab-strip/.test(attr('className')) && !['Tabs', 'TabsList', 'TabsTrigger'].includes(tag)) row.legacyStrips.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, className: attr('className'), exemption: attr('data-ds-tabs-exempt') });
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      rows.push(row);
    }
  }
}
walk(join(root, 'apps/web/src/pages'));
walk(join(root, 'apps/web/src/components'));
const report = { generatedAt: new Date().toISOString(), scope: 'All page and component TSX sources; static inventory, not a claim of screen-by-screen or backend functional testing.', totals: { files: rows.length, pageFiles: rows.filter(r => r.file.includes('/pages/')).length, sharedTabLists: rows.reduce((n,r) => n+r.sharedTabs,0), semanticStrips: rows.reduce((n,r) => n+r.semanticStrips,0), nativeButtons: rows.reduce((n,r) => n+r.nativeButtons,0), tokenLinkedNativeButtons: rows.reduce((n,r) => n+r.tokenLinkedNativeButtons,0), explicitStrips: rows.reduce((n,r) => n+r.explicitStrips,0), sharedButtons: rows.reduce((n,r) => n+r.sharedButtons,0) }, files: rows };
writeFileSync(join(root, 'docs/production-readiness/ui-controls-inventory-2026-10-07.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.totals));
console.log('Tab action containers:');
console.log([...new Set(rows.flatMap(r => r.tabActions.map(a => a.container)))].join('\n'));
