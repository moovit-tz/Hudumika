import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 820 } });
await page.goto('http://localhost:5173/auth/sso-complete', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('hudumika_login_theme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const alert = document.querySelector('.auth-alert');
  const loginPage = document.querySelector('.login-page');
  // find which stylesheets contain a rule for .auth-alert
  const matches = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText && rule.selectorText.includes('.auth-alert') && !rule.selectorText.includes('-ok')) {
          matches.push({ href: sheet.href, selector: rule.selectorText, cssText: rule.cssText });
        }
      }
    } catch (e) { matches.push({ href: sheet.href, error: e.message }); }
  }
  return {
    alertClassName: alert ? alert.className : null,
    alertParentClassName: alert ? alert.parentElement.className : null,
    loginPageFound: !!loginPage,
    loginPageDataTheme: loginPage ? loginPage.getAttribute('data-theme') : null,
    matches,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
