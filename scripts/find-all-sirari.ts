import { chromium } from 'playwright';

async function main() {
  console.log('Fetching full list of Sirari procedures...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Let's search Sirari directly in the portal search URL
    const searchUrl = 'https://trade.tanzania.go.tz/objective/search?l=en&embed=&includeSearch=true&filter_tab=1&right_drawer=false';
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);

    // Let's fetch all links containing "Sirari"
    const sirariLinks = await page.evaluate(() => {
      const results: { id: string; name: string; href: string }[] = [];
      document.querySelectorAll('a[href*="/procedure/"]').forEach(a => {
        const text = a.textContent?.trim() || '';
        const href = a.getAttribute('href') || '';
        const match = href.match(/\/procedure\/(\d+)/);
        if (text.toLowerCase().includes('sirari') && match) {
          results.push({ id: match[1], name: text, href });
        }
      });
      return results;
    });

    console.log(`Found ${sirariLinks.length} Sirari procedures in search:`);
    sirariLinks.forEach(l => console.log(`  ID ${l.id}: ${l.name}`));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
