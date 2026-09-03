import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 820 } });
await page.goto('http://localhost:5173/auth/sso-complete', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('hudumika_login_theme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const tags = Array.from(document.querySelectorAll('style'));
  const loginCssTag = tags.find(t => (t.getAttribute('data-vite-dev-id')||'').includes('Login.css'));
  if (!loginCssTag) return { found: false };
  const sheet = loginCssTag.sheet;
  let ruleCount = null, err = null;
  try { ruleCount = sheet.cssRules.length; } catch(e) { err = e.message; }
  return {
    found: true,
    media: loginCssTag.media,
    disabled: loginCssTag.disabled,
    sheetDisabled: sheet ? sheet.disabled : null,
    sheetMedia: sheet ? sheet.media.mediaText : null,
    ruleCount, err,
    attrs: Array.from(loginCssTag.attributes).map(a => `${a.name}=${a.value}`),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
