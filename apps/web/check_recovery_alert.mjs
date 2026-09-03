import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
await page.goto('http://localhost:5173/auth/recovery', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('hudumika_login_theme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.fill('input[type=email]', 'not-an-email');
await page.click('button:has-text("Notify my recovery contacts")');
await page.waitForTimeout(400);

const info = await page.evaluate(() => {
  const alert = document.querySelector('.auth-alert');
  const cs = alert ? getComputedStyle(alert) : null;
  const tags = Array.from(document.querySelectorAll('style'));
  const loginCssTag = tags.find(t => (t.getAttribute('data-vite-dev-id')||'').includes('Login.css'));
  let ruleFound = false, ruleCount = 0;
  if (loginCssTag && loginCssTag.sheet) {
    ruleCount = loginCssTag.sheet.cssRules.length;
    for (const r of loginCssTag.sheet.cssRules) {
      if (r.selectorText === '.auth-alert') ruleFound = true;
    }
  }
  return {
    alertFound: !!alert,
    background: cs ? cs.backgroundColor : null,
    color: cs ? cs.color : null,
    display: cs ? cs.display : null,
    ruleFound, ruleCount,
    styleTagCount: tags.length,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
