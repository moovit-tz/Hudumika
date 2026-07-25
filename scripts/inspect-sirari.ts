import { chromium } from 'playwright';

async function main() {
  console.log('Inspecting Sirari procedures 1253 and 1256...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const ids = [1253, 1256];

  for (const id of ids) {
    const page = await context.newPage();
    const url = `https://trade.tanzania.go.tz/procedure/${id}?l=en`;
    console.log(`\nNavigating to ${url}...`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(8000);

      // Expand all step accordion blocks if collapsed
      await page.evaluate(() => {
        // Expand all collapsed block headers
        document.querySelectorAll('.row-block:not(.opened)').forEach((el: any) => el.click());
        document.querySelectorAll('.collapse:not(.in)').forEach((el: any) => el.classList.add('in'));
      });
      await page.waitForTimeout(2000);

      const info = await page.evaluate(() => {
        const breadcrumbs = [...document.querySelectorAll('ol.breadcrumbs li')].map(li => li.textContent?.trim());
        const title = breadcrumbs[0] || document.querySelector('h1')?.textContent?.trim() || 'Unknown';
        
        // Find all step links
        const stepLinks: { url: string; text: string; isOptional: boolean }[] = [];
        document.querySelectorAll('a[href*="/step/"]').forEach(a => {
          const href = a.getAttribute('href');
          if (href) {
            const parentRow = a.closest('.row-step, .step-list-item');
            const isOpt = parentRow ? parentRow.textContent?.includes('*') || parentRow.classList.contains('optional') : false;
            stepLinks.push({
              url: href.startsWith('http') ? href : window.location.origin + '/' + href.replace(/^\//, ''),
              text: a.textContent?.trim() || '',
              isOptional: !!isOpt
            });
          }
        });

        // Block headings (groups of steps)
        const groups: string[] = [];
        document.querySelectorAll('.row-block .inner').forEach(el => {
          const t = el.textContent?.trim();
          if (t) groups.push(t);
        });

        return { title, groups, stepLinksCount: stepLinks.length, stepLinks: stepLinks.slice(0, 10) };
      });

      console.log(`Title for ${id}:`, info.title);
      console.log(`Groups found (${info.groups.length}):`, info.groups);
      console.log(`Total step links found: ${info.stepLinksCount}`);
      console.log('Sample step links:', info.stepLinks);

    } catch (err) {
      console.error(`Error inspecting ${id}:`, err);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

main();
