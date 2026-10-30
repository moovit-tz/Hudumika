import { it, expect } from 'vitest';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { dbPlatform } from '../db/client.js';
import { createTestTenant } from './helpers.js';

// Separate browser profile and disposable identity: never alter a person's
// existing desktop session or disable its idle lock to run acceptance checks.
it('renders NexusHR at desktop and mobile widths and applies its date filters', async () => {
  const baseUrl = process.env.NEXUSHR_BROWSER_URL || 'http://localhost:5173';
  const tenant = await createTestTenant();
  const browser = await chromium.launch({ headless: true });
  try {
    await dbPlatform.updateTable('tenants').set({ plan: 'enterprise' }).where('id', '=', tenant.tenantId).execute();
    const account = await dbPlatform.selectFrom('users').selectAll().where('tenant_id', '=', tenant.tenantId).where('id', '=', tenant.userId).executeTakeFirstOrThrow();
    const { password_hash: _password, ...user } = account;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Africa/Dar_es_Salaam' });
    await context.addCookies([
      { name: 'hudumika_access', value: tenant.token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
      { name: 'hudumika_csrf', value: 'disposable-browser-test-csrf', domain: 'localhost', path: '/', sameSite: 'Lax' },
    ]);
    await context.addInitScript(data => localStorage.setItem('hudumika_user', JSON.stringify(data)), user);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const first = page.waitForResponse(r => r.url().includes('/clock-in/reconciliation?') && r.status() === 200);
    await page.goto(`${baseUrl}/nexushr/clock-in`, { waitUntil: 'domcontentloaded' });
    await first;
    await page.getByText('Time reconciliation', { exact: true }).waitFor();
    await page.getByRole('combobox').filter({ hasText: 'Last 7 days' }).click();
    const changed = page.waitForResponse(r => r.url().includes('/clock-in/weekly?') && r.status() === 200);
    await page.getByRole('option', { name: 'Last 14 days' }).click();
    const result = await (await changed).json();
    expect((Date.parse(result.toDate) - Date.parse(result.fromDate)) / 86400000 + 1).toBe(14);
    const directory = resolve(process.cwd(), '../../docs/audits');
    mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: resolve(directory, 'nexushr-clock-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('combobox').filter({ hasText: 'Last 14 days' }).click();
    const monthResponse = page.waitForResponse(r => r.url().includes('/clock-in/weekly?') && r.status() === 200);
    await page.getByRole('option', { name: 'This Month' }).click();
    const month = await (await monthResponse).json();
    expect(month.fromDate.slice(-2)).toBe('01');
    const overflow = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
    expect(overflow.document).toBeLessThanOrEqual(overflow.width + 1);
    await page.getByRole('button', { name: 'Entry log', exact: true }).first().click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(directory, 'nexushr-clock-mobile.png'), fullPage: true });
    expect(errors).toEqual([]);
    await context.close();
  } finally { await browser.close(); await tenant.cleanup(); }
}, 120000);
