import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
  const page = await context.newPage();

  console.log('Logging in as Super Admin...');
  await page.goto('http://localhost:5173/login');
  await page.locator('button:has-text("Super Admin")').click();
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });

  console.log('Navigating to http://localhost:5173/sign/editor?mode=compose ...');
  await page.goto('http://localhost:5173/sign/editor?mode=compose', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);

  console.log('Clicking Open Blank Parchment Editor...');
  await page.locator('button:has-text("Open Blank Parchment Editor")').click();
  await page.waitForTimeout(2000);

  const screenshotPath = 'C:/Users/Viden/.gemini/antigravity-ide/brain/4a8b1a4b-4d74-46fa-8815-953b1894cc5e/editing_compose_view.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);

  await browser.close();
}

run().catch(console.error);
