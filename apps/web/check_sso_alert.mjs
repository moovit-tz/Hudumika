import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 820 } });
await page.goto('http://localhost:5173/auth/sso-complete', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('hudumika_login_theme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const alert = document.querySelector('.auth-alert');
  const card = document.querySelector('.login-card');
  if (!alert) return { found: false, bodyText: document.body.innerText.slice(0,300) };
  const cs = getComputedStyle(alert);
  return {
    found: true,
    background: cs.backgroundColor,
    color: cs.color,
    borderColor: cs.borderColor,
    opacity: cs.opacity,
    cardBg: card ? getComputedStyle(card).backgroundColor : null,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
