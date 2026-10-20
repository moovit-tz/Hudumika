import { chromium } from 'playwright';

const OUT_DIR = 'C:/Users/Viden/.gemini/antigravity-ide/brain/4a8b1a4b-4d74-46fa-8815-953b1894cc5e';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to login...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Click Super Admin demo login button to test with Enterprise features unlocked
  const superAdminBtn = page.locator('button:has-text("Super Admin")').first();
  if (await superAdminBtn.count() > 0) {
    console.log('Logging in as Super Admin...');
    await superAdminBtn.click();
    await page.waitForTimeout(3000);
  }

  const targets = [
    {
      name: 'cargo_loading',
      url: 'http://localhost:5173/tracking/cargo-loading',
    },
    {
      name: 'vehicle_detail',
      url: 'http://localhost:5173/tracking/vehicles/d0e5c64e-c18b-4621-95ee-21be51923a44',
    },
  ];

  for (const target of targets) {
    console.log(`\nTesting ${target.name} (${target.url})...`);

    // --- Desktop Light (1440x900) ---
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(target.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.truck-load-overview, .freight-workspace, .vehicle-photo-stage, .truck-load-start', { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    });
    await page.waitForTimeout(1000);

    const desktopLightOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    console.log(`[${target.name}] Desktop Light Overflow: ${desktopLightOverflow}`);
    await page.screenshot({ path: `${OUT_DIR}/${target.name}_desktop_light.png`, fullPage: false });

    // --- Desktop Dark (1440x900) ---
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    });
    await page.waitForTimeout(1200);

    const desktopDarkOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    console.log(`[${target.name}] Desktop Dark Overflow: ${desktopDarkOverflow}`);
    await page.screenshot({ path: `${OUT_DIR}/${target.name}_desktop_dark.png`, fullPage: false });

    // --- Mobile Light (390x844) ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    });
    await page.waitForTimeout(1200);

    const mobileLightOverflow = await page.evaluate(() => {
      return {
        hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    console.log(`[${target.name}] Mobile Light Overflow:`, mobileLightOverflow);
    await page.screenshot({ path: `${OUT_DIR}/${target.name}_mobile_light.png`, fullPage: false });

    // --- Mobile Dark (390x844) ---
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    });
    await page.waitForTimeout(1200);

    const mobileDarkOverflow = await page.evaluate(() => {
      return {
        hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    console.log(`[${target.name}] Mobile Dark Overflow:`, mobileDarkOverflow);
    await page.screenshot({ path: `${OUT_DIR}/${target.name}_mobile_dark.png`, fullPage: false });
  }

  await browser.close();
  console.log('All screenshot captures and checks completed successfully.');
}

main().catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
