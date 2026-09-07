import { chromium } from 'playwright';
const dir = 'C:\\Users\\Viden\\AppData\\Local\\Temp\\claude\\d--Apps-Hudumika\\671ccb2c-0f8a-475a-a155-c47e9eb6294d\\scratchpad\\';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto('http://localhost:5173/auth/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
await page.locator('input[type="email"], input[name="email"]').first().fill('admin@msomi.co');
await page.locator('input[type="password"]').first().fill('password123');
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);
await page.goto('http://localhost:5173/bliss/inbox', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const firstTicket = page.locator('text=/East African Breweries/').first();
await firstTicket.click();
await page.waitForTimeout(1000);
await page.locator('button:has-text("Edit")').first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: dir + 'edit-light.png' });

// Open the Category dropdown to see its content styling
await page.locator('text=Category').locator('..').locator('button, [role="combobox"]').first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: dir + 'edit-catopen.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// Trigger validation error
const subjectInput = page.locator('input[maxlength="300"]');
await subjectInput.fill('');
await page.locator('button:has-text("Save changes")').click();
await page.waitForTimeout(300);
await page.screenshot({ path: dir + 'edit-error.png' });

// Now dark mode
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.waitForTimeout(400);
await page.screenshot({ path: dir + 'edit-dark.png' });

await browser.close();
console.log('DONE');
