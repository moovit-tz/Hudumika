import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('BROWSER PAGE ERROR:', err));
  page.on('request', req => {
    if (req.url().includes('/v1/')) {
      console.log('REQ:', req.method(), req.url());
    }
  });
  page.on('response', res => {
    if (res.url().includes('/v1/')) {
      console.log('RESP:', res.status(), res.url());
    }
  });

  console.log('Logging in as Manager...');
  await page.goto('http://localhost:5173/login');
  await page.locator('button:has-text("Manager")').click();
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });
  console.log('Landed on:', page.url());

  console.log('Navigating to http://localhost:5173/cloud...');
  await page.goto('http://localhost:5173/cloud', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(4000);

  const drivesText = await page.evaluate(() => {
    return {
      user: localStorage.getItem('hudumika_user'),
      loadingEl: document.querySelector('.cloud-home-loading')?.outerHTML,
      bannerEl: document.querySelector('.cloud-home-root')?.outerHTML,
      errorEl: document.querySelector('[class*="error"], [class*="alert"]')?.outerHTML,
      title: document.title,
      htmlSnippet: document.querySelector('.app-shell-content')?.innerHTML?.slice(0, 500)
    };
  });
  console.log('EVAL DATA:', drivesText);

  await browser.close();
}

run().catch(console.error);
