import { chromium } from 'playwright';

async function main() {
  console.log('Dumping procedure 1256...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const url = 'https://trade.tanzania.go.tz/procedure/1256?l=en';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(10000);

    // Expand all step accordion blocks
    await page.evaluate(() => {
      document.querySelectorAll('.row-block:not(.opened)').forEach((el: any) => el.click());
      document.querySelectorAll('.collapse:not(.in)').forEach((el: any) => el.classList.add('in'));
    });
    await page.waitForTimeout(3000);

    const myAppHTML = await page.evaluate(() => {
      const myApp = document.querySelector('my-app');
      return myApp ? myApp.innerHTML : 'No my-app tag found';
    });

    console.log('my-app HTML length:', myAppHTML.length);
    console.log('my-app HTML preview:', myAppHTML.slice(0, 1500));

    const stepLinks = await page.evaluate(() => {
      const links: { url: string; text: string }[] = [];
      document.querySelectorAll('a[href*="/step/"]').forEach(a => {
        const href = a.getAttribute('href');
        if (href) {
          links.push({
            url: href.startsWith('http') ? href : window.location.origin + '/' + href.replace(/^\//, ''),
            text: a.textContent?.trim() || ''
          });
        }
      });
      return links;
    });

    console.log(`Step links found on 1256: ${stepLinks.length}`);
    console.log('Step links:', stepLinks);

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await browser.close();
  }
}

main();
