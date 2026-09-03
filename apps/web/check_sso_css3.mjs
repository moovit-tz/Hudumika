import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 820 } });
await page.goto('http://localhost:5173/auth/sso-complete', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('hudumika_login_theme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const tags = Array.from(document.querySelectorAll('style'));
  const found = [];
  tags.forEach((t, i) => {
    if (t.textContent.includes('.auth-alert')) {
      const idx = t.textContent.indexOf('.auth-alert {');
      found.push({ index: i, snippet: t.textContent.slice(idx, idx + 300), dataAttrs: t.getAttribute('data-vite-dev-id') });
    }
  });
  return { totalStyleTags: tags.length, found };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
