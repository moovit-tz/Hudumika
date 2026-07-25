import { chromium } from 'playwright';

async function main() {
  console.log('Searching trade.tanzania.go.tz for Sirari procedure IDs...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const url = 'https://trade.tanzania.go.tz/Procedures?l=en';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(8000);

    const procedures = await page.evaluate(() => {
      const list: { id: string; name: string; url: string }[] = [];
      document.querySelectorAll('a[href*="/procedure/"]').forEach(a => {
        const href = a.getAttribute('href') || '';
        const match = href.match(/\/procedure\/(\d+)/);
        if (match) {
          list.push({
            id: match[1],
            name: a.textContent?.trim() || '',
            url: href
          });
        }
      });
      return list;
    });

    console.log(`Total procedures listed on /Procedures page: ${procedures.length}`);
    const sirariProcs = procedures.filter(p => p.name.toLowerCase().includes('sirari') || p.name.toLowerCase().includes('beverages') || p.name.toLowerCase().includes('medical device'));
    console.log('\nMatching Sirari / Beverages / Medical devices procedures:');
    sirariProcs.forEach(p => console.log(`  ID ${p.id}: ${p.name}`));

  } catch (err) {
    console.error('Search failed:', err);
  } finally {
    await browser.close();
  }
}

main();
