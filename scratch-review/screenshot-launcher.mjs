import { chromium } from 'playwright';
const BASE = 'http://localhost:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.locator('text=Msomi Admin').first().click();
await page.waitForTimeout(800);
const pwField = page.locator('input[type="password"]');
if (await pwField.count() > 0) {
  await pwField.fill('password123');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
}
await page.waitForTimeout(1000);
await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// The grid/launcher icon is usually right before the avatar in the header
const headerBtns = page.locator('header button, [class*="header"] button, [class*="Header"] button');
const count = await headerBtns.count();
console.log('button count:', count);
for (let i = 0; i < count; i++) {
  const title = await headerBtns.nth(i).getAttribute('title').catch(() => null);
  const aria = await headerBtns.nth(i).getAttribute('aria-label').catch(() => null);
  console.log(i, title, aria);
}
