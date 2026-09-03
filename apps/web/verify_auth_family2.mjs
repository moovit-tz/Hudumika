import { chromium } from 'playwright';
const SCRATCH = 'C:/Users/Viden/AppData/Local/Temp/claude/d--Apps-Hudumika/671ccb2c-0f8a-475a-a155-c47e9eb6294d/scratchpad';
const browser = await chromium.launch();

const routes = [
  { path: '/accept-invite?token=test', name: 'invite' },
  { path: '/accept-invite', name: 'invite_invalid' },
  { path: '/auth/magic-link', name: 'magiclink' },
  { path: '/auth/recovery', name: 'recovery' },
  { path: '/auth/sso-complete', name: 'sso' },
];

for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 480, height: 820 } });
  page.on('pageerror', err => console.log(`[pageerror ${theme}]`, err.message));
  for (const r of routes) {
    await page.goto(`http://localhost:5173${r.path}`, { waitUntil: 'networkidle' });
    await page.evaluate((t) => localStorage.setItem('hudumika_login_theme', t), theme);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCRATCH}/auth_${r.name}_${theme}.png` });
  }
  await page.close();
}
await browser.close();
console.log('done');
