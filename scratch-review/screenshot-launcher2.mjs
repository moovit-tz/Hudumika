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
await page.locator('button[title="All apps"]').click();
await page.waitForTimeout(700);
await page.screenshot({ path: 'scratch-review/calendar-launcher.png' });
await browser.close();
process.exit(0);
