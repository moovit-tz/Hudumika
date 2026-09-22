const { chromium } = require('playwright');
const { createSigner } = require('fast-jwt');
require('dotenv').config({ path: 'D:/Apps/Hudumika/.env' });

const sign = createSigner({ key: process.env.JWT_SECRET, expiresIn: 4 * 3600 * 1000 });
const MSOMI = 'd4389cf1-4cca-465a-8607-467019d22a14';

function mkToken(sub, role, name, email) {
  return sign({ sub, tenant_id: MSOMI, role, email, name });
}

const USERS = {
  admin: { id: '5e2c6a88-c036-4b82-abbc-8f46771c6b33', role: 'TENANT_ADMIN', name: 'Msomi Admin', email: 'admin@msomi.co' },
  sales: { id: '1b06a65b-83f1-4b6a-9620-9d482f18fa63', role: 'SALES', name: 'Baraka Njovu', email: 'sales@msomi.co' },
  manager: { id: '7e669359-4d85-4877-92b7-f77f70e37d12', role: 'MANAGER', name: 'Manager Msomi', email: 'manager@msomi.co' },
};

async function withPage(userKey, fn) {
  const u = USERS[userKey];
  const token = mkToken(u.id, u.role, u.name, u.email);
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies([
    { name: 'hudumika_access', value: token, domain: 'localhost', path: '/', httpOnly: true },
    { name: 'hudumika_csrf', value: 'test-csrf-token-12345', domain: 'localhost', path: '/', httpOnly: false },
  ]);
  const safeUser = {
    id: u.id, tenant_id: MSOMI, email: u.email, role: u.role, name: u.name,
    active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  await context.addInitScript((userJson) => {
    window.localStorage.setItem('hudumika_user', userJson);
  }, JSON.stringify(safeUser));

  const page = await context.newPage();
  const consoleErrors = [];
  const networkLog = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/v1/')) {
      networkLog.push({ method: res.request().method(), url: url.replace('http://localhost:3001', ''), status: res.status() });
    }
  });
  page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message));
  try {
    await fn(page, { consoleErrors, networkLog, context });
  } finally {
    await browser.close();
  }
}

module.exports = { withPage, USERS };
