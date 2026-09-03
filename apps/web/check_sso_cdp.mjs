import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 820 } });
await page.goto('http://localhost:5173/auth/sso-complete', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('hudumika_login_theme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const client = await page.context().newCDPSession(page);
await client.send('DOM.enable');
await client.send('CSS.enable');
const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });

async function findNode(nodeId, cls) {
  const { nodeIds } = await client.send('DOM.querySelectorAll', { nodeId, selector: '.' + cls });
  return nodeIds[0];
}
const nodeId = await findNode(root.nodeId, 'auth-alert');
console.log('nodeId', nodeId);
const matched = await client.send('CSS.getMatchedStylesForNode', { nodeId });
const rules = matched.matchedCSSRules || [];
for (const r of rules) {
  const sel = r.rule.selectorList.text;
  if (sel.includes('background') || true) {
    console.log('---', sel, '| origin:', r.rule.origin, '| sheetId:', r.rule.styleSheetId);
    const bg = r.rule.style.cssProperties.find(p => p.name === 'background' || p.name === 'background-color');
    const col = r.rule.style.cssProperties.find(p => p.name === 'color');
    if (bg) console.log('    bg:', bg.value);
    if (col) console.log('    color:', col.value);
  }
}
await browser.close();
