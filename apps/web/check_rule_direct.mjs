import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 820 } });
await page.goto('http://localhost:5173/auth/sso-complete', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('hudumika_login_theme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const tags = Array.from(document.querySelectorAll('style'));
  const loginCssTag = tags.find(t => (t.getAttribute('data-vite-dev-id')||'').includes('Login.css'));
  const sheet = loginCssTag.sheet;
  const out = [];
  for (let i = 0; i < sheet.cssRules.length; i++) {
    const r = sheet.cssRules[i];
    if (r.selectorText && r.selectorText.includes('auth-alert')) {
      out.push({ idx: i, selector: r.selectorText, cssText: r.cssText });
    }
  }
  // also check what's at the boundary just before/after in file order
  return { totalRules: sheet.cssRules.length, matches: out };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
