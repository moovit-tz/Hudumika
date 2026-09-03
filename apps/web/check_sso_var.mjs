import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 820 } });
page.on('console', m => console.log('[console]', m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/auth/sso-complete', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('hudumika_login_theme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const alert = document.querySelector('.auth-alert');
  const root = document.querySelector('.login-page');
  const cs = alert ? getComputedStyle(alert) : null;
  return {
    hasFailedText: document.body.innerText,
    alertOuterHTML: alert ? alert.outerHTML.slice(0, 200) : null,
    lpErrorBgAtAlert: cs ? cs.getPropertyValue('--lp-error-bg') : null,
    lpErrorBgAtRoot: root ? getComputedStyle(root).getPropertyValue('--lp-error-bg') : null,
    lpCardBgAtRoot: root ? getComputedStyle(root).getPropertyValue('--lp-card-bg') : null,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
