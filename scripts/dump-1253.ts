import { chromium } from 'playwright';

async function main() {
  console.log('Dumping procedure 1253...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  try {
    const url = 'https://trade.tanzania.go.tz/procedure/1253?l=en';
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(10000);

    const myAppHTML = await page.evaluate(() => {
      const myApp = document.querySelector('my-app');
      return myApp ? myApp.innerHTML : 'No my-app tag found';
    });

    console.log('my-app HTML length:', myAppHTML.length);
    console.log('my-app HTML preview:', myAppHTML.slice(0, 1500));

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await browser.close();
  }
}

main();
