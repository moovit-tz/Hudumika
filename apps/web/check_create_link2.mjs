import { chromium } from 'playwright';
const SCRATCH = 'C:/Users/Viden/AppData/Local/Temp/claude/d--Apps-Hudumika/671ccb2c-0f8a-475a-a155-c47e9eb6294d/scratchpad';
const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 420, height: 500 } });
  await page.goto('http://localhost:5173/ondi/login', { waitUntil: 'networkidle' });
  await page.evaluate((t) => localStorage.setItem('hudumika_login_theme', t), theme);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const card = await page.$('.login-card');
  await card.screenshot({ path: `${SCRATCH}/create_link_after_${theme}.png` });
  await page.close();
}
await browser.close();
