import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createTestTenant, getApp } from '../apps/api/src/tests/helpers.js';
import { withTenant } from '../apps/api/src/db/client.js';
import { FINANCE_CAPABILITY_KEYS } from '../packages/types/src/finance-capabilities.js';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('apps/web/src/shells/FinOpsShell.tsx', root), 'utf8');
const routes = new Set(['/finance']);
const focus = process.argv.find(value => value.startsWith('--focus='))?.slice(8).split(',');
const resultsKey = focus ? 'followup_browser_checks' : 'browser_checks';
let parent = '';
for (const line of source.split('\n')) {
  const match = line.match(/<Route path="([^"]+)"/);
  if (match) {
    const route = match[1];
    if (!route.includes(':') && route !== '*') routes.add(`/finance/${parent ? `${parent}/` : ''}${route}`);
    if (/<Route path="[^"]+">/.test(line)) parent = route;
  }
  if (line.includes('</Route>')) parent = '';
}
if (focus) for (const route of routes) if (!focus.includes(route)) routes.delete(route);

const tenant = await createTestTenant('SUPER_ADMIN');
let browser;
try {
  await withTenant(tenant.tenantId, async trx => {
    const settings = { 'enabled-apps': Object.fromEntries(['finops', 'finance', ...FINANCE_CAPABILITY_KEYS].map(key => [key, true])) };
    await trx.insertInto('tenant_settings').values({ tenant_id: tenant.tenantId, settings: JSON.stringify(settings) })
      .onConflict(oc => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify(settings) })).execute();
    for (const capability_key of FINANCE_CAPABILITY_KEYS) {
      await trx.insertInto('tenant_finance_capabilities').values({ tenant_id: tenant.tenantId, capability_key, enabled: true })
        .onConflict(oc => oc.columns(['tenant_id', 'capability_key']).doUpdateSet({ enabled: true })).execute();
    }
  });
  const app = await getApp();
  const me = await app.inject({ method: 'GET', url: '/v1/identity/me', headers: { authorization: `Bearer ${tenant.token}` } });
  if (me.statusCode !== 200) throw new Error(`Test identity: ${me.statusCode}`);
  browser = await chromium.launch();
  const results: any[] = [];
  for (const [width, theme] of [[1440, 'light'], [390, 'dark']] as const) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addCookies([{ name: 'hudumika_access', value: tenant.token, url: 'http://localhost:5173', httpOnly: true }]);
    await context.addInitScript(({ user, theme }) => {
      localStorage.setItem('hudumika_user', JSON.stringify(user));
      localStorage.setItem('hudumika_locale', 'en');
      localStorage.setItem('theme', theme);
    }, { user: me.json(), theme });
    const page = await context.newPage();
    await page.goto('http://localhost:5173/finance', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('[data-finops]', { timeout: 60000 });
    for (const route of routes) {
      const errors: string[] = [];
      const failedApi: string[] = [];
      const onError = (error: Error) => errors.push(error.message);
      const onResponse = (response: any) => {
        if (response.status() >= 400 && /\/v1\/(finance|billing|invoices|bills|products|vendors|expenses|quotations|gl)/.test(response.url())) failedApi.push(`${response.status()} ${new URL(response.url()).pathname}`);
      };
      page.on('pageerror', onError);
      page.on('response', onResponse);
      try {
        await page.goto(`http://localhost:5173${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('[data-finops]', { timeout: 15000 });
        await page.waitForFunction(() => !!document.querySelector('[data-finops] .page-layout h1, [data-finops] .finance-capability-locked-page, [data-finops] .pos-metrics'), undefined, { timeout: 15000 });
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        await page.waitForTimeout(650);
        if (process.argv.includes('--screenshots')) await page.screenshot({ path: `docs/audits/finops-${route.split('/').filter(Boolean).join('-')}-${theme}-${width}.png` });
        const layout = await page.evaluate(() => {
          const shell = document.querySelector('[data-finops]')!;
          const categoryElement = document.querySelector('.pos-category-nav');
          const catalogueElement = document.querySelector('.pos-catalogue');
          const basketElement = document.querySelector('.pos-mobile-basket');
          const bodyElement = document.querySelector('.pos-body');
          return {
            rendered: (shell.textContent || '').trim().length > 20,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
            metricCards: shell.querySelectorAll('.mc-card,.fin-kpi-card,[data-finops-accent]').length,
            accentCards: shell.querySelectorAll('.mc-card[data-emphasis="primary"],.fin-kpi-card--accent,[data-finops-accent]').length,
            gated: !!shell.querySelector('.finance-capability-locked-page'),
            pos: {
              body: bodyElement && { y: Math.round(bodyElement.getBoundingClientRect().y), height: Math.round(bodyElement.getBoundingClientRect().height), display: getComputedStyle(bodyElement).display },
              categories: categoryElement && { y: Math.round(categoryElement.getBoundingClientRect().y), height: Math.round(categoryElement.getBoundingClientRect().height), display: getComputedStyle(categoryElement).display },
              catalogue: catalogueElement && { y: Math.round(catalogueElement.getBoundingClientRect().y), height: Math.round(catalogueElement.getBoundingClientRect().height), display: getComputedStyle(catalogueElement).display },
              basket: basketElement && { y: Math.round(basketElement.getBoundingClientRect().y), height: Math.round(basketElement.getBoundingClientRect().height), display: getComputedStyle(basketElement).display },
            },
          };
        });
        results.push({ route, width, theme, url: new URL(page.url()).pathname, ...layout, errors, failedApi: [...new Set(failedApi)] });
      } catch (error) {
        results.push({ route, width, theme, error: String(error), errors, failedApi: [...new Set(failedApi)] });
      } finally {
        page.off('pageerror', onError);
        page.off('response', onResponse);
        const partial = new URL('docs/audits/finops-visual-review.json', root);
        const report = JSON.parse(readFileSync(partial, 'utf8'));
        report[resultsKey] = results;
        writeFileSync(partial, JSON.stringify(report, null, 2));
        console.log(`Checked ${theme} ${route}: ${results.at(-1)?.error ?? (results.at(-1)?.horizontalOverflow ? 'overflow' : 'rendered')}`);
      }
    }
    await context.close();
  }
  const file = new URL('docs/audits/finops-visual-review.json', root);
  const report = JSON.parse(readFileSync(file, 'utf8'));
  report[resultsKey] = results;
  const summaryKey = focus ? 'followup_summary' : 'summary';
  report[summaryKey] = { routes: routes.size, checks: results.length, failures: results.filter(r => r.error || r.errors?.length || r.horizontalOverflow || r.failedApi?.length), dynamic_routes: 'Source reviewed; document-specific routes require record fixtures.' };
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report[summaryKey]));
} finally {
  await browser?.close();
  await tenant.cleanup();
}
process.exit(0);
