import { chromium } from 'playwright';

async function main() {
  console.log('Scanning IDs 1250 to 1270...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  for (let id = 1250; id <= 1270; id++) {
    const page = await context.newPage();
    try {
      await page.goto(`https://trade.tanzania.go.tz/procedure/${id}?l=en`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(4000);

      const res = await page.evaluate(() => {
        const breadcrumbs = [...document.querySelectorAll('ol.breadcrumbs li')].map(li => li.textContent?.trim());
        const linksCount = document.querySelectorAll('a[href*="/step/"]').length;
        return { title: breadcrumbs[0] || null, linksCount };
      });

      if (res.title) {
        console.log(`ID ${id}: ${res.title} (${res.linksCount} steps)`);
      }
    } catch {
      // ignore 404s
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

main();
