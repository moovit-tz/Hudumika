// Browser check for 200% zoom and right-to-left (Arabic) layout.
//
//   node scripts/check-ui-zoom-rtl.mjs            (needs the web + API dev servers)
//
// 200% zoom on a 1280px screen lays the page out at 640 CSS px, so "zoom"
// is measured at 640x450. RTL is measured at 375 and 1440 with the Arabic
// locale (hudumika_locale=ar sets dir="rtl"). For each route it reports:
//   - page-wide horizontal scroll (design principles §3 Responsive);
//   - interactive controls pushed off-screen horizontally outside any
//     scroll container — the typical mirroring bug in RTL;
//   - page errors.
// Signs in with the seeded demo account by default (UI_AUDIT_EMAIL /
// UI_AUDIT_PASSWORD override it). Read-only: it navigates and measures.
// Exit code 1 when any route fails; --report prints without failing.
import { chromium } from 'playwright';

const base = (process.env.CONTROL_TEST_URL || 'http://localhost:5173').replace(/\/$/, '');
const email = process.env.UI_AUDIT_EMAIL || 'admin@msomi.co';
const password = process.env.UI_AUDIT_PASSWORD || 'password123';
const reportOnly = process.argv.includes('--report');
const ROUTES = (process.env.UI_AUDIT_ROUTES || 'login,crm,clearos,tracking,finance,petti,nexushr,bliss,ondi,workspace').split(',');
const MODES = [
  { name: 'zoom-200', width: 640, height: 450, locale: 'en' },
  { name: 'rtl-375', width: 375, height: 812, locale: 'ar' },
  { name: 'rtl-1440', width: 1440, height: 900, locale: 'ar' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const rows = [];
for (const mode of MODES) {
  const ctx = await browser.newContext({ viewport: { width: mode.width, height: mode.height } });
  await ctx.addInitScript((locale) => { try { localStorage.setItem('hudumika_locale', locale); } catch {} }, mode.locale);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(async ([em, pw]) => {
    const { apiFetch } = await import('/src/lib/api.ts');
    const r = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email: em, password: pw }) });
    localStorage.setItem('hudumika_user', JSON.stringify(r.user));
  }, [email, password]);
  for (const route of ROUTES) {
    const e0 = errors.length;
    let target = page; let temp = null;
    if (route === 'login') { temp = await browser.newContext({ viewport: { width: mode.width, height: mode.height } }); await temp.addInitScript((l) => { try { localStorage.setItem('hudumika_locale', l); } catch {} }, mode.locale); target = await temp.newPage(); }
    try {
      await target.goto(`${base}/${route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await target.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await sleep(1500);
      const m = await target.evaluate(() => {
        const vw = window.innerWidth;
        const hscroll = document.documentElement.scrollWidth > vw + 1;
        const scrollsX = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
        const off = [];
        for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="combobox"]')) {
          const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
          const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none') continue;
          if ((r.right <= 0 || r.left >= vw) && !scrollsX(el)) off.push(el.outerHTML.slice(0, 90).replace(/\s+/g, ' '));
        }
        return { hscroll, offscreen: off.slice(0, 5), offscreenCount: off.length, dir: document.documentElement.dir };
      });
      rows.push({ mode: mode.name, route, ...m, errors: errors.slice(e0) });
    } catch (e) {
      rows.push({ mode: mode.name, route, hscroll: false, offscreenCount: 0, offscreen: [], dir: '?', errors: [`navigation failed: ${String(e.message).slice(0, 80)}`] });
    }
    if (temp) await temp.close();
  }
  await ctx.close();
}
await browser.close();

let failed = 0;
console.log('mode       route        dir  hscroll  offscreen  errors');
for (const r of rows) {
  const bad = r.hscroll || r.offscreenCount > 0 || r.errors.length > 0;
  if (bad) failed++;
  console.log(`${r.mode.padEnd(10)} ${r.route.padEnd(12)} ${String(r.dir).padEnd(4)} ${String(r.hscroll).padEnd(8)} ${String(r.offscreenCount).padEnd(10)} ${r.errors.length}${bad ? '  ✗' : ''}`);
  for (const o of r.offscreen) console.log(`             offscreen: ${o}`);
  for (const e of r.errors) console.log(`             error: ${e}`);
}
console.log(`\n${rows.length - failed}/${rows.length} route checks passed (zoom 200% and RTL).`);
if (failed && !reportOnly) process.exit(1);
