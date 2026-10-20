import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('[PAGE LOG]', msg.text()));
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const managerBtn = page.locator('button:has-text("Manager")').first();
  if (await managerBtn.count() > 0) {
    await managerBtn.click();
    await page.waitForTimeout(2000);
  }
  await page.goto('http://localhost:5173/tracking/vehicles/d0e5c64e-c18b-4621-95ee-21be51923a44', { waitUntil: 'domcontentloaded' });
  console.log('Waiting for .vehicle-detail-page or error...');
  try {
    await page.waitForSelector('.vehicle-detail-page', { timeout: 12000 });
    console.log('FOUND .vehicle-detail-page!');
  } catch (err) {
    console.log('waitForSelector timed out:', err.message);
  }
  await page.waitForTimeout(1000);
  const currentUrl = page.url();
  console.log('Current URL is:', currentUrl);
  const info = await page.evaluate(async () => {
    const pageEl = document.querySelector('.vehicle-detail-page');
    if (!pageEl) {
      return { hasVehicleDetailPage: false, mainContentHtml: document.querySelector('.main-content')?.innerHTML?.slice(0, 400) };
    }
    const photoStage = pageEl.querySelector('.vehicle-photo-stage');
    const photoImg = photoStage?.querySelector('img');
    let decodeError = null;
    if (photoImg) {
      try {
        await photoImg.decode();
      } catch (e) {
        decodeError = e.message;
      }
    }
    return {
      hasVehicleDetailPage: true,
      hasPhotoStage: !!photoStage,
      imgSrc: photoImg?.src,
      imgCurrentSrc: photoImg?.currentSrc,
      imgComplete: photoImg?.complete,
      decodeError,
      imgNaturalW: photoImg?.naturalWidth,
      imgNaturalH: photoImg?.naturalHeight,
      imgOffsetW: photoImg?.offsetWidth,
      imgOffsetH: photoImg?.offsetHeight,
    };
  });
  console.log('VEHICLE DETAIL INFO:', JSON.stringify(info, null, 2));
  await browser.close();
}

main().catch(console.error);
