import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';

const controlled = new Set(['display','flex-wrap','flex','flex-grow','flex-shrink','gap','height','min-height','max-height','width','min-width','max-width','padding','padding-top','padding-bottom','padding-left','padding-right','padding-inline','padding-block','border','border-width','border-radius','border-color','border-bottom','background','background-color','color','font','font-family','font-size','font-weight','box-shadow']);
let removed = 0;
function walk(dir) {
  for (const entry of readdirSync(dir, {withFileTypes:true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { walk(path); continue; }
    if (!path.endsWith('.css') || entry.name === 'ds-tabs.css' || path.replaceAll('\\', '/') === 'apps/web/src/index.css') continue;
    const original = readFileSync(path, 'utf8');
    const css = postcss.parse(original, {from:path});
    let edits = 0;
    css.walkRules(rule => {
      if (!/\.ds-tabs-(?:list|trigger)(?![\w-])|\[role=["']?tab(?:list)?["']?\]/.test(rule.selector)) return;
      rule.walkDecls(decl => { if (controlled.has(decl.prop)) { decl.remove(); edits++; } });
      if (!rule.nodes.length) rule.remove();
    });
    if (edits) { writeFileSync(path, css.toString()); removed += edits; console.log(`${path}: ${edits}`); }
  }
}
walk('apps/web/src');
console.log(`Removed ${removed} page-level overrides of shared tab presentation.`);
