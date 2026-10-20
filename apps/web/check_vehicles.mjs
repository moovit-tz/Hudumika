import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const superAdminBtn = page.locator('button:has-text("Super Admin")').first();
  if (await superAdminBtn.count() > 0) {
    console.log('Logging in as Super Admin...');
    const [loginResp] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/auth/login') && resp.status() === 200, { timeout: 15000 }),
      superAdminBtn.click()
    ]);
    console.log('Login response status:', loginResp.status());
  }
  await page.waitForTimeout(2000);
  await page.goto('http://localhost:5173/tracking/vehicles', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.trk-fleet-header, .trk-vcard, .trk-title-row, .page-header', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log('CURRENT URL:', page.url());
  const text = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('PAGE TEXT SNIPPET:\n', text);
  const vehicleLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/tracking/vehicles/"]')).map(a => a.href);
  });
  console.log('VEHICLE LINKS:', vehicleLinks);
  await browser.close();
}

main().catch(console.error);
