import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 820 } });
await page.goto('http://localhost:5173/auth/sso-complete', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('hudumika_login_theme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  return {
    sheetCount: document.styleSheets.length,
    sheets: Array.from(document.styleSheets).map(s => ({ href: s.href, ownerNode: s.ownerNode ? s.ownerNode.tagName : null })),
    styleTagCount: document.querySelectorAll('style').length,
    linkTagCount: document.querySelectorAll('link[rel=stylesheet]').length,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
