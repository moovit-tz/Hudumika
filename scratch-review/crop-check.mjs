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

// Crop the HuduPlus Plan banner
await page.locator('text=HuduPlus Plan').first().screenshot({ path: 'scratch-review/hudu-plus-badge.png' }).catch(e => console.log('e1', e.message));
// Crop the Meet with... row
await page.locator('text=Meet with').first().screenshot({ path: 'scratch-review/meet-with.png' }).catch(e => console.log('e2', e.message));
// Zoom into the launcher popover icons closely
await page.locator('button[title="All apps"]').click();
await page.waitForTimeout(500);
const grid = page.locator('text=Web Apps').locator('..').first();
await grid.screenshot({ path: 'scratch-review/launcher-zoom.png' }).catch(e => console.log('e3', e.message));

await browser.close();
process.exit(0);
