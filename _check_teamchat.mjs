import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(500);
await page.getByText('Sign in instead').click({ timeout: 15000 });
await page.waitForTimeout(800);
await page.getByText('Tenant Admin').click({ timeout: 20000 });
await page.waitForTimeout(3000);

await page.goto('http://localhost:5173/bliss/inbox?view=team', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

// Scroll the channel list to find one with real history (not "Start chatting...")
const rows = page.locator('.spt-inbox-item, [class*="conv"], [class*="channel-row"]');
const items = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('a,div,button').forEach(el => {
    if (el.textContent && el.textContent.includes('Start chatting')) return;
  });
  return out;
});

await page.screenshot({ path: 'C:/Users/Viden/AppData/Local/Temp/claude/d--Apps-Hudumika/b673e696-f0c8-4a15-9a01-3a6231b71f1f/scratchpad/teamchat_full.png', fullPage: true });
console.log('URL:', page.url());
await browser.close();
