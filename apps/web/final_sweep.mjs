import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
page.on('pageerror', err => console.log('[pageerror]', err.message));

const routes = [
  '/login', '/ondi/login',
  '/auth/forgot-password', '/auth/reset-password?token=t', '/auth/verify-email',
  '/accept-invite?token=t', '/auth/recovery', '/auth/magic-link', '/auth/sso-complete',
];
for (const r of routes) {
  await page.goto(`http://localhost:5173${r}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('hudumika_login_theme', 'dark'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const bad = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.auth-alert, .auth-form-hdr, .auth-btn-primary, .login-card'));
    return els.filter(el => {
      const cs = getComputedStyle(el);
      return cs.display === 'block' && (el.className.includes('auth-btn') || el.className.includes('auth-form-hdr'));
    }).map(el => el.className);
  });
  console.log(r, '-> suspect elements:', JSON.stringify(bad));
}
await browser.close();
