import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 820 } });
await page.goto('http://localhost:5173/auth/sso-complete', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('hudumika_login_theme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('.auth-alert'));
  return {
    count: all.length,
    details: all.map(el => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        background: cs.backgroundColor,
        color: cs.color,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        computedDisplay: cs.display,
        parentChain: (() => { let p = el.parentElement, chain=[]; while(p){chain.push(p.className); p=p.parentElement;} return chain; })(),
      };
    }),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
