import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

let controls = 0;
let files = 0;
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'ui') walk(path); continue; }
    if (!path.endsWith('.tsx') || path.endsWith('TopBar.tsx')) continue;
    let text = readFileSync(path, 'utf8');
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const edits = [];
    function visit(node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'button') {
        const markup = node.getText(source);
        // Radio/switch/checkbox controls and avatars retain their own geometry.
        if (!/data-ui-native-button|data-ui-chrome-button|role=["'](?:radio|switch|checkbox)["']|className=["'][^"']*avatar/i.test(markup)) {
          edits.push(node.end - (ts.isJsxSelfClosingElement(node) ? 2 : 1));
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const pos of edits.sort((a,b) => b-a)) text = text.slice(0,pos) + ' data-ui-native-button=""' + text.slice(pos);
    if (edits.length) { writeFileSync(path, text); files++; controls += edits.length; }
  }
}
walk('apps/web/src/pages');
walk('apps/web/src/components');
console.log(`Connected ${controls} native buttons in ${files} files to shared geometry. No handlers or types changed.`);
