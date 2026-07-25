import { chromium } from 'playwright';

async function main() {
  const ids = [1439, 1253, 1435, 1437, 1436, 1445, 1447, 1446, 1444, 1256, 1255];
  console.log(`Checking ${ids.length} Sirari procedures...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  for (const id of ids) {
    const page = await context.newPage();
    const url = `https://trade.tanzania.go.tz/procedure/${id}?l=en`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);

      // Expand all accordion blocks
      await page.evaluate(() => {
        document.querySelectorAll('.row-block:not(.opened)').forEach((el: any) => el.click());
        document.querySelectorAll('.collapse:not(.in)').forEach((el: any) => el.classList.add('in'));
      });

      const res = await page.evaluate(() => {
        const h1 = document.querySelector('h1')?.textContent?.trim();
        const breadcrumbs = [...document.querySelectorAll('ol.breadcrumbs li')].map(li => li.textContent?.trim());
        const linksCount = document.querySelectorAll('a[href*="/step/"]').length;
        const groupsCount = document.querySelectorAll('.row-block').length;
        return { h1, breadcrumb: breadcrumbs[0], linksCount, groupsCount };
      });

      console.log(`ID ${id}: ${res.breadcrumb || res.h1 || 'Unknown'} => ${res.linksCount} step links, ${res.groupsCount} accordion groups`);

    } catch (err) {
      console.log(`ID ${id}: ERROR - ${(err as Error).message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

main();
