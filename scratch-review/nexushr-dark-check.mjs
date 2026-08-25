import { chromium } from 'playwright';
const BASE = 'http://localhost:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('theme', 'dark'));
await page.waitForTimeout(500);
await page.click('text=Msomi Admin');
await page.waitForTimeout(2000);
await page.goto(`${BASE}/nexushr`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'scratch-review/nexushr-dark-top.png' });

await page.evaluate(() => window.scrollBy(0, 900));
await page.waitForTimeout(400);
await page.screenshot({ path: 'scratch-review/nexushr-dark-mid.png' });

await browser.close();
