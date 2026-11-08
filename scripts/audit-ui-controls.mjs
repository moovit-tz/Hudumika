import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const normalize = process.argv.includes('--normalize');
const output = process.argv.find(value => value.startsWith('--output='))?.slice(9) ?? 'docs/production-readiness/ui-controls-inventory-2026-10-07.json';
const rows = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (path.endsWith('.tsx')) {
      const original = readFileSync(path, 'utf8');
      const source = ts.createSourceFile(path, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const edits = [];
      const row = { file: relative(root, path).replaceAll('\\', '/'), sharedTabs: 0, semanticStrips: 0, legacyStrips: [], nativeButtons: 0, tokenLinkedNativeButtons: 0, explicitStrips: 0, sharedButtons: 0, inlineRadii: 0, tabActions: [] };
      function visit(node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(source);
          const attrs = node.attributes.properties;
          const attr = name => attrs.find(a => ts.isJsxAttribute(a) && a.name.getText(source) === name)?.initializer?.getText(source) ?? '';
          const isField = ['input', 'textarea', 'select', 'Input', 'Textarea', 'SelectTrigger'].includes(tag);
          const isButton = ['Button', 'button'].includes(tag);
          const protectedControl = /avatar|swatch|stepper|theme-switch|theme-toggle|login-toggle|calendar-day|rte-|code-editor|resize|drag-handle|otp|pin-input/.test(attr('className')) || attr('role') === '"tab"' || attr('data-ds-control-exempt');
          const specialType = /checkbox|radio|hidden|file|range|color|image|submit|reset/.test(attr('type'));
          if (normalize && !path.replaceAll('\\', '/').includes('/components/ui/') && !protectedControl && !specialType && (isField || isButton)) {
            const hasAttribute = name => attrs.some(a => ts.isJsxAttribute(a) && a.name.getText(source) === name);
            if (tag === 'button' && !hasAttribute('data-ui-native-button')) edits.push({ start: node.tagName.end, end: node.tagName.end, text: ' data-ui-native-button=""' });
            const bareStyle = /border\s*:\s*(?:0\b|['"]none['"])/.test(attr('style'));
            if (['input', 'textarea', 'select'].includes(tag) && !attrs.some(a => ts.isJsxAttribute(a) && a.name.getText(source) === 'data-ui-field')) {
              const bare = bareStyle || /search|filter-input|inline-input|stb-input/.test(attr('className')) || attr('type') === '"search"';
              edits.push({ start: node.tagName.end, end: node.tagName.end, text: ` data-ui-field="${tag === 'textarea' ? 'textarea' : tag}"${bare ? ' data-field-appearance="bare"' : ''}` });
            }
            if (['input', 'textarea', 'select'].includes(tag) && hasAttribute('data-ui-field') && !hasAttribute('data-field-appearance') && bareStyle) edits.push({ start: node.tagName.end, end: node.tagName.end, text: ' data-field-appearance="bare"' });
            const style = attrs.find(a => ts.isJsxAttribute(a) && a.name.getText(source) === 'style')?.initializer;
            let expression = style && ts.isJsxExpression(style) ? style.expression : undefined;
            if (expression && ts.isAsExpression(expression)) expression = expression.expression;
            if (expression && ts.isObjectLiteralExpression(expression)) {
              const widthProperty = expression.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === 'width');
              const widthValue = widthProperty && ts.isPropertyAssignment(widthProperty) && ts.isNumericLiteral(widthProperty.initializer) ? Number(widthProperty.initializer.text) : undefined;
              const widthToken = widthProperty && ts.isPropertyAssignment(widthProperty) && ts.isStringLiteral(widthProperty.initializer) && /^var\(--ctl-h(?:-xs)?\)$/.test(widthProperty.initializer.text) ? widthProperty.initializer.text : undefined;
              const childText = ts.isJsxElement(node.parent) ? node.parent.children.filter(ts.isJsxText).map(n => n.text.trim()).join('') : '';
              const iconOnly = isButton && (attr('size') === '"icon"' || (widthToken || widthValue > 0 && widthValue <= 64) && childText.length <= 2);
              const iconHeight = widthToken ?? (widthValue <= 28 ? 'var(--ctl-h-xs)' : 'var(--ctl-h)');
              const compact = /"(?:sm|icon|xs)"/.test(attr('size'));
              const height = isField || compact ? 'var(--ctl-h)' : 'var(--action-h)';
              const py = isField ? 'var(--ds-input-py)' : compact ? 'var(--ds-btn-py-sm)' : 'var(--action-py)';
              const backgroundProperty = expression.properties.find(p => ts.isPropertyAssignment(p) && ['background', 'backgroundColor'].includes(p.name.getText(source)));
              const background = backgroundProperty && ts.isPropertyAssignment(backgroundProperty) && ts.isStringLiteral(backgroundProperty.initializer) ? backgroundProperty.initializer.text : '';
              const brandBlue = value => /^#(?:2563eb|1d4ed8|1e40af|3b82f6|0066cc|0066ff|007bff|1257c6|026bc7|0b1e3a|0e1f3d)$/i.test(String(value));
              const provider = /google|microsoft|apple|paypal|stripe/.test(attr('className'));
              for (const property of expression.properties) {
                if (!ts.isPropertyAssignment(property)) continue;
                const name = property.name.getText(source).replaceAll(/['"]/g, '');
                const value = property.initializer;
                const literal = ts.isNumericLiteral(value) ? Number(value.text) : ts.isStringLiteral(value) ? value.text : undefined;
                if (literal === undefined) continue;
                if (String(literal).includes('var(')) {
                  if (iconOnly && ['width', 'height', 'minHeight', 'minWidth'].includes(name) && /^var\(--(?:action-h|ctl-h(?:-xs)?)\)$/.test(String(literal)) && literal !== iconHeight) edits.push({ start: value.getStart(source), end: value.end, text: JSON.stringify(iconHeight) });
                  continue;
                }
                let token;
                if (iconOnly && ['width', 'height', 'minHeight', 'minWidth'].includes(name)) token = iconHeight;
                if (name === 'borderRadius' && literal !== '50%' && literal !== 9999 && literal !== 999) token = 'var(--r-sm)';
                if (['height', 'minHeight'].includes(name) && tag !== 'textarea' && tag !== 'Textarea' && (typeof literal === 'number' || /^\d+px$/.test(literal))) token = iconOnly ? iconHeight : height;
                if (name === 'fontFamily') token = 'var(--font)';
                if (name === 'fontSize' && (typeof literal === 'number' || /^\d+(?:\.\d+)?px$/.test(literal))) token = Number.parseFloat(String(literal)) <= 11 ? 'var(--text-xs)' : 'var(--text-base)';
                if (name === 'padding' && (typeof literal === 'number' && literal > 0 || /^(?:\d+(?:\.\d+)?(?:px)?\s*){1,4}$/.test(String(literal)) && Number.parseFloat(String(literal)) > 0)) token = `${py} var(--space-md)`;
                if (['paddingTop', 'paddingBottom', 'paddingBlock'].includes(name) && typeof literal === 'number' && literal > 0) token = py;
                if (name === 'paddingInline' && typeof literal === 'number' && literal > 0) token = 'var(--space-md)';
                if (isField && ['background', 'backgroundColor'].includes(name) && /^#(?:fff(?:fff)?|f[0-9a-f]{5})$/i.test(String(literal))) token = 'var(--white)';
                if (isField && name === 'color' && /^#(?:000(?:000)?|111(?:111)?|1f2937|0f172a|334155|374151|64748b|475569)$/i.test(String(literal))) token = 'var(--ink)';
                if (isField && ['borderColor'].includes(name) && /^#[0-9a-f]{3,8}$/i.test(String(literal))) token = 'var(--border)';
                if (isField && name === 'border' && /^1(?:\.5)?px solid #[0-9a-f]{3,8}$/i.test(String(literal))) token = 'var(--border-width) solid var(--border)';
                if (isButton && !provider && ['background', 'backgroundColor'].includes(name) && brandBlue(literal)) token = 'hsl(var(--primary))';
                if (isButton && !provider && name === 'color' && brandBlue(literal)) token = 'var(--teal)';
                if (isButton && !provider && name === 'color' && /^#fff(?:fff)?$/i.test(String(literal)) && brandBlue(background)) token = 'hsl(var(--primary-foreground))';
                if (isButton && ['background', 'backgroundColor'].includes(name) && /^#(?:fff(?:fff)?|f8fafc|f1f5f9|f9fafb|f3f4f6)$/i.test(String(literal))) token = 'var(--white)';
                if (isButton && name === 'color' && /^#(?:000(?:000)?|111(?:111)?|1f2937|0f172a|334155|374151|64748b|475569)$/i.test(String(literal))) token = 'var(--ink)';
                if (isButton && name === 'borderColor' && brandBlue(literal)) token = 'var(--teal)';
                if (token) edits.push({ start: value.getStart(source), end: value.end, text: JSON.stringify(token) });
              }
            }
          }
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
      row.normalizedProperties = edits.filter(edit => edit.start !== edit.end).length;
      row.linkedNativeFields = edits.filter(edit => edit.start === edit.end && edit.text.includes('data-ui-field')).length;
      row.linkedNativeActions = edits.filter(edit => edit.start === edit.end && edit.text.includes('data-ui-native-button')).length;
      row.bareFieldExemptions = edits.filter(edit => edit.start === edit.end && edit.text.includes('data-field-appearance')).length;
      if (edits.length) {
        let updated = original;
        for (const edit of edits.sort((a, b) => b.start - a.start)) updated = updated.slice(0, edit.start) + edit.text + updated.slice(edit.end);
        writeFileSync(path, updated);
      }
      rows.push(row);
    }
  }
}
walk(join(root, 'apps/web/src/pages'));
walk(join(root, 'apps/web/src/components'));
const report = { generatedAt: new Date().toISOString(), scope: 'All page and component TSX sources; static inventory, not a claim of screen-by-screen or backend functional testing.', totals: { files: rows.length, pageFiles: rows.filter(r => r.file.includes('/pages/')).length, sharedTabLists: rows.reduce((n,r) => n+r.sharedTabs,0), semanticStrips: rows.reduce((n,r) => n+r.semanticStrips,0), nativeButtons: rows.reduce((n,r) => n+r.nativeButtons,0), tokenLinkedNativeButtons: rows.reduce((n,r) => n+r.tokenLinkedNativeButtons,0), explicitStrips: rows.reduce((n,r) => n+r.explicitStrips,0), sharedButtons: rows.reduce((n,r) => n+r.sharedButtons,0) }, files: rows };
report.normalization = { applied: normalize, files: rows.filter(row => row.normalizedProperties || row.linkedNativeFields || row.linkedNativeActions || row.bareFieldExemptions).length, properties: rows.reduce((sum, row) => sum + row.normalizedProperties, 0), fields: rows.reduce((sum, row) => sum + row.linkedNativeFields, 0), actions: rows.reduce((sum, row) => sum + row.linkedNativeActions, 0), bareFieldExemptions: rows.reduce((sum, row) => sum + row.bareFieldExemptions, 0) };
writeFileSync(join(root, output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.totals));
console.log(JSON.stringify(report.normalization));
if (process.argv.includes('--quiet')) process.exit(0);
console.log('Tab action containers:');
console.log([...new Set(rows.flatMap(r => r.tabActions.map(a => a.container)))].join('\n'));
