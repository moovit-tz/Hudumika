import { chromium } from 'playwright';
const OUT = 'C:/Users/Viden/AppData/Local/Temp/claude/d--Apps-Hudumika/b505970b-aa61-421e-a029-7d1b5ed6fb89/scratchpad';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.locator('text=Super Admin').first().click();
await page.waitForTimeout(2000);

console.log('--- Navigate to Ondi (should default to Business mode) ---');
await page.goto('http://localhost:5173/ondi', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/pb_01_business_default.png` });
let body = await page.textContent('body');
console.log('Shows Business pill active + Users directory + Business Verification nav item:', body.includes('Business Verification') && body.includes('User directory'));

console.log('\n--- Click "Personal" toggle ---');
await page.getByRole('button', { name: 'Personal', exact: true }).click();
await page.waitForTimeout(1000);
console.log('URL after clicking Personal:', page.url());
await page.screenshot({ path: `${OUT}/pb_02_personal.png` });
body = await page.textContent('body');
console.log('Shows "My Identity" nav + real Trust Score panel:', body.includes('My Identity') && body.includes('Trust Score'));
console.log('Business-only nav items are GONE from sidebar:', !body.includes('Roles & Access'));

console.log('\n--- Click "Business" toggle to switch back ---');
await page.getByRole('button', { name: 'Business', exact: true }).click();
await page.waitForTimeout(1000);
console.log('URL after clicking Business:', page.url());
body = await page.textContent('body');
console.log('Back to business nav (Roles & Access visible again):', body.includes('Roles & Access'));

console.log('\n--- Click "Business Verification" nav item ---');
await page.getByText('Business Verification', { exact: true }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/pb_03_business_verification.png` });
body = await page.textContent('body');
console.log('Shows the real Business Verification / KYB panel:', body.includes('Business Verification') && (body.includes('Upload registration document') || body.includes('Verified') || body.includes('review')));

console.log('\n--- Browser back button: does the sidebar re-sync correctly? ---');
await page.goBack();
await page.waitForTimeout(800);
body = await page.textContent('body');
console.log('After back button, on Business mode nav again:', body.includes('Roles & Access'));

console.log('\n--- Console errors across this whole run ---');
console.log(JSON.stringify(consoleErrors.slice(0, 20)));

await browser.close();
