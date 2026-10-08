import { readFile, writeFile, mkdir } from 'node:fs/promises';

const shell = await readFile('apps/web/src/shells/FinOpsShell.tsx', 'utf8');
const pages = [...new Set([...shell.matchAll(/from ['"]\.\.\/pages\/([^'"]+)\.js['"]/g)].map(match => match[1]))];
const inventory = [];
for (const page of pages) {
  const path = `apps/web/src/pages/${page}.tsx`;
  const source = await readFile(path, 'utf8');
  inventory.push({
    file: path,
    sharedHeader: source.includes('PageHeader'),
    sharedButton: /components\/ui\/button/.test(source),
    sharedTabs: /components\/ui\/tabs/.test(source),
    nativeControls: [...source.matchAll(/<(button|input|textarea|select)\b/g)].reduce((counts, match) => ({ ...counts, [match[1]]: (counts[match[1]] || 0) + 1 }), {}),
    apiCalls: [...new Set([...source.matchAll(/apiFetch(?:<[^>\n]+>)?\s*\(\s*([`'"])(.*?)\1/g)].map(match => match[2]))],
    importedHooks: [...source.matchAll(/from ['"]\.\.\/hooks\/([^'"]+)['"]/g)].map(match => match[1]),
    silentEmptyFallbacks: [...source.matchAll(/\.catch\(\(\) =>[^\n]+/g)].map(match => match[0]),
  });
}
await mkdir('docs/finance', { recursive: true });
await writeFile('docs/finance/PAGE_AUDIT_INVENTORY.json', JSON.stringify({ generatedAt: new Date().toISOString(), caveat: 'Static inventory, not certification. API calls may also live in imported hooks or components. Native controls require manual review; presence alone does not prove a defect.', pages: inventory }, null, 2) + '\n');
console.log(`Inventoried ${inventory.length} Finance page modules.`);
