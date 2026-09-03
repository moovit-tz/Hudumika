import { chromium } from 'playwright';
const SCRATCH = 'C:/Users/Viden/AppData/Local/Temp/claude/d--Apps-Hudumika/671ccb2c-0f8a-475a-a155-c47e9eb6294d/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 700, height: 400 } });
page.on('pageerror', err => console.log('[pageerror]', err.message));

// Log in as superadmin first (needed to reach an authenticated PageHeader page)
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.click('button:has-text("Super Admin")').catch(() => {});
await page.waitForTimeout(1500);

for (const lang of ['en', 'ar', 'zh']) {
  await page.evaluate((l) => {
    localStorage.setItem('i18nextLng', l);
    localStorage.setItem('hudumika_locale', l);
  }, lang);
  await page.goto('http://localhost:5173/ondi/kyc', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const em = document.querySelector('.page-header-title em');
    const h1 = document.querySelector('.page-header-title');
    if (!em) return { found: false, bodyText: document.body.innerText.slice(0,200) };
    const cs = getComputedStyle(em);
    return {
      found: true,
      hasCjkClass: h1.className.includes('ph-cjk'),
      fontFamily: cs.fontFamily,
      fontStyle: cs.fontStyle,
      fontWeight: cs.fontWeight,
      color: cs.color,
    };
  });
  console.log(lang, JSON.stringify(info));
  const el = await page.$('.page-header-title')?.catch(()=>null);
  if (el) await el.screenshot({ path: `${SCRATCH}/ph_locale_${lang}.png` }).catch(()=>{});
}
await browser.close();
