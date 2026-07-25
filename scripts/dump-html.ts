import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Starting html dumper...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const url = 'https://trade.tanzania.go.tz/procedure/904?l=en';
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await new Promise(r => setTimeout(r, 10000));

    const html = await page.evaluate(() => {
      const myApp = document.querySelector('my-app');
      return myApp ? myApp.innerHTML : '';
    });

    const outputPath = path.resolve(__dirname, '../my_app_dump.html');
    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`Successfully saved HTML to ${outputPath} (length: ${html.length})`);

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await browser.close();
  }
}

main();
