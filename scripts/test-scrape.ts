import { chromium } from 'playwright';

async function main() {
  console.log('Starting detailed test scrape...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const url = 'https://trade.tanzania.go.tz/procedure/904?l=en';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('Waiting 10 seconds for Angular rendering...');
    await new Promise(r => setTimeout(r, 10000));

    // Get the HTML inside <my-app>
    const myAppHTML = await page.evaluate(() => {
      const myApp = document.querySelector('my-app');
      return myApp ? myApp.innerHTML : 'Not found';
    });

    console.log('--- my-app HTML length:', myAppHTML.length);
    console.log('--- Sample text in my-app:', myAppHTML.slice(0, 1000));
    
    // Let's find h1 or page titles inside my-app
    const pageTitle = await page.evaluate(() => {
      const h1 = document.querySelector('my-app h1');
      if (h1) return h1.textContent?.trim();
      const title = document.querySelector('my-app .procedure-title, my-app .page-title');
      return title ? title.textContent?.trim() : 'Title Selector not found';
    });
    console.log('Calculated Page Title inside my-app:', pageTitle);

  } catch (err) {
    console.error('Scraping failed:', err);
  } finally {
    await browser.close();
  }
}

main();
