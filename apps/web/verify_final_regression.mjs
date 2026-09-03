import { chromium } from 'playwright';
const SCRATCH = 'C:/Users/Viden/AppData/Local/Temp/claude/d--Apps-Hudumika/671ccb2c-0f8a-475a-a155-c47e9eb6294d/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
page.on('pageerror', err => console.log('[pageerror]', err.message));

// Login page still fine
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('hudumika_login_theme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: `${SCRATCH}/regress_login_dark.png` });

// OndiLogin page still fine
await page.goto('http://localhost:5173/ondi/login', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: `${SCRATCH}/regress_ondi_login_dark.png` });

// Trigger a real inline AuthAlert via ForgotPassword form submit with bad state (force error by submitting then intercepting) -
// simplest: RecoveryPage's request stage with an invalid email triggers a client-side error banner
await page.goto('http://localhost:5173/auth/recovery', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.fill('input[type=email]', 'not-an-email');
await page.click('button:has-text("Notify my recovery contacts")');
await page.waitForTimeout(400);
await page.screenshot({ path: `${SCRATCH}/regress_recovery_inline_alert.png` });

await browser.close();
console.log('done');
