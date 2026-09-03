import { chromium } from 'playwright';
const SCRATCH = 'C:/Users/Viden/AppData/Local/Temp/claude/d--Apps-Hudumika/671ccb2c-0f8a-475a-a155-c47e9eb6294d/scratchpad';
const browser = await chromium.launch();
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 480, height: 820 } });
  await page.goto('http://localhost:5173/auth/sso-complete', { waitUntil: 'networkidle' });
  await page.evaluate((t) => localStorage.setItem('hudumika_login_theme', t), theme);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SCRATCH}/auth_sso_fixed_${theme}.png` });
  await page.close();
}
await browser.close();
