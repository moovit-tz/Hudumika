import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
await page.getByText('Sign in instead').click({ timeout: 15000 });
await page.getByText('Super Admin').click({ timeout: 20000 });
await page.waitForURL('**/*', { timeout: 20000 });
await page.waitForTimeout(1000);

// Simulate a tenant having set a custom per-app logo (localStorage-backed,
// see useBranding.ts's getAppLogo) for a couple of apps, using a real
// square PNG asset already in the app, so the "custom icon" render path
// (LauncherApps.tsx's <img> branch) actually renders instead of the
// default SVG glyph path.
await page.evaluate(() => {
  localStorage.setItem('hudumika_app_logo_sign', '/favicon.png');
  localStorage.setItem('hudumika_app_logo_finops', '/favicon.png');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// Collapse "Getting started" if present, then scroll to the workspace grid.
const hideBtn = page.locator('text=Hide').first();
if (await hideBtn.count()) await hideBtn.click().catch(() => {});
await page.waitForTimeout(300);

const heading = page.locator('text=My Workspaces').first();
if (await heading.count()) await heading.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: 'C:/Users/Viden/AppData/Local/Temp/claude/d--Apps-Hudumika/b673e696-f0c8-4a15-9a01-3a6231b71f1f/scratchpad/logo_fix_full.png', fullPage: false });

console.log('Screenshots taken');
await browser.close();
