import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 820 } });
await page.goto('http://localhost:5173/auth/sso-complete', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('hudumika_login_theme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  function walk(rules, sheetIdx, out) {
    for (const rule of rules) {
      try {
        if (rule.cssRules) { walk(rule.cssRules, sheetIdx, out); continue; }
        if (rule.selectorText && /\.auth-alert\b/.test(rule.selectorText)) {
          out.push({ sheetIdx, selector: rule.selectorText, cssText: rule.cssText.slice(0, 200) });
        }
      } catch (e) {}
    }
  }
  const out = [];
  Array.from(document.styleSheets).forEach((sheet, i) => {
    try { walk(sheet.cssRules, i, out); } catch (e) {}
  });
  const alertEl = document.querySelector('.auth-alert');
  return { out, inlineStyle: alertEl ? alertEl.getAttribute('style') : null };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
