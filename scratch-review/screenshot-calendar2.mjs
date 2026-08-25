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

// Open Create Event modal
await page.locator('button:has-text("Create Event")').click();
await page.waitForTimeout(700);
await page.screenshot({ path: 'scratch-review/calendar-create-event.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// Open app launcher grid (9-dot icon)
const gridBtn = page.locator('button, a').filter({ has: page.locator('svg') }).nth(0);
await page.locator('header, .app-header, [class*="header"]').first().screenshot({ path: 'scratch-review/calendar-header.png' }).catch(() => {});

// Try clicking the grid icon near top right (usually a 3x3 dots icon)
const icons = await page.locator('header button, [class*="AppHeader"] button').all();
console.log('Header button count:', icons.length);
await browser.close();
process.exit(0);
